import React, { useEffect, useState, useRef } from 'react';
import { Spinner, Box, Button } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';
import GenreGridCard from './components/GenreGridCard';

export type CategoryDef = {
  key: string;
  title: string;
  endpoint: string;
  params: Record<string, string | number>;
  mediaType: 'movie' | 'tv';
};

/**
 * Full-page infinite-scroll grid for a custom category.
 * Opened via "Explore More >" from HomeGrid rows.
 */
export default function CategoryPage({ category, onBack, onSelectMovie, onPlayMovie }: {
  category: CategoryDef | null;
  onBack: () => void;
  onSelectMovie?: (id: number, type?: 'movie' | 'tv') => void;
  onPlayMovie?: (id: number | string, type?: 'movie' | 'tv', params?: Record<string, any>) => void;
}) {
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    if (!category) return;
    setItems([]);
    setPage(1);
    setHasMore(true);
    loadPage(1, true);
  }, [category?.key]);

  async function loadPage(p: number, replace = false) {
    if (!category) return;
    if (loadingRef.current) return;
    if (!hasMore && !replace) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await fetchTMDB(category.endpoint, { ...category.params, page: p });
      const results = (res?.results || []).map((item: any) => ({
        ...item,
        title: item.title || item.name || item.original_name || '',
        media_type: category.mediaType,
        _media: category.mediaType,
      }));
      if (replace) setItems(results);
      else setItems(prev => [...prev, ...results]);
      setHasMore((res?.page || p) < (res?.total_pages || 999));
      setPage(p);
    } catch (e) {
      console.error('Failed to load category page', e);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }

  // Infinite scroll handler
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onScroll() {
      if (loadingRef.current || !hasMore) return;
      const threshold = 400;
      if (el!.scrollHeight - el!.scrollTop - el!.clientHeight < threshold) {
        loadPage(page + 1);
      }
    }
    el.addEventListener('scroll', onScroll);
    return () => { el.removeEventListener('scroll', onScroll); };
  }, [loading, hasMore, page]);

  if (!category) return null;

  return (
    <Box pt="200px">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '0 16px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button variant="ghost" className="back-btn" onClick={onBack}>← Back</Button>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{category.title}</h2>
        </div>
      </div>

      <div ref={containerRef} style={{ height: '70vh', overflow: 'auto', overscrollBehavior: 'contain' }}>
        <div className="movie-grid genre-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom: 20 }}>
          {items.map(item => (
            <GenreGridCard key={item.id} item={item} mediaType={category.mediaType} onSelect={onSelectMovie} onPlay={onPlayMovie} />
          ))}
        </div>
        {loading && <div style={{ padding: 12 }}><Spinner /></div>}
        {!hasMore && items.length > 0 && <div style={{ padding: 12, color: 'var(--muted)' }}>No more results</div>}
      </div>
    </Box>
  );
}
