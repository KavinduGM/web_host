import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

const COOKIE_NAME = 'wht_session';
const TOKEN_TTL = '7d';

export function verifyPassword(plain) {
  return bcrypt.compareSync(plain, config.adminPasswordHash);
}

export function issueToken(res) {
  const token = jwt.sign({ role: 'admin' }, config.jwtSecret, { expiresIn: TOKEN_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearToken(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}
