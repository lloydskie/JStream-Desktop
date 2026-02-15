import React, { useEffect, useState } from "react";
import { Spinner } from "@chakra-ui/react";
import { fetchTMDB } from "../utils/tmdbClient";
import { getKidsMode } from "../utils/kidsFilter";
import HeroBanner from './components/HeroBanner';
import Row from './components/Row';
import ContinueWatching from './components/ContinueWatching';
import ActorCircleRow from './components/ActorCircleRow';
import type { CategoryDef } from './CategoryPage';

export default function HomeGrid({ onSelectMovie, onPlayMovie, selectedTmdbId, selectedGenre, isModalOpen, onSetFeatured, onSelectPerson, onExploreCategory }: { onSelectMovie?: (tmdbId: number, type?:'movie'|'tv') => void, onPlayMovie?: (tmdbId: number, type?:'movie'|'tv') => void, selectedTmdbId?: number | null, selectedGenre?: number | '' , isModalOpen?: boolean, onSetFeatured?: (movie: any) => void, onSelectPerson?: (personId: number) => void, onExploreCategory?: (cat: CategoryDef) => void }) {
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<any | null>(null);
  const [popular, setPopular] = useState<any[]>([]);
  const [topRated, setTopRated] = useState<any[]>([]);
  const [top10, setTop10] = useState<any[]>([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState<any[]>([]);
  const [lastSelectedTitle, setLastSelectedTitle] = useState<string | null>(null);
  const [hasRecentWatches, setHasRecentWatches] = useState(false);
  const [seasonalRows, setSeasonalRows] = useState<{ title: string; movies: any[]; params: Record<string, any> }[]>([]);
  const [starringRows, setStarringRows] = useState<{ title: string; movies: any[] }[]>([]);
  // New content rows
  const [popularActors, setPopularActors] = useState<{ id: number; name: string; profile_path: string | null }[]>([]);
  const [shortHits, setShortHits] = useState<any[]>([]);
  const [usDramas, setUsDramas] = useState<any[]>([]);
  const [chineseShows, setChineseShows] = useState<any[]>([]);
  const [kDramas, setKDramas] = useState<any[]>([]);
  const [japaneseShows, setJapaneseShows] = useState<any[]>([]);
  const [romanticKorean, setRomanticKorean] = useState<any[]>([]);
  const [awardDocs, setAwardDocs] = useState<any[]>([]);

  // Custom category explore view state
  type CategoryDef = {
    key: string;
    title: string;
    endpoint: string;
    params: Record<string, string | number>;
    mediaType: 'movie' | 'tv';
  };
  const CATEGORY_DEFS: CategoryDef[] = [
    { key: 'short-hits', title: 'In a Hurry? Try These 30-Minute Hits', endpoint: 'discover/tv', params: { 'with_runtime.lte': 30, sort_by: 'popularity.desc', 'vote_count.gte': 20 }, mediaType: 'tv' },
    { key: 'us-dramas', title: 'US TV Dramas', endpoint: 'discover/tv', params: { with_origin_country: 'US', with_genres: '18', sort_by: 'popularity.desc', 'vote_count.gte': 100 }, mediaType: 'tv' },
    { key: 'chinese-shows', title: 'Mainland Chinese TV Shows', endpoint: 'discover/tv', params: { with_origin_country: 'CN', with_original_language: 'zh', sort_by: 'popularity.desc', 'vote_count.gte': 10 }, mediaType: 'tv' },
    { key: 'k-dramas', title: 'International TV Dramas', endpoint: 'discover/tv', params: { with_origin_country: 'KR', with_original_language: 'ko', with_genres: '18', sort_by: 'popularity.desc', 'vote_count.gte': 20 }, mediaType: 'tv' },
    { key: 'japanese-shows', title: 'Exciting Japanese TV Shows', endpoint: 'discover/tv', params: { with_origin_country: 'JP', with_original_language: 'ja', sort_by: 'popularity.desc', 'vote_count.gte': 20 }, mediaType: 'tv' },
    { key: 'romantic-korean', title: 'Romantic Korean TV Shows', endpoint: 'discover/tv', params: { with_origin_country: 'KR', with_original_language: 'ko', with_genres: '10749', sort_by: 'popularity.desc', 'vote_count.gte': 10 }, mediaType: 'tv' },
    { key: 'award-docs', title: 'Award-Winning Documentaries', endpoint: 'discover/movie', params: { with_genres: '99', 'vote_average.gte': 7, sort_by: 'vote_average.desc', 'vote_count.gte': 200 }, mediaType: 'movie' },
  ];
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

        // becauseYouWatched - use the most recently watched item from recent_watches
        let becauseWatchedId: number | null = null;
        let becauseWatchedType: 'movie' | 'tv' = 'movie';
        try {
          const db = (window as any).database;
          if (db && typeof db.recentWatchesGet === 'function') {
            const recentList = await db.recentWatchesGet();
            const movieIds: number[] = (recentList && Array.isArray(recentList.movie)) ? recentList.movie : [];
            const tvIds: number[] = (recentList && Array.isArray(recentList.tv)) ? recentList.tv : [];
            // Find the most recently watched by checking watch_history timestamps
            let bestId: number | null = null;
            let bestType: 'movie' | 'tv' = 'movie';
            let bestTime = 0;
            const checkCandidate = async (id: number, type: 'movie' | 'tv') => {
              try {
                if (db && typeof db.watchHistoryGet === 'function') {
                  const entry = await db.watchHistoryGet(`${type}:${id}`);
                  if (entry && entry.watched_at) {
                    const t = new Date(entry.watched_at).getTime();
                    if (t > bestTime) { bestTime = t; bestId = id; bestType = type; }
                  }
                }
              } catch (e) { /* ignore */ }
            };
            // Check top few from each list (most recent are first)
            for (const id of movieIds.slice(0, 5)) await checkCandidate(id, 'movie');
            for (const id of tvIds.slice(0, 5)) await checkCandidate(id, 'tv');
            // If no watch_history timestamp found, just use the first available ID
            if (!bestId) {
              if (movieIds.length > 0) { bestId = movieIds[0]; bestType = 'movie'; }
              else if (tvIds.length > 0) { bestId = tvIds[0]; bestType = 'tv'; }
            }
            becauseWatchedId = bestId;
            becauseWatchedType = bestType;
          }
        } catch (e) { /* ignore */ }
        if (becauseWatchedId) {
          try {
            const rec = await fetchTMDB(`${becauseWatchedType}/${becauseWatchedId}/recommendations`);
            sources.becauseYouWatched = (rec.results || []).slice();
          } catch (e) { /* ignore */ }
        }

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
        // Randomly select a featured item from the top 10 that has an available YouTube video
        const top10ForHero = top10Allocated.slice(0, desired);
        // Shuffle the array to randomize selection order
        const shuffled = [...top10ForHero].sort(() => Math.random() - 0.5);
        
        // Helper to check if a YouTube video is actually available
        // Uses noembed.com which properly returns errors for unavailable videos
        const isYouTubeVideoAvailable = async (videoKey: string): Promise<boolean> => {
          try {
            const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoKey}`);
            if (!response.ok) return false;
            const data = await response.json();
            // noembed returns error field for unavailable videos
            return !data.error && data.title;
          } catch {
            return false;
          }
        };
        
        let feat: any = null;
        for (const candidate of shuffled) {
          if (!candidate?.id) continue;
          try {
            const videos = await fetchTMDB(`movie/${candidate.id}/videos`, { language: 'en-US' });
            const results = videos?.results || [];
            // Find YouTube videos with preferred types
            const youtubeVideos = results.filter((v: any) => 
              (v.site || '').toLowerCase() === 'youtube' && 
              v.key && 
              ['Trailer', 'Teaser', 'Featurette', 'Clip'].includes(v.type)
            );
            // Check if any YouTube video is actually available
            for (const video of youtubeVideos) {
              const isAvailable = await isYouTubeVideoAvailable(video.key);
              if (isAvailable) {
                feat = candidate;
                break;
              }
            }
            if (feat) break;
          } catch (e) {
            // skip this candidate on error
          }
        }
        // Fallback to first item if none have available YouTube videos
        if (!feat) feat = shuffled[0] || primaryPopular[0] || null;
        setFeatured(feat);
        onSetFeatured && onSetFeatured(feat);
        // Refresh becauseYouWatched with the resolved most-recent-watched item
        if (becauseWatchedId) {
          try {
            const rec = await fetchTMDB(`${becauseWatchedType}/${becauseWatchedId}/recommendations`);
            setBecauseYouWatched(rec.results?.slice(0, 20) || []);
          } catch (e) { /* ignore */ }
        }
      } catch (err) {
        console.error('Failed to load movie sections:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedGenre]);

  // Resolve the last selected movie/tv title for the "Because you watched" header
  // AND check if user has actual recent watches
  useEffect(() => {
    (async () => {
      try {
        // Check for recent watches first
        const db = (window as any).database;
        let hasRecent = false;

        // Check recentWatchesGet
        try {
          if (db && typeof db.recentWatchesGet === 'function') {
            const recentList = await db.recentWatchesGet();
            if (Array.isArray(recentList) && recentList.length > 0) {
              hasRecent = true;
            } else if (recentList && typeof recentList === 'object') {
              const movieIds = Array.isArray(recentList.movie) ? recentList.movie : [];
              const tvIds = Array.isArray(recentList.tv) ? recentList.tv : [];
              if (movieIds.length > 0 || tvIds.length > 0) hasRecent = true;
            }
          }
        } catch (e) { /* ignore */ }

        // Also check watchHistoryList as fallback
        if (!hasRecent) {
          try {
            if (db && typeof db.watchHistoryList === 'function') {
              const history = await db.watchHistoryList();
              if (Array.isArray(history) && history.length > 0) hasRecent = true;
            }
          } catch (e) { /* ignore */ }
        }

        setHasRecentWatches(hasRecent);

        // Find the most recently watched item to resolve its title
        let recentId: number | null = null;
        let recentType: 'movie' | 'tv' = 'movie';
        try {
          if (db && typeof db.recentWatchesGet === 'function') {
            const recentList = await db.recentWatchesGet();
            const movieIds: number[] = (recentList && Array.isArray(recentList.movie)) ? recentList.movie : [];
            const tvIds: number[] = (recentList && Array.isArray(recentList.tv)) ? recentList.tv : [];
            let bestTime = 0;
            const check = async (id: number, type: 'movie' | 'tv') => {
              try {
                if (db && typeof db.watchHistoryGet === 'function') {
                  const entry = await db.watchHistoryGet(`${type}:${id}`);
                  if (entry && entry.watched_at) {
                    const t = new Date(entry.watched_at).getTime();
                    if (t > bestTime) { bestTime = t; recentId = id; recentType = type; }
                  }
                }
              } catch (e) { /* ignore */ }
            };
            for (const id of movieIds.slice(0, 5)) await check(id, 'movie');
            for (const id of tvIds.slice(0, 5)) await check(id, 'tv');
            if (!recentId) {
              if (movieIds.length > 0) { recentId = movieIds[0]; recentType = 'movie'; }
              else if (tvIds.length > 0) { recentId = tvIds[0]; recentType = 'tv'; }
            }
          }
        } catch (e) { /* ignore */ }

        if (!recentId) {
          setLastSelectedTitle(null);
          return;
        }

        // Fetch the title of the most recently watched item
        try {
          const details = await fetchTMDB(`${recentType}/${recentId}`);
          if (details && (details.title || details.name)) {
            setLastSelectedTitle(details.title || details.name || null);
            return;
          }
        } catch (e) { /* ignore */ }

        setLastSelectedTitle(null);
      } catch (e) {
        setLastSelectedTitle(null);
      }
    })();
  }, []);

  // Seasonal / Holiday rows based on current date
  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1; // 1-12
        const day = now.getDate();

        // Define seasonal windows and their TMDB discover parameters
        type SeasonalDef = { title: string; keywords?: string; genres?: string; query?: string; from: [number, number]; to: [number, number] };
        const seasonalDefs: SeasonalDef[] = [
          { title: "Christmas Special", keywords: '207317,258322', from: [12, 1], to: [12, 31] },
          { title: "New Year's Special", keywords: '293005,6593', from: [12, 26], to: [1, 7] },
          { title: "Valentine's Special", keywords: '818,15060', genres: '10749', from: [2, 1], to: [2, 20] },
          { title: "St. Patrick's Day", keywords: '6075', from: [3, 10], to: [3, 20] },
          { title: "Easter Special", keywords: '167030,14526', from: [3, 20], to: [4, 25] },
          { title: "Halloween Special", keywords: '3335,224636', genres: '27', from: [10, 1], to: [11, 2] },
          { title: "Thanksgiving Special", keywords: '186371,271600', from: [11, 15], to: [11, 30] },
          { title: "Spooky Season", keywords: '3335,224636', genres: '27,53', from: [10, 1], to: [10, 31] },
          { title: "Summer Blockbusters", genres: '28,12', from: [6, 1], to: [8, 31] },
          { title: "Spring Romance", genres: '10749', from: [3, 1], to: [5, 31] },
        ];

        // Check which seasonal defs match the current date
        const isInRange = (def: SeasonalDef): boolean => {
          const [fromM, fromD] = def.from;
          const [toM, toD] = def.to;
          const cur = month * 100 + day;
          const from = fromM * 100 + fromD;
          const to = toM * 100 + toD;
          // Handle wrap-around (e.g., Dec 26 - Jan 7)
          if (from <= to) return cur >= from && cur <= to;
          return cur >= from || cur <= to;
        };

        const activeSeasons = seasonalDefs.filter(isInRange);
        const rows: { title: string; movies: any[]; params: Record<string, any> }[] = [];

        for (const season of activeSeasons.slice(0, 3)) { // Max 3 seasonal rows
          try {
            let results: any[] = [];
            let fetchParams: Record<string, any> = {};
            if (season.keywords || season.genres) {
              fetchParams = {
                sort_by: 'popularity.desc',
                'vote_count.gte': 50,
              };
              if (season.keywords) fetchParams.with_keywords = season.keywords;
              if (season.genres) fetchParams.with_genres = season.genres;
              const data = await fetchTMDB('discover/movie', fetchParams);
              results = (data.results || []).slice(0, 15);
            }
            if (results.length > 0) {
              rows.push({ title: season.title, movies: results, params: fetchParams });
            }
          } catch (e) {
            // Skip failed seasonal fetch
          }
        }

        setSeasonalRows(rows);
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  // "Starring {person}" row — picks a random notable cast member from the user's
  // most recently watched movie or show. Uses watchHistoryList() (sorted by
  // watched_at DESC) so the row always reflects the actual most recent watch.
  // Re-runs each time the component mounts (e.g. navigating back to Home).
  const [starringRefreshKey] = useState(() => Date.now()); // unique per mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = (window as any).database;
        // Collect recent entries in true chronological order (most recent first)
        const recentEntries: { id: number; type: 'movie' | 'tv' }[] = [];
        const seenIds = new Set<string>();

        // PREFER watchHistoryList() — already sorted by watched_at DESC
        try {
          if (db && typeof db.watchHistoryList === 'function') {
            const history = await db.watchHistoryList();
            if (Array.isArray(history)) {
              for (const h of history.slice(0, 20)) {
                const itemId = String(h?.item_id ?? '');
                if (!itemId || seenIds.has(itemId)) continue;
                seenIds.add(itemId);
                if (itemId.includes(':')) {
                  const [type, idStr] = itemId.split(':');
                  recentEntries.push({ id: Number(idStr), type: (type === 'tv' ? 'tv' : 'movie') });
                } else {
                  recentEntries.push({ id: Number(itemId), type: 'movie' });
                }
              }
            }
          }
        } catch (e) { /* ignore */ }

        // Fallback to recentWatchesGet() only if watchHistoryList had nothing
        if (recentEntries.length === 0) {
          try {
            if (db && typeof db.recentWatchesGet === 'function') {
              const recentList = await db.recentWatchesGet();
              if (Array.isArray(recentList)) {
                for (const id of recentList.slice(0, 10)) {
                  recentEntries.push({ id: Number(id), type: 'movie' });
                }
              } else if (recentList && typeof recentList === 'object') {
                const movieIds = Array.isArray(recentList.movie) ? recentList.movie : [];
                const tvIds = Array.isArray(recentList.tv) ? recentList.tv : [];
                const maxLen = Math.max(movieIds.length, tvIds.length);
                for (let i = 0; i < maxLen && recentEntries.length < 10; i++) {
                  if (i < movieIds.length) recentEntries.push({ id: Number(movieIds[i]), type: 'movie' });
                  if (i < tvIds.length) recentEntries.push({ id: Number(tvIds[i]), type: 'tv' });
                }
              }
            }
          } catch (e) { /* ignore */ }
        }

        if (recentEntries.length === 0 || cancelled) {
          setStarringRows([]);
          return;
        }

        // Start from the MOST RECENT watch and find an actor from its actual cast
        const rows: { title: string; movies: any[] }[] = [];

        for (const entry of recentEntries.slice(0, 6)) {
          if (rows.length >= 1 || cancelled) break; // Only 1 starring row
          try {
            // Fetch the ACTUAL cast of this specific movie/show
            const credits = await fetchTMDB(`${entry.type}/${entry.id}/credits`);
            const cast = (credits.cast || []).filter(
              (c: any) => c.id && c.known_for_department === 'Acting' && c.popularity > 1
            );
            if (cast.length === 0) continue;

            // Shuffle cast so a random actor is picked each time
            const shuffled = [...cast].sort(() => Math.random() - 0.5);

            for (const actor of shuffled.slice(0, 8)) {
              if (cancelled) break;
              try {
                // Fetch this actor's other works
                const personCredits = await fetchTMDB(`person/${actor.id}/combined_credits`);
                const otherWorks = (personCredits.cast || [])
                  .filter((w: any) => w.id !== entry.id && w.poster_path && (w.media_type === 'movie' || w.media_type === 'tv'))
                  .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
                  .slice(0, 15);

                if (otherWorks.length >= 3) {
                  rows.push({
                    title: `Starring ${actor.name}`,
                    movies: otherWorks
                  });
                  break; // Found a good actor, done
                }
              } catch (e) { /* skip */ }
            }
          } catch (e) { /* ignore */ }
        }

        if (!cancelled) setStarringRows(rows);
      } catch (e) {
        if (!cancelled) setStarringRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, [starringRefreshKey]);

  // Fetch data for the 8 new content rows
  useEffect(() => {
    let cancelled = false;

    // Helper: normalize discover/tv results so Row component recognizes them as TV
    // discover/tv returns `name` (not `title`) and omits `media_type`
    const tagTV = (results: any[]) =>
      (results || []).map((item: any) => ({
        ...item,
        title: item.title || item.name || item.original_name || '',
        media_type: 'tv',
        _media: 'tv',
      }));

    (async () => {
      try {
        const [
          actorsRes,
          shortRes,
          usRes,
          cnRes,
          krRes,
          jpRes,
          romKrRes,
          docsRes,
        ] = await Promise.all([
          fetchTMDB('person/popular').catch(() => ({ results: [] })),
          fetchTMDB('discover/tv', {
            'with_runtime.lte': 30,
            sort_by: 'popularity.desc',
            'vote_count.gte': 20,
          }).catch(() => ({ results: [] })),
          fetchTMDB('discover/tv', {
            with_origin_country: 'US',
            with_genres: '18',
            sort_by: 'popularity.desc',
            'vote_count.gte': 100,
          }).catch(() => ({ results: [] })),
          fetchTMDB('discover/tv', {
            with_origin_country: 'CN',
            with_original_language: 'zh',
            sort_by: 'popularity.desc',
            'vote_count.gte': 10,
          }).catch(() => ({ results: [] })),
          fetchTMDB('discover/tv', {
            with_origin_country: 'KR',
            with_original_language: 'ko',
            with_genres: '18',
            sort_by: 'popularity.desc',
            'vote_count.gte': 20,
          }).catch(() => ({ results: [] })),
          fetchTMDB('discover/tv', {
            with_origin_country: 'JP',
            with_original_language: 'ja',
            sort_by: 'popularity.desc',
            'vote_count.gte': 20,
          }).catch(() => ({ results: [] })),
          fetchTMDB('discover/tv', {
            with_origin_country: 'KR',
            with_original_language: 'ko',
            with_genres: '10749',
            sort_by: 'popularity.desc',
            'vote_count.gte': 10,
          }).catch(() => ({ results: [] })),
          fetchTMDB('discover/movie', {
            with_genres: '99',
            'vote_average.gte': 7,
            sort_by: 'vote_average.desc',
            'vote_count.gte': 200,
          }).catch(() => ({ results: [] })),
        ]);

        if (cancelled) return;

        setPopularActors(
          (actorsRes.results || [])
            .filter((a: any) => a.id && a.name && a.profile_path)
            .slice(0, 20)
        );
        setShortHits(tagTV(shortRes.results).slice(0, 15));
        setUsDramas(tagTV(usRes.results).slice(0, 15));
        setChineseShows(tagTV(cnRes.results).slice(0, 15));
        setKDramas(tagTV(krRes.results).slice(0, 15));
        setJapaneseShows(tagTV(jpRes.results).slice(0, 15));
        setRomanticKorean(tagTV(romKrRes.results).slice(0, 15));
        setAwardDocs((docsRes.results || []).slice(0, 15));
      } catch (e) {
        console.error('Failed to load new content rows:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <div className="app-shell">
        {loading && <Spinner />}

        <Row title="Top 10 Movies in the Philippines Today" movies={top10} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />
        <Row title="Popular on JStream" movies={popular} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />
        {/* Only show "Because you watched" if user has actual recent watches */}
        {hasRecentWatches && becauseYouWatched.length > 0 && <Row title={lastSelectedTitle ? `Because you watched ${lastSelectedTitle}` : 'Because you watched'} movies={becauseYouWatched} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />}
        {/* Starring {person} rows based on recently watched cast */}
        {starringRows.map((row, idx) => (
          <Row key={`starring-${idx}`} title={row.title} movies={row.movies} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />
        ))}
        <Row title="Top Rated" movies={topRated} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} />
        {/* Seasonal / Holiday rows */}
        {seasonalRows.map((row, idx) => (
          <Row key={`seasonal-${idx}`} title={row.title} movies={row.movies} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.({ key: `seasonal-${idx}`, title: row.title, endpoint: 'discover/movie', params: row.params, mediaType: 'movie' })} />
        ))}
        {/* Popular Actors This Week */}
        {popularActors.length > 0 && (
          <ActorCircleRow title="Popular Actors This Week" actors={popularActors} onSelectPerson={onSelectPerson || (() => {})} />
        )}
        {/* In a Hurry? Try These 30-Minute Hits */}
        {shortHits.length > 0 && (
          <Row title="In a Hurry? Try These 30-Minute Hits" movies={shortHits} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.(CATEGORY_DEFS.find(c => c.key === 'short-hits')!)} />
        )}
        {/* US TV Dramas — hidden for kids (Drama is conditional) */}
        {!getKidsMode() && usDramas.length > 0 && (
          <Row title="US TV Dramas" movies={usDramas} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.(CATEGORY_DEFS.find(c => c.key === 'us-dramas')!)} />
        )}
        {/* Mainland Chinese TV Shows */}
        {chineseShows.length > 0 && (
          <Row title="Mainland Chinese TV Shows" movies={chineseShows} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.(CATEGORY_DEFS.find(c => c.key === 'chinese-shows')!)} />
        )}
        {/* International TV Dramas (K-Dramas) — hidden for kids */}
        {!getKidsMode() && kDramas.length > 0 && (
          <Row title="International TV Dramas" movies={kDramas} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.(CATEGORY_DEFS.find(c => c.key === 'k-dramas')!)} />
        )}
        {/* Exciting Japanese TV Shows */}
        {japaneseShows.length > 0 && (
          <Row title="Exciting Japanese TV Shows" movies={japaneseShows} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.(CATEGORY_DEFS.find(c => c.key === 'japanese-shows')!)} />
        )}
        {/* Romantic Korean TV Shows — hidden for kids */}
        {!getKidsMode() && romanticKorean.length > 0 && (
          <Row title="Romantic Korean TV Shows" movies={romanticKorean} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.(CATEGORY_DEFS.find(c => c.key === 'romantic-korean')!)} />
        )}
        {/* Award-Winning Documentaries — hidden for kids */}
        {!getKidsMode() && awardDocs.length > 0 && (
          <Row title="Award-Winning Documentaries" movies={awardDocs} backdropMode={true} onSelect={onSelectMovie || (()=>{})} onPlay={onPlayMovie || (()=>{})} onExplore={() => onExploreCategory?.(CATEGORY_DEFS.find(c => c.key === 'award-docs')!)} />
        )}

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
