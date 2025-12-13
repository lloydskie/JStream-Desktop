Daily ID Exports
Download a list of valid IDs from TMDB.

We currently publish a set of daily ID file exports. These are not, nor intended to be full data exports. Instead, they contain a list of the valid IDs you can find on TMDB and some higher level attributes that are helpful for filtering items like the adult, video and popularity values.

Data Structure
These files themselves are not a valid JSON object. Instead, each line is. Most systems, tools and languages have easy ways of scanning lines in files (skipping and buffering) without having to load the entire file into memory. The assumption here is that you can read every line easily, and you can expect each line to contain a valid JSON object.

Availability
All of the exported files are available for download from https://files.tmdb.org. The export job runs every day starting at around 7:00 AM UTC, and all files are available by 8:00 AM UTC.

There is currently no authentication on these files since they are not very useful unless you're a user of our service. Please note that this could change at some point in the future so if you start having problems accessing these files, check this document for updates.

📘
Note
These files are only made available for 3 months after which they are automatically deleted.

Media Type	Path	Name
Movies	/p/exports	movie_ids_MM_DD_YYYY.json.gz
TV Series	/p/exports	tv_series_ids_MM_DD_YYYY.json.gz
People	/p/exports	person_ids_MM_DD_YYYY.json.gz
Collections	/p/exports	collection_ids_MM_DD_YYYY.json.gz
TV Networks	/p/exports	tv_network_ids_MM_DD_YYYY.json.gz
Keywords	/p/exports	keyword_ids_MM_DD_YYYY.json.gz
Production Companies	/p/exports	production_company_ids_MM_DD_YYYY.json.gz
Example
If you were looking for a list of valid movie ids, the full download URL for the file published on May 15, 2025 is located here:

https://files.tmdb.org/p/exports/movie_ids_10_25_2025.json.gz
Adult ID's
Starting July 5, 2023, we are now also publishing the adult data set. You can find the paths for movies, TV shows and people below.

Media Type	Path	Name
Movies	/p/exports	adult_movie_ids_MM_DD_YYYY.json.gz
TV Series	/p/exports	adult_tv_series_ids_MM_DD_YYYY.json.gz
People	/p/exports	adult_person_ids_MM_DD_YYYY.json.gz
Example
http://files.tmdb.org/p/exports/adult_movie_ids_05_15_2024.json.gz

Implementation Tips from GPT-5 Mini from Github Copilot:
Below is a practical, ready-to-drop-in implementation and plan for adding Daily ID Exports support to your Electron streaming app. It:

- runs in the main process (no CORS / no UI blocking),
- schedules a daily check (UTC) for the newest TMDB export,
- uses conditional requests (If-Modified-Since / If-None-Match) to avoid re-downloading unchanged files,
- streams download -> gunzip -> parse NDJSON line-by-line without loading the whole file into memory,
- writes a decompressed JSONL file for later random access,
- deletes the downloaded .json.gz after successful decompression,
- keeps a retention (rotating) archive and deletes older decompressed files after N days,
- reports progress/lines to renderer via IPC in batches to avoid flooding the UI,
- persists metadata (ETag / Last-Modified / last fetched date / filenames) to disk.

What I provide:

- tmdbService.js — streaming downloader, HEAD-checks, conditional GET, decompress-on-the-fly, retention cleanup, metadata persistence.
- main.js — integrates the service into Electron main process, starts the scheduler, exposes IPC to renderer.
- preload.js — safe API exposed to renderer.
- renderer.js — example usage (start/stop and UI updates).
- metadataStore.js — tiny JSON file store for metadata.

Drop these files into your Electron app (main process files into the project root or wherever your main code lives). Adjust paths and UI hooks to taste.

````javascript
// tmdbService.js
// Responsible for checking TMDB daily export updates, streaming download, decompressing, saving decompressed JSONL, deleting .gz, and retention.
//
// Usage:
//   const { startScheduler, fetchNow, stopScheduler } = require('./tmdbService');
//   startScheduler({ media: 'movie_ids', retentionDays: 90 });
//   // or fetchNow({ media: 'movie_ids' });

const https = require('https');
const zlib = require('zlib');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

const metadataStore = require('./metadataStore');

const BASE_URL = 'https://files.tmdb.org/p/exports';
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_BATCH_SIZE = 1000; // send lines to renderer in batches
let schedulerTimer = null;
let runningFetchController = null;

