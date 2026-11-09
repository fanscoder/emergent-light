import { describe, expect, it } from 'vitest';
import { ParticleLifeSimulation, PARTICLE_LIFE_DEFAULTS } from './particle-life';
import { generateMatrix } from '../matrix-gen';
import { Rng } from '../rng';

function distance(sim: ParticleLifeSimulation, i: number, j: number): number {
  const s = sim.getState();
  const dx = s.x[j] - s.x[i];
  const dy = s.y[j] - s.y[i];
  return Math.hypot(dx, dy);
}

/** 两粒子世界：直接布点 + 自定义矩阵，隔离测试力行为 */
function makeTwoParticleWorld(k: number, boundary: 'wrap' | 'repel' = 'repel') {
  const sim = new ParticleLifeSimulation(4, 200, 200);
  // 关掉自驱动与寿命，隔离测试纯力行为；count=2 排除随机额外粒子的干扰
  sim.updateParams({ count: 2, types: 2, boundary, matrixStyle: 'random', selfPropel: 0, lifeEnabled: false });
  sim.randomize(1);
  sim.setPairParams(0, 1, k, 0.3, 100);
  sim.setPairParams(1, 0, k, 0.3, 100);
  const s = sim.getState();
  // 固定类型与初始状态，确保测试只受设定矩阵支配（randomize 随机分配的类型/位置不干扰）
  s.type[0] = 0;
  s.type[1] = 1;
  s.x[0] = 60;
  s.y[0] = 100;
  s.x[1] = 140;
  s.y[1] = 100;
  s.vx[0] = s.vy[0] = s.vx[1] = s.vy[1] = 0;
  s.prevX.set(s.x.subarray(0, 2));
  s.prevY.set(s.y.subarray(0, 2));
  return sim;
}

describe('相互作用矩阵生成器', () => {
  it('全随机：k 有界于 [-1,1]，core/radius 在区间内', () => {
    const m = generateMatrix(new Rng(42), 4, 'random');
    for (let i = 0; i < 16; i++) {
      expect(Math.abs(m.k[i])).toBeLessThanOrEqual(1);
      expect(m.core[i]).toBeGreaterThanOrEqual(0.25);
      expect(m.core[i]).toBeLessThanOrEqual(0.45);
      expect(m.radius[i]).toBeGreaterThanOrEqual(50);
      expect(m.radius[i]).toBeLessThanOrEqual(110);
    }
  });

  it('对称风格：矩阵严格对称', () => {
    const m = generateMatrix(new Rng(7), 5, 'symmetric');
    for (let a = 0; a < 5; a++) {
      for (let b = 0; b < 5; b++) {
        expect(m.k[a * 5 + b]).toBe(m.k[b * 5 + a]);
        expect(m.core[a * 5 + b]).toBe(m.core[b * 5 + a]);
        expect(m.radius[a * 5 + b]).toBe(m.radius[b * 5 + a]);
      }
    }
  });

  it('稀疏风格：大部分类型对为中性（k = 0），但每类型至少有一个对外作用', () => {
    const m = generateMatrix(new Rng(11), 6, 'sparse');
    let zeros = 0;
    for (let i = 0; i < 36; i++) if (m.k[i] === 0) zeros++;
    expect(zeros).toBeGreaterThan(8); // 保持稀疏感
    for (let a = 0; a < 6; a++) {
      const hasOutgoing = Array.from({ length: 6 }, (_, b) => m.k[a * 6 + b]).some(
        (k, b) => b !== a && k !== 0,
      );
      expect(hasOutgoing).toBe(true); // 不存在旁观类型
    }
  });

  it('三种风格：对角线 k ∈ (0, 0.4] 弱自聚 + 宽排斥核（防坍缩且不成环）', () => {
    for (const style of ['random', 'symmetric', 'sparse'] as const) {
      const m = generateMatrix(new Rng(3), 4, style);
      for (let a = 0; a < 4; a++) {
        expect(m.k[a * 4 + a]).toBeGreaterThan(0);
        expect(m.k[a * 4 + a]).toBeLessThanOrEqual(0.4);
        expect(m.core[a * 4 + a]).toBeGreaterThanOrEqual(0.35);
      }
    }
  });

  it('同种子同风格 → 矩阵逐位一致', () => {
    const a = generateMatrix(new Rng(99), 4, 'sparse');
    const b = generateMatrix(new Rng(99), 4, 'sparse');
    expect(Array.from(a.k)).toEqual(Array.from(b.k));
  });
});

