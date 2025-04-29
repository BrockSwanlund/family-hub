// routes/admin.js
const express      = require('express');
const requireAdmin = require('../middleware/admin');
const db           = require('../db');

const router = express.Router();

// Apply admin guard to every route in this file
router.use(requireAdmin);

// Dashboard home
router.get('/', (req, res) => {
  res.render('admin/dashboard');
});

// List users
router.get('/users', async (req, res) => {
  const conn = await db.getConnection();
  const users = await conn.query('SELECT id, name, email, is_admin FROM users');
  conn.release();
  res.render('admin/users', { users });
});

// Toggle admin flag
router.post('/users/:id/toggle', async (req, res) => {
  const conn = await db.getConnection();
  await conn.query(
    'UPDATE users SET is_admin = 1 - is_admin WHERE id = ?',
    [req.params.id]
  );
  conn.release();
  res.redirect('/admin/users');
});

// List recipes
router.get('/recipes', async (req, res) => {
  const conn    = await db.getConnection();
  const recipes = await conn.query('SELECT id, title, created_at FROM recipes');
  conn.release();
  res.render('admin/recipes', { recipes });
});

// Delete recipe
router.post('/recipes/:id/delete', async (req, res) => {
  const conn = await db.getConnection();
  await conn.query('DELETE FROM recipes WHERE id = ?', [req.params.id]);
  conn.release();
  res.redirect('/admin/recipes');
});

// List events
router.get('/events', async (req, res) => {
  const conn   = await db.getConnection();
  const events = await conn.query('SELECT id, title, event_date FROM events');
  conn.release();
  res.render('admin/events', { events });
});

// Delete event
router.post('/events/:id/delete', async (req, res) => {
  const conn = await db.getConnection();
  await conn.query('DELETE FROM events WHERE id = ?', [req.params.id]);
  conn.release();
  res.redirect('/admin/events');
});

module.exports = router;
