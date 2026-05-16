import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { queries } from '../db.js';
import { validateSlug } from '../slug.js';
import { enqueueBuild } from '../builder.js';
import { deleteDemoFiles, disableDemo, enableDemo } from '../fsops.js';

const router = Router();
router.use(requireAuth);

function serialize(demo) {
  if (!demo) return null;
  return {
    ...demo,
    enabled: !!demo.enabled,
    url: `${config.publicBaseUrl}/${demo.slug}/`,
  };
}

router.get('/', (req, res) => {
  res.json(queries.listDemos.all().map(serialize));
});

router.get('/:id', (req, res) => {
  const demo = queries.getDemoById.get(req.params.id);
  if (!demo) return res.status(404).json({ error: 'not found' });
  res.json({
    ...serialize(demo),
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
