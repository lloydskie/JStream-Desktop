import React, { useEffect, useState } from 'react';
import { Spinner } from '@chakra-ui/react';
import { fetchTMDB } from '../utils/tmdbClient';
import Row from './components/Row';

// Helper to get date strings
function getDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  return new Date(d.setDate(diff));
}

function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  return new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
}

export default function NewPopularPage({ 
  onSelectMovie, 
  onPlayMovie 
}: { 
  onSelectMovie?: (id: number, type?: 'movie' | 'tv') => void, 
  onPlayMovie?: (id: number | string, type?: 'movie' | 'tv', params?: Record<string, any>) => void 
}) {
  const [loading, setLoading] = useState(true);
  const [newOnStreaming, setNewOnStreaming] = useState<any[]>([]);
  const [top10TV, setTop10TV] = useState<any[]>([]);
  const [top10Movies, setTop10Movies] = useState<any[]>([]);
  const [comingThisWeek, setComingThisWeek] = useState<any[]>([]);
  const [comingNextWeek, setComingNextWeek] = useState<any[]>([]);
  const [worthTheWait, setWorthTheWait] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const today = new Date();
        const thisWeekStart = getStartOfWeek(today);
        const thisWeekEnd = getEndOfWeek(today);
        const nextWeekStart = new Date(thisWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const nextWeekEnd = new Date(thisWeekEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
        const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Fetch all data in parallel
        const [
          newStreamingRes,
          trendingTVRes,
          trendingMoviesRes,
          thisWeekRes,
          nextWeekRes,
          worthWaitRes
        ] = await Promise.all([
          // 1. New on Streaming (Netflix provider ID = 8)
          fetchTMDB('discover/movie', {
            with_watch_providers: '8',
            watch_region: 'PH',
            sort_by: 'release_date.desc',
            page: 1
          }),
          // 2. Top 10 TV Shows (trending daily)
          fetchTMDB('trending/tv/day', { region: 'PH' }),
          // 3. Top 10 Movies (trending daily)
          fetchTMDB('trending/movie/day', { region: 'PH' }),
          // 4. Coming This Week
          fetchTMDB('discover/movie', {
            region: 'PH',
            'primary_release_date.gte': getDateString(thisWeekStart),
            'primary_release_date.lte': getDateString(thisWeekEnd),
            sort_by: 'popularity.desc'
          }),
          // 5. Coming Next Week
          fetchTMDB('discover/movie', {
            region: 'PH',
            'primary_release_date.gte': getDateString(nextWeekStart),
            'primary_release_date.lte': getDateString(nextWeekEnd),
            sort_by: 'popularity.desc'
          }),
          // 6. Worth the Wait (30+ days ahead, high popularity)
          fetchTMDB('discover/movie', {
            region: 'PH',
            'primary_release_date.gte': getDateString(futureDate),
            sort_by: 'popularity.desc'
          })
        ]);

        // Process results
        setNewOnStreaming((newStreamingRes?.results || []).slice(0, 20).map((m: any) => ({ ...m, _media: 'movie' })));
        setTop10TV((trendingTVRes?.results || []).slice(0, 10).map((t: any) => ({ ...t, _media: 'tv' })));
        setTop10Movies((trendingMoviesRes?.results || []).slice(0, 10).map((m: any) => ({ ...m, _media: 'movie' })));
        setComingThisWeek((thisWeekRes?.results || []).slice(0, 20).map((m: any) => ({ ...m, _media: 'movie' })));
        setComingNextWeek((nextWeekRes?.results || []).slice(0, 20).map((m: any) => ({ ...m, _media: 'movie' })));
        setWorthTheWait((worthWaitRes?.results || []).slice(0, 20).map((m: any) => ({ ...m, _media: 'movie' })));

      } catch (err) {
        console.error('Failed to load New & Popular data:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400, paddingTop: 200 }}>
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="new-popular-page" style={{ paddingTop: 200, paddingBottom: 100 }}>
      {/* New on Streaming */}
      {newOnStreaming.length > 0 && (
        <Row
          title="New on JStream"
          movies={newOnStreaming}
          onSelect={onSelectMovie}
          onPlay={onPlayMovie}
        />
      )}

      {/* Top 10 TV Shows */}
      {top10TV.length > 0 && (
        <Row
          title="Top 10 TV Shows in the Philippines Today"
          movies={top10TV}
          onSelect={onSelectMovie}
          onPlay={onPlayMovie}
        />
      )}

      {/* Top 10 Movies */}
      {top10Movies.length > 0 && (
        <Row
          title="Top 10 Movies in the Philippines Today"
          movies={top10Movies}
          onSelect={onSelectMovie}
          onPlay={onPlayMovie}
        />
      )}

      {/* Coming This Week */}
      {comingThisWeek.length > 0 && (
        <Row
          title="Coming This Week"
          movies={comingThisWeek}
          onSelect={onSelectMovie}
          onPlay={onPlayMovie}
        />
      )}

      {/* Coming Next Week */}
      {comingNextWeek.length > 0 && (
        <Row
          title="Coming Next Week"
          movies={comingNextWeek}
          onSelect={onSelectMovie}
          onPlay={onPlayMovie}
        />
      )}

      {/* Worth the Wait */}
      {worthTheWait.length > 0 && (
        <Row
          title="Worth the Wait"
          movies={worthTheWait}
          onSelect={onSelectMovie}
          onPlay={onPlayMovie}
        />
      )}
    </div>
  );
}
