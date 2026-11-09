import { it, expect, vi } from 'vitest';
import { startBrowserApp } from './browser';
import { FixedStepEngine } from '../core/engine';
import { ParticleLifeSimulation } from '../core/modes/particle-life';
it('actually cancels rendering and stepping during sleep and preserves manual pause',()=>{
 vi.useFakeTimers();
 vi.stubGlobal('requestAnimationFrame',(fn:(t:number)=>void)=>setTimeout(()=>fn(performance.now()),16));
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>clearTimeout(id));
 vi.stubGlobal('window',{innerWidth:800,innerHeight:600,setTimeout,clearTimeout,addEventListener:()=>{},removeEventListener:()=>{}});
 const sim=new ParticleLifeSimulation(10,800,600);sim.randomize(42);
 const step=vi.spyOn(sim,'step');const engine=new FixedStepEngine(sim,{dt:1/60,maxSubSteps:4});
 const renderer={resize:vi.fn(),render:vi.fn(),dispose:vi.fn()};
 const app=startBrowserApp({sim,engine,renderer,statsElement:{textContent:''} as HTMLElement});
 try{
  vi.advanceTimersByTime(100);expect(step.mock.calls.length).toBeGreaterThan(0);
  app.setPowerMode('sleep');const steps=step.mock.calls.length,draws=renderer.render.mock.calls.length;
  vi.advanceTimersByTime(60000);expect(step).toHaveBeenCalledTimes(steps);expect(renderer.render).toHaveBeenCalledTimes(draws);
  app.setPowerMode('normal');vi.advanceTimersByTime(16);expect(step).toHaveBeenCalledTimes(steps);
  vi.advanceTimersByTime(32);expect(step.mock.calls.length).toBeGreaterThan(steps);
  engine.pause();app.setPowerMode('sleep');app.setPowerMode('normal');const pausedSteps=step.mock.calls.length;
  vi.advanceTimersByTime(1000);expect(engine.paused).toBe(true);expect(step).toHaveBeenCalledTimes(pausedSteps);
 }finally{app.destroy();vi.unstubAllGlobals();vi.useRealTimers();}
});
