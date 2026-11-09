import { panelSection } from '../ui/sections';
import type { Simulation } from '../core/types';
import type { PointerMode, EggShape } from '../core/interaction';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';
export function attachPlayground(getSim: () => Simulation, paused: () => boolean): void {
  let mode: PointerMode = 'off', automatic = false;
  try {
    const saved = JSON.parse(localStorage.getItem('emergent-light-playground') ?? '{}');
    if (['off','attract','repel'].includes(saved.mode)) mode = saved.mode;
    automatic = saved.automatic === true;
  } catch { /* use quiet defaults */ }
  const save = (): void => { try { localStorage.setItem('emergent-light-playground', JSON.stringify({mode,automatic})); } catch { /* no storage */ } };
  const section=panelSection('互动与彩蛋'); const box=section.body;
  const label = document.createElement('label'); label.textContent = '光标互动 '; label.className = 'panel-row';
  const select = document.createElement('select');
  for (const [value,text] of [['off','关闭'],['attract','朝光标聚集'],['repel','避开光标']]) {
    const o=document.createElement('option'); o.value=value; o.textContent=text; select.append(o);
  }
  select.value=mode; select.onchange=()=>{mode=select.value as PointerMode; getSim().interaction.pointer=null; save();}; label.append(select);
  const autoLabel=document.createElement('label'); autoLabel.className='panel-row';
  const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.checked=automatic;
  checkbox.onchange=()=>{automatic=checkbox.checked; save();}; autoLabel.append(checkbox,'偶尔出现彩蛋（约 3–6 分钟）');
  const note=document.createElement('div'); note.className='panel-status'; note.textContent='形状印章：出生后自然演化';
  const buttons=document.createElement('div'); buttons.className='panel-row btn-row';
  for (const [shape,text] of [['creeper','预览苦力怕脸']] as const) {
    const button=document.createElement('button'); button.textContent=text;
    button.onclick=()=>{
      if(paused()){note.textContent='请先继续模拟，再预览彩蛋';return;}
      getSim().interaction.request(shape as EggShape); note.textContent='已播种图案，随后自然演化';
    }; buttons.append(button);
  }
  box.append(label,autoLabel,buttons,note); document.querySelector('#panel .panel-body')?.append(section.root);
  let local: {x:number;y:number} | null=null;
  window.addEventListener('pointermove',e=>{ local=(e.target instanceof Element && e.target.closest('#panel')) ? null : {x:e.clientX,y:e.clientY}; });
  window.addEventListener('pointerout',e=>{if(!e.relatedTarget)local=null;});
  window.addEventListener('blur',()=>{local=null;});
  // Poll only while enabled and embedded. No hooks, cursor capture or click interception.
  async function update(): Promise<void> {
    const sim=getSim(), interaction=sim.interaction;
    interaction.mode=mode; interaction.automatic=automatic;
    try {
      if(mode==='off'||paused()||document.body.dataset.powerMode==='sleep') interaction.pointer=null;
      else if(isTauri()&&document.body.classList.contains('wallpaper-mode')) {
        const p=await invoke<[number,number]|null>('desktop_pointer');
        interaction.pointer=p ? {x:p[0]*innerWidth,y:p[1]*innerHeight}:null;
      } else interaction.pointer=local;
    } catch { interaction.pointer=null; }
    finally { window.setTimeout(()=>void update(),document.body.dataset.powerMode==='sleep'?750:mode==='off'?200:33); }
  }
  void update();
}
