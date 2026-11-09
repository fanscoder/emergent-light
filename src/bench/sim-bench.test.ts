// 模拟核心性能基准（M5）：Node 环境直接驱动 step()，无渲染干扰。
// 运行：BENCH=1 npx vitest run src/bench/sim-bench.test.ts（默认跳过，不拖慢常规测试）
// 目的：回答"瓶颈在模拟还是渲染"的模拟侧，并记录极端密集下的空间哈希开销。
// 注意：冷启动首步比热态慢一个数量级（JIT），必须预热后再计时。

import { expect, it } from 'vitest';
import { ParticleLifeSimulation, PARTICLE_LIFE_DEFAULTS } from '../core/modes/particle-life';
import { BoidsSimulation, BOIDS_DEFAULTS } from '../core/modes/boids';
import type { Simulation } from '../core/types';

/** 预热 + 计时，返回每步毫秒 */
function timePerStep(sim: Simulation, timedSteps: number): number {
  for (let i = 0; i < 60; i++) sim.step(1 / 60); // 预热（JIT 与缓存）
  const t0 = performance.now();
  for (let i = 0; i < timedSteps; i++) sim.step(1 / 60);
  return (performance.now() - t0) / timedSteps;
}

// 默认跳过（跑一遍要几分钟）；显式运行：npx vitest run src/bench/sim-bench.test.ts
const runBench = process.env.BENCH === '1';

it.skipIf(!runBench)('模拟核心性能基准（1920×1080，热态）', () => {
  const rows: string[] = [];
  for (const count of [500, 1000, 2000, 4000]) {
    const pl = new ParticleLifeSimulation(count, 1920, 1080);
    pl.updateParams({ ...PARTICLE_LIFE_DEFAULTS, count });
    pl.randomize(1);
    const plMs = timePerStep(pl, count >= 4000 ? 60 : 120);

    const boids = new BoidsSimulation(count, 1920, 1080);
    boids.updateParams({ ...BOIDS_DEFAULTS, count });
    boids.randomize(1);
    const boidsMs = timePerStep(boids, count >= 4000 ? 60 : 120);

    rows.push(
      `${String(count).padStart(4)} 粒子:  particle-life ${plMs.toFixed(3).padStart(7)} ms/步   boids ${boidsMs.toFixed(3).padStart(7)} ms/步`,
    );
  }

  // 极端密集：粒子数挤进小世界（空间哈希单格过热压力；计时步数减半防超时）
  const dense = new ParticleLifeSimulation(1000, 400, 300);
  dense.updateParams({ ...PARTICLE_LIFE_DEFAULTS, count: 1000 });
  dense.randomize(1);
  const denseMs = timePerStep(dense, 30);
  rows.push(`极端密集 1000 粒子 @400×300: ${denseMs.toFixed(3)} ms/步`);

  console.log(`\n=== 模拟性能基准（1920×1080，热态）===\n${rows.join('\n')}\n`);
  expect(rows.length).toBeGreaterThan(0);
});
