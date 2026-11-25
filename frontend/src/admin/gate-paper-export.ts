import type {buildGatePaperSheets} from './gate-paper-model';
export async function downloadGatePaperWorkbook(sheets:ReturnType<typeof buildGatePaperSheets>,stageId:string){
 const XLSX=await import('xlsx');
 const workbook=XLSX.utils.book_new();
 for(const sheet of sheets){
  const ws=XLSX.utils.aoa_to_sheet(sheet.rows);
  ws['!cols']=sheet.widths.map(wch=>({wch}));
  if(sheet.name!=='Инструкция'){
   ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:sheet.widths.length-1}},{s:{r:1,c:0},e:{r:1,c:sheet.widths.length-1}}];
   ws['!rows']=sheet.rows.map((row,i)=>({hpt:i<3?24:Math.max(28,...row.map((v,c)=>Math.ceil(String(v).length/Math.max(1,sheet.widths[c]-4))*15))}));
  }else{
   ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:1}},{s:{r:1,c:0},e:{r:1,c:1}}];
   ws['!rows']=sheet.rows.map((row,i)=>({hpt:i<2?24:Math.max(36,Math.ceil(String(row[1]??'').length/85)*17)}));
  }
  XLSX.utils.book_append_sheet(workbook,ws,sheet.name);
 }
 XLSX.writeFile(workbook,'USD-gate-'+stageId+'.xlsx');
}
