import {jest} from '@jest/globals';
import {SiteSettingsService} from './site-settings.service';

describe('PUSH template editor isolation from public settings and stale CMS forms',()=>{
 it('does not expose private automatic PUSH configuration in public site settings',async()=>{
  const registration={enabled:true,pushTemplates:[{key:'profileLinkRequest',title:'Only staff',body:'Admin notice',enabled:true}],emailTemplates:[{subject:'Account mail'}]};
  const db:any={siteSettings:{findUnique:jest.fn(async()=>({id:'default',registration}))}};
  const result=await new SiteSettingsService(db).getPublic();
  expect(result.settings.registration).toMatchObject({enabled:true});
  expect(result.settings.registration).not.toHaveProperty('pushTemplates');
  expect(result.settings.registration).not.toHaveProperty('emailTemplates');
 });
 it('does not allow a stale general settings submission to overwrite PUSH editor values',()=>{
  const service=new SiteSettingsService({} as any);
  const current={enabled:true,pushTemplates:[{key:'profileLinkRequest',enabled:true,title:'Current',body:'Correct'}]};
  const incoming={enabled:false,pushTemplates:[{key:'profileLinkRequest',enabled:false,title:'Old',body:'Stale'}]};
  const merged=(service as any).mergeRegistration(current,incoming);
  expect(merged.enabled).toBe(false);
  expect(merged.pushTemplates).toEqual(current.pushTemplates);
 });
});
