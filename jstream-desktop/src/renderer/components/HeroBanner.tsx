import React from 'react';

export default function HeroBanner({ movie, onPlay, onMore }: { movie?: any, onPlay?: (id:number, type?:'movie'|'tv')=>void, onMore?: (id:number, type?:'movie'|'tv')=>void }) {
  if (!movie) return null;
  const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : (movie.poster_path ? `https://image.tmdb.org/t/p/original${movie.poster_path}` : undefined);
  return (
    <section className="hero-banner" style={{backgroundImage: `url(${backdrop})`}}>
      <div className="hero-overlay">
        <div className="hero-content">
          <h1 className="hero-title">{movie.title}</h1>
          <p className="hero-overview">{movie.overview}</p>
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
