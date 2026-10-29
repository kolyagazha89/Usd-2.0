/**
 * Distribute installed speakers/subwoofers among amplifier rows in the same
 * direction. Every installed unit is linked at most once, even when several
 * amplifiers power the same direction. The backend accepts component indexes
 * in a new version and resolves them to immutable component IDs.
 *
 * This is a default allocation, not a claim about physical wiring topology.
 */
export type AmplifierLink={componentId:string;quantity:number};
export type DirectionalItem={direction?:unknown;quantity?:unknown};

export function allocateAmplifierLinks(
 audioComponents:readonly DirectionalItem[],
 amplifiers:readonly DirectionalItem[],
):AmplifierLink[][]{
 const links:AmplifierLink[][]=amplifiers.map(()=>[]);
 for(const [componentIndex,component] of audioComponents.entries()){
  const quantity=Number(component.quantity);
  if(!Number.isSafeInteger(quantity)||quantity<1)continue;
  const eligible=amplifiers.flatMap((amplifier,index)=>amplifier.direction===component.direction?[index]:[]);
  if(!eligible.length)continue;
  const perAmplifier=Math.floor(quantity/eligible.length);
  const remainder=quantity%eligible.length;
  eligible.forEach((amplifierIndex,rank)=>{
   const allocated=perAmplifier+(rank<remainder?1:0);
   if(allocated>0)links[amplifierIndex].push({componentId:String(componentIndex),quantity:allocated});
  });
 }
 return links;
}
