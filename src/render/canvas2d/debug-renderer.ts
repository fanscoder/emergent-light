// M0 调试渲染器：深色背景 + 纯色圆点。
// 刻意不使用任何光效，M1 验证算法、M2 再做 Deep Ocean 视觉。

import type { ParticleStore } from '../../core/types';
import type { Renderer } from '../renderer';

const DEBUG_PALETTE = ['#7fd4c1', '#5f8fd4', '#9f7fd4', '#d4c17f'];

export class DebugRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr: number;
  private readonly canvas: HTMLCanvasElement;
  private width = 0;
  private height = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
    this.ctx = ctx;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  render(state: Readonly<ParticleStore>, alpha: number): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#050a14';
    ctx.fillRect(0, 0, this.width, this.height);

    const n = state.count;
    const halfW = this.width / 2;
    const halfH = this.height / 2;
    for (let i = 0; i < n; i++) {
      // 环绕感知的插值：跨边界的位移取环绕最短路径，避免粒子横越屏幕的闪动
      let dx = state.x[i] - state.prevX[i];
      let dy = state.y[i] - state.prevY[i];
      if (dx > halfW) dx -= this.width;
      else if (dx < -halfW) dx += this.width;
      if (dy > halfH) dy -= this.height;
      else if (dy < -halfH) dy += this.height;
      const ix = state.prevX[i] + dx * alpha;
      const iy = state.prevY[i] + dy * alpha;
      ctx.globalAlpha = state.lifeFrac[i];
      ctx.fillStyle = DEBUG_PALETTE[state.type[i] % DEBUG_PALETTE.length];
      ctx.beginPath();
      ctx.arc(ix, iy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  dispose(): void {
    // Canvas 2D 无显式资源需要释放
  }
}
