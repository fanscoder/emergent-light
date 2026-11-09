// Deep Ocean / Nebula 视觉主题（设计文档 v0.2 §5）。
// 气质：深邃、安静、朦胧。避免过度饱和霓虹。

export interface ParticleStyle {
  /** 粒子核心色（小而亮） */
  core: string;
  /** 光晕 RGB（加色混合时向暖白融合） */
  glow: [number, number, number];
  /** 核心半径 CSS px */
  coreSize: number;
}

export interface Theme {
  name: string;
  /** 背景深海蓝黑 */
  background: [number, number, number];
  particles: ParticleStyle[];
}

export const DEEP_OCEAN: Theme = {
  name: 'deep-ocean',
  background: [4, 10, 20],
  particles: [
    // 主色：暗青 / 蓝绿
    { core: '#c8f5ec', glow: [58, 196, 176], coreSize: 1.7 },
    // 主色：深蓝
    { core: '#d2e6ff', glow: [66, 138, 224], coreSize: 1.9 },
    // 辅色：蓝紫
    { core: '#e0d9ff', glow: [128, 108, 224], coreSize: 1.8 },
    // 点缀：少量淡金（索引 3 之后的类型循环复用并微调）
    { core: '#fff3d6', glow: [232, 198, 128], coreSize: 1.6 },
    // 点缀：琥珀暖光（Boids 亮色族群用；深海灯笼鱼气质，加色下仍偏暖不烧白）
    { core: '#ffe9cf', glow: [255, 158, 92], coreSize: 1.6 },
  ],
};

export function styleForType(theme: Theme, type: number): ParticleStyle {
  return theme.particles[type % theme.particles.length];
}

export function backgroundCss(theme: Theme, alpha: number): string {
  const [r, g, b] = theme.background;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Precompute a gentle green palette ramp; particle species stay untouched. */
export function creeperPalette(theme: Theme): ParticleStyle[] {
  const result: ParticleStyle[] = [];
  for(let level=0;level<16;level++) for(let i=0;i<theme.particles.length;i++) {
    const base=theme.particles[i], t=level/15;
    const green: [number,number,number]=[72+i%3*10, 180+i%3*12, 54+i%3*9];
    const mix=(a:number,b:number):number=>Math.round(a+(b-a)*t);
    const core=[1,3,5].map((start,j)=>mix(parseInt(base.core.slice(start,start+2),16),[150,224,122][j]));
    result.push(level===0?base:{core:'rgb('+core.join(',')+')',glow:base.glow.map((v,j)=>mix(v,green[j])) as [number,number,number],coreSize:base.coreSize});
  }
  return result;
}
