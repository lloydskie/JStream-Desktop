import React, { useEffect, useState, useRef } from 'react';
import { Box, Button, Spinner } from '@chakra-ui/react';
import DownloadModal from './DownloadModal';
import { fetchTMDB } from '../utils/tmdbClient';

export default function MovieDetailModal({ tmdbId, onPlay }: { tmdbId?: number | null, onPlay?: (tmdbId: number) => void }) {
  // Movie Detail Modal
  const [movie, setMovie] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const isHoveringRef = useRef(false);
  const [showDownload, setShowDownload] = useState(false);

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

  // Pause hero trailer when hovering over this modal
  function pauseHero() {
    try {
      const ctrl = (window as any).__appTrailerController;
      if (ctrl && typeof ctrl.pause === 'function') ctrl.pause();
      else window.dispatchEvent(new CustomEvent('app:pause-hero-trailer'));
    } catch (e) { window.dispatchEvent(new CustomEvent('app:pause-hero-trailer')); }
  }

  // Resume hero trailer when hover ends (unless another modal is open)
  function resumeHero() {
    try {
      // Don't resume background hero if a details modal is open
      if ((window as any).__heroModalOpen) return;
      const ctrl = (window as any).__appTrailerController;
      if (ctrl && typeof ctrl.resume === 'function') ctrl.resume();
      else window.dispatchEvent(new CustomEvent('app:resume-hero-trailer'));
    } catch (e) { window.dispatchEvent(new CustomEvent('app:resume-hero-trailer')); }
  }

  function handleMouseEnter() {
    isHoveringRef.current = true;
    pauseHero();
  }

  function handleMouseLeave() {
    isHoveringRef.current = false;
    resumeHero();
  }

  // Cleanup: resume hero if component unmounts while hovering
  useEffect(() => {
    return () => {
      if (isHoveringRef.current) {
        resumeHero();
      }
    };
  }, []);

  if (!tmdbId) return <div>Select a movie to view details.</div>;
  if (loading) return <Spinner />;
  if (!movie) return <div>Movie not found.</div>;

  return (
    <div className="detail-hero" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      <img className="detail-poster" src={movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined} alt={movie.title} />
      <div className="detail-info">
        <div className="detail-title">{movie.title}</div>
        <div className="detail-meta">{movie.release_date} • {movie.runtime ? movie.runtime + 'm' : ''} • Rating {movie.vote_average}/10</div>
        <div className="detail-overview">{movie.overview}</div>
        <div style={{marginTop:16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap'}}>
          {onPlay && <Button colorScheme="red" onClick={() => onPlay(tmdbId)}>Play Movie</Button>}
          <Button
            onClick={(e) => { e.stopPropagation(); setShowDownload(true); }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              color: '#fff', fontSize: 13, fontWeight: 600,
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            }}
            aria-label="Download"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 16l-5-5h3V4h4v7h3l-5 5z" fill="#fff"/>
              <path d="M20 18H4v2h16v-2z" fill="#fff"/>
            </svg>
            Download
          </Button>
        </div>
        {showDownload && tmdbId && (
          <DownloadModal
            tmdbId={tmdbId}
            mediaType="movie"
            title={movie.title || ''}
            onClose={() => setShowDownload(false)}
          />
        )}
      </div>
    </div>
  );
}
