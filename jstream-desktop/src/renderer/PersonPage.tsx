import React, { useEffect, useState } from 'react';
import { Box, Spinner, Button } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';

export default function PersonPage({ personId, onSelectWork }: { personId?: number | null, onSelectWork?: (id:number, type?:'movie'|'tv')=>void }) {
  const [person, setPerson] = useState<any>(null);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!personId) return;
      setLoading(true);
      try {
        const [p, c] = await Promise.all([
          fetchTMDB(`person/${personId}`),
          fetchTMDB(`person/${personId}/combined_credits`)
        ]);
        setPerson(p || null);
        // combined_credits has cast/crew arrays; flatten and sort by popularity
        const list = (c && (c.cast || []).concat(c.crew || [])) || [];
        const unique = Array.from(new Map(list.map((it:any)=>[String(it.id)+'.'+(it.media_type||''), it])).values());
        unique.sort((a:any,b:any)=> (b.popularity||0) - (a.popularity||0));
        setCredits(unique.slice(0,50));
      } catch (e) {
        console.error('Failed to load person data', e);
        setPerson(null); setCredits([]);
      } finally { setLoading(false); }
    })();
  }, [personId]);

  if (!personId) return <Box p={6}>No person selected.</Box>;
  if (loading) return <Box p={6}><Spinner /></Box>;
  if (!person) return <Box p={6}>Person not found.</Box>;

  return (
    <Box p={6}>
      <div style={{display:'flex',gap:16}}>
        <img src={person.profile_path ? `https://image.tmdb.org/t/p/w300${person.profile_path}` : undefined} alt={person.name} style={{width:160,height:160,objectFit:'cover',borderRadius:'50%'}} />
        <div>
          <h2 style={{margin:0,fontSize:22}}>{person.name}</h2>
          <div style={{color:'var(--muted)',marginTop:6}}>{person.place_of_birth || ''} • Born {person.birthday || ''}</div>
          <div style={{marginTop:12}}>{person.biography || 'No biography available.'}</div>
        </div>
      </div>

      <div style={{marginTop:24}}>
        <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Known For</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12}}>
          {credits.map((c:any)=> (
            <div key={`${c.media_type}-${c.id}`} className="movie-card" role="button" tabIndex={0} onClick={() => onSelectWork && onSelectWork(c.id, c.media_type === 'tv' ? 'tv' : 'movie')}>
              <div className="movie-overlay">
                <img src={c.poster_path || c.profile_path ? `https://image.tmdb.org/t/p/w300${c.poster_path||c.profile_path}` : undefined} alt={c.title||c.name} style={{width:'100%',height:200,objectFit:'cover',borderRadius:6}} />
                <div className="play-overlay" onClick={(ev)=>{ ev.stopPropagation(); if (onSelectWork) onSelectWork(c.id, c.media_type === 'tv' ? 'tv' : 'movie'); }}>
                  <div className="play-circle"><div className="play-triangle"/></div>
                </div>
              </div>
              <div style={{fontSize:13,fontWeight:700,marginTop:6}}>{c.title || c.name}</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>{c.media_type}</div>
            </div>
          ))}
        </div>
      </div>
    </Box>
  );
}
