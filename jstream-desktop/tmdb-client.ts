// tmdb-client.ts
import { firebaseConfig } from './firebase-config';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function getTMDBApiKey(): string {
  // Expect TMDB API key to be stored in firebaseConfig as tmdbApiKey
  if (!('tmdbApiKey' in firebaseConfig) || !firebaseConfig.tmdbApiKey) {
    throw new Error('TMDB API key not found in firebaseConfig. Please add tmdbApiKey to your firebase-config.ts');
  }
  return firebaseConfig.tmdbApiKey;
}

export async function fetchFromTMDB(endpoint: string, params: Record<string, string> = {}) {
  const apiKey = getTMDBApiKey();
  const url = new URL(`${TMDB_BASE_URL}/${endpoint}`);
  url.searchParams.append('api_key', apiKey);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.append(key, value);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }
  return response.json();
}
