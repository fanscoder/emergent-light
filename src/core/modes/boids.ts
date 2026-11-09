import { Interaction } from '../interaction';
// Boids / Flocking 模拟模式（M3，v0.5.1 活力改版）。
//
// Reynolds 三规则 + 转向力模型（steer = desired − velocity，限制 maxForce）：
// - Separation：避开过近邻居（按 1/d 加权，越近推得越狠）
// - Alignment：与邻居速度方向对齐（按 1−d/R 距离加权，越近影响越大）
// - Cohesion：向邻居质心靠拢（同样距离加权）
// - SelfPropel：个体方向性——每条粒子有自己的游动方向偏好 heading（缓慢随机游走），
//   持续推力朝该方向，但会被邻居三规则带偏（v0.5.0 视觉校准：
//   "鱼群要有活力、不要全视野方向一致"，即局部趋同 + 全局多股洋流）
// 每个规则有独立的感知半径与权重；空间哈希与渲染管线与 Particle Life 完全复用。
//
// 渲染契约注意：DeepOceanRenderer 会读取 lifeFrac（生灭渐隐）与 density（密度调光），
// 本模式不开寿命系统，因此 lifeFrac 恒为 1，density 统计感知半径内邻居数。

import type { BoundaryMode, ParticleStore, PresetData, Simulation } from '../types';
import { createStore } from '../types';
import { Rng } from '../rng';
import { SpatialHash } from '../spatial-hash';
import { applyBoundary, copyPrev, integrate } from '../integrator';

export interface BoidsParams {
  count: number;
  types: number;
  maxSpeed: number;
  maxForce: number;
  sepRadius: number;
  sepWeight: number;
  aliRadius: number;
  aliWeight: number;
  cohRadius: number;
  cohWeight: number;
  /** 个体方向推力权重：0 = 纯 Reynolds 鱼群，越大越"我行我素" */
  selfPropel: number;
  /** 个体方向随机游走强度（rad²/s，布朗式：方差率；0.02 ≈ 约 1 分钟变一次主方向） */
  headingDrift: number;
  /** 同类偏好：同类型邻居的对齐/聚集影响 ×(1+bias)，0 = 类型无差别（v0.5.1 视觉校准：亮色族群更爱找同类） */
  sameTypeBias: number;
  /** 类型→调色板索引映射（长度即类型数；types 字段保留兼容但由本数组长度决定） */
  typePalette: number[];
  /** 各类型占比（归一化前的权重，长度须与 typePalette 一致；默认均匀） */
  typeShares: number[];
  boundary: BoundaryMode;
}

/** 深海鱼群默认值：局部成群、全局多股洋流（v0.5.0 参数校准） */
export const BOIDS_DEFAULTS: BoidsParams = {
  count: 300,
  // 三族群：暗青 + 深蓝为主体（各约 42.5%），琥珀暖光为少量点缀（15%，v0.5.1 视觉校准）
  types: 3,
  typePalette: [0, 1, 4], // 索引 4 = 主题新增琥珀暖光（避开索引 3 淡金，保持 Particle Life 观感不变）
  typeShares: [0.425, 0.425, 0.15],
  maxSpeed: 60,
  maxForce: 120,
  sepRadius: 22,
  sepWeight: 1.5,
  // 对齐半径取小值：160px 会让全视野方向完全一致（极化度 0.95，实测现象"没有活力"）。
  // 90px 配合较强个体方向性（selfPropel 1.2）得到：局部成群（局部对齐 0.85）、
  // 全局多股洋流互不统合（长跑 2400 步全局极化度仅 0.06，纯鱼群对照会升到 0.83）。
  // 参数扫描见 v0.5.1 交付记录
  aliRadius: 90,
  aliWeight: 1.2,
  cohRadius: 70,
  cohWeight: 0.6,
  selfPropel: 1.2,
  headingDrift: 0.02,
  sameTypeBias: 1.0,
  boundary: 'wrap',
};

/** 归一化类型配置：types 与 typeShares 长度对齐 typePalette，坏值回退均匀 */
function normalizeTypes(p: BoidsParams): BoidsParams {
  const palette = p.typePalette.length > 0 ? p.typePalette : [0, 1];
  const shares =
    p.typeShares.length === palette.length && p.typeShares.every((s) => s > 0 && Number.isFinite(s))
      ? p.typeShares
      : palette.map(() => 1);
  return { ...p, types: palette.length, typePalette: palette, typeShares: shares };
}

const MIN_RADIUS = 20;

/** 转向力：把期望方向（单位化 × maxSpeed）换算为受限转向力 */
function steer(
  desiredX: number,
  desiredY: number,
  vx: number,
  vy: number,
  maxSpeed: number,
  maxForce: number,
): [number, number] {
  const m = Math.hypot(desiredX, desiredY);
  if (m < 1e-9) return [0, 0];
  let sx = (desiredX / m) * maxSpeed - vx;
  let sy = (desiredY / m) * maxSpeed - vy;
  const sm = Math.hypot(sx, sy);
  if (sm > maxForce) {
    sx = (sx / sm) * maxForce;
    sy = (sy / sm) * maxForce;
  }
  return [sx, sy];
}

