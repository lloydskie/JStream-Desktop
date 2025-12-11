import React, { useEffect, useState } from 'react';
import { Box, Text, Image, Button, Spinner } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';

export default function MovieDetailModal({ tmdbId, onPlay }: { tmdbId?: number | null, onPlay?: (tmdbId: number) => void }) {
  // Movie Detail Modal
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (!tmdbId) return;
      setLoading(true);
      try {
        const data = await fetchTMDB(`movie/${tmdbId}`);
        setMovie(data);
      } catch (err) {
        console.error('Failed to fetch movie details:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [tmdbId]);

  if (!tmdbId) return <Text>Select a movie to view details.</Text>;
  if (loading) return <Spinner />;
  if (!movie) return <Text>Movie not found.</Text>;

  return (
    <Box>
      <Image src={movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : undefined} alt={movie.title} mb={4} />
      <Text fontSize="xl" fontWeight="bold" mb={2}>{movie.title}</Text>
      <Text mb={2}><strong>Release Date:</strong> {movie.release_date}</Text>
      <Text mb={2}><strong>Rating:</strong> {movie.vote_average}/10</Text>
      <Text mb={4}>{movie.overview}</Text>
      {onPlay && <Button colorScheme="blue" onClick={() => onPlay(tmdbId)}>Play Movie</Button>}
    </Box>
  );
}
