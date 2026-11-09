import { Interaction } from '../interaction';
// Particle Life 模拟模式（M1 核心交付）。
//
// 数据流：相互作用矩阵（k/core/radius，每类型对独立参数）
//   → 空间哈希邻居查询（以全局最大半径为查询半径，超集后按对半径精确过滤）
//   → piecewiseSineForce 累加速度
//   → 随机扰动 → 半隐式 Euler 积分 → 边界处理。
//
// 不做邻居截断（设计文档 §6.3）；wrap 边界下力计算使用环绕距离。

import type { BoundaryMode, InteractionMatrixData, ParticleStore, PresetData, Simulation } from '../types';
import { createStore } from '../types';
import { Rng } from '../rng';
import { SpatialHash } from '../spatial-hash';
import { MIN_DISTANCE, piecewiseSineForce } from '../force-curves';
import { applyBoundary, copyPrev, integrate } from '../integrator';
import { generateMatrix, type MatrixArrays, type MatrixStyle } from '../matrix-gen';

export interface ParticleLifeParams {
  count: number;
  types: number;
  /** 力 → 加速度倍率（F 有界于 [-1,1]，乘以本系数得加速度） */
  forceScale: number;
  /** 连续阻尼系数 1/s */
  gamma: number;
  maxSpeed: number;
  /** 随机扰动加速度强度 */
  jitter: number;
  /** 定向自驱动推力强度（洋流感的来源：每个粒子有缓慢转向的个人游动方向） */
  selfPropel: number;
  /** 自驱动方向的随机转向速率（弧度/秒） */
  turnRate: number;
  /** 粒子寿命系统：虚空随机重生，寿命正态分布 */
  lifeEnabled: boolean;
  /** 寿命均值（秒） */
  lifeMean: number;
  /** 寿命标准差（秒） */
  lifeStd: number;
  /** 寿命下限（秒） */
  lifeMin: number;
  /** 生灭渐隐时长（秒，淡入+淡出） */
  lifeFade: number;
  boundary: BoundaryMode;
  matrixStyle: MatrixStyle;
}

/** 默认参数方向来自视觉规范（docs/taste-profile.md）：安静缓慢、持续运动（不结晶冻结） */
export const PARTICLE_LIFE_DEFAULTS: ParticleLifeParams = {
  count: 500,
  types: 4,
  forceScale: 40,
  gamma: 0.6,
  maxSpeed: 36,
  // 白噪声扰动退居辅助；定向自驱动主导运动 —— 洋流式持续流动，原理上阻止结晶
  jitter: 25,
  selfPropel: 6,
  turnRate: 1.5,
  // 寿命系统：平均 90 秒寿命、正态分布长短不一，虚空重生、生灭渐隐
  lifeEnabled: true,
  lifeMean: 90,
  lifeStd: 45,
  lifeMin: 10,
  lifeFade: 4,
  boundary: 'wrap',
  matrixStyle: 'sparse',
};

const MIN_RADIUS = 20;

export class ParticleLifeSimulation implements Simulation {
  readonly interaction = new Interaction();
  private readonly store: ParticleStore;
  private readonly ax: Float32Array;
  private readonly ay: Float32Array;
  private readonly rng = new Rng(0);

  private params: ParticleLifeParams = { ...PARTICLE_LIFE_DEFAULTS };
  private matrix: MatrixArrays = { k: new Float32Array(0), core: new Float32Array(0), radius: new Float32Array(0) };
  private maxRadius = MIN_RADIUS;
  private hash: SpatialHash;
  private worldWidth: number;
  private worldHeight: number;
  private seed = 1;
  private nanFixed = 0;

  constructor(capacity: number, worldWidth = 960, worldHeight = 540) {
    this.store = createStore(capacity);
    this.ax = new Float32Array(capacity);
    this.ay = new Float32Array(capacity);
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
    this.hash = new SpatialHash(worldWidth, worldHeight, this.maxRadius, true, capacity);
  }

  get particleCount(): number {
    return this.store.count;
  }

  getState(): Readonly<ParticleStore> {
    return this.store;
  }

  get paramsSnapshot(): ParticleLifeParams {
    return { ...this.params };
  }

  /** 当前相互作用矩阵（只读视图，供测试与未来的矩阵编辑器） */
  get matrixSnapshot(): Readonly<MatrixArrays> {
    return this.matrix;
  }

  get nanFixCount(): number {
    return this.nanFixed;
  }

  /** 测试与矩阵编辑器用：直接设定某类型对参数 */
  setPairParams(a: number, b: number, k: number, core: number, radius: number): void {
    const idx = a * this.params.types + b;
    this.matrix.k[idx] = k;
    this.matrix.core[idx] = core;
    this.matrix.radius[idx] = radius;
    this.refreshMaxRadius();
  }

  updateParams(patch: Partial<ParticleLifeParams>): void {
    this.params = { ...this.params, ...patch };
  }

  randomize(seed: number): void {
    this.interaction.reset(seed);
    this.store.eggTint.fill(0);
    this.seed = seed >>> 0;
    this.rng.setState(this.seed);
    const types = this.params.types;
    this.matrix = generateMatrix(this.rng, types, this.params.matrixStyle);
    this.refreshMaxRadius();
    this.initParticles();
  }