export class BoidsSimulation implements Simulation {
  readonly interaction = new Interaction();
  private readonly store: ParticleStore;
  private readonly ax: Float32Array;
  private readonly ay: Float32Array;
  /** 每条粒子的个人游动方向（弧度），随时间缓慢随机游走 */
  readonly headings: Float32Array;
  private readonly rng = new Rng(0);
  private params: BoidsParams = { ...BOIDS_DEFAULTS };
  private hash: SpatialHash;
  private worldWidth: number;
  private worldHeight: number;
  private queryRadius: number;
  private seed = 1;
  private nanFixed = 0;

  constructor(capacity: number, worldWidth = 960, worldHeight = 540) {
    this.store = createStore(capacity);
    this.ax = new Float32Array(capacity);
    this.ay = new Float32Array(capacity);
    this.headings = new Float32Array(capacity);
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.queryRadius = MIN_RADIUS;
    this.hash = new SpatialHash(worldWidth, worldHeight, this.queryRadius, true, capacity);
  }

  get particleCount(): number {
    return this.store.count;
  }

  getState(): Readonly<ParticleStore> {
    return this.store;
  }

  get paramsSnapshot(): BoidsParams {
    return { ...this.params };
  }

  get nanFixCount(): number {
    return this.nanFixed;
  }

  updateParams(patch: Partial<BoidsParams>): void {
    this.params = normalizeTypes({ ...this.params, ...patch });
    this.refreshQueryRadius();
  }

  randomize(seed: number): void {
    this.interaction.reset(seed);
    this.store.eggTint.fill(0);
    this.seed = seed >>> 0;
    this.rng.setState(this.seed);
    this.initBoids();
  }

  private refreshQueryRadius(): void {
    const p = this.params;
    const max = Math.max(MIN_RADIUS, p.sepRadius, p.aliRadius, p.cohRadius);
    if (max !== this.queryRadius) {
      this.queryRadius = max;
      this.hash = new SpatialHash(
        this.worldWidth,
        this.worldHeight,
        max,
        p.boundary === 'wrap',
        this.store.capacity,
      );
    } else {
      this.hash = new SpatialHash(
        this.worldWidth,
        this.worldHeight,
        max,
        p.boundary === 'wrap',
        this.store.capacity,
      );
    }
  }

  private initBoids(): void {
    const { count, typePalette, typeShares, maxSpeed } = this.params;
    const n = Math.min(count, this.store.capacity);
    this.store.count = n;
    // 类型占比 → 累积分布（设计要求亮色族群只占少量）
    const cum: number[] = [];
    let acc = 0;
    for (const s of typeShares) {
      acc += s;
      cum.push(acc);
    }
    for (let i = 0; i < n; i++) {
      this.store.x[i] = this.rng.range(0, this.worldWidth);
      this.store.y[i] = this.rng.range(0, this.worldHeight);
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(0.3, 0.7) * maxSpeed;
      this.store.vx[i] = Math.cos(angle) * speed;
      this.store.vy[i] = Math.sin(angle) * speed;
      const r = this.rng.range(0, acc);
      let k = 0;
      while (k < cum.length - 1 && r >= cum[k]) k++;
      this.store.type[i] = typePalette[k];
      this.headings[i] = this.rng.range(0, Math.PI * 2);
      this.store.glowJit[i] = Math.max(-2, Math.min(2, this.rng.normal()));
      // Boids 不开寿命系统：渲染契约要求 lifeFrac 恒为 1
      this.store.lifeFrac[i] = 1;
    }
    copyPrev(this.store);
  }

