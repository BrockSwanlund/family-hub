// middleware/admin.js
const db = require('../db');

module.exports = async function requireAdmin(req, res, next) {
  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.redirect('/login');
    }
    // Grab the is_admin field
    const conn = await db.getConnection();
    const rows = await conn.query(
      'SELECT is_admin FROM users WHERE id = ?',
      [userId]
    );
    conn.release();

    if (rows.length === 0 || !rows[0].is_admin) {
      return res.status(403).send('🚫 Access denied: admins only');
    }

    // All good—proceed
    next();
  } catch (err) {
    console.error('Admin check failed:', err);
    res.status(500).send('Server error during admin check');
  }
};
