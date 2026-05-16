import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

export async function disableDemo(slug) {
  const active = path.join(config.demosDir, slug);
  const disabled = path.join(config.disabledDir, slug);
  if (!fs.existsSync(active)) return;
  await fsp.mkdir(config.disabledDir, { recursive: true });
  await fsp.rm(disabled, { recursive: true, force: true });
  await fsp.rename(active, disabled);
}

export async function enableDemo(slug) {
  const active = path.join(config.demosDir, slug);
  const disabled = path.join(config.disabledDir, slug);
  if (!fs.existsSync(disabled)) return;
  await fsp.rm(active, { recursive: true, force: true });
  await fsp.rename(disabled, active);
}

export async function deleteDemoFiles(slug) {
  const active = path.join(config.demosDir, slug);
  const disabled = path.join(config.disabledDir, slug);
  await fsp.rm(active, { recursive: true, force: true });
  await fsp.rm(disabled, { recursive: true, force: true });
}
