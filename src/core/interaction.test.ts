import { describe, it, expect } from 'vitest';
import { Interaction } from './interaction';
import { createStore } from './types';
import { ParticleLifeSimulation } from './modes/particle-life';
import { BoidsSimulation } from './modes/boids';
describe('interaction', () => {
  it('is inert by default and applies local opposite forces', () => {
    const s = createStore(2); s.count = 2; s.x.set([90, 500]); s.y.fill(100);
    const a = new Float32Array(2), b = new Float32Array(2), x = new Interaction();
    x.pointer = {x:100,y:100}; x.force(s,a,b,800,600); expect([...a]).toEqual([0,0]);
    x.mode='attract'; x.force(s,a,b,800,600); expect(a[0]).toBeGreaterThan(0); expect(a[1]).toBe(0);
    const f=a[0]; a.fill(0); x.mode='repel'; x.force(s,a,b,800,600); expect(a[0]).toBeCloseTo(-f);
    x.pointer=null; a.fill(0); x.force(s,a,b,800,600); expect([...a]).toEqual([0,0]);
  });
  for (const Sim of [ParticleLifeSimulation, BoidsSimulation]) {
    it(`${Sim.name}: deterministic stamps, no population loss, finite continued evolution`, () => {
      const a = new Sim(300,800,600), b = new Sim(300,800,600);
      a.randomize(42); b.randomize(42);
      a.interaction.request('creeper'); b.interaction.request('creeper');
      for(let i=0;i<120;i++){a.step(1/60);b.step(1/60);}
      expect([...a.getState().x]).toEqual([...b.getState().x]);
      expect(a.particleCount).toBe(300); expect([...a.getState().x].every(Number.isFinite)).toBe(true);
    });
  }
  it('stamps synchronize interpolation history and leave most particles untouched', () => {
    const s=createStore(300); s.count=300; s.lifespan.fill(90); const x=new Interaction();
    x.reset(42); x.request('creeper'); x.begin(s,1/60,800,600);
    expect([...s.prevX]).toEqual([...s.x]);
    const count=[...s.x].filter(v=>v!==0).length; expect(count).toBeGreaterThan(0); expect(count).toBeLessThanOrEqual(150);
  });
  it('automatic eggs depend on simulated active time, not wall time',()=>{
    const s=createStore(100); s.count=100; const x=new Interaction(); x.reset(1); x.automatic=true;
    x.begin(s,179,800,600); expect([...s.x].every(v=>v===0)).toBe(true);
    x.begin(s,182,800,600); expect([...s.x].some(v=>v!==0)).toBe(true);
  });
});

it('creeper tint is temporary and preserves particle species',()=>{
  const s=createStore(300); s.count=300; s.type.fill(2); s.lifespan.fill(90);
  const x=new Interaction(); x.reset(42); x.request('creeper'); x.begin(s,1/60,800,600);
  expect([...s.type].every(v=>v===2)).toBe(true);
  expect([...s.eggTint].some(v=>v===12)).toBe(true);
  x.begin(s,10,800,600); expect(Math.max(...s.eggTint)).toBe(2);
  x.begin(s,3,800,600); expect([...s.eggTint].every(v=>v===0)).toBe(true);
});
