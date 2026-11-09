// 浏览器端性能基准（M5）：?bench=1 进入，真实渲染管线下测量模拟/渲染耗时。
// 模拟核心不能替代本测量：Canvas 2D 的 fill-rate、DPR、合成开销只在真实浏览器可见。
// 结果同时显示在页面上并自动下载 JSON，供性能报告引用。

import type { Simulation } from '../core/types';
import { DeepOceanRenderer } from '../render/canvas2d/deep-ocean-renderer';
import type { SimMode } from '../ui/panel-spec';

export interface BenchScenario {
  mode: SimMode;
  count: number;
}

export interface BenchResult extends BenchScenario {
  frames: number;
  fps: number;
  simMs: number;
  renderMs: number;
}

export interface BenchReport {
  generatedAt: string;
  screen: { width: number; height: number; dpr: number };
  userAgent: string;
  results: BenchResult[];
}

const DT = 1 / 60;
const WARM_FRAMES = 60;
const MEASURE_FRAMES = 180;

export function startBrowserBench(
  canvas: HTMLCanvasElement,
  createSim: (mode: SimMode, count: number) => Simulation,
): void {
  const scenarios: BenchScenario[] = [
    { mode: 'particle-life', count: 500 },
    { mode: 'particle-life', count: 1000 },
    { mode: 'particle-life', count: 2000 },
    { mode: 'boids', count: 300 },
    { mode: 'boids', count: 600 },
    { mode: 'boids', count: 1200 },
  ];

  const renderer = new DeepOceanRenderer(canvas, 4000);
  renderer.resize(window.innerWidth, window.innerHeight);

  const overlay = document.createElement('pre');
  overlay.style.cssText =
    'position:fixed;inset:0;margin:0;padding:24px;background:rgba(2,4,9,0.92);' +
    'color:#7fd4c1;font:13px/1.7 ui-monospace,Consolas,monospace;white-space:pre-wrap;z-index:100';
  document.body.append(overlay);

  const raf = (): Promise<number> => new Promise((r) => requestAnimationFrame(r));

  void (async () => {
    const results: BenchResult[] = [];
    overlay.textContent = '性能基准运行中……\n（每档约 4 秒，共 6 档）\n';
    try {
      for (const sc of scenarios) {
        const sim = createSim(sc.mode, sc.count);
        sim.randomize(1);

        for (let i = 0; i < WARM_FRAMES; i++) {
          sim.step(DT);
          renderer.render(sim.getState(), 1);
          await raf();
        }

        let simMsSum = 0;
        let renderMsSum = 0;
        let frameSum = 0;
        let prev = await raf();
        for (let i = 0; i < MEASURE_FRAMES; i++) {
          const now = await raf();
          frameSum += now - prev;
          prev = now;
          const t0 = performance.now();
          sim.step(DT);
          const t1 = performance.now();
          renderer.render(sim.getState(), 1);
          const t2 = performance.now();
          simMsSum += t1 - t0;
          renderMsSum += t2 - t1;
        }

        const result: BenchResult = {
          ...sc,
          frames: MEASURE_FRAMES,
          fps: 1000 / (frameSum / MEASURE_FRAMES),
          simMs: simMsSum / MEASURE_FRAMES,
          renderMs: renderMsSum / MEASURE_FRAMES,
        };
        results.push(result);
        overlay.textContent +=
          `${sc.mode} ${sc.count}:  ${result.fps.toFixed(1)} fps   模拟 ${result.simMs.toFixed(2)} ms   渲染 ${result.renderMs.toFixed(2)} ms\n`;
      }

      const report: BenchReport = {
        generatedAt: new Date().toISOString(),
        screen: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio || 1,
        },
        userAgent: navigator.userAgent,
        results,
      };
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `emergent-light-bench-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      overlay.textContent += '\n完成：JSON 报告已下载。可关闭本页或去掉 ?bench=1。';
    } catch (err) {
      overlay.textContent += `\n基准中断：${String(err)}`;
    }
  })();
}
