import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchTMDB } from '../../utils/tmdbClient';
import PlusMinusIcon from './icons/PlusMinusIcon';
import InfoIcon from './icons/InfoIcon';
import SpeakerIcon from './icons/SpeakerIcon';

export default function HeroBanner({ movie, onPlay, onMore, fullBleed, isModalOpen, isVisible = true }: { movie?: any, onPlay?: (id:number, type?:'movie'|'tv')=>void, onMore?: (id:number, type?:'movie'|'tv')=>void, fullBleed?: boolean, isModalOpen?: boolean, isVisible?: boolean }) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setTrailerKey(null);
    setTrailerError(null);
    if (!movie?.id || isModalOpen || !isVisible) return;

    // Dev override: set `window.__DEV_TRAILER_KEY = 'YOUTUBE_KEY'` in DevTools to force a trailer
    const devKey = (window as any).__DEV_TRAILER_KEY;
    if (devKey) {
      console.debug('HeroBanner: using dev override trailer key');
      setTrailerKey(String(devKey));
      return () => { mounted = false; };
    }

    // Dev override: set `window.__DEV_TMDB_RESPONSE = {...}` to simulate TMDb /videos response
    const devResp = (window as any).__DEV_TMDB_RESPONSE;
    if (devResp) {
      console.debug('HeroBanner: using dev TMDb response override', devResp);
      const data = devResp;
      const results: any[] = data?.results || [];
      // reuse selection logic from below
      const typePriority = ['Trailer','Teaser','Featurette','Clip','Behind the Scenes','Bloopers'];
      let chosen: any = null;
      for (const t of typePriority) {
        const candidates = results.filter((v:any) => v.type === t);
        if (candidates.length === 0) continue;
        chosen = candidates.find((v:any) => v.official === true) || candidates[0];
        break;
      }
      if (!chosen && results.length > 0) chosen = results[0];
      if (!chosen) {
        console.debug('HeroBanner(dev): no videos in provided response', { results });
        setTrailerError('No videos available (dev override)');
        return () => { mounted = false; };
      }
      const site = (chosen.site || '').toLowerCase();
      const key = chosen.key;
      if (!key) { setTrailerError('Selected video missing key (dev override)'); return () => { mounted = false; }; }
      if (site === 'youtube') setTrailerKey(key);
      else if (site === 'vimeo') setTrailerKey(`vimeo:${key}`);
      else setTrailerError(`Video available on ${chosen.site} (not embeddable)`);
      return () => { mounted = false; };
    }

    async function loadTrailer() {
      try {
        const data = await fetchTMDB(`movie/${movie.id}/videos`, { language: 'en-US' });
        console.debug('HeroBanner: TMDb videos response', data);
        if (!mounted) return;
        const results: any[] = data?.results || [];

        // Choose best available video by type priority, prefer official if available
        const typePriority = ['Trailer','Teaser','Featurette','Clip','Behind the Scenes','Bloopers'];
        let chosen: any = null;
        for (const t of typePriority) {
          const candidates = results.filter(v => v.type === t);
          if (candidates.length === 0) continue;
          chosen = candidates.find(v => v.official === true) || candidates[0];
          break;
        }
        // fallback: any video at all
        if (!chosen && results.length > 0) chosen = results[0];

        if (!chosen) {
          console.debug('HeroBanner: no videos at all in TMDb response', { results });
          setTrailerError('No videos available');
          return;
        }

        // Build embed URL for supported sites
        const site = (chosen.site || '').toLowerCase();
        const key = chosen.key;
        if (!key) {
          console.debug('HeroBanner: chosen video has no key', { chosen });
          setTrailerError('Selected video missing key');
          return;
        }

        if (site === 'youtube') {
          setTrailerKey(key);
        } else if (site === 'vimeo') {
          // embed vimeo via iframe src
          setTrailerKey(`vimeo:${key}`);
        } else {
          console.debug('HeroBanner: found video on unsupported site', { site, chosen });
          setTrailerError(`Video available on ${chosen.site} (not embeddable)`);
        }
      } catch (e) {
        console.error('HeroBanner: failed to load trailer', e);
        setTrailerError('Failed to load trailer — check TMDb API key/network');
      }
    }

    loadTrailer();
    return () => { mounted = false; }
  }, [movie?.id, isModalOpen, isVisible]);

  if (!movie) return null;
  const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : (movie.poster_path ? `https://image.tmdb.org/t/p/original${movie.poster_path}` : undefined);
  const heroNode = typeof document !== 'undefined' ? document.getElementById('hero-root') : null;
  const [isPlaying, setIsPlaying] = useState(false);
  const [pausedExternally, setPausedExternally] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const interactionTimer = useRef<number | null>(null);
  const heroRef = useRef<HTMLElement | null>(null);
  const [mutePos, setMutePos] = useState<{ top: number; right?: number; left?: number } | null>(null);

  // logo URL state — we'll attempt to fetch logos from TMDb images endpoint
  const [logoUrl, setLogoUrl] = useState<string | null>(movie?.logo_path ? `https://image.tmdb.org/t/p/original${movie.logo_path}` : null);

  useEffect(() => {
    let mounted = true;
    async function loadLogos() {
      try {
        if (!movie?.id) return;
        // try movie images first
        const imgResp = await fetchTMDB(`movie/${movie.id}/images`);
        const logos = (imgResp && (imgResp as any).logos) || [];
        if (mounted && logos.length > 0) {
          // prefer a logo with english iso_639_1 or fallback to first
          const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
          if (eng?.file_path) {
            setLogoUrl(`https://image.tmdb.org/t/p/original${eng.file_path}`);
            return;
          }
        }
        // fallback: try tv images endpoint (some items may be tv)
        const tvResp = await fetchTMDB(`tv/${movie.id}/images`);
        const tvLogos = (tvResp && (tvResp as any).logos) || [];
        if (mounted && tvLogos.length > 0) {
          const eng = tvLogos.find((l:any) => l.iso_639_1 === 'en') || tvLogos[0];
          if (eng?.file_path) {
            setLogoUrl(`https://image.tmdb.org/t/p/original${eng.file_path}`);
            return;
          }
        }
      } catch (e) {
        // ignore — logo is optional
      }
    }
    loadLogos();
    return () => { mounted = false; };
  }, [movie?.id]);

  // when trailerKey appears, consider trailer 'playing' after a short delay and collapse overview
  useEffect(() => {
    if (trailerKey && !pausedExternally) {
      // small delay to allow iframe autoplay to start
      const t = window.setTimeout(() => {
        setIsPlaying(true);
        setOverviewExpanded(false);
      }, 800);
      return () => { clearTimeout(t); };
    } else {
      setIsPlaying(false);
      setOverviewExpanded(true);
    }
  }, [trailerKey, pausedExternally]);

  // Pause/resume trailer when hero scrolls out of view (do not override external pauses)
  useEffect(() => {
    if (!heroRef.current || !trailerKey) return;
    let mounted = true;
    const pausedByVisibility = { value: false };

    const handlePause = () => {
      if (pausedByVisibility.value) return;
      pausedByVisibility.value = true;
      setIsPlaying(false);
      try {
        const el = document.querySelector('.hero-trailer iframe') as HTMLIFrameElement | null;
        if (el && el.contentWindow) {
          // YouTube postMessage API
          if (String(trailerKey).startsWith('vimeo:')) {
            // Vimeo player expects {method: 'pause'} messages
            el.contentWindow.postMessage(JSON.stringify({ method: 'pause' }), '*');
          } else {
            el.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
          }
        }
      } catch (e) { /* ignore */ }
    };

    const handleResume = () => {
      if (!pausedByVisibility.value) return;
      pausedByVisibility.value = false;
      // Only resume if not paused externally by previews or other controllers
      if (mounted && !pausedExternally) {
        try {
          const el = document.querySelector('.hero-trailer iframe') as HTMLIFrameElement | null;
          if (el && el.contentWindow) {
            if (String(trailerKey).startsWith('vimeo:')) {
              el.contentWindow.postMessage(JSON.stringify({ method: 'play' }), '*');
            } else {
              el.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
            }
          }
        } catch (e) { /* ignore */ }
        setIsPlaying(true);
      }
    };

    const obs = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        // if less than 20% visible, consider it out of view
        if (entry.intersectionRatio < 0.2) {
          handlePause();
        } else {
          handleResume();
        }
      }
    }, { threshold: [0, 0.2, 0.5, 1] });

    try { obs.observe(heroRef.current); } catch (e) { /* ignore */ }
    return () => { mounted = false; try { obs.disconnect(); } catch (e) {} };
  }, [heroRef.current, trailerKey, pausedExternally]);

  // Expose a global trailer controller so other components can pause/resume the hero trailer
  useEffect(() => {
    function pause() {
      setPausedExternally(true);
      setIsPlaying(false);
      try {
        const el = document.querySelector('.hero-trailer iframe') as HTMLIFrameElement | null;
        if (el && el.contentWindow) {
          // pause via YouTube JS API
          el.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      } catch (e) { /* ignore */ }
    }
    function resume() {
      // clear the external pause flag and attempt to play the iframe —
      // schedule a tiny timeout so the pausedExternally state update has taken effect
      setPausedExternally(false);
      try {
        const el = document.querySelector('.hero-trailer iframe') as HTMLIFrameElement | null;
        if (el && el.contentWindow) {
          el.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        }
      } catch (e) { /* ignore */ }
      // ensure visual `isPlaying` flips after state update
      setTimeout(() => {
        if (trailerKey) setIsPlaying(true);
      }, 60);
    }

    try { (window as any).__appTrailerController = { pause, resume }; } catch (e) { /* ignore */ }

    // Also listen for global custom events so components that dispatch events
    // can control the hero even if they cannot access the controller directly.
    const onPauseEvt = () => pause();
    const onResumeEvt = () => resume();
    window.addEventListener('app:pause-hero-trailer', onPauseEvt as EventListener);
    window.addEventListener('app:resume-hero-trailer', onResumeEvt as EventListener);

    return () => {
      try { delete (window as any).__appTrailerController; } catch (e) { /* ignore */ }
      try { window.removeEventListener('app:pause-hero-trailer', onPauseEvt as EventListener); } catch (e) { /* ignore */ }
      try { window.removeEventListener('app:resume-hero-trailer', onResumeEvt as EventListener); } catch (e) { /* ignore */ }
    };
  }, [trailerKey, pausedExternally]);

  // user interaction expands overview; auto-collapse after inactivity
  function handleUserInteract() {
    setOverviewExpanded(true);
    // clear previous timer
    if (interactionTimer.current) { window.clearTimeout(interactionTimer.current); }
    // collapse again after 6s of inactivity
    interactionTimer.current = window.setTimeout(() => {
      setOverviewExpanded(false);
      interactionTimer.current = null;
    }, 6000) as unknown as number;
  }

  // clear timer on unmount
  useEffect(() => {
    return () => { if (interactionTimer.current) window.clearTimeout(interactionTimer.current); };
  }, []);

  // compute position for portaled mute button so it remains clickable when
  // the app root overlaps the hero. Updates on resize.
  useEffect(() => {
    function updatePos() {
      if (!heroRef.current) return setMutePos(null);
      const heroEl = heroRef.current as HTMLElement;
      const certEl = heroEl.querySelector('.hero-certification') as HTMLElement | null;
      const heroRect = heroEl.getBoundingClientRect();

      // default: place near top-right of hero
      let top = Math.max(8, heroRect.top + 16);
      let right = Math.max(8, window.innerWidth - (heroRect.right) + 16);
      let left: number | undefined = undefined;

      // If a certification element exists, position the mute button beside it (to the right)
      if (certEl) {
        const certRect = certEl.getBoundingClientRect();
        const buttonHeightApprox = 40;
        top = Math.max(8, Math.round((certRect.top - heroRect.top) + (certRect.height - buttonHeightApprox) / 2));
        left = Math.round((certRect.right - heroRect.left) + 8); // 8px gap to the right of certification
      } else {
        // Fallback: try to mirror hero-actions if present
        const content = heroEl.querySelector('.hero-content') as HTMLElement | null;
        const actions = heroEl.querySelector('.hero-actions') as HTMLElement | null;
        if (content && actions) {
          const contentRect = content.getBoundingClientRect();
          const actionsRect = actions.getBoundingClientRect();
          const actionsCenterY = actionsRect.top + actionsRect.height / 2;
          top = Math.max(8, (actionsCenterY - heroRect.top) - 20);
          const contentCenterX = contentRect.left + contentRect.width / 2;
          const actionsCenterX = actionsRect.left + actionsRect.width / 2;
          const distance = actionsCenterX - contentCenterX;
          const mirroredCenterX = contentCenterX - distance;
          const buttonHalf = 20;
          right = Math.max(8, (heroRect.right - mirroredCenterX) - buttonHalf);
        }
      }

      setMutePos(left ? { top: top, left } : { top: Math.round(top), right: Math.round(right) });
    }
    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, { passive: true });
    return () => { window.removeEventListener('resize', updatePos); window.removeEventListener('scroll', updatePos); };
  }, [heroRef.current, isPlaying, trailerKey]);

  // Extract certification so we can render it and debug why it might be missing
  function extractCertification(m: any) {
    if (!m) return null;
    if (m.certification) return m.certification;
    if (m.release_certification) return m.release_certification;

    const rd = m.release_dates && m.release_dates.results;
    if (Array.isArray(rd) && rd.length > 0) {
      const preferred = rd.find((r:any) => r.iso_3166_1 === 'US') || rd[0];
      const rels = preferred && preferred.release_dates;
      if (Array.isArray(rels) && rels.length > 0) {
        const byCert = rels.find((d:any) => d.certification && d.certification.trim());
        if (byCert && byCert.certification) return byCert.certification;
        if (rels[0].certification) return rels[0].certification;
      }
    }

    const cr = m.content_ratings && m.content_ratings.results;
    if (Array.isArray(cr) && cr.length > 0) {
      const pref = cr.find((r:any) => r.iso_3166_1 === 'US') || cr[0];
      if (pref && pref.rating) return pref.rating;
    }

    if (m.adult) return '18+';
    return null;
  }

  const certification = extractCertification(movie);
  // Debug: log certification resolution so we can see why it's not showing
  // (remove or lower log level later if noisy)
  if (typeof window !== 'undefined' && (window as any).console) {
    console.debug('HeroBanner: resolved certification ->', certification, 'for movie id', movie?.id);
  }

  const [resolvedCert, setResolvedCert] = useState<string | null>(certification || null);

  // If we couldn't resolve certification from the passed `movie` object, try fetching TMDb endpoints
  useEffect(() => {
    let mounted = true;
    async function fetchCert() {
      if (resolvedCert) return;
      if (!movie?.id) return;
      try {
        // Try movie release_dates
        const rd = await fetchTMDB(`movie/${movie.id}/release_dates`);
        console.debug('HeroBanner: fetched release_dates ->', rd);
        const results = rd && rd.results;
        if (Array.isArray(results) && results.length > 0) {
          const preferred = results.find((r:any) => r.iso_3166_1 === 'US') || results[0];
          const rels = preferred && preferred.release_dates;
          if (Array.isArray(rels) && rels.length > 0) {
            const byCert = rels.find((d:any) => d.certification && d.certification.trim());
            const cert = (byCert && byCert.certification) || rels[0].certification;
            if (cert && mounted) { setResolvedCert(cert); return; }
          }
        }
      } catch (e) {
        console.debug('HeroBanner: release_dates fetch failed', e);
        // ignore and try tv endpoint next
      }
      try {
        // Try tv content_ratings
        const cr = await fetchTMDB(`tv/${movie.id}/content_ratings`);
        console.debug('HeroBanner: fetched content_ratings ->', cr);
        const cresults = cr && cr.results;
        if (Array.isArray(cresults) && cresults.length > 0) {
          const pref = cresults.find((r:any) => r.iso_3166_1 === 'US') || cresults[0];
          if (pref && pref.rating && mounted) { setResolvedCert(pref.rating); return; }
        }
      } catch (e) {
        console.debug('HeroBanner: content_ratings fetch failed', e);
        // ignore
      }
    }
    fetchCert();
    return () => { mounted = false; };
  }, [movie?.id, resolvedCert]);

  const jsx = (
    <section ref={heroRef as any} className={"hero-banner" + (fullBleed ? ' full-bleed' : '') + (isPlaying ? ' playing' : '')} style={{backgroundImage: `url(${backdrop})`, display: isVisible ? 'block' : 'none'}}>
      {/* autoplaying, muted trailer placed behind the hero content */}
      <div className="hero-trailer" aria-hidden={!trailerKey}>
        {trailerKey && (
          (typeof trailerKey === 'string' && trailerKey.startsWith('vimeo:')) ? (
            (() => {
              const vimeoId = String(trailerKey).replace('vimeo:', '');
              return (
                <iframe
                  src={`https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}?autoplay=1&muted=${isMuted ? 1 : 0}&loop=1&background=${isMuted ? 1 : 0}`}
                  title="Trailer"
                  frameBorder="0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  loading="lazy"
                />
              );
            })()
          ) : (
            <iframe
              src={`https://www.youtube.com/embed/${encodeURIComponent(String(trailerKey))}?rel=0&autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&playsinline=1&modestbranding=1&loop=1&playlist=${encodeURIComponent(String(trailerKey))}&enablejsapi=1`}
              title="Trailer"
              frameBorder="0"
              allow="autoplay; encrypted-media"
              allowFullScreen
              loading="lazy"
            />
          )
        )}
      </div>

      {/* overlay is now a separate background layer so it won't block the trailer or banner visuals */}
      <div className="hero-overlay" aria-hidden="true" />

      {/* Mute button: positioned absolutely in the hero so it stays with the hero and is clickable */}
      {!isModalOpen && mutePos && (
        <button
          className="hero-mute-right"
          onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
          aria-label={isMuted ? 'Unmute trailer' : 'Mute trailer'}
          title={isMuted ? 'Unmute trailer' : 'Mute trailer'}
          style={{ position: 'absolute', top: mutePos.top, right: mutePos.right, zIndex: 2000, pointerEvents: 'auto' }}
        >
          <SpeakerIcon isMuted={isMuted} />
        </button>
      )}

      {/* Certification overlay (e.g., PG-13, TV-MA) placed beside the mute button */}
      {(() => {
        const finalCert = resolvedCert || certification || null;
        if (!finalCert) return null;
        return (
          <div className="hero-certification" aria-hidden="true">{finalCert}</div>
        );
      })()}

      <div className="hero-content" onMouseEnter={handleUserInteract} onFocus={handleUserInteract} onClick={handleUserInteract}>
        {/* title logo when available, otherwise fall back to plain title text */}
        {logoUrl ? (
          <img src={logoUrl} alt={movie.title} className={"hero-logo" + (isPlaying ? ' logo-lower' : '')} />
        ) : (
          <h1 className="hero-title">{movie.title}</h1>
        )}
        <p className={"hero-overview" + (overviewExpanded ? ' expanded' : ' collapsed')}>{movie.overview}</p>
        {trailerError && (
          <div className="hero-trailer-fallback" role="status">Trailer unavailable</div>
        )}
          <div className="hero-actions">
          <button className="play-cta" onClick={() => onPlay && onPlay(movie.id, 'movie')}>
            <span className="play-icon" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <path d="M5 3.868v16.264A1 1 0 0 0 6.553 21.2l12.894-8.132a1 1 0 0 0 0-1.736L6.553 2.8A1 1 0 0 0 5 3.868z" fill="#fff"/>
              </svg>
            </span>
            <span>Play</span>
          </button>
          <button
            className="fav-btn"
            onClick={async () => { try { await (window as any).database.favoritesAdd(String(movie.id), 'movie'); } catch(e){} }}
            aria-label={`Add ${movie.title} to favorites`}
            title="Add to favorites"
            style={{ color: 'var(--muted)' }}
          >
            <PlusMinusIcon size={18} />
          </button>

          <button
            className="more-info-btn"
            onClick={() => onMore && onMore(movie.id, 'movie')}
            aria-label={`More info ${movie.title}`}
            title={`More info ${movie.title}`}
          >
            <InfoIcon size={16} color="#fff" />
            <span>More Info</span>
          </button>

          
        </div>
      </div>
    </section>
  );

  // If portal root exists and we're using fullBleed, render into it so the hero sits outside the app shell.
  if (fullBleed && heroNode) {
    return createPortal(jsx, heroNode);
  }

  return jsx;
}
