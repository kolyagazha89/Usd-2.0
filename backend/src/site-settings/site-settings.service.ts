import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SiteSettingsShape = {
  branding:{siteName:string;logoUrl:string|null;splashLogoUrl:string|null;mobileLogoUrl:string|null;faviconUrl:string|null;organizationName:string};
  homepage:{blocks:Array<{id:string;enabled:boolean;title?:string|null}>;heroTitle:string;heroSubtitle:string;showNextStage:boolean;showLatestResults:boolean;showRecords:boolean;showParticipants:boolean;showLiveStream:boolean;showLiveResults:boolean};
  stream:{enabled:boolean;provider:'YOUTUBE'|'VK'|'RUTUBE'|'CUSTOM';url:string;embedUrl:string;title:string;autoShowOnStageDay:boolean;showChat:boolean};
  liveResults:{enabled:boolean;stageId:string|null;refreshSeconds:number;showOnlyPublished:boolean};
  navigation:{items:Array<{id:string;label:string;path:string;enabled:boolean;sortOrder:number}>};
  contacts:Record<string,string>;social:Record<string,string>;seo:Record<string,string>;legal:Record<string,string>;footer:Record<string,string>;registration:Record<string,unknown>;catalogs:Record<string,unknown>;partners:Array<Record<string,unknown>>;news:Array<Record<string,unknown>>;updatedAt?:string;
};

