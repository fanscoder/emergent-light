import {it,expect} from 'vitest';
import {EcologySimulation} from './ecology';
import {EcologyEvents,EVENT_DURATION} from '../ecology-events';
import {eventCue} from '../../render/event-cues';
function isolated(mode:'ecology-boids'|'ecology-life'){
 const a=new EcologySimulation(mode);a.updateParams({count:30,foodRate:0,rescueEnabled:false,lifeMean:600});a.randomize(42);
 const s=a.getState();s.food!.count=0;s.x.fill(600);s.y.fill(400);s.vx.fill(0);s.vy.fill(0);s.theta.fill(0);s.type.fill(0);s.energy!.fill(.8);s.age.fill(60);return a;
}
it('solitary predators separate while pack predators approach one another',()=>{
 const pack=isolated('ecology-boids'),solo=isolated('ecology-life');
 for(const a of [pack,solo]){const s=a.getState();s.type[0]=s.type[1]=2;s.x[0]=100;s.x[1]=140;s.y[0]=s.y[1]=100;a.step(1/60);}
 expect(pack.getState().vx[0]).toBeGreaterThan(0);expect(solo.getState().vx[0]).toBeLessThan(0);
});
it('solitary predators rest at least 75 active seconds between offspring',()=>{
 const a=isolated('ecology-life');const s=a.getState();s.type[0]=s.type[1]=s.type[2]=2;
 const tick=()=>{for(let i=0;i<s.count;i++){const p=s.type[i]===2;s.x[i]=p?100:600;s.y[i]=p?100:400;s.vx[i]=s.vy[i]=0;s.energy![i]=p?1.8:.8;}a.step(1/60);};
 for(let i=0;i<4400;i++)tick();expect(a.statistics.births).toBe(0);
 for(let i=0;i<102;i++)tick();expect(a.statistics.births).toBe(3);
 for(let i=0;i<1800;i++)tick();expect(a.statistics.births).toBe(3);
},15000);
it('predation produces a local death cue and old-age death does not flash',()=>{
 const a=isolated('ecology-boids'),s=a.getState();s.x[0]=100;s.y[0]=100;s.type[1]=2;s.x[1]=107;s.y[1]=100;
 a.step(1/60);const e=s.energyEvents!;expect(a.statistics.predation).toBe(1);expect(e.count).toBe(1);expect(e.kind[0]).toBe(0);expect(e.x[0]).toBe(100);
 const b=isolated('ecology-life'),t=b.getState();t.age.fill(1000);b.step(1/60);expect(t.energyEvents!.count).toBe(0);
});
it('birth produces a green cue without extra population or energy',()=>{
 const a=isolated('ecology-boids'),s=a.getState();s.energy![0]=1.7;a.step(1/60);
 expect(a.statistics.births).toBe(1);expect(s.count).toBe(31);expect(s.energyEvents!.kind[0]).toBe(1);
});
it('dense events merge without restarting the pulse; at most six remain visible',()=>{
 const e=new EcologyEvents();e.advance(1);e.emit(0,100,100,800,600);e.advance(1.1);e.emit(1,105,100,800,600);
 expect(e.count).toBe(1);expect(e.time[0]).toBe(1);
 for(let i=0;i<20;i++)e.emit(0,(i%5)*150,Math.floor(i/5)*140,800,600);
 expect(e.count).toBe(6);e.advance(3);expect(e.count).toBe(0);
});
it('cues fade smoothly at both ends and freeze when simulation time is frozen',()=>{
 for(const kind of [0,1] as const){const duration=EVENT_DURATION[kind];expect(eventCue(0,kind).opacity).toBe(0);expect(eventCue(duration,kind).opacity).toBe(0);
  expect(eventCue(duration/2,kind).opacity).toBeCloseTo(kind===0?.82:.74);
  expect(eventCue(duration/2,kind).opacity).toBeLessThanOrEqual(.85);
  expect(eventCue(.001,kind).opacity).toBeLessThan(.001);
  expect(eventCue(duration-.001,kind).opacity).toBeLessThan(.001);
 }
 const e=new EcologyEvents();e.advance(1);e.emit(0,50,50,800,600);const cue=eventCue(e.clock-e.time[0],0);expect(eventCue(e.clock-e.time[0],0)).toEqual(cue);
});
it('filling or clearing the visual event budget cannot change simulation trajectories',()=>{
 const a=new EcologySimulation('ecology-life'),b=new EcologySimulation('ecology-life');a.randomize(42);b.randomize(42);
 for(let i=0;i<300;i++){
  const e=b.getState().energyEvents! as EcologyEvents;e.count=6;e.time.fill(Infinity);
  a.step(1/60);b.step(1/60);
 }
 expect([...a.getState().x]).toEqual([...b.getState().x]);expect([...a.getState().energy!]).toEqual([...b.getState().energy!]);expect(a.statistics).toEqual(b.statistics);
});

it('birth cues follow children through motion, resizing and slot compaction',()=>{
 const a=isolated('ecology-boids'),s=a.getState();s.energy![0]=1.7;a.step(1/60);
 const e=s.energyEvents!;expect(e.particle[0]).toBe(30);
 a.step(.1);expect(e.x[0]).toBe(s.x[30]);expect(e.y[0]).toBe(s.y[30]);
 s.age[5]=1000;a.step(1/60);expect(e.particle[0]).toBe(5);expect(e.x[0]).toBe(s.x[5]);
 a.setWorldSize(1600,1200);expect(e.x[0]).toBe(s.x[5]);expect(e.y[0]).toBe(s.y[5]);
 s.age[5]=1000;a.step(1/60);expect(e.count).toBe(0);
});
it('pack predators wait 30 active seconds and retain a shorter cooldown than solitary hunters',()=>{
 const a=isolated('ecology-boids'),s=a.getState();s.type[0]=2;
 const tick=()=>{for(let i=0;i<s.count;i++){const p=s.type[i]===2;s.x[i]=p?100:600;s.y[i]=p?100:400;s.vx[i]=s.vy[i]=0;s.energy![i]=p?1.8:.8;}a.step(1/60);};
 for(let i=0;i<1799;i++)tick();expect(a.statistics.births).toBe(0);
 for(let i=0;i<3;i++)tick();expect(a.statistics.births).toBe(1);
 for(let i=0;i<1200;i++)tick();expect(a.statistics.births).toBe(1);
});
