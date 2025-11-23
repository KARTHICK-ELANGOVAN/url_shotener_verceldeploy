require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');

const db = require('./db');
const { makeCode, isValidUrl } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Create short link
app.post('/api/links', async (req, res) => {
  const { url, customCode } = req.body || {};
  if (!url || !isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL' });

  let code = customCode && String(customCode).trim();
  if (code) {
    if (!/^[0-9a-zA-Z_-]{3,64}$/.test(code)) return res.status(400).json({ error: 'Invalid custom code' });
    const exists = await db.get(code);
    if (exists) return res.status(409).json({ error: 'Code already exists' });
  } else {
    // generate unique
    for (let i = 0; i < 5; i++) {
      code = makeCode();
      const exists = await db.get(code);
      if (!exists) break;
      code = null;
    }
    if (!code) return res.status(500).json({ error: 'Failed to generate code' });
  }

  const now = Date.now();
  const secret = Math.random().toString(36).slice(2, 10);
  await db.create({ code, url, created_at: now, clicks: 0, secret });

  res.status(201).json({ code, shortUrl: `${req.protocol}://${req.get('host')}/${code}`, secret });
});

// Get link info
app.get('/api/links/:code', async (req, res) => {
  const { code } = req.params;
  const row = await db.get(code);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { secret, ...publicRow } = row;
  res.json(publicRow);
});

// List links (basic)
app.get('/api/links', async (req, res) => {
  const rows = await db.getAll();
  res.json(rows);
});

// Delete link (requires secret)
app.delete('/api/links/:code', async (req, res) => {
  const { code } = req.params;
  const { secret } = req.body || {};
  if (!secret) return res.status(400).json({ error: 'Secret required' });
  const row = await db.get(code);
  if (!row) return res.status(404).json({ error: 'Not found' });
  if (row.secret !== secret) return res.status(403).json({ error: 'Forbidden' });
  await db.remove(code);
  res.json({ ok: true });
});

// Redirect
app.get('/:code', async (req, res) => {
  const { code } = req.params;
  const row = await db.get(code);
  if (!row) return res.status(404).send('Not found');
  await db.incrementClicks(code);
  res.redirect(row.url);
});

// Controlled shutdown endpoint (enabled when ALLOW_SHUTDOWN=1)
app.post('/__shutdown', async (req, res) => {
  if (process.env.ALLOW_SHUTDOWN !== '1') return res.status(403).json({ error: 'disabled' });
  res.json({ ok: true });
  try { await stop(); } catch (e) { /* ignore */ }
});

let server;
async function start(port = PORT) {
  await db.init();
  return new Promise((resolve, reject) => {
    server = app.listen(port, () => {
      console.log(`TinyLink running on http://localhost:${port}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

async function stop() {
  if (!server) return;
  return new Promise((resolve, reject) => {
    server.close(async err => {
      if (err) return reject(err);
      try {
        if (db && typeof db.close === 'function') await db.close();
      } catch (e) {
        // ignore
      }
      resolve();
    });
  });
}

if (require.main === module) {
  start().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { app, start, stop };
