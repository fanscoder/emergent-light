import type {GeneStore} from '../core/genetics';
import type {ParticleStyle} from './themes';
export const EVOLUTION_HUES=24;
export function evolutionStyle(hue:number,tint=0):ParticleStyle{
 const channel=(offset:number)=>{const k=(offset+hue*12)%12;return .49-.29*Math.max(-1,Math.min(k-3,9-k,1));};
 const base=[channel(0),channel(8),channel(4)].map(v=>Math.round(v*255));
 const green=[72,190,60],glow=base.map((v,i)=>Math.round(v+(green[i]-v)*tint)) as [number,number,number];
 const core=glow.map(v=>Math.round(v*.35+255*.65));
 return {glow,core:'rgb('+core.join(',')+')',coreSize:1.8};
}
export function phenotype(g:GeneStore,i:number){return {radius:.85+.6*g.longevity[i],tips:3+Math.round(g.strength[i]*3),inner:.85-.4*g.aggression[i],stretch:1+.5*g.pace[i],social:g.social[i],openness:g.tolerance[i]};}
