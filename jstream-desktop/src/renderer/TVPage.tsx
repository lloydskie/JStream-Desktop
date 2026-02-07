import React, { useEffect, useState, useRef } from 'react';
import Row from './components/Row';
import { Box, Button, Spinner } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';
import HeroBanner from './components/HeroBanner';
import GenreGridCard from './components/GenreGridCard';
import { filterGenresForKids } from '../utils/kidsFilter';

export default function TVPage({ genres: rawGenres = [], onSelectMovie, onPlayMovie }: { genres?: any[], onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'tv'|'movie', params?:Record<string,any>)=>void }) {
  const genres = filterGenresForKids(rawGenres);
  const [overview, setOverview] = useState<Record<number, any[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [featured, setFeatured] = useState<any|null>(null);

  useEffect(() => {
    // fetch a featured show for the hero (random from top 10 with available YouTube video)
    (async () => {
      try {
        const pop = await fetchTMDB('tv/popular');
        const top10 = (pop?.results || []).slice(0, 10);
        // Shuffle to randomize selection order
        const shuffled = [...top10].sort(() => Math.random() - 0.5);
        
        // Helper to check if a YouTube video is actually available
        // Uses noembed.com which properly returns errors for unavailable videos
        const isYouTubeVideoAvailable = async (videoKey: string): Promise<boolean> => {
          try {
            const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoKey}`);
            if (!response.ok) return false;
            const data = await response.json();
            // noembed returns error field for unavailable videos
            return !data.error && data.title;
          } catch {
            return false;
          }
        };
        
        let feat: any = null;
        for (const candidate of shuffled) {
          if (!candidate?.id) continue;
          try {
            const videos = await fetchTMDB(`tv/${candidate.id}/videos`, { language: 'en-US' });
            const results = videos?.results || [];
            // Find YouTube videos with preferred types
            const youtubeVideos = results.filter((v: any) => 
              (v.site || '').toLowerCase() === 'youtube' && 
              v.key && 
              ['Trailer', 'Teaser', 'Featurette', 'Clip'].includes(v.type)
            );
            // Check if any YouTube video is actually available
            for (const video of youtubeVideos) {
              const isAvailable = await isYouTubeVideoAvailable(video.key);
              if (isAvailable) {
                feat = candidate;
                break;
              }
            }
            if (feat) break;
          } catch (e) {
            // skip this candidate on error
          }
        }
        // Fallback to first item if none have available YouTube videos
        if (!feat) feat = shuffled[0] || null;
        setFeatured(feat);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    // Strict dedupe + fill for TV genre rows
    const ROW_SIZE = 12;
    const loadAll = async () => {
      const gens = (genres || []).slice();
      const pages: Record<number, number> = {};
      const totals: Record<number, number> = {};
      const lists: Record<number, any[]> = {};
      const exhausted: Record<number, boolean> = {};
      const used = new Set<number>();

      for (const g of gens) {
        pages[g.id] = 1;
        lists[g.id] = [];
        exhausted[g.id] = false;
        setLoadingMap(prev => ({ ...prev, [g.id]: true }));
      }

      let progress = true;
      while (progress) {
        progress = false;
        for (const g of gens) {
          const gid = g.id;
          if (lists[gid].length >= ROW_SIZE || exhausted[gid]) {
            setLoadingMap(prev => ({ ...prev, [gid]: false }));
            continue;
          }
          try {
            const res = await fetchTMDB('discover/tv', { with_genres: gid, sort_by: 'popularity.desc', page: pages[gid] });
            const results = (res && res.results) ? res.results : [];
            totals[gid] = res.total_pages || totals[gid] || 0;
            for (const it of results) {
              if (lists[gid].length >= ROW_SIZE) break;
              if (!it || typeof it.id === 'undefined') continue;
              if (used.has(it.id)) continue;
              lists[gid].push(it);
              used.add(it.id);
            }
            pages[gid] = (pages[gid] || 1) + 1;
            if ((res.page || pages[gid]-1) >= (res.total_pages || 0) || results.length === 0) {
              exhausted[gid] = true;
              setLoadingMap(prev => ({ ...prev, [gid]: false }));
            } else {
              setLoadingMap(prev => ({ ...prev, [gid]: true }));
              progress = true;
            }
          } catch (e) {
            console.warn('Failed to load TV genre feed', g, e);
            exhausted[gid] = true;
            setLoadingMap(prev => ({ ...prev, [gid]: false }));
          }
        }
        const needMore = gens.some(g => lists[g.id].length < ROW_SIZE && !exhausted[g.id]);
        if (needMore) progress = true;
        setOverview(prev => ({ ...prev, ...Object.fromEntries(Object.entries(lists).map(([k,v])=> [Number(k), v])) }));
      }
      const final: Record<number, any[]> = {};
      for (const g of gens) final[g.id] = (lists[g.id] || []).slice(0, ROW_SIZE);
      setOverview(final);
      for (const g of gens) setLoadingMap(prev => ({ ...prev, [g.id]: false }));
    };
    loadAll();
  }, [genres]);

  if (!genres || genres.length === 0) return <Box p={6}><Spinner /></Box>;

  if (selectedGenre) {
    return <TVGenreView genreId={selectedGenre} genreName={(genres.find(g=>g.id===selectedGenre)||{}).name} onBack={()=>setSelectedGenre(null)} onSelectShow={onSelectMovie} onPlayShow={onPlayMovie} />;
  }

  return (
    <Box>
      {/* Hero banner for TV */}
      {featured && <HeroBanner movie={featured} onPlay={onPlayMovie} onMore={(id)=> onSelectMovie && onSelectMovie(id, 'tv')} mediaType="tv" fullBleed isVisible={true} />}

      {(genres || []).map((g:any)=> (
        <section key={g.id} style={{marginBottom:20}}>
          {loadingMap[g.id] ? (
            <div style={{padding:12}}><Spinner /></div>
          ) : (
            (() => {
              const list = overview[g.id] || [];
              if (!list || list.length === 0) return <div style={{color:'var(--muted)', padding:12}}>No popular shows found for this genre.</div>;
              // Normalize TV items to include a `title` property and media type so `Row` can fetch TV logos
              const normalized = list.slice(0,12).map((m:any) => ({ ...m, title: m.title || m.name, media_type: 'tv' }));
              return (
                <Row title={g.name} movies={normalized} onSelect={onSelectMovie} onPlay={onPlayMovie} backdropMode={true} onExplore={() => setSelectedGenre(g.id)} />
              );
            })()
          )}
        </section>
      ))}
    </Box>
  );
}

function TVGenreView({ genreId, genreName, onBack, onSelectShow, onPlayShow }: { genreId:number, genreName?:string, onBack:()=>void, onSelectShow?: (id:number)=>void, onPlayShow?: (id:number|string, type?:string, params?:Record<string,any>)=>void }){
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const containerRef = useRef<HTMLDivElement|null>(null);

  useEffect(() => { // load first page
    setItems([]); setPage(1); setHasMore(true);
    loadPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [genreId]);

  async function loadPage(p:number, replace=false){
    if (!hasMore && !replace) return;
    setLoading(true);
    try{
      const res = await fetchTMDB('discover/tv', { with_genres: genreId, sort_by:'popularity.desc', page: p });
      const results = res.results || [];
      if (replace) setItems(results);
      else setItems(prev => [...prev, ...results]);
      setHasMore((res.page || p) < (res.total_pages || 999));
      setPage(p);
    }catch(e){ console.error('Failed to load TV genre page', e); }
    finally{ setLoading(false); }
  }

  // infinite scroll handler
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
    <Box pt="200px">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12, padding: '0 16px'}}>
        <div style={{display:'flex',gap:12,alignItems:'center'}}>
          <Button variant="ghost" className="back-btn" onClick={onBack}>← Back</Button>
          <h2 style={{margin:0,fontSize:20,fontWeight:800}}>{genreName || 'Genre'}</h2>
        </div>
      </div>

      <div ref={containerRef} style={{height:'70vh', overflow:'auto', overscrollBehavior: 'contain'}}>
        <div className="movie-grid genre-grid" style={{gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', paddingBottom:20}}>
          {items.map(i => (
            <GenreGridCard key={i.id} item={i} mediaType="tv" onSelect={(id, type) => onSelectShow && onSelectShow(id)} onPlay={onPlayShow} />
          ))}
        </div>
        {loading && <div style={{padding:12}}><Spinner /></div>}
        {!hasMore && <div style={{padding:12,color:'var(--muted)'}}>No more results</div>}
      </div>
    </Box>
  );
}

