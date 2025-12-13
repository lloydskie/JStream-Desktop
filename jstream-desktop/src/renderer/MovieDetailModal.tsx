import React, { useEffect, useState } from 'react';
import { Box, Button, Spinner } from '@chakra-ui/react';
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

  if (!tmdbId) return <div>Select a movie to view details.</div>;
  if (loading) return <Spinner />;
  if (!movie) return <div>Movie not found.</div>;

  return (
    <div className="detail-hero">
      <img className="detail-poster" src={movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined} alt={movie.title} />
      <div className="detail-info">
        <div className="detail-title">{movie.title}</div>
        <div className="detail-meta">{movie.release_date} • {movie.runtime ? movie.runtime + 'm' : ''} • Rating {movie.vote_average}/10</div>
        <div className="detail-overview">{movie.overview}</div>
        <div style={{marginTop:16}}>
          {onPlay && <Button colorScheme="red" onClick={() => onPlay(tmdbId)}>Play Movie</Button>}
        </div>
      </div>
    </div>
  );
}
