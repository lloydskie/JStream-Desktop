import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Box, Spinner } from '@chakra-ui/react';
import { createPortal } from 'react-dom';
import CustomSelect from './components/CustomSelect';
import { fetchTMDB } from '../utils/tmdbClient';

const LANGUAGE_OPTIONS = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Spanish (Spain)' },
  { value: 'fr-FR', label: 'French (France)' },
  { value: 'de-DE', label: 'German (Germany)' },
  { value: 'it-IT', label: 'Italian (Italy)' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'ru-RU', label: 'Russian' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'zh-TW', label: 'Chinese (Traditional)' },
  { value: 'tr-TR', label: 'Turkish' },
  { value: 'ar-SA', label: 'Arabic' },
  { value: 'hi-IN', label: 'Hindi' },
];

const SORT_OPTIONS = [
  { value: 'suggestions', label: 'Suggestions For You' },
  { value: 'year', label: 'Year Released' },
  { value: 'az', label: 'A-Z' },
  { value: 'za', label: 'Z-A' },
];

type MediaItem = {
  id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  logoPath?: string | null;
  overview?: string | null;
  vote_average?: number | null;
};

export default function BrowseLanguagesPage({ onSelectMovie, onPlayMovie }: { onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'movie'|'tv', params?:Record<string,any>)=>void }) {
  const [language, setLanguage] = useState('en-US');
  const [sort, setSort] = useState<'suggestions'|'year'|'az'|'za'>('suggestions');
  const [results, setResults] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasRecent, setHasRecent] = useState(true);
  
  // Preview modal state
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverItem, setHoverItem] = useState<any | null>(null);
  const [hoverTrailerKey, setHoverTrailerKey] = useState<string | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const hoverTokenRef = useRef(0);
  const previewTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewModalPos, setPreviewModalPos] = useState<{left:number,top:number}|null>(null);
  const [previewAnimating, setPreviewAnimating] = useState(false);
  
  // Pagination state
  const [moviePage, setMoviePage] = useState(1);
  const [tvPage, setTvPage] = useState(1);
  const [movieTotalPages, setMovieTotalPages] = useState(1);
  const [tvTotalPages, setTvTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  
  // Logo cache
  const LOGO_CACHE_KEY = 'jstream:logo_cache_v1';
  const logoCacheRef = useRef<Map<string,string>>(new Map()).current as Map<string,string>;
  
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(LOGO_CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        for (const k of Object.keys(parsed || {})) {
          try { logoCacheRef.set(k, parsed[k]); } catch (e) {}
        }
      }
    } catch (e) {}
  }, []);
  
  function persistLogoCache() {
    try {
      const obj: Record<string,string> = {};
      for (const [k, v] of Array.from(logoCacheRef.entries())) obj[k] = v;
      sessionStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  const sortedResults = useMemo(() => {
    if (sort === 'az' || sort === 'za') {
      const items = [...results];
      items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      if (sort === 'za') items.reverse();
      return items;
    }
    return results;
  }, [results, sort]);

  useEffect(() => {
    let mounted = true;
    async function loadSuggestions() {
      setLoading(true);
      try {
        const db = (window as any).database;
        const recentItems: { id: number; type: 'movie'|'tv' }[] = [];

        try {
          if (db && typeof db.recentWatchesGet === 'function') {
            const recent = await db.recentWatchesGet();
            if (Array.isArray(recent)) {
              for (const id of recent) {
                const num = Number(id);
                if (Number.isFinite(num)) recentItems.push({ id: num, type: 'movie' });
              }
            } else if (recent && typeof recent === 'object') {
              const movieIds = Array.isArray(recent.movie) ? recent.movie : [];
              const tvIds = Array.isArray(recent.tv) ? recent.tv : [];
              for (const id of movieIds) {
                const num = Number(id);
                if (Number.isFinite(num)) recentItems.push({ id: num, type: 'movie' });
              }
              for (const id of tvIds) {
                const num = Number(id);
                if (Number.isFinite(num)) recentItems.push({ id: num, type: 'tv' });
              }
            }
          }
        } catch (e) {
          // ignore
        }

        if (recentItems.length === 0) {
          try {
            if (db && typeof db.watchHistoryList === 'function') {
              const history = await db.watchHistoryList();
              for (const h of history || []) {
                if (!h || typeof h.item_id === 'undefined' || h.item_id === null) continue;
                const raw = String(h.item_id);
                let type: 'movie'|'tv' = 'movie';
                let idStr = raw;
                if (raw.includes(':')) {
                  const parts = raw.split(':');
                  type = parts[0] === 'tv' ? 'tv' : 'movie';
                  idStr = parts[1];
                }
                const id = Number(idStr);
                if (!Number.isFinite(id)) continue;
                recentItems.push({ id, type });
              }
            }
          } catch (e) {
            // ignore
          }
        }

        if (!mounted) return;
        if (recentItems.length === 0) {
          setHasRecent(false);
          setResults([]);
          return;
        }
        setHasRecent(true);

        const dedupe = new Set<string>();
        const merged: MediaItem[] = [];
        const seed = recentItems.slice(0, 8);
        for (const entry of seed) {
          try {
            const rec = await fetchTMDB(`${entry.type}/${entry.id}/recommendations`, { language });
            const list = rec?.results || [];
            for (const item of list) {
              const mediaType = entry.type;
              const key = `${mediaType}:${item.id}`;
              if (dedupe.has(key)) continue;
              dedupe.add(key);
              merged.push({
                id: item.id,
                media_type: mediaType,
                title: item.title || item.name,
                poster_path: item.poster_path || null,
                backdrop_path: item.backdrop_path || null,
                release_date: item.release_date || item.first_air_date || null,
                overview: item.overview || null,
                vote_average: item.vote_average || null,
              });
            }
          } catch (e) {
            // ignore per-item
          }
        }
        if (!mounted) return;
        setResults(merged);
      } catch (e) {
        if (!mounted) return;
        setResults([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    async function loadDiscover() {
      setLoading(true);
      // Reset pagination when starting fresh
      setMoviePage(1);
      setTvPage(1);
      try {
        // Extract the language code (e.g., 'en' from 'en-US', 'ko' from 'ko-KR')
        const langCode = language.split('-')[0];
        
        const movieParams: Record<string, any> = { 
          language, 
          sort_by: 'popularity.desc',
          with_original_language: langCode,
          page: 1
        };
        const tvParams: Record<string, any> = { 
          language, 
          sort_by: 'popularity.desc',
          with_original_language: langCode,
          page: 1
        };
        if (sort === 'year') {
          movieParams.sort_by = 'release_date.desc';
          tvParams.sort_by = 'first_air_date.desc';
        }
        const [movieRes, tvRes] = await Promise.all([
          fetchTMDB('discover/movie', movieParams),
          fetchTMDB('discover/tv', tvParams),
        ]);
        
        // Store total pages for pagination
        setMovieTotalPages(movieRes?.total_pages || 1);
        setTvTotalPages(tvRes?.total_pages || 1);
        
        const movieList = (movieRes?.results || []).map((item: any) => ({
          id: item.id,
          media_type: 'movie' as const,
          title: item.title || item.name,
          poster_path: item.poster_path || null,
          backdrop_path: item.backdrop_path || null,
          release_date: item.release_date || null,
          overview: item.overview || null,
          vote_average: item.vote_average || null,
        }));
        const tvList = (tvRes?.results || []).map((item: any) => ({
          id: item.id,
          media_type: 'tv' as const,
          title: item.name || item.title,
          poster_path: item.poster_path || null,
          backdrop_path: item.backdrop_path || null,
          release_date: item.first_air_date || null,
          overview: item.overview || null,
          vote_average: item.vote_average || null,
        }));
        setHasRecent(true);
        setResults([...movieList, ...tvList]);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }

    if (sort === 'suggestions') loadSuggestions();
    else {
      console.log('Loading discover with language:', language);
      loadDiscover();
    }

    return () => { mounted = false; };
  }, [language, sort]);

  // Show items immediately, fetch logos lazily in background
  const [logoMap, setLogoMap] = useState<Record<string, string>>({});
  
  // Display sortedResults directly, logos will update as they load
  const enrichedResults = useMemo(() => {
    return sortedResults.map(item => ({
      ...item,
      logoPath: logoMap[`${item.media_type}:${item.id}`] || null
    }));
  }, [sortedResults, logoMap]);
  
  // Fetch logos in parallel batches (lazy loading)
  useEffect(() => {
    if (sortedResults.length === 0) return;
    
    let mounted = true;
    const BATCH_SIZE = 5; // Fetch 5 logos at a time
    
    async function fetchLogos() {
      const itemsNeedingLogos = sortedResults.filter(item => {
        const cacheKey = `${item.media_type}:${item.id}`;
        return !logoCacheRef.has(cacheKey);
      });
      
      // Process in batches
      for (let i = 0; i < itemsNeedingLogos.length; i += BATCH_SIZE) {
        if (!mounted) break;
        
        const batch = itemsNeedingLogos.slice(i, i + BATCH_SIZE);
        const promises = batch.map(async (item) => {
          const cacheKey = `${item.media_type}:${item.id}`;
          try {
            const images = await fetchTMDB(`${item.media_type}/${item.id}/images`);
            const logos = (images && (images as any).logos) || [];
            if (Array.isArray(logos) && logos.length > 0) {
              const eng = logos.find((l:any) => l.iso_639_1 === 'en') || logos[0];
              if (eng && eng.file_path) {
                logoCacheRef.set(cacheKey, eng.file_path);
                return { key: cacheKey, path: eng.file_path };
              }
            }
          } catch (e) {}
          return null;
        });
        
        const results = await Promise.all(promises);
        if (!mounted) break;
        
        // Update logo map with new results
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
      if (logoCacheRef.has(cacheKey)) {
        cachedLogos[cacheKey] = logoCacheRef.get(cacheKey)!;
      }
    });
    if (Object.keys(cachedLogos).length > 0) {
      setLogoMap(prev => ({ ...prev, ...cachedLogos }));
    }
    
    // Then fetch missing logos
    fetchLogos();
    
    return () => { mounted = false; };
  }, [sortedResults]);
  
  // Check if there are more pages to load
  const hasMore = useMemo(() => {
    if (sort === 'suggestions') return false; // Suggestions don't paginate
    return moviePage < movieTotalPages || tvPage < tvTotalPages;
  }, [sort, moviePage, tvPage, movieTotalPages, tvTotalPages]);
  
  // Load more function for infinite scroll
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || sort === 'suggestions') return;
    
    setLoadingMore(true);
    try {
      const langCode = language.split('-')[0];
      const newItems: MediaItem[] = [];
      
      // Load next page of movies if available
      if (moviePage < movieTotalPages) {
        const nextMoviePage = moviePage + 1;
        const movieParams: Record<string, any> = { 
          language, 
          sort_by: sort === 'year' ? 'release_date.desc' : 'popularity.desc',
          with_original_language: langCode,
          page: nextMoviePage
        };
        const movieRes = await fetchTMDB('discover/movie', movieParams);
        const movieList = (movieRes?.results || []).map((item: any) => ({
          id: item.id,
          media_type: 'movie' as const,
          title: item.title || item.name,
          poster_path: item.poster_path || null,
          backdrop_path: item.backdrop_path || null,
          release_date: item.release_date || null,
          overview: item.overview || null,
          vote_average: item.vote_average || null,
        }));
        newItems.push(...movieList);
        setMoviePage(nextMoviePage);
      }
      
      // Load next page of TV if available
      if (tvPage < tvTotalPages) {
        const nextTvPage = tvPage + 1;
        const tvParams: Record<string, any> = { 
          language, 
          sort_by: sort === 'year' ? 'first_air_date.desc' : 'popularity.desc',
          with_original_language: langCode,
          page: nextTvPage
        };
        const tvRes = await fetchTMDB('discover/tv', tvParams);
        const tvList = (tvRes?.results || []).map((item: any) => ({
          id: item.id,
          media_type: 'tv' as const,
          title: item.name || item.title,
          poster_path: item.poster_path || null,
          backdrop_path: item.backdrop_path || null,
          release_date: item.first_air_date || null,
          overview: item.overview || null,
          vote_average: item.vote_average || null,
        }));
        newItems.push(...tvList);
        setTvPage(nextTvPage);
      }
      
      if (newItems.length > 0) {
        setResults(prev => [...prev, ...newItems]);
      }
    } catch (e) {
      console.error('Failed to load more:', e);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, sort, language, moviePage, tvPage, movieTotalPages, tvTotalPages]);
  
  // Intersection observer for infinite scroll
  useEffect(() => {
    if (sort === 'suggestions') return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before reaching the end
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
  }, [sort, hasMore, loadingMore, loading, loadMore]);
  
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
    console.log('scheduleOpen called', { idx, itemId: item.id, showPreviewModal, hoverIndex });
    // Cancel any pending close
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    // Don't re-open if already showing this item
    if (showPreviewModal && hoverIndex === idx) return;
    // Cancel any pending open
    if (previewTimeoutRef.current) {
      window.clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }
    const card = evt.currentTarget as HTMLElement;
    const rect = card.getBoundingClientRect();
    console.log('scheduling openPreview in 200ms', rect);
    previewTimeoutRef.current = window.setTimeout(() => {
      console.log('timeout fired, calling openPreview');
      openPreview(item, idx, rect);
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
  
  async function openPreview(item: MediaItem, idx: number, rect: DOMRect) {
    console.log('openPreview called', { idx, itemId: item.id });
    hoverTokenRef.current++;
    const token = hoverTokenRef.current;
    setHoverIndex(idx);
    setHoverItem(item);
    setHoverLoading(true);
    setHoverTrailerKey(null);
    
    const left = rect.left + rect.width / 2;
    const top = rect.top + rect.height / 2;
    console.log('setting modal position and showing', { left, top });
    setPreviewModalPos({ left, top });
    setShowPreviewModal(true);
    setPreviewAnimating(true);
    setTimeout(() => setPreviewAnimating(false), 300);
    
    pauseHero();
    
    try {
      const videos = await fetchTMDB(`${item.media_type}/${item.id}/videos`);
      if (token !== hoverTokenRef.current) return;
      const trailers = (videos?.results || []).filter((v:any) => v.type === 'Trailer' && v.site === 'YouTube');
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
    setPreviewAnimating(false);
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

  return (
    <Box className="browse-language-page">
      <div className="browse-language-header">
        <div className="browse-language-title">Browse by Languages</div>
        <div className="browse-language-controls">
          <div className="browse-language-control">
            <div className="browse-language-label">Select your Preferences:</div>
            <CustomSelect id="browse-language" value={language} options={LANGUAGE_OPTIONS} onChange={(v) => setLanguage(String(v))} />
          </div>
          <div className="browse-language-control">
            <div className="browse-language-label">Sort by:</div>
            <CustomSelect id="browse-sort" value={sort} options={SORT_OPTIONS} onChange={(v) => setSort(String(v) as any)} />
          </div>
        </div>
      </div>

      {loading && <div style={{ padding: 16 }}><Spinner /></div>}
      {!loading && sort === 'suggestions' && !hasRecent && (
        <div style={{ padding: 16, color: 'var(--muted)' }}>No recent watches yet. Watch a movie or show to get suggestions.</div>
      )}
      {!loading && enrichedResults.length === 0 && hasRecent && (
        <div style={{ padding: 16, color: 'var(--muted)' }}>No results for this selection.</div>
      )}

      <div className="browse-language-grid" style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', 
        gap: '16px',
        marginTop: '16px'
      }}>
        {enrichedResults.map((item, idx) => {
          const backdropUrl = item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : undefined;
          const logoUrl = item.logoPath ? `https://image.tmdb.org/t/p/w300${item.logoPath}` : undefined;
          
          return (
            <div 
              key={`${item.media_type}-${item.id}`} 
              className="backdrop-card"
              style={{ position: 'relative', cursor: 'pointer', borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9' }}
              onMouseEnter={(e) => { scheduleOpen(e, item, idx); }}
              onMouseLeave={() => { scheduleClose(); }}
              onClick={() => {
                cancelOpen();
                closePreview();
                console.log('Card clicked, calling onSelectMovie', item.id, item.media_type);
                if (onSelectMovie) onSelectMovie(item.id, item.media_type);
              }}
            >
              <div style={{ 
                position: 'absolute', 
                inset: 0, 
                background: backdropUrl ? `url(${backdropUrl})` : 'var(--card-bg)', 
                backgroundSize: 'cover', 
                backgroundPosition: 'center',
                filter: 'brightness(0.7)'
              }} />
              
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
                    fontSize: '20px', 
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
              
            </div>
          );
        })}
      </div>
      
      {/* Infinite scroll trigger */}
      {sort !== 'suggestions' && (
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
          {!loadingMore && hasMore && (
            <div style={{ color: 'var(--muted)', fontSize: '14px' }}>Scroll for more...</div>
          )}
          {!loadingMore && !hasMore && results.length > 0 && (
            <div style={{ color: 'var(--muted)', fontSize: '14px' }}>You've reached the end</div>
          )}
        </div>
      )}

      {(showPreviewModal && hoverItem) && createPortal(
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
                    background: 'var(--primary)', 
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
                    if (onPlayMovie) onPlayMovie(hoverItem.id, hoverItem.media_type, { tmdbId: hoverItem.id });
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
                    if (onSelectMovie) onSelectMovie(hoverItem.id, hoverItem.media_type);
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
