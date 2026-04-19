// Expose absolute path to webview preload script
import fs from 'fs';

ipcMain.handle('get-webview-preload-path', async () => {
  // Try to resolve the absolute path to webview-preload.js in public or src
  const publicPath = path.join(app.getAppPath(), 'public', 'webview-preload.js');
  const srcPath = path.join(app.getAppPath(), 'src', 'webview-preload.js');
  if (fs.existsSync(publicPath)) return publicPath;
  if (fs.existsSync(srcPath)) return srcPath;
  return '';
});
import { app, BrowserWindow, ipcMain, session, BrowserView, screen, shell } from 'electron';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import './main/database'; // Initialize SQLite DB (legacy, kept for migration)
import path from 'node:path';
import adblock from './adblock';
import started from 'electron-squirrel-startup';
import db from './main/database';
import {
  getAccounts,
  createAccount,
  loginAccount,
  deleteAccount,
  getCurrentAccountId,
  setCurrentAccountId,
  logout,
  updateAccountProfile,
  saveAvatarImage,
  loadAvatarImage,
  resetPinWithRecovery,
  isCurrentAccountKid,
  // User-scoped database functions
  setPersonalization as setUserPersonalization,
  getPersonalization as getUserPersonalization,
  favoritesAdd as userFavoritesAdd,
  favoritesRemove as userFavoritesRemove,
  favoritesList as userFavoritesList,
  favoritesIs as userFavoritesIs,
  favoritesReorder as userFavoritesReorder,
  watchHistorySet as userWatchHistorySet,
  watchHistoryGet as userWatchHistoryGet,
  watchHistoryRemove as userWatchHistoryRemove,
  watchHistoryList as userWatchHistoryList,
  recentWatchesGet as userRecentWatchesGet,
  recentWatchesAdd as userRecentWatchesAdd,
  recentWatchesRemove as userRecentWatchesRemove,
  tvProgressGet as userTvProgressGet,
  tvProgressSet as userTvProgressSet,
  tvProgressRemove as userTvProgressRemove,
} from './main/accountDatabase';

