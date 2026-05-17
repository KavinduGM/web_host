# Repo prep prompt

Paste everything below into a new Claude / ChatGPT chat. Replace the two
`<<...>>` placeholders at the top before sending. Give the assistant access
to the repo (push it, share the URL, or paste files when asked).

---

## ROLE
You are preparing a React / Next.js website source repository so it can be
deployed on a self-hosted demo-hosting tool. You will analyze the repo,
make the changes required for compatibility, and report back the exact
build settings to enter into the host tool's admin panel.

## INPUTS
- **Repository URL:** `<<PASTE_GIT_URL_HERE>>`
- **Slug** (will be served under this path): `<<PASTE_SLUG_HERE>>`
- **Public base path** the site will live under: `/<<PASTE_SLUG_HERE>>/`
  (e.g. if slug is `spil-glass`, the site will be served at
  `https://demos.groovymark.com/spil-glass/`)

## HOST SYSTEM — HARD CONSTRAINTS
The host tool will:
1. `git clone --depth 1 --branch <branch>` the repo (default branch: `main`).
2. Run a single shell **build command** inside the clone (default: `npm ci && npm run build`).
3. Take the contents of an **output directory** and serve them as **static
   files** under `/<slug>/`.
4. Apply an SPA fallback: any path that doesn't match a real file falls
   back to `<slug>/index.html`. Client-side routing (React Router, Next
   app router with static export) works.

It does **NOT** support, at all:
- Server-side rendering (`getServerSideProps`, RSC streaming, middleware)
- Next.js API routes (`/api/*`)
- Next.js dynamic image optimization
- Anything that needs a running Node process per demo
- WebSockets, server actions, on-demand revalidation

The build runs on a **Linux** container (case-sensitive filesystem),
behind path-based routing under `/<slug>/`. Asset URLs that aren't
prefixed with `/<slug>/` will 404 in production.

## YOUR JOB
Audit the repo and apply whichever of the following changes are needed.
Do not skip steps just because they look optional — verify each one.

### 1. Detect the framework
Identify which of these the repo is:
- **Vite + React** (has `vite.config.js|ts`, `index.html` in root)
- **Create React App** (has `react-scripts` in `package.json`)
- **Next.js** (has `next` in `package.json`)
- **Plain static HTML/JS**
- **Something else** — report it and stop.

### 2. Fix the base-path / asset-prefix
The site must build with all asset URLs prefixed by `/<slug>/`.

- **Vite:** edit `vite.config.{js,ts}` so `base` is environment-driven:
  ```js
  export default defineConfig({
    base: process.env.PUBLIC_BASE_PATH || '/',
    // ...
  });
  ```

- **CRA:** add to `package.json`:
  ```json
  "homepage": "."
  ```
  (`.` produces relative paths, which work under any prefix.)

- **Next.js:** edit `next.config.js` / `next.config.mjs`:
  ```js
  const nextConfig = {
    output: 'export',
    images: { unoptimized: true },
    trailingSlash: true,
    basePath: process.env.NEXT_BASE_PATH || '',
    assetPrefix: process.env.NEXT_BASE_PATH || '',
  };
  export default nextConfig;
  ```

- **Plain static:** ensure every `<link>`, `<script>`, `<img>` etc. uses
  relative paths (`./assets/...`) not absolute (`/assets/...`). Fix any
  absolute paths.

### 3. Strip server-only features (Next.js only)
- Delete or refactor any `app/api/` or `pages/api/` routes.
- Replace any `getServerSideProps` with `getStaticProps` (or remove).
- Remove or no-op any `middleware.{js,ts}`.
- Replace `next/image` `<Image>` usages — they need `unoptimized: true`
  (already set above), but if any rely on remote loaders/blur placeholders,
  switch to plain `<img>` tags.
- Remove `revalidate`, server actions, route handlers under `app/`.

If any of these exist and the site genuinely needs them, **stop and tell
the user the site isn't compatible** — converting it would change behavior.

### 4. Fix case-sensitivity issues
Linux is case-sensitive; macOS/Windows usually aren't, so this can hide
locally. Grep every import path against the actual filename:

```bash
# rough heuristic
grep -rEho "from ['\"][^'\"]+['\"]" src app components 2>/dev/null | sort -u
```

For every import like `@/components/sections/PageHero`, verify the file
exists with that exact casing. Fix mismatches (rename the file OR the
import — whichever is correct).

### 5. Ensure a lockfile exists and is committed
The build command uses `npm ci`, which requires `package-lock.json` to be
present and in sync. If missing:
```bash
rm -rf node_modules package-lock.json
npm install
git add package-lock.json
```
If the project uses `yarn` or `pnpm`, either:
- Change the build command (you'll report this back), or
- Convert to npm by removing the alt lockfile and running `npm install`.

### 6. Verify the build works locally with the prefix
Run the build the same way the host tool will, with the slug-aware env var:

```bash
# Vite
PUBLIC_BASE_PATH=/<<PASTE_SLUG_HERE>>/ npm ci && npm run build
# CRA
npm ci && npm run build
# Next.js
NEXT_BASE_PATH=/<<PASTE_SLUG_HERE>>/ npm ci && npm run build
```

Then sanity-check the produced HTML:
```bash
# Vite/CRA dist (or build/)
grep -E 'src=|href=' dist/index.html | head
# Next out
grep -E 'src=|href=' out/index.html | head
```
Every asset URL should start with `/<<PASTE_SLUG_HERE>>/` (or be relative
with `./` for CRA). If any are bare `/assets/...` or `/_next/...`, the
prefix didn't apply — fix the config.

### 7. Commit, push, verify
- Commit the changes with a clear message.
- Push to the default branch (`main` — create it if needed).
- Verify the branch exists on the remote:
  ```bash
  git ls-remote --heads <repo-url> main
  ```
  Should output one line. If empty, the branch isn't pushed.

## REPORT BACK
At the end, output exactly these fields so they can be pasted into the
host tool's admin form:

```
Name:             <human-friendly demo name>
Slug:             <<PASTE_SLUG_HERE>>
Git URL:          <repo-url>
Branch:           main
Build command:    <one of the variants above, with the env var set>
Output directory: <dist | build | out>
```

Also list:
- **Files changed** in this prep (paths only)
- **Anything the host tool's user must do manually** (e.g. "site uses API
  routes — those were removed; the contact form now points to Formspree")
- **Anything you couldn't fix** that will likely break the build

## RULES
- Make the *minimum* changes needed for static-export compatibility.
  Don't restyle, refactor, or "improve" unrelated code.
- If the site uses features the system can't support and there's no clean
  fallback, stop and report — don't half-convert it.
- All changes go in the demo's repo, not the host tool.
- Test the build before reporting success.
