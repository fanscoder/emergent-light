import { EVENT_DURATION, type EnergyEventKind } from '../core/ecology-events';
export function eventCue(age:number,kind:EnergyEventKind):{opacity:number;radius:number}{
 const u=age/EVENT_DURATION[kind];
 if(u<=0||u>=1)return {opacity:0,radius:0};
 const envelope=Math.sin(Math.PI*u)**2;
 return {opacity:(kind===0?.82:.74)*envelope,radius:(kind===0?7:5)*(0.65+.35*u)};
}