// Recent watches list stored as JSON with separate movie/tv id arrays
const recentWatchesPath = path.join(app.getPath('userData'), 'recent_watches.json');
type RecentWatches = { movie: number[]; tv: number[] };
function normalizeRecentWatches(input: any): RecentWatches {
  if (Array.isArray(input)) {
    const list = input.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    return { movie: list, tv: [] };
  }
  const movie = Array.isArray(input?.movie) ? input.movie.map((v: any) => Number(v)).filter((v: any) => Number.isFinite(v)) : [];
  const tv = Array.isArray(input?.tv) ? input.tv.map((v: any) => Number(v)).filter((v: any) => Number.isFinite(v)) : [];
  return { movie, tv };
}
function loadRecentWatches(): RecentWatches {
  try {
    const raw = fs.readFileSync(recentWatchesPath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeRecentWatches(parsed);
  } catch (e) {
    // ignore
  }
  return { movie: [], tv: [] };
}
function saveRecentWatches(data: RecentWatches) {
  try {
    fs.writeFileSync(recentWatchesPath, JSON.stringify({ movie: data.movie, tv: data.tv }, null, 2));
  } catch (e) {
    console.error('Failed to save recent_watches.json', e);
  }
}
function addRecentWatchId(itemIdRaw: string | number) {
  const raw = String(itemIdRaw ?? '');
  if (!raw) return;
  let type: 'movie'|'tv' = 'movie';
  let idStr = raw;
  if (raw.includes(':')) {
    const parts = raw.split(':');
    type = (parts[0] === 'tv') ? 'tv' : 'movie';
    idStr = parts[1];
  }
  const id = Number(idStr);
  if (!Number.isFinite(id)) return;
  const data = loadRecentWatches();
  const list = type === 'tv' ? data.tv : data.movie;
  const filtered = list.filter((v) => v !== id);
  filtered.unshift(id);
  if (type === 'tv') data.tv = filtered; else data.movie = filtered;
  saveRecentWatches(data);
}

// IPC handlers for database
ipcMain.handle('set-personalization', async (event, key: string, value: string) => {
  try {
    setUserPersonalization(key, value);
  } catch (e) {
    console.error('set-personalization error (no account logged in?)', e);
  }
});

ipcMain.handle('get-personalization', async (event, key: string) => {
  try {
    return getUserPersonalization(key);
  } catch (e) {
    console.error('get-personalization error (no account logged in?)', e);
    return null;
  }
});

// Account management handlers
ipcMain.handle('accounts-list', async () => {
  return getAccounts();
});

ipcMain.handle('accounts-create', async (event, accountInfo: { id: string; name: string; avatar: string; pin: string; isKid: boolean }, recoveryPin: string) => {
  return createAccount(accountInfo, recoveryPin);
});

ipcMain.handle('accounts-login', async (event, accountId: string, pin: string) => {
  return loginAccount(accountId, pin);
});

ipcMain.handle('accounts-delete', async (event, accountId: string) => {
  return deleteAccount(accountId);
});

ipcMain.handle('accounts-current', async () => {
  return getCurrentAccountId();
});

ipcMain.handle('accounts-set-current', async (event, accountId: string | null) => {
  setCurrentAccountId(accountId);
  return true;
});

ipcMain.handle('accounts-logout', async () => {
  logout();
  return true;
});

ipcMain.handle('accounts-update-profile', async (event, accountId: string, updates: { name?: string; avatar?: string }) => {
  return updateAccountProfile(accountId, updates);
});

ipcMain.handle('accounts-save-avatar', async (event, accountId: string, imageData: string) => {
  return saveAvatarImage(accountId, imageData);
});

ipcMain.handle('accounts-load-avatar', async (event, accountId: string) => {
  return loadAvatarImage(accountId);
});

ipcMain.handle('accounts-reset-pin', async (event, accountId: string, recoveryPin: string, newPin: string) => {
  return resetPinWithRecovery(accountId, recoveryPin, newPin);
});

// ───────────────────────────────────────────────────────────────────
// Kids Content Filter — TMDB Daily Adult ID Exports
// ───────────────────────────────────────────────────────────────────
// In-memory cache of adult IDs so we only download once per session
let _cachedAdultMovieIds: number[] | null = null;
let _cachedAdultTvIds: number[] | null = null;

// Helper: download a TMDB daily export .json.gz NDJSON file and return an array of IDs
async function downloadAdultIds(mediaPrefix: string): Promise<number[]> {
  const now = new Date();
  const tryDays = 90;
  for (let i = 0; i < tryDays; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const ds = `${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCDate()).padStart(2, '0')}_${d.getUTCFullYear()}`;
    const url = `https://files.tmdb.org/p/exports/${mediaPrefix}_${ds}.json.gz`;
    try {
      const ids = await new Promise<number[]>((resolve, reject) => {
        https.get(url, (res) => {
          if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
          const gunzip = zlib.createGunzip();
          const readline = require('readline');
          const rl = readline.createInterface({ input: res.pipe(gunzip), crlfDelay: Infinity });
          const collected: number[] = [];
          rl.on('line', (line: string) => {
            if (!line) return;
            try {
              const obj = JSON.parse(line);
              if (obj && typeof obj.id === 'number') collected.push(obj.id);
            } catch (e) { /* skip malformed lines */ }
          });
          rl.on('close', () => resolve(collected));
          rl.on('error', (err: any) => reject(err));
          gunzip.on('error', (err: any) => reject(err));
        }).on('error', reject);
      });
      if (ids.length > 0) {
        console.log(`Kids filter: loaded ${ids.length} adult IDs from ${mediaPrefix} (${ds})`);
        return ids;
      }
    } catch (e) {
      // try older dates
    }
  }
  console.warn(`Kids filter: could not load adult IDs for ${mediaPrefix} after ${tryDays} days`);
  return [];
}

// IPC: check if current account is a Kids profile
ipcMain.handle('kids-filter-isKid', async () => {
  return isCurrentAccountKid();
});

// IPC: download and return adult IDs from TMDB daily exports
ipcMain.handle('kids-filter-getAdultIds', async () => {
  try {
    // Use cache to avoid re-downloading every time
    if (_cachedAdultMovieIds === null) {
      _cachedAdultMovieIds = await downloadAdultIds('adult_movie_ids');
    }
    if (_cachedAdultTvIds === null) {
      _cachedAdultTvIds = await downloadAdultIds('adult_tv_series_ids');
    }
    return {
      movieIds: _cachedAdultMovieIds,
      tvIds: _cachedAdultTvIds,
    };
  } catch (e) {
    console.error('kids-filter-getAdultIds error', e);
    return { movieIds: [], tvIds: [] };
  }
});

// Open external URL in default browser
ipcMain.handle('open-external-url', async (event, url: string) => {
  console.log('open-external-url called with:', url);
  try {
    await shell.openExternal(url);
    console.log('shell.openExternal succeeded for:', url);
    return true;
  } catch (e) {
    console.error('open-external-url error', e);
    return false;
  }
});

// Favorites handlers (user-scoped)
ipcMain.handle('favorites-add', async (event, itemId: string, itemType: string) => {
  try {
    userFavoritesAdd(itemId, itemType);
  } catch (e) {
    console.error('favorites-add error', e);
  }
  return true;
});

ipcMain.handle('favorites-remove', async (event, itemId: string, itemType: string) => {
  try {
    userFavoritesRemove(itemId, itemType);
  } catch (e) {
    console.error('favorites-remove error', e);
  }
  return true;
});

ipcMain.handle('favorites-list', async (event) => {
  try {
    return userFavoritesList();
  } catch (e) {
    console.error('favorites-list error', e);
    return [];
  }
});

ipcMain.handle('favorites-is', async (event, itemId: string, itemType: string) => {
  try {
    return userFavoritesIs(itemId, itemType);
  } catch (e) {
    console.error('favorites-is error', e);
    return false;
  }
});

ipcMain.handle('favorites-swap', async (event, idA: number, idB: number) => {
  // Swap sort_order between two favorites - get the list and swap
  try {
    const favorites = userFavoritesList();
    const a = favorites.find((f: any) => f.id === idA);
    const b = favorites.find((f: any) => f.id === idB);
    if (!a || !b) return false;
    userFavoritesReorder(idA, b.sort_order);
    userFavoritesReorder(idB, a.sort_order);
    return true;
  } catch (e) {
    console.error('favorites-swap error', e);
    return false;
  }
});

ipcMain.handle('favorites-set-order', async (event, id: number, order: number) => {
  try {
    userFavoritesReorder(id, order);
  } catch (e) {
    console.error('favorites-set-order error', e);
  }
  return true;
});

// Watch history handlers (user-scoped)
ipcMain.handle('watch-history-set', async (event, itemId: string, position: number) => {
  try {
    userWatchHistorySet(itemId, position);
    try { userRecentWatchesAdd(itemId); } catch (e) { /* ignore */ }
  } catch (e) {
    console.error('watch-history-set error', e);
  }
  return true;
});

ipcMain.handle('watch-history-get', async (event, itemId: string) => {
  try {
    return userWatchHistoryGet(itemId);
  } catch (e) {
    console.error('watch-history-get error', e);
    return null;
  }
});

ipcMain.handle('watch-history-list', async (event) => {
  try {
    return userWatchHistoryList();
  } catch (e) {
    console.error('watch-history-list error', e);
    return [];
  }
});

// Recent watches handlers (user-scoped)
ipcMain.handle('recent-watches-get', async () => {
  try {
    return userRecentWatchesGet();
  } catch (e) {
    console.error('recent-watches-get error', e);
    return { movie: [], tv: [] };
  }
});
ipcMain.handle('recent-watches-set', async (event, list: number[] | { movie?: number[]; tv?: number[] }) => {
  // Note: For user-scoped, we just use recent-watches-add; this is a legacy handler
  // The user database doesn't support bulk set, so this is a no-op for now
  console.warn('recent-watches-set is deprecated in multi-account mode');
  return true;
});
ipcMain.handle('recent-watches-add', async (event, itemId: string | number) => {
  try {
    userRecentWatchesAdd(String(itemId));
  } catch (e) {
    console.error('recent-watches-add error', e);
  }
  return true;
});

// Delete a watch history entry by item_id (e.g., "movie:123" or "tv:456")
ipcMain.handle('watch-history-delete', async (event, itemId: string) => {
  try {
    userWatchHistoryRemove(itemId);
    return true;
  } catch (e) {
    console.error('watch-history-delete failed', e);
    return false;
  }
});

// Remove a specific item from recent watches by id and type (user-scoped)
ipcMain.handle('recent-watches-remove', async (event, id: number, type: 'movie' | 'tv') => {
  try {
    userRecentWatchesRemove(id, type);
    return true;
  } catch (e) {
    console.error('recent-watches-remove failed', e);
    return false;
  }
});

// TV progress handlers (user-scoped) - remember last watched season/episode
ipcMain.handle('tv-progress-get', async (event, tmdbId: string) => {
  try {
    return userTvProgressGet(tmdbId);
  } catch (e) {
    console.error('tv-progress-get error', e);
    return null;
  }
});
ipcMain.handle('tv-progress-set', async (event, tmdbId: string, season: number, episode: number) => {
  try {
    userTvProgressSet(tmdbId, season, episode);
    return true;
  } catch (e) {
    console.error('tv-progress-set error', e);
    return false;
  }
});
ipcMain.handle('tv-progress-remove', async (event, tmdbId: string) => {
  try {
    userTvProgressRemove(tmdbId);
    return true;
  } catch (e) {
    console.error('tv-progress-remove error', e);
    return false;
  }
});

// Window control handlers for frameless window
ipcMain.handle('window-minimize', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.handle('window-maximize', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.handle('window-close', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

ipcMain.handle('window-is-maximized', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isMaximized() : false;
});

// Fullscreen handlers for true fullscreen mode (hides taskbar)
ipcMain.handle('window-fullscreen', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setFullScreen(true);
  }
});

ipcMain.handle('window-exit-fullscreen', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setFullScreen(false);
  }
});

ipcMain.handle('window-toggle-fullscreen', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  }
  return false;
});

ipcMain.handle('window-is-fullscreen', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ? win.isFullScreen() : false;
});

