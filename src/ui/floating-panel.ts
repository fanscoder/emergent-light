import {fitPanel,type PanelLayout} from './panel-layout';
const KEY='emergent-light-panel-layout-v1';
export function attachFloatingPanel(root:HTMLElement,head:HTMLElement,body:HTMLElement,collapse:HTMLButtonElement):void{
 let saved:Partial<PanelLayout>={};try{saved=JSON.parse(localStorage.getItem(KEY)??'{}')??{};}catch{/* defaults */}
 let state=fitPanel(saved,innerWidth,innerHeight);
 const tools=document.createElement('div');tools.className='panel-tools';
 const size=document.createElement('select');size.setAttribute('aria-label','界面大小');size.title='界面大小';
 for(const [v,label] of [[.85,'小'],[1,'标准'],[1.15,'大']] as const){const option=document.createElement('option');option.value=String(v);option.textContent=label;size.append(option);}
 const reset=document.createElement('button');reset.textContent='复位';reset.title='恢复面板布局';reset.setAttribute('aria-label','恢复面板布局');
 tools.append(size,reset,collapse);head.append(tools);
 const grip=document.createElement('button');grip.className='panel-resize';grip.title='拖动调整面板尺寸；方向键微调';grip.setAttribute('aria-label','调整面板尺寸');grip.textContent='◢';root.append(grip);
 body.id='panel-content';collapse.setAttribute('aria-controls',body.id);head.title='拖动移动，双击收起或展开';
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state));}catch{/* storage unavailable */}};
 const paint=()=>{
  state=fitPanel(state,innerWidth,innerHeight);root.style.left=state.x+'px';root.style.top=state.y+'px';root.style.right='auto';
  root.style.width=(state.collapsed?Math.min(state.width,220*state.scale):state.width)+'px';root.style.height=state.collapsed?'auto':state.height+'px';
  root.style.setProperty('--panel-scale',String(state.scale));root.classList.toggle('is-collapsed',state.collapsed);body.hidden=state.collapsed;
  grip.hidden=state.collapsed;collapse.textContent=state.collapsed?'＋':'—';collapse.title=state.collapsed?'展开控制台':'收起控制台';collapse.setAttribute('aria-label',collapse.title);collapse.setAttribute('aria-expanded',String(!state.collapsed));size.value=String(state.scale);
 };
 const toggle=()=>{state.collapsed=!state.collapsed;paint();save();};collapse.onclick=toggle;
 head.ondblclick=e=>{if(!(e.target as Element).closest('button,select,input'))toggle();};
 size.onchange=()=>{const next=Number(size.value),ratio=next/state.scale;state={...state,scale:next,width:state.width*ratio,height:state.height*ratio};paint();save();};
 reset.onclick=()=>{state=fitPanel({},innerWidth,innerHeight);paint();save();};
 let gesture:{id:number;x:number;y:number;initial:PanelLayout;resize:boolean;target:HTMLElement}|null=null;
 const start=(event:PointerEvent,resize:boolean)=>{
  if(event.button!==0||gesture||(!resize&&(event.target as Element).closest('button,select,input,a')))return;
  event.preventDefault();const target=resize?grip:head;target.setPointerCapture(event.pointerId);gesture={id:event.pointerId,x:event.clientX,y:event.clientY,initial:{...state},resize,target};root.classList.add('is-manipulating');
 };
 head.addEventListener('pointerdown',e=>start(e,false));grip.addEventListener('pointerdown',e=>start(e,true));
 const move=(e:PointerEvent)=>{if(!gesture||e.pointerId!==gesture.id)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
  state=gesture.resize?{...gesture.initial,width:gesture.initial.width+dx,height:gesture.initial.height+dy}:{...gesture.initial,x:gesture.initial.x+dx,y:gesture.initial.y+dy};paint();
 };
 const end=(e:PointerEvent)=>{
  if(!gesture||e.pointerId!==gesture.id)return;const active=gesture;gesture=null;root.classList.remove('is-manipulating');
  if(!active.resize){const rect=root.getBoundingClientRect();if(rect.left<20)state.x=8;if(innerWidth-rect.right<20)state.x=innerWidth-rect.width-8;if(rect.top<20)state.y=8;if(innerHeight-rect.bottom<20)state.y=innerHeight-rect.height-8;}
  if(active.target.hasPointerCapture(e.pointerId))active.target.releasePointerCapture(e.pointerId);paint();save();
 };
 for(const target of [head,grip]){target.addEventListener('pointermove',move);target.addEventListener('pointerup',end);target.addEventListener('pointercancel',end);target.addEventListener('lostpointercapture',end);}
 grip.onkeydown=e=>{const step=e.shiftKey?30:10;if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();state.width+=e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0;state.height+=e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0;paint();save();};
 window.addEventListener('resize',()=>{paint();save();});paint();
}
