const express = require('express');
const db = require('../config/db');
const router = express.Router();
const { broadcast } = require('../sockets/index');
const jwt = require('jsonwebtoken');

// Authentication middleware
function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.userId = decoded.id;
    next();
  });
}

// Get events based on user's tier
router.get('/events', authenticate, (req, res) => {
  db.get('SELECT tier FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) return res.status(404).json({ error: 'User not found' });
    db.all('SELECT * FROM events WHERE tier = ? AND stock > 0 AND endDate > ?', [user.tier, new Date().toISOString()], (err, events) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(events);
    });
  });
});

// Participate in event (competitive purchase)
router.post('/event/participate', authenticate, async (req, res) => {
  const { eventId } = req.body;
  try {
    // Check event availability
    const event = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM events WHERE id = ? AND stock > 0', [eventId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (!event) return res.status(404).json({ error: 'Event not found or sold out' });

    // Check user tier
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT tier FROM users WHERE id = ?', [req.userId], (err, row) => {
        if (err) reject(err);
        resolve(row);
      });
    });
    if (!user || user.tier !== event.tier) return res.status(403).json({ error: 'Tier mismatch' });

    // Update event stock and create purchase record
    await new Promise((resolve, reject) => {
      db.run('UPDATE events SET stock = stock - 1 WHERE id = ? AND stock > 0', [eventId], function (err) {
        if (err) reject(err);
        if (this.changes === 0) reject(new Error('Stock already depleted'));
        resolve();
      });
    });

    const participationPoints = 50; // Points for participation
    await new Promise((resolve, reject) => {
      db.run('UPDATE users SET points = points + ? WHERE id = ?', [participationPoints, req.userId], (err) => {
        if (err) reject(err);
        resolve();
      });
    });

    // Optionally, update points and tier
    require('../server').updatePointsAndTier(req.userId, 0);

    // Broadcast the event update to clients
    broadcast({ type: 'event_update', eventId, stock: event.stock - 1 });

    res.json({ success: true, message: `You snagged ${event.name}!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual event creation (with broadcasting)
router.post('/event/create', authenticate, (req, res) => {
  const { name, tier, startDate, endDate, stock } = req.body;
  db.run(
    'INSERT INTO events (name, tier, startDate, endDate, stock) VALUES (?, ?, ?, ?, ?)',
    [name, tier, startDate, endDate, stock],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      broadcast({ type: 'new_event', event: { id: this.lastID, name, tier, startDate, endDate, stock } });
      res.json({ success: true, eventId: this.lastID });
    }
  );
});

// Get upcoming events (general view)
router.get('/events/upcoming', (req, res) => {
  db.all('SELECT * FROM events WHERE endDate > ? ORDER BY startDate ASC', [new Date().toISOString()], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get event by ID (details)
router.get('/event/:id', (req, res) => {
  const { id } = req.params;
  db.get('SELECT * FROM events WHERE id = ?', [id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Event not found' });
    res.json(row);
  });
});

module.exports = router;