const DEFAULTS:SiteSettingsShape={
  branding:{siteName:'USD',logoUrl:null,splashLogoUrl:null,mobileLogoUrl:null,faviconUrl:null,organizationName:'USD Russia'},
  homepage:{blocks:[
    {id:'hero',enabled:true,title:null},{id:'next-stage',enabled:true,title:'Ближайший этап'},
    {id:'live-stream',enabled:true,title:'Прямая трансляция'},{id:'live-results',enabled:true,title:'Результаты LIVE'},
    {id:'latest-results',enabled:true,title:'Последние результаты'},{id:'records',enabled:true,title:'Рекорды'},
    {id:'participants',enabled:false,title:'Участники'},{id:'partners',enabled:true,title:'Партнёры чемпионата'},{id:'news',enabled:true,title:'Новости USD'}],
    heroTitle:'United Sound Derby',heroSubtitle:'Официальный чемпионат по автозвуку',
    showNextStage:true,showLatestResults:true,showRecords:true,showParticipants:true,showLiveStream:true,showLiveResults:true},
  stream:{enabled:false,provider:'YOUTUBE',url:'',embedUrl:'',title:'USD LIVE',autoShowOnStageDay:true,showChat:false},
  liveResults:{enabled:true,stageId:null,refreshSeconds:5,showOnlyPublished:true},
  navigation:{items:[]},contacts:{},social:{},seo:{},legal:{},footer:{},
  registration:{enabled:true,price:2000,additionalClassPrice:2000},
  catalogs:{teams:[],vibrationBrands:['STP','ComfortMat','Audior','Global'],componentBrands:[],componentModels:[]},partners:[],news:[],
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
      catalogs:this.merge(DEFAULTS.catalogs,row?.catalogs),partners:Array.isArray(row?.partners)?row.partners:DEFAULTS.partners,news:Array.isArray(row?.news)?row.news:DEFAULTS.news,
      updatedAt:row?.updatedAt?.toISOString?.(),
    };
  }
  async getPublishedRulesSnapshot() {
    const settings = this.shape(await this.prisma.siteSettings.findUnique({ where: { id: 'default' } }));
    const registration = settings.registration as Record<string, any>;
    const published = registration.rulesDocument?.published;
    if (!published || !Array.isArray(published.blocks) || !published.blocks.length) return null;
    return {
      revisionId: String(published.id ?? ''),
      fileName: String(published.fileName ?? 'Регламент USD'),
      url: String(published.url ?? ''),
      publishedAt: String(published.publishedAt ?? published.createdAt ?? ''),
      capturedAt: new Date().toISOString(),
      blocks: published.blocks,
    };
  }
  async getAdmin(){return {success:true,settings:this.shape(await this.prisma.siteSettings.findUnique({where:{id:'default'}}))};}
  async getPublic(){const s=this.shape(await this.prisma.siteSettings.findUnique({where:{id:'default'}}));return {success:true,settings:{branding:s.branding,homepage:s.homepage,stream:s.stream,liveResults:s.liveResults,navigation:s.navigation,contacts:s.contacts,social:s.social,seo:s.seo,footer:s.footer,registration:{...s.registration,...(s.registration.rulesDocument?{rulesDocument:{published:(s.registration.rulesDocument as any).published??null}}:{})},partners:s.partners.filter((partner:any)=>partner.isActive!==false),news:s.news.filter((item:any)=>item.isPublished!==false),legal:{legalApproved:s.legal.legalApproved===true,legalVersion:s.legal.legalApproved===true?(s.legal.legalVersion??null):null,legalApprovedAt:s.legal.legalApproved===true?(s.legal.legalApprovedAt??null):null,ipName:s.legal.ipName??'',inn:s.legal.inn??'',ogrnip:s.legal.ogrnip??'',copyrightHolder:s.legal.copyrightHolder??'',privacyUrl:s.legal.privacyUrl??'',consentUrl:s.legal.consentUrl??'',termsUrl:s.legal.termsUrl??'',rulesUrl:s.legal.rulesUrl??'',privacyText:s.legal.legalApproved===true?(s.legal.privacyText??''):'',consentText:s.legal.legalApproved===true?(s.legal.consentText??''):'',termsText:s.legal.legalApproved===true?(s.legal.termsText??''):''}}};}
  private mergeRegistration(currentValue: unknown, incomingValue: unknown): Record<string, any> {
    const current = currentValue && typeof currentValue === 'object' && !Array.isArray(currentValue)
      ? currentValue as Record<string, any> : DEFAULTS.registration;
    const incoming = incomingValue && typeof incomingValue === 'object' && !Array.isArray(incomingValue)
      ? incomingValue as Record<string, any> : {};
    const currentDocument = current.rulesDocument && typeof current.rulesDocument === 'object'
      ? current.rulesDocument as Record<string, any> : {};
    const incomingDocument = incoming.rulesDocument && typeof incoming.rulesDocument === 'object'
      ? incoming.rulesDocument as Record<string, any> : {};
    const versions: any[] = [];
    const seen = new Set<string>();
    const addVersion = (version: any) => {
      if (!version || typeof version !== 'object' || !version.id) return;
      const id = String(version.id);
      if (seen.has(id)) return;
      seen.add(id);
      versions.push(version);
    };
    for (const version of Array.isArray(currentDocument.publishedVersions) ? currentDocument.publishedVersions : []) addVersion(version);
    const currentPublished = currentDocument.published ?? null;
    const currentPublishedId = String(currentPublished?.id ?? '');
    for (const version of Array.isArray(incomingDocument.publishedVersions) ? incomingDocument.publishedVersions : []) {
      if (String(version?.id ?? '') !== currentPublishedId) addVersion(version);
    }
    const incomingPublished = incomingDocument.published ?? currentPublished;
    let published = incomingPublished;
    if (currentPublished && incomingPublished?.id === currentPublished.id) published = currentPublished;
    else if (currentPublished) addVersion(currentPublished);
    const drafts = Array.isArray(incomingDocument.drafts)
      ? incomingDocument.drafts
      : Array.isArray(currentDocument.drafts) ? currentDocument.drafts : [];
    return {
      ...current,
      ...incoming,
      rulesDocument: { ...currentDocument, ...incomingDocument, published, publishedVersions: versions, drafts },
    };
  }
  async update(input:Partial<SiteSettingsShape>,userId:string){
    const current=this.shape(await this.prisma.siteSettings.findUnique({where:{id:'default'}}));
    const currentLegal = current.legal as Record<string, any>;
    const incomingLegal = input.legal && typeof input.legal === 'object'
      ? input.legal as Record<string, any>
      : null;
    let legal: Record<string, any> = currentLegal;
    if (incomingLegal) {
      const legalContentKeys = ['ipName', 'inn', 'ogrnip', 'copyrightHolder', 'privacyUrl', 'consentUrl', 'termsUrl', 'rulesUrl', 'privacyText', 'consentText', 'termsText'];
      const contentChanged = legalContentKeys.some((key) =>
        Object.prototype.hasOwnProperty.call(incomingLegal, key) && incomingLegal[key] !== currentLegal[key],
      );
      legal = { ...currentLegal, ...incomingLegal };
      if (contentChanged) {
        // Any edit invalidates the previous approval. The organizer must save
        // the final text first and explicitly approve it in a separate save.
        legal = { ...legal, legalApproved: false, legalApprovedAt: null, legalApprovedBy: null };
      } else if (incomingLegal.legalApproved === true && currentLegal.legalApproved !== true) {
        const contactEmail = (input.contacts as Record<string, any> | undefined)?.email
          ?? (current.contacts as Record<string, any>).email
          ?? (input.footer as Record<string, any> | undefined)?.email
          ?? (current.footer as Record<string, any>).email;
        const missing = [
          !String(legal.ipName ?? '').trim() && 'наименование/ФИО оператора',
          !String(legal.privacyText ?? '').trim() && 'политика обработки данных',
          !String(legal.consentText ?? '').trim() && 'согласие на обработку данных',
          !String(legal.termsText ?? '').trim() && 'пользовательское соглашение',
          !String(contactEmail ?? '').trim() && 'контактный email оператора',
        ].filter(Boolean);
        if (missing.length) {
          throw new BadRequestException('Нельзя утвердить юридические документы: заполните ' + missing.join(', ') + '.');
        }
        legal = {
          ...legal,
          legalApproved: true,
          legalApprovedAt: new Date().toISOString(),
          legalApprovedBy: userId,
          legalVersion: String(Number(currentLegal.legalVersion ?? 0) + 1),
        };
      } else if (incomingLegal.legalApproved === false) {
        legal = { ...legal, legalApproved: false, legalApprovedAt: null, legalApprovedBy: null };
      }
    }
    const next={
      branding:this.merge(current.branding,input.branding),homepage:this.merge(current.homepage,input.homepage),
      stream:this.merge(current.stream,input.stream),liveResults:this.merge(current.liveResults,input.liveResults),
      navigation:this.merge(current.navigation,input.navigation),contacts:input.contacts??current.contacts,
      social:input.social??current.social,seo:input.seo??current.seo,legal:input.legal??current.legal,
      footer:input.footer??current.footer,legal,registration:input.registration ? this.mergeRegistration(current.registration,input.registration) : current.registration,
      catalogs:this.merge(current.catalogs,input.catalogs),partners:input.partners??current.partners,news:input.news??current.news,
    };
    const row=await this.prisma.siteSettings.upsert({where:{id:'default'},create:{id:'default',...(next as any)},update:{...(next as any)}});
    await this.prisma.auditLog.create({data:{userId,action:'SITE_SETTINGS_UPDATED',entity:'SiteSettings',entityId:'default',metadata:{sections:Object.keys(input)}}});
    return {success:true,settings:this.shape(row)};
  }
}
