import React, { useEffect, useState } from 'react';
import { SimpleGrid, Box, Text, Image, Spinner, Button, HStack } from '@chakra-ui/react';
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
    <div>
      <h2>Account Page</h2>
      <p>Your profile, preferences and favorites.</p>
      <div>
        <h3>Favorites</h3>
        {loading && <Spinner />}
        <SimpleGrid columns={[1, 2, 3]} spacing={4}>
          {favorites.map((movie, idx) => (
            <Box key={movie.id} borderWidth={1} borderRadius="md" p={2}>
              <Image src={movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : undefined} alt={movie.title} />
              <Text fontWeight='bold'>{movie.title}</Text>
              <HStack mt={2} spacing={2}>
                <Button colorScheme='yellow' size='sm' onClick={() => handleSwap(movie.dbId, 'up')} isDisabled={idx === 0}>Move Up</Button>
                <Button colorScheme='yellow' size='sm' onClick={() => handleSwap(movie.dbId, 'down')} isDisabled={idx === favorites.length - 1}>Move Down</Button>
                <Button colorScheme='red' size='sm' onClick={() => handleRemove(movie.id)}>Remove</Button>
              </HStack>
            </Box>
          ))}
        </SimpleGrid>
      </div>
    </div>
  );
}