// Storage directory inside userData
function storageDir() {
  const dir = path.join(app.getPath('userData'), 'tmdb-exports');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// build filename, given media and dateStr (MM_DD_YYYY)
function buildFilename(media, dateStr) {
  return `${media}_${dateStr}.json.gz`;
}

function buildUrl(media, dateStr) {
  return `${BASE_URL}/${buildFilename(media, dateStr)}`;
}

// Make a HEAD request to check existence and retrieve headers (ETag, Last-Modified, Content-Length)
function headRequest(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const options = {
      method: 'HEAD',
      hostname: u.hostname,
      path: u.pathname + u.search,
      timeout,
    };
    const req = https.request(options, (res) => {
      resolve({
        statusCode: res.statusCode,
        headers: res.headers,
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('HEAD request timeout'));
    });
    req.end();
  });
}

// Attempt to find the newest available file by checking today and fallback some previous days
async function findLatestAvailable(media, tryDays = 3) {
  // try today and some previous days (UTC)
  const attempts = [];
  const now = new Date();
  for (let i = 0; i < tryDays; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const dateStr = `${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCDate()).padStart(2, '0')}_${d.getUTCFullYear()}`;
    attempts.push(dateStr);
  }
  for (const dateStr of attempts) {
    const url = buildUrl(media, dateStr);
    try {
      // HEAD to see if exists
      const res = await headRequest(url);
      if (res.statusCode === 200) {
        return { dateStr, url, headers: res.headers };
      }
      // Some servers might 403/302; treat 200 only
    } catch (e) {
      // continue trying previous day
    }
  }
  return null;
}

// Download and process streamed gz -> gunzip -> readline JSONL
// options:
//  - media, dateStr
//  - onProgress(loadedBytes, totalBytes)
//  - onBatch(linesArray) : batch of parsed objects (for IPC)
//  - onLine(obj, index) : optional
//  - onFinished(meta)
//  - onError(err)
function streamDownloadAndProcess({ media, dateStr, headers = {}, onProgress, onBatch, onLine, onFinished, onError, saveDecompressed = true }) {
  const filename = buildFilename(media, dateStr);
  const url = buildUrl(media, dateStr);
  const u = new URL(url);

  // Ensure only one active controller at a time per process
  const controller = {};
  runningFetchController = controller;

  return new Promise((resolve, reject) => {
    const options = {
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers,
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 304) {
        // not modified
        const meta = { status: 'not-modified', dateStr };
        if (onFinished) onFinished(meta);
        resolve(meta);
        return;
      }
      if (res.statusCode !== 200) {
        const err = new Error(`HTTP ${res.statusCode}`);
        if (onError) onError(err);
        reject(err);
        return;
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let loaded = 0;

      // Save compressed temporarily
      const gzPath = path.join(storageDir(), `${media}_${dateStr}.json.gz`);
      const decompressedPath = path.join(storageDir(), `${media}_${dateStr}.jsonl`);

      // Write compressed file to disk as stream; will delete later
      const compressedWrite = fs.createWriteStream(gzPath);

      const gunzip = zlib.createGunzip();
      const rl = readline.createInterface({ input: gunzip, crlfDelay: Infinity });

      // optional write decompressed to .jsonl (append)
      const decompressedWrite = saveDecompressed ? fs.createWriteStream(decompressedPath, { flags: 'w' }) : null;

      let count = 0;
      let batch = [];

      // progress from compressed TCP chunks
      res.on('data', (chunk) => {
        loaded += chunk.length;
        if (onProgress) onProgress(loaded, total);
        compressedWrite.write(chunk);
      });

      res.on('error', (err) => {
        try { compressedWrite.close(); } catch (e) {}
        if (onError) onError(err);
        cleanupStreams();
        reject(err);
      });

      res.on('end', () => {
        // compressed stream ended
        compressedWrite.end();
      });

      // pipe compressed stream into gunzip
      res.pipe(gunzip);

      gunzip.on('error', (err) => {
        if (onError) onError(err);
        cleanupStreams();
        reject(err);
      });

      rl.on('line', (line) => {
        if (!line) return;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch (e) {
          // skip malformed line but notify
          if (onError) onError(new Error(`JSON parse error: ${e.message}`));
          return;
        }
        count++;
        if (decompressedWrite) {
          decompressedWrite.write(JSON.stringify(obj) + '\n');
        }
        if (onLine) onLine(obj, count);
        batch.push(obj);

        if (batch.length >= DEFAULT_BATCH_SIZE) {
          if (onBatch) onBatch(batch.splice(0, batch.length));
        }
      });

      rl.on('close', async () => {
        // flush last batch
        if (batch.length && onBatch) onBatch(batch);
        const meta = {
          status: 'ok',
          media,
          dateStr,
          compressedPath: gzPath,
          decompressedPath: saveDecompressed ? decompressedPath : null,
          count,
          downloadedBytes: loaded,
          totalBytes: total,
          headers: res.headers,
          fetchedAt: new Date().toISOString(),
        };

        // Save metadata: etag/last-modified
        const record = {
          media,
          dateStr,
          fetchedAt: meta.fetchedAt,
          etag: res.headers.etag || null,
          lastModified: res.headers['last-modified'] || null,
          compressedPath: gzPath,
          decompressedPath: meta.decompressedPath,
          count,
        };
        metadataStore.save(metadataKey(media), record);

        // Delete compressed .gz after successful processing
        try {
          fs.unlinkSync(gzPath);
        } catch (e) {
          // if deletion fails, keep and notify
          if (onError) onError(new Error(`Failed to delete ${gzPath}: ${e.message}`));
        }

        // retention cleanup
        try {
          cleanupOldRecords(storageDir(), DEFAULT_RETENTION_DAYS);
        } catch (e) {
          // non-fatal
        }

        if (onFinished) onFinished(meta);
        cleanupStreams();
        resolve(meta);
      });

      function cleanupStreams() {
        try { gunzip.destroy(); } catch (e) {}
        try { rl.close(); } catch (e) {}
        try { decompressedWrite && decompressedWrite.end(); } catch (e) {}
      }
    });

    req.on('error', (err) => {
      if (onError) onError(err);
      reject(err);
    });

    req.end();

    // controller abort hook
    controller.abort = () => {
      try { req.destroy(); } catch (e) {}
    };
  });
}

