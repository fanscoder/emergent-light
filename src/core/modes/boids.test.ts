import { describe, expect, it } from 'vitest';
import { BoidsSimulation, BOIDS_DEFAULTS } from './boids';

/** 受控 Boids 世界：指定数量与规则权重，其余关闭，隔离单规则行为 */
function makeWorld(
  count: number,
  patch: Partial<typeof BOIDS_DEFAULTS>,
  world = 200,
) {
  const sim = new BoidsSimulation(count, world, world);
  sim.updateParams({
    ...BOIDS_DEFAULTS,
    count,
    sepWeight: 0,
    aliWeight: 0,
    cohWeight: 0,
    maxSpeed: 40,
    maxForce: 200,
    ...patch,
  });
  sim.randomize(1);
  return sim;
}

function place(sim: BoidsSimulation, i: number, x: number, y: number, vx: number, vy: number) {
  const s = sim.getState();
  s.x[i] = x;
  s.y[i] = y;
  s.vx[i] = vx;
  s.vy[i] = vy;
  s.prevX[i] = x;
  s.prevY[i] = y;
  s.density[i] = 0;
}

function s_type(sim: BoidsSimulation, i: number, t: number): void {
  sim.getState().type[i] = t;
}

function wrapDist(sim: BoidsSimulation, i: number, j: number): number {
  const s = sim.getState();
  const w = 200;
  const dx = Math.min(Math.abs(s.x[j] - s.x[i]), w - Math.abs(s.x[j] - s.x[i]));
  const dy = Math.min(Math.abs(s.y[j] - s.y[i]), w - Math.abs(s.y[j] - s.y[i]));
  return Math.hypot(dx, dy);
}

describe('Boids 三规则（转向力模型）', () => {
  it('Cohesion：孤立粒子向邻居质心靠拢', () => {
    const sim = makeWorld(2, { cohWeight: 1, cohRadius: 100 });
    place(sim, 0, 60, 100, 0, 0);
    place(sim, 1, 140, 100, 0, 0);
    const before = wrapDist(sim, 0, 1);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    expect(wrapDist(sim, 0, 1)).toBeLessThan(before - 5);
  });

  it('Separation：过近粒子互相推开', () => {
    const sim = makeWorld(2, { sepWeight: 1, sepRadius: 40 });
    place(sim, 0, 95, 100, 0, 0);
    place(sim, 1, 105, 100, 0, 0);
    const before = wrapDist(sim, 0, 1);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    expect(wrapDist(sim, 0, 1)).toBeGreaterThan(before + 3);
  });

  it('Alignment：多数方向胜出，反向粒子转向群体（三粒子民主）', () => {
    // 关掉个体方向性，单测对齐规则本身（selfPropel 会刻意对抗对齐）
    const sim = makeWorld(3, { aliWeight: 1, aliRadius: 100, selfPropel: 0 });
    place(sim, 0, 60, 80, 20, 0);
    place(sim, 1, 60, 100, 20, 0);
    place(sim, 2, 60, 120, -20, 0); // 唯一的"逆行者"
    for (let i = 0; i < 240; i++) sim.step(1 / 60);
    const s = sim.getState();
    for (let i = 0; i < 3; i++) {
      expect(s.vx[i]).toBeGreaterThan(5); // 全体转向 +x 方向
    }
  });

  it('wrap 边界：跨边缘邻居被三规则感知', () => {
    const sim = makeWorld(2, { cohWeight: 1, cohRadius: 60 });
    place(sim, 0, 5, 100, 0, 0);
    place(sim, 1, 195, 100, 0, 0); // 环绕距离 10
    const before = Math.min(wrapDist(sim, 0, 1), 200 - wrapDist(sim, 0, 1));
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const d = wrapDist(sim, 0, 1);
    const wrapD = Math.min(d, 200 - d);
    expect(wrapD).toBeLessThan(before - 2);
  });

  it('渲染契约：Boids 的 lifeFrac 恒为 1（不开寿命系统）', () => {
    const sim = makeWorld(10, {});
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const s = sim.getState();
    for (let i = 0; i < s.count; i++) {
      expect(s.lifeFrac[i]).toBe(1);
    }
  });
});

/** 全局极化度 = |Σv⃗| / Σ|v⃗|：0 = 各向随机，1 = 全体同向 */
function polarOf(sim: BoidsSimulation): number {
  const s = sim.getState();
  let sx = 0;
  let sy = 0;
  let sm = 0;
  for (let i = 0; i < s.count; i++) {
    sx += s.vx[i];
    sy += s.vy[i];
    sm += Math.hypot(s.vx[i], s.vy[i]);
  }
  return Math.hypot(sx, sy) / sm;
}

