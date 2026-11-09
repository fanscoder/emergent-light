import {it,expect} from 'vitest';
import {EvolutionSimulation} from './modes/evolution';
import {GENE_DEFS,readGenes} from './genetics';
function pair(){const a=new EvolutionSimulation();a.updateParams({foodRate:0,rescueEnabled:false,huntingEnabled:false,environmentEnabled:false,buddingEnabled:false,mutationRate:0});a.randomize(42);const s=a.getState();s.count=2;s.food!.count=0;s.age.fill(40);s.energy!.fill(1.4);s.x[0]=100;s.x[1]=110;s.y[0]=s.y[1]=100;s.vx.fill(0);s.vy.fill(0);for(const g of GENE_DEFS){s.evolution!.genes[g.key][0]=.4;s.evolution!.genes[g.key][1]=.6;}return a;}
it('a close compatible pair contributes energy to one recombined child and both cool down',()=>{
 const a=pair(),s=a.getState(),g=s.evolution!.genes,first=readGenes(g,0),second=readGenes(g,1),initial=s.energy![0]+s.energy![1];
 a.step(1/60);expect(a.totals.pairBirths).toBe(1);expect(a.totals.budBirths).toBe(0);expect(s.count).toBe(3);
 expect(s.evolution!.parent[2]).toBe(s.evolution!.id[0]);expect(s.evolution!.secondParent[2]).toBe(s.evolution!.id[1]);
 for(const g of GENE_DEFS)expect([first[g.key],second[g.key]]).toContain(s.evolution!.genes[g.key][2]);
 expect(s.age[2]).toBe(0);expect([...s.energy!.slice(0,3)].reduce((a,b)=>a+b,0)).toBeCloseTo(initial-a.totals.metabolicCost-a.totals.reproductionCost,5);
 s.energy!.fill(1.4);a.step(1/60);expect(a.totals.births).toBe(1);
});
it('disabled, immature, incompatible or energy-poor pairs do not reproduce',()=>{
 for(const mode of ['disabled','young','poor','different']){const a=pair(),s=a.getState();if(mode==='disabled')a.updateParams({pairedEnabled:false});if(mode==='young')s.age[0]=0;if(mode==='poor')s.energy![0]=.5;if(mode==='different')for(const g of GENE_DEFS){s.evolution!.genes[g.key][0]=0;s.evolution!.genes[g.key][1]=1;}a.step(1/60);expect(a.totals.births).toBe(0);}
});
it('wrapped neighbors can mate without putting the child in the middle of the screen',()=>{
 const a=pair(),s=a.getState();s.x[0]=2;s.x[1]=798;a.step(1/60);expect(a.totals.pairBirths).toBe(1);expect(Math.min(s.x[2],800-s.x[2])).toBeLessThan(10);
});
it('geography and its display toggle share the same state and survive resize/preset reset',()=>{
 const a=pair(),s=a.getState(),map=s.habitat!.map,signature=JSON.stringify(map);a.setWorldSize(1600,1200);expect(s.habitat!.map).toBe(map);
 a.updateParams({habitatVisible:false});expect(s.habitat!.visible).toBe(false);a.resetDefaults();expect(s.habitat!.visible).toBe(true);
 const b=new EvolutionSimulation();b.deserialize(a.serialize());expect(JSON.stringify(b.getState().habitat!.map)).toBe(signature);
});