function metadataKey(media) {
  return `tmdb_${media}`;
}

// small rotation/cleanup function: remove .jsonl files older than retentionDays and metadata entries
function cleanupOldRecords(dir, retentionDays = DEFAULT_RETENTION_DAYS) {
  const files = fs.readdirSync(dir);
  const now = Date.now();
  const cutoff = now - retentionDays * 24 * 3600 * 1000;
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
      }
    } catch (e) {
      // ignore
    }
  }
  // Also prune metadata for non-existing files
  const allMeta = metadataStore.loadAll();
  for (const [k, v] of Object.entries(allMeta)) {
    if (v.decompressedPath && !fs.existsSync(v.decompressedPath)) {
      metadataStore.remove(k);
    } else if (!v.decompressedPath && v.compressedPath && !fs.existsSync(v.compressedPath)) {
      metadataStore.remove(k);
    }
  }
}

// High-level function: check whether remote file changed using HEAD or If-None-Match / If-Modified-Since
async function fetchIfUpdated({ media, tryDays = 3, onProgress, onBatch, onLine, onFinished, onError, saveDecompressed = true }) {
  // Find latest dateStr available (today fallback to previous days)
  const found = await findLatestAvailable(media, tryDays);
  if (!found) {
    const err = new Error('No recent export available (tried last ' + tryDays + ' days)');
    if (onError) onError(err);
    throw err;
  }
  const { dateStr, url, headers } = found;
  const stored = metadataStore.get(metadataKey(media));
  // Use conditional headers if we have previous record for this date or a global ETag
  const requestHeaders = {};
  if (stored && stored.dateStr === dateStr) {
    if (stored.etag) requestHeaders['If-None-Match'] = stored.etag;
    if (stored.lastModified) requestHeaders['If-Modified-Since'] = stored.lastModified;
  } else {
    // if we have an ETag for the media (maybe older date) we can still try conditional GET
    if (stored && stored.etag) requestHeaders['If-None-Match'] = stored.etag;
    if (stored && stored.lastModified) requestHeaders['If-Modified-Since'] = stored.lastModified;
  }

  // Now do the streaming fetch (it will handle 304 and normal 200)
  return await streamDownloadAndProcess({
    media,
    dateStr,
    headers: requestHeaders,
    onProgress,
    onBatch,
    onLine,
    onFinished,
    onError,
    saveDecompressed,
  });
}

