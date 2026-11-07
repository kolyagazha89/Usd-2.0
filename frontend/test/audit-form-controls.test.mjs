import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFormSource,auditFormTree} from '../scripts/audit-form-controls.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

test('audit finds every native form control across public, participant and admin TSX',()=>{
 const source=`export function Screen(){return <section>
  <form onSubmit={()=>{}}><label>Фамилия<input required/></label><input aria-label="Поиск" type="search"/>
   <label htmlFor="car">Авто</label><select id="car"><option value="x">X</option></select>
   <textarea placeholder="Only placeholder" /><input type="hidden" value="a"/>
  </form>
 </section>}`;
 const report=auditFormSource(source,'Screen.tsx');
 assert.equal(report.forms,1);
 assert.equal(report.controls,4);
 assert.deepEqual(report.unlabeled.map(row=>row.tag),['textarea']);
});
test('disabled or dynamically labelled controls are not misclassified',()=>{
 const report=auditFormSource(`const View=()=> <><input aria-labelledby="form-title"/><label><textarea/></label><input type="hidden"/><select aria-label="Класс"/></>`,'View.tsx');
 assert.equal(report.unlabeled.length,0);
 assert.equal(report.controls,3);
});

test('inventory covers all real TSX form surfaces, not just sample fixtures',()=>{
 const src=resolve(dirname(fileURLToPath(import.meta.url)),'../src');
 const rows=auditFormTree(src);
 assert.ok(rows.length>=30,'must scan public, participant and admin modules');
 for(const path of ['App.tsx','admin/InspectionsPage.tsx','admin/FormComponents.tsx','admin/ConfigurationsPage.tsx','admin/ResultsPage.tsx','participant/FirstLoginOnboarding.tsx','teams/TeamWorkspace.tsx'])
  assert.ok(rows.some(row=>row.fileName===path),path);
 const total=rows.reduce((n,row)=>n+row.controls,0);
 assert.ok(total>=130,'native controls must not silently disappear from the audit');
 const important=rows.filter(row=>['admin/FormComponents.tsx','admin/ResultsPage.tsx'].includes(row.fileName));
 assert.ok(important.every(row=>row.unlabeled.length===0),'new resource and judge inputs need accessible labels');
});

test('every native TSX form control has an accessible name',()=>{
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../src');
 const offenders=auditFormTree(root).flatMap(row=>row.unlabeled.map(field=>row.fileName+':'+field.line+' <'+field.tag+'>'));
 assert.deepEqual(offenders,[]);
});
