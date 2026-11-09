import {it,expect} from 'vitest';
import {EvolutionEnvironment,huntOutcome,huntingIntent} from './evolution-environment';
import {EvolutionSimulation} from './modes/evolution';
it('habitats are seeded, periodic and smooth, with uniform zero contrast',()=>{
 const e=new EvolutionEnvironment(42);expect(e.fertility).toEqual(new EvolutionEnvironment(42).fertility);
 for(const x of [0,1/3,2/3,1])for(const y of [0,.5,1]){
  expect(e.resource(x-1e-7,y,.85)).toBeCloseTo(e.resource(x+1e-7,y,.85),5);
  expect(e.resource(x,y,0)).toBe(1);expect(e.resistance(x,y)).toBeGreaterThanOrEqual(0);expect(e.resistance(x,y)).toBeLessThanOrEqual(1);
 }
 expect(e.resource(.2,.3,1)).toBeCloseTo(e.resource(1.2,1.3,1),10);
 const resistance=Array.from({length:100},(_,i)=>e.resistance(...e.world(0,i/100)));expect(Math.min(...resistance)).toBeLessThan(.05);expect(Math.max(...resistance)).toBeGreaterThan(.9);
 expect(new Set(Array.from({length:30},(_,seed)=>new EvolutionEnvironment(seed).cols+'x'+new EvolutionEnvironment(seed).rows)).size).toBeGreaterThan(2);
 for(let i=0;i<e.fertility.length;i++)expect(e.region(...e.center(i))).toBe(i);
 expect(e.fertility.reduce((a,b)=>a+b,0)/e.fertility.length).toBeCloseTo(1,12);
});
it('equal total food is placed preferentially in richer habitats without fixed species',()=>{
 let rich=0,poor=0;
 for(let seed=0;seed<12;seed++){
  const s=new EvolutionSimulation();s.updateParams({resourceContrast:1});s.randomize(seed);const state=s.getState(),e=new EvolutionEnvironment(seed),high=e.fertility.indexOf(Math.max(...e.fertility)),low=e.fertility.indexOf(Math.min(...e.fertility));
  expect(state.food!.count).toBe(500);
  for(let i=0;i<500;i++){const region=e.region(state.food!.x[i]/800,state.food!.y[i]/600);if(region===high)rich++;if(region===low)poor++;}
 }
 expect(rich).toBeGreaterThan(poor*1.6);
});
it('hunting ability stays separate from diet; strong prey can counter and similar opponents can retreat',()=>{
 expect(huntingIntent(1,.4)).toBe(1);expect(huntingIntent(0,.4)).toBe(0);expect(huntingIntent(1,1.8)).toBe(0);
 expect(huntOutcome(2,1,.5)).toBe('a');expect(huntOutcome(.5,1,.1)).toBe('b');expect(huntOutcome(.5,1,.8)).toBe('retreat');expect(huntOutcome(1,1,.8)).toBe('retreat');expect(huntOutcome(1,1,.001)).toBe('both');
});
it('successful hunting transfers existing stored energy, losing the unabsorbed remainder',()=>{
 const sim=new EvolutionSimulation();sim.updateParams({count:30,foodRate:0,rescueEnabled:false});sim.randomize(42);
 const s=sim.getState(),g=s.evolution!.genes;s.age.fill(40);g.longevity.fill(.5);g.strength[0]=1;g.strength[1]=0;g.diet[0]=1;s.energy![0]=.5;s.energy![1]=1.5;
 // Isolate settlement from movement and random contact frequency.
 (sim as unknown as {fight(a:number,b:number):void}).fight(0,1);
 expect(sim.totals.huntKills).toBe(1);expect(sim.totals.huntEnergy).toBeCloseTo(1.275,5);expect(sim.totals.combatEnergyLost).toBeCloseTo(.225,5);expect(s.energy![0]).toBeCloseTo(1.775,5);
});
it('regional damping slows crossings but leaves passages and zero separation open',()=>{
 const e=new EvolutionEnvironment(19),points=Array.from({length:100},(_,i)=>e.world(0,i/100)).sort((a,b)=>e.resistance(...a)-e.resistance(...b));
 function velocity(separation:number,point:readonly[number,number]){const a=new EvolutionSimulation();a.updateParams({count:30,foodRate:0,environmentEnabled:true,regionSeparation:separation,huntingEnabled:false});a.randomize(19);const s=a.getState();s.food!.count=0;s.x.fill(700);s.y.fill(500);s.x[0]=point[0]*800;s.y[0]=point[1]*600;s.vx[0]=20;s.vy[0]=0;a.step(1/60);return s.vx[0];}
 expect(velocity(1,points[99])).toBeLessThan(velocity(0,points[99]));
 expect(Math.abs(velocity(1,points[0])-velocity(0,points[0]))).toBeLessThan(.1);
});
it('a hungry faster hunter can actually close the shared avoidance gap and capture moving prey',()=>{
 const a=new EvolutionSimulation();a.updateParams({foodRate:0,rescueEnabled:false,environmentEnabled:false});a.randomize(42);
 const s=a.getState(),g=s.evolution!.genes;s.count=2;s.food!.count=0;s.age.fill(40);s.energy!.fill(.5);s.energy![1]=1.3;
 g.social.fill(0);g.aggression.fill(0);g.aggression[0]=1;g.strength.fill(0);g.strength[0]=1;g.diet.fill(0);g.diet[0]=1;g.pace.fill(0);g.pace[0]=1;
 s.x[0]=100;s.x[1]=160;s.y[0]=s.y[1]=100;s.vx.fill(0);s.vy.fill(0);
 for(let i=0;i<1800&&a.totals.huntKills===0;i++)a.step(1/60);
 expect(a.totals.huntKills).toBeGreaterThan(0);expect(a.totals.huntEnergy).toBeGreaterThan(.16);
});
