import { Interaction } from './interaction';
import { describe, expect, it } from 'vitest';
import { FixedStepEngine } from './engine';
import type { Simulation, PresetData } from './types';
import { createStore } from './types';

/** 计数假模拟：记录 step 调用次数与 dt */
function makeFakeSim() {
  return {
    steps: 0,
    lastDt: 0,
    step(dt: number) {
      this.steps++;
      this.lastDt = dt;
    },
  };
}

describe('FixedStepEngine', () => {
  it('帧长恰等于 dt：推进一步，alpha 归零', () => {
    const sim = makeFakeSim();
    const engine = new FixedStepEngine(sim, { dt: 1 / 60, maxSubSteps: 4 });
    const alpha = engine.advance(1 / 60);
    expect(sim.steps).toBe(1);
    expect(sim.lastDt).toBeCloseTo(1 / 60);
    expect(alpha).toBeCloseTo(0, 5);
    expect(engine.simTime).toBeCloseTo(1 / 60);
  });

  it('帧长为 2.5 倍 dt：补两步，alpha ≈ 0.5', () => {
    const sim = makeFakeSim();
    const engine = new FixedStepEngine(sim, { dt: 1 / 60, maxSubSteps: 4 });
    const alpha = engine.advance(2.5 / 60);
    expect(sim.steps).toBe(2);
    expect(alpha).toBeCloseTo(0.5, 5);
  });

  it('超过 maxSubSteps：钳制补步数并计掉步', () => {
    const sim = makeFakeSim();
    const engine = new FixedStepEngine(sim, { dt: 1 / 60, maxSubSteps: 4 });
    engine.advance(100); // 0.25s 上限内，但欠账远超 4 步
    expect(sim.steps).toBe(4);
    expect(engine.droppedSteps).toBe(1);
  });

  it('暂停后 advance 不推进模拟；恢复后继续', () => {
    const sim = makeFakeSim();
    const engine = new FixedStepEngine(sim, { dt: 1 / 60, maxSubSteps: 4 });
    engine.advance(1 / 60);
    expect(sim.steps).toBe(1);

    engine.pause();
    engine.advance(1 / 60);
    engine.advance(1 / 60);
    expect(sim.steps).toBe(1); // 暂停期间一步都没走

    engine.resume();
    engine.advance(1 / 60);
    expect(sim.steps).toBe(2);
  });

  it('连续帧累加：两个半 dt 帧合成一步', () => {
    const sim = makeFakeSim();
    const engine = new FixedStepEngine(sim, { dt: 1 / 60, maxSubSteps: 4 });
    engine.advance(0.5 / 60);
    expect(sim.steps).toBe(0);
    engine.advance(0.5 / 60);
    expect(sim.steps).toBe(1);
  });
});

describe('Simulation 约定', () => {
  /** 最小假模拟：验证 step 开始时 prev ← curr 的约定由模式自身负责 */
  function makeRecordingSim(): Simulation & { store: ReturnType<typeof createStore> } {
    const store = createStore(4);
    store.count = 4;
    store.x.set([1, 2, 3, 4]);
    store.y.set([5, 6, 7, 8]);
    store.prevX.set([9, 9, 9, 9]);
    return {
      store,
      interaction: new Interaction(),
      particleCount: 4,
      step(_dt: number) {
        // 模式责任：先复制 prev，再推进（此处模拟前进 1）
        store.prevX.set(store.x.subarray(0, store.count));
        for (let i = 0; i < store.count; i++) store.x[i] += 1;
      },
      getState() {
        return store;
      },
      randomize() {},
      serialize(): PresetData {
        return { version: 1, mode: 'fake', seed: 0, params: {}, visual: {} };
      },
      deserialize() {},
    };
  }

  it('step 后 prevX 保存上一模拟步位置（插值前提）', () => {
    const sim = makeRecordingSim();
    sim.step(1 / 60);
    expect(Array.from(sim.store.prevX)).toEqual([1, 2, 3, 4]);
    expect(Array.from(sim.store.x)).toEqual([2, 3, 4, 5]);
  });
});

describe('setSim（M4 模式切换）', () => {
  it('更换模拟核心后 advance 驱动新核心，时钟状态保留', () => {
    let aSteps = 0;
    let bSteps = 0;
    const simA = { step() { aSteps++; } };
    const simB = { step() { bSteps++; } };
    const engine = new FixedStepEngine(simA, { dt: 1 / 60, maxSubSteps: 4 });
    engine.advance(1 / 60);
    expect(aSteps).toBe(1);
    expect(bSteps).toBe(0);

    engine.setSim(simB);
    engine.advance(1 / 60);
    expect(aSteps).toBe(1);
    expect(bSteps).toBe(1);
    expect(engine.simTime).toBeCloseTo(2 / 60);
  });
});
