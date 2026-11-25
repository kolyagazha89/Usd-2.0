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

/** Use textContent for all stage/participant data; never interpolate it into HTML. */
export function printGatePaperWorkbook(sheets:ReturnType<typeof buildGatePaperSheets>,popup:Window){
 const doc=popup.document;
 doc.title='USD — резервный комплект въезда';
 doc.documentElement.lang='ru';
 const style=doc.createElement('style');
 style.textContent=`
 @page {size:A4 landscape;margin:10mm}
 body{font:11px Arial,sans-serif;color:#111;margin:0}
 h1{font-size:17px;margin:0 0 6px} p{margin:0 0 8px;overflow-wrap:anywhere}
 section+section{break-before:page}
 table{width:100%;border-collapse:collapse;table-layout:fixed}
 thead{display:table-header-group}
 th,td{border:1px solid #777;padding:5px;vertical-align:top;overflow-wrap:anywhere;white-space:pre-wrap}
 th{font-weight:bold;background:#eee;text-align:left} tr{break-inside:avoid}
 td{height:21px} ol{padding-left:24px} li{font-size:13px;margin:0 0 12px;line-height:1.4}
 `;
 doc.head.append(style);
 for(const sheet of sheets){
  const section=doc.createElement('section');
  const heading=doc.createElement('h1');
  heading.textContent=sheet.name;
  section.append(heading);
  for(const line of sheet.rows.slice(0,2)){
   const paragraph=doc.createElement('p');paragraph.textContent=String(line[0]??'');section.append(paragraph);
  }
  if(sheet.name==='Инструкция'){
   const list=doc.createElement('ol');
   for(const row of sheet.rows.slice(2)){const li=doc.createElement('li');li.textContent=String(row[1]??'');list.append(li)}
   section.append(list);
  }else{
   const table=doc.createElement('table'),cols=doc.createElement('colgroup');
   const total=sheet.widths.reduce((a,b)=>a+b,0);
   for(const width of sheet.widths){const col=doc.createElement('col');col.style.width=100*width/total+'%';cols.append(col)}
   table.append(cols);
   const head=table.createTHead(),header=head.insertRow();
   for(const cell of sheet.rows[2]){const th=doc.createElement('th');th.textContent=String(cell);header.append(th)}
   const body=table.createTBody();
   for(const row of sheet.rows.slice(3)){const tr=body.insertRow();for(const cell of row){tr.insertCell().textContent=String(cell)}}
   section.append(table);
  }
  doc.body.append(section);
 }
 popup.focus();popup.print();
}
