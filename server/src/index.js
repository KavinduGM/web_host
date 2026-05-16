import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import './db.js';
import authRoutes from './routes/auth.js';
import demoRoutes from './routes/demos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/demos', demoRoutes);

const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use('/admin', express.static(clientDist));
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  app.get('/', (req, res) => res.redirect('/admin'));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal error' });
});

app.listen(config.port, '127.0.0.1', () => {
  console.log(`web-host-tool listening on http://127.0.0.1:${config.port}`);
  console.log(`demos dir:    ${config.demosDir}`);
  console.log(`disabled dir: ${config.disabledDir}`);
  console.log(`work dir:     ${config.workDir}`);
  console.log(`db:           ${config.dbPath}`);
});
