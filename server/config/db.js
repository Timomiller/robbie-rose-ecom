const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) console.error(err);
  console.log('Connected to SQLite');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      email TEXT UNIQUE,
      password TEXT,
      points INTEGER DEFAULT 0,
      tier TEXT DEFAULT 'Solace',
      profilePic TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      amount REAL,
      date TEXT,
      eventId INTEGER,
      FOREIGN KEY (userId) REFERENCES users(id),
      FOREIGN KEY (eventId) REFERENCES events(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      tier TEXT,
      startDate TEXT,
      endDate TEXT,
      stock INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER,
      message TEXT,
      date TEXT,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);
});

module.exports = db;