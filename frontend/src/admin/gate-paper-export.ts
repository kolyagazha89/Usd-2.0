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
 const bytes=applyGatePrintSettings(XLSX,XLSX.write(workbook,{bookType:'xlsx',type:'array'}));
 const url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const link=document.createElement('a');link.href=url;link.download='USD-gate-'+stageId+'.xlsx';document.body.append(link);
 try{link.click()}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}

}

// SheetJS CE does not serialize pageSetup or wrapped cell styles itself.
// Modify the two generated OOXML parts before the browser saves the XLSX.
export function applyGatePrintSettings(XLSX:typeof import('xlsx'),bytes:ArrayBuffer):ArrayBuffer{
 const cfb=(XLSX as unknown as {CFB:{read:(data:Uint8Array,opts:{type:string})=>any;find:(archive:any,path:string)=>{content:Uint8Array;size:number}|null;utils:{cfb_add:(archive:any,path:string,data:Uint8Array)=>void};write:(archive:any,opts:{fileType:string;type:string})=>Uint8Array}}).CFB;
 const archive=cfb.read(new Uint8Array(bytes),{type:'array'});
 const decoder=new TextDecoder(),encoder=new TextEncoder();
 function change(path:string,edit:(xml:string)=>string){
  const part=cfb.find(archive,'/'+path);
  if(!part?.content)throw new Error('Не удалось подготовить печать Excel: '+path);
  const updated=encoder.encode(edit(decoder.decode(part.content)));
  part.content=updated;part.size=updated.length;
 }
 let styleIndex=0;
 change('xl/styles.xml',xml=>{
  const borders=xml.match(/<borders count="(\d+)">/),xfs=xml.match(/<cellXfs count="(\d+)">/);
  if(!borders||!xfs)throw new Error('Не удалось подготовить оформление Excel');
  const border=Number(borders[1]);styleIndex=Number(xfs[1]);
  xml=xml.replace(borders[0],'<borders count="'+(border+1)+'">').replace('</borders>','<border><left style="thin"><color rgb="FF777777"/></left><right style="thin"><color rgb="FF777777"/></right><top style="thin"><color rgb="FF777777"/></top><bottom style="thin"><color rgb="FF777777"/></bottom><diagonal/></border></borders>');
  return xml.replace(xfs[0],'<cellXfs count="'+(styleIndex+1)+'">').replace('</cellXfs>','<xf numFmtId="0" fontId="0" fillId="0" borderId="'+border+'" xfId="0" applyAlignment="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs>');
 });
 change('xl/worksheets/sheet1.xml',xml=>{
  // This workbook is freshly generated with no sheetPr or pageSetup.
  if(!/<sheetPr[\s>]/.test(xml))xml=xml.replace(/<worksheet\b[^>]*>/,m=>m+'<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>');
  else if(!xml.includes('pageSetUpPr'))xml=xml.replace('</sheetPr>','<pageSetUpPr fitToPage="1"/></sheetPr>');
  if(!/<pageMargins\b[^>]*\/>/.test(xml))throw new Error('Не удалось настроить поля Excel');
  xml=xml.replace(/<pageMargins\b[^>]*\/>/,m=>m+'<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>');
  return xml.replace(/<c\b[^>]*>/g,tag=>{
   const row=tag.match(/\br="[A-J](\d+)"/);
   if(!row||Number(row[1])<3)return tag;
   const end=tag.endsWith('/>')? '/>':'>';
   return tag.slice(0,-end.length).replace(/\s+s="[^"]*"/,'')+' s="'+styleIndex+'"'+end;
  });
 });
 const result=cfb.write(archive,{fileType:'zip',type:'array'});
 return Uint8Array.from(result).buffer;
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