  private refreshMaxRadius(): void {
    let max = MIN_RADIUS;
    for (let i = 0; i < this.matrix.radius.length; i++) {
      if (this.matrix.radius[i] > max) max = this.matrix.radius[i];
    }
    this.maxRadius = max;
    this.hash = new SpatialHash(this.worldWidth, this.worldHeight, max, this.params.boundary === 'wrap', this.store.capacity);
  }

  private initParticles(): void {
    const { count, types } = this.params;
    const n = Math.min(count, this.store.capacity);
    this.store.count = n;
    for (let i = 0; i < n; i++) {
      this.store.x[i] = this.rng.range(0, this.worldWidth);
      this.store.y[i] = this.rng.range(0, this.worldHeight);
      this.store.vx[i] = 0;
      this.store.vy[i] = 0;
      this.store.type[i] = this.rng.int(types);
      this.store.theta[i] = this.rng.range(0, Math.PI * 2);
      // 寿命与初始年龄：寿命正态采样，年龄交错在 [0, lifespan]，避免整批同生共死
      this.store.lifespan[i] = this.sampleLifespan();
      this.store.age[i] = this.rng.range(0, this.store.lifespan[i]);
      this.store.lifeFrac[i] = 1;
      // 个体光晕差异因子：标准正态截断 ±2（渲染层光晕大小时使用）
      this.store.glowJit[i] = Math.max(-2, Math.min(2, this.rng.normal()));
    }
    copyPrev(this.store);
  }

  step(dt: number): void {
    const s = this.store;
    const n = s.count;
    const { types, forceScale, gamma, maxSpeed, jitter, selfPropel, turnRate } = this.params;
    const wrap = this.params.boundary === 'wrap';
    const w = this.worldWidth;
    const h = this.worldHeight;
    const mk = this.matrix.k;
    const mcore = this.matrix.core;
    const mradius = this.matrix.radius;
    const queryR = this.maxRadius;
    const maxRSq = queryR * queryR;

    copyPrev(s);
    this.interaction.begin(s, dt, w, h);
    this.hash.rebuild(s.x, s.y, n);

    this.ax.fill(0, 0, n);
    this.ay.fill(0, 0, n);
    s.density.fill(0, 0, n);

    for (let i = 0; i < n; i++) {
      const xi = s.x[i];
      const yi = s.y[i];
      const ti = s.type[i];
      const rowBase = ti * types;
      let fx = 0;
      let fy = 0;

      this.hash.forEachInRadius(xi, yi, queryR, (j) => {
        if (j === i) return;
        let dx = s.x[j] - xi;
        let dy = s.y[j] - yi;
        if (wrap) {
          dx -= Math.round(dx / w) * w;
          dy -= Math.round(dy / h) * h;
        }
        const dSq = dx * dx + dy * dy;
        if (dSq >= maxRSq) return;
        const pair = rowBase + s.type[j];
        const r = mradius[pair];
        if (dSq >= r * r) return;
        s.density[i]++;

        // 极近距离开销：力的幅值用下限距离防奇点，方向用随机单位向量代替
        let d = Math.sqrt(dSq);
        let ux: number;
        let uy: number;
        if (d < MIN_DISTANCE) {
          d = MIN_DISTANCE;
          const angle = this.rng.next() * Math.PI * 2;
          ux = Math.cos(angle);
          uy = Math.sin(angle);
        } else {
          ux = dx / d;
          uy = dy / d;
        }

        const f = piecewiseSineForce(d, { k: mk[pair], core: mcore[pair], radius: r }) * forceScale;
        fx += f * ux;
        fy += f * uy;
      });

      this.ax[i] = fx;
      this.ay[i] = fy;
    }

    // 定向自驱动：方向角随机游走后施加恒定推力（每步 1 随机数/粒子），
    // 方向的相关时间是分钟级 —— 这是"洋流"与"布朗运动"的本质区别
    if (selfPropel > 0 || turnRate > 0) {
      for (let i = 0; i < n; i++) {
        s.theta[i] += (this.rng.next() * 2 - 1) * turnRate * dt;
        if (selfPropel > 0) {
          this.ax[i] += Math.cos(s.theta[i]) * selfPropel;
          this.ay[i] += Math.sin(s.theta[i]) * selfPropel;
        }
      }
    }

    // 随机扰动（白噪声，退居辅助；每步固定消耗 2 个随机数/粒子，可复现）
    if (jitter > 0) {
      for (let i = 0; i < n; i++) {
        this.ax[i] += (this.rng.next() * 2 - 1) * jitter;
        this.ay[i] += (this.rng.next() * 2 - 1) * jitter;
      }
    }

    this.interaction.force(s, this.ax, this.ay, w, h);
    this.nanFixed += integrate(s, this.ax, this.ay, { dt, gamma, maxSpeed });
    applyBoundary(s, w, h, this.params.boundary);

    this.updateLifetimes(dt);
  }

