/**
 * Shared app-update types and constants (Web stub).
 */

export const APP_UPDATE_STATUS = {
  idle: 'idle',
  checking: 'checking',
  available: 'available',
  notAvailable: 'notAvailable',
  downloading: 'downloading',
  downloaded: 'downloaded',
  error: 'error',
} as const;

export interface AppUpdateState {
  status: string;
  info: {
    version: string;
    releaseNotes: string;
    releaseUrl: string;
    publishedAt: string;
  } | null;
  downloadProgress: number;
  [key: string]: any;
}

export function createDefaultAppUpdateState(): AppUpdateState {
  return {
    status: APP_UPDATE_STATUS.idle,
    info: null,
    downloadProgress: 0,
  };
}

export function hasAvailableAppUpdate(state: AppUpdateState): boolean {
  return state.status === APP_UPDATE_STATUS.available || state.status === APP_UPDATE_STATUS.downloaded;
}
