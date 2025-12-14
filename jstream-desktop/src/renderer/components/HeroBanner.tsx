import React, { useEffect, useState } from 'react';
import { fetchTMDB } from '../../utils/tmdbClient';

export default function HeroBanner({ movie, onPlay, onMore }: { movie?: any, onPlay?: (id:number, type?:'movie'|'tv')=>void, onMore?: (id:number, type?:'movie'|'tv')=>void }) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [trailerError, setTrailerError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setTrailerKey(null);
    setTrailerError(null);
    if (!movie?.id) return;

    // Dev override: set `window.__DEV_TRAILER_KEY = 'YOUTUBE_KEY'` in DevTools to force a trailer
    const devKey = (window as any).__DEV_TRAILER_KEY;
    if (devKey) {
      console.debug('HeroBanner: using dev override trailer key');
      setTrailerKey(String(devKey));
      return () => { mounted = false; };
    }

    // Dev override: set `window.__DEV_TMDB_RESPONSE = {...}` to simulate TMDb /videos response
    const devResp = (window as any).__DEV_TMDB_RESPONSE;
    if (devResp) {
      console.debug('HeroBanner: using dev TMDb response override', devResp);
      const data = devResp;
      const results: any[] = data?.results || [];
      // reuse selection logic from below
      const typePriority = ['Trailer','Teaser','Featurette','Clip','Behind the Scenes','Bloopers'];
      let chosen: any = null;
      for (const t of typePriority) {
        const candidates = results.filter((v:any) => v.type === t);
        if (candidates.length === 0) continue;
        chosen = candidates.find((v:any) => v.official === true) || candidates[0];
        break;
      }
      if (!chosen && results.length > 0) chosen = results[0];
      if (!chosen) {
        console.debug('HeroBanner(dev): no videos in provided response', { results });
        setTrailerError('No videos available (dev override)');
        return () => { mounted = false; };
      }
      const site = (chosen.site || '').toLowerCase();
      const key = chosen.key;
      if (!key) { setTrailerError('Selected video missing key (dev override)'); return () => { mounted = false; }; }
      if (site === 'youtube') setTrailerKey(key);
      else if (site === 'vimeo') setTrailerKey(`vimeo:${key}`);
      else setTrailerError(`Video available on ${chosen.site} (not embeddable)`);
      return () => { mounted = false; };
    }

    async function loadTrailer() {
      try {
        const data = await fetchTMDB(`movie/${movie.id}/videos`, { language: 'en-US' });
        console.debug('HeroBanner: TMDb videos response', data);
        if (!mounted) return;
        const results: any[] = data?.results || [];

        // Choose best available video by type priority, prefer official if available
        const typePriority = ['Trailer','Teaser','Featurette','Clip','Behind the Scenes','Bloopers'];
        let chosen: any = null;
        for (const t of typePriority) {
          const candidates = results.filter(v => v.type === t);
          if (candidates.length === 0) continue;
          chosen = candidates.find(v => v.official === true) || candidates[0];
          break;
        }
        // fallback: any video at all
        if (!chosen && results.length > 0) chosen = results[0];

        if (!chosen) {
          console.debug('HeroBanner: no videos at all in TMDb response', { results });
          setTrailerError('No videos available');
          return;
        }

        // Build embed URL for supported sites
        const site = (chosen.site || '').toLowerCase();
        const key = chosen.key;
        if (!key) {
          console.debug('HeroBanner: chosen video has no key', { chosen });
          setTrailerError('Selected video missing key');
          return;
        }

        if (site === 'youtube') {
          setTrailerKey(key);
        } else if (site === 'vimeo') {
          // embed vimeo via iframe src
          setTrailerKey(`vimeo:${key}`);
        } else {
          console.debug('HeroBanner: found video on unsupported site', { site, chosen });
          setTrailerError(`Video available on ${chosen.site} (not embeddable)`);
        }
      } catch (e) {
        console.error('HeroBanner: failed to load trailer', e);
        setTrailerError('Failed to load trailer — check TMDb API key/network');
      }
    }

    loadTrailer();
    return () => { mounted = false; }
  }, [movie?.id]);

  if (!movie) return null;
  const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : (movie.poster_path ? `https://image.tmdb.org/t/p/original${movie.poster_path}` : undefined);
  return (
    <section className="hero-banner" style={{backgroundImage: `url(${backdrop})`}}>
      <div className="hero-overlay">
        {/* autoplaying, muted trailer placed behind the hero content */}
        <div className="hero-trailer" aria-hidden={!!trailerKey ? 'false' : 'true'}>
          {trailerKey && (
            trailerKey.startsWith('vimeo:') ? (
              <iframe
                src={`https://player.vimeo.com/video/${trailerKey.replace('vimeo:', '')}?autoplay=1&muted=1&loop=1&background=1`}
                title="Trailer"
                frameBorder="0"
                allow="autoplay; encrypted-media"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?rel=0&autoplay=1&mute=1&controls=0&playsinline=1&modestbranding=1&loop=1&playlist=${trailerKey}`}
                title="Trailer"
                frameBorder="0"
                allow="autoplay; encrypted-media"
                allowFullScreen
                loading="lazy"
              />
            )
          )}
        </div>

        <div className="hero-content">
          <h1 className="hero-title">{movie.title}</h1>
          <p className="hero-overview">{movie.overview}</p>
          {trailerError && (
            <div className="hero-trailer-fallback" role="status">Trailer unavailable</div>
          )}
          <div className="hero-actions">
            <button className="play-cta" onClick={() => onPlay && onPlay(movie.id, 'movie')}>Play</button>
            <button className="fav-btn" onClick={async () => { try { await (window as any).database.favoritesAdd(String(movie.id), 'movie'); } catch(e){} }} aria-label={`Favorite ${movie.title}`}>Favorite</button>
            <button className="fav-btn" onClick={() => onMore && onMore(movie.id, 'movie')} aria-label={`More info ${movie.title}`}>More Info</button>
          </div>
        </div>
      </div>
    </section>
  )
}
