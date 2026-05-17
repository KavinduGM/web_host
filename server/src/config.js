import 'dotenv/config';
import path from 'node:path';

function required(name) {
  const v = process.env[name];
  if (!v) {
    const seen = Object.keys(process.env)
      .filter((k) => !/^(PATH|HOME|HOSTNAME|PWD|SHLVL|TERM|_|LANG|LC_)/.test(k))
      .sort();
    console.error(`\n[config] Missing required env var: ${name}`);
    console.error(`[config] Env vars currently visible to the process:`);
    console.error(`[config]   ${seen.join(', ') || '(none non-system)'}`);
    console.error(`[config] If "${name}" is not in that list, the runtime isn't passing it in.`);
    console.error(`[config] In Dokploy: put it under "Environment" (not "Build Arguments") and redeploy.\n`);
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: required('JWT_SECRET'),
  adminPasswordHash: required('ADMIN_PASSWORD_HASH'),
  demosDir: path.resolve(process.env.DEMOS_DIR || '/var/www/demos'),
  disabledDir: path.resolve(process.env.DISABLED_DIR || '/var/www/demos/.disabled'),
  workDir: path.resolve(process.env.WORK_DIR || '/var/lib/web-host-tool/work'),
  tenantsDir: path.resolve(process.env.TENANTS_DIR || '/data/tenants'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, ''),
  dbPath: path.resolve(process.env.DB_PATH || './data.db'),
  buildConcurrency: Number(process.env.BUILD_CONCURRENCY || 1),
};
