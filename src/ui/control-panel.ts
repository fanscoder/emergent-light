import { panelSection } from './sections';
import { attachFloatingPanel } from './floating-panel';
// 控制面板（M4）：原生 DOM + CSS，零运行时依赖。
// 所有模拟交互经 PanelHandlers 委托给 main.ts（那里处理世界缩放、重启语义与预设）。

import type { VisualParams } from '../render/canvas2d/deep-ocean-renderer';
import type { ControlSpec, SimMode } from './panel-spec';
import { MODE_OPTIONS, VISUAL_CONTROLS, buildModeControls, sliderHint } from './panel-spec';

export interface PanelHandlers {
  getMode(): SimMode;
  setMode(mode: SimMode): void;
  /** 应用控件值：spec 带缩放与 restart 语义，由 main 决定如何落参 */
  applyControl(spec: ControlSpec, value: number | string | boolean): void;
  /** 读当前参数实际值（slider 显示值 = 实际值 / spec.scale） */
  getParam(key: string): number | string | boolean | undefined;
  getVisual(): VisualParams;
  setVisual(key: keyof VisualParams, value: number): void;
  getSeed(): number;
  newSeed(): void;
  resetDefaults(): void;
  togglePause(): boolean;
  /** 壁纸模式（仅桌面端）：开启鼠标穿透；返回错误消息或 null（成功） */
  enterWallpaperMode?(): Promise<string | null>;
  getShowStats(): boolean;
  setShowStats(on: boolean): void;
  savePreset(): string | null;
  /** 导入预设 JSON 文本；返回错误消息或 null（成功） */
  importPresetText(text: string): string | null;
}

export interface ControlPanel {
  element: HTMLElement;
  /** 模式/参数外部变化（模式切换、导入预设）后重建控件并同步滑块位置 */
  refresh(): void;
}

function formatValue(v: number, step: number): string {
  const precision=Math.min(6,(String(step).split('.')[1]??'').length);
  return step >= 1 ? String(Math.round(v)) : v.toFixed(precision).replace(/0+$/, '').replace(/\.$/, '');
}

