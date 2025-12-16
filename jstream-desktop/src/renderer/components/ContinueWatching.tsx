import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchTMDB } from '../../utils/tmdbClient';
import RowScroller from './RowScroller';

export default function ContinueWatching({ onPlay, onSelect }: { onPlay?: (id:number|string, type?:'movie'|'tv')=>void, onSelect?: (id:number|string, type?:'movie'|'tv')=>void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [debugRaw, setDebugRaw] = useState<any>(null);
  const [debugNormalized, setDebugNormalized] = useState<any>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [pagerIndex, setPagerIndex] = useState(0);
  const [pagerCount, setPagerCount] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverTrailerKey, setHoverTrailerKey] = useState<string | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const hoverTokenRef = useRef<number>(0);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewModalPos, setPreviewModalPos] = useState<{left:number,top:number}|null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const [previewAnimating, setPreviewAnimating] = useState(false);
  const [lastCardRect, setLastCardRect] = useState<DOMRect | null>(null);

  // add/remove a body class to avoid clipping by making surrounding rows overflow visible
  useEffect(() => {
    if (showPreviewModal) {
      document.body.classList.add('preview-open');
    } else {
      document.body.classList.remove('preview-open');
    }
    return () => { document.body.classList.remove('preview-open'); };
  }, [showPreviewModal]);

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
            const backdrop = data.backdrop_path || null;
            const poster = data.poster_path || null;
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

            out.push({ id, type, data, backdrop, poster, logoPath });
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

  // Keyboard navigation and focus scroll
  useEffect(() => {
    function keyHandler(e: KeyboardEvent) {
      if (focusedIndex === null) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = Math.min((focusedIndex ?? 0) + 1, (items || []).length - 1);
        setFocusedIndex(next);
        scrollToIndex(next);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = Math.max((focusedIndex ?? 0) - 1, 0);
        setFocusedIndex(prev);
        scrollToIndex(prev);
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const it = items[focusedIndex ?? 0];
        if (it) {
          if (onPlay) onPlay(it.id, it.type);
          else if (onSelect) onSelect(it.id, it.type);
        }
      }
    }
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [focusedIndex, items, onPlay, onSelect]);

  function scrollToIndex(idx: number) {
    const container = scrollerRef.current;
    if (!container) return;
    const child = container.children[idx] as HTMLElement | undefined;
    if (child) child.scrollIntoView({ behavior: 'smooth', inline: 'center' });
  }

  // scroller behavior is handled by RowScroller (carousel) below

  // Infinite wrap logic removed: Continue Watching now renders a single set (no infinite carousel).

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="continue-title">Continue Watching</h2>
        <div style={{ marginLeft: 'auto' }}>
          <div className="row-page-indicator-inline" aria-hidden>
            <div className="bar-list">
              {Array.from({ length: pagerCount }).map((_, i) => (
                <svg key={i} className={`bar ${i === pagerIndex ? 'active' : ''}`} width="28" height="6" viewBox="0 0 28 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect width="28" height="6" rx="0" fill="currentColor" />
                </svg>
              ))}
            </div>
          </div>
        </div>
      </div>
      <RowScroller scrollerRef={scrollerRef} className="continue-scroll" showPager={false} disableWheel={true} itemCount={items.length} itemsPerPage={5} onPageChange={(idx, count) => { setPagerIndex(idx); setPagerCount(count); }}>
        {/** Render items once (infinite carousel disabled) */}
        {(() => {
          const copies = 1; // single set only
          const out: any[] = [];
          for (let c = 0; c < copies; c++) {
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              const key = `${it.type}-${it.id}-idx-${i}`;
              out.push({ it, key, idx: i });
            }
          }
          return out.map((entry, renderedIndex) => (
            <div key={entry.key} className={`continue-card`} role="listitem" onClick={() => onPlay ? onPlay(entry.it.id, entry.it.type) : (onSelect && onSelect(entry.it.id, entry.it.type))} tabIndex={0} onFocus={() => setFocusedIndex(entry.idx)}
            onMouseEnter={async (e) => {
              // clear any pending hide timers
              if (previewTimeoutRef.current) { window.clearTimeout(previewTimeoutRef.current); previewTimeoutRef.current = null; }
              const token = ++hoverTokenRef.current;
              try {
                setHoverIndex(entry.idx);
                setHoverLoading(true);
                // compute modal position (fixed) above the card if possible
                try {
                  const el = e.currentTarget as HTMLElement;
                  const rect = el.getBoundingClientRect();
                  setLastCardRect(rect);
                  // compute center point of the card in viewport coords
                  let centerX = rect.left + rect.width / 2;
                  let centerY = rect.top + rect.height / 2;
                  // Clamp modal center so expanded modal doesn't clip off-screen.
                  // Use the same target size as the CSS variables (360x280) and a small viewport margin.
                  const TARGET_W = 420;
                  const TARGET_H = 320;
                  const MARGIN = 8; // px
                  const halfW = TARGET_W / 2;
                  const halfH = TARGET_H / 2;
                  const minX = MARGIN + halfW;
                  const maxX = (window.innerWidth || document.documentElement.clientWidth) - MARGIN - halfW;
                  const minY = MARGIN + halfH;
                  const maxY = (window.innerHeight || document.documentElement.clientHeight) - MARGIN - halfH;
                  if (centerX < minX) centerX = minX;
                  if (centerX > maxX) centerX = maxX;
                  if (centerY < minY) centerY = minY;
                  if (centerY > maxY) centerY = maxY;
                  setPreviewModalPos({ left: centerX, top: centerY });
                  // show modal and start enter animation next frame
                  setShowPreviewModal(true);
                  requestAnimationFrame(() => requestAnimationFrame(() => setPreviewAnimating(true)));
                } catch (e) {
                  // ignore
                }
                // pause global hero trailer while preview opens
                try {
                  const ctrl = (window as any).__appTrailerController;
                  if (ctrl && typeof ctrl.pause === 'function') ctrl.pause();
                  else window.dispatchEvent(new CustomEvent('app:pause-hero-trailer'));
                } catch (e) { window.dispatchEvent(new CustomEvent('app:pause-hero-trailer')); }

                // fetch videos for this item
                const typePath = entry.it.type || 'movie';
                const data = await fetchTMDB(`${typePath}/${entry.it.id}/videos`, { language: 'en-US' });
                if (token !== hoverTokenRef.current) {
                  setHoverLoading(false);
                  return;
                }
                const results: any[] = data?.results || [];
                const typePriority = ['Trailer','Teaser','Featurette','Clip','Behind the Scenes','Bloopers'];
                let chosen: any = null;
                for (const t of typePriority) {
                  const candidates = results.filter((v:any) => v.type === t);
                  if (candidates.length === 0) continue;
                  chosen = candidates.find((v:any) => v.official === true) || candidates[0];
                  break;
                }
                if (!chosen && results.length > 0) chosen = results[0];
                if (chosen && (chosen.site || '').toLowerCase() === 'youtube' && chosen.key) {
                  setHoverTrailerKey(chosen.key);
                } else {
                  setHoverTrailerKey(null);
                }
              } catch (e) {
                console.error('ContinueWatching: failed to fetch preview videos', e);
                setHoverTrailerKey(null);
              } finally {
                setHoverLoading(false);
              }
            }}
            onMouseLeave={() => {
              // start close animation and hide modal after delay to allow entering modal
              setPreviewAnimating(false);
              previewTimeoutRef.current = window.setTimeout(() => {
                hoverTokenRef.current++;
                setHoverIndex(null);
                setHoverTrailerKey(null);
                setShowPreviewModal(false);
                // resume hero trailer
                try {
                  const ctrl = (window as any).__appTrailerController;
                  if (ctrl && typeof ctrl.resume === 'function') ctrl.resume();
                  else window.dispatchEvent(new CustomEvent('app:resume-hero-trailer'));
                } catch (e) { window.dispatchEvent(new CustomEvent('app:resume-hero-trailer')); }
              }, 220);
            }}
          >
            {entry.it.backdrop ? (
              <div className="continue-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/original${entry.it.backdrop})` }}>
                {entry.it.logoPath ? (
                  <img src={`https://image.tmdb.org/t/p/w300${entry.it.logoPath}`} alt={entry.it.data?.title || entry.it.data?.name} className="continue-logo"/>
                ) : (
                  <div className="continue-logo-text">{entry.it.data?.title || entry.it.data?.name}</div>
                )}
                {/* Trailer overlay moved into modal; card itself no longer shows inline trailer */}
              </div>
            ) : (
              <div className="continue-backdrop placeholder">
                <div className="continue-logo-text">{entry.it.data?.title || entry.it.data?.name}</div>
              </div>
            )}
          </div>
          ));
        })()}
      </RowScroller>
      {/* Infinite wrap logic is handled in a hook before return */}
      {/* Render modal via portal so it's fixed to the viewport and not affected by ancestor transforms */}
        {showPreviewModal && previewModalPos && hoverIndex !== null && items[hoverIndex] ? createPortal(
          <div
            className={`preview-modal-overlay ${previewAnimating ? 'show' : ''}`}
            style={{ position: 'fixed', left: previewModalPos.left, top: previewModalPos.top, zIndex: 2147483647, // set CSS vars for animation start/target
              ['--init-w' as any]: lastCardRect ? `${lastCardRect.width}px` : '232.962px',
              ['--init-h' as any]: lastCardRect ? `${lastCardRect.height}px` : '131.163px',
              ['--target-w' as any]: '420px',
              ['--target-h' as any]: '320px'
            }}
            onMouseEnter={() => { if (previewTimeoutRef.current) { window.clearTimeout(previewTimeoutRef.current); previewTimeoutRef.current = null; } setPreviewAnimating(true); }}
            onMouseLeave={() => {
              setPreviewAnimating(false);
              previewTimeoutRef.current = window.setTimeout(() => {
                setShowPreviewModal(false);
                setHoverIndex(null);
                setHoverTrailerKey(null);
                // Resume global hero trailer when the modal is closed from the modal itself
                try {
                  const ctrl = (window as any).__appTrailerController;
                  if (ctrl && typeof ctrl.resume === 'function') ctrl.resume();
                  else window.dispatchEvent(new CustomEvent('app:resume-hero-trailer'));
                } catch (e) { window.dispatchEvent(new CustomEvent('app:resume-hero-trailer')); }
              }, 220);
            }}
          >
            <div className="preview-modal" role="dialog" aria-hidden={!previewAnimating}>
              <div className="preview-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/original${items[hoverIndex].backdrop})` }}>
                {hoverTrailerKey ? (
                  <iframe
                    className="preview-iframe"
                    src={`https://www.youtube.com/embed/${hoverTrailerKey}?rel=0&autoplay=1&mute=0&controls=0&playsinline=1&modestbranding=1&enablejsapi=1`}
                    title="Preview"
                    frameBorder="0"
                    allow="autoplay; encrypted-media"
                    style={{ pointerEvents: 'none' }}
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
              <div className="preview-info">
                <div className="preview-actions">
                  <div className="preview-actions-left">
                    <button className="preview-btn play" aria-label="Play" onClick={(e) => {
                      e.stopPropagation();
                      // Prefer app-level handler if provided
                      const it = items[hoverIndex];
                      if (onPlay && it) {
                        onPlay(it.id, it.type);
                        return;
                      }
                      // Otherwise attempt to unmute and play the embedded YouTube iframe via postMessage
                      try {
                        const el = document.querySelector('.preview-iframe') as HTMLIFrameElement | null;
                        if (el && el.contentWindow) {
                          // Unmute then play using YouTube JS API commands
                          el.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*');
                          el.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                        }
                      } catch (e) { /* ignore */ }
                    }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>
                      <span>Play</span>
                    </button>
                    <button className="preview-btn" aria-label="Add to list" onClick={async (ev) => {
                      ev.stopPropagation();
                      const it = items[hoverIndex];
                      try {
                        const db = (window as any).database;
                        if (db && typeof db.favoritesAdd === 'function') {
                          await db.favoritesAdd(String(it.id), it.type || 'movie');
                          console.debug('ContinueWatching: added to favorites', it.id);
                        } else if (db && typeof db.watchlistAdd === 'function') {
                          await db.watchlistAdd(String(it.id), it.type || 'movie');
                          console.debug('ContinueWatching: added to watchlist', it.id);
                        } else {
                          console.debug('ContinueWatching: no DB add function available');
                        }
                      } catch (e) { console.error('ContinueWatching: add to list failed', e); }
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </div>
                  <div className="preview-actions-right">
                    <button className="preview-btn" aria-label="More info" onClick={(ev) => {
                      ev.stopPropagation();
                      const it = items[hoverIndex];
                      if (typeof onSelect === 'function' && it) {
                        onSelect(it.id, it.type);
                      } else {
                        // fallback: dispatch a global event that other parts can listen to
                        window.dispatchEvent(new CustomEvent('app:open-details', { detail: { id: it?.id, type: it?.type } }));
                      }
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      <span>More info</span>
                    </button>
                  </div>
                </div>
                <div className="preview-metadata">
                  <span className="cert">{items[hoverIndex].data?.adult ? '18+' : (items[hoverIndex].data?.certification || '')}</span>
                  <span className="duration">{(items[hoverIndex].data?.runtime || (items[hoverIndex].data?.episode_run_time && items[hoverIndex].data?.episode_run_time[0])) ? `${items[hoverIndex].data?.runtime || items[hoverIndex].data?.episode_run_time[0]}m` : ''}</span>
                  <span className="rating">{items[hoverIndex].data?.vote_average ? `${items[hoverIndex].data.vote_average.toFixed(1)}/10` : ''}</span>
                </div>
                <div className="preview-title">
                  {items[hoverIndex].type === 'tv' ? `S1:E1 ${items[hoverIndex].data?.name || items[hoverIndex].data?.title}` : (items[hoverIndex].data?.title || items[hoverIndex].data?.name)}
                </div>
              </div>
            </div>
          </div>, document.body) : null}

        {/* Dev debug overlay: show card rect and modal rect when enabled */}
        { (window as any).__DEV_PREVIEW_DEBUG && lastCardRect && previewModalPos ? createPortal(
          <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', width: '100%', height: '100%', zIndex: 2147483646 }}>
            <div style={{ position: 'absolute', left: lastCardRect.left + window.scrollX, top: lastCardRect.top + window.scrollY, width: lastCardRect.width, height: lastCardRect.height, border: '2px solid rgba(0,128,255,0.9)', boxSizing: 'border-box' }} />
            <div style={{ position: 'absolute', left: previewModalPos.left - 180, top: previewModalPos.top - 110, width: 360, height: 220, border: '2px dashed rgba(255,0,0,0.9)', boxSizing: 'border-box' }} />
          </div>, document.body) : null }
    </section>
  );
}
