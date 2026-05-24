# Fix Music Player Broken Imports (Web Mode)

**Time:** 2026-05-24 11:52
**Status:** ✅ Completed

## Objective
Fix broken imports in a pure-web music player after `src/shared/` was deleted.

## Changes Made

### 1. Created `src/renderer/shared/` with 3 stub modules
- **download.ts** — `DownloadSettings`, `DownloadTask`, `DownloadSongInfo` types, `DOWNLOAD_TASK_STATE` constant, `createDefaultDownloadSettings()` factory
- **appUpdate.ts** — `AppUpdateState`, `APP_UPDATE_STATUS`, `createDefaultAppUpdateState()`, `hasAvailableAppUpdate()`
- **shortcuts.ts** — `ShortcutAction`, `ShortcutsConfig`, `ShortcutGroup` types, `shortcutActionOrder`, `shortcutGroups`, `normalizeShortcutAccelerator()`, `normalizeShortcutsConfig()`, `hasShortcutAction()`

### 2. Fixed `isElectron` in `src/renderer/utils/index.ts`
- Changed from `(window as any).electron !== undefined` to hardcoded `false`

### 3. Fixed all 10 broken import paths
All `../../../shared/...` and `../../shared/...` imports replaced with `@/shared/...` (resolves via tsconfig `@/*` → `src/renderer/*`):
- UpdateModal.vue, ShortcutSettings.vue, useDownload.ts, download.ts (store), settings.ts (store), appShortcuts.ts, shortcutKeyboard.ts, DownloadPage.vue, set/index.vue, AboutTab.vue

### 4. Created missing `main/set.json`
- Settings store imports `setDataDefault` from `@/../main/set.json`; created minimal default config

### 5. Verification
`npm run dev:web` → Vite ready in ~25s, no import/build errors.
