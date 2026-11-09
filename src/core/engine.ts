// 固定时间步进引擎（技术设计文档 v0.2 §6.1）。
//
// - 模拟步长固定 DT；渲染帧长不固定，用累加器补齐模拟步；
// - 每帧最多补 MAX_SUBSTEPS 步，超出丢弃剩余时间并计一次掉步（防螺旋死亡）；
// - 渲染插值系数 alpha = accumulator / DT，调用方据此在 prev 与 curr 间插值；
// - 暂停 = 停止向累加器注入时间，不改变任何粒子状态；恢复后继续。

export interface EngineOptions {
  /** 固定模拟步长（秒） */
  dt: number;
  /** 单渲染帧最多补的模拟步数 */
  maxSubSteps: number;
}

export interface Steppable {
  step(dt: number): void;
}

export class FixedStepEngine {
  readonly dt: number;
  readonly maxSubSteps: number;

  private accumulator = 0;

  paused = false;
  droppedSteps = 0;
  /** 已推进的模拟总时间（秒） */
  simTime = 0;
  /** 最近一次 advance() 中模拟步的累计耗时（毫秒，供性能面板） */
  lastSimMs = 0;

  private sim: Steppable;

  constructor(sim: Steppable, opts: EngineOptions) {
    this.sim = sim;
    if (opts.dt <= 0) throw new Error('dt 必须为正数');
    this.dt = opts.dt;
    this.maxSubSteps = opts.maxSubSteps;
  }

  /** 运行模式切换：更换模拟核心，时钟与暂停状态保持不变（M4 控制面板） */
  setSim(sim: Steppable): void {
    this.sim = sim;
  }

  /**
   * 推进一帧。frameDtSec 为渲染帧间隔（秒）。
   * 返回插值系数 alpha ∈ [0, 1]。
   */
  advance(frameDtSec: number): number {
    if (!this.paused) {
      // 单帧注入时间钳制在 [0, 0.25s]，防止后台标签页回来后一次性补步爆炸
      const clamped = Math.min(Math.max(frameDtSec, 0), 0.25);
      this.accumulator += clamped;

      let steps = 0;
      const t0 = performance.now();
      while (this.accumulator >= this.dt && steps < this.maxSubSteps) {
        this.sim.step(this.dt);
        this.accumulator -= this.dt;
        this.simTime += this.dt;
        steps++;
      }
      this.lastSimMs = performance.now() - t0;

      if (this.accumulator >= this.dt) {
        // 达到补步上限仍欠账：丢弃剩余时间，记一次掉步
        this.droppedSteps++;
        this.accumulator = 0;
      }
    }
    return Math.min(this.accumulator / this.dt, 1);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  /** 只清时钟，不触碰模拟状态 */
  resetClock(): void {
    this.accumulator = 0;
    this.droppedSteps = 0;
  }
}
