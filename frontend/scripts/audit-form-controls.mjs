/** Read-only source audit: inventory actual native form controls across every TSX route. */
import ts from 'typescript';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

function jsxTag(node,file){return node.tagName?.getText(file)??'';}
function jsxAttribute(node,name,file){
 const attr=node.attributes?.properties?.find(item=>ts.isJsxAttribute(item)&&item.name.getText(file)===name);
 if(!attr)return null;
 if(!attr.initializer)return '';
 return ts.isStringLiteral(attr.initializer)?attr.initializer.text:attr.initializer.getText(file);
}
function insideLabel(node,file){
 let ancestor=node.parent;
 while(ancestor){
  if(ts.isJsxElement(ancestor)&&jsxTag(ancestor.openingElement,file)==='label')return true;
  ancestor=ancestor.parent;
 }
 return false;
}
export function auditFormSource(content,fileName='unknown.tsx'){
 const file=ts.createSourceFile(fileName,content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const labels=new Set();const nodes=[];let forms=0;
 function visit(node){
  if(ts.isJsxOpeningElement(node)||ts.isJsxSelfClosingElement(node)){
   const tag=jsxTag(node,file);
   if(tag==='form')forms++;
   if(tag==='label'){
    const target=jsxAttribute(node,'htmlFor',file);
    if(target)labels.add(target);
   }
   if(['input','select','textarea'].includes(tag))nodes.push({node,tag});
  }
  ts.forEachChild(node,visit);
 }
 visit(file);
 const unlabeled=[];let controls=0;
 for(const {node,tag} of nodes){
  if(tag==='input'&&jsxAttribute(node,'type',file)==='hidden')continue;
  controls++;
  const id=jsxAttribute(node,'id',file);
  const named=insideLabel(node,file)||Boolean(id&&labels.has(id))||
   jsxAttribute(node,'aria-label',file)!==null||jsxAttribute(node,'aria-labelledby',file)!==null;
  if(!named)unlabeled.push({tag,line:file.getLineAndCharacterOfPosition(node.getStart(file)).line+1});
 }
 return {fileName,forms,controls,unlabeled};
}
export function auditFormTree(root){
 const rows=[];
 function visit(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
   const full=join(dir,item.name);
   if(item.isDirectory())visit(full);
   else if(item.isFile()&&full.endsWith('.tsx')){
    const row=auditFormSource(readFileSync(full,'utf8'),relative(root,full));
    if(row.forms||row.controls)rows.push(row);
   }
  }
 }
 visit(root);return rows.sort((a,b)=>a.fileName.localeCompare(b.fileName));
}
const executed=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(executed){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../src');
 const rows=auditFormTree(root);
 const summary={sourceFiles:rows.length,forms:rows.reduce((n,x)=>n+x.forms,0),controls:rows.reduce((n,x)=>n+x.controls,0),unlabeled:rows.reduce((n,x)=>n+x.unlabeled.length,0)};
 if(process.argv.includes('--json'))console.log(JSON.stringify({summary,rows},null,2));
 else{
  console.log('USD form-control audit (static inventory; browser/keyboard QA is still required)');
  console.log(JSON.stringify(summary));
  for(const row of rows.filter(x=>x.unlabeled.length))console.log(row.fileName+': '+row.unlabeled.map(i=>i.tag+'@'+i.line).join(', '));
 }
 if(process.argv.includes('--strict')&&summary.unlabeled)process.exitCode=1;
}
