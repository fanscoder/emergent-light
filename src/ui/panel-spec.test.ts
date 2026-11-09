import { describe, expect, it } from 'vitest';
import {
  accentSharePatch,
  buildModeControls,
  BOIDS_SCALED_KEYS,
  VISUAL_CONTROLS,
} from './panel-spec';
import {
  PRESET_STORAGE_KEY,
  clearPresetIn,
  loadPresetFrom,
  parsePresetJson,
  presetToJson,
  savePresetTo,
  type StorageLike,
} from './preset-store';

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const samplePreset = {
  version: 1 as const,
  mode: 'boids',
  seed: 42,
  params: { maxSpeed: 60, typePalette: [0, 1, 4] },
  visual: { brightness: 0.8 },
};

describe('面板控件规格', () => {
  it('Boids 空间/速度键带世界缩放倍率，其余键不缩放', () => {
    const controls = buildModeControls('boids', 2);
    for (const c of controls) {
      if (c.kind !== 'slider') continue;
      if (BOIDS_SCALED_KEYS.includes(c.key)) {
        expect(c.scale).toBe(2);
      } else {
        expect(c.scale).toBe(1);
      }
    }
  });

  it('需要重启世界的键标有 restart（数量、种类、矩阵、亮色占比）', () => {
    for (const mode of ['particle-life', 'boids'] as const) {
      const controls = buildModeControls(mode, 1);
      for (const c of controls) {
        if (['count', 'types', 'matrixStyle', 'accentShare'].includes(c.key)) {
          expect(c.restart).toBe(true);
        }
      }
    }
  });

  it('亮色占比补丁：主体两族均分剩余，亮色在 [0, 0.8] 截断', () => {
    expect(accentSharePatch(0.15).typeShares).toEqual([0.425, 0.425, 0.15]);
    expect(accentSharePatch(2).typeShares[2]).toBe(0.8);
    expect(accentSharePatch(-1).typeShares[2]).toBe(0);
  });

  it('视觉控件只作用于渲染参数，全部无需重启', () => {
    expect(VISUAL_CONTROLS.map((c) => c.key)).toEqual([
      'brightness',
      'glowSize',
      'sizeVar',
      'trail',
    ]);
    expect(VISUAL_CONTROLS.every((c) => !c.restart)).toBe(true);
  });
});

describe('预设存取', () => {
  it('保存-读取往返一致', () => {
    const storage = memoryStorage();
    expect(loadPresetFrom(storage)).toBeNull();
    expect(savePresetTo(storage, samplePreset)).toBe(true);
    expect(loadPresetFrom(storage)).toEqual(samplePreset);
    clearPresetIn(storage);
    expect(loadPresetFrom(storage)).toBeNull();
  });

  it('损坏的存储内容返回 null 而不是抛异常', () => {
    const storage = memoryStorage();
    storage.data.set(PRESET_STORAGE_KEY, 'not-json{{{');
    expect(loadPresetFrom(storage)).toBeNull();
    storage.data.set(PRESET_STORAGE_KEY, JSON.stringify({ version: 2 }));
    expect(loadPresetFrom(storage)).toBeNull();
    storage.data.set(PRESET_STORAGE_KEY, JSON.stringify({ ...samplePreset, seed: 'x' }));
    expect(loadPresetFrom(storage)).toBeNull();
  });

  it('JSON 导出-导入往返一致，拒绝非法文本', () => {
    const json = presetToJson(samplePreset);
    expect(parsePresetJson(json)).toEqual(samplePreset);
    expect(parsePresetJson('{"version":1}')).toBeNull();
    expect(parsePresetJson('')).toBeNull();
  });
});
