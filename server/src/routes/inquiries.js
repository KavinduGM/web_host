import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth.js';
import { queries } from '../db.js';

const router = Router();

// ---------------------------------------------------------------------------
// PUBLIC — claim widget submits here.  Rate-limited to prevent abuse:
// 5 submissions per IP per 10 minutes.
// ---------------------------------------------------------------------------
const submitLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions — please try again later.' },
});

router.post('/', submitLimiter, (req, res) => {
  const b = req.body || {};

  const source_kind = oneOf(b.source_kind, ['template', 'tenant']);
  const source_slug = trimStr(b.source_slug, 64);
  const source_name = trimStr(b.source_name, 200);
  const name        = trimStr(b.name, 200);
  const email       = trimStr(b.email, 200);
  const phone       = trimStr(b.phone, 80);
  const message     = trimStr(b.message, 2000);

  if (!source_kind || !source_slug || !source_name) {
    return res.status(400).json({ error: 'missing source info' });
  }
  if (!name)  return res.status(400).json({ error: 'name is required' });
  if (!email) return res.status(400).json({ error: 'email is required' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const source_id = Number.isFinite(Number(b.source_id)) ? Number(b.source_id) : null;
  const referer    = trimStr(req.get('referer'), 500);
  const user_agent = trimStr(req.get('user-agent'), 500);
  const ip         = trimStr(req.ip, 64);

  try {
    const info = queries.insertInquiry.run({
      source_kind, source_id, source_slug, source_name,
      name, email, phone: phone || null, message: message || null,
      referer: referer || null, user_agent: user_agent || null, ip: ip || null,
    });
    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('[inquiries] insert failed:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

// ---------------------------------------------------------------------------
// ADMIN — everything below requires auth
// ---------------------------------------------------------------------------
router.use(requireAuth);

router.get('/', (req, res) => {
  const rows = queries.listInquiries.all();
  const counts = Object.fromEntries(
    queries.countInquiriesByStatus.all().map((r) => [r.status, r.n]),
  );
  res.json({ inquiries: rows, counts });
});

router.get('/:id', (req, res) => {
  const row = queries.getInquiry.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

router.patch('/:id', (req, res) => {
  const row = queries.getInquiry.get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not found' });
  const status = oneOf(req.body?.status, ['new', 'contacted', 'closed']) || row.status;
  const notes  = req.body?.notes !== undefined ? trimStr(req.body.notes, 2000) : null;
  queries.setInquiryStatus.run(status, notes, row.id);
  res.json(queries.getInquiry.get(row.id));
});

router.delete('/:id', (req, res) => {
  queries.deleteInquiry.run(req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function trimStr(v, maxLen) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}
function oneOf(v, allowed) {
  return typeof v === 'string' && allowed.includes(v) ? v : null;
}

export default router;
