import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type SiteSettingsShape = {
  branding:{siteName:string;logoUrl:string|null;splashLogoUrl:string|null;mobileLogoUrl:string|null;faviconUrl:string|null;organizationName:string;placeholders?:{participant:string|null;car:string|null;stage:string|null}};
  homepage:{blocks:Array<{id:string;enabled:boolean;title?:string|null}>;heroTitle:string;heroSubtitle:string;heroKicker?:string;heroStageLabel?:string;heroStageTagline?:string;heroPulseHint?:string;heroWatchLabel?:string;heroPrimaryButtonLabel?:string;heroCalendarButtonLabel?:string;heroTopics?:string[];copy?:Record<string,string>;communityTitle?:string;communitySubtitle?:string;communityButtonLabel?:string;documentsDescription?:string;documentsButtonLabel?:string;teamsEmptyTitle?:string;teamsEmptyDescription?:string;valuesTitle?:string;valuesSubtitle?:string;valuesCards?:Array<{id:string;heading:string;subtitle:string;description:string;path:string;enabled:boolean}>;showNextStage:boolean;showLatestResults:boolean;showRecords:boolean;showParticipants:boolean;showLiveStream:boolean;showLiveResults:boolean};
  stream:{enabled:boolean;provider:'YOUTUBE'|'VK'|'RUTUBE'|'CUSTOM';url:string;embedUrl:string;title:string;autoShowOnStageDay:boolean;showChat:boolean};
  liveResults:{enabled:boolean;stageId:string|null;refreshSeconds:number;showOnlyPublished:boolean};
  navigation:{items:Array<{id:string;label:string;path:string;enabled:boolean;sortOrder:number}>};
  contacts:Record<string,string>;social:Record<string,string>;seo:Record<string,string>;legal:Record<string,any>;footer:Record<string,string>;registration:Record<string,unknown>;catalogs:Record<string,unknown>;partners:Array<Record<string,unknown>>;news:Array<Record<string,unknown>>;updatedAt?:string;
};

