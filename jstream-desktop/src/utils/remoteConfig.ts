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
      defaultColor: '8B5CF6',
      enableOverlay: true,
      enableEpisodeSelector: true,
      enableAutoplayNext: true,
    };
  }
}

export function buildVideasyUrl(config: any, type: "movie" | "tv", params: Record<string, string | number | boolean>) {
  let url = "";
  // allow params to explicitly request features (params take precedence over remote config)
  const color = (params && (params.color as string)) || config.defaultColor;
  const wantOverlay = !!((params && params.overlay) ?? config.enableOverlay);
  const wantEpisodeSelector = !!((params && params.episodeSelector) ?? config.enableEpisodeSelector);
  const wantAutoplayNext = !!((params && params.autoplayNextEpisode) ?? config.enableAutoplayNext);
  if (type === "movie") {
    url = `${config.movieBaseUrl}${params.tmdbId}?color=${color}`;
    if (wantOverlay) url += "&overlay=true";
    // support start progress (seconds)
    if (params && params.progress) url += `&progress=${params.progress}`;
  }
  if (type === "tv") {
    url = `${config.tvBaseUrl}${params.tmdbId}/${params.season}/${params.episode}?color=${color}`;
    if (wantOverlay) url += "&overlay=true";
    if ((params && params.nextEpisode) || false) url += "&nextEpisode=true";
    if (wantEpisodeSelector) url += "&episodeSelector=true";
    if (wantAutoplayNext) url += "&autoplayNextEpisode=true";
    if (params && params.progress) url += `&progress=${params.progress}`;
  }
  // 'anime' player is intentionally unsupported. Only 'movie' and 'tv' are built here.
  return url;
}
