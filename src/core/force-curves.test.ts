import { describe, expect, it } from 'vitest';
import { piecewiseSineForce, type PairForceParams } from './force-curves';

const base: PairForceParams = { k: 1, core: 0.3, radius: 100 };

describe('piecewiseSineForce（分段正弦力曲线）', () => {
  it('近距离排斥：d → 0 时 F < 0', () => {
    expect(piecewiseSineForce(0, base)).toBeLessThan(0);
    expect(piecewiseSineForce(1, base)).toBeLessThan(0);
  });

  it('作用半径边界归零：d >= R 时 F = 0', () => {
    expect(piecewiseSineForce(100, base)).toBe(0);
    expect(piecewiseSineForce(150, base)).toBe(0);
  });

  it('连续性：排斥核与吸引瓣交界两侧极限一致（均为 0）', () => {
    const eps = 1e-6;
    const left = piecewiseSineForce((base.core - eps) * base.radius, base);
    const right = piecewiseSineForce((base.core + eps) * base.radius, base);
    expect(Math.abs(left)).toBeLessThan(1e-3);
    expect(Math.abs(right)).toBeLessThan(1e-3);
  });

  it('有界：|F| <= |k|', () => {
    for (let d = 0; d < 100; d += 0.37) {
      expect(Math.abs(piecewiseSineForce(d, base))).toBeLessThanOrEqual(1);
    }
  });

  it('k > 0 时中程存在吸引峰（峰值在 u_core 与 1 中点附近）', () => {
    const mid = ((base.core + 1) / 2) * base.radius;
    const peak = piecewiseSineForce(mid, base);
    expect(peak).toBeGreaterThan(0.9);
    expect(piecewiseSineForce(60, base)).toBeGreaterThan(0);
  });

  it('k < 0 时中程排斥（曲线整体反号）', () => {
    const neg: PairForceParams = { ...base, k: -0.8 };
    expect(piecewiseSineForce(60, neg)).toBeLessThan(0);
    expect(piecewiseSineForce(5, neg)).toBeGreaterThan(0); // 排斥核反号 → 吸引
  });

  it('零距离与 NaN 不产生奇点', () => {
    expect(Number.isFinite(piecewiseSineForce(0, base))).toBe(true);
    expect(piecewiseSineForce(Number.NaN, base)).toBe(0);
  });

  it('不同半径参数独立生效', () => {
    const small: PairForceParams = { k: 1, core: 0.3, radius: 50 };
    expect(piecewiseSineForce(60, small)).toBe(0);
    expect(piecewiseSineForce(60, base)).toBeGreaterThan(0);
  });
});
