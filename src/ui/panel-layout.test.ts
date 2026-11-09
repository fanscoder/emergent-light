import {it,expect} from 'vitest';
import {fitPanel} from './panel-layout';
it('keeps expanded controls on screen after scale or viewport changes',()=>{
 for(const scale of [.85,1,1.15])for(const [w,h] of [[1920,1080],[800,600],[280,180],[20,20]]){
  const p=fitPanel({x:1900,y:1000,width:900,height:900,scale},w,h);expect(p.x).toBeGreaterThanOrEqual(0);expect(p.y).toBeGreaterThanOrEqual(0);expect(p.x+p.width).toBeLessThanOrEqual(w);expect(p.y+p.height).toBeLessThanOrEqual(h);
 }
});
it('preserves expanded dimensions while collapsed and clamps again on restore',()=>{
 const p=fitPanel({x:700,y:530,width:380,height:500,collapsed:true},800,600);expect(p.width).toBe(380);expect(p.height).toBe(500);expect(p.x+220).toBeLessThanOrEqual(800);
 const open=fitPanel({...p,collapsed:false},800,600);expect(open.x+open.width).toBeLessThanOrEqual(800);expect(open.y+open.height).toBeLessThanOrEqual(600);
});
it('recovers corrupt persisted values and unsupported scales',()=>{
 const p=fitPanel({x:NaN,y:Infinity,width:-40,height:NaN,scale:20},800,600);expect(Object.values(p).every(v=>typeof v!=='number'||Number.isFinite(v))).toBe(true);expect(p.scale).toBe(1);expect(p.width).toBeGreaterThanOrEqual(300);
});
