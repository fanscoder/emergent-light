// 渲染共用的环绕感知位置插值。
// 模拟世界按 wrap 边界运行时，粒子跨边界的一步位移应取环绕最短路径，
// 否则插值会把粒子画成横越整个屏幕（已记录的边缘闪动问题）。

export function wrapDelta(delta: number, worldSize: number): number {
  const half = worldSize / 2;
  if (delta > half) return delta - worldSize;
  if (delta < -half) return delta + worldSize;
  return delta;
}

/** 插值后的显示坐标 = prev + wrapDelta(curr − prev) * alpha */
export function lerpWrapped(
  prev: number,
  curr: number,
  alpha: number,
  worldSize: number,
): number {
  return prev + wrapDelta(curr - prev, worldSize) * alpha;
}
