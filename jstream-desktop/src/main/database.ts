import path from 'node:path';
import { app } from 'electron';
import Database from 'better-sqlite3';

// Path to the SQLite database file in the user's app data directory
const dbPath = path.join(app.getPath('userData'), 'jstream.db');
const db = new Database(dbPath);

// Create tables if they don't exist
const createTables = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      preferences TEXT
    );
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      item_id TEXT,
      item_type TEXT,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sort_order INTEGER DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS favorites_user_item ON favorites(user_id, item_id, item_type);
    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      item_id TEXT,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      position REAL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS watch_history_user_item ON watch_history(user_id, item_id);
    CREATE TABLE IF NOT EXISTS personalization (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      key TEXT,
      value TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS personalization_user_key ON personalization(user_id, key);
  `);
  try {
    // Add column if it doesn't exist; this will fail on first run if column exists, so ignore errors
    db.exec(`ALTER TABLE favorites ADD COLUMN sort_order INTEGER DEFAULT 0;`);
  } catch (e) {
    // ignore - column already exists
  }
};

createTables();

// Example: Set and get user preferences
export function setUserPreferences(userId: number, preferences: object) {
  const stmt = db.prepare('UPDATE user SET preferences = ? WHERE id = ?');
  stmt.run(JSON.stringify(preferences), userId);
}

export function getUserPreferences(userId: number) {
  const stmt = db.prepare('SELECT preferences FROM user WHERE id = ?');
  const row = stmt.get(userId);
  return row ? JSON.parse(row.preferences) : null;
}

export default db;
