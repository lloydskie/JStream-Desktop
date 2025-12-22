# Copilot / AI agent instructions for JStream-Desktop

This file gives concise, hands-on guidance for AI coding agents working on this Electron + Vite app.

## Overview
- Architecture: Electron app (main, preload, renderer) built with `electron-forge` + `@electron-forge/plugin-vite`.
  - Main process: `jstream-desktop/src/main.ts` — app lifecycle, IPC handlers, adblock, SQLite DB, TMDB proxy, server-side logic.
  - Preload: `jstream-desktop/src/preload.ts` — `contextBridge` APIs the renderer must use.
  - Renderer: React + Chakra UI under `jstream-desktop/src/renderer/` (entry `App.tsx`). Vite builds renderer bundles.

## Key workflows & commands
- Dev (start Electron + Vite): from repo root run `npm run dev` (delegates into `jstream-desktop`), or `cd jstream-desktop && npm run dev`.
- Tests: `npm run test` (uses `vitest` configured in `jstream-desktop/vitest.config.ts`).
- Storybook: `cd jstream-desktop && npm run storybook`.
- Package/make: `cd jstream-desktop && npx electron-forge make` (see `forge.config.ts`).

## Important runtime/config locations
- TMDB API key: resolved via Firebase Remote Config `jstream-desktop/src/utils/remoteConfig.ts` (function `getPlayerConfig()`); fallback to `TMDB_API_KEY` env in the main process.
- Firebase settings: `jstream-desktop/firebase-config.ts` (contains example values — do not commit production secrets).
- Local DB: `jstream.db` stored at Electron `app.getPath('userData')` (see `jstream-desktop/src/main/database.ts`).
- Adblock lists: `adblock/filters.txt` (runtime logic in `jstream-desktop/src/adblock.ts`, cosmetic selectors injected from preload).

## Project conventions (must-follow)
- IPC surface: renderer code MUST call only the APIs exposed by `preload.ts`. Do not use `ipcRenderer` directly in renderer code.
  - Example calls: `await window.tmdb.request('movie/123')`, `await window.tmdbApi.fetchDetails(123, 'movie')`, `await window.database.favoritesAdd('123','movie')`.
- New cross-process feature pattern: implement logic in `main.ts` (ipcMain handler) → expose via `preload.ts` (contextBridge) → call from renderer.
- Security: keep secrets in main or remote config; never embed API keys in renderer bundles.
- DB migrations: `src/main/database.ts` creates tables at startup and uses try/catch around `ALTER TABLE` — follow that approach for simple migrations to avoid breaking upgrades.

## Integration & performance notes
- TMDB proxy in `main.ts` uses an in-memory cache and per-webContents rate-limiting — avoid adding aggressive background fetch loops.
- DevTools: `createWindow()` opens DevTools by default (useful locally; be aware when packaging the app).
- Vite dev signals: `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` are injected in dev — `main.ts` prefers the dev server URL when present.

## Files to read first
- `jstream-desktop/src/main.ts` — main-process app logic and all IPC handlers.
- `jstream-desktop/src/preload.ts` — canonical IPC surface for renderer.
- `jstream-desktop/src/main/database.ts` — DB schema and helpers.
- `jstream-desktop/src/utils/remoteConfig.ts` — where feature flags and TMDB config are read.
- `jstream-desktop/src/renderer/` — UI; `App.tsx`, `VideoPlayer.tsx` and `VideoPlayerPage.tsx` show player integration.

## Quick examples
- Add a new privileged renderer action:
  1) Add `ipcMain.handle('my-action', handler)` in `src/main.ts`.
  2) Expose it in `src/preload.ts` via `contextBridge.exposeInMainWorld('myApi', { doThing: () => ipcRenderer.invoke('my-action') })`.
  3) Call from renderer: `await window.myApi.doThing()`.

If a detail here is unclear or you want the file extended with examples (tests, storybook patterns, packaging CI), tell me which area to expand.
# Copilot / AI agent instructions for JStream-Desktop

This file contains focused, actionable guidance for AI coding agents working on the JStream Desktop codebase.

