import { describe, expect, it } from 'vitest';
import { BrightnessSmoother } from './brightness';

describe('BrightnessSmoother（亮度时间域平滑）', () => {
  it('静止粒子收敛到最低亮度，无随机闪烁', () => {
    const b = new BrightnessSmoother(4);
    const speeds = new Float32Array(4); // 全零速度
    let prev: number | null = null;
    for (let frame = 0; frame < 200; frame++) {
      const v = b.update(speeds, 4, 40, 0.45, 1.0, 0.06);
      const cur = v[0];
      if (prev !== null) {
        // 每帧变化量必须小且无振荡（单调收敛）
        expect(Math.abs(cur - prev)).toBeLessThan(0.05);
      }
      prev = cur;
    }
    expect(prev!).toBeCloseTo(0.45, 1);
  });

  it('高速粒子收敛到高亮度，且不超上限', () => {
    const b = new BrightnessSmoother(2);
    const speeds = new Float32Array([40 * 40, 100 * 100]); // 第二个远超参考速度
    let v: Float32Array = speeds;
    for (let frame = 0; frame < 500; frame++) v = b.update(speeds, 2, 40, 0.45, 1.0, 0.06);
    expect(v[0]).toBeCloseTo(1.0, 1);
    expect(v[1]).toBeLessThanOrEqual(1.0);
  });

  it('混合速度场：不同速度有不同且稳定的亮度（个体差异）', () => {
    const b = new BrightnessSmoother(2);
    const fast = new Float32Array([30 * 30, 0]);
    let v: Float32Array = fast;
    for (let frame = 0; frame < 500; frame++) v = b.update(fast, 2, 40, 0.45, 1.0, 0.06);
    expect(v[0]).toBeGreaterThan(v[1] + 0.3);
  });
});