ipcMain.handle('window-open-devtools', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } catch (e) {
    console.error('window-open-devtools failed', e);
  }
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
    minWidth: 768,
    minHeight: 600,
    icon: path.join(app.getAppPath(), 'assets', 'images', 'icon.png'),
    frame: false, // Remove default title bar
    show: false, // Don't show until ready to prevent flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: false,
    },
  });

  // Close fullscreen-overlay windows when main window gains focus.
  // Only close windows that were opened for BrowserView fullscreen transitions,
  // NOT standalone player windows opened by Cygnus/Draco providers.
  mainWindow.on('focus', () => {
    try {
      for (const [id, meta] of playerViewMeta.entries()) {
        if (meta.fullscreenWindowId) {
          try {
            const win = BrowserWindow.fromId(meta.fullscreenWindowId);
            if (win && !win.isDestroyed()) {
              win.close();
            }
          } catch (e) {}
          meta.fullscreenWindowId = undefined;
        }
      }
    } catch (e) {
      console.error('Failed to close fullscreen windows on focus', e);
    }
  });

  // Show window in fullscreen when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.setFullScreen(true);
    mainWindow.show();
    // Notify renderer of fullscreen state
    mainWindow.webContents.send('fullscreen-changed', true);
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  const allowDevtools = process.env.JSTREAM_DEVTOOLS === '1';
  // Disable DevTools unless explicitly allowed
  if (!allowDevtools) {
    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools();
    });
  }

  // Handle keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F11 to toggle fullscreen
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      // Notify renderer of fullscreen state change
      mainWindow.webContents.send('fullscreen-changed', mainWindow.isFullScreen());
      event.preventDefault();
      return;
    }
    
    // Escape to exit fullscreen
    if (input.key === 'Escape' && input.type === 'keyDown' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
      mainWindow.webContents.send('fullscreen-changed', false);
      event.preventDefault();
      return;
    }
    
    // Block DevTools shortcuts unless allowed
    if (!allowDevtools) {
      if (
        (input.key === 'F12') ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'j') ||
        (input.control && input.shift && input.key.toLowerCase() === 'c') ||
        (input.control && input.key.toLowerCase() === 'u')
      ) {
        event.preventDefault();
      }
    }
  });

  // Notify renderer when fullscreen state changes (e.g., via native controls)
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', true);
  });
  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-changed', false);
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  // Register webRequest blocking based on adblock rules
  try {
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      try {
        if (adblock.enabled && adblock.matches(details.url)) {
          // Cancel the request to block ads and trackers
          return callback({ cancel: true });
        }
      } catch (e) {
        // If matching fails, allow the request
        console.error('adblock match error', e);
      }
      return callback({});
    });
  } catch (e) {
    console.warn('Adblock: failed to register webRequest handler', e);
  }

  // Also register adblock on the persist:player partition used by webview tags
  try {
    const playerSession = session.fromPartition('persist:player');
    playerSession.webRequest.onBeforeRequest({ urls: ['*://*/*'] }, (details, callback) => {
      try {
        if (adblock.enabled && adblock.matches(details.url)) {
          return callback({ cancel: true });
        }
      } catch (e) {
        console.error('adblock (player partition) match error', e);
      }
      return callback({});
    });
  } catch (e) {
    console.warn('Adblock: failed to register player partition webRequest handler', e);
  }

  // Add referrer header for YouTube embed requests to fix error 153
  try {
    session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://www.youtube.com/embed/*'] }, (details, callback) => {
      try {
        const headers = { ...details.requestHeaders };
        // Set referrer to match the origin parameter
        headers['Referer'] = 'https://jstream.app/';
        return callback({ requestHeaders: headers });
      } catch (e) {
        console.error('YouTube referrer header error', e);
        return callback({});
      }
    });
  } catch (e) {
    console.warn('Failed to register YouTube referrer handler', e);
  }
  // Global popup/window-open handler: deny new windows when popupBlocking is enabled.
  app.on('web-contents-created', (event, contents) => {
    try {
      contents.setWindowOpenHandler(({ url, disposition, referrer, features }) => {
        try {
          if (adblock.popupBlocking) {
            // For player-related webContents (BrowserView or webview partition:player),
            // block ALL popups aggressively — these are almost always ad popups.
            // The main window renderer is allowed to open child frames as needed.
            try {
              const contentsUrl = contents.getURL() || '';
              const isPlayerContent = contentsUrl.includes('vidsrc') ||
                contentsUrl.includes('vidlink') ||
                contentsUrl.includes('vidfast') ||
                contentsUrl.includes('videasy') ||
                contentsUrl.includes('embed') ||
                contentsUrl.includes('player');

              // Allow watchparty.me links from any player — open in a dedicated window
              if (url.includes('watchparty.me')) {
                // Find the parent BrowserWindow to get the media title & mute its player
                let parentWin: BrowserWindow | null = null;
                try {
                  parentWin = BrowserWindow.fromWebContents(contents) || BrowserWindow.getAllWindows().find(w => w.webContents === contents) || null;
                  // If contents is a BrowserView, find the parent window that owns it
                  if (!parentWin) {
                    for (const w of BrowserWindow.getAllWindows()) {
                      try { if ((w as any).getBrowserViews && (w as any).getBrowserViews().some((v: any) => v.webContents === contents)) { parentWin = w; break; } } catch (e) {}
                    }
                  }
                } catch (e) {}

                // Resolve the main window: if parentWin is a player window, find its main window parent
                let mainWin: BrowserWindow | null = parentWin;
                if (parentWin) {
                  for (const [mainId, tracked] of playerWindowsByParent.entries()) {
                    if (tracked.has(parentWin)) {
                      try { const mw = BrowserWindow.fromId(mainId); if (mw && !mw.isDestroyed()) mainWin = mw; } catch (e) {}
                      break;
                    }
                  }
                }

                // Build the window title from the current media title
                let wpTitle = 'Watch Party';
                if (mainWin) {
                  const title = mediaTitle.get(mainWin.id);
                  if (title) wpTitle = `${title} Watch Party`;
                }
                const wpWin = new BrowserWindow({
                  width: 1200,
                  height: 800,
                  autoHideMenuBar: true,
                  title: wpTitle,
                  webPreferences: {
                    sandbox: true,
                    nodeIntegration: false,
                    contextIsolation: true,
                  },
                });
                wpWin.setMenu(null);
                wpWin.on('page-title-updated', (e) => e.preventDefault());

                // Mute the background player (BrowserView + any separate player windows)
                // so it doesn't interfere with the Watch Party's own player
                const mutedViews: Electron.WebContents[] = [];
                const mutedWindows: Electron.WebContents[] = [];
                // Use mainWin (the actual app window) for looking up BrowserViews and player windows
                const targetWin = mainWin || parentWin;
                if (targetWin) {
                  // Mute any BrowserView player attached to the main window
                  try {
                    const views = (targetWin as any).getBrowserViews ? (targetWin as any).getBrowserViews() : [];
                    for (const v of views) {
                      try { if (v.webContents && !v.webContents.isDestroyed()) { v.webContents.setAudioMuted(true); mutedViews.push(v.webContents); } } catch (e) {}
                    }
                  } catch (e) {}
                  // Mute any separate player windows opened by the main window
                  try {
                    const tracked = playerWindowsByParent.get(targetWin.id);
                    if (tracked) {
                      for (const pw of tracked) {
                        try { if (!pw.isDestroyed() && pw.webContents) { pw.webContents.setAudioMuted(true); mutedWindows.push(pw.webContents); } } catch (e) {}
                      }
                    }
                  } catch (e) {}
                  // Notify the renderer that Watch Party is active (so it can pause inline players)
                  try { targetWin.webContents.send('watchparty-state', true); } catch (e) {}
                }
                // Also mute the originating contents itself (the embedded player frame)
                try { if (!contents.isDestroyed()) { contents.setAudioMuted(true); mutedViews.push(contents); } } catch (e) {}

                // When Watch Party window closes, unmute everything and notify renderer
                wpWin.on('closed', () => {
                  for (const wc of mutedViews) {
                    try { if (!wc.isDestroyed()) wc.setAudioMuted(false); } catch (e) {}
                  }
                  for (const wc of mutedWindows) {
                    try { if (!wc.isDestroyed()) wc.setAudioMuted(false); } catch (e) {}
                  }
                  if (targetWin && !targetWin.isDestroyed()) {
                    try { targetWin.webContents.send('watchparty-state', false); } catch (e) {}
                  }
                });

                wpWin.loadURL(url);
                wpWin.show();
                return { action: 'deny' }; // deny the default popup since we handled it manually
              }

              if (isPlayerContent) {
                // Allow same-origin navigations (sub-frames the player needs)
                try {
                  const contentsOrigin = new URL(contentsUrl).origin;
                  const popupOrigin = new URL(url).origin;
                  if (contentsOrigin !== popupOrigin) {
                    return { action: 'deny' };
                  }
                } catch (e) {
                  // If URL parsing fails, block it
                  return { action: 'deny' };
                }
              }
            } catch (e) {}
            // For non-player content, only deny URLs that match adblock filter rules
            if (adblock.matches(url)) return { action: 'deny' };
          }
        } catch (e) {
          console.error('popup block handler error', e);
        }
        return { action: 'allow' };
      });
    } catch (e) {
      try {
        (contents as any).on && (contents as any).on('new-window', (evt: any, navigationUrl: string) => {
          if (adblock.popupBlocking && adblock.matches(navigationUrl)) {
            evt.preventDefault();
          }
        });
      } catch (err) {
        // swallow
      }
    }
  });

  createWindow();
});

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

