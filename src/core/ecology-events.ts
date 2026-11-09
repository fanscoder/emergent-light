export type EnergyEventKind = 0 | 1; // predation, budding
export const EVENT_DURATION = [.65, 1.4] as const;
export class EcologyEvents {
  count=0;
  clock=0;
  readonly x=new Float32Array(6);
  readonly y=new Float32Array(6);
  readonly time=new Float64Array(6);
  readonly kind=new Uint8Array(6);
  readonly particle=new Int32Array(6).fill(-1);
  clear():void{this.count=0;this.clock=0;}
  advance(clock:number):void{
    this.clock=clock;
    for(let i=this.count-1;i>=0;i--)if(clock-this.time[i]>=EVENT_DURATION[this.kind[i] as EnergyEventKind]){
      const last=--this.count;this.x[i]=this.x[last];this.y[i]=this.y[last];this.time[i]=this.time[last];this.kind[i]=this.kind[last];this.particle[i]=this.particle[last];
    }
  }
  emit(kind:EnergyEventKind,x:number,y:number,width:number,height:number,particle=-1):void{
    // Merge nearby events of either kind; never restart an existing pulse.
    const distance=Math.min(width,height)*.05;
    for(let i=0;i<this.count;i++){
      let dx=this.x[i]-x,dy=this.y[i]-y;
      dx-=Math.round(dx/width)*width;dy-=Math.round(dy/height)*height;
      if(dx*dx+dy*dy<distance*distance)return;
    }
    if(this.count>=this.x.length)return;
    const i=this.count++;this.x[i]=x;this.y[i]=y;this.time[i]=this.clock;this.kind[i]=kind;this.particle[i]=particle;
  }
  // A compacted slot is an address, not an identity: remove dead bindings first.
  removeParticle(index:number,last:number):void{
    for(let i=this.count-1;i>=0;i--){
      if(this.particle[i]===index){
        const end=--this.count;
        this.x[i]=this.x[end];this.y[i]=this.y[end];this.time[i]=this.time[end];this.kind[i]=this.kind[end];this.particle[i]=this.particle[end];
      }
    }
    for(let i=0;i<this.count;i++)if(this.particle[i]===last)this.particle[i]=index;
  }
  follow(x:Float32Array,y:Float32Array):void{
    for(let i=0;i<this.count;i++){const p=this.particle[i];if(p>=0){this.x[i]=x[p];this.y[i]=y[p];}}
  }
  resize(sx:number,sy:number):void{for(let i=0;i<this.count;i++){this.x[i]*=sx;this.y[i]*=sy;}}
}
