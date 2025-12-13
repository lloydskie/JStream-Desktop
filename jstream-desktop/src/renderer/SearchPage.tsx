import React, { useEffect, useState, useRef } from 'react';
import { Box, Button, Spinner } from '@chakra-ui/react';
import CustomSelect from './components/CustomSelect';
import { fetchTMDB } from '../utils/tmdbClient';

export default function SearchPage({ movieGenres = [], tvGenres = [], onSelectMovie, onPlayMovie }: { movieGenres?: any[], tvGenres?: any[], onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'movie'|'tv', params?:Record<string,any>)=>void }) {
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<'all'|'movie'|'tv'>('all');
  const [genre, setGenre] = useState<number | ''>('');
  const [year, setYear] = useState<string>('');
  const [sort, setSort] = useState<'popularity.desc'|'release_date.desc'|'release_date.asc'>('popularity.desc');

  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const containerRef = useRef<HTMLDivElement|null>(null);

  useEffect(() => {
    setResults([]); setPage(1); setHasMore(true);
    if (!query || query.trim().length === 0) return;
    // debounce and ignore stale responses using queryId
    const DEBOUNCE_MS = 350;
    const currentQueryId = ++lastQueryIdRef.current;
    const t = setTimeout(() => {
      loadPage(1, true, currentQueryId);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mediaType, genre, year, sort]);

  // lastQueryIdRef tracks the most recent query launched so we can ignore stale responses
  const lastQueryIdRef = React.useRef(0);

  async function loadPage(p:number, replace=false, queryId?: number){
    if (!hasMore && !replace) return;
    setLoading(true);
    try{
      // use search/multi for broad search, fallback to search/movie or search/tv when mediaType specified
      let res:any = null;
      const params: Record<string, any> = { query, page: p, include_adult: false };
      if (year) params['year'] = year;
      if (mediaType === 'movie') {
        if (genre) params['with_genres'] = genre;
        res = await fetchTMDB('search/movie', params);
      } else if (mediaType === 'tv') {
        if (genre) params['with_genres'] = genre;
        res = await fetchTMDB('search/tv', params);
      } else {
        res = await fetchTMDB('search/multi', params);
      }

      // If this response is stale, ignore it
      if (typeof queryId !== 'undefined' && queryId !== lastQueryIdRef.current) {
        return;
      }

      const items = (res.results || []).map((it:any) => {
        // normalize title/date
        return {
          id: it.id,
          media_type: it.media_type || (it.title ? 'movie' : 'tv'),
          title: it.title || it.name,
          poster_path: it.poster_path || it.backdrop_path,
          release_date: it.release_date || it.first_air_date,
        };
      });
      if (!items) return;
      if (replace) setResults(items);
      else setResults(prev => [...prev, ...items]);
      setHasMore((res.page || p) < (res.total_pages || 999));
      setPage(p);
    }catch(e){ console.error('Search failed', e); }
    finally{ setLoading(false); }
  }

  // infinite scroll inside container
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

  const genreOptions = mediaType === 'tv' ? tvGenres : movieGenres;

  return (
    <Box>
      <div className="search-controls">
        <input className="search-input input" placeholder="Search movies, shows..." value={query} onChange={e=>setQuery(e.target.value)} style={{flex:1}} />
        <CustomSelect id="mediaType" value={mediaType} onChange={(v)=> setMediaType(String(v) as any)} options={[{value:'all',label:'All'},{value:'movie',label:'Movies'},{value:'tv',label:'TV Shows'}]} />
        <CustomSelect id="genre" value={genre as any} onChange={(v)=> setGenre(v ? Number(v) : '')} placeholder="All genres" options={[{value:'',label:'All genres'}, ...(genreOptions || []).map((g:any)=> ({ value: g.id, label: g.name }))]} />
        <input className="input" placeholder="Year" value={year} onChange={e=>setYear(e.target.value)} style={{width:80}} />
        <CustomSelect id="sort" value={sort} onChange={(v)=> setSort(String(v) as any)} options={[{value:'popularity.desc',label:'Most popular'},{value:'release_date.desc',label:'Newest'},{value:'release_date.asc',label:'Oldest'}]} />
      </div>

      <div ref={containerRef} style={{height:'70vh', overflow:'auto', overscrollBehavior:'contain'}}>
        <div className="movie-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom:20}}>
          {results.map(r => (
            <div key={`${r.media_type}-${r.id}`} className="movie-card" role="button" tabIndex={0} onClick={() => onSelectMovie && onSelectMovie(r.id, r.media_type === 'tv' ? 'tv' : 'movie')}>
              <div className="movie-overlay">
                <img className="movie-poster" src={r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : undefined} alt={r.title} />
                <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayMovie) onPlayMovie(r.id, r.media_type === 'tv' ? 'tv' : 'movie', { tmdbId: r.id }); }}>
                  <div className="play-circle"><div className="play-triangle"/></div>
                </div>
              </div>
              <div className="movie-info">
                <div style={{fontWeight:700}}>{r.title}</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>{r.release_date}</div>
              </div>
            </div>
          ))}
        </div>
        {loading && <div style={{padding:12}}><Spinner /></div>}
        {!loading && results.length === 0 && <div style={{padding:12,color:'var(--muted)'}}>No results — try a different query or filters.</div>}
        {!hasMore && results.length > 0 && <div style={{padding:12,color:'var(--muted)'}}>End of results</div>}
      </div>
    </Box>
  );
}