// IPC: check headers for a URL (HEAD request) to detect framing restrictions (x-frame-options, CSP)
ipcMain.handle('check-url-headers', async (event, urlString: string) => {
  try {
    const parsed = new URL(urlString);
    const lib = parsed.protocol === 'https:' ? https : http;
    return await new Promise((resolve) => {
      const opts: any = {
        method: 'HEAD',
        hostname: parsed.hostname,
        path: parsed.pathname + (parsed.search || ''),
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        headers: {
          'User-Agent': 'JStream-Desktop/1.0'
        }
      };
      const req = lib.request(opts, (res: any) => {
        resolve({ status: res.statusCode, headers: res.headers });
      });
      req.on('error', (err: any) => {
        resolve({ error: String(err) });
      });
      req.end();
    });
  } catch (e) {
    return { error: String(e) };
  }
});

// IPC: fetch download links by loading the download page in a hidden window and scraping the rendered HTML
ipcMain.handle('fetch-download-links', async (_event, tmdbId: number, mediaType: string, season?: number, episode?: number) => {
  let hiddenWin: BrowserWindow | null = null;
  try {
    let downloadUrl = '';
    if (mediaType === 'tv' && season && episode) {
      downloadUrl = `https://www.rivestream.app/download?type=tv&id=${tmdbId}&season=${season}&episode=${episode}`;
    } else if (mediaType === 'tv' && season) {
      downloadUrl = `https://www.rivestream.app/download?type=tv&id=${tmdbId}&season=${season}&episode=1`;
    } else {
      downloadUrl = `https://www.rivestream.app/download?type=movie&id=${tmdbId}`;
    }

    // Use a separate session partition so the adblock rules don't block download page resources
    hiddenWin = new BrowserWindow({
      width: 1024,
      height: 768,
      show: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        partition: 'download-scraper',
      },
    });

    // Set a proper user-agent so the site doesn't reject the request
    hiddenWin.webContents.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    );

    await hiddenWin.loadURL(downloadUrl);

    // Wait for the SPA to render the download links (poll for up to 20s)
    // The page has sections: Torrents, Streams, Drive Downloads — each loads dynamically.
    // We use a broad scraping strategy that doesn't depend on hashed CSS class names.
    const links: { url: string; text: string; section: string }[] = await new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 40; // 40 × 500ms = 20s
      const iv = setInterval(async () => {
        attempts++;
        try {
          const result = await hiddenWin!.webContents.executeJavaScript(`
            (function() {
              var results = [];
              var seen = {};

              function addLink(href, text, section) {
                if (!href || !text || text.length < 3) return;
                if (href.startsWith('#') || href.endsWith('/') || href === window.location.href) return;
                // Skip navigation-like links
                if (['home', 'about', 'contact', 'login', 'signup', 'register'].indexOf(text.toLowerCase()) >= 0) return;
                if (!seen[href]) {
                  seen[href] = true;
                  results.push({ url: href, text: text, section: section });
                }
              }

              // Strategy 1: Find sections by heading text and walk UP the tree to find the section container
              var headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
              headings.forEach(function(h) {
                var txt = (h.textContent || '').trim().toLowerCase();
                var sectionName = '';
                if (txt === 'torrents') sectionName = 'Torrents';
                else if (txt === 'streams') sectionName = 'Streams';
                else if (txt.includes('drive download')) sectionName = 'Drive Downloads';
                else if (txt === 'captions') sectionName = 'Captions';
                if (!sectionName) return;

                // Walk UP to find the section container (try parent, grandparent, great-grandparent)
                var container = h.parentElement;
                for (var depth = 0; depth < 4 && container; depth++) {
                  var anchors = container.querySelectorAll('a[href]');
                  if (anchors.length > 0) {
                    var foundAny = false;
                    anchors.forEach(function(a) {
                      var href = a.getAttribute('href') || '';
                      var aText = (a.textContent || '').trim();
                      // Skip the heading itself if it's an anchor
                      if (a === h || a.contains(h) || h.contains(a)) return;
                      if (aText && aText.length > 3) {
                        addLink(href, aText, sectionName);
                        foundAny = true;
                      }
                    });
                    if (foundAny) break; // Found links at this container level, stop walking up
                  }
                  container = container.parentElement;
                }

                // Also check next siblings of the heading for link containers
                var sibling = h.nextElementSibling;
                for (var s = 0; s < 5 && sibling; s++) {
                  var sibAnchors = sibling.querySelectorAll('a[href]');
                  sibAnchors.forEach(function(a) {
                    var href = a.getAttribute('href') || '';
                    var aText = (a.textContent || '').trim();
                    if (aText && aText.length > 3) {
                      addLink(href, aText, sectionName);
                    }
                  });
                  // Also check if the sibling itself is a link
                  if (sibling.tagName === 'A' && sibling.getAttribute('href')) {
                    addLink(sibling.getAttribute('href'), (sibling.textContent || '').trim(), sectionName);
                  }
                  sibling = sibling.nextElementSibling;
                }
              });

              // Strategy 2: Look for links with torrent/magnet/known-download-site URLs
              if (results.length === 0) {
                document.querySelectorAll('a[href]').forEach(function(a) {
                  var href = (a.getAttribute('href') || '');
                  var hrefLower = href.toLowerCase();
                  var text = (a.textContent || '').trim();
                  if (text.length > 3 && (
                    hrefLower.includes('torrent') || hrefLower.includes('magnet:') ||
                    hrefLower.includes('yts') || hrefLower.includes('1337x') ||
                    hrefLower.includes('rarbg') || hrefLower.includes('nyaa') ||
                    hrefLower.includes('drive.google') || hrefLower.includes('.mkv') ||
                    hrefLower.includes('.mp4') || hrefLower.includes('.avi')
                  )) {
                    addLink(href, text, 'Download');
                  }
                });
              }

              // Strategy 3: CSS class-based matching (for the known Rivestream class names)
              if (results.length === 0) {
                document.querySelectorAll(
                  'a[class*="sourceLink"], a[class*="SourceLink"], a[class*="source_link"],' +
                  '[class*="sourceGroup"] a, [class*="SourceGroup"] a,' +
                  '[class*="Download_source"] a, [class*="download_source"] a,' +
                  '[class*="Download"] a[href]:not([href="#"]):not([href="/"])'
                ).forEach(function(a) {
                  var href = a.getAttribute('href');
                  var text = (a.textContent || '').trim();
                  if (text && text.length > 3) {
                    addLink(href, text, 'Download');
                  }
                });
              }

              return results;
            })()
          `);
          if (Array.isArray(result) && result.length > 0) {
            clearInterval(iv);
            resolve(result);
          } else if (attempts >= maxAttempts) {
            clearInterval(iv);
            resolve([]);
          }
        } catch (e) {
          if (attempts >= maxAttempts) {
            clearInterval(iv);
            resolve([]);
          }
        }
      }, 500);
    });

    try { if (hiddenWin && !hiddenWin.isDestroyed()) hiddenWin.close(); } catch (e) {}
    hiddenWin = null;

    if (links.length === 0) {
      return { links: [], error: 'No download links found for this title.' };
    }
    return { links };
  } catch (e) {
    try { if (hiddenWin && !hiddenWin.isDestroyed()) hiddenWin.close(); } catch (_) {}
    return { links: [], error: String(e) };
  }
});

