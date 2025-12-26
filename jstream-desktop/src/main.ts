import { app, BrowserWindow, ipcMain, session } from 'electron';
import * as http from 'http';
import * as https from 'https';
import * as zlib from 'zlib';
import './main/database'; // Initialize SQLite DB
import path from 'node:path';
import adblock from './adblock';
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
    minWidth: 768,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      webSecurity: false,
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
  // Global popup/window-open handler: deny new windows when popupBlocking is enabled.
  // This covers `window.open` and most webview/new-window cases by applying the policy
  // to every created WebContents.
  app.on('web-contents-created', (event, contents) => {
    try {
      // Prefer the modern API
      contents.setWindowOpenHandler(({ url, disposition, referrer, features }) => {
        try {
          // If popup blocking is enabled, deny all new windows that look like popups
          if (adblock.popupBlocking) {
            // If it's a user-intended navigation (e.g., target=_blank from a user click)
            // you can refine this by checking `disposition` or `referrer`.
            // Here we block by default; if the target URL matches ad rules, definitely deny.
            if (adblock.matches(url)) return { action: 'deny' };
            // Deny all other programmatic attempts to open a new window while popupBlocking is on
            return { action: 'deny' };
          }
        } catch (e) {
          console.error('popup block handler error', e);
        }
        return { action: 'allow' };
      });
    } catch (e) {
      // Some older Electron versions may not support setWindowOpenHandler on all contents
      // In that case, listen for the deprecated event as a fallback
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

// IPC: open a dedicated BrowserWindow for the player URL
ipcMain.handle('open-player-window', async (event, urlString: string) => {
  try {
    const win = new BrowserWindow({
      width: 1100,
      height: 700,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
      },
    });
    await win.loadURL(urlString);
    win.show();
    return { success: true };
  } catch (e) {
    console.error('open-player-window failed', e);
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
    console.log(`tmdb rate usage for contents ${contentsId}: ${rec.count}/${rec.limit}`);
  }
  if (rec.count < rec.limit) {
    rec.count++;
    rateLimits.set(contentsId, rec);
    return true;
  }
  rateLimits.set(contentsId, rec);
  console.warn(`tmdb rate limit exceeded for contents ${contentsId}: ${rec.count}/${rec.limit}, resets in ${Math.ceil((rec.resetAt - now)/1000)}s`);
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
      console.log('tmdb-request: collection detail requested', endpoint);
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
              console.warn('tmdb-request: collection detail returned non-200', res.statusCode, url.toString());
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
      console.warn('TMDB API key not configured in remote config; using fallback key for feed requests');
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
          console.log('Found export from example:', url);
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
      console.log('No recent collection export available, tried dates back to', tryDays, 'days. Returning empty ids so renderer can fallback.');
      // Fallback: a set of collection IDs (start at 1 to include smaller ids); renderer will fetch details
      const fallbackIds = Array.from({ length: 200 }).map((_, i) => i + 1); // 1..200
      const start = (page - 1) * perPage;
      const end = start + perPage;
      const pageIds = fallbackIds.slice(start, end);
      const hasMore = end < fallbackIds.length;
      const pageItems = pageIds.map((id): { id: number; name?: string | undefined } => ({ id, name: undefined }));
      console.log('tmdb-exports-getCollectionsFeed: fallback returning', pageItems.length, 'items for page', page);
      return { items: pageItems, hasMore };
    }

    console.log('Found export:', exportUrl);

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
    console.log('tmdb-exports-getCollectionsFeed: returning', pageItems.length, 'items for page', page, 'sample:', pageItems.slice(0, 6));
    return { items: pageItems, hasMore };
  } catch (e) {
    console.warn('Failed to fetch collections feed', e);
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
