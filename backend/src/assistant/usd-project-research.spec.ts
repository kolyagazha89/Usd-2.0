import {searchProjectCorpus,readProjectCorpus,type ProjectCorpus} from './usd-project-research';
const corpus:ProjectCorpus={revision:'a'.repeat(40),files:[
 {path:'backend/src/registrations/registration.service.ts',text:'// Registration\nasync function changeClass() {\n return "BassRace";\n}'},
 {path:'docs/USD_MASTER_PLAN.md',text:'# USD\n## BassRace\nОтдельные стартовые номера.'},
]};
describe('project research corpus',()=>{
 it('finds source evidence with revision and numbered excerpts',()=>{
  const result=searchProjectCorpus(corpus,'BassRace');
  expect(result.revision).toBe(corpus.revision);
  expect(result.matches.map(m=>m.path)).toContain('backend/src/registrations/registration.service.ts');
  expect(result.matches[0].startLine).toBeGreaterThan(0);
 });
 it('reads only indexed paths and refuses arbitrary filesystem access',()=>{
  expect(readProjectCorpus(corpus,'../../.env',1,50)).toMatchObject({error:expect.any(String)});
  expect(readProjectCorpus(corpus,'backend/src/registrations/registration.service.ts',2,2)).toMatchObject({startLine:2,endLine:3,content:expect.stringContaining('changeClass')});
 });
 it('caps reads and hides likely credentials',()=>{
  const secretCorpus:ProjectCorpus={revision:corpus.revision,files:[{path:'docs/test.md',text:'API_TOKEN=private-example-secret-123456\n'+Array(200).fill('some text').join('\n')}]};
  const result=readProjectCorpus(secretCorpus,'docs/test.md',1,500);
  expect(result.content).not.toContain('private-example-secret-123456');
  expect(result.endLine).toBeLessThanOrEqual(80);
 });
});
