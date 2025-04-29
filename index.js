// index.js
const express     = require('express');
const path        = require('path');
const session     = require('express-session');
const bcrypt      = require('bcrypt');
require('dotenv').config();

const db            = require('./db');
const recipeRoutes  = require('./routes/recipes');
const eventRoutes   = require('./routes/events');
const adminRoutes   = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'SuperSecretFamilyHubKey',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }  // 1 day
}));
app.use(async (req, res, next) => {
  if (req.session.userId) {
    const conn = await db.getConnection();
    const [user] = await conn.query(
      'SELECT theme, primary_color, secondary_color, font_family FROM users WHERE id = ?',
      [req.session.userId]
    );
    conn.release();
    res.locals.settings = user || {};
  } else {
    res.locals.settings = {
      theme: 'light',
      primary_color: '#2e4a2f',
      secondary_color: '#7d5ba6',
      font_family: 'Cinzel, serif'
    };
  }
  next();
});
// Expose session to views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// View engine & static files
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Feature routes ───────────────────────────────────────────────────────────
app.use('/recipes', recipeRoutes);
app.use('/events',  eventRoutes);
app.use('/admin',   adminRoutes);

// ─── Root & Auth ──────────────────────────────────────────────────────────────
// Home page or DB test
app.get('/', async (req, res) => {
  try {
    const conn = await db.getConnection();
    const [row] = await conn.query('SELECT NOW() AS now');
    conn.release();
    res.render('home', { now: row.now });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error connecting to DB');
  }
});

// Signup
app.get('/signup', (req, res) => {
  res.render('signup');
});
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const conn = await db.getConnection();
    await conn.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hash]
    );
    conn.release();
    // auto-login
    const conn2 = await db.getConnection();
    const [user] = await conn2.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );
    conn2.release();
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error signing up');
  }
});

// Login
app.get('/login', (req, res) => {
  res.render('login');
});
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const conn = await db.getConnection();
    const rows = await conn.query(
      'SELECT id, password FROM users WHERE email = ?',
      [email]
    );
    conn.release();
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password))) {
      return res.status(400).send('Invalid email or password');
    }
    req.session.userId = rows[0].id;
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error logging in');
  }
});

// Dashboard
app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const conn = await db.getConnection();
    const [user] = await conn.query(
      'SELECT id, name FROM users WHERE id = ?',
      [req.session.userId]
    );
    conn.release();
    if (!user) {
      req.session.destroy();
      return res.redirect('/login');
    }
    res.render('dashboard', { id: user.id, name: user.name });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error loading dashboard');
  }
});

// ─── Logout (must come before the 404 fallback!) ─────────────────────────────
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).send('Error logging out');
    }
    res.redirect('/login');
  });
});
// ─── 404 Fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404');
});

// ─── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running:
  • Local:    http://localhost:${PORT}
  • External: http://98.213.155.147:${PORT}`);
});
