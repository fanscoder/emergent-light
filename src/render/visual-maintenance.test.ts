import {it,expect} from 'vitest';
import {Breathing,breathLevels} from './breathing';
import {GLOW_BUFFER_SCALE,GLOW_SPRITE_RADIUS,glowDrawSize,glowAlpha} from './glow-profile';
it('breathes and strengthens cleaning at every supported trail length',()=>{
 for(const trail of [.7,.8,.88,.9,.91,.97]) {
  const low=breathLevels(trail,0),high=breathLevels(trail,1);
  expect(high.fade).toBeGreaterThan(low.fade);expect(low.boost).toBe(1);expect(high.boost).toBe(1.35);
 }
});
it('drifts continuously between 5 and 10 seconds and freezes with zero active time',()=>{
 const b=new Breathing();let last=0;
 for(let i=0;i<5400;i++){const v=b.advance(1/60);expect(v.period).toBeGreaterThanOrEqual(5);expect(v.period).toBeLessThanOrEqual(10);expect(Math.abs(v.amount-last)).toBeLessThan(.011);last=v.amount;}
 expect(b.advance(0).amount).toBe(last);
});
it('increases buffer sampling without changing apparent glow diameter',()=>{
 for(const scale of [.4,.85,1.6])for(const jitter of [.3,1,2.5])
  expect(glowDrawSize(GLOW_SPRITE_RADIUS*2,scale,jitter)/GLOW_BUFFER_SCALE).toBeCloseTo(36*scale*jitter/.25);
});
it('dithering is deterministic, bounded and never injects light outside its support',()=>{
 for(let x=0;x<64;x++){
  expect(glowAlpha(1,.5,x,10)).toBe(0);expect(glowAlpha(.999,.5,x,10)).toBe(0);
  const a=glowAlpha(.5,.5,x,10);expect(a).toBe(glowAlpha(.5,.5,x,10));expect(a).toBeGreaterThanOrEqual(63);expect(a).toBeLessThanOrEqual(64);
 }
 const values=new Set(Array.from({length:64},(_,x)=>glowAlpha(.5,.5,x,10)));expect(values.size).toBe(2);
});
