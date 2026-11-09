// 亮度平滑器（设计文档 v0.2 §5.5：视觉派生量在渲染层私有，
// 亮度必须时间域平滑，禁止每帧随机闪烁）。
//
// 亮度目标来自物理速度（物理→视觉单向映射），
// 经一阶低通滤波收敛，保证变化连续。

export class BrightnessSmoother {
  private readonly values: Float32Array;

  constructor(capacity: number) {
    this.values = new Float32Array(capacity).fill(1);
  }

  /**
   * 就地更新前 count 个粒子的平滑亮度。
   * factor 为每帧收敛系数（0,1]，越小越平滑、响应越慢。
   */
  update(
    speedSq: Float32Array,
    count: number,
    maxSpeed: number,
    minB: number,
    maxB: number,
    factor: number,
  ): Float32Array {
    const norm = 1 / (maxSpeed * maxSpeed);
    for (let i = 0; i < count; i++) {
      const t = Math.min(speedSq[i] * norm, 1);
      const target = minB + (maxB - minB) * t;
      this.values[i] += (target - this.values[i]) * factor;
    }
    return this.values;
  }

  get(i: number): number {
    return this.values[i];
  }
}
