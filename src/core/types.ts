// 模拟核心共享类型。
// 重要：src/core/ 目录下禁止依赖任何 DOM/Canvas API（有测试守护）。

import type { EcologyEvents } from './ecology-events';
import type { Interaction } from './interaction';

export type BoundaryMode = 'wrap' | 'repel';

/**
 * 粒子状态，SoA（Structure of Arrays）+ TypedArray。
 *
 * 约定：
 * - step() 开始时先把 x→prevX、y→prevY，再推进积分；
 *   因此任意时刻 prev* 保存上一模拟步的位置，渲染器用 alpha 插值：
 *   显示位置 = prev + (curr - prev) * alpha。
 * - 渲染器拿到的是 Readonly<ParticleStore>，只读，绝不写回。
 */
export interface FoodStore {
  count:number; x:Float32Array; y:Float32Array; prevX:Float32Array; prevY:Float32Array;
}
export interface ParticleStore {
  /** Ecology-only: absent in the original modes, which keep their old behavior. */
  energy?:Float32Array;
  /** Ecology-only leadership marker; 0 ordinary, smooth 0..1 promotion. */
  leader?:Float32Array;
  /** Ecology-only, smooth guard visual strength; actual assignment lives in Guards. */
  guard?:Float32Array;
  energyEvents?:Readonly<EcologyEvents>;
  food?:FoodStore;
  /** 当前有效粒子数 */
  count: number;
  /** 数组容量，count <= capacity */
  capacity: number;
  x: Float32Array;
  y: Float32Array;
  prevX: Float32Array;
  prevY: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  /** 粒子类型索引（指向相互作用矩阵的行/列） */
  type: Uint8Array;
  /** 自驱动方向角（弧度，模拟状态的一部分，Snapshot 自动涵盖） */
  theta: Float32Array;
  /** 已存活时间（秒） */
  age: Float32Array;
  /** 寿命上限（秒，由正态分布采样） */
  lifespan: Float32Array;
  /** 生灭渐隐系数 ∈ [0,1]：新生与临终前平滑淡入淡出（渲染层只读） */
  lifeFrac: Float32Array;
  /** 局部密度 = 本步正在相互作用的邻居数（渲染层做密度感知调光，防密集区过曝） */
  density: Float32Array;
  /** 个体光晕差异因子 ~N(0,1)（初始化时种子采样；渲染层只读，视觉向物理单向映射） */
  glowJit: Float32Array;
  /** Temporary visual tint lifetime; does not change species or forces. */
  eggTint: Float32Array;
}

export function createStore(capacity: number): ParticleStore {
  return {
    count: 0,
    capacity,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    prevX: new Float32Array(capacity),
    prevY: new Float32Array(capacity),
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
    type: new Uint8Array(capacity),
    theta: new Float32Array(capacity),
    age: new Float32Array(capacity),
    lifespan: new Float32Array(capacity),
    lifeFrac: new Float32Array(capacity),
    density: new Float32Array(capacity),
    glowJit: new Float32Array(capacity),
    eggTint: new Float32Array(capacity),
  };
}

/** 模拟模式必须实现的接口。渲染层只依赖 getState() 的只读视图。 */
export interface Simulation {
  readonly interaction: Interaction;
  readonly particleCount: number;
  /** 固定步长推进一步；内部负责 prev 位置复制 */
  step(dt: number): void;
  /** 渲染器唯一读取入口（只读） */
  getState(): Readonly<ParticleStore>;
  /** 用种子重随机规则与初始状态，完全由种子决定 */
  randomize(seed: number): void;
  /** 导出 Preset（规则 + 视觉参数 + 种子） */
  serialize(): PresetData;
  /** 加载 Preset 并重新初始化世界 */
  deserialize(preset: PresetData): void;
  /** 世界尺寸变化（如窗口 resize）。不得重置粒子状态。 */
  setWorldSize?(width: number, height: number): void;
}

/** 相互作用矩阵的可序列化形式（类型数 × 类型数的方阵） */
export interface InteractionMatrixData {
  k: number[][];
  core: number[][];
  radius: number[][];
}

/** Preset：模拟规则 + 视觉参数。加载 = 按种子重新初始化世界。 */
export interface PresetData {
  version: 1;
  mode: string;
  seed: number;
  params: Record<string, number | string | boolean | number[]>;
  visual: Record<string, number | string | boolean>;
  /** 相互作用矩阵（可选；缺省时按 seed 用 matrixStyle 重新生成） */
  matrix?: InteractionMatrixData;
}

/**
 * Snapshot（MVP 不实现，接口预留）：
 * 保存完整世界状态（粒子位置/速度/类型）+ RNG 内部状态 + 模拟时钟，
 * 用于未来精确恢复到保存时刻。
 */
export interface SnapshotData {
  version: 1;
  simTime: number;
  rngState: number;
  store: ParticleStore;
}