  step(dt: number): void {
    const s = this.store;
    const n = s.count;
    const p = this.params;
    const wrap = p.boundary === 'wrap';
    const w = this.worldWidth;
    const h = this.worldHeight;

    const sepR2 = p.sepRadius * p.sepRadius;
    const aliR2 = p.aliRadius * p.aliRadius;
    const cohR2 = p.cohRadius * p.cohRadius;

    copyPrev(s);
    this.interaction.begin(s, dt, w, h);
    this.hash.rebuild(s.x, s.y, n);
    this.ax.fill(0, 0, n);
    this.ay.fill(0, 0, n);
    s.density.fill(0, 0, n);

    for (let i = 0; i < n; i++) {
      const xi = s.x[i];
      const yi = s.y[i];
      let sepX = 0;
      let sepY = 0;
      let aliX = 0;
      let aliY = 0;
      let aliN = 0;
      let cohX = 0;
      let cohY = 0;
      let cohN = 0;

      this.hash.forEachInRadius(xi, yi, this.queryRadius, (j) => {
        if (j === i) return;
        let dx = s.x[j] - xi;
        let dy = s.y[j] - yi;
        if (wrap) {
          dx -= Math.round(dx / w) * w;
          dy -= Math.round(dy / h) * h;
        }
        const dSq = dx * dx + dy * dy;
        if (dSq >= cohR2 && dSq >= aliR2 && dSq >= sepR2) return;
        s.density[i]++;

        // Separation：指向远离邻居的方向，1/d 加权
        if (dSq < sepR2 && dSq > 1e-12) {
          const inv = 1 / Math.sqrt(dSq);
          sepX -= dx * inv * inv; // (pos_i - pos_j)/d²
          sepY -= dy * inv * inv;
        }
        // Alignment / Cohesion 统计：1−d/R 距离加权 × 同类偏好（越近影响越大、同类影响更大）
        const typeW = s.type[j] === s.type[i] ? 1 + p.sameTypeBias : 1;
        if (dSq < aliR2) {
          const wAli = (1 - Math.sqrt(dSq) / p.aliRadius) * typeW;
          aliX += s.vx[j] * wAli;
          aliY += s.vy[j] * wAli;
          aliN++;
        }
        if (dSq < cohR2) {
          const wCoh = (1 - Math.sqrt(dSq) / p.cohRadius) * typeW;
          cohX += dx * wCoh;
          cohY += dy * wCoh;
          cohN++;
        }
      });

      // SelfPropel：朝个人方向偏好持续推进（个体性来源，先漂移方向再算力，顺序确定）
      if (p.headingDrift > 0) {
        this.headings[i] += this.rng.normal() * Math.sqrt(p.headingDrift * dt);
      }

      let fx = 0;
      let fy = 0;
      if (p.sepWeight > 0 && (sepX !== 0 || sepY !== 0)) {
        const [sx, sy] = steer(sepX, sepY, s.vx[i], s.vy[i], p.maxSpeed, p.maxForce);
        fx += sx * p.sepWeight;
        fy += sy * p.sepWeight;
      }
      if (p.aliWeight > 0 && aliN > 0) {
        const [sx, sy] = steer(aliX / aliN, aliY / aliN, s.vx[i], s.vy[i], p.maxSpeed, p.maxForce);
        fx += sx * p.aliWeight;
        fy += sy * p.aliWeight;
      }
      if (p.cohWeight > 0 && cohN > 0) {
        const [sx, sy] = steer(cohX / cohN, cohY / cohN, s.vx[i], s.vy[i], p.maxSpeed, p.maxForce);
        fx += sx * p.cohWeight;
        fy += sy * p.cohWeight;
      }
      if (p.selfPropel > 0) {
        const hx = Math.cos(this.headings[i]);
        const hy = Math.sin(this.headings[i]);
        const [sx, sy] = steer(hx, hy, s.vx[i], s.vy[i], p.maxSpeed, p.maxForce);
        fx += sx * p.selfPropel;
        fy += sy * p.selfPropel;
      }
      this.ax[i] = fx;
      this.ay[i] = fy;
    }

    // gamma 取小值：Boids 靠转向力自然限速，几乎无阻尼，保持群体动量
    this.interaction.force(s, this.ax, this.ay, w, h);
    this.nanFixed += integrate(s, this.ax, this.ay, { dt, gamma: 0.15, maxSpeed: p.maxSpeed });
    applyBoundary(s, w, h, p.boundary);
  }

  serialize(): PresetData {
    return {
      version: 1,
      mode: 'boids',
      seed: this.seed,
      params: { ...this.params },
      visual: { theme: 'deep-ocean' },
    };
  }

  deserialize(preset: PresetData): void {
    const p = preset.params;
    const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
      typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
    const arr = (v: unknown, d: number[]): number[] =>
      Array.isArray(v) && v.length > 0 && v.every((x) => Number.isFinite(x))
        ? v.map(Number)
        : [...d];
    const d = BOIDS_DEFAULTS;
    this.params = {
      count: num(p.count, d.count),
      types: Math.max(1, Math.round(num(p.types, d.types))),
      maxSpeed: num(p.maxSpeed, d.maxSpeed),
      maxForce: num(p.maxForce, d.maxForce),
      sepRadius: num(p.sepRadius, d.sepRadius),
      sepWeight: num(p.sepWeight, d.sepWeight),
      aliRadius: num(p.aliRadius, d.aliRadius),
      aliWeight: num(p.aliWeight, d.aliWeight),
      cohRadius: num(p.cohRadius, d.cohRadius),
      cohWeight: num(p.cohWeight, d.cohWeight),
      selfPropel: num(p.selfPropel, d.selfPropel),
      headingDrift: num(p.headingDrift, d.headingDrift),
      sameTypeBias: num(p.sameTypeBias, d.sameTypeBias),
      typePalette: arr(p.typePalette, d.typePalette),
      typeShares: arr(p.typeShares, d.typeShares),
      boundary: oneOf(p.boundary, ['wrap', 'repel'] as const, d.boundary),
    };
    this.params = normalizeTypes(this.params);
    this.seed = preset.seed >>> 0;
    this.rng.setState(this.seed);
    this.refreshQueryRadius();
    this.initBoids();
  }

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
    this.refreshQueryRadius();
  }
}
