import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Spinner, HStack, Text } from '@chakra-ui/react';
import CustomSelect from './components/CustomSelect';
import PlusMinusIcon from './components/icons/PlusMinusIcon';
import InfoIcon from './components/icons/InfoIcon';
import DetailsHero from './components/DetailsHero';
import RowScroller from './components/RowScroller';
import { fetchTMDB } from '../utils/tmdbClient';

export default function DetailsModal({ tmdbId, itemTypeHint, onPlay, onSelect, onSelectPerson, onGoToCollections, onClose }: { tmdbId?: number | null, itemTypeHint?: 'movie'|'tv'|null, onPlay?: (tmdbId: number | string, type?: 'movie'|'tv'|'anime', params?: Record<string, any>) => void, onSelect?: (tmdbId: number, type?: 'movie'|'tv') => void, onSelectPerson?: (personId:number)=>void, onGoToCollections?: (collectionId?: number) => void, onClose?: ()=>void }) {
  React.useEffect(() => {
    try { console.debug('DetailsModal mount/update tmdbId=', tmdbId, 'itemTypeHint=', itemTypeHint); } catch (e) {}
  }, [tmdbId, itemTypeHint]);
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [itemType, setItemType] = useState<'movie'|'tv'>('movie');

  const [cast, setCast] = useState<any[]>([]);
  const [castPagerIndex, setCastPagerIndex] = useState<number>(0);
  const [castPagerCount, setCastPagerCount] = useState<number>(0);
  const [similarPagerIndex, setSimilarPagerIndex] = useState<number>(0);
  const [similarPagerCount, setSimilarPagerCount] = useState<number>(0);
  const [recsPagerIndex, setRecsPagerIndex] = useState<number>(0);
  const [recsPagerCount, setRecsPagerCount] = useState<number>(0);
  const [similar, setSimilar] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);
  const [trailerPlaying, setTrailerPlaying] = useState(false);
  const [mediaLogo, setMediaLogo] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showHeroContent, setShowHeroContent] = useState(true);

  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      if (!tmdbId) return;
      setLoading(true);
      setItem(null);
      setSeasons([]);
      setEpisodes([]);
      setSelectedSeason(null);
      setSelectedEpisode(null);
      try {
        if (itemTypeHint === 'tv') {
          const tv = await fetchTMDB(`tv/${tmdbId}`);
          setItem(tv);
          setItemType('tv');
          setSeasons(tv.seasons || []);
        } else if (itemTypeHint === 'movie') {
          const mv = await fetchTMDB(`movie/${tmdbId}`);
          setItem(mv);
          setItemType('movie');
        } else {
          try {
            const tv = await fetchTMDB(`tv/${tmdbId}`);
            setItem(tv);
            setItemType('tv');
            setSeasons(tv.seasons || []);
          } catch (tvErr) {
            const mv = await fetchTMDB(`movie/${tmdbId}`);
            setItem(mv);
            setItemType('movie');
          }
        }
      } catch (err) {
        console.error('Failed to fetch details:', err);
        setItem(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [tmdbId]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!tmdbId || !item) return;
        const typePath = itemType === 'tv' ? 'tv' : 'movie';
        const data = await fetchTMDB(`${typePath}/${tmdbId}/images`, { include_image_language: 'en,null' });
        if (!mounted) return;
        const logos = (data && (data.logos || data.logos)) || [];
        if (Array.isArray(logos) && logos.length > 0) {
          logos.sort((a:any,b:any)=> (b.width || 0) - (a.width || 0));
          const logo = logos.find((l:any)=> !!l.file_path) || logos[0];
          if (logo && logo.file_path) {
            setMediaLogo(`https://image.tmdb.org/t/p/original${logo.file_path}`);
            return;
          }
        }
        const fallbackLogo = (item.production_companies && item.production_companies.find((p:any)=>p.logo_path)) || (item.networks && item.networks[0] && item.networks[0].logo_path) || null;
        if (fallbackLogo) setMediaLogo(`https://image.tmdb.org/t/p/w300${fallbackLogo.logo_path || fallbackLogo}`);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [item, tmdbId, itemType]);

  useEffect(() => {
    (async () => {
      if (!tmdbId || itemType !== 'tv' || !selectedSeason) return;
      try {
        const seasonData = await fetchTMDB(`tv/${tmdbId}/season/${selectedSeason}`);
        setEpisodes(seasonData.episodes || []);
        if ((seasonData.episodes || []).length > 0) setSelectedEpisode(seasonData.episodes[0].episode_number || seasonData.episodes[0].id || 1);
      } catch (e) {
        console.error('Failed to load season data:', e);
        setEpisodes([]);
        setSelectedEpisode(null);
      }
    })();
  }, [selectedSeason, tmdbId, itemType]);

  useEffect(() => {
    (async () => {
      if (!tmdbId || !item) return;
      try {
        const fav = await (window as any).database.favoritesIs(String(tmdbId), itemType);
        setIsFavorite(Boolean(fav));
      } catch (e) { /* ignore */ }
      try {
        const typePath = itemType === 'tv' ? 'tv' : 'movie';
        const [creditsRes, similarRes, recRes] = await Promise.allSettled([
          fetchTMDB(`${typePath}/${tmdbId}/credits`),
          fetchTMDB(`${typePath}/${tmdbId}/similar`, { page: 1 }),
          fetchTMDB(`${typePath}/${tmdbId}/recommendations`, { page: 1 })
        ]);
        if (creditsRes.status === 'fulfilled') {
          setCast((creditsRes.value && creditsRes.value.cast) ? creditsRes.value.cast : []);
        } else { setCast([]); }
        if (similarRes.status === 'fulfilled') {
          setSimilar(similarRes.value.results || []);
        } else { setSimilar([]); }
        if (recRes.status === 'fulfilled') {
          setRecommendations(recRes.value.results || []);
        } else { setRecommendations([]); }
      } catch (e) {
        console.error('Failed to fetch auxiliary details:', e);
        setCast([]); setSimilar([]); setRecommendations([]);
      }
    })();
  }, [item, tmdbId, itemType]);

  // Enrich similar items with TMDb logos where possible (avoid falling back to posters)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!similar || similar.length === 0) return;
      const typePath = itemType === 'tv' ? 'tv' : 'movie';
      const updated = similar.slice();
      // limit how many items we enrich immediately to avoid hitting TMDB rate limits
      const limit = Math.min(6, updated.length);
      // If a recent rate-limit cooldown exists, skip enrichment
      const cooldown = (window as any).__tmdbRateLimitReset || 0;
      if (Date.now() < cooldown) return;
      for (let idx = 0; idx < limit; idx++) {
        if (!mounted) break;
        const it = updated[idx];
        if (!it || it.logoPath || it.logo_path) continue;
        try {
          const data = await fetchTMDB(`${typePath}/${it.id}/images`, { include_image_language: 'en,null' });
          const logos = (data && (data.logos || data.poster_logos || [])) || [];
          if (Array.isArray(logos) && logos.length > 0) {
            const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
            if (eng && eng.file_path) {
              updated[idx] = { ...it, logoPath: eng.file_path };
            }
          }
        } catch (e: any) {
          // If TMDB rate limit hit, set a cooldown to avoid repeated 429s
          try {
            const msg = (e && e.message) ? String(e.message).toLowerCase() : '';
            if (msg.includes('429') || msg.includes('rate')) {
              // wait 30s before attempting more image requests
              (window as any).__tmdbRateLimitReset = Date.now() + 30000;
              console.warn('TMDB rate limit detected during similar-logo enrichment; backing off for 30s');
              break;
            }
          } catch (ee) { /* ignore */ }
        }
        // small delay to spread requests across time
        await new Promise((r) => setTimeout(r, 180));
      }
      if (mounted) setSimilar(updated);
    })();
    return () => { mounted = false; };
  }, [similar, itemType]);

  // Enrich recommendations with TMDb logos where possible (avoid falling back to posters)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!recommendations || recommendations.length === 0) return;
      const typePath = itemType === 'tv' ? 'tv' : 'movie';
      const updated = recommendations.slice();
      const limit = Math.min(6, updated.length);
      const cooldown = (window as any).__tmdbRateLimitReset || 0;
      if (Date.now() < cooldown) return;
      for (let idx = 0; idx < limit; idx++) {
        if (!mounted) break;
        const it = updated[idx];
        if (!it || it.logoPath || it.logo_path) continue;
        try {
          const data = await fetchTMDB(`${typePath}/${it.id}/images`, { include_image_language: 'en,null' });
          const logos = (data && (data.logos || data.poster_logos || [])) || [];
          if (Array.isArray(logos) && logos.length > 0) {
            const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
            if (eng && eng.file_path) {
              updated[idx] = { ...it, logoPath: eng.file_path };
            }
          }
        } catch (e: any) {
          try {
            const msg = (e && e.message) ? String(e.message).toLowerCase() : '';
            if (msg.includes('429') || msg.includes('rate')) {
              (window as any).__tmdbRateLimitReset = Date.now() + 30000;
              console.warn('TMDB rate limit detected during recommendations-logo enrichment; backing off for 30s');
              break;
            }
          } catch (ee) { /* ignore */ }
        }
        await new Promise((r) => setTimeout(r, 180));
      }
      if (mounted) setRecommendations(updated);
    })();
    return () => { mounted = false; };
  }, [recommendations, itemType]);

  useEffect(() => {
    let mounted = true;
    setTrailerKey(null);
    setTrailerError(null);
    if (!tmdbId || !item) return;
    const devKey = (window as any).__DEV_TRAILER_KEY;
    if (devKey) {
      setTrailerKey(String(devKey));
      return () => { mounted = false };
    }
    const devResp = (window as any).__DEV_TMDB_RESPONSE;
    if (devResp) {
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
      if (!chosen) { setTrailerError('No videos available (dev override)'); return () => { mounted = false }; }
      const site = (chosen.site || '').toLowerCase();
      const key = chosen.key;
      if (!key) { setTrailerError('Selected video missing key (dev override)'); return () => { mounted = false }; }
      if (site === 'youtube') setTrailerKey(key);
      else if (site === 'vimeo') setTrailerKey(`vimeo:${key}`);
      else setTrailerError(`Video available on ${chosen.site} (not embeddable)`);
      return () => { mounted = false };
    }

    (async () => {
      try {
        const typePath = itemType === 'tv' ? 'tv' : 'movie';
        const data = await fetchTMDB(`${typePath}/${tmdbId}/videos`, { language: 'en-US' });
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
        if (!chosen) { setTrailerError('No videos available'); return; }
        const site = (chosen.site || '').toLowerCase();
        const key = chosen.key;
        if (!key) { setTrailerError('Selected video missing key'); return; }
        if (site === 'youtube') { setTrailerKey(key); }
        else if (site === 'vimeo') { setTrailerKey(`vimeo:${key}`); }
        else { setTrailerError(`Video available on ${chosen.site} (not embeddable)`); }
      } catch (e) {
        console.error('DetailsModal: failed to load trailer', e);
      }
    })();

    return () => { mounted = false };
  }, [item, tmdbId, itemType]);

  useEffect(() => {
    let t: any = null;
    if (!trailerKey) {
      setTrailerPlaying(false);
      setIsMuted(false);
      return;
    }
    t = setTimeout(() => {
      try { if (heroRef.current) { heroRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); (heroRef.current as HTMLElement).focus && (heroRef.current as HTMLElement).focus(); } } catch (e) { }
      setTrailerPlaying(true);
      setIsMuted(false);
    }, 8000);
    return () => { if (t) clearTimeout(t); };
  }, [trailerKey]);

  useEffect(() => {
    return () => {
      if (trailerIframeRef.current) {
        try { const iframe = trailerIframeRef.current; iframe.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*'); } catch (e) { }
      }
    };
  }, [trailerKey]);

  useEffect(() => {
    if (itemType === 'tv' && seasons && seasons.length > 0 && !selectedSeason) {
      setSelectedSeason(seasons[0].season_number || 1);
    }
  }, [seasons, itemType, selectedSeason]);

  async function toggleFavorite() {
    if (!tmdbId) return;
    try {
      if (isFavorite) { await (window as any).database.favoritesRemove(String(tmdbId), itemType); setIsFavorite(false); }
      else { await (window as any).database.favoritesAdd(String(tmdbId), itemType); setIsFavorite(true); }
    } catch (e) { console.error('Favorite toggle failed', e); }
  }

  const toggleMute = () => { setIsMuted(!isMuted); };

  const heroRef = React.useRef<HTMLDivElement | null>(null);
  const modalRef = React.useRef<HTMLDivElement | null>(null);
  const trailerIframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const heroHardPauseTimer = React.useRef<number | null>(null);
  const castRef = React.useRef<HTMLDivElement | null>(null);
  const seasonsRef = React.useRef<HTMLDivElement | null>(null);
  const episodesRef = React.useRef<HTMLDivElement | null>(null);
  const similarRef = React.useRef<HTMLDivElement | null>(null);
  const recsRef = React.useRef<HTMLDivElement | null>(null);

  // Removed modal-level horizontal wheel-to-scroll behavior to prevent
  // mouse-wheel from scrolling rows horizontally inside the details modal.
  // Horizontal scrolling within rows is still available via the RowScroller
  // controls (left/right buttons) and touch/trackpad gestures where supported.

  useEffect(() => {
    function handlePause() { setTrailerPlaying(false); if (trailerIframeRef.current) { try { trailerIframeRef.current.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*'); } catch (e) { } } }
    function handleResume() { if (trailerKey) setTrailerPlaying(true); }
    (window as any).__appTrailerController = { pause: handlePause, resume: handleResume };
    window.addEventListener('app:pause-hero-trailer', handlePause as EventListener);
    window.addEventListener('app:resume-hero-trailer', handleResume as EventListener);
    return () => { try { delete (window as any).__appTrailerController; } catch (e) { } window.removeEventListener('app:pause-hero-trailer', handlePause as EventListener); window.removeEventListener('app:resume-hero-trailer', handleResume as EventListener); };
  }, [trailerKey]);

  // Focus trap: ensure keyboard focus stays in the modal while open
  useEffect(() => {
    const container = modalRef.current as HTMLElement | null;
    if (!container) return;
    const prevActive = document.activeElement as HTMLElement | null;
    if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1');
    try { container.focus(); } catch (e) { /* ignore */ }

    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    function getFocusable() {
      return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        try { onClose && onClose(); } catch (err) { /* ignore */ }
        return;
      }
      if (e.key !== 'Tab') return;
      const list = getFocusable();
      if (list.length === 0) { e.preventDefault(); return; }
      const idx = list.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey) {
        if (idx <= 0) {
          list[list.length - 1].focus();
          e.preventDefault();
        }
      } else {
        if (idx === -1 || idx === list.length - 1) {
          list[0].focus();
          e.preventDefault();
        }
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      try { if (prevActive && typeof prevActive.focus === 'function') prevActive.focus(); } catch (e) { /* ignore */ }
    };
  }, [modalRef.current]);

  // Pause the background hero trailer while this modal is open, and resume when it closes.
  // Also start a hard-pause interval that repeatedly posts pause/stop commands
  // to any background hero iframe to prevent racey resumes.
  useEffect(() => {
    try {
      (window as any).__heroModalOpen = true;
    } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event('app:pause-hero-trailer')); } catch (e) { /* ignore */ }

    try {
      heroHardPauseTimer.current = window.setInterval(() => {
        try {
          const el = document.querySelector('.hero-trailer iframe') as HTMLIFrameElement | null;
          if (!el || !el.contentWindow) return;
          const src = String(el.src || '');
          if (src.includes('player.vimeo')) {
            el.contentWindow.postMessage(JSON.stringify({ method: 'pause' }), '*');
          } else {
            // YouTube pause/stop
            el.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
            el.contentWindow.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
          }
        } catch (e) { /* ignore */ }
      }, 400) as unknown as number;
    } catch (e) { /* ignore */ }

    return () => {
      try { (window as any).__heroModalOpen = false; } catch (e) { /* ignore */ }
      try {
        const suppress = Boolean((window as any).__suppressHeroResume);
        if (!suppress) {
          try { window.dispatchEvent(new Event('app:resume-hero-trailer')); } catch (e) { /* ignore */ }
        } else {
          try { console.debug && console.debug('DetailsModal: resume suppressed while opening player'); } catch (e) {}
        }
      } catch (e) { /* ignore */ }
      try { if (heroHardPauseTimer.current) { window.clearInterval(heroHardPauseTimer.current); heroHardPauseTimer.current = null; } } catch (e) { /* ignore */ }
    };
  }, []);

  if (!tmdbId) return null;
  if (loading) return (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 120000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner /></div>);
  if (!item) return (<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 120000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Box p={4}><Text>Item not found.</Text></Box></div>);

  const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : undefined);
  const fallbackLogoPath = (item.production_companies && item.production_companies.find((p:any)=>p.logo_path)) ? item.production_companies.find((p:any)=>p.logo_path).logo_path : ((item.networks && item.networks[0] && item.networks[0].logo_path) ? item.networks[0].logo_path : null);
  const logoSrc = mediaLogo || (fallbackLogoPath ? `https://image.tmdb.org/t/p/w300${fallbackLogoPath}` : null);

  function handleClose() {
    try { (window as any).__heroModalOpen = false; } catch (e) { /* ignore */ }
    try { window.dispatchEvent(new Event('app:resume-hero-trailer')); } catch (e) { /* ignore */ }
    try { onClose && onClose(); } catch (e) { /* ignore */ }
  }

  return (
    <div className="details-modal-overlay" onClick={() => handleClose()}>
      <div ref={modalRef} className="details-modal-container" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <button aria-label="Close details" onClick={() => handleClose()} style={{ position: 'absolute', right: 12, top: 12, zIndex: 120010, background: 'rgba(255,255,255,0.06)', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6 }}>✕</button>
        {/* Stationary action buttons for the modal hero (rendered outside the hero content so transforms won't affect them)
            Moved to be a direct child of `.details-modal-container` (inserted below) to ensure it isn't nested inside transformed nodes. */}
        <div className="details-modal-inner">
          {/* Use a cloned DetailsHero component so the modal can adjust hero behavior/styles independently */}
          {item && (
            <DetailsHero movie={item} onPlay={(id, t) => onPlay && onPlay(id, t as any)} onMore={() => { /* no-op in modal */ }} fullBleed={false} isModalOpen={true} isVisible={true} mediaType={itemType} />
          )}

          <div className="detail-sections">
            {cast && cast.length > 0 && (
                <div className="cast-section">
                  <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
                    <div style={{fontSize:14,fontWeight:700}}>Cast</div>
                    {castPagerCount > 1 ? (
                      <div className="row-page-indicator-inline" aria-hidden>
                        <div className="bar-list">
                          {Array.from({ length: castPagerCount }).map((_, i) => (
                            <svg key={i} className={`bar ${i === castPagerIndex ? 'active' : ''}`} width="28" height="6" viewBox="0 0 28 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                              <rect width="28" height="6" rx="0" fill="currentColor" />
                            </svg>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <RowScroller className={`row-scroll cast-row`} scrollerRef={castRef} showPager={false} pagerStyle={'bar'} itemCount={cast.length} itemsPerPage={6} disableWheel={true} onPageChange={(idx, count) => { setCastPagerIndex(idx); setCastPagerCount(count); }}>
                    {cast.map((c:any) => (
                      <button key={c.cast_id || c.credit_id || c.id} onClick={() => onSelectPerson && onSelectPerson(c.id)} className="cast-item" style={{minWidth:120}}>
                        <img src={c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined} alt={c.name} />
                        <div className="cast-name">{c.name}</div>
                        <div className="cast-role">{c.character}</div>
                      </button>
                    ))}
                  </RowScroller>
                </div>
              )}
          </div>

          <div className="detail-sections" style={{marginTop:24}}>
            {itemType === 'tv' && seasons && seasons.length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Seasons</div>
                <div tabIndex={0} ref={seasonsRef} onMouseEnter={(e)=> (e.currentTarget as HTMLElement).focus()} style={{display:'flex',gap:12,overflowX:'auto'}}>
                  {seasons.map((s:any) => (
                    <div key={s.season_number} className={`movie-card small ${selectedSeason===s.season_number? 'focused-row':''}`} role="button" tabIndex={0} onClick={() => setSelectedSeason(s.season_number)} style={{minWidth:140, cursor:'pointer'}}>
                      <img src={s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : undefined} alt={s.name || `Season ${s.season_number}`} style={{width:'100%',height:160,objectFit:'cover',borderRadius:6}} />
                      <div style={{fontSize:13,marginTop:6}}>{s.name || `Season ${s.season_number}`}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {itemType === 'tv' && selectedSeason && episodes && episodes.length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Episodes</div>
                <div className="episode-list" tabIndex={0} ref={episodesRef} onMouseEnter={(e)=> (e.currentTarget as HTMLElement).focus()}>
                  {episodes.map((ep:any) => (
                    <div key={ep.episode_number || ep.id} className="episode-item" role="button" tabIndex={0} onClick={() => onPlay && onPlay(tmdbId, 'tv', { tmdbId, season: selectedSeason, episode: ep.episode_number })}>
                      <img src={ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : undefined} alt={ep.name} />
                      <div className="ep-info">
                        <div style={{fontSize:14,fontWeight:700}}>{`${ep.episode_number}. ${ep.name}`}</div>
                        {ep.overview && <div style={{fontSize:13,color:'var(--muted)',marginTop:6}}>{ep.overview}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {similar && similar.length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
                  <div style={{fontSize:18,fontWeight:700}}>More like this</div>
                  {similarPagerCount > 1 ? (
                    <div className="row-page-indicator-inline" aria-hidden>
                      <div className="bar-list">
                        {Array.from({ length: similarPagerCount }).map((_, i) => (
                          <svg key={i} className={`bar ${i === similarPagerIndex ? 'active' : ''}`} width="28" height="6" viewBox="0 0 28 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                            <rect width="28" height="6" rx="0" fill="currentColor" />
                          </svg>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <RowScroller scrollerRef={similarRef} className={`continue-scroll`} showPager={false} pagerStyle={'bar'} itemCount={similar.length} itemsPerPage={5} disableWheel={true} onPageChange={(idx, count) => { setSimilarPagerIndex(idx); setSimilarPagerCount(count); }}>
                  {similar.map((s:any) => (
                    <div key={s.id || s.credit_id || `${s.media_type || 'm'}-${Math.random()}`} className="movie-item" style={{minWidth:232.96, width:232.96, cursor:'pointer'}} onClick={(ev) => {
                      try {
                        ev.stopPropagation();
                        const id = s.id || s.tmdb_id || s.movie_id || s.show_id;
                        if (!id) {
                          console.warn('DetailsModal: clicked similar item missing id', s);
                          return;
                        }
                        if (onSelect) onSelect(id, itemType);
                      } catch (err) {
                        console.error('DetailsModal: onSelect(similar) failed', err, s);
                      }
                    }}>
                      <div className={`continue-card`} tabIndex={0}>
                        { (s.backdrop_path || s.backdrop) ? (
                          <div className="continue-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${s.backdrop_path || s.backdrop})` }}>
                            { (s.logoPath || s.logo_path) ? (
                              <img loading="lazy" src={`https://image.tmdb.org/t/p/w300${s.logoPath || s.logo_path}`} alt={s.title || s.name} className="continue-logo" />
                            ) : (
                              <div className="continue-logo-text">{s.title || s.name}</div>
                            )}
                          </div>
                        ) : (
                          <div className="continue-backdrop placeholder"><div className="continue-logo-text">{s.title || s.name}</div></div>
                        )}
                        <div className="play-overlay" onClick={(ev)=>{ try { ev.stopPropagation(); const id = s.id || s.tmdb_id || s.movie_id; if (!id) { console.warn('DetailsModal: play clicked for similar item missing id', s); return; } if (onPlay) onPlay(id, itemType, { tmdbId: id }); } catch(err){ console.error('DetailsModal: onPlay(similar) failed', err, s); } }}>
                          <div className="play-circle"><div className="play-triangle"/></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </RowScroller>
              </div>
            )}

            {recommendations && recommendations.length > 0 && (
              <div style={{marginBottom:20}}>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
                  <div style={{fontSize:18,fontWeight:700}}>You may also like</div>
                  {recsPagerCount > 1 ? (
                    <div className="row-page-indicator-inline" aria-hidden>
                      <div className="bar-list">
                        {Array.from({ length: recsPagerCount }).map((_, i) => (
                          <svg key={i} className={`bar ${i === recsPagerIndex ? 'active' : ''}`} width="28" height="6" viewBox="0 0 28 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                            <rect width="28" height="6" rx="0" fill="currentColor" />
                          </svg>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <RowScroller scrollerRef={recsRef} className={`continue-scroll`} showPager={false} pagerStyle={'bar'} itemCount={recommendations.length} itemsPerPage={5} disableWheel={true} onPageChange={(idx, count) => { setRecsPagerIndex(idx); setRecsPagerCount(count); }}>
                  {recommendations.map((r:any) => (
                    <div key={r.id || r.credit_id || `${r.media_type || 'm'}-${Math.random()}`} className="movie-item" style={{minWidth:232.96, width:232.96, cursor:'pointer'}} onClick={(ev) => {
                      try {
                        ev.stopPropagation();
                        const id = r.id || r.tmdb_id || r.movie_id || r.show_id;
                        if (!id) {
                          console.warn('DetailsModal: clicked recommendation item missing id', r);
                          return;
                        }
                        if (onSelect) onSelect(id, itemType);
                      } catch (err) {
                        console.error('DetailsModal: onSelect(recommendation) failed', err, r);
                      }
                    }}>
                      <div className={`continue-card`} tabIndex={0}>
                        { (r.backdrop_path || r.backdrop) ? (
                          <div className="continue-backdrop" style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${r.backdrop_path || r.backdrop})` }}>
                            { (r.logoPath || r.logo_path) ? (
                              <img loading="lazy" src={`https://image.tmdb.org/t/p/w300${r.logoPath || r.logo_path}`} alt={r.title || r.name} className="continue-logo" />
                            ) : (
                              <div className="continue-logo-text">{r.title || r.name}</div>
                            )}
                          </div>
                        ) : (
                          <div className="continue-backdrop placeholder"><div className="continue-logo-text">{r.title || r.name}</div></div>
                        )}
                        <div className="play-overlay" onClick={(ev)=>{ try { ev.stopPropagation(); const id = r.id || r.tmdb_id || r.movie_id; if (!id) { console.warn('DetailsModal: play clicked for recommendation item missing id', r); return; } if (onPlay) onPlay(id, itemType, { tmdbId: id }); } catch(err){ console.error('DetailsModal: onPlay(recommendation) failed', err, r); } }}>
                          <div className="play-circle"><div className="play-triangle"/></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </RowScroller>
              </div>
            )}
          </div>
        </div>
        
      </div>
      
    </div>
  );
}
