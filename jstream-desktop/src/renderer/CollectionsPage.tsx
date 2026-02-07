import React, { useEffect, useState, useRef } from 'react';
import { Box, Button, Spinner, Input } from '@chakra-ui/react';
import InfiniteScroll from 'react-infinite-scroll-component';
import { fetchTMDB } from '../utils/tmdbClient';
import GenreGridCard from './components/GenreGridCard';
import RowScroller from './components/RowScroller';
import CustomSelect from './components/CustomSelect';

type MaybeString = string | null;
type FeedItem = { id: number; name: string; poster_path: MaybeString; backdrop_path: MaybeString; poster_full: MaybeString; _placeholder?: boolean };
type CollectionDetail = { id: number; name: string; overview?: string; poster_path: MaybeString; backdrop_path: MaybeString; poster_full: MaybeString; parts?: any[] };

type SortKey = 'popularity' | 'rating' | 'release_date';
type SortDir = 'desc' | 'asc';

// ─── Genre ID → label lookup ───
const GENRE_MAP: Record<number, string> = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',99:'Documentary',
  18:'Drama',10751:'Family',14:'Fantasy',36:'History',27:'Horror',10402:'Music',
  9648:'Mystery',10749:'Romance',878:'Science Fiction',10770:'TV Movie',53:'Thriller',
  10752:'War',37:'Western'
};

const GENRE_LIST: { value: number; label: string }[] = [
  { value: 28, label: 'Action' },
  { value: 12, label: 'Adventure' },
  { value: 16, label: 'Animation' },
  { value: 35, label: 'Comedy' },
  { value: 80, label: 'Crime' },
  { value: 99, label: 'Documentary' },
  { value: 18, label: 'Drama' },
  { value: 10751, label: 'Family' },
  { value: 14, label: 'Fantasy' },
  { value: 36, label: 'History' },
  { value: 27, label: 'Horror' },
  { value: 10402, label: 'Music' },
  { value: 9648, label: 'Mystery' },
  { value: 10749, label: 'Romance' },
  { value: 878, label: 'Science Fiction' },
  { value: 10770, label: 'TV Movie' },
  { value: 53, label: 'Thriller' },
  { value: 10752, label: 'War' },
  { value: 37, label: 'Western' },
];

