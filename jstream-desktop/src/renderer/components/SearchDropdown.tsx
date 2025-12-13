import React, { useEffect, useState, useRef } from 'react';

export default function SearchDropdown({ items, onSelect, isOpen }: { items: any[], onSelect: (item:any)=>void, isOpen: boolean }){
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(()=>{ setActive(0); }, [items]);

  useEffect(()=>{
    function keyHandler(e: KeyboardEvent){
      if (!isOpen) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a=> Math.min(a+1, items.length-1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a=> Math.max(a-1, 0)); }
      if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it) onSelect(it); }
    }
    window.addEventListener('keydown', keyHandler);
    return () => window.removeEventListener('keydown', keyHandler);
  }, [items, active, isOpen, onSelect]);

  if (!isOpen || items.length === 0) return null;
  return (
    <div className="search-dropdown" ref={ref} role="listbox">
      {items.map((it, idx)=> (
        <div key={it.id} className={`search-item ${idx===active? 'active':''}`} onMouseEnter={()=>setActive(idx)} onClick={()=>onSelect(it)}>
          <img src={it.poster_path ? `https://image.tmdb.org/t/p/w92${it.poster_path}` : undefined} alt={it.title} />
          <div className="meta"><div className="title">{it.title}</div><div className="subtitle">{it.release_date}</div></div>
        </div>
      ))}
    </div>
  )
}
