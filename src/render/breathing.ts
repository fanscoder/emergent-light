/** Active-time breathing: shared by every trail length; sleep does not advance it. */
export class Breathing {
  private seconds=0;
  private phase=0;
  advance(dt:number): { amount:number; period:number } {
    const elapsed=Math.max(0,Math.min(dt,.25));
    this.seconds+=elapsed;
    const period=7.5+2.5*Math.sin(2*Math.PI*this.seconds/45);
    this.phase=(this.phase+2*Math.PI*elapsed/period)%(2*Math.PI);
    return {amount:.5-.5*Math.cos(this.phase),period};
  }
}
export function breathLevels(trail:number,amount:number):{fade:number;boost:number}{
  return {fade:Math.min(Math.max(1-trail+.12*amount,.02),.5),boost:1+.35*amount};
}
