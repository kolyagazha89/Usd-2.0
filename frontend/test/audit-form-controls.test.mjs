import test from 'node:test';
import assert from 'node:assert/strict';
import {auditFormSource} from '../scripts/audit-form-controls.mjs';

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
