import { it, expect } from 'vitest';
import { ActivityClock, powerMode } from './power-policy';
import { FixedStepEngine } from '../core/engine';
it('resets active time on sleep and discards OS suspension gaps',()=>{
 const c=new ActivityClock();expect(c.delta(0)).toBe(0);expect(c.delta(20)).toBeCloseTo(.02);
 c.reset();expect(c.delta(900000)).toBe(0);expect(c.delta(900020)).toBeCloseTo(.02);
 expect(c.delta(1800000)).toBe(0);
});
it('keeps visible and partially covered wallpaper full rate, sleeps only when hidden',()=>{
 expect(powerMode(true,false,0)).toBe('normal');expect(powerMode(true,false,1)).toBe('normal');
 expect(powerMode(true,false,2)).toBe('sleep');expect(powerMode(true,true,0)).toBe('sleep');
 expect(powerMode(false,true,2)).toBe('normal');
});
it('automatic sleep cannot cancel manual pause or accumulate event steps',()=>{
 let steps=0;const engine=new FixedStepEngine({step:()=>steps++},{dt:1/60,maxSubSteps:4});
 const c=new ActivityClock(); c.delta(0); engine.pause(); c.reset();
 engine.advance(c.delta(900000)); engine.advance(c.delta(900020));
 expect(engine.paused).toBe(true);expect(steps).toBe(0);
 engine.resume();c.reset();engine.advance(c.delta(900030));expect(steps).toBe(0);
 engine.advance(c.delta(900050));expect(steps).toBe(1);
});