Overview
- **Architecture:** Electron app built with `electron-forge` + `@electron-forge/plugin-vite`. There are three runtime layers:
  - **Main process:** `jstream-desktop/src/main.ts` — app lifecycle, IPC handlers, adblock, SQLite DB, TMDB proxy and server-side logic.
  - **Preload:** `jstream-desktop/src/preload.ts` — `contextBridge` APIs exported to renderer (adblock, database, tmdb, network, playerWindow).
  - **Renderer:** React + Chakra UI at `jstream-desktop/src/renderer/**` (entry `App.tsx`). Vite builds renderer bundles.

Key developer workflows / commands
- Dev (start Electron + Vite dev server):
  - From repository root: `npm run dev` (delegates to `jstream-desktop` package)
  - Or from `jstream-desktop` folder: `npm run dev` (runs `electron-forge start`)
- Run tests: `npm run test` (root delegates to `jstream-desktop`, uses `vitest`).
- Storybook: `npm run storybook` from `jstream-desktop`.
- Packaging: run `npx electron-forge make` in `jstream-desktop` (configured via `forge.config.ts`).

Critical runtime/config locations
- TMDB API key:
  - Primary source: Firebase Remote Config `jstream-desktop/src/utils/remoteConfig.ts` — `getPlayerConfig()`.
  - Secondary: environment `TMDB_API_KEY` (used by main process when Remote Config absent).
- Firebase config: `jstream-desktop/firebase-config.ts` (example values present; don't commit production secrets).
- Local DB: `jstream.db` in Electron `app.getPath('userData')` (see `jstream-desktop/src/main/database.ts`).
- Adblock lists: `adblock/filters.txt` (adblock runtime at `jstream-desktop/src/adblock.ts`). Cosmetic selectors injected by `preload.ts`.

Conventions and patterns to follow
- IPC surface: only use the APIs exposed by `preload.ts` in renderer code. Avoid direct `ipcRenderer` usage in renderer.
  - Example usages: `await window.tmdb.request('movie/123')`, `await window.tmdbApi.fetchDetails(123, 'movie')`, `await window.database.favoritesAdd('123','movie')`.
- Sensitive actions (network requests requiring API key) are proxied in main — prefer main-side helpers (`tmdb-request`, `fetch-details`, `tmdb-exports-getCollectionsFeed`).
- Migration-safe DB updates: `main/database.ts` creates tables on startup and attempts `ALTER TABLE` inside try/catch; follow that pattern for simple migrations.
- Adblock strategy: `adblock.ts` uses simple substring/regex rules and exposes management via IPC; cosmetic rules are injected via `preload.ts` on DOMContentLoaded.

Files you will read often
- `jstream-desktop/src/main.ts` — all main-process IPC handlers and application behaviour (adblock, tmdb proxy, watch history, favorites).
- `jstream-desktop/src/preload.ts` — what renderer code can call; mirror these exports when adding new APIs.
- `jstream-desktop/src/renderer/**` — React UI; `App.tsx` shows navigation, keyboard shortcuts and player integration.
- `jstream-desktop/src/utils/remoteConfig.ts` — remote-config-driven player URLs and feature toggles.
- `jstream-desktop/src/main/database.ts` — DB schema and helper functions.

Quick examples for edits
- Adding a new renderer action that needs a secret/API key:
  1. Implement logic in `main.ts` (new `ipcMain.handle('my-action', ...)`).
  2. Expose it in `preload.ts` via `contextBridge.exposeInMainWorld('myApi', { doThing: () => ipcRenderer.invoke('my-action') })`.
  3. Call from renderer: `await window.myApi.doThing()`.

Notes / gotchas
- `main.ts` opens DevTools unconditionally in `createWindow()` (useful for debugging; be aware when packaging).
- The Vite plugin injects `MAIN_WINDOW_VITE_DEV_SERVER_URL` and `MAIN_WINDOW_VITE_NAME` during dev/build — `main.ts` loads the dev server when available.
- TMDB proxy in main uses an in-memory cache and per-webContents rate-limiting; respect those limits when adding aggressive fetches.

If anything in this file is unclear or you want more examples (unit tests, storybook conventions, packaging CI), tell me which area to expand.
