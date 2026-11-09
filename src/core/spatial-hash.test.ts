import { describe, expect, it } from 'vitest';
import { SpatialHash } from './spatial-hash';

/** 暴力参考实现 */
function bruteForce(
  x: Float32Array,
  y: Float32Array,
  count: number,
  qx: number,
  qy: number,
  r: number,
  wrap: boolean,
  w: number,
  h: number,
): Set<number> {
  const out = new Set<number>();
  const rSq = r * r;
  for (let i = 0; i < count; i++) {
    let dx = Math.abs(x[i] - qx);
    let dy = Math.abs(y[i] - qy);
    if (wrap) {
      dx = Math.min(dx, w - dx);
      dy = Math.min(dy, h - dy);
    }
    if (dx * dx + dy * dy < rSq) out.add(i);
  }
  return out;
}

/** 真实调用方式：空间哈希给覆盖格子超集，调用方用精确距离过滤 */
function collectWithin(
  hash: SpatialHash,
  x: Float32Array,
  y: Float32Array,
  qx: number,
  qy: number,
  r: number,
  wrap: boolean,
  w: number,
  h: number,
): Set<number> {
  const out = new Set<number>();
  const rSq = r * r;
  hash.forEachInRadius(qx, qy, r, (i) => {
    let dx = Math.abs(x[i] - qx);
    let dy = Math.abs(y[i] - qy);
    if (wrap) {
      dx = Math.min(dx, w - dx);
      dy = Math.min(dy, h - dy);
    }
    if (dx * dx + dy * dy < rSq) out.add(i);
  });
  return out;
}

function randomPlacement(seed: number, count: number, w: number, h: number) {
  // 简单 LCG，避免跨测试依赖 Rng 实现
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = next() * w;
    y[i] = next() * h;
  }
  return { x, y };
}

describe('SpatialHash', () => {
  it('随机布点：查询结果与暴力法一致（非 wrap）', () => {
    const w = 800;
    const h = 600;
    const maxR = 50;
    const { x, y } = randomPlacement(1234, 300, w, h);
    const hash = new SpatialHash(w, h, maxR, false, 300);
    hash.rebuild(x, y, 300);

    // 抽查 20 个查询点
    let s = 5678;
    const next = () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let q = 0; q < 20; q++) {
      const qx = next() * w;
      const qy = next() * h;
      const r = 10 + next() * maxR;
      expect(collectWithin(hash, x, y, qx, qy, r, false, w, h)).toEqual(
        bruteForce(x, y, 300, qx, qy, r, false, w, h),
      );
    }
  });

  it('wrap 边界：跨左右/上下边缘的粒子互为邻居', () => {
    const w = 100;
    const h = 100;
    const x = new Float32Array([2, 98, 50]);
    const y = new Float32Array([50, 50, 3]);
    const hashWrap = new SpatialHash(w, h, 20, true, 3);
    hashWrap.rebuild(x, y, 3);
    // 查询 (2,50) 半径 10：应包含索引 1（98,50，跨边界距离 4）
    expect(collectWithin(hashWrap, x, y, 2, 50, 10, true, w, h).has(1)).toBe(true);

    const hashNoWrap = new SpatialHash(w, h, 20, false, 3);
    hashNoWrap.rebuild(x, y, 3);
    expect(collectWithin(hashNoWrap, x, y, 2, 50, 10, false, w, h).has(1)).toBe(false);
  });

  it('极端密集：单格 800 粒子时结果与暴力法一致（不截断）', () => {
    const w = 400;
    const h = 400;
    const count = 800;
    const x = new Float32Array(count).fill(200.5);
    const y = new Float32Array(count).fill(200.5);
    const hash = new SpatialHash(w, h, 40, false, count);
    hash.rebuild(x, y, count);
    const got = collectWithin(hash, x, y, 200, 200, 30, false, w, h);
    const want = bruteForce(x, y, count, 200, 200, 30, false, w, h);
    expect(got).toEqual(want);
    expect(got.size).toBe(count);
    expect(hash.maxCellOccupancy()).toBe(count);
  });

  it('支持不同查询半径：r 小于 / 大于 cellSize 均正确', () => {
    const w = 500;
    const h = 500;
    const maxR = 50;
    const { x, y } = randomPlacement(777, 200, w, h);
    const hash = new SpatialHash(w, h, maxR, true, 200);
    hash.rebuild(x, y, 200);

    for (const r of [5, 30, 50, 90]) {
      expect(collectWithin(hash, x, y, 250, 250, r, true, w, h)).toEqual(
        bruteForce(x, y, 200, 250, 250, r, true, w, h),
      );
    }
  });

  it('粒子数超过容量时抛错', () => {
    const hash = new SpatialHash(100, 100, 10, false, 4);
    expect(() => hash.rebuild(new Float32Array(5), new Float32Array(5), 5)).toThrow();
  });
});
