// 控制面板控件规格（M4）：纯数据、零 DOM，便于单测。
//
// 设计原则（技术设计文档 M4）：
// - 所有控件实时生效不打断模拟；仅标 restart 的键（数量/种类/矩阵风格等）
//   需要按同种子重新初始化世界；
// - 数值单位为 800px 标定世界的"显示值"，scale 为世界缩放倍率
//   （Boids 的空间半径与速度按屏幕宽度等比缩放，见 main.ts）。

export type SimMode = 'particle-life' | 'boids' | 'ecology-boids' | 'ecology-life' | 'evolution';
export function isSimMode(v: unknown): v is SimMode { return ['particle-life','boids','ecology-boids','ecology-life','evolution'].includes(String(v)); }

export interface SliderSpec {
  kind: 'slider';
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** 显示值 → 实际参数值的倍率（世界缩放；默认 1） */
  scale: number;
  /** 改变后需按同种子重新初始化世界 */
  restart: boolean;
}

export interface ToggleSpec {
  kind: 'toggle';
  key: string;
  label: string;
  restart: boolean;
}

export interface SelectSpec {
  kind: 'select';
  key: string;
  label: string;
  options: { value: string; label: string }[];
  restart: boolean;
}

export type ControlSpec = SliderSpec | ToggleSpec | SelectSpec;

function slider(
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  opts: { scale?: number; restart?: boolean } = {},
): SliderSpec {
  return {
    kind: 'slider',
    key,
    label,
    min,
    max,
    step,
    scale: opts.scale ?? 1,
    restart: opts.restart ?? false,
  };
}

/** Boids 随世界缩放的空间/速度键（main.ts 同步维护） */
export const BOIDS_SCALED_KEYS = ['maxSpeed', 'maxForce', 'sepRadius', 'aliRadius', 'cohRadius'];

/** 视觉参数控件（两种模式共用；直接作用于渲染器，热更新无需重启） */
export const VISUAL_CONTROLS: SliderSpec[] = [
  slider('brightness', '整体亮度', 0.3, 1.5, 0.05),
  slider('glowSize', '光晕大小', 0.4, 1.6, 0.05),
  slider('sizeVar', '个体大小差异', 0, 0.8, 0.05),
  slider('trail', '拖尾长短', 0.7, 0.97, 0.01),
];

/** 模式切换选项 */
export const MODE_OPTIONS: { value: SimMode; label: string }[] = [
  { value: 'particle-life', label: '粒子生命' },
  { value: 'boids', label: '鱼群' },
  { value: 'ecology-boids', label: '生态鱼群' },
  { value: 'ecology-life', label: '生态粒子生命' },
  { value: 'evolution', label: '变异与进化' },
];

