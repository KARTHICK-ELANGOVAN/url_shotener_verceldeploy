const db = require('../src/db');

module.exports = async (req, res) => {
  try {
    await db.init();
    res.status(200).json({ status: 'ok' });
  } catch (e) {
    res.status(500).json({ error: 'db error' });
  }
};
