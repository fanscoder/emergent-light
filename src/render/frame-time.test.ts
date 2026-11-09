import {it,expect} from 'vitest';import {frameOpacity} from './frame-time';
it('keeps per-second trail and smoothing decay invariant at 30/60/120 Hz',()=>{
 for(const alpha of [.06,.12,.8]){
  const baseline=(1-alpha)**60;
  for(const rate of [30,60,120])expect((1-frameOpacity(alpha,1/rate))**rate).toBeCloseTo(baseline,12);
 }
 expect(frameOpacity(.8,0)).toBe(0);
});
