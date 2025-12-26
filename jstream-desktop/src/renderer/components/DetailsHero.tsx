import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { fetchTMDB } from '../../utils/tmdbClient';
import PlusMinusIcon from './icons/PlusMinusIcon';
import InfoIcon from './icons/InfoIcon';
import SpeakerIcon from './icons/SpeakerIcon';

export default function DetailsHero({ movie, onPlay, onMore, fullBleed, isModalOpen, isVisible = true, mediaType = 'movie' }: { movie?: any, onPlay?: (id:number, type?:'movie'|'tv')=>void, onMore?: (id:number, type?:'movie'|'tv')=>void, fullBleed?: boolean, isModalOpen?: boolean, isVisible?: boolean, mediaType?: 'movie'|'tv' }) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setTrailerKey(null);
    setTrailerError(null);
    // allow trailers to load in the modal (do not block when isModalOpen)
    if (!movie?.id || !isVisible) return;

    const devKey = (window as any).__DEV_TRAILER_KEY;
    if (devKey) {
      console.debug('DetailsHero: using dev override trailer key');
      setTrailerKey(String(devKey));
      return () => { mounted = false; };
    }

    const devResp = (window as any).__DEV_TMDB_RESPONSE;
    if (devResp) {
      console.debug('DetailsHero: using dev TMDb response override', devResp);
      const data = devResp;
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
      if (!chosen) {
        console.debug('DetailsHero(dev): no videos in provided response', { results });
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
        const data = await fetchTMDB(`${mediaType}/${movie.id}/videos`, { language: 'en-US' });
        console.debug('DetailsHero: TMDb videos response', data);
        if (!mounted) return;
        const results: any[] = data?.results || [];

        const typePriority = ['Trailer','Teaser','Featurette','Clip','Behind the Scenes','Bloopers'];
        let chosen: any = null;
        for (const t of typePriority) {
          const candidates = results.filter(v => v.type === t);
          if (candidates.length === 0) continue;
          chosen = candidates.find(v => v.official === true) || candidates[0];
          break;
        }
        if (!chosen && results.length > 0) chosen = results[0];

        if (!chosen) {
          console.debug('DetailsHero: no videos at all in TMDb response', { results });
          setTrailerError('No videos available');
          return;
        }

        const site = (chosen.site || '').toLowerCase();
        const key = chosen.key;
        console.debug('DetailsHero: chosen video', { site, key, chosen });
        if (!key) {
          console.debug('DetailsHero: chosen video has no key', { chosen });
          setTrailerError('Selected video missing key');
          return;
        }

        if (site === 'youtube') {
          setTrailerKey(key);
        } else if (site === 'vimeo') {
          setTrailerKey(`vimeo:${key}`);
        } else {
          console.debug('DetailsHero: found video on unsupported site', { site, chosen });
          setTrailerError(`Video available on ${chosen.site} (not embeddable)`);
        }
      } catch (e) {
        console.error('DetailsHero: failed to load trailer', e);
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
  // Allow the details hero to play with sound by default; do not force mute for modal.
  const [isMuted, setIsMuted] = useState(false);
  const interactionTimer = useRef<number | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const [mutePos, setMutePos] = useState<{ top: number; right?: number; left?: number } | null>(null);

  const [logoUrl, setLogoUrl] = useState<string | null>(movie?.logo_path ? `https://image.tmdb.org/t/p/original${movie.logo_path}` : null);

  useEffect(() => {
    let mounted = true;
    async function loadLogos() {
      try {
        if (!movie?.id) return;
        const imgResp = await fetchTMDB(`${mediaType}/${movie.id}/images`);
        const logos = (imgResp && (imgResp as any).logos) || [];
        if (mounted && logos.length > 0) {
          const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
          if (eng?.file_path) {
            setLogoUrl(`https://image.tmdb.org/t/p/original${eng.file_path}`);
            return;
          }
        }
        const fallbackType = mediaType === 'movie' ? 'tv' : 'movie';
        const fbResp = await fetchTMDB(`${fallbackType}/${movie.id}/images`);
        const fbLogos = (fbResp && (fbResp as any).logos) || [];
        if (mounted && fbLogos.length > 0) {
          const eng = fbLogos.find((l:any) => l.iso_639_1 === 'en') || fbLogos[0];
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
  }, [movie?.id, mediaType]);

  useEffect(() => {
    if (trailerKey && !pausedExternally) {
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
          if (String(trailerKey).startsWith('vimeo:')) {
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

  useEffect(() => {
    // Manage global trailer controller and pause/resume behaviour.
    // Note: do not force mute here — detail hero is allowed to play unmuted.

    function pause() {
      setPausedExternally(true);
      setIsPlaying(false);
      try {
        const el = document.querySelector('.hero-trailer iframe') as HTMLIFrameElement | null;
        if (el && el.contentWindow) {
          el.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
        }
      } catch (e) { /* ignore */ }
    }
    function resume() {
      setPausedExternally(false);
      try {
        const el = document.querySelector('.hero-trailer iframe') as HTMLIFrameElement | null;
        if (el && el.contentWindow) {
          el.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
        }
      } catch (e) { /* ignore */ }
      setTimeout(() => {
        if (trailerKey) setIsPlaying(true);
      }, 60);
    }

    try { (window as any).__appTrailerController = { pause, resume }; } catch (e) { /* ignore */ }

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

  function handleUserInteract() {
    setOverviewExpanded(true);
    if (interactionTimer.current) { window.clearTimeout(interactionTimer.current); }
    interactionTimer.current = window.setTimeout(() => {
      setOverviewExpanded(false);
      interactionTimer.current = null;
    }, 6000) as unknown as number;
  }

  useEffect(() => {
    return () => { if (interactionTimer.current) window.clearTimeout(interactionTimer.current); };
  }, []);

  useEffect(() => {
    function updatePos() {
      if (!heroRef.current) return setMutePos(null);
      const heroEl = heroRef.current as HTMLElement;
      const certEl = heroEl.querySelector('.hero-certification') as HTMLElement | null;
      const heroRect = heroEl.getBoundingClientRect();

      let top = Math.max(8, heroRect.top + 16);
      let right = Math.max(8, window.innerWidth - (heroRect.right) + 16);
      let left: number | undefined = undefined;

      if (certEl) {
        const certRect = certEl.getBoundingClientRect();
        const buttonHeightApprox = 40;
        top = Math.max(8, Math.round((certRect.top - heroRect.top) + (certRect.height - buttonHeightApprox) / 2));
        const buttonWidthApprox = 44;
        left = Math.round((certRect.left - heroRect.left) - buttonWidthApprox - 8);
      } else {
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
  if (typeof window !== 'undefined' && (window as any).console) {
    console.debug('DetailsHero: resolved certification ->', certification, 'for movie id', movie?.id);
  }

  const [resolvedCert, setResolvedCert] = useState<string | null>(certification || null);

  useEffect(() => {
    let mounted = true;
    async function fetchCert() {
      if (resolvedCert) return;
      if (!movie?.id) return;
      try {
        if (mediaType === 'movie') {
          const rd = await fetchTMDB(`movie/${movie.id}/release_dates`);
          console.debug('DetailsHero: fetched release_dates ->', rd);
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
        } else {
          const cr = await fetchTMDB(`tv/${movie.id}/content_ratings`);
          console.debug('DetailsHero: fetched content_ratings ->', cr);
          const cresults = cr && cr.results;
          if (Array.isArray(cresults) && cresults.length > 0) {
            const pref = cresults.find((r:any) => r.iso_3166_1 === 'US') || cresults[0];
            if (pref && pref.rating && mounted) { setResolvedCert(pref.rating); return; }
          }
        }
      } catch (e) {
        console.debug('DetailsHero: certification fetch failed', e);
      }
    }
    fetchCert();
    return () => { mounted = false; };
  }, [movie?.id, resolvedCert]);

  const jsx = (
    <section ref={heroRef as any} className={"hero-banner" + (fullBleed ? ' full-bleed' : '') + (isPlaying ? ' playing' : '')} style={{backgroundImage: `url(${backdrop})`, display: isVisible ? 'block' : 'none', position: 'relative'}}>
      <div className="hero-trailer" aria-hidden={!trailerKey} style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        {trailerKey && (
          (typeof trailerKey === 'string' && trailerKey.startsWith('vimeo:')) ? (
            (() => {
              const vimeoId = String(trailerKey).replace('vimeo:', '');
              console.debug('DetailsHero: embedding vimeo', vimeoId, 'muted=', isMuted);
              return (
                <iframe
                  src={`https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}?autoplay=1&muted=${isMuted ? 1 : 0}&loop=1&background=${isMuted ? 1 : 0}`}
                  title="Trailer"
                  frameBorder="0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  loading="lazy"
                  style={{ width: '100%', height: '100%' }}
                />
              );
            })()
            ) : (
            ((): React.ReactElement => {
              console.debug('DetailsHero: embedding youtube', trailerKey, 'muted=', isMuted);
              return (
                <iframe
                  src={`https://www.youtube.com/embed/${encodeURIComponent(String(trailerKey))}?rel=0&autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&playsinline=1&modestbranding=1&loop=1&playlist=${encodeURIComponent(String(trailerKey))}&enablejsapi=1`}
                  title="Trailer"
                  frameBorder="0"
                  allow="autoplay; encrypted-media"
                  allowFullScreen
                  loading="lazy"
                  style={{ width: '100%', height: '100%' }}
                />
              );
            })()
          )
        )}
      </div>

      <div className="hero-overlay" aria-hidden="true" />

      {/* mute button and certification moved into .hero-actions below */}

      <div className="hero-content" onMouseEnter={handleUserInteract} onFocus={handleUserInteract} onClick={handleUserInteract}>
        <div className="hero-main" style={isModalOpen ? { transform: overviewExpanded ? 'translateY(0)' : 'translateY(12px)', transition: 'transform .35s ease' } : undefined}>
          {logoUrl ? (
            <img src={logoUrl} alt={movie.title} className={"hero-logo" + (isPlaying ? ' logo-lower' : '')} />
          ) : (
            <h1 className="hero-title">{movie.title}</h1>
          )}
          <p className={"hero-overview" + (overviewExpanded ? ' expanded' : ' collapsed')}>{movie.overview}</p>
        </div>

        {trailerError && (
          <div className="hero-trailer-fallback" role="status">Trailer unavailable</div>
        )}

        {
          (() => {
            const baseZ = isModalOpen ? 120005 : 2001;
            const defaultLeft = 24;
            const defaultRight = 24;
            const style: any = {};
            // If mutePos indicates the mute button is placed with a 'left' value,
            // place the actions on the right; otherwise place them on the left.
            // For modal layout, let CSS handle placement so actions flow below the overview.
            // Only apply inline absolute positioning for non-modal contexts where mutePos
            // indicates the actions need to be anchored to a viewport edge.
            if (!isModalOpen && mutePos && Object.prototype.hasOwnProperty.call(mutePos, 'left')) {
              style.position = 'absolute';
              style.right = defaultRight;
              style.bottom = 18;
              style.transform = 'none';
              style.transition = 'none';
              style.zIndex = baseZ;
            } else if (!isModalOpen && mutePos && Object.prototype.hasOwnProperty.call(mutePos, 'right')) {
              style.position = 'absolute';
              style.left = defaultLeft;
              style.bottom = 18;
              style.transform = 'none';
              style.transition = 'none';
              style.zIndex = baseZ;
            } else if (!isModalOpen) {
              // Non-modal default anchor (keep existing behavior for homepage hero)
              style.position = 'absolute';
              style.left = defaultLeft;
              style.bottom = 18;
              style.transform = 'none';
              style.transition = 'none';
              style.zIndex = baseZ;
            }
            return (
              <div className="hero-actions" style={Object.keys(style).length ? style : undefined}>
                <button className="play-cta" onClick={() => onPlay && onPlay(movie.id, mediaType)}>
                  <span className="play-icon" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                      <path d="M5 3.868v16.264A1 1 0 0 0 6.553 21.2l12.894-8.132a1 1 0 0 0 0-1.736L6.553 2.8A1 1 0 0 0 5 3.868z" fill="#fff"/>
                    </svg>
                  </span>
                  <span>Play</span>
                </button>

                {!isModalOpen && (
                <button
                  className="more-info-btn"
                  onClick={() => onMore && onMore(movie.id, mediaType)}
                  aria-label={`More info ${movie.title}`}
                  title={`More info ${movie.title}`}
                >
                  <InfoIcon size={16} color="#fff" />
                  <span>More Info</span>
                </button>
                )}

                {/* Certification pill (moved inside actions) */}
                { (resolvedCert || certification) && (
                  <div className="hero-certification" aria-hidden="true" style={{ marginLeft: 8, fontWeight: 700, background: 'rgba(255,255,255,0.06)', padding: '6px 8px', borderRadius: 6 }}>{resolvedCert || certification}</div>
                ) }

                {/* Mute control moved inside actions so it appears as part of the control group */}
                <button
                  className="hero-mute-inline"
                  onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                  aria-label={isMuted ? 'Unmute trailer' : 'Mute trailer'}
                  title={isMuted ? 'Unmute trailer' : 'Mute trailer'}
                  style={{ marginLeft: 8, background: 'transparent', border: 'none', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: 44, width: 44 }}
                >
                  <SpeakerIcon isMuted={isMuted} />
                </button>
              </div>
            );
          })()
        }
      </div>
      
    </section>
  );

  if (fullBleed && heroNode) {
    return createPortal(jsx, heroNode);
  }

  return jsx;
}
