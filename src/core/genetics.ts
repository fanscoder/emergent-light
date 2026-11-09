import {Rng} from './rng';
/** Stable locus definitions: behavior, phenotype and future recombination share these keys. */
export const GENE_SCHEMA_VERSION=2;
export const GENE_DEFS=[
 {key:'diet',weight:1,cyclic:false},
 {key:'aggression',weight:1,cyclic:false},
 {key:'strength',weight:1,cyclic:false},
 {key:'social',weight:1,cyclic:false},
 {key:'tolerance',weight:.8,cyclic:false},
 {key:'hue',weight:.6,cyclic:true},
 {key:'longevity',weight:.8,cyclic:false},
 {key:'pace',weight:.8,cyclic:false},
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
 const genome={} as Genome;let mutations=0;for(const g of GENE_DEFS)genome[g.key]=b&&rng.next()<.5?b[g.key]:a[g.key];
 if(step<=0||rng.next()>=Math.max(0,Math.min(1,rate)))return {genome,mutations};
 const chosen=new Set<GeneKey>(),count=rng.next()<.08?2:1;
 for(let n=0;n<count;n++){
  const available=GENE_DEFS.filter(g=>!chosen.has(g.key));let roll=rng.next()*available.reduce((sum,g)=>sum+(g.key==='hue'?.15:1),0);
  const gene=available.find(g=>{roll-=g.key==='hue'?.15:1;return roll<0;})??available[available.length-1];chosen.add(gene.key);
  const value=genome[gene.key],amount=Math.min(.2,step)*Math.max(.08,Math.min(2,Math.abs(rng.normal())))*(gene.cyclic?.45:1);
  const next=normalizeGene(value+(rng.next()<.5+mutationBias(b?genome:a,gene.key)?amount:-amount),gene.cyclic);
  if(next!==value)mutations++;genome[gene.key]=next;
 }
 return {genome,mutations};
}
export function geneSimilarity(store:GeneStore,a:number,b:number):number{
 let sum=0,weight=0;
 for(const g of GENE_DEFS){let d=Math.abs(store[g.key][a]-store[g.key][b]);if(g.cyclic)d=2*Math.min(d,1-d);sum+=g.weight*d*d;weight+=g.weight;}
 return Math.max(0,1-Math.sqrt(sum/weight));
}
export function combatPower(strength:number,energy:number,age:number,maturity=16):number{
 return (.4+1.2*strength)*(.35+.65*Math.min(1,Math.max(0,energy)/1.8))*(.4+.6*Math.min(1,Math.max(0,age)/maturity));
}
/** Symmetric near-equal encounters can destroy both; no diet label enters combat. */
export function combatOutcome(a:number,b:number):'a'|'b'|'both'{return a>b*1.2?'a':b>a*1.2?'b':'both';}
export const LIFE_FACTOR=(value:number)=>.65+.9*value;
export const PACE_FACTOR=(value:number)=>.7+.6*value;
export const MATURITY=(value:number)=>12+16*value;
export function mutationBias(g:Genome,key:GeneKey):number{
 const plant=Math.max(0,1-2*g.diet),middle=1-Math.abs(2*g.diet-1),solitary=g.diet*g.diet*(1-g.social);
 const bias=key==='aggression'?.68*(g.diet-.65)+.08*(g.strength-.5):key==='social'?.48*plant-.3*(g.social-.5)*middle:key==='strength'?.1*(g.aggression-.5)+.25*solitary:key==='longevity'?.3*solitary-.12*g.pace*g.pace:0;
 return Math.max(-.4,Math.min(.4,bias));
}
export function attackProbability(rate:number,dt:number):number{return -Math.expm1(-Math.max(0,rate)*Math.max(0,dt));}
