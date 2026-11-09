// 相互作用矩阵随机生成器（M1 验收项：全随机 / 对称 / 稀疏三种风格）。
// 全部由传入的 Rng 决定，保证同种子可复现。

import type { Rng } from './rng';

export type MatrixStyle = 'random' | 'symmetric' | 'sparse';

export interface MatrixArrays {
  /** 强度 k[a*types+b] ∈ [-1, 1]，符号 = 吸引/排斥 */
  k: Float32Array;
  /** 排斥核比例 core[a*types+b] ∈ (0, 1) */
  core: Float32Array;
  /** 作用半径 radius[a*types+b]，模拟单位 */
  radius: Float32Array;
}

export interface MatrixGenOptions {
  coreMin: number;
  coreMax: number;
  radiusMin: number;
  radiusMax: number;
  /** sparse 风格下置零（中性）的比例 */
  sparseZeroRatio: number;
}

export const DEFAULT_MATRIX_GEN: MatrixGenOptions = {
  coreMin: 0.25,
  coreMax: 0.45,
  radiusMin: 50,
  radiusMax: 110,
  sparseZeroRatio: 0.55,
};

/** 同类型对的曲线参数（对角线专用）。
 *  近距离强排斥（防坍缩，力曲线 u < core 区间在 k > 0 时即为排斥）+ 弱中程吸引。
 *  自聚力刻意调弱（实测现象：同类强凝聚会结晶成静止圆环）：
 *  同类保持"软凝聚"的流体团块感，把结构主导权让给跨类型作用。 */
const SELF_K_MIN = 0.15;
const SELF_K_MAX = 0.4;
const SELF_CORE_MIN = 0.35;
const SELF_CORE_MAX = 0.55;

function fillPair(
  rng: Rng,
  m: MatrixArrays,
  types: number,
  a: number,
  b: number,
  opts: MatrixGenOptions,
  zero: boolean,
): void {
  const idx = a * types + b;
  m.k[idx] = zero ? 0 : rng.range(-1, 1);
  m.core[idx] = rng.range(opts.coreMin, opts.coreMax);
  m.radius[idx] = rng.range(opts.radiusMin, opts.radiusMax);
}

function fillSelfPair(rng: Rng, m: MatrixArrays, types: number, a: number, opts: MatrixGenOptions): void {
  const idx = a * types + a;
  m.k[idx] = rng.range(SELF_K_MIN, SELF_K_MAX);
  m.core[idx] = rng.range(SELF_CORE_MIN, SELF_CORE_MAX);
  m.radius[idx] = rng.range(opts.radiusMin, opts.radiusMax);
}

/** 生成 types×types 相互作用矩阵。调用序列由 rng 决定，同种子完全可复现。 */
export function generateMatrix(
  rng: Rng,
  types: number,
  style: MatrixStyle,
  opts: MatrixGenOptions = DEFAULT_MATRIX_GEN,
): MatrixArrays {
  const size = types * types;
  const m: MatrixArrays = {
    k: new Float32Array(size),
    core: new Float32Array(size),
    radius: new Float32Array(size),
  };

  if (style === 'symmetric') {
    // 先填对角与上三角，再镜像，保证严格对称；对角线为自排斥
    for (let a = 0; a < types; a++) {
      fillSelfPair(rng, m, types, a, opts);
      for (let b = a + 1; b < types; b++) {
        fillPair(rng, m, types, a, b, opts, false);
        const idx = a * types + b;
        const sym = b * types + a;
        m.k[sym] = m.k[idx];
        m.core[sym] = m.core[idx];
        m.radius[sym] = m.radius[idx];
      }
    }
    return m;
  }

  for (let a = 0; a < types; a++) {
    fillSelfPair(rng, m, types, a, opts);
    for (let b = 0; b < types; b++) {
      if (b === a) continue;
      const zero = style === 'sparse' && rng.next() < opts.sparseZeroRatio;
      fillPair(rng, m, types, a, b, opts, zero);
    }
  }

  // 稀疏风格：保证每种类型至少有一个对外非零作用，不存在"旁观类型"
  if (style === 'sparse') {
    for (let a = 0; a < types; a++) {
      let hasOutgoing = false;
      for (let b = 0; b < types; b++) {
        if (b !== a && m.k[a * types + b] !== 0) {
          hasOutgoing = true;
          break;
        }
      }
      if (!hasOutgoing) {
        const b = rng.int(types - 1);
        const target = b >= a ? b + 1 : b; // 跳过对角
        fillPair(rng, m, types, a, target, opts, false);
      }
    }
  }
  return m;
}
