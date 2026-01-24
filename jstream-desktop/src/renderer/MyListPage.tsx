import React, { useEffect, useRef, useState } from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { createPortal } from 'react-dom';
import { fetchTMDB } from '../utils/tmdbClient';

export default function MyListPage({ onPlay, onSelect }: { onPlay?: (id:number|string, type?:'movie'|'tv')=>void, onSelect?: (id:number|string, type?:'movie'|'tv')=>void }) {
  const [items, setItems] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [recentWatches, setRecentWatches] = useState<any[]>([]);
  const [filter, setFilter] = useState<'all' | 'recent' | 'favorites'>('all');
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverTrailerKey, setHoverTrailerKey] = useState<string | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const hoverTokenRef = useRef<number>(0);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewModalPos, setPreviewModalPos] = useState<{left:number,top:number}|null>(null);
  const hoverTargetIdRef = useRef<string | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const [previewAnimating, setPreviewAnimating] = useState(false);
  const [lastCardRect, setLastCardRect] = useState<DOMRect | null>(null);

  const ytOrigin = (() => {
    try { return window.location.origin; } catch (e) { return 'https://jstream.app'; }
  })();

  // Helper to fetch item details with logo
  async function fetchItemDetails(id: number, type: 'movie' | 'tv' | null): Promise<any | null> {
    try {
      let resolvedType: 'movie' | 'tv' = 'movie';
      let data: any = null;
      if (type) {
        resolvedType = type;
        data = await fetchTMDB(`${type}/${id}`);
      } else {
        try {
          resolvedType = 'movie';
          data = await fetchTMDB(`movie/${id}`);
        } catch (e) {
          resolvedType = 'tv';
          data = await fetchTMDB(`tv/${id}`);
        }
      }
      const backdrop = data.backdrop_path || null;
      const poster = data.poster_path || null;
      let logoPath: string | null = null;
      try {
        const images = await fetchTMDB(`${resolvedType}/${id}/images`);
        const logos = (images && (images as any).logos) || [];
        if (Array.isArray(logos) && logos.length > 0) {
          const eng = logos.find((l: any) => l.iso_639_1 === 'en') || logos[0];
          if (eng && eng.file_path) logoPath = eng.file_path;
        }
      } catch (e) {
        // ignore
      }
      return { id, type: resolvedType, data, backdrop, poster, logoPath };
    } catch (e) {
      return null;
    }
  }

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        const db = (window as any).database;
        
        // Load Recent Watches
        const recentNormalized: { id: number, type: 'movie' | 'tv' | null }[] = [];
        const recentSeen = new Set<string>();
        
        if (db && typeof db.recentWatchesGet === 'function') {
          const recent = await db.recentWatchesGet();
          if (Array.isArray(recent)) {
            for (const v of recent) {
              const num = Number(v);
              if (Number.isFinite(num)) {
                const key = `id:${num}`;
                if (!recentSeen.has(key)) {
                  recentSeen.add(key);
                  recentNormalized.push({ id: num, type: null });
                }
              }
            }
          } else if (recent && typeof recent === 'object') {
            const movieIds = Array.isArray(recent.movie) ? recent.movie : [];
            const tvIds = Array.isArray(recent.tv) ? recent.tv : [];
            for (const id of movieIds) {
              const num = Number(id);
              if (Number.isFinite(num)) {
                const key = `movie:${num}`;
                if (!recentSeen.has(key)) {
                  recentSeen.add(key);
                  recentNormalized.push({ id: num, type: 'movie' });
                }
              }
            }
            for (const id of tvIds) {
              const num = Number(id);
              if (Number.isFinite(num)) {
                const key = `tv:${num}`;
                if (!recentSeen.has(key)) {
                  recentSeen.add(key);
                  recentNormalized.push({ id: num, type: 'tv' });
                }
              }
            }
          }
        }
        
        // Also check watch history
        if (db && typeof db.watchHistoryList === 'function') {
          const history = await db.watchHistoryList();
          for (const h of history || []) {
            if (!h || typeof h.item_id === 'undefined' || h.item_id === null) continue;
            const raw = String(h.item_id);
            let type: 'movie' | 'tv' = 'movie';
            let idStr = raw;
            if (raw.includes(':')) {
              const parts = raw.split(':');
              type = (parts[0] === 'tv' ? 'tv' : 'movie');
              idStr = parts[1];
            }
            const id = Number(idStr);
            if (!id || Number.isNaN(id)) continue;
            const key = `${type}:${id}`;
            if (recentSeen.has(key)) continue;
            recentSeen.add(key);
            recentNormalized.push({ id, type });
          }
        }

        // Load Favorites
        const favoritesNormalized: { id: number, type: 'movie' | 'tv' }[] = [];
        if (db && typeof db.favoritesList === 'function') {
          const favList = await db.favoritesList();
          for (const f of favList || []) {
            if (!f || !f.item_id) continue;
            const id = Number(f.item_id);
            const type = f.item_type === 'tv' ? 'tv' : 'movie';
            if (Number.isFinite(id)) {
              favoritesNormalized.push({ id, type });
            }
          }
        }

        // Fetch details for recent watches
        const recentOut: any[] = [];
        for (const entry of recentNormalized) {
          if (!mounted) break;
          const item = await fetchItemDetails(entry.id, entry.type);
          if (item) recentOut.push({ ...item, source: 'recent' });
        }

        // Fetch details for favorites
        const favoritesOut: any[] = [];
        for (const entry of favoritesNormalized) {
          if (!mounted) break;
          const item = await fetchItemDetails(entry.id, entry.type);
          if (item) favoritesOut.push({ ...item, source: 'favorites' });
        }

        if (mounted) {
          setRecentWatches(recentOut);
          setFavorites(favoritesOut);
          // Combine all items, removing duplicates (favorites take precedence)
          const allItems: any[] = [];
          const seenKeys = new Set<string>();
          for (const item of favoritesOut) {
            const key = `${item.type}:${item.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              allItems.push(item);
            }
          }
          for (const item of recentOut) {
            const key = `${item.type}:${item.id}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              allItems.push(item);
            }
          }
          setItems(allItems);
        }
      } catch (e) {
        console.error('MyListPage: failed to load data', e);
        if (mounted) {
          setItems([]);
          setRecentWatches([]);
          setFavorites([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => { mounted = false; };
  }, []);

  // Get filtered items based on current filter
  const filteredItems = filter === 'all' ? items : filter === 'recent' ? recentWatches : favorites;

  useEffect(() => {
    function onClosePreviews() {
      try { if (previewTimeoutRef.current) { window.clearTimeout(previewTimeoutRef.current); previewTimeoutRef.current = null; } } catch (e) {}
      try { hoverTokenRef.current++; } catch (e) {}
      try { setHoverIndex(null); } catch (e) {}
      try { setHoverTrailerKey(null); } catch (e) {}
      try { setShowPreviewModal(false); } catch (e) {}
      try { setPreviewAnimating(false); } catch (e) {}
      try { hoverTargetIdRef.current = null; } catch (e) {}
    }
    window.addEventListener('app:close-previews', onClosePreviews as EventListener);
    return () => window.removeEventListener('app:close-previews', onClosePreviews as EventListener);
  }, []);

  // Update modal position to follow source card when scrolling/resizing
  useEffect(() => {
    let raf: any = 0;
    function updatePos() {
      const id = hoverTargetIdRef.current;
      if (!id) return;
      const el = document.querySelector(`[data-preview-target="${id}"]`) as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const TARGET_W = 420;
      const TARGET_H = 320;
      const MARGIN = 8;
      const halfW = TARGET_W / 2;
      const halfH = TARGET_H / 2;
      const minX = MARGIN + halfW;
      const maxX = (window.innerWidth || document.documentElement.clientWidth) - MARGIN - halfW;
      const minY = MARGIN + halfH;
      const maxY = (window.innerHeight || document.documentElement.clientHeight) - MARGIN - halfH;
      let x = centerX;
      let y = centerY;
      if (x < minX) x = minX;
      if (x > maxX) x = maxX;
      if (y < minY) y = minY;
      if (y > maxY) y = maxY;
      setPreviewModalPos({ left: x, top: y });
    }
    function onScrollOrResize() {
      if (!showPreviewModal) return;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updatePos);
    }
    if (showPreviewModal) {
      window.addEventListener('scroll', onScrollOrResize, { passive: true });
      window.addEventListener('resize', onScrollOrResize);
      updatePos();
      return () => {
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('scroll', onScrollOrResize as any);
        window.removeEventListener('resize', onScrollOrResize as any);
      };
    }
  }, [showPreviewModal]);

  function pauseHero() {
    try {
      const ctrl = (window as any).__appTrailerController;
      if (ctrl && typeof ctrl.pause === 'function') ctrl.pause();
      else window.dispatchEvent(new CustomEvent('app:pause-hero-trailer'));
    } catch (e) { window.dispatchEvent(new CustomEvent('app:pause-hero-trailer')); }
  }

  function resumeHero() {
    try {
      if ((window as any).__heroModalOpen) return;
      const ctrl = (window as any).__appTrailerController;
      if (ctrl && typeof ctrl.resume === 'function') ctrl.resume();
      else window.dispatchEvent(new CustomEvent('app:resume-hero-trailer'));
    } catch (e) { window.dispatchEvent(new CustomEvent('app:resume-hero-trailer')); }
  }

  async function handleDelete(id: number, type: 'movie' | 'tv', idx: number) {
    const deleteKey = `${type}-${id}`;
    setDeletingId(deleteKey);
    try {
      const db = (window as any).database;
      // Try to remove from watch history
      if (db && typeof db.watchHistoryDelete === 'function') {
        await db.watchHistoryDelete(`${type}:${id}`);
      }
      // Try to remove from recent watches
      if (db && typeof db.recentWatchesRemove === 'function') {
        await db.recentWatchesRemove(id, type);
      }
      // Try to remove from favorites
      if (db && typeof db.favoritesRemove === 'function') {
        await db.favoritesRemove(String(id), type);
      }
      // Remove from all local states
      const filterFn = (item: any) => !(item.id === id && item.type === type);
      setItems(prev => prev.filter(filterFn));
      setRecentWatches(prev => prev.filter(filterFn));
      setFavorites(prev => prev.filter(filterFn));
    } catch (e) {
      console.error('Failed to delete item:', e);
      // Still remove from local state even if DB operation fails
      const filterFn = (item: any) => !(item.id === id && item.type === type);
      setItems(prev => prev.filter(filterFn));
      setRecentWatches(prev => prev.filter(filterFn));
      setFavorites(prev => prev.filter(filterFn));
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return (
      <Box p={4} style={{ display: 'flex', justifyContent: 'center' }}>
        <Spinner />
      </Box>
    );
  }

  return (
    <section className="mylist-page">
      <div className="mylist-header">My List</div>
      <div className="mylist-filters" style={{ display: 'flex', gap: '8px', padding: '0 16px 16px', flexWrap: 'wrap' }}>
        <button
          className={`filter-chip ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          className={`filter-chip ${filter === 'recent' ? 'active' : ''}`}
          onClick={() => setFilter('recent')}
        >
          Recent Watches
        </button>
        <button
          className={`filter-chip ${filter === 'favorites' ? 'active' : ''}`}
          onClick={() => setFilter('favorites')}
        >
          Favorites
        </button>
      </div>
      {filteredItems.length === 0 ? (
        <div style={{ color: 'var(--muted)', padding: 12 }}>
          {filter === 'all' ? 'No items in your list yet.' : filter === 'recent' ? 'No recently watched items yet.' : 'No favorites yet.'}
        </div>
      ) : (
        <div className="mylist-grid">
          {filteredItems.map((it, idx) => {
            const key = `${it.type}-${it.id}-idx-${idx}`;
            return (
              <div
                key={key}
                className="continue-card mylist-card"
                role="listitem"
                tabIndex={0}
                onClick={() => onPlay ? onPlay(it.id, it.type) : (onSelect && onSelect(it.id, it.type))}
                onMouseEnter={async (e) => {
                  if (previewTimeoutRef.current) { window.clearTimeout(previewTimeoutRef.current); previewTimeoutRef.current = null; }
                  const token = ++hoverTokenRef.current;
                  try {
                    hoverTargetIdRef.current = key;
                    const elCur = e.currentTarget as HTMLElement | null;
                    if (elCur) elCur.setAttribute('data-preview-target', key);
                    setHoverIndex(idx);
                    setHoverLoading(true);
                    try {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setLastCardRect(rect);
                      let centerX = rect.left + rect.width / 2;
                      let centerY = rect.top + rect.height / 2;
                      const TARGET_W = 420;
                      const TARGET_H = 320;
                      const MARGIN = 8;
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
                      setShowPreviewModal(true);
                      requestAnimationFrame(() => requestAnimationFrame(() => setPreviewAnimating(true)));
                    } catch (e) {}

                    pauseHero();

                    const data = await fetchTMDB(`${it.type}/${it.id}/videos`, { language: 'en-US' });
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
                    if (chosen && (chosen.site || '').toLowerCase() === 'youtube' && chosen.key) setHoverTrailerKey(chosen.key);
                    else setHoverTrailerKey(null);
                  } catch (e) {
                    setHoverTrailerKey(null);
                  } finally {
                    setHoverLoading(false);
                  }
                }}
                onMouseLeave={() => {
                  setPreviewAnimating(false);
                  previewTimeoutRef.current = window.setTimeout(() => {
                    hoverTokenRef.current++;
                    setHoverIndex(null);
                    setHoverTrailerKey(null);
                    setShowPreviewModal(false);
                    resumeHero();
                    try {
                      const id = hoverTargetIdRef.current;
                      if (id) {
                        const el = document.querySelector(`[data-preview-target="${id}"]`) as HTMLElement | null;
                        if (el) el.removeAttribute('data-preview-target');
                      }
                    } catch (e) {}
                  }, 220);
                }}
              >
                {it.backdrop ? (
                  <div className="continue-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${it.backdrop})` }}>
                    {it.logoPath ? (
                      <img src={`https://image.tmdb.org/t/p/w300${it.logoPath}`} alt={it.data?.title || it.data?.name} className="continue-logo" />
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
            );
          })}
        </div>
      )}

      {showPreviewModal && previewModalPos && hoverIndex !== null && filteredItems[hoverIndex] ? createPortal(
        <div
          className={`preview-modal-overlay ${previewAnimating ? 'show' : ''}`}
          style={{ position: 'fixed', left: previewModalPos.left, top: previewModalPos.top, zIndex: 2147483647,
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
              resumeHero();
            }, 220);
          }}
        >
          <div className="preview-modal" role="dialog" aria-hidden={!previewAnimating}>
            <div className="preview-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/original${filteredItems[hoverIndex].backdrop})` }}>
              {hoverTrailerKey ? (
                <iframe
                  className="preview-iframe"
                  src={`https://www.youtube.com/embed/${hoverTrailerKey}?rel=0&autoplay=1&mute=0&controls=0&playsinline=1&modestbranding=1&enablejsapi=1&origin=${encodeURIComponent(ytOrigin)}`}
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
                    const it = filteredItems[hoverIndex];
                    if (onPlay && it) {
                      onPlay(it.id, it.type);
                      return;
                    }
                    try {
                      const el = document.querySelector('.preview-iframe') as HTMLIFrameElement | null;
                      if (el && el.contentWindow) {
                        el.contentWindow.postMessage('{"event":"command","func":"unMute","args":""}', '*');
                        el.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                      }
                    } catch (e) {}
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor"/></svg>
                    <span>Play</span>
                  </button>
                  <button className="preview-btn remove" aria-label="Remove from list" onClick={async (ev) => {
                    ev.stopPropagation();
                    const it = filteredItems[hoverIndex];
                    const idx = hoverIndex;
                    // Close the modal first
                    setShowPreviewModal(false);
                    setHoverIndex(null);
                    setHoverTrailerKey(null);
                    resumeHero();
                    // Then delete the item
                    await handleDelete(it.id, it.type, idx);
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
                <div className="preview-actions-right">
                  <button className="preview-btn" aria-label="More info" onClick={(ev) => {
                    ev.stopPropagation();
                    const it = filteredItems[hoverIndex];
                    try { window.dispatchEvent(new Event('app:close-previews')); } catch (e) {}
                    if (typeof onSelect === 'function' && it) onSelect(it.id, it.type);
                    else window.dispatchEvent(new CustomEvent('app:open-details', { detail: { id: it?.id, type: it?.type } }));
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span>More info</span>
                  </button>
                </div>
              </div>
              <div className="preview-metadata">
                <span className="cert">{filteredItems[hoverIndex].data?.adult ? '18+' : (filteredItems[hoverIndex].data?.certification || '')}</span>
                <span className="duration">{(filteredItems[hoverIndex].data?.runtime || (filteredItems[hoverIndex].data?.episode_run_time && filteredItems[hoverIndex].data?.episode_run_time[0])) ? `${filteredItems[hoverIndex].data?.runtime || filteredItems[hoverIndex].data?.episode_run_time[0]}m` : ''}</span>
                <span className="rating">{filteredItems[hoverIndex].data?.vote_average ? `${filteredItems[hoverIndex].data.vote_average.toFixed(1)}/10` : ''}</span>
              </div>
              <div className="preview-title">
                {filteredItems[hoverIndex].type === 'tv' ? `S1:E1 ${filteredItems[hoverIndex].data?.name || filteredItems[hoverIndex].data?.title}` : (filteredItems[hoverIndex].data?.title || filteredItems[hoverIndex].data?.name)}
              </div>
            </div>
          </div>
        </div>, document.body) : null}
    </section>
  );
}
