import {Rng} from './rng';
/** Stable locus definitions: behavior, phenotype and future recombination share these keys. */
export const GENE_SCHEMA_VERSION=1;
export const GENE_DEFS=[
 {key:'diet',weight:1,cyclic:false},
 {key:'aggression',weight:1,cyclic:false},
 {key:'strength',weight:1,cyclic:false},
 {key:'social',weight:1,cyclic:false},
 {key:'tolerance',weight:.8,cyclic:false},
 {key:'hue',weight:.6,cyclic:true},
] as const;
export type GeneKey=typeof GENE_DEFS[number]['key'];
export type Genome=Record<GeneKey,number>;
export type GeneStore=Record<GeneKey,Float32Array>;
export function createGenes(capacity:number):GeneStore{return Object.fromEntries(GENE_DEFS.map(g=>[g.key,new Float32Array(capacity)])) as GeneStore;}
export function founder(rng:Rng):Genome{return Object.fromEntries(GENE_DEFS.map(g=>[g.key,rng.next()])) as Genome;}
export function readGenes(store:GeneStore,i:number):Genome{return Object.fromEntries(GENE_DEFS.map(g=>[g.key,store[g.key][i]])) as Genome;}
export function writeGenes(store:GeneStore,i:number,genome:Genome):void{for(const g of GENE_DEFS)store[g.key][i]=genome[g.key];}
export function normalizeGene(value:number,cyclic:boolean):number{return cyclic?((value%1)+1)%1:Math.max(0,Math.min(1,value));}
/** One-parent budding now; optional second parent prepares locus-wise recombination only. */
export function inheritGenome(a:Genome,rng:Rng,rate:number,step:number,b?:Genome):{genome:Genome;mutations:number}{
 const genome={} as Genome;let mutations=0;
 for(const g of GENE_DEFS){
  let value=b&&rng.next()<.5?b[g.key]:a[g.key];
  if(rng.next()<Math.max(0,Math.min(1,rate))){
   const jump=rng.next()<.025?3:1;
   const next=normalizeGene(value+rng.normal()*Math.min(.2,Math.max(0,step))*jump,g.cyclic);
   if(next!==value)mutations++;value=next;
  }
  genome[g.key]=value;
 }
 return {genome,mutations};
}
export function geneSimilarity(store:GeneStore,a:number,b:number):number{
 let sum=0,weight=0;
 for(const g of GENE_DEFS){let d=Math.abs(store[g.key][a]-store[g.key][b]);if(g.cyclic)d=2*Math.min(d,1-d);sum+=g.weight*d*d;weight+=g.weight;}
 return Math.max(0,1-Math.sqrt(sum/weight));
}
export function combatPower(strength:number,energy:number,age:number):number{
 return (.4+1.2*strength)*(.35+.65*Math.min(1,Math.max(0,energy)/1.8))*(.4+.6*Math.min(1,Math.max(0,age)/16));
}
/** Symmetric near-equal encounters can destroy both; no diet label enters combat. */
export function combatOutcome(a:number,b:number):'a'|'b'|'both'{return a>b*1.2?'a':b>a*1.2?'b':'both';}
