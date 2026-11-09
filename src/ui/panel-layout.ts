export interface PanelLayout {x:number;y:number;width:number;height:number;scale:number;collapsed:boolean}
const finite=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?v:fallback;
export function fitPanel(raw:Partial<PanelLayout>,vw:number,vh:number):PanelLayout{
 const w=Math.max(1,vw),h=Math.max(1,vh),margin=Math.min(8,w/4,h/4);
 const scale=[.85,1,1.15].includes(raw.scale??0)?raw.scale!:1;
 const width=Math.min(w-2*margin,Math.max(Math.min(300*scale,w-2*margin),finite(raw.width,360)));
 const height=Math.min(h-2*margin,Math.max(Math.min(240*scale,h-2*margin),finite(raw.height,640)));
 const collapsed=raw.collapsed===true,shownWidth=collapsed?Math.min(width,220*scale):width,shownHeight=collapsed?Math.min(height,48*scale):height;
 return {width,height,scale,collapsed,x:Math.min(w-margin-shownWidth,Math.max(margin,finite(raw.x,w-width-margin))),y:Math.min(h-margin-shownHeight,Math.max(margin,finite(raw.y,margin)))};
}
