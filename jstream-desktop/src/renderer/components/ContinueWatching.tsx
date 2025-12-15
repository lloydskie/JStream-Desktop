import React, { useEffect, useState } from 'react';
import { fetchTMDB } from '../../utils/tmdbClient';

export default function ContinueWatching({ onPlay, onSelect }: { onPlay?: (id:number|string, type?:'movie'|'tv')=>void, onSelect?: (id:number|string, type?:'movie'|'tv')=>void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugRaw, setDebugRaw] = useState<any>(null);
  const [debugNormalized, setDebugNormalized] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        let recentRaw: any;
        // Try DB helper for recent watches
        // Dev override: set `window.__DEV_RECENT_WATCHES = [...]` in DevTools to test
        // without relying on the app database. This is only for local debugging.
        const db = (window as any).database;
        if ((window as any).__DEV_RECENT_WATCHES) {
          recentRaw = (window as any).__DEV_RECENT_WATCHES;
        } else {
          let recentRawLocal: any = [];
          try {
            if (db && typeof db.watchHistoryList === 'function') {
              const history = await db.watchHistoryList();
              // Parse item_id like "movie:123" or just "123" into { id: 123, type: 'movie' }
              recentRawLocal = history.map((h: any) => {
                const itemId = h.item_id;
                if (itemId.includes(':')) {
                  const [type, idStr] = itemId.split(':');
                  return { id: Number(idStr), type: type || 'movie' };
                } else {
                  // Assume movie if no type
                  return { id: Number(itemId), type: 'movie' };
                }
              });
            }
          } catch (e) {
            // ignore
          }
          recentRaw = recentRawLocal;
        }
        // fallback: last_selected_movie personalization
        if ((!recentRaw || (Array.isArray(recentRaw) && recentRaw.length === 0)) && db && typeof db.getPersonalization === 'function') {
          try {
            const last = await db.getPersonalization('last_selected_movie');
            if (last) {
              recentRaw = [{ id: Number(last), type: 'movie' }];
            }
          } catch (e) { /* ignore */ }
        }

        // Normalize recentRaw into an array of entries
        let recent: any[] = [];
        if (Array.isArray(recentRaw)) {
          recent = recentRaw;
        } else if (recentRaw && typeof recentRaw === 'object') {
          // common shapes: { items: [...] } or { recent: [...] }
          if (Array.isArray(recentRaw.items)) recent = recentRaw.items;
          else if (Array.isArray(recentRaw.recent)) recent = recentRaw.recent;
          else recent = [recentRaw];
        } else if (typeof recentRaw === 'string') {
          // Try JSON first
          try {
            const parsed = JSON.parse(recentRaw);
            if (Array.isArray(parsed)) recent = parsed;
            else recent = [parsed];
          } catch (e) {
            // Some DB outputs may be a human-readable block like:
            // "id": 603,\n"type": "movie"\n"id": 27205, ...
            // Try to extract id/type pairs via regex and fall back to comma-separated numbers.
            const idMatches = Array.from(recentRaw.matchAll(/id[^0-9]*(\d+)/gi)).map(m => m[1]);
            const typeMatches = Array.from(recentRaw.matchAll(/type[^a-zA-Z]*(movie|tv)/gi)).map(m => m[1]);
            if (idMatches.length > 0) {
              recent = idMatches.map((idStr, idx) => ({ id: Number(idStr), type: (typeMatches[idx] || 'movie') }));
            } else {
              // try comma or newline separated ids
              const parts = recentRaw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
              if (parts.length > 0) {
                // if parts look like numbers, map to ids
                const numeric = parts.filter(p => /^\d+$/.test(p));
                if (numeric.length === parts.length) recent = numeric.map(p => ({ id: Number(p), type: 'movie' }));
                else {
                  // last resort: try to parse any numbers in the text
                  const anyIds = Array.from(recentRaw.matchAll(/(\d{2,7})/g)).map(m => m[1]);
                  if (anyIds.length > 0) recent = anyIds.map(idStr => ({ id: Number(idStr), type: 'movie' }));
                }
              }
            }
          }
        }

        console.debug('ContinueWatching: recentRaw ->', recentRaw);
        console.debug('ContinueWatching: normalized recent ->', recent);
        // expose to UI for easier debugging
        try { setDebugRaw(recentRaw); } catch (e) {}
        try { setDebugNormalized(recent); } catch (e) {}

        if (!recent || recent.length === 0) {
          if (mounted) setItems([]);
          return;
        }

        const out: any[] = [];
        // limit to 8 items
        for (const entry of recent.slice(0,8)) {
          if (!entry) continue;
          let id: number | null = null;
          if (typeof entry === 'number' || typeof entry === 'string') id = Number(entry);
          else id = Number(entry.tmdbId || entry.tmdb_id || entry.id || entry.movieId || entry.mediaId || entry.tmdb || entry.itemId || null);
          if (!id || Number.isNaN(id)) continue;
          const type = (entry.type || entry.itemType || entry.mediaType || (entry.tv ? 'tv' : undefined) || 'movie') as 'movie'|'tv';
          console.log(`ContinueWatching: trying to fetch ${type}/${id}`);
          try {
            const data = await fetchTMDB(`${type}/${id}`);
            console.log(`ContinueWatching: fetched ${type}/${id} successfully`);
            if (!mounted) break;
            const backdrop = data.backdrop_path || data.poster_path || null;
            // try to fetch logos (images endpoint) — prefer english
            let logoPath: string | null = null;
            try {
              const images = await fetchTMDB(`${type}/${id}/images`);
              const logos = (images && (images as any).logos) || (images && (images as any).logos) || [];
              if (Array.isArray(logos) && logos.length > 0) {
                const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
                if (eng && eng.file_path) logoPath = eng.file_path;
              }
            } catch (e) {
              // ignore
            }

            out.push({ id, type, data, backdrop, logoPath });
          } catch (e) {
            console.log(`ContinueWatching: failed to fetch ${type}/${id}`, e);
            // ignore item
          }
        }

        if (mounted) setItems(out);
      } catch (e) {
        console.error('ContinueWatching: failed to load recent items', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; }
  }, []);

    // Expose a small debug control when a dev flag is set so we can inspect
  // the raw recent data in the running app without modifying the DB.
  function renderDebugDump() {
    if (!(window as any).__DEV_CONTINUE_WATCHING_DEBUG) return null;
    return (
      <button onClick={async () => {
        try {
          const db = (window as any).database;
          let raw = null;
          if (db && typeof db.getRecentWatches === 'function') raw = await db.getRecentWatches();
          console.info('ContinueWatching DEBUG: getRecentWatches ->', raw);
        } catch (e) { console.error('ContinueWatching DEBUG failed', e); }
      }} style={{ marginLeft: 8, fontSize: 12, padding: '6px 8px' }}>Dump recent</button>
    );
  }

  // If no items, render a small placeholder so it's obvious the feed attempted to load.
  if (!items || items.length === 0) {
    return (
      <section className="continue-row">
          <h2 className="continue-title">Continue Watching</h2>
          <div style={{ color: 'var(--muted)', padding: 12 }}>No recent items to continue.</div>
          {(window as any).__DEV_CONTINUE_WATCHING_DEBUG ? (
            <div style={{ padding: 8, color: '#ccc', fontSize: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Debug — raw recent value:</div>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#ccc', fontSize: 12 }}>{JSON.stringify(debugRaw || (window as any).__DEV_RECENT_WATCHES || 'no raw data', null, 2)}</pre>
              <div style={{ fontWeight: 700, marginTop: 8, marginBottom: 6 }}>Debug — normalized recent array:</div>
              <pre style={{ whiteSpace: 'pre-wrap', color: '#ccc', fontSize: 12 }}>{JSON.stringify(debugNormalized || 'no normalized data', null, 2)}</pre>
            </div>
          ) : null}
        </section>
    );
  }

  return (
    <section className="continue-row">
      <h2 className="continue-title">Continue Watching</h2>
      <div className="continue-scroll" role="list">
        {items.map((it:any) => (
          <div key={`${it.type}-${it.id}`} className="continue-card" role="listitem" onClick={() => onPlay ? onPlay(it.id, it.type) : (onSelect && onSelect(it.id, it.type))}>
            {it.backdrop ? (
              <div className="continue-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/original${it.backdrop})` }}>
                {it.logoPath ? (
                  <img src={`https://image.tmdb.org/t/p/w300${it.logoPath}`} alt={it.data?.title || it.data?.name} className="continue-logo"/>
                ) : (
                  <div className="continue-logo-text">{it.data?.title || it.data?.name}</div>
                )}
              </div>
            ) : (
              <div className="continue-backdrop placeholder">
                <div className="continue-logo-text">{it.data?.title || it.data?.name}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
