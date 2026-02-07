import React, { useRef, useState, useEffect } from 'react';
import RowScroller from './RowScroller';

/**
 * A horizontal scrollable row of circular actor avatars.
 * Clicking an avatar navigates to the person's profile page.
 */
export default function ActorCircleRow({ title, actors, onSelectPerson }: {
  title: string;
  actors: { id: number; name: string; profile_path: string | null; known_for_department?: string }[];
  onSelectPerson?: (personId: number) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [pagerIndex, setPagerIndex] = useState(0);
  const [pagerCount, setPagerCount] = useState(0);

  if (!actors || actors.length === 0) return null;

  return (
    <div className="row-container actor-circle-row">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="row-title">{title}</div>
        <div style={{ marginLeft: 'auto' }}>
          <div className="row-page-indicator-inline" aria-hidden>
            <div className="bar-list">
              {Array.from({ length: pagerCount }).map((_, i) => (
                <svg key={i} className={`bar ${i === pagerIndex ? 'active' : ''}`} width="28" height="6" viewBox="0 0 28 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                  <rect width="28" height="6" rx="0" fill="currentColor" />
                </svg>
              ))}
            </div>
          </div>
        </div>
      </div>
      <RowScroller
        scrollerRef={scrollerRef}
        className="actor-circle-scroll"
        disableWheel={true}
        showPager={false}
        onPageChange={(idx, count) => { setPagerIndex(idx); setPagerCount(count); }}
        itemCount={actors.length}
        itemsPerPage={8}
      >
        {actors.map((actor) => (
          <div
            key={actor.id}
            className="actor-circle-item"
            role="button"
            tabIndex={0}
            onClick={() => onSelectPerson && onSelectPerson(actor.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSelectPerson && onSelectPerson(actor.id); }}
            title={actor.name}
          >
            <div className="actor-circle-avatar">
              {actor.profile_path ? (
                <img
                  src={`https://image.tmdb.org/t/p/w185${actor.profile_path}`}
                  alt={actor.name}
                  loading="lazy"
                />
              ) : (
                <div className="actor-circle-placeholder">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="8" r="4" fill="rgba(255,255,255,0.4)" />
                    <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" fill="rgba(255,255,255,0.4)" />
                  </svg>
                </div>
              )}
            </div>
            <div className="actor-circle-name">{actor.name}</div>
          </div>
        ))}
      </RowScroller>
    </div>
  );
}
