import {it,expect} from 'vitest';
import {EcologySimulation} from './ecology';
function world(mode:'ecology-boids'|'ecology-life'='ecology-boids'){
 const a=new EcologySimulation(mode);a.updateParams({count:30,foodRate:0,rescueEnabled:false,lifeMean:600});a.randomize(42);
 const s=a.getState();s.food!.count=0;s.x.fill(600);s.y.fill(400);s.vx.fill(0);s.vy.fill(0);s.theta.fill(0);s.energy!.fill(.8);s.type.fill(0);s.age.fill(30);return a;
}
for(const mode of ['ecology-boids','ecology-life'] as const){
 it(mode+': leaders survive contact, keep wounds through compaction, and die only on the third spaced hit',()=>{
  const a=world(mode),s=a.getState();s.type[1]=2;s.leader![29]=1;
  const tick=()=>{s.x.fill(600);s.y.fill(400);s.vx.fill(0);s.vy.fill(0);const p=[...s.leader!.slice(0,s.count)].findIndex(x=>x>0);if(p>=0){s.x[p]=100;s.y[p]=100;}s.x[1]=107;s.y[1]=100;a.step(1/60);};
  tick();expect(a.statistics.predation).toBe(0);expect(s.energyEvents!.count).toBe(0);expect(s.energy![1]).toBeLessThan(.8);
  s.age[5]=1000;tick();expect(s.leader![5]).toBe(1);
  for(let i=0;i<48;i++)tick();expect(a.statistics.predation).toBe(0);expect(s.leader![5]).toBe(1);
  for(let i=0;i<90;i++)tick();expect(a.statistics.predation).toBe(1);expect([...s.leader!.slice(0,s.count)].some(Boolean)).toBe(false);
 });
}
it('school grazers bud more readily near a same-species leader, without free energy',()=>{
 const near=world(),far=world();
 for(const [a,x] of [[near,130],[far,400]] as const){const s=a.getState();s.x[0]=100;s.y[0]=100;s.x[1]=x;s.y[1]=100;s.leader![1]=1;s.energy![0]=1.6;}
 const before=near.getState().energy![0];near.step(1/60);far.step(1/60);
 expect(near.statistics.births).toBe(1);expect(far.statistics.births).toBe(0);
 const s=near.getState();expect(s.energy![0]+s.energy![30]).toBeLessThan(before);
});
it('a nearby leader of another species does not confer a fertility advantage',()=>{
 const a=world(),s=a.getState();s.x[0]=100;s.y[0]=100;s.x[1]=130;s.y[1]=100;s.type[1]=4;s.leader![1]=1;s.energy![0]=1.6;a.step(1/60);expect(a.statistics.births).toBe(0);
});
it('school fertility cooldown and newborn maturity still prevent immediate repeated budding',()=>{
 const a=world(),s=a.getState();s.leader![1]=1;s.energy![0]=1.7;a.step(1/60);expect(a.statistics.births).toBe(1);
 for(let i=0;i<400;i++){s.x.fill(600);s.y.fill(400);s.vx.fill(0);s.vy.fill(0);s.energy![0]=1.7;a.step(1/60);}expect(a.statistics.births).toBe(1);
});
it('particle-life birth thresholds do not acquire school fertility rules',()=>{
 for(const leader of [0,1]){const a=world('ecology-life'),s=a.getState();s.leader![1]=leader;s.energy![0]=1.55;a.step(1/60);expect(a.statistics.births).toBe(0);}
});
it('a school follower beyond the old social radius is drawn toward a trailing region',()=>{
 const a=world(),s=a.getState();s.x[0]=100;s.y[0]=100;s.x[1]=270;s.y[1]=100;s.leader![1]=1;s.vx[1]=20;a.step(1/60);expect(s.vx[0]).toBeGreaterThan(.2);
});