describe('Boids 活力版行为（v0.5.1 实测现象：局部成群 + 全局多洋流）', () => {
  it('个体方向性：无邻居影响时速度跟随个人 heading', () => {
    // 大世界中 5 条互不感知的鱼，只靠 selfPropel 应朝各自 heading 巡游
    const sim = new BoidsSimulation(5, 4000, 4000);
    sim.updateParams({
      ...BOIDS_DEFAULTS,
      count: 5,
      sepWeight: 0,
      aliWeight: 0,
      cohWeight: 0,
      selfPropel: 1.2,
    });
    sim.randomize(1);
    for (let i = 0; i < 300; i++) sim.step(1 / 60);
    const s = sim.getState();
    for (let i = 0; i < 5; i++) {
      const vm = Math.hypot(s.vx[i], s.vy[i]);
      const hx = Math.cos(sim.headings[i]);
      const hy = Math.sin(sim.headings[i]);
      expect((s.vx[i] * hx + s.vy[i] * hy) / vm).toBeGreaterThan(0.8);
    }
  });

  it('距离衰减：近邻的方向影响远大于远邻（近邻权重要求）', () => {
    const sim = new BoidsSimulation(3, 800, 600);
    sim.updateParams({
      ...BOIDS_DEFAULTS,
      count: 3,
      sepWeight: 0,
      cohWeight: 0,
      selfPropel: 0,
      aliWeight: 1,
      aliRadius: 90,
      maxSpeed: 40,
      maxForce: 200,
    });
    sim.randomize(1);
    place(sim, 0, 400, 300, 0, 0); // 观察者，初始静止
    place(sim, 1, 400, 320, 0, 20); // 近邻 d=20（权重 0.78），游向 +y
    place(sim, 2, 400, 370, 0, -20); // 远邻 d=70（权重 0.22），游向 −y
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const s = sim.getState();
    // 若距离加权缺失（等权），两个邻居方向相反会抵消，vy 应接近 0
    expect(s.vy[0]).toBeGreaterThan(5);
  });

  it('同类偏好：同类型邻居的方向影响压倒更近的异类', () => {
    const sim = new BoidsSimulation(3, 800, 600);
    sim.updateParams({
      ...BOIDS_DEFAULTS,
      count: 3,
      sepWeight: 0,
      cohWeight: 0,
      selfPropel: 0,
      aliWeight: 1,
      aliRadius: 90,
      sameTypeBias: 2,
      maxSpeed: 40,
      maxForce: 200,
      typePalette: [0, 1],
      typeShares: [1, 1],
    });
    sim.randomize(1);
    place(sim, 0, 400, 300, 0, 0); // 观察者 type 0，初始静止
    s_type(sim, 0, 0);
    place(sim, 1, 400, 350, 20, 0); // 同类 d=50（远）游向 +x
    s_type(sim, 1, 0);
    place(sim, 2, 400, 320, 0, 20); // 异类 d=20（近）游向 +y
    s_type(sim, 2, 1);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const s = sim.getState();
    // 无同类偏好时近邻（+y）会赢；bias=2 后同类（+x）应胜出
    expect(s.vx[0]).toBeGreaterThan(5);
    expect(s.vx[0]).toBeGreaterThan(s.vy[0]);
  });

  it('类型占比：亮色族群只占少量（抽样服从 typeShares）', () => {
    const sim = new BoidsSimulation(400, 800, 600);
    sim.updateParams({
      ...BOIDS_DEFAULTS,
      count: 400,
      typePalette: [0, 1, 4],
      typeShares: [0.5, 0.25, 0.25],
    });
    sim.randomize(1);
    const s = sim.getState();
    let accent = 0;
    for (let i = 0; i < s.count; i++) if (s.type[i] === 4) accent++;
    // 期望 100 个，容差 ±30（可复现种子下是确定值）
    expect(accent).toBeGreaterThan(70);
    expect(accent).toBeLessThan(130);
  });

  it('活力：平均速度 ≥ 0.35 × maxSpeed（持续巡游不停滞）', () => {
    const sim = new BoidsSimulation(200, 800, 600);
    sim.updateParams({ ...BOIDS_DEFAULTS });
    sim.randomize(42);
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    const s = sim.getState();
    let sum = 0;
    for (let i = 0; i < s.count; i++) sum += Math.hypot(s.vx[i], s.vy[i]);
    expect(sum / s.count).toBeGreaterThan(0.35 * BOIDS_DEFAULTS.maxSpeed);
  });
});

