import { SPECIES_DEFAULTS,sanitizeSpecies,speciesOf,type Species,type SpeciesSettings } from '../species-settings';
import { createStore, type ParticleStore, type PresetData, type Simulation } from '../types';
import { electLeaders,leaderResponse } from '../leadership';
import { Guards,DESPERATE_ENERGY,predatorWinsGuard } from '../guards';
import { EcologyEvents } from '../ecology-events';
import { Rng } from '../rng';
import { SpatialHash } from '../spatial-hash';
import { copyPrev, applyBoundary, integrate } from '../integrator';
import { Interaction } from '../interaction';

export type EcologyMode = 'ecology-boids' | 'ecology-life';
export interface EcologyParams extends SpeciesSettings { count:number; maxPopulation:number; foodRate:number; maxSpeed:number; lifeMean:number; rescueEnabled:boolean }
export const ECOLOGY_DEFAULTS:EcologyParams={...SPECIES_DEFAULTS,count:180,maxPopulation:420,foodRate:16,maxSpeed:44,lifeMean:180,rescueEnabled:true};
const CAPACITY=450, FOOD_CAPACITY=1400;
const FIELDS=['x','y','prevX','prevY','vx','vy','type','theta','age','lifespan','lifeFrac','density','glowJit','eggTint'] as const;
export function budEnergy(energy:number):{parent:number;child:number} {return {parent:energy*.55,child:energy*.35};}
export function energyAppearance(energy:number):{size:number;brightness:number} {
  const e=Math.max(0,Math.min(1.8,energy));
  return {size:.35+.65*Math.sqrt(e/1.8),brightness:.4+.6*Math.sqrt(e/1.8)};
}
export class EcologySimulation implements Simulation {
  readonly interaction=new Interaction();
  private readonly store=createStore(CAPACITY);
  private readonly energy=new Float32Array(CAPACITY);
  private readonly leader=new Float32Array(CAPACITY);
  private readonly guards=new Guards(CAPACITY);
  private readonly guardThreat=new Int32Array(CAPACITY);
  private readonly fought=new Uint8Array(CAPACITY);
  private combatRng=new Rng(1);
  private clash(guard:number,predator:number):void{
    if(this.eaten[guard]||this.eaten[predator]||this.fought[predator])return;
    const s=this.store;this.fought[predator]=1;this.eaten[guard]=1;this.totals.guardClashes++;
    const desperate=this.energy[predator]<DESPERATE_ENERGY;
    if(predatorWinsGuard(this.energy[predator],desperate?this.combatRng.next():1)){
      this.energy[predator]=Math.min(1.8,this.energy[predator]+Math.min(.65,this.energy[guard]*.6));this.totals.predation++;
    }else{this.eaten[predator]=1;this.totals.defenseDeaths+=2;}
    this.events.emit(0,s.x[guard],s.y[guard],this.width,this.height);
  }
  private readonly leaderHits=new Uint8Array(CAPACITY);
  private readonly lastHit=new Float64Array(CAPACITY);
  private readonly leaderIndices=new Int32Array(8);
  private leaderCount=0;
  private indexLeaders():void{
    this.leaderCount=0;
    for(let i=0;i<this.store.count;i++)if(this.leader[i]>0&&this.leaderCount<this.leaderIndices.length)this.leaderIndices[this.leaderCount++]=i;
  }
  private nearestLeader(i:number,radius:number,includeSelf=false):number{
    const s=this.store;let best=radius*radius,found=-1;
    for(let j=0;j<this.leaderCount;j++){
      const p=this.leaderIndices[j];if(s.type[p]!==s.type[i]||(!includeSelf&&p===i))continue;
      const dx=this.delta(s.x[p]-s.x[i],this.width),dy=this.delta(s.y[p]-s.y[i],this.height),d2=dx*dx+dy*dy;
      if(d2<best){best=d2;found=p;}
    }
    return found;
  }
  private electionClock=0;
  private readonly lastBirth=new Float64Array(CAPACITY);
  private readonly events=new EcologyEvents();
  private readonly ax=new Float32Array(CAPACITY);
  private readonly ay=new Float32Array(CAPACITY);
  private readonly eaten=new Uint8Array(CAPACITY);
  private readonly foodEaten=new Uint8Array(FOOD_CAPACITY);
  private readonly food={count:0,x:new Float32Array(FOOD_CAPACITY),y:new Float32Array(FOOD_CAPACITY),prevX:new Float32Array(FOOD_CAPACITY),prevY:new Float32Array(FOOD_CAPACITY)};
  private rng=new Rng(1);
  private hash!:SpatialHash;
  private foodHash!:SpatialHash;
  private params:EcologyParams={...ECOLOGY_DEFAULTS};
  private seed=1;
  private clock=0;
  private supply=0;
  private rescueClock=0;
  readonly totals={births:0,predation:0,foodEaten:0,starvation:0,oldAge:0,immigrants:0,defenseDeaths:0,guardClashes:0};
  readonly mode:EcologyMode;
  private width:number;
  private height:number;
  constructor(mode:EcologyMode,width=800,height=600){
    this.mode=mode;this.width=width;this.height=height;
    this.store.guard=this.guards.strength;this.store.leader=this.leader;this.store.energy=this.energy;this.store.energyEvents=this.events;this.store.food=this.food;this.rebuild();
  }
  private get scale():number{return Math.max(.6,Math.min(2.5,Math.sqrt(this.width*this.height/480000)));}
  private rebuild():void{const r=100*this.scale;this.hash=new SpatialHash(this.width,this.height,r,true,CAPACITY);this.foodHash=new SpatialHash(this.width,this.height,r,true,FOOD_CAPACITY);}
  get particleCount():number{return this.store.count;}
  getState():Readonly<ParticleStore>{return this.store;}
  get paramsSnapshot():EcologyParams{return {...this.params};}
  private profiles:Partial<Record<Species,Readonly<{Life:number;Speed:number;Interval:number;Maturity:number;BirthEnergy:number;customInterval:boolean;customMaturity:boolean;customBirthEnergy:boolean}>>>={};
  speciesProfile(species:Species){
    if(this.profiles[species])return this.profiles[species]!;
    const p=this.params,predator=species==='predator';
    const value=(field:'Life'|'Speed'|'Interval'|'Maturity'|'BirthEnergy',fallback:number)=>p[`${species}${field}`]>=0?p[`${species}${field}`]:fallback;
    const solitary=predator&&this.mode==='ecology-life',pack=predator&&!solitary;
    return this.profiles[species]={Life:value('Life',p.lifeMean),Speed:value('Speed',p.maxSpeed*(predator?1.22:1)),Interval:value('Interval',solitary?75:pack?30:this.mode==='ecology-boids'?8:0),Maturity:value('Maturity',solitary?45:pack?25:12),BirthEnergy:value('BirthEnergy',solitary?1.75:pack?1.65:this.mode==='ecology-boids'?1.5:1.6),customInterval:p[`${species}Interval`]>=0,customMaturity:p[`${species}Maturity`]>=0,customBirthEnergy:p[`${species}BirthEnergy`]>=0};
  }
  get statistics(){
    const populations=[0,0,0];let energy=0;
    for(let i=0;i<this.store.count;i++){populations[this.store.type[i]===0?0:this.store.type[i]===4?1:2]++;energy+=this.energy[i];}
    return {...this.totals,cyan:populations[0],amber:populations[1],predators:populations[2],food:this.food.count,population:this.store.count,meanEnergy:this.store.count?energy/this.store.count:0};
  }
  updateParams(patch:Partial<EcologyParams>):void{
    const num=(key:keyof EcologyParams,min:number,max:number):number=>{
      const v=patch[key];return typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):this.params[key] as number;
    };
    const oldLife={cyan:this.speciesProfile('cyan').Life,amber:this.speciesProfile('amber').Life,predator:this.speciesProfile('predator').Life};
    this.params={...sanitizeSpecies(this.params,patch),count:Math.round(num('count',30,300)),maxPopulation:Math.round(num('maxPopulation',50,CAPACITY)),foodRate:num('foodRate',0,60),maxSpeed:num('maxSpeed',10,100),lifeMean:num('lifeMean',30,600),rescueEnabled:typeof patch.rescueEnabled==='boolean'?patch.rescueEnabled:this.params.rescueEnabled};
    this.profiles={};
    for(let i=0;i<this.store.count;i++){const kind=speciesOf(this.store.type[i]);this.store.lifespan[i]*=this.speciesProfile(kind).Life/oldLife[kind];}
  }
    // Existing organisms retain age and individual lifetime ratio when a baseline changes.
  resetDefaults():void{this.updateParams({...ECOLOGY_DEFAULTS});}
  randomize(seed:number):void{
    this.seed=seed>>>0;this.rng=new Rng(this.seed);this.combatRng=new Rng(this.seed^0x71e5b93d);this.guards.reset();this.interaction.reset(this.seed);
    this.clock=this.supply=this.rescueClock=this.electionClock=0;this.leader.fill(0);this.leaderHits.fill(0);this.lastHit.fill(-Infinity);this.events.clear();this.store.count=0;this.food.count=0;
    for(const key of Object.keys(this.totals) as (keyof typeof this.totals)[])this.totals[key]=0;
    const n=Math.min(this.params.count,this.params.maxPopulation);
    for(let i=0;i<n;i++){
      const type=i<Math.round(n*.72)?0:i<Math.round(n*.9)?4:2;
      const j=this.spawn(type,this.rng.range(0,this.width),this.rng.range(0,this.height),this.rng.range(.65,1.25));
      this.store.age[j]=this.rng.range(15,this.params.lifeMean*.5);
      this.lastBirth[j]=-Infinity;
    }
    for(let i=0;i<500;i++)this.addFood();
  }
  private spawn(type:number,x:number,y:number,energy:number):number{
    const s=this.store,i=s.count++;s.type[i]=type;s.x[i]=s.prevX[i]=((x%this.width)+this.width)%this.width;s.y[i]=s.prevY[i]=((y%this.height)+this.height)%this.height;
    s.theta[i]=this.rng.range(0,Math.PI*2);s.vx[i]=Math.cos(s.theta[i])*12*this.scale;s.vy[i]=Math.sin(s.theta[i])*12*this.scale;
    this.guards.spawn(i);this.lastBirth[i]=this.clock;this.leader[i]=0;this.leaderHits[i]=0;this.lastHit[i]=-Infinity;
    s.age[i]=0;s.lifespan[i]=this.speciesProfile(speciesOf(type)).Life*this.rng.range(.75,1.25);s.lifeFrac[i]=0;
    s.glowJit[i]=Math.max(-2,Math.min(2,this.rng.normal()));s.eggTint[i]=0;s.density[i]=0;this.energy[i]=energy;return i;
  }
  private addFood():void{if(this.food.count>=FOOD_CAPACITY)return;const i=this.food.count++;this.food.x[i]=this.food.prevX[i]=this.rng.range(0,this.width);this.food.y[i]=this.food.prevY[i]=this.rng.range(0,this.height);}
  private delta(d:number,size:number):number{return d-Math.round(d/size)*size;}
  step(dt:number):void{
    if(!(dt>0)||!Number.isFinite(dt))return;
    const s=this.store,k=this.scale,w=this.width,h=this.height,n=s.count;
    const cyan=this.speciesProfile('cyan'),amber=this.speciesProfile('amber'),hunter=this.speciesProfile('predator');
    this.clock+=dt;this.events.advance(this.clock);copyPrev(s);
    // Shape stamps can move ecology particles but must not rejuvenate organisms.
    for(let i=0;i<n;i++)this.ax[i]=s.age[i];
    this.interaction.begin(s,dt,w,h);
    for(let i=0;i<n;i++)s.age[i]=this.ax[i];
    this.electionClock+=dt;
    const recruit=this.electionClock>=3;
    if(recruit){this.electionClock%=3;electLeaders(s,this.leader,w,h,k,this.mode==='ecology-boids');}
    this.guards.update(s,w,h,k,dt,recruit);
    for(let i=0;i<n;i++)if(this.leader[i]>0)this.leader[i]=Math.min(1,this.leader[i]+dt/4);
    this.indexLeaders();
    this.supply+=dt*this.params.foodRate;
    const supply=Math.floor(this.supply);this.supply-=supply;for(let i=0;i<Math.min(supply,FOOD_CAPACITY);i++)this.addFood();
    for(let i=0;i<this.food.count;i++){
      this.food.prevX[i]=this.food.x[i];this.food.prevY[i]=this.food.y[i];
      this.food.x[i]=(this.food.x[i]+Math.cos(this.food.y[i]/h*6+this.clock*.015)*1.8*k*dt+w)%w;
      this.food.y[i]=(this.food.y[i]+Math.sin(this.food.x[i]/w*6+this.clock*.01)*1.2*k*dt+h)%h;
    }
    this.hash.rebuild(s.x,s.y,n);this.foodHash.rebuild(this.food.x,this.food.y,this.food.count);
    this.eaten.fill(0);this.foodEaten.fill(0);this.ax.fill(0);this.ay.fill(0);
    this.fought.fill(0);this.guardThreat.fill(-1);
    // At most two guards per prey leader; query threats before any forces or deaths.
    for(let i=0;i<n;i++){
      const p=this.guards.target[i];if(p<0||this.eaten[i])continue;let nearest=-1,best=(55*k)**2;
      this.hash.forEachInRadius(s.x[i],s.y[i],55*k,j=>{
        if(s.type[j]!==2||this.eaten[j])return;
        const lx=this.delta(s.x[j]-s.x[p],w),ly=this.delta(s.y[j]-s.y[p],h);if(lx*lx+ly*ly>(32*k)**2&&this.clock-this.lastHit[p]>2)return;
        const dx=this.delta(s.x[j]-s.x[i],w),dy=this.delta(s.y[j]-s.y[i],h),d2=dx*dx+dy*dy;
        if(d2<best){best=d2;nearest=j;}
      });
      this.guardThreat[i]=nearest;
      if(nearest>=0&&best<(8*k)**2)this.clash(i,nearest);
    }
    for(let i=0;i<n;i++){
      if(this.eaten[i])continue;
      const predator=s.type[i]===2,range=(predator?190:this.leader[i]>0?155:125)*k;
      let fx=0,fy=0,cx=0,cy=0,vx=0,vy=0,weight=0,nearest=-1,best=range*range;
      s.density[i]=0;
      this.hash.forEachInRadius(s.x[i],s.y[i],range,j=>{
        if(i===j||this.eaten[j])return;
        const dx=this.delta(s.x[j]-s.x[i],w),dy=this.delta(s.y[j]-s.y[i],h),d2=dx*dx+dy*dy;
        if(d2>=range*range||d2<.001)return;const d=Math.sqrt(d2),otherPred=s.type[j]===2;
        if(d<60*k)s.density[i]++;
        if(predator&&!otherPred){
          const guarded=this.guards.target[j]>=0,desperate=this.energy[i]<DESPERATE_ENERGY;
          if(guarded&&!desperate&&d<35*k){const repel=55*k*(1-d/(35*k));fx-=dx/d*repel;fy-=dy/d*repel;}
          if((!guarded||desperate)&&d2<best&&s.age[j]>1.5){best=d2;nearest=j;}
        }
        else if(!predator&&otherPred){if(this.guardThreat[i]<0){const flee=65*k*(1-d/range);fx-=dx/d*flee;fy-=dy/d*flee;}}
        else if(predator&&otherPred&&this.mode==='ecology-life'){
          // Solitary hunters repel one another over a much wider range.
          if(d<110*k){const repel=70*k*(1-d/(110*k))**2;fx-=dx/d*repel;fy-=dy/d*repel;}
        }
        else {
          const same=s.type[i]===s.type[j],leading=this.leader[i]>0,targetLeader=same&&this.leader[j]>0;
          const affinity=targetLeader?(leading?.1:5):(predator?.55:1);
          const social=(same?1:.45)*affinity*Math.max(0,1-d/(90*k));
          if(this.mode==='ecology-boids'&&predator&&targetLeader&&!leading){const pull=12*k*Math.max(0,1-d/(110*k));fx+=dx/d*pull;fy+=dy/d*pull;}
          if(leading&&targetLeader&&d<150*k){const repel=45*k*(1-d/(150*k))**2;fx-=dx/d*repel;fy-=dy/d*repel;}
          if(d<14*k){const repel=65*k*(1-d/(14*k));fx-=dx/d*repel;fy-=dy/d*repel;}
          if(this.mode==='ecology-boids'){cx+=dx*social;cy+=dy*social;vx+=s.vx[j]*social;vy+=s.vy[j]*social;weight+=social;}
          else {const f=social*12*k*(this.leader[i]>0?.18:this.guards.target[i]>=0?.04:1);fx+=dx/d*f;fy+=dy/d*f;}
        }
      });
      if(this.mode==='ecology-boids'&&weight>0){const response=this.leader[i]>0?leaderResponse(weight):this.guards.target[i]>=0?.3:predator?.65:1;fx+=(cx/weight*.1+(vx/weight-s.vx[i])*.65)*response;fy+=(cy/weight*.1+(vy/weight-s.vy[i])*.65)*response;}
      if(!predator){
        this.foodHash.forEachInRadius(s.x[i],s.y[i],range,j=>{
          if(this.foodEaten[j])return;const dx=this.delta(this.food.x[j]-s.x[i],w),dy=this.delta(this.food.y[j]-s.y[i],h),d2=dx*dx+dy*dy;
          if(d2<best){best=d2;nearest=j;}
        });
      }
      if(nearest>=0){
        const dx=this.delta((predator?s.x[nearest]:this.food.x[nearest])-s.x[i],w),dy=this.delta((predator?s.y[nearest]:this.food.y[nearest])-s.y[i],h),d=Math.sqrt(best);
        if(d<(predator?8:6)*k){
          if(predator&&!this.eaten[nearest]&&!this.fought[i]){
            if(this.guards.target[nearest]>=0){this.clash(nearest,i);}
            else {// Contact cannot deliver all three hits in consecutive simulation ticks.
            const protectedLeader=this.leader[nearest]>0;
            if(!protectedLeader||this.clock-this.lastHit[nearest]>=1){
              if(protectedLeader){this.lastHit[nearest]=this.clock;this.leaderHits[nearest]++;}
              if(!protectedLeader||this.leaderHits[nearest]>=3){
                this.eaten[nearest]=1;this.energy[i]=Math.min(1.8,this.energy[i]+Math.min(.65,this.energy[nearest]*.6));this.totals.predation++;this.events.emit(0,s.x[nearest],s.y[nearest],w,h);
              }
            }}}
          else if(!predator&&!this.foodEaten[nearest]){this.foodEaten[nearest]=1;this.energy[i]=Math.min(1.8,this.energy[i]+.16);this.totals.foodEaten++;}
        }else if(d>0){const hunger=Math.max(.3,1.6-this.energy[i]);const chase=(predator?42:24)*k*hunger;fx+=dx/d*chase;fy+=dy/d*chase;}
      }
      if(this.mode==='ecology-boids'&&!predator&&this.leader[i]===0&&this.guards.target[i]<0){
        const p=this.nearestLeader(i,220*k);
        if(p>=0){
          const speed=Math.hypot(s.vx[p],s.vy[p]);
          const hx=speed>1?s.vx[p]/speed:Math.cos(s.theta[p]),hy=speed>1?s.vy[p]/speed:Math.sin(s.theta[p]);
          const behind=(28+6*s.glowJit[i])*k,lateral=10*s.glowJit[i]*k;
          const dx=this.delta(s.x[p]-hx*behind-hy*lateral-s.x[i],w),dy=this.delta(s.y[p]-hy*behind+hx*lateral-s.y[i],h),d=Math.hypot(dx,dy);
          if(d>0){const pull=Math.min(30*k,d*.4);fx+=dx/d*pull;fy+=dy/d*pull;}
          fx+=(s.vx[p]-s.vx[i])*.7;fy+=(s.vy[p]-s.vy[i])*.7;
        }
      }
      const escort=this.guards.target[i],threat=this.guardThreat[i];
      if(escort>=0&&!this.eaten[escort]){
        const speed=Math.hypot(s.vx[escort],s.vy[escort]);
        const hx=speed>1?s.vx[escort]/speed:Math.cos(s.theta[escort]),hy=speed>1?s.vy[escort]/speed:Math.sin(s.theta[escort]);
        const lateral=this.guards.side[i]*16*k;
        const tx=threat>=0&&!this.eaten[threat]?s.x[threat]:s.x[escort]+hx*32*k-hy*lateral;
        const ty=threat>=0&&!this.eaten[threat]?s.y[threat]:s.y[escort]+hy*32*k+hx*lateral;
        const dx=this.delta(tx-s.x[i],w),dy=this.delta(ty-s.y[i],h),d=Math.hypot(dx,dy);
        if(d>0){const pull=threat>=0?75*k:Math.min(55*k,d*1.2);fx+=dx/d*pull;fy+=dy/d*pull;}
        if(threat<0){fx+=(s.vx[escort]-s.vx[i]);fy+=(s.vy[escort]-s.vy[i]);}
      }
      s.theta[i]+=this.rng.normal()*Math.sqrt(.035*dt);
      const personal=this.leader[i]>0?14:predator&&this.mode==='ecology-life'?12:8;
      fx+=Math.cos(s.theta[i])*personal*k;fy+=Math.sin(s.theta[i])*personal*k;
      const force=Math.hypot(fx,fy),limit=140*k;
      this.ax[i]=force>limit?fx/force*limit:fx;this.ay[i]=force>limit?fy/force*limit:fy;
    }
    this.interaction.force(s,this.ax,this.ay,w,h);
    // Shared semi-implicit integrator, then individual energy-dependent speed caps.
    integrate(s,this.ax,this.ay,{dt,gamma:.35,maxSpeed:Math.max(this.params.maxSpeed*1.3,cyan.Speed,amber.Speed,hunter.Speed)*k});
    for(let i=0;i<n;i++){
      const predator=s.type[i]===2;
      this.energy[i]-=dt*(predator?.015:.008);
      const cap=(s.type[i]===0?cyan:s.type[i]===4?amber:hunter).Speed*k*(.82+.18*Math.min(1,this.energy[i]))*(1+.06*s.glowJit[i]);
      const speed=Math.hypot(s.vx[i],s.vy[i]);const roleCap=cap*(this.guards.target[i]>=0?1.1:1);if(speed>roleCap){s.vx[i]*=roleCap/speed;s.vy[i]*=roleCap/speed;}
      s.x[i]=s.prevX[i]+s.vx[i]*dt;s.y[i]=s.prevY[i]+s.vy[i]*dt;
      s.age[i]+=dt;s.lifeFrac[i]=Math.max(0,Math.min(1,s.age[i]/2,(s.lifespan[i]-s.age[i])/4,this.energy[i]/.15));
    }
    applyBoundary(s,w,h,'wrap');
    // Remove only after all neighborhood queries; compact every parallel array.
    for(let i=s.count-1;i>=0;i--){
      const old=s.age[i]>=s.lifespan[i],starved=this.energy[i]<=.02;
      if(this.eaten[i]||old||starved){
        if(!this.eaten[i]){if(old)this.totals.oldAge++;else this.totals.starvation++;}
        const last=--s.count;this.guards.remove(i,last);this.events.removeParticle(i,last);for(const field of FIELDS)s[field][i]=s[field][last];this.energy[i]=this.energy[last];this.lastBirth[i]=this.lastBirth[last];this.leader[i]=this.leader[last];this.leaderHits[i]=this.leaderHits[last];this.lastHit[i]=this.lastHit[last];
      }
    }
    for(let i=this.food.count-1;i>=0;i--)if(this.foodEaten[i]){const last=--this.food.count;for(const field of ['x','y','prevX','prevY'] as const)this.food[field][i]=this.food[field][last];}
    this.indexLeaders();
    const adults=s.count;
    for(let i=0;i<adults&&s.count<this.params.maxPopulation;i++){
      const solitary=s.type[i]===2&&this.mode==='ecology-life';
      const pack=s.type[i]===2&&!solitary;
      const school=this.mode==='ecology-boids'&&s.type[i]!==2;
      const near=school&&this.nearestLeader(i,110*k,true)>=0;
      const profile=s.type[i]===0?cyan:s.type[i]===4?amber:hunter;
      const threshold=profile.customBirthEnergy?Math.min(1.79,profile.BirthEnergy+(school&&!near?.15:0)):solitary?1.75:pack?1.65:school?(near?1.5:1.65):1.6;
      const maturity=profile.customMaturity?profile.Maturity*(school&&!near?1.5:1):solitary?45:pack?25:school&&!near?18:12;
      const interval=profile.customInterval?profile.Interval*(school&&!near?3:1)*(1+.08*Math.max(-2,Math.min(2,s.glowJit[i]))):solitary?75:pack?30:school?(near?8:24):0;
      const elapsed=Number.isFinite(this.lastBirth[i])?this.clock-this.lastBirth[i]:(solitary||pack?this.clock:Infinity);
      if(this.energy[i]<threshold||s.age[i]<maturity||elapsed<interval)continue;
      const energy=budEnergy(this.energy[i]),angle=this.rng.range(0,Math.PI*2);
      if(solitary)energy.parent=this.energy[i]*.45;
      const child=this.spawn(s.type[i],s.x[i]+Math.cos(angle)*10*k,s.y[i]+Math.sin(angle)*10*k,energy.child);
      this.energy[i]=energy.parent;s.vx[child]=s.vx[i]*.8;s.vy[child]=s.vy[i]*.8;this.totals.births++;this.lastBirth[i]=this.clock;this.events.emit(1,s.x[child],s.y[child],w,h,child);
    }
    this.events.follow(s.x,s.y);
    this.rescueClock+=dt;
    if(this.rescueClock>=20){
      this.rescueClock%=20;
      if(this.params.rescueEnabled){const stats=this.statistics;for(const [type,count,floor] of [[0,stats.cyan,8],[4,stats.amber,4],[2,stats.predators,2]])if(count<floor&&s.count<this.params.maxPopulation){this.spawn(type,this.rng.next()<.5?0:w-.01,this.rng.range(0,h),.85);this.totals.immigrants++;}}
    }
  }
  serialize():PresetData{return {version:1,mode:this.mode,seed:this.seed,params:{...this.params},visual:{theme:'deep-ocean'}};}
  deserialize(preset:PresetData):void{this.resetDefaults();this.updateParams(preset.params);this.randomize(preset.seed);}
  setWorldSize(width:number,height:number):void{
    if(!(width>0&&height>0))return;
    const sx=width/this.width,sy=height/this.height;
    for(let i=0;i<this.store.count;i++){this.store.x[i]*=sx;this.store.prevX[i]*=sx;this.store.y[i]*=sy;this.store.prevY[i]*=sy;}
    for(let i=0;i<this.food.count;i++){this.food.x[i]*=sx;this.food.prevX[i]*=sx;this.food.y[i]*=sy;this.food.prevY[i]*=sy;}
    this.events.resize(sx,sy);
    this.width=width;this.height=height;this.rebuild();
  }
}