const DEFAULTS:SiteSettingsShape={
  branding:{siteName:'USD',logoUrl:null,splashLogoUrl:null,mobileLogoUrl:null,faviconUrl:null,organizationName:'USD Russia',placeholders:{participant:null,car:null,stage:null}},
  homepage:{blocks:[
    {id:'hero',enabled:true,title:null},{id:'next-stage',enabled:true,title:'Ближайший этап'},{id:'values',enabled:true,title:'Почему USD'},
    {id:'live-stream',enabled:true,title:'Прямая трансляция'},{id:'live-results',enabled:true,title:'Результаты LIVE'},
    {id:'latest-results',enabled:true,title:'Последние результаты'},{id:'records',enabled:true,title:'Рекорды'},{id:'teams',enabled:true,title:'Сообщество USD'},
    {id:'participants',enabled:false,title:'Участники'},{id:'partners',enabled:true,title:'Партнёры чемпионата'},{id:'news',enabled:true,title:'Новости USD'},{id:'community',enabled:true,title:'Сообщество'},{id:'documents',enabled:true,title:'Документы'}],
    heroTitle:'USD',heroSubtitle:'Официальный чемпионат по автозвуку',
    heroKicker:'USD / ЧЕМПИОНАТ ПО АВТОЗВУКУ',
    heroStageLabel:'ULTIMATE SOUND DESTRUCTION',heroStageTagline:'СИЛА ЗВУКА',heroPulseHint:'Нажми на эмблему — запусти импульс',
    heroWatchLabel:'Что такое USD',heroPrimaryButtonLabel:'Ближайший этап',heroCalendarButtonLabel:'Календарь этапов',
    heroTopics:['СОРЕВНОВАНИЯ','РЕКОРДЫ','СООБЩЕСТВО','РАЗВИТИЕ','АВТОЗВУК'],
    communityTitle:'СТАНЬ ЧАСТЬЮ\nСООБЩЕСТВА USD',
    communitySubtitle:'УЧАСТВУЙ. РАЗВИВАЙСЯ. УСТАНАВЛИВАЙ РЕКОРДЫ.',
    communityButtonLabel:'Присоединиться',
    documentsDescription:'Правила, регламенты и технические требования.',
    documentsButtonLabel:'Перейти к документам',
    teamsEmptyTitle:'Твоя команда. Твой звук.',teamsEmptyDescription:'Публичные команды участников появятся здесь.',
     valuesTitle:'ПОЧЕМУ USD',valuesSubtitle:'БОЛЬШЕ, ЧЕМ СОРЕВНОВАНИЯ — ЭТО КУЛЬТУРА',
    valuesCards:[
      {id:'competitions',heading:'ОФИЦИАЛЬНЫЕ',subtitle:'СОРЕВНОВАНИЯ',description:'Продуманный путь до старта',path:'/stages',enabled:true},
      {id:'records',heading:'НОВЫЕ',subtitle:'РЕКОРДЫ',description:'Измерения и личная история',path:'/records',enabled:true},
      {id:'people',heading:'СИЛЬНОЕ',subtitle:'СООБЩЕСТВО',description:'Участники из разных городов',path:'/participants',enabled:true},
      {id:'culture',heading:'РАЗВИТИЕ',subtitle:'АВТОЗВУК-КУЛЬТУРЫ',description:'События, знания, поддержка',path:'/news',enabled:true},
      {id:'organization',heading:'ПРЕМИАЛЬНАЯ',subtitle:'ОРГАНИЗАЦИЯ',description:'Внимание к каждой детали',path:'/about',enabled:true},
    ],
    showNextStage:true,showLatestResults:true,showRecords:true,showParticipants:true,showLiveStream:true,showLiveResults:true},
  stream:{enabled:false,provider:'YOUTUBE',url:'',embedUrl:'',title:'USD LIVE',autoShowOnStageDay:true,showChat:false},
  liveResults:{enabled:true,stageId:null,refreshSeconds:5,showOnlyPublished:true},
  navigation:{items:[]},contacts:{},social:{},seo:{},legal:{},footer:{},
  registration:{enabled:true,price:2000,additionalClassPrice:2000,emailTemplates:[
    {id:'stage-registration-open',name:'Открытие регистрации',trigger:'STAGE_REGISTRATION_OPEN',enabled:true,subject:'Открыта регистрация: {{heading}} — USD',body:'{{intro}}\n\n{{details}}',footer:'Это информационное сообщение USD о соревнованиях. Вы получили его в связи с настройками уведомлений.',buttonLabel:'Открыть USD'},
    {id:'registration-confirmed',name:'Подтверждение регистрации',trigger:'REGISTRATION_CONFIRMED',enabled:true,subject:'Заявка подтверждена: {{stageName}}',body:'{{intro}}\n\n{{details}}',footer:'Это сервисное сообщение USD. Ответ почтового провайдера подтверждает принятие запроса, но не гарантирует попадание во входящие.',buttonLabel:'Открыть USD'},
    {id:'stage-reminder-3d',name:'Напоминание за 3 дня',trigger:'STAGE_REMINDER_3D',enabled:true,subject:'Напоминание: {{heading}} — USD',body:'{{intro}}\n\n{{details}}',footer:'Это сервисное сообщение USD для зарегистрированных участников.',buttonLabel:'Открыть USD'},
    {id:'stage-reminder-1d',name:'Напоминание за 1 день',trigger:'STAGE_REMINDER_1D',enabled:true,subject:'Напоминание: {{heading}} — USD',body:'{{intro}}\n\n{{details}}',footer:'Это сервисное сообщение USD для зарегистрированных участников.',buttonLabel:'Открыть USD'},
    {id:'auth-email-verification',name:'Подтверждение email аккаунта',trigger:'AUTH_EMAIL_VERIFICATION',enabled:true,subject:'Подтверждение email — USD',body:'{{intro}}',footer:'Если вы не регистрировались в USD, не переходите по ссылке. Она содержит персональный токен и не должна передаваться другим людям.',buttonLabel:'Подтвердить email'},
    {id:'auth-password-reset',name:'Восстановление пароля',trigger:'AUTH_PASSWORD_RESET',enabled:true,subject:'Восстановление пароля — USD',body:'{{intro}}',footer:'Если вы не запрашивали восстановление пароля, проигнорируйте письмо. Никому не сообщайте ссылку и токен.',buttonLabel:'Восстановить пароль'},
    {id:'auth-email-change',name:'Подтверждение нового email',trigger:'AUTH_EMAIL_CHANGE',enabled:true,subject:'Подтверждение нового email — USD',body:'{{intro}}',footer:'Ссылка действует 30 минут. Если вы не меняли email, не переходите по ссылке и обратитесь к администратору аккаунта.',buttonLabel:'Подтвердить новый email'}
  ]},
  catalogs:{teams:[],vibrationBrands:['STP','ComfortMat','Audior','Global'],componentBrands:[],componentModels:[],batteryTypes:[
    {code:'LTO',name:'LTO · литий-титанат',chemistry:'LTO',construction:'CELLS',isActive:true},
    {code:'LIFEPO4',name:'LiFePO₄ · литий-железо-фосфат',chemistry:'LFP',construction:'CELLS',isActive:true},
    {code:'NMC',name:'NMC · литий-никель-марганец-кобальт',chemistry:'NMC',construction:'CELLS',isActive:true},
    {code:'AGM',name:'AGM · свинцово-кислотный',chemistry:'LEAD_ACID',construction:'AGM',isActive:true},
    {code:'GEL',name:'GEL · свинцово-кислотный',chemistry:'LEAD_ACID',construction:'GEL',isActive:true},
    {code:'FLOODED',name:'Обычный свинцово-кислотный',chemistry:'LEAD_ACID',construction:'FLOODED',isActive:true},
    {code:'EFB',name:'EFB · улучшенный жидкостный',chemistry:'LEAD_ACID',construction:'EFB',isActive:true},
  ]},partners:[],news:[],
};

