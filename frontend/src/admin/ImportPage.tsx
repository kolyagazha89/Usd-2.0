import {useEffect,useMemo,useState} from 'react';
import * as XLSX from 'xlsx';
import {AlertTriangle,CarFront,Check,ChevronLeft,ClipboardCheck,Database,FileInput,Loader2,Plus,RefreshCw,Trophy,UserRound} from 'lucide-react';
import {apiGet,apiPatch,apiPost,connectGoogle,getGoogleSheetValues,getGoogleSpreadsheet,getGoogleSpreadsheets,getGoogleStatus,getSiteSettings,listData,prepareHistoricalImport} from '../api';

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
 const[vibrationBrands,setVibrationBrands]=useState<string[]>(['STP','ComfortMat','Audior','Global']);const[vibrationBusyRowId,setVibrationBusyRowId]=useState('');
 const[result,setResult]=useState<any>(null),[job,setJob]=useState<any>(null),[rows,setRows]=useState<any[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[resolveRow,setResolveRow]=useState<any|null>(null),[resolution,setResolution]=useState('{}'); const [historicalPrepare,setHistoricalPrepare]=useState<any>(null),[historicalJobId,setHistoricalJobId]=useState('');const [dbCheck,setDbCheck]=useState<any>(null);
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
   getSiteSettings().then(response=>{const brands=response?.settings?.catalogs?.vibrationBrands;if(Array.isArray(brands))setVibrationBrands([...new Set<string>(brands.filter((value:unknown):value is string=>typeof value==='string'&&value.trim().length>0))]);}).catch(()=>{});
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
 const saveVibration=async(rowId:string,brand:string)=>{if(!job?.id)return;setVibrationBusyRowId(rowId);setError('');try{await apiPatch('/imports/'+job.id+'/rows/'+rowId+'/vibration',{vibrationIsolation:brand});await refreshJob(job.id)}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить виброизоляцию')}finally{setVibrationBusyRowId('')}};
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
      <div className="import-rows">{visibleRows.slice(0,200).map((r:any,i:number)=><div className="import-row" key={r.id??i}><span className={`import-row-status ${String(r.status).toLowerCase()}`}>{enumLabel(r.status)}</span><span className="import-row-main"><b>{r.type==='REGISTRATION'?'Регистрация':'Результат'} · строка {r.rowNumber}</b><small>{Array.isArray(r.warnings)?r.warnings.join(' · '):typeof r.warnings==='object'?JSON.stringify(r.warnings):r.warnings||'Ошибок нет'}</small>{mode==='HISTORICAL'&&r.type==='RESULT'&&r.status!=='COMMITTED'&&<label className="import-vibration-select">Виброизоляция создаваемой машины<select aria-label={'Виброизоляция для строки '+r.rowNumber} value={String(r.resolution?.car?.vibrationIsolation??r.rawData?.['Виброизоляция']??'')} disabled={Boolean(vibrationBusyRowId)||loading} onChange={e=>void saveVibration(r.id,e.target.value)}><option value="">Не указана</option>{vibrationBrands.map(brand=><option key={brand} value={brand}>{brand}</option>)}</select></label>}{mode==='HISTORICAL'&&r.type==='RESULT'&&<small className="table-sub">{r.normalizedData?.participantNumberSource==='REGISTRATION'?'Номер взят из «Регистрация»':r.normalizedData?.participantNumberSource==='RESULT'?'Номер взят из «Результаты»':r.normalizedData?.participantNumberSource==='BOTH'?'Номер совпал в обоих листах':r.normalizedData?.participantNumberSource==='AUTO'?'Номер выдан автоматически':'Номер будет определён при commit'}{r.normalizedData?.car?.model||r.normalizedData?.car?.plateNumber?' · Авто из справочника':''}</small>}</span>{r.status==='WARNING'&&r.type==='RESULT'&&r.normalizedData?.existingResult?.state&&r.normalizedData.existingResult.state!=='NONE'&&<><button className="secondary-button compact" disabled={loading} onClick={()=>void resolveExistingResult(r,'KEEP_EXISTING')}>Оставить текущий</button><button className="secondary-button compact" disabled={loading} onClick={()=>void resolveExistingResult(r,'REPLACE')}>Заменить</button></>}{r.status==='WARNING'&&(!r.normalizedData?.existingResult?.state||r.normalizedData?.existingResult?.state==='NONE')&&(mode!=='HISTORICAL'||r.type==='RESULT')&&<button className="secondary-button compact" onClick={()=>{setResolveRow(r);setResolution(r.resolution?JSON.stringify(r.resolution,null,2):JSON.stringify({},null,2))}}>Исправить</button>}</div>)}</div>
      {blockingWarnCount===0&&job.status==='DRAFT'&&<button className="primary-button" disabled={loading} onClick={()=>void commit()}>4. Подтвердить и записать импорт</button>}
      {blockingWarnCount>0&&<div className="notice"><AlertTriangle size={16}/><span>{mode==='HISTORICAL'?'Исправьте предупреждения в строках результатов. Лист «Регистрация» используется только как справочник и сам по себе ничего не создаёт.':'Есть предупреждения. Пока остаётся хотя бы один WARNING — запись заблокирована.'}</span></div>}
      {job.status==='COMMITTED'&&job.metadata?.historicalResults===true&&<div className="notice"><Check size={17}/><span>Архив записан в базу. Исторические результаты пока ожидают подтверждения и не появятся публично, пока администратор не подтвердит их. После импорта откройте <a href="/admin/historical-results">«История результатов»</a> и нажмите «Подтвердить все».{job.metadata?.sourcePostUrl&&<small className="table-sub"><a href={job.metadata.sourcePostUrl} target="_blank" rel="noreferrer">Открыть публикацию VK</a></small>}</span></div>}{job.status==='COMMITTED'&&job.metadata?.historicalResults!==true&&<div className="notice"><Check size={17}/><span>Импорт успешно записан в базу USD. Пересчёт рейтингов и рекордов выполнен для затронутых классов, если ниже не указаны предупреждения.</span></div>}
      {job.status==='COMMITTED'&&<div className="panel import-db-check"><PanelTitle title="Проверка фактической записи" icon={Check}/><p className="settings-help">Проверяем не сообщение об успехе, а реальные записи, которые сейчас читаются из базы данных.</p><button className="secondary-button compact" disabled={loading} onClick={()=>void checkImportInDatabase()}>{loading?'Проверяем базу…':'Проверить импорт в БД'}</button>{dbCheck?.importJobId===job.id&&<div className="import-summary"><div><b>{dbCheck.rows??0}</b><span>строк импорта</span></div><div><b>{dbCheck.participants?.length??0}</b><span>участников</span></div><div><b>{dbCheck.registrations?.length??0}</b><span>регистраций</span></div><div><b>{dbCheck.results?.length??0}</b><span>результатов</span></div><div><b>{dbCheck.records?.length??0}</b><span>связей с рекордами</span></div><div><b>{dbCheck.results?.filter((r:any)=>r.isHistorical&&r.verificationStatus==='PENDING').length??0}</b><span>исторических ожидают подтверждения</span></div><div><b>{dbCheck.results?.filter((r:any)=>r.isHistorical&&r.verificationStatus==='VERIFIED').length??0}</b><span>исторических подтверждено</span></div></div>}</div>}
    </>:<Empty text="После Preview здесь появится отчёт по каждой строке"/>}
   </div>
  </div>
  {resolveRow&&<ImportResolutionModal row={resolveRow} stageId={stageId} mode={mode} vibrationBrands={vibrationBrands} resolution={resolution} setResolution={setResolution} loading={loading} onClose={()=>setResolveRow(null)} onSave={async()=>{await resolve()}}/>}
 </PageFrame>
}

