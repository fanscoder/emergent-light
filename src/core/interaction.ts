import type { ParticleStore } from './types';
import { Rng } from './rng';
export type PointerMode = 'off' | 'attract' | 'repel';
export type EggShape = 'creeper';
// Hand-authored pixel silhouettes; these are birth layouts, not emergent shapes.
export const SHAPES: Record<EggShape, string[]> = {
  creeper: ['11111111','11111111','10011001','10011001','11100111','11000011','11000011','11011011'],
};
export class Interaction {
  mode: PointerMode = 'off';
  automatic = false;
  pointer: { x: number; y: number } | null = null;
  private pending: EggShape | null = null;
  private rng = new Rng(1);
  private countdown = 180;
  reset(seed: number): void { this.rng = new Rng(seed ^ 0x454747); this.pending = null; this.countdown = this.rng.range(180, 360); }
  request(shape: EggShape): void { this.pending = shape; }
  begin(s: ParticleStore, dt: number, w: number, h: number): void {
    for (let i = 0; i < s.count; i++) s.eggTint[i] = Math.max(0, s.eggTint[i] - dt);
    if (this.automatic) {
      this.countdown -= dt;
      if (this.countdown <= 0) this.pending ??= 'creeper';
    }
    if (!this.pending || s.count === 0) return;
    const rows = SHAPES[this.pending];
    const cells: [number, number][] = [];
    rows.forEach((row, y) => [...row].forEach((v, x) => { if (v === '1') cells.push([x, y]); }));
    const n = Math.min(s.count, cells.length * 3, Math.max(1, Math.floor(s.count * 0.5)));
    const side = Math.min(w, h) * 0.36;
    const cx = w * this.rng.range(0.35, 0.65), cy = h * this.rng.range(0.35, 0.65);
    // Distribute selection through the population, leaving the rest untouched.
    for (let k = 0; k < n; k++) {
      const i = Math.floor(k * s.count / n);
      const [x, y] = cells[k % cells.length];
      const ox = this.rng.range(-0.18, 0.18), oy = this.rng.range(-0.18, 0.18);
      s.x[i] = s.prevX[i] = cx + ((x + 0.5 + ox) / 8 - 0.5) * side;
      s.y[i] = s.prevY[i] = cy + ((y + 0.5 + oy) / 8 - 0.5) * side;
      s.eggTint[i] = 12;
      s.vx[i] *= 0.15; s.vy[i] *= 0.15;
      // Avoid immediate old-age respawn without changing population or species.
      s.age[i] = Math.min(10, s.lifespan[i] * 0.3);
    }
    this.pending = null;
    this.countdown = this.rng.range(180, 360);
  }
  force(s: ParticleStore, ax: Float32Array, ay: Float32Array, w: number, h: number): void {
    if (this.mode === 'off' || !this.pointer) return;
    const radius = Math.min(w, h) * 0.24;
    if (radius <= 0) return;
    const sign = this.mode === 'attract' ? 1 : -1;
    for (let i = 0; i < s.count; i++) {
      const dx = this.pointer.x - s.x[i], dy = this.pointer.y - s.y[i];
      const d = Math.hypot(dx, dy);
      if (d >= radius || d < 0.001) continue;
      // Smooth, bounded force, with a soft core so attraction doesn't collapse.
      const f = sign * 90 * (1 - d / radius) ** 2 * Math.min(d / 20, 1);
      ax[i] += dx / d * f; ay[i] += dy / d * f;
    }
  }
}
