import { describe, expect, it } from 'vitest';
import { Rng } from './rng';

describe('Rng（mulberry32）', () => {
  it('同种子产生完全相同的序列', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('不同种子产生不同序列', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    let allEqual = true;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) {
        allEqual = false;
        break;
      }
    }
    expect(allEqual).toBe(false);
  });

  it('getState/setState 恢复后续序列', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    for (let i = 0; i < 10; i++) {
      a.next();
      b.next();
    }
    const state = a.getState();
    const tailA: number[] = [];
    for (let i = 0; i < 10; i++) tailA.push(a.next());

    const c = new Rng(0);
    c.setState(state);
    for (let i = 0; i < 10; i++) {
      expect(c.next()).toBe(tailA[i]);
    }
  });

  it('normal() 近似标准正态（均值 0、标准差 1），且同种子可复现', () => {
    const a = new Rng(2026);
    const b = new Rng(2026);
    let sum = 0;
    let sumSq = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const v = a.normal();
      expect(v).toBe(b.normal()); // 逐位一致
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / N;
    const std = Math.sqrt(sumSq / N - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.05);
    expect(std).toBeGreaterThan(0.9);
    expect(std).toBeLessThan(1.1);
  });

  it('next() 落在 [0, 1)，range/int 边界正确', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    for (let i = 0; i < 10000; i++) {
      const v = rng.range(-3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(5);
      const n = rng.int(4);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(4);
      expect(Number.isInteger(n)).toBe(true);
    }
  });
});
