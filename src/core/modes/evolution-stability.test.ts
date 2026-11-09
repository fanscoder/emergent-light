import {it,expect} from 'vitest';
import {Rng} from '../rng';
import {founder,inheritGenome,GENE_DEFS,attackProbability,LIFE_FACTOR,PACE_FACTOR,mutationBias} from '../genetics';
import {EvolutionSimulation} from './evolution';
import {phenotype} from '../../render/evolution-style';
it('birth-level mutation rate stays near 12%, at most two loci change, and hue changes slowly',()=>{
 const parent=Object.fromEntries(GENE_DEFS.map(g=>[g.key,.5])) as ReturnType<typeof founder>,rng=new Rng(83);let changed=0,hue=0,strength=0;
 for(let i=0;i<20000;i++){const result=inheritGenome(parent,rng,.12,.055);if(result.mutations)changed++;expect(result.mutations).toBeLessThanOrEqual(2);if(result.genome.hue!==parent.hue)hue++;if(result.genome.strength!==parent.strength)strength++;}
 expect(changed/20000).toBeGreaterThan(.10);expect(changed/20000).toBeLessThan(.14);expect(hue).toBeLessThan(strength*.35);
});
it('soft directional relationships bias mutations without forbidding reverse variants',()=>{
 const base=Object.fromEntries(GENE_DEFS.map(g=>[g.key,.5])) as ReturnType<typeof founder>;const ratios=[];
 for(const diet of [0,1]){const rng=new Rng(16);let up=0,down=0;for(let i=0;i<15000;i++){const child=inheritGenome({...base,diet},rng,1,.05).genome;if(child.aggression>.5)up++;if(child.aggression<.5)down++;}expect(up).toBeGreaterThan(0);expect(down).toBeGreaterThan(0);ratios.push(up/(up+down));}
 expect(ratios[0]).toBeLessThan(.25);expect(ratios[1]).toBeGreaterThan(.6);
 expect(mutationBias({...base,diet:.5,social:.9},'social')).toBeLessThan(0);expect(mutationBias({...base,diet:.5,social:.1},'social')).toBeGreaterThan(0);expect(mutationBias({...base,diet:1,social:.9},'social')).toBe(0);
});
it('attack chance is an event rate independent of the simulation step',()=>{
 expect((1-attackProbability(.7,1/60))**60).toBeCloseTo(1-attackProbability(.7,1),12);expect(attackProbability(0,1)).toBe(0);
});
it('lifespan, speed and approved phenotype mappings use inherited traits instead of current energy',()=>{
 const a=new EvolutionSimulation();a.updateParams({count:30,rescueEnabled:false});a.randomize(42);const s=a.getState(),g=s.evolution!.genes;
 for(let i=0;i<s.count;i++)expect(s.lifespan[i]).toBeCloseTo(180*LIFE_FACTOR(g.longevity[i]),3);
 const original=phenotype(g,0);s.energy![0]=.1;expect(phenotype(g,0)).toEqual(original);
 g.longevity[0]=1;expect(phenotype(g,0).radius).toBeGreaterThan(original.radius);g.strength[0]=1;expect(phenotype(g,0).tips).toBe(6);g.pace[0]=1;expect(phenotype(g,0).stretch).toBe(1.5);expect(PACE_FACTOR(1)).toBeGreaterThan(PACE_FACTOR(0));
});
it('healthy equal opponents can conflict without dying, even under sustained contact',()=>{
 const a=new EvolutionSimulation();a.updateParams({count:30,lifeMean:600,foodRate:0,rescueEnabled:false,huntingEnabled:false});a.randomize(42);const s=a.getState(),g=s.evolution!.genes;s.food!.count=0;s.age.fill(30);s.energy!.fill(.8);
 g.strength.fill(.5);g.aggression.fill(1);g.diet.fill(.2);g.longevity.fill(.5);g.social.fill(.5);g.tolerance.fill(1);g.hue[0]=0;g.hue[1]=.5;
 for(let i=0;i<2400;i++){s.x.fill(600);s.y.fill(400);s.x[0]=100;s.x[1]=107;s.y[0]=s.y[1]=100;s.vx.fill(0);s.vy.fill(0);s.energy![0]=s.energy![1]=1;a.step(1/60);}
 expect(a.statistics.attacks).toBeGreaterThan(0);expect(a.statistics.nonlethalConflicts).toBe(a.statistics.attacks);expect(a.statistics.combatDeaths).toBe(0);
});
