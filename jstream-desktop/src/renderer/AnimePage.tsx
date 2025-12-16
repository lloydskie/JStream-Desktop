import React, { useEffect, useState, useRef } from 'react';
import RowScroller from './components/RowScroller';
import { Box, Button, Spinner } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';

// Strict Anime selection rules (per user's specification):
// - genre = Animation
// - original_language = ja
// - origin_country = JP
// We'll compute anime as the intersection of these attributes and then
// present genre-specific sections by filtering the intersected results
// client-side for each genre (so "Animation + JP + ja" ∩ genre = true).

export default function AnimePage({ genres = [], onSelectMovie, onPlayMovie }: { genres?: any[], onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'tv'|'movie', params?:Record<string,any>)=>void }) {
  // Core anime genre names to display in UI (mapped to TMDB genre ids)
  const CORE_GENRES = [
    'Action', 'Adventure', 'Fantasy', 'Sci-Fi', 'Romance', 'Comedy', 'Drama', 'Horror', 'Mystery', 'Thriller'
  ];

  const [displayGenres, setDisplayGenres] = useState<any[]>([]);
  const [overview, setOverview] = useState<Record<number, any[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [animationGenreId, setAnimationGenreId] = useState<number | null>(null);

  // Resolve Animation genre id (prefer movie list, fallback to tv list, fallback to 16)
  useEffect(() => {
    (async () => {
      try {
        const mg = await fetchTMDB('genre/movie/list');
        const tg = await fetchTMDB('genre/tv/list');
        const movieGenres = (mg && mg.genres) ? mg.genres : [];
        const tvGenres = (tg && tg.genres) ? tg.genres : [];
        const findAnim = (list: any[]) => (list.find((x:any) => String(x.name).toLowerCase() === 'animation') || null);
        const mAnim = findAnim(movieGenres);
        const tAnim = findAnim(tvGenres);
        const id = (mAnim && mAnim.id) || (tAnim && tAnim.id) || 16;
        setAnimationGenreId(id);
        // compute displayGenres mapping for CORE_GENRES -> TMDB ids
        const all = [...movieGenres, ...tvGenres];
        const aliases: Record<string, string[]> = {
          'Sci-Fi': ['science fiction','sci-fi','sci fi']
        };
        const picks: any[] = [];
        for (const label of CORE_GENRES) {
          const targets = aliases[label] || [label.toLowerCase()];
          let found = null;
          for (const t of targets) {
            found = all.find((x:any) => String(x.name).toLowerCase() === t);
            if (found) break;
          }
          if (found) picks.push({ id: found.id, name: label });
        }
        // If no picks mapped, fallback to provided `genres` prop intersection
        if (picks.length === 0 && genres && genres.length > 0) {
          for (const label of CORE_GENRES) {
            const found = genres.find((x:any) => String(x.name).toLowerCase() === label.toLowerCase());
            if (found) picks.push({ id: found.id, name: label });
          }
        }
        // If still empty, just use the provided genres fallback
        setDisplayGenres(picks.length > 0 ? picks : (genres || []));
      } catch (e) {
        setAnimationGenreId(16);
        setDisplayGenres(genres || []);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!animationGenreId) return;
    // For each displayed core genre, fetch TV-first discover constrained to Animation + genre
    const load = async () => {
      const effective = displayGenres.length ? displayGenres : (genres || []);
      for (const g of effective) {
        const gid = g.id;
        setLoadingMap(prev => ({ ...prev, [gid]: true }));
        try {
          const baseParams: Record<string, string | number> = {
            // combine animation genre and the specific genre id; TMDB uses comma to AND genres
            with_genres: `${animationGenreId},${gid}`,
            with_original_language: 'ja',
            with_origin_country: 'JP',
            sort_by: 'popularity.desc',
            page: 1,
          };

          // TV discover first
          const tRes = await fetchTMDB('discover/tv', baseParams);
          const tvList = (tRes && tRes.results) ? tRes.results : [];

          // Supplement with movie discover for the same combined genres
          const mRes = await fetchTMDB('discover/movie', baseParams);
          const movieList = (mRes && mRes.results) ? mRes.results : [];

          const combined = [
            ...tvList.map((it:any)=> ({ ...it, _media: 'tv' })),
            ...movieList.map((it:any)=> ({ ...it, _media: 'movie' })),
          ];

          // dedupe by media+id
          const seen = new Set<string>();
          const deduped = combined.filter((it:any) => {
            const key = `${it._media}:${it.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          deduped.sort((a:any,b:any) => (b.popularity||0) - (a.popularity||0));
          setOverview(prev => ({ ...prev, [gid]: deduped }));
        } catch (e) {
          console.warn('Failed to load anime genre feed', g, e);
          setOverview(prev => ({ ...prev, [gid]: [] }));
        } finally {
          setLoadingMap(prev => ({ ...prev, [gid]: false }));
        }
      }
    };
    load();
  }, [displayGenres, genres, animationGenreId]);

  // If displayGenres hasn't been resolved yet, derive it from passed genres or query TMDB
  useEffect(() => {
    (async () => {
      if (displayGenres && displayGenres.length > 0) return;
      try {
        // Build map of TMDB genre names -> ids using provided genres as fallback
        const movieG = await fetchTMDB('genre/movie/list');
        const tvG = await fetchTMDB('genre/tv/list');
        const movieGenres = (movieG && movieG.genres) ? movieG.genres : [];
        const tvGenres = (tvG && tvG.genres) ? tvG.genres : [];
        const all = [...movieGenres, ...tvGenres];
        const picks: any[] = [];
        for (const name of CORE_GENRES) {
          const found = all.find((x:any) => String(x.name).toLowerCase() === String(name).toLowerCase());
          if (found) picks.push({ id: found.id, name });
        }
        // fallback: if none found and prop `genres` provided contains names, use intersection
        if (picks.length === 0 && genres && genres.length > 0) {
          for (const name of CORE_GENRES) {
            const found = genres.find((x:any) => String(x.name).toLowerCase() === String(name).toLowerCase());
            if (found) picks.push({ id: found.id, name });
          }
        }
        setDisplayGenres(picks);
      } catch (e) {
        // Ignore errors — will use passed-in genres
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const effectiveGenres = (displayGenres && displayGenres.length > 0) ? displayGenres : (genres || []);

  if (!effectiveGenres || effectiveGenres.length === 0) return <Box p={6}><Spinner /></Box>;

  if (selectedGenre) {
    return <GenreView genreId={selectedGenre} genreName={(effectiveGenres.find(g=>g.id===selectedGenre)||{}).name} onBack={()=>setSelectedGenre(null)} onSelectMovie={onSelectMovie} onPlayMovie={onPlayMovie} animationGenreId={animationGenreId} keywordIncludeId={null} keywordExcludeIds={[]} />;
  }

  return (
    <Box>
      {(effectiveGenres || []).map((g:any)=> (
        <section key={g.id} style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <h3 style={{margin:0,fontSize:18,fontWeight:700}}>{g.name}</h3>
            <div>
              <Button size="sm" variant="ghost" onClick={()=>setSelectedGenre(g.id)}>More</Button>
            </div>
          </div>
          <RowScroller className="row-scroll" disableWheel={true}>
              {loadingMap[g.id] ? (
                <div style={{padding:12}}><Spinner /></div>
              ) : (
                (() => {
                  const list = overview[g.id] || [];
                  if (!list || list.length === 0) return <div style={{color:'var(--muted)', padding:12}}>No popular anime found for this genre.</div>;
                  return list.slice(0,12).map((m:any)=> (
                    <div key={`${m._media}-${m.id}`} className="movie-card small" tabIndex={0} role="button" onClick={()=> onSelectMovie && onSelectMovie(m.id, m._media === 'tv' ? 'tv' : 'movie')}>
                      <div className="movie-overlay">
                        <img className="movie-poster" src={m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : undefined} alt={m.title || m.name} />
                        <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayMovie) onPlayMovie(m.id, m._media === 'tv' ? 'tv' : 'movie', { tmdbId: m.id }); }}>
                          <div className="play-circle"><div className="play-triangle"/></div>
                        </div>
                      </div>
                      <div className="movie-info">
                        <div style={{fontSize:13,fontWeight:700}}>{m.title || m.name}</div>
                        <div style={{fontSize:12,color:'var(--muted)'}}>{m.release_date || m.first_air_date}</div>
                      </div>
                    </div>
                  ));
                })()
              )}
          </RowScroller>
        </section>
      ))}
    </Box>
  );
}

function GenreView({ genreId, genreName, onBack, onSelectMovie, onPlayMovie, animationGenreId, keywordIncludeId, keywordExcludeIds }: { genreId:number, genreName?:string, onBack:()=>void, onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'movie'|'tv', params?:Record<string,any>)=>void, animationGenreId?: number | null, keywordIncludeId?: number | null, keywordExcludeIds?: number[] }){
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement|null>(null);

  useEffect(() => { // load first page
    setItems([]); setPage(1); setHasMore(true);
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreId, animationGenreId, keywordIncludeId, keywordExcludeIds]);

  async function loadPage(p:number, replace=false){
    if (!hasMore && !replace) return;
    setLoading(true);
    try{
      const baseParams: Record<string, string | number> = {
        with_genres: `${animationGenreId || 16},${genreId}`,
        with_original_language: 'ja',
        with_origin_country: 'JP',
        sort_by:'popularity.desc',
        page: p,
      };

      // TV first
      const tRes = await fetchTMDB('discover/tv', baseParams).catch(() => ({ results: [] }));
      const tvResults = (tRes && tRes.results) ? tRes.results : [];
      // Movies to supplement
      const mRes = await fetchTMDB('discover/movie', baseParams).catch(() => ({ results: [] }));
      const movieResults = (mRes && mRes.results) ? mRes.results : [];

      const combined = [
        ...tvResults.map((it:any)=> ({ ...it, _media: 'tv' })),
        ...movieResults.map((it:any)=> ({ ...it, _media: 'movie' })),
      ];
      const seen = new Set<string>();
      const deduped = combined.filter((it:any) => {
        const key = `${it._media}:${it.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      deduped.sort((a:any,b:any) => (b.popularity||0) - (a.popularity||0));
      if (replace) setItems(deduped);
      else setItems(prev => [...prev, ...deduped]);
      setHasMore(deduped.length > 0);
      setPage(p);
    }catch(e){ console.error('Failed to load anime genre page', e); }
    finally{ setLoading(false); }
  }

  // infinite scroll handler similar to MoviesPage
  useEffect(()=>{
    const el = containerRef.current;
    if (!el) return;
    function onScroll(){
      if (loading || !hasMore) return;
      const threshold = 300;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < threshold) {
        loadPage(page+1);
      }
    }
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading, hasMore, page]);

  return (
    <Box>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          <Button variant="ghost" onClick={onBack}>← Back</Button>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>{genreName || 'Genre'}</h2>
        </div>
      </div>

      <div ref={containerRef} style={{height:'70vh', overflow:'auto', overscrollBehavior: 'contain'}}>
        <div className="movie-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom:20}}>
          {items.map(i => (
            <div key={`${i._media}-${i.id}`} className="movie-card" role="button" tabIndex={0} onClick={() => onSelectMovie && onSelectMovie(i.id, i._media === 'tv' ? 'tv' : 'movie')}>
              <div className="movie-overlay">
                <img className="movie-poster" src={i.poster_path ? `https://image.tmdb.org/t/p/w300${i.poster_path}` : undefined} alt={i.title || i.name} />
                <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayMovie) onPlayMovie(i.id, i._media === 'tv' ? 'tv' : 'movie', { tmdbId: i.id }); }}>
                  <div className="play-circle"><div className="play-triangle"/></div>
                </div>
              </div>
              <div className="movie-info">
                <div style={{fontWeight:700}}>{i.title || i.name}</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>{i.release_date || i.first_air_date}</div>
              </div>
            </div>
          ))}
        </div>
        {loading && <div style={{padding:12}}><Spinner /></div>}
        {!hasMore && <div style={{padding:12,color:'var(--muted)'}}>No more results</div>}
      </div>
    </Box>
  );

}
