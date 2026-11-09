/** Preserve a 60 Hz opacity/low-pass coefficient at a different active frame rate. */
export function frameOpacity(alpha:number,dt:number):number {
 return 1-Math.pow(1-Math.min(1,Math.max(0,alpha)),Math.max(0,Math.min(dt,.25))*60);
}
