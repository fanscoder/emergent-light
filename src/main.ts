// Emergent Light — 组装入口（M4：控制面板 + 双模式切换）
// URL 参数：?mode=boids 指定初始模式（缺省时恢复本地保存的预设）；?debug=1 切调试渲染。

import './style.css';
import { EcologySimulation } from './core/modes/ecology';
import { EvolutionSimulation } from './core/modes/evolution';
import { attachEvolutionPanel } from './platform/evolution-panel';
import { attachEcologyPanel } from './platform/ecology-panel';
import { attachPowerSaving } from './platform/power-saving';
import { attachSystemPanel } from './platform/system-panel';
import { attachPlayground } from './platform/playground';
import type { Simulation, PresetData } from './core/types';
import { ParticleLifeSimulation, PARTICLE_LIFE_DEFAULTS } from './core/modes/particle-life';
import { BoidsSimulation, BOIDS_DEFAULTS, type BoidsParams } from './core/modes/boids';
import { FixedStepEngine } from './core/engine';
import { DEFAULT_DT, DEFAULT_SEED, MAX_SUB_STEPS } from './config/defaults';
import { DebugRenderer } from './render/canvas2d/debug-renderer';
import { DeepOceanRenderer, type VisualParams } from './render/canvas2d/deep-ocean-renderer';
import type { Renderer } from './render/renderer';
import { startBrowserApp, type BrowserApp } from './platform/browser';
import { startBrowserBench } from './bench/browser-bench';
import { setWallpaper, isTauri, onWallpaperChanged, queryWallpaper, onDesktopError, shouldStartWallpaper } from './platform/tauri';
import { createControlPanel } from './ui/control-panel';
import { accentSharePatch, buildModeControls, isSimMode, type ControlSpec, type SimMode } from './ui/panel-spec';
import {
  loadPresetFrom,
  parsePresetJson,
  presetToJson,
  savePresetTo,
  type StoredPreset,
} from './ui/preset-store';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const statsElement = document.querySelector<HTMLElement>('#stats');
if (!canvas || !statsElement) throw new Error('缺少 #scene 或 #stats 元素');
// TS 窄化不穿透闭包，导出非空别名供函数内部使用
const sceneCanvas: HTMLCanvasElement = canvas;
const statsEl: HTMLElement = statsElement;

// 未捕获错误直接显示在性能面板上（长期运行的壁纸应用需要自我诊断能力）
window.addEventListener('error', (e) => {
  statsElement.textContent = `⚠ ${e.message}`;
});
window.addEventListener('unhandledrejection', (e) => {
  statsElement.textContent = `⚠ ${String(e.reason)}`;
});

const urlParams = new URLSearchParams(location.search);
/** 世界缩放：Boids 参数以 800px 宽世界标定，大屏等比放大 */
const worldScale = window.innerWidth / 800;

function boidsScaledDefaults(): Partial<BoidsParams> {
  const k = worldScale;
  const d = BOIDS_DEFAULTS;
  return {
    maxSpeed: d.maxSpeed * k,
    maxForce: d.maxForce * k,
    sepRadius: d.sepRadius * k,
    aliRadius: d.aliRadius * k,
    cohRadius: d.cohRadius * k,
  };
}

function createSim(mode: SimMode): Simulation {
  if(mode==='evolution')return new EvolutionSimulation(window.innerWidth,window.innerHeight);
  if (mode === 'ecology-boids' || mode === 'ecology-life') return new EcologySimulation(mode, window.innerWidth, window.innerHeight);
  if (mode === 'boids') {
    const boids = new BoidsSimulation(300, window.innerWidth, window.innerHeight);
    boids.updateParams(boidsScaledDefaults());
    return boids;
  }
  return new ParticleLifeSimulation(500, window.innerWidth, window.innerHeight);
}

