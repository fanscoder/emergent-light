import {GENE_DEFS,geneSimilarity,type GeneStore} from './genetics';
export interface EventCounts {births:number;combatDeaths:number;oldAge:number;starvation:number;deathAgeSum:number;attacks:number;nonlethalConflicts:number}
/** One-second cumulative checkpoints, bounded to the recent simulation-time interval. */
export class RecentEvolution {
 private points:({time:number}&EventCounts)[]=[];
 reset(t:EventCounts){this.points=[{time:0,...t}];}
 record(time:number,t:EventCounts){
  if(!this.points.length||Math.floor(time)>Math.floor(this.points[this.points.length-1].time))this.points.push({time,...t});
  while(this.points.length>1&&this.points[1].time<=time-120)this.points.shift();
 }
 read(time:number,t:EventCounts){
  const base=this.points[0]??{time,...t},deaths=t.combatDeaths+t.oldAge+t.starvation-base.combatDeaths-base.oldAge-base.starvation;
  return {seconds:Math.min(time,120),births:t.births-base.births,combatDeaths:t.combatDeaths-base.combatDeaths,attacks:t.attacks-base.attacks,nonlethalConflicts:t.nonlethalConflicts-base.nonlethalConflicts,deaths,meanDeathAge:deaths?(t.deathAgeSum-base.deathAgeSum)/deaths:null};
 }
}
/** Representative-radius grouping: no ancestry labels or chained-neighbor merging. */
export function estimateGroups(genes:GeneStore,ids:Uint32Array,count:number){
 const groups:{representative:number;size:number}[]=[];
 const order=Array.from({length:count},(_,i)=>i).sort((a,b)=>ids[a]-ids[b]);
 for(const i of order){let best=-1,similarity=.84;
  for(let j=0;j<groups.length;j++){const s=geneSimilarity(genes,i,groups[j].representative);if(s>=similarity){best=j;similarity=s;}}
  if(best<0)groups.push({representative:i,size:1});else groups[best].size++;
 }
 return {count:groups.filter(g=>g.size>=3).length,scattered:groups.filter(g=>g.size<3).reduce((sum,g)=>sum+g.size,0)};
}
export function traitRanges(genes:GeneStore,count:number){
 return Object.fromEntries(GENE_DEFS.filter(g=>!g.cyclic).map(g=>{
  const values=Array.from(genes[g.key].subarray(0,count)).sort((a,b)=>a-b);
  return [g.key,count?[values[Math.floor((count-1)*.1)],values[Math.floor((count-1)*.9)]]:null];
 }));
}
