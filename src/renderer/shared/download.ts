/**
 * Shared download types and constants (Web stub).
 * Original src/shared/download.ts was removed; this file provides the exports
 * that renderer modules depend on.
 */

// ── Download task states ─────────────────────────────────────────────────
export const DOWNLOAD_TASK_STATE = {
  queued: 'queued',
  downloading: 'downloading',
  paused: 'paused',
  completed: 'completed',
  cancelled: 'cancelled',
  error: 'error',
} as const;

// ── Types ────────────────────────────────────────────────────────────────
export interface DownloadSettings {
  savePath: string;
  maxConcurrent: number;
  [key: string]: any;
}

export interface DownloadSongInfo {
  id: number | string;
  name: string;
  ar?: Array<{ name: string }>;
  picUrl?: string;
  [key: string]: any;
}

export interface DownloadTask {
  id: string;
  taskId: string;
  url: string;
  filename: string;
  state: string;
  progress: number;
  loaded?: number;
  total?: number;
  songInfo: DownloadSongInfo;
  createdAt: number;
  type: string;
  [key: string]: any;
}

// ── Factory ──────────────────────────────────────────────────────────────
export function createDefaultDownloadSettings(): DownloadSettings {
  return {
    savePath: '',
    maxConcurrent: 3,
  };
}
