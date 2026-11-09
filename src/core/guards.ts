import type { ParticleStore } from './types';
export const DESPERATE_ENERGY=.45;
export function predatorWinsGuard(energy:number,roll:number):boolean{return energy<DESPERATE_ENERGY&&roll<.5;}
const delta=(d:number,size:number)=>d-Math.round(d/size)*size;
export class Guards {
 private clock=0;
 readonly recruitAt:Float64Array;
 readonly target:Int32Array;readonly side:Int8Array;readonly strength:Float32Array;
 constructor(capacity:number){this.recruitAt=new Float64Array(capacity);this.target=new Int32Array(capacity);this.side=new Int8Array(capacity);this.strength=new Float32Array(capacity);this.reset();}
 reset():void{this.clock=0;this.recruitAt.fill(0);this.target.fill(-1);this.side.fill(0);this.strength.fill(0);}
 spawn(i:number):void{this.recruitAt[i]=0;this.target[i]=-1;this.side[i]=0;this.strength[i]=0;}
 update(s:ParticleStore,w:number,h:number,k:number,dt:number,recruit:boolean):void{
  this.clock+=dt;
  for(let i=0;i<s.count;i++){
   const p=this.target[i];
   if(p>=0){const dx=delta(s.x[i]-s.x[p],w),dy=delta(s.y[i]-s.y[p],h);
    if(p>=s.count||!s.leader?.[p]||s.leader?.[i]||s.type[i]===2||s.type[i]!==s.type[p]||dx*dx+dy*dy>(240*k)**2)this.target[i]=-1;
   }
  }
  if(recruit)for(let p=0;p<s.count;p++)if(s.leader?.[p]&&s.type[p]!==2&&this.clock>=this.recruitAt[p]){
   for(const side of [-1,1]){
    let occupied=false;for(let i=0;i<s.count;i++)if(this.target[i]===p&&this.side[i]===side){occupied=true;break;}
    if(occupied)continue;let chosen=-1,best=(100*k)**2;
    for(let i=0;i<s.count;i++){
     if(this.target[i]>=0||s.leader?.[i]||s.type[i]!==s.type[p]||s.age[i]<12||(s.energy?.[i]??0)<.35)continue;
     const dx=delta(s.x[i]-s.x[p],w),dy=delta(s.y[i]-s.y[p],h),d2=dx*dx+dy*dy;
     if(d2<best){best=d2;chosen=i;}
    }
    if(chosen>=0){this.target[chosen]=p;this.side[chosen]=side;}
   }
  }
  for(let i=0;i<s.count;i++)this.strength[i]=this.target[i]>=0?Math.min(1,this.strength[i]+dt/3):Math.max(0,this.strength[i]-dt/2);
 }
 remove(index:number,last:number):void{
  const head=this.target[index];if(head>=0)this.recruitAt[head]=Math.max(this.recruitAt[head],this.clock+30);
  for(let i=0;i<=last;i++)if(this.target[i]===index)this.target[i]=-1;
  if(index!==last){
   for(let i=0;i<=last;i++)if(this.target[i]===last)this.target[i]=index;
   this.recruitAt[index]=this.recruitAt[last];this.target[index]=this.target[last];this.side[index]=this.side[last];this.strength[index]=this.strength[last];
  }
  this.spawn(last);
 }
}
