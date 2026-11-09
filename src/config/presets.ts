// Preset 校验与默认值回退（M0 简版；M4 接入控制面板与 localStorage）。

import type { PresetData } from '../core/types';

export function makeDefaultPreset(): PresetData {
  return {
    version: 1,
    mode: 'drift',
    seed: 1,
    params: {},
    visual: { theme: 'debug' },
  };
}

/** 结构校验：非法字段回退默认值，保证加载任意 JSON 不会崩溃。 */
export function validatePreset(raw: unknown): PresetData {
  const fallback = makeDefaultPreset();
  if (typeof raw !== 'object' || raw === null) return fallback;
  const r = raw as Record<string, unknown>;
  return {
    version: 1,
    mode: typeof r.mode === 'string' ? r.mode : fallback.mode,
    seed: typeof r.seed === 'number' ? r.seed : fallback.seed,
    params:
      typeof r.params === 'object' && r.params !== null
        ? { ...(r.params as Record<string, number | string | boolean>) }
        : {},
    visual:
      typeof r.visual === 'object' && r.visual !== null
        ? { ...(r.visual as Record<string, number | string | boolean>) }
        : { ...fallback.visual },
  };
}
