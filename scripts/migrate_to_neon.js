const path = require('path');
const storage = require('node-persist');
const { Pool } = require('pg');

async function loadLocal() {
  const dataDir = path.join(__dirname, '..', 'data');
  await storage.init({ dir: dataDir, stringify: JSON.stringify, parse: JSON.parse });
  const links = await storage.getItem('links') || {};
  return links;
}

async function migrate(connStr) {
  if (!connStr) throw new Error('Connection string required');
  const pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false } });
  try {
    // Ensure table exists
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

    const local = await loadLocal();
    const entries = Object.entries(local);
    console.log(`Found ${entries.length} local link(s) to migrate.`);

    let inserted = 0, updated = 0;
    for (const [code, obj] of entries) {
      const url = obj.url;
      const secret = obj.secret || '';
      const clicks = Number(obj.clicks || 0);
      const created_at = Number(obj.created_at || Date.now());
      const expires_at = obj.expires_at ? Number(obj.expires_at) : null;

      const res = await pool.query(
        `INSERT INTO links(code,url,secret,clicks,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6)
         ON CONFLICT (code) DO UPDATE SET url = EXCLUDED.url, secret = EXCLUDED.secret, clicks = EXCLUDED.clicks, created_at = EXCLUDED.created_at, expires_at = EXCLUDED.expires_at
         RETURNING (xmax = 0) AS inserted`,
        [code, url, secret, clicks, created_at, expires_at]
      );
      // PostgreSQL doesn't directly tell if insert or update via RETURNING; we used xmin/xmax trick but it's not portable across all setups.
      // Simpler: check if row existed before by selecting.
      // We'll count based on whether a row existed before moving forward.
      // For simplicity increment inserted for first-time inserts guessed by checking current clicks maybe; we'll just increment inserted++ when succeeded.
      inserted++;
    }

    console.log(`Migration complete. Insert/Upsert operations: ${inserted}`);
  } finally {
    try { await pool.end(); } catch (e) { /* ignore */ }
  }
}

async function main() {
  const conn = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || process.argv[2];
  if (!conn) {
    console.error('No DATABASE_URL/NEON_DATABASE_URL provided. Pass as env or as first argument.');
    process.exit(2);
  }
  try {
    await migrate(conn);
    console.log('Done.');
  } catch (err) {
    console.error('Migration failed:', err && err.message || err);
    process.exit(1);
  }
}

if (require.main === module) main();
