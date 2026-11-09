import { eventCue } from '../event-cues';
import type { EnergyEventKind } from '../../core/ecology-events';
import { energyAppearance } from '../../core/modes/ecology';
import { Breathing, breathLevels } from '../breathing';
import { GLOW_BUFFER_SCALE, GLOW_SPRITE_RADIUS, glowDrawSize } from '../glow-profile';
// Deep Ocean 渲染器（M2 核心交付）。
//
// 分层合成管线（设计文档 v0.2 §5 光照实现）：
//   A. 粒子核心层 —— 小而亮，按平滑亮度调透明度
//   B. 光照累积层 —— 1/2 分辨率离屏画布，lighter 加色累积光晕精灵
//   C. 模糊光晕层 —— 由 B 经 drawImage 放大合成天然柔化（双线性插值）
//   D. 最终合成层 —— 主画布：拖尾渐隐（低透明度背景色填充）→ lighter 叠加 C → A
//
// 性能原则：无逐粒子 shadowBlur、无逐粒子模糊；DPR ≤ 1.5；每帧一次全幅合成。

import { frameOpacity } from '../frame-time';
import type { ParticleStore } from '../../core/types';
import type { Renderer } from '../renderer';
import { lerpWrapped } from '../interp';
import { DEEP_OCEAN, backgroundCss, creeperPalette, type ParticleStyle, type Theme } from '../themes';
import { BrightnessSmoother } from '../brightness';
import { makeGlowSprite } from './sprites';

export interface VisualParams {
  /** 整体亮度倍率 */
  brightness: number;
  /** 光晕大小倍率 */
  glowSize: number;
  /** 拖尾存续度 (0,1)，越大拖尾越长 */
  trail: number;
  /** 个体光晕大小差异幅度（0 = 全员一致；粒子因子 ~N(0,1) 截断 ±2） */
  sizeVar: number;
}

export const DEFAULT_VISUAL: VisualParams = {
  brightness: 0.8,
  glowSize: 0.85,
  // 拖尾短：静止亮斑不在拖尾层无限累积（过曝的另一主因）
  trail: 0.88,
  // 轻微个体差异：光晕大小自然错落，深海浮游生物感（v0.7.2 视觉校准）
  sizeVar: 0.25,
};

/** 光晕离屏缓冲相对设备像素的分辨率比例 */
const GLOW_SCALE = GLOW_BUFFER_SCALE;
const DPR_CAP = 1.5;
/** 亮度平滑：每帧收敛系数（时间域低通，禁止每帧随机闪烁） */
const BRIGHTNESS_SMOOTH = 0.06;
const BRIGHTNESS_MIN = 0.3;
const BRIGHTNESS_MAX = 0.75;
/** 渲染假设的最大速度，仅用于亮度归一化（与模拟 maxSpeed 解耦，超了只是更亮） */
const BRIGHTNESS_REF_SPEED = 40;
// Breathing applies at every trail setting; parameters live in breathing.ts.

