import {panelSection} from '../ui/sections';
import {EvolutionSimulation} from '../core/modes/evolution';
import type {Simulation} from '../core/types';
export function attachEvolutionPanel(getSim:()=>Simulation):void{
 const section=panelSection('演化观察',true),guide=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p'),status=document.createElement('div');
 guide.className='panel-guide';summary.textContent='个体外观与遗传';
 text.textContent='核心半径表达寿命倾向，尖锐程度表达进攻欲望，芒尖数量表达攻击强度，延展表达速度倾向；侧点和外弧表达群体性、差异容忍度，慢变色相帮助识别家族。成年轮廓保持稳定，光晕和亮度继续表达能量。八项属性继承，出生变异概率默认12%，通常只变一项。变异方向有软性关联：偏食草更易低进攻、高群体性；偏捕食更易高进攻，保留独行和群猎；低群体性捕食倾向更易长寿、强攻击。高速维持消耗更高，长寿成熟和繁殖较慢。普通冲突以消耗能量与退让为主，极端情况才致死。谱系统计仅用于观察，不赋予物种或职位。双亲繁殖逐位重组，双方成熟、储能足够且相容才可配对；救援会引入随机新个体，可关闭。';
 text.textContent+=' 近期统计采用最近120秒模拟时间，平均死亡年龄附样本数；当前相似类群按八轴加权距离≤0.16归到代表个体，至少3个体成组，每5秒采样并取最近3次计数的中位数，零散个体另列。类群是近似观察，不是固定物种。当前属性区间为现存个体的10%–90%分位。实验范围提高数量容量，不增加食物；关闭后保留已设数量，降低上限只限制后续出生，不删除存活个体。';
 text.textContent+=' 区域数量、曲线边界、通道与资源由种子生成，资源平滑过渡；食物总补给不变。边界有阻力和通道，无完全封闭区域。有效猎食使饥饿偏肉食个体更积极追猎，成功后转移最多85%猎物储能（受食性与自身容量限制）；强壮猎物可反杀。两项开关可分别比较环境和猎食影响。';
 text.textContent+=' 分区观察中的补给倍率指区域中心的相对资源权重，不是整块区域的实际食物数量。';
 text.textContent+=' 地理底色区分资源、边界带提示通行阻力，暗淡处为通道；可关闭显示。配对双方各投入45%储能，投入的85%形成一个子代，其余损耗；成熟和繁殖间隔仍由寿命基因决定。出芽是每秒机会率，默认0.003，并非每帧抽取固定概率。祖系标签在双亲中择一继承，只用于观察来源，不代表完整双亲家谱。';
 text.textContent+=' 仅保留低概率出芽未必足以维持种群；两种繁殖都关闭后不再出生，低种群迁入救援仍由独立开关决定。';
 guide.append(summary,text);status.className='panel-guide';status.style.whiteSpace='pre-line';section.body.append(guide,status);document.querySelector('#panel .panel-body')?.append(section.root);
 const percent=(v:number)=>Math.round(v*100)+'%';
 const update=()=>{const sim=getSim();section.root.hidden=!(sim instanceof EvolutionSimulation);if(!(sim instanceof EvolutionSimulation))return;const s=sim.statistics;
  status.textContent=`个体 ${s.population} · 营养颗粒 ${s.food}\n累计出生 ${s.births} · 配对 ${s.pairBirths} · 出芽 ${s.budBirths} · 变异出生 ${s.mutatedBirths}\n最高代数 ${s.maxGeneration} · 属性离散度 ${s.diversity.toFixed(2)}\n当前相似类群 ≈${s.groups.count} · 零散个体 ${s.groups.scattered}\n存活祖系 ${s.livingLineages} · 最大祖系 ${s.largestLineage}\n累计猎食尝试 ${s.huntAttempts} · 捕获 ${s.huntKills} · 遭反杀 ${s.counterKills}\n猎食转移能量 ${s.huntEnergy.toFixed(1)} · 跨区 ${s.regionCrossings}\n累计交锋 ${s.attacks} · 非致死 ${s.nonlethalConflicts} · 战斗死亡 ${s.combatDeaths}\n近期窗口 ${s.recent.seconds.toFixed(0)}/120秒\n近期出生 ${s.recent.births} · 战斗死亡 ${s.recent.combatDeaths} · 交锋 ${s.recent.attacks}\n近期平均死亡年龄 ${s.recent.meanDeathAge===null?'暂无样本':s.recent.meanDeathAge.toFixed(0)+'秒'}（${s.recent.deaths}个样本） · 累计迁入 ${s.immigrants}\n肉食倾向 ${percent(s.means.diet)} · 进攻倾向 ${percent(s.means.aggression)}\n攻击强度 ${percent(s.means.strength)} · 群体性 ${percent(s.means.social)}\n寿命倾向 ${percent(s.means.longevity)} · 速度倾向 ${percent(s.means.pace)}\n差异容忍度 ${percent(s.means.tolerance)}\n当前属性区间（10%–90%）：\n${Object.entries(s.ranges).map(([key,range])=>({diet:'肉食',aggression:'进攻',strength:'战力',social:'群体',tolerance:'容忍',longevity:'寿命',pace:'速度'}[key as 'diet'])+' '+(range?percent(range[0])+'–'+percent(range[1]):'暂无个体')).join(' · ')}\n分区观察（编号对应弯曲网格）：\n${s.regions.map(region=>('区域'+(region.index+1))+' 补给×'+region.fertility.toFixed(2)+' · '+region.population+'个 · 肉食'+percent(region.diet)).join('\n')}`;
 };update();window.setInterval(update,1000);
}
