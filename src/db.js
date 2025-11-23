const { Pool } = require('pg');
const storage = require('node-persist');
const path = require('path');

// Use DATABASE_URL or NEON_DATABASE_URL
const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

// If a connection string is not provided, fall back to a local file-backed store.
const usePg = Boolean(connectionString);

if (!usePg) {
  console.warn('No DATABASE_URL/NEON_DATABASE_URL found — using local file-backed storage (node-persist)');
}

// --- Postgres-backed implementation ---
let pool;
if (usePg) {
  const globalAny = global;
  globalAny.__pgPool = globalAny.__pgPool || new Pool({ connectionString, max: 10, ssl: { rejectUnauthorized: false } });
  pool = globalAny.__pgPool;
}

async function init() {
  if (usePg) {
    // create table if not exists - store created_at as BIGINT (ms since epoch) for compatibility
    await pool.query(`
      CREATE TABLE IF NOT EXISTS links (
        code TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        secret TEXT NOT NULL,
        clicks INTEGER NOT NULL DEFAULT 0,
        created_at BIGINT NOT NULL,
        expires_at BIGINT
      );
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_links_created_at ON links(created_at DESC);`);
    return;
  }

  // Fallback: file-backed
  await storage.init({ dir: path.join(__dirname, '..', 'data'), stringify: JSON.stringify, parse: JSON.parse });
  const existing = await storage.getItem('links');
  if (!existing) await storage.setItem('links', {});
}

async function getAll() {
  if (usePg) {
    const res = await pool.query(`SELECT * FROM links ORDER BY created_at DESC LIMIT 100`);
    return res.rows;
  }
  const m = await storage.getItem('links') || {};
  return Object.values(m).sort((a,b)=>b.created_at - a.created_at).slice(0,100);
}

async function get(code) {
  if (usePg) {
    const res = await pool.query(`SELECT * FROM links WHERE code = $1`, [code]);
    return res.rows[0] || null;
  }
  const m = await storage.getItem('links') || {};
  return m[code] || null;
}

async function create(link) {
  if (usePg) {
    const { code, url, secret, created_at, clicks = 0, expires_at = null } = link;
    const res = await pool.query(
      `INSERT INTO links(code, url, secret, clicks, created_at, expires_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [code, url, secret, clicks, created_at, expires_at]
    );
    return res.rows[0];
  }
  const m = await storage.getItem('links') || {};
  m[link.code] = link;
  await storage.setItem('links', m);
  return link;
}

async function remove(code) {
  if (usePg) {
    const res = await pool.query(`DELETE FROM links WHERE code = $1 RETURNING code`, [code]);
    return (res.rowCount || 0) > 0;
  }
  const m = await storage.getItem('links') || {};
  if (m[code]) { delete m[code]; await storage.setItem('links', m); return true; }
  return false;
}

async function incrementClicks(code) {
  if (usePg) {
    const res = await pool.query(`UPDATE links SET clicks = clicks + 1 WHERE code = $1 RETURNING clicks`, [code]);
    return res.rows[0] ? res.rows[0].clicks : null;
  }
  const m = await storage.getItem('links') || {};
  if (m[code]) { m[code].clicks = (m[code].clicks||0) + 1; await storage.setItem('links', m); return m[code].clicks; }
  return null;
}

async function close() {
  if (usePg && pool) {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

module.exports = { init, getAll, get, create, remove, incrementClicks, close };
