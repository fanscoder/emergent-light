import {it,expect} from 'vitest';
import {RecentEvolution,estimateGroups} from './evolution-observation';
import {createGenes,GENE_DEFS} from './genetics';
import {EvolutionSimulation} from './modes/evolution';
const counts=()=>({births:0,combatDeaths:0,oldAge:0,starvation:0,deathAgeSum:0,attacks:0,nonlethalConflicts:0});
it('recent deaths expire, sample absence is explicit, and resetting drops history',()=>{
 const h=new RecentEvolution(),t=counts();h.reset(t);
 t.oldAge=1;t.deathAgeSum=200;h.record(1,t);expect(h.read(1,t).meanDeathAge).toBe(200);
 for(let time=2;time<=125;time++)h.record(time,t);
 expect(h.read(125,t).deaths).toBe(0);expect(h.read(125,t).meanDeathAge).toBeNull();
 t.oldAge++;t.deathAgeSum+=40;h.record(126,t);expect(h.read(126,t).meanDeathAge).toBe(40);
 expect(h.read(126,t).meanDeathAge).toBe(40);h.reset(counts());expect(h.read(0,counts()).seconds).toBe(0);
});
it('current grouping separates divergent descendants without reading ancestry and handles cyclic hue',()=>{
 const g=createGenes(8),ids=new Uint32Array([1,2,3,4,5,6,7,8]);
 for(const def of GENE_DEFS){g[def.key].fill(.1);g[def.key].fill(.9,3,6);}
 g.hue[0]=.99;g.hue[1]=.01;g.hue[2]=0;
 const result=estimateGroups(g,ids,6);expect(result.count).toBe(2);
 expect(estimateGroups(g,ids,0)).toEqual({count:0,scattered:0});expect(estimateGroups(g,ids,2).scattered).toBe(2);
});
it('unlocking enables real 1000-capacity state, locking preserves survivors, presets roundtrip',()=>{
 const sim=new EvolutionSimulation(1920,1080);sim.updateParams({count:1000,maxPopulation:1000});expect(sim.paramsSnapshot.maxPopulation).toBe(450);
 sim.updateParams({experimentalRange:true,count:1000,maxPopulation:1000,rescueEnabled:false});sim.randomize(42);
 expect(sim.particleCount).toBe(1000);expect(sim.getState().capacity).toBe(1000);
 const started=performance.now();for(let i=0;i<120;i++)sim.step(1/60);console.log('1000 individuals / 120 steps ms:',performance.now()-started);
 const before=sim.particleCount;sim.updateParams({experimentalRange:false});expect(sim.particleCount).toBe(before);expect(sim.paramsSnapshot.maxPopulation).toBe(1000);
 sim.updateParams({maxPopulation:450});expect(sim.particleCount).toBe(before);
 const restored=new EvolutionSimulation();sim.updateParams({experimentalRange:true,count:1000,maxPopulation:1000});restored.deserialize(sim.serialize());expect(restored.particleCount).toBe(1000);
 for(const def of GENE_DEFS)expect(Number.isFinite(restored.getState().evolution!.genes[def.key][999])).toBe(true);
},30000);
it('reading observation cannot alter random evolution or energy outcomes',()=>{
 const a=new EvolutionSimulation(),b=new EvolutionSimulation();a.randomize(14);b.randomize(14);
 for(let i=0;i<120;i++){a.step(1/60);b.step(1/60);if(i%10===0)void a.statistics;}
 expect(a.totals).toEqual(b.totals);expect(a.getState().x).toEqual(b.getState().x);expect(a.getState().energy).toEqual(b.getState().energy);
});
