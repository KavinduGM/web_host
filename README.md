# Web Host Tool

A self-hosted multi-tenant demo platform.

**Two ways to ship a demo:**

1. **One-off demo** — paste a Git URL, pick a slug, get back a public link like `https://demos.yourdomain.com/spil-glass/` that serves the built React site.
2. **Template + tenants** — build a single React "master template" once, then spawn unlimited re-branded copies (different logo, colors, copy, products) from a UI form, each with its own slug. No extra git repo, no rebuild — tenants are pure runtime overrides.

Runs as a single Docker container. One command to deploy on a fresh (or existing) VPS.

---

## ⚡ One-command install

SSH into your VPS and run:

```bash
curl -fsSL https://raw.githubusercontent.com/KavinduGM/web_host/main/install.sh | sudo bash
```

You'll be prompted for **(1) your domain** and **(2) an admin password**. The script:

- Installs Docker if missing
- Clones the repo to `/opt/web-host-tool`
- Generates a JWT secret + bcrypt-hashes your password
- **Pulls the pre-built image** from `ghcr.io/kavindugm/web_host:latest` (~20s)
  — or builds locally as a fallback (~2 min) if the GHCR package isn't public yet
- Creates persistent volumes (`web_host_demos`, `web_host_state`, `web_host_tenants`)
- **Auto-detects your setup:**
  - If Dokploy/Traefik is already running on the box → attaches the container to `dokploy-network` with the right Traefik labels (no Dokploy config needed)
  - Otherwise → runs a Caddy sidecar on :80/:443 with auto Let's Encrypt SSL
- Starts the container with `restart=unless-stopped`

After ~20 seconds (pulling pre-built image) or ~2 minutes (first-time local build), open `https://<your-domain>/admin` and log in.

### One-time setup so future pulls are instant

After the very first push to GitHub `main`, a GitHub Action builds and publishes the image to GHCR. By default the package is **private**, so anonymous `docker pull` fails and `install.sh` falls back to a local build. Make it public once and never wait again:

1. Go to <https://github.com/KavinduGM?tab=packages>
2. Click `web_host`
3. **Package settings** (right sidebar) → scroll to **Danger Zone** → **Change visibility** → **Public** → confirm

After that, every `install.sh` run (and every future update) just pulls in ~20 seconds.

### Updating

Re-run the same command (it remembers your config):
```bash
sudo bash /opt/web-host-tool/install.sh
```

### Uninstalling

```bash
sudo bash /opt/web-host-tool/uninstall.sh
```

---

The Dockerfile-on-Dokploy path also works (see "Alternative deployment paths" below), but the one-liner is much less fiddly.

## Concepts

| Thing | What it is | How you make it |
|---|---|---|
| **Template** (a "demo" in the DB) | A built React site, served at `/<slug>/`. Can stand alone OR act as a master for tenants. | Add via **+ Template** form. Builds from a git repo. |
| **Tenant** | A re-branded view of a template at its own slug. Same files, but `window.__SITE__` is injected with overrides. | Add via **+ Tenant** form. No git, no build — just fill out the config. |

For templates to support tenants, they must follow the conventions in
[`TEMPLATE_BUILD_PROMPT.md`](TEMPLATE_BUILD_PROMPT.md) — primarily,
read everything (company name, logo, colors, copy, products, contact)
from `src/config/site.ts`, which deep-merges `window.__SITE__` over the
defaults.

---

## How it works

```
                ┌─────────────────────────────────────────┐
HTTPS ──►  Dokploy/Traefik  ──►│  Node (3001)
(your domain)                  │   ├── /admin → React admin UI
                               │   ├── /api   → REST API
                               │   └── /<slug>/* → built demo files
                               └─────────────────────────────────────────┘
                                              ▲
                                              │  build worker:
                                              │  git clone --depth 1 <url>
                                              │  npm ci && npm run build
                                              │  atomic publish to /data/demos/<slug>/
```

