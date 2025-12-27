// Expose webview preload path
import { contextBridge, ipcRenderer } from 'electron';

ipcRenderer.invoke('get-webview-preload-path').then((preloadPath) => {
  contextBridge.exposeInMainWorld('webviewPreloadPath', preloadPath);
});
// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';
import { shell } from 'electron';

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
});

contextBridge.exposeInMainWorld('openExternal', {
  url: (u: string) => {
    try { shell.openExternal(u); } catch (e) { console.error('openExternal failed', e); }
  }
});

contextBridge.exposeInMainWorld('network', {
  checkUrlHeaders: (u: string) => ipcRenderer.invoke('check-url-headers', u),
});

contextBridge.exposeInMainWorld('playerWindow', {
  open: (u: string) => ipcRenderer.invoke('open-player-window', u),
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
