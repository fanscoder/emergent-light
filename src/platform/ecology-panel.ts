import { panelSection } from '../ui/sections';
import { attachSpeciesPanel } from './species-panel';
import { EcologySimulation } from '../core/modes/ecology';
import type { Simulation } from '../core/types';
export function attachEcologyPanel(getSim:()=>Simulation):void{
 const group=panelSection('生态观察');
 const description=document.createElement('p');description.className='panel-guide';
 description.textContent='青色与琥珀取食营养颗粒，紫色捕食它们。光晕表达能量；出芽后亲代收敛、幼体逐渐显现。小四芒星表示头领：吸引同类，被捕食者头领能承受三次攻击。生态鱼群在同类头领附近更易出芽。护卫在头领前方两侧活动，以两个小光点标记；危急时迎击捕食者。无遗传变异。';
 const status=document.createElement('div');status.className='panel-guide';status.style.whiteSpace='pre-line';
 group.body.append(description,status);document.querySelector('#panel .panel-body')?.append(group.root);
 const update=():void=>{
  const sim=getSim();group.root.hidden=!(sim instanceof EcologySimulation);
  if(sim instanceof EcologySimulation){const s=sim.statistics;status.textContent=
   `${sim.mode==='ecology-boids'?'群猎：跟随头领结伴追逐':'独猎：捕食者分散'}\n捕食者繁殖间隔基准 ${sim.speciesProfile('predator').Interval} 秒\n青色 ${s.cyan} · 琥珀 ${s.amber} · 捕食者 ${s.predators}\n营养颗粒 ${s.food} · 总种群 ${s.population}\n出芽 ${s.births} · 捕食 ${s.predation} · 迁入 ${s.immigrants}`;}
 };
 update();window.setInterval(update,1000);
 attachSpeciesPanel(getSim);
}