// Track the current media title per main window (set by renderer when playback starts)
const mediaTitle = new Map<number, string>();
ipcMain.handle('set-media-title', async (event, title: string) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender as any);
    if (win) mediaTitle.set(win.id, title || '');
  } catch (e) {}
});

// IPC: open a dedicated BrowserWindow for the player URL
// Track per-parent: the saved window state and how many player windows are still open.
// Only restore the parent's state when ALL player windows have been closed.
const playerWindowMeta = new Map<number, { prevFullScreen: boolean, prevMaximized: boolean, openCount: number }>();
// Track all player windows opened by each parent so they can be closed on demand
const playerWindowsByParent = new Map<number, Set<BrowserWindow>>();
ipcMain.handle('open-player-window', async (event, urlString: string) => {
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender as any) || null;
    if (parentWin) {
      const existing = playerWindowMeta.get(parentWin.id);
      if (existing) {
        // Increment the count but keep the ORIGINAL saved state
        existing.openCount++;
      } else {
        // First player window for this parent — save the current state
        playerWindowMeta.set(parentWin.id, { prevFullScreen: parentWin.isFullScreen(), prevMaximized: parentWin.isMaximized(), openCount: 1 });
      }
    }
    const win = new BrowserWindow({
      width: 1100,
      height: 700,
      title: 'JStream Player',
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    // Remove the menu bar entirely so the window is plain
    win.setMenu(null);
    // Prevent the page title from overwriting our custom title (hides the streaming URL)
    win.on('page-title-updated', (e) => e.preventDefault());

    // Track this window under its parent
    if (parentWin) {
      if (!playerWindowsByParent.has(parentWin.id)) {
        playerWindowsByParent.set(parentWin.id, new Set());
      }
      playerWindowsByParent.get(parentWin.id)!.add(win);
    }

    // Disable DevTools for player windows
    win.webContents.on('devtools-opened', () => {
      win.webContents.closeDevTools();
    });
    win.webContents.on('before-input-event', (event, input) => {
      if (
        (input.key === 'F12') ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'j') ||
        (input.control && input.shift && input.key.toLowerCase() === 'c') ||
        (input.control && input.key.toLowerCase() === 'u')
      ) {
        event.preventDefault();
      }
    });

    if (parentWin) {
      win.on('closed', () => {
        try {
          // Remove from tracking set
          const tracked = playerWindowsByParent.get(parentWin.id);
          if (tracked) { tracked.delete(win); if (tracked.size === 0) playerWindowsByParent.delete(parentWin.id); }
          const meta = playerWindowMeta.get(parentWin.id);
          if (meta) {
            meta.openCount = Math.max(0, meta.openCount - 1);
            // Only restore the parent window state when ALL player windows are closed
            if (meta.openCount <= 0) {
              try { parentWin.setFullScreen(!!meta.prevFullScreen); } catch (e) {}
              try { (parentWin as any).setSimpleFullScreen && (parentWin as any).setSimpleFullScreen(!!meta.prevFullScreen); } catch (e) {}
              if (meta.prevMaximized) {
                try { parentWin.maximize(); } catch (e) {}
              }
              playerWindowMeta.delete(parentWin.id);
            }
          }
        } catch (e) {
          console.error('Failed to restore parent window state after player close', e);
        }
      });
    }

    // Show a loading page first, then navigate to the actual streaming URL
    const loadingPage = path.join(app.getAppPath(), 'public', 'player-loading.html');
    const loadingFallback = path.join(__dirname, '..', 'public', 'player-loading.html');
    const resolvedLoading = fs.existsSync(loadingPage) ? loadingPage : (fs.existsSync(loadingFallback) ? loadingFallback : '');
    if (resolvedLoading) {
      try { await win.loadFile(resolvedLoading); } catch (_) { /* ignore if loading page missing */ }
    }
    win.show();

    // Now navigate to the actual player URL in the background
    win.webContents.loadURL(urlString).catch((e) => {
      console.error('Player window: failed to load streaming URL', e);
    });
    return { success: true };
  } catch (e) {
    console.error('open-player-window failed', e);
    return { error: String(e) };
  }
});

// IPC: close all player windows opened by the calling parent
ipcMain.handle('close-player-windows', async (event) => {
  try {
    const parentWin = BrowserWindow.fromWebContents(event.sender as any) || null;
    if (!parentWin) return;
    // Close tracked player windows
    const tracked = playerWindowsByParent.get(parentWin.id);
    if (tracked) {
      for (const win of tracked) {
        try { if (!win.isDestroyed()) win.close(); } catch (e) {}
      }
      playerWindowsByParent.delete(parentWin.id);
    }
    // Also close any other windows that aren't the main window
    const allWindows = BrowserWindow.getAllWindows();
    for (const win of allWindows) {
      if (win !== parentWin && !win.isDestroyed()) {
        try { win.close(); } catch (e) {}
      }
    }
    playerWindowMeta.delete(parentWin.id);
  } catch (e) {
    console.error('close-player-windows failed', e);
  }
});

// BrowserView management: create/destroy/update a BrowserView attached to the caller's BrowserWindow
const playerViews = new Map<number, BrowserView>();
const playerViewMeta = new Map<number, { originalBounds?: Electron.Rectangle, prevFullScreen?: boolean, prevMaximized?: boolean, url?: string, enterHandler?: () => void, leaveHandler?: () => void, fullscreenWindowId?: number }>();

