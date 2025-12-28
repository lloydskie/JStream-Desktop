import path from 'node:path';
import { app } from 'electron';
import fs from 'node:fs';

// Path to the JSON database file in the user's app data directory
const dbPath = path.join(app.getPath('userData'), 'jstream.json');

// Load database from file
let db: any = {};
try {
  const data = fs.readFileSync(dbPath, 'utf8');
  db = JSON.parse(data);
} catch (e) {
  // File doesn't exist or invalid, start with empty
  db = { user: [], favorites: [], watch_history: [], personalization: [] };
}

// Save database to file
function saveDb() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

// Create tables if they don't exist (initialize arrays)
const createTables = () => {
  if (!db.user) db.user = [];
  if (!db.favorites) db.favorites = [];
  if (!db.watch_history) db.watch_history = [];
  if (!db.personalization) db.personalization = [];
  saveDb();
};

createTables();

// Example: Set and get user preferences
export function setUserPreferences(userId: number, preferences: object) {
  let user = db.user.find((u: any) => u.id === userId);
  if (!user) {
    user = { id: userId, preferences: JSON.stringify(preferences) };
    db.user.push(user);
  } else {
    user.preferences = JSON.stringify(preferences);
  }
  saveDb();
}

export function getUserPreferences(userId: number) {
  const user = db.user.find((u: any) => u.id === userId);
  if (user && user.preferences) {
    return JSON.parse(user.preferences);
  }
  return null;
}

// Add more functions as needed for favorites, etc.
// For now, keep the interface similar

// Simple prepare implementation for the used SQLs
db.prepare = (sql: string) => {
  if (sql.includes('INSERT OR REPLACE INTO personalization')) {
    return {
      run: (key: string, value: string) => {
        let p = db.personalization.find((p: any) => p.user_id === 1 && p.key === key);
        if (!p) {
          p = { user_id: 1, key, value };
          db.personalization.push(p);
        } else {
          p.value = value;
        }
        saveDb();
      }
    };
  }
  if (sql.includes('SELECT value FROM personalization')) {
    return {
      get: (key: string) => {
        const p = db.personalization.find((p: any) => p.user_id === 1 && p.key === key);
        return p ? { value: p.value } : null;
      }
    };
  }
  if (sql.includes('INSERT OR IGNORE INTO favorites')) {
    return {
      run: (itemId: string, itemType: string, sortOrder: number) => {
        const exists = db.favorites.find((f: any) => f.user_id === 1 && f.item_id === itemId && f.item_type === itemType);
        if (!exists) {
          db.favorites.push({
            id: Date.now(), // simple id
            user_id: 1,
            item_id: itemId,
            item_type: itemType,
            added_at: new Date().toISOString(),
            sort_order: sortOrder
          });
          saveDb();
        }
      }
    };
  }
  if (sql.includes('DELETE FROM favorites')) {
    return {
      run: (itemId: string, itemType: string) => {
        db.favorites = db.favorites.filter((f: any) => !(f.user_id === 1 && f.item_id === itemId && f.item_type === itemType));
        saveDb();
      }
    };
  }
  if (sql.includes('SELECT id, item_id, item_type, sort_order FROM favorites')) {
    return {
      all: () => {
        return db.favorites.filter((f: any) => f.user_id === 1).sort((a: any, b: any) => a.sort_order - b.sort_order);
      }
    };
  }
  if (sql.includes('SELECT 1 FROM favorites')) {
    return {
      get: (itemId: string, itemType: string) => {
        const f = db.favorites.find((f: any) => f.user_id === 1 && f.item_id === itemId && f.item_type === itemType);
        return f ? { 1: 1 } : null;
      }
    };
  }
  if (sql.includes('SELECT id, sort_order FROM favorites WHERE id = ?')) {
    return {
      get: (id: number) => {
        return db.favorites.find((f: any) => f.id === id);
      }
    };
  }
  if (sql.includes('UPDATE favorites SET sort_order')) {
    return {
      run: (order: number, id: number) => {
        const f = db.favorites.find((f: any) => f.id === id);
        if (f) {
          f.sort_order = order;
          saveDb();
        }
      }
    };
  }
  if (sql.includes('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM favorites')) {
    return {
      get: () => {
        const max = db.favorites.filter((f: any) => f.user_id === 1).reduce((m: number, f: any) => Math.max(m, f.sort_order || 0), 0);
        return { maxOrder: max };
      }
    };
  }
  if (sql.includes('INSERT INTO watch_history')) {
    return {
      run: (itemId: string, position: number) => {
        db.watch_history.push({
          id: Date.now(),
          user_id: 1,
          item_id: itemId,
          watched_at: new Date().toISOString(),
          position
        });
        saveDb();
      }
    };
  }
  if (sql.includes('UPDATE watch_history SET position')) {
    return {
      run: (position: number, itemId: string) => {
        const w = db.watch_history.find((w: any) => w.user_id === 1 && w.item_id === itemId);
        if (w) {
          w.position = position;
          w.watched_at = new Date().toISOString();
          saveDb();
        }
      }
    };
  }
  if (sql.includes('SELECT 1 FROM watch_history')) {
    return {
      get: (itemId: string) => {
        const w = db.watch_history.find((w: any) => w.user_id === 1 && w.item_id === itemId);
        return w ? { 1: 1 } : null;
      }
    };
  }
  if (sql.includes('SELECT position, watched_at FROM watch_history')) {
    return {
      get: (itemId: string) => {
        const w = db.watch_history.find((w: any) => w.user_id === 1 && w.item_id === itemId);
        return w ? { position: w.position, watched_at: w.watched_at } : null;
      }
    };
  }
  // Default
  return {
    run: () => {},
    get: () => null,
    all: () => []
  };
};

// Placeholder for db object
export default db;