- **One container** — Node serves the admin UI, the API, and every demo's static files. No internal nginx layer.
- **Path-based URLs** — `demos.yourdomain.com/<slug>/`. One certificate covers everything.
- **Atomic publish** — builds go to a staging dir then rename-swapped in, so demos never appear half-built.
- **Static-only** — designed for Vite/CRA React sites (no Next.js SSR / no per-demo Node runtime).
- **Disable, don't delete** — disabled demos move to `.disabled/` (instant 404), re-enable to restore.
- **Single admin password** — bcrypt-hashed, JWT cookie session.
- **SQLite, not Postgres** — single-instance tool, low write volume. Just persist the `.db` file via a volume. No external DB needed.

---

## Project layout

```
Dockerfile          Multi-stage build (client → server deps → runtime)
docker-compose.yml  Local testing convenience
server/             Express API + build worker + SQLite
client/             React + Vite admin UI (built into client/dist/ inside the image)
deploy/             Bare-VPS files (nginx + systemd) — only if NOT using Docker
```

---

## Alternative deployment paths

Pick the one-liner above unless you have a reason not to. The Dokploy and bare-VPS paths below are kept for reference.

### Deploy on Dokploy (the long way)

### 1. Push the code to a Git repo
You've already done this — Dokploy needs a Git URL to deploy from.

### 2. Create the application in Dokploy
- **New application → Docker / Dockerfile-based**
- **Source:** point to your repo + branch (e.g. `main`)
- **Build Type:** Dockerfile
- **Dockerfile path:** `./Dockerfile` (default)

### 3. Configure environment variables
Add these in Dokploy's **Environment** tab:

| Variable | Value |
|---|---|
| `JWT_SECRET` | output of `openssl rand -hex 32` |
| `ADMIN_PASSWORD_HASH` | output of `node -e "console.log(require('bcryptjs').hashSync('YOUR-PASSWORD', 10))"` |
| `PUBLIC_BASE_URL` | `https://demos.yourdomain.com` (no trailing slash) |
| `BUILD_CONCURRENCY` | `1` (raise if your VPS has spare CPU) |

`PORT`, `BIND_HOST`, `NODE_ENV`, and the `*_DIR` / `DB_PATH` defaults are already set inside the Dockerfile — don't override them unless you have a reason.

### 4. Add persistent volumes
In **Mounts / Volumes**, create two **Volume** mounts (NOT bind mounts unless you specifically want a host path):

| Volume name | Mount path | What it holds |
|---|---|---|
| `web-host-demos` | `/data/demos` | Built demo sites (served at `/<slug>/`). If you lose this you can rebuild from Git. |
| `web-host-state` | `/data/state` | SQLite DB + build scratch space. **Back this up** — it's the only thing you can't rebuild. |
| `web-host-tenants` | `/data/tenants` | Tenant logos and uploaded images. **Back this up too** — uploads aren't in Git. |