ipcMain.handle('player-view-create', async (event, urlString: string, opts: { bounds?: { x: number, y: number, width: number, height: number } | null } = {}) => {
  try {
    const sender = event && event.sender;
    const parentWin = BrowserWindow.fromWebContents(sender as any);
    if (!parentWin) return { error: 'no-parent-window' };
    const contentsId = (sender as any).id || parentWin.id;

    // Close any existing player windows before creating a new one
    try {
      // Close any fullscreen windows that were created for player fullscreen
      for (const [id, meta] of playerViewMeta.entries()) {
        if (meta.fullscreenWindowId) {
          try {
            const win = BrowserWindow.fromId(meta.fullscreenWindowId);
            if (win && !win.isDestroyed()) {
              win.close();
            }
          } catch (e) {}
        }
      }
      // Also close any windows created via open-player-window
      const allWindows = BrowserWindow.getAllWindows();
      for (const win of allWindows) {
        if (win !== parentWin && !win.isDestroyed()) {
          try { win.close(); } catch (e) {}
        }
      }
    } catch (e) {
      console.error('Failed to close existing player windows', e);
    }

    // If an existing view is present for this contents, destroy it first
    const existing = playerViews.get(contentsId);
    if (existing) {
      try { parentWin.removeBrowserView(existing); (existing.webContents as any).destroy(); } catch (e) {}
      playerViews.delete(contentsId);
    }

    const view = new BrowserView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), sandbox: true, nodeIntegration: false } });
    playerViews.set(contentsId, view);

    // Disable DevTools for BrowserView
    view.webContents.on('devtools-opened', () => {
      view.webContents.closeDevTools();
    });
    view.webContents.on('before-input-event', (event, input) => {
      if (
        (input.key === 'F12') ||
        (input.control && input.shift && input.key.toLowerCase() === 'i') ||
        (input.control && input.shift && input.key.toLowerCase() === 'j') ||
        (input.control && input.shift && input.key.toLowerCase() === 'c') ||
        (input.control && input.key.toLowerCase() === 'u')
      ) {
        event.preventDefault();
      }
    });

    // Store the requested URL in meta so fullscreen handler can open it in a new window
    playerViewMeta.set(contentsId, { ...(playerViewMeta.get(contentsId) || {}), url: urlString });
    // Register cleanup when the owning renderer/WebContents is destroyed or crashes
    try {
      const owner = sender as any;
      const cleanup = () => {
        try {
          const existing = playerViews.get(contentsId);
          if (existing) {
            try {
              const meta = playerViewMeta.get(contentsId);
              if (meta && meta.enterHandler) try { existing.webContents.removeListener('enter-html-full-screen', meta.enterHandler as any); } catch (e) {}
              if (meta && meta.leaveHandler) try { existing.webContents.removeListener('leave-html-full-screen', meta.leaveHandler as any); } catch (e) {}
              const pwParent = BrowserWindow.fromWebContents(owner);
              if (pwParent) try { pwParent.removeBrowserView(existing); } catch (e) {}
              try { (existing.webContents as any).destroy(); } catch (e) {}
            } catch (e) {}
            playerViews.delete(contentsId);
            playerViewMeta.delete(contentsId);
          }
        } catch (e) {}
      };
      // Listen for renderer crashes, navigations that destroy the frame, and component destroy
      owner.once && owner.once('destroyed', cleanup);
      owner.once && owner.once('render-process-gone', cleanup);
    } catch (e) {
      // ignore
    }
    // Attach fullscreen handlers so that when the embedded content requests
    // HTML fullscreen we notify the renderer to open a separate window.
    const enterHandler = () => {
      try {
        console.log('BrowserView enter-html-full-screen detected');
        try {
          const meta = playerViewMeta.get(contentsId) || {};
          meta.prevFullScreen = parentWin.isFullScreen();
          meta.prevMaximized = parentWin.isMaximized();
          playerViewMeta.set(contentsId, { ...meta, enterHandler });
        } catch (e) {}
        const meta = playerViewMeta.get(contentsId) || {};
        const urlToOpen = meta.url || '';
        console.log('Sending fullscreen request with URL:', urlToOpen);
        // Send message to renderer to open separate window
        try { parentWin.webContents.send('player-view-fullscreen-request', urlToOpen); } catch (e) {
          console.error('Failed to send fullscreen request', e);
        }
      } catch (e) { 
        console.error('enterHandler error', e);
      }
    };
    const leaveHandler = () => {
      try {
        console.log('BrowserView leave-html-full-screen detected');
        const meta = playerViewMeta.get(contentsId) || {};
        if (!meta.prevFullScreen) {
          try { parentWin.setFullScreen(false); } catch (e) {}
          try { (parentWin as any).setSimpleFullScreen && (parentWin as any).setSimpleFullScreen(false); } catch (e) {}
        }
        if (meta.prevMaximized === false && parentWin.isMaximized()) {
          try { parentWin.unmaximize(); } catch (e) {}
        }
      } catch (e) {
        console.error('leaveHandler error', e);
      }
    };
    view.webContents.on('enter-html-full-screen', enterHandler as any);
    view.webContents.on('leave-html-full-screen', leaveHandler as any);
    playerViewMeta.set(contentsId, { originalBounds: view.getBounds(), enterHandler, leaveHandler });
    parentWin.setBrowserView(view);

    // Compute bounds: use provided bounds (window coordinates) or full client area
    const winBounds = parentWin.getContentBounds();
    let b = { x: 0, y: 0, width: winBounds.width, height: winBounds.height };
    if (opts && opts.bounds) {
      // Clamp and use provided
      b = {
        x: Math.max(0, Math.floor(opts.bounds.x)),
        y: Math.max(0, Math.floor(opts.bounds.y)),
        width: Math.max(0, Math.floor(opts.bounds.width)),
        height: Math.max(0, Math.floor(opts.bounds.height)),
      };
    }
    view.setBounds(b);
    // Do NOT use setAutoResize — bounds are managed by the renderer via
    // player-view-set-bounds IPC calls so the BrowserView stays aligned
    // with the modal container instead of stretching to the full window.

    // Load the URL
    await view.webContents.loadURL(urlString);
    return { success: true };
  } catch (e) {
    console.error('player-view-create failed', e);
    return { error: String(e) };
  }
});

ipcMain.handle('player-view-destroy', async (event) => {
  try {
    const sender = event && event.sender;
    const parentWin = BrowserWindow.fromWebContents(sender as any);
    if (!parentWin) return { error: 'no-parent-window' };
    const contentsId = (sender as any).id || parentWin.id;
    const existing = playerViews.get(contentsId);
    if (existing) {
      try {
        // remove listeners if present
        const meta = playerViewMeta.get(contentsId);
        if (meta && meta.enterHandler) try { existing.webContents.removeListener('enter-html-full-screen', meta.enterHandler as any); } catch (e) {}
        if (meta && meta.leaveHandler) try { existing.webContents.removeListener('leave-html-full-screen', meta.leaveHandler as any); } catch (e) {}
        parentWin.removeBrowserView(existing);
        (existing.webContents as any).destroy();
      } catch (e) {}
      playerViews.delete(contentsId);
      playerViewMeta.delete(contentsId);
    }
    return { success: true };
  } catch (e) {
    console.error('player-view-destroy failed', e);
    return { error: String(e) };
  }
});

ipcMain.handle('player-view-set-bounds', async (event, bounds: { x: number, y: number, width: number, height: number }) => {
  try {
    const sender = event && event.sender;
    const parentWin = BrowserWindow.fromWebContents(sender as any);
    if (!parentWin) return { error: 'no-parent-window' };
    const contentsId = (sender as any).id || parentWin.id;
    const existing = playerViews.get(contentsId);
    if (!existing) return { error: 'no-view' };
    existing.setBounds({ x: Math.max(0, Math.floor(bounds.x)), y: Math.max(0, Math.floor(bounds.y)), width: Math.max(0, Math.floor(bounds.width)), height: Math.max(0, Math.floor(bounds.height)) });
    return { success: true };
  } catch (e) {
    console.error('player-view-set-bounds failed', e);
    return { error: String(e) };
  }
});

// Adblock IPC: expose management to renderer via preload
ipcMain.handle('adblock-add-rule', async (event, rule: string) => {
  try {
    const count = adblock.addRule(rule);
    return { urlRules: count };
  } catch (e) { return { error: String(e) }; }
});

ipcMain.handle('adblock-add-host', async (event, host: string) => {
  try { const count = adblock.addHostRule(host); return { hostRules: count }; } catch (e) { return { error: String(e) }; }
});

