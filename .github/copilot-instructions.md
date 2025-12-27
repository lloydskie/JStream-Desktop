## Copilot / AI agent instructions for JStream-Desktop

Short, hands-on notes for AI coding agents about the Electron + Vite app so you can be productive quickly.

### High-level architecture
- Main process: `jstream-desktop/src/main.ts` — app lifecycle, IPC handlers, adblock, SQLite DB, TMDB proxy, BrowserView player management.
- Preload: `jstream-desktop/src/preload.ts` — single canonical surface exposed via `contextBridge` (renderer must use this; do NOT access `ipcRenderer` directly in renderer code).
- Renderer: React + Chakra UI in `jstream-desktop/src/renderer/` (entry: `App.tsx`). Vite builds renderer bundles and `electron-forge` runs the app.

### Quick developer workflows
- Dev (repo root): `npm run dev` → delegates to `jstream-desktop` and runs `electron-forge start` (Vite dev server + Electron).
- Tests: `npm run test` (runs `vitest` in `jstream-desktop`). Renderer unit tests live under `src/renderer/__tests__`.
- Storybook: `cd jstream-desktop && npm run storybook` (default port 6006).
- Package/release: `cd jstream-desktop && npx electron-forge make` (see `forge.config.ts`).

### Important runtime & config locations
- TMDB API key / player config: `jstream-desktop/src/utils/remoteConfig.ts` (function `getPlayerConfig()`); main process also checks `TMDB_API_KEY` env as a fallback.
- Local DB: SQLite file `jstream.db` at Electron `app.getPath('userData')` (see `src/main/database.ts`). Migrations are done with `ALTER TABLE` inside try/catch (idempotent pattern).
- Adblock lists: `adblock/` (e.g., `filters.txt`, `easylist.txt`) and `src/adblock.ts` (matching logic). Cosmetic selectors are injected from `preload.ts` on DOMContentLoaded.
- Player URLs: `buildVideasyUrl()` in `src/utils/remoteConfig.ts` builds external player URLs with feature flags from Remote Config.

### Project conventions & patterns (concrete)
- Cross-process pattern: implement behavior in `main.ts` (ipcMain.handle) → expose wrapper in `preload.ts` via `contextBridge.exposeInMainWorld(...)` → call from renderer with `window.<api>`. Example:
  1) Add `ipcMain.handle('my-action', handler)` in `src/main.ts`.
  2) In `src/preload.ts` add `contextBridge.exposeInMainWorld('myApi', { doThing: () => ipcRenderer.invoke('my-action') })`.
  3) Call from renderer: `await window.myApi.doThing()`.
- TMDB client: `src/utils/tmdbClient.ts` prefers using the main-process proxy via `window.tmdb.request(...)` to keep API keys out of renderer and benefit from main-process caching/rate-limits; fallback to direct fetch for tests or when preload is unavailable.
- BrowserView player: `player-view-create`/`player-view-destroy` IPC handlers manage a BrowserView per renderer; when embedded content enters HTML fullscreen the main process sends `'player-view-fullscreen-request'` back to the renderer so it can open a separate window. See `src/main.ts` for lifecycle and cleanup patterns.
- DB migrations: follow `src/main/database.ts` pattern — create missing tables and run `ALTER TABLE ...` in try/catch so re-running is safe.

### Testing tips (practical examples)
- Renderer unit tests run in Node JSDOM via Vitest. Preload APIs are not present in the test environment — mock them on `globalThis.window`.
  - Example (from `src/renderer/__tests__/HomeGrid.test.tsx`):
    (globalThis as any).window = Object.assign(globalThis.window || {}, {
      database: { favoritesList: vi.fn(async () => []), favoritesIs: vi.fn(async () => false) }
    });
- Mock `src/utils/tmdbClient` with `vi.mock(...)` when you want deterministic TMDB responses.
- Be mindful that main-process code uses native modules (e.g., `better-sqlite3`) — running main process tests may require Electron-aware test setups; most unit tests target renderer components only.

### Integration & performance notes
- TMDB proxy in `main.ts` includes an in-memory cache and per-webContents rate-limiting — avoid adding background fetch loops that bypass this.
- Dev server signals: during dev, environment variables `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` are injected; `main.ts` prefers the dev server URL when present (look in Vite/forge plugin config files).
- DevTools: the main window opens DevTools by default in dev; keep this in mind when testing behavior that depends on focus/devtools.

### Files to read first (quick path)
- `jstream-desktop/src/main.ts` — main-process logic (IPC, player, adblock)
- `jstream-desktop/src/preload.ts` — canonical IPC surface and DOM injection logic
- `jstream-desktop/src/main/database.ts` — DB schema and migration pattern
- `jstream-desktop/src/utils/remoteConfig.ts` & `src/utils/tmdbClient.ts` — TMDB and player config
- `jstream-desktop/src/renderer/App.tsx`, `VideoPlayer.tsx`, `VideoPlayerPage.tsx` — components showing player/IPC usage

### Quick actionable examples (copy-paste-ready)
- Add privileged action: implement `ipcMain.handle(...)` → expose via `preload.ts` → call `window.myApi.doThing()` from renderer.
- Add DB column: in `src/main/database.ts` add `try { db.exec('ALTER TABLE foo ADD COLUMN bar ...'); } catch(e) {}` to make the migration safe to re-run.
- Use TMDB proxy: in renderer, call `await window.tmdb.request('movie/123')` (or use `fetchTMDB()` helper in `src/utils/tmdbClient.ts`).

---

If anything above is unclear or you want this expanded with code examples for testing main-process behavior, CI packaging steps, or common refactor patterns, tell me which area to expand and I will iterate. ✅
