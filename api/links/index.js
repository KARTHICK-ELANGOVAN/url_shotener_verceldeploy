const db = require('../../src/db');
const { makeCode, isValidUrl } = require('../../src/utils');

module.exports = async (req, res) => {
  await db.init();
  if (req.method === 'GET') {
    const rows = await db.getAll();
    return res.status(200).json(rows);
  }

  if (req.method === 'POST') {
    const { url, customCode } = req.body || {};
    if (!url || !isValidUrl(url)) return res.status(400).json({ error: 'Invalid URL' });

    let code = customCode && String(customCode).trim();
    if (code) {
      if (!/^[0-9a-zA-Z_-]{3,64}$/.test(code)) return res.status(400).json({ error: 'Invalid custom code' });
      const exists = await db.get(code);
      if (exists) return res.status(409).json({ error: 'Code already exists' });
    } else {
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

    // Construct absolute shortUrl using host header if available
    const host = req.headers && req.headers.host ? req.headers.host : 'vercel.app';
    const proto = req.headers && req.headers['x-forwarded-proto'] ? req.headers['x-forwarded-proto'] : 'https';
    return res.status(201).json({ code, shortUrl: `${proto}://${host}/${code}`, secret });
  }

  res.setHeader('Allow', 'GET,POST');
  res.status(405).end();
};
