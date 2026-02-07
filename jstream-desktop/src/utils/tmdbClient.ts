import { getPlayerConfig } from "../utils/remoteConfig";
import { filterResults, getKidsMode, isContentBlocked, getBlockReason } from "../utils/kidsFilter";

/**
 * Apply kids content filter to TMDB response data.
 * Filters `results` arrays (list endpoints) and blocks single items that are adult.
 */
function applyKidsFilter(data: any, endpoint: string): any {
  if (!getKidsMode()) return data;
  if (!data) return data;

  // For list endpoints (results array)
  if (Array.isArray(data.results)) {
    const before = data.results.length;
    data.results = filterResults(data.results);
    const after = data.results.length;
    if (before !== after) {
      console.log(`[KidsFilter] ${endpoint}: filtered ${before - after}/${before} items`);
    }
  }

  // For "parts" array (collection detail)
  if (Array.isArray(data.parts)) {
    data.parts = filterResults(data.parts);
  }

  // For "cast" / "crew" arrays (credits)
  if (Array.isArray(data.cast)) {
    data.cast = filterResults(data.cast);
  }

  // For single item detail endpoints (movie/123, tv/456)
  // Check if the top-level item itself is blocked
  const detailMatch = endpoint.match(/^(movie|tv)\/\d+$/);
  if (detailMatch && data) {
    if (isContentBlocked(data)) {
      const reason = getBlockReason(data);
      console.log(`[KidsFilter] BLOCKED detail ${endpoint}: ${reason}`);
      return null; // Block the entire item
    }
  }

  return data;
}

export async function fetchTMDB(endpoint: string, params: Record<string, string | number> = {}) {
  // When kids mode is active, always force include_adult=false for search/discover endpoints
  if (getKidsMode()) {
    if (endpoint.startsWith('search/') || endpoint.startsWith('discover/')) {
      params = { ...params, include_adult: 'false' };
    }

    // Hard-blocked genre IDs to exclude at the API level so they never arrive:
    // Horror(27), Thriller(53), Crime(80), War(10752), Western(37), Documentary(99)
    const hardBlockedGenreIds = '27,53,80,10752,37,99';

    // Discover movies: cert ≤ PG + exclude hard-blocked genres
    if (endpoint.startsWith('discover/movie')) {
      params = {
        ...params,
        'certification_country': 'US',
        'certification.lte': 'PG',
        'without_genres': hardBlockedGenreIds,
      };
    }

    // Discover TV: cert ≤ TV-PG + exclude hard-blocked genres (add TV War&Politics 10768)
    if (endpoint.startsWith('discover/tv')) {
      params = {
        ...params,
        'certification_country': 'US',
        'certification.lte': 'TV-PG',
        'without_genres': hardBlockedGenreIds + ',10768',
      };
    }
  }

  // Prefer using the main-process TMDB proxy when available (keeps API key out of renderer and enables caching/rate-limits)
  try {
    if ((window as any).tmdb && (window as any).tmdb.request) {
      const res = await (window as any).tmdb.request(endpoint, params || {});
      if (res && res.error) throw new Error(res.error);
      return applyKidsFilter(res, endpoint);
    }
  } catch (e) {
    try { if ((window as any).__JSTREAM_DEBUG) console.warn('tmdb proxy failed, falling back to direct fetch:', e); } catch (err) {}
  }

  // Fallback: direct client-side call (used in tests or if preload unavailable)
  const config = await getPlayerConfig();
  const apiKey = config.tmdbApiKey;
  const TMDB_BASE_URL = "https://api.themoviedb.org/3";
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);
  // If no API key is available, return an empty result set instead of attempting the network call
  if (!apiKey) {
    try { if ((window as any).__JSTREAM_DEBUG) console.warn('TMDB API key missing; returning empty results for', endpoint); } catch (err) {}
    return { results: [] };
  }
  url.searchParams.append("api_key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, String(value));
  });
  const response = await fetch(url.toString());
  if (!response.ok) {
    // Treat 404 (not found) as a non-exceptional case and return null so callers can handle missing items quietly.
    if (response.status === 404) return null;
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }
  try {
    const json = await response.json();
    return applyKidsFilter(json, endpoint);
  } catch (e) {
    try { if ((window as any).__JSTREAM_DEBUG) console.warn('tmdbClient: failed to parse JSON response', e); } catch (err) {}
    return null;
  }
}
