import React, { useEffect, useState } from 'react';
import { Spinner, Button } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';

export default function AccountPage() {
  const [favorites, setFavorites] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const rows: any[] = await (window as any).database.favoritesList();
        const movies = [];
        for (const r of rows) {
          if (r && r.item_id) {
            const data = await fetchTMDB(`movie/${r.item_id}`);
            movies.push({ dbId: r.id, sortOrder: r.sort_order ?? 0, ...data });
          }
        }
        // Sort by sortOrder
        movies.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setFavorites(movies);
      } catch (e) {
        console.error('Failed to load favorite movies:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleRemove(movieId: number) {
    try {
      await (window as any).database.favoritesRemove(String(movieId), 'movie');
      setFavorites(prev => prev.filter(m => m.id !== movieId));
    } catch (e) { console.error('Failed to remove favorite', e); }
  }

  async function handleSwap(dbId: number, direction: 'up' | 'down') {
    try {
      // find current index for dbId
      const idx = favorites.findIndex(f => f.dbId === dbId);
      if (idx === -1) return;
      const swapWithIndex = direction === 'up' ? idx - 1 : idx + 1;
      if (swapWithIndex < 0 || swapWithIndex >= favorites.length) return;
      const other = favorites[swapWithIndex];
      const current = favorites[idx];
      await (window as any).database.favoritesSwap(current.dbId, other.dbId);
      // Refresh favorites list by re-running the original logic: call db again
      const rows: any[] = await (window as any).database.favoritesList();
      const movies = [];
      for (const r of rows) {
        if (r && r.item_id) {
          const data = await fetchTMDB(`movie/${r.item_id}`);
          movies.push({ dbId: r.id, sortOrder: r.sort_order ?? 0, ...data });
        }
      }
      movies.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      setFavorites(movies);
    } catch (e) { console.error('Failed to swap favorites', e); }
  }

  return (
    <div className="app-shell">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:20,fontWeight:700,color:'var(--muted)'}}>Account</div>
      </div>
      <div>
        <h3 style={{marginBottom:12}}>Favorites</h3>
        {loading && <Spinner />}
        <div className="movie-grid">
          {favorites.map((movie, idx) => (
            <div key={movie.id} className="movie-card">
              <div style={{display:'flex', gap:12}}>
                <img className="movie-poster" style={{width:120,height:160}} src={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : undefined} alt={movie.title} />
                <div style={{flex:1}}>
                  <div style={{fontWeight:700}}>{movie.title}</div>
                  <div style={{marginTop:8}}>
                    <Button colorScheme='yellow' size='sm' onClick={() => handleSwap(movie.dbId, 'up')} isDisabled={idx === 0}>Move Up</Button>
                    <Button colorScheme='yellow' size='sm' onClick={() => handleSwap(movie.dbId, 'down')} isDisabled={idx === favorites.length - 1} style={{marginLeft:8}}>Move Down</Button>
                    <Button colorScheme='red' size='sm' onClick={() => handleRemove(movie.id)} style={{marginLeft:8}}>Remove</Button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
