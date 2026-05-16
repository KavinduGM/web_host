# Web Host Tool

A self-hosted multi-tenant demo platform. Paste a Git URL, pick a slug, and you get back a public link like `https://demos.yourdomain.com/spil-glass/` that serves the built React site. Enable/disable/delete demos with one click.

Designed for a Hostinger VPS KVM 2 (Ubuntu/Debian).

---

## How it works

```
                       ┌──────────────────────────────┐
HTTPS  ────►  nginx ──►│  /admin, /api  → Node (3001) │
                       │  /<slug>/*    → /var/www/demos/<slug>/  (static)
                       └──────────────────────────────┘
                                       ▲
                                       │  build worker:
                                       │  git clone --depth 1 <url>
                                       │  npm ci && npm run build
                                       │  atomic publish to /var/www/demos/<slug>/
```

- **Path-based URLs** — `demos.yourdomain.com/<slug>/`, one wildcard SSL cert covers everything.
- **Atomic publish** — builds go to a staging dir, then are swapped in by rename so demos never appear half-built.
- **Static-only** — designed for Vite/CRA React sites (no Next.js SSR / no Node runtime per demo).
- **Disable, don't delete** — disabled demos move to `/var/www/demos/.disabled/` and become 404s; re-enable to restore instantly.
- **Single admin password** — bcrypt-hashed, JWT cookie session.

---

## Project layout

```
server/      Express API + build worker + SQLite
client/      React + Vite admin UI (compiled into client/dist/)
deploy/      nginx config, systemd unit, one-shot setup script
```

---

## Local development

```bash
# Backend
cd server
npm install
cp .env.example .env
# generate JWT_SECRET:
openssl rand -hex 32
# generate ADMIN_PASSWORD_HASH:
node -e "console.log(require('bcryptjs').hashSync('changeme', 10))"
# paste into .env, then for local dev:
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

Open <http://localhost:5173/admin/> and log in with the password you hashed.

To preview locally end-to-end (no nginx), run `npm run build` in `client/` — the server will serve the built bundle from `/admin`.

---

## VPS deployment (Hostinger KVM 2, Ubuntu 22.04+)

1. **Point DNS.** Create an A record: `demos.yourdomain.com → <your VPS IP>`.

2. **SSH in as root** and copy this repo to the VPS (via git, scp, or rsync):

   ```bash
   ssh root@your-vps
   git clone https://github.com/your-org/web-host-tool.git /tmp/web-host-tool
   bash /tmp/web-host-tool/deploy/setup.sh demos.yourdomain.com
   ```

   The setup script installs Node 20, nginx, creates the `webhost` user, sets up `/var/www/demos`, drops in the nginx config, and prints the remaining steps.

3. **Install the app** (the script prints these exact commands):

   ```bash
   sudo -u webhost cp -r /tmp/web-host-tool /opt/web-host-tool
   cd /opt/web-host-tool/client && sudo -u webhost npm ci && sudo -u webhost npm run build
   cd /opt/web-host-tool/server && sudo -u webhost npm ci
   sudo -u webhost cp .env.example .env
   # Fill in JWT_SECRET and ADMIN_PASSWORD_HASH — see helpers below.
   sudo -u webhost nano .env
   ```

   Generate the two secrets:
   ```bash
   openssl rand -hex 32                                                # JWT_SECRET
   sudo -u webhost node -e "console.log(require('bcryptjs').hashSync('YOUR-PASSWORD', 10))"
   ```

4. **Start the service:**

   ```bash
   sudo cp /opt/web-host-tool/deploy/web-host-tool.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now web-host-tool
   sudo systemctl status web-host-tool
   ```

5. **Enable HTTPS:**

   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d demos.yourdomain.com
   ```

6. **Open the admin panel:** `https://demos.yourdomain.com/admin`

---

## Using it

### Add a demo
1. Click **New demo**.
2. Fill in:
   - **Name** — display name (e.g. "SPIL Glass demo")
   - **Slug** — URL segment (e.g. `spil-glass` → `/spil-glass/`)
   - **Git URL** — HTTPS clone URL (or SSH if you set up a deploy key on the VPS)
   - **Branch** — defaults to `main`
   - **Build command** — defaults to `npm ci && npm run build`
   - **Output directory** — `dist` for Vite, `build` for CRA
3. Hit **Create & build**. You'll land on the detail page where the build log streams live.

### Send to a client
Once status is **ready**, copy the demo URL (`https://demos.yourdomain.com/<slug>/`) and send it on LinkedIn.

### Rebuild after pushing changes
On the demo detail page, click **Rebuild**. The build clones the latest branch tip and atomically replaces the live files.

### Disable / re-enable / delete
- **Disable** — moves files to `.disabled/`; link returns 404. Click **Enable** to restore.
- **Delete** — removes files and the DB row. Irreversible.

---

## SPA routing (client-side React Router)

The nginx config in `deploy/nginx.conf.example` falls back any unmatched path under `/<slug>/...` to `/<slug>/index.html`, so React Router (`BrowserRouter`) works.

**Important — Vite config in each demo site:** set `base: '/<slug>/'` in `vite.config.js`, otherwise asset URLs will 404. The simplest setup: read it from an env var at build time.

```js
// vite.config.js inside each demo repo
export default defineConfig({
  base: process.env.PUBLIC_BASE_PATH || '/',
  // …
});
```

Then in the host tool's **Build command** field for that demo:
```
PUBLIC_BASE_PATH=/spil-glass/ npm ci && npm run build
```

---

## Notes & gotchas

- **Private Git repos** — generate an SSH deploy key on the VPS for the `webhost` user and add it to the repo's deploy keys, or include credentials in an HTTPS clone URL (less safe).
- **Build resources** — Hostinger KVM 2 has 2 vCPU / 8 GB RAM, plenty for one React build at a time. `BUILD_CONCURRENCY=1` is the default; bump it if you have spare capacity.
- **Disk** — each demo's built output is a few MB. The clone+build scratch space lives under `/var/lib/web-host-tool/work` and is wiped after each build.
- **Backups** — back up `/var/lib/web-host-tool/data.db` (SQLite). Demos themselves can be rebuilt from Git.
- **Reserved slugs** — `admin`, `api`, `health`, `assets`, etc. are blocked. See `server/src/slug.js`.
- **No HTTPS in dev** — `secure` cookie flag is off when `NODE_ENV != production`. Systemd unit doesn't set `NODE_ENV`; add `Environment=NODE_ENV=production` to the service file if you want cookies marked Secure (recommended once HTTPS is on).

---

## Tweaking the architecture

- **Subdomain mode later** — if you want `<slug>.demos.yourdomain.com` instead, add a wildcard DNS record + wildcard SSL cert and change the nginx config to route on `$host`. Slug validation is already strict enough to be safe in a hostname.
- **Multiple users** — replace the single-password auth in `server/src/auth.js` and `routes/auth.js` with a `users` table.
- **SSR demos** — would require per-demo Node processes and dynamic upstream proxying; not supported in this version.
