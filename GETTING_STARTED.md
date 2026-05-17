# Getting started — step by step

Follow these in order. Run each command exactly as shown. Don't move to
the next step until the current one works.

---

## STEP 1 — Delete the broken Dokploy app

Open Dokploy in your browser → **Projects** → click on the `demo-site`
application → top right click **⋯** (or "Settings") → **Delete
application**. Confirm.

This frees up the domain `demos.groovymark.com` and removes the broken
container so it stops fighting the new install.

> If you don't see a delete option, that's fine — skip to Step 2. The
> installer will overwrite the running container.

---

## STEP 2 — SSH into the VPS

```bash
ssh root@srv1508696   # or whatever your VPS SSH command is
```

---

## STEP 3 — Run the one-command installer

Copy and paste this exactly:

```bash
curl -fsSL https://raw.githubusercontent.com/KavinduGM/web_host/main/install.sh | sudo bash
```

> **First-time-only optional speedup:** the installer pulls a pre-built image from `ghcr.io/kavindugm/web_host:latest`. The first time you run install.sh, this package is private by default — `install.sh` will silently fall back to building locally (~2 min) and works fine. To make every future install/update take ~20 seconds instead, do this once:
> 1. Go to <https://github.com/KavinduGM?tab=packages>
> 2. Click `web_host` → **Package settings** → **Change visibility** → **Public**
> If the package isn't there yet, the Actions workflow hasn't run — check <https://github.com/KavinduGM/web_host/actions>.

It will ask two questions:

1. `Domain (e.g. demos.example.com):` → type **`demos.groovymark.com`** and press Enter
2. `Admin password (min 8 chars):` → type a password (you won't see it as you type — that's normal) → Enter → type it again to confirm → Enter

**Pick a password without `$` in it** — e.g. `GMAdmin2026!` is fine; `GM$2026` is not. Avoids shell-escape headaches if you ever need to type it on the command line.

The installer will run for 2-3 minutes. When it's done you'll see:

```
==============================================================
✓ web-host-tool is deployed
==============================================================
Admin panel:    https://demos.groovymark.com/admin
Deploy mode:    traefik
Container:      web-host-tool
```

---

## STEP 4 — Confirm the admin loads

In your browser, open: **<https://demos.groovymark.com/admin>**

Use an **incognito / private window** to bypass cache.

You should see a login page. Enter the password from Step 3. After
login, the dashboard should show this nav at the top:

**Templates · Tenants · + Template · + Tenant**

If you only see "Dashboard / New demo" — stop and tell me. Don't go
further.

---

## STEP 5 — Patch the Novatec template repo

This is a one-line change in the **Novatec repo**, not the host-tool
repo. Open Claude Code (or any editor) on your local copy of
`https://github.com/KavinduGM/novate`.

Open the file: **`src/main.tsx`**

Find this line:

```tsx
<BrowserRouter basename={import.meta.env.BASE_URL}>
```

Replace it with:

```tsx
<BrowserRouter
  basename={
    (typeof window !== 'undefined' && (window as any).__BASE_URL__) ||
    import.meta.env.BASE_URL
  }
>
```

Save the file. Then commit + push:

```bash
cd /path/to/novate
git add src/main.tsx
git commit -m "Read BrowserRouter basename from window.__BASE_URL__"
git push
```

---

## STEP 6 — Add Novatec as a template in the admin

In the admin UI:

1. Click **+ Template**
2. Fill in:
   - **Name:** `Novatec Glass`
   - **Slug:** `novatec-glass`
   - **Git URL:** `https://github.com/KavinduGM/novate.git`
   - **Branch:** `main`
   - **Build command:** `PUBLIC_BASE_PATH=/novatec-glass/ npm ci --include=dev && npm run build`
   - **Output directory:** `dist`
3. Click **Create & build**

Wait until status shows **ready** (1-3 minutes).

Open the URL: **<https://demos.groovymark.com/novatec-glass/>** in
incognito. You should see the Novatec site fully rendered, not blank.

