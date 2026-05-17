import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { queries } from '../db.js';
import { validateSlug } from '../slug.js';
import { normalizeConfig } from '../tenantConfig.js';

const router = Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// File-upload setup — logos and product images go into /data/tenants/<slug>/
// ---------------------------------------------------------------------------
function tenantDir(slug) { return path.join(config.tenantsDir, slug); }
function tenantUploadsDir(slug) { return path.join(tenantDir(slug), 'uploads'); }

const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const tenant = queries.getTenantById(req.params.id);
      if (!tenant) return cb(new Error('tenant not found'));
      const dir = tenantUploadsDir(tenant.slug);
      await fsp.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      // Keep the original extension; use the field name as the base so the
      // public URL is predictable (logo.png, hero.jpg, …).
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 8);
      const base = (req.body.kind || file.fieldname || 'file').replace(/[^a-z0-9_-]/gi, '');
      cb(null, `${base}-${Date.now()}${ext || ''}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap per file
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(new Error('only image uploads allowed'));
  },
});

function serialize(t) {
  if (!t) return null;
  const template = queries.getDemoById.get(t.template_id);
  return {
    ...t,
    url: `${config.publicBaseUrl}/${t.slug}/`,
    template: template ? { id: template.id, slug: template.slug, name: template.name, status: template.status } : null,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// List ALL tenants (across templates)
router.get('/', (req, res) => {
  res.json(queries.listAllTenants().map(serialize));
});

// List tenants for a specific template
router.get('/by-template/:templateId', (req, res) => {
  const list = queries.listTenantsByTemplate(Number(req.params.templateId));
  res.json(list.map(serialize));
});

router.get('/:id', (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  res.json(serialize(t));
});

router.post('/', (req, res) => {
  const { slug, name, template_id, config: cfgInput } = req.body || {};

  const slugErr = validateSlug(slug);
  if (slugErr) return res.status(400).json({ error: slugErr });
  if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

  const template = queries.getDemoById.get(template_id);
  if (!template) return res.status(400).json({ error: 'template not found' });

  if (queries.getTenantBySlug(slug) || queries.getDemoBySlug.get(slug)) {
    return res.status(409).json({ error: 'slug already in use' });
  }

  const cleanCfg = normalizeConfig(cfgInput);
  const info = queries.insertTenant.run({
    slug,
    name: name.trim(),
    template_id: template.id,
    config: JSON.stringify(cleanCfg),
  });
  res.status(201).json(serialize(queries.getTenantById(info.lastInsertRowid)));
});

router.patch('/:id', (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });

  const name = (req.body?.name ?? t.name).trim();
  if (!name) return res.status(400).json({ error: 'name is required' });

  // For config: full replace (UI sends full object). Use {} to clear.
  const cfg = req.body?.config !== undefined
    ? normalizeConfig(req.body.config)
    : t.config;

  queries.updateTenant.run({
    id: t.id,
    name,
    config: JSON.stringify(cfg),
  });
  res.json(serialize(queries.getTenantById(t.id)));
});

router.post('/:id/enable', (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  queries.setTenantEnabled.run(1, t.id);
  res.json(serialize(queries.getTenantById(t.id)));
});

router.post('/:id/disable', (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  queries.setTenantEnabled.run(0, t.id);
  res.json(serialize(queries.getTenantById(t.id)));
});

router.delete('/:id', async (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  await fsp.rm(tenantDir(t.slug), { recursive: true, force: true }).catch(() => {});
  queries.deleteTenant.run(t.id);
  res.json({ ok: true });
});

// Upload an image (logo, hero image, product image, etc.)
// POST /api/tenants/:id/upload  field=file  body.kind=logo|hero|product
// Returns: { url: '/<slug>/__tenant__/uploads/<filename>' }
router.post('/:id/upload', upload.single('file'), (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'tenant not found' });
  if (!req.file) return res.status(400).json({ error: 'no file uploaded' });
  const filename = path.basename(req.file.filename);
  res.json({
    url: `/${t.slug}/__tenant__/uploads/${filename}`,
    filename,
    size: req.file.size,
  });
});

// List uploaded files for a tenant (so the UI can show a media library)
router.get('/:id/uploads', async (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'tenant not found' });
  const dir = tenantUploadsDir(t.slug);
  try {
    const files = await fsp.readdir(dir);
    res.json(files.map((f) => ({
      filename: f,
      url: `/${t.slug}/__tenant__/uploads/${f}`,
    })));
  } catch {
    res.json([]);
  }
});

router.delete('/:id/uploads/:filename', async (req, res) => {
  const t = queries.getTenantById(req.params.id);
  if (!t) return res.status(404).json({ error: 'tenant not found' });
  const safe = path.basename(req.params.filename);
  await fsp.rm(path.join(tenantUploadsDir(t.slug), safe), { force: true });
  res.json({ ok: true });
});

export default router;
