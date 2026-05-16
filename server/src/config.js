import 'dotenv/config';
import path from 'node:path';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  jwtSecret: required('JWT_SECRET'),
  adminPasswordHash: required('ADMIN_PASSWORD_HASH'),
  demosDir: path.resolve(process.env.DEMOS_DIR || '/var/www/demos'),
  disabledDir: path.resolve(process.env.DISABLED_DIR || '/var/www/demos/.disabled'),
  workDir: path.resolve(process.env.WORK_DIR || '/var/lib/web-host-tool/work'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'http://localhost:3001').replace(/\/$/, ''),
  dbPath: path.resolve(process.env.DB_PATH || './data.db'),
  buildConcurrency: Number(process.env.BUILD_CONCURRENCY || 1),
};
