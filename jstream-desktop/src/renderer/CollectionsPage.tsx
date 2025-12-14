import React, { useEffect, useState } from 'react';
import { Box, Button, Spinner, Input } from '@chakra-ui/react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { fetchTMDB } from '../utils/tmdbClient';

type MaybeString = string | null;
type FeedItem = { id: number; name: string; poster_path: MaybeString; backdrop_path: MaybeString; poster_full: MaybeString; _placeholder?: boolean };
type CollectionDetail = { id: number; name: string; poster_path: MaybeString; backdrop_path: MaybeString; poster_full: MaybeString };

// Single clean implementation — no duplicated/trailing content
export default function CollectionsPage({ onSelectMovie, onPlayMovie }: { onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'movie'|'tv', params?:Record<string,any>)=>void }){
  const [query, setQuery] = useState('');
  const [filteredFeed, setFilteredFeed] = useState<FeedItem[]>([]);

  const [feedCollections, setFeedCollections] = useState<FeedItem[]>([]);
  const [feedStats, setFeedStats] = useState({ total: 0, filled: 0, placeholders: 0, failed: 0 });
  const defaultPoster = '/assets/default_collection_poster.png';
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const [selectedCollection, setSelectedCollection] = useState<number | null>(null);
  const [collectionDetails, setCollectionDetails] = useState<CollectionDetail | null>(null);

  const detailCache = React.useRef<Map<number, CollectionDetail>>(new Map());

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
      const { items = [], hasMore = false, error } = res || {};
      if (error) {
        setFeedError(error);
        setFeedCollections([]);
        setFeedHasMore(false);
        return;
      }
      // Debug logging: show how many items main returned and a sample
      try { console.log('Collections feed page', p, 'items count', items.length, 'sample:', items.slice(0, 6)); } catch (e) {}
      // Renderer will search for collection details using name with controlled concurrency.
      async function fetchDetailsForItems(itemsArr: {id: number, name?: string}[]) {
        if (!Array.isArray(itemsArr) || itemsArr.length === 0) return;
        const toFetch = itemsArr.filter(item => !detailCache.current.has(item.id));
        console.log('fetchDetailsForItems: toFetch items', toFetch);
        // Insert placeholders in order to ensure the displayed feed keeps stable ordering
        setFeedCollections(prev => {
          const existingIds = new Set(prev.map(p => Number(p.id)));
          const placeholders: FeedItem[] = itemsArr.map(item => ({ id: item.id, name: item.name || '', poster_path: null, backdrop_path: null, poster_full: null, _placeholder: true }));
          console.log('Inserting placeholders for items', placeholders.map(p => ({ id: p.id, name: p.name })));
          return prev.concat(placeholders.filter(p => !existingIds.has(p.id)));
        });
        const concurrency = 4;
        let idx = 0;
        // minimal retry helper
        async function fetchWithRetries(item: {id: number, name?: string}, attempts = 3) {
          let lastErr: any = null;
          let delay = 500;
          for (let i = 0; i < attempts; i++) {
            try {
              // First try direct collection/{id} endpoint
              console.log(`Trying direct collection endpoint for ${item.id}`);
              const directRes = await (window as any).tmdb.request(`collection/${item.id}`);
              console.log(`Direct collection response for ${item.id}:`, directRes);
              if (directRes && !directRes.error && directRes.id) {
                console.log(`Found collection ${item.id} via direct endpoint:`, directRes);
                return directRes;
              }
              // If direct fails, use search/collection with the exact name first
              const fullName = (item.name || `collection ${item.id}`).trim();
              // Try exact name search first (better when id from feed doesn't match TMDB id)
              try {
                const encodedFull = encodeURIComponent(fullName);
                console.log(`Searching for collection by exact name: "${fullName}"`);
                const exactSearchRes = await (window as any).tmdb.request(`search/collection?query=${encodedFull}&include_adult=false&language=en-US&page=1`);
                console.log(`Exact name search response for "${fullName}":`, exactSearchRes && exactSearchRes.results ? `${exactSearchRes.results.length} results` : exactSearchRes);
                if (exactSearchRes && !exactSearchRes.error && Array.isArray(exactSearchRes.results) && exactSearchRes.results.length > 0) {
                  // Prefer the first item from the exact-name search results, but only if it contains an image
                  const first = exactSearchRes.results[0];
                  const hasImage = Boolean(first && (first.poster_path || first.backdrop_path));
                  if (hasImage) {
                    console.log(`Returning first exact-name search result for "${fullName}" (has image):`, first);
                    return first;
                  }
                  console.log(`First exact-name result for "${fullName}" has no image, falling back to broader search`);
                }
              } catch (e) {
                console.warn('Exact-name search failed', e);
              }

              // Fallback: try a shorter query (first 2-3 words) to broaden results
              let query = fullName;
              if (query.toLowerCase().endsWith(' collection')) {
                query = query.slice(0, -11).trim(); // remove " collection"
              }
              const words = query.split(' ').slice(0, 3);
              query = words.join(' ');
              console.log(`Fallback searching for collection ${item.id} (${item.name}) with query: "${query}"`);
              const encodedQuery = encodeURIComponent(query);
              const searchRes = await (window as any).tmdb.request(`search/collection?query=${encodedQuery}&include_adult=false&language=en-US&page=1`);
              console.log(`Fallback search response for "${query}":`, searchRes && searchRes.results ? `${searchRes.results.length} results` : searchRes);
              if (!searchRes || searchRes.error) throw searchRes || new Error('Invalid search response');
              // Prefer a name match in the fallback results too
              const normalize = (s: string) => s ? s.replace(/[\s\-_:–—]+/g, ' ').replace(/[\p{P}\p{S}]/gu, '').trim().toLowerCase() : '';
              const target = normalize(fullName);
              const result = searchRes.results?.find((r: any) => normalize(r.name) === target) || searchRes.results?.find((r: any) => r.id === item.id) || searchRes.results?.[0];
              if (!result) {
                throw new Error('Collection not found in search results');
              }
              console.log(`Found collection for ${item.id} with fallback query "${query}":`, result);
              return result;
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
            const item = toFetch[i];
            try {
              const detail = await fetchWithRetries(item, 3);
              console.log('Fetching collection detail for id', item.id, 'name', item.name, '->', detail && detail.error ? 'ERROR' : 'OK');
              // Use the search result
              const value: CollectionDetail = {
                id: detail.id || item.id,
                name: detail.name || item.name || `Collection ${item.id}`,
                poster_path: detail.poster_path || null,
                backdrop_path: detail.backdrop_path || null,
                poster_full: detail.poster_path ? `https://image.tmdb.org/t/p/original${detail.poster_path}` : (detail.backdrop_path ? `https://image.tmdb.org/t/p/original${detail.backdrop_path}` : null)
              };
              detailCache.current.set(Number(item.id), value);
              // update stats for a single loaded item
              setFeedStats(s => ({ ...s, filled: (s.filled || 0) + 1 }));
              console.log('detail for', item.id, 'cached');
            } catch (e) {
              console.warn('Failed to fetch collection detail for id', item.id, e);
              // increment failed count
              setFeedStats(s => ({ ...s, failed: (s.failed || 0) + 1 }));
              detailCache.current.set(Number(item.id), { id: item.id, name: item.name || `Collection ${item.id}`, poster_path: null, backdrop_path: null, poster_full: null } as CollectionDetail);
            }
          }
        });
        await Promise.all(workers);
        // Recompose final ordered results and update feed in-place
        const finalResults = itemsArr.map(item => {
          const d = detailCache.current.get(Number(item.id));
          if (d) return { id: Number(item.id), name: d.name || item.name || `Collection ${item.id}`, poster_path: d.poster_path, backdrop_path: d.backdrop_path, poster_full: d.poster_full || null, _placeholder: false };
          return { id: Number(item.id), name: item.name || '', poster_path: null, backdrop_path: null, poster_full: null, _placeholder: true };
        });
        setFeedCollections(prev => {
          const otherPrev = prev.filter(item => !itemsArr.some(i => i.id === Number(item.id)));
          return otherPrev.concat(finalResults);
        });
        console.log('finalResults for items', itemsArr.map(i => ({ id: i.id, name: i.name })), '->', finalResults.map(r => ({ id: r.id, name: r.name, poster: r.poster_path }))); 
        // Update stats
        const total = finalResults.length;
        const filled = finalResults.filter(r => !r._placeholder).length;
        const placeholders = finalResults.length - filled;
        setFeedStats(s => ({ ...s, total: total, filled: filled, placeholders }));
      }

      if (p === 1) {
        setFeedCollections([]);
        await fetchDetailsForItems(items);
        setFeedHasMore(hasMore);
      } else {
        await fetchDetailsForItems(items);
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
          {parts.map((p:any)=> {
            const api = (window as any).tmdbApi;
            const posterSrc = p.poster_path ? (api && api.imageUrl ? api.imageUrl(p.poster_path, 'w300') : `https://image.tmdb.org/t/p/w300${p.poster_path}`) : undefined;
            return (
              <div key={p.id} className="movie-card" role="button" tabIndex={0} onClick={() => onSelectMovie && onSelectMovie(p.id, 'movie')}>
                <div className="movie-overlay">
                  <img className="movie-poster" src={posterSrc || undefined} alt={p.title || p.name} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).src = '/assets/default_collection_poster.png'; }} />
                  <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayMovie) onPlayMovie(p.id, 'movie', { tmdbId: p.id }); }}>
                    <div className="play-circle"><div className="play-triangle"/></div>
                  </div>
                </div>
                <div className="movie-info">
                  <div style={{fontWeight:700}}>{p.title || p.name}</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>{p.release_date}</div>
                </div>
              </div>
            );
          })}
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
            {filteredFeed.map((c:any) => {
              const api = (window as any).tmdbApi;
              const posterSrc = c.poster_full ? c.poster_full : (c.poster_path ? (api && api.imageUrl ? api.imageUrl(c.poster_path, 'original') : `https://image.tmdb.org/t/p/original${c.poster_path}`)
                : c.backdrop_path ? (api && api.imageUrl ? api.imageUrl(c.backdrop_path, 'original') : `https://image.tmdb.org/t/p/original${c.backdrop_path}`)
                : defaultPoster);
              return (
                <div key={c.id} className="movie-card" role="button" tabIndex={0} onClick={() => setSelectedCollection(c.id)}>
                  <div className="movie-overlay">
                      {c._placeholder ? (
                        <div style={{width:'100%',height:240,background:'#222',display:'flex',alignItems:'center',justifyContent:'center',color:'#888'}}>Loading...</div>
                      ) : (
                        <img className="movie-poster" src={posterSrc} alt={c.name || `Collection ${c.id}`} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).src = defaultPoster; }} />
                      )}
                    </div>
                  <div className="movie-info">
                    <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>{c.name || `Collection ${c.id}`}</div>
                  </div>
                </div>
              );
            })}
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
              {feedCollections.map((c:any) => {
                const api = (window as any).tmdbApi;
                const posterSrc = c.poster_full ? c.poster_full : (c.poster_path ? (api && api.imageUrl ? api.imageUrl(c.poster_path, 'original') : `https://image.tmdb.org/t/p/original${c.poster_path}`)
                  : c.backdrop_path ? (api && api.imageUrl ? api.imageUrl(c.backdrop_path, 'original') : `https://image.tmdb.org/t/p/original${c.backdrop_path}`)
                  : defaultPoster);
                return (
                  <div key={c.id} className="movie-card" role="button" tabIndex={0} onClick={() => setSelectedCollection(c.id)}>
                    <div className="movie-overlay">
                      {c._placeholder ? (
                        <div style={{width:'100%',height:240,background:'#222',display:'flex',alignItems:'center',justifyContent:'center',color:'#888'}}>Loading...</div>
                      ) : (
                        <img className="movie-poster" src={posterSrc} alt={c.name || `Collection ${c.id}`} loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).src = defaultPoster; }} />
                      )}
                    </div>
                    <div className="movie-info">
                      <div style={{fontSize:13,fontWeight:700,color:'#fff'}}>{c.name || `Collection ${c.id}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </InfiniteScroll>
        )}
      </div>
    </Box>
  );
}