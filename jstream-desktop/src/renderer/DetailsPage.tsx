import React, { useEffect, useState } from 'react';
import { Box, Button, Spinner, HStack, Text } from '@chakra-ui/react';
import CustomSelect from './components/CustomSelect';
import { fetchTMDB } from '../utils/tmdbClient';

export default function DetailsPage({ tmdbId, itemTypeHint, onPlay, onSelect, onSelectPerson }: { tmdbId?: number | null, itemTypeHint?: 'movie'|'tv'|null, onPlay?: (tmdbId: number | string, type?: 'movie'|'tv'|'anime', params?: Record<string, any>) => void, onSelect?: (tmdbId: number, type?: 'movie'|'tv') => void, onSelectPerson?: (personId:number)=>void }) {
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [itemType, setItemType] = useState<'movie'|'tv'>('movie');

  const [cast, setCast] = useState<any[]>([]);
  const [similar, setSimilar] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);

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
      } catch (err) {
        console.error('Failed to fetch details:', err);
        setItem(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [tmdbId]);

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

  // Refs for horizontal feed containers so we can attach native wheel listeners (passive:false)
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

  if (!tmdbId) return <Box p={4}><Text>Select a movie or TV show to view details.</Text></Box>;
  if (loading) return <Box p={4}><Spinner /></Box>;
  if (!item) return <Box p={4}><Text>Item not found.</Text></Box>;

  return (
    <>
      <div className="detail-hero">
      <img className="detail-poster" src={item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : undefined} alt={item.title || item.name} />
      <div className="detail-info">
        <div className="detail-title">{item.title || item.name}</div>
        <div className="detail-meta">{item.release_date || item.first_air_date} • {item.runtime ? item.runtime + 'm' : ''} • Rating {item.vote_average}/10</div>
        <div className="detail-overview">{item.overview}</div>

        {/* Season/episode selectors removed from hero per request — feeds shown below */}

        <div style={{marginTop:16, display:'flex', gap:8, alignItems:'center'}}>
          {onPlay && itemType === 'movie' && (
            <Button
              onClick={() => onPlay(tmdbId, 'movie', { tmdbId })}
              bg="#D81F26"
              color="#fff"
              _hover={{ bg: '#B71C1F' }}
            >
              Play
            </Button>
          )}
          {onPlay && itemType === 'tv' && (
            <Button
              onClick={() => onPlay(tmdbId, 'tv', { tmdbId, season: 1, episode: 1 })}
              bg="#D81F26"
              color="#fff"
              _hover={{ bg: '#B71C1F' }}
            >
              Play
            </Button>
          )}
          <Button
            aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={toggleFavorite}
            variant="ghost"
            _hover={{ bg: 'transparent' }}
            style={{ padding: 6 }}
          >
            <span style={{fontSize:18, lineHeight:1, color: isFavorite ? '#D81F26' : 'var(--muted)'}}>{isFavorite ? '♥' : '♡'}</span>
          </Button>
        </div>

        {/* Cast preview inside hero (circular profiles) */}
        {cast && cast.length > 0 && (
          <div style={{marginTop:18}} className="cast-section">
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
      </div>
    </div>
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
    </>
  );
}
