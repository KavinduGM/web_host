import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS demos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    git_url       TEXT NOT NULL,
    git_branch    TEXT NOT NULL DEFAULT 'main',
    build_cmd     TEXT NOT NULL DEFAULT 'npm ci && npm run build',
    output_dir    TEXT NOT NULL DEFAULT 'dist',
    status        TEXT NOT NULL DEFAULT 'pending',
    enabled       INTEGER NOT NULL DEFAULT 1,
    last_build_at TEXT,
    last_error    TEXT,
    defaults      TEXT NOT NULL DEFAULT '{}',  -- JSON blob: SiteConfig values that the template has BAKED IN.
                                                -- Used at tenant-serve time to substitute each baked-in
                                                -- string with the tenant's overriding value across HTML
                                                -- and bundled JS/CSS.
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS build_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    demo_id    INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
    status     TEXT NOT NULL,
    log        TEXT NOT NULL DEFAULT '',
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at   TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_build_logs_demo ON build_logs(demo_id, started_at DESC);

  -- A tenant is a re-branded view of a template (a 'demo' row).
  -- Same template files are served, but with window.__SITE__ injected from the tenant's config.
  CREATE TABLE IF NOT EXISTS tenants (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    template_id INTEGER NOT NULL REFERENCES demos(id) ON DELETE CASCADE,
    config      TEXT NOT NULL DEFAULT '{}',  -- JSON blob: SiteConfig overrides
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tenants_template ON tenants(template_id);
`);

// Migration: add `defaults` column to existing demos tables that pre-date it.
// CREATE TABLE IF NOT EXISTS leaves the schema alone if the table exists, so
// existing deployments won't get the new column from the DDL above.
const demoCols = db.prepare(`PRAGMA table_info(demos)`).all().map((c) => c.name);
if (!demoCols.includes('defaults')) {
  db.exec(`ALTER TABLE demos ADD COLUMN defaults TEXT NOT NULL DEFAULT '{}'`);
}

// --- helpers for tenant config parsing ---
function parseTenant(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: !!row.enabled,
    config: safeJSON(row.config),
  };
}
export function parseDemo(row) {
  if (!row) return null;
  return {
    ...row,
    enabled: !!row.enabled,
    defaults: safeJSON(row.defaults),
  };
}
function safeJSON(s) {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}

export const queries = {
  // ---- demos / templates ----
  listDemos: db.prepare('SELECT * FROM demos ORDER BY created_at DESC'),
  getDemoById: db.prepare('SELECT * FROM demos WHERE id = ?'),
  getDemoBySlug: db.prepare('SELECT * FROM demos WHERE slug = ?'),
  insertDemo: db.prepare(`
    INSERT INTO demos (slug, name, git_url, git_branch, build_cmd, output_dir)
    VALUES (@slug, @name, @git_url, @git_branch, @build_cmd, @output_dir)
  `),
  updateDemo: db.prepare(`
    UPDATE demos SET
      name = @name,
      git_url = @git_url,
      git_branch = @git_branch,
      build_cmd = @build_cmd,
      output_dir = @output_dir,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  setDemoStatus: db.prepare(`
    UPDATE demos SET status = ?, last_error = ?, last_build_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `),
  setDemoEnabled: db.prepare(`
    UPDATE demos SET enabled = ?, updated_at = datetime('now') WHERE id = ?
  `),
  setDemoDefaults: db.prepare(`
    UPDATE demos SET defaults = ?, updated_at = datetime('now') WHERE id = ?
  `),
  deleteDemo: db.prepare('DELETE FROM demos WHERE id = ?'),

  // ---- build logs ----
  insertBuildLog: db.prepare(`
    INSERT INTO build_logs (demo_id, status, log) VALUES (?, 'running', '')
  `),
  appendBuildLog: db.prepare(`
    UPDATE build_logs SET log = log || ? WHERE id = ?
  `),
  finishBuildLog: db.prepare(`
    UPDATE build_logs SET status = ?, ended_at = datetime('now') WHERE id = ?
  `),
  listBuildLogs: db.prepare(`
    SELECT id, status, started_at, ended_at FROM build_logs
    WHERE demo_id = ? ORDER BY started_at DESC LIMIT 20
  `),
  getBuildLog: db.prepare('SELECT * FROM build_logs WHERE id = ?'),

  // ---- tenants ----
  listAllTenants: () =>
    db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all().map(parseTenant),
  listTenantsByTemplate: (templateId) =>
    db.prepare('SELECT * FROM tenants WHERE template_id = ? ORDER BY created_at DESC')
      .all(templateId).map(parseTenant),
  getTenantById: (id) =>
    parseTenant(db.prepare('SELECT * FROM tenants WHERE id = ?').get(id)),
  getTenantBySlug: (slug) =>
    parseTenant(db.prepare('SELECT * FROM tenants WHERE slug = ?').get(slug)),
  insertTenant: db.prepare(`
    INSERT INTO tenants (slug, name, template_id, config)
    VALUES (@slug, @name, @template_id, @config)
  `),
  updateTenant: db.prepare(`
    UPDATE tenants SET
      name = @name,
      config = @config,
      updated_at = datetime('now')
    WHERE id = @id
  `),
  setTenantEnabled: db.prepare(`
    UPDATE tenants SET enabled = ?, updated_at = datetime('now') WHERE id = ?
  `),
  deleteTenant: db.prepare('DELETE FROM tenants WHERE id = ?'),
};
