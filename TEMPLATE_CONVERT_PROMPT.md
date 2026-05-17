# Convert-existing-site-to-master-template prompt

Use this prompt to retrofit an **already-built** Vite + React + TS site
so it can be used as a multi-tenant master in the host tool. The goal
is *surgical*: keep the existing design, layout, components, and
behavior exactly as-is — just rewire every piece of branding/copy to
read from a single config object that supports runtime overrides via
`window.__SITE__`.

Open Claude Code inside the existing project (the Novatec repo, etc.)
and paste everything below as your first message.

---

## ROLE
You are retrofitting an existing Vite + React + TypeScript marketing
website so that all branding, colors, copy, contact info, and product
listings come from a single config object — `src/config/site.ts` — which
deep-merges `window.__SITE__` (injected at runtime by a hosting tool)
over a `defaults` object.

The site already works. **Your job is NOT to redesign it.** Your job is
to refactor the data layer only:
- Same JSX structure
- Same Tailwind classes (except where they hardcode brand colors)
- Same files, same routes, same component boundaries
- Same visual result when no overrides are present

You're moving strings out of components and into a config — nothing
else.

## WHAT MUST EXIST WHEN YOU'RE DONE

### 1. Three new files

**`src/config/types.ts`** — the SiteConfig type:
```ts
export type SiteConfig = {
  company: {
    name: string;
    tagline?: string;
    logo: string;
  };
  colors: {
    primary: string;
    accent: string;
    primaryText?: string;
  };
  contact: {
    email?: string;
    phone?: string;
    address?: string;
    socials?: {
      facebook?: string;
      instagram?: string;
      linkedin?: string;
      twitter?: string;
      whatsapp?: string;
      youtube?: string;
      tiktok?: string;
    };
  };
  hero: {
    headline?: string;
    subheadline?: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  products?: Array<{
    name: string;
    description?: string;
    image?: string;
    href?: string;
    price?: string;
  }>;
  footer?: {
    copyright?: string;
    tagline?: string;
  };
  meta?: {
    title?: string;
    description?: string;
  };
};
```
You may extend this with extra fields the site actually uses (e.g.
`services`, `team`, `testimonials`, `about`, `stats`) — add them to the
type AND to defaults below. Keep the canonical fields above intact.

**`src/config/defaults.ts`** — extracts every hardcoded brand/copy
string from the current code into one object. Run through the entire
site and pull EVERYTHING that's specific to the current client:
company name, tagline, logo path, primary/accent colors, hero text, all
copy, contact details, every product, footer text, meta tags. The values
go here so the site renders identically to today when no override is
present.

```ts
import type { SiteConfig } from './types';

export const defaults: SiteConfig = {
  company: {
    name: 'Novatec Glass',         // pull from current code
    tagline: '…',
    logo: '/logo.svg',
  },
  colors: {
    primary: '#003d7a',            // pull from current CSS / tailwind config
    accent:  '#f7b500',
  },
  // … etc, copy EVERYTHING that's currently hardcoded
};
```

**`src/config/site.ts`** — the runtime loader. Paste this exactly:
```ts
import type { SiteConfig } from './types';
import { defaults } from './defaults';

declare global {
  interface Window { __SITE__?: Partial<SiteConfig> }
}

function isObj(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}
function deepMerge<T>(base: T, over: any): T {
  if (over === undefined || over === null) return base;
  if (Array.isArray(over)) return over as T;
  if (isObj(base) && isObj(over)) {
    const out: any = { ...base };
    for (const k of Object.keys(over)) {
      out[k] = deepMerge((base as any)[k], over[k]);
    }
    return out;
  }
  return over as T;
}

const override =
  typeof window !== 'undefined' && (window as any).__SITE__
    ? (window as any).__SITE__
    : undefined;

export const site: SiteConfig = deepMerge(defaults, override);
```

### 2. Every component reads from `site`

For every hardcoded brand/copy string in the codebase, replace it with
the matching field from `site`. Examples:

```tsx
// Before
<h1>Welcome to Novatec Glass</h1>
<img src="/logo.svg" alt="Novatec" />
<a href="mailto:info@novatec.lk">Email us</a>

// After
import { site } from '@/config/site';

<h1>{site.hero.headline || `Welcome to ${site.company.name}`}</h1>
<img src={site.company.logo} alt={site.company.name} />
{site.contact.email && <a href={`mailto:${site.contact.email}`}>Email us</a>}
```

