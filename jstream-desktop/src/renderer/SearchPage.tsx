import React, { useState, useEffect } from "react";
import { Input, Button, SimpleGrid, Box, Text, Image, Spinner, Badge, IconButton } from "@chakra-ui/react";
import { fetchTMDB } from "../utils/tmdbClient";

export default function SearchPage({ onSelectMovie, selectedTmdbId }: { onSelectMovie?: (tmdbId: number) => void, selectedTmdbId?: number | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  async function handleSearch() {
    setLoading(true);
    try {
      const data = await fetchTMDB("search/movie", { query });
      setResults(data.results || []);
    } catch (err) {
      console.error('Search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

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
      <Text fontSize="2xl" mb={4}>Search Movies</Text>
      <Box display="flex" mb={4} gap={2}>
        <Input
          placeholder="Search for a movie..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch} colorScheme="blue">Search</Button>
      </Box>
      {loading && <Spinner />}
      <SimpleGrid columns={[1, 2, 3, 4]} spacing={4}>
        {results.map(movie => {
          const selected = selectedTmdbId === movie.id;
          return (
            <Box key={movie.id} borderWidth={selected ? 2 : 1} borderColor={selected ? 'blue.400' : 'gray.200'} borderRadius="md" p={2} bg={selected ? 'blue.50' : 'white'} cursor={onSelectMovie ? 'pointer' : 'default'} tabIndex={0} role="button" onKeyDown={async (e) => {
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
            }}>
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
    </Box>
  );
}
