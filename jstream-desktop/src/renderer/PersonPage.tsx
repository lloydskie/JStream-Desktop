import React, { useEffect, useState, useMemo } from 'react';
import { Box, Spinner, Button } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';
import CustomSelect from './components/CustomSelect';

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Most Popular' },
  { value: 'popularity.asc', label: 'Least Popular' },
  { value: 'release_date.desc', label: 'Newest' },
  { value: 'release_date.asc', label: 'Oldest' },
  { value: 'vote_average.desc', label: 'Highest Rated' },
  { value: 'vote_average.asc', label: 'Lowest Rated' },
  { value: 'title.asc', label: 'Title A → Z' },
  { value: 'title.desc', label: 'Title Z → A' },
];

const MEDIA_TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

export default function PersonPage({ personId, onSelectWork, onBack }: { personId?: number | null, onSelectWork?: (id:number, type?:'movie'|'tv')=>void, onBack?: ()=>void }) {
  const [person, setPerson] = useState<any>(null);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<string>('popularity.desc');
  const [mediaFilter, setMediaFilter] = useState<string>('all');

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
        setCredits(unique);
      } catch (e) {
        console.error('Failed to load person data', e);
        setPerson(null); setCredits([]);
      } finally { setLoading(false); }
    })();
  }, [personId]);

  const sortedCredits = useMemo(() => {
    let list = credits;
    if (mediaFilter !== 'all') list = list.filter((c: any) => c.media_type === mediaFilter);
    const [field, dir] = sortBy.split('.');
    list = [...list].sort((a: any, b: any) => {
      let av: any, bv: any;
      if (field === 'popularity') { av = a.popularity || 0; bv = b.popularity || 0; }
      else if (field === 'release_date') { av = a.release_date || a.first_air_date || ''; bv = b.release_date || b.first_air_date || ''; }
      else if (field === 'vote_average') { av = a.vote_average || 0; bv = b.vote_average || 0; }
      else if (field === 'title') { av = (a.title || a.name || '').toLowerCase(); bv = (b.title || b.name || '').toLowerCase(); }
      else { av = a.popularity || 0; bv = b.popularity || 0; }
      if (av < bv) return dir === 'asc' ? -1 : 1;
      if (av > bv) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [credits, sortBy, mediaFilter]);

  if (!personId) return <Box p={6} pt="200px">No person selected.</Box>;
  if (loading) return <Box p={6} pt="200px"><Spinner /></Box>;
  if (!person) return <Box p={6} pt="200px">Person not found.</Box>;

  return (
    <Box p={6} pt="200px">
      {onBack && (
        <Button variant="ghost" className="back-btn" onClick={onBack} style={{marginBottom:12}}>← Back</Button>
      )}
      <div style={{display:'flex',gap:16}}>
        <img src={person.profile_path ? `https://image.tmdb.org/t/p/w300${person.profile_path}` : undefined} alt={person.name} style={{width:160,height:160,objectFit:'cover',borderRadius:'50%'}} />
        <div>
          <h2 style={{margin:0,fontSize:22}}>{person.name}</h2>
          <div style={{color:'var(--muted)',marginTop:6}}>{person.place_of_birth || ''} • Born {person.birthday || ''}</div>
          <div style={{marginTop:12}}>{person.biography || 'No biography available.'}</div>
        </div>
      </div>

      <div style={{marginTop:24}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12,flexWrap:'wrap'}}>
          <div style={{fontSize:18,fontWeight:700}}>Known For</div>
          <div style={{color:'var(--muted)',fontSize:13}}>({sortedCredits.length} credit{sortedCredits.length !== 1 ? 's' : ''})</div>
          <div style={{marginLeft:'auto',display:'flex',gap:8,flexWrap:'wrap'}}>
            <CustomSelect id="person-media-filter" value={mediaFilter} onChange={(v) => setMediaFilter(String(v))} placeholder="All" options={MEDIA_TYPE_OPTIONS} />
            <CustomSelect id="person-sort" value={sortBy} onChange={(v) => setSortBy(String(v))} placeholder="Sort By" options={SORT_OPTIONS} />
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12}}>
          {sortedCredits.map((c:any)=> (
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
