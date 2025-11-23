const db = require('../src/db');

module.exports = async (req, res) => {
  await db.init();
  const { code } = req.query || {};
  if (!code) return res.status(400).send('Not found');
  const row = await db.get(code);
  if (!row) return res.status(404).send('Not found');
  await db.incrementClicks(code);
  // Redirect
  res.writeHead(302, { Location: row.url });
  res.end();
};
