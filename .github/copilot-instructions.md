## Copilot / AI agent instructions for JStream-Desktop

Hands-on notes for AI coding agents about this Electron + Vite streaming app.

### Architecture overview
- **Main process** (`jstream-desktop/src/main.ts`, ~1300 lines): app lifecycle, all IPC handlers, TMDB proxy with caching/rate-limiting, BrowserView player management, adblock engine, window controls. This is the single largest file — most new backend features go here.
- **Preload** (`jstream-desktop/src/preload.ts`): the **only** bridge between main and renderer. Exposes namespaced APIs via `contextBridge.exposeInMainWorld(...)`. Renderer code must **never** import `ipcRenderer` directly.
- **Renderer**: React 19 + Chakra UI v3 in `jstream-desktop/src/renderer/` (entry: `App.tsx`). Vite builds renderer bundles; `electron-forge` runs the app.
- **Database**: **JSON files** (not SQLite). Legacy `jstream.json` in `src/main/database.ts` provides a `db.prepare()` shim. Actual per-user data lives in `src/main/accountDatabase.ts` — see below.
- **Multi-account system** (`src/main/accountDatabase.ts`): master `accounts.json` + per-user `user_data/<accountId>/data.json` files containing favorites, watch_history, personalization, recent_watches. PIN auth with SHA-256 hashing and recovery PINs.
- **Kids content filter** (`src/utils/kidsFilter.ts`): client-side filtering activated per-profile. Checks TMDB `adult` flag, blocked-words list, TMDB Daily Adult ID Exports (downloaded in main process), and forces API-level cert/genre restrictions (`PG`/`TV-PG` max).
- **TMDB proxy**: main process handles all TMDB API calls — in-memory cache (10 min TTL), per-webContents rate-limiting (120 req/min), guessing detection (>120 distinct IDs/min blocked).
- **Player system**: BrowserView overlays for embedded players; HTML fullscreen triggers separate windows. Multiple providers in `VideoPlayer.tsx` (`buildProviderUrl()` switch): Aether (Videasy), Boreal (Vidfast), Cygnus (Vidsrc), Draco (Vidlink).
- **Adblock**: filter lists in `adblock/`, matching in `src/adblock.ts`, `session.webRequest.onBeforeRequest` blocking + cosmetic CSS injection via preload MutationObserver.

### Preload API surface (renderer globals)
The renderer accesses main-process features through these `window.*` namespaces — mock these in tests:
- `window.database` — favorites, watch history, personalization, recent watches
- `window.accounts` — list, create, login, logout, delete, updateProfile, saveAvatar, loadAvatar, resetPin
- `window.tmdb` — `request(endpoint, params)` (main-process TMDB proxy)
- `window.tmdbApi` — `fetchDetails(id, media_type)`, `imageUrl(path, size)`
- `window.tmdbExports` — `fetchCollectionsFeed(opts)` (daily export download)
- `window.kidsFilter` — `isKid()`, `getAdultIds()`
- `window.playerView` — `create(url, opts)`, `destroy()`, `setBounds(bounds)`
- `window.playerViewEvents` — `onFullscreenChange(cb)`, `onFullscreenRequest(cb)`
- `window.windowControls` — minimize, maximize, close, fullscreen, toggleFullscreen, isFullscreen, openDevtools, onFullscreenChange
- `window.adblock` — setEnabled, addRule, stats, reloadLists, etc.
- `window.openExternal` — `url(u)`
- `window.network` — `checkUrlHeaders(u)`

### Developer workflows
- **Dev** (repo root): `npm run dev` → runs `electron-forge start` in `jstream-desktop/` (Vite dev server + Electron)
- **Dev** (inside app): `cd jstream-desktop && npm run dev` (same command, useful when working only in the app package)
- **Tests**: `npm run test` → `vitest` in `jstream-desktop/`. Config: `vitest.config.ts` (jsdom, globals: true)
- **Package**: `cd jstream-desktop && npm run make` (or `npx electron-forge make`; see `forge.config.ts`)
- **DevTools**: disabled by default. Set env `JSTREAM_DEVTOOLS=1` to enable
- **TMDB debug logging**: set `JSTREAM_TMDB_DEBUG=1` for proxy/rate-limit logs

### Build and environment notes
- **Root scripts** (`package.json`) delegate to `jstream-desktop/` with `npm --prefix ./jstream-desktop run <script>`.
- **Primary app scripts** live in `jstream-desktop/package.json` (`dev`, `start`, `test`, `make`).
- **Vite split configs**: `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts` are orchestrated by Electron Forge via `forge.config.ts`.
- **Optional dev server bind**: `VITE_HOST` and `VITE_PORT`.

