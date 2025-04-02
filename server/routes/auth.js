const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const router = express.Router();

router.post('/register', (req, res) => {
  const { username, email, password } = req.body;
  db.run(
    'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    [username, email, password],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      const token = jwt.sign({ id: this.lastID }, process.env.JWT_SECRET, { expiresIn: '30d' });
      res.json({ token, user: { id: this.lastID, username, tier: 'Solace', points: 0 } });
    }
  );
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, user) => {
    if (err || !user) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, tier: user.tier, points: user.points } });
  });
});

router.get('/profile', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    db.get('SELECT id, username, tier, points, profilePic FROM users WHERE id = ?', [decoded.id], (err, user) => {
      if (err || !user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    });
  });
});

module.exports = router;