describe('力行为（涌现正确性基础）', () => {
  it('吸引对（k>0）：中程距离下两粒子靠近', () => {
    const sim = makeTwoParticleWorld(1);
    const before = distance(sim, 0, 1); // 80，吸引瓣内
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    expect(distance(sim, 0, 1)).toBeLessThan(before - 5);
  });

  it('排斥对（k<0）：中程距离下两粒子远离', () => {
    const sim = makeTwoParticleWorld(-1);
    const before = distance(sim, 0, 1);
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    expect(distance(sim, 0, 1)).toBeGreaterThan(before + 5);
  });

  it('近距离不坍缩：强吸引下仍有最小间距（排斥核生效）', () => {
    const sim = makeTwoParticleWorld(1);
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    expect(distance(sim, 0, 1)).toBeGreaterThan(10); // R=100, core=0.3 → 排斥区 ~30
  });

  it('wrap 边界：跨边缘粒子按环绕距离吸引', () => {
    const sim = makeTwoParticleWorld(1, 'wrap');
    const s = sim.getState();
    s.type[0] = 0;
    s.type[1] = 1;
    s.x[0] = 5;
    s.y[0] = 100;
    s.x[1] = 195;
    s.y[1] = 100;
    const before = distance(sim, 0, 1); // 直线距离 190，环绕距离 10
    for (let i = 0; i < 30; i++) sim.step(1 / 60);
    // 环绕距离应缩小（粒子绕边界会合），直线距离可能增大
    const wrapDist = Math.min(distance(sim, 0, 1), 200 - distance(sim, 0, 1));
    expect(wrapDist).toBeLessThan(before - 5);
  });
});

describe('局部密度计数（密度感知调光的模拟侧基础）', () => {
  it('相互作用中的邻居被计入密度，超出作用半径的不计', () => {
    const near = makeTwoParticleWorld(1);
    near.step(1 / 60); // 距离 80 < 半径 100
    const sn = near.getState();
    expect(sn.density[0]).toBe(1);
    expect(sn.density[1]).toBe(1);

    const far = makeTwoParticleWorld(1);
    const sf = far.getState();
    sf.x[1] = 190; // 距离 130 > 半径 100
    sf.prevX[1] = 190;
    far.step(1 / 60);
    expect(far.getState().density[0]).toBe(0);
    expect(far.getState().density[1]).toBe(0);
  });

  it('密集堆叠：N 个同点粒子的密度 ≈ N−1（防过曝调光的极端场景）', () => {
    const N = 50;
    const sim = new ParticleLifeSimulation(N, 400, 400);
    sim.updateParams({ types: 1, matrixStyle: 'random', selfPropel: 0, lifeEnabled: false });
    sim.randomize(9);
    const s = sim.getState();
    for (let i = 0; i < N; i++) {
      s.type[i] = 0;
      s.x[i] = 200;
      s.y[i] = 200;
      s.vx[i] = s.vy[i] = 0;
    }
    sim.step(1 / 60);
    const sd = sim.getState();
    for (let i = 0; i < N; i++) {
      expect(sd.density[i]).toBe(N - 1);
    }
  });
});

