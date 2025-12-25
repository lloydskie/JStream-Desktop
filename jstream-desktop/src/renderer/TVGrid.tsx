import React, { useEffect, useState } from "react";
import { Spinner } from "@chakra-ui/react";
import { fetchTMDB } from "../utils/tmdbClient";
import HeroBanner from './components/HeroBanner';
import Row from './components/Row';
import ContinueWatching from './components/ContinueWatching';

export default function TVGrid({ onSelectShow, onPlayShow, selectedTmdbId, selectedGenre, isModalOpen, onSetFeatured }: { onSelectShow?: (tmdbId: number, type?:'movie'|'tv') => void, onPlayShow?: (tmdbId: number, type?:'movie'|'tv') => void, selectedTmdbId?: number | null, selectedGenre?: number | '' , isModalOpen?: boolean, onSetFeatured?: (show: any) => void }) {
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<any | null>(null);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [top10, setTop10] = useState<any[]>([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState<any[]>([]);
  const [lastSelectedTitle, setLastSelectedTitle] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const pop = await fetchTMDB('tv/popular');
        const rated = await fetchTMDB('tv/top_rated');
        const popularList = (pop.results || []);
        const ratedList = (rated.results || []);
        const filterByGenre = (list: any[]) => {
          if (!selectedGenre) return list;
          return list.filter(m => Array.isArray(m.genre_ids) ? m.genre_ids.includes(selectedGenre as number) : true);
        }
        const primaryPopular = filterByGenre(popularList);
        const primaryRated = filterByGenre(ratedList);

        const desired = 10;

        const sources: Record<string, any[]> = {
          top10: primaryPopular.slice(),
          popular: primaryPopular.slice(),
          becauseYouWatched: [],
          topRated: primaryRated.slice(),
        };

        try{
          const last = await (window as any).database.getPersonalization('last_selected_movie');
          if (last) {
            const rec = await fetchTMDB(`tv/${last}/recommendations`);
            sources.becauseYouWatched = (rec.results || []).slice();
          }
        }catch(e){ /* ignore */ }

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

        const top10Allocated = allocate(sources.top10, desired);
        const popularAllocated = allocate(sources.popular, desired);
        const becauseAllocated = allocate(sources.becauseYouWatched, desired);
        const ratedAllocated = allocate(sources.topRated, desired);

        const fallbackPool: any[] = [];
        for (const k of ['top10','popular','becauseYouWatched','topRated']) {
          for (const m of sources[k]) {
            if (m && m.id && !used.has(m.id)) fallbackPool.push(m);
          }
        }

        let extraPage = 2;
        const maxExtraPages = 3;
        while ((top10Allocated.length < desired || popularAllocated.length < desired || becauseAllocated.length < desired || ratedAllocated.length < desired) && extraPage <= maxExtraPages) {
          try {
            const more = await fetchTMDB('tv/popular', { page: extraPage });
            const moreList = filterByGenre(more.results || []);
            for (const m of moreList) {
              if (m && m.id && !used.has(m.id)) fallbackPool.push(m);
            }
          } catch (e) {
            break;
          }
          extraPage++;
        }

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

        setTop10(top10Allocated.slice(0, desired));
        setPopular(popularAllocated.slice(0, desired));
        setBecauseYouWatched(becauseAllocated.slice(0, desired));
        setTopRated(ratedAllocated.slice(0, desired));
        const feat = (primaryPopular[0]) || null;
        setFeatured(feat);
        onSetFeatured && onSetFeatured(feat);
        try{
          const last = await (window as any).database.getPersonalization('last_selected_movie');
          if (last) {
            const rec = await fetchTMDB(`tv/${last}/recommendations`);
            setBecauseYouWatched(rec.results?.slice(0,20) || []);
          }
        }catch(e){/* ignore */}
      } catch (err) {
        console.error('Failed to load tv sections:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedGenre]);

  useEffect(() => {
    (async () => {
      try {
        const last = await (window as any).database.getPersonalization('last_selected_movie');
        if (!last) {
          setLastSelectedTitle(null);
          return;
        }
        try {
          const t = await fetchTMDB(`tv/${last}`);
          if (t && (t.name || t.title)) {
            setLastSelectedTitle(t.name || t.title || null);
            return;
          }
        } catch (e) { /* ignore */ }
        try {
          const m = await fetchTMDB(`movie/${last}`);
          if (m && (m.title || m.name)) {
            setLastSelectedTitle(m.title || m.name || null);
            return;
          }
        } catch (e) { /* ignore */ }
        setLastSelectedTitle(null);
      } catch (e) {
        setLastSelectedTitle(null);
      }
    })();
  }, []);

  return (
    <>
      <div className="app-shell">
        {loading && <Spinner />}

        <Row title="Top 10 TV Shows in the Philippines Today" movies={top10} onSelect={onSelectShow || (()=>{})} onPlay={onPlayShow || (()=>{})} />
        <Row title="Popular on JStream" movies={popular} backdropMode={true} onSelect={onSelectShow || (()=>{})} onPlay={onPlayShow || (()=>{})} />
        {becauseYouWatched.length > 0 && <Row title={lastSelectedTitle ? `Because you watched ${lastSelectedTitle}` : 'Because you watched'} movies={becauseYouWatched} backdropMode={true} onSelect={onSelectShow || (()=>{})} onPlay={onPlayShow || (()=>{})} />}
        <Row title="Top Rated" movies={topRated} backdropMode={true} onSelect={onSelectShow || (()=>{})} onPlay={onPlayShow || (()=>{})} />

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
