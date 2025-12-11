import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import { app } from "../../firebase-config";

const remoteConfig = getRemoteConfig(app);
remoteConfig.settings.minimumFetchIntervalMillis = 3600000; // 1 hour

export async function getPlayerConfig() {
  try {
    await fetchAndActivate(remoteConfig);
    return {
      tmdbApiKey: getValue(remoteConfig, "tmdb_api_key").asString(),
      movieBaseUrl: getValue(remoteConfig, "videasy_movie_base_url").asString(),
      tvBaseUrl: getValue(remoteConfig, "videasy_tv_base_url").asString(),
      animeBaseUrl: getValue(remoteConfig, "videasy_anime_base_url").asString(),
      defaultColor: getValue(remoteConfig, "videasy_default_color").asString(),
      enableOverlay: getValue(remoteConfig, "videasy_enable_overlay").asBoolean(),
      enableEpisodeSelector: getValue(remoteConfig, "videasy_enable_episodeSelector").asBoolean(),
      enableAutoplayNext: getValue(remoteConfig, "videasy_enable_autoplayNext").asBoolean(),
    };
  } catch (err) {
    console.error('Remote Config fetch failed, using defaults:', err);
    // Fallback defaults so the UI continues to render
    return {
      // Values taken from provided Remote Config export
      tmdbApiKey: '49787128da94b3585b21dac5c4a92fcc',
      movieBaseUrl: 'https://player.videasy.net/movie/',
      tvBaseUrl: 'https://player.videasy.net/tv/',
      animeBaseUrl: 'https://player.videasy.net/anime/',
      defaultColor: '8B5CF6',
      enableOverlay: true,
      enableEpisodeSelector: true,
      enableAutoplayNext: true,
    };
  }
}

export function buildVideasyUrl(config: any, type: "movie" | "tv" | "anime", params: Record<string, string | number | boolean>) {
  let url = "";
  if (type === "movie") {
    url = `${config.movieBaseUrl}${params.tmdbId}?color=${config.defaultColor}`;
    if (config.enableOverlay) url += "&overlay=true";
  }
  if (type === "tv") {
    url = `${config.tvBaseUrl}${params.tmdbId}/${params.season}/${params.episode}?color=${config.defaultColor}`;
    if (config.enableOverlay) url += "&overlay=true";
    if (config.enableEpisodeSelector) url += "&episodeSelector=true";
    if (config.enableAutoplayNext) url += "&autoplayNextEpisode=true";
  }
  if (type === "anime") {
    url = `${config.animeBaseUrl}${params.anilistId}/${params.episode}?color=${config.defaultColor}`;
    if (params.dub) url += "&dub=true";
    if (config.enableOverlay) url += "&overlay=true";
  }
  return url;
}