describe('可复现性与序列化', () => {
  it('同种子两次运行演化逐位一致', () => {
    const a = new ParticleLifeSimulation(500, 1920, 1080);
    const b = new ParticleLifeSimulation(500, 1920, 1080);
    a.randomize(20261014);
    b.randomize(20261014);
    for (let i = 0; i < 300; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    const sa = a.getState();
    const sb = b.getState();
    expect(Array.from(sa.x)).toEqual(Array.from(sb.x));
    expect(Array.from(sa.y)).toEqual(Array.from(sb.y));
  });

  it('不同种子 → 演化不同', () => {
    const a = new ParticleLifeSimulation(200, 800, 600);
    const b = new ParticleLifeSimulation(200, 800, 600);
    a.randomize(1);
    b.randomize(2);
    for (let i = 0; i < 120; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    expect(Array.from(a.getState().x)).not.toEqual(Array.from(b.getState().x));
  });

  it('Preset 序列化往返：加载后继续演化与源一致', () => {
    const src = new ParticleLifeSimulation(500, 1920, 1080);
    src.randomize(42);
    const preset = structuredClone(src.serialize());
    // 源继续跑 200 步
    for (let i = 0; i < 200; i++) src.step(1 / 60);
    // 新实例从同一 preset 出发跑同样 200 步
    const dst = new ParticleLifeSimulation(500, 1920, 1080);
    dst.deserialize(preset);
    for (let i = 0; i < 200; i++) dst.step(1 / 60);
    const sa = src.getState();
    const sb = dst.getState();
    expect(Array.from(sa.x)).toEqual(Array.from(sb.x));
    expect(Array.from(sa.y)).toEqual(Array.from(sb.y));
    // 矩阵也确实被保存与恢复
    expect(dst.serialize().matrix?.k).toEqual(src.serialize().matrix?.k);
  });

  it('resize 不重置模拟状态', () => {
    const sim = new ParticleLifeSimulation(100, 800, 600);
    sim.randomize(3);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const before = Array.from(sim.getState().x.slice(0, 10));
    sim.setWorldSize(1920, 1080);
    expect(Array.from(sim.getState().x.slice(0, 10))).toEqual(before);
  });
});

describe('涌现冒烟测试与性能', () => {
  /** 平均最近邻距离（越小越聚集） */
  function meanNearestNeighbor(sim: ParticleLifeSimulation): number {
    const s = sim.getState();
    const n = s.count;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = Math.min(Math.abs(s.x[j] - s.x[i]), 1920 - Math.abs(s.x[j] - s.x[i]));
        const dy = Math.min(Math.abs(s.y[j] - s.y[i]), 1080 - Math.abs(s.y[j] - s.y[i]));
        const d = dx * dx + dy * dy;
        if (d < best) best = d;
      }
      sum += Math.sqrt(best);
    }
    return sum / n;
  }

  it('团块有内部间距：自排斥使聚集结构不会坍缩成一个点（视觉回归测试）', () => {
    const sim = new ParticleLifeSimulation(200, 800, 600);
    sim.updateParams({ types: 2, matrixStyle: 'random', lifeEnabled: false });
    sim.randomize(8);
    sim.setPairParams(0, 1, 0.9, 0.3, 100);
    sim.setPairParams(1, 0, 0.9, 0.3, 100);
    for (let i = 0; i < 1200; i++) sim.step(1 / 60);
    // 强吸引 + 自排斥 → 应形成有内部间距的团块，而非所有粒子重合
    const nn = meanNearestNeighbor(sim);
    expect(nn).toBeGreaterThan(3);
    expect(sim.nanFixCount).toBe(0);
  });

  it('全吸引矩阵：600 步后系统比初始更聚集（涌现行为的最低验证）', () => {
    const sim = new ParticleLifeSimulation(300, 1920, 1080);
    sim.updateParams({ types: 2, matrixStyle: 'random', lifeEnabled: false });
    sim.randomize(5);
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) sim.setPairParams(a, b, 0.9, 0.3, 100);
    const start = meanNearestNeighbor(sim);
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    const end = meanNearestNeighbor(sim);
    expect(end).toBeLessThan(start * 0.75);
    expect(sim.nanFixCount).toBe(0);
  });

  it('全排斥矩阵：600 步后系统比初始更分散', () => {
    const sim = new ParticleLifeSimulation(300, 1920, 1080);
    sim.updateParams({ types: 2, matrixStyle: 'random', lifeEnabled: false });
    sim.randomize(6);
    for (let a = 0; a < 2; a++)
      for (let b = 0; b < 2; b++) sim.setPairParams(a, b, -0.9, 0.3, 100);
    const start = meanNearestNeighbor(sim);
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    const end = meanNearestNeighbor(sim);
    expect(end).toBeGreaterThan(start * 1.1);
  });

  it('持续运动不冻结：默认参数跑 2400 步（40 秒）后系统仍有显著运动（视觉回归测试）', () => {
    const sim = new ParticleLifeSimulation(300, 1920, 1080);
    sim.updateParams({ ...PARTICLE_LIFE_DEFAULTS });
    sim.randomize(20261103);
    for (let i = 0; i < 2400; i++) sim.step(1 / 60);
    // 平均速度必须保持在阈值以上：旧参数（gamma 1.2 / jitter 9）会冻结在此测试失败
    const s = sim.getState();
    let sum = 0;
    for (let i2 = 0; i2 < s.count; i2++) {
      sum += Math.hypot(s.vx[i2], s.vy[i2]);
    }
    const avgSpeed = sum / s.count;
    console.log(`2400 步后平均速度: ${avgSpeed.toFixed(2)} 单位/秒`);
    expect(avgSpeed).toBeGreaterThan(1.5);
    // 同时系统不能完全散成均匀气体：仍保有结构（最近邻距离显著小于均匀分布）
    expect(meanNearestNeighbor(sim)).toBeLessThan(60);
  });

  it('寿命正态分布：均值/标准差近似，且全部不低于下限', () => {
    const sim = new ParticleLifeSimulation(500, 1920, 1080);
    sim.updateParams({ ...PARTICLE_LIFE_DEFAULTS });
    sim.randomize(42);
    const s = sim.getState();
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < s.count; i++) {
      expect(s.lifespan[i]).toBeGreaterThanOrEqual(PARTICLE_LIFE_DEFAULTS.lifeMin);
      sum += s.lifespan[i];
      sumSq += s.lifespan[i] * s.lifespan[i];
    }
    const mean = sum / s.count;
    const std = Math.sqrt(sumSq / s.count - mean * mean);
    console.log(`寿命分布: 均值 ${mean.toFixed(1)}s, 标准差 ${std.toFixed(1)}s`);
    expect(mean).toBeGreaterThan(70);
    expect(mean).toBeLessThan(110);
    expect(std).toBeGreaterThan(30);
  });

  it('寿命系统：短寿命配置下粒子持续死亡重生，数量恒定，状态合法', () => {
    const sim = new ParticleLifeSimulation(200, 800, 600);
    sim.updateParams({
      ...PARTICLE_LIFE_DEFAULTS,
      lifeMean: 2,
      lifeStd: 1,
      lifeMin: 0.5,
      lifeFade: 0.5,
    });
    sim.randomize(7);
    let sawRespawn = false;
    let violations = 0;
    for (let step = 0; step < 600; step++) {
      sim.step(1 / 60);
      // 廉价内联检查（每步执行）；vitest 断言开销大，只在末尾统一断言
      const s = sim.getState();
      if (s.count !== 200) violations++;
      for (let i = 0; i < s.count; i++) {
        if (!(s.age[i] < s.lifespan[i])) violations++;
        if (!(s.lifeFrac[i] >= 0 && s.lifeFrac[i] <= 1)) violations++;
        if (!Number.isFinite(s.x[i])) violations++;
        if (s.age[i] < 1 / 60 / 2) sawRespawn = true;
      }
    }
    expect(violations).toBe(0);
    expect(sawRespawn).toBe(true);
    expect(sim.nanFixCount).toBe(0);
  });

  it('寿命系统可复现：短寿命 + 同种子，含死亡重生的演化逐位一致', () => {
    const a = new ParticleLifeSimulation(200, 800, 600);
    const b = new ParticleLifeSimulation(200, 800, 600);
    const params = { ...PARTICLE_LIFE_DEFAULTS, lifeMean: 1, lifeStd: 0.5, lifeMin: 0.3, lifeFade: 0.3 };
    a.updateParams(params);
    b.updateParams(params);
    a.randomize(20261104);
    b.randomize(20261104);
    for (let i = 0; i < 600; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    const sa = a.getState();
    const sb = b.getState();
    expect(Array.from(sa.x)).toEqual(Array.from(sb.x));
    expect(Array.from(sa.age)).toEqual(Array.from(sb.age));
    expect(Array.from(sa.lifespan)).toEqual(Array.from(sb.lifespan));
    expect(Array.from(sa.theta)).toEqual(Array.from(sb.theta));
  });

  it('洋流式定向运动：3 秒后速度方向仍显著相关（自驱动 vs 纯阻尼的判别测试）', () => {
    const sim = new ParticleLifeSimulation(300, 1920, 1080);
    sim.updateParams({ ...PARTICLE_LIFE_DEFAULTS });
    sim.randomize(20261103);
    for (let i = 0; i < 1200; i++) sim.step(1 / 60);
    const s = sim.getState();
    const vx1 = Float32Array.from(s.vx.slice(0, s.count));
    const vy1 = Float32Array.from(s.vy.slice(0, s.count));
    for (let i = 0; i < 180; i++) sim.step(1 / 60); // 3 秒
    let acc = 0;
    let used = 0;
    for (let i = 0; i < s.count; i++) {
      const m1 = Math.hypot(vx1[i], vy1[i]);
      const m2 = Math.hypot(s.vx[i], s.vy[i]);
      if (m1 < 0.5 || m2 < 0.5) continue; // 跳过近静止粒子
      acc += (vx1[i] * s.vx[i] + vy1[i] * s.vy[i]) / (m1 * m2);
      used++;
    }
    const corr = acc / Math.max(used, 1);
    console.log(`3 秒速度方向自相关: ${corr.toFixed(3)}（有效样本 ${used}）`);
    // 纯阻尼系统 3 秒后约 e^(-1.8) ≈ 0.17；自驱动洋流应显著更高
    expect(corr).toBeGreaterThan(0.3);
  });

  it('500 粒子单步耗时实测（宽松阈值 < 10ms，真实数据见交付报告）', () => {
    const sim = new ParticleLifeSimulation(500, 1920, 1080);
    sim.updateParams({ ...PARTICLE_LIFE_DEFAULTS });
    sim.randomize(20261014);
    for (let i = 0; i < 60; i++) sim.step(1 / 60); // 预热
    const t0 = performance.now();
    const STEPS = 300;
    for (let i = 0; i < STEPS; i++) sim.step(1 / 60);
    const avg = (performance.now() - t0) / STEPS;
    console.log(`particle-life 500 粒子平均单步耗时: ${avg.toFixed(3)} ms`);
    expect(avg).toBeLessThan(10);
  });
});