describe('Boids 群体涌现与工程质量', () => {
  it('局部成群、全局多洋流：极化度居中且长跑 40 秒不锁死', () => {
    // v0.5.1 实测现象：拒绝全视野方向一致（v0.5.0 默认极化度 0.95 被否），
    // 要局部趋同 + 多股洋流持续交互
    const sim = new BoidsSimulation(200, 800, 600);
    sim.updateParams({ ...BOIDS_DEFAULTS });
    sim.randomize(42);
    let p600 = 0;
    for (let i = 0; i < 2400; i++) {
      sim.step(1 / 60);
      if (i === 599) p600 = polarOf(sim);
    }
    const p2400 = polarOf(sim);

    const base = new BoidsSimulation(200, 800, 600);
    base.updateParams({ ...BOIDS_DEFAULTS, sepWeight: 0, aliWeight: 0, cohWeight: 0, selfPropel: 0 });
    base.randomize(42);
    for (let i = 0; i < 600; i++) base.step(1 / 60);

    console.log(`极化度: 基线 ${polarOf(base).toFixed(3)}, 600步 ${p600.toFixed(3)}, 2400步 ${p2400.toFixed(3)}`);
    expect(polarOf(base)).toBeLessThan(0.15);
    expect(p600).toBeGreaterThan(0.2); // 局部成群带来适度秩序
    expect(p600).toBeLessThan(0.6); // 但远未全视野一致
    expect(p2400).toBeLessThan(0.35); // 长跑不锁死（纯鱼群对照 2400 步会升到 0.83）
  });

  it('速度有界、无 NaN（三规则全开长跑 600 步）', () => {
    const sim = new BoidsSimulation(200, 800, 600);
    sim.updateParams({ ...BOIDS_DEFAULTS });
    sim.randomize(42);
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    const s = sim.getState();
    for (let i = 0; i < s.count; i++) {
      expect(Math.hypot(s.vx[i], s.vy[i])).toBeLessThanOrEqual(BOIDS_DEFAULTS.maxSpeed + 1e-3);
      expect(Number.isFinite(s.x[i])).toBe(true);
      expect(Number.isFinite(s.y[i])).toBe(true);
    }
    expect(sim.nanFixCount).toBe(0);
  });

  it('同种子两次运行演化逐位一致', () => {
    const a = new BoidsSimulation(200, 800, 600);
    const b = new BoidsSimulation(200, 800, 600);
    a.updateParams({ ...BOIDS_DEFAULTS });
    b.updateParams({ ...BOIDS_DEFAULTS });
    a.randomize(20261104);
    b.randomize(20261104);
    for (let i = 0; i < 300; i++) {
      a.step(1 / 60);
      b.step(1 / 60);
    }
    const sa = a.getState();
    const sb = b.getState();
    expect(Array.from(sa.x)).toEqual(Array.from(sb.x));
    expect(Array.from(sa.vx)).toEqual(Array.from(sb.vx));
  });

  it('Preset 序列化往返：加载后继续演化与源一致', () => {
    const src = new BoidsSimulation(200, 800, 600);
    src.updateParams({ ...BOIDS_DEFAULTS, aliWeight: 1.7 });
    src.randomize(7);
    const preset = structuredClone(src.serialize());
    for (let i = 0; i < 150; i++) src.step(1 / 60);
    const dst = new BoidsSimulation(200, 800, 600);
    dst.deserialize(preset);
    for (let i = 0; i < 150; i++) dst.step(1 / 60);
    expect(Array.from(dst.getState().x)).toEqual(Array.from(src.getState().x));
    expect(dst.paramsSnapshot.aliWeight).toBe(1.7);
  });
});

describe('个体光晕差异（glowJit）', () => {
  it('初始化采样：个体差异存在、同种子可复现、截断在 ±2', () => {
    const a = new BoidsSimulation(100, 800, 600);
    a.updateParams({ ...BOIDS_DEFAULTS, count: 100 });
    a.randomize(7);
    const b = new BoidsSimulation(100, 800, 600);
    b.updateParams({ ...BOIDS_DEFAULTS, count: 100 });
    b.randomize(7);
    const sa = a.getState();
    const sb = b.getState();
    const values: number[] = [];
    for (let i = 0; i < 100; i++) {
      values.push(sa.glowJit[i]);
      expect(sa.glowJit[i]).toBe(sb.glowJit[i]); // 同种子一致
      expect(Math.abs(sa.glowJit[i])).toBeLessThanOrEqual(2); // 截断
    }
    // 确实有差异（不是常量），且均值接近 0（正态）
    const mean = values.reduce((x, y) => x + y, 0) / values.length;
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(1);
    expect(Math.abs(mean)).toBeLessThan(0.5);
  });
});
