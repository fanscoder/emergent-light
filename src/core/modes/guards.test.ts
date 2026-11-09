import {it,expect} from 'vitest';
import {Guards,predatorWinsGuard,DESPERATE_ENERGY} from '../guards';
import {createStore} from '../types';
import {EcologySimulation} from './ecology';
import {Rng} from '../rng';
function group(){const s=createStore(40);s.count=20;s.energy=new Float32Array(40).fill(.8);s.leader=new Float32Array(40);s.guard=new Float32Array(40);s.type.fill(0);s.x.fill(100);s.y.fill(100);s.age.fill(30);s.leader[0]=1;return s;}
it('recruits at most two adult same-species guards without adding organisms',()=>{
 const s=group(),g=new Guards(40);s.type[1]=4;s.age[2]=0;g.update(s,800,600,1,1/60,true);g.update(s,800,600,1,1/60,true);
 const ids=[...g.target].map((p,i)=>p>=0?i:-1).filter(i=>i>=0);expect(ids).toHaveLength(2);expect(ids).not.toContain(0);expect(ids).not.toContain(1);expect(ids).not.toContain(2);expect(g.side[ids[0]]).not.toBe(g.side[ids[1]]);expect(s.count).toBe(20);
});
it('guards release missing, promoted, different-species and distant leaders across wrap boundaries',()=>{
 const s=group(),g=new Guards(40);s.x[0]=795;s.x[1]=5;g.target[1]=0;g.update(s,800,600,1,.1,false);expect(g.target[1]).toBe(0);
 s.x[1]=400;g.update(s,800,600,1,.1,false);expect(g.target[1]).toBe(-1);
 g.target[1]=0;s.x[1]=5;s.leader![0]=0;g.update(s,800,600,1,.1,false);expect(g.target[1]).toBe(-1);
});
it('compaction remaps a moved leader and removes links to dead leaders; newborns reset',()=>{
 const g=new Guards(20);g.target[1]=19;g.side[1]=1;g.strength[1]=1;g.remove(5,19);expect(g.target[1]).toBe(5);
 g.remove(5,18);expect(g.target[1]).toBe(-1);g.spawn(1);expect(g.strength[1]).toBe(0);expect(g.target[1]).toBe(-1);
 g.reset();expect([...g.target].every(p=>p===-1)).toBe(true);
});
it('only desperate predators have a fifty-percent survival branch',()=>{
 expect(predatorWinsGuard(.3,.49)).toBe(true);expect(predatorWinsGuard(.3,.5)).toBe(false);expect(predatorWinsGuard(DESPERATE_ENERGY,0)).toBe(false);expect(predatorWinsGuard(1.2,0)).toBe(false);
 const r=new Rng(42);let wins=0;for(let i=0;i<10000;i++)if(predatorWinsGuard(.2,r.next()))wins++;expect(wins).toBeGreaterThan(4700);expect(wins).toBeLessThan(5300);
});
function world(mode:'ecology-boids'|'ecology-life',seed=42){
 const a=new EcologySimulation(mode);a.updateParams({count:30,foodRate:0,rescueEnabled:false,lifeMean:600});a.randomize(seed);const s=a.getState();s.food!.count=0;s.x.fill(600);s.y.fill(400);s.vx.fill(0);s.vy.fill(0);s.theta.fill(0);s.energy!.fill(.8);s.type.fill(0);s.age.fill(30);s.leader![0]=1;s.x[0]=s.y[0]=100;s.x[1]=130;s.y[1]=100;
 // Exercise real recruitment on active time while keeping a controlled group.
 for(let i=0;i<181;i++){s.x[0]=100;s.y[0]=100;s.x[1]=130;s.y[1]=100;s.x[2]=135;s.y[2]=105;s.vx.fill(0);s.vy.fill(0);a.step(1/60);}return a;
}
for(const mode of ['ecology-boids','ecology-life'] as const){
 it(mode+': guard force leads the group instead of following behind',()=>{
  const a=world(mode),s=a.getState();s.x[0]=100;s.y[0]=100;s.vx.fill(0);s.vy.fill(0);s.theta.fill(0);s.x[1]=90;s.y[1]=100;a.step(1/60);expect(s.guard![1]).toBeGreaterThan(0);expect(s.vx[1]).toBeGreaterThan(.15);
 });
 it(mode+': an emergency clash removes both fed predator and guard and preserves population accounting',()=>{
  const a=world(mode),s=a.getState();s.x[0]=110;s.y[0]=100;s.x[1]=130;s.y[1]=100;s.type[29]=2;s.x[29]=137;s.y[29]=100;s.vx.fill(0);s.vy.fill(0);const before=s.count;
  a.step(1/60);expect(s.count).toBe(before-2);expect(a.statistics.guardClashes).toBe(1);expect(a.statistics.defenseDeaths).toBe(2);expect(a.statistics.predation).toBe(0);expect(a.statistics.starvation).toBe(0);expect(s.energyEvents!.count).toBeGreaterThan(0);
 });
}
it('fed predators steer away from guards while desperate predators approach',()=>{
 const fed=world('ecology-life'),hungry=world('ecology-life');
 for(const [a,energy] of [[fed,1.2],[hungry,.2]] as const){const s=a.getState();s.x[0]=100;s.y[0]=100;s.x[1]=132;s.y[1]=100;s.type[29]=2;s.x[29]=154;s.y[29]=100;s.energy![29]=energy;s.vx.fill(0);s.vy.fill(0);s.theta[29]=Math.PI/2;a.step(1/60);}
 expect(fed.getState().vx[29]).toBeGreaterThan(hungry.getState().vx[29]);expect(fed.getState().vx[29]).toBeGreaterThan(0);
});

