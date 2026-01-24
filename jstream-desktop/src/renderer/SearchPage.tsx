import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { createPortal } from 'react-dom';
import CustomSelect from './components/CustomSelect';
import { fetchTMDB } from '../utils/tmdbClient';

type MediaItem = {
  id: number;
  media_type: 'movie' | 'tv' | 'person' | 'collection';
  title: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  profile_path?: string | null;
  release_date?: string | null;
  overview?: string | null;
  vote_average?: number | null;
  popularity?: number;
};

const FILTER_CHIPS = [
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'Shows' },
  { value: 'person', label: 'People' },
];

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'release_date.desc', label: 'Newest' },
  { value: 'release_date.asc', label: 'Oldest' },
];

export default function SearchPage({ 
  movieGenres = [], 
  tvGenres = [], 
  onSelectMovie, 
  onPlayMovie, 
  onSelectPerson, 
  onSelectCollection, 
  externalQuery, 
  onQueryEmpty 
}: { 
  movieGenres?: any[], 
  tvGenres?: any[], 
  onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, 
  onPlayMovie?: (id:number|string, type?:'movie'|'tv', params?:Record<string,any>)=>void, 
  onSelectPerson?: (id:number)=>void, 
  onSelectCollection?: (id:number)=>void, 
  externalQuery?: string, 
  onQueryEmpty?: ()=>void 
}) {
  const [query, setQuery] = useState('');
  const [mediaType, setMediaType] = useState<'all'|'movie'|'tv'|'person'>('movie');
  const [genre, setGenre] = useState<number | ''>('');
  const [year, setYear] = useState<string>('');
  const [sort, setSort] = useState<'popularity.desc'|'release_date.desc'|'release_date.asc'>('popularity.desc');

  const [results, setResults] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

  // Preview modal state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverItem, setHoverItem] = useState<MediaItem | null>(null);
  const [hoverTrailerKey, setHoverTrailerKey] = useState<string | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const hoverTokenRef = useRef(0);
  const previewTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewAnimating, setPreviewAnimating] = useState(false);
  
  // Logo cache
  const LOGO_CACHE_KEY = 'jstream:search_logo_cache_v1';
  const logoCacheRef = useRef<Map<string, string>>(new Map());
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load logo cache on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LOGO_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const k of Object.keys(parsed || {})) {
          logoCacheRef.current.set(k, parsed[k]);
        }
      }
    } catch (e) {}
  }, []);

  function persistLogoCache() {
    try {
      const obj: Record<string, string> = {};
      for (const [k, v] of Array.from(logoCacheRef.current.entries())) obj[k] = v;
      sessionStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  // Sorted results with client-side sorting
  const sortedResults = useMemo(() => {
    if (sort === 'popularity.desc') {
      return [...results].sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    } else if (sort === 'release_date.desc') {
      return [...results].sort((a, b) => 
        new Date(b.release_date || '1900-01-01').getTime() - new Date(a.release_date || '1900-01-01').getTime()
      );
    } else if (sort === 'release_date.asc') {
      return [...results].sort((a, b) => 
        new Date(a.release_date || '1900-01-01').getTime() - new Date(b.release_date || '1900-01-01').getTime()
      );
    }
    return results;
  }, [results, sort]);

  // Enrich results with logos
  const enrichedResults = useMemo(() => {
    return sortedResults.map(item => ({
      ...item,
      logoPath: logoMap[`${item.media_type}:${item.id}`] || null
    }));
  }, [sortedResults, logoMap]);

  useEffect(() => {
    if (typeof externalQuery !== 'undefined') {
      if ((externalQuery || '') !== query) {
        setQuery(externalQuery || '');
      }
    }
  }, [externalQuery]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      setResults([]); 
      setPage(1); 
      setHasMore(true);
      if (!query || query.trim().length < 1) return;

      loadPage(1, true);
      searchTimeoutRef.current = null;
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
    };
  }, [query, mediaType, genre, year]);

  // Notify parent when internal query becomes empty
  const _didMount = useRef(false);
  useEffect(() => {
    if (!_didMount.current) {
      _didMount.current = true;
      return;
    }
    if ((query || '').trim() === '') {
      try { onQueryEmpty && onQueryEmpty(); } catch(e) {}
    }
  }, [query]);

  // Load search history from localStorage on mount
  useEffect(() => {
    const history = localStorage.getItem('searchHistory');
    if (history) {
      try {
        setSearchHistory(JSON.parse(history));
      } catch (e) {}
    }
  }, []);

  const addToSearchHistory = (searchQuery: string) => {
    if (!searchQuery.trim()) return;
    setTimeout(() => {
      setSearchHistory(prev => {
        const filtered = prev.filter(item => item !== searchQuery);
        const newHistory = [searchQuery, ...filtered].slice(0, 8);
        try {
          localStorage.setItem('searchHistory', JSON.stringify(newHistory));
        } catch (e) {}
        return newHistory;
      });
    }, 0);
  };

  const handleHistoryClick = (historyQuery: string) => {
    setQuery(historyQuery);
  };

  async function loadPage(p: number, replace = false) {
    if (!hasMore && !replace) return;
    if (replace) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      let res: any = null;
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
      } else {
        res = await fetchTMDB('search/multi', params);
      }

      if (!res || !res.results) {
        setResults([]);
        setHasMore(false);
        return;
      }

      const items: MediaItem[] = (res.results || []).map((it: any) => {
        // Explicitly set media_type based on the search endpoint used
        let itemMediaType: 'movie' | 'tv' | 'person' | 'collection';
        if (mediaType === 'movie') {
          itemMediaType = 'movie';
        } else if (mediaType === 'tv') {
          itemMediaType = 'tv';
        } else if (mediaType === 'person') {
          itemMediaType = 'person';
        } else {
          // For 'all' (multi search), use the returned media_type or detect
          itemMediaType = it.media_type || (it.title ? 'movie' : it.profile_path ? 'person' : 'tv');
        }
        
        return {
          id: it.id,
          media_type: itemMediaType,
          title: it.title || it.name,
          poster_path: it.poster_path || null,
          backdrop_path: it.backdrop_path || null,
          profile_path: it.profile_path || null,
          release_date: it.release_date || it.first_air_date || null,
          overview: it.overview || null,
          vote_average: it.vote_average || null,
          popularity: it.popularity || 0,
        };
      });

      setTotalPages(res.total_pages || 1);
      
      if (replace) {
        setResults(items);
        addToSearchHistory(query);
      } else {
        setResults(prev => [...prev, ...items]);
      }
      setHasMore((res.page || p) < (res.total_pages || 1));
      setPage(p);
    } catch (e) {
      console.error('Search failed:', e);
      setResults([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  // Load more function for infinite scroll
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    loadPage(page + 1);
  }, [loadingMore, hasMore, loading, page, query, mediaType, genre, year]);

  // Intersection observer for infinite scroll
  useEffect(() => {
    if (!query.trim()) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' }
    );
    
    const trigger = loadMoreTriggerRef.current;
    if (trigger) {
      observer.observe(trigger);
    }
    
    return () => {
      if (trigger) {
        observer.unobserve(trigger);
      }
    };
  }, [query, hasMore, loadingMore, loading, loadMore]);

  // Fetch logos in parallel batches
  useEffect(() => {
    if (sortedResults.length === 0) return;
    
    let mounted = true;
    const BATCH_SIZE = 5;
    
    async function fetchLogos() {
      const itemsNeedingLogos = sortedResults.filter(item => {
        if (item.media_type === 'person') return false; // People don't have logos
        const cacheKey = `${item.media_type}:${item.id}`;
        return !logoCacheRef.current.has(cacheKey);
      });
      
      for (let i = 0; i < itemsNeedingLogos.length; i += BATCH_SIZE) {
        if (!mounted) break;
        
        const batch = itemsNeedingLogos.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (item) => {
          const cacheKey = `${item.media_type}:${item.id}`;
          try {
            const images = await fetchTMDB(`${item.media_type}/${item.id}/images`);
            const logos = (images && (images as any).logos) || [];
            if (Array.isArray(logos) && logos.length > 0) {
              const eng = logos.find((l: any) => l.iso_639_1 === 'en') || logos[0];
              if (eng && eng.file_path) {
                logoCacheRef.current.set(cacheKey, eng.file_path);
                return { key: cacheKey, path: eng.file_path };
              }
            }
          } catch (e) {}
          return null;
        });
        
        const results = await Promise.all(promises);
        if (!mounted) break;
        
        const newLogos: Record<string, string> = {};
        results.forEach(r => {
          if (r) newLogos[r.key] = r.path;
        });
        
        if (Object.keys(newLogos).length > 0) {
          setLogoMap(prev => ({ ...prev, ...newLogos }));
          persistLogoCache();
        }
      }
    }
    
    // Load cached logos first
    const cachedLogos: Record<string, string> = {};
    sortedResults.forEach(item => {
      const cacheKey = `${item.media_type}:${item.id}`;
      if (logoCacheRef.current.has(cacheKey)) {
        cachedLogos[cacheKey] = logoCacheRef.current.get(cacheKey)!;
      }
    });
    if (Object.keys(cachedLogos).length > 0) {
      setLogoMap(prev => ({ ...prev, ...cachedLogos }));
    }
    
    fetchLogos();
    
    return () => { mounted = false; };
  }, [sortedResults]);

  // Preview modal handlers
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
  
  function scheduleOpen(evt: React.MouseEvent, item: MediaItem, idx: number) {
    // Don't show preview for people
    if (item.media_type === 'person') return;
    
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (showPreviewModal && hoverIndex === idx) return;
    if (previewTimeoutRef.current) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    previewTimeoutRef.current = window.setTimeout(() => {
      openPreview(item, idx);
    }, 200);
  }
  
  function cancelOpen() {
    if (previewTimeoutRef.current) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }
  
  function scheduleClose() {
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      closePreview();
    }, 300);
  }
  
  async function openPreview(item: MediaItem, idx: number) {
    hoverTokenRef.current++;
    const token = hoverTokenRef.current;
    setHoverIndex(idx);
    setHoverItem(item);
    setHoverLoading(true);
    setHoverTrailerKey(null);
    
    setShowPreviewModal(true);
    setPreviewAnimating(true);
    setTimeout(() => setPreviewAnimating(false), 300);
    
    pauseHero();
    
    try {
      const videos = await fetchTMDB(`${item.media_type}/${item.id}/videos`);
      if (token !== hoverTokenRef.current) return;
      const trailers = (videos?.results || []).filter((v: any) => v.type === 'Trailer' && v.site === 'YouTube');
      if (trailers.length > 0 && token === hoverTokenRef.current) {
        setHoverTrailerKey(trailers[0].key);
      }
    } catch (e) {}
    if (token === hoverTokenRef.current) setHoverLoading(false);
  }
  
  function closePreview() {
    hoverTokenRef.current++;
    setHoverIndex(null);
    setHoverTrailerKey(null);
    setShowPreviewModal(false);
    setHoverItem(null);
    if (previewTimeoutRef.current) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    resumeHero();
  }
  
  useEffect(() => {
    function onCloseAll() {
      closePreview();
    }
    window.addEventListener('app:close-previews', onCloseAll as EventListener);
    return () => {
      window.removeEventListener('app:close-previews', onCloseAll as EventListener);
      if (previewTimeoutRef.current) {
        window.clearTimeout(previewTimeoutRef.current);
        previewTimeoutRef.current = null;
      }
      if (closeTimeoutRef.current) {
        window.clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  const genreOptions = (mediaType === 'tv' || mediaType === 'movie') 
    ? (mediaType === 'tv' ? tvGenres : movieGenres) 
    : [];

  return (
    <Box className="search-page">
      {/* Search Results Header */}
      <div className="search-header" style={{ padding: '16px', paddingTop: '200px' }}>
        {query.trim() ? (
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: 'white',
            marginBottom: '16px'
          }}>
            Search results for "{query}"
          </h1>
        ) : (
          <h1 style={{ 
            fontSize: '24px', 
            fontWeight: 700, 
            color: 'white',
            marginBottom: '16px'
          }}>
            Search
          </h1>
        )}
        
        {/* Filter Chips */}
        <div style={{ 
          display: 'flex', 
          gap: '8px', 
          flexWrap: 'wrap',
          marginBottom: '16px'
        }}>
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => setMediaType(chip.value as any)}
              style={{
                padding: '8px 16px',
                borderRadius: '20px',
                border: 'none',
                background: mediaType === chip.value ? 'var(--primary, #e50914)' : 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Additional Filters Row */}
        <div style={{ 
          display: 'flex', 
          gap: '12px', 
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {(mediaType === 'movie' || mediaType === 'tv') && genreOptions.length > 0 && (
            <CustomSelect 
              id="genre" 
              value={genre as any} 
              onChange={(v) => setGenre(v ? Number(v) : '')} 
              placeholder="All genres" 
              options={[
                { value: '', label: 'All genres' }, 
                ...(genreOptions || []).map((g: any) => ({ value: g.id, label: g.name }))
              ]} 
            />
          )}
          <input 
            className="input" 
            placeholder="Year" 
            value={year} 
            onChange={e => setYear(e.target.value)} 
            style={{ width: 80, padding: '8px 12px', borderRadius: '6px' }} 
          />
          <CustomSelect 
            id="sort" 
            value={sort} 
            onChange={(v) => setSort(String(v) as any)} 
            options={SORT_OPTIONS} 
          />
        </div>
      </div>

      {/* Search History */}
      {searchHistory.length > 0 && !query && (
        <div style={{
          padding: '0 16px 16px',
          borderBottom: '1px solid var(--border)',
          marginBottom: '16px'
        }}>
          <div style={{
            fontSize: '14px',
            color: 'var(--muted)',
            marginBottom: '8px',
            fontWeight: 500
          }}>
            Recent Searches
          </div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            {searchHistory.map((historyItem, index) => (
              <button
                key={index}
                onClick={() => handleHistoryClick(historyItem)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: '20px',
                  padding: '6px 12px',
                  fontSize: '13px',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--primary, #e50914)';
                  e.currentTarget.style.borderColor = 'var(--primary, #e50914)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                }}
              >
                {historyItem}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Results Grid */}
      <div ref={containerRef} style={{ padding: '0 16px' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
            <Spinner size="lg" />
          </div>
        )}
        
        {!loading && !query.trim() && (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center', 
            color: 'var(--muted)' 
          }}>
            Start typing to search for movies, shows, and people
          </div>
        )}

        {!loading && query.trim() && enrichedResults.length === 0 && (
          <div style={{ 
            padding: '48px', 
            textAlign: 'center', 
            color: 'var(--muted)' 
          }}>
            No results found. Try a different search.
          </div>
        )}

        {!loading && enrichedResults.length > 0 && (
          <div 
            className="search-results-grid" 
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
              gap: '16px'
            }}
          >
            {enrichedResults.map((item, idx) => {
              const isPerson = item.media_type === 'person';
              const backdropUrl = isPerson 
                ? (item.profile_path ? `https://image.tmdb.org/t/p/w500${item.profile_path}` : undefined)
                : (item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : undefined);
              const logoUrl = (item as any).logoPath ? `https://image.tmdb.org/t/p/w300${(item as any).logoPath}` : undefined;
              
              return (
                <div 
                  key={`${item.media_type}-${item.id}`} 
                  className="backdrop-card"
                  style={{ 
                    position: 'relative', 
                    cursor: 'pointer', 
                    borderRadius: '8px', 
                    overflow: 'hidden', 
                    aspectRatio: isPerson ? '2/3' : '16/9'
                  }}
                  onMouseEnter={(e) => { scheduleOpen(e, item, idx); }}
                  onMouseLeave={() => { scheduleClose(); }}
                  onClick={() => {
                    cancelOpen();
                    closePreview();
                    if (isPerson && onSelectPerson) {
                      onSelectPerson(item.id);
                    } else if (item.media_type === 'collection' && onSelectCollection) {
                      onSelectCollection(item.id);
                    } else if (onSelectMovie) {
                      onSelectMovie(item.id, item.media_type === 'tv' ? 'tv' : 'movie');
                    }
                  }}
                >
                  <div style={{ 
                    position: 'absolute', 
                    inset: 0, 
                    background: backdropUrl ? `url(${backdropUrl})` : 'var(--card-bg)', 
                    backgroundSize: 'cover', 
                    backgroundPosition: 'center',
                    filter: isPerson ? 'none' : 'brightness(0.7)'
                  }} />
                  
                  {!isPerson && (
                    <div style={{ 
                      position: 'absolute', 
                      inset: 0, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.5) 100%)'
                    }}>
                      {logoUrl ? (
                        <img 
                          src={logoUrl} 
                          alt={item.title} 
                          style={{ 
                            maxWidth: '70%', 
                            maxHeight: '60%', 
                            objectFit: 'contain',
                            filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.8))'
                          }} 
                        />
                      ) : (
                        <div style={{ 
                          fontSize: '18px', 
                          fontWeight: 700, 
                          textAlign: 'center', 
                          padding: '16px',
                          color: 'white',
                          textShadow: '0 2px 8px rgba(0,0,0,0.8)'
                        }}>
                          {item.title}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {isPerson && (
                    <div style={{ 
                      position: 'absolute', 
                      bottom: 0, 
                      left: 0, 
                      right: 0,
                      padding: '12px',
                      background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)'
                    }}>
                      <div style={{ 
                        fontSize: '16px', 
                        fontWeight: 600, 
                        color: 'white',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8)'
                      }}>
                        {item.title}
                      </div>
                    </div>
                  )}
                  
                  {/* Media type badge */}
                  <div style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    background: 'rgba(0,0,0,0.7)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'white',
                    textTransform: 'uppercase'
                  }}>
                    {item.media_type === 'tv' ? 'TV' : item.media_type === 'person' ? 'Person' : 'Movie'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        {/* Infinite scroll trigger */}
        {query.trim() && (
          <div 
            ref={loadMoreTriggerRef} 
            style={{ 
              width: '100%', 
              padding: '24px', 
              display: 'flex', 
              justifyContent: 'center',
              minHeight: '60px'
            }}
          >
            {loadingMore && <Spinner size="md" />}
            {!loadingMore && hasMore && results.length > 0 && (
              <div style={{ color: 'var(--muted)', fontSize: '14px' }}>Scroll for more...</div>
            )}
            {!loadingMore && !hasMore && results.length > 0 && (
              <div style={{ color: 'var(--muted)', fontSize: '14px' }}>End of results</div>
            )}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {(showPreviewModal && hoverItem && hoverItem.media_type !== 'person') && createPortal(
        <div 
          className="preview-modal-overlay" 
          style={{ 
            position: 'fixed', 
            inset: 0, 
            zIndex: 99999, 
            pointerEvents: 'none' 
          }}
          onClick={(e) => { e.stopPropagation(); closePreview(); }}
        >
          <div 
            className={`preview-modal ${previewAnimating ? 'animating' : ''}`}
            style={{
              position: 'fixed',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '420px',
              maxWidth: '90vw',
              background: 'var(--card-bg, #1a1a1a)',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              pointerEvents: 'auto',
              zIndex: 100000
            }}
            onMouseEnter={() => { 
              if (closeTimeoutRef.current) {
                window.clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => { scheduleClose(); }}
          >
            <div style={{ position: 'relative', aspectRatio: '16/9', background: 'black' }}>
              {hoverTrailerKey ? (
                <iframe
                  src={`https://www.youtube.com/embed/${hoverTrailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${hoverTrailerKey}`}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                  allow="autoplay; encrypted-media"
                />
              ) : hoverItem.backdrop_path ? (
                <img 
                  src={`https://image.tmdb.org/t/p/w780${hoverItem.backdrop_path}`} 
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  alt=""
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {hoverLoading && <Spinner />}
                </div>
              )}
            </div>
            
            <div style={{ padding: '16px' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                {hoverItem.title}
              </div>
              {hoverItem.vote_average && (
                <div style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '8px' }}>
                  ⭐ {hoverItem.vote_average.toFixed(1)}
                  {hoverItem.release_date && (
                    <span style={{ marginLeft: '12px' }}>
                      {new Date(hoverItem.release_date).getFullYear()}
                    </span>
                  )}
                </div>
              )}
              {hoverItem.overview && (
                <div style={{ fontSize: '13px', color: 'var(--muted)', lineHeight: 1.4, maxHeight: '60px', overflow: 'hidden' }}>
                  {hoverItem.overview}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button 
                  style={{ 
                    flex: 1, 
                    padding: '8px', 
                    background: 'var(--primary, #e50914)', 
                    border: 'none', 
                    borderRadius: '6px', 
                    color: 'white', 
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    closePreview();
                    if (onPlayMovie) onPlayMovie(hoverItem.id, hoverItem.media_type === 'tv' ? 'tv' : 'movie', { tmdbId: hoverItem.id });
                  }}
                >
                  ▶ Play
                </button>
                <button 
                  style={{ 
                    flex: 1, 
                    padding: '8px', 
                    background: 'rgba(255,255,255,0.1)', 
                    border: '1px solid rgba(255,255,255,0.2)', 
                    borderRadius: '6px', 
                    color: 'white', 
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    closePreview();
                    if (onSelectMovie) onSelectMovie(hoverItem.id, hoverItem.media_type === 'tv' ? 'tv' : 'movie');
                  }}
                >
                  More Info
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Box>
  );
}

