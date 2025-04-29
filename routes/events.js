// routes/events.js
const express   = require('express');
const path      = require('path');
const fs        = require('fs');
const multer    = require('multer');
const Tesseract = require('tesseract.js');
const db        = require('../db');

const router = express.Router();

// ─── Ensure uploads dir exists ─────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'public', 'images', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Multer setup ─────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: uploadDir,
  filename:   (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// ─── Photo‑Upload → OCR → Auto‑Save ────────────────────────────────────────────

// Show schedule‑photo upload form
router.get('/upload', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('upload_event');
});

// Handle photo upload + OCR parsing & auto‑save
router.post(
  '/upload',
  upload.single('image'),
  async (req, res) => {
    if (!req.session.userId) return res.redirect('/login');
    if (!req.file) return res.status(400).send('No file uploaded');

    const filePath = req.file.path;
    const imageUrl = `/images/uploads/${req.file.filename}`;

    try {
      // 1) OCR the image
      const { data: { text } } = await Tesseract.recognize(filePath, 'eng');
      // 2) Split into lines, filter non‑empty
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      // 3) Keep only lines with a time stamp
      const eventLines = lines.filter(l =>
        /\b\d{1,2}:\d{2}\s*(?:AM|PM)?\b/i.test(l)
      );
      // 4) Parse each into { title, event_time, ... }
      const parsedEvents = eventLines.map(line => {
        const tm = line.match(/\b(\d{1,2}:\d{2}\s*(?:AM|PM)?)\b/i);
        const event_time = tm ? tm[1] : '';
        const title = tm
          ? line.replace(tm[0], '').trim().replace(/^[-–—]\s*/, '')
          : line;
        return {
          title,
          event_date:  null,
          event_time,
          location:    null,
          description: null,
          image_url:   imageUrl
        };
      });

      // 5) Batch‑save into the DB
      const conn = await db.getConnection();
      for (const ev of parsedEvents) {
        await conn.query(
          `INSERT INTO events
             (title, event_date, event_time, location, description, image_url)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            ev.title,
            ev.event_date,
            ev.event_time,
            ev.location,
            ev.description,
            ev.image_url
          ]
        );
      }
      conn.release();

      // 6) Redirect to events list
      res.redirect('/events');
    } catch (err) {
      console.error('❌ OCR & save error:', err);
      res.status(500).send('Error processing and saving events');
    }
  }
);

// ─── Manual Add & Save ─────────────────────────────────────────────────────────

// Show manual “Add Event” form
router.get('/new', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  res.render('new_event', {
    image_url:   '',
    title:       '',
    event_date:  '',
    event_time:  '',
    location:    '',
    description: ''
  });
});

// Save single event (manual entry)
router.post('/', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const { title, event_date, event_time, location, description, image_url } = req.body;
  try {
    const conn = await db.getConnection();
    await conn.query(
      `INSERT INTO events
         (title, event_date, event_time, location, description, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ title, event_date || null, event_time || null, location || null, description || null, image_url || null ]
    );
    conn.release();
    res.redirect('/events');
  } catch (err) {
    console.error('❌ Save event error:', err);
    res.status(500).send('Error saving event');
  }
});

// ─── List, View, Edit & Delete ─────────────────────────────────────────────────

// List all events
router.get('/', async (req, res) => {
  try {
    const conn   = await db.getConnection();
    const events = await conn.query('SELECT * FROM events ORDER BY event_date, event_time');
    conn.release();
    res.render('events', { events });
  } catch (err) {
    console.error('❌ Fetch events error:', err);
    res.status(500).send('Error fetching events');
  }
});

// View single event
router.get('/:id', async (req, res) => {
  try {
    const conn = await db.getConnection();
    const [ev] = await conn.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    conn.release();
    if (!ev) return res.status(404).send('Event not found');
    res.render('event', { event: ev });
  } catch (err) {
    console.error('❌ Fetch event error:', err);
    res.status(500).send('Error fetching event');
  }
});

// Show edit form
router.get('/:id/edit', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const conn = await db.getConnection();
    const [ev] = await conn.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
    conn.release();
    if (!ev) return res.status(404).send('Event not found');
    res.render('edit_event', { event: ev });
  } catch (err) {
    console.error('❌ Fetch event for edit error:', err);
    res.status(500).send('Error fetching event for edit');
  }
});

// Handle update
router.post('/:id/edit', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const { title, event_date, event_time, location, description, image_url } = req.body;
  try {
    const conn = await db.getConnection();
    await conn.query(
      `UPDATE events SET
         title = ?, event_date = ?, event_time = ?, location = ?, description = ?, image_url = ?
       WHERE id = ?`,
      [ title, event_date || null, event_time || null, location || null, description || null, image_url || null, req.params.id ]
    );
    conn.release();
    res.redirect(`/events/${req.params.id}`);
  } catch (err) {
    console.error('❌ Update event error:', err);
    res.status(500).send('Error updating event');
  }
});

// Handle delete
router.post('/:id/delete', async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const conn = await db.getConnection();
    await conn.query('DELETE FROM events WHERE id = ?', [req.params.id]);
    conn.release();
    res.redirect('/events');
  } catch (err) {
    console.error('❌ Delete event error:', err);
    res.status(500).send('Error deleting event');
  }
});

module.exports = router;