### Cross-process IPC pattern (follow this exactly)
1. Add handler in `src/main.ts`: `ipcMain.handle('my-channel', async (event, ...args) => { ... })`
2. Expose in `src/preload.ts`: `contextBridge.exposeInMainWorld('myApi', { doThing: (...args) => ipcRenderer.invoke('my-channel', ...args) })`
3. Call from renderer: `await window.myApi.doThing(...args)`

### Data storage patterns
- **Account data**: `accountDatabase.ts` — each user gets `user_data/<id>/data.json` with `{ favorites, watch_history, personalization, recent_watches }`. Functions like `userFavoritesAdd()` load/save the current user's JSON file on every call.
- **Legacy DB shim**: `database.ts` exports a `db` object with `.prepare(sql)` that pattern-matches SQL strings and operates on `jstream.json` arrays. New features should use `accountDatabase.ts` instead.
- **Adding user data fields**: add the field to the `UserDatabase` interface in `accountDatabase.ts`, initialize it in `createAccount()`, and add load/save functions following the existing pattern (e.g., `favoritesAdd`).

### TMDB & Remote Config
- `fetchTMDB()` in `src/utils/tmdbClient.ts` is the renderer's entry point — prefers `window.tmdb.request()` proxy, falls back to direct fetch in tests.
- `fetchTMDB()` applies kids filter automatically when kids mode is active (genre/cert restrictions at API level + client-side blocked-word scan).
- Firebase Remote Config is **skipped by default** in Electron (CSP issues). Hardcoded defaults in `remoteConfig.ts` are used unless `window.__JSTREAM_ENABLE_REMOTE_CONFIG = true`.

### Window behavior
- **Frameless window**: `frame: false` — custom title bar controls via `window.windowControls`.
- **Starts fullscreen**: `mainWindow.setFullScreen(true)` on `ready-to-show`.
- **F11** toggles fullscreen; **Escape** exits fullscreen.

### Common pitfalls and gotchas
1. Renderer code must never import `ipcRenderer` directly. Always go through `window.*` APIs exposed in preload.
2. New user data features must use `src/main/accountDatabase.ts`; avoid adding features to the legacy SQL-like shim in `src/main/database.ts`.
3. Keep kids filtering in the TMDB flow (`fetchTMDB()` + `applyKidsFilter()`) before data reaches UI rendering.
4. Remote Config is intentionally disabled by default in Electron due to CSP/IndexedDB issues. Only enable for targeted debugging.
5. Player/adblock behavior depends on the `persist:player` session partition. If adding webview features, ensure handlers are attached for that partition.

### Testing patterns
- **Environment**: Vitest + jsdom, globals enabled. Tests in `src/renderer/__tests__/`.
- **Mock preload APIs** on `globalThis.window` before render:
  ```typescript
  (globalThis as any).window = Object.assign(globalThis.window || {}, {
    database: { favoritesList: vi.fn(async () => []), favoritesIs: vi.fn(async () => false) }
  });
  ```
- **Mock TMDB**: `vi.mock('../../utils/tmdbClient', () => ({ fetchTMDB: vi.fn() }))`
- **Mock Remote Config** (avoids Firebase/IndexedDB errors in Node):
  ```typescript
  vi.mock('../../utils/remoteConfig', () => ({
    getPlayerConfig: async () => ({ tmdbApiKey: 'fake', movieBaseUrl: '...', tvBaseUrl: '...', ... }),
    buildVideasyUrl: (config, type, params) => `https://player.videasy.net/movie/${params.tmdbId}`
  }))
  ```
- **Render with Chakra**: always wrap in `<ChakraProvider value={defaultSystem}>`.

### Key files to read first
- `jstream-desktop/src/main.ts` — IPC handlers, TMDB proxy, player views, adblock
- `jstream-desktop/src/preload.ts` — complete preload API surface
- `jstream-desktop/src/main/accountDatabase.ts` — multi-account system and user data
- `jstream-desktop/src/utils/tmdbClient.ts` — TMDB client with kids filter integration
- `jstream-desktop/src/utils/kidsFilter.ts` — kids content filtering logic
- `jstream-desktop/src/renderer/App.tsx` — main UI shell, routing, account state
- `jstream-desktop/src/renderer/VideoPlayer.tsx` — player providers and URL builders

### Documentation map (link, do not duplicate)
- `README.md` - repo entrypoint.
- `jstream-desktop/documentation/players.md` - provider naming and context.
- `jstream-desktop/documentation/certifications.md` - ratings/certification references.
- `jstream-desktop/documentation/daily-id-exports.md` and `jstream-desktop/documentation/tmdb-daily-id-exports.md` - TMDB export workflows.
- `jstream-desktop/documentation/adult-words.md` - blocked-word baseline for kids filter.
- `jstream-desktop/documentation/vidfast.md`, `jstream-desktop/documentation/vidsrc.md`, `jstream-desktop/documentation/vidlink.md` - provider-specific notes.