ipcMain.handle('adblock-add-cosmetic', async (event, selector: string) => {
  try { const count = adblock.addCosmetic(selector); return { cosmeticSelectors: count }; } catch (e) { return { error: String(e) }; }
});

ipcMain.handle('adblock-update-lists', async (event, lines: string[]) => {
  try { return adblock.updateLists(lines); } catch (e) { return { error: String(e) }; }
});

ipcMain.handle('adblock-reload-lists', async () => {
  try { adblock.reloadFilters(); return adblock.stats(); } catch (e) { return { error: String(e) }; }
});

ipcMain.handle('adblock-stats', async () => adblock.stats());

ipcMain.handle('adblock-set-enabled', async (event, enabled: boolean) => { adblock.enabled = !!enabled; return { enabled: adblock.enabled }; });

ipcMain.handle('adblock-set-popup-blocking', async (event, enabled: boolean) => { adblock.popupBlocking = !!enabled; return { popupBlocking: adblock.popupBlocking }; });

ipcMain.handle('adblock-get-cosmetics', async () => ({ cosmeticSelectors: adblock.cosmeticSelectors }));

// Simple TMDB proxy with caching, rate-limit, and guessing detection
const tmdbCache = new Map<string, { data: any, expires: number }>();
const TMDB_CACHE_TTL = 1000 * 60 * 10; // 10 minutes

// Simple per-webContents rate limit (token bucket-like)
const rateLimits = new Map<number, { count: number, resetAt: number, limit: number }>();
function allowRequestFor(contentsId: number, limit = 120) {
  const now = Date.now();
  const rec = rateLimits.get(contentsId) || { count: 0, resetAt: now + 60_000, limit };
  if (now > rec.resetAt) {
    rec.count = 0;
    rec.resetAt = now + 60_000;
  }
  // Log progress occasionally to help debugging rate issues
  if (rec.count > 0 && rec.count % Math.max(1, Math.floor(rec.limit / 4)) === 0) {
    // Only log TMDB rate usage when explicit debug flag set to avoid spamming renderer logs
    if (process.env.JSTREAM_TMDB_DEBUG === '1') {
      console.log(`tmdb rate usage for contents ${contentsId}: ${rec.count}/${rec.limit}`);
    }
  }
  if (rec.count < rec.limit) {
    rec.count++;
    rateLimits.set(contentsId, rec);
    return true;
  }
  rateLimits.set(contentsId, rec);
  // Only warn when debugging TMDB proxy
  if (process.env.JSTREAM_TMDB_DEBUG === '1') {
    console.warn(`tmdb rate limit exceeded for contents ${contentsId}: ${rec.count}/${rec.limit}, resets in ${Math.ceil((rec.resetAt - now)/1000)}s`);
  }
  return false;
}

// Basic guessing detector: track distinct ids requested per contents
const guessingMap = new Map<number, { ids: Set<string>, expires: number }>();
function registerIdRequest(contentsId: number, idKey: string) {
  const now = Date.now();
  const rec = guessingMap.get(contentsId) || { ids: new Set<string>(), expires: now + 60_000 };
  if (now > rec.expires) {
    rec.ids = new Set<string>();
    rec.expires = now + 60_000;
  }
  rec.ids.add(idKey);
  guessingMap.set(contentsId, rec);
  if (rec.ids.size > 120) return false; // suspicious
  return true;
}

ipcMain.handle('tmdb-request', async (event, endpoint: string, params: Record<string, any> = {}) => {
  try {
    const contentsId = (event && event.sender && (event.sender as any).id) || 0;
    if (!allowRequestFor(contentsId)) throw new Error('Rate limit exceeded');
    // cache key
    const key = `${endpoint}?${Object.keys(params).sort().map(k => `${k}=${String(params[k])}`).join('&')}`;
    // If this looks like a detail endpoint (movie/:id or tv/:id), register for guessing detection
    const detailMatch = endpoint.match(/^(movie|tv)\/(\d+)/);
    if (detailMatch) {
      const idKey = `${detailMatch[1]}:${detailMatch[2]}`;
      if (!registerIdRequest(contentsId, idKey)) throw new Error('Too many distinct detail requests, try again later');
    }

    const now = Date.now();
    const cached = tmdbCache.get(key);
    if (cached && cached.expires > now) {
      return cached.data;
    }

    // perform network request server-side to keep API key out of renderer
    const config = await (async (): Promise<any> => {
      try {
        // dynamic import of remoteConfig util
        const rc = await import(path.join(__dirname, 'utils', 'remoteConfig.js')).catch((): any => null);
        if (rc && rc.getPlayerConfig) return rc.getPlayerConfig();
      } catch (e) { /* ignore */ }
      return null;
    })();
    const apiKey = config && config.tmdbApiKey;
    if (!apiKey) throw new Error('TMDB API key not configured');

    const url = new URL(`https://api.themoviedb.org/3/${endpoint}`);
    url.searchParams.append('api_key', apiKey);
    Object.entries(params || {}).forEach(([k, v]) => url.searchParams.append(k, String(v)));

    const lib = url.protocol === 'https:' ? https : http;
    if (endpoint.startsWith('collection/')) {
      if (process.env.JSTREAM_TMDB_DEBUG === '1') console.log('tmdb-request: collection detail requested', endpoint);
    }
    const result = await new Promise<any>((resolve, reject) => {
      const req = lib.get(url.toString(), (res) => {
        const bufs: any[] = [];
        res.on('data', (c) => bufs.push(c));
        res.on('end', () => {
          try {
            const txt = Buffer.concat(bufs).toString('utf8');
            const json = JSON.parse(txt);
            if (endpoint.startsWith('collection/') && res.statusCode !== 200) {
              if (process.env.JSTREAM_TMDB_DEBUG === '1') console.warn('tmdb-request: collection detail returned non-200', res.statusCode, url.toString());
            }
            resolve(json);
          } catch (e) { reject(e); }
        });
      });
      req.on('error', (err) => reject(err));
    });

    // cache responses for simple GETs
    tmdbCache.set(key, { data: result, expires: Date.now() + TMDB_CACHE_TTL });
    return result;
  } catch (e) {
    return { error: String(e) };
  }
});

