import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { queries } from './db.js';

const queue = [];
let active = 0;

export function enqueueBuild(demoId) {
  queue.push(demoId);
  drain();
}

function drain() {
  while (active < config.buildConcurrency && queue.length) {
    const id = queue.shift();
    active++;
    runBuild(id)
      .catch((err) => console.error(`[build ${id}] fatal:`, err))
      .finally(() => {
        active--;
        drain();
      });
  }
}

function run(cmd, args, opts, onData) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, shell: false });
    child.stdout.on('data', (b) => onData(b.toString()));
    child.stderr.on('data', (b) => onData(b.toString()));
    child.on('error', (err) => {
      onData(`\n[spawn error] ${err.message}\n`);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

function runShell(cmdLine, opts, onData) {
  return new Promise((resolve) => {
    const child = spawn(cmdLine, { ...opts, shell: '/bin/sh' });
    child.stdout.on('data', (b) => onData(b.toString()));
    child.stderr.on('data', (b) => onData(b.toString()));
    child.on('error', (err) => {
      onData(`\n[spawn error] ${err.message}\n`);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function rimraf(p) {
  await fsp.rm(p, { recursive: true, force: true });
}

async function runBuild(demoId) {
  const demo = queries.getDemoById.get(demoId);
  if (!demo) return;

  const logRow = queries.insertBuildLog.run(demoId);
  const logId = logRow.lastInsertRowid;

  const append = (chunk) => {
    queries.appendBuildLog.run(chunk, logId);
  };

  const workRepo = path.join(config.workDir, `${demo.slug}-${Date.now()}`);
  const targetDir = path.join(config.demosDir, demo.slug);
  const stagingDir = path.join(config.demosDir, `.staging-${demo.slug}-${Date.now()}`);
  const trashDir = path.join(config.demosDir, `.trash-${demo.slug}-${Date.now()}`);

  queries.setDemoStatus.run('building', null, demoId);

  try {
    await fsp.mkdir(config.workDir, { recursive: true });
    await fsp.mkdir(config.demosDir, { recursive: true });

    append(`[clone] ${demo.git_url} (branch: ${demo.git_branch}) -> ${workRepo}\n`);
    const cloneCode = await run(
      'git',
      ['clone', '--depth', '1', '--branch', demo.git_branch, demo.git_url, workRepo],
      { cwd: config.workDir },
      append,
    );
    if (cloneCode !== 0) throw new Error(`git clone failed (exit ${cloneCode})`);

    append(`\n[build] ${demo.build_cmd}\n`);
    // Important: do NOT set NODE_ENV=production at this level.
    // npm ci respects it and skips devDependencies — which means tsc, vite,
    // webpack, etc. (the things needed to build) don't get installed.
    // Build tools (vite, webpack) set NODE_ENV=production themselves for the
    // production bundle. We also strip any inherited NODE_ENV so the install
    // gets the full dependency tree.
    const buildEnv = { ...process.env, CI: '1' };
    delete buildEnv.NODE_ENV;
    const buildCode = await runShell(
      demo.build_cmd,
      { cwd: workRepo, env: buildEnv },
      append,
    );
    if (buildCode !== 0) throw new Error(`build failed (exit ${buildCode})`);

    const outputPath = path.join(workRepo, demo.output_dir);
    if (!fs.existsSync(outputPath)) {
      throw new Error(`output dir not found: ${demo.output_dir}`);
    }
    if (!fs.existsSync(path.join(outputPath, 'index.html'))) {
      append(`[warn] no index.html in output dir — SPA may not load correctly\n`);
    }

    append(`\n[publish] -> ${targetDir}\n`);
    await rimraf(stagingDir);
    await fsp.cp(outputPath, stagingDir, { recursive: true });

    if (fs.existsSync(targetDir)) {
      await fsp.rename(targetDir, trashDir);
    }
    await fsp.rename(stagingDir, targetDir);
    await rimraf(trashDir);

    if (!demo.enabled) {
      await fsp.mkdir(config.disabledDir, { recursive: true });
      const disabledPath = path.join(config.disabledDir, demo.slug);
      await rimraf(disabledPath);
      await fsp.rename(targetDir, disabledPath);
      append(`[note] demo is disabled — parked at ${disabledPath}\n`);
    }

    queries.setDemoStatus.run('ready', null, demoId);
    queries.finishBuildLog.run('success', logId);
    append(`\n[done] ✓\n`);
  } catch (err) {
    const msg = err?.message || String(err);
    append(`\n[error] ${msg}\n`);
    queries.setDemoStatus.run('failed', msg, demoId);
    queries.finishBuildLog.run('failed', logId);
  } finally {
    await rimraf(workRepo).catch(() => {});
    await rimraf(stagingDir).catch(() => {});
  }
}