// Scheduler: schedule a daily check at targetHourUTC:targetMinuteUTC (default 07:30 UTC)
function nextRunDelay(hourUTC = 7, minuteUTC = 30) {
  const now = new Date();
  const nowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
  const todayRun = Date.UTC(nowUTC.getUTCFullYear(), nowUTC.getUTCMonth(), nowUTC.getUTCDate(), hourUTC, minuteUTC, 0, 0);
  let next = todayRun;
  if (nowUTC.getTime() >= todayRun) {
    // schedule for tomorrow
    next = todayRun + 24 * 3600 * 1000;
  }
  return next - nowUTC.getTime();
}

function startScheduler({ media = 'movie_ids', hourUTC = 7, minuteUTC = 30, retentionDays = DEFAULT_RETENTION_DAYS, onProgress, onBatch, onLine, onFinished, onError } = {}) {
  // stop if running
  stopScheduler();

  // one-off immediate run on startup (optional)
  fetchIfUpdated({ media, tryDays: 3, onProgress, onBatch, onLine, onFinished, onError }).catch((e) => {
    if (onError) onError(e);
  });

  // schedule next runs daily at the hour/minute UTC
  async function scheduleNext() {
    const delay = nextRunDelay(hourUTC, minuteUTC);
    schedulerTimer = setTimeout(async () => {
      try {
        await fetchIfUpdated({ media, tryDays: 3, onProgress, onBatch, onLine, onFinished, onError, saveDecompressed: true });
      } catch (e) {
        if (onError) onError(e);
      } finally {
        // always schedule next
        scheduleNext();
      }
    }, delay);
  }
  scheduleNext();
  // retentionDays used by cleanup logic on each fetch; keep global
  global.__tmdb_retention_days = retentionDays;
}

function stopScheduler() {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  if (runningFetchController && runningFetchController.abort) {
    runningFetchController.abort();
    runningFetchController = null;
  }
}

// manual fetch now
async function fetchNow(opts) {
  return fetchIfUpdated(opts);
}

module.exports = {
  startScheduler,
  stopScheduler,
  fetchNow,
  buildUrl,
  storageDir,
};
````


````javascript
// metadataStore.js
// Tiny metadata persister using JSON file in app.getPath('userData').
// Methods: save(key, record), get(key), remove(key), loadAll()
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = path.join(app.getPath('userData'), 'tmdb_metadata.json');

function loadAll() {
  try {
    if (!fs.existsSync(FILE)) return {};
    const raw = fs.readFileSync(FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    return {};
  }
}

function saveAll(obj) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {}
}

function save(key, record) {
  const all = loadAll();
  all[key] = record;
  saveAll(all);
}

function get(key) {
  const all = loadAll();
  return all[key] || null;
}

function remove(key) {
  const all = loadAll();
  delete all[key];
  saveAll(all);
}

module.exports = {
  save,
  get,
  remove,
  loadAll,
};
````


```javascript
// main.js (main process)
// Integrates tmdbService into Electron main, exposes IPC to renderer and starts scheduler.
// Add this to your existing main process bootstrap.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const tmdbService = require('./tmdbService');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  // Start the TMDB daily scheduler (example for movie_ids)
  tmdbService.startScheduler({
    media: 'movie_ids',
    hourUTC: 7,
    minuteUTC: 30,
    retentionDays: 90,
    onProgress: ({ loaded, total } = {}) => {
      mainWindow.webContents.send('tmdb-progress', { loaded, total });
    },
    onBatch: (rows) => {
      // send in batches to renderer
      mainWindow.webContents.send('tmdb-batch', rows);
    },
    onLine: (obj, count) => {
      // optional: frequent updates (we mostly send batches)
    },
    onFinished: (meta) => {
      mainWindow.webContents.send('tmdb-finished', meta);
    },
    onError: (err) => {
      mainWindow.webContents.send('tmdb-error', { message: err.message });
    },
  });
});

// IPC endpoints to allow UI/manual control
ipcMain.handle('tmdb-fetch-now', async (event, { media }) => {
  try {
    const result = await tmdbService.fetchNow({
      media: media || 'movie_ids',
      tryDays: 3,
      onProgress: ({ loaded, total }) => mainWindow.webContents.send('tmdb-progress', { loaded, total }),
      onBatch: (rows) => mainWindow.webContents.send('tmdb-batch', rows),
      onFinished: (meta) => mainWindow.webContents.send('tmdb-finished', meta),
      onError: (err) => mainWindow.webContents.send('tmdb-error', { message: err.message }),
    });
    return { ok: true, meta: result };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('tmdb-stop-scheduler', () => {
  tmdbService.stopScheduler();
  return { ok: true };
});

app.on('window-all-closed', () => {
  app.quit();
});
```


