/**
 * 作用力曲线库（技术设计文档 v0.2 §6.4）。
 *
 * 力曲线以纯函数形式存在，由模拟模式注入主逻辑——
 * 更换动力学模型只需替换 ForceCurve 实现，不改动 Particle Life 主循环。
 *
 * 当前实现 piecewiseSineForce，对每个类型对 (a, b) 有独立参数：
 *   k     强度，[-1, 1]，符号 = 吸引/排斥
 *   core  排斥核比例 u_core ∈ (0, 1)，u < core 为排斥区
 *   radius 最大作用半径 R，u >= 1（即 d >= R）处力为零
 *
 * 归一化距离 u = d / R，分段函数：
 *
 *         ⎧ (u − u_core) / u_core,                     0 ≤ u < u_core   （线性排斥核）
 *   g(u) = ⎨ sin( π·(u − u_core)/(1 − u_core) ),       u_core ≤ u < 1   （正弦吸引瓣）
 *         ⎩ 0,                                          u ≥ 1
 *
 * 性质：
 * - 近距离排斥：u=0 处 g = −1，线性防止坍缩；
 * - 中程吸引/排斥：k > 0 吸引、k < 0 排斥，峰值在区间中点；
 * - 边界归零且在边界附近平滑衰减：u = u_core 两侧均为 0（连续），u = 1 处 sin(π) = 0；
 * - 有界：|g| ≤ 1 ⟹ |F| ≤ |k|，保证数值稳定。
 */

export interface PairForceParams {
  k: number;
  core: number;
  radius: number;
}

/** 可注入的作用力曲线签名。任何动力学模型实现此签名即可接入模拟主循环。 */
export type ForceCurve = (distance: number, params: PairForceParams) => number;

/** 零距离下限，消除奇点 */
export const MIN_DISTANCE = 0.01;

/** core 参数的合法范围（含数值余量） */
const CORE_MIN = 0.05;
const CORE_MAX = 0.95;

export function piecewiseSineForce(distance: number, p: PairForceParams): number {
  const r = p.radius;
  // distance >= r 或 NaN 时力为零（NaN < r 为 false，顺带起到 NaN 防护作用）
  if (!(distance < r)) return 0;
  const u = Math.max(distance, MIN_DISTANCE) / r;
  const uc = Math.min(Math.max(p.core, CORE_MIN), CORE_MAX);
  const g = u < uc ? (u - uc) / uc : Math.sin((Math.PI * (u - uc)) / (1 - uc));
  return p.k * g;
}
