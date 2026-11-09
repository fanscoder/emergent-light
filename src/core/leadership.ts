import type { ParticleStore } from './types';
const delta=(d:number,size:number)=>d-Math.round(d/size)*size;
/** Promote existing adults only. Deterministic, no RNG draws and no offspring inheritance. */
export function electLeaders(s:ParticleStore,leader:Float32Array,width:number,height:number,scale:number,pack:boolean):void{
 for(const type of [0,4,2]){
  if(type===2&&!pack)continue;
  const cap=type===0?4:2,threshold=type===2?4:8;
  let count=0;for(let i=0;i<s.count;i++)if(s.type[i]===type&&leader[i]>0)count++;
  if(count>=cap)continue;
  let chosen=-1,best=threshold-1;
  for(let i=0;i<s.count;i++){
   if(s.type[i]!==type||leader[i]>0||s.age[i]<12||(s.guard?.[i]??0)>0||(s.energy?.[i]??0)<.4)continue;
   let neighbors=0,nearLeader=false;
   for(let j=0;j<s.count;j++){
    if(i===j||s.type[j]!==type)continue;
    const dx=delta(s.x[j]-s.x[i],width),dy=delta(s.y[j]-s.y[i],height),d2=dx*dx+dy*dy;
    if(leader[j]>0&&d2<(180*scale)**2){nearLeader=true;break;}
    if(d2<(90*scale)**2)neighbors++;
   }
   if(!nearLeader&&neighbors>best){best=neighbors;chosen=i;}
  }
  if(chosen>=0)leader[chosen]=.001;
 }
}
/** A few followers barely steer a leader; a large crowd can gradually turn it. */
export function leaderResponse(weight:number):number{return .12+Math.min(.68,weight*.035);}
