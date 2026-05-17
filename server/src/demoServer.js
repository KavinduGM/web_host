import express from 'express';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { queries } from './db.js';
import { serializeForScript } from './tenantConfig.js';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const RESERVED = new Set([
  'admin', 'api', 'health', 'static', 'assets', 'login', 'logout', '_next', 'public',
]);

/**
 * Routing model:
 *   /<slug>/__tenant__/uploads/<file>  → serve from /data/tenants/<slug>/uploads/
 *   /<slug>/                           → if slug is a tenant: serve template's files,
 *                                         injecting window.__SITE__ into index.html
 *                                       → if slug is a template (demo): serve as-is
 *   /<slug>/<asset>                    → serve template's static asset
 *
 * SPA fallback applies in all cases — unknown paths under a slug fall back to
 * that slug's index.html (with the same injection if it's a tenant).
 */
export function demoServerMiddleware() {
  return async (req, res, next) => {
    const parts = req.path.split('/').filter(Boolean);
    if (parts.length === 0) return next();

    const slug = parts[0];
    if (!SLUG_RE.test(slug) || RESERVED.has(slug)) return next();

    // Tenant lookup first; if found, also resolve its template's files dir.
    const tenant = queries.getTenantBySlug(slug);
    let filesDir;
    let activeTenant = null;

    if (tenant) {
      if (!tenant.enabled) return next();
      const template = queries.getDemoById.get(tenant.template_id);
      if (!template) return next();
      filesDir = path.join(config.demosDir, template.slug);
      activeTenant = tenant;
    } else {
      // Not a tenant — try plain demo/template
      const demo = queries.getDemoBySlug.get(slug);
      if (!demo) return next();
      filesDir = path.join(config.demosDir, slug);
    }

    if (!fs.existsSync(filesDir)) return next();

    // /<slug> -> /<slug>/  so relative asset paths resolve
    if (parts.length === 1 && !req.path.endsWith('/')) {
      return res.redirect(301, `/${slug}/`);
    }

    // Special: tenant upload assets — /<slug>/__tenant__/uploads/<file>
    if (activeTenant && parts[1] === '__tenant__') {
      const sub = parts.slice(2).join('/');
      if (!sub) return res.status(404).end();
      const filePath = path.join(config.tenantsDir, activeTenant.slug, sub);
      const tenantRoot = path.join(config.tenantsDir, activeTenant.slug);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(path.resolve(tenantRoot) + path.sep)) {
        return res.status(403).end();
      }
      if (!fs.existsSync(resolved)) return res.status(404).end();
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(resolved);
    }

    const subPath = '/' + parts.slice(1).join('/');

    // Try to serve a real file from the template's files dir.
    const candidate = path.join(filesDir, subPath.replace(/^\/+/, ''));
    const isFile = await stat(candidate).then((s) => s?.isFile()).catch(() => false);

    if (isFile && !candidate.endsWith('index.html')) {
      // Static asset — let express.static handle it (proper headers, etc.)
      req.url = subPath;
      const staticHandler = express.static(filesDir, {
        fallthrough: false,
        setHeaders(r, filePath) {
          if (/\.(js|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|avif|ico|mp4|webm)$/i.test(filePath)) {
            r.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
          }
        },
      });
      return staticHandler(req, res, () => res.status(404).end());
    }

    // HTML path (root, /sub/, or unknown route → SPA fallback)
    const indexPath = path.join(filesDir, 'index.html');
    if (!fs.existsSync(indexPath)) return res.status(404).end();

    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!activeTenant) {
      // Plain template, no injection.
      return res.sendFile(indexPath);
    }

    // Tenant: inject window.__SITE__ + window.__BASE_URL__ into the HTML,
    // and rewrite the <link rel="icon"> if the tenant supplied a favicon.
    try {
      const html = await fsp.readFile(indexPath, 'utf8');
      const tenantBase = `/${activeTenant.slug}/`;
      const favicon = activeTenant.config?.company?.favicon;
      const injected = transformHtmlForTenant(html, activeTenant.config, tenantBase, favicon);
      return res.send(injected);
    } catch (err) {
      console.error('[demoServer] inject failed:', err);
      return res.sendFile(indexPath);
    }
  };
}

async function stat(p) {
  try { return await fsp.stat(p); } catch { return null; }
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function transformHtmlForTenant(html, cfg, baseUrl, favicon) {
  let out = html;

  // 1. Inject the runtime config + the correct basename for client-side routers.
  const scriptTag =
    `<script>` +
      `window.__BASE_URL__=${JSON.stringify(baseUrl)};` +
      `window.__SITE__=${serializeForScript(cfg)};` +
    `</script>`;

  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${scriptTag}</head>`);
  } else if (/<script/i.test(out)) {
    out = out.replace(/<script/i, `${scriptTag}<script`);
  } else {
    out = scriptTag + out;
  }

  // 2. Favicon: swap the existing <link rel="icon"> href (or insert one).
  if (favicon) {
    const newLink = `<link rel="icon" href="${escapeAttr(favicon)}" />`;
    const linkRegex = /<link\b[^>]*\brel=["']?(?:icon|shortcut icon)["']?[^>]*>/i;
    if (linkRegex.test(out)) {
      out = out.replace(linkRegex, newLink);
    } else if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `${newLink}</head>`);
    }
  }

  // 3. Server-side rewrite of <title>, <meta description>, OpenGraph tags,
  //    and theme-color.  These need to be in the initial HTML response
  //    (not just updated at runtime) so the browser tab title is correct
  //    before JS executes, and so LinkedIn / Facebook / WhatsApp link
  //    previews show the tenant's branding, not the template's.

  const companyName = cfg?.company?.name;
  const tagline     = cfg?.company?.tagline;
  const metaTitle   = cfg?.meta?.title || (companyName ? (tagline ? `${companyName} — ${tagline}` : companyName) : null);
  const metaDesc    = cfg?.meta?.description || tagline;
  const themeColor  = cfg?.colors?.primary;
  const ogImage     = cfg?.company?.logo;

  if (metaTitle) {
    if (/<title>[^<]*<\/title>/i.test(out)) {
      out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(metaTitle)}</title>`);
    } else if (/<\/head>/i.test(out)) {
      out = out.replace(/<\/head>/i, `<title>${escapeHtml(metaTitle)}</title></head>`);
    }
  }

  out = upsertMeta(out, 'name', 'description',     metaDesc);
  out = upsertMeta(out, 'name', 'theme-color',     themeColor);
  out = upsertMeta(out, 'property', 'og:title',    metaTitle);
  out = upsertMeta(out, 'property', 'og:description', metaDesc);
  out = upsertMeta(out, 'property', 'og:image',    ogImage);
  out = upsertMeta(out, 'name', 'twitter:title',   metaTitle);
  out = upsertMeta(out, 'name', 'twitter:description', metaDesc);
  out = upsertMeta(out, 'name', 'twitter:image',   ogImage);

  return out;
}

/**
 * Replace an existing <meta {attr}="{name}" content="..."> tag, or insert one
 * before </head> if absent. Skips entirely if value is falsy.
 */
function upsertMeta(html, attr, name, value) {
  if (!value) return html;
  const tag = `<meta ${attr}="${escapeAttr(name)}" content="${escapeAttr(value)}" />`;
  // Match a meta tag whose `attr` equals `name`, allowing attribute order to vary.
  const re = new RegExp(
    `<meta\\b(?=[^>]*\\b${attr}=["']${name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}["'])[^>]*>`,
    'i',
  );
  if (re.test(html)) {
    return html.replace(re, tag);
  }
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${tag}</head>`);
  }
  return html;
}
