import React, { useEffect, useState, useRef } from 'react';
import { Box, Button, Spinner } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';

export default function TVPage({ genres = [], onSelectMovie, onPlayMovie }: { genres?: any[], onSelectMovie?: (id:number, type?:'movie'|'tv')=>void, onPlayMovie?: (id:number|string, type?:'tv'|'movie', params?:Record<string,any>)=>void }) {
  const [overview, setOverview] = useState<Record<number, any[]>>({});
  const [loadingMap, setLoadingMap] = useState<Record<number, boolean>>({});
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);

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
      {(genres || []).map((g:any)=> (
        <section key={g.id} style={{marginBottom:20}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <h3 style={{margin:0,fontSize:18,fontWeight:700}}>{g.name}</h3>
            <div>
              <Button size="sm" variant="ghost" onClick={()=>setSelectedGenre(g.id)}>More</Button>
            </div>
          </div>
          <div className="row-scroll">
            {loadingMap[g.id] ? (
              <div style={{padding:12}}><Spinner /></div>
            ) : (
              (() => {
                const list = overview[g.id] || [];
                if (!list || list.length === 0) return <div style={{color:'var(--muted)', padding:12}}>No popular shows found for this genre.</div>;
                return list.slice(0,12).map((m:any)=> (
                  <div key={m.id} className="movie-card small" tabIndex={0} role="button" onClick={()=> onSelectMovie && onSelectMovie(m.id, 'tv')}>
                    <div className="movie-overlay">
                      <img className="movie-poster" src={m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : undefined} alt={m.name} />
                      <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayMovie) onPlayMovie(m.id, 'tv', { tmdbId: m.id }); }}>
                        <div className="play-circle"><div className="play-triangle"/></div>
                      </div>
                    </div>
                    <div className="movie-info">
                      <div style={{fontSize:13,fontWeight:700}}>{m.name}</div>
                      <div style={{fontSize:12,color:'var(--muted)'}}>{m.first_air_date}</div>
                    </div>
                  </div>
                ));
              })()
            )}
          </div>
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
            <div key={i.id} className="movie-card" role="button" tabIndex={0} onClick={() => onSelectShow && onSelectShow(i.id, 'tv')}>
              <div className="movie-overlay">
                <img className="movie-poster" src={i.poster_path ? `https://image.tmdb.org/t/p/w300${i.poster_path}` : undefined} alt={i.name} />
                <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onPlayShow) onPlayShow(i.id, 'tv', { tmdbId: i.id }); }}>
                  <div className="play-circle"><div className="play-triangle"/></div>
                </div>
              </div>
              <div className="movie-info">
                <div style={{fontWeight:700}}>{i.name}</div>
                <div style={{fontSize:12,color:'var(--muted)'}}>{i.first_air_date}</div>
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
