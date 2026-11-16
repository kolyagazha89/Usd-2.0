import {useEffect,useState,type ReactNode} from 'react';
import {apiGet} from '../api';
import {rulesListMarkers} from '../rules-list-markers';
import {safeHref} from './premium-model';
import {EmptyState,Link} from './PremiumUI';
import {LEGAL_DOCUMENT_LABELS} from './public-document-links';

type Run = {text:string;bold?:boolean;italic?:boolean;href?:string};
type Block =
  | {type:'heading';level?:number;text?:string;runs?:Run[]}
  | {type:'paragraph';text?:string;runs?:Run[]}
  | {type:'list-item';ordered?:boolean;level?:number;text?:string;runs?:Run[]}
  | {type:'table';rows?:string[][];cellRuns?:Run[][][]};
type DocumentResponse = {success:boolean;fileName:string;blocks:Block[]};
type PublishedFile = {targetId?:string;url?:string;fileName?:string};

function formatRuns(runs:Run[]|undefined,text:string,key:string):ReactNode {
  if(!Array.isArray(runs)||!runs.length)return text;
  return runs.map((run,index)=>{
    let result:ReactNode=run.text;
    if(run.bold)result=<strong>{result}</strong>;
    if(run.italic)result=<em>{result}</em>;
    const href=safeHref(run.href);
    if(href)result=<a href={href} target="_blank" rel="noopener noreferrer">{result}</a>;
    return <span key={key+'-'+index}>{result}</span>;
  });
}
function DocumentBlocks({blocks}:{blocks:Block[]}){
  const markers=rulesListMarkers(blocks);
  return <div className="public-rules-rich-document">{blocks.map((block,index)=>{
    if(block.type==='table')return <div className="public-rules-table-wrap" key={index} style={{overflowX:'auto'}}>
      <table><tbody>{(block.rows||[]).map((row,r)=><tr key={r}>{row.map((cell,c)=>{
        const text=formatRuns(block.cellRuns?.[r]?.[c],cell,'table-'+index+'-'+r+'-'+c);
        return r===0?<th scope="col" key={c}>{text}</th>:<td key={c}>{text}</td>;
      })}</tr>)}</tbody></table>
    </div>;
    const text=formatRuns(block.runs,block.text||'','block-'+index);
    if(block.type==='heading'){
      const level=Math.min(4,Math.max(2,Number(block.level)||2));
      return level===2?<h2 key={index}>{text}</h2>:level===3?<h3 key={index}>{text}</h3>:<h4 key={index}>{text}</h4>;
    }
    if(block.type==='list-item'){
      const level=Math.min(8,Math.max(0,Number(block.level)||0));
      return <p className="public-rules-list-item" key={index} style={{paddingLeft:level*16+8}}>
        <span aria-hidden="true" style={{marginRight:8}}>{markers[index]}</span>{text}
      </p>;
    }
    return <p key={index}>{text}</p>;
  })}</div>;
}

export default function PublicDocumentReader({documentKey,document}:{documentKey:string;document?:PublishedFile}){
  const [data,setData]=useState<DocumentResponse|null>(null);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  const isPublished=Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENT_LABELS,documentKey)&&
    document?.targetId?.startsWith('legal-document-'+documentKey+'-')===true;
  useEffect(()=>{
    if(!isPublished){setBusy(false);setData(null);return;}
    let active=true;
    setBusy(true);setError('');setData(null);
    apiGet<DocumentResponse>('/site-settings/documents/'+encodeURIComponent(documentKey))
      .then(result=>{if(active)setData(result)})
      .catch(()=>{if(active)setError('Не удалось загрузить текст документа. Проверьте соединение и повторите попытку.')})
      .finally(()=>{if(active)setBusy(false)});
    return ()=>{active=false};
  },[documentKey,isPublished,retry]);
  if(!isPublished)return <><EmptyState title="Документ не опубликован">Файл ещё не утверждён организатором.</EmptyState><Link to="/documents">← К документам</Link></>;
  const download=safeHref(document?.url);
  return <article className="public-legal-document" style={{maxWidth:1000,margin:'0 auto'}}>
    <Link className="u-back" to="/documents">← Все документы</Link>
    <header style={{marginBottom:24}}>
      <h2>{LEGAL_DOCUMENT_LABELS[documentKey]}</h2>
      <p>Документ доступен для чтения прямо на сайте, без открытия Word или нового окна.</p>
      {download&&<a className="u-btn u-quiet" href={download} rel="noopener noreferrer">Скачать оригинал Word ↓</a>}
    </header>
    {busy?<p role="status">Загружаем текст документа…</p>
      :error?<div className="p-error" role="alert"><p>{error}</p><button className="u-btn u-quiet" type="button" onClick={()=>setRetry(n=>n+1)}>Повторить</button></div>
      :data?.blocks?.length?<DocumentBlocks blocks={data.blocks}/>:<EmptyState title="Содержимое документа недоступно"/>}
  </article>;
}
