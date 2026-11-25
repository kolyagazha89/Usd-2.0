import type {buildGatePaperSheets} from './gate-paper-model';
export async function downloadGatePaperWorkbook(sheets:ReturnType<typeof buildGatePaperSheets>,stageId:string){
 const XLSX=await import('xlsx');
 const workbook=XLSX.utils.book_new();
 for(const sheet of sheets){
  const ws=XLSX.utils.aoa_to_sheet(sheet.rows);
  ws['!cols']=sheet.widths.map(wch=>({wch}));
  ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}}];
  ws['!rows']=sheet.rows.map((row,i)=>({hpt:i<3?30:Math.max(29,...row.map((v,c)=>String(v).split('\n').reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/Math.max(1,sheet.widths[c]-2))),0)*13))}));
  ws['!margins']={left:0.2,right:0.2,top:0.2,bottom:0.2,header:0,footer:0};
  XLSX.utils.book_append_sheet(workbook,ws,sheet.name);
 }
 workbook.Workbook={...workbook.Workbook,Names:[{Name:'_xlnm.Print_Titles',Ref:"'Регистрация'!$1:$3",Sheet:0},{Name:'_xlnm.Print_Area',Ref:"'Регистрация'!$A$1:$J$"+sheets[0].rows.length,Sheet:0}]};
 XLSX.writeFile(workbook,'USD-gate-'+stageId+'.xlsx');
}
/** Use textContent for all stage/participant data; never interpolate it into HTML. */
export function printGatePaperWorkbook(sheets:ReturnType<typeof buildGatePaperSheets>,popup:Window){
 const doc=popup.document;
 doc.title='USD — резервный комплект въезда';
 doc.documentElement.lang='ru';
 const style=doc.createElement('style');
 style.textContent=`
 @page {size:A4 portrait;margin:5mm}
 body{font:9px Arial,sans-serif;color:#111;margin:0}
 h1{font-size:17px;margin:0 0 6px} p{margin:0 0 8px;overflow-wrap:anywhere}
 section+section{break-before:page}
 table{width:100%;border-collapse:collapse;table-layout:fixed}
 thead{display:table-header-group}
 th,td{border:1px solid #777;padding:3px;vertical-align:middle;overflow-wrap:anywhere;white-space:pre-wrap}
 th{font-weight:bold;background:#eee;text-align:left} tr{break-inside:avoid}
 td{height:26px} th:first-child,td:first-child,th:nth-child(2),td:nth-child(2){text-align:center} ol{padding-left:24px} li{font-size:13px;margin:0 0 12px;line-height:1.4}
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
