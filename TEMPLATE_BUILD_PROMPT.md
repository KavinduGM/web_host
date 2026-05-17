# Master-template build prompt

Paste the block below into Claude Code at the start of a session, then
add your own design brief after the `--- NOW — design brief` line. The
assistant will build a website that works as a **master template** in
the host tool — meaning unlimited re-branded copies can be spawned from
a single admin UI form without rebuilding.

> If you're building a one-off site (not a reusable template), use
> `SITE_BUILD_PROMPT.md` instead. This file replaces it for the
> common case of "build one site, sell it to many clients."

---

## TECHNICAL CONTRACT — read before writing code

You are building a **frontend-only marketing website** that will live in
a multi-tenant demo-hosting tool. The tool serves the built site as
static files under `https://demos.example.com/<slug>/`. There is no
backend runtime.

The host tool spawns **tenants** from this template. A tenant is a
re-branded copy (different logo, colors, company name, contact info,
products, copy) served at its own slug. The tenant's config is injected
into the page at runtime via:

```html
<script>window.__SITE__ = { /* tenant overrides */ };</script>
```

Your job is to write the React app so it **reads everything from a
single config object** that merges these runtime overrides over a set of
sensible defaults. No hardcoded company names, colors, or contact
strings anywhere in JSX.

### Required stack — do not substitute
- **Vite** (latest stable) — `npm create vite@latest`
- **React 18** + **TypeScript**
- **Tailwind CSS** — colors driven by CSS variables that read from the config
- **react-router-dom** (only if multiple pages)
- **npm** — commit `package-lock.json`

### Hard rules

1. **All branding, copy, colors, contact info, and product listings
   come from a single config object.** No hardcoded strings of these
   types in JSX or CSS.