Rules:
- Every text/string that's specific to the client (company name,
  tagline, copy lines, contact info, product names/descriptions, footer
  text) comes from `site`.
- Generic UI text ("Submit", "Close", "Read more", "Loading…") stays
  hardcoded — only **client-specific** strings move.
- Use fallbacks so a tenant that omits a field still renders something
  sensible (often `site.company.name` or an empty string).
- Sections that depend on a list (products, testimonials, team) must
  hide themselves cleanly when the list is empty/undefined.

### 3. Colors flow through CSS variables

Currently colors are probably hardcoded in `tailwind.config.js` and/or
component classes (`bg-blue-900`, `text-yellow-500`, etc.). Refactor so:

In `src/styles/index.css` (or wherever the global stylesheet lives):
```css
:root {
  --color-primary: <current primary>;
  --color-accent:  <current accent>;
  --color-primary-text: #ffffff;
}
```

In `tailwind.config.js` add:
```js
theme: {
  extend: {
    colors: {
      primary: 'var(--color-primary)',
      accent:  'var(--color-accent)',
    },
  },
},
```

Then in `App.tsx` (or `main.tsx`):
```tsx
import { useEffect } from 'react';
import { site } from './config/site';

// inside App component, top of body:
useEffect(() => {
  const r = document.documentElement.style;
  r.setProperty('--color-primary', site.colors.primary);
  r.setProperty('--color-accent',  site.colors.accent);
  if (site.colors.primaryText) r.setProperty('--color-primary-text', site.colors.primaryText);
  if (site.meta?.title) document.title = site.meta.title;
}, []);
```

Now `bg-primary`, `text-accent`, etc. in Tailwind classes resolve via
CSS variables, and overriding them via the tenant config just works.

Replace existing hardcoded color classes (`bg-blue-900`, `text-yellow-500`)
with `bg-primary`, `text-accent`, etc., **only where they refer to the
brand colors**. Leave neutral grays, whites, semantic colors (red for
errors, green for success) alone.

### 4. Don't touch these
- Layout, spacing, typography
- Component file structure
- Routes
- Animations / transitions
- Anything that isn't a string of client copy or a brand color

## VERIFICATION BEFORE FINISHING

Run two tests in order:

**Test 1 — default render still works.** Build and preview with no
override:
```bash
npm run build
npm run preview
```
Open the URL. The site must look **identical to before** — every word,
every color, every image. If anything looks different, you've moved
something you shouldn't have. Fix it.

**Test 2 — tenant override re-skins the site.** Temporarily edit
`index.html` to inject a fake override at the top of `<head>`:
```html
<script>
window.__SITE__ = {
  company: { name: 'SPIL Glass', logo: 'https://placehold.co/200x60?text=SPIL' },
  colors:  { primary: '#0066cc', accent: '#ff6b00' },
  contact: { email: 'info@spilglass.test', phone: '+94 11 999 9999' },
  hero:    { headline: 'Made by SPIL', subheadline: 'For SPIL clients' },
};
</script>
```
Rebuild + reload preview. The company name in the header/footer must
change to "SPIL Glass", the logo must swap, primary buttons must turn
blue, accent text must turn orange, hero text must update. **Remove
the temporary `<script>` from `index.html` before committing.**

If any field doesn't change visibly, that means some component still
reads a hardcoded value — find and fix.

## DELIVERABLES

When done, commit + push and report exactly:

```
Files added:
  - src/config/types.ts
  - src/config/defaults.ts
  - src/config/site.ts

Files modified (just list paths):
  - <list every component/file you touched>

Fields wired up (these populate the tenant UI in the host tool):
  - company.name, company.tagline, company.logo
  - colors.primary, colors.accent
  - hero.headline, hero.subheadline, hero.ctaLabel, hero.ctaHref
  - contact.email, contact.phone, contact.address
  - contact.socials.{facebook|instagram|linkedin|whatsapp|...}
  - products[] (name, description, image, price, href)
  - footer.copyright, footer.tagline
  - meta.title, meta.description
  - <any extras you added>

Tests:
  - Default render matches pre-conversion: yes/no (describe any drift)
  - SPIL override test re-skinned every brand element: yes/no
```

## RULES
- Don't change the visual design.
- Don't rename existing components or files.
- Don't add new dependencies unless absolutely required (you shouldn't
  need any — this is a pure refactor).
- If the existing site uses something that won't work as a master
  (build-time fetches, env-driven content, etc.), stop and tell me
  before working around it.
- Keep the changeset small and reviewable.
