import React, { useEffect, useState } from "react";
import { Spinner } from "@chakra-ui/react";
import { fetchTMDB } from "../utils/tmdbClient";
import HeroBanner from './components/HeroBanner';
import Row from './components/Row';
import ContinueWatching from './components/ContinueWatching';

export default function HomeGrid({ onSelectMovie, onPlayMovie, selectedTmdbId, selectedGenre, isModalOpen }: { onSelectMovie?: (tmdbId: number, type?:'movie'|'tv') => void, onPlayMovie?: (tmdbId: number, type?:'movie'|'tv') => void, selectedTmdbId?: number | null, selectedGenre?: number | '' , isModalOpen?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<any | null>(null);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [top10, setTop10] = useState<any[]>([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const pop = await fetchTMDB('movie/popular');
        const rated = await fetchTMDB('movie/top_rated');
        const popularList = (pop.results || []);
        const ratedList = (rated.results || []);
        const filterByGenre = (list: any[]) => {
          if (!selectedGenre) return list;
          return list.filter(m => Array.isArray(m.genre_ids) ? m.genre_ids.includes(selectedGenre as number) : true);
        }
        const primaryPopular = filterByGenre(popularList);
        const primaryRated = filterByGenre(ratedList);

        // We'll allocate feeds with strict deduplication and fill to exactly 10 items each.
        const desired = 10;

        const sources: Record<string, any[]> = {
          top10: primaryPopular.slice(),
          popular: primaryPopular.slice(),
          becauseYouWatched: [],
          topRated: primaryRated.slice(),
        };

        // becauseYouWatched - try to fetch recommendations if we have last selected
        try{
          const last = await (window as any).database.getPersonalization('last_selected_movie');
          if (last) {
            const rec = await fetchTMDB(`movie/${last}/recommendations`);
            sources.becauseYouWatched = (rec.results || []).slice();
          }
        }catch(e){ /* ignore */ }

        // helper to allocate without duplicates
        const used = new Set<number>();
        const allocate = (list: any[], count: number) => {
          const out: any[] = [];
          for (const m of list) {
            if (!m || typeof m.id === 'undefined') continue;
            if (used.has(m.id)) continue;
            out.push(m);
            used.add(m.id);
            if (out.length >= count) break;
          }
          return out;
        }

        // initial allocation from preferred sources
        const top10Allocated = allocate(sources.top10, desired);
        const popularAllocated = allocate(sources.popular, desired);
        const becauseAllocated = allocate(sources.becauseYouWatched, desired);
        const ratedAllocated = allocate(sources.topRated, desired);

        // fallback pool: merge all remaining items from sources in order
        const fallbackPool: any[] = [];
        for (const k of ['top10','popular','becauseYouWatched','topRated']) {
          for (const m of sources[k]) {
            if (m && m.id && !used.has(m.id)) fallbackPool.push(m);
          }
        }

        // if still short, try fetching more popular pages up to a limit
        let extraPage = 2;
        const maxExtraPages = 3;
        while ((top10Allocated.length < desired || popularAllocated.length < desired || becauseAllocated.length < desired || ratedAllocated.length < desired) && extraPage <= maxExtraPages) {
          try {
            const more = await fetchTMDB('movie/popular', { page: extraPage });
            const moreList = filterByGenre(more.results || []);
            for (const m of moreList) {
              if (m && m.id && !used.has(m.id)) fallbackPool.push(m);
            }
          } catch (e) {
            break;
          }
          extraPage++;
        }

        // fill up each feed from fallback pool while respecting dedupe
        const takeFromFallback = (arr: any[], count: number) => {
          while (arr.length < count && fallbackPool.length > 0) {
            const candidate = fallbackPool.shift();
            if (!candidate || used.has(candidate.id)) continue;
            arr.push(candidate);
            used.add(candidate.id);
          }
        }

        takeFromFallback(top10Allocated, desired);
        takeFromFallback(popularAllocated, desired);
        takeFromFallback(becauseAllocated, desired);
        takeFromFallback(ratedAllocated, desired);

        // set state (slice to desired to be safe)
        setTop10(top10Allocated.slice(0, desired));
        setPopular(popularAllocated.slice(0, desired));
        setBecauseYouWatched(becauseAllocated.slice(0, desired));
        setTopRated(ratedAllocated.slice(0, desired));
        setFeatured((primaryPopular[0]) || null);
        // because you watched -> if last_selected_movie exists, fetch recommendations
        try{
          const last = await (window as any).database.getPersonalization('last_selected_movie');
          if (last) {
            const rec = await fetchTMDB(`movie/${last}/recommendations`);
            setBecauseYouWatched(rec.results?.slice(0,20) || []);
          }
        }catch(e){/* ignore */}
      } catch (err) {
        console.error('Failed to load movie sections:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedGenre]);

  return (
    <>
      {featured && <HeroBanner movie={featured} onPlay={onPlayMovie || onSelectMovie} onMore={onSelectMovie} fullBleed isModalOpen={isModalOpen} />}

      <div className="app-shell">
        {loading && <Spinner />}

        <Row title="Top 10" movies={top10} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />
        <Row title="Popular on JStream" movies={popular} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />
        {becauseYouWatched.length > 0 && <Row title="Because you watched" movies={becauseYouWatched} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />}
        <Row title="Top Rated" movies={topRated} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />

        <div className="bottom-nav">
          <button>Home</button>
          <button>Coming Soon</button>
          <button>Downloads</button>
          <button>Search</button>
        </div>
      </div>
    </>
  );
}
