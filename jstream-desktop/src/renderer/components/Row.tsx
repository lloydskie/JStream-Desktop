import React, { useRef, useState, useEffect } from 'react';
import { fetchTMDB } from '../../utils/tmdbClient';

export default function Row({ title, movies, onSelect, onPlay }: { title: string, movies: any[], onSelect?: (id:number, type?:'movie'|'tv')=>void, onPlay?: (id:number, type?:'movie'|'tv')=>void }) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  // focus preview removed: no floating preview dialog

  function scrollLeft() { scrollerRef.current?.scrollBy({left:-300, behavior:'smooth'}); }
  function scrollRight() { scrollerRef.current?.scrollBy({left:300, behavior:'smooth'}); }

  useEffect(()=>{
    function keyHandler(e: KeyboardEvent){
      if (focusedIndex === null) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); const next = Math.min((focusedIndex ?? 0) + 1, movies.length - 1); setFocusedIndex(next); scrollToIndex(next); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); const prev = Math.max((focusedIndex ?? 0) - 1, 0); setFocusedIndex(prev); scrollToIndex(prev); }
      if (e.key === 'Enter') { e.preventDefault(); const m = movies[focusedIndex ?? 0]; if (m && onSelect) onSelect(m.id); }
    }
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedIndex, movies]);

  // prefetch details and position preview when focus changes
  // removed preview prefetch effect

  function scrollToIndex(idx: number){
    const container = scrollerRef.current;
    if (!container) return;
    const child = container.children[idx] as HTMLElement | undefined;
    if (child) child.scrollIntoView({behavior:'smooth', inline:'center'});
  }

  // When the mouse wheel is used over the horizontal scroller, translate vertical wheel into horizontal scroll
  function handleWheel(e: React.WheelEvent) {
    const container = scrollerRef.current;
    if (!container) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      container.scrollBy({ left: e.deltaY, behavior: 'auto' });
      e.preventDefault();
      e.stopPropagation();
    }
  }

  // global wheel capture handles translation of wheel to scroll; no local native listener needed here

  return (
    <div className="row-container">
      <div className="row-title">{title}</div>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <button onClick={scrollLeft} aria-label="Scroll left" style={{background:'transparent',border:'none',color:'var(--muted)'}}>◀</button>
        <div className="row-scroll" ref={scrollerRef} style={{position:'relative'}} onWheel={handleWheel}>
          {movies.map((m, idx)=> (
            <div key={m.id} className={`movie-card ${focusedIndex===idx? 'focused-row':''}`} onClick={()=> {
              const inferred: 'movie'|'tv' = (m._media === 'tv' || m.media_type === 'tv') ? 'tv' : 'movie';
              if (onSelect) onSelect(m.id, inferred);
            }} tabIndex={0} onFocus={()=>setFocusedIndex(idx)}>
              <div className="movie-overlay">
                <img className="movie-poster" src={m.poster_path ? `https://image.tmdb.org/t/p/w300${m.poster_path}` : undefined} alt={m.title} />
                <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); const inferred: 'movie'|'tv' = (m._media === 'tv' || m.media_type === 'tv') ? 'tv' : 'movie'; if (onPlay) onPlay(m.id, inferred); }}><div className="play-circle"><div className="play-triangle"/></div></div>
              </div>
              {/* Favorite button moved to details page per request */}
              <div className="movie-info">
                <div className="movie-title">{m.title}</div>
              </div>
            </div>
          ))}
          {/* Focus preview removed */}
        </div>
        <button onClick={scrollRight} aria-label="Scroll right" style={{background:'transparent',border:'none',color:'var(--muted)'}}>▶</button>
      </div>
    </div>
  )
}
