import {panelSection} from '../ui/sections';
import {EvolutionSimulation} from '../core/modes/evolution';
import type {Simulation} from '../core/types';
export function attachEvolutionPanel(getSim:()=>Simulation):void{
 const section=panelSection('演化观察',true),guide=document.createElement('details'),summary=document.createElement('summary'),text=document.createElement('p'),status=document.createElement('div');
 guide.className='panel-guide';summary.textContent='个体外观与遗传';
 text.textContent='没有固定物种、头领或护卫。色相遗传并缓慢漂移；核心伸展表达食性倾向，尖锐程度表达进攻倾向，芒尖数量表达攻击能力，侧点表达社交倾向，细弧表达差异容忍度。亮度与光晕继续表达当前能量。出芽继承六项属性，少数发生小变异；强攻击能力有更高维持消耗，偏肉食者利用营养颗粒的效率较低。相似个体更可能接近，容忍度低的个体排斥差异较大的邻居；这些不是固定族群或职位。双亲繁殖留待后续。救援会引入随机新个体，可关闭观察自然存续。';
 guide.append(summary,text);status.className='panel-guide';status.style.whiteSpace='pre-line';section.body.append(guide,status);document.querySelector('#panel .panel-body')?.append(section.root);
 const percent=(v:number)=>Math.round(v*100)+'%';
 const update=()=>{const sim=getSim();section.root.hidden=!(sim instanceof EvolutionSimulation);if(!(sim instanceof EvolutionSimulation))return;const s=sim.statistics;
  status.textContent=`个体 ${s.population} · 营养颗粒 ${s.food}\n出芽 ${s.births} · 发生变异的出生 ${s.mutatedBirths}\n当前最高代数 ${s.maxGeneration} · 属性离散度 ${s.diversity.toFixed(2)}\n交锋 ${s.attacks} · 战斗死亡 ${s.combatDeaths} · 迁入 ${s.immigrants}\n平均肉食倾向 ${percent(s.means.diet)} · 进攻倾向 ${percent(s.means.aggression)}\n平均攻击能力 ${percent(s.means.strength)} · 社交倾向 ${percent(s.means.social)}\n平均差异容忍度 ${percent(s.means.tolerance)}`;
 };update();window.setInterval(update,1000);
}