export default function CollectionsPage({ onSelectMovie, onPlayMovie, onSelectPerson, selectedCollectionId }: {
  onSelectMovie?: (id: number, type?: 'movie' | 'tv') => void;
  onPlayMovie?: (id: number | string, type?: 'movie' | 'tv', params?: Record<string, any>) => void;
  onSelectPerson?: (personId: number) => void;
  selectedCollectionId?: number;
}) {
  const [query, setQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<number | ''>('');
  const [genreCollectionIds, setGenreCollectionIds] = useState<Set<number> | null>(null);
  const [genreLoading, setGenreLoading] = useState(false);
  const [filteredFeed, setFilteredFeed] = useState<FeedItem[]>([]);

  const [feedCollections, setFeedCollections] = useState<FeedItem[]>([]);
  const [feedStats, setFeedStats] = useState({ total: 0, filled: 0, placeholders: 0, failed: 0 });
  const defaultPoster = '';
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [feedPage, setFeedPage] = useState(1);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const [selectedCollection, setSelectedCollection] = useState<number | null>(null);
  const [collectionDetails, setCollectionDetails] = useState<CollectionDetail | null>(null);
  const [collectionCast, setCollectionCast] = useState<any[]>([]);
  const [collectionCrew, setCollectionCrew] = useState<any[]>([]);

  // Sort state for detail view
  const [sortKey, setSortKey] = useState<SortKey>('release_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Pager state for cast/crew RowScrollers
  const [castPagerIndex, setCastPagerIndex] = useState(0);
  const [castPagerCount, setCastPagerCount] = useState(0);
  const [crewPagerIndex, setCrewPagerIndex] = useState(0);
  const [crewPagerCount, setCrewPagerCount] = useState(0);
  const castScrollerRef = useRef<HTMLDivElement | null>(null);
  const crewScrollerRef = useRef<HTMLDivElement | null>(null);

  const detailCache = useRef<Map<number, CollectionDetail>>(new Map());
  const DETAIL_CACHE_KEY = 'jstream:collection_detail_cache_v1';

  // ─── Restore cache from sessionStorage ───
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DETAIL_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const k of Object.keys(parsed || {})) {
          try { detailCache.current.set(Number(k), parsed[k]); } catch (e) { /* ignore */ }
        }
      }
    } catch (e) { /* ignore */ }
  }, []);

  function persistDetailCache() {
    try {
      const obj: Record<number, any> = {};
      for (const [k, v] of Array.from(detailCache.current.entries())) obj[k] = v;
      sessionStorage.setItem(DETAIL_CACHE_KEY, JSON.stringify(obj));
    } catch (e) { /* ignore */ }
  }

  // ─── Load feed on mount ───
  useEffect(() => {
    setFeedCollections([]);
    setFeedPage(1);
    setFeedHasMore(true);
    setFeedError(null);
    loadFeedPage(1);
    // eslint-disable-next-line
  }, []);

  // ─── Discover collection IDs for selected genre ───
  useEffect(() => {
    if (!selectedGenre) {
      setGenreCollectionIds(null);
      return;
    }
    let mounted = true;
    (async () => {
      setGenreLoading(true);
      try {
        const ids = new Set<number>();
        // Fetch a few pages from discover/movie to find collections with this genre
        for (let p = 1; p <= 5; p++) {
          const res = await fetchTMDB('discover/movie', {
            with_genres: String(selectedGenre),
            page: p,
            sort_by: 'popularity.desc',
            include_adult: 'false',
          });
          if (!mounted) return;
          for (const m of (res?.results || [])) {
            if (m.belongs_to_collection && m.belongs_to_collection.id) {
              ids.add(m.belongs_to_collection.id);
            }
          }
          if (p >= (res?.total_pages || 1)) break;
        }
        if (mounted) setGenreCollectionIds(ids);
      } catch (e) {
        console.warn('Genre collection discovery failed', e);
        if (mounted) setGenreCollectionIds(new Set());
      } finally {
        if (mounted) setGenreLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [selectedGenre]);

  // ─── Filter by search query and genre ───
  useEffect(() => {
    let result = feedCollections;
    if (query.trim()) {
      result = result.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
    }
    if (selectedGenre && genreCollectionIds) {
      result = result.filter((c) => genreCollectionIds.has(c.id));
    }
    setFilteredFeed(result);
  }, [feedCollections, query, selectedGenre, genreCollectionIds]);

  // ─── Handle external selectedCollectionId prop ───
  useEffect(() => {
    if (selectedCollectionId) setSelectedCollection(selectedCollectionId);
  }, [selectedCollectionId]);

  // ─── Fetch full collection detail + cast/crew ───
  useEffect(() => {
    if (!selectedCollection) return;
    let mounted = true;
    (async () => {
      try {
        setCollectionDetails(null);
        setCollectionCast([]);
        setCollectionCrew([]);
        const options = {
          method: 'GET',
          headers: {
            accept: 'application/json',
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0OTc4NzEyOGRhOTRiMzU4NWIyMWRhYzVjNGE5MmZjYyIsIm5iZiI6MTc1NjQ0MjAwNi4zMjksInN1YiI6IjY4YjEyZDk2NmZkMmM0MTFiNjM5NmQ3MCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.MEjHIvjbtHuzHUTpnwyCK6gbNKB0xY4IpSL21OEVJSI'
          }
        };
        const response = await fetch(`https://api.themoviedb.org/3/collection/${selectedCollection}`, options);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const res = await response.json();
        if (!mounted) return;
        setCollectionDetails(res);

        // ── Aggregate cast & crew from all parts ──
        const parts: any[] = res.parts || [];
        const castMap = new Map<number, any>();
        const crewMap = new Map<string, any>();

        const partSlice = parts.slice(0, 20);
        const concurrency = 4;
        let idx = 0;
        const workers = Array.from({ length: concurrency }).map(async () => {
          while (idx < partSlice.length) {
            const i = idx++;
            const part = partSlice[i];
            try {
              const credits = await fetchTMDB(`movie/${part.id}/credits`);
              if (!mounted) return;
              (credits.cast || []).forEach((c: any) => {
                if (!castMap.has(c.id)) {
                  castMap.set(c.id, { ...c, _count: 1 });
                } else {
                  castMap.get(c.id)._count++;
                }
              });
              (credits.crew || []).forEach((c: any) => {
                const key = `${c.id}-${c.job}`;
                if (!crewMap.has(key)) {
                  crewMap.set(key, { ...c, _count: 1 });
                } else {
                  crewMap.get(key)._count++;
                }
              });
            } catch (e) { /* skip */ }
          }
        });
        await Promise.all(workers);
        if (!mounted) return;

        setCollectionCast(
          Array.from(castMap.values())
            .sort((a, b) => (b._count - a._count) || (b.popularity - a.popularity))
            .slice(0, 12)
        );
        setCollectionCrew(
          Array.from(crewMap.values())
            .sort((a, b) => (b._count - a._count) || (b.popularity - a.popularity))
            .slice(0, 12)
        );
      } catch (e) {
        console.error('Failed to load collection', e);
      }
    })();
    return () => { mounted = false; };
  }, [selectedCollection]);

  // ─── Feed page loader ───
  async function loadFeedPage(p: number) {
    if (p === 1) setLoadingFeed(true);
    setFeedLoadingMore(true);
    try {
      const res = await (window as any).tmdbExports.fetchCollectionsFeed({ tryDays: 365, page: p, perPage: 800 });
      const { items = [], hasMore = false, error } = res || {};
      if (error) {
        setFeedError(error);
        setFeedCollections([]);
        setFeedHasMore(false);
        return;
      }

      async function fetchDetailsForItems(itemsArr: { id: number; name?: string }[]) {
        if (!Array.isArray(itemsArr) || itemsArr.length === 0) return;
        const toFetch = itemsArr.filter(item => !detailCache.current.has(item.id));
        setFeedCollections(prev => {
          const existingIds = new Set(prev.map(x => Number(x.id)));
          const placeholders: FeedItem[] = itemsArr.map(item => ({ id: item.id, name: item.name || '', poster_path: null as string | null, backdrop_path: null as string | null, poster_full: null as string | null, _placeholder: true }));
          return prev.concat(placeholders.filter(x => !existingIds.has(x.id)));
        });
        const concurrency = 4;
        let idx = 0;
        async function fetchWithRetries(item: { id: number; name?: string }, attempts = 3) {
          let lastErr: any = null;
          let delay = 500;
          for (let i = 0; i < attempts; i++) {
            try {
              const fullName = (item.name || `collection ${item.id}`).trim();
              const encoded = encodeURIComponent(fullName);
              const searchRes = await fetch(`https://api.themoviedb.org/3/search/collection?query=${encoded}&include_adult=false&language=en-US&page=1`, {
                method: 'GET',
                headers: {
                  accept: 'application/json',
                  Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI0OTc4NzEyOGRhOTRiMzU4NWIyMWRhYzVjNGE5MmZjYyIsIm5iZiI6MTc1NjQ0MjAwNi4zMjksInN1YiI6IjY4YjEyZDk2NmZkMmM0MTFiNjM5NmQ3MCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.MEjHIvjbtHuzHUTpnwyCK6gbNKB0xY4IpSL21OEVJSI'
                }
              }).then(r => r.json());
              if (searchRes?.results?.length > 0) {
                return searchRes.results.find((r: any) => r.poster_path || r.backdrop_path) || searchRes.results[0];
              }
              const directRes = await (window as any).tmdb.request(`collection/${item.id}`);
              if (directRes && !directRes.error && directRes.id) return directRes;
              throw new Error('No collection found');
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
              const value: CollectionDetail = {
                id: detail.id || item.id,
                name: detail.name || item.name || `Collection ${item.id}`,
                poster_path: detail.poster_path || null,
                backdrop_path: detail.backdrop_path || null,
                poster_full: detail.poster_path ? `https://image.tmdb.org/t/p/original${detail.poster_path}` : (detail.backdrop_path ? `https://image.tmdb.org/t/p/original${detail.backdrop_path}` : null)
              };
              detailCache.current.set(Number(item.id), value);
              try { persistDetailCache(); } catch (e) { /* ignore */ }
              setFeedStats(s => ({ ...s, filled: (s.filled || 0) + 1 }));
            } catch (e) {
              setFeedStats(s => ({ ...s, failed: (s.failed || 0) + 1 }));
              detailCache.current.set(Number(item.id), { id: item.id, name: item.name || `Collection ${item.id}`, poster_path: null, backdrop_path: null, poster_full: null });
              try { persistDetailCache(); } catch (e) { /* ignore */ }
            }
          }
        });
        await Promise.all(workers);
        const finalResults = itemsArr.map(item => {
          const d = detailCache.current.get(Number(item.id));
          if (d) return { id: Number(item.id), name: d.name || item.name || `Collection ${item.id}`, poster_path: d.poster_path, backdrop_path: d.backdrop_path, poster_full: d.poster_full || null, _placeholder: false };
          return { id: Number(item.id), name: item.name || '', poster_path: null, backdrop_path: null, poster_full: null, _placeholder: true };
        });
        setFeedCollections(prev => {
          const otherPrev = prev.filter(item => !itemsArr.some(i => i.id === Number(item.id)));
          return otherPrev.concat(finalResults);
        });
        const total = finalResults.length;
        const filled = finalResults.filter(r => !r._placeholder).length;
        setFeedStats(s => ({ ...s, total, filled, placeholders: total - filled }));
      }

      if (p === 1) {
        setFeedCollections([]);
        await fetchDetailsForItems(items);
      } else {
        await fetchDetailsForItems(items);
      }
      setFeedHasMore(hasMore);
      setFeedPage(p);
    } catch (e) {
      console.warn('loadFeedPage failed', e);
      setFeedError('Failed to load feed. Check network or TMDB export availability.');
      if (p === 1) { setFeedCollections([]); setFeedHasMore(false); }
    } finally {
      setFeedLoadingMore(false);
      if (p === 1) setLoadingFeed(false);
    }
  }

  const loadMoreFeed = () => { if (!feedLoadingMore && feedHasMore) loadFeedPage(feedPage + 1); };

  // ─── Sort helper ───
  function sortParts(parts: any[]): any[] {
    return [...parts].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === 'popularity') { va = a.popularity || 0; vb = b.popularity || 0; }
      else if (sortKey === 'rating') { va = a.vote_average || 0; vb = b.vote_average || 0; }
      else { va = a.release_date ? new Date(a.release_date).getTime() : 0; vb = b.release_date ? new Date(b.release_date).getTime() : 0; }
      return sortDir === 'desc' ? vb - va : va - vb;
    });
  }

  // ═══════════════════════════════════════════════
  //  COLLECTION DETAIL VIEW
  // ═══════════════════════════════════════════════
  if (selectedCollection && collectionDetails) {
    const rawParts: any[] = (collectionDetails as any).parts || [];
    const parts = sortParts(rawParts);
    const backdropUrl = collectionDetails.backdrop_path ? `https://image.tmdb.org/t/p/original${collectionDetails.backdrop_path}` : null;
    const posterUrl = collectionDetails.poster_path ? `https://image.tmdb.org/t/p/w500${collectionDetails.poster_path}` : null;

    // Collect unique genres from all parts
    const genreIds = new Set<number>();
    rawParts.forEach((p: any) => (p.genre_ids || []).forEach((g: number) => genreIds.add(g)));
    const genres = Array.from(genreIds).map(id => GENRE_MAP[id]).filter(Boolean);

    return (
      <div className="collections-detail-page" style={{ paddingTop: 200, minHeight: '100vh' }}>
        {/* ── Backdrop hero ── */}
        <div className="collection-detail-hero" style={{
          position: 'relative',
          width: '100%',
          minHeight: 420,
          background: backdropUrl
            ? `linear-gradient(to bottom, rgba(20,20,20,0.18) 0%, rgba(20,20,20,0.82) 65%, #141414 100%), url(${backdropUrl}) center top / cover no-repeat`
            : 'linear-gradient(to bottom, #1a1a2e 0%, #141414 100%)',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '40px 48px 48px',
          gap: 40,
          marginTop: -200,
          paddingTop: 240,
        }}>
          {/* Poster overlay */}
          {posterUrl && (
            <img
              src={posterUrl}
              alt={collectionDetails.name}
              style={{
                width: 220,
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                flexShrink: 0,
                objectFit: 'cover',
              }}
            />
          )}
          {/* Info overlay */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0, color: '#fff', lineHeight: 1.15 }}>
              {collectionDetails.name}
            </h1>
            {genres.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {genres.map(g => (
                  <span key={g} style={{
                    background: 'rgba(255,255,255,0.1)', color: '#ccc',
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600
                  }}>{g}</span>
                ))}
              </div>
            )}
            {collectionDetails.overview && (
              <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.6, marginTop: 14, maxWidth: 600 }}>
                {collectionDetails.overview}
              </p>
            )}
            <div style={{ marginTop: 14, color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
              {rawParts.length} {rawParts.length === 1 ? 'Title' : 'Titles'}
            </div>
          </div>
        </div>

        {/* ── Back + Sort controls ── */}
        <div style={{ padding: '20px 48px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <Button variant="ghost" className="back-btn" onClick={() => { setSelectedCollection(null); setCollectionDetails(null); setCollectionCast([]); setCollectionCrew([]); }}>
            ← Back
          </Button>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', marginRight: 4 }}>Sort by</span>
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              className="dark-select"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}
            >
              <option value="popularity">Popularity</option>
              <option value="rating">Rating</option>
              <option value="release_date">Release Date</option>
            </select>
            <button
              onClick={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              title={sortDir === 'desc' ? 'Descending' : 'Ascending'}
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 10px', fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {sortDir === 'desc' ? '↓ Desc' : '↑ Asc'}
            </button>
          </div>
        </div>

        {/* ── Titles grid (hoverable GenreGridCard) ── */}
        <div style={{ padding: '20px 48px 0' }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: '#fff' }}>
            {rawParts.length} {rawParts.length === 1 ? 'Title' : 'Titles'} in this Collection
          </h3>
          <div className="movie-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom: 24 }}>
            {parts.map((p: any) => (
              <GenreGridCard
                key={p.id}
                item={p}
                mediaType="movie"
                onSelect={(id, t) => onSelectMovie && onSelectMovie(id, t)}
                onPlay={(id, t, params) => onPlayMovie && onPlayMovie(id, t, params)}
              />
            ))}
          </div>
        </div>

        {/* ── Featured Cast ── */}
        {collectionCast.length > 0 && (
          <div className="row-container" style={{ padding: '12px 0 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px' }}>
              <div className="row-title" style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Featured Cast</div>
              {castPagerCount > 1 && (
                <div className="row-page-indicator-inline" aria-hidden>
                  <div className="bar-list">
                    {Array.from({ length: castPagerCount }).map((_, i) => (
                      <svg key={i} className={`bar ${i === castPagerIndex ? 'active' : ''}`} width="28" height="6" viewBox="0 0 28 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <rect width="28" height="6" rx="0" fill="currentColor" />
                      </svg>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <RowScroller
              scrollerRef={castScrollerRef}
              className="row-scroll cast-crew-scroll"
              disableWheel={true}
              showPager={false}
              onPageChange={(idx, count) => { setCastPagerIndex(idx); setCastPagerCount(count); }}
              itemCount={collectionCast.length}
              itemsPerPage={8}
            >
              {collectionCast.map((c: any) => (
                <div key={c.id} className="movie-item cast-crew-item" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onSelectPerson && onSelectPerson(c.id)}>
                  <div className="cast-crew-card">
                    <div className="cast-crew-avatar">
                      {c.profile_path ? (
                        <img src={`https://image.tmdb.org/t/p/w185${c.profile_path}`} alt={c.name} loading="lazy" />
                      ) : (
                        <div className="cast-crew-placeholder">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#555" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#555" strokeWidth="2"/></svg>
                        </div>
                      )}
                    </div>
                    <div className="cast-crew-name">{c.name}</div>
                    <div className="cast-crew-role">{c.character || ''}</div>
                  </div>
                </div>
              ))}
            </RowScroller>
          </div>
        )}

        {/* ── Featured Crew ── */}
        {collectionCrew.length > 0 && (
          <div className="row-container" style={{ padding: '12px 0 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 48px' }}>
              <div className="row-title" style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Featured Crew</div>
              {crewPagerCount > 1 && (
                <div className="row-page-indicator-inline" aria-hidden>
                  <div className="bar-list">
                    {Array.from({ length: crewPagerCount }).map((_, i) => (
                      <svg key={i} className={`bar ${i === crewPagerIndex ? 'active' : ''}`} width="28" height="6" viewBox="0 0 28 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                        <rect width="28" height="6" rx="0" fill="currentColor" />
                      </svg>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <RowScroller
              scrollerRef={crewScrollerRef}
              className="row-scroll cast-crew-scroll"
              disableWheel={true}
              showPager={false}
              onPageChange={(idx, count) => { setCrewPagerIndex(idx); setCrewPagerCount(count); }}
              itemCount={collectionCrew.length}
              itemsPerPage={8}
            >
              {collectionCrew.map((c: any, i: number) => (
                <div key={`${c.id}-${c.job}-${i}`} className="movie-item cast-crew-item" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => onSelectPerson && onSelectPerson(c.id)}>
                  <div className="cast-crew-card">
                    <div className="cast-crew-avatar">
                      {c.profile_path ? (
                        <img src={`https://image.tmdb.org/t/p/w185${c.profile_path}`} alt={c.name} loading="lazy" />
                      ) : (
                        <div className="cast-crew-placeholder">
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="#555" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7" r="4" stroke="#555" strokeWidth="2"/></svg>
                        </div>
                      )}
                    </div>
                    <div className="cast-crew-name">{c.name}</div>
                    <div className="cast-crew-role">{c.job || c.department || ''}</div>
                  </div>
                </div>
              ))}
            </RowScroller>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  //  COLLECTIONS LISTING (FEED) VIEW
  // ═══════════════════════════════════════════════
  const renderCollectionCard = (c: FeedItem) => {
    const posterSrc = c.poster_full ? c.poster_full
      : c.poster_path ? `https://image.tmdb.org/t/p/original${c.poster_path}`
      : c.backdrop_path ? `https://image.tmdb.org/t/p/original${c.backdrop_path}`
      : defaultPoster;
    return (
      <div key={c.id} className="movie-card" role="button" tabIndex={0} onClick={() => setSelectedCollection(c.id)}>
        <div className="movie-overlay">
          {c._placeholder ? (
            <div style={{ width: '100%', height: 240, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading...</div>
          ) : (
            <img className="movie-poster" src={posterSrc} alt={c.name || `Collection ${c.id}`} loading="lazy" />
          )}
        </div>
        <div className="movie-info">
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{c.name || `Collection ${c.id}`}</div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ paddingTop: 200 }}>
      <form style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12, padding: '0 48px', flexWrap: 'wrap' }} onSubmit={e => e.preventDefault()}>
        <Input type="text" placeholder="Search collections..." value={query} onChange={e => setQuery(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <CustomSelect
          id="collections-genre"
          value={selectedGenre as any}
          onChange={(v) => setSelectedGenre(v ? Number(v) : '')}
          placeholder="All Genres"
          options={[
            { value: '', label: 'All Genres' },
            ...GENRE_LIST
          ]}
        />
      </form>

      <div style={{ padding: '0 48px', marginBottom: 16 }}>
        <h3 style={{ margin: '6px 0', fontSize: 16, fontWeight: 800 }}>Collections</h3>
        {genreLoading ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Spinner /><div style={{ marginTop: 8, color: 'var(--muted)' }}>Finding collections for this genre…</div>
          </div>
        ) : loadingFeed && !query.trim() && !selectedGenre ? (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <div style={{ marginBottom: 8 }}>Loading collections...</div>
            <div style={{ width: '100%', height: 20, background: '#ddd', borderRadius: 10 }}>
              <div style={{ width: `${feedStats.total > 0 ? (feedStats.filled / feedStats.total) * 100 : 0}%`, height: '100%', background: '#3182ce', borderRadius: 10, transition: 'width 0.3s ease' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>{feedStats.filled} / {feedStats.total} loaded</div>
          </div>
        ) : filteredFeed.length === 0 ? (
          <div style={{ color: 'var(--muted)', padding: 12, textAlign: 'center' }}>
            {feedError ? `Feed error: ${feedError}` : query.trim() && selectedGenre ? 'No collections match your search and genre.' : query.trim() ? 'No collections match your search.' : selectedGenre ? 'No collections found for this genre.' : 'No feed available. Try searching or run the daily export service.'}
          </div>
        ) : (query.trim() || selectedGenre) ? (
          <div className="movie-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom: 20 }}>
            {filteredFeed.map(renderCollectionCard)}
          </div>
        ) : (
          <InfiniteScroll
            dataLength={feedCollections.length}
            next={loadMoreFeed}
            hasMore={feedHasMore}
            loader={<div style={{ padding: 12, textAlign: 'center' }}><Spinner /></div>}
            endMessage={<div style={{ color: 'var(--muted)', padding: 12, textAlign: 'center' }}>No more collections in feed.</div>}
          >
            <div className="movie-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom: 20 }}>
              {feedCollections.map(renderCollectionCard)}
            </div>
          </InfiniteScroll>
        )}
      </div>
    </div>
  );
}
