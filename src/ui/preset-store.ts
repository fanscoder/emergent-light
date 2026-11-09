// 预设存取（M4）：localStorage 持久化 + JSON 文件导出/导入。零 DOM 依赖，便于单测。

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredPreset {
  version: 1;
  mode: string;
  seed: number;
  params: Record<string, number | string | boolean | number[]>;
  visual: Record<string, number | string | boolean>;
}

export const PRESET_STORAGE_KEY = 'emergent-light:preset';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isValidPreset(v: unknown): v is StoredPreset {
  if (!isRecord(v)) return false;
  if (v.version !== 1) return false;
  if (typeof v.mode !== 'string' || v.mode.length === 0) return false;
  if (typeof v.seed !== 'number' || !Number.isFinite(v.seed)) return false;
  if (!isRecord(v.params) || !isRecord(v.visual)) return false;
  return true;
}

/** 保存到本地存储；写入失败（如隐私模式配额满）返回 false 不抛异常 */
export function savePresetTo(storage: StorageLike, preset: StoredPreset): boolean {
  try {
    storage.setItem(PRESET_STORAGE_KEY, JSON.stringify(preset));
    return true;
  } catch {
    return false;
  }
}

export function loadPresetFrom(storage: StorageLike): StoredPreset | null {
  try {
    const raw = storage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidPreset(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPresetIn(storage: StorageLike): void {
  try {
    storage.removeItem(PRESET_STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** JSON 文本 → 预设；解析失败或结构非法返回 null */
export function parsePresetJson(text: string): StoredPreset | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isValidPreset(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function presetToJson(preset: StoredPreset): string {
  return JSON.stringify(preset, null, 2);
}
