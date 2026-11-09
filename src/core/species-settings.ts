export const SPECIES = ['cyan','amber','predator'] as const;
export type Species = typeof SPECIES[number];
export type SpeciesField = 'Life'|'Speed'|'Interval'|'Maturity'|'BirthEnergy';
export type SpeciesKey = `${Species}${SpeciesField}`;
export type SpeciesSettings = Record<SpeciesKey,number>;
export const SPECIES_LIMITS = {Life:[30,1200],Speed:[5,160],Interval:[0,300],Maturity:[2,180],BirthEnergy:[.6,1.79]} as const;
export const SPECIES_DEFAULTS = Object.fromEntries(SPECIES.flatMap(s=>Object.keys(SPECIES_LIMITS).map(f=>[s+f,-1]))) as SpeciesSettings;
export function speciesOf(type:number):Species{return type===0?'cyan':type===4?'amber':'predator';}
export function sanitizeSpecies(current:SpeciesSettings,patch:Partial<SpeciesSettings>):SpeciesSettings{
 const next={...current};
 for(const species of SPECIES)for(const field of Object.keys(SPECIES_LIMITS) as SpeciesField[]){
  const key=`${species}${field}` as SpeciesKey,v=patch[key];
  if(typeof v!=='number'||!Number.isFinite(v))continue;
  const [min,max]=SPECIES_LIMITS[field];next[key]=v===-1?-1:Math.min(max,Math.max(min,v));
 }
 return next;
}
