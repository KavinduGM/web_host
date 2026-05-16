import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set([
  'admin', 'api', 'health', 'static', 'assets', 'login', 'logout', '_next', 'public',
]);

/**
 * Serves built demo sites from <demosDir>/<slug>/ with SPA fallback.
 * Must be mounted AFTER /admin, /api, and /health routes.
 */
export function demoServerMiddleware() {
  return (req, res, next) => {
    const parts = req.path.split('/').filter(Boolean);
    if (parts.length === 0) return next();

    const slug = parts[0];
    if (!SLUG_RE.test(slug) || RESERVED.has(slug)) return next();

    const demoDir = path.join(config.demosDir, slug);
    if (!fs.existsSync(demoDir)) return next();

    // /<slug> -> /<slug>/  so relative asset paths resolve
    if (parts.length === 1 && !req.path.endsWith('/')) {
      return res.redirect(301, `/${slug}/`);
    }

    const subPath = '/' + parts.slice(1).join('/');
    req.url = subPath === '/' ? '/' : subPath + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '');

    const staticHandler = express.static(demoDir, {
      fallthrough: true,
      index: 'index.html',
      setHeaders(res, filePath) {
        if (/\.(js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        } else if (filePath.endsWith('.html')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    });

    staticHandler(req, res, () => {
      // SPA fallback — serve <slug>/index.html for client-side routes
      const indexPath = path.join(demoDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.setHeader('Cache-Control', 'no-cache');
        return res.sendFile(indexPath);
      }
      res.status(404).send('Not found');
    });
  };
}