// —— M5 性能基准模式：独立测量回路，不启动常规应用（结果页显示并下载 JSON） ——
if (urlParams.has('bench')) {
  startBrowserBench(sceneCanvas, (mode, count) => {
    if (mode === 'boids') {
      const boids = new BoidsSimulation(count, window.innerWidth, window.innerHeight);
      boids.updateParams({ ...BOIDS_DEFAULTS, ...boidsScaledDefaults() });
      return boids;
    }
    const pl = new ParticleLifeSimulation(count, window.innerWidth, window.innerHeight);
    pl.updateParams({ ...PARTICLE_LIFE_DEFAULTS, count });
    return pl;
  });
} else {
  startNormalApp();
}

function startNormalApp(): void {
// —— 初始状态：URL 指定模式优先，否则恢复本地预设（M4 验收：刷新后完整恢复） ——
const stored: StoredPreset | null = (() => {
  try {
    return loadPresetFrom(localStorage);
  } catch {
    return null;
  }
})();

const requestedMode = urlParams.get('mode');
let currentMode: SimMode = isSimMode(requestedMode) ? requestedMode : stored && isSimMode(stored.mode) ? stored.mode : 'particle-life';

let currentSeed = stored?.seed ?? DEFAULT_SEED;

let sim: Simulation = createSim(currentMode);
const debugMode = urlParams.has('debug');
const renderer: Renderer = debugMode
  ? new DebugRenderer(sceneCanvas)
  : new DeepOceanRenderer(sceneCanvas, 1000);

let presetIssue='';
if (stored && stored.mode === currentMode) {
 try{
  sim.deserialize(stored as PresetData);
  currentSeed = stored.seed;
  if (!debugMode) {
    (renderer as DeepOceanRenderer).updateVisual(stored.visual as Partial<VisualParams>);
  }
 }catch{sim=createSim(currentMode);sim.randomize(currentSeed);presetIssue='保存的预设与当前属性版本不兼容，已使用默认规则。';}
} else {
  sim.randomize(currentSeed);
}

const engine = new FixedStepEngine(sim, { dt: DEFAULT_DT, maxSubSteps: MAX_SUB_STEPS });
const app: BrowserApp = startBrowserApp({ sim, engine, renderer, statsElement: statsEl });

// Desktop UI state: subscribe before querying to avoid missing startup changes.
let showStats = false;
try { showStats = localStorage.getItem('emergent-light-show-stats') === 'true'; } catch { /* storage unavailable */ }
if (urlParams.has('stats')) showStats = urlParams.get('stats') !== '0';
statsEl.hidden = !showStats;
const notice = document.createElement('div');
notice.className = 'desktop-notice';
notice.hidden = true;
document.body.append(notice);
const showDesktopError = (error: string): void => {
  notice.textContent = error;
  notice.hidden = false;
};
if(presetIssue)showDesktopError(presetIssue);
const syncWallpaper = (on: boolean): void => {
  document.body.classList.toggle('wallpaper-mode', on);
  if (on) notice.hidden = true;
};
if (isTauri()) {
  void (async () => {
    await onWallpaperChanged(syncWallpaper);
    await onDesktopError(showDesktopError);
    syncWallpaper(await queryWallpaper());
    // Handshake after listeners exist: native setup must not emit startup errors too early.
    if (await shouldStartWallpaper()) {
      await setWallpaper(true);
    }
  })().catch(error => showDesktopError(String(error)));
}

// —— 控制面板接线 ——
const restartKeys = new Map<string, boolean>();
for (const mode of ['particle-life', 'boids', 'ecology-boids', 'ecology-life','evolution'] as const) {
  for (const spec of buildModeControls(mode, worldScale)) {
    restartKeys.set(spec.key, spec.restart);
  }
}

function randomizeSameSeed(): void {
  sim.randomize(currentSeed);
}

const panel = createControlPanel(worldScale, {
  getMode: () => currentMode,

  setMode(mode: SimMode): void {
    if (mode === currentMode) return;
    currentMode = mode;
    sim = createSim(mode);
    sim.randomize(currentSeed);
    engine.setSim(sim);
    app.setSimulation(sim);
  },

  applyControl(spec: ControlSpec, value: number | string | boolean): void {
    if (spec.key === 'accentShare') {
      (sim as BoidsSimulation).updateParams(accentSharePatch(Number(value)));
    } else {
      (sim as ParticleLifeSimulation | BoidsSimulation).updateParams({
        [spec.key]: value,
      } as never);
    }
    if (restartKeys.get(spec.key)) randomizeSameSeed();
  },

  getParam(key: string): number | string | boolean | undefined {
    if (key === 'accentShare') {
      return (sim as BoidsSimulation).paramsSnapshot.typeShares[2] ?? 0.15;
    }
    const p = (sim as ParticleLifeSimulation | BoidsSimulation).paramsSnapshot as unknown as Record<
      string,
      number | string | boolean | number[]
    >;
    const v = p[key];
    return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : undefined;
  },

  getVisual: () =>
    renderer instanceof DeepOceanRenderer
      ? renderer.visualSnapshot
      : { brightness: 1, glowSize: 1, trail: 0.9, sizeVar: 0 },
  setVisual(key: keyof VisualParams, value: number): void {
    if (renderer instanceof DeepOceanRenderer) renderer.updateVisual({ [key]: value });
  },

  getSeed: () => currentSeed,
  newSeed(): void {
    currentSeed = (Math.random() * 0xffffffff) >>> 0;
    randomizeSameSeed();
  },

  resetDefaults(): void {
    if (sim instanceof EcologySimulation || sim instanceof EvolutionSimulation) {
      sim.resetDefaults();
    } else if (currentMode === 'boids') {
      (sim as BoidsSimulation).updateParams({ ...BOIDS_DEFAULTS, ...boidsScaledDefaults() });
    } else {
      (sim as ParticleLifeSimulation).updateParams({ ...PARTICLE_LIFE_DEFAULTS });
    }
    randomizeSameSeed();
  },

  togglePause(): boolean {
    if (engine.paused) engine.resume();
    else engine.pause();
    return engine.paused;
  },

  getShowStats: () => showStats,
  setShowStats(on: boolean): void {
    showStats = on;
    statsEl.hidden = !on;
    try { localStorage.setItem('emergent-light-show-stats', String(on)); } catch { /* storage unavailable */ }
  },
  async enterWallpaperMode(): Promise<string | null> {
    if (!isTauri()) return '浏览器版不支持桌面壁纸，请使用安装版';
    try { await setWallpaper(true); return null; }
    catch (error) { return String(error); }
  },

  savePreset(): string | null {
    const preset: StoredPreset = {
      ...sim.serialize(),
      visual:
        renderer instanceof DeepOceanRenderer
          ? ({ ...renderer.visualSnapshot } as Record<string, number | string | boolean>)
          : { brightness: 1, glowSize: 1, trail: 0.9 },
    };
    let saved = true;
    try {
      saved = savePresetTo(localStorage, preset);
    } catch {
      saved = false;
    }
    // 同时导出 JSON 文件（设计文档 M4）
    try {
      const blob = new Blob([presetToJson(preset)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `emergent-light-${preset.mode}-seed${preset.seed}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      return saved ? null : '本地保存失败';
    }
    return saved ? null : '本地保存失败（文件仍已下载）';
  },

  importPresetText(text: string): string | null {
    const preset = parsePresetJson(text);
    if (!preset || !isSimMode(preset.mode)) {
      return '导入失败：不是有效的 Emergent Light 预设文件';
    }
    let candidate:Simulation;
    try{candidate=createSim(preset.mode);candidate.deserialize(preset as PresetData);}
    catch(error){return '导入失败：'+String(error);}
    currentMode = preset.mode;
    sim = candidate;
    currentSeed = preset.seed;
    engine.setSim(sim);
    app.setSimulation(sim);
    if (!debugMode) {
      (renderer as DeepOceanRenderer).updateVisual(preset.visual as Partial<VisualParams>);
    }
    return null;
  },
});

document.body.append(panel.element);
attachPlayground(() => sim, () => engine.paused);
attachEcologyPanel(() => sim);
attachEvolutionPanel(() => sim);
attachSystemPanel();
attachPowerSaving(app, () => engine.paused);
}
