import {searchUsdDocuments} from './usd-document-search';

describe('USD project-document knowledge retrieval',()=>{
 it('finds full offline LAN requirements from project documents without pretending they are deployed',()=>{
  const result=searchUsdDocuments('офлайн сервер LAN синхронизация','all');
  expect(result.matches.length).toBeGreaterThan(0);
  expect(result.matches.some(x=>/OFFLINE_MODE|USD_MASTER_PLAN/.test(x.path))).toBe(true);
  expect(result.note).toMatch(/не подтверждение выпуска/);
 });
 it('limits document excerpts even for very broad questions',()=>{
  const result=searchUsdDocuments('регистрация инспекция результат этап участник система дизайн','all');
  expect(result.matches.length).toBeLessThanOrEqual(4);
  expect(result.matches.every(x=>x.excerpt.length<=2350)).toBe(true);
 });
 it('fails closed for unrelated empty queries instead of disclosing entire docs',()=>{
  expect(searchUsdDocuments('какая погода','offline').matches).toHaveLength(0);
  expect(searchUsdDocuments('','all').matches).toHaveLength(0);
 });
});
