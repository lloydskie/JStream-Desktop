import { getPlayerConfig } from "../utils/remoteConfig";

export async function fetchTMDB(endpoint: string, params: Record<string, string | number> = {}) {
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
