# Copilot / AI agent instructions for JStream-Desktop

This file gives concise, hands-on guidance for AI coding agents working on this Electron + Vite app.

## Overview
- **Architecture:** Electron app (main, preload, renderer) built with `electron-forge` + `@electron-forge/plugin-vite`.
  - Main process: `jstream-desktop/src/main.ts` — app lifecycle, IPC handlers, adblock, SQLite DB, TMDB proxy, server-side logic.
  - Preload: `jstream-desktop/src/preload.ts` — `contextBridge` APIs the renderer must use.
  - Renderer: React + Chakra UI under `jstream-desktop/src/renderer/` (entry `App.tsx`). Vite builds renderer bundles.

## Key workflows & commands
- **Dev (start Electron + Vite):** from repo root run `npm run dev` (delegates into `jstream-desktop`), or `cd jstream-desktop && npm run dev`.
- **Tests:** `npm run test` (uses `vitest` configured in `jstream-desktop/vitest.config.ts`).
- **Storybook:** `cd jstream-desktop && npm run storybook`.
- **Package/make:** `cd jstream-desktop && npx electron-forge make` (see `forge.config.ts`).

## Important runtime/config locations
- **TMDB API key:** resolved via Firebase Remote Config `jstream-desktop/src/utils/remoteConfig.ts` (function `getPlayerConfig()`); fallback to `TMDB_API_KEY` env in the main process.
- **Firebase settings:** `jstream-desktop/firebase-config.ts` (contains example values — do not commit production secrets).
- **Local DB:** `jstream.db` stored at Electron `app.getPath('userData')` (see `jstream-desktop/src/main/database.ts`).
- **Adblock lists:** `adblock/filters.txt` (runtime logic in `jstream-desktop/src/adblock.ts`, cosmetic selectors injected from preload).
- **Player URLs:** Built using `buildVideasyUrl()` in `remoteConfig.ts` with base URLs from Firebase Remote Config (movieBaseUrl, tvBaseUrl).

## Project conventions (must-follow)
- **IPC surface:** renderer code MUST call only the APIs exposed by `preload.ts`. Do not use `ipcRenderer` directly in renderer code.
  - Example calls: `await window.tmdb.request('movie/123')`, `await window.tmdbApi.fetchDetails(123, 'movie')`, `await window.database.favoritesAdd('123','movie')`.
- **New cross-process feature pattern:** implement logic in `main.ts` (ipcMain handler) → expose via `preload.ts` (contextBridge) → call from renderer.
- **Security:** keep secrets in main or remote config; never embed API keys in renderer bundles.
- **DB migrations:** `src/main/database.ts` creates tables at startup and uses try/catch around `ALTER TABLE` — follow that approach for simple migrations to avoid breaking upgrades.
- **Player integration:** Use `getPlayerConfig()` and `buildVideasyUrl()` for external player URLs; supports progress resume, overlay, episode selection via query params.

## Integration & performance notes
- **TMDB proxy in `main.ts`:** uses an in-memory cache and per-webContents rate-limiting — avoid adding aggressive background fetch loops.
- **DevTools:** `createWindow()` opens DevTools by default (useful locally; be aware when packaging the app).
- **Vite dev signals:** `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` are injected in dev — `main.ts` prefers the dev server URL when present.
- **Adblock:** Cosmetic selectors are injected via `preload.ts` on DOMContentLoaded; use MutationObserver for dynamic elements.
- **Remote Config:** Disabled by default in Electron renderer to avoid CSP issues; enable with `window.__JSTREAM_ENABLE_REMOTE_CONFIG = true` for testing.

## Files to read first
- `jstream-desktop/src/main.ts` — main-process app logic and all IPC handlers.
- `jstream-desktop/src/preload.ts` — canonical IPC surface for renderer.
- `jstream-desktop/src/main/database.ts` — DB schema and helpers.
- `jstream-desktop/src/utils/remoteConfig.ts` — where feature flags and TMDB config are read.
- `jstream-desktop/src/renderer/App.tsx`, `VideoPlayer.tsx` and `VideoPlayerPage.tsx` — show player integration.

## Quick examples
- **Add a new privileged renderer action:**
  1. Add `ipcMain.handle('my-action', handler)` in `src/main.ts`.
  2. Expose it in `src/preload.ts` via `contextBridge.exposeInMainWorld('myApi', { doThing: () => ipcRenderer.invoke('my-action') })`.
  3. Call from renderer: `await window.myApi.doThing()`.

- **Add DB table/field:** Use try/catch `ALTER TABLE` in `database.ts` for migrations.

- **Fetch TMDB data:** Use `window.tmdb.request(endpoint, params)` for cached, rate-limited requests.

If a detail here is unclear or you want the file extended with examples (tests, storybook patterns, packaging CI), tell me which area to expand.

If anything in this file is unclear or you want more examples (unit tests, storybook conventions, packaging CI), tell me which area to expand.
