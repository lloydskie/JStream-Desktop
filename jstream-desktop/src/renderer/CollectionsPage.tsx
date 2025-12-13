import React, { useEffect, useState } from 'react';
import { Box, Button, Spinner, Input } from '@chakra-ui/react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { fetchTMDB } from '../utils/tmdbClient';

// Single clean implementation — no duplicated/trailing content
export default function CollectionsPage({ onSelectMovie, onPlayMovie }: { onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'movie'|'tv', params?:Record<string,any>)=>void }){
  const [query, setQuery] = useState('');
  const [filteredFeed, setFilteredFeed] = useState<any[]>([]);

  const [feedCollections, setFeedCollections] = useState<any[]>([]);
  const [feedStats, setFeedStats] = useState({ total: 0, filled: 0, placeholders: 0, failed: 0 });
  const defaultPoster = '/assets/default_collection_poster.png';
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const [selectedCollection, setSelectedCollection] = useState<number | null>(null);
  const [collectionDetails, setCollectionDetails] = useState<any | null>(null);
  const detailCache = React.useRef<Map<number, any>>(new Map());

  // Fetch feed from main process (downloads & decompresses TMDB export server-side)
  // Reset feed and cache on mount or refresh
  useEffect(() => {
    setFeedCollections([]);
    setFeedPage(1);
    setFeedHasMore(true);
    setFeedError(null);
    detailCache.current = new Map();
    loadFeedPage(1);
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setFilteredFeed(feedCollections);
    } else {
      const filtered = feedCollections.filter((c: any) => c.name.toLowerCase().includes(query.toLowerCase()));
      setFilteredFeed(filtered);
    }
  }, [feedCollections, query]);

  useEffect(() => {
    if (!selectedCollection) return;
    let mounted = true;
    (async () => {
      try {
        setCollectionDetails(null);
        const res = await fetchTMDB(`collection/${selectedCollection}`);
        if (!mounted) return;
        setCollectionDetails(res);
      } catch (e) {
        console.error('Failed to load collection', e);
      }
    })();
    return () => { mounted = false; };
  }, [selectedCollection]);

  async function loadFeedPage(p: number) {
    if (p === 1) setLoadingFeed(true);
    setFeedLoadingMore(true);
    try {
      const res = await (window as any).tmdbExports.fetchCollectionsFeed({ tryDays: 10, page: p, perPage: 24 });
      const { ids = [], hasMore = false, error } = res || {};
      if (error) {
        setFeedError(error);
        setFeedCollections([]);
        setFeedHasMore(false);
        return;
      }
      // Debug logging: show how many ids main returned and a sample
      try { console.log('Collections feed page', p, 'ids count', ids.length, 'sample', ids.slice(0, 6)); } catch (e) {}
      // Renderer will fetch details for returned ids with controlled concurrency.
      async function fetchDetailsForIds(idsArr: number[], append: boolean) {
        if (!Array.isArray(idsArr) || idsArr.length === 0) return;
        const normalizedIds = idsArr.map(id => Number(id));
        const toFetch = normalizedIds.filter(id => !detailCache.current.has(id));
        console.log('fetchDetailsForIds: toFetch ids', toFetch);
        // Insert placeholders in order to ensure the displayed feed keeps stable ordering
        setFeedCollections(prev => {
          const existingIds = new Set(prev.map(p => Number(p.id)));
          const placeholders = idsArr.map(id => Number(id)).filter(id => !existingIds.has(id)).map(id => ({ id, name: '', poster_path: null, backdrop_path: null, _placeholder: true }));
          console.log('Inserting placeholders for ids', placeholders.map(p => p.id));
          return append ? [...prev, ...placeholders] : [...placeholders];
        });
        // Immediately recompose results from cache to fill any entries that are already cached,
        // this helps if detailCache was pre-populated or previous pages overlap.
        const cachedResults = normalizedIds.map(id => {
          const d = detailCache.current.get(Number(id));
          if (d) return { id, name: d.name || `Collection ${id}`, poster_path: d.poster_path, backdrop_path: d.backdrop_path, _placeholder: false };
          return { id, name: '', poster_path: null, backdrop_path: null, _placeholder: true };
        });
        setFeedCollections(prev => {
          const existingIds = new Set(prev.map(p => Number(p.id)));
          // replace placeholders for IDs that exist
          const newPrev = prev.map(item => {
            if (existingIds.has(Number(item.id)) && normalizedIds.includes(Number(item.id))) {
              const r = cachedResults.find(rr => rr.id === Number(item.id));
              return r ? r : item;
            }
            return item;
          });
          // Append any missing cached results
          const missing = cachedResults.filter(r => !newPrev.some(n => Number(n.id) === r.id));
          return append ? [...newPrev, ...missing] : [...missing];
        });
        const concurrency = 4;
        let idx = 0;
        // minimal retry helper
        async function fetchWithRetries(id: number, attempts = 3) {
          let lastErr: any = null;
          let delay = 500;
          for (let i = 0; i < attempts; i++) {
            try {
              const detail = await (window as any).tmdb.request(`collection/${id}`);
              if (!detail || detail.error) throw detail || new Error('Invalid response');
              return detail;
            } catch (err) {
              lastErr = err;
              await new Promise(r => setTimeout(r, delay));
              delay *= 2;
            }
          }
          throw lastErr;
        }
        const workers = Array.from({ length: concurrency }).map(async () => {
          while (idx < toFetch.length) {
            const i = idx++;
            const id = toFetch[i];
            try {
              const detail = await fetchWithRetries(Number(id), 3);
              console.log('Fetching collection detail for id', id, '->', detail && detail.error ? 'ERROR' : 'OK');
              // Defensive: ensure poster_path and name are present
              const value = (detail && !detail.error)
                ? {
                    id: detail.id || id,
                    name: detail.name || `Collection ${id}`,
                    poster_path: detail.poster_path || (detail.backdrop_path ? detail.backdrop_path : null),
                    backdrop_path: detail.backdrop_path || null
                  }
                : { id, name: `Collection ${id}`, poster_path: null, backdrop_path: null };
              detailCache.current.set(Number(id), value);
              // update stats for a single loaded item
              setFeedStats(s => ({ ...s, filled: (s.filled || 0) + 1 }));
              console.log('detail for', id, 'cached');
              // Replace placeholder with the full detail while preserving order
              setFeedCollections(prev => {
                const found = prev.some(item => Number(item.id) === Number(id));
                if (!found) {
                  console.warn('No placeholder found for id', id, 'current feed ids', prev.map(i => i.id));
                }
                return prev.map(item => (Number(item.id) === Number(id) ? { ...item, name: value.name || `Collection ${id}`, poster_path: value.poster_path, backdrop_path: value.backdrop_path, _placeholder: false } : item));
              });
            } catch (e) {
              console.warn('Failed to fetch collection detail for id', id, e);
              // increment failed count
              setFeedStats(s => ({ ...s, failed: (s.failed || 0) + 1 }));
              detailCache.current.set(Number(id), { id, name: `Collection ${id}`, poster_path: null, backdrop_path: null });
            }
          }
        });
        await Promise.all(workers);
        // Recompose final ordered results and update feed in-place
        const finalResults = normalizedIds.map(id => {
          const d = detailCache.current.get(Number(id));
          if (d) return { id: Number(id), name: d.name || `Collection ${id}`, poster_path: d.poster_path, backdrop_path: d.backdrop_path, _placeholder: false };
          return { id: Number(id), name: '', poster_path: null, backdrop_path: null, _placeholder: true };
        });
        setFeedCollections(prev => {
          const otherPrev = prev.filter(item => !normalizedIds.includes(Number(item.id)));
          return append ? [...otherPrev, ...finalResults] : [...finalResults];
        });
        console.log('finalResults for ids', normalizedIds, '->', finalResults.map(r => ({ id: r.id, name: r.name, poster: r.poster_path }))); 
        // Update stats
        const total = finalResults.length;
        const filled = finalResults.filter(r => !r._placeholder).length;
        const placeholders = finalResults.length - filled;
        setFeedStats(s => ({ ...s, total: total, filled: filled, placeholders }));
      }

      if (p === 1) {
        setFeedCollections([]);
        await fetchDetailsForIds(ids, false);
        setFeedHasMore(hasMore);
      } else {
        await fetchDetailsForIds(ids, true);
        setFeedHasMore(hasMore);
      }
      setFeedPage(p);
    } catch (e) {
      console.warn('loadFeedPage failed', e);
      setFeedError('Failed to load feed. Check network or TMDB export availability.');
      if (p === 1) {
        setFeedCollections([]);
        setFeedHasMore(false);
      }
    } finally {
      setFeedLoadingMore(false);
      if (p === 1) setLoadingFeed(false);
    }
  }

  const loadMoreFeed = () => {
    if (!feedLoadingMore && feedHasMore) loadFeedPage(feedPage + 1);
  };

  if (selectedCollection && collectionDetails) {
    const parts = collectionDetails.parts || [];
    return (
      <Box>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{display:'flex',gap:12,alignItems:'center'}}>
            <Button variant="ghost" onClick={()=> { setSelectedCollection(null); setCollectionDetails(null); }}>← Back</Button>
            <h2 style={{margin:0,fontSize:20,fontWeight:800}}>{collectionDetails.name}</h2>
          </div>
        </div>
        <div className="movie-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom:20}}>
          {parts.map((p:any)=> (
            <div key={p.id} className="movie-card" role="button" tabIndex={0} onClick={() => onSelectMovie && onSelectMovie(p.id, 'movie')}>
              <div className="movie-overlay">
                <img className="movie-poster" src={p.poster_path ? `https://image.tmdb.org/t/p/w300${p.poster_path}` : undefined} alt={p.title || p.name} />
                <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayMovie) onPlayMovie(p.id, 'movie', { tmdbId: p.id }); }}>
                  <div className="play-circle"><div className="play-triangle"/></div>
                </div>
              </div>
              <div className="movie-info">
                <div style={{fontWeight:700}}>{p.title || p.name}</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>{p.release_date}</div>
              </div>
            </div>
          ))}
        </div>
      </Box>
    );
  }

  return (
    <Box>
      <div style={{display:'flex',gap:12,alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:12,color:'var(--muted)'}}>Feed: {feedStats.filled}/{feedStats.total} loaded ({feedStats.placeholders} placeholders)</div>
        {feedStats.filled < feedStats.total && (
          <Button size="sm" variant="ghost" onClick={() => loadFeedPage(feedPage)}>Retry</Button>
        )}
      </div>
      <form style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
        <Input placeholder="Search collections..." value={query} onChange={e=> setQuery(e.target.value)} />
      </form>

      <div style={{marginBottom:16}}>
        <h3 style={{margin: '6px 0', fontSize:16, fontWeight:800}}>Collections</h3>
        {loadingFeed && !query.trim() ? (
          <div style={{padding:12, textAlign:'center'}}><Spinner /></div>
        ) : filteredFeed.length === 0 ? (
          <div style={{color:'var(--muted)', padding:12, textAlign:'center'}}>{feedError ? `Feed error: ${feedError}` : query.trim() ? 'No collections match your search.' : 'No feed available. Try searching or run the daily export service.'}</div>
        ) : query.trim() ? (
          <div className="movie-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom:20}}>
            {filteredFeed.map((c:any) => (
              <div key={c.id} className="movie-card" role="button" tabIndex={0} onClick={() => setSelectedCollection(c.id)}>
                <div className="movie-overlay">
                    {c._placeholder ? (
                      <div style={{width:'100%',height:240,background:'#222',display:'flex',alignItems:'center',justifyContent:'center',color:'#888'}}>Loading...</div>
                    ) : (
                      <img className="movie-poster" src={c.poster_path ? `https://image.tmdb.org/t/p/w300${c.poster_path}` : c.backdrop_path ? `https://image.tmdb.org/t/p/w300${c.backdrop_path}` : defaultPoster} alt={c.name || `Collection ${c.id}`} onError={(e) => { (e.currentTarget as HTMLImageElement).src = defaultPoster; }} />
                    )}
                  </div>
                <div className="movie-info">
                  <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>{c.name || `Collection ${c.id}`}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <InfiniteScroll
            dataLength={feedCollections.length}
            next={loadMoreFeed}
            hasMore={feedHasMore}
            loader={<div style={{padding:12, textAlign:'center'}}><Spinner /></div>}
            endMessage={<div style={{color:'var(--muted)', padding:12, textAlign:'center'}}>No more collections in feed.</div>}
          >
            <div className="movie-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom:20}}>
              {feedCollections.map((c:any) => (
                <div key={c.id} className="movie-card" role="button" tabIndex={0} onClick={() => setSelectedCollection(c.id)}>
                  <div className="movie-overlay">
                    {c._placeholder ? (
                      <div style={{width:'100%',height:240,background:'#222',display:'flex',alignItems:'center',justifyContent:'center',color:'#888'}}>Loading...</div>
                    ) : (
                      <img className="movie-poster" src={c.poster_path ? `https://image.tmdb.org/t/p/w300${c.poster_path}` : c.backdrop_path ? `https://image.tmdb.org/t/p/w300${c.backdrop_path}` : undefined} alt={c.name || `Collection ${c.id}`} />
                    )}
                  </div>
                  <div className="movie-info">
                    <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>{c.name || `Collection ${c.id}`}</div>
                  </div>
                </div>
              ))}
            </div>
          </InfiniteScroll>
        )}
      </div>
    </Box>
  );
}