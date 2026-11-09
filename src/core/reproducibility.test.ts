import { describe, expect, it } from 'vitest';
import { DriftSimulation } from './modes/drift';

const FRAMES = 180;

/** 用固定帧序列驱动引擎 + 模拟，返回最终状态快照 */
function runFrames(seed: number): { x: number[]; y: number[]; vx: number[]; vy: number[] } {
  const sim = new DriftSimulation(500, 1920, 1080);
  sim.randomize(seed);
  const dt = 1 / 60;
  for (let f = 0; f < FRAMES; f++) {
    // 模拟不均匀帧间隔（含掉帧情况），验证累加器下仍可复现
    const frameDt = dt * (1 + 0.3 * Math.sin(f * 0.7));
    let acc = frameDt;
    while (acc >= dt) {
      sim.step(dt);
      acc -= dt;
    }
  }
  const s = sim.getState();
  return {
    x: Array.from(s.x.slice(0, s.count)),
    y: Array.from(s.y.slice(0, s.count)),
    vx: Array.from(s.vx.slice(0, s.count)),
    vy: Array.from(s.vy.slice(0, s.count)),
  };
}

describe('可复现性（设计文档 v0.2 §6.5，正式测试要求）', () => {
  it('同种子 + 同帧序列 → 状态逐位一致', () => {
    const a = runFrames(20261014);
    const b = runFrames(20261014);
    expect(a.x).toEqual(b.x);
    expect(a.y).toEqual(b.y);
    expect(a.vx).toEqual(b.vx);
    expect(a.vy).toEqual(b.vy);
  });

  it('不同种子 → 演化结果不同', () => {
    const a = runFrames(1);
    const b = runFrames(2);
    expect(a.x).not.toEqual(b.x);
  });

  it('Float32Array 语义：相同操作序列结果逐位一致（确定性基线）', () => {
    const a = new Float32Array(1);
    const b = new Float32Array(1);
    a[0] = 0.1;
    b[0] = 0.1;
    for (let i = 0; i < 1000; i++) {
      a[0] = a[0] * 1.0001 + 0.1;
      b[0] = b[0] * 1.0001 + 0.1;
    }
    expect(a[0]).toBe(b[0]);
  });
});

describe('数值安全', () => {
  it('积分器不传播 NaN：被重置为静止', () => {
    const sim = new DriftSimulation(4, 100, 100);
    sim.randomize(5);
    const s = sim.getState();
    // 手动注入 NaN 速度（绕过类型层面的只读约定，测试防护行为）
    (s.vx as Float32Array)[0] = Number.NaN;
    sim.step(1 / 60);
    expect(Number.isFinite(sim.getState().vx[0])).toBe(true);
    expect(Number.isFinite(sim.getState().x[0])).toBe(true);
  });
});
