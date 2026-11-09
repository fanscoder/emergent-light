/**
 * 均匀网格空间哈希。
 *
 * 设计要点（对应技术设计文档 v0.2 §6.3）：
 * - cell size = 构建时给定的最大作用半径 maxRadius；
 * - 每帧以计数排序（counting sort）重建，全程 TypedArray，无逐格数组分配；
 * - 查询按半径动态确定覆盖格子（forEachInRadius 的 r 不必等于 maxRadius），
 *   不写死 3×3，Boids 的不同感知半径可直接复用；
 * - wrap 模式下格子坐标对世界取模，跨边界查询自动环绕；
 * - 不做邻居截断：密集格子如实保留全部粒子（截断会改变真实动力学），
 *   通过 maxCellOccupancy() 暴露密集程度供性能面板记录。
 */

export class SpatialHash {
  readonly cellSize: number;
  readonly cols: number;
  readonly rows: number;
  private readonly wrap: boolean;
  private readonly cellCount: number;
  private readonly capacity: number;

  /** cellStart[c] = 第 c 格在 entries 中的起始下标；长度 cellCount + 1 */
  private readonly cellStart: Int32Array;
  /** 按格子排序后的粒子索引 */
  private readonly entries: Uint32Array;
  /** 重建用的临时计数 */
  private readonly counts: Int32Array;
  /** 查询去重标记 */
  private readonly visited: Int32Array;
  private visitStamp = 0;

  constructor(
    worldWidth: number,
    worldHeight: number,
    maxRadius: number,
    wrap: boolean,
    maxParticles: number,
  ) {
    if (maxRadius <= 0) throw new Error('maxRadius 必须为正数');
    this.cellSize = maxRadius;
    this.wrap = wrap;
    this.cols = Math.max(1, Math.ceil(worldWidth / maxRadius));
    this.rows = Math.max(1, Math.ceil(worldHeight / maxRadius));
    this.cellCount = this.cols * this.rows;
    this.capacity = maxParticles;
    this.cellStart = new Int32Array(this.cellCount + 1);
    this.entries = new Uint32Array(maxParticles);
    this.counts = new Int32Array(this.cellCount);
    this.visited = new Int32Array(this.cellCount);
  }

  /** 粒子坐标 → 格子线性下标（wrap 取模 / 非 wrap 钳制） */
  private cellIndexOf(x: number, y: number): number {
    let cx = Math.floor(x / this.cellSize);
    let cy = Math.floor(y / this.cellSize);
    if (this.wrap) {
      cx = ((cx % this.cols) + this.cols) % this.cols;
      cy = ((cy % this.rows) + this.rows) % this.rows;
    } else {
      if (cx < 0) cx = 0;
      else if (cx >= this.cols) cx = this.cols - 1;
      if (cy < 0) cy = 0;
      else if (cy >= this.rows) cy = this.rows - 1;
    }
    return cy * this.cols + cx;
  }

  /** 重建哈希表。count 必须 <= 构造时的 maxParticles。 */
  rebuild(x: Float32Array, y: Float32Array, count: number): void {
    if (count > this.capacity) throw new Error('粒子数超过空间哈希容量');

    this.counts.fill(0);
    for (let i = 0; i < count; i++) {
      this.counts[this.cellIndexOf(x[i], y[i])]++;
    }

    let start = 0;
    for (let c = 0; c < this.cellCount; c++) {
      this.cellStart[c] = start;
      start += this.counts[c];
    }
    this.cellStart[this.cellCount] = start;

    // 复用 counts 作为写入游标
    const cursor = this.counts;
    for (let c = 0; c < this.cellCount; c++) cursor[c] = this.cellStart[c];
    for (let i = 0; i < count; i++) {
      const c = this.cellIndexOf(x[i], y[i]);
      this.entries[cursor[c]++] = i;
    }
  }

  /**
   * 遍历以 (qx, qy) 为圆心、r 为半径的圆所覆盖格子内的全部粒子索引。
   * 覆盖格子是超集，调用方需用精确距离再过滤。
   * 不查询自身的情况由调用方处理（调用方持有自身索引）。
   */
  forEachInRadius(qx: number, qy: number, r: number, cb: (index: number) => void): void {
    const cs = this.cellSize;
    const minCx = Math.floor((qx - r) / cs);
    const maxCx = Math.floor((qx + r) / cs);
    const minCy = Math.floor((qy - r) / cs);
    const maxCy = Math.floor((qy + r) / cs);

    this.visitStamp++;
    if (this.visitStamp === 0x7fffffff) {
      this.visited.fill(0);
      this.visitStamp = 1;
    }

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        let mcx = cx;
        let mcy = cy;
        if (this.wrap) {
          mcx = ((cx % this.cols) + this.cols) % this.cols;
          mcy = ((cy % this.rows) + this.rows) % this.rows;
        } else if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) {
          continue;
        }
        const cell = mcy * this.cols + mcx;
        if (this.visited[cell] === this.visitStamp) continue;
        this.visited[cell] = this.visitStamp;

        const end = this.cellStart[cell + 1];
        for (let e = this.cellStart[cell]; e < end; e++) {
          cb(this.entries[e]);
        }
      }
    }
  }

  /** 当前最密格子中的粒子数（性能面板用；重建后有效） */
  maxCellOccupancy(): number {
    let max = 0;
    for (let c = 0; c < this.cellCount; c++) {
      const n = this.cellStart[c + 1] - this.cellStart[c];
      if (n > max) max = n;
    }
    return max;
  }
}
