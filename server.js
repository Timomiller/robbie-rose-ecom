const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const db = require('./server/config/db');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// HTTPS redirect in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// Middleware for JSON parsing
app.use(express.json());

// Serving static files from the client folder
app.use(express.static(path.join(__dirname, 'client')));  // Adjusted for current directory structure

// Define Routes
app.use('/auth', require('./routes/auth'));
app.use('/shop', require('./routes/shop'));

// WebSocket Server Setup
wss.on('connection', (ws) => {
  console.log('Client connected');
  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'purchase') {
      const { userId, amount } = data;
      updatePointsAndTier(userId, amount);
      broadcast({ type: 'leaderboard_update' });
    } else if (data.type === 'event_participation') {
      broadcast({ type: 'event_update', eventId: data.eventId });
    }
  });
});

// Helper Function: Update points and tier
function updatePointsAndTier(userId, amount) {
  const points = Math.floor(amount * 0.8);
  db.run('UPDATE users SET points = points + ? WHERE id = ?', [points, userId], (err) => {
    if (err) console.error(err);
    db.get('SELECT points FROM users WHERE id = ?', [userId], (err, row) => {
      if (err) return console.error(err);
      let tier = 'Solace';
      if (row.points >= 7000) tier = 'Lovers';
      if (row.points >= 15000) tier = 'Loyal';
      if (row.points >= 40000) tier = 'Servitude';
      if (row.points >= 120000) tier = 'Echelon';
      db.run('UPDATE users SET tier = ? WHERE id = ?', [tier, userId], (err) => {
        if (err) console.error(err);
      });
    });
  });
}

// Helper Function: Broadcast messages to all clients
function broadcast(data) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
      if (data.type !== 'leaderboard_update') {
        db.run('INSERT INTO notifications (userId, message, date) VALUES (?, ?, ?)', 
          [client.userId || 0, data.message || `${data.type} occurred`, new Date().toISOString()],
          (err) => { if (err) console.error(err); });
      }
    }
  });
}

// Authentication Middleware
function authenticate(req, res, next) {
  // Placeholder: Add JWT or session logic here
  req.userId = 1; // Temp userId for testing, replace with JWT logic
  next();
}

// Routes
app.get('/leaderboard', (req, res) => {
  db.all('SELECT username, points, tier, profilePic FROM users ORDER BY points DESC LIMIT 10', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/notifications', authenticate, (req, res) => {
  db.all('SELECT message, date FROM notifications WHERE userId = ? ORDER BY date DESC LIMIT 5', [req.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Database Table Setup (for Notifications)
db.run(`
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    message TEXT,
    date TEXT,
    FOREIGN KEY (userId) REFERENCES users(id)
  )
`);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
