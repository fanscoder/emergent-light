import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
export function isTauri(): boolean { return '__TAURI_INTERNALS__' in window; }
export function setWallpaper(on: boolean): Promise<void> { return invoke('set_wallpaper', { on }); }
export function queryWallpaper(): Promise<boolean> { return invoke<boolean>('is_wallpaper'); }
export function onWallpaperChanged(cb: (on: boolean) => void): Promise<UnlistenFn> {
  return listen<boolean>('wallpaper-changed', event => cb(event.payload));
}
export function onDesktopError(cb: (error: string) => void): Promise<UnlistenFn> {
  return listen<string>('desktop-error', event => cb(event.payload));
}

export function shouldStartWallpaper(): Promise<boolean> { return invoke<boolean>('should_start_wallpaper'); }
