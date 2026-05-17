// Shape of the per-tenant config object that gets injected into
// window.__SITE__ in the served HTML. Masters must read from this shape.

/**
 * @typedef {Object} TenantConfig
 * @property {Object} [company]   { name, tagline, logo }
 * @property {Object} [colors]    { primary, accent, primaryText }
 * @property {Object} [contact]   { email, phone, address, socials }
 * @property {Object} [hero]      { headline, subheadline, ctaLabel, ctaHref }
 * @property {Array<Object>} [products]
 * @property {Object} [footer]
 * @property {Object} [meta]      { title, description }
 */

const EMPTY_CONFIG = Object.freeze({
  company: {},
  colors: {},
  contact: {},
  hero: {},
  products: [],
  footer: {},
  meta: {},
});

/**
 * Validate + normalize an incoming tenant config from the admin UI.
 * Strips unknown top-level keys, clamps types, throws on hard errors.
 */
export function normalizeConfig(input) {
  const cfg = { ...EMPTY_CONFIG };
  if (!input || typeof input !== 'object') return cfg;

  if (input.company && typeof input.company === 'object') {
    cfg.company = {
      name:    asString(input.company.name),
      tagline: asString(input.company.tagline),
      logo:    asString(input.company.logo),
    };
  }
  if (input.colors && typeof input.colors === 'object') {
    cfg.colors = {
      primary:     asColor(input.colors.primary),
      accent:      asColor(input.colors.accent),
      primaryText: asColor(input.colors.primaryText),
    };
  }
  if (input.contact && typeof input.contact === 'object') {
    cfg.contact = {
      email:   asString(input.contact.email),
      phone:   asString(input.contact.phone),
      address: asString(input.contact.address),
      socials: input.contact.socials && typeof input.contact.socials === 'object'
        ? mapStrings(input.contact.socials, ['facebook', 'instagram', 'linkedin', 'twitter', 'whatsapp', 'youtube', 'tiktok'])
        : {},
    };
  }
  if (input.hero && typeof input.hero === 'object') {
    cfg.hero = {
      headline:    asString(input.hero.headline),
      subheadline: asString(input.hero.subheadline),
      ctaLabel:    asString(input.hero.ctaLabel),
      ctaHref:     asString(input.hero.ctaHref),
    };
  }
  if (Array.isArray(input.products)) {
    cfg.products = input.products.slice(0, 200).map((p) => ({
      name:        asString(p?.name),
      description: asString(p?.description),
      image:       asString(p?.image),
      href:        asString(p?.href),
      price:       asString(p?.price),
    }));
  }
  if (input.footer && typeof input.footer === 'object') {
    cfg.footer = {
      copyright: asString(input.footer.copyright),
      tagline:   asString(input.footer.tagline),
    };
  }
  if (input.meta && typeof input.meta === 'object') {
    cfg.meta = {
      title:       asString(input.meta.title),
      description: asString(input.meta.description),
    };
  }
  // Strip empty branches so the merge on the client doesn't clobber defaults with "".
  return pruneEmpty(cfg);
}

function asString(v) {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}
function asColor(v) {
  const s = asString(v);
  if (!s) return undefined;
  // Loose validation: hex, rgb(), rgba(), hsl(), named color short form.
  return /^(#[0-9a-fA-F]{3,8}|rgb|hsl|[a-z]+)/i.test(s) ? s : undefined;
}
function mapStrings(obj, keys) {
  const out = {};
  for (const k of keys) {
    const v = asString(obj[k]);
    if (v) out[k] = v;
  }
  return out;
}
function pruneEmpty(obj) {
  if (Array.isArray(obj)) {
    return obj.length ? obj.map(pruneEmpty) : undefined;
  }
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      const cleaned = pruneEmpty(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return Object.keys(out).length ? out : undefined;
  }
  return obj;
}

/**
 * Serialize a config object into a safe <script> tag body.
 *
 * Escapes:
 *   - "</" sequences so a stray "</script>" inside a string can't close the tag
 *   - U+2028 / U+2029 line terminators (legal in JSON but illegal in HTML script
 *     blocks before ES2019 and still problematic for some parsers)
 *
 * Note: U+2028 / U+2029 are written as escape sequences inside the regex
 * literal because the raw characters are line terminators in JS source and
 * would close the regex prematurely.
 */
export function serializeForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