export class DeepOceanRenderer implements Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly eventCanvas: HTMLCanvasElement;
  private readonly eventCtx: CanvasRenderingContext2D;
  private eventDirty=false;
  private readonly eventSprites: HTMLCanvasElement[];
  private readonly dpr: number;
  private readonly canvas: HTMLCanvasElement;
  private readonly theme: Theme;
  private readonly smoother: BrightnessSmoother;

  private glowCanvas: HTMLCanvasElement;
  private glowCtx: CanvasRenderingContext2D;
  private tintStyles: ParticleStyle[] = [];
  private sprites: HTMLCanvasElement[] = [];
  private readonly speedSq: Float32Array;
  private readonly energySize: Float32Array;
  private readonly energyLight: Float32Array;
  private width = 0;
  private height = 0;
  private readonly breathing = new Breathing();
  private visual: VisualParams = { ...DEFAULT_VISUAL };

  constructor(canvas: HTMLCanvasElement, capacity: number, theme: Theme = DEEP_OCEAN) {
    this.canvas = canvas;
    this.theme = theme;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建 Canvas 2D 上下文');
    this.ctx = ctx;
    this.eventCanvas=document.createElement('canvas');
    this.eventCanvas.className='energy-events';
    this.eventCanvas.setAttribute('aria-hidden','true');
    const eventCtx=this.eventCanvas.getContext('2d');
    if(!eventCtx)throw new Error('无法创建能量事件画布');
    this.eventCtx=eventCtx;
    // An independent overlay avoids injecting event pulses into trail history.
    canvas.parentElement?.append(this.eventCanvas);
    this.eventSprites=[makeGlowSprite([235,120,86],18,.42),makeGlowSprite([115,220,164],18,.40)];
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
    this.smoother = new BrightnessSmoother(capacity);
    this.speedSq = new Float32Array(capacity);
    this.energySize = new Float32Array(capacity).fill(1);
    this.energyLight = new Float32Array(capacity).fill(1);
    this.glowCanvas = document.createElement('canvas');
    const gctx = this.glowCanvas.getContext('2d');
    if (!gctx) throw new Error('无法创建离屏画布上下文');
    this.glowCtx = gctx;
    gctx.imageSmoothingEnabled = true;
    gctx.imageSmoothingQuality = 'high';
    this.rebuildSprites();
  }

  /** 视觉参数热更新（M4 控制面板接入点；不影响模拟轨迹） */
  updateVisual(params: Partial<VisualParams>): void {
    this.visual = { ...this.visual, ...params };
  }

  /** 当前视觉参数快照（预设保存用） */
  get visualSnapshot(): VisualParams {
    return { ...this.visual };
  }

  private rebuildSprites(): void {
    this.tintStyles = creeperPalette(this.theme);
    this.sprites = this.tintStyles.map((p) => makeGlowSprite(p.glow, GLOW_SPRITE_RADIUS));
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.eventCanvas.width=this.canvas.width;this.eventCanvas.height=this.canvas.height;
    this.glowCanvas.width = Math.max(1, Math.round(this.canvas.width * GLOW_SCALE));
    this.glowCanvas.height = Math.max(1, Math.round(this.canvas.height * GLOW_SCALE));
    // Canvas resize resets smoothing flags.
    this.ctx.imageSmoothingEnabled = this.glowCtx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = this.glowCtx.imageSmoothingQuality = 'high';
    // 新尺寸下先铺一层不透明背景，避免拖尾层从透明开始
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = backgroundCss(this.theme, 1);
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  render(state: Readonly<ParticleStore>, alpha: number, dt = 1 / 60): void {
    const ctx = this.ctx;
    const n = state.count;
    const w = this.width;
    const h = this.height;
    const [bgR, bgG, bgB] = this.theme.background;

    // 亮度：速度经时间域平滑（渲染层私有派生量，复用缓冲区避免每帧分配）
    for (let i = 0; i < n; i++) {
      this.speedSq[i] = state.vx[i] * state.vx[i] + state.vy[i] * state.vy[i];
    }
    const brightness = this.smoother.update(
      this.speedSq,
      n,
      BRIGHTNESS_REF_SPEED,
      BRIGHTNESS_MIN,
      BRIGHTNESS_MAX,
      frameOpacity(BRIGHTNESS_SMOOTH, dt),
    );

    if (state.energy) {
      const smooth = frameOpacity(.06, dt);
      for(let i=0;i<n;i++) {
        const target=energyAppearance(state.energy[i]);
        this.energySize[i]+=(target.size-this.energySize[i])*smooth;
        this.energyLight[i]+=(target.brightness-this.energyLight[i])*smooth;
      }
    }

    // D 层第一步：拖尾渐隐 —— 低透明度背景色填充，旧画面指数衰减。
    // Continuous cleaning and upward brightness breathing at ALL trail lengths.
    const breath = this.breathing.advance(dt);
    const levels = breathLevels(this.visual.trail, breath.amount);
    const glowBoost = levels.boost;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const fadeAlpha = frameOpacity(levels.fade, dt);
    ctx.fillStyle = `rgba(${bgR},${bgG},${bgB},${fadeAlpha})`;
    ctx.fillRect(0, 0, w, h);

    // Nutrition is deliberately tiny, dim, source-over and has no glow sprite.
    if (state.food) {
      ctx.fillStyle = '#59796b';
      ctx.globalAlpha = frameOpacity(.32, dt);
      for(let i=0;i<state.food.count;i++) {
        const x=lerpWrapped(state.food.prevX[i],state.food.x[i],alpha,w);
        const y=lerpWrapped(state.food.prevY[i],state.food.y[i],alpha,h);
        ctx.fillRect(x,y,1.2,1.2);
      }
      ctx.globalAlpha=1;
    }

    // B 层：光晕精灵累积到 1/2 分辨率离屏（加色混合，密集区自然融合）
    const gctx = this.glowCtx;
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalCompositeOperation = 'source-over';
    gctx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    gctx.globalCompositeOperation = 'lighter';
    const kx = this.glowCanvas.width / w;
    const ky = this.glowCanvas.height / h;
    const glowScale = this.visual.glowSize;
    for (let i = 0; i < n; i++) {
      const ix = lerpWrapped(state.prevX[i], state.x[i], alpha, w);
      const iy = lerpWrapped(state.prevY[i], state.y[i], alpha, h);
      const sprite = this.sprites[Math.round(Math.min(1, state.eggTint[i] / 3) * 15) * this.theme.particles.length + state.type[i] % this.theme.particles.length];
      // 个体大小差异：glowJit ~N(0,1)（模拟层种子采样，只读），sizeVar 控制幅度。
      // 钳制下限防光晕缩没；上限防偶发大值过度抢戏
      const jitScale = Math.max(0.3, Math.min(2.5, 1 + state.glowJit[i] * this.visual.sizeVar));
      const s = glowDrawSize(sprite.width, glowScale, jitScale) * (state.energy ? this.energySize[i] : 1);
      // 密度感知调光：密集区每个粒子的贡献 ÷(1+局部密度)。
      // N 个粒子合计亮度 = N·a/(1+N) < a —— 数学上封死过曝，稀疏粒子保持全亮。
      const dim = 1 / (1 + state.density[i]);
      gctx.globalAlpha = brightness[i] * 0.8 * state.lifeFrac[i] * dim * (state.energy ? this.energyLight[i] : 1);
      gctx.drawImage(sprite, ix * kx - s / 2, iy * ky - s / 2, s, s);
    }

    // C → D 合成，两遍策略（解决加色乘法饱和导致的过曝）：
    // 第一遍 source-over：光晕主体，亮度有硬上限 —— 无论多少粒子叠加，
    //   最亮不超过光晕精灵自身的颜色，永不烧白；
    // 第二遍 lighter 低强度：保留密集区的光线融合感，累积量小，不会过曝。
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = frameOpacity(this.visual.brightness * glowBoost, dt);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.glowCanvas, 0, 0, this.canvas.width, this.canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, 0.22 * this.visual.brightness * glowBoost * dt * 60);
    ctx.drawImage(this.glowCanvas, 0, 0, this.canvas.width, this.canvas.height);

    // A 层：粒子核心（小而亮，正常混合保持清晰）
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < n; i++) {
      const ix = lerpWrapped(state.prevX[i], state.x[i], alpha, w);
      const iy = lerpWrapped(state.prevY[i], state.y[i], alpha, h);
      const style = this.tintStyles[Math.round(Math.min(1, state.eggTint[i] / 3) * 15) * this.theme.particles.length + state.type[i] % this.theme.particles.length];
      // 核心也随密度略调，但保留下限，密集区仍可见清晰光点
      const coreDim = 0.35 + 0.65 / (1 + state.density[i]);
      ctx.globalAlpha = frameOpacity(Math.min(
        1,
        (brightness[i] * this.visual.brightness + 0.1) * state.lifeFrac[i] * coreDim * (state.energy ? this.energyLight[i] : 1),
      ), dt);
      ctx.fillStyle = style.core;
      ctx.beginPath();
      ctx.arc(ix, iy, style.coreSize * (state.energy ? this.energySize[i] : 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const activeEvents=(state.energyEvents?.count ?? 0)>0;
    let activeLeaders=false;
    if(state.leader)for(let i=0;i<n;i++)if(state.leader[i]>0){activeLeaders=true;break;}
    let activeGuards=false;
    if(state.guard)for(let i=0;i<n;i++)if(state.guard[i]>0){activeGuards=true;break;}
    if(!activeEvents&&!activeLeaders&&!activeGuards&&!this.eventDirty)return;
    const ectx=this.eventCtx;
    ectx.setTransform(1,0,0,1,0,0);ectx.clearRect(0,0,this.eventCanvas.width,this.eventCanvas.height);
    this.eventDirty=activeEvents||activeLeaders||activeGuards;
    if(activeLeaders&&state.leader){
      ectx.setTransform(this.dpr,0,0,this.dpr,0,0);ectx.globalCompositeOperation='source-over';
      for(let i=0;i<n;i++)if(state.leader[i]>0){
        const ix=lerpWrapped(state.prevX[i],state.x[i],alpha,w),iy=lerpWrapped(state.prevY[i],state.y[i],alpha,h);
        const style=this.tintStyles[Math.round(Math.min(1,state.eggTint[i]/3)*15)*this.theme.particles.length+state.type[i]%this.theme.particles.length];
        ectx.fillStyle=style.core;ectx.globalAlpha=.65*state.leader[i]*state.lifeFrac[i]*Math.min(1,this.visual.brightness);
        // Small fixed four-point glint; no spinning or flashing, no trail deposit.
        ectx.beginPath();
        ectx.moveTo(ix,iy-4.2);ectx.lineTo(ix+.8,iy-.8);ectx.lineTo(ix+3.4,iy);
        ectx.lineTo(ix+.8,iy+.8);ectx.lineTo(ix,iy+4.2);ectx.lineTo(ix-.8,iy+.8);
        ectx.lineTo(ix-3.4,iy);ectx.lineTo(ix-.8,iy-.8);ectx.closePath();ectx.fill();
      }
      ectx.globalAlpha=1;
    }
    if(activeGuards&&state.guard){
      ectx.setTransform(this.dpr,0,0,this.dpr,0,0);ectx.globalCompositeOperation='source-over';
      for(let i=0;i<n;i++)if(state.guard[i]>0){
        const ix=lerpWrapped(state.prevX[i],state.x[i],alpha,w),iy=lerpWrapped(state.prevY[i],state.y[i],alpha,h);
        const style=this.theme.particles[state.type[i]%this.theme.particles.length];ectx.fillStyle=style.core;
        ectx.globalAlpha=.5*state.guard[i]*state.lifeFrac[i]*Math.min(1,this.visual.brightness);
        ectx.fillRect(ix-3.2,iy-.6,1.2,1.2);ectx.fillRect(ix+2,iy-.6,1.2,1.2);
      }
      ectx.globalAlpha=1;
    }
    if(state.energyEvents){
      const events=state.energyEvents;
      ectx.setTransform(this.dpr,0,0,this.dpr,0,0);ectx.globalCompositeOperation='source-over';
      for(let i=0;i<events.count;i++){
        const kind=events.kind[i] as EnergyEventKind;
        const cue=eventCue(events.clock-events.time[i],kind);
        if(cue.opacity<=0)continue;
        const p=events.particle[i];
        const x=p>=0?lerpWrapped(state.prevX[p],state.x[p],alpha,w):events.x[i];
        const y=p>=0?lerpWrapped(state.prevY[p],state.y[p],alpha,h):events.y[i],r=cue.radius;
        ectx.globalAlpha=cue.opacity;
        ectx.drawImage(this.eventSprites[kind],x-r,y-r,r*2,r*2);
        ectx.fillStyle=kind===0?'#ffe3cf':'#d9ffe5';
        ectx.beginPath();ectx.arc(x,y,kind===0?1.5:1.35,0,Math.PI*2);ectx.fill();
      }
      ectx.globalAlpha=1;
    }
  }

  dispose(): void {
    this.eventCanvas.remove();
  }
}
