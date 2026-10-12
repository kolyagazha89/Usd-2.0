import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SiteSettingsShape = {
  branding:{siteName:string;logoUrl:string|null;splashLogoUrl:string|null;mobileLogoUrl:string|null;faviconUrl:string|null;organizationName:string};
  homepage:{blocks:Array<{id:string;enabled:boolean;title?:string|null}>;heroTitle:string;heroSubtitle:string;showNextStage:boolean;showLatestResults:boolean;showRecords:boolean;showParticipants:boolean;showLiveStream:boolean;showLiveResults:boolean};
  stream:{enabled:boolean;provider:'YOUTUBE'|'VK'|'RUTUBE'|'CUSTOM';url:string;embedUrl:string;title:string;autoShowOnStageDay:boolean;showChat:boolean};
  liveResults:{enabled:boolean;stageId:string|null;refreshSeconds:number;showOnlyPublished:boolean};
  navigation:{items:Array<{id:string;label:string;path:string;enabled:boolean;sortOrder:number}>};
  contacts:Record<string,string>;social:Record<string,string>;seo:Record<string,string>;legal:Record<string,string>;footer:Record<string,string>;registration:Record<string,unknown>;catalogs:Record<string,unknown>;partners:Array<Record<string,unknown>>;updatedAt?:string;
};

const DEFAULTS:SiteSettingsShape={
  branding:{siteName:'USD',logoUrl:null,splashLogoUrl:null,mobileLogoUrl:null,faviconUrl:null,organizationName:'USD Russia'},
  homepage:{blocks:[
    {id:'hero',enabled:true,title:null},{id:'next-stage',enabled:true,title:'Ближайший этап'},
    {id:'live-stream',enabled:true,title:'Прямая трансляция'},{id:'live-results',enabled:true,title:'Результаты LIVE'},
    {id:'latest-results',enabled:true,title:'Последние результаты'},{id:'records',enabled:true,title:'Рекорды'},
    {id:'participants',enabled:true,title:'Участники'}],
    heroTitle:'United Sound Derby',heroSubtitle:'Официальный чемпионат по автозвуку',
    showNextStage:true,showLatestResults:true,showRecords:true,showParticipants:true,showLiveStream:true,showLiveResults:true},
  stream:{enabled:false,provider:'YOUTUBE',url:'',embedUrl:'',title:'USD LIVE',autoShowOnStageDay:true,showChat:false},
  liveResults:{enabled:true,stageId:null,refreshSeconds:5,showOnlyPublished:true},
  navigation:{items:[]},contacts:{},social:{},seo:{},legal:{},footer:{},
  registration:{enabled:true,price:2000,additionalClassPrice:2000},
  catalogs:{teams:[],vibrationBrands:['STP','ComfortMat','Audior','Global'],componentBrands:[],componentModels:[]},partners:[],
};

@Injectable()
export class SiteSettingsService{
  constructor(private readonly prisma:PrismaService){}
  private merge<T extends Record<string,any>>(base:T,value:unknown):T{
    if(!value||typeof value!=='object'||Array.isArray(value)) return base;
    return {...base,...value} as T;
  }
  private shape(row:any):SiteSettingsShape{
    return {
      branding:this.merge(DEFAULTS.branding,row?.branding),homepage:this.merge(DEFAULTS.homepage,row?.homepage),
      stream:this.merge(DEFAULTS.stream,row?.stream),liveResults:this.merge(DEFAULTS.liveResults,row?.liveResults),
      navigation:this.merge(DEFAULTS.navigation,row?.navigation),
      contacts:row?.contacts??DEFAULTS.contacts,social:row?.social??DEFAULTS.social,seo:row?.seo??DEFAULTS.seo,
      legal:row?.legal??DEFAULTS.legal,footer:row?.footer??DEFAULTS.footer,registration:row?.registration??DEFAULTS.registration,
      catalogs:this.merge(DEFAULTS.catalogs,row?.catalogs),partners:Array.isArray(row?.partners)?row.partners:DEFAULTS.partners,
      updatedAt:row?.updatedAt?.toISOString?.(),
    };
  }
  async getAdmin(){return {success:true,settings:this.shape(await this.prisma.siteSettings.findUnique({where:{id:'default'}}))};}
  async getPublic(){const s=this.shape(await this.prisma.siteSettings.findUnique({where:{id:'default'}}));return {success:true,settings:{branding:s.branding,homepage:s.homepage,stream:s.stream,liveResults:s.liveResults,navigation:s.navigation,contacts:s.contacts,social:s.social,seo:s.seo,footer:s.footer,registration:s.registration,partners:s.partners,legal:{ipName:s.legal.ipName??'',inn:s.legal.inn??'',ogrnip:s.legal.ogrnip??'',copyrightHolder:s.legal.copyrightHolder??'',privacyUrl:s.legal.privacyUrl??'',consentUrl:s.legal.consentUrl??'',termsUrl:s.legal.termsUrl??'',rulesUrl:s.legal.rulesUrl??''}}};}
  async update(input:Partial<SiteSettingsShape>,userId:string){
    const current=this.shape(await this.prisma.siteSettings.findUnique({where:{id:'default'}}));
    const next={
      branding:this.merge(current.branding,input.branding),homepage:this.merge(current.homepage,input.homepage),
      stream:this.merge(current.stream,input.stream),liveResults:this.merge(current.liveResults,input.liveResults),
      navigation:this.merge(current.navigation,input.navigation),contacts:input.contacts??current.contacts,
      social:input.social??current.social,seo:input.seo??current.seo,legal:input.legal??current.legal,
      footer:input.footer??current.footer,registration:input.registration??current.registration,
      catalogs:this.merge(current.catalogs,input.catalogs),partners:input.partners??current.partners,
    };
    const row=await this.prisma.siteSettings.upsert({where:{id:'default'},create:{id:'default',...(next as any)},update:{...(next as any)}});
    await this.prisma.auditLog.create({data:{userId,action:'SITE_SETTINGS_UPDATED',entity:'SiteSettings',entityId:'default',metadata:{sections:Object.keys(input)}}});
    return {success:true,settings:this.shape(row)};
  }
}
