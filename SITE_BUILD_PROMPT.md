# Demo-site build prompt (give this to Claude Code)

Paste the block below into Claude Code at the start of a session, then
add your own design brief after it ("Build a company site for SPIL Glass
with X, Y, Z…"). Claude Code will build it in a way that drops cleanly
into the demo-hosting tool.

---

## TECHNICAL CONTRACT — read before writing code

You are building a **frontend-only marketing website** that will be
deployed on a self-hosted static-hosting tool. The tool clones the repo,
runs an npm build, and serves the build output as static files under a
sub-path like `https://demos.example.com/<slug>/`. There is no backend
runtime — no Node server, no API routes, no databases, no auth.

### Required stack — do not substitute
- **Vite** (latest stable) as the build tool
- **React 18** with **TypeScript**
- **Tailwind CSS** for styling
- **react-router-dom** for navigation (only if the site has multiple pages)
- **npm** as the package manager (must commit `package-lock.json`)

### Hard rules

1. **Build output is fully static.** No SSR, no server components,
   no runtime requirements. The deployed site must work as a folder of
   files served by any static web server.

2. **All asset references must be processable by Vite's bundler.**
   - ✅ `import logo from './assets/logo.svg'` then `<img src={logo} />`
   - ✅ `<img src="/some-file.png" />` ONLY for files placed in `public/`
     AND only when wrapped with the base path (use the helper below)
   - ❌ NEVER write absolute paths like `<img src="/logo.png" />` directly
     in JSX. Under sub-path hosting, that resolves to the wrong URL.
   - For paths that must be absolute (e.g. inside CSS `url()` for fonts),
     use Vite's `BASE_URL` runtime constant.

3. **Set `base` from an env var in `vite.config.ts`:**
   ```ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';

   export default defineConfig({
     plugins: [react()],
     base: process.env.PUBLIC_BASE_PATH || '/',
   });
   ```

4. **For React Router**, read the same env var so client routes
   work under the sub-path. In `main.tsx`:
   ```tsx
   <BrowserRouter basename={import.meta.env.BASE_URL}>
   ```
   Use `import.meta.env.BASE_URL` (Vite's bundled constant) inside the
   app — never `process.env.PUBLIC_BASE_PATH` at runtime, that's
   build-time only.

5. **Linux is case-sensitive.** Every import must match the exact
   filename case. `import Hero from './sections/Hero'` will fail in
   production if the file is `hero.tsx`. Be consistent: PascalCase
   for component files, kebab-case for non-component assets.

6. **Centralize all branding in one file** so the same template can be
   re-skinned per client. Create `src/data/site.ts`:
   ```ts
   export const site = {
     company: {
       name: 'SPIL Glass',
       tagline: '...',
       logo: '/logo.svg',          // place file in public/
     },
     colors: {
       primary: '#0066cc',
       accent:  '#f7b500',
     },
     nav: [
       { label: 'Home', href: '/' },
       { label: 'About', href: '/about' },
     ],
     hero: { headline: '...', sub: '...', cta: 'Get a quote' },
     // ...everything else copy/asset-related lives here
   } as const;
   ```
   Every component reads from this object. No hardcoded company name,
   colors, or copy anywhere else.

7. **Tailwind config**: extend the theme with the site colors so they're
   available as `bg-primary`, `text-accent`, etc. Use CSS variables fed
   from `site.ts` so re-skinning means one file edit.

8. **No external network calls at build time.** Do not use plugins or
   scripts that fetch data during `npm run build`. The build runs in a
   container that may not have outbound access to arbitrary hosts.

9. **`npm ci` must work.** Commit `package-lock.json`. Don't switch to
   `yarn` or `pnpm` mid-stream.

10. **No forms with real submission targets.** If the design calls for a
    contact form, wire it to a no-op handler that shows a "Thanks!" toast
    OR a third-party form endpoint (Formspree, Web3Forms) with the
    endpoint pulled from `site.ts`. NEVER POST to a relative `/api/...`
    path — there is no backend.

### Required project structure

```
src/
├── components/         reusable UI primitives (Button, Card, NavLink…)
├── sections/           page sections (Hero, Features, Testimonials…)
├── pages/              one file per route, e.g. Home.tsx, About.tsx
├── data/
│   └── site.ts         single source of truth for copy/branding
├── assets/             images imported in code (Vite will hash + version)
├── styles/
│   └── globals.css     Tailwind directives + CSS variables
├── App.tsx
├── main.tsx
└── vite-env.d.ts
public/
├── favicon.svg
└── (any file that must be served as-is at a known path)
index.html
vite.config.ts
tailwind.config.js
tsconfig.json
package.json
```

### Required `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: process.env.PUBLIC_BASE_PATH || '/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
```

### Required `tsconfig.json` path alias

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  }
}
```

### Required `tailwind.config.js`

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'rgb(var(--color-primary) / <alpha-value>)',
        accent:  'rgb(var(--color-accent)  / <alpha-value>)',
      },
    },
  },
  plugins: [],
};
```

Then in `src/styles/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-primary: 0 102 204;   /* keep RGB triplets, no commas */
  --color-accent:  247 181 0;
}
```

Pulling these from `site.ts` at runtime is optional but nice — inject
them into a `<style>` tag in `main.tsx` if you want one-file rebranding.

### Verification — DO THIS BEFORE FINISHING
Before declaring the site done, run:

```bash
npm install
PUBLIC_BASE_PATH=/test-slug/ npm run build
npm run preview
```

Then open the URL the preview server prints. Confirm:
- The site loads and styles correctly
- All images render (no broken icons)
- All internal links navigate without 404s
- Browser console is clean
- View source: every `<script src=...>` and `<link href=...>` URL starts
  with `/test-slug/` — not bare `/` and not `./`

If any of that fails, fix it before shipping.

### Deliverables when done
Report exactly this back to me:

```
Repo:             <git URL after first push>
Branch:           main
Build command:    PUBLIC_BASE_PATH=/<slug>/ npm ci && npm run build
Output directory: dist
Notes:            <anything I should know>
```

---

## NOW — design brief

(Write your own brief below this line: company name, industry, sections
you want, color palette, vibe, reference sites, etc. The assistant will
build it within the contract above.)
