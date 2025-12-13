const { parentPort, workerData } = require('worker_threads');
const fetch = require('node-fetch');
const zlib = require('zlib');
const split2 = require('split2');
const Database = require('better-sqlite3');

(async () => {
  const { url, dbPath, mediaType, dateTag } = workerData;
  try {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        media_type TEXT,
        adult INTEGER,
        popularity REAL,
        video INTEGER,
        raw_json TEXT,
        title TEXT,
        poster_path TEXT
      );
    `);

    const insert = db.prepare(`
      INSERT OR REPLACE INTO items
      (id, media_type, adult, popularity, video, raw_json, title, poster_path)
      VALUES (@id, @media_type, @adult, @popularity, @video, @raw_json, @title, @poster_path)
    `);

    const insertMany = db.transaction((rows) => {
      for (const r of rows) insert.run(r);
    });

    parentPort.postMessage({ status: 'starting', url });

    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch ' + res.status);

    const gunzip = zlib.createGunzip();
    const lineStream = res.body.pipe(gunzip).pipe(split2());

    let buffer = [];
    let count = 0;
    const BATCH = 1000;

    for await (const line of lineStream) {
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        // Many export lines may not contain poster_path/title. Use safe extraction.
        const title = obj.title || obj.name || null;
        const poster_path = obj.poster_path || obj.profile_path || null;
        buffer.push({
          id: obj.id,
          media_type: mediaType || obj.media_type || 'movie',
          adult: obj.adult ? 1 : 0,
          popularity: obj.popularity || 0,
          video: obj.video ? 1 : 0,
          raw_json: JSON.stringify(obj),
          title,
          poster_path
        });
      } catch (err) {
        parentPort.postMessage({ status: 'warn', message: 'json-parse-error' });
      }
      if (buffer.length >= BATCH) {
        insertMany(buffer);
        count += buffer.length;
        buffer = [];
        parentPort.postMessage({ status: 'progress', count });
      }
    }

    if (buffer.length) {
      insertMany(buffer);
      count += buffer.length;
      parentPort.postMessage({ status: 'progress', count });
    }

    parentPort.postMessage({ status: 'done', count });
    process.exit(0);
  } catch (err) {
    parentPort.postMessage({ status: 'error', message: err.message });
    process.exit(1);
  }
})();
