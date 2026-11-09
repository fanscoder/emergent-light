import { it, expect } from 'vitest';
import { DEEP_OCEAN, creeperPalette } from './themes';
it('preserves normal colors and produces green-dominant bounded glow colors',()=>{
 const p=creeperPalette(DEEP_OCEAN), n=DEEP_OCEAN.particles.length;
 expect(p.slice(0,n)).toEqual(DEEP_OCEAN.particles);
 for(const s of p.slice(15*n)) {expect(s.glow[1]).toBeGreaterThan(s.glow[0]);expect(s.glow[1]).toBeGreaterThan(s.glow[2]);}
 expect(p.every(s=>s.glow.every(v=>v>=0&&v<=255))).toBe(true);
});
