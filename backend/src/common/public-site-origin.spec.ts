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
 it('keeps the isolated offline LAN HTTPS origin instead of redirecting venue registrations online',()=>{
  const old=process.env.USD_VENUE_LAN_MODE;
  process.env.USD_VENUE_LAN_MODE='true';
  try{
   for(const local of ['https://192.168.1.50','https://10.5.0.12','https://172.20.1.3'])
    expect(publicUsdSiteOrigin(local,'production')).toBe(local);
   for(const forbidden of ['https://usd-russia.ru','https://app.usd-russia.ru',
    'http://192.168.1.50','https://192.168.1.50:4443',
    'https://127.0.0.1','https://8.8.8.8','https://192.168.1.50.evil.example'])
    expect(()=>publicUsdSiteOrigin(forbidden,'production')).toThrow(/origin/i);
  }finally{
   if(old===undefined)delete process.env.USD_VENUE_LAN_MODE;
   else process.env.USD_VENUE_LAN_MODE=old;
  }
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
