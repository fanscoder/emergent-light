import {Rng} from './rng';
const wrap=(v:number)=>((v%1)+1)%1;
const smooth=(v:number)=>v*v*(3-2*v);
/** Periodic 3 by 2 resource field. Coordinates and passages survive screen resizing. */
export class EvolutionEnvironment {
 readonly fertility:number[];
 readonly cols:number;readonly rows:number;readonly warpX:number;readonly warpY:number;readonly phaseX:number;readonly phaseY:number;readonly maxResource:number;
 constructor(seed:number){
  const rng=new Rng(seed^0x48414249);this.cols=2+rng.int(3);this.rows=2+rng.int(2);this.warpX=rng.range(.04,.16);this.warpY=rng.range(.04,.16);this.phaseX=rng.range(0,Math.PI*2);this.phaseY=rng.range(0,Math.PI*2);
  const values=Array.from({length:this.cols*this.rows},()=>rng.range(.3,1.7)),mean=values.reduce((a,b)=>a+b,0)/values.length;
  for(let i=0;i<values.length;i++)values[i]/=mean;
  for(let i=values.length-1;i>0;i--){const j=rng.int(i+1);[values[i],values[j]]=[values[j],values[i]];}
  this.fertility=values;this.maxResource=Math.max(1,...values);
 }
 coordinates(x:number,y:number){const u=wrap(x+this.warpX*Math.sin(2*Math.PI*y+this.phaseX));return [u,wrap(y+this.warpY*Math.sin(2*Math.PI*u+this.phaseY))] as const;}
 world(u:number,v:number){const y=wrap(v-this.warpY*Math.sin(2*Math.PI*u+this.phaseY));return [wrap(u-this.warpX*Math.sin(2*Math.PI*y+this.phaseX)),y] as const;}
 center(index:number){return this.world((index%this.cols+.5)/this.cols,(Math.floor(index/this.cols)+.5)/this.rows);}
 region(x:number,y:number){const [u,v]=this.coordinates(x,y);return Math.floor(u*this.cols)+this.cols*Math.floor(v*this.rows);}
 resource(x:number,y:number,contrast:number){
  const [u,v]=this.coordinates(x,y),sx=u*this.cols-.5,sy=v*this.rows-.5,ix=Math.floor(sx),iy=Math.floor(sy),tx=smooth(sx-ix),ty=smooth(sy-iy);
  const at=(a:number,b:number)=>this.fertility[((a%this.cols)+this.cols)%this.cols+this.cols*(((b%this.rows)+this.rows)%this.rows)];
  const a=at(ix,iy)*(1-tx)+at(ix+1,iy)*tx,b=at(ix,iy+1)*(1-tx)+at(ix+1,iy+1)*tx;
  return 1+Math.max(0,Math.min(1,contrast))*(a*(1-ty)+b*ty-1);
 }
 resistance(x:number,y:number){
  const band=(v:number,n:number)=>Math.exp(-((Math.sin(Math.PI*n*v)/.16)**2));
  const [u,v]=this.coordinates(x,y),gate=(a:number,phase:number)=>.04+.96*Math.sin(Math.PI*2*a+phase)**8;
  return Math.max(band(u,this.cols)*(1-gate(v,this.phaseX)),band(v,this.rows)*(1-gate(u,this.phaseY)));
 }
}
export function huntingIntent(diet:number,energy:number){return diet*diet*Math.max(0,Math.min(1,(1.45-energy)/.9));}
/** A hunt may fail without death. Strong prey can counter; diet never enters ability. */
export function huntOutcome(a:number,b:number,roll:number):'a'|'b'|'both'|'retreat'{
 const ratio=a/Math.max(.001,b);
 if(ratio>1.15)return 'a';
 if(ratio<.8)return roll<.2?'b':'retreat';
 if(roll<.015)return 'both';
 return roll<.015+.22*ratio*ratio?'a':'retreat';
}
