import {NameNormalizerService} from '../common/names/name-normalizer.service';
import {reconcileHistoricalEmails,sameHistoricalFullName} from './historical-email-reconciliation';
const n=new NameNormalizerService();
const p=(id:string,stageId='final',number=22,legacyEmail:string|null=null)=>({id,firstName:'Иван',lastName:'Иванов',middleName:null,legacyEmail,appearances:[{stageId,participantNumber:number}]});
const row=(name='Иванов Иван',email='ivan@example.ru',stageId='final',participantNumber:number|null=22)=>({name,email,stageId,participantNumber});
describe('historical email repair',()=>{
 it('rescues a later-stage email for a participant already created at an earlier event',()=>{
  const person={...p('p1'),appearances:[{stageId:'opening',participantNumber:1},{stageId:'final',participantNumber:22}]};
  expect(reconcileHistoricalEmails([person],[row()],n).candidates).toEqual([{participantId:'p1',email:'ivan@example.ru'}]);
 });
 it('does not match people who never appeared in the same stage',()=>{
  expect(reconcileHistoricalEmails([p('p1','opening')],[row()],n).candidates).toHaveLength(0);
 });
 it('does not guess between namesakes on one stage, unless the sticker disambiguates',()=>{
  expect(reconcileHistoricalEmails([p('p1'),p('p2','final',23)],[row('Иванов Иван','test@example.ru','final',null)],n).summary.ambiguousRows).toBe(1);
  expect(reconcileHistoricalEmails([p('p1'),p('p2','final',23)],[row()],n).candidates).toEqual([{participantId:'p1',email:'ivan@example.ru'}]);
 });
 it('does not overwrite existing email or choose between conflicting source addresses',()=>{
  expect(reconcileHistoricalEmails([p('p1','final',22,'saved@example.ru')],[row()],n).candidates).toHaveLength(0);
  expect(reconcileHistoricalEmails([p('p1')],[row(),row('Иванов Иван','other@example.ru')],n).candidates).toHaveLength(0);
 });
 it('does not create an email ownership collision between two participants',()=>{
  expect(reconcileHistoricalEmails([p('p1'),{...p('p2','final',23),firstName:'Пётр',lastName:'Петров'}],[row(),row('Петров Пётр','ivan@example.ru','final',23)],n).summary.conflictingProfiles).toBe(2);
 });
 it('tolerates an omitted patronymic but rejects a different one',()=>{
  expect(sameHistoricalFullName('Иванов Иван Иванович','Иванов Иван',n)).toBe(true);
  expect(sameHistoricalFullName('Иванов Иван Иванович','Иванов Иван Петрович',n)).toBe(false);
 });
 it('recovers an email attached to a profile whose identity was previously merged',()=>{
  expect(reconcileHistoricalEmails([p('p1')],[],n,[{participantId:'p1',email:'merged@example.ru'}]).candidates).toEqual([{participantId:'p1',email:'merged@example.ru'}]);
 });
 it('ignores invalid source addresses',()=>{
  expect(reconcileHistoricalEmails([p('p1')],[row('Иванов Иван','invalid')],n).summary.invalidEmailRows).toBe(1);
 });
});
