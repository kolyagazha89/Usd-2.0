/** Keep a first-time participant on the stage registration page.
 * The separate official-protocol consent is saved before the registration POST.
 * No checkbox is preselected and no consent is inferred from generic terms.
 */
export type StageProtocolConsentState = {
 accepted:boolean;
 legalReady:boolean;
 version:string|null;
 requiresRepresentative?:boolean;
};
export type StageProtocolConsentPlan = {needsSave:boolean;version:string|null;error:string|null};

export function planRegistrationProtocolConsent(
 state:StageProtocolConsentState,checked:boolean,
):StageProtocolConsentPlan {
 const version=typeof state.version==='string'?state.version.trim():'';
 // The current published document, not a historical accepted flag, is authoritative.
 if(!state.legalReady||!version)
  return {needsSave:false,version:null,error:'Регистрация временно недоступна: отдельный документ о публикации официальных протоколов не утверждён организатором'};
 if(state.requiresRepresentative)
  return {needsSave:false,version,error:'Для несовершеннолетнего согласие оформляет законный представитель через организатора на площадке.'};
 if(state.accepted)return {needsSave:false,version,error:null};
 if(!checked)
  return {needsSave:false,version,error:'Отдельно подтвердите согласие на публикацию ФИО и результата соревнования'};
 return {needsSave:true,version,error:null};
}
