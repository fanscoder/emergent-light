export const GLOW_BUFFER_SCALE=.5;
export const GLOW_SPRITE_RADIUS=36;
/** Keep the previous screen footprint while increasing sampling resolution. */
export function glowDrawSize(sourceWidth:number,scale:number,jitter:number):number {
  return sourceWidth*(18/GLOW_SPRITE_RADIUS)*(GLOW_BUFFER_SCALE/.25)*scale*jitter;
}
export function glowAlpha(distance:number,peak:number,x:number,y:number):number {
  if(distance>=1)return 0;
  const signal=Math.max(0,Math.min(1,peak*.5*(1+Math.cos(Math.PI*distance))))*255;
  // Remove sub-half-LSB tails before dithering: never add noise to near-black support.
  if(signal<.5)return 0;
  let h=Math.imul(x,374761393)+Math.imul(y,668265263);
  h=Math.imul(h^(h>>>13),1274126177);
  const noise=((h^(h>>>16))>>>0)/4294967296;
  // Stochastic rounding breaks quantization rings without temporal noise.
  return Math.min(255,Math.floor(signal+noise));
}
