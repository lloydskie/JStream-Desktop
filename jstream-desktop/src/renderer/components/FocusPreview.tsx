import React from 'react';

export default function FocusPreview({ movie, style, onPlay }: { movie: any | null, style?: React.CSSProperties, onPlay?: (id:number)=>void }){
  if (!movie) return null;
  const backdrop = movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : (movie.poster_path ? `https://image.tmdb.org/t/p/w300${movie.poster_path}` : undefined);
  return (
    <div className="focus-preview" style={style} role="dialog" aria-hidden={!movie}>
      {backdrop && <img src={backdrop} alt={movie.title} className="focus-preview-backdrop" />}
      <div className="focus-preview-meta">
        <div className="fp-title">{movie.title}</div>
        <div className="fp-overview">{movie.overview}</div>
        <div style={{marginTop:8}}>
          <button className="play-cta small" onClick={()=> onPlay && onPlay(movie.id)}>Play</button>
        </div>
      </div>
    </div>
  )
}
