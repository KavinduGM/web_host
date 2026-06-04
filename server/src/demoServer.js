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

// File extensions whose CONTENT can contain "/<template-slug>/" strings that
// must be rewritten to "/<tenant-slug>/" so a tenant's React Router basename,
// Vite preload paths, dynamic-import chunks, source maps, etc. resolve under
// the tenant URL even when the template was built with the template slug
// baked in (via `PUBLIC_BASE_PATH=/<template-slug>/`).
const REWRITABLE_TEXT_EXT = /\.(?:m?js|css|map|html|json|svg|webmanifest)$/i;

const CONTENT_TYPE_BY_EXT = {
  '.js':          'application/javascript; charset=utf-8',
  '.mjs':         'application/javascript; charset=utf-8',
  '.css':         'text/css; charset=utf-8',
  '.map':         'application/json; charset=utf-8',
  '.html':        'text/html; charset=utf-8',
  '.json':        'application/json; charset=utf-8',
  '.svg':         'image/svg+xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

/**
 * Routing model:
 *   /<slug>/__tenant__/uploads/<file>  → serve from /data/tenants/<slug>/uploads/
 *   /<slug>/                           → if slug is a tenant: serve template's files,
 *                                         injecting window.__SITE__ into index.html
 *                                         AND rewriting "/<template-slug>/" to
 *                                         "/<tenant-slug>/" in HTML + bundled JS/CSS
 *                                       → if slug is a template (demo): serve as-is
 *   /<slug>/<asset>                    → serve template's static asset, rewriting
 *                                         the template-slug string in text assets
 *                                         when serving in tenant context.
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
    let activeDemo = null;
    let templateSlug = null;
    let templateDefaults = {};

    if (tenant) {
      if (!tenant.enabled) return next();
      const template = queries.getDemoById.get(tenant.template_id);
      if (!template) return next();
      filesDir = path.join(config.demosDir, template.slug);
      activeTenant = tenant;
      templateSlug = template.slug;
      try { templateDefaults = template.defaults ? JSON.parse(template.defaults) : {}; }
      catch { templateDefaults = {}; }
    } else {
      // Not a tenant — try plain demo/template
      const demo = queries.getDemoBySlug.get(slug);
      if (!demo) return next();
      filesDir = path.join(config.demosDir, slug);
      activeDemo = demo;
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
      const ext = path.extname(candidate).toLowerCase();

      // In tenant context, rewrite "/<template-slug>/" → "/<tenant-slug>/" inside
      // text assets (JS bundle, CSS, source maps, etc).  This makes templates
      // that bake `import.meta.env.BASE_URL` as a literal (the default Vite
      // pattern) work for tenants without rebuilding — the React Router
      // basename, dynamic-import chunk URLs, and CSS asset URLs all end up
      // pointing at the tenant slug.
      //
      // Additionally, substitute any template-default strings (company name,
      // contact info, etc.) with the tenant's overriding values so even
      // hardcoded JSX strings in the template bundle pick up tenant branding.
      if (activeTenant && REWRITABLE_TEXT_EXT.test(candidate)) {
        try {
          const content = await fsp.readFile(candidate, 'utf8');
          let rewritten = rewriteSlugPaths(content, templateSlug, activeTenant.slug);
          rewritten = applySubstitutions(rewritten, buildSubstitutions(templateDefaults, activeTenant.config));
          res.setHeader('Content-Type', CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream');
          // Per-tenant content → don't share across tenants and don't mark
          // immutable (the underlying file's name is hash-stable, but the
          // rewritten body differs per tenant).
          res.setHeader('Cache-Control', 'private, max-age=300');
          return res.send(rewritten);
        } catch (err) {
          console.error('[demoServer] rewrite failed:', err);
          // Fall through to plain static serve on read failure.
        }
      }

      // Static asset (binary or non-tenant context) — let express.static handle it.
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

    // Track this view (HTML serves only — assets above don't count).  Best-
    // effort: failures here never block the page response.
    try { recordView(req, activeTenant ? 'tenant' : 'template',
                     activeTenant ? activeTenant.id : (activeDemo?.id ?? null),
                     slug); }
    catch (e) { console.error('[demoServer] view-track failed:', e); }

    try {
      const html = await fsp.readFile(indexPath, 'utf8');
      let out = html;
      if (activeTenant) {
        // Tenant: inject window.__SITE__ + window.__BASE_URL__, rewrite favicon,
        // rewrite slug paths, substitute template-default strings.
        const tenantBase = `/${activeTenant.slug}/`;
        const favicon = activeTenant.config?.company?.favicon;
        out = transformHtmlForTenant(
          out, activeTenant.config, tenantBase, favicon,
          templateSlug, activeTenant.slug, templateDefaults,
        );
      }
      // Resolve the offer price displayed by the claim widget:
      //   tenant override → template override → global default → "$800"
      const globalDefault =
        queries.getSetting.get('default_offer_price')?.value || '$800';
      const offerPrice = activeTenant
        ? (activeTenant.offer_price
            || (activeTenant.template_id
                ? queries.getDemoById.get(activeTenant.template_id)?.offer_price
                : null)
            || globalDefault)
        : (activeDemo?.offer_price || globalDefault);

      // Always inject the "Claim This Website" widget on top of whatever
      // transforms were done above (tenant or plain template).
      out = injectClaimWidget(out, activeTenant
        ? { kind: 'tenant', id: activeTenant.id, slug: activeTenant.slug, name: activeTenant.name, offer_price: offerPrice }
        : { kind: 'template', id: activeDemo?.id, slug: slug, name: activeDemo?.name || slug, offer_price: offerPrice }
      );

      // Inject per-template + per-tenant Custom CSS so admins can patch a
      // built site's design without rebuilding the bundle (e.g. fix a low-
      // contrast section, recolor a hero, hide a stale promo).  The block
      // lands just before </body> so it loads AFTER every <link rel="stylesheet">
      // in the head — that way every selector wins cascade ties naturally,
      // no `!important` spam needed for most overrides.  Tenant CSS comes
      // after template CSS so per-tenant tweaks override template ones.
      const templateCustomCss = activeTenant
        ? (activeTenant.template_id ? queries.getDemoById.get(activeTenant.template_id)?.custom_css : null)
        : (activeDemo?.custom_css || null);
      const tenantCustomCss = activeTenant?.custom_css || null;
      out = injectCustomCss(out, templateCustomCss, tenantCustomCss);

      return res.send(out);
    } catch (err) {
      console.error('[demoServer] inject failed:', err);
      return res.sendFile(indexPath);
    }
  };
}

async function stat(p) {
  try { return await fsp.stat(p); } catch { return null; }
}

// Coarse bot detection — skip recording views for crawlers, uptime monitors,
// curl/wget probes, etc. so the per-demo "Views" count actually reflects
// human traffic that admins care about.
const BOT_RE = /bot|crawler|spider|crawling|preview|prerender|uptime|monitor|pingdom|gtmetrix|lighthouse|headless|facebookexternalhit|whatsapp|telegram|discord|slack|curl|wget|node-fetch|axios|python-requests|libwww|http-client/i;

function recordView(req, kind, id, slug) {
  const ua = req.get('user-agent') || '';
  if (!ua || BOT_RE.test(ua)) return; // skip bots / scripts
  // Also skip HEAD requests and prefetches (browser link-preview, RSS, etc.)
  if (req.method !== 'GET') return;
  if (req.get('purpose') === 'prefetch' || req.get('sec-purpose')?.includes('prefetch')) return;

  const referer = (req.get('referer') || '').slice(0, 500) || null;
  const ip      = (req.ip || '').slice(0, 64) || null;
  queries.recordView.run(kind, id, slug, referer, ua.slice(0, 500), ip);
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

/**
 * Replace every "/<templateSlug>/" occurrence with "/<tenantSlug>/" in a text
 * body. Used for both HTML rewriting and bundled JS/CSS content rewriting so
 * that the template's baked-in base path (from Vite's `PUBLIC_BASE_PATH`)
 * becomes the tenant's base path at serve time.
 *
 * The pattern is anchored with a leading "/" and trailing "/" so partial-word
 * matches in user copy (e.g. a product description that happens to contain
 * the slug substring) are not affected.
 */
function rewriteSlugPaths(text, templateSlug, tenantSlug) {
  if (!templateSlug || !tenantSlug || templateSlug === tenantSlug) return text;
  const escaped = templateSlug.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const re = new RegExp(`/${escaped}/`, 'g');
  return text.replace(re, `/${tenantSlug}/`);
}

function transformHtmlForTenant(html, cfg, baseUrl, favicon, templateSlug, tenantSlug, templateDefaults) {
  let out = html;

  // 1. Inject the runtime config + the correct basename for client-side routers.
  //    MUST land as the first child of <head> so it executes before any other
  //    script in the document — including non-module inline scripts (Vite's
  //    modulepreload polyfill, analytics snippets, template bootstrap, etc.)
  //    that would otherwise see `window.__SITE__`/`__BASE_URL__` as undefined.
  //    Module scripts are deferred so they'd run after either position, but
  //    classic <script> tags execute synchronously at parse time.
  const scriptTag =
    `<script>` +
      `window.__BASE_URL__=${JSON.stringify(baseUrl)};` +
      `window.__SITE__=${serializeForScript(cfg)};` +
    `</script>`;

  if (/<head\b[^>]*>/i.test(out)) {
    out = out.replace(/<head\b[^>]*>/i, (m) => m + scriptTag);
  } else if (/<\/head>/i.test(out)) {
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
      out = replaceLiteral(out, linkRegex, newLink);
    } else if (/<\/head>/i.test(out)) {
      out = replaceLiteral(out, /<\/head>/i, `${newLink}</head>`);
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
      out = replaceLiteral(out, /<title>[^<]*<\/title>/i, `<title>${escapeHtml(metaTitle)}</title>`);
    } else if (/<\/head>/i.test(out)) {
      out = replaceLiteral(out, /<\/head>/i, `<title>${escapeHtml(metaTitle)}</title></head>`);
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

  // 4. Rewrite "/<template-slug>/" → "/<tenant-slug>/" everywhere in the HTML
  //    (script src, link href, modulepreload, etc.) so all asset URLs route
  //    back through the tenant slug.  Asset requests under the tenant slug
  //    fall back to the template's filesDir (see static branch above) AND
  //    get the same content rewrite for text bodies.  Net effect: a template
  //    built with PUBLIC_BASE_PATH=/<template-slug>/ works for tenants
  //    without any template-side code change.
  out = rewriteSlugPaths(out, templateSlug, tenantSlug);

  // 5. Substitute template-default strings (company name, contact email/phone/
  //    address, hero copy, social URLs, etc.) with the tenant's overriding
  //    values.  This catches anything the template hardcoded in JSX/HTML that
  //    wasn't wired through `site.*` — without it, places like the footer
  //    copyright or hero headline can still show the template's brand text
  //    even when the tenant supplies its own.
  out = applySubstitutions(out, buildSubstitutions(templateDefaults, cfg));

  return out;
}

/**
 * Build an ordered list of {from, to} string-substitution pairs by walking
 * the template's defaults and the tenant's config in lockstep.  For every
 * leaf string in `defaults` that has a matching non-empty, different leaf
 * in `tenant`, emit a pair so the template's baked-in string is replaced
 * with the tenant's value.
 *
 * Same default value reachable through multiple paths (e.g. company.name
 * mentioned in footer.copyright too) is emitted once per occurrence in the
 * tree but de-duplicated before returning.
 *
 * Results are sorted by `from` length DESCENDING so longer strings replace
 * before any shorter substrings of them — prevents partial-overlap bugs
 * (e.g. "Novatec Glass Industries" must replace before "Novatec Glass").
 */
function buildSubstitutions(defaults, tenant) {
  const pairs = [];
  walk(defaults, tenant, pairs);
  // De-dup on `from`, keep first `to` we saw.
  const seen = new Map();
  for (const p of pairs) {
    if (!seen.has(p.from)) seen.set(p.from, p.to);
  }
  return [...seen.entries()]
    .map(([from, to]) => ({ from, to }))
    // Skip same-value pairs (no rewrite needed) and tiny strings (would
    // produce far too many spurious matches inside the JS bundle).
    .filter(({ from, to }) => from !== to && from.length >= 3)
    .sort((a, b) => b.from.length - a.from.length);
}

function walk(dflt, override, out) {
  if (Array.isArray(dflt)) {
    if (!Array.isArray(override)) return;
    const n = Math.min(dflt.length, override.length);
    for (let i = 0; i < n; i++) walk(dflt[i], override[i], out);
    return;
  }
  if (dflt && typeof dflt === 'object') {
    if (!override || typeof override !== 'object') return;
    for (const k of Object.keys(dflt)) {
      if (k in override) walk(dflt[k], override[k], out);
    }
    return;
  }
  if (typeof dflt === 'string' && typeof override === 'string') {
    const from = dflt.trim();
    const to   = override.trim();
    if (from && to) out.push({ from, to });
  }
}

function applySubstitutions(text, pairs) {
  if (!pairs.length) return text;
  let out = text;
  for (const { from, to } of pairs) {
    // Plain string replace-all: keep things conservative — no regex word
    // boundary check, so we DO replace substrings.  In practice the
    // template-defaults strings are distinctive (company name, full email,
    // full phone) so collisions are rare.
    out = out.split(from).join(to);
  }
  return out;
}

/**
 * String.prototype.replace interprets $& / $1 / $$ etc. in the replacement
 * string as backreferences.  Tenant config values can legitimately contain $
 * (URL query params, prices, copy text) — passing those through verbatim
 * mangles the output.  This wrapper passes a function so the replacement is
 * treated as a literal.
 */
function replaceLiteral(html, re, replacement) {
  return html.replace(re, () => replacement);
}

/**
 * Inject the "Claim This Website" widget loader + per-page context.
 * The context tells the widget which template/tenant submitted the inquiry
 * (kind, id, slug, display name) so admins can see who's interested in what.
 *
 * The loader script is appended just before </body> so the widget doesn't
 * compete with the page's own scripts for initial paint.
 */
/**
 * Inject one or two <style> blocks of admin-supplied CSS just before </body>.
 * Each block is wrapped in a `</style>`-safe escape so a stray closing tag
 * inside the CSS can't escape the block.  Blocks are tagged with
 * data-source="template|tenant" so they're easy to inspect.
 */
function injectCustomCss(html, templateCss, tenantCss) {
  const blocks = [];
  if (templateCss && templateCss.trim()) {
    blocks.push(`<style data-source="template-custom">${cssSafe(templateCss)}</style>`);
  }
  if (tenantCss && tenantCss.trim()) {
    blocks.push(`<style data-source="tenant-custom">${cssSafe(tenantCss)}</style>`);
  }
  if (!blocks.length) return html;
  const snippet = blocks.join('');
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, () => `${snippet}</body>`);
  }
  return html + snippet;
}

// </style> inside a <style> closes the element; replace with an HTML-safe
// escape that the CSS parser still tolerates.
function cssSafe(s) {
  return String(s).replace(/<\/style/gi, '<\\/style');
}

function injectClaimWidget(html, source) {
  const ctxJson = serializeForScript({
    source_kind: source.kind,
    source_id:   source.id ?? null,
    source_slug: source.slug,
    source_name: source.name,
    offer_price: source.offer_price || '$800',
  });
  const snippet =
    `<script>window.__CLAIM_WIDGET_CTX__=${ctxJson};</script>` +
    `<script src="/__widget__/widget.js" async></script>`;

  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, () => `${snippet}</body>`);
  }
  // No </body> — append to end of document.
  return html + snippet;
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
    return replaceLiteral(html, re, tag);
  }
  if (/<\/head>/i.test(html)) {
    return replaceLiteral(html, /<\/head>/i, `${tag}</head>`);
  }
  return html;
}