it('real hungry clashes cover both survival outcomes, reward only survivors and balance the ledger',()=>{
 let survived=false,sacrificed=false;
 for(let seed=1;seed<=12;seed++){
  const a=world('ecology-life',seed),s=a.getState();s.x[0]=110;s.y[0]=100;s.x[1]=130;s.y[1]=100;s.type[29]=2;s.x[29]=137;s.y[29]=100;s.energy![29]=.2;s.vx.fill(0);s.vy.fill(0);a.step(1/60);
  const t=a.statistics;expect(t.guardClashes).toBe(1);expect(30+t.births+t.immigrants-t.predation-t.starvation-t.oldAge-t.defenseDeaths).toBe(s.count);
  if(t.predators===1){survived=true;expect(t.predation).toBe(1);expect(t.defenseDeaths).toBe(0);const i=[...s.type.slice(0,s.count)].findIndex(v=>v===2);expect(s.energy![i]).toBeGreaterThan(.2);}
  else {sacrificed=true;expect(t.predation).toBe(0);expect(t.defenseDeaths).toBe(2);}
 }
 expect(survived).toBe(true);expect(sacrificed).toBe(true);
});

it('particle-life guards settle ahead even with a crowd gathering behind the leader',()=>{
 const a=world('ecology-life'),s=a.getState();
 for(let step=0;step<600;step++){
  const x=100+step/3;s.x[0]=x;s.y[0]=100;s.vx[0]=20;s.vy[0]=0;s.theta[0]=0;
  for(let i=3;i<s.count;i++){s.x[i]=x-30;s.y[i]=100+(i%3-1)*5;s.vx[i]=20;s.vy[i]=0;}
  a.step(1/60);
 }
 expect(s.guard![1]).toBeGreaterThan(0);expect(s.guard![2]).toBeGreaterThan(0);
 expect(s.x[1]).toBeGreaterThan(s.x[0]);expect(s.x[2]).toBeGreaterThan(s.x[0]);
});

it('a sacrificed guard cannot be replaced immediately and recruitment resumes after active cooldown',()=>{
 const s=group(),g=new Guards(40);g.update(s,800,600,1,1/60,true);
 const dead=[...g.target].findIndex(p=>p===0);g.remove(dead,19);s.count=19;
 g.update(s,800,600,1,1,true);expect([...g.target].filter(p=>p===0)).toHaveLength(1);
 g.update(s,800,600,1,30,true);expect([...g.target].filter(p=>p===0)).toHaveLength(2);
});