### 5. Configure the domain
In **Domains** add `demos.yourdomain.com`, target port `3001`, enable HTTPS (Let's Encrypt). Dokploy's Traefik handles SSL and forwards everything to the container.

### 6. Deploy
Hit **Deploy**. First build takes 2-3 minutes (npm installs in two stages). Once it's up, open `https://demos.yourdomain.com/admin` and sign in.

### 7. Updating
Push to your branch → click **Redeploy** in Dokploy (or enable auto-deploy on push). Volumes persist across deploys, so demos and the database survive.

---

## Local testing with Docker

```bash
# 1. Edit docker-compose.yml — fill in JWT_SECRET and ADMIN_PASSWORD_HASH.
#    (Bcrypt hashes contain $ — in compose YAML you must double them to $$.)

# Generate the hash (paste output, then double each $ -> $$ in the YAML):
node -e "console.log(require('bcryptjs').hashSync('changeme', 10))"

# 2. Run it
docker compose up --build

# 3. Open http://localhost:3001/admin
```

---

## Local development (no Docker)

```bash
# Backend
cd server
npm install
cp .env.example .env
# generate JWT_SECRET:
openssl rand -hex 32
# generate ADMIN_PASSWORD_HASH:
node -e "console.log(require('bcryptjs').hashSync('changeme', 10))"
# paste into .env, then set local paths:
#   DEMOS_DIR=./_demos
#   DISABLED_DIR=./_demos/.disabled
#   WORK_DIR=./_work
#   DB_PATH=./data.db
#   PUBLIC_BASE_URL=http://localhost:3001
npm run dev

# Frontend (separate terminal)
cd client
npm install
npm run dev      # http://localhost:5173/admin/ (proxies /api → :3001)
```

For an end-to-end local preview (admin + demos), run `npm run build` in `client/` first — the server serves everything from port 3001.

---

## Using it

### Add a demo
1. **New demo**
2. Fill in:
   - **Name** — display name
   - **Slug** — URL segment (e.g. `spil-glass` → `/spil-glass/`)
   - **Git URL** — HTTPS clone URL (or SSH if you set up a deploy key)
   - **Branch** — default `main`
   - **Build command** — default `npm ci && npm run build`
   - **Output directory** — `dist` for Vite, `build` for CRA
3. **Create & build**. Build log streams live on the detail page.

### Send to a client
Once status is **ready**, the demo URL is `https://demos.yourdomain.com/<slug>/`.

### Rebuild after pushing changes
**Rebuild** on the detail page — clones the latest branch tip and atomically replaces the live files.

### Disable / re-enable / delete
- **Disable** moves files to `.disabled/`; link returns 404.
- **Enable** restores.
- **Delete** removes files and the DB row.

---

## SPA routing in your demos (important)

Each demo is served from `/<slug>/`, so its built assets must be written with that base path. In each demo repo's `vite.config.js`:

```js
export default defineConfig({
  base: process.env.PUBLIC_BASE_PATH || '/',
  // …
});
```

Then in the host tool's **Build command** field for that demo:
```
PUBLIC_BASE_PATH=/spil-glass/ npm ci && npm run build
```

Without this, asset URLs come out absolute (`/assets/...`) and will 404 under the slug prefix. Client-side routing (React Router `BrowserRouter`) works either way thanks to the SPA fallback the server performs.

---

## Notes & gotchas

- **Private Git repos** — generate an SSH key inside the container (or pre-bake one) and add it as a deploy key. Easiest: switch the URL to HTTPS with a fine-scoped token (`https://oauth2:TOKEN@github.com/org/repo.git`).
- **Build resources** — Hostinger KVM 2 (2 vCPU / 8 GB) handles one React build comfortably. `BUILD_CONCURRENCY=1` by default.
- **Backups** — the only file you can't rebuild is `/data/state/data.db`. Snapshot the `web-host-state` volume, or run `sqlite3 data.db .backup ...` on a schedule.
- **Reserved slugs** — `admin`, `api`, `health`, `assets`, `login`, `logout`, `_next`, `public`, `static` are blocked. See `server/src/slug.js`.
- **NODE_ENV=production** — already set in the Dockerfile, so cookies are marked `Secure`. If you ever run without HTTPS in front, browsers will drop the auth cookie and login will appear to silently fail.

---

## Tweaking the architecture

- **Subdomain mode later** — if you want `<slug>.demos.yourdomain.com` instead, add wildcard DNS + wildcard cert in Dokploy and route on `Host` header to the same container; the demo middleware can be adapted to match on hostname instead of path.
- **Multiple users** — replace the single-password auth in `server/src/auth.js` and `routes/auth.js` with a `users` table.
- **SSR demos** — not supported. Would require per-demo Node processes and dynamic upstream proxying.

---

## Bare-VPS path (no Docker)

If you ever want to skip Dokploy and run on a plain VPS with nginx + systemd, see `deploy/` for `nginx.conf.example`, `web-host-tool.service`, and `setup.sh`. Those files predate the Docker setup and assume nginx sits in front of Node — they're kept for reference but aren't the recommended path.
