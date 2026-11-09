import {it,expect} from 'vitest';
import {Rng} from '../rng';
import {EvolutionSimulation} from './evolution';
import {createGenes,founder,inheritGenome,writeGenes,readGenes,geneSimilarity,combatOutcome,combatPower,GENE_DEFS} from '../genetics';
function world(){const a=new EvolutionSimulation();a.updateParams({count:30,foodRate:0,rescueEnabled:false,lifeMean:600});a.randomize(42);return a;}
it('founders have independent continuous traits and no assigned species or roles',()=>{
 const a=world(),s=a.getState(),g=s.evolution!.genes;expect(s.leader).toBeUndefined();expect(s.guard).toBeUndefined();expect(new Set([...s.type.slice(0,s.count)])).toEqual(new Set([0]));
 for(const gene of GENE_DEFS){expect(Math.max(...g[gene.key].slice(0,30))-Math.min(...g[gene.key].slice(0,30))).toBeGreaterThan(.6);}
 const combos=Array.from({length:30},(_,i)=>g.diet[i]<.5&&g.aggression[i]>.5&&g.strength[i]>.5);expect(combos.some(Boolean)).toBe(true);
});
it('mutation-free budding inherits every locus and costs energy without inheriting age',()=>{
 const a=world();a.updateParams({mutationRate:0});const s=a.getState();s.food!.count=0;s.energy!.fill(.5);s.energy![0]=1.7;s.age.fill(30);s.x.fill(600);s.y.fill(400);s.x[0]=100;
 const parent=readGenes(s.evolution!.genes,0),energy=s.energy![0],id=s.evolution!.id[0];a.step(1/60);
 expect(a.statistics.births).toBe(1);expect(readGenes(s.evolution!.genes,30)).toEqual(parent);expect(s.evolution!.generation[30]).toBe(1);expect(s.evolution!.parent[30]).toBe(id);expect(s.age[30]).toBe(0);expect(s.energy![0]+s.energy![30]).toBeLessThan(energy);expect(a.statistics.mutatedBirths).toBe(0);
});
it('bounded mutations, cyclic hue and future locus-wise recombination are reproducible',()=>{
 const a=founder(new Rng(42)),b=founder(new Rng(56));
 const left=inheritGenome(a,new Rng(2),1,.2),right=inheritGenome(a,new Rng(2),1,.2);expect(left).toEqual(right);expect(left.mutations).toBeGreaterThan(0);
 for(const gene of GENE_DEFS)expect(left.genome[gene.key]).toBeGreaterThanOrEqual(0);
 for(const gene of GENE_DEFS)expect(left.genome[gene.key]).toBeLessThanOrEqual(1);
 const child=inheritGenome(a,new Rng(8),0,0,b).genome;for(const gene of GENE_DEFS)expect([a[gene.key],b[gene.key]]).toContain(child[gene.key]);
});
it('visual trait similarity is symmetric, bounded and circular for hue, independent of energy',()=>{
 const genes=createGenes(2),a=founder(new Rng(9));writeGenes(genes,0,{...a,hue:.99});writeGenes(genes,1,{...a,hue:.01});
 expect(geneSimilarity(genes,0,1)).toBeGreaterThan(.98);expect(geneSimilarity(genes,0,1)).toBe(geneSimilarity(genes,1,0));expect(geneSimilarity(genes,0,0)).toBe(1);
});
it('combat ability is separate from diet and all three death outcomes exist',()=>{
 expect(combatOutcome(combatPower(1,1.8,30),combatPower(0,.5,30))).toBe('a');expect(combatOutcome(1,1)).toBe('both');expect(combatOutcome(.4,1)).toBe('b');
});
it('population, genes and energy ledgers stay bounded under reproduction, food and combat',()=>{
 const a=world();a.updateParams({foodRate:25});const initial=a.statistics.population*a.statistics.meanEnergy;
 for(let i=0;i<3600;i++)a.step(1/60);
 const s=a.getState(),t=a.statistics;expect(30+t.births+t.immigrants-t.combatDeaths-t.oldAge-t.starvation).toBe(t.population);
 const expected=initial+t.energyFromFood-t.metabolicCost-t.reproductionCost-t.combatEnergyLost-t.naturalEnergyLost;
 expect(t.population*t.meanEnergy).toBeCloseTo(expected,2);expect(t.population).toBeLessThanOrEqual(360);
 for(const def of GENE_DEFS)expect([...s.evolution!.genes[def.key].slice(0,s.count)].every(v=>v>=0&&v<=1&&Number.isFinite(v))).toBe(true);
},20000);
it('preset roundtrip, pause and resize retain deterministic genetic state',()=>{
 const a=world(),b=world();a.updateParams({mutationRate:.3});b.deserialize(a.serialize());a.randomize(42);
 for(let i=0;i<300;i++){a.step(1/60);b.step(1/60);}expect(a.statistics).toEqual(b.statistics);expect([...a.getState().x]).toEqual([...b.getState().x]);
 const genes=readGenes(a.getState().evolution!.genes,0),age=a.getState().age[0];a.step(0);a.setWorldSize(1600,1200);expect(readGenes(a.getState().evolution!.genes,0)).toEqual(genes);expect(a.getState().age[0]).toBe(age);
 expect(()=>a.deserialize({...a.serialize(),params:{geneSchema:99}})).toThrow();
});
