import {panelSection} from '../ui/sections';
import {EcologySimulation} from '../core/modes/ecology';
import type {Simulation} from '../core/types';
import {SPECIES,SPECIES_LIMITS,type SpeciesKey,type SpeciesField} from '../core/species-settings';
export function attachSpeciesPanel(getSim:()=>Simulation):void{
 const section=panelSection('种群详细设置');
 section.root.classList.add('species-settings');
 const note=document.createElement('p');note.className='panel-guide';
 note.textContent='数值是种群基准，寿命、速度和繁殖间隔保留个体差异；能量与护卫身份也会影响速度。鱼群远离同类头领时，繁殖间隔为基准的3倍，成熟更慢、能量要求更高。0秒表示无额外等待，仍须成熟并获得足够能量。调整立即生效，寿命保留当前年龄，缩短后超龄个体会自然消失；使用“保存预设”保存设置。';
 const help=document.createElement('details');help.className='panel-guide';const helpTitle=document.createElement('summary');helpTitle.textContent='调节说明';help.append(helpTitle,note);section.body.append(help);
 const inputs=new Map<SpeciesKey,HTMLInputElement>(),labels=new Map<SpeciesKey,HTMLElement>(),values=new Map<SpeciesKey,HTMLElement>();
 const names={cyan:'青色 · 被捕食者',amber:'琥珀 · 被捕食者',predator:'紫色 · 捕食者'};
 const fields:{key:SpeciesField;label:string;unit:string;step:string}[]=[{key:'Life',label:'寿命基准',unit:'秒',step:'10'},{key:'Speed',label:'速度基准',unit:'参考像素/秒',step:'1'},{key:'Interval',label:'繁殖间隔基准',unit:'秒',step:'1'},{key:'Maturity',label:'成熟年龄基准',unit:'秒',step:'1'},{key:'BirthEnergy',label:'繁殖能量门槛',unit:'能量',step:'.05'}];
 for(const species of SPECIES){
  const sub=panelSection(names[species]);section.body.append(sub.root);
  for(const field of fields){
   const key=`${species}${field.key}` as SpeciesKey;
   const row=document.createElement('label');row.className='panel-ctl species-slider';
   const text=document.createElement('span');text.textContent=field.label;labels.set(key,text);
   const input=document.createElement('input');input.type='range';input.min=String(SPECIES_LIMITS[field.key][0]);input.max=String(SPECIES_LIMITS[field.key][1]);input.step=field.key==='BirthEnergy'?'.01':field.key==='Speed'?'.01':'1';input.setAttribute('aria-label',`${names[species]} ${field.label}`);
   const value=document.createElement('output');value.className='panel-value';values.set(key,value);value.title=field.unit;
   input.oninput=()=>{const sim=getSim();if(!(sim instanceof EcologySimulation))return;const v=input.valueAsNumber;if(Number.isFinite(v))sim.updateParams({[key]:v});value.textContent=String(Number(v.toFixed(2)))+(field.unit==='秒'?'秒':'');input.setAttribute('aria-valuetext',String(v)+' '+field.unit);labels.get(key)!.textContent=field.label;};
   text.title=field.label+'（'+field.unit+'）';row.append(text,input,value);sub.body.append(row);inputs.set(key,input);
  }
  const reset=document.createElement('button');reset.textContent='恢复此种群默认';reset.onclick=()=>{const sim=getSim();if(sim instanceof EcologySimulation)sim.updateParams(Object.fromEntries(fields.map(f=>[species+f.key,-1])));sync();};sub.body.append(reset);
 }
 function sync():void{
  const sim=getSim();section.root.hidden=!(sim instanceof EcologySimulation);if(!(sim instanceof EcologySimulation))return;
  const params=sim.paramsSnapshot;
  for(const species of SPECIES){const profile=sim.speciesProfile(species);for(const field of fields){const key=`${species}${field.key}` as SpeciesKey,input=inputs.get(key)!;
   if(document.activeElement!==input){input.value=String(profile[field.key]);values.get(key)!.textContent=String(Number(profile[field.key].toFixed(2)))+(field.unit==='秒'?'秒':'');}
   input.setAttribute('aria-valuetext',String(profile[field.key])+' '+field.unit);
   labels.get(key)!.textContent=field.label;labels.get(key)!.title=field.label+'（'+field.unit+'）'+(params[key]<0?' · 随模式默认':' · 手动基准');
  }}
 }
 document.querySelector('#panel .panel-body')?.append(section.root);sync();window.setInterval(sync,500);
}
