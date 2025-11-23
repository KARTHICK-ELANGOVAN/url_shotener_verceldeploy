const db = require('../../src/db');

module.exports = async (req, res) => {
  await db.init();
  const { code } = req.query || {};
  if (!code) return res.status(400).json({ error: 'code required' });

  if (req.method === 'GET') {
    const row = await db.get(code);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const { secret, ...publicRow } = row;
    return res.status(200).json(publicRow);
  }

  if (req.method === 'DELETE') {
    const { secret } = req.body || {};
    if (!secret) return res.status(400).json({ error: 'Secret required' });
    const row = await db.get(code);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (row.secret !== secret) return res.status(403).json({ error: 'Forbidden' });
    await db.remove(code);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET,DELETE');
  res.status(405).end();
};
