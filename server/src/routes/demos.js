import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { queries } from '../db.js';
import { validateSlug } from '../slug.js';
import { enqueueBuild } from '../builder.js';
import { deleteDemoFiles, disableDemo, enableDemo } from '../fsops.js';
import { normalizeConfig } from '../tenantConfig.js';

const router = Router();
router.use(requireAuth);

function serialize(demo, viewsByDemoId) {
  if (!demo) return null;
  const v = viewsByDemoId?.[demo.id];
  return {
    ...demo,
    enabled: !!demo.enabled,
    url: `${config.publicBaseUrl}/${demo.slug}/`,
    defaults: safeJSON(demo.defaults),
    views: v ? { total: v.total, last_at: v.last_at } : { total: 0, last_at: null },
  };
}
function safeJSON(s) {
  if (s && typeof s === 'object') return s;
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

// Build a {id → {total, last_at}} map for every template, in one query.
function bulkViewStats() {
  const rows = queries.viewStatsAllByKind.all('template');
  const out = {};
  for (const r of rows) out[r.source_id] = r;
  return out;
}

router.get('/', (req, res) => {
  const stats = bulkViewStats();
  res.json(queries.listDemos.all().map((d) => serialize(d, stats)));
});

router.get('/:id', (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });
  const viewStats = queries.viewStatsByKindId.get('template', demo.id) || {};
  res.json({
    ...serialize(demo),
    views: {
      total:   viewStats.total   || 0,
      last7d:  viewStats.last7d  || 0,
      last24h: viewStats.last24h || 0,
      last_at: viewStats.last_at || null,
    },
    recent_views: queries.recentViews.all('template', demo.id, 25),
    builds: queries.listBuildLogs.all(demo.id),
  });
});

router.get('/:id/builds/:buildId', (req, res) => {
  const log = queries.getBuildLog.get(req.params.buildId);
  if (!log || log.demo_id != req.params.id) {
    return res.status(404).json({ error: 'not found' });
  }
  res.json(log);
});

router.post('/', (req, res) => {
  const {
    slug,
    name,
    git_url,
    git_branch = 'main',
    build_cmd = 'npm ci && npm run build',
    output_dir = 'dist',
  } = req.body || {};

  const err = validateSlug(slug);
  if (err) return res.status(400).json({ error: err });
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
  if (!git_url?.trim()) return res.status(400).json({ error: 'git_url is required' });
  if (queries.getDemoBySlug.get(slug)) {
    return res.status(409).json({ error: 'slug already exists' });
  }

  const info = queries.insertDemo.run({
    slug,
    name: name.trim(),
    git_url: git_url.trim(),
    git_branch,
    build_cmd,
    output_dir,
  });
  enqueueBuild(info.lastInsertRowid);
  res.status(201).json(serialize(queries.getDemoById.get(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });

  const {
    name = demo.name,
    git_url = demo.git_url,
    git_branch = demo.git_branch,
    build_cmd = demo.build_cmd,
    output_dir = demo.output_dir,
  } = req.body || {};

  queries.updateDemo.run({
    id: demo.id,
    name,
    git_url,
    git_branch,
    build_cmd,
    output_dir,
  });

  // offer_price is a per-template override of the global default; an empty
  // string clears it (back to global). Only updated if the field is present
  // in the body so existing patches don't accidentally wipe it.
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'offer_price')) {
    const v = req.body.offer_price;
    const norm = typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : null;
    queries.setDemoOfferPrice.run(norm, demo.id);
  }
  // Custom CSS injected into every served page of this template (and all its
  // tenants).  Empty string clears it.  64 KB cap is plenty for surgical
  // design fixes — anything bigger belongs in the template repo.
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'custom_css')) {
    const v = req.body.custom_css;
    const norm = typeof v === 'string' && v.trim() ? v.slice(0, 65536) : null;
    queries.setDemoCustomCss.run(norm, demo.id);
  }

  res.json(serialize(queries.getDemoById.get(demo.id)));
});

// Update the template's "defaults" — the SiteConfig values currently baked
// into the built bundle.  These are what get string-substituted at tenant
// serve time so each tenant sees its own values instead of the template's
// original branding/contact info.
router.put('/:id/defaults', (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });
  const cleanCfg = normalizeConfig(req.body || {});
  queries.setDemoDefaults.run(JSON.stringify(cleanCfg), demo.id);
  res.json(serialize(queries.getDemoById.get(demo.id)));
});

router.post('/:id/rebuild', (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });
  enqueueBuild(demo.id);
  res.json({ ok: true });
});

router.post('/:id/enable', async (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });
  await enableDemo(demo.slug);
  queries.setDemoEnabled.run(1, demo.id);
  res.json(serialize(queries.getDemoById.get(demo.id)));
});

router.post('/:id/disable', async (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });
  await disableDemo(demo.slug);
  queries.setDemoEnabled.run(0, demo.id);
  res.json(serialize(queries.getDemoById.get(demo.id)));
});

router.delete('/:id', async (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });
  await deleteDemoFiles(demo.slug);
  queries.deleteDemo.run(demo.id);
  res.json({ ok: true });
});

export default router;
