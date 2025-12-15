import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Box, Button, Spinner } from '@chakra-ui/react';
import CustomSelect from './components/CustomSelect';
import { fetchTMDB } from '../utils/tmdbClient';

export default function SearchPage({ movieGenres = [], tvGenres = [], onSelectMovie, onPlayMovie, onSelectPerson, onSelectCollection, externalQuery, onQueryEmpty }: { movieGenres?: any[], tvGenres?: any[], onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'movie'|'tv', params?:Record<string,any>)=>void, onSelectPerson?: (id:number)=>void, onSelectCollection?: (id:number)=>void, externalQuery?: string, onQueryEmpty?: ()=>void }) {
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<'all'|'movie'|'tv'|'person'|'collection'>('all');
  const [genre, setGenre] = useState<number | ''>('');
  const [year, setYear] = useState<string>('');
  const [sort, setSort] = useState<'popularity.desc'|'release_date.desc'|'release_date.asc'>('popularity.desc');

  const [results, setResults] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement|null>(null);

  const groupedResults = useMemo(() => {
    return results.reduce((acc, r) => {
      const type = r.media_type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(r);
      return acc;
    }, {} as Record<string, typeof results>);
  }, [results]);

  const typeOrder = ['movie', 'tv', 'person', 'collection'];

  const typeLabels: Record<string, string> = {
    movie: 'Movies',
    tv: 'TV Shows',
    person: 'People',
    collection: 'Collections'
  };

  const searchTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If an external query is provided (from header input), reflect it in this page
    if (typeof externalQuery !== 'undefined') {
      // Only update when different to avoid resetting caret unexpectedly
      if ((externalQuery || '') !== query) {
        setQuery(externalQuery || '');
      }
    }

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Set new timeout for search
    searchTimeoutRef.current = setTimeout(() => {
      setResults([]); setPage(1); setHasMore(true);
      if (!query || query.trim().length < 1) return;

      loadPage(1, true);
      searchTimeoutRef.current = null;
    }, 300); // Faster response - 300ms

    // Cleanup function
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [query, mediaType, genre, year, sort]);

  // Notify parent when internal query becomes empty (but avoid firing on initial mount)
  const _didMount = useRef(false);
  useEffect(() => {
    if (!_didMount.current) {
      _didMount.current = true;
      return;
    }
    if ((query || '').trim() === '') {
      try { onQueryEmpty && onQueryEmpty(); } catch(e) { /* ignore */ }
    }
  }, [query]);

  // Load search history from localStorage on mount
  useEffect(() => {
    const history = localStorage.getItem('searchHistory');
    if (history) {
      try {
        setSearchHistory(JSON.parse(history));
      } catch (e) {
        console.warn('Failed to parse search history', e);
      }
    }
  }, []);

  // Save search to history
  const addToSearchHistory = (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    // Use setTimeout to avoid blocking the main thread
    setTimeout(() => {
      setSearchHistory(prev => {
        const filtered = prev.filter(item => item !== searchQuery);
        const newHistory = [searchQuery, ...filtered].slice(0, 8);
        try {
          localStorage.setItem('searchHistory', JSON.stringify(newHistory));
        } catch (e) {
          console.warn('Failed to save search history:', e);
        }
        return newHistory;
      });
    }, 0);
  };

  // Handle history item click
  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery);
  };

  async function loadPage(p:number, replace=false){
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
      } else if (mediaType === 'person') {
        res = await fetchTMDB('search/person', params);
      } else if (mediaType === 'collection') {
        res = await fetchTMDB('search/collection', params);
      } else {
        res = await fetchTMDB('search/multi', params);
      }

      if (!res || !res.results) {
        console.warn('Invalid API response:', res);
        setResults([]);
        setHasMore(false);
        return;
      }

      const items = (res.results || []).map((it:any) => {
        // normalize title/date
        return {
          id: it.id,
          media_type: it.media_type || (it.title ? 'movie' : it.name ? (it.profile_path ? 'person' : 'collection') : 'tv'),
          title: it.title || it.name,
          poster_path: it.poster_path || it.profile_path || it.backdrop_path,
          release_date: it.release_date || it.first_air_date,
          popularity: it.popularity,
        };
      });

      // Sort items based on sort option
      if (sort === 'popularity.desc') {
        items.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      } else if (sort === 'release_date.desc') {
        items.sort((a, b) => new Date(b.release_date || '1900-01-01').getTime() - new Date(a.release_date || '1900-01-01').getTime());
      } else if (sort === 'release_date.asc') {
        items.sort((a, b) => new Date(a.release_date || '1900-01-01').getTime() - new Date(b.release_date || '1900-01-01').getTime());
      }

      if (replace) {
        setResults(items);
        addToSearchHistory(query); // Add to history only on first page load
      } else {
        setResults(prev => [...prev, ...items]);
      }
      setHasMore((res.page || p) < (res.total_pages || 999));
      setPage(p);
    }catch(e){
      console.error('Search failed:', e);
      setResults([]);
      setHasMore(false);
    }
    finally{
      setLoading(false);
    }
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

  const genreOptions = (mediaType === 'tv' || mediaType === 'movie') ? (mediaType === 'tv' ? tvGenres : movieGenres) : (mediaType === 'all' ? [...movieGenres, ...tvGenres.filter(tg => !movieGenres.find(mg => mg.id === tg.id))] : []);

  return (
    <Box>
      <div className="search-controls">
        <input
          className="search-input input"
          placeholder="Search movies, shows..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Force search on Enter key
              setResults([]);
              setPage(1);
              setHasMore(true);
              loadPage(1, true);
            }
          }}
          style={{flex:1}}
        />
        <CustomSelect id="mediaType" value={mediaType} onChange={(v)=> setMediaType(String(v) as any)} options={[{value:'all',label:'All'},{value:'movie',label:'Movies'},{value:'tv',label:'TV Shows'},{value:'person',label:'People'},{value:'collection',label:'Collections'}]} />
        <CustomSelect id="genre" value={genre as any} onChange={(v)=> setGenre(v ? Number(v) : '')} placeholder="All genres" options={[{value:'',label:'All genres'}, ...(genreOptions || []).map((g:any)=> ({ value: g.id, label: g.name }))]} disabled={mediaType === 'all' || mediaType === 'person' || mediaType === 'collection'} />
        <input className="input" placeholder="Year" value={year} onChange={e=>setYear(e.target.value)} style={{width:80}} />
        <CustomSelect id="sort" value={sort} onChange={(v)=> setSort(String(v) as any)} options={[{value:'popularity.desc',label:'Most popular'},{value:'release_date.desc',label:'Newest'},{value:'release_date.asc',label:'Oldest'}]} />
      </div>

      {/* Search History */}
      {searchHistory.length > 0 && !query && (
        <div style={{
          padding: '1rem',
          borderBottom: '1px solid var(--border)',
          marginBottom: '1rem'
        }}>
          <div style={{
            fontSize: '0.9rem',
            color: 'var(--muted)',
            marginBottom: '0.5rem',
            fontWeight: 500
          }}>
            Recent Searches
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}>
            {searchHistory.map((historyItem, index) => (
              <button
                key={index}
                onClick={() => handleHistoryClick(historyItem)}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '20px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.85rem',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--accent)';
                  e.currentTarget.style.borderColor = 'var(--accent)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'var(--bg-secondary)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                {historyItem}
              </button>
            ))}
          </div>
        </div>
      )}

      <div ref={containerRef} style={{
        height: 'calc(100vh - 200px)', // Responsive height based on viewport
        overflow: 'auto',
        overscrollBehavior: 'contain',
        padding: '0 10px'
      }}>
        {typeOrder.filter(type => groupedResults[type]).map(type => (
          <div key={type} style={{
            marginBottom: '2rem',
            padding: '1rem 0'
          }}>
            <h2 style={{
              margin: '0 0 1rem 0',
              fontSize: 'clamp(1.2rem, 4vw, 1.5rem)', // Responsive font size
              fontWeight: 600,
              color: 'var(--text)',
              borderBottom: '2px solid var(--border)',
              paddingBottom: '0.5rem'
            }}>{typeLabels[type]}</h2>
            <div className="movie-grid" style={{
              gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(140px, 20vw, 180px), 1fr))', // Responsive grid
              gap: '1rem',
              paddingBottom: '1rem'
            }}>
              {groupedResults[type].map(r => (
                <div key={`${r.media_type}-${r.id}`} className="movie-card" role="button" tabIndex={0} onClick={() => {
                  if (r.media_type === 'person' && onSelectPerson) onSelectPerson(r.id);
                  else if (r.media_type === 'collection' && onSelectCollection) onSelectCollection(r.id);
                  else if (onSelectMovie) onSelectMovie(r.id, r.media_type === 'tv' ? 'tv' : 'movie');
                }}>
                  <div className="movie-overlay">
                    <img className="movie-poster" src={r.poster_path ? `https://image.tmdb.org/t/p/w300${r.poster_path}` : undefined} alt={r.title} />
                    {(r.media_type === 'movie' || r.media_type === 'tv') && (
                      <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayMovie) onPlayMovie(r.id, r.media_type === 'tv' ? 'tv' : 'movie', { tmdbId: r.id }); }}>
                        <div className="play-circle"><div className="play-triangle"/></div>
                      </div>
                    )}
                  </div>
                  <div className="movie-info">
                    <div style={{fontWeight:700}}>{r.title}</div>
                    <div style={{fontSize:12,color:'var(--muted)'}}>{r.release_date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {loading && <div style={{padding:12}}><Spinner /></div>}
        {!loading && results.length === 0 && <div style={{padding:12,color:'var(--muted)'}}>No results — try a different query or filters.</div>}
        {!hasMore && results.length > 0 && <div style={{padding:12,color:'var(--muted)'}}>End of results</div>}
      </div>
    </Box>
  );
}

