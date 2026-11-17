import {publicUsdSiteOrigin} from './public-site-origin';

describe('public USD links after apex cutover',()=>{
 const main='https://usd-russia.ru';
 const legacy='https://app.usd-russia.ru';
 it('points all production public site links at the registered apex',()=>{
  expect(publicUsdSiteOrigin(legacy,'production')).toBe(main);
  expect(publicUsdSiteOrigin(legacy+'/','production')).toBe(main);
  expect(publicUsdSiteOrigin(main,'production')).toBe(main);
  expect(publicUsdSiteOrigin(undefined,'production')).toBe(main);
 });
 it('keeps development and explicit test origins unchanged',()=>{
  expect(publicUsdSiteOrigin(undefined,'development')).toBe('http://localhost:5173');
  expect(publicUsdSiteOrigin('http://localhost:5174/','test')).toBe('http://localhost:5174');
  expect(publicUsdSiteOrigin(legacy,'test')).toBe(legacy);
 });
 it('fails closed on unknown, malicious and insecure production link destinations',()=>{
  for(const unsafe of ['https://usd-russia.ru.evil.example','http://usd-russia.ru',
   'https://user@usd-russia.ru','https://other.example','https://usd-russia.ru/private',
   '//usd-russia.ru','javascript:alert(1)']){
   expect(()=>publicUsdSiteOrigin(unsafe,'production')).toThrow(/origin/i);
  }
 });
});
