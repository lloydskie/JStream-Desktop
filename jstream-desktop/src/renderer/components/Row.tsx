import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchTMDB } from '../../utils/tmdbClient';
import RowScroller from './RowScroller';

export default function Row({ title, movies, onSelect, onPlay, backdropMode }: { title: string, movies: any[], onSelect?: (id:number, type?:'movie'|'tv')=>void, onPlay?: (id:number, type?:'movie'|'tv')=>void, backdropMode?: boolean }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [pagerIndex, setPagerIndex] = useState(0);
  const [pagerCount, setPagerCount] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  // Preview modal state for Top10 items (re-using ContinueWatching logic)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverItem, setHoverItem] = useState<any | null>(null);
  const [hoverTrailerKey, setHoverTrailerKey] = useState<string | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const hoverTokenRef = useRef(0);
  const previewTimeoutRef = useRef<number | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewModalPos, setPreviewModalPos] = useState<{left:number,top:number}|null>(null);
  const [previewAnimating, setPreviewAnimating] = useState(false);
  const [lastCardRect, setLastCardRect] = useState<DOMRect | null>(null);
  // focus preview removed: no floating preview dialog

  useEffect(()=>{
    function keyHandler(e: KeyboardEvent){
      if (focusedIndex === null) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); const next = Math.min((focusedIndex ?? 0) + 1, movies.length - 1); setFocusedIndex(next); scrollToIndex(next); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); const prev = Math.max((focusedIndex ?? 0) - 1, 0); setFocusedIndex(prev); scrollToIndex(prev); }
      if (e.key === 'Enter') { e.preventDefault(); const m = movies[focusedIndex ?? 0]; if (m && onSelect) onSelect(m.id); }
    }
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, movies]);

  // prefetch details and position preview when focus changes
  // removed preview prefetch effect

  function scrollToIndex(idx: number){
    const container = scrollerRef.current;
    if (!container) return;
    const child = container.children[idx] as HTMLElement | undefined;
    if (child) child.scrollIntoView({behavior:'smooth', inline:'center'});
  }

  // global wheel capture handles translation of wheel to scroll; RowScroller attaches native handler

  const isTop10 = typeof title === 'string' && title.toLowerCase().includes('top 10');

  // Local enriched items including logo/backdrop paths when in backdrop mode
  const [items, setItems] = useState<any[]>(movies || []);

  // When movies prop changes or backdropMode toggles, attempt to enrich items with logo images
  useEffect(() => {
    let mounted = true;
    (async () => {
      const base = (movies || []).map(m => ({ ...m, backdrop: m.backdrop_path || m.poster_path || null, poster: m.poster_path || null, logoPath: (m as any).logoPath || null, data: (m as any).data || null }));
      if (!backdropMode) {
        if (mounted) setItems(base);
        return;
      }
      try {
        const enriched = await Promise.all(base.map(async (it) => {
          try {
            if (it.logoPath) return it;
            const inferred: 'movie'|'tv' = (it._media === 'tv' || it.media_type === 'tv') ? 'tv' : 'movie';
            const images = await fetchTMDB(`${inferred}/${it.id}/images`);
            const logos = (images && (images as any).logos) || [];
            if (Array.isArray(logos) && logos.length > 0) {
              const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
              if (eng && eng.file_path) it.logoPath = eng.file_path;
            }
          } catch (e) {
            // ignore per-item image fetch errors
          }
          return it;
        }));
        if (mounted) setItems(enriched);
      } catch (e) {
        if (mounted) setItems(base);
      }
    })();
    return () => { mounted = false; }
  }, [movies, backdropMode]);
  return (
    <div className={`row-container ${isTop10 ? 'top10' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="row-title">{title}</div>
        {(isTop10 || backdropMode) ? (
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
        ) : null}
      </div>
      <RowScroller scrollerRef={scrollerRef} className={backdropMode ? 'continue-scroll' : 'row-scroll'} disableWheel={isTop10} showPager={false} onPageChange={(idx, count) => { setPagerIndex(idx); setPagerCount(count); }} itemCount={(backdropMode ? items : movies).length} itemsPerPage={5}>
          {(backdropMode ? items : movies).map((m, idx)=> (
            <div key={m.id} className="movie-item" onFocus={()=>setFocusedIndex(idx)}
              onMouseEnter={async (e)=>{
                if (!(isTop10 || backdropMode)) return;
                if (previewTimeoutRef.current) { window.clearTimeout(previewTimeoutRef.current); previewTimeoutRef.current = null; }
                const token = ++hoverTokenRef.current;
                try {
                  setHoverIndex(idx);
                  setHoverLoading(true);
                  setHoverItem(m);
                  // compute modal position based on card rect
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
                  } catch (e) { /* ignore */ }

                  // fetch details and videos for preview
                  const inferred: 'movie'|'tv' = (m._media === 'tv' || m.media_type === 'tv') ? 'tv' : 'movie';
                  try {
                    const [videoResp, detailsResp, imagesResp] = await Promise.all([
                        fetchTMDB(`${inferred}/${m.id}/videos`, { language: 'en-US' }),
                        fetchTMDB(`${inferred}/${m.id}`),
                        fetchTMDB(`${inferred}/${m.id}/images`)
                      ]);
                    if (token !== hoverTokenRef.current) return;
                    const results: any[] = videoResp?.results || [];
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
                    // attach details/backdrop/logo to hoverItem for modal rendering
                    let logoPath: string | null = null;
                    try {
                      const logos = (imagesResp && (imagesResp as any).logos) || [];
                      if (Array.isArray(logos) && logos.length > 0) {
                        const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
                        if (eng && eng.file_path) logoPath = eng.file_path;
                      }
                    } catch (e) { }
                    setHoverItem((prev:any) => ({ ...(prev||m), data: detailsResp, backdrop: detailsResp?.backdrop_path || detailsResp?.poster_path || null, logoPath }));
                  } catch (e) {
                    console.error('Row: preview fetch failed', e);
                    setHoverTrailerKey(null);
                  }
                } finally {
                  setHoverLoading(false);
                }
              }}
              onMouseLeave={() => {
                if (!(typeof title === 'string' && title.toLowerCase().includes('top 10'))) return;
                setPreviewAnimating(false);
                previewTimeoutRef.current = window.setTimeout(() => {
                  hoverTokenRef.current++;
                  setHoverIndex(null);
                  setHoverTrailerKey(null);
                  setShowPreviewModal(false);
                }, 220);
              }}
            >
              {/* Rank sibling placed outside the card for consistent overflow handling */}
              {typeof title === 'string' && title.toLowerCase().includes('top 10') && (
                <div className="rank-back" aria-hidden="true">{idx + 1}</div>
              )}
              {backdropMode ? (
                <div className={`continue-card ${focusedIndex===idx? 'focused-row':''}`} onClick={() => { const inferred: 'movie'|'tv' = (m._media === 'tv' || m.media_type === 'tv') ? 'tv' : 'movie'; if (onSelect) onSelect(m.id, inferred); }} tabIndex={0}>
                  {m.backdrop ? (
                    <div className="continue-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/original${m.backdrop})` }}>
                      {m.logoPath ? (
                        <img src={`https://image.tmdb.org/t/p/w300${m.logoPath}`} alt={m.title} className="continue-logo"/>
                      ) : (
                        <div className="continue-logo-text">{m.title}</div>
                      )}
                    </div>
                  ) : (
                    <div className="continue-backdrop placeholder">
                      <div className="continue-logo-text">{m.title}</div>
                    </div>
                  )}
                </div>
              ) : (
                <div className={`movie-card ${focusedIndex===idx? 'focused-row':''}`} onClick={() => {
                  const inferred: 'movie'|'tv' = (m._media === 'tv' || m.media_type === 'tv') ? 'tv' : 'movie';
                  if (onSelect) onSelect(m.id, inferred);
                }} tabIndex={0}>
                  <div className="movie-overlay">
                    <img className="movie-poster" src={m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : undefined} alt={m.title} />
                    <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); const inferred: 'movie'|'tv' = (m._media === 'tv' || m.media_type === 'tv') ? 'tv' : 'movie'; if (onPlay) onPlay(m.id, inferred); }}><div className="play-circle"><div className="play-triangle"/></div></div>
                  </div>
                  {/* Add to list toggle (replaces previous favorites heart) */}
                  <button
                    className="add-toggle"
                    aria-label={`Add to list ${m.title}`}
                    onClick={(ev)=>{
                      ev.stopPropagation();
                      const inferred: 'movie'|'tv' = (m._media === 'tv' || m.media_type === 'tv') ? 'tv' : 'movie';
                      try {
                        const db = (window as any).database;
                        if (db && typeof db.favoritesAdd === 'function') {
                          db.favoritesAdd(String(m.id), inferred);
                        } else if (db && typeof db.watchlistAdd === 'function') {
                          db.watchlistAdd(String(m.id), inferred);
                        }
                      } catch (e) {
                        // swallow in tests/environment without database
                      }
                    }}
                  />
                  <div className="movie-title">{m.title}</div>
                </div>
              )}
              {/* Mini modal for Top10 rows: appears on hover, minimal actions like ContinueWatching */}
              {showPreviewModal && previewModalPos && hoverIndex === idx && hoverItem ? createPortal(
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
                    }, 220);
                  }}
                >
                  <div className="preview-modal" role="dialog" aria-hidden={!previewAnimating}>
                    <div className="preview-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/original${hoverItem.backdrop})` }}>
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
                            if (onPlay && hoverItem) { onPlay(hoverItem.id, hoverItem._media || hoverItem.media_type || 'movie'); return; }
                            try {
                              const el = document.querySelector('.preview-iframe') as HTMLIFrameElement | null;
                              if (el && el.contentWindow) {
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
                            try {
                              const db = (window as any).database;
                              if (db && typeof db.favoritesAdd === 'function') {
                                await db.favoritesAdd(String(hoverItem.id), hoverItem._media || hoverItem.media_type || 'movie');
                              }
                            } catch (e) { console.error(e); }
                          }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          {/* Favorite heart removed — add-to-list '+' is used instead */}
                        </div>
                        <div className="preview-actions-right">
                          <button className="preview-btn" aria-label="More info" onClick={(ev) => {
                            ev.stopPropagation();
                            if (typeof onSelect === 'function' && hoverItem) onSelect(hoverItem.id, hoverItem._media || hoverItem.media_type || 'movie');
                          }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            <span>More info</span>
                          </button>
                        </div>
                      </div>
                      <div className="preview-metadata">
                        <span className="cert">{hoverItem?.data?.adult ? '18+' : (hoverItem?.data?.certification || '')}</span>
                        <span className="duration">{(hoverItem?.data?.runtime || (hoverItem?.data?.episode_run_time && hoverItem?.data?.episode_run_time[0])) ? `${hoverItem?.data?.runtime || hoverItem?.data?.episode_run_time[0]}m` : ''}</span>
                        <span className="rating">{hoverItem?.data?.vote_average ? `${hoverItem?.data.vote_average.toFixed(1)}/10` : ''}</span>
                      </div>
                      <div className="preview-title">
                        {hoverItem?.data && (hoverItem?.media_type === 'tv' || hoverItem?._media === 'tv') ? `S1:E1 ${hoverItem.data?.name || hoverItem.data?.title}` : (hoverItem?.data?.title || hoverItem?.data?.name)}
                      </div>
                    </div>
                  </div>
                </div>, document.body) : null}
            </div>
          ))}
      </RowScroller>
    </div>
  )
}
