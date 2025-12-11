import React, { useEffect, useState } from "react";
import { SimpleGrid, Box, Text, Image, Spinner, Button, Badge, IconButton } from "@chakra-ui/react";
import { fetchTMDB } from "../utils/tmdbClient";

export default function HomeGrid({ onSelectMovie, selectedTmdbId }: { onSelectMovie?: (tmdbId: number) => void, selectedTmdbId?: number | null }) {
  // HomeGrid
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchTMDB("movie/popular");
        setMovies(data.results || []);
      } catch (err) {
        console.error('Failed to load popular movies:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const rows: any[] = await (window as any).database.favoritesList();
        const map: Record<string, boolean> = {};
        rows.forEach(r => { if (r && r.item_id) map[r.item_id] = true; });
        setFavorites(map);
      } catch (e) {
        console.error('Failed to load favorites', e);
      }
    })();
  }, []);

  return (
    <Box>
      <Text fontSize="2xl" mb={4}>Popular Movies</Text>
      {loading && <Spinner />}
      {movies.length === 0 && !loading ? (
        <Box p={6} borderWidth={1} borderRadius="md">
          <Text fontSize="xl">Welcome to JStream</Text>
          <Text mt={2}>Browse popular movies or use search to find titles.</Text>
        </Box>
      ) : (
        <SimpleGrid columns={[1, 2, 3, 4]} spacing={4}>
          {movies.map(movie => {
            const selected = selectedTmdbId === movie.id;
            return (
              <Box
                key={movie.id}
                borderWidth={selected ? 2 : 1}
                borderColor={selected ? 'blue.400' : 'gray.200'}
                borderRadius="md"
                p={2}
                bg={selected ? 'blue.50' : 'white'}
                cursor={onSelectMovie ? 'pointer' : 'default'}
                tabIndex={0}
                role="button"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && onSelectMovie) onSelectMovie(movie.id);
                  if (e.key === 'f') {
                    try {
                      if (favorites[movie.id]) {
                        await (window as any).database.favoritesRemove(String(movie.id), 'movie');
                        setFavorites(prev => ({ ...prev, [movie.id]: false }));
                      } else {
                        await (window as any).database.favoritesAdd(String(movie.id), 'movie');
                        setFavorites(prev => ({ ...prev, [movie.id]: true }));
                      }
                    } catch (err) { console.error('Failed to toggle favorite', err); }
                  }
                }}
              >
                <Image src={movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : undefined} alt={movie.title} mb={2} />
                <Text fontWeight="bold">{movie.title}</Text>
                <Text fontSize="sm">{movie.release_date}</Text>
                <Text noOfLines={2}>{movie.overview}</Text>
                <Box display='flex' gap={2} alignItems='center' mt={2}>
                  {onSelectMovie && <Button colorScheme="blue" onClick={() => onSelectMovie(movie.id)} aria-label={'Play ' + movie.title}>Play</Button>}
                  <IconButton
                    aria-label={'Favorite ' + movie.title}
                    icon={<span style={{fontSize: 14}}>★</span>}
                    aria-pressed={!!favorites[movie.id]}
                    colorScheme={favorites[movie.id] ? 'yellow' : 'gray'}
                    onClick={async () => {
                      try {
                        if (favorites[movie.id]) {
                          await (window as any).database.favoritesRemove(String(movie.id), 'movie');
                          setFavorites(prev => ({ ...prev, [movie.id]: false }));
                        } else {
                          await (window as any).database.favoritesAdd(String(movie.id), 'movie');
                          setFavorites(prev => ({ ...prev, [movie.id]: true }));
                        }
                      } catch (e) { console.error('Failed to toggle favorite', e); }
                    }}
                  />
                  {selected && <Badge>Now Playing</Badge>}
                </Box>
              </Box>
            );
          })}
        </SimpleGrid>
      )}
    </Box>
  );
}
