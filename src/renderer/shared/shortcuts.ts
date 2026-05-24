/**
 * Shared shortcut types and constants (Web stub).
 */

export type ShortcutAction = string;
export type ShortcutPlatform = 'win' | 'mac' | 'linux';
export type ShortcutScope = 'global' | 'app';

export interface ShortcutConfig {
  action: ShortcutAction;
  accelerator: string;
  platform?: ShortcutPlatform;
  scope?: ShortcutScope;
  enabled?: boolean;
}

export interface ShortcutsConfig {
  [action: string]: ShortcutConfig;
}

export interface ShortcutGroup {
  id: string;
  label: string;
  actions: ShortcutAction[];
}

export const shortcutActionOrder: ShortcutAction[] = [
  'playPause', 'next', 'prev', 'volumeUp', 'volumeDown', 'mute',
];

export const shortcutGroups: ShortcutGroup[] = [];

export function normalizeShortcutAccelerator(accelerator: string): string {
  return accelerator.replace(/CommandOrControl/g, 'Mod').replace(/CmdOrCtrl/g, 'Mod');
}

export function normalizeShortcutsConfig(config: ShortcutsConfig): ShortcutsConfig {
  return config;
}

export function hasShortcutAction(action: string, config: ShortcutsConfig): boolean {
  return action in config;
}
