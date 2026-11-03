import {Check,ChevronRight,FileWarning,Save} from 'lucide-react';
import {HOME_EDITOR_STEPS,SITE_SETTING_SECTIONS,homeEditorProgress,siteSettingProgress,type HomeEditorStep,type SiteSettingSection} from './site-settings-progress';
import './site-settings-journey.css';

type Props={settings:any;section:SiteSettingSection;step:HomeEditorStep;dirty:boolean;saving:boolean;onNavigate:(section:SiteSettingSection,step?:HomeEditorStep)=>void};
export default function SiteSettingsJourney({settings,section,step,dirty,saving,onNavigate}:Props){
 const sectionIndex=SITE_SETTING_SECTIONS.findIndex(item=>item.id===section);
 const next=SITE_SETTING_SECTIONS[sectionIndex+1];
 return <>
  <header className="usd-editor-journey-head" aria-live="polite">
   <div><span className="eyebrow">КОНТЕНТ USD · РЕДАКТОР</span><h2>Управление сайтом</h2><p>Каждый раздел открывается отдельно. Сохраняйте изменения перед публикацией.</p></div>
   <div className={'usd-editor-save-state'+(dirty?' has-changes':'')}>
    {saving?<Save size={17}/>:dirty?<FileWarning size={17}/>:<Check size={17}/>}
    <span>{saving?'Сохранение…':dirty?'Есть несохранённые изменения':'Нет несохранённых изменений'}</span>
   </div>
  </header>
  <nav className="usd-editor-section-nav" aria-label="Разделы настроек сайта">
   {SITE_SETTING_SECTIONS.map((item,index)=>{
    const progress=siteSettingProgress(settings,item.id);
    return <button key={item.id} type="button" aria-current={section===item.id?'step':undefined} className={'usd-editor-section-link'+(section===item.id?' is-active':'')} onClick={()=>onNavigate(item.id)}>
     <span className="usd-editor-section-index">{String(index+1).padStart(2,'0')}</span><span className="usd-editor-section-text"><strong>{item.title}</strong><small>{progress.label}</small></span>
     {progress.approved&&<Check size={14} className="usd-editor-verified" aria-label="Утверждено"/>}
    </button>;
   })}
  </nav>
  {section==='homepage'&&<nav className="usd-home-step-nav" aria-label="Этапы оформления главной">
   {HOME_EDITOR_STEPS.map((item,index)=>{
    const p=homeEditorProgress(settings?.homepage,item.id);
    const active=step===item.id;
    return <button key={item.id} type="button" aria-current={active?'step':undefined} className={'usd-home-step'+(active?' is-active':'')} onClick={()=>onNavigate('homepage',item.id)}>
     <span className="usd-home-step-index">{index+1}</span>
     <span><strong>{item.title}</strong><small>{item.description}</small><em>{p.total?p.done+' / '+p.total+' заполнено':'Настройка доступна'}</em></span>
    </button>;
   })}
  </nav>}
  <footer className="usd-editor-journey-foot">
   <span>Раздел {sectionIndex+1} из {SITE_SETTING_SECTIONS.length}</span>
   {next&&<button type="button" className="secondary-button compact" onClick={()=>onNavigate(next.id)}>Далее: {next.title}<ChevronRight size={16}/></button>}
  </footer>
 </>;
}
