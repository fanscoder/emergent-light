// 半隐式 Euler 积分 + 连续阻尼（技术设计文档 v0.2 §6.2）。
// 所有模拟模式共用本模块，保证积分约定统一：
//
//   step 开始：copyPrev() 先把 x→prevX、y→prevY
//   对每个粒子：
//     (b) v ← v + a·dt          （先更新速度，半隐式）
//     (c) v ← v · e^(−gamma·dt) （连续阻尼，gamma 单位 1/s，与帧率无关）
//     (d) |v| ← min(|v|, maxSpeed)
//     (e) x ← x + v·dt          （再更新位置）
//     (f) applyBoundary() 边界处理

import type { BoundaryMode, ParticleStore } from './types';

export interface IntegrateOptions {
  dt: number;
  /** 连续阻尼系数，单位 1/s；时间常数 τ = 1/gamma */
  gamma: number;
  maxSpeed: number;
}

/** 模拟步开始时的固定动作：保存上一帧位置供渲染插值 */
export function copyPrev(store: ParticleStore): void {
  store.prevX.set(store.x.subarray(0, store.count));
  store.prevY.set(store.y.subarray(0, store.count));
}

/**
 * 对 store 中前 count 个粒子执行一步半隐式 Euler 积分。
 * ax/ay 是调用方预先计算好的加速度数组（长度 >= count）。
 * 返回被 NaN/Infinity 防护重置的粒子数（正常情况下为 0）。
 */
export function integrate(
  store: ParticleStore,
  ax: Float32Array,
  ay: Float32Array,
  opts: IntegrateOptions,
): number {
  const { dt, gamma, maxSpeed } = opts;
  const damp = Math.exp(-gamma * dt);
  const maxSpeedSq = maxSpeed * maxSpeed;
  const n = store.count;
  let fixed = 0;

  for (let i = 0; i < n; i++) {
    let vx = (store.vx[i] + ax[i] * dt) * damp;
    let vy = (store.vy[i] + ay[i] * dt) * damp;

    const vSq = vx * vx + vy * vy;
    if (vSq > maxSpeedSq) {
      const scale = maxSpeed / Math.sqrt(vSq);
      vx *= scale;
      vy *= scale;
    }

    const nx = store.x[i] + vx * dt;
    const ny = store.y[i] + vy * dt;

    if (Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(vx) && Number.isFinite(vy)) {
      store.vx[i] = vx;
      store.vy[i] = vy;
      store.x[i] = nx;
      store.y[i] = ny;
    } else {
      // NaN/Infinity 防护：清零速度、保持位置，防止污染扩散
      fixed++;
      store.vx[i] = 0;
      store.vy[i] = 0;
    }
  }
  return fixed;
}

/** 边界处理。'wrap' 环绕；'repel' 镜面反弹并翻转速度分量。 */
export function applyBoundary(
  store: ParticleStore,
  worldWidth: number,
  worldHeight: number,
  mode: BoundaryMode,
): void {
  const n = store.count;
  if (mode === 'wrap') {
    for (let i = 0; i < n; i++) {
      store.x[i] = (((store.x[i] % worldWidth) + worldWidth) % worldWidth);
      store.y[i] = (((store.y[i] % worldHeight) + worldHeight) % worldHeight);
    }
  } else {
    for (let i = 0; i < n; i++) {
      let x = store.x[i];
      let y = store.y[i];
      let vx = store.vx[i];
      let vy = store.vy[i];
      if (x < 0) {
        x = -x;
        vx = -vx;
      } else if (x > worldWidth) {
        x = 2 * worldWidth - x;
        vx = -vx;
      }
      if (y < 0) {
        y = -y;
        vy = -vy;
      } else if (y > worldHeight) {
        y = 2 * worldHeight - y;
        vy = -vy;
      }
      store.x[i] = x;
      store.y[i] = y;
      store.vx[i] = vx;
      store.vy[i] = vy;
    }
  }
}
