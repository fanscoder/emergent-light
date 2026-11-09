export type PowerMode = 'normal' | 'sleep';
/** A sleeping interval is never fed to the fixed-step engine or renderer. */
export class ActivityClock {
  private last: number | null = null;
  reset(): void { this.last=null; }
  delta(now: number): number {
    const elapsed=this.last===null?0:(now-this.last)/1000;
    this.last=now;
    return elapsed<0||elapsed>0.25?0:elapsed;
  }
}
export function powerMode(enabled:boolean,hidden:boolean,native:number):PowerMode {
  if(!enabled)return 'normal';
  if(hidden||native===2)return 'sleep';
  // Visible wallpaper always runs at normal rate, regardless of focus/partial cover.
  return 'normal';
}
