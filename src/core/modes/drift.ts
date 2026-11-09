import { Interaction } from '../interaction';
// ⚠️ M0 脚手架占位模拟 —— 匀速漂移。
// 仅用于验证固定步进、渲染插值与渲染管线，无任何相互作用/涌现逻辑。
// M1 将被 ParticleLifeSimulation 取代。

import type { BoundaryMode, ParticleStore, PresetData, Simulation } from '../types';
import { createStore } from '../types';
import { Rng } from '../rng';
import { applyBoundary, copyPrev, integrate } from '../integrator';

export interface DriftParams {
  count: number;
  gamma: number;
  maxSpeed: number;
  boundary: BoundaryMode;
  typeCount: number;
}

const DEFAULTS: DriftParams = {
  count: 500,
  gamma: 0,
  maxSpeed: 2,
  boundary: 'wrap',
  typeCount: 4,
};

export class DriftSimulation implements Simulation {
  readonly interaction = new Interaction();
  private readonly store: ParticleStore;
  private readonly ax: Float32Array;
  private readonly ay: Float32Array;
  private readonly rng = new Rng(0);
  private params: DriftParams = { ...DEFAULTS };
  private worldWidth: number;
  private worldHeight: number;
  private seed = 1;

  constructor(capacity: number, worldWidth = 960, worldHeight = 540) {
    this.store = createStore(capacity);
    this.ax = new Float32Array(capacity);
    this.ay = new Float32Array(capacity);
    this.worldWidth = worldWidth;
    this.worldHeight = worldHeight;
  }

  get particleCount(): number {
    return this.store.count;
  }

  getState(): Readonly<ParticleStore> {
    return this.store;
  }

  randomize(seed: number): void {
    this.interaction.reset(seed);
    this.seed = seed >>> 0;
    this.rng.setState(this.seed);
    const { count, maxSpeed, typeCount } = this.params;
    const n = Math.min(count, this.store.capacity);
    this.store.count = n;
    for (let i = 0; i < n; i++) {
      this.store.x[i] = this.rng.range(0, this.worldWidth);
      this.store.y[i] = this.rng.range(0, this.worldHeight);
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(0.4, 1) * maxSpeed;
      this.store.vx[i] = Math.cos(angle) * speed;
      this.store.vy[i] = Math.sin(angle) * speed;
      this.store.type[i] = this.rng.int(typeCount);
    }
    // 初始时刻 prev = curr，避免第一帧插值跳变
    copyPrev(this.store);
  }

  step(dt: number): void {
    copyPrev(this.store);
    // 占位模拟无加速度
    this.ax.fill(0, 0, this.store.count);
    this.ay.fill(0, 0, this.store.count);
    integrate(this.store, this.ax, this.ay, {
      dt,
      gamma: this.params.gamma,
      maxSpeed: this.params.maxSpeed,
    });
    applyBoundary(this.store, this.worldWidth, this.worldHeight, this.params.boundary);
  }

  serialize(): PresetData {
    return {
      version: 1,
      mode: 'drift',
      seed: this.seed,
      params: { ...this.params },
      visual: { theme: 'debug' },
    };
  }

  deserialize(preset: PresetData): void {
    const p = preset.params;
    this.params = {
      count: typeof p.count === 'number' ? p.count : DEFAULTS.count,
      gamma: typeof p.gamma === 'number' ? p.gamma : DEFAULTS.gamma,
      maxSpeed: typeof p.maxSpeed === 'number' ? p.maxSpeed : DEFAULTS.maxSpeed,
      boundary: p.boundary === 'repel' ? 'repel' : 'wrap',
      typeCount: typeof p.typeCount === 'number' ? p.typeCount : DEFAULTS.typeCount,
    };
    this.randomize(preset.seed);
  }

  /** resize 只改边界，不重置粒子 */
  setWorldSize(width: number, height: number): void {
    this.worldWidth = width;
    this.worldHeight = height;
  }
}