export function createControlPanel(
  worldScale: number,
  handlers: PanelHandlers,
): ControlPanel {
  const root = document.createElement('div');
  root.id = 'panel';
  root.className = 'panel';

  const head = document.createElement('div');
  head.className = 'panel-head';
  const title = document.createElement('span');
  title.textContent = '控制台';
  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'panel-collapse';
  collapseBtn.textContent = '—';
  head.append(title, collapseBtn);
  root.append(head);

  const body = document.createElement('div');
  body.className = 'panel-body';
  root.append(body);

  let statusTimer = 0;
  const setStatus = (msg: string): void => {
    status.textContent = msg;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (status.textContent = ''), 4000);
  };

  // —— 模式行 ——
  const modeRow = document.createElement('div');
  modeRow.className = 'panel-row mode-row';
  const modeLabel = document.createElement('label');
  modeLabel.textContent = '模式';
  const modeSelect = document.createElement('select');
  for (const opt of MODE_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    modeSelect.append(o);
  }
  const seedSpan = document.createElement('span');
  seedSpan.className = 'panel-seed';
  modeRow.append(modeLabel, modeSelect, seedSpan);

  // —— 按钮行 ——
  const btnRow = document.createElement('div');
  btnRow.className = 'panel-row btn-row';
  const mkBtn = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  };
  const pauseBtn = mkBtn('暂停', () => {
    pauseBtn.textContent = handlers.togglePause() ? '继续' : '暂停';
  });
  btnRow.append(
    mkBtn('换个种子', () => {
      handlers.newSeed();
      syncSeed();
      setStatus('已按新种子重开世界');
    }),
    pauseBtn,
    mkBtn('恢复默认', () => {
      handlers.resetDefaults();
      buildBody();
      setStatus('已恢复默认参数');
    }),
    mkBtn('保存预设', () => {
      const err = handlers.savePreset();
      setStatus(err ?? '已保存到本地并下载 JSON 文件');
    }),
    mkBtn('导入预设', () => fileInput.click()),
  );

  // 壁纸模式按钮（仅桌面端提供）
  if (handlers.enterWallpaperMode) {
    btnRow.append(
      mkBtn('桌面壁纸', () => {
        void handlers.enterWallpaperMode!().then(err => {
          setStatus(err ?? '已进入桌面壁纸：单击右下角托盘图标打开设置');
        });
      }),
    );
  }

  const status = document.createElement('div');
  status.className = 'panel-status';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'application/json,.json';
  fileInput.style.display = 'none';
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const err = handlers.importPresetText(String(reader.result ?? ''));
      if (err) {
        setStatus(err);
      } else {
        buildBody();
        setStatus('预设已载入');
      }
    };
    reader.readAsText(file);
  });

  // —— 控件构建 ——
  const controlsBox = document.createElement('div');
  controlsBox.className = 'panel-controls';

  const mkSlider = (spec: ControlSpec & { kind: 'slider' }, read: () => number, apply: (v: number) => void): HTMLElement => {
    const row = document.createElement('div');
    row.className = 'panel-ctl';
    const label = document.createElement('label');
    label.textContent = spec.label;
    const value = document.createElement('span');
    value.className = 'panel-value';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    const hint=document.createElement('small');hint.className='panel-slider-hint';
    const show=(v:number)=>{value.textContent=formatValue(v,spec.step);hint.textContent=handlers.getMode()==='evolution'?sliderHint(spec.key,v):'';};
    const sync = (): void => {
      const display = read();
      input.value = String(display);
      show(display);
    };
    input.addEventListener('input', () => {
      const v = Number(input.value);
      show(v);
      apply(v);
    });
    sync();
    row.append(label, input, value, hint);
    return row;
  };

  const buildBody = (): void => {
    const mode = handlers.getMode();
    modeSelect.value = mode;
    syncSeed();
    controlsBox.textContent = '';
    const display=panelSection('显示与性能'); controlsBox.append(display.root);
    const statsRow = document.createElement('label');
    statsRow.className = 'panel-row';
    const statsCheck = document.createElement('input');
    statsCheck.type = 'checkbox';
    statsCheck.checked = handlers.getShowStats();
    statsCheck.addEventListener('change', () => handlers.setShowStats(statsCheck.checked));
    statsRow.append(statsCheck, '显示性能信息');
    display.body.append(statsRow);
    const visual=panelSection('视觉效果'); controlsBox.append(visual.root);
    for (const spec of VISUAL_CONTROLS) {
      visual.body.append(
        mkSlider(
          spec,
          () => handlers.getVisual()[spec.key as keyof VisualParams],
          (v) => handlers.setVisual(spec.key as keyof VisualParams, v),
        ),
      );
    }
    const simulation=panelSection('模拟参数'); controlsBox.append(simulation.root);
    for (const spec of buildModeControls(mode, worldScale,handlers.getParam('experimentalRange')===true)) {
      if (spec.kind === 'slider') {
        simulation.body.append(
          mkSlider(
            spec,
            () => {
              const actual = handlers.getParam(spec.key);
              return typeof actual === 'number' ? actual / spec.scale : spec.min;
            },
            (v) => handlers.applyControl(spec, v * spec.scale),
          ),
        );
      } else if (spec.kind === 'toggle') {
        const row = document.createElement('div');
        row.className = 'panel-ctl';
        const label = document.createElement('label');
        label.textContent = spec.label;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = handlers.getParam(spec.key) === true;
        input.addEventListener('change', () => {handlers.applyControl(spec, input.checked);if(spec.key==='experimentalRange')buildBody();});
        row.append(label, input);
        simulation.body.append(row);
      } else {
        const row = document.createElement('div');
        row.className = 'panel-ctl';
        const label = document.createElement('label');
        label.textContent = spec.label;
        const select = document.createElement('select');
        for (const o of spec.options) {
          const opt = document.createElement('option');
          opt.value = o.value;
          opt.textContent = o.label;
          select.append(opt);
        }
        const cur = handlers.getParam(spec.key);
        select.value = typeof cur === 'string' ? cur : spec.options[0].value;
        select.addEventListener('change', () => handlers.applyControl(spec, select.value));
        row.append(label, select);
        simulation.body.append(row);
      }
    }
  };

  const syncSeed = (): void => {
    seedSpan.textContent = `种子 ${handlers.getSeed()}`;
  };

  modeSelect.addEventListener('change', () => {
    handlers.setMode(modeSelect.value as SimMode);
    buildBody();
    setStatus('已切换模式');
  });

  attachFloatingPanel(root,head,body,collapseBtn);

  const quick=document.createElement('div');quick.className='panel-quick';
  const quickActions=document.createElement('div');quickActions.className='panel-row btn-row';
  quickActions.append(btnRow.children[0],pauseBtn);quick.append(modeRow,quickActions);root.insertBefore(quick,body);
  const basic=panelSection('预设与桌面', true); basic.body.append(btnRow);
  body.append(basic.root, status, controlsBox, fileInput);
  buildBody();

  return {
    element: root,
    refresh: buildBody,
  };
}