// IPC: fetch a collections feed by downloading TMDB daily collection_ids export server-side,
// decompressing, parsing NDJSON or JSON, and returning a small list of collection details.
ipcMain.handle('tmdb-exports-getCollectionsFeed', async (event, opts: { tryDays?: number, page?: number, perPage?: number } = {}) => {
  const perPage = typeof opts.perPage === 'number' ? opts.perPage : 24;
  const page = typeof opts.page === 'number' ? opts.page : 1;
    const tryDays = typeof opts.tryDays === 'number' ? opts.tryDays : 90;  try {
    // Get API key
    const rc = await import(path.join(__dirname, 'utils', 'remoteConfig.js')).catch((): any => null);
    const cfg = rc && rc.getPlayerConfig ? await rc.getPlayerConfig() : null;
    let apiKey = cfg && cfg.tmdbApiKey;
    if (!apiKey) {
      apiKey = '49787128da94b3585b21dac5c4a92fcc';
      if (process.env.JSTREAM_TMDB_DEBUG === '1') console.warn('TMDB API key not configured in remote config; using fallback key for feed requests');
    }

    // Find latest available export
    let exportUrl: string | null = null;
    let dateStr: string | null = null;
    const now = new Date(); // Use current UTC/day when checking for export dates
    // Try the example date from documentation first
    const exampleDates = ['10_25_2024'];
    for (const ds of exampleDates) {
      const url = `http://files.tmdb.org/p/exports/movie_ids_${ds}.json.gz`; // try http
      try {
        const res = await new Promise<any>((resolve, reject) => {
          const u = new URL(url);
          const lib = u.protocol === 'https:' ? https : http;
          const req = lib.request(url, { method: 'HEAD' }, (res) => {
            resolve({ statusCode: res.statusCode });
          });
          req.on('error', reject);
          req.end();
        });
        if (res.statusCode === 200) {
          exportUrl = url;
          dateStr = ds;
          if (process.env.JSTREAM_TMDB_DEBUG === '1') console.log('Found export from example:', url);
          break;
        }
      } catch (e) {
        // continue
      }
    }
    if (!exportUrl) {
      for (let i = 0; i < tryDays; i++) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
        const ds = `${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCDate()).padStart(2, '0')}_${d.getUTCFullYear()}`;
        const url = `https://files.tmdb.org/p/exports/collection_ids_${ds}.json.gz`;
        try {
          const res = await new Promise<any>((resolve, reject) => {
            const req = https.request(url, { method: 'HEAD' }, (res) => {
              resolve({ statusCode: res.statusCode });
            });
            req.on('error', reject);
            req.end();
          });
          if (res.statusCode === 200) {
            exportUrl = url;
            dateStr = ds;
            break;
          }
        } catch (e) {
          // continue
        }
      }
    }

    if (!exportUrl || !dateStr) {
      if (process.env.JSTREAM_TMDB_DEBUG === '1') console.log('No recent collection export available, tried dates back to', tryDays, 'days. Returning empty ids so renderer can fallback.');
      // Fallback: a set of collection IDs (start at 1 to include smaller ids); renderer will fetch details
      const fallbackIds = Array.from({ length: 200 }).map((_, i) => i + 1); // 1..200
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const pageIds = fallbackIds.slice(start, end);
      const hasMore = end < fallbackIds.length;
      const pageItems = pageIds.map((id): { id: number; name?: string | undefined } => ({ id, name: undefined }));
      if (process.env.JSTREAM_TMDB_DEBUG === '1') console.log('tmdb-exports-getCollectionsFeed: fallback returning', pageItems.length, 'items for page', page);
      return { items: pageItems, hasMore };
    }

    if (process.env.JSTREAM_TMDB_DEBUG === '1') console.log('Found export:', exportUrl);

    // Stream-download -> gunzip -> parse NDJSON line-by-line to collect ids and names
    const items: {id: number, name?: string}[] = [];
    await new Promise<void>((resolve, reject) => {
      try {
        const u = new URL(exportUrl);
        const lib = u.protocol === 'https:' ? https : http;
        lib.get(exportUrl, (res) => {
          if (res.statusCode !== 200) return reject(new Error(`Export download failed: ${res.statusCode}`));
          const gunzip = zlib.createGunzip();
          const readline = require('readline');
          const rl = readline.createInterface({ input: res.pipe(gunzip), crlfDelay: Infinity });
          rl.on('line', (line: string) => {
            if (!line) return;
            try {
              const obj = JSON.parse(line);
              if (obj && typeof obj.id === 'number') {
                items.push({ id: obj.id, name: obj.name || obj.title });
              }
            } catch (err) {
              // ignore malformed lines
            }
          });
          rl.on('close', () => resolve());
          rl.on('error', (err: any) => reject(err));
          gunzip.on('error', (err: any) => reject(err));
        }).on('error', reject);
      } catch (err) { reject(err); }
    });

    // Paginate items and return — renderer will search for details using name
    const start = (page - 1) * perPage;
    const end = start + perPage;
    const pageItems = items.slice(start, end);
    const hasMore = end < items.length;
    if (process.env.JSTREAM_TMDB_DEBUG === '1') console.log('tmdb-exports-getCollectionsFeed: returning', pageItems.length, 'items for page', page, 'sample:', pageItems.slice(0, 6));
    return { items: pageItems, hasMore };
  } catch (e) {
    if (process.env.JSTREAM_TMDB_DEBUG === '1') console.warn('Failed to fetch collections feed', e);
    return { error: String(e), ids: [], hasMore: false };
  }
});

  // Helper to build TMDB image url
  function tmdbImageUrl(posterPath: string | null | undefined, size = 'w185') {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
  }

  // IPC: fetch missing details for an id (main process only — keeps API key safe)
  ipcMain.handle('fetch-details', async (event, args: { id: number, media_type?: string }) => {
    try {
      const id = Number(args.id);
      const media_type = args.media_type || 'movie';

      // Obtain API key from remoteConfig or environment
      const rc = await import(path.join(__dirname, 'utils', 'remoteConfig.js')).catch((): any => null);
      const cfg = rc && rc.getPlayerConfig ? await rc.getPlayerConfig() : null;
      const apiKey = (cfg && cfg.tmdbApiKey) || process.env.TMDB_API_KEY;
      if (!apiKey) throw new Error('TMDB_API_KEY not set in env or remote config');

      const typePath = media_type === 'tv' ? 'tv' : media_type === 'person' ? 'person' : media_type === 'collection' ? 'collection' : 'movie';
      const url = new URL(`https://api.themoviedb.org/3/${typePath}/${id}`);
      url.searchParams.append('api_key', apiKey);
      url.searchParams.append('language', 'en-US');

      const lib = url.protocol === 'https:' ? https : http;
      const data = await new Promise<any>((resolve, reject) => {
        const req = lib.get(url.toString(), (res) => {
          const bufs: any[] = [];
          res.on('data', (c) => bufs.push(c));
          res.on('end', () => {
            try {
              const txt = Buffer.concat(bufs).toString('utf8');
              const json = JSON.parse(txt);
              if (res.statusCode && res.statusCode >= 400) return reject(new Error(`TMDB ${res.statusCode}`));
              resolve(json);
            } catch (err) { reject(err); }
          });
        });
        req.on('error', (err) => reject(err));
      });

      const title = data.title || data.name || null;
      const poster_path = data.poster_path || data.profile_path || null;

      // Ensure items table exists (some older DBs may not have it)
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            media_type TEXT,
            adult INTEGER DEFAULT 0,
            popularity REAL DEFAULT 0,
            video INTEGER DEFAULT 0,
            raw_json TEXT,
            title TEXT,
            poster_path TEXT
          );
        `);
      } catch (e) {
        // ignore
      }

      // Upsert into items: insert or update title/poster_path and raw_json
      try {
        const stmt = db.prepare(`
          INSERT INTO items (id, media_type, title, poster_path, raw_json)
          VALUES (@id, @media_type, @title, @poster_path, @raw_json)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            poster_path = excluded.poster_path,
            raw_json = COALESCE(excluded.raw_json, items.raw_json)
        `);
        stmt.run({ id, media_type, title, poster_path: poster_path, raw_json: JSON.stringify(data) });
      } catch (err) {
        // If ON CONFLICT syntax unsupported (older SQLite) fallback to simple UPDATE/INSERT
        try {
          const up = db.prepare('UPDATE items SET title = ?, poster_path = ?, raw_json = ? WHERE id = ?');
          up.run(title, poster_path, JSON.stringify(data), id);
          const insertIf = db.prepare('INSERT OR IGNORE INTO items (id, media_type, title, poster_path, raw_json) VALUES (?, ?, ?, ?, ?)');
          insertIf.run(id, media_type, title, poster_path, JSON.stringify(data));
        } catch (e) {
          console.warn('fetch-details: failed to persist item', e);
        }
      }

      return { title, poster_path, image_url: tmdbImageUrl(poster_path) };
    } catch (err) {
      console.error('fetch-details error', err);
      return { error: String(err) };
    }
  });