function ImportResolutionModal({row,stageId,mode,vibrationBrands,resolution,setResolution,loading,onClose,onSave}:{row:any;stageId:string;mode:'NORMAL'|'HISTORICAL';vibrationBrands:string[];resolution:string;setResolution:(v:string)=>void;loading:boolean;onClose:()=>void;onSave:()=>Promise<void>}){
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
 const useParticipant=(p:any)=>setPart({action:'USE_EXISTING',participantId:p.id});
 const createRegistration=()=>setReg({action:'CREATE',participantNumber:Number(participantNumber)});
 const useRegistration=(r:any)=>setReg({action:'USE_EXISTING',registrationId:r.id,participantNumber:r.participantNumber});
 const createCar=()=>setCar({action:'CREATE',brand:String(raw['Марка автомобиля']??raw['Марка']??'').trim()||undefined,model:String(raw['Модель автомобиля']??raw['Модель']??'').trim()||undefined,registrationNumber:String(raw['Номер автомобиля']??raw['Гос. номер']??'').trim()||undefined,registrationCountry:'RU',vibrationIsolation:String(parsed.car?.vibrationIsolation??raw['Виброизоляция']??'')});
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
      {mode==='HISTORICAL'&&<button className="primary-button compact" onClick={createParticipant}><Plus size={14}/>Создать участника</button>}
     </div>
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
     {mode==='HISTORICAL'&&parsed.car?.action==='CREATE'&&<div className="resolution-fields form-grid-3"><label>Марка автомобиля<input value={parsed.car.brand??''} onChange={e=>setCar({brand:e.target.value})} placeholder="Не указано"/></label><label>Модель автомобиля<input value={parsed.car.model??''} onChange={e=>setCar({model:e.target.value})} placeholder="Автомобиль не указан"/></label><label>Госномер<input value={parsed.car.registrationNumber??''} onChange={e=>setCar({registrationNumber:e.target.value})} placeholder="Не указан"/></label><label>Виброизоляция<select value={parsed.car.vibrationIsolation??''} onChange={e=>setCar({vibrationIsolation:e.target.value})}><option value="">Не указана</option>{vibrationBrands.map(brand=><option key={brand} value={brand}>{brand}</option>)}</select><small className="field-help">Марки из справочника «Виброизоляция». Сохраняется в конфигурации машины при импорте.</small></label></div>}
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
