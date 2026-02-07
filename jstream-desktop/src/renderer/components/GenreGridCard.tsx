import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { fetchTMDB } from '../../utils/tmdbClient';

/**
 * A poster-only grid card for genre pages with a hover preview modal
 * that matches the Row component's behavior. No title/date text, no play overlay.
 */
export default function GenreGridCard({ item, mediaType, onSelect, onPlay }: {
  item: any;
  mediaType: 'movie' | 'tv';
  onSelect?: (id: number, type?: 'movie' | 'tv') => void;
  onPlay?: (id: number | string, type?: 'movie' | 'tv', params?: Record<string, any>) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewAnimating, setPreviewAnimating] = useState(false);
  const [previewPos, setPreviewPos] = useState<{ left: number; top: number } | null>(null);
  const [lastCardRect, setLastCardRect] = useState<DOMRect | null>(null);
  const [hoverItem, setHoverItem] = useState<any>(null);
  const [hoverTrailerKey, setHoverTrailerKey] = useState<string | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const openTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const tokenRef = useRef(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const OPEN_DELAY = 350;

  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) window.clearTimeout(openTimeoutRef.current);
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Listen for global close-previews event
  useEffect(() => {
    function onClose() {
      tokenRef.current++;
      setShowPreview(false);
      setPreviewAnimating(false);
      setHoverTrailerKey(null);
      setHoverItem(null);
      if (openTimeoutRef.current) { window.clearTimeout(openTimeoutRef.current); openTimeoutRef.current = null; }
      if (closeTimeoutRef.current) { window.clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
    }
    window.addEventListener('app:close-previews', onClose);
    return () => window.removeEventListener('app:close-previews', onClose);
  }, []);

  // Update modal position on scroll/resize while visible
  useEffect(() => {
    if (!showPreview || !cardRef.current) return;
    let raf = 0;
    function update() {
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const TW = 420, TH = 320, M = 8;
      let x = Math.max(M + TW / 2, Math.min(cx, (window.innerWidth) - M - TW / 2));
      let y = Math.max(M + TH / 2, Math.min(cy, (window.innerHeight) - M - TH / 2));
      setPreviewPos({ left: x, top: y });
    }
    function onEvent() { if (raf) cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }
    window.addEventListener('scroll', onEvent, { passive: true });
    window.addEventListener('resize', onEvent);
    // Also listen on the nearest scrollable ancestor
    const scrollParent = cardRef.current?.closest('[style*="overflow"]') as HTMLElement | null;
    if (scrollParent) scrollParent.addEventListener('scroll', onEvent, { passive: true });
    update();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onEvent);
      window.removeEventListener('resize', onEvent);
      if (scrollParent) scrollParent.removeEventListener('scroll', onEvent);
    };
  }, [showPreview]);

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

  function handleMouseEnter(e: React.MouseEvent) {
    if (closeTimeoutRef.current) { window.clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
    if (openTimeoutRef.current) { window.clearTimeout(openTimeoutRef.current); openTimeoutRef.current = null; }

    openTimeoutRef.current = window.setTimeout(async () => {
      openTimeoutRef.current = null;
      const myToken = ++tokenRef.current;

      // Compute position from card
      const el = cardRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setLastCardRect(rect);
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const TW = 420, TH = 320, M = 8;
      let x = Math.max(M + TW / 2, Math.min(cx, (window.innerWidth) - M - TW / 2));
      let y = Math.max(M + TH / 2, Math.min(cy, (window.innerHeight) - M - TH / 2));
      setPreviewPos({ left: x, top: y });

      setHoverItem(item);
      setHoverLoading(true);
      setShowPreview(true);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (tokenRef.current === myToken) setPreviewAnimating(true);
      }));

      pauseHero();

      // Fetch details, trailer, and logo
      try {
        const [videoResp, detailsResp, imagesResp] = await Promise.all([
          fetchTMDB(`${mediaType}/${item.id}/videos`, { language: 'en-US' }),
          fetchTMDB(`${mediaType}/${item.id}`),
          fetchTMDB(`${mediaType}/${item.id}/images`)
        ]);
        if (tokenRef.current !== myToken) return;

        // Pick best trailer
        const results: any[] = videoResp?.results || [];
        const typePriority = ['Trailer', 'Teaser', 'Featurette', 'Clip'];
        let chosen: any = null;
        for (const t of typePriority) {
          const cands = results.filter((v: any) => v.type === t);
          if (cands.length === 0) continue;
          chosen = cands.find((v: any) => v.official === true) || cands[0];
          break;
        }
        if (!chosen && results.length > 0) chosen = results[0];
        if (chosen && (chosen.site || '').toLowerCase() === 'youtube' && chosen.key) {
          setHoverTrailerKey(chosen.key);
        } else {
          setHoverTrailerKey(null);
        }

        // Logo
        let logoPath: string | null = null;
        const logos = imagesResp?.logos || [];
        if (Array.isArray(logos) && logos.length > 0) {
          const eng = logos.find((l: any) => l.iso_639_1 === 'en') || logos[0];
          if (eng?.file_path) logoPath = eng.file_path;
        }

        setHoverItem((prev: any) => ({
          ...(prev || item),
          data: detailsResp,
          backdrop: detailsResp?.backdrop_path || detailsResp?.poster_path || null,
          logoPath
        }));
      } catch (e) {
        setHoverTrailerKey(null);
      } finally {
        if (tokenRef.current === myToken) setHoverLoading(false);
      }
    }, OPEN_DELAY);
  }

  function handleMouseLeave() {
    if (openTimeoutRef.current) { window.clearTimeout(openTimeoutRef.current); openTimeoutRef.current = null; }
    setPreviewAnimating(false);
    if (closeTimeoutRef.current) { window.clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
    closeTimeoutRef.current = window.setTimeout(() => {
      tokenRef.current++;
      setShowPreview(false);
      setHoverTrailerKey(null);
      setHoverItem(null);
      resumeHero();
    }, 220);
  }

  const title = item.title || item.name || '';

  return (
    <>
      <div
        ref={cardRef}
        className="movie-card genre-grid-card"
        role="button"
        tabIndex={0}
        onClick={() => onSelect && onSelect(item.id, mediaType)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="movie-overlay">
          <img
            className="movie-poster"
            src={item.poster_path ? `https://image.tmdb.org/t/p/w300${item.poster_path}` : undefined}
            alt={title}
            loading="lazy"
          />
        </div>
      </div>

      {/* Hover preview modal — portaled to body */}
      {showPreview && previewPos && hoverItem ? createPortal(
        <div
          className={`preview-modal-overlay ${previewAnimating ? 'show' : ''}`}
          style={{
            position: 'fixed',
            left: previewPos.left,
            top: previewPos.top,
            zIndex: 2147483647,
            ['--init-w' as any]: lastCardRect ? `${lastCardRect.width}px` : '160px',
            ['--init-h' as any]: lastCardRect ? `${lastCardRect.height}px` : '240px',
            ['--target-w' as any]: '420px',
            ['--target-h' as any]: '320px'
          }}
          onMouseEnter={() => {
            if (closeTimeoutRef.current) { window.clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
            setPreviewAnimating(true);
          }}
          onMouseLeave={() => {
            setPreviewAnimating(false);
            if (closeTimeoutRef.current) { window.clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
            closeTimeoutRef.current = window.setTimeout(() => {
              tokenRef.current++;
              setShowPreview(false);
              setHoverTrailerKey(null);
              setHoverItem(null);
              resumeHero();
            }, 220);
          }}
        >
          <div className="preview-modal" role="dialog" aria-hidden={!previewAnimating}>
            <div className="preview-backdrop" style={{ backgroundImage: hoverItem.backdrop ? `url(https://image.tmdb.org/t/p/w780${hoverItem.backdrop})` : (item.poster_path ? `url(https://image.tmdb.org/t/p/w780${item.poster_path})` : 'none') }}>
              {hoverTrailerKey ? (
                <iframe
                  className="preview-iframe"
                  src={`https://www.youtube.com/embed/${hoverTrailerKey}?rel=0&autoplay=1&mute=0&controls=0&playsinline=1&modestbranding=1&enablejsapi=1&origin=https://jstream.app`}
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
                    if (onPlay && hoverItem) onPlay(hoverItem.id, mediaType, { tmdbId: hoverItem.id });
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 3v18l15-9L5 3z" fill="currentColor" /></svg>
                    <span>Play</span>
                  </button>
                  <button className="preview-btn" aria-label="Add to list" onClick={async (ev) => {
                    ev.stopPropagation();
                    try {
                      const db = (window as any).database;
                      if (db && typeof db.favoritesAdd === 'function') {
                        await db.favoritesAdd(String(hoverItem.id), mediaType);
                      }
                    } catch (e) { /* ignore */ }
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </div>
                <div className="preview-actions-right">
                  <button className="preview-btn" aria-label="More info" onClick={(ev) => {
                    ev.stopPropagation();
                    try { window.dispatchEvent(new Event('app:close-previews')); } catch (e) { }
                    if (onSelect && hoverItem) onSelect(hoverItem.id, mediaType);
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" /><path d="M12 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span>More info</span>
                  </button>
                </div>
              </div>
              <div className="preview-metadata">
                <span className="cert">{hoverItem?.data?.adult ? '18+' : (hoverItem?.data?.certification || '')}</span>
                <span className="duration">{(hoverItem?.data?.runtime || (hoverItem?.data?.episode_run_time?.[0])) ? `${hoverItem?.data?.runtime || hoverItem?.data?.episode_run_time[0]}m` : ''}</span>
                <span className="rating">{hoverItem?.data?.vote_average ? `${hoverItem.data.vote_average.toFixed(1)}/10` : ''}</span>
              </div>
              <div className="preview-title">
                {hoverItem?.data ? (hoverItem.data.title || hoverItem.data.name) : title}
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  );
}
