export type PartnerImageLayout = {
 mode:'LOGO'|'BANNER'; aspectWidth?:number; aspectHeight?:number;
 scale:number; positionX:number; positionY:number;
};
export const DEFAULT_PARTNER_IMAGE_LAYOUT:PartnerImageLayout={
 mode:'LOGO',scale:100,positionX:50,positionY:50,
};

/** CMS data may be historical or malformed. Never put arbitrary values in CSS. */
export function normalizePartnerImageLayout(raw:unknown):PartnerImageLayout{
 const fallback=()=>({...DEFAULT_PARTNER_IMAGE_LAYOUT});
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return fallback();
 const value=raw as Record<string,unknown>,mode=value.mode;
 if(mode!=='LOGO'&&mode!=='BANNER')return fallback();
 const bounds={aspectWidth:[0.1,100],aspectHeight:[0.1,100],scale:[50,300],positionX:[0,100],positionY:[0,100]} as const;
 if(Object.keys(value).some(key=>key!=='mode'&&!Object.prototype.hasOwnProperty.call(bounds,key)))return fallback();
 const layout:PartnerImageLayout={...DEFAULT_PARTNER_IMAGE_LAYOUT,mode};
 for(const key of Object.keys(bounds) as (keyof typeof bounds)[]){
  const number=value[key];
  if(number===undefined)continue;
  const [min,max]=bounds[key];
  if(typeof number!=='number'||!Number.isFinite(number)||number<min||number>max)return fallback();
  layout[key]=number;
 }
 if((layout.aspectWidth===undefined)!==(layout.aspectHeight===undefined))return fallback();
 if(layout.aspectWidth!==undefined&&layout.aspectHeight!==undefined){
  const ratio=layout.aspectWidth/layout.aspectHeight;
  if(ratio<0.5||ratio>5)return fallback();
 }
 return layout;
}
