// Expose webview preload path
import { contextBridge, ipcRenderer } from 'electron';

ipcRenderer.invoke('get-webview-preload-path').then((preloadPath) => {
  contextBridge.exposeInMainWorld('webviewPreloadPath', preloadPath);
});
// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

// Adblock API exposed to renderer
contextBridge.exposeInMainWorld('adblock', {
  setEnabled: (enabled: boolean) => ipcRenderer.invoke('adblock-set-enabled', enabled),
  addRule: (rule: string) => ipcRenderer.invoke('adblock-add-rule', rule),
  addHost: (host: string) => ipcRenderer.invoke('adblock-add-host', host),
  addCosmetic: (selector: string) => ipcRenderer.invoke('adblock-add-cosmetic', selector),
  updateLists: (lines: string[]) => ipcRenderer.invoke('adblock-update-lists', lines),
  reloadLists: () => ipcRenderer.invoke('adblock-reload-lists'),
  stats: () => ipcRenderer.invoke('adblock-stats'),
  setPopupBlocking: (enabled: boolean) => ipcRenderer.invoke('adblock-set-popup-blocking', enabled),
});

// Cosmetic injection + MutationObserver
function injectCosmeticStyles(selectors: string[]) {
  try {
    let style = document.querySelector('style[data-adblock-cosmetic]') as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.dataset.adblockCosmetic = 'true';
      document.documentElement.appendChild(style);
    }
    const css = selectors.map(s => `${s} { display: none !important; visibility: hidden !important; }`).join('\n');
    style.textContent = css;
  } catch (e) {
    console.error('injectCosmeticStyles failed', e);
  }
}

function removeMatchingElements(selectors: string[]) {
  try {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        els.forEach(el => el.remove());
      } catch (e) {
        // ignore invalid selectors
      }
    }
  } catch (e) { console.error(e); }
}

// Fetch and inject cosmetic selectors as early as possible to avoid flicker.
let __adblock_selectors: string[] = [];
(async () => {
  try {
    const res = await ipcRenderer.invoke('adblock-get-cosmetics');
    const selectors: string[] = (res && res.cosmeticSelectors) || [];
    __adblock_selectors = selectors;
    if (selectors.length) injectCosmeticStyles(selectors);
    // run a MutationObserver to remove elements that match later
    const observer = new MutationObserver(() => removeMatchingElements(selectors));
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
    // also remove existing iframes that look like ads
    removeMatchingElements(selectors.concat(['iframe[src*="ads"]', 'iframe[src*="doubleclick"]', '[data-ad]']));
  } catch (e) {
    // ignore
  }
})();

window.addEventListener('DOMContentLoaded', async () => {
  try {
    // Ensure selectors were applied; if not, fetch and inject now
    if (!__adblock_selectors || __adblock_selectors.length === 0) {
      const res = await ipcRenderer.invoke('adblock-get-cosmetics');
      const selectors: string[] = (res && res.cosmeticSelectors) || [];
      if (selectors.length) injectCosmeticStyles(selectors);
      const observer = new MutationObserver(() => removeMatchingElements(selectors));
      observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
      removeMatchingElements(selectors.concat(['iframe[src*="ads"]', 'iframe[src*="doubleclick"]', '[data-ad]']));
    }
  } catch (e) {
    // ignore
  }
});

contextBridge.exposeInMainWorld('database', {
  setPersonalization: (key: string, value: string) => ipcRenderer.invoke('set-personalization', key, value),
  getPersonalization: (key: string) => ipcRenderer.invoke('get-personalization', key),
  favoritesAdd: (itemId: string, itemType: string) => ipcRenderer.invoke('favorites-add', itemId, itemType),
  favoritesRemove: (itemId: string, itemType: string) => ipcRenderer.invoke('favorites-remove', itemId, itemType),
  favoritesList: () => ipcRenderer.invoke('favorites-list'),
  favoritesIs: (itemId: string, itemType: string) => ipcRenderer.invoke('favorites-is', itemId, itemType),
  favoritesSwap: (idA: number, idB: number) => ipcRenderer.invoke('favorites-swap', idA, idB),
  favoritesSetOrder: (id: number, order: number) => ipcRenderer.invoke('favorites-set-order', id, order),
  watchHistorySet: (itemId: string, position: number) => ipcRenderer.invoke('watch-history-set', itemId, position),
  watchHistoryGet: (itemId: string) => ipcRenderer.invoke('watch-history-get', itemId),
  watchHistoryList: () => ipcRenderer.invoke('watch-history-list'),
  watchHistoryDelete: (itemId: string) => ipcRenderer.invoke('watch-history-delete', itemId),
  recentWatchesGet: () => ipcRenderer.invoke('recent-watches-get'),
  recentWatchesSet: (list: number[]) => ipcRenderer.invoke('recent-watches-set', list),
  recentWatchesAdd: (itemId: string | number) => ipcRenderer.invoke('recent-watches-add', itemId),
  recentWatchesRemove: (id: number, type: 'movie' | 'tv') => ipcRenderer.invoke('recent-watches-remove', id, type),
  tvProgressGet: (tmdbId: string) => ipcRenderer.invoke('tv-progress-get', tmdbId),
  tvProgressSet: (tmdbId: string, season: number, episode: number) => ipcRenderer.invoke('tv-progress-set', tmdbId, season, episode),
  tvProgressRemove: (tmdbId: string) => ipcRenderer.invoke('tv-progress-remove', tmdbId),
});

