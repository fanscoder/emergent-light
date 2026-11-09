import { glowAlpha } from '../glow-profile';
// 预渲染径向渐变光晕精灵图（设计文档 §2.3 视觉实现结论：
// 禁止逐粒子 shadowBlur，一律用预渲染精灵 + drawImage）。
//
// 逐像素生成 + 确定性抖动（dither）：
// 暗部渐变在 8bit 色彩下会出现一圈一圈的色带（实测现象"一层一层变暗"），
// 加入 ±0.5/255 级别的哈希噪声可把条纹打散为肉眼不可见的颗粒，减轻可见色带；实际观感仍取决于显示链路。

export function makeGlowSprite(
  rgb: [number, number, number],
  radiusPx: number,
  peakAlpha = 0.5,
): HTMLCanvasElement {
  const size = Math.max(2, Math.ceil(radiusPx)) * 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const [r, g, b] = rgb;
  const c = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c + 0.5, y - c + 0.5) / c;
      const idx = (y * size + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = glowAlpha(d, peakAlpha, x, y);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}
