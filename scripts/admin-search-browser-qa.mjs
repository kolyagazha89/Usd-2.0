import assert from 'node:assert/strict';
import path from 'node:path';

export async function verifyAdminSearch(page,route,width,output){
 if(['/admin/registrations?stageId=stage1','/admin/inspections?stageId=stage1'].includes(route)){
  const stage=page.locator('.event-ops-stage-drawer'),actions=page.locator('.event-ops-actions-drawer');
  assert.equal(await stage.getAttribute('open'),null,'stage controls are collapsed initially');
  assert.equal(await actions.getAttribute('open'),null,'action buttons are collapsed initially');
  assert.equal(await page.locator('.event-ops-workflow-context').count(),0,'only the three section tabs remain in list navigation');
  assert.match(await page.locator('.event-ops-workflow-steps').innerText(),/Результаты/);
  await stage.locator('summary').first().focus();await page.keyboard.press('Enter');
  await stage.locator('select').first().waitFor({state:'visible'});await verifySelectTextSpace(page);
  await stage.locator('summary').first().click();
  await actions.locator('summary').first().click();await actions.locator('button').first().waitFor({state:'visible'});
  await actions.locator('summary').first().click();
  const consent=page.getByRole('button',{name:'Только необходимые',exact:true});if(await consent.isVisible())await consent.click();
  await page.evaluate(()=>scrollTo(0,0));
 }

 if(['/admin/registrations?stageId=stage1','/admin/inspections?stageId=stage1'].includes(route)&&width<1200){
  const row=page.locator('.event-ops-compact-table tbody tr').first();await row.waitFor();
  const card=await row.boundingBox();
  if(width<=402)assert.ok(card.y<800,'records begin near the search instead of below the action fields: '+JSON.stringify(card));
  assert.ok(card.height<=280,'single-class entry is compact: '+JSON.stringify(card));
  for(const label of ['№','Участник','Автомобиль','Классы'])assert.ok(await row.locator('td[data-label="'+label+'"]').innerText(),'card preserves '+label);
  assert.equal(await row.locator('td[data-label="Участник"]').evaluate(el=>getComputedStyle(el,'::before').display),'none','no repeated column labels');
  await row.scrollIntoViewIfNeeded();
  const consent=page.getByRole('button',{name:'Только необходимые',exact:true});if(await consent.isVisible())await consent.click();
  await page.screenshot({path:path.join(output,(route.includes('inspections')?'inspection':'registration')+'-compact-card-'+width+'.png'),fullPage:true});
 }

 if(route==='/admin/users'){
  const search=page.getByRole('searchbox',{name:'Поиск пользователей по email или ФИО',exact:true});
  await search.fill('Иван Тестовый');
  await page.locator('.data-table tbody tr').first().waitFor();
  assert.equal(await page.locator('.data-table tbody tr').count(),1,'linked full name searches without submit');
  assert.match(await page.locator('.data-table tbody').innerText(),/fixture@example.test/);
  await search.fill('missing@example.test');
  await page.getByText('Пользователи не найдены. Измените поиск или фильтр.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Очистить поиск пользователей',exact:true}).click();
  await page.locator('.data-table tbody tr').first().waitFor();
 }
 if(route==='/admin/inspections?stageId=stage1'){
  const search=page.getByRole('searchbox',{name:'Поиск участников инспекции'});
  await search.fill('1');
  const results=page.getByRole('region',{name:'Результаты поиска инспекций'});
  await results.getByText('Найдено: 0',{exact:true}).waitFor();
  for(const query of ['7','007','№007']){
   await search.fill(query);
   await results.getByRole('button',{name:/Открыть инспекцию/}).waitFor();
   assert.equal(await results.locator('li').count(),1,'exact number '+query);
  }
  const inputBox=await search.boundingBox(),resultBox=await results.boundingBox();
  assert.ok(resultBox.y>=inputBox.y&&resultBox.y<inputBox.y+inputBox.height+100,'results immediately follow the search input');
  assert.equal(await page.locator('.event-ops-results').count(),0,'search does not duplicate full cards below');
  await results.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,'inspection-search-'+width+'.png'),fullPage:true});
  const open=results.getByRole('button',{name:/Открыть инспекцию/});await open.focus();await page.keyboard.press('Enter');
  await page.locator('.resource-editor-page').waitFor();
  assert.match(page.url(),/registrationId=reg1/,'opening a result produces a reloadable inspection URL');
  await page.locator('.resource-editor-heading').getByRole('button',{name:'Назад к списку',exact:true}).click();
  await results.waitFor();assert.equal(await search.inputValue(),'№007','return keeps the search');
 }
 if(route==='/admin/statistics'){
  const search=page.getByRole('searchbox',{name:'Поиск статистики участника'});
  const before=await page.locator('.statistics-participant-search').evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('.kpi-grid'))&Node.DOCUMENT_POSITION_FOLLOWING));
  assert.ok(before,'participant search precedes the long metrics');
  await search.fill('Тестовый');
  await page.locator('.statistics-search-result').first().waitFor();
  await page.getByRole('button',{name:'Очистить поиск статистики участника'}).click();
  await page.locator('.statistics-search-result').waitFor({state:'detached'});
  assert.equal(await page.locator('.statistics-search-result').count(),0,'clearing removes suggestions');
 }
 if(route==='/admin/roles'&&width<=1050){
  const list=await page.locator('.roles-list').boundingBox(),editor=await page.locator('.roles-editor').boundingBox();
  assert.ok(list.y<editor.y,'role directory precedes the empty editor');
 }
}

export async function verifySelectTextSpace(page){
 const metrics=await page.locator('select:not([multiple]):not([size]),select[size="1"]:not([multiple])').evaluateAll(elements=>elements.filter(el=>el.getClientRects().length>0).map(el=>{
  const style=getComputedStyle(el),px=value=>parseFloat(value)||0;
  return {label:el.getAttribute('aria-label')||el.name||el.className,text:el.selectedOptions[0]?.textContent??'',height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width,
   textSpace:el.clientHeight-px(style.paddingTop)-px(style.paddingBottom),fontSize:px(style.fontSize),padding:style.padding,appearance:style.appearance};
 }));
 for(const metric of metrics){
  assert.ok(metric.textSpace>=metric.fontSize*1.35,'select has space for a full line: '+JSON.stringify(metric));
  assert.ok(metric.height>=44,'select is touch-sized: '+JSON.stringify(metric));
 }
 return metrics;
}
