import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Spinner, HStack, Text } from '@chakra-ui/react';
import CustomSelect from './components/CustomSelect';
import PlusMinusIcon from './components/icons/PlusMinusIcon';
import { fetchTMDB } from '../utils/tmdbClient';

export default function DetailsPage({ tmdbId, itemTypeHint, onPlay, onSelect, onSelectPerson, onGoToCollections }: { tmdbId?: number | null, itemTypeHint?: 'movie'|'tv'|null, onPlay?: (tmdbId: number | string, type?: 'movie'|'tv'|'anime', params?: Record<string, any>) => void, onSelect?: (tmdbId: number, type?: 'movie'|'tv') => void, onSelectPerson?: (personId:number)=>void, onGoToCollections?: (collectionId?: number) => void }) {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [itemType, setItemType] = useState<'movie'|'tv'>('movie');

  const [cast, setCast] = useState<any[]>([]);
  const [similar, setSimilar] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);
  const [trailerPlaying, setTrailerPlaying] = useState(false);
  const [mediaLogo, setMediaLogo] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showHeroContent, setShowHeroContent] = useState(true);

  // Favorite state for this detail item
  const [isFavorite, setIsFavorite] = useState<boolean>(false);

  // TV specific
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
        // If caller hinted a type, use that deterministically
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
          // Try fetching as TV first — if it exists, treat as TV
          try {
            const tv = await fetchTMDB(`tv/${tmdbId}`);
            setItem(tv);
            setItemType('tv');
            setSeasons(tv.seasons || []);
          } catch (tvErr) {
            // Not a TV show or failed — fallback to movie
            const mv = await fetchTMDB(`movie/${tmdbId}`);
            setItem(mv);
            setItemType('movie');
          }
        }
        // fetch media logos (movie/tv images) to prefer the specific title logo
        try {
          const typePath = itemTypeHint === 'tv' ? 'tv' : (itemTypeHint === 'movie' ? 'movie' : undefined);
          // if we determined itemType above, use it, otherwise try both later via separate effect
        } catch (e) {
          // ignore
        }
      } catch (err) {
        console.error('Failed to fetch details:', err);
        setItem(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [tmdbId]);

  // Fetch title-specific logo from TMDb images endpoint (prefer logos array)
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
          // prefer largest width
          logos.sort((a:any,b:any)=> (b.width || 0) - (a.width || 0));
          const logo = logos.find((l:any)=> !!l.file_path) || logos[0];
          if (logo && logo.file_path) {
            setMediaLogo(`https://image.tmdb.org/t/p/original${logo.file_path}`);
            return;
          }
        }
        // fallback: try production company or network logos already present on item
        const fallbackLogo = (item.production_companies && item.production_companies.find((p:any)=>p.logo_path)) || (item.networks && item.networks[0] && item.networks[0].logo_path) || null;
        if (fallbackLogo) setMediaLogo(`https://image.tmdb.org/t/p/w300${fallbackLogo.logo_path || fallbackLogo}`);
      } catch (e) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [item, tmdbId, itemType]);

  // When a season is selected, load its episodes
  useEffect(() => {
    (async () => {
      if (!tmdbId || itemType !== 'tv' || !selectedSeason) return;
      try {
        const seasonData = await fetchTMDB(`tv/${tmdbId}/season/${selectedSeason}`);
        setEpisodes(seasonData.episodes || []);
        // default to first episode
        if ((seasonData.episodes || []).length > 0) setSelectedEpisode(seasonData.episodes[0].episode_number || seasonData.episodes[0].id || 1);
      } catch (e) {
        console.error('Failed to load season data:', e);
        setEpisodes([]);
        setSelectedEpisode(null);
      }
    })();
  }, [selectedSeason, tmdbId, itemType]);

  // Fetch cast, similar and recommendations whenever item loads
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

  // Load trailer when item loads or tmdbId changes
  useEffect(() => {
    let mounted = true;
    setTrailerKey(null);
    setTrailerError(null);
    if (!tmdbId || !item) return;

    // Dev override: set `window.__DEV_TRAILER_KEY = 'YOUTUBE_KEY'` in DevTools to force a trailer
    const devKey = (window as any).__DEV_TRAILER_KEY;
    if (devKey) {
      console.debug('DetailsPage: using dev override trailer key');
      setTrailerKey(String(devKey));
      return () => { mounted = false };
    }

    // Dev override: set `window.__DEV_TMDB_RESPONSE = {...}` to simulate TMDb /videos response
    const devResp = (window as any).__DEV_TMDB_RESPONSE;
    if (devResp) {
      console.debug('DetailsPage: using dev TMDb response override', devResp);
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
        console.debug('DetailsPage(dev): no videos in provided response', { results });
        setTrailerError('No videos available (dev override)');
        return () => { mounted = false };
      }
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

        // Prefer prioritized types, falling back to any video
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
          console.debug('DetailsPage: no videos at all in TMDb response', { results });
          setTrailerError('No videos available');
          return;
        }

        const site = (chosen.site || '').toLowerCase();
        const key = chosen.key;
        if (!key) {
          console.debug('DetailsPage: chosen video has no key', { chosen });
          setTrailerError('Selected video missing key');
          return;
        }
        if (site === 'youtube') {
          setTrailerKey(key);
        } else if (site === 'vimeo') {
          setTrailerKey(`vimeo:${key}`);
        } else {
          console.debug('DetailsPage: found video on unsupported site', { site, chosen });
          setTrailerError(`Video available on ${chosen.site} (not embeddable)`);
        }
      } catch (e) {
        console.error('DetailsPage: failed to load trailer', e);
        // Removed error message display
      }
    })();

    return () => { mounted = false };
  }, [item, tmdbId, itemType]);

  // When trailerKey is set, wait 3s then bring hero to view and show trailer
  useEffect(() => {
    let t: any = null;
    if (!trailerKey) {
      setTrailerPlaying(false);
      setIsMuted(false);
      return;
    }
    t = setTimeout(() => {
      try {
        if (heroRef.current) {
          heroRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (heroRef.current as HTMLElement).focus && (heroRef.current as HTMLElement).focus();
        }
      } catch (e) { /* ignore */ }
      setTrailerPlaying(true);
      setIsMuted(false); // Start unmuted
    }, 8000);
    return () => { if (t) clearTimeout(t); };
  }, [trailerKey]);

  // Stop trailer when component unmounts or tmdbId changes
  useEffect(() => {
    return () => {
      // Stop the YouTube video when leaving the page
      if (trailerIframeRef.current) {
        try {
          const iframe = trailerIframeRef.current;
          iframe.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
        } catch (e) {
          // Ignore errors if iframe is not accessible
        }
      }
    };
  }, [trailerKey]);

  // When seasons are available, default to the first season so episodes feed shows
  useEffect(() => {
    if (itemType === 'tv' && seasons && seasons.length > 0 && !selectedSeason) {
      // pick first season (usually season_number 1)
      setSelectedSeason(seasons[0].season_number || 1);
    }
  }, [seasons, itemType, selectedSeason]);

  async function toggleFavorite() {
    if (!tmdbId) return;
    try {
      if (isFavorite) {
        await (window as any).database.favoritesRemove(String(tmdbId), itemType);
        setIsFavorite(false);
      } else {
        await (window as any).database.favoritesAdd(String(tmdbId), itemType);
        setIsFavorite(true);
      }
    } catch (e) { console.error('Favorite toggle failed', e); }
  }

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  // Refs for horizontal feed containers so we can attach native wheel listeners (passive:false)
  const heroRef = React.useRef<HTMLDivElement | null>(null);
  const trailerIframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const castRef = React.useRef<HTMLElement | null>(null);
  const seasonsRef = React.useRef<HTMLElement | null>(null);
  const episodesRef = React.useRef<HTMLElement | null>(null);
  const similarRef = React.useRef<HTMLElement | null>(null);
  const recsRef = React.useRef<HTMLElement | null>(null);

  // Attach native wheel listeners with passive: false so we can call preventDefault reliably
  useEffect(() => {
    const nodes: Array<{ ref: React.RefObject<HTMLElement>, name: string }> = [
      { ref: castRef, name: 'cast' },
      { ref: seasonsRef, name: 'seasons' },
      { ref: episodesRef, name: 'episodes' },
      { ref: similarRef, name: 'similar' },
      { ref: recsRef, name: 'recommendations' },
    ];
    const attached: Array<{ el: HTMLElement, fn: EventListener }> = [];
    for (const n of nodes) {
      const el = n.ref.current;
      if (!el) continue;
      const fn = function (ev: WheelEvent) {
        try {
          // only intercept when primarily vertical
          if (Math.abs(ev.deltaY) > Math.abs((ev as any).deltaX || 0)) {
            ev.preventDefault();
            // translate vertical to horizontal scroll
            el.scrollLeft += ev.deltaY;
          }
        } catch (e) { /* ignore */ }
      } as EventListener;
      el.addEventListener('wheel', fn, { passive: false });
      attached.push({ el, fn });
    }
    return () => {
      for (const a of attached) {
        try { a.el.removeEventListener('wheel', a.fn as EventListener); } catch (e) { /* ignore */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons, episodes, similar, recommendations, cast]);

  // Listen for external requests to pause/resume the hero trailer (e.g., when another preview plays)
  useEffect(() => {
    function handlePause() {
      // stop showing the hero trailer
      setTrailerPlaying(false);
      // also request iframe to stop if present
      if (trailerIframeRef.current) {
        try {
          trailerIframeRef.current.contentWindow?.postMessage('{"event":"command","func":"stopVideo","args":""}', '*');
        } catch (e) { /* ignore */ }
      }
    }
    function handleResume() {
      if (trailerKey) {
        setTrailerPlaying(true);
      }
    }
    // Expose a global controller for immediate control from other components
    (window as any).__appTrailerController = {
      pause: handlePause,
      resume: handleResume,
    };

    // Keep legacy event listeners for compatibility
    window.addEventListener('app:pause-hero-trailer', handlePause as EventListener);
    window.addEventListener('app:resume-hero-trailer', handleResume as EventListener);
    return () => {
      try { delete (window as any).__appTrailerController; } catch (e) { /* ignore */ }
      window.removeEventListener('app:pause-hero-trailer', handlePause as EventListener);
      window.removeEventListener('app:resume-hero-trailer', handleResume as EventListener);
    };
  }, [trailerKey]);

  if (!tmdbId) return <Box p={4}><Text>Select a movie or TV show to view details.</Text></Box>;
  if (loading) return <Box p={4}><Spinner /></Box>;
  if (!item) return <Box p={4}><Text>Item not found.</Text></Box>;

  // Compute hero backdrop and optional logo for media title
  const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : (item.poster_path ? `https://image.tmdb.org/t/p/original${item.poster_path}` : undefined);
  // Prefer the media-specific logo fetched from TMDb images endpoint, fallback to network/production company logo
  const fallbackLogoPath = (item.production_companies && item.production_companies.find((p:any)=>p.logo_path)) ? item.production_companies.find((p:any)=>p.logo_path).logo_path : ((item.networks && item.networks[0] && item.networks[0].logo_path) ? item.networks[0].logo_path : null);
  const logoSrc = mediaLogo || (fallbackLogoPath ? `https://image.tmdb.org/t/p/w300${fallbackLogoPath}` : null);

  return (
    <>
      <div className="detail-hero" ref={heroRef} tabIndex={-1} onClick={() => setShowHeroContent(!showHeroContent)} style={backdropUrl ? { backgroundImage: `url(${backdropUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className="detail-trailer" aria-hidden={!trailerKey ? 'true' : 'false'}>
          {trailerKey && trailerPlaying && (
            <>
              <iframe
                key={`${trailerKey}-${isMuted}`}
                ref={trailerIframeRef}
                src={`https://www.youtube.com/embed/${trailerKey}?rel=0&autoplay=1&mute=${isMuted ? 1 : 0}&controls=0&playsinline=1&modestbranding=1&loop=1&playlist=${trailerKey}&enablejsapi=1`}
                title="Trailer"
                frameBorder="0"
                allow="autoplay; encrypted-media"
                allowFullScreen
                loading="lazy"
              />
            </>
          )}
        </div>

        {showHeroContent && (
        <div className="hero-overlay">
          <div className="hero-content">
            {trailerError && <div className="hero-trailer-fallback" role="status" style={{marginBottom:8}}>{trailerError}</div>}
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              {logoSrc ? (
                <img src={logoSrc} alt={item.title || item.name} className="detail-logo" style={{maxHeight:64,objectFit:'contain'}} />
              ) : (
                <div className="detail-title">{item.title || item.name}</div>
              )}
            </div>
            <div className="detail-meta" style={{marginTop:8}}>{item.release_date || item.first_air_date} • {item.runtime ? item.runtime + 'm' : ''} • Rating {item.vote_average}/10</div>
            <div className="hero-overview" style={{marginTop:12}}>{item.overview}</div>

            <div style={{marginTop:16, display:'flex', gap:8, alignItems:'center'}}>
              {onPlay && itemType === 'movie' && (
                <Button onClick={(e) => { e.stopPropagation(); onPlay(tmdbId, 'movie', { tmdbId }); }} className="button primary">Play</Button>
              )}
              {onPlay && itemType === 'tv' && (
                <Button onClick={(e) => { e.stopPropagation(); onPlay(tmdbId, 'tv', { tmdbId, season: 1, episode: 1 }); }} className="button primary">Play</Button>
              )}
              <Button aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'} onClick={(e) => { e.stopPropagation(); toggleFavorite(); }} variant="ghost" style={{ padding: 6 }} title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
                <PlusMinusIcon isMinus={isFavorite} size={18} color={isFavorite ? '#D81F26' : 'var(--muted)'} />
              </Button>
              {item && item.belongs_to_collection && onGoToCollections && (
                <Button 
                  onClick={(e) => { e.stopPropagation(); onGoToCollections(item.belongs_to_collection.id); }} 
                  variant="ghost" 
                  style={{ padding: 6 }}
                  aria-label="View collection"
                >
                  <span style={{fontSize:18, lineHeight:1}}>📚</span>
                </Button>
              )}
              {trailerKey && (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  className="mute-btn"
                  aria-label={isMuted ? 'Unmute trailer' : 'Mute trailer'}
                >
                  {isMuted ? '🔊' : '🔇'}
                </button>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      <div className="detail-sections">
        {/* Cast preview moved below hero */}
        {cast && cast.length > 0 && (
          <div className="cast-section">
          <div style={{fontSize:14,fontWeight:700,marginBottom:8}}>Cast</div>
          <div className="cast-row" tabIndex={0} ref={castRef} onMouseEnter={(e)=> (e.currentTarget as HTMLElement).focus()}>
            {cast.slice(0,12).map((c:any) => (
              <button key={c.cast_id || c.credit_id || c.id} onClick={() => onSelectPerson && onSelectPerson(c.id)} className="cast-item">
                <img src={c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined} alt={c.name} />
                <div className="cast-name">{c.name}</div>
                <div className="cast-role">{c.character}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    <div className="detail-sections" style={{marginTop:24}}>
        {/* Seasons and Episodes feeds for TV shows */}
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

        {/* More like this (similar) */}
        {similar && similar.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>More like this</div>
            <div tabIndex={0} ref={similarRef} onMouseEnter={(e)=> (e.currentTarget as HTMLElement).focus()} style={{display:'flex',gap:12,overflowX:'auto'}}>
              {similar.slice(0,12).map((s:any) => (
                <div key={s.id} style={{width:150,minWidth:150,cursor:'pointer'}} onClick={() => onSelect && onSelect(s.id, itemType)}>
                  <div className="movie-overlay">
                    <img src={s.poster_path ? `https://image.tmdb.org/t/p/w300${s.poster_path}` : undefined} alt={s.title || s.name} style={{width:150,height:220,objectFit:'cover',borderRadius:6}} />
                    <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlay) onPlay(s.id, itemType, { tmdbId: s.id }); }}>
                      <div className="play-circle"><div className="play-triangle"/></div>
                    </div>
                  </div>
                  <div style={{fontSize:13,marginTop:6}}>{s.title || s.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* You may also like (recommendations) */}
        {recommendations && recommendations.length > 0 && (
          <div style={{marginBottom:20}}>
            <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>You may also like</div>
            <div tabIndex={0} ref={recsRef} onMouseEnter={(e)=> (e.currentTarget as HTMLElement).focus()} style={{display:'flex',gap:12,overflowX:'auto'}}>
              {recommendations.slice(0,12).map((r:any) => (
                <div key={r.id} style={{width:150,minWidth:150,cursor:'pointer'}} onClick={() => onSelect && onSelect(r.id, itemType)}>
                  <div className="movie-overlay">
                    <img src={r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : undefined} alt={r.title || r.name} style={{width:150,height:220,objectFit:'cover',borderRadius:6}} />
                    <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlay) onPlay(r.id, itemType, { tmdbId: r.id }); }}>
                      <div className="play-circle"><div className="play-triangle"/></div>
                    </div>
                  </div>
                  <div style={{fontSize:13,marginTop:6}}>{r.title || r.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      </div>
    </>
  );
}