2. **The config object follows this shape** (extend with extra fields if
   the design needs them — but keep these as the canonical core, since
   the host tool's UI ships fields for exactly these):

   ```ts
   // src/config/types.ts
   export type SiteConfig = {
     company: {
       name: string;
       tagline?: string;
       logo: string;          // image URL (absolute or tenant-uploaded)
     };
     colors: {
       primary: string;       // any CSS color
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

3. **Required runtime config loader.** Create `src/config/site.ts`
   exactly like this (deep-merge over the defaults):

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

4. **Defaults file with realistic values** — `src/config/defaults.ts`
   exporting `defaults: SiteConfig`. Fill it with the design-brief
   client's data (Novatec Glass, SPIL Glass — whatever you're given
   for the master). This is what the bare template URL renders.

5. **Wire the colors through CSS variables** so a tenant override
   reskins the whole site without any conditional JSX. In `App.tsx`
   (or `main.tsx`):

   ```tsx
   import { site } from './config/site';

   useEffect(() => {
     const r = document.documentElement.style;
     r.setProperty('--color-primary', site.colors.primary);
     r.setProperty('--color-accent',  site.colors.accent);
     if (site.colors.primaryText) r.setProperty('--color-primary-text', site.colors.primaryText);
     if (site.meta?.title) document.title = site.meta.title;
   }, []);
   ```

   `tailwind.config.js` reads them:
   ```js
   export default {
     content: ['./index.html', './src/**/*.{ts,tsx}'],
     theme: {
       extend: {
         colors: {
           primary: 'var(--color-primary)',
           accent:  'var(--color-accent)',
         },
       },
     },
   };
   ```

   And `src/index.css`:
   ```css
   :root {
     --color-primary: #003d7a;
     --color-accent:  #f7b500;
   }
   ```

6. **All copy comes from `site`.** Examples:
   - ❌ `<h1>Welcome to Novatec Glass</h1>`
   - ✅ `<h1>{site.hero.headline || `Welcome to ${site.company.name}`}</h1>`
   - ❌ `<img src="/logo.svg" alt="Novatec" />`
   - ✅ `<img src={site.company.logo} alt={site.company.name} />`

   Always fall back to a sensible default (the company name, an empty
   string, etc.) so a tenant that omits a field still renders.

7. **Products section reads from `site.products` and hides itself if
   empty.** Don't crash if the array is undefined.

8. **Vite base-path.** `vite.config.ts`:
   ```ts
   export default defineConfig({
     plugins: [react()],
     base: process.env.PUBLIC_BASE_PATH || '/',
   });
   ```
   And for React Router: `<BrowserRouter basename={import.meta.env.BASE_URL}>`.

9. **No SSR, no API routes, no server actions.** Static export only.

10. **Linux is case-sensitive** — `import Hero from './sections/Hero'`
    must match the file exactly. PascalCase for components.

11. **No external network calls at build time.** Don't fetch from CMSes
    or remote JSON during the build.

12. **`npm ci` must work** — commit `package-lock.json`.

13. **Forms must not POST to relative URLs.** If a contact form is in the
    design, either:
    - Use a third-party endpoint pulled from config:
      `<form action={site.contact.formEndpoint}>` (add this field to
      SiteConfig and defaults if needed), or
    - Render a "mailto:" link instead.

### Project structure

```
src/
├── components/         reusable UI primitives
├── sections/           page sections (Hero, Products, Contact, Footer…)
├── pages/              one file per route, if using React Router
├── config/
│   ├── types.ts        SiteConfig type
│   ├── defaults.ts     defaults: SiteConfig (the master's own values)
│   └── site.ts         runtime loader (deep-merges window.__SITE__ over defaults)
├── styles/index.css    Tailwind + CSS variables
├── App.tsx             reads site, applies CSS vars, wires routes
├── main.tsx
└── vite-env.d.ts
public/
├── favicon.svg
└── (only files that must be served as-is)
```

### Verification — DO THIS BEFORE FINISHING

1. **Default render** — build and preview without overrides:
   ```bash
   PUBLIC_BASE_PATH=/test/ npm run build
   npm run preview
   ```
   Open the URL. Everything should look like the design brief.

2. **Tenant override simulation** — in the running preview, open the
   browser console and run:
   ```js
   window.__SITE__ = {
     company: { name: 'SPIL Glass', logo: 'https://placehold.co/200x60?text=SPIL' },
     colors:  { primary: '#0066cc', accent: '#ff6b00' },
     contact: { email: 'info@spilglass.test' },
     hero:    { headline: 'Made for SPIL' },
   };
   location.reload();   // window.__SITE__ is lost on reload — see next step
   ```

3. **Real tenant test** — easier: append a tiny inline override at the
   top of `index.html` temporarily:
   ```html
   <script>window.__SITE__ = { company:{name:'SPIL Glass'}, colors:{primary:'#0066cc'} };</script>
   ```
   Rebuild and reload. The company name, colors, etc. should all swap.
   Remove the temporary override before committing.

4. View source of the production HTML — confirm every `<script src=...>`
   starts with `/<slug>/`.

If any of those fail, fix before declaring done.

### Deliverables when done
Report exactly:

```
Repo:              <git URL after first push>
Branch:            main
Build command:     PUBLIC_BASE_PATH=/<slug>/ npm ci --include=dev && npm run build
Output directory:  dist

Editable fields (these populate the tenant UI):
  - company.name, company.tagline, company.logo
  - colors.primary, colors.accent, colors.primaryText
  - contact.email, contact.phone, contact.address, contact.socials.*
  - hero.headline, hero.subheadline, hero.ctaLabel, hero.ctaHref
  - products[] (name, description, image, price, href)
  - footer.copyright, footer.tagline
  - meta.title, meta.description
  - <list any extra fields you added>

Notes for the host tool's user:
  - <anything specific about how this template behaves>
```

---

## NOW — design brief

(Write your own brief below: company industry, sections you want, color
palette, vibe, reference sites. The assistant will build a master
template that conforms to the contract above and uses these values as
defaults.)
