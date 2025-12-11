import { app, BrowserWindow, ipcMain } from 'electron';
import './main/database'; // Initialize SQLite DB
import path from 'node:path';
import started from 'electron-squirrel-startup';
import db from './main/database';

// IPC handlers for database
ipcMain.handle('set-personalization', async (event, key: string, value: string) => {
  const stmt = db.prepare('INSERT OR REPLACE INTO personalization (user_id, key, value) VALUES (1, ?, ?)');
  stmt.run(key, value);
});

ipcMain.handle('get-personalization', async (event, key: string) => {
  const stmt = db.prepare('SELECT value FROM personalization WHERE user_id = 1 AND key = ?');
  const row = stmt.get(key);
  return row ? row.value : null;
});

// Favorites handlers
ipcMain.handle('favorites-add', async (event, itemId: string, itemType: string) => {
  // Insert favorite and place it at end by default
  try {
    const maxRow = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS maxOrder FROM favorites WHERE user_id = 1').get();
    const nextOrder = (maxRow && maxRow.maxOrder) ? (Number(maxRow.maxOrder) + 1) : 1;
    const stmt = db.prepare('INSERT OR IGNORE INTO favorites (user_id, item_id, item_type, added_at, sort_order) VALUES (1, ?, ?, CURRENT_TIMESTAMP, ?)');
    stmt.run(itemId, itemType, nextOrder);
  } catch (e) {
    console.error('favorites-add error', e);
  }
  return true;
});

ipcMain.handle('favorites-remove', async (event, itemId: string, itemType: string) => {
  const stmt = db.prepare('DELETE FROM favorites WHERE user_id = 1 AND item_id = ? AND item_type = ?');
  stmt.run(itemId, itemType);
  return true;
});

ipcMain.handle('favorites-list', async (event) => {
  const stmt = db.prepare('SELECT id, item_id, item_type, sort_order FROM favorites WHERE user_id = 1 ORDER BY sort_order ASC');
  const rows = stmt.all();
  return rows;
});

ipcMain.handle('favorites-is', async (event, itemId: string, itemType: string) => {
  const stmt = db.prepare('SELECT 1 FROM favorites WHERE user_id = 1 AND item_id = ? AND item_type = ?');
  const row = stmt.get(itemId, itemType);
  return !!row;
});

ipcMain.handle('favorites-swap', async (event, idA: number, idB: number) => {
  // swap sort_order between two favorites identified by id
  const a = db.prepare('SELECT id, sort_order FROM favorites WHERE id = ?').get(idA);
  const b = db.prepare('SELECT id, sort_order FROM favorites WHERE id = ?').get(idB);
  if (!a || !b) return false;
  const update = db.prepare('UPDATE favorites SET sort_order = ? WHERE id = ?');
  const t = db.transaction(() => {
    update.run(b.sort_order, a.id);
    update.run(a.sort_order, b.id);
  });
  t();
  return true;
});

ipcMain.handle('favorites-set-order', async (event, id: number, order: number) => {
  const stmt = db.prepare('UPDATE favorites SET sort_order = ? WHERE id = ?');
  stmt.run(order, id);
  return true;
});

// Watch history handlers
ipcMain.handle('watch-history-set', async (event, itemId: string, position: number) => {
  const insert = db.prepare('INSERT INTO watch_history (user_id, item_id, watched_at, position) VALUES (1, ?, CURRENT_TIMESTAMP, ?)');
  const update = db.prepare('UPDATE watch_history SET position = ?, watched_at = CURRENT_TIMESTAMP WHERE user_id = 1 AND item_id = ?');
  const exists = db.prepare('SELECT 1 FROM watch_history WHERE user_id = 1 AND item_id = ?').get(itemId);
  if (exists) {
    update.run(position, itemId);
  } else {
    insert.run(itemId, position);
  }
  return true;
});

ipcMain.handle('watch-history-get', async (event, itemId: string) => {
  const stmt = db.prepare('SELECT position, watched_at FROM watch_history WHERE user_id = 1 AND item_id = ?');
  const row = stmt.get(itemId);
  return row || null;
});

ipcMain.handle('watch-history-list', async (event) => {
  const stmt = db.prepare('SELECT item_id, position, watched_at FROM watch_history WHERE user_id = 1 ORDER BY watched_at DESC');
  return stmt.all();
});

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
