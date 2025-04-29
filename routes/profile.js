// routes/profile.js
const express = require('express');
const db      = require('../db');
const router  = express.Router();

router.get('/', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('profile', { settings: res.locals.settings });
});

router.post('/', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const { theme, primary_color, secondary_color, font_family } = req.body;
  const conn = await db.getConnection();
  await conn.query(
    `UPDATE users
       SET theme=?, primary_color=?, secondary_color=?, font_family=?
     WHERE id=?`,
    [theme, primary_color, secondary_color, font_family, req.session.userId]
  );
  conn.release();
  res.redirect('/profile');
});

module.exports = router;
