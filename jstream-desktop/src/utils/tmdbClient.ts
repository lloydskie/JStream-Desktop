import { getPlayerConfig } from "../utils/remoteConfig";

export async function fetchTMDB(endpoint: string, params: Record<string, string | number> = {}) {
  // Prefer using the main-process TMDB proxy when available (keeps API key out of renderer and enables caching/rate-limits)
  try {
    if ((window as any).tmdb && (window as any).tmdb.request) {
      const res = await (window as any).tmdb.request(endpoint, params || {});
      if (res && res.error) throw new Error(res.error);
      return res;
    }
  } catch (e) {
    console.warn('tmdb proxy failed, falling back to direct fetch:', e);
  }

  // Fallback: direct client-side call (used in tests or if preload unavailable)
  const config = await getPlayerConfig();
  const apiKey = config.tmdbApiKey;
  const TMDB_BASE_URL = "https://api.themoviedb.org/3";
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);
  // If no API key is available, return an empty result set instead of attempting the network call
  if (!apiKey) {
    console.warn('TMDB API key missing; returning empty results for', endpoint);
    return { results: [] };
  }
  url.searchParams.append("api_key", apiKey);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, String(value));
  });
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }
  return response.json();
}