// Account management API
contextBridge.exposeInMainWorld('accounts', {
  list: () => ipcRenderer.invoke('accounts-list'),
  create: (accountInfo: { id: string; name: string; avatar: string; pin: string; isKid: boolean }, recoveryPin: string) => 
    ipcRenderer.invoke('accounts-create', accountInfo, recoveryPin),
  login: (accountId: string, pin: string) => ipcRenderer.invoke('accounts-login', accountId, pin),
  delete: (accountId: string) => ipcRenderer.invoke('accounts-delete', accountId),
  current: () => ipcRenderer.invoke('accounts-current'),
  setCurrent: (accountId: string | null) => ipcRenderer.invoke('accounts-set-current', accountId),
  logout: () => ipcRenderer.invoke('accounts-logout'),
  updateProfile: (accountId: string, updates: { name?: string; avatar?: string }) => 
    ipcRenderer.invoke('accounts-update-profile', accountId, updates),
  saveAvatar: (accountId: string, imageData: string) => 
    ipcRenderer.invoke('accounts-save-avatar', accountId, imageData),
  loadAvatar: (accountId: string) => ipcRenderer.invoke('accounts-load-avatar', accountId),
  resetPin: (accountId: string, recoveryPin: string, newPin: string) =>
    ipcRenderer.invoke('accounts-reset-pin', accountId, recoveryPin, newPin),
});

// Kids content filter API
contextBridge.exposeInMainWorld('kidsFilter', {
  isKid: () => ipcRenderer.invoke('kids-filter-isKid'),
  getAdultIds: () => ipcRenderer.invoke('kids-filter-getAdultIds'),
});

contextBridge.exposeInMainWorld('openExternal', {
  url: (u: string) => ipcRenderer.invoke('open-external-url', u),
});

contextBridge.exposeInMainWorld('network', {
  checkUrlHeaders: (u: string) => ipcRenderer.invoke('check-url-headers', u),
});

contextBridge.exposeInMainWorld('playerWindow', {
  open: (u: string) => ipcRenderer.invoke('open-player-window', u),
  close: () => ipcRenderer.invoke('close-player-windows'),
});

// BrowserView player API: create an overlay BrowserView attached to the app window
contextBridge.exposeInMainWorld('playerView', {
  create: (u: string, opts?: { bounds?: { x: number, y: number, width: number, height: number } }) => ipcRenderer.invoke('player-view-create', u, opts || {}),
  destroy: () => ipcRenderer.invoke('player-view-destroy'),
  setBounds: (b: { x: number, y: number, width: number, height: number }) => ipcRenderer.invoke('player-view-set-bounds', b),
});

// Events emitted by main about player view state (fullscreen changes)
contextBridge.exposeInMainWorld('playerViewEvents', {
  onFullscreenChange: (cb: (isFullscreen: boolean) => void) => {
    const listener = (_ev: any, val: any) => {
      try { cb(Boolean(val)); } catch (e) {}
    };
    ipcRenderer.on('player-view-fullscreen', listener);
    return () => { try { ipcRenderer.removeListener('player-view-fullscreen', listener); } catch (e) {} };
  },
  onFullscreenRequest: (cb: (url: string) => void) => {
    const listener = (_ev: any, url: string) => {
      try { cb(url); } catch (e) {}
    };
    ipcRenderer.on('player-view-fullscreen-request', listener);
    return () => { try { ipcRenderer.removeListener('player-view-fullscreen-request', listener); } catch (e) {} };
  }
});

// Ensure any open player BrowserView is destroyed when the renderer is unloaded/reloaded
try {
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try { ipcRenderer.invoke('player-view-destroy'); } catch (e) { }
    });
  }
} catch (e) {
  // ignore
}

// TMDB proxy exposed to renderer. Use IPC so the API key stays in main process.
contextBridge.exposeInMainWorld('tmdb', {
  request: (endpoint: string, params?: Record<string, any>) => ipcRenderer.invoke('tmdb-request', endpoint, params || {}),
});

// Expose TMDB exports API (collections feed) — main process will download and decompress daily export
contextBridge.exposeInMainWorld('tmdbExports', {
  fetchCollectionsFeed: (opts?: { tryDays?: number, page?: number, perPage?: number }) => ipcRenderer.invoke('tmdb-exports-getCollectionsFeed', opts || {}),
});

// Safe TMDB helper API: fetch missing details from main (keeps API key in main process)
contextBridge.exposeInMainWorld('tmdbApi', {
  fetchDetails: (id: number, media_type: string = 'movie') => ipcRenderer.invoke('fetch-details', { id, media_type }),
  imageUrl: (posterPath: string | null, size: string = 'w185') => {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
  }
});

// Window controls API for frameless window
contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  openDevtools: () => ipcRenderer.invoke('window-open-devtools'),
  // Fullscreen APIs
  fullscreen: () => ipcRenderer.invoke('window-fullscreen'),
  exitFullscreen: () => ipcRenderer.invoke('window-exit-fullscreen'),
  toggleFullscreen: () => ipcRenderer.invoke('window-toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('window-is-fullscreen'),
  // Listen for fullscreen state changes
  onFullscreenChange: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_event: any, isFullscreen: boolean) => callback(isFullscreen);
    ipcRenderer.on('fullscreen-changed', handler);
    return () => ipcRenderer.removeListener('fullscreen-changed', handler);
  },
});