If it's blank — Step 5's patch didn't make it into the build. Verify
on the VPS:

```bash
docker exec web-host-tool sh -c "grep -l '__BASE_URL__' /data/demos/novatec-glass/assets/*.js"
```

This should print at least one filename. If it prints nothing, the
patch isn't in the built bundle — re-check Step 5.

---

## STEP 7 — Create the SPIL Glass tenant

In the admin UI:

1. Open the Novatec template detail page (click on Novatec Glass)
2. Scroll down to **Tenants from this template** → click **+ New tenant**
3. Fill in:
   - **Name:** `SPIL Glass`
   - **Slug:** `spil-glass`
   - **Template:** Novatec Glass (already selected)
4. In the **Company** section:
   - Tagline: SPIL's tagline
   - **Logo:** click **Upload**, pick SPIL's logo file
   - **Favicon:** click **Upload**, pick SPIL's favicon (square PNG, ~64×64)
5. In **Colors** section: pick SPIL's primary + accent colors
6. In **Hero** section: SPIL's headline, subheadline, CTA
7. In **Contact** section: SPIL's email, phone, address, socials
8. (Optional) **Products** section: add SPIL's products one by one
9. In **Footer & meta** section: set **<title> tag** to e.g.
   `SPIL Glass — Premium Glass Solutions`
10. Click **Save tenant**

Status will turn to **live** immediately. No build needed.

---

## STEP 8 — Test the SPIL Glass demo

Open in **incognito**: **<https://demos.groovymark.com/spil-glass/>**

Expected:
- ✓ Page renders fully (not blank)
- ✓ SPIL's logo in the header
- ✓ SPIL's colors throughout
- ✓ Browser tab title = SPIL's title
- ✓ Browser tab favicon = SPIL's favicon
- ✓ Clicking nav links navigates correctly (URLs stay under `/spil-glass/`)

If everything looks right — **you're done**. The same pattern works
for ABC Glass and every future client. Just **+ New tenant** for each.

---

## How to send a demo to a client via LinkedIn

Just paste the URL: `https://demos.groovymark.com/spil-glass/`

LinkedIn will fetch the meta tags from the URL and show a preview with:
- The tenant's title
- The tenant's tagline (as description)
- The tenant's logo (as og:image)

(All those tags are rewritten server-side per tenant — set them in the
tenant editor's "Footer & meta" + "Company" sections.)

---

## How to update the host tool later

Just re-run the same install command on the VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/KavinduGM/web_host/main/install.sh | sudo bash
```

It will pull the latest code, rebuild, and restart. Your data
(templates, tenants, uploaded logos) is preserved in Docker volumes.

---

## How to add another client (e.g. ABC Glass)

You don't need to do Step 5 or Step 6 again. Just:

1. Admin UI → **+ Tenant**
2. Pick the Novatec template
3. Fill in ABC's details (logo, colors, contact, etc.)
4. Save
5. Send the URL `https://demos.groovymark.com/abc-glass/`

That's it. 30 seconds per new client.

---

## Troubleshooting

### Admin page shows the old "Dashboard / New demo" nav after Step 4
The container is running old code. Force a clean rebuild:
```bash
sudo bash /opt/web-host-tool/install.sh
```
Then hard-refresh the browser (`Cmd+Shift+R` on Mac, `Ctrl+Shift+R` on
Win/Linux), or use a new incognito window.

### SPIL Glass URL shows white screen
- Did you do Step 5 (the Novatec patch)?
- Did you click **Rebuild** on the Novatec template in the admin after pushing the patch?
- Open DevTools (F12) → Console tab → reload → paste any red error here

### Logs
```bash
docker logs --tail 50 -f web-host-tool
```

### Reset admin password
```bash
sudo rm /opt/web-host-tool/.deploy.env
sudo bash /opt/web-host-tool/install.sh
```
Pick a new password when prompted. Your demos and tenants survive.

### Completely remove and start over
```bash
sudo bash /opt/web-host-tool/uninstall.sh
```
It will ask before deleting data.
