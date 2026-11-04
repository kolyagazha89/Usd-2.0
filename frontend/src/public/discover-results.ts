/** Public results discovery is bounded in parallel batches so a slow/empty
 * newest stage cannot stall mobile /results for minutes. Preserve stage date
 * precedence inside each batch, never confuse network errors with empty data.
 * This function never mutates stage or result records.
 */
export type PublicResultStage={
 id:string;status?:string|null;resultsPublishedAt?:unknown;isDeleted?:boolean;
 date?:string|null;
};
export type ResultDiscovery={stageId:string|null;failedIds:string[];checked:number;publishedCount:number};
export async function discoverPublishedResults<T>(
 stages:readonly PublicResultStage[],
 read:(stageId:string)=>Promise<readonly T[]>,
 batchSize=4,
):Promise<ResultDiscovery>{
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>8)throw new Error('Invalid result discovery batch size');
 const eligible=stages.filter(stage=>stage&&stage.id&&stage.resultsPublishedAt
  &&!stage.isDeleted&&(stage.status==='PUBLISHED'||stage.status==='COMPLETED'))
  .sort((a,b)=>(Date.parse(b.date??'')||0)-(Date.parse(a.date??'')||0)
   ||a.id.localeCompare(b.id));
 const failedIds:string[]=[];
 let checked=0;
 for(let start=0;start<eligible.length;start+=batchSize){
  const batch=eligible.slice(start,start+batchSize);
  const outcomes=await Promise.allSettled(batch.map(stage=>read(stage.id)));
  checked+=batch.length;
  for(let j=0;j<batch.length;j++){
   const result=outcomes[j];
   if(result.status==='fulfilled'&&Array.isArray(result.value)&&result.value.length)
    return {stageId:batch[j].id,failedIds,checked,publishedCount:eligible.length};
   if(result.status==='rejected'||result.status==='fulfilled'&&!Array.isArray(result.value))
    failedIds.push(batch[j].id);
  }
 }
 return {stageId:null,failedIds,checked,publishedCount:eligible.length};
}
