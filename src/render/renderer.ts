// 渲染器接口。Canvas 2D 与未来的 WebGL 2 后端都实现此接口。
// 渲染器只读 ParticleStore，绝不写回（视觉←物理单向映射，设计文档 §5.5）。

import type { ParticleStore } from '../core/types';

export interface Renderer {
  /** 渲染目标尺寸变化（CSS 像素；DPR 由实现内部处理） */
  resize(width: number, height: number): void;
  /**
   * 绘制一帧。
   * alpha ∈ [0,1]：上一模拟步与当前步之间的插值系数，
   * 显示位置 = prev + (curr − prev) * alpha。
   */
  render(state: Readonly<ParticleStore>, alpha: number, dt?: number): void;
  dispose(): void;
}
