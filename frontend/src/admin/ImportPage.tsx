import {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {AlertTriangle,CarFront,Check,ChevronLeft,ClipboardCheck,Database,FileInput,Loader2,Plus,RefreshCw,Trophy,UserRound} from 'lucide-react';
import {apiGet,apiPatch,apiPost,connectGoogle,getGoogleSheetValues,getGoogleSpreadsheet,getGoogleSpreadsheets,getGoogleStatus,listData,prepareHistoricalImport} from '../api';

function sheetRows(values:any){
  if(!Array.isArray(values))return [];
  const rows=values.filter((row:any)=>Array.isArray(row)&&row.some((x:any)=>String(x??'').trim()!==''));
  if(rows.length<2)return [];
  const headers=(rows[0]??[]).map((x:any)=>String(x??'').replace(/^\\uFEFF/,'').trim());
  return rows.slice(1).map((row:any[])=>{
    const item:any={};
    headers.forEach((h:string,i:number)=>{if(h)item[h]=row?.[i]??''});
    return item;
  }).filter((item:any)=>Object.values(item).some((x:any)=>String(x??'').trim()!==''));
}

function resultSheetRows(values:any){
  const rows=sheetRows(values);
  let currentClass='';
  return rows.map((row:any)=>{
    const classValue=String(row['Класс']??'').trim();
    if(classValue)currentClass=classValue;
    return currentClass?{...row,'Класс':currentClass}:row;
  }).filter((row:any)=>{
    // Historical Results is the source of truth. A missing sticker number is
    // a warning for Preview, not permission to silently drop a participant.
    const name=String(row['ФИО']??row['Фамилия и имя']??row['Участник']??'').trim();
    return name!==''&&String(row['Класс']??'').trim()!=='';
  });
}
function ImportPage({PageFrame,PanelTitle,Empty,enumLabel}: {PageFrame:React.ComponentType<any>;PanelTitle:React.ComponentType<any>;Empty:React.ComponentType<any>;enumLabel:(value:any)=>string}){
 const[stages,setStages]=useState<any[]>([]),[stageId,setStageId]=useState(''),[mode,setMode]=useState<'NORMAL'|'HISTORICAL'>('NORMAL');
 const[google,setGoogle]=useState<any>(null),[spreadsheets,setSpreadsheets]=useState<any[]>([]),[spreadsheetId,setSpreadsheetId]=useState(''),[spreadsheet,setSpreadsheet]=useState<any>(null);const[uploadedFile,setUploadedFile]=useState<File|null>(null);const[sourcePostUrl,setSourcePostUrl]=useState('');
 const[historicalRegistrationSpreadsheetId,setHistoricalRegistrationSpreadsheetId]=useState(''),[historicalResultsSpreadsheetId,setHistoricalResultsSpreadsheetId]=useState('');
 const[historicalRegistrationSpreadsheet,setHistoricalRegistrationSpreadsheet]=useState<any>(null),[historicalResultsSpreadsheet,setHistoricalResultsSpreadsheet]=useState<any>(null);
 const[historicalRegistrationSheet,setHistoricalRegistrationSheet]=useState(''),[historicalResultsSheet,setHistoricalResultsSheet]=useState('');
 const[historicalSheetSelections,setHistoricalSheetSelections]=useState<Record<string,{registration:string;results:string}>>({});

 const[result,setResult]=useState<any>(null),[job,setJob]=useState<any>(null),[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[resolveRow,setResolveRow]=useState<any|null>(null),[resolution,setResolution]=useState('{}');
 const[resetPreview,setResetPreview]=useState<any>(null),[resetConfirmation,setResetConfirmation]=useState(''),[resetBusy,setResetBusy]=useState(false),[resetError,setResetError]=useState(''),[resetReport,setResetReport]=useState<any>(null);
 const[orphanPreview,setOrphanPreview]=useState<any>(null),[orphanConfirmation,setOrphanConfirmation]=useState(''),[orphanBusy,setOrphanBusy]=useState(false),[orphanError,setOrphanError]=useState(''),[orphanReport,setOrphanReport]=useState<any>(null);
 const[participantInventory,setParticipantInventory]=useState<any>(null),[inventoryBusy,setInventoryBusy]=useState(false),[inventoryError,setInventoryError]=useState('');
 const[namePreview,setNamePreview]=useState<any>(null),[nameBusy,setNameBusy]=useState(false),[nameError,setNameError]=useState(''),[nameReport,setNameReport]=useState<any>(null),[namePhrase,setNamePhrase]=useState(''),[nameBackupOk,setNameBackupOk]=useState(false);
 const[purgePreview,setPurgePreview]=useState<any>(null),[purgePhrase,setPurgePhrase]=useState(''),[purgeBackupConfirmed,setPurgeBackupConfirmed]=useState(false),[purgeBusy,setPurgeBusy]=useState(false),[purgeError,setPurgeError]=useState(''),[purgeReport,setPurgeReport]=useState<any>(null); const [historicalPrepare,setHistoricalPrepare]=useState<any>(null),[historicalJobId,setHistoricalJobId]=useState('');const [dbCheck,setDbCheck]=useState<any>(null);
 const previewHistoricalReset=async()=>{
   setResetBusy(true);setResetError('');setResetPreview(null);setResetConfirmation('');setResetReport(null);
   try{
     const data=await apiGet<any>('/admin/imports/historical-reset/preview');
     setResetPreview(data);
   }catch(e){setResetError(e instanceof Error?e.message:'Не удалось проверить исторические записи')}
   finally{setResetBusy(false)}
 };
 const executeHistoricalReset=async()=>{
   const phrase='RESET_HISTORICAL_IMPORT_TEST_DATA';
   if(!resetPreview?.readOnly||resetConfirmation!==phrase||!resetPreview?.counts?.historicalImportJobs)return;
   setResetBusy(true);setResetError('');setResetReport(null);
   try{
     // One more dry run immediately before the delete; do not execute if
     // another admin has changed the import-job/registration footprint.
     const fresh=await apiGet<any>('/admin/imports/historical-reset/preview');
     if(JSON.stringify(fresh?.counts)!==JSON.stringify(resetPreview.counts)||JSON.stringify(fresh?.stages)!==JSON.stringify(resetPreview.stages)){
       setResetPreview(fresh);setResetConfirmation('');
       throw new Error('Состав исторических данных изменился. Просмотрите новый план очистки и подтвердите заново.');
     }
     const data=await apiPost<any>('/admin/imports/historical-reset/execute',{confirmation:phrase});
     setResetReport(data);setResetPreview(null);setResetConfirmation('');
     setJob(null);setRows([]);setResult(null);setHistoricalPrepare(null);setHistoricalJobId('');setDbCheck(null);
     const stagesResponse=await apiGet<any>('/stages');
     setStages(listData(stagesResponse));
   }catch(e){setResetError(e instanceof Error?e.message:'Очистка не выполнена')}
   finally{setResetBusy(false)}
 };
 const previewUnclaimedPurge=async()=>{
   setPurgeBusy(true);setPurgeError('');setPurgePreview(null);setPurgePhrase('');setPurgeBackupConfirmed(false);setPurgeReport(null);
   try{setPurgePreview(await apiGet<any>('/admin/imports/unclaimed-test-purge/preview'))}
   catch(e){setPurgeError(e instanceof Error?e.message:'Не удалось получить план полной тестовой очистки')}
   finally{setPurgeBusy(false)}
 };
 const executeUnclaimedPurge=async()=>{
   if(!purgePreview?.allowed||!purgeBackupConfirmed||purgePhrase!==purgePreview.confirmationRequired||!purgePreview.fingerprint)return;
   setPurgeBusy(true);setPurgeError('');setPurgeReport(null);
   try{
     const fresh=await apiGet<any>('/admin/imports/unclaimed-test-purge/preview');
     if(!fresh.allowed||fresh.fingerprint!==purgePreview.fingerprint||
       JSON.stringify(fresh.counts)!==JSON.stringify(purgePreview.counts)){
       setPurgePreview(fresh);setPurgePhrase('');setPurgeBackupConfirmed(false);
       throw new Error('Состав базы изменился либо найдены защищённые связи. Проверьте обновлённый план.');
     }
     const report=await apiPost<any>('/admin/imports/unclaimed-test-purge/execute',{
       confirmation:purgePhrase,fingerprint:purgePreview.fingerprint,
       expectedParticipants:Number(purgePreview.counts.participants),
     });
     setPurgeReport(report);setPurgePreview(null);setPurgePhrase('');setPurgeBackupConfirmed(false);
     setParticipantInventory(null);setOrphanPreview(null);setResetPreview(null);
     setJob(null);setRows([]);setResult(null);setHistoricalPrepare(null);setHistoricalJobId('');setDbCheck(null);
   }catch(e){setPurgeError(e instanceof Error?e.message:'Массовая очистка не выполнена')}
   finally{setPurgeBusy(false)}
 };
 const checkNameRepairs=async()=>{
   setNameBusy(true);setNameError('');setNamePreview(null);setNameReport(null);setNamePhrase('');setNameBackupOk(false);
   try{setNamePreview(await apiGet<any>('/admin/imports/historical-name-repair/preview'))}
   catch(e){setNameError(e instanceof Error?e.message:'Не удалось проверить нормализацию ФИО')}
   finally{setNameBusy(false)}
 };
 const applyNameRepairs=async()=>{
   if(!namePreview?.readOnly||!nameBackupOk||!namePreview.fingerprint||
     namePhrase!==namePreview.confirmationRequired||!Number(namePreview.counts?.safeCorrections))return;
   setNameBusy(true);setNameError('');
   try{
     const latest=await apiGet<any>('/admin/imports/historical-name-repair/preview');
     if(latest.fingerprint!==namePreview.fingerprint||
       latest.counts?.safeCorrections!==namePreview.counts.safeCorrections){
       setNamePreview(latest);setNamePhrase('');setNameBackupOk(false);
       throw new Error('Данные изменились: сверьте новый предпросмотр');
     }
     const result=await apiPost<any>('/admin/imports/historical-name-repair/execute',{
       confirmation:namePhrase,fingerprint:namePreview.fingerprint,
       expectedCount:namePreview.counts.safeCorrections,
     });
     setNameReport(result);setNamePreview(null);setNamePhrase('');setNameBackupOk(false);setParticipantInventory(null);
   }catch(e){setNameError(e instanceof Error?e.message:'Не удалось исправить ФИО')}
   finally{setNameBusy(false)}
 };
 const inspectRemainingParticipants=async()=>{
   setInventoryBusy(true);setInventoryError('');setParticipantInventory(null);
   try{setParticipantInventory(await apiGet<any>('/admin/imports/historical-orphans/diagnostics'))}
   catch(e){setInventoryError(e instanceof Error?e.message:'Не удалось получить полную сводку участников')}
   finally{setInventoryBusy(false)}
 };
 const previewOrphanCleanup=async()=>{
   setOrphanBusy(true);setOrphanError('');setOrphanPreview(null);setOrphanConfirmation('');setOrphanReport(null);
   try{setOrphanPreview(await apiGet<any>('/admin/imports/historical-orphans/preview'))}
   catch(e){setOrphanError(e instanceof Error?e.message:'Не удалось проверить оставшиеся карточки')}
   finally{setOrphanBusy(false)}
 };
 const executeOrphanCleanup=async()=>{
   const phrase='DELETE_TEST_ORPHAN_PARTICIPANTS';
   if(!orphanPreview?.readOnly||orphanConfirmation!==phrase||!orphanPreview?.fingerprint||!Number(orphanPreview?.counts?.orphanParticipantsEligibleForRemoval??0))return;
   setOrphanBusy(true);setOrphanError('');setOrphanReport(null);
   try{
     const fresh=await apiGet<any>('/admin/imports/historical-orphans/preview');
     if(fresh.fingerprint!==orphanPreview.fingerprint){
       setOrphanPreview(fresh);setOrphanConfirmation('');
       throw new Error('Состав участников изменился. Проверьте новый список и подтвердите заново.');
     }
     const data=await apiPost<any>('/admin/imports/historical-orphans/execute',{confirmation:phrase,fingerprint:orphanPreview.fingerprint});
     setOrphanReport(data);setOrphanPreview(null);setOrphanConfirmation('');
   }catch(e){setOrphanError(e instanceof Error?e.message:'Не удалось удалить оставшихся тестовых участников')}
   finally{setOrphanBusy(false)}
 };
 const prepareHistorical=async()=>{setLoading(true);setError('');setHistoricalPrepare(null);setHistoricalJobId('');try{const r=await prepareHistoricalImport();setHistoricalPrepare(r);const prepared=Array.isArray(r?.prepared)?r.prepared:[];const first=prepared[0];if(first?.importJobId){setHistoricalJobId(first.importJobId);setStageId(first.stageId);await refreshJob(first.importJobId)}const x=await apiGet('/stages');setStages(listData(x))}catch(e){setError(e instanceof Error?e.message:'Не удалось подготовить исторический XLSX импорт')}finally{setLoading(false)}}; const loadGoogle=async()=>{try{const s=await getGoogleStatus();setGoogle(s);if(s.connected){const r=await getGoogleSpreadsheets();setSpreadsheets(r.spreadsheets??[])}}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить Google')}};
 useEffect(()=>{
   const load=async()=>{
     try{
       const stageResponse=await apiGet('/stages');
       const stageList=listData(stageResponse);
       setStages(stageList);
       if(stageList[0]?.id)setStageId(stageList[0].id);
       // Preview is intentionally session-local: after F5/re-entry we start clean
       // and never reopen an old ImportJob with stale warning resolutions.
     }catch(e){
       setError(e instanceof Error?e.message:'Не удалось загрузить этапы');
     }
   };
   void load();
   void loadGoogle();

 },[]);
 useEffect(()=>{if(!spreadsheetId){setSpreadsheet(null);return}getGoogleSpreadsheet(spreadsheetId).then(r=>setSpreadsheet(r.spreadsheet)).catch(e=>setError(e instanceof Error?e.message:'Не удалось открыть таблицу'))},[spreadsheetId]);
 useEffect(()=>{if(!historicalRegistrationSpreadsheetId){setHistoricalRegistrationSpreadsheet(null);setHistoricalRegistrationSheet('');return}getGoogleSpreadsheet(historicalRegistrationSpreadsheetId).then(r=>{setHistoricalRegistrationSpreadsheet(r.spreadsheet);setHistoricalRegistrationSheet((current:string)=>current&&r.spreadsheet?.sheets?.some((s:any)=>s.title===current)?current:(r.spreadsheet?.sheets?.[0]?.title??''))}).catch(e=>setError(e instanceof Error?e.message:'Не удалось открыть таблицу регистрации'))},[historicalRegistrationSpreadsheetId]);
 useEffect(()=>{if(!historicalResultsSpreadsheetId){setHistoricalResultsSpreadsheet(null);setHistoricalResultsSheet('');return}getGoogleSpreadsheet(historicalResultsSpreadsheetId).then(r=>{setHistoricalResultsSpreadsheet(r.spreadsheet);setHistoricalResultsSheet((current:string)=>current&&r.spreadsheet?.sheets?.some((s:any)=>s.title===current)?current:(r.spreadsheet?.sheets?.[0]?.title??''))}).catch(e=>setError(e instanceof Error?e.message:'Не удалось открыть таблицу результатов'))},[historicalResultsSpreadsheetId]);
 useEffect(()=>{if(!stageId)return;const saved=historicalSheetSelections[stageId];const registration=saved?.registration&&historicalRegistrationSpreadsheet?.sheets?.some((s:any)=>s.title===saved.registration)?saved.registration:(historicalRegistrationSpreadsheet?.sheets?.[0]?.title??'');const results=saved?.results&&historicalResultsSpreadsheet?.sheets?.some((s:any)=>s.title===saved.results)?saved.results:(historicalResultsSpreadsheet?.sheets?.[0]?.title??'');setHistoricalRegistrationSheet(registration);setHistoricalResultsSheet(results);if(registration||results)setHistoricalSheetSelections(old=>({...old,[stageId]:{registration,results}}))},[stageId,historicalRegistrationSpreadsheet,historicalResultsSpreadsheet]);
 const changeMode=(next:'NORMAL'|'HISTORICAL')=>{setMode(next);setResult(null);setJob(null);setRows([]);setResolveRow(null);setResolution('{}');setError('');setHistoricalPrepare(null);setHistoricalJobId('');setUploadedFile(null);setSourcePostUrl('')};
 const preview=async()=>{
   setLoading(true);setError('');setJob(null);setRows([]);setResult(null);setResolveRow(null);setResolution('{}');setDbCheck(null);
   try{
     if(!stageId)throw new Error('Выберите этап');
     let results:any[]=[];let registrations:any[]=[];
     if(mode==='HISTORICAL'){
       if(!historicalRegistrationSpreadsheetId||!historicalResultsSpreadsheetId)throw new Error('Выберите обе Google-таблицы: «Регистрация» и «Результаты»');
       if(!historicalRegistrationSheet||!historicalResultsSheet)throw new Error('Выберите лист регистрации и лист результатов для этого этапа');
       const [regResponse,resultResponse]=await Promise.all([getGoogleSheetValues(historicalRegistrationSpreadsheetId,historicalRegistrationSheet),getGoogleSheetValues(historicalResultsSpreadsheetId,historicalResultsSheet)]);
       const regValues=Array.isArray(regResponse?.values)?regResponse.values:(Array.isArray(regResponse?.values?.values)?regResponse.values.values:[]);
       const resultValues=Array.isArray(resultResponse?.values)?resultResponse.values:(Array.isArray(resultResponse?.values?.values)?resultResponse.values.values:[]);
       registrations=sheetRows(regValues);results=resultSheetRows(resultValues);
       if(!registrations.length)throw new Error(`Лист «${historicalRegistrationSheet}» в таблице регистрации пустой или не содержит строк данных`);
       if(!results.length)throw new Error(`Лист «${historicalResultsSheet}» в таблице результатов пустой или не содержит строк данных`);
     }else{
       if(!spreadsheetId)throw new Error('Выберите Google Таблицу');
       const sheetNames=(spreadsheet?.sheets??[]).map((s:any)=>s.title);
       if(!sheetNames.includes('Результаты'))throw new Error('В таблице отсутствует лист «Результаты»');
       const resultResponse=await getGoogleSheetValues(spreadsheetId,'Результаты');
       const resultValues=Array.isArray(resultResponse?.values)?resultResponse.values:(Array.isArray(resultResponse?.values?.values)?resultResponse.values.values:[]);
       results=resultSheetRows(resultValues);
       if(!results.length)throw new Error('Лист «Результаты» пустой или не содержит строк данных');
     }
     const r=await apiPost<any>('/imports/stage/preview',{stageId,registrations,results,historicalResults:mode==='HISTORICAL',sourcePostUrl:sourcePostUrl.trim()||undefined});
     setResult(r);setJob(r.importJob);
     if(r.importJob?.id){const full=await apiGet<any>('/imports/'+r.importJob.id);setJob(full.importJob);setRows(full.importJob?.rows??[])}else setRows([]);
   }catch(e){setError(e instanceof Error?e.message:'Не удалось выполнить Preview')}finally{setLoading(false)}
 };
 const previewUploaded=async()=>{
   setLoading(true);setError('');setJob(null);setRows([]);setResult(null);setDbCheck(null);
   try{
     if(!stageId||!uploadedFile)throw new Error('Выберите этап и XLSX-файл');
     const workbook=XLSX.read(await uploadedFile.arrayBuffer(),{type:'array',cellDates:false});
     const sheetNames=workbook.SheetNames;
     if(!sheetNames.includes('Результаты'))throw new Error('В XLSX отсутствует лист «Результаты»');
     if(mode==='HISTORICAL'&&!sheetNames.includes('Регистрация'))throw new Error('Для исторического импорта в XLSX нужен лист «Регистрация»');
     const resultValues=XLSX.utils.sheet_to_json(workbook.Sheets['Результаты'],{header:1,defval:''}) as any[];
     const results=resultSheetRows(resultValues);
     if(!results.length)throw new Error('Лист «Результаты» пустой или не содержит строк данных');
     let registrations:any[]=[];
     if(mode==='HISTORICAL'){
       const regValues=XLSX.utils.sheet_to_json(workbook.Sheets['Регистрация'],{header:1,defval:''}) as any[];
       registrations=sheetRows(regValues);
       if(!registrations.length)throw new Error('Лист «Регистрация» пустой или не содержит строк данных');
     }
     const r=await apiPost<any>('/imports/stage/preview',{stageId,registrations,results,historicalResults:mode==='HISTORICAL'});
     setResult(r);setJob(r.importJob);
     if(r.importJob?.id){const full=await apiGet<any>('/imports/'+r.importJob.id);setJob(full.importJob);setRows(full.importJob?.rows??[])}
   }catch(e){setError(e instanceof Error?e.message:'Не удалось прочитать XLSX-файл')}finally{setLoading(false)}
 };
 const refreshJob=async(id:string)=>{
   try{
     const r=await apiGet<any>('/imports/'+id);
     setJob(r.importJob);setRows(r.importJob?.rows??[]);
   }catch(e){setError(e instanceof Error?e.message:'Не удалось загрузить импорт')}
 };

 const checkImportInDatabase=async()=>{if(!job?.id)return;setLoading(true);setError('');try{const r=await apiGet<any>('/imports/'+job.id+'/check');setDbCheck(r)}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить импорт в базе данных')}finally{setLoading(false)}};
 const refreshHistoricalStage=async()=>{
   setLoading(true);setError('');setJob(null);setRows([]);setResult(null);setResolveRow(null);setResolution('{}');
   try{
     const r=await prepareHistoricalImport();
     setHistoricalPrepare(r);
     const prepared=Array.isArray(r?.prepared)?r.prepared:[];
     const current=prepared.find((x:any)=>x.stageId===stageId) ?? prepared[0];
     if(current?.stageId)setStageId(current.stageId);
     if(current?.importJobId){setHistoricalJobId(current.importJobId);await refreshJob(current.importJobId)}
   }catch(e){setError(e instanceof Error?e.message:'Не удалось обновить исторический импорт')}
   finally{setLoading(false)}
 };
 const resolve=async()=>{if(!resolveRow||!job?.id)return;setLoading(true);setError('');try{await apiPatch('/imports/'+job.id+'/rows/'+resolveRow.id+'/resolve',{resolution:JSON.parse(resolution||'{}')});setResolveRow(null);await refreshJob(job.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить решение строки')}finally{setLoading(false)}};
 const commit=async()=>{if(!job?.id)return;setLoading(true);setError('');try{const committed=await apiPost<any>('/imports/'+job.id+'/commit',{});await refreshJob(job.id);if(Array.isArray(committed?.postProcessingWarnings)&&committed.postProcessingWarnings.length)setError('Импорт записан, но пересчёт требует внимания: '+committed.postProcessingWarnings.join(' · '))}catch(e){setError(e instanceof Error?e.message:'Не удалось завершить импорт')}finally{setLoading(false)}}; const resolveExistingResult=async(row:any,action:'KEEP_EXISTING'|'REPLACE')=>{if(!job?.id)return;setLoading(true);setError('');try{await apiPatch('/imports/'+job.id+'/rows/'+row.id+'/resolve',{resolution:{existingResultAction:action}});await refreshJob(job.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить решение результата')}finally{setLoading(false)}};
 const visibleRows=mode==='HISTORICAL'?rows.filter((r:any)=>r.type==='RESULT'):rows;
 const readyCount=visibleRows.filter((r:any)=>r.status==='READY').length;
 const warnCount=visibleRows.filter((r:any)=>r.status==='WARNING').length;
 const resolvedCount=visibleRows.filter((r:any)=>r.status==='RESOLVED').length;
 const resultWarnCount=visibleRows.filter((r:any)=>r.type==='RESULT'&&r.status==='WARNING').length;
 const blockingWarnCount=mode==='HISTORICAL'?resultWarnCount:warnCount;
 const resultSheet=spreadsheet?.sheets?.find((s:any)=>s.title==='Результаты'),registrationSheet=spreadsheet?.sheets?.find((s:any)=>s.title==='Регистрация');
 const errorRows=visibleRows.filter((r:any)=>r.status==='WARNING' || r.status==='RESOLVED');
 const rowErrors=errorRows.flatMap((r:any)=>{
   const values=Array.isArray(r.warnings)?r.warnings.map((message:any)=>({row:r.rowNumber,message:String(message)})):[r.warnings].filter(Boolean).map((message:any)=>({row:r.rowNumber,message:String(message)}));
   return values;
 });
 return <PageFrame title="Импорт" showHelp={false} subtitle="Импорт из Google Таблиц или XLSX из публикаций VK: сначала проверка, затем исправление предупреждений и только после этого запись в чемпионат." action={job?.id?<button className="secondary-button compact" onClick={()=>{setJob(null);setRows([]);setResult(null);setResolveRow(null);setResolution('{}');void preview()}}><RefreshCw size={14}/>{mode==='NORMAL'?'Перечитать таблицу и обновить предпросмотр':'Перечитать листы и обновить предпросмотр'}</button>:undefined}>
  <div className="import-steps"><div className="import-step active"><b>1</b><span>Источник и этап</span></div><div className="import-step"><b>2</b><span>Проверка</span></div><div className="import-step"><b>3</b><span>Исправление</span></div><div className="import-step"><b>4</b><span>Завершение импорта</span></div></div>
  <div className="notice"><FileInput size={17}/><div><strong>Исторический импорт:</strong> источником истины является только <b>Результаты</b>. Лист <b>Регистрация</b> используется только как справочник. Строки из «Регистрация» не попадают в очередь исправлений и сами по себе ничего не создают.</div></div>
  {mode==='HISTORICAL'&&<section className="panel" aria-label="Нормализация ФИО участников">
    <div className="resource-editor-heading"><div><strong>Нормализация ФИО · исправление тестовых карточек</strong>
    <p>Проверка имён уже записанных участников. Разрешены только однозначные исправления транслитерации и известных ошибок имени. Дубли, псевдонимы и сомнительные фамилии выделяются отдельно и не объединяются.</p></div></div>
    <button type="button" className="secondary-button" disabled={nameBusy} onClick={()=>void checkNameRepairs()}>{nameBusy?'Проверка…':'Проверить и показать исправления ФИО'}</button>
    {nameError&&<div className="form-error" role="alert"><AlertTriangle size={16}/>{nameError}</div>}
    {nameReport&&<div className="notice" role="status"><Check size={16}/><div><strong>Исправление завершено</strong><p>Исправлено ФИО: {nameReport.fixed??0}; оставлено для ручной проверки: {nameReport.skippedForReview??0}. Участники не объединялись.</p></div></div>}
    {namePreview&&<div className="import-example">
      <strong>Предпросмотр без изменений базы</strong>
      <p>Всего участников: {namePreview.counts?.totalParticipants??0}; <b>безопасных исправлений:</b> {namePreview.counts?.safeCorrections??0}; <b>требуют проверки:</b> {namePreview.counts?.requiresReview??0}; с аккаунтами: {namePreview.counts?.accountLinked??0}; защищённых архивных названий: {namePreview.counts?.archivalAliasesProtected??0}.</p>
      <div className="notice"><AlertTriangle size={16}/><div>Это исправление написания существующих карточек. Оно не удаляет людей, не объединяет дубли и не изменяет результаты выступлений. Сомнительные фамилии нужно проверить отдельно.</div></div>
      <details><summary>Список исправлений · до 150</summary><ul>{(namePreview.examples?.safe??[]).map((item:any,i:number)=><li key={i}>{item.before} → <b>{item.after}</b></li>)}</ul></details>
      <details><summary>Нужна ручная проверка · до 150</summary><ul>{(namePreview.examples?.review??[]).map((item:any,i:number)=><li key={i}><b>{item.name}</b> · {item.reason}{item.suggested!==item.name?' · вариант: '+item.suggested:''}</li>)}</ul></details>
      {Number(namePreview.counts?.safeCorrections??0)>0&&<>
        <div className="notice"><AlertTriangle size={16}/><div><strong>Перед записью проверь резервную копию PostgreSQL.</strong><p>Для этой тестовой операции сервер требует ALLOW_HISTORICAL_IMPORT_RESET=true и ALLOW_TEST_NAME_REPAIR=true. После исправлений оба временных разрешения нужно отключить.</p></div></div>
        <label className="field-check"><input type="checkbox" checked={nameBackupOk} onChange={e=>setNameBackupOk(e.target.checked)}/><span>Независимая резервная копия проверена, список исправлений просмотрен</span></label>
        <label>Контрольная фраза: <b>{namePreview.confirmationRequired}</b><input autoComplete="off" spellCheck={false} type="text" value={namePhrase} onChange={e=>setNamePhrase(e.target.value)} placeholder={namePreview.confirmationRequired}/></label>
        <button className="secondary-button" type="button" disabled={nameBusy||!nameBackupOk||namePhrase!==namePreview.confirmationRequired} onClick={()=>void applyNameRepairs()}>Исправить {namePreview.counts.safeCorrections} ФИО (без объединения участников)</button>
      </>}
    </div>}
  </section>}
  {mode==='HISTORICAL'&&<section className="panel" aria-label="Полная очистка тестовых участников без аккаунтов">
   <div className="resource-editor-heading"><div><strong>Полная очистка тестовых участников без аккаунтов</strong>
   <p>Для повторного импорта удаляем всех участников без аккаунтов и регистраций — вместе с их автомобилями, связанными рекордами и тестовыми инспекциями. Привязанные к аккаунтам люди и зарегистрированные участники не затрагиваются. Это отличается от узкой очистки сирот ниже.</p></div></div>
   <button type="button" className="secondary-button" disabled={purgeBusy} onClick={()=>void previewUnclaimedPurge()}>{purgeBusy?'Проверяем все связи…':'Рассчитать полную очистку без удаления'}</button>
   {purgeError&&<div className="form-error" role="alert"><AlertTriangle size={16}/>{purgeError}</div>}
   {purgeReport&&<div className="notice" role="status"><Check size={16}/><div><strong>Полная тестовая очистка завершена</strong><p>Удалено участников: {purgeReport.deletedParticipants??0}; машин: {purgeReport.deletedCars??0}; записей рекордов: {purgeReport.deletedRecords??0}; дисквалификаций: {purgeReport.deletedDisqualifications??0}; инспекций: {purgeReport.deletedStageInspections??0}.</p>{Array.isArray(purgeReport.recordWarnings)&&purgeReport.recordWarnings.length>0&&<p>Предупреждения пересчёта: {purgeReport.recordWarnings.join('; ')}</p>}</div></div>}
   {purgePreview&&<div className="import-example">
     <strong>Предпросмотр · без удаления</strong>
     <p><b>Участников:</b> {purgePreview.counts?.participants??0}; <b>автомобилей:</b> {purgePreview.counts?.cars??0}; <b>связанных рекордов:</b> {purgePreview.counts?.linkedRecords??0}, включая {purgePreview.counts?.manualRecordOverrides??0} ручных рекордов.</p>
     <p>Связанных дисквалификаций: {purgePreview.counts?.disqualifications??0}; инспекций: {purgePreview.counts?.stageInspections??0}; фото-ссылок во внешнем хранилище: {purgePreview.counts?.mediaLinksNotDeleted??0}.</p>
     <p>Защита: записи с живыми результатами {purgePreview.blocking?.recordsWithLiveResults??0}; связи с чужими участниками/автомобилями {purgePreview.blocking?.recordsLinkingOtherParticipantsOrCars??0}; занятые версии конфигураций {purgePreview.blocking?.carOrConfigurationRegistrations??0}; ссылки из других задач импорта {purgePreview.blocking?.activeImportRowReferences??0}.</p>
     {Array.isArray(purgePreview.examples)&&purgePreview.examples.length>0&&<details><summary>Первые 25 участников из выбранной группы</summary><ul>{purgePreview.examples.map((p:any,i:number)=><li key={i}>{p.name||'Без имени'} · автомобилей: {p.cars??0}</li>)}</ul></details>}
     {!purgePreview.allowed?<div className="form-error" role="alert"><AlertTriangle size={16}/>Обнаружены опасные внешние связи. Удаление всей группы заблокировано на сервере. Нужен отдельный разбор зависимостей.</div>:
      <div className="notice"><AlertTriangle size={16}/><div><strong>Необратимая операция. Только для тестовой базы!</strong>
       <p>Вместе с профилями удалятся связанные записи рекордов, включая созданные вручную. Обычные аккаунты, этапы и справочники останутся. Перед удалением нужна независимо сохранённая и проверенная резервная копия PostgreSQL.</p>
       <label className="field-check"><input type="checkbox" checked={purgeBackupConfirmed} onChange={e=>setPurgeBackupConfirmed(e.target.checked)}/><span>Я проверил независимую резервную копию и понимаю, что удаляются ВСЕ незарегистрированные профили без аккаунтов, не только исторические.</span></label>
       <label>Для подтверждения введите точную фразу <b>{purgePreview.confirmationRequired}</b><input type="text" autoComplete="off" spellCheck={false} value={purgePhrase} onChange={e=>setPurgePhrase(e.target.value)} placeholder={purgePreview.confirmationRequired}/></label>
       <button type="button" className="secondary-button" disabled={purgeBusy||!purgeBackupConfirmed||purgePhrase!==purgePreview.confirmationRequired||!Number(purgePreview.counts?.participants??0)} onClick={()=>void executeUnclaimedPurge()}>Удалить {purgePreview.counts?.participants??0} тестовых участников и связанные данные</button>
       <p>Если сервер отказывает: администратору нужны временные разрешения ALLOW_HISTORICAL_IMPORT_RESET=true и ALLOW_TEST_UNCLAIMED_PROFILE_PURGE=true. После очистки отключите оба.</p>
      </div></div>}
   </div>}
  </section>}
  {mode==='HISTORICAL'&&<section className="panel" aria-label="Сводка участников после очистки истории">
    <div className="resource-editor-heading"><div><strong>Диагностика · куда делись остальные исторические участники?</strong><p>Предыдущий предпросмотр показывал только людей БЕЗ регистраций. Это не полный список старых участников. Ниже — общая сводка базы по аккаунтам и типам регистраций. Просмотр не меняет данные.</p></div></div>
    <button type="button" className="secondary-button" disabled={inventoryBusy} onClick={()=>void inspectRemainingParticipants()}>{inventoryBusy?'Проверяем связи…':'Показать всех участников и связи'}</button>
    {inventoryError&&<div className="form-error" role="alert"><AlertTriangle size={16}/>{inventoryError}</div>}
    {participantInventory&&<div className="import-example">
      <strong>Полная сводка · только чтение</strong>
      <p>Всего участников: {participantInventory.counts?.totalParticipants??0}; привязаны к аккаунтам: {participantInventory.counts?.linkedToUserAccounts??0}; без аккаунтов: {participantInventory.counts?.withoutUserAccounts??0}.</p>
      <p><b>Без регистраций:</b> {participantInventory.counts?.withoutRegistrations??0}; <b>только регистрации IMPORT:</b> {participantInventory.counts?.withImportOnlyRegistrations??0}; <b>только другие регистрации:</b> {participantInventory.counts?.withOtherOnlyRegistrations??0}; <b>смешанные:</b> {participantInventory.counts?.withMixedRegistrations??0}.</p>
      <p>Регистраций с источником IMPORT у людей без аккаунтов: {participantInventory.counts?.importRegistrationsOnUnclaimedProfiles??0}; остальных регистраций: {participantInventory.counts?.otherRegistrationsOnUnclaimedProfiles??0}; профилей с защищённой историей: {participantInventory.counts?.unclaimedWithProtectedHistory??0}.</p>
      <div className="notice"><AlertTriangle size={16}/><div>Метка IMPORT означает источник регистрации, но не доказывает, что участник создан именно старым историческим импортом. Удалять такие группы автоматически нельзя.</div></div>
      {([
        ['importOnly','Участники только с импортными регистрациями'],
        ['mixed','Участники со смешанными регистрациями'],
        ['otherOnly','Участники только с другими регистрациями'],
        ['noRegistrations','Участники без регистраций'],
      ] as const).map(([key,label])=><details key={key}><summary>{label} · примеры (до 20)</summary>
        <ul>{(participantInventory.examples?.[key]??[]).map((person:any)=><li key={person.id}><b>{person.name||'Без имени'}</b> · машин {person.cars}; регистраций IMPORT {person.importRegistrations}, других {person.otherRegistrations}{person.hasProtectedHistory?' · есть защищённые связи':''}{Array.isArray(person.stages)&&person.stages.length>0?<small> · {person.stages.join('; ')}</small>:null}</li>)}</ul>
      </details>)}
      <p><b>Следующий шаг:</b> определить, какие категории можно безопасно пересоздать из таблиц «Результаты». Эта диагностика ничего не удаляет.</p>
    </div>}
  </section>}
  {mode==='HISTORICAL'&&<section className="panel" aria-label="Очистка оставшихся участников">
    <div className="resource-editor-heading"><div><strong>Узкая очистка · только участники без регистраций</strong>
    <p>Этот раздел НЕ удаляет всех исторических участников. Он находит только карточки без единой регистрации и без аккаунта, в том числе созданные вручную. Источник их создания после удаления журнала импортов определить нельзя.</p>
    </div></div>
    <button type="button" className="secondary-button" disabled={orphanBusy} onClick={()=>void previewOrphanCleanup()}>{orphanBusy?'Проверяем…':'Проверить оставшихся участников без удаления'}</button>
    {orphanError&&<div className="form-error" role="alert"><AlertTriangle size={16}/>{orphanError}</div>}
    {orphanReport&&<div className="notice" role="status"><Check size={16}/><div><strong>Дополнительная очистка завершена.</strong><p>Удалено участников: {orphanReport.deletedParticipants??0}; автомобилей: {orphanReport.deletedCars??0}. Аккаунты, этапы и справочники сохранены.</p></div></div>}
    {orphanPreview&&<div className="import-example">
     <strong>План дополнительной очистки (без изменений БД)</strong>
     <p>Участников к удалению: {orphanPreview.counts?.orphanParticipantsEligibleForRemoval??0}; автомобилей: {orphanPreview.counts?.orphanCarsEligibleForRemoval??0}; среди автомобилей публичных: {orphanPreview.counts?.publicCarsAmongCandidates??0}; с неархивными конфигурациями: {orphanPreview.counts?.carsWithNonLegacyConfigurations??0}. Дополнительно защищено по связям с рекордами: {orphanPreview.counts?.orphanProfilesProtectedByRecords??0}.</p>
     {Array.isArray(orphanPreview.examples)&&orphanPreview.examples.length>0&&<details><summary>Показать примеры участников (до 20 ФИО)</summary><ul>{orphanPreview.examples.map((person:any,index:number)=><li key={index}>{person.name||'Без имени'} · машин: {person.cars??0}</li>)}</ul></details>}
     <div className="notice"><AlertTriangle size={16}/><div><strong>Внимание: это более широкая очистка, чем удаление исторического импорта.</strong><p>Могут быть удалены созданные вручную профили без аккаунтов и регистраций. Не запускайте без независимой резервной копии и проверки количества/примеров. Профили с регистрациями, рекордами, инспекциями и аккаунтами защищены.</p>
     {Number(orphanPreview.counts?.orphanParticipantsEligibleForRemoval??0)>0?<><label>Отдельная контрольная фраза<input type="text" autoComplete="off" spellCheck={false} value={orphanConfirmation} onChange={e=>setOrphanConfirmation(e.target.value)} placeholder="DELETE_TEST_ORPHAN_PARTICIPANTS"/></label>
     <button type="button" className="secondary-button" disabled={orphanBusy||orphanConfirmation!=='DELETE_TEST_ORPHAN_PARTICIPANTS'} onClick={()=>void executeOrphanCleanup()}>Удалить показанных незарегистрированных участников и машины</button></>:<p>Подходящих карточек нет. Если участники остались, у них имеются защищённые связи — их нельзя удалять автоматически.</p>}</div></div>
    </div>}
   </section>}
  {mode==='HISTORICAL'&&<section className="panel" aria-label="Очистка прежнего исторического импорта">
   <div className="resource-editor-heading"><div><strong>Шаг 0 · Очистка прежнего тестового импорта</strong><p>Перед повторным импортом можно проверить, какие исторические записи созданы прежними загрузками. Предпросмотр ничего не удаляет. Обычные регистрации, аккаунты, этапы и справочники сохраняются.</p></div></div>
   <div className="resolution-buttons"><button type="button" className="secondary-button" disabled={resetBusy} onClick={()=>void previewHistoricalReset()}>{resetBusy?'Проверяем…':'Проверить прежний импорт (без удаления)'}</button></div>
   {resetError&&<p className="form-error" role="alert"><AlertTriangle size={16}/>{resetError}</p>}
   {resetReport&&<div className="notice" role="status"><Check size={16}/><div><strong>Очистка тестовой истории завершена.</strong><p>Удалено импортированных регистраций: {resetReport.deletedImportedRegistrations??0}; записей рекордов: {resetReport.deletedRecords??0}; машин: {resetReport.deletedOrphanCars??0}; участников: {resetReport.deletedOrphanParticipants??0}. Теперь можно заново запускать исторический импорт.</p>{Array.isArray(resetReport.postProcessingWarnings)&&resetReport.postProcessingWarnings.length>0&&<p>Предупреждения пересчёта рекордов: {resetReport.postProcessingWarnings.join('; ')}</p>}</div></div>}
   {resetPreview&&<div className="import-example">
     <strong>Предпросмотр удаления · {resetPreview.counts?.historicalImportJobs??0} исторических загрузок</strong>
     <p>Регистраций: {resetPreview.counts?.importedRegistrations??0}; результатов: {resetPreview.counts?.results??0}; связанных рекордов: {resetPreview.counts?.recordsLinkedToThoseResults??0}; машин-кандидатов: {resetPreview.counts?.orphanCarsEligibleForRemoval??0}; участников-кандидатов: {resetPreview.counts?.orphanParticipantsEligibleForRemoval??0}.</p>
     <p>Защищено регистраций, связанных с другими импортами или ручными результатами: {resetPreview.counts?.registrationsProtectedByOtherImportsOrManualResults??0}.</p>
     {Array.isArray(resetPreview.stages)&&resetPreview.stages.length>0&&<details><summary>Затронутые этапы ({resetPreview.counts?.affectedStages??0})</summary><ul>{resetPreview.stages.map((stage:any,index:number)=><li key={String(stage.importJobId??index)}>{stage.seasonYear} · этап №{stage.stageNumber} · {stage.name}</li>)}</ul></details>}
     {Number(resetPreview.counts?.historicalImportJobs??0)>0?<div className="notice"><AlertTriangle size={16}/><div><strong>Необратимое действие: только для тестовой БД с резервной копией.</strong><p>После проверки этапов введите точную контрольную фразу. Если сервер не разрешает тестовую очистку, запрос будет отклонён. Ничего не удаляем без отдельного нажатия.</p>
      <label>Контрольная фраза<input type="text" autoComplete="off" spellCheck={false} value={resetConfirmation} onChange={e=>setResetConfirmation(e.target.value)} placeholder="RESET_HISTORICAL_IMPORT_TEST_DATA"/></label>
      <button type="button" className="secondary-button" disabled={resetBusy||resetConfirmation!=='RESET_HISTORICAL_IMPORT_TEST_DATA'} onClick={()=>void executeHistoricalReset()}>Удалить только ранее импортированные исторические записи</button>
     </div></div>:<p>Завершённых исторических импортов для очистки не найдено.</p>}
   </div>}
  </section>}
  <div className="import-grid">
   <div className="panel form">
    <div className="segmented"><button className={mode==='NORMAL'?'selected':''} onClick={()=>changeMode('NORMAL')}>Обычный импорт</button><button className={mode==='HISTORICAL'?'selected':''} onClick={()=>changeMode('HISTORICAL')}>Исторический</button></div>{mode==='HISTORICAL'&&<div className="notice historical-source-action"><div><strong>Исторический импорт из двух Google-таблиц</strong><br/><span>Выберите общую таблицу регистрации и общую таблицу результатов, затем листы для выбранного этапа. Исправляйте данные в Google Sheets и перечитывайте их здесь.</span></div></div>}
    {!google?.connected?<div className="notice"><AlertTriangle size={16}/><span>Google аккаунт ещё не подключён.</span><button className="primary-button compact" onClick={()=>void connectGoogle()}>Подключить Google</button></div>:<div className="notice"><Check size={16}/><span>Подключён: <strong>{google.email}</strong></span></div>}
    <label>Этап<select value={stageId} onChange={e=>{setStageId(e.target.value);setJob(null);setRows([]);setResult(null);setResolveRow(null);setResolution('{}');setDbCheck(null);setError('')}}><option value="">Выберите этап</option>{stages.map(s=><option key={s.id} value={s.id}>#{s.stageNumber} · {s.name} · {s.city||'—'}</option>)}</select></label>
    {mode==='HISTORICAL'?<>
      <label>Google-таблица «Регистрация»<select value={historicalRegistrationSpreadsheetId} onChange={e=>{setHistoricalRegistrationSpreadsheetId(e.target.value);setJob(null);setRows([]);setResult(null);setError('')}} disabled={!google?.connected}><option value="">Выберите таблицу регистрации</option>{spreadsheets.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {historicalRegistrationSpreadsheet&&<div className="import-example"><b>{historicalRegistrationSpreadsheet.title}</b><br/><a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(historicalRegistrationSpreadsheetId)}/edit`} target="_blank" rel="noreferrer">Открыть и редактировать таблицу регистрации ↗</a><label>Лист регистрации для этапа<select value={historicalRegistrationSheet} onChange={e=>{const value=e.target.value;setHistoricalRegistrationSheet(value);if(stageId)setHistoricalSheetSelections(old=>({...old,[stageId]:{registration:value,results:old[stageId]?.results??historicalResultsSheet}}));setJob(null);setRows([]);setResult(null)}}><option value="">Выберите лист</option>{(historicalRegistrationSpreadsheet.sheets??[]).map((s:any)=><option key={s.id} value={s.title}>{s.title}</option>)}</select></label></div>}
      <label>Google-таблица «Результаты»<select value={historicalResultsSpreadsheetId} onChange={e=>{setHistoricalResultsSpreadsheetId(e.target.value);setJob(null);setRows([]);setResult(null);setError('')}} disabled={!google?.connected}><option value="">Выберите таблицу результатов</option>{spreadsheets.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      {historicalResultsSpreadsheet&&<div className="import-example"><b>{historicalResultsSpreadsheet.title}</b><br/><a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(historicalResultsSpreadsheetId)}/edit`} target="_blank" rel="noreferrer">Открыть и редактировать таблицу результатов ↗</a><label>Лист результатов для этапа<select value={historicalResultsSheet} onChange={e=>{const value=e.target.value;setHistoricalResultsSheet(value);if(stageId)setHistoricalSheetSelections(old=>({...old,[stageId]:{registration:old[stageId]?.registration??historicalRegistrationSheet,results:value}}));setJob(null);setRows([]);setResult(null)}}><option value="">Выберите лист</option>{(historicalResultsSpreadsheet.sheets??[]).map((s:any)=><option key={s.id} value={s.title}>{s.title}</option>)}</select></label></div>}
    </>:<label>Google Таблица<select value={spreadsheetId} onChange={e=>{setSpreadsheetId(e.target.value);setUploadedFile(null);setSourcePostUrl('');setJob(null);setRows([]);setResult(null);setResolveRow(null);setResolution('{}');setDbCheck(null);setError('')}} disabled={!google?.connected}><option value="">Выберите таблицу</option>{spreadsheets.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}{mode==='HISTORICAL'&&<div className="settings-help">Выше выберите листы, соответствующие выбранному этапу. Ссылки на обе таблицы открывают их в Google Sheets, где можно исправить исходные данные. После сохранения вернитесь сюда и перечитайте листы. Исторические результаты не публикуются автоматически: импорт остаётся на проверке администратора.</div>}<label>Или загрузить XLSX из публикации VK<input type="file" accept=".xlsx,.xls,.xlsm" onChange={e=>{setUploadedFile(e.target.files?.[0]??null);setSourcePostUrl('');setSpreadsheetId('');setSpreadsheet(null);setJob(null);setRows([]);setResult(null);setDbCheck(null)}}/></label>{mode==='HISTORICAL'&&<label>Ссылка на публикацию VK (для аудита)<input type="url" value={sourcePostUrl} onChange={e=>setSourcePostUrl(e.target.value)} placeholder="https://vk.com/wall-…" /></label>}{uploadedFile&&<div className="notice"><FileInput size={16}/><span>Файл: <strong>{uploadedFile.name}</strong>. Перед записью строки будут проверены на конфликты.</span></div>}
    {mode==='NORMAL'&&spreadsheet&&<div className="import-example"><b>{spreadsheet.title}</b><br/>Результаты: {resultSheet?'найден':'не найден'}<br/><a href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(spreadsheetId)}/edit`} target="_blank" rel="noreferrer">Открыть исходную Google-таблицу ↗</a><small className="table-sub">После исправления данных в таблице вернитесь сюда и нажмите «Перечитать таблицу и обновить предпросмотр».</small></div>}
    <button className="primary-button" disabled={loading||!stageId||!google?.connected||(mode==='HISTORICAL'?(!historicalRegistrationSpreadsheetId||!historicalResultsSpreadsheetId||!historicalRegistrationSheet||!historicalResultsSheet):!spreadsheetId)} onClick={()=>void preview()}>{loading?'Загружаем и проверяем…':mode==='HISTORICAL'?'Прочитать выбранные листы и проверить':'1. Загрузить и запустить проверку'}</button>{uploadedFile&&<button className="primary-button" disabled={loading||!stageId} onClick={()=>void previewUploaded()}>{loading?'Читаем XLSX и проверяем…':mode==='HISTORICAL'?'Проверить исторический XLSX':'Проверить XLSX-импорт'}</button>}{mode==='HISTORICAL'&&<div className="settings-help">Для каждого этапа выберите соответствующие листы в обеих таблицах. Повторная проверка перечитывает актуальные данные. Лист регистрации служит справочником; лист результатов — источником исторических результатов.</div>}
    {error&&<div className="form-error"><AlertTriangle size={16}/>{error}</div>}
   </div>
   <div className="panel"><PanelTitle title="Результат проверки" icon={FileInput}/>
    {job?<><div className="import-summary"><div><b>{readyCount}</b><span>готово</span></div><div className="warning"><b>{warnCount}</b><span>нужно исправить</span></div><div className="resolved"><b>{resolvedCount}</b><span>исправлено</span></div>{mode==='HISTORICAL'?<><div className="good"><b>{visibleRows.filter((r:any)=>r.normalizedData?.participantNumberSource==='REGISTRATION').length}</b><span>номер из регистрации</span></div><div><b>{visibleRows.filter((r:any)=>r.normalizedData?.participantNumberSource==='RESULT'||r.normalizedData?.participantNumberSource==='BOTH').length}</b><span>номер из результатов</span></div><div className="warning"><b>{visibleRows.filter((r:any)=>r.normalizedData?.participantNumberSource==='NONE'&&r.status==='READY').length}</b><span>номер авто</span></div></>:<div><b>{visibleRows.length}</b><span>строк в работе</span></div>}</div>
      <div className="import-job-line">Состояние импорта: <strong>{enumLabel(job.status)}</strong></div>
      {rowErrors.length>0&&<div className="panel import-errors-panel"><PanelTitle title={`Ошибки по строкам · ${rowErrors.length}`} icon={AlertTriangle}/><div className="import-errors-list">{rowErrors.map((e:any,i:number)=><div className="import-error-item" key={`${e.row}-${i}`}><span className="badge warning">Строка {e.row}</span><span>{e.message}</span></div>)}</div></div>}
      <div className="import-rows">{visibleRows.slice(0,200).map((r:any,i:number)=><div className="import-row" key={r.id??i}><span className={`import-row-status ${String(r.status).toLowerCase()}`}>{enumLabel(r.status)}</span><span className="import-row-main"><b>{r.type==='REGISTRATION'?'Регистрация':'Результат'} · строка {r.rowNumber}</b><small>{Array.isArray(r.warnings)?r.warnings.join(' · '):typeof r.warnings==='object'?JSON.stringify(r.warnings):r.warnings||'Ошибок нет'}</small>{mode==='HISTORICAL'&&r.type==='RESULT'&&<small className="table-sub">Виброизоляция из «Регистрация»: <strong>{r.normalizedData?.car?.vibrationIsolation||'Не указана'}</strong></small>}{mode==='HISTORICAL'&&r.type==='RESULT'&&<small className="table-sub">{r.normalizedData?.participantNumberSource==='REGISTRATION'?'Номер взят из «Регистрация»':r.normalizedData?.participantNumberSource==='RESULT'?'Номер взят из «Результаты»':r.normalizedData?.participantNumberSource==='BOTH'?'Номер совпал в обоих листах':r.normalizedData?.participantNumberSource==='AUTO'?'Номер выдан автоматически':'Номер будет определён при commit'}{r.normalizedData?.car?.model||r.normalizedData?.car?.plateNumber?' · Авто из справочника':''}{r.normalizedData?.class?.isBassRace&&r.normalizedData?.classNumberSource==='AUTO'?' · Доп. номер Bass Race №'+String(r.normalizedData.classParticipantNumber).padStart(3,'0')+' (автоматически)':''}</small>}</span>{r.status==='WARNING'&&r.type==='RESULT'&&r.normalizedData?.existingResult?.state&&r.normalizedData.existingResult.state!=='NONE'&&<><button className="secondary-button compact" disabled={loading} onClick={()=>void resolveExistingResult(r,'KEEP_EXISTING')}>Оставить текущий</button><button className="secondary-button compact" disabled={loading} onClick={()=>void resolveExistingResult(r,'REPLACE')}>Заменить</button></>}{(r.status==='WARNING'||r.status==='RESOLVED')&&(!r.normalizedData?.existingResult?.state||r.normalizedData?.existingResult?.state==='NONE')&&(mode!=='HISTORICAL'||r.type==='RESULT')&&<button className="secondary-button compact" onClick={()=>{setResolveRow(r);setResolution(r.resolution?JSON.stringify(r.resolution,null,2):JSON.stringify({},null,2))}}>{r.status==='RESOLVED'?'Изменить решение':'Исправить'}</button>}</div>)}</div>
      {blockingWarnCount===0&&job.status==='DRAFT'&&<button className="primary-button" disabled={loading} onClick={()=>void commit()}>4. Подтвердить и записать импорт</button>}
      {blockingWarnCount>0&&<div className="notice"><AlertTriangle size={16}/><span>{mode==='HISTORICAL'?'Исправьте предупреждения в строках результатов. Лист «Регистрация» используется только как справочник и сам по себе ничего не создаёт.':'Есть предупреждения. Пока остаётся хотя бы один WARNING — запись заблокирована.'}</span></div>}
      {job.status==='COMMITTED'&&job.metadata?.historicalResults===true&&<div className="notice"><Check size={17}/><span>Архив записан в базу. Исторические результаты пока ожидают подтверждения и не появятся публично, пока администратор не подтвердит их. После импорта откройте <a href="/admin/historical-results">«История результатов»</a> и нажмите «Подтвердить все».{job.metadata?.sourcePostUrl&&<small className="table-sub"><a href={job.metadata.sourcePostUrl} target="_blank" rel="noreferrer">Открыть публикацию VK</a></small>}</span></div>}{job.status==='COMMITTED'&&job.metadata?.historicalResults!==true&&<div className="notice"><Check size={17}/><span>Импорт успешно записан в базу USD. Пересчёт рейтингов и рекордов выполнен для затронутых классов, если ниже не указаны предупреждения.</span></div>}
      {job.status==='COMMITTED'&&<div className="panel import-db-check"><PanelTitle title="Проверка фактической записи" icon={Check}/><p className="settings-help">Проверяем не сообщение об успехе, а реальные записи, которые сейчас читаются из базы данных.</p><button className="secondary-button compact" disabled={loading} onClick={()=>void checkImportInDatabase()}>{loading?'Проверяем базу…':'Проверить импорт в БД'}</button>{dbCheck?.importJobId===job.id&&<div className="import-summary"><div><b>{dbCheck.rows??0}</b><span>строк импорта</span></div><div><b>{dbCheck.participants?.length??0}</b><span>участников</span></div><div><b>{dbCheck.registrations?.length??0}</b><span>регистраций</span></div><div><b>{dbCheck.results?.length??0}</b><span>результатов</span></div><div><b>{dbCheck.records?.length??0}</b><span>связей с рекордами</span></div><div><b>{dbCheck.results?.filter((r:any)=>r.isHistorical&&r.verificationStatus==='PENDING').length??0}</b><span>исторических ожидают подтверждения</span></div><div><b>{dbCheck.results?.filter((r:any)=>r.isHistorical&&r.verificationStatus==='VERIFIED').length??0}</b><span>исторических подтверждено</span></div></div>}</div>}
    </>:<Empty text="После Preview здесь появится отчёт по каждой строке"/>}
   </div>
  </div>
  {resolveRow&&<ImportResolutionModal row={resolveRow} stageId={stageId} mode={mode} resolution={resolution} setResolution={setResolution} loading={loading} onClose={()=>setResolveRow(null)} onSave={async()=>{await resolve()}}/>}
 </PageFrame>
}

function ImportResolutionModal({row,stageId,mode,resolution,setResolution,loading,onClose,onSave}:{row:any;stageId:string;mode:'NORMAL'|'HISTORICAL';resolution:string;setResolution:(v:string)=>void;loading:boolean;onClose:()=>void;onSave:()=>Promise<void>}){
 const[data,setData]=useState<any[]>([]),[cars,setCars]=useState<any[]>([]),[registrations,setRegistrations]=useState<any[]>([]),[classes,setClasses]=useState<any[]>([]),[loadingOptions,setLoadingOptions]=useState(true),[localError,setLocalError]=useState('');
 const parsed=useMemo(()=>{try{return JSON.parse(resolution||'{}')}catch{return {}}},[resolution]);
 const raw=row.rawData??{}, normalized=row.normalizedData??{};
 const resultParticipant=normalized.participant?.matches?.[0]??null;
 const participantName=normalized.participant?.rawName??raw['ФИО']??raw['Фамилия и имя']??'';
 const participantNumber=normalized.participantNumber??normalized.resultParticipantNumber??raw['Номер']??raw['Номер участника']??'';
 const setPart=(patch:any)=>setResolution(JSON.stringify({...parsed,participant:{...(parsed.participant??{}),...patch}},null,2));
 const setReg=(patch:any)=>setResolution(JSON.stringify({...parsed,registration:{...(parsed.registration??{}),...patch}},null,2));
 const setCar=(patch:any)=>setResolution(JSON.stringify({...parsed,car:{...(parsed.car??{}),...patch}},null,2));
 const setClass=(classId:string)=>setResolution(JSON.stringify({...parsed,classId},null,2));
 const setResultField=(patch:any)=>setResolution(JSON.stringify({...parsed,...patch},null,2));

 useEffect(()=>{let cancelled=false;setLoadingOptions(true);Promise.all([
   apiGet<any>('/participants'),
   apiGet<any>('/cars'),
   apiGet<any>('/registrations?stageId='+encodeURIComponent(stageId)),
   apiGet<any>('/classes')
 ]).then(([p,c,r,cl])=>{if(cancelled)return;setData(listData(p));setCars(listData(c));setRegistrations(listData(r));setClasses(listData(cl))}).catch(e=>setLocalError(e instanceof Error?e.message:'Не удалось загрузить варианты для решения')).finally(()=>{if(!cancelled)setLoadingOptions(false)});return()=>{cancelled=true}},[stageId]);

 const participantCandidates=useMemo(()=>{
   const q=String(participantName).trim().toLowerCase();
   const n=Number(participantNumber);
   return data.filter(p=>{
     const name=[p.lastName,p.firstName,p.middleName].filter(Boolean).join(' ').toLowerCase();
     return (q&&name.includes(q))||(Number.isFinite(n)&&n>0&&p.participantNumber===n);
   }).slice(0,8);
 },[data,participantName,participantNumber]);

 const selectedParticipantId=parsed.participant?.participantId;
 const selectedParticipant=data.find(p=>p.id===selectedParticipantId);
 const selectedRegistrationId=parsed.registration?.registrationId;
 const selectedRegistration=registrations.find(r=>r.id===selectedRegistrationId);
 const registrationAction=parsed.registration?.action;
 const resolvedParticipantNumber=Number(parsed.registration?.participantNumber??participantNumber);
 const displayParticipantNumber=Number.isInteger(resolvedParticipantNumber)&&resolvedParticipantNumber>0?String(resolvedParticipantNumber).padStart(3,'0'):'—';
 const carCandidates=cars.filter(c=>!selectedParticipantId||c.participantId===selectedParticipantId).slice(0,8);
 const registrationCandidates=registrations.filter(r=>{
   const n=Number(participantNumber);
   return (Number.isFinite(n)&&n>0&&r.participantNumber===n)||(
     selectedParticipantId&&r.participantId===selectedParticipantId
   );
 }).slice(0,8);

 const createParticipant=()=>setPart({action:'CREATE',fullName:String(participantName).trim(),team:String(raw['Команда']??'').trim()||null,email:String(raw['Email']??'').trim()||null});
 const createArchiveAlias=()=>setPart({action:'CREATE_ALIAS',fullName:String(participantName).trim(),team:null,email:null});
 const useParticipant=(p:any)=>setPart({action:'USE_EXISTING',participantId:p.id});
 const createRegistration=()=>setReg({action:'CREATE',participantNumber:Number(participantNumber)});
 const useRegistration=(r:any)=>setReg({action:'USE_EXISTING',registrationId:r.id,participantNumber:r.participantNumber});
 const createCar=()=>setCar({action:'CREATE',brand:String(raw['Марка автомобиля']??raw['Марка']??'').trim()||undefined,model:String(raw['Модель автомобиля']??raw['Модель']??'').trim()||undefined,registrationNumber:String(raw['Номер автомобиля']??raw['Гос. номер']??'').trim()||undefined,registrationCountry:'RU'});
 const useCar=(c:any)=>setCar({action:'USE_EXISTING',carId:c.id});
 const autoClass=normalized.class?.classId;
 const currentClassId=parsed.classId??autoClass??'';
 const classCandidates=classes.filter(c=>!normalized.class?.className||String(c.name).trim().toLowerCase()===String(normalized.class?.className).trim().toLowerCase()||String(c.code??'').trim().toLowerCase()===String(normalized.class?.className).trim().toLowerCase()).slice(0,12);

 return <section className="panel resource-editor-page import-resolution-page">
  <div className="resource-editor-heading"><div><span className="eyebrow">ИМПОРТ · РУЧНОЕ СОПОСТАВЛЕНИЕ</span><h2>Исправление строки №{row.rowNumber}</h2><p>Проверьте участника, регистрацию, автомобиль, класс и результат. Решение не будет сохранено, пока вы его не подтвердите.</p></div><button className="secondary-button" type="button" onClick={onClose}><ChevronLeft size={16}/>Назад к импорту</button></div>
  <div className="import-resolution">
   <div className="notice"><AlertTriangle size={16}/><span>Теперь не нужно писать JSON вручную. Нажимай действия ниже — система сама собирает корректное решение.</span></div>
   {localError&&<div className="form-error"><AlertTriangle size={16}/>{localError}</div>}
   <div className="resolution-source">
    <div><strong>Исходная строка</strong><pre className="json-view">{JSON.stringify(raw,null,2)}</pre></div>
    <div><strong>Что система определила</strong><pre className="json-view">{JSON.stringify(normalized,null,2)}</pre></div>
   </div>

   <div className="resolution-actions">
    <div className="resolution-action-card">
     <div className="resolution-action-head"><UserRound size={17}/><strong>Участник</strong></div>
     <div className="resolution-action-value">{participantName||'Не определён'}{participantNumber&&<small>№ {participantNumber}</small>}</div>
     <div className="resolution-buttons">
      {selectedParticipantId&&<span className="badge good"><Check size={11}/>Участник выбран</span>}
      {participantCandidates.map(p=><button key={p.id} className="secondary-button compact" onClick={()=>useParticipant(p)}>Использовать: {[p.lastName,p.firstName].filter(Boolean).join(' ')}</button>)}
      {mode==='HISTORICAL'&&<button className="primary-button compact" type="button" onClick={createParticipant}><Plus size={14}/>Создать участника с реальным ФИО</button>}
      {mode==='HISTORICAL'&&<button className="secondary-button compact" type="button" onClick={createArchiveAlias}><Plus size={14}/>Сохранить архивное название без ФИО</button>}
     </div>
     {(parsed.participant?.action==='CREATE'||parsed.participant?.action==='CREATE_ALIAS')&&<div className="resolution-fields">
       <label>{parsed.participant.action==='CREATE_ALIAS'?'Архивное название (не ФИО)':'Подтверждённые фамилия и имя'}
         <input type="text" value={parsed.participant.fullName??''} onChange={e=>setPart({fullName:e.target.value})} placeholder={parsed.participant.action==='CREATE_ALIAS'?'Например, 34 Sound':'Например, Иванов Иван'}/>
       </label>
       <small className="field-help">{parsed.participant.action==='CREATE_ALIAS'
         ?'Создаётся отдельная архивная карточка с оригинальной подписью. Это не установленная личность. Результат сохранится, ФИО можно будет уточнить позднее.'
         :'Используй только реальное подтверждённое ФИО; название команды или псевдоним сюда не подходит.'}</small>
     </div>}
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><ClipboardCheck size={17}/><strong>Регистрация на этап</strong></div>
     <div className="resolution-action-value">{selectedRegistration?[selectedRegistration.participantNumber,selectedRegistration.participant?.lastName,selectedRegistration.participant?.firstName].filter(Boolean).join(' · '):registrationAction==='CREATE'?'Создание регистрации №'+displayParticipantNumber:'Не выбрана'}</div>
     <div className="resolution-buttons">
      {registrationCandidates.map(r=><button key={r.id} className="secondary-button compact" onClick={()=>useRegistration(r)}>Использовать №{String(r.participantNumber).padStart(3,'0')}</button>)}
      {mode==='HISTORICAL'&&<button className="primary-button compact" disabled={!Number.isInteger(resolvedParticipantNumber)||resolvedParticipantNumber<=0} onClick={createRegistration}><Plus size={14}/>{registrationAction==='CREATE'?'Регистрация №'+displayParticipantNumber+' выбрана':'Создать регистрацию №'+displayParticipantNumber}</button>}
     </div>
     {mode==='NORMAL'&&<small className="muted">В обычном импорте регистрацию только выбираем — создавать её нельзя.</small>}
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><CarFront size={17}/><strong>Автомобиль</strong></div>
     <div className="resolution-action-value">{String(raw['Модель автомобиля']??raw['Модель']??'Автомобиль из импорта')}{raw['Номер автомобиля']&&<small>{String(raw['Номер автомобиля'])}</small>}</div>
     <div className="resolution-buttons">
      {carCandidates.map(c=><button key={c.id} className="secondary-button compact" onClick={()=>useCar(c)}>Использовать: {c.brand} {c.model}</button>)}
      {mode==='HISTORICAL'&&<button className="primary-button compact" onClick={createCar}><Plus size={14}/>Создать машину</button>}
     </div>
     {mode==='HISTORICAL'&&parsed.car?.action==='CREATE'&&<div className="resolution-fields form-grid-3"><label>Марка автомобиля<input value={parsed.car.brand??''} onChange={e=>setCar({brand:e.target.value})} placeholder="Не указано"/></label><label>Модель автомобиля<input value={parsed.car.model??''} onChange={e=>setCar({model:e.target.value})} placeholder="Автомобиль не указан"/></label><label>Госномер<input value={parsed.car.registrationNumber??''} onChange={e=>setCar({registrationNumber:e.target.value})} placeholder="Не указан"/></label></div>}
     {mode==='NORMAL'&&<small className="muted">В обычном импорте автомобиль не создаём — он уже должен быть у регистрации.</small>}
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><Trophy size={17}/><strong>Класс</strong></div>
     <div className="resolution-action-value">{normalized.class?.className??raw['Класс']??'Не определён'}</div>
     <div className="resolution-buttons">
      {classCandidates.map(c=><button key={c.id} className={currentClassId===c.id?'primary-button compact':'secondary-button compact'} onClick={()=>setClass(c.id)}>{currentClassId===c.id?<Check size={14}/>:null}{c.name}</button>)}
      {!classCandidates.length&&<select value={currentClassId} onChange={e=>setClass(e.target.value)}><option value="">Выберите класс</option>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>}
     </div>
    </div>

    <div className="resolution-action-card">
     <div className="resolution-action-head"><Check size={17}/><strong>Результат</strong></div>
     <div className="resolution-buttons resolution-fields">
      <label>Результат<input type="number" step="0.01" value={parsed.value??normalized.result??''} onChange={e=>setResultField({value:e.target.value===''?undefined:Number(e.target.value)})}/></label>
      <label>Место<input type="number" min="1" step="1" value={parsed.place??normalized.place??''} onChange={e=>setResultField({place:e.target.value===''?null:Number(e.target.value)})}/></label>
      <label>Комментарий<input value={parsed.notes??''} onChange={e=>setResultField({notes:e.target.value||null})}/></label>
     </div>
    </div>
   </div>

   <details className="resolution-json-preview"><summary>Показать сформированное решение</summary><pre className="json-view">{JSON.stringify(parsed,null,2)}</pre></details>
   <div className="resolution-footer"><button className="secondary-button" onClick={onClose}>Отмена</button><button className="primary-button" disabled={loading||loadingOptions} onClick={()=>void onSave()}>{loading?<><Loader2 className="spin" size={15}/>Сохраняем…</>:<><Check size={15}/>Сохранить решение</>}</button></div>
  </div>
 </section>
}

export default ImportPage;