  /** 寿命正态采样：N(lifeMean, lifeStd²)，截断在 lifeMin 以上 */
  private sampleLifespan(): number {
    const { lifeMean, lifeStd, lifeMin } = this.params;
    return Math.max(lifeMin, lifeMean + this.rng.normal() * lifeStd);
  }

  /** 虚空重生：在随机位置生成新粒子（位置/速度/类型/方向/寿命全部由 rng 决定） */
  private respawn(i: number): void {
    const s = this.store;
    s.x[i] = this.rng.range(0, this.worldWidth);
    s.y[i] = this.rng.range(0, this.worldHeight);
    s.vx[i] = 0;
    s.vy[i] = 0;
    s.type[i] = this.rng.int(this.params.types);
    s.theta[i] = this.rng.range(0, Math.PI * 2);
    s.lifespan[i] = this.sampleLifespan();
    s.age[i] = 0;
    s.eggTint[i] = 0;
    s.glowJit[i] = Math.max(-2, Math.min(2, this.rng.normal()));
    // prev 同步到新位置，避免重生瞬间的跨屏插值残影
    s.prevX[i] = s.x[i];
    s.prevY[i] = s.y[i];
  }

  private updateLifetimes(dt: number): void {
    if (!this.params.lifeEnabled) return;
    const s = this.store;
    const n = s.count;
    const fade = Math.max(this.params.lifeFade, dt);
    for (let i = 0; i < n; i++) {
      s.age[i] += dt;
      if (s.age[i] >= s.lifespan[i]) this.respawn(i);
      // 生灭渐隐：出生淡入 + 临终淡出
      const fadeIn = s.age[i];
      const fadeOut = s.lifespan[i] - s.age[i];
      const f = Math.min(fadeIn, fadeOut) / fade;
      s.lifeFrac[i] = Math.min(1, Math.max(0, f));
    }
  }

  serialize(): PresetData {
    return {
      version: 1,
      mode: 'particle-life',
      seed: this.seed,
      params: { ...this.params },
      visual: { theme: 'debug' },
      matrix: this.matrixToData(),
    };
  }

  deserialize(preset: PresetData): void {
    const p = preset.params;
    const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
    const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T =>
      typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : d;
    const d = PARTICLE_LIFE_DEFAULTS;
    this.params = {
      count: num(p.count, d.count),
      types: Math.max(1, Math.round(num(p.types, d.types))),
      forceScale: num(p.forceScale, d.forceScale),
      gamma: num(p.gamma, d.gamma),
      maxSpeed: num(p.maxSpeed, d.maxSpeed),
      jitter: num(p.jitter, d.jitter),
      selfPropel: num(p.selfPropel, d.selfPropel),
      turnRate: num(p.turnRate, d.turnRate),
      lifeEnabled: typeof p.lifeEnabled === 'boolean' ? p.lifeEnabled : d.lifeEnabled,
      lifeMean: num(p.lifeMean, d.lifeMean),
      lifeStd: num(p.lifeStd, d.lifeStd),
      lifeMin: num(p.lifeMin, d.lifeMin),
      lifeFade: num(p.lifeFade, d.lifeFade),
      boundary: oneOf(p.boundary, ['wrap', 'repel'] as const, d.boundary),
      matrixStyle: oneOf(p.matrixStyle, ['random', 'symmetric', 'sparse'] as const, d.matrixStyle),
    };
    this.seed = preset.seed >>> 0;
    this.rng.setState(this.seed);

    // 先按种子生成正确尺寸的矩阵，再尝试用 preset 中的矩阵覆盖（尺寸已由上一步保证）
    this.matrix = generateMatrix(this.rng, this.params.types, this.params.matrixStyle);
    this.refreshMaxRadius();
    if (preset.matrix) this.loadMatrixData(preset.matrix);
    this.initParticles();
  }

  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
    this.hash = new SpatialHash(width, height, this.maxRadius, this.params.boundary === 'wrap', this.store.capacity);
    // 不重置粒子
  }

  private matrixToData(): InteractionMatrixData {
    const types = this.params.types;
    const k: number[][] = [];
    const core: number[][] = [];
    const radius: number[][] = [];
    for (let a = 0; a < types; a++) {
      k.push(Array.from(this.matrix.k.slice(a * types, a * types + types)));
      core.push(Array.from(this.matrix.core.slice(a * types, a * types + types)));
      radius.push(Array.from(this.matrix.radius.slice(a * types, a * types + types)));
    }
    return { k, core, radius };
  }

  private loadMatrixData(data: InteractionMatrixData): boolean {
    const types = this.params.types;
    const ok =
      Array.isArray(data.k) &&
      data.k.length === types &&
      data.core.length === types &&
      data.radius.length === types &&
      data.k.every((row) => Array.isArray(row) && row.length === types && row.every((v) => Number.isFinite(v)));
    if (!ok) return false;
    for (let a = 0; a < types; a++) {
      for (let b = 0; b < types; b++) {
        const idx = a * types + b;
        this.matrix.k[idx] = data.k[a][b];
        this.matrix.core[idx] = data.core[a][b];
        this.matrix.radius[idx] = data.radius[a][b];
      }
    }
    return true;
  }
}
