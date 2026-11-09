import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './tauri';
import { powerMode } from './power-policy';
import type { BrowserApp } from './browser';
export function attachPowerSaving(app:BrowserApp,paused:()=>boolean):void {
 let enabled=true;
 try{enabled=localStorage.getItem('emergent-light-power-saving')!=='false';}catch{/* default */}
 const label=document.createElement('label');label.className='panel-row';
 const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=enabled;
 label.append(checkbox,'自动后台节能');
 const status=document.createElement('div');status.className='panel-status';
 const help=document.createElement('p');help.className='panel-guide';help.textContent='画面可见时保持正常帧率；确认完全遮挡、锁屏或熄屏时休眠，回来后继续。';
 document.querySelector('#panel .panel-group:last-child .panel-group-body')?.prepend(label,status,help);
 let generation=0,checking=false;
 async function check():Promise<void>{
   if(checking)return;checking=true;const token=generation;
   try{
     const native=enabled&&isTauri()?await invoke<number>('power_status'):0;
     if(token!==generation)return;
     // In desktop embedding, native visibility is authoritative: WebView occlusion
     // can mark an embedded surface hidden even while its desktop is visible.
     const hidden=!isTauri()&&document.hidden;
     const mode=powerMode(enabled,hidden,native);
     app.setPowerMode(mode);document.body.dataset.powerMode=mode;
     status.textContent=paused()?'状态：手动暂停':mode==='sleep'?'状态：后台休眠':enabled?'状态：正常运行':'状态：自动节能已关闭';
   }catch{
     app.setPowerMode('normal');document.body.dataset.powerMode='normal';status.textContent='状态：无法确认遮挡，保持运行';
   }finally{checking=false;}
 }
 checkbox.onchange=()=>{
   enabled=checkbox.checked;generation++;
   try{localStorage.setItem('emergent-light-power-saving',String(enabled));}catch{/* no storage */}
   if(!enabled){app.setPowerMode('normal');document.body.dataset.powerMode='normal';}
   void check();
 };
 window.addEventListener('focus',()=>void check());document.addEventListener('visibilitychange',()=>void check());
 window.setInterval(()=>void check(),750);void check();
}
