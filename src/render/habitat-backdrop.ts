import type {ParticleStore} from '../core/types';
/** Opaque, cached dark terrain. Used as the fade target, never as an additive overlay. */
export class HabitatBackdrop {
 private tile=document.createElement('canvas');private map:unknown;private contrast=-1;private separation=-1;private background='';
 draw(ctx:CanvasRenderingContext2D,habitat:NonNullable<ParticleStore['habitat']>,w:number,h:number,base:readonly number[],opacity:number){
  const key=base.join(',');
  if(this.map!==habitat.map||this.contrast!==habitat.contrast||this.separation!==habitat.separation||this.background!==key){
   this.map=habitat.map;this.contrast=habitat.contrast;this.separation=habitat.separation;this.background=key;
   this.tile.width=192;this.tile.height=128;const target=this.tile.getContext('2d')!,pixels=target.createImageData(192,128);
   for(let y=0;y<128;y++)for(let x=0;x<192;x++){
    const rich=habitat.map.resource((x+.5)/192,(y+.5)/128,habitat.contrast),wall=habitat.map.resistance((x+.5)/192,(y+.5)/128)*habitat.separation,i=(y*192+x)*4;
    pixels.data[i]=base[0]+wall*9+rich;pixels.data[i+1]=base[1]+wall*12+rich*3;pixels.data[i+2]=base[2]+wall*16+rich*4;pixels.data[i+3]=255;
   }
   target.putImageData(pixels,0,0);
  }
  ctx.globalAlpha=opacity;ctx.drawImage(this.tile,0,0,w,h);ctx.globalAlpha=1;
 }
}
