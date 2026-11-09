import {EvolutionEnvironment,huntingIntent,huntOutcome} from '../evolution-environment';
import {RecentEvolution,estimateGroups,traitRanges} from '../evolution-observation';
import {createStore,type Simulation,type PresetData} from '../types';
import {Rng} from '../rng';
import {SpatialHash} from '../spatial-hash';
import {Interaction} from '../interaction';
import {copyPrev,integrate,applyBoundary} from '../integrator';
import {EcologyEvents} from '../ecology-events';
import {createGenes,founder,inheritGenome,readGenes,writeGenes,geneSimilarity,combatPower,combatOutcome,GENE_DEFS,GENE_SCHEMA_VERSION,LIFE_FACTOR,PACE_FACTOR,MATURITY,attackProbability,type Genome} from '../genetics';
const CAPACITY=1000,FOOD_CAPACITY=1400;
const FIELDS=['x','y','prevX','prevY','vx','vy','type','theta','age','lifespan','lifeFrac','density','glowJit','eggTint'] as const;
export interface EvolutionParams{count:number;maxPopulation:number;foodRate:number;maxSpeed:number;lifeMean:number;mutationRate:number;mutationStep:number;rescueEnabled:boolean;experimentalRange:boolean;environmentEnabled:boolean;resourceContrast:number;regionSeparation:number;huntingEnabled:boolean;habitatVisible:boolean;pairedEnabled:boolean;buddingEnabled:boolean;buddingRate:number}
export const EVOLUTION_DEFAULTS:EvolutionParams={count:180,maxPopulation:360,foodRate:22,maxSpeed:44,lifeMean:180,mutationRate:.12,mutationStep:.055,rescueEnabled:true,experimentalRange:false,environmentEnabled:true,resourceContrast:.85,regionSeparation:.7,huntingEnabled:true,habitatVisible:true,pairedEnabled:true,buddingEnabled:true,buddingRate:.003};
export class EvolutionSimulation implements Simulation{
 readonly mode='evolution';readonly interaction=new Interaction();
 private readonly store=createStore(CAPACITY);
 private readonly genes=createGenes(CAPACITY);
 private readonly energy=new Float32Array(CAPACITY);
 private readonly generation=new Uint32Array(CAPACITY);
 private readonly id=new Uint32Array(CAPACITY);
 private readonly parent=new Uint32Array(CAPACITY);
 private readonly secondParent=new Uint32Array(CAPACITY);
 private readonly lineage=new Uint32Array(CAPACITY);
 private readonly lastBirth=new Float64Array(CAPACITY);
 private readonly retreatUntil=new Float64Array(CAPACITY);
 private readonly lastFight=new Float64Array(CAPACITY);
 private readonly dead=new Uint8Array(CAPACITY);
 private readonly foodTaken=new Uint8Array(FOOD_CAPACITY);
 private readonly ax=new Float32Array(CAPACITY);private readonly ay=new Float32Array(CAPACITY);
 private readonly power=new Float32Array(CAPACITY);
 private readonly events=new EcologyEvents();
 private readonly food={count:0,x:new Float32Array(FOOD_CAPACITY),y:new Float32Array(FOOD_CAPACITY),prevX:new Float32Array(FOOD_CAPACITY),prevY:new Float32Array(FOOD_CAPACITY)};
 private hash!:SpatialHash;private foodHash!:SpatialHash;
 private params={...EVOLUTION_DEFAULTS};private rng=new Rng(1);private heredity=new Rng(2);
 private clock=0;private supply=0;private rescueClock=0;private seed=1;private nextId=1;
 readonly totals={births:0,mutatedBirths:0,mutations:0,foodEaten:0,attacks:0,combatDeaths:0,starvation:0,oldAge:0,immigrants:0,energyFromFood:0,energyFromCombat:0,combatEnergyLost:0,naturalEnergyLost:0,reproductionCost:0,metabolicCost:0,nonlethalConflicts:0,deathAgeSum:0,huntAttempts:0,huntKills:0,counterKills:0,huntEnergy:0,regionCrossings:0,pairBirths:0,budBirths:0};
 private readonly recent=new RecentEvolution();private groupClock=-Infinity;private groupSamples:number[]=[];private groups={count:0,scattered:0};
 private environment=new EvolutionEnvironment(1);private habitatRng=new Rng(1);
 private width:number;private height:number;
 constructor(width=800,height=600){
  this.width=width;this.height=height;
  this.store.energy=this.energy;this.store.food=this.food;this.store.energyEvents=this.events;
  this.store.evolution={genes:this.genes,generation:this.generation,id:this.id,parent:this.parent,secondParent:this.secondParent,lineage:this.lineage};this.syncHabitat();this.rebuild();
 }
 private syncHabitat(){this.store.habitat={map:this.environment,enabled:this.params.environmentEnabled,visible:this.params.habitatVisible,contrast:this.params.resourceContrast,separation:this.params.regionSeparation};}
 private get scale(){return Math.max(.6,Math.min(2.5,Math.sqrt(this.width*this.height/480000)));}
 private rebuild(){this.hash=new SpatialHash(this.width,this.height,120*this.scale,true,CAPACITY);this.foodHash=new SpatialHash(this.width,this.height,120*this.scale,true,FOOD_CAPACITY);}
 private delta(d:number,size:number){return d-Math.round(d/size)*size;}
 get particleCount(){return this.store.count;}
 getState(){return this.store;}
 get paramsSnapshot(){return {...this.params};}
 get statistics(){
  if(this.clock-this.groupClock>=5){const next=estimateGroups(this.genes,this.id,this.store.count);this.groupSamples.push(next.count);if(this.groupSamples.length>3)this.groupSamples.shift();this.groups={count:[...this.groupSamples].sort((a,b)=>a-b)[Math.floor(this.groupSamples.length/2)],scattered:next.scattered};this.groupClock=this.clock;}
  const means={diet:0,aggression:0,strength:0,social:0,tolerance:0,hue:0,longevity:0,pace:0};let energy=0,maxGeneration=0,diversity=0;
  for(let i=0;i<this.store.count;i++){energy+=this.energy[i];maxGeneration=Math.max(maxGeneration,this.generation[i]);for(const g of GENE_DEFS)means[g.key]+=this.genes[g.key][i];}
  const n=this.store.count;for(const g of GENE_DEFS)means[g.key]/=n||1;
  for(let i=0;i<n;i++)for(const g of GENE_DEFS)if(!g.cyclic)diversity+=(this.genes[g.key][i]-means[g.key])**2;
  const families=new Map<number,number>();for(let i=0;i<n;i++)families.set(this.lineage[i],(families.get(this.lineage[i])??0)+1);
  const regions=Array.from({length:this.environment.fertility.length},(_,index)=>({index,fertility:this.params.environmentEnabled?this.environment.resource(...this.environment.center(index),this.params.resourceContrast):1,population:0,diet:0,energy:0}));
  for(let i=0;i<n;i++){const region=regions[this.environment.region(this.store.x[i]/this.width,this.store.y[i]/this.height)];region.population++;region.diet+=this.genes.diet[i];region.energy+=this.energy[i];}
  for(const region of regions){region.diet/=region.population||1;region.energy/=region.population||1;}
  return {regions,recent:this.recent.read(this.clock,this.totals),groups:this.groups,ranges:traitRanges(this.genes,n),...this.totals,population:n,food:this.food.count,meanEnergy:energy/(n||1),maxGeneration,diversity:Math.sqrt(diversity/Math.max(1,n*7)),livingLineages:families.size,largestLineage:Math.max(0,...families.values()),meanDeathAge:this.totals.deathAgeSum/Math.max(1,this.totals.combatDeaths+this.totals.oldAge+this.totals.starvation),means};
 }
 updateParams(patch:Partial<EvolutionParams>){
  const num=(key:keyof EvolutionParams,min:number,max:number)=>{const v=patch[key];return typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):this.params[key] as number;};
  const experimentalRange=typeof patch.experimentalRange==='boolean'?patch.experimentalRange:this.params.experimentalRange;
  this.params={habitatVisible:typeof patch.habitatVisible==='boolean'?patch.habitatVisible:this.params.habitatVisible,pairedEnabled:typeof patch.pairedEnabled==='boolean'?patch.pairedEnabled:this.params.pairedEnabled,buddingEnabled:typeof patch.buddingEnabled==='boolean'?patch.buddingEnabled:this.params.buddingEnabled,buddingRate:num('buddingRate',0,.05),environmentEnabled:typeof patch.environmentEnabled==='boolean'?patch.environmentEnabled:this.params.environmentEnabled,huntingEnabled:typeof patch.huntingEnabled==='boolean'?patch.huntingEnabled:this.params.huntingEnabled,resourceContrast:num('resourceContrast',0,1),regionSeparation:num('regionSeparation',0,1),experimentalRange,count:Math.round(num('count',30,experimentalRange?1000:300)),maxPopulation:Math.round(num('maxPopulation',50,experimentalRange?CAPACITY:(patch.maxPopulation===undefined?this.params.maxPopulation:450))),foodRate:num('foodRate',0,60),maxSpeed:num('maxSpeed',10,100),lifeMean:num('lifeMean',30,600),mutationRate:num('mutationRate',0,.5),mutationStep:num('mutationStep',0,.2),rescueEnabled:typeof patch.rescueEnabled==='boolean'?patch.rescueEnabled:this.params.rescueEnabled};this.syncHabitat();
 }
 resetDefaults(){this.params={...EVOLUTION_DEFAULTS};this.syncHabitat();}
 randomize(seed:number){
  this.seed=seed>>>0;this.rng=new Rng(this.seed);this.heredity=new Rng(this.seed^0x47454e45);this.interaction.reset(this.seed);
  this.environment=new EvolutionEnvironment(this.seed);this.syncHabitat();this.habitatRng=new Rng(this.seed^0x464f4f44);
  this.clock=this.supply=this.rescueClock=0;this.nextId=1;this.store.count=this.food.count=0;this.events.clear();
  for(const key of Object.keys(this.totals) as (keyof typeof this.totals)[])this.totals[key]=0;
  this.recent.reset(this.totals);this.groupClock=-Infinity;this.groupSamples=[];
  for(let i=0;i<Math.min(this.params.count,this.params.maxPopulation);i++){const j=this.spawn(founder(this.heredity),this.rng.range(0,this.width),this.rng.range(0,this.height),this.rng.range(.65,1.25),0,0);this.store.age[j]=this.rng.range(16,this.store.lifespan[j]*.45);this.lastBirth[j]=-Infinity;}
  for(let i=0;i<500;i++)this.addFood();
 }
 private spawn(genome:Genome,x:number,y:number,energy:number,generation:number,parent:number,lineage=0,secondParent=0){
  const s=this.store,i=s.count++;writeGenes(this.genes,i,genome);this.generation[i]=generation;this.parent[i]=parent;this.secondParent[i]=secondParent;this.id[i]=this.nextId++;this.lineage[i]=lineage||this.id[i];
  s.type[i]=0;s.x[i]=s.prevX[i]=((x%this.width)+this.width)%this.width;s.y[i]=s.prevY[i]=((y%this.height)+this.height)%this.height;
  s.theta[i]=this.rng.range(0,Math.PI*2);s.vx[i]=Math.cos(s.theta[i])*12*this.scale;s.vy[i]=Math.sin(s.theta[i])*12*this.scale;
  s.age[i]=0;s.lifespan[i]=this.params.lifeMean*LIFE_FACTOR(genome.longevity);s.lifeFrac[i]=0;s.glowJit[i]=Math.max(-2,Math.min(2,this.rng.normal()));s.eggTint[i]=0;s.density[i]=0;
  this.energy[i]=energy;this.lastBirth[i]=this.clock;this.lastFight[i]=-Infinity;this.retreatUntil[i]=0;return i;
 }
 private addFood(){
  if(this.food.count>=FOOD_CAPACITY)return;let x=0,y=0;
  do{x=this.habitatRng.next();y=this.habitatRng.next();}while(this.params.environmentEnabled&&this.habitatRng.next()*this.environment.maxResource>this.environment.resource(x,y,this.params.resourceContrast));
  const i=this.food.count++;this.food.x[i]=this.food.prevX[i]=x*this.width;this.food.y[i]=this.food.prevY[i]=y*this.height;
 }
 private ready(i:number,threshold:number){return this.energy[i]>=threshold&&this.store.age[i]>=MATURITY(this.genes.longevity[i])&&this.clock-this.lastBirth[i]>=14+22*this.genes.longevity[i];}
 private compatible(a:number,b:number){return geneSimilarity(this.genes,a,b)>=.72-.12*(this.genes.tolerance[a]+this.genes.tolerance[b])*.5;}
 private fight(a:number,b:number){
  if(this.dead[a]||this.dead[b]||this.clock-this.lastFight[a]<6||this.clock-this.lastFight[b]<6)return;
  this.lastFight[a]=this.lastFight[b]=this.clock;this.totals.attacks++;
  const powerA=combatPower(this.genes.strength[a],this.energy[a],this.store.age[a],MATURITY(this.genes.longevity[a])),powerB=combatPower(this.genes.strength[b],this.energy[b],this.store.age[b],MATURITY(this.genes.longevity[b]));
  let result=combatOutcome(powerA,powerB),huntFailed=false;
  const hunting=this.params.huntingEnabled&&this.rng.next()<huntingIntent(this.genes.diet[a],this.energy[a]);
  if(hunting){this.totals.huntAttempts++;const outcome=huntOutcome(powerA,powerB,this.rng.next());if(outcome!=='retreat')result=outcome;else huntFailed=true;}

  const ordinaryLethal=Math.min(this.energy[a],this.energy[b])<.12||(Math.max(powerA,powerB)>Math.min(powerA,powerB)*1.8&&this.genes.diet[a]>.55&&this.energy[a]<.8);
  const lethal=hunting?!huntFailed:ordinaryLethal;
  if(!lethal){const lossA=Math.min(this.energy[a],.035+.045*this.genes.strength[b]),lossB=Math.min(this.energy[b],.035+.045*this.genes.strength[a]);this.energy[a]-=lossA;this.energy[b]-=lossB;this.totals.combatEnergyLost+=lossA+lossB;this.totals.nonlethalConflicts++;this.retreatUntil[a]=this.retreatUntil[b]=this.clock+4;return;}
  if(result==='both'){this.dead[a]=this.dead[b]=1;this.totals.combatDeaths+=2;this.totals.combatEnergyLost+=this.energy[a]+this.energy[b];}
  else{const winner=result==='a'?a:b,loser=result==='a'?b:a;this.dead[loser]=1;this.totals.combatDeaths++;
   const gain=Math.min(1.8-this.energy[winner],this.energy[loser]*(hunting?.85:.65)*this.genes.diet[winner]);this.energy[winner]+=gain;this.totals.energyFromCombat+=gain;if(hunting){this.totals.huntEnergy+=gain;if(winner===a)this.totals.huntKills++;else this.totals.counterKills++;}this.totals.combatEnergyLost+=this.energy[loser]-gain;
  }
  if(this.dead[a])this.totals.deathAgeSum+=this.store.age[a];if(this.dead[b])this.totals.deathAgeSum+=this.store.age[b];
  this.events.emit(0,this.store.x[b],this.store.y[b],this.width,this.height);
 }
 step(dt:number){
  if(!(dt>0)||!Number.isFinite(dt))return;const s=this.store,n=s.count,w=this.width,h=this.height,k=this.scale,g=this.genes;
  this.clock+=dt;this.events.advance(this.clock);copyPrev(s);
  for(let i=0;i<n;i++)this.ax[i]=s.age[i];this.interaction.begin(s,dt,w,h);for(let i=0;i<n;i++)s.age[i]=this.ax[i];
  this.supply+=dt*this.params.foodRate;const supply=Math.floor(this.supply);this.supply-=supply;for(let i=0;i<Math.min(supply,FOOD_CAPACITY);i++)this.addFood();
  for(let i=0;i<this.food.count;i++){this.food.prevX[i]=this.food.x[i];this.food.prevY[i]=this.food.y[i];this.food.x[i]=(this.food.x[i]+Math.cos(this.food.y[i]/h*6+this.clock*.015)*1.8*k*dt+w)%w;this.food.y[i]=(this.food.y[i]+Math.sin(this.food.x[i]/w*6+this.clock*.01)*1.2*k*dt+h)%h;}
  this.hash.rebuild(s.x,s.y,n);this.foodHash.rebuild(this.food.x,this.food.y,this.food.count);this.dead.fill(0);this.foodTaken.fill(0);this.ax.fill(0);this.ay.fill(0);
  for(let i=0;i<n;i++)this.power[i]=combatPower(g.strength[i],this.energy[i],s.age[i],MATURITY(g.longevity[i]));
  for(let i=0;i<n;i++){
   if(this.dead[i])continue;let fx=0,fy=0,vx=0,vy=0,socialWeight=0,prey=-1,preyScore=0,food=-1,foodDistance=(120*k)**2;
   const range=140*k,hunger=Math.max(.15,Math.min(1,1.4-this.energy[i]));s.density[i]=0;
   this.hash.forEachInRadius(s.x[i],s.y[i],range,j=>{
    if(j===i||this.dead[j])return;const dx=this.delta(s.x[j]-s.x[i],w),dy=this.delta(s.y[j]-s.y[i],h),d2=dx*dx+dy*dy;
    if(d2>=range*range||d2<.001)return;const d=Math.sqrt(d2),similarity=geneSimilarity(g,i,j),accept=similarity>.85-.4*g.tolerance[i];
    if(d<60*k)s.density[i]++;
    if(d<14*k){const repel=65*k*(1-d/(14*k));fx-=dx/d*repel;fy-=dy/d*repel;}
    if(this.params.pairedEnabled&&this.ready(i,1.05)&&this.ready(j,1.05)&&this.compatible(i,j)){const seek=(.3+.7*g.social[i])*(1-d/range)*16*k;fx+=dx/d*seek;fy+=dy/d*seek;}
    if(accept){const weight=g.social[i]*similarity*Math.max(0,1-d/(110*k));fx+=dx/d*weight*14*k;fy+=dy/d*weight*14*k;vx+=s.vx[j]*weight;vy+=s.vy[j]*weight;socialWeight+=weight;}
    else if(d<70*k){const repel=18*k*(1-g.tolerance[i])*(1-d/(70*k));fx-=dx/d*repel;fy-=dy/d*repel;}
    const risk=this.power[j]/Math.max(.01,this.power[i]);
    if(((g.aggression[j]>.6&&risk>.8)||this.retreatUntil[i]>this.clock)&&d<85*k){const flee=42*k*(this.retreatUntil[i]>this.clock?.8:1-g.aggression[i])*(1-d/(85*k));fx-=dx/d*flee;fy-=dy/d*flee;}
    if(s.age[j]>6&&s.age[i]>MATURITY(g.longevity[i])*.6&&this.clock-this.lastFight[i]>=6&&this.retreatUntil[i]<=this.clock){const score=g.aggression[i]*(.2+.8*hunger)*(.25+.75*g.diet[i])*(1-.95*similarity)/(1+Math.max(0,risk-1)*2)*(1-d/range)*(this.params.huntingEnabled?(.35+.65*Math.min(1,this.energy[j])):1);if(score>preyScore){preyScore=score;prey=j;}}
   });
   if(socialWeight>0){fx+=(vx/socialWeight-s.vx[i])*.45*g.social[i];fy+=(vy/socialWeight-s.vy[i])*.45*g.social[i];}
   this.foodHash.forEachInRadius(s.x[i],s.y[i],120*k,j=>{if(this.foodTaken[j])return;const dx=this.delta(this.food.x[j]-s.x[i],w),dy=this.delta(this.food.y[j]-s.y[i],h),d2=dx*dx+dy*dy;if(d2<foodDistance){foodDistance=d2;food=j;}});
   if(food>=0){const d=Math.sqrt(foodDistance),dx=this.delta(this.food.x[food]-s.x[i],w),dy=this.delta(this.food.y[food]-s.y[i],h);
    if(d<6*k){this.foodTaken[food]=1;const gain=Math.min(1.8-this.energy[i],.16*(1-.75*g.diet[i]));this.energy[i]+=gain;this.totals.energyFromFood+=gain;this.totals.foodEaten++;}
    else{const chase=28*k*hunger*(1-.7*g.diet[i]);fx+=dx/d*chase;fy+=dy/d*chase;}
   }
   if(prey>=0&&!this.dead[prey]){
    const dx=this.delta(s.x[prey]-s.x[i],w),dy=this.delta(s.y[prey]-s.y[i],h),d=Math.hypot(dx,dy);
    if(d<8*k&&this.rng.next()<attackProbability(preyScore*(1.2+(this.params.huntingEnabled?4*huntingIntent(g.diet[i],this.energy[i]):0)),dt))this.fight(i,prey);
    else if(d>0){
     const effort=this.params.huntingEnabled?huntingIntent(g.diet[i],this.energy[i])*g.aggression[i]:0;
     // Target score chooses whom to approach; feeding effort must overcome shared short-range avoidance.
     const contact=d<14*k?65*k*(1-d/(14*k))*effort:0,chase=42*k*preyScore+85*k*effort+contact;
     fx+=dx/d*chase;fy+=dy/d*chase;
    }
   }
   s.theta[i]+=this.rng.normal()*Math.sqrt(.035*dt);fx+=Math.cos(s.theta[i])*8*k;fy+=Math.sin(s.theta[i])*8*k;
   const force=Math.hypot(fx,fy),limit=140*k;this.ax[i]=force>limit?fx/force*limit:fx;this.ay[i]=force>limit?fy/force*limit:fy;
  }
  this.interaction.force(s,this.ax,this.ay,w,h);integrate(s,this.ax,this.ay,{dt,gamma:.35,maxSpeed:this.params.maxSpeed*k*1.3});
  for(let i=0;i<n;i++){
   if(this.dead[i])continue;const cost=Math.min(this.energy[i],dt*(.004+g.strength[i]**2*.005+g.pace[i]**2*.003+Math.hypot(s.vx[i],s.vy[i])/(this.params.maxSpeed*k)*.001));this.energy[i]-=cost;this.totals.metabolicCost+=cost;
   const cap=this.params.maxSpeed*k*PACE_FACTOR(g.pace[i])*(1-.1*g.strength[i])*(.82+.18*Math.min(1,Math.max(0,this.energy[i])))*(1+.06*s.glowJit[i]);const speed=Math.hypot(s.vx[i],s.vy[i]);if(speed>cap){s.vx[i]*=cap/speed;s.vy[i]*=cap/speed;}
   if(this.params.environmentEnabled){const resistance=this.environment.resistance(s.prevX[i]/w,s.prevY[i]/h),drag=Math.exp(-resistance*this.params.regionSeparation*5*dt);s.vx[i]*=drag;s.vy[i]*=drag;}
   s.x[i]=s.prevX[i]+s.vx[i]*dt;s.y[i]=s.prevY[i]+s.vy[i]*dt;s.age[i]+=dt;s.lifeFrac[i]=Math.max(0,Math.min(1,s.age[i]/2,(s.lifespan[i]-s.age[i])/4,this.energy[i]/.15));
  }
  applyBoundary(s,w,h,'wrap');
  for(let i=0;i<n;i++)if(!this.dead[i]&&this.environment.region(s.prevX[i]/w,s.prevY[i]/h)!==this.environment.region(s.x[i]/w,s.y[i]/h))this.totals.regionCrossings++;
  for(let i=s.count-1;i>=0;i--){const old=s.age[i]>=s.lifespan[i],starved=this.energy[i]<=.02;if(!this.dead[i]&&!old&&!starved)continue;
   if(!this.dead[i]){this.totals.deathAgeSum+=s.age[i];this.totals.naturalEnergyLost+=this.energy[i];if(old)this.totals.oldAge++;else this.totals.starvation++;}
   const last=--s.count;this.events.removeParticle(i,last);for(const field of FIELDS)s[field][i]=s[field][last];for(const def of GENE_DEFS)g[def.key][i]=g[def.key][last];
   for(const array of [this.energy,this.generation,this.id,this.parent,this.secondParent,this.lineage,this.lastBirth,this.lastFight,this.retreatUntil])array[i]=array[last];
  }
  for(let i=this.food.count-1;i>=0;i--)if(this.foodTaken[i]){const last=--this.food.count;for(const field of ['x','y','prevX','prevY'] as const)this.food[field][i]=this.food[field][last];}
  const adults=s.count;this.hash.rebuild(s.x,s.y,adults);
  for(let i=0;i<adults&&s.count<this.params.maxPopulation;i++){
   let mate=-1,distance=(26*k)**2;
   if(this.params.pairedEnabled&&this.ready(i,1.05))this.hash.forEachInRadius(s.x[i],s.y[i],26*k,j=>{
    if(j===i||!this.ready(j,1.05)||!this.compatible(i,j))return;
    const d2=this.delta(s.x[j]-s.x[i],w)**2+this.delta(s.y[j]-s.y[i],h)**2;if(d2<distance){mate=j;distance=d2;}
   });
   if(mate>=0){
    const j=mate,inherited=inheritGenome(readGenes(g,i),this.heredity,this.params.mutationRate,this.params.mutationStep,readGenes(g,j));
    const investment=(this.energy[i]+this.energy[j])*.45,childEnergy=investment*.85;
    this.energy[i]*=.55;this.energy[j]*=.55;this.totals.reproductionCost+=investment*.15;
    const child=this.spawn(inherited.genome,s.x[i]+this.delta(s.x[j]-s.x[i],w)*.5,s.y[i]+this.delta(s.y[j]-s.y[i],h)*.5,childEnergy,Math.max(this.generation[i],this.generation[j])+1,this.id[i],this.heredity.next()<.5?this.lineage[i]:this.lineage[j],this.id[j]);
    this.lastBirth[i]=this.lastBirth[j]=this.clock;s.vx[child]=(s.vx[i]+s.vx[j])*.4;s.vy[child]=(s.vy[i]+s.vy[j])*.4;this.totals.pairBirths++;
    this.recordBirth(inherited.mutations,child);continue;
   }
   if(!this.params.buddingEnabled||!this.ready(i,1.45)||this.rng.next()>=attackProbability(this.params.buddingRate,dt))continue;
   const inherited=inheritGenome(readGenes(g,i),this.heredity,this.params.mutationRate,this.params.mutationStep),energy=this.energy[i],angle=this.rng.range(0,Math.PI*2);
   const child=this.spawn(inherited.genome,s.x[i]+Math.cos(angle)*10*k,s.y[i]+Math.sin(angle)*10*k,energy*.35,this.generation[i]+1,this.id[i],this.lineage[i]);
   this.energy[i]=energy*.55;this.totals.reproductionCost+=energy*.1;this.lastBirth[i]=this.clock;s.vx[child]=s.vx[i]*.8;s.vy[child]=s.vy[i]*.8;this.totals.budBirths++;this.recordBirth(inherited.mutations,child);
  }
  this.events.follow(s.x,s.y);this.rescueClock+=dt;
  if(this.rescueClock>=20){this.rescueClock%=20;if(this.params.rescueEnabled&&s.count<12&&s.count<this.params.maxPopulation){this.spawn(founder(this.heredity),this.rng.range(0,w),this.rng.range(0,h),.85,0,0);this.totals.immigrants++;}}
  this.recent.record(this.clock,this.totals);
 }
 private recordBirth(mutations:number,child:number){this.totals.births++;if(mutations>0){this.totals.mutatedBirths++;this.totals.mutations+=mutations;}this.events.emit(1,this.store.x[child],this.store.y[child],this.width,this.height,child);}
 serialize():PresetData{return {version:1,mode:this.mode,seed:this.seed,params:{...this.params,geneSchema:GENE_SCHEMA_VERSION},visual:{theme:'deep-ocean'}};}
 deserialize(preset:PresetData){if(preset.params.geneSchema!==undefined&&preset.params.geneSchema!==1&&preset.params.geneSchema!==GENE_SCHEMA_VERSION)throw Error('不支持的遗传属性版本');this.resetDefaults();this.updateParams(preset.params);this.randomize(preset.seed);}
 setWorldSize(width:number,height:number){if(!(width>0&&height>0))return;const sx=width/this.width,sy=height/this.height;for(let i=0;i<this.store.count;i++){this.store.x[i]*=sx;this.store.prevX[i]*=sx;this.store.y[i]*=sy;this.store.prevY[i]*=sy;}for(let i=0;i<this.food.count;i++){this.food.x[i]*=sx;this.food.prevX[i]*=sx;this.food.y[i]*=sy;this.food.prevY[i]*=sy;}this.events.resize(sx,sy);this.width=width;this.height=height;this.rebuild();}
}