```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tmdb', {
  fetchNow: (opts) => ipcRenderer.invoke('tmdb-fetch-now', opts),
  stopScheduler: () => ipcRenderer.invoke('tmdb-stop-scheduler'),
  onProgress: (fn) => { ipcRenderer.on('tmdb-progress', (_, d) => fn(d)); },
  onBatch: (fn) => { ipcRenderer.on('tmdb-batch', (_, d) => fn(d)); },
  onFinished: (fn) => { ipcRenderer.on('tmdb-finished', (_, d) => fn(d)); },
  onError: (fn) => { ipcRenderer.on('tmdb-error', (_, d) => fn(d)); },
});
```


```javascript
// renderer.js - example usage
// Assumes index.html has startButton, fetchNowButton, stopButton and a container for list
const startBtn = document.getElementById('startScheduler');
const fetchBtn = document.getElementById('fetchNow');
const stopBtn = document.getElementById('stopScheduler');
const status = document.getElementById('status');
const list = document.getElementById('list');

window.tmdb.onProgress(({ loaded, total }) => {
  if (total) status.textContent = `Downloaded ${Math.round(loaded / 1024)} KB / ${Math.round(total / 1024)} KB`;
  else status.textContent = `Downloaded ${Math.round(loaded / 1024)} KB`;
});

window.tmdb.onBatch((rows) => {
  // rows is an array of parsed objects (each one is an exported object)
  for (const obj of rows) {
    const li = document.createElement('li');
    li.textContent = `id=${obj.id} adult=${obj.adult} popularity=${obj.popularity}`;
    list.appendChild(li);
  }
  // keep the UI from growing indefinitely in sample app
  while (list.childElementCount > 1000) list.removeChild(list.firstChild);
});

window.tmdb.onFinished((meta) => {
  status.textContent = `Finished. Processed ${meta.count} lines.`;
});

window.tmdb.onError((err) => {
  status.textContent = `Error: ${err.message || JSON.stringify(err)}`;
});

fetchBtn.addEventListener('click', async () => {
  status.textContent = 'Manual fetch started...';
  const result = await window.tmdb.fetchNow({ media: 'movie_ids' });
  if (!result.ok) {
    status.textContent = 'Fetch failed: ' + result.error;
  } else {
    status.textContent = 'Fetch enqueued/finished.';
  }
});

stopBtn.addEventListener('click', async () => {
  await window.tmdb.stopScheduler();
  status.textContent = 'Scheduler stopped.';
});
```

Implementation notes, tips and optional improvements

- Persistence: metadataStore.js is a tiny JSON file store. If you prefer, swap for electron-store or a small DB.
- Conditional GET: we use If-None-Match (ETag) and If-Modified-Since to avoid re-downloading unchanged files. The server may or may not provide these headers — we try both.
- Finding the latest file: the code checks today's export and falls back to previous days (tryDays). Adjust tryDays if you want a longer search window.
- Memory: streaming with gunzip + readline keeps memory usage low even for very large export files.
- Deleting .gz: the service deletes the downloaded compressed .json.gz after successful decompression. If you want to keep compressed files, remove that unlink step.
- Retention: cleanupOldRecords removes files older than retentionDays from the storage dir and prunes metadata. Adjust retentionDays to match TMDB's ~3-month availability or your own policy.
- Avoiding UI flooding: batches are sent using onBatch with DEFAULT_BATCH_SIZE (1000). Adjust to the needs of the app.
- Workers: if your main process is sensitive to CPU usage from parsing or heavy post-processing, consider performing heavy parsing or transforms inside a Worker thread or child process.
- Scheduling: we implemented an interval that calculates next run by UTC hour/minute; it runs immediately on startup and then daily at configured UTC time. If you prefer a cron-like schedule, you can integrate node-cron.
