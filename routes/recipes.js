// routes/recipes.js
const express   = require('express');
const multer    = require('multer');
const path      = require('path');
const fs        = require('fs');
const Tesseract = require('tesseract.js');
const db        = require('../db');

const router = express.Router();

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '..', 'public', 'images', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer setup
const storage = multer.diskStorage({
  destination: uploadDir,
  filename:   (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Alias for old URL (/recipes/upload)
router.get('/upload', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('upload_recipe');
});
router.post(
  '/upload',
  upload.single('image'),
  async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    if (!req.file) return res.status(400).send('No file uploaded');
    const image_url = `/images/uploads/${req.file.filename}`;
    try {
      const { data:{ text } } = await Tesseract.recognize(req.file.path, 'eng');
      const lines        = text.split('\n').map(l => l.trim());
      const title        = lines.shift() || '';
      const bodySections = lines.join('\n').split(/\n\s*\n/);
      const ingredients  = bodySections[0] || '';
      const steps        = bodySections.slice(1).join('\n\n') || '';
      res.render('review_recipe', { image_url, title, ingredients, steps, prep_time: '' });
    } catch (err) {
      console.error('OCR error:', err);
      res.status(500).send('Error processing image');
    }
  }
);

// 1) Choice: manual vs AI
router.get('/new', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('new_recipe_choice');
});

// 2) Manual entry form
router.get('/new/manual', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('new_recipe');
});

// 3) AI upload form
router.get('/new/upload', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('upload_recipe');
});

// 4) Handle upload → OCR → review (alias of /upload above could be removed)
router.post(
  '/new/upload',
  upload.single('image'),
  async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    if (!req.file) return res.status(400).send('No file uploaded');
    const image_url = `/images/uploads/${req.file.filename}`;
    try {
      const { data:{ text } } = await Tesseract.recognize(req.file.path, 'eng');
      const lines        = text.split('\n').map(l => l.trim());
      const title        = lines.shift() || '';
      const bodySections = lines.join('\n').split(/\n\s*\n/);
      const ingredients  = bodySections[0] || '';
      const steps        = bodySections.slice(1).join('\n\n') || '';
      res.render('review_recipe', { image_url, title, ingredients, steps, prep_time: '' });
    } catch (err) {
      console.error('OCR error:', err);
      res.status(500).send('Error processing image');
    }
  }
);

// 5) Save (manual or post‑review)
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const { title, ingredients, steps, prep_time } = req.body;
  const image_url = req.file
    ? `/images/uploads/${req.file.filename}`
    : req.body.image_url || null;

  try {
    const conn   = await db.getConnection();
    const result = await conn.query(
      `INSERT INTO recipes
         (title, ingredients, steps, prep_time, image_url)
       VALUES (?, ?, ?, ?, ?)`,
      [ title, ingredients, steps, prep_time || null, image_url ]
    );
    conn.release();
    // Mariadb driver returns an object with insertId
    res.redirect(`/recipes/${result.insertId}`);
  } catch (err) {
    console.error('Save recipe error:', err);
    res.status(500).send('Error saving recipe');
  }
});

// 6) List all recipes
router.get('/', async (req, res) => {
  try {
    const conn    = await db.getConnection();
    const recipes = await conn.query(
      'SELECT * FROM recipes ORDER BY created_at DESC'
    );
    conn.release();
    res.render('recipes', { recipes });
  } catch (err) {
    console.error('Fetch recipes error:', err);
    res.status(500).send('Error fetching recipes');
  }
});

// 7) View single recipe
router.get('/:id', async (req, res) => {
  try {
    const conn = await db.getConnection();
    const rows = await conn.query(
      'SELECT * FROM recipes WHERE id = ?',
      [req.params.id]
    );
    conn.release();
    if (!rows.length) {
      return res.status(404).render('404', { message: 'Recipe not found' });
    }
    res.render('recipe', { recipe: rows[0] });
  } catch (err) {
    console.error('Fetch recipe error:', err);
    res.status(500).send('Error fetching recipe');
  }
});

// 8) Edit form
router.get('/:id/edit', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const conn = await db.getConnection();
    const rows = await conn.query(
      'SELECT * FROM recipes WHERE id = ?',
      [req.params.id]
    );
    conn.release();
    if (!rows.length) {
      return res.status(404).render('404', { message: 'Recipe not found' });
    }
    res.render('edit_recipe', { recipe: rows[0] });
  } catch (err) {
    console.error('Fetch for edit error:', err);
    res.status(500).send('Error fetching recipe for edit');
  }
});

// 9) Handle update
router.post('/:id/edit', upload.single('image'), async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const { title, ingredients, steps, prep_time } = req.body;
  const image_url = req.file
    ? `/images/uploads/${req.file.filename}`
    : req.body.image_url || null;

  try {
    const conn = await db.getConnection();
    await conn.query(
      `UPDATE recipes SET
         title = ?, ingredients = ?, steps = ?, prep_time = ?, image_url = ?
       WHERE id = ?`,
      [ title, ingredients, steps, prep_time || null, image_url, req.params.id ]
    );
    conn.release();
    res.redirect(`/recipes/${req.params.id}`);
  } catch (err) {
    console.error('Update recipe error:', err);
    res.status(500).send('Error updating recipe');
  }
});

// 10) Delete recipe
router.post('/:id/delete', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const conn = await db.getConnection();
    await conn.query(
      'DELETE FROM recipes WHERE id = ?',
      [req.params.id]
    );
    conn.release();
    res.redirect('/recipes');
  } catch (err) {
    console.error('Delete recipe error:', err);
    res.status(500).send('Error deleting recipe');
  }
});

module.exports = router;
