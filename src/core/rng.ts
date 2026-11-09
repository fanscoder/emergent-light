/**
 * mulberry32 种子伪随机数生成器。
 *
 * - 每个模拟实例持有独立实例；randomize(seed) 完全由种子决定。
 * - 可复现性定义：同引擎版本 + 同种子 + 同参数 → 同演化序列
 *   （不承诺跨浏览器逐位一致，浮点实现存在差异）。
 * - getState/setState 导出/恢复内部状态，为 Snapshot 功能预留。
 */
export class Rng {
  private state: number;
  /** Box-Muller 缓存的第二个值（确定性序列，不影响可复现性） */
  private spare: number | null = null;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** 返回 [0, 1) 均匀分布随机数 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max) */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** [0, maxExclusive) 整数 */
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }

  /** 标准正态分布 N(0,1)（Box-Muller） */
  normal(): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this.spare = v * mul;
    return u * mul;
  }

  /** 导出内部状态（一个 32 位整数） */
  getState(): number {
    return this.state;
  }

  /** 恢复内部状态，之后的序列与保存时一致 */
  setState(state: number): void {
    this.state = state >>> 0;
  }
}
