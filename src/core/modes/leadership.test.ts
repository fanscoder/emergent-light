import {it,expect} from 'vitest';
import {createStore} from '../types';
import {electLeaders,leaderResponse} from '../leadership';
import {EcologySimulation} from './ecology';
function group(type=0,n=30){const s=createStore(100);s.count=n;s.energy=new Float32Array(100).fill(.8);s.type.fill(type);s.age.fill(30);s.x.fill(100);s.y.fill(100);return s;}
it('promotes an existing adult in a crowd, not a lone individual or a newborn',()=>{
 const s=group(),l=new Float32Array(100);s.age.fill(0);electLeaders(s,l,800,600,1,true);expect([...l].some(Boolean)).toBe(false);
 s.age[7]=30;electLeaders(s,l,800,600,1,true);expect(l[7]).toBeGreaterThan(0);expect([...l].filter(Boolean)).toHaveLength(1);expect(s.count).toBe(30);
 const alone=group(0,1),a=new Float32Array(100);electLeaders(alone,a,800,600,1,true);expect([...a].some(Boolean)).toBe(false);
});
it('separates elections across the wrap seam and caps sparse leaders',()=>{
 const s=group(0,54),l=new Float32Array(100);for(let i=0;i<54;i++){s.x[i]=Math.floor(i/9)*400+5;s.y[i]=100;}
 for(let i=0;i<10;i++)electLeaders(s,l,2400,600,1,true);expect([...l].filter(Boolean)).toHaveLength(4);
 const seam=group(0,18),m=new Float32Array(100);for(let i=9;i<18;i++)seam.x[i]=795;electLeaders(seam,m,800,600,1,true);electLeaders(seam,m,800,600,1,true);expect([...m].filter(Boolean)).toHaveLength(1);
});
it('solitary predators never elect a leader but grazers in both modes do',()=>{
 const s=group(2),l=new Float32Array(100);electLeaders(s,l,800,600,1,false);expect([...l].some(Boolean)).toBe(false);
 electLeaders(s,l,800,600,1,true);expect([...l].filter(Boolean)).toHaveLength(1);
 s.type.fill(4);l.fill(0);electLeaders(s,l,800,600,1,false);expect([...l].filter(Boolean)).toHaveLength(1);
});
it('a crowd can steer leaders more strongly than scattered followers',()=>{expect(leaderResponse(1)).toBeLessThan(.2);expect(leaderResponse(20)).toBeCloseTo(.8);expect(leaderResponse(100)).toBeLessThanOrEqual(.8);});
function pair(mode:'ecology-boids'|'ecology-life'){
 const a=new EcologySimulation(mode);a.updateParams({count:30,foodRate:0,rescueEnabled:false,lifeMean:600});a.randomize(42);
 const s=a.getState();s.food!.count=0;s.x.fill(600);s.y.fill(400);s.vx.fill(0);s.vy.fill(0);s.theta.fill(Math.PI/2);s.energy!.fill(.8);s.type.fill(0);s.age.fill(30);s.x[0]=100;s.x[1]=145;s.y[0]=s.y[1]=100;return a;
}
for(const mode of ['ecology-boids','ecology-life'] as const){
 it(mode+': followers prefer leaders and leaders separate',()=>{
  const normal=pair(mode),led=pair(mode);led.getState().leader![1]=1;normal.step(1/60);led.step(1/60);expect(led.getState().vx[0]).toBeGreaterThan(normal.getState().vx[0]);
  const rival=pair(mode);rival.getState().leader![0]=rival.getState().leader![1]=1;rival.step(1/60);expect(rival.getState().vx[0]).toBeLessThan(0);
 });
}
it('leadership is copied on compaction, not inherited, and resets on randomize',()=>{
 const a=pair('ecology-boids'),s=a.getState();s.leader![29]=1;s.age[5]=1000;a.step(1/60);expect(s.leader![5]).toBe(1);
 s.energy![5]=1.7;a.step(1/60);expect(a.statistics.births).toBe(1);expect(s.leader![s.count-1]).toBe(0);
 a.randomize(42);expect([...s.leader!].some(Boolean)).toBe(false);
});
it('promotions emerge on active time, fade in smoothly, and are deterministic',()=>{
 const a=pair('ecology-boids'),b=pair('ecology-boids');
 for(const sim of [a,b]){const s=sim.getState();s.x.fill(100);s.y.fill(100);s.theta.fill(0);}
 for(let i=0;i<179;i++){a.step(1/60);b.step(1/60);}expect([...a.getState().leader!].some(Boolean)).toBe(false);
 for(let i=0;i<3;i++){a.step(1/60);b.step(1/60);}const l=a.getState().leader!;expect([...l].filter(Boolean)).toHaveLength(1);expect(Math.max(...l)).toBeLessThan(.03);
 expect([...l]).toEqual([...b.getState().leader!]);a.step(0);expect([...l]).toEqual([...b.getState().leader!]);
});