@Injectable()
export class SiteSettingsService{
  private readonly logger = new Logger(SiteSettingsService.name);
  constructor(private readonly prisma:PrismaService){}

  private logSaveFailure(phase: 'read' | 'merge' | 'upsert' | 'audit', error: unknown, sections: string[]) {
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    const code = error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code ?? 'unknown')
      : 'unknown';
    // Never log settings values, tokens, email addresses, or document contents.
    this.logger.error('Site settings save failed: phase=' + phase + ', error=' + errorName + ', code=' + code + ', sections=' + sections.join(','));
  }
  private merge<T extends Record<string,any>>(base:T,value:unknown):T{
    if(!value||typeof value!=='object'||Array.isArray(value)) return base;
    return {...base,...value} as T;
  }
  private validateNavigation(value:unknown){
    if(value===undefined)return;
    if(!value||typeof value!=='object'||Array.isArray(value))
      throw new BadRequestException('Некорректные настройки меню.');
    const navigation=value as Record<string,unknown>;
    if(navigation.items===undefined)return;
    if(!Array.isArray(navigation.items)||navigation.items.length>13)
      throw new BadRequestException('Меню содержит недопустимое количество пунктов.');
    const allowed=new Set(['/','/stages','/results','/records','/participants','/teams','/news','/rules','/documents','/partners','/cars','/about','/contacts']);
    const paths=new Set<string>();
    const ids=new Set<string>();
    for(const value of navigation.items){
      if(!value||typeof value!=='object'||Array.isArray(value))
        throw new BadRequestException('Некорректный пункт меню.');
      const item=value as Record<string,unknown>;
      if(typeof item.path!=='string'||!allowed.has(item.path)||paths.has(item.path))
        throw new BadRequestException('Недопустимая или повторяющаяся ссылка меню.');
      if(typeof item.id!=='string'||!(/^[a-z][a-z0-9-]{0,31}$/).test(item.id)||ids.has(item.id))
        throw new BadRequestException('Недопустимый идентификатор пункта меню.');
      if(typeof item.label!=='string'||item.label.trim().length===0||item.label.length>48||[...item.label].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))
        throw new BadRequestException('Название пункта меню должно содержать от 1 до 48 символов.');
      if(typeof item.enabled!=='boolean'||!Number.isSafeInteger(item.sortOrder)||Number(item.sortOrder)<0||Number(item.sortOrder)>1000)
        throw new BadRequestException('Некорректный порядок или видимость пункта меню.');
      paths.add(item.path);ids.add(item.id);
    }
  }
  /**
   * The public partner directory is CMS-controlled, but its content must be
   * validated on the server. Existing legacy rows are preserved unchanged so
   * an unrelated settings edit never breaks because of historical data.
   */
  private validatePartners(value:unknown,previous:Record<string,unknown>[]){
    if(value===undefined)return;
    if(!Array.isArray(value)||value.length>200)
      throw new BadRequestException('Некорректный список партнёров (максимум 200).');
    const ids=new Set<string>();
    for(const [index,raw] of value.entries()){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))
        throw new BadRequestException('Некорректная запись партнёра.');
      const item=raw as Record<string,unknown>;
      const id=item.id;
      const oldLegacy=previous[index];
      if((id===undefined||id===null)&&oldLegacy&&JSON.stringify(oldLegacy)===JSON.stringify(item))continue;
      if(typeof id!=='string'||!id.trim()||id.length>100||/[\u0000-\u001f\u007f]/.test(id)||ids.has(id))
        throw new BadRequestException('У партнёра отсутствует уникальный идентификатор.');
      ids.add(id);
      const old=previous.find(row=>row?.id===id);
      if(old&&JSON.stringify(old)===JSON.stringify(item))continue;
      const text=(field:string,max:number,required=false)=>{
        const v=item[field];
        if(v===undefined||v===null)return !required;
        return typeof v==='string'&&v.length<=max&&(!required||v.trim().length>0)
          &&!(field==='description'?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v);
      };
      if(!text('name',160,true)||!text('description',3000))
        throw new BadRequestException('Проверьте название и описание партнёра.');
      if(!['GENERAL','PREMIUM','REGULAR'].includes(String(item.tier)))
        throw new BadRequestException('Выберите уровень партнёра: генеральный, премиальный или обычный.');
      if(item.isActive!==undefined&&typeof item.isActive!=='boolean'
        ||item.isPublished!==undefined&&typeof item.isPublished!=='boolean'
        ||!old&&typeof item.isPublished!=='boolean')
        throw new BadRequestException('Укажите статус публикации и видимости партнёра.');
      if(item.sortOrder!==undefined&&(!Number.isSafeInteger(item.sortOrder)||Number(item.sortOrder)<0||Number(item.sortOrder)>100000))
        throw new BadRequestException('Некорректный порядок партнёра.');
      if(!text('website',2048))throw new BadRequestException('Некорректная ссылка партнёра.');
      if(item.website){
        try{
          const rawUrl=String(item.website);
          if(/\s|\\/.test(rawUrl))throw new Error('unsafe');
          const url=new URL(rawUrl);
          if(!['https:','http:'].includes(url.protocol)||!url.hostname||url.username||url.password)
            throw new Error('unsafe');
        }catch{throw new BadRequestException('Сайт партнёра должен быть корректной ссылкой https:// или http:// без логина и пароля.');}
      }
      if(item.photoUrl!==undefined&&item.photoUrl!==null){
        if(!text('photoUrl',2048))
          throw new BadRequestException('Некорректная ссылка на логотип партнёра.');
        const image=String(item.photoUrl);
        if(image){
          const local=image.startsWith('/')&&!image.startsWith('//');
          let remote=false;
          try{
            const url=new URL(image);
            remote=['https:','http:'].includes(url.protocol)&&!!url.hostname&&!url.username&&!url.password;
          }catch{/* Relative media paths are allowed. */}
          if(!local&&!remote||/\s|\\/.test(image))
            throw new BadRequestException('Логотип партнёра должен быть загруженным файлом или безопасной ссылкой.');
        }
      }
    }
  }
  private validateCatalogs(value:unknown){
    if(value===undefined)return;
    if(!value||typeof value!=='object'||Array.isArray(value))throw new BadRequestException('Некорректный каталог.');
    const types=(value as Record<string,unknown>).batteryTypes;
    if(types===undefined)return;
    if(!Array.isArray(types)||types.length>40)throw new BadRequestException('Некорректный справочник аккумуляторов.');
    const seen=new Set<string>();
    const chemistry=new Set(['LTO','LFP','NMC','LEAD_ACID']);
    const construction=new Set(['CELLS','AGM','GEL','FLOODED','EFB']);
    for(const raw of types){
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new BadRequestException('Некорректный тип аккумулятора.');
      const item=raw as Record<string,unknown>;
      if(typeof item.code!=='string'||!/^[A-Z0-9_]{2,32}$/.test(item.code)||seen.has(item.code)
        ||typeof item.name!=='string'||!item.name.trim()||item.name.length>100
        ||typeof item.chemistry!=='string'||!chemistry.has(item.chemistry)
        ||typeof item.construction!=='string'||!construction.has(item.construction)
        ||typeof item.isActive!=='boolean')
        throw new BadRequestException('Некорректный тип аккумулятора или повтор кода.');
      if((item.chemistry==='LEAD_ACID')===(item.construction==='CELLS'))
        throw new BadRequestException('Для свинцово-кислотного аккумулятора укажите AGM, GEL, FLOODED или EFB; для литиевого — CELLS.');
      seen.add(item.code);
    }
  }
  private validateHomepage(value:unknown){
    if(!value||typeof value!=='object'||Array.isArray(value)) return;
    const homepage=value as Record<string,unknown>;
    for(const field of ['heroStageLabel','heroStageTagline','heroPulseHint','heroWatchLabel','heroPrimaryButtonLabel','heroCalendarButtonLabel','teamsEmptyTitle','teamsEmptyDescription']){
      if(homepage[field]!==undefined&&(typeof homepage[field]!=='string'||(homepage[field] as string).length>160))
        throw new BadRequestException('Неверный текст главной страницы.');
    }
    if(homepage.heroTopics!==undefined){
      if(!Array.isArray(homepage.heroTopics)||homepage.heroTopics.length>8||homepage.heroTopics.some((topic:unknown)=>typeof topic!=='string'||topic.length>40))
        throw new BadRequestException('Неверные подписи первого экрана.');
    }
    if(homepage.copy!==undefined){
      if(!homepage.copy||typeof homepage.copy!=='object'||Array.isArray(homepage.copy))
        throw new BadRequestException('Неверные тексты блоков главной.');
      const allowed=new Set([
        'nextStageEyebrow','nextStageDetailsButton','nextStageRegistrationButton',
        'nextStageEmptyEyebrow','nextStageEmptyTitle','nextStageEmptyDescription','nextStageAllButton',
        'latestResultsAllButton','latestResultsEmptyTitle','latestResultsEmptyDescription',
        'recordsAllButton','recordsEmptyTitle','recordsEmptyDescription','teamsAllButton',
        'broadcastEyebrow','broadcastDescription','liveEmptyTitle','liveEmptyDescription',
        'newsAllButton','newsEmptyTitle','newsEmptyDescription','partnersAllButton',
        'participantsAllButton','documentsEyebrow',
      ]);
      const copy=homepage.copy as Record<string,unknown>;
      if(Object.keys(copy).length>allowed.size)
        throw new BadRequestException('Слишком много текстов блоков главной.');
      for(const [key,value] of Object.entries(copy)){
        if(!allowed.has(key)||typeof value!=='string'||value.length>240||[...value].some(char=>char.charCodeAt(0)<32||char.charCodeAt(0)===127))
          throw new BadRequestException('Неверный текст блока главной: '+key);
      }
    }
    if(!Object.prototype.hasOwnProperty.call(homepage,'valuesCards')) return;
    const cards=homepage.valuesCards;
    if(!Array.isArray(cards)||cards.length>5) throw new BadRequestException('Неверный список карточек главной страницы.');
    const ids=new Set(['competitions','records','people','culture','organization']);
    const paths=new Set(['/stages','/records','/participants','/news','/about']);
    const seen=new Set<string>();
    for(const card of cards){
      if(!card||typeof card!=='object'||Array.isArray(card)) throw new BadRequestException('Неверная карточка главной страницы.');
      const item=card as Record<string,unknown>;
      if(typeof item.id!=='string'||!ids.has(item.id)||seen.has(item.id)) throw new BadRequestException('Неверный или повторяющийся идентификатор карточки.');
      seen.add(item.id);
      if(typeof item.path!=='string'||!paths.has(item.path)) throw new BadRequestException('Ссылка карточки должна вести на раздел USD.');
      if(typeof item.enabled!=='boolean') throw new BadRequestException('Неверная настройка видимости карточки.');
      for(const field of ['heading','subtitle','description']){
        if(typeof item[field]!=='string'||item[field].length>240) throw new BadRequestException('Текст карточки не должен превышать 240 символов.');
      }
    }
  }
  private homepageWithBlocks(value:unknown):SiteSettingsShape['homepage']{
    const homepage=this.merge(DEFAULTS.homepage,value);
    const blocks=Array.isArray(homepage.blocks)?[...homepage.blocks]:[];
    const known=new Set(blocks.map(block=>block?.id));
    // The values section existed before it was editable. Keep its old position
    // on sites whose saved block list predates the CMS editor.
    if(!known.has('values')){
      const index=blocks.findIndex(block=>block?.id==='next-stage');
      const valueBlock=DEFAULTS.homepage.blocks.find(block=>block.id==='values');
      if(valueBlock) blocks.splice(index<0?Math.min(2,blocks.length):index+1,0,valueBlock);
      known.add('values');
    }
    for(const block of DEFAULTS.homepage.blocks) if(!known.has(block.id)) blocks.push(block);
    return {...homepage,blocks};
  }
  private shape(row:any):SiteSettingsShape{
    return {
      branding:this.merge(DEFAULTS.branding,row?.branding),homepage:this.homepageWithBlocks(row?.homepage),
      stream:this.merge(DEFAULTS.stream,row?.stream),liveResults:this.merge(DEFAULTS.liveResults,row?.liveResults),
      navigation:this.merge(DEFAULTS.navigation,row?.navigation),
      contacts:row?.contacts??DEFAULTS.contacts,social:row?.social??DEFAULTS.social,seo:row?.seo??DEFAULTS.seo,
      legal:row?.legal??DEFAULTS.legal,footer:row?.footer??DEFAULTS.footer,registration:this.merge(DEFAULTS.registration,row?.registration),
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
  async getPublic() {
    const s = this.shape(await this.prisma.siteSettings.findUnique({ where: { id: 'default' } }));
    const legal = s.legal as Record<string, any>;
    const publicLegalApproved = legal.legalApproved === true
      && Boolean(String(legal.ipName ?? '').trim())
      && Boolean(String(legal.operatorAddress ?? '').trim())
      && Boolean(String(legal.personalDataEmail ?? '').trim())
      && Boolean(String(legal.privacyText ?? '').trim())
      && Boolean(String(legal.consentText ?? '').trim())
      && Boolean(String(legal.termsText ?? '').trim());
    const publicRegistration = { ...s.registration } as Record<string, any>;
    delete publicRegistration.emailTemplates;
    return {
      success: true,
      settings: {
        branding: s.branding,
        homepage: s.homepage,
        stream: s.stream,
        liveResults: s.liveResults,
        navigation: s.navigation,
        contacts: s.contacts,
        social: s.social,
        seo: s.seo,
        footer: s.footer,
        catalogs: s.catalogs,
        registration: {
          ...publicRegistration,
          ...(s.registration.rulesDocument ? { rulesDocument: { published: (s.registration.rulesDocument as any).published ?? null } } : {}),
        },
        // A draft partner must never be exposed by the public settings API.
        // Missing isPublished remains public for legacy CMS records.
        partners: s.partners.filter((partner: any) => partner && typeof partner === 'object' && !Array.isArray(partner) && partner.isActive !== false && partner.isPublished !== false)
          .map((partner: any) => Object.fromEntries(Object.entries(partner).filter(([key]) =>
            ['id','name','description','photoUrl','website','isActive','isPublished','sortOrder','tier'].includes(key)))),
        news: s.news.filter((item: any) => item.isPublished !== false),
        legal: {
          legalApproved: publicLegalApproved,
          legalVersion: publicLegalApproved ? (legal.legalVersion ?? null) : null,
          legalApprovedAt: publicLegalApproved ? (legal.legalApprovedAt ?? null) : null,
          ipName: legal.ipName ?? '',
          inn: legal.inn ?? '',
          ogrnip: legal.ogrnip ?? '',
          operatorAddress: legal.operatorAddress ?? '',
          personalDataEmail: legal.personalDataEmail ?? '',
          copyrightHolder: legal.copyrightHolder ?? '',
          privacyUrl: legal.privacyUrl ?? '',
          consentUrl: legal.consentUrl ?? '',
          termsUrl: legal.termsUrl ?? '',
          rulesUrl: legal.rulesUrl ?? '',
          privacyText: publicLegalApproved ? (legal.privacyText ?? '') : '',
          consentText: publicLegalApproved ? (legal.consentText ?? '') : '',
          termsText: publicLegalApproved ? (legal.termsText ?? '') : '',
          documents: publicLegalApproved && legal.documents && typeof legal.documents === 'object' ? legal.documents : {},
        },
      },
    };
  }
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
    const archivedRevisionId = String(incomingPublished?.id ?? '');
    const archivedRevision = Array.isArray(currentDocument.publishedVersions)
      ? currentDocument.publishedVersions.find((version: any) => String(version?.id ?? '') === archivedRevisionId)
      : undefined;
    if (archivedRevision && archivedRevisionId !== currentPublishedId) {
      throw new BadRequestException(
        'Нельзя повторно использовать ID опубликованной редакции регламента. Для восстановления создайте новую редакцию.',
      );
    }
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
    const sections = Object.keys(input ?? {});
    let phase: 'read' | 'merge' | 'upsert' | 'audit' = 'read';
    try {
      const current=this.shape(await this.prisma.siteSettings.findUnique({where:{id:'default'}}));
      phase = 'merge';
      this.validateHomepage(input.homepage);
      this.validateNavigation(input.navigation);
      this.validateCatalogs(input.catalogs);
      this.validatePartners(input.partners,current.partners);
      const currentLegal = current.legal as Record<string, any>;
      const incomingLegal = input.legal && typeof input.legal === 'object' ? input.legal as Record<string, any> : null;
      const incomingContacts = input.contacts as Record<string, any> | undefined;
      const contactChanged = Boolean(incomingContacts && Object.prototype.hasOwnProperty.call(incomingContacts, 'email') && incomingContacts.email !== current.contacts.email);
      let legal: Record<string, any> = currentLegal;
      if (incomingLegal) {
        const contentKeys = ['ipName', 'inn', 'ogrnip', 'operatorAddress', 'personalDataEmail', 'copyrightHolder', 'privacyUrl', 'consentUrl', 'termsUrl', 'rulesUrl', 'privacyText', 'consentText', 'termsText', 'documents'];
        const contentChanged = contactChanged || contentKeys.some((key) => {
          if (!Object.prototype.hasOwnProperty.call(incomingLegal, key)) return false;
          const before = currentLegal[key];
          const after = incomingLegal[key];
          return key === 'documents' ? JSON.stringify(before ?? {}) !== JSON.stringify(after ?? {}) : before !== after;
        });
        legal = { ...currentLegal, ...incomingLegal };
        if (contentChanged) {
          legal = { ...legal, legalApproved: false, legalApprovedAt: null, legalApprovedBy: null };
        } else if (incomingLegal.legalApproved === true && currentLegal.legalApproved !== true) {
          const contactEmail = incomingContacts?.email ?? current.contacts.email ?? (input.footer as Record<string, any> | undefined)?.email ?? (current.footer as Record<string, any>).email;
          const missing = [
            !String(legal.ipName ?? '').trim() && 'наименование/ФИО оператора',
            !String(legal.operatorAddress ?? '').trim() && 'адрес оператора',
            !String(legal.personalDataEmail ?? '').trim() && 'контакт для обращений по персональным данным',
            !String(legal.privacyText ?? '').trim() && 'политика обработки данных',
            !String(legal.consentText ?? '').trim() && 'согласие на обработку данных',
            !String(legal.termsText ?? '').trim() && 'пользовательское соглашение',
            !String(contactEmail ?? '').trim() && 'контактный email оператора',
          ].filter(Boolean);
          if (missing.length) throw new BadRequestException('Нельзя утвердить юридические документы: заполните ' + missing.join(', ') + '.');
          legal = { ...legal, legalApproved: true, legalApprovedAt: new Date().toISOString(), legalApprovedBy: userId, legalVersion: String(Number(currentLegal.legalVersion ?? 0) + 1) };
        } else if (incomingLegal.legalApproved === false) {
          legal = { ...legal, legalApproved: false, legalApprovedAt: null, legalApprovedBy: null };
        }
      } else if (contactChanged && currentLegal.legalApproved === true) {
        legal = { ...currentLegal, legalApproved: false, legalApprovedAt: null, legalApprovedBy: null };
      }
      const next={
        branding:this.merge(current.branding,input.branding),homepage:this.merge(current.homepage,input.homepage),
        stream:this.merge(current.stream,input.stream),liveResults:this.merge(current.liveResults,input.liveResults),
        navigation:this.merge(current.navigation,input.navigation),contacts:input.contacts??current.contacts,
        social:input.social??current.social,seo:input.seo??current.seo,legal,
        footer:input.footer??current.footer,registration:input.registration ? this.mergeRegistration(current.registration,input.registration) : current.registration,
        catalogs:this.merge(current.catalogs,input.catalogs),partners:input.partners??current.partners,news:input.news??current.news,
      };
      phase = 'upsert';
      // Site settings are persisted as JSON columns. Normalize the merged settings
      // to plain JSON before passing them to Prisma: UI forms can round-trip
      // optional/undefined properties and browser objects that Prisma's JSON
      // input validator rejects even though the settings themselves are valid.
      const persisted = JSON.parse(JSON.stringify(next)) as typeof next;
      const row = await this.prisma.siteSettings.upsert({
        where: { id: 'default' },
        create: { id: 'default', ...persisted } as any,
        update: { ...persisted } as any,
      });
      phase = 'audit';
      await this.prisma.auditLog.create({data:{userId,action:'SITE_SETTINGS_UPDATED',entity:'SiteSettings',entityId:'default',metadata:{sections}}});
      return {success:true,settings:this.shape(row)};
    } catch (error) {
      // Expected validation errors remain 4xx and are not logged as server failures.
      if (!(error instanceof HttpException) || error.getStatus() >= 500) {
        this.logSaveFailure(phase, error, sections);
      }
      throw error;
    }
  }
}
