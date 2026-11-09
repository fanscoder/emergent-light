import { panelSection } from '../ui/sections';
import { isTauri } from './tauri';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getVersion } from '@tauri-apps/api/app';
export function attachSystemPanel(): void {
  const section=panelSection('系统与使用指南');
  const row=document.createElement('label'); row.className='panel-row';
  const checkbox=document.createElement('input'); checkbox.type='checkbox'; checkbox.disabled=true;
  row.append(checkbox,'开机自启');
  const note=document.createElement('div'); note.className='panel-status';
  const version=document.createElement('p'); version.textContent='Emergent Light · 浏览器预览';
  const guide=document.createElement('div'); guide.className='panel-guide';
  for(const text of ['点击“桌面壁纸”进入背景模式。','单击右下角托盘图标返回设置；右键显示菜单。','Ctrl+Alt+P：切换壁纸与设置。','关闭设置窗口会回到壁纸；彻底退出请使用托盘菜单。','互动与彩蛋默认关闭，可按喜好开启。']){
    const p=document.createElement('p'); p.textContent=text; guide.append(p);
  }
  section.body.append(row,note,version,guide);
  document.querySelector('#panel .panel-body')?.append(section.root);
  if(!isTauri()){note.textContent='开机自启与桌面切换仅安装版可用'; return;}
  const sync=async():Promise<void>=>{ checkbox.checked=await invoke<boolean>('get_startup'); };
  checkbox.onchange=()=>{
    const requested=checkbox.checked; checkbox.disabled=true;
    void invoke('set_startup',{on:requested}).then(sync).then(()=>{note.textContent='已保存';})
      .catch(async e=>{note.textContent=String(e);try{await sync();}catch{/* retain error */}})
      .finally(()=>{checkbox.disabled=false;});
  };
  void (async()=>{
    await listen<boolean>('startup-changed',e=>{checkbox.checked=e.payload;});
    await sync(); checkbox.disabled=false;
    version.textContent='Emergent Light v'+await getVersion();
  })().catch(e=>{note.textContent='读取系统设置失败：'+String(e);});
}
