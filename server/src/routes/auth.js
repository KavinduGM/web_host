import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { clearToken, issueToken, requireAuth, verifyPassword } from '../auth.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password || !verifyPassword(password)) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  issueToken(res);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ role: 'admin' });
});

export default router;