export function buildModeControls(mode: SimMode, worldScale: number, experimentalRange=false): ControlSpec[] {
  const k = worldScale;
  if(mode==='evolution')return [
    {kind:'toggle',key:'experimentalRange',label:'解锁实验范围（最高1000个体）',restart:false},
    slider('count','初始个体',30,experimentalRange?1000:300,10,{restart:true}),
    slider('maxPopulation','个体上限',50,experimentalRange?1000:450,10),
    slider('foodRate','营养补给/秒',0,60,1),
    {kind:'toggle',key:'environmentEnabled',label:'分区环境',restart:false},
    slider('resourceContrast','资源差异',0,1,.05),
    slider('regionSeparation','区间阻力',0,1,.05),
    {kind:'toggle',key:'habitatVisible',label:'显示地理线索',restart:false},
    {kind:'toggle',key:'pairedEnabled',label:'双亲繁殖',restart:false},
    {kind:'toggle',key:'buddingEnabled',label:'允许低概率出芽',restart:false},
    slider('buddingRate','出芽机会/秒',0,.05,.001),
    {kind:'toggle',key:'huntingEnabled',label:'有效猎食',restart:false},
    slider('maxSpeed','游动速度',10,100,1),
    slider('lifeMean','寿命基准/秒',30,600,10),
    slider('mutationRate','出生变异概率',0,.5,.01),
    slider('mutationStep','变异幅度',0,.2,.005),
    {kind:'toggle',key:'rescueEnabled',label:'低种群迁入救援',restart:false},
  ];
  if (mode === 'ecology-boids' || mode === 'ecology-life') return [
    slider('count','初始种群',30,300,10,{restart:true}),
    slider('maxPopulation','种群上限',50,450,10),
    slider('foodRate','营养补给/秒',0,60,1),
    slider('maxSpeed','默认速度基准',10,100,1),
    slider('lifeMean','默认寿命基准/秒',30,600,10),
    {kind:'toggle',key:'rescueEnabled',label:'低种群迁入救援',restart:false},
  ];
  if (mode === 'boids') {
    return [
      slider('count', '鱼群数量', 50, 300, 10, { restart: true }),
      slider('maxSpeed', '巡游速度', 20, 120, 1, { scale: k }),
      slider('aliRadius', '感知半径', 40, 200, 2, { scale: k }),
      slider('aliWeight', '对齐强度', 0, 3, 0.1),
      slider('cohWeight', '聚集强度', 0, 2, 0.1),
      slider('selfPropel', '个性强度', 0, 3, 0.1),
      slider('sameTypeBias', '同类偏好', 0, 4, 0.1),
      slider('accentShare', '亮色占比', 0, 0.5, 0.01, { restart: true }),
      slider('headingDrift', '方向变化', 0, 0.1, 0.005),
    ];
  }
  return [
    slider('count', '粒子数量', 100, 500, 10, { restart: true }),
    slider('types', '粒子种类', 2, 5, 1, { restart: true }),
    slider('forceScale', '力强度', 10, 80, 1),
    slider('maxSpeed', '速度上限', 10, 80, 1),
    slider('jitter', '扰动', 0, 60, 1),
    slider('selfPropel', '洋流强度', 0, 15, 0.5),
    slider('gamma', '阻尼', 0.1, 2, 0.05),
    { kind: 'toggle', key: 'lifeEnabled', label: '寿命生灭', restart: false },
    slider('lifeMean', '寿命均值（秒）', 20, 240, 5),
    slider('lifeStd', '寿命差异', 0, 90, 1),
    {
      kind: 'select',
      key: 'matrixStyle',
      label: '关系矩阵',
      options: [
        { value: 'random', label: '全随机' },
        { value: 'symmetric', label: '对称' },
        { value: 'sparse', label: '稀疏' },
      ],
      restart: true,
    },
  ];
}

/** 亮色占比 → typeShares 补丁（Boids 专用语义键） */
export function accentSharePatch(accent: number): { typeShares: number[] } {
  const a = Math.min(0.8, Math.max(0, accent));
  const rest = (1 - a) / 2;
  return { typeShares: [rest, rest, a] };
}

/** Short descriptions report mechanics, rather than promising evolutionary outcomes. */
export function sliderHint(key:string,v:number):string{
 switch(key){
 case 'resourceContrast':return v===0?'补给位置均匀':'资源丰贫差异更明显';
 case 'regionSeparation':return v===0?'自由迁移':'跨区更慢 · 通道仍开放';
 case 'buddingRate':return v===0?'关闭出芽机会':'成熟且储能足够时抽取';
 case 'mutationRate':return v===0?'子代不变异':v<=.15?'亲子更相似':v>=.35?'更多子代发生变化':'适度发生变化';
 case 'mutationStep':return v===0?'不发生属性偏移':v<=.06?'单次变化较小':'单次变化更大';
 case 'maxPopulation':return v>450?'实验数量 · 计算量更高':'限制后续出生数量';
 case 'count':return '调整后重建世界';
 case 'foodRate':return '每秒新增营养颗粒';
 case 'lifeMean':return '新生个体的寿命基准';
 case 'maxSpeed':return '游动速度上限基准';
 default:return '';
 }
}
