import {it,expect} from 'vitest';
import {EcologySimulation} from './ecology';
import {SPECIES_DEFAULTS,sanitizeSpecies} from '../species-settings';
it('old presets use mode defaults and per-species settings roundtrip deterministically',()=>{
 const a=new EcologySimulation('ecology-boids');a.deserialize({version:1,mode:'ecology-boids',seed:42,params:{lifeMean:200,maxSpeed:40},visual:{}});
 expect(a.speciesProfile('cyan').Life).toBe(200);expect(a.speciesProfile('predator').Interval).toBe(30);
 a.updateParams({cyanLife:400,amberSpeed:20,predatorInterval:50,cyanMaturity:16,cyanBirthEnergy:1.3});
 const b=new EcologySimulation('ecology-boids');b.deserialize(a.serialize());a.randomize(42);
 for(let i=0;i<300;i++){a.step(1/60);b.step(1/60);}expect(a.statistics).toEqual(b.statistics);expect([...a.getState().x]).toEqual([...b.getState().x]);expect(b.paramsSnapshot.cyanLife).toBe(400);
});
it('lifetimes rescale only the selected species while preserving age and individual ratios',()=>{
 const a=new EcologySimulation('ecology-life');a.randomize(42);const s=a.getState(),age=[...s.age],life=[...s.lifespan];
 a.updateParams({cyanLife:360});for(let i=0;i<s.count;i++){expect(s.age[i]).toBe(age[i]);expect(s.lifespan[i]).toBeCloseTo(life[i]*(s.type[i]===0?2:1),3);}
 expect(new Set([...s.lifespan.slice(0,100)]).size).toBeGreaterThan(50);
 a.resetDefaults();for(let i=0;i<s.count;i++)expect(s.lifespan[i]).toBeCloseTo(life[i],3);
});
it('species speed caps act independently and global baselines still govern automatic fields',()=>{
 const a=new EcologySimulation('ecology-boids');a.randomize(42);a.updateParams({cyanSpeed:5});const s=a.getState();s.vx.fill(60);s.vy.fill(0);a.step(1/60);
 for(let i=0;i<s.count;i++)if(s.type[i]===0)expect(Math.hypot(s.vx[i],s.vy[i])).toBeLessThanOrEqual(8);
 a.updateParams({maxSpeed:60});expect(a.speciesProfile('cyan').Speed).toBe(5);expect(a.speciesProfile('amber').Speed).toBe(60);
});
it('invalid values are ignored, bounds enforced, and explicit automatic sentinel supported',()=>{
 const p=sanitizeSpecies(SPECIES_DEFAULTS,{cyanLife:NaN,amberSpeed:Infinity,predatorInterval:1e9,cyanBirthEnergy:99,amberMaturity:-2});
 expect(p.cyanLife).toBe(-1);expect(p.amberSpeed).toBe(-1);expect(p.predatorInterval).toBe(300);expect(p.cyanBirthEnergy).toBe(1.79);expect(p.amberMaturity).toBe(2);
 expect(sanitizeSpecies(p,{predatorInterval:-1}).predatorInterval).toBe(-1);
});
it('custom intervals retain individual variation and delay repeated energy-funded budding',()=>{
 const a=new EcologySimulation('ecology-life');a.updateParams({count:30,lifeMean:600,foodRate:0,rescueEnabled:false,cyanInterval:10});a.randomize(42);
 const s=a.getState();s.type.fill(0);s.age.fill(30);s.food!.count=0;s.energy!.fill(.8);s.energy![0]=1.7;a.step(1/60);expect(a.statistics.births).toBe(1);
 for(let i=0;i<420;i++){s.energy![0]=1.7;a.step(1/60);}expect(a.statistics.births).toBe(1);
 for(let i=0;i<300;i++){s.energy![0]=1.7;a.step(1/60);}expect(a.statistics.births).toBe(2);
 expect(Math.max(...s.glowJit.slice(0,30))-Math.min(...s.glowJit.slice(0,30))).toBeGreaterThan(1);
});
