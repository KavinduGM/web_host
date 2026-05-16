const RESERVED = new Set([
  'admin', 'api', 'static', 'assets', 'login', 'logout', '_next', 'public', 'health',
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function validateSlug(slug) {
  if (typeof slug !== 'string') return 'slug must be a string';
  if (!SLUG_RE.test(slug)) {
    return 'slug must be 1–40 chars: lowercase letters, digits, hyphens (no leading/trailing hyphen)';
  }
  if (RESERVED.has(slug)) return `slug "${slug}" is reserved`;
  return null;
}
