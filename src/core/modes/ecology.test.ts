import {describe,it,expect,afterAll} from 'vitest';
import {writeFileSync} from 'node:fs';
const measurements:unknown[]=[];
afterAll(()=>writeFileSync('docs/ecology-validation-v1.4.0.json',JSON.stringify({simulatedSecondsPerRun:300,rescueEnabled:false,runs:measurements},null,2)));
import {EcologySimulation,budEnergy,energyAppearance} from './ecology';
function world(){const a=new EcologySimulation('ecology-boids');a.updateParams({count:30,foodRate:0,rescueEnabled:false,lifeMean:600});a.randomize(42);return a;}
describe('Life and Competition',()=>{
 it('birth splits energy with a cost and shows a small, dim offspring',()=>{
   const split=budEnergy(1.7);expect(split.parent+split.child).toBeLessThan(1.7);
   expect(energyAppearance(split.child).size).toBeLessThan(energyAppearance(1.7).size);
   const a=world(),s=a.getState();s.food!.count=0;s.energy!.fill(.6);s.energy![0]=1.7;s.age[0]=20;
   a.step(1/60);expect(a.statistics.births).toBe(1);expect(a.particleCount).toBe(31);
   expect(s.type[30]).toBe(s.type[0]);expect(s.age[30]).toBe(0);expect(s.lifeFrac[30]).toBe(0);
   expect(s.energy![0]+s.energy![30]).toBeLessThan(1.7);
 });
 it('grazers consume a food particle exactly once and obtain energy',()=>{
   const a=world(),s=a.getState();s.x.fill(600);s.y.fill(400);s.x[0]=100;s.y[0]=100;
   s.energy!.fill(.5);s.food!.count=1;s.food!.x[0]=100;s.food!.y[0]=100;
   a.step(1/60);expect(a.statistics.foodEaten).toBe(1);expect(s.food!.count).toBe(0);expect(s.energy![0]).toBeGreaterThan(.65);
 });
 it('predators remove prey without counting them as starvation or spontaneous rebirth',()=>{
   const a=world(),s=a.getState();s.food!.count=0;s.x.fill(600);s.y.fill(400);s.energy!.fill(.5);s.age.fill(20);
   s.x[0]=100;s.y[0]=100;const p=s.count-1;s.type[p]=2;s.x[p]=107;s.y[p]=100;
   a.step(1/60);expect(a.statistics.predation).toBe(1);expect(a.particleCount).toBe(29);expect(a.statistics.starvation).toBe(0);expect(a.statistics.immigrants).toBe(0);
 });
 it('old age and starvation remove individuals; rescue is explicit and optional',()=>{
   const a=world(),s=a.getState();s.food!.count=0;s.energy!.fill(0);a.step(1/60);expect(a.particleCount).toBe(0);
   for(let i=0;i<1300;i++)a.step(1/60);expect(a.particleCount).toBe(0);
   a.updateParams({rescueEnabled:true});for(let i=0;i<1200;i++)a.step(1/60);
   expect(a.statistics.immigrants).toBe(3);expect(a.particleCount).toBe(3);
 });
 for(const mode of ['ecology-boids','ecology-life'] as const){
  it(`${mode}: seeded replay and preset roundtrip`,()=>{
   const a=new EcologySimulation(mode),b=new EcologySimulation(mode);a.randomize(18);b.deserialize(a.serialize());
   for(let i=0;i<600;i++){a.step(1/60);b.step(1/60);}
   expect([...a.getState().x]).toEqual([...b.getState().x]);expect([...a.getState().energy!]).toEqual([...b.getState().energy!]);expect(a.statistics).toEqual(b.statistics);
  });
  for(const seed of [42,20261014])it(`${mode}: five active minutes with no rescue, bounded state and measured populations (seed ${seed})`,()=>{
    const a=new EcologySimulation(mode);a.updateParams({rescueEnabled:false});a.randomize(seed);
    const started=performance.now();let minimumPrey=Infinity,minimumPredators=Infinity,peakPopulation=0;
    for(let i=0;i<18000;i++){
      a.step(1/60);
      if(i%60===0){const p=a.statistics;minimumPrey=Math.min(minimumPrey,p.cyan+p.amber);minimumPredators=Math.min(minimumPredators,p.predators);peakPopulation=Math.max(peakPopulation,p.population);}
    }
    measurements.push({mode,seed,elapsedMs:performance.now()-started,minimumPrey,minimumPredators,peakPopulation,final:a.statistics});
    const s=a.getState();console.log(mode,seed,a.statistics);
    expect(s.count).toBeLessThanOrEqual(420);expect(a.statistics.immigrants).toBe(0);
    expect(a.statistics.foodEaten).toBeGreaterThan(0);expect(a.statistics.births).toBeGreaterThan(0);expect(a.statistics.predation).toBeGreaterThan(0);
    expect([...s.x.slice(0,s.count),...s.y.slice(0,s.count),...s.energy!.slice(0,s.count)].every(Number.isFinite)).toBe(true);
    expect(a.statistics.predators).toBeGreaterThan(0);expect(a.statistics.cyan+a.statistics.amber).toBeGreaterThan(0);
  },120000);
 }
 it('resize preserves life history and energy; unsafe preset values are bounded',()=>{
  const a=world(),s=a.getState(),energy=[...s.energy!],age=[...s.age];a.setWorldSize(1600,1200);
  expect([...s.energy!]).toEqual(energy);expect([...s.age]).toEqual(age);expect(a.particleCount).toBe(30);
  a.updateParams({maxPopulation:1e9,foodRate:Infinity,count:-1});expect(a.paramsSnapshot.maxPopulation).toBe(450);expect(a.paramsSnapshot.count).toBe(30);expect(a.paramsSnapshot.foodRate).toBe(0);
 });
});

it('unfed budding cannot create energy or exceed the configured population limit',()=>{
 const a=world(),s=a.getState();a.updateParams({maxPopulation:50});s.food!.count=0;s.energy!.fill(1.8);s.age.fill(20);
 const before=[...s.energy!.slice(0,s.count)].reduce((x,y)=>x+y,0);a.step(1/60);
 expect(a.particleCount).toBeLessThanOrEqual(50);
 expect([...s.energy!.slice(0,s.count)].reduce((x,y)=>x+y,0)).toBeLessThanOrEqual(before);
});
it('young individuals cannot immediately reproduce',()=>{
 const a=world(),s=a.getState();s.food!.count=0;s.energy!.fill(1.8);s.age.fill(0);a.step(1/60);expect(a.statistics.births).toBe(0);
});
it('the two ecological variants produce distinct trajectories with identical starting conditions',()=>{
 const a=new EcologySimulation('ecology-life'),b=new EcologySimulation('ecology-boids');a.randomize(42);b.randomize(42);
 expect([...a.getState().x]).toEqual([...b.getState().x]);
 for(let i=0;i<120;i++){a.step(1/60);b.step(1/60);}
 expect([...a.getState().x]).not.toEqual([...b.getState().x]);
});
