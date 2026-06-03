import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { queries } from '../db.js';

const router = Router();
router.use(requireAuth);

// Whitelist of settings keys the admin UI may read/write.
const ALLOWED_KEYS = new Set([
  'default_offer_price', // the price shown by the claim widget when neither the
                         // template nor the tenant has its own override.
]);

router.get('/', (req, res) => {
  const rows = queries.listSettings.all();
  const out = {};
  for (const r of rows) {
    if (ALLOWED_KEYS.has(r.key)) out[r.key] = r.value;
  }
  // Fill in defaults so the UI never has to special-case "not set yet".
  if (!('default_offer_price' in out)) out.default_offer_price = '$800';
  res.json(out);
});

router.put('/', (req, res) => {
  const body = req.body || {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (typeof v !== 'string') continue;
    const trimmed = v.trim().slice(0, 200);
    if (!trimmed) continue;
    queries.upsertSetting.run(k, trimmed);
  }
  // Echo back the merged state so the client doesn't have to re-fetch.
  const rows = queries.listSettings.all();
  const out = {};
  for (const r of rows) if (ALLOWED_KEYS.has(r.key)) out[r.key] = r.value;
  res.json(out);
});

export default router;
