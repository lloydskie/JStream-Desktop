import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchTMDB } from '../../utils/tmdbClient';
import RowScroller from './RowScroller';

export default function TopSearches({ onPlay, onSelect }: { onPlay?: (id:number|string, type?:'movie'|'tv')=>void, onSelect?: (id:number|string, type?:'movie'|'tv')=>void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
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
  const hoverTargetIdRef = useRef<string | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  const [previewAnimating, setPreviewAnimating] = useState(false);
  const [lastCardRect, setLastCardRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (showPreviewModal) {
      document.body.classList.add('preview-open');
    } else {
      document.body.classList.remove('preview-open');
    }
    return () => { document.body.classList.remove('preview-open'); };
  }, [showPreviewModal]);

  // Listen for app-level request to forcibly close any open preview modal
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

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      try {
        // Fetch trending movies and tv for today
        const movies = await fetchTMDB('trending/movie/day');
        const tv = await fetchTMDB('trending/tv/day');
        const movieList = (movies.results || []).slice(0,5).map((m:any) => ({ id: m.id, type: 'movie' }));
        const tvList = (tv.results || []).slice(0,5).map((t:any) => ({ id: t.id, type: 'tv' }));

        // Combine and randomize
        const combined = [...movieList, ...tvList];
        for (let i = combined.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [combined[i], combined[j]] = [combined[j], combined[i]];
        }

        const out: any[] = [];
        for (const entry of combined) {
          if (!entry) continue;
          const id = Number(entry.id);
          const type = entry.type || 'movie';
          try {
            const data = await fetchTMDB(`${type}/${id}`);
            const backdrop = data.backdrop_path || null;
            const poster = data.poster_path || null;
            let logoPath: string | null = null;
            try {
              const images = await fetchTMDB(`${type}/${id}/images`);
              const logos = (images && (images as any).logos) || [];
              if (Array.isArray(logos) && logos.length > 0) {
                const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
                if (eng && eng.file_path) logoPath = eng.file_path;
              }
            } catch (e) {}
            out.push({ id, type, data, backdrop, poster, logoPath });
          } catch (e) {
            // ignore individual failures
          }
        }
        if (mounted) setItems(out);
      } catch (e) {
        console.error('TopSearches: failed to load trending items', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

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

  // Update modal position to follow the source card when page scrolls/resizes
  useEffect(() => {
    let raf = 0 as any;
    function updatePos() {
      const id = hoverTargetIdRef.current;
      if (!id) return;
      const el = document.querySelector(`[data-preview-target="${id}"]`) as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // update position using same clamping logic
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
      if (!previewModalPos) return;
      // throttle with requestAnimationFrame
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(updatePos);
    }

    if (showPreviewModal) {
      window.addEventListener('scroll', onScrollOrResize, { passive: true });
      window.addEventListener('resize', onScrollOrResize);
      // also listen to the scroller container in case the row is scrolled inside a scrollable element
      const scrollerEl = scrollerRef.current as HTMLElement | null;
      if (scrollerEl && scrollerEl.addEventListener) scrollerEl.addEventListener('scroll', onScrollOrResize, { passive: true });
      // also run once to align position
      updatePos();
      return () => {
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('scroll', onScrollOrResize as any);
        window.removeEventListener('resize', onScrollOrResize as any);
        if (scrollerEl && scrollerEl.removeEventListener) scrollerEl.removeEventListener('scroll', onScrollOrResize as any);
      };
    }
  }, [showPreviewModal, previewModalPos]);

  if (!items || items.length === 0) {
    return (
      <section className="continue-row">
        <h2 className="continue-title">Top Searches</h2>
        <div style={{ color: 'var(--muted)', padding: 12 }}>{loading ? 'Loading...' : 'No trending items found.'}</div>
      </section>
    );
  }

  return (
    <section className="continue-row">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 className="continue-title">Top Searches</h2>
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
        {(() => {
          const out: any[] = [];
          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const key = `${it.type}-${it.id}-idx-${i}`;
            out.push({ it, key, idx: i });
          }
          return out.map((entry, renderedIndex) => (
            <div key={entry.key} data-preview-target={entry.key} className={`continue-card`} role="listitem" onClick={() => onPlay ? onPlay(entry.it.id, entry.it.type) : (onSelect && onSelect(entry.it.id, entry.it.type))} tabIndex={0} onFocus={() => setFocusedIndex(entry.idx)}
              onMouseEnter={async (e) => {
                if (previewTimeoutRef.current) { window.clearTimeout(previewTimeoutRef.current); previewTimeoutRef.current = null; }
                const token = ++hoverTokenRef.current;
                try {
                  // remember which element opened the preview so the modal can track it on scroll
                  hoverTargetIdRef.current = entry.key;
                  setHoverIndex(entry.idx);
                  setHoverLoading(true);
                  try {
                    const el = e.currentTarget as HTMLElement;
                    const rect = el.getBoundingClientRect();
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
                  // clear hover target and resume hero trailer when preview closes
                  hoverTargetIdRef.current = null;
                  try {
                    if (!(window as any).__heroModalOpen) {
                      const ctrl = (window as any).__appTrailerController;
                      if (ctrl && typeof ctrl.resume === 'function') ctrl.resume();
                      else window.dispatchEvent(new CustomEvent('app:resume-hero-trailer'));
                    }
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
      {showPreviewModal && previewModalPos && hoverIndex !== null && items[hoverIndex] ? createPortal(
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
              // clear hover target and resume hero trailer when preview modal closes
              hoverTargetIdRef.current = null;
              try {
                if (!(window as any).__heroModalOpen) {
                  const ctrl = (window as any).__appTrailerController;
                  if (ctrl && typeof ctrl.resume === 'function') ctrl.resume();
                  else window.dispatchEvent(new CustomEvent('app:resume-hero-trailer'));
                }
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
                    const it = items[hoverIndex];
                    if (onPlay && it) {
                      onPlay(it.id, it.type);
                      return;
                    }
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
                      } else if (db && typeof db.watchlistAdd === 'function') {
                        await db.watchlistAdd(String(it.id), it.type || 'movie');
                      }
                    } catch (e) { }
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                </div>
                <div className="preview-actions-right">
                  <button className="preview-btn" aria-label="More info" onClick={(ev) => {
                    ev.stopPropagation();
                    const it = items[hoverIndex];
                    try { window.dispatchEvent(new Event('app:close-previews')); } catch (e) {}
                    if (typeof onSelect === 'function' && it) {
                      onSelect(it.id, it.type);
                    } else {
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
    </section>
  );
}
