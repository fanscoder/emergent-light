// 浏览器平台适配：requestAnimationFrame 主循环、resize、性能统计。
// resize / 暂停 / 恢复均不得重置模拟状态（设计文档 §8）。

import { ActivityClock, type PowerMode } from './power-policy';
import type { Simulation } from '../core/types';
import type { FixedStepEngine } from '../core/engine';
import type { Renderer } from '../render/renderer';

export interface BrowserAppOptions {
  sim: Simulation;
  engine: FixedStepEngine;
  renderer: Renderer;
  statsElement: HTMLElement;
}

export interface BrowserApp {
  setPowerMode(mode: PowerMode): void;
  destroy(): void;
  /** 运行模式切换：更换模拟核心（M4 控制面板） */
  setSimulation(sim: Simulation): void;
}

export function startBrowserApp(opts: BrowserAppOptions): BrowserApp {
  const { engine, renderer, statsElement } = opts;
  let currentSim = opts.sim;

  let rafId = 0;
  const clock = new ActivityClock();
  let mode: PowerMode = 'normal';
  let timerId = 0;
  let fpsEma = 0;
  let renderMsEma = 0;
  let lastStatsUpdate = 0;
  let destroyed = false;

  const doResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.resize(w, h);
    // resize 只更新世界边界，不重置粒子
    currentSim.setWorldSize?.(w, h);
  };
  doResize();
  window.addEventListener('resize', doResize);

  const frame = (now: number): void => {
    if (destroyed) return;
    if (mode === 'sleep') return;
    if (engine.paused) {
      clock.reset();
      statsElement.textContent = '手动暂停';
      timerId = window.setTimeout(() => frame(performance.now()), 250);
      return;
    }
    const frameDt = clock.delta(now);

    const alpha = engine.advance(frameDt);

    const t0 = performance.now();
    renderer.render(currentSim.getState(), alpha, frameDt);
    const renderMs = performance.now() - t0;
    renderMsEma = renderMsEma === 0 ? renderMs : renderMsEma * 0.9 + renderMs * 0.1;

    if (frameDt > 0) {
      const fps = 1 / frameDt;
      fpsEma = fpsEma === 0 ? fps : fpsEma * 0.9 + fps * 0.1;
    }

    // 性能面板节流更新（4 Hz），避免每帧写 DOM
    if (now - lastStatsUpdate > 250) {
      lastStatsUpdate = now;
      statsElement.textContent =
        `FPS ${fpsEma.toFixed(1)}\n` +
        `模拟 ${engine.lastSimMs.toFixed(2)} ms / 帧\n` +
        `渲染 ${renderMsEma.toFixed(2)} ms / 帧\n` +
        `粒子 ${currentSim.particleCount}\n` +
        `掉步 ${engine.droppedSteps}`;
    }

    rafId = requestAnimationFrame(frame);
  };
  rafId = requestAnimationFrame(frame);

  return {
    setPowerMode(next: PowerMode): void {
      if (mode === next) return;
      mode = next;
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      clock.reset();
      if (mode === 'sleep') statsElement.textContent = '后台休眠：模拟与绘制已停止';
      else rafId = requestAnimationFrame(frame);
    },
    setSimulation(sim: Simulation): void {
      currentSim = sim;
    },
    destroy(): void {
      destroyed = true;
      window.clearTimeout(timerId);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', doResize);
      renderer.dispose();
    },
  };
}
