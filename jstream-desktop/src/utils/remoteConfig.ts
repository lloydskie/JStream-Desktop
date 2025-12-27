import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import { app } from "../../firebase-config";

// Lazy-initialize Remote Config to avoid any SDK side-effects at module import time.
async function initRemoteConfig() {
  try {
    const remoteConfig = getRemoteConfig(app);
    // Keep a conservative fetch interval
    try { remoteConfig.settings.minimumFetchIntervalMillis = 3600000; } catch (e) { /* ignore */ }
    return remoteConfig;
  } catch (e) {
    return null;
  }
}

export async function getPlayerConfig() {
  try {
    // In Electron's renderer the app may have a restrictive Content-Security-Policy
    // that prevents the Firebase SDK from performing installation/auth fetches.
    // Those fetch attempts happen inside `fetchAndActivate()` and are noisy
    // (they produce repeated console errors). By default we *do not* attempt
    // Remote Config network fetches when running inside Electron unless a
    // developer explicitly opts in by setting `window.__JSTREAM_ENABLE_REMOTE_CONFIG = true`.
    const isProbablyElectron = typeof navigator !== 'undefined' && typeof navigator.userAgent === 'string' && /Electron/.test(navigator.userAgent);
    const allowRemoteConfig = (typeof window !== 'undefined' && (window as any).__JSTREAM_ENABLE_REMOTE_CONFIG) === true;
    if (isProbablyElectron && !allowRemoteConfig) {
      // Skip initializing/fetching remote config to avoid CSP-failed network calls.
      // Fall through to return defaults below.
    } else {
      const remoteConfig = await initRemoteConfig();
      if (remoteConfig) {
        try { await fetchAndActivate(remoteConfig); } catch (e) { /* swallow fetch errors */ }
        try {
          return {
            tmdbApiKey: getValue(remoteConfig, "tmdb_api_key").asString(),
            movieBaseUrl: getValue(remoteConfig, "videasy_movie_base_url").asString(),
            tvBaseUrl: getValue(remoteConfig, "videasy_tv_base_url").asString(),
            defaultColor: getValue(remoteConfig, "videasy_default_color").asString(),
            enableOverlay: getValue(remoteConfig, "videasy_enable_overlay").asBoolean(),
            enableEpisodeSelector: getValue(remoteConfig, "videasy_enable_episodeSelector").asBoolean(),
            enableAutoplayNext: getValue(remoteConfig, "videasy_enable_autoplayNext").asBoolean(),
          };
        } catch (e) {
          // fall through to defaults
        }
      }
    }
    // Fallback defaults so the UI continues to render
    return {
      tmdbApiKey: '49787128da94b3585b21dac5c4a92fcc',
      movieBaseUrl: 'https://player.videasy.net/movie/',
      tvBaseUrl: 'https://player.videasy.net/tv/',
      defaultColor: '8B5CF6',
      enableOverlay: true,
      enableEpisodeSelector: true,
      enableAutoplayNext: true,
    };
  } catch (err) {
    // Ensure callers always get defaults on unexpected errors
    return {
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
    // If a specific season/episode are provided and look numeric, include them in the path.
    // Otherwise fall back to a show-level URL that allows the player to present an episode selector.
    const seasonRaw = params && (params.season as any);
    const episodeRaw = params && (params.episode as any);
    const seasonNum = seasonRaw == null ? null : Number(seasonRaw);
    const episodeNum = episodeRaw == null ? null : Number(episodeRaw);
    if (seasonNum != null && !Number.isNaN(seasonNum) && episodeNum != null && !Number.isNaN(episodeNum)) {
      url = `${config.tvBaseUrl}${params.tmdbId}/${seasonNum}/${episodeNum}?color=${color}`;
    } else {
      url = `${config.tvBaseUrl}${params.tmdbId}?color=${color}`;
    }
    if (wantOverlay) url += "&overlay=true";
    if ((params && params.nextEpisode) || false) url += "&nextEpisode=true";
    if (wantEpisodeSelector) url += "&episodeSelector=true";
    if (wantAutoplayNext) url += "&autoplayNextEpisode=true";
    if (params && params.progress) url += `&progress=${params.progress}`;
  }
  // 'anime' player is intentionally unsupported. Only 'movie' and 'tv' are built here.
  return url;
}
