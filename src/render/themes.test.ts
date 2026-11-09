import { describe, expect, it } from 'vitest';
import { DEEP_OCEAN, backgroundCss, styleForType } from './themes';

describe('Deep Ocean 主题', () => {
  it('光晕 RGB 分量合法且避免过度饱和（至少一个分量 ≤ 128 保持"暗"）', () => {
    for (const p of DEEP_OCEAN.particles) {
      for (const c of p.glow) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(255);
      }
      expect(Math.min(...p.glow)).toBeLessThanOrEqual(128);
    }
  });

  it('核心小而亮（半径 1–3 px）', () => {
    for (const p of DEEP_OCEAN.particles) {
      expect(p.coreSize).toBeGreaterThanOrEqual(1);
      expect(p.coreSize).toBeLessThanOrEqual(3);
    }
  });

  it('背景足够深（亮度分量 ≤ 20）', () => {
    for (const c of DEEP_OCEAN.background) expect(c).toBeLessThanOrEqual(20);
  });

  it('styleForType 对超出范围的类型循环复用', () => {
    expect(styleForType(DEEP_OCEAN, 0)).toBe(DEEP_OCEAN.particles[0]);
    expect(styleForType(DEEP_OCEAN, DEEP_OCEAN.particles.length)).toBe(DEEP_OCEAN.particles[0]);
  });

  it('backgroundCss 生成合法 rgba', () => {
    expect(backgroundCss(DEEP_OCEAN, 0.93)).toBe('rgba(4,10,20,0.93)');
  });
});
