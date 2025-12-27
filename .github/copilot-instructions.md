## Copilot / AI agent instructions for JStream-Desktop

Short, hands-on notes for AI coding agents about the Electron + Vite app so you can be productive quickly.

### High-level architecture
- **Main process**: `jstream-desktop/src/main.ts` — app lifecycle, IPC handlers, adblock, SQLite DB, TMDB proxy, BrowserView player management.
- **Preload**: `jstream-desktop/src/preload.ts` — single canonical surface exposed via `contextBridge` (renderer must use this; do NOT access `ipcRenderer` directly in renderer code).
- **Renderer**: React + Chakra UI in `jstream-desktop/src/renderer/` (entry: `App.tsx`). Vite builds renderer bundles and `electron-forge` runs the app.
- **Database**: SQLite file `jstream.db` at Electron `app.getPath('userData')` with tables for favorites, watch_history, personalization. Migrations use `ALTER TABLE` in try/catch (idempotent).
- **External APIs**: TMDB proxy in main process provides caching, rate-limiting, and keeps API keys secure. Player URLs built from Remote Config (Firebase) with feature flags.
- **Adblock**: Filters in `adblock/` directory, matching logic in `src/adblock.ts`, cosmetic selectors injected via preload on DOMContentLoaded.
- **Player system**: BrowserView overlays for embedded players; fullscreen requests trigger separate windows. Multiple providers (Videasy, Vidfast, Vidsrc, Vidlink) with URL builders in `VideoPlayer.tsx`.

### Quick developer workflows
- **Dev** (repo root): `npm run dev` → delegates to `jstream-desktop` and runs `electron-forge start` (Vite dev server + Electron).
- **Tests**: `npm run test` (runs `vitest` in `jstream-desktop`). Renderer unit tests live under `src/renderer/__tests__`.
- **Storybook**: `cd jstream-desktop && npm run storybook` (default port 6006).
- **Package/release**: `cd jstream-desktop && npx electron-forge make` (see `forge.config.ts`).

### Important runtime & config locations
- **TMDB API key / player config**: `jstream-desktop/src/utils/remoteConfig.ts` (`getPlayerConfig()`); main process also checks `TMDB_API_KEY` env as fallback.
- **Local DB**: SQLite at `app.getPath('userData')/jstream.db` (schema in `src/main/database.ts`).
- **Adblock lists**: `adblock/` (e.g., `filters.txt`, `easylist.txt`) and `src/adblock.ts`.
- **Player URLs**: `buildVideasyUrl()` in `src/utils/remoteConfig.ts` for Videasy; `buildProviderUrl()` in `VideoPlayer.tsx` for others with feature flags from Remote Config.

### Project conventions & patterns (concrete)
- **Cross-process pattern**: implement behavior in `main.ts` (ipcMain.handle) → expose wrapper in `preload.ts` via `contextBridge.exposeInMainWorld(...)` → call from renderer with `window.<api>`. Example:
  1) Add `ipcMain.handle('my-action', handler)` in `src/main.ts`.
  2) In `src/preload.ts` add `contextBridge.exposeInMainWorld('myApi', { doThing: () => ipcRenderer.invoke('my-action') })`.
  3) Call from renderer: `await window.myApi.doThing()`.
- **TMDB client**: `src/utils/tmdbClient.ts` prefers `window.tmdb.request(...)` (main-process proxy) for caching/rate-limits; fallback to direct fetch for tests.
- **BrowserView player**: `player-view-create`/`player-view-destroy` IPC handlers manage BrowserView per renderer; HTML fullscreen sends `'player-view-fullscreen-request'` to renderer for separate window.
- **DB migrations**: follow `src/main/database.ts` — add `try { db.exec('ALTER TABLE foo ADD COLUMN bar ...'); } catch(e) {}` for safe re-runs.
- **Player providers**: Multiple named providers in `VideoPlayer.tsx` (e.g., 'Boreal' = Vidfast, 'Cygnus' = Vidsrc, 'Draco' = Vidlink); URLs built with TMDB IDs, season/episode, and feature flags.
- **Remote Config**: Firebase Remote Config for dynamic settings; defaults in `remoteConfig.ts` if fetch fails or in Electron without opt-in.

### Testing tips (practical examples)
- **Renderer unit tests**: Run in Node JSDOM via Vitest. Preload APIs not present — mock on `globalThis.window`.
  - Example (from `src/renderer/__tests__/HomeGrid.test.tsx`):
    ```typescript
    (globalThis as any).window = Object.assign(globalThis.window || {}, {
      database: { favoritesList: vi.fn(async () => []), favoritesIs: vi.fn(async () => false) }
    });
    ```
- **Mock TMDB**: `vi.mock('../../utils/tmdbClient', () => ({ fetchTMDB: vi.fn() }))`.
- **Main-process code**: Uses native modules (better-sqlite3) — may need Electron-aware setups; most tests target renderer.

### Integration & performance notes
- **TMDB proxy**: In-memory cache (10 min TTL), per-webContents rate-limiting (120 req/min), guessing detection (blocks >120 distinct IDs/min).
- **Dev server signals**: In dev, `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` injected; main prefers dev server URL.
- **DevTools**: Main window opens DevTools by default in dev.
- **Adblock**: WebRequest blocking for URLs, popup blocking, cosmetic injection on DOMContentLoaded/MutationObserver.

### Files to read first (quick path)
- `jstream-desktop/src/main.ts` — main-process logic (IPC, player, adblock)
- `jstream-desktop/src/preload.ts` — canonical IPC surface and DOM injection
- `jstream-desktop/src/main/database.ts` — DB schema and migration pattern
- `jstream-desktop/src/utils/remoteConfig.ts` & `src/utils/tmdbClient.ts` — TMDB and player config
- `jstream-desktop/src/renderer/App.tsx`, `VideoPlayer.tsx`, `VideoPlayerPage.tsx` — components showing player/IPC usage

### Quick actionable examples (copy-paste-ready)
- **Add privileged action**: implement `ipcMain.handle(...)` → expose via `preload.ts` → call `window.myApi.doThing()`.
- **Add DB column**: in `src/main/database.ts` add `try { db.exec('ALTER TABLE foo ADD COLUMN bar ...'); } catch(e) {}`.
- **Use TMDB proxy**: in renderer, `await window.tmdb.request('movie/123')` (or `fetchTMDB()` helper).
- **Add player provider**: in `VideoPlayer.tsx` `buildProviderUrl()`, add case for new provider with URL template.
- **Test renderer component**: Mock `window.database` and `fetchTMDB`, render with `ChakraProvider`.

---

If anything above is unclear or you want this expanded with code examples for testing main-process behavior, CI packaging steps, or common refactor patterns, tell me which area to expand and I will iterate. ✅
