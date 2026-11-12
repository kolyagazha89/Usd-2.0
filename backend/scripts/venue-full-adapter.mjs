import {RETURN_COLUMNS} from '../../deploy/venue-lan/full-return-apply.mjs';
const TABLES=new Set(Object.keys(RETURN_COLUMNS));
const LINK_SQL="(substr(md5("amplifierId"::text || '/' || "componentId"::text),1,12)||'5'||substr(md5("amplifierId"::text || '/' || "componentId"::text),14,3)||'8'||substr(md5("amplifierId"::text || '/' || "componentId"::text),18))::uuid";
const ident=table=>{
 if(!TABLES.has(table))throw Error('VENUE DB: table is not allowlisted');
 return '"'+table+'"';
};

/**
 * Minimal audited SQL boundary: signed rows are typed by the real PostgreSQL
 * composite type. Never concatenate user-supplied names or column lists.
 * The database's UNIQUE/FK/CHECK constraints remain authoritative.
 */
export function postgresFullVenueAdapter(client){
 const schemaCache=new Map();
 async function assertSchema(table,row){
  const permitted=RETURN_COLUMNS[table];
  if(!permitted||Object.keys(row).some(c=>!permitted.includes(c)))
   throw Error('VENUE DB: unexpected table column');
  if(!schemaCache.has(table)){
   const {rows}=await client.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',
    ['public',table]);
   const actual=new Set(rows.map(r=>r.column_name));
   if((table!=='CarAmplifierComponent'&&!actual.has('id'))
    ||permitted.some(c=>c!=='id'&&!actual.has(c)))
    throw Error('VENUE DB: schema incompatible with signed import: '+table);
   schemaCache.set(table,actual);
  }
 }
 return {
  async transaction(cb,{readOnly=false}={}){
   await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
   try{
    await client.query("SET LOCAL statement_timeout = '55000ms'");
    await client.query("SET LOCAL lock_timeout = '12000ms'");
    const tx={
     async stage(stageId){
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[stageId]);
      const {rows}=await client.query(
       'SELECT id,status,"isDeleted","resultsPublishedAt" FROM "Stage" WHERE id=$1 FOR UPDATE',[stageId]);
      return rows[0]??null;
     },
     async linkedIds(stageId){
      const {rows}=await client.query(
       'SELECT r.id AS reg,r."participantId" AS participant,r."carId" AS car,r."configurationVersionId" AS version,v."configurationId" AS config FROM "Registration" r LEFT JOIN "CarConfigurationVersion" v ON v.id=r."configurationVersionId" WHERE r."stageId"=$1',
       [stageId]);
      const {rows:allCars}=await client.query(
       'SELECT c.id AS car,cf.id AS config,v.id AS version FROM "Car" c JOIN "Registration" r ON r."carId"=c.id AND r."stageId"=$1 LEFT JOIN "CarConfiguration" cf ON cf."carId"=c.id LEFT JOIN "CarConfigurationVersion" v ON v."configurationId"=cf.id',[stageId]);
      const {rows:classes}=await client.query(
       'SELECT rc.id FROM "RegistrationClass" rc JOIN "Registration" r ON r.id=rc."registrationId" WHERE r."stageId"=$1',[stageId]);
      const set=(arr,key)=>new Set(arr.map(o=>o[key]).filter(Boolean));
      const {rows:amps}=await client.query(
       'SELECT a.id FROM "CarAmplifier" a JOIN "CarConfigurationVersion" v ON v.id=a."versionId" JOIN "CarConfiguration" cf ON cf.id=v."configurationId" JOIN "Registration" r ON r."carId"=cf."carId" WHERE r."stageId"=$1',[stageId]);
      const {rows:components}=await client.query(
       'SELECT a.id FROM "CarAudioComponent" a JOIN "CarConfigurationVersion" v ON v.id=a."versionId" JOIN "CarConfiguration" cf ON cf.id=v."configurationId" JOIN "Registration" r ON r."carId"=cf."carId" WHERE r."stageId"=$1',[stageId]);
      return {amplifiers:set(amps,'id'),components:set(components,'id'),
       registrations:set(rows,'reg'),participants:set(rows,'participant'),
       cars:set(rows,'car'),configurations:new Set([...set(rows,'config'),...set(allCars,'config')]),
       versions:new Set([...set(rows,'version'),...set(allCars,'version')]),
       classes:set(classes,'id')};
     },
     async listReceipts(stageId){
      const {rows}=await client.query(
       "SELECT action,metadata->>'eventHash' AS \"eventHash\",(metadata->>'sequence')::bigint AS sequence,metadata->>'baselineSha256' AS \"baselineSha256\",metadata->>'journalEndHash' AS \"journalEndHash\" FROM \"AuditLog\" WHERE action='VENUE_FULL_EVENT_IMPORTED' AND metadata->>'stageId'=$1",[stageId]);
      return rows.map(r=>({...r,sequence:Number(r.sequence)}));
     },
     async getRow(table,id){
      if(table==='CarAmplifierComponent'){
       const {rows}=await client.query(
        'SELECT to_jsonb(t)||jsonb_build_object('id',$1::uuid) AS data FROM "CarAmplifierComponent" t WHERE '+LINK_SQL+'=$1::uuid',[id]);
       return rows[0]?.data??null;
      }
      const {rows}=await client.query(
       'SELECT to_jsonb(t) AS data FROM '+ident(table)+' t WHERE id=$1 FOR UPDATE',[id]);
      return rows[0]?.data??null;
     },
     async canonical(table,row){
      await assertSchema(table,row);
      const {rows}=await client.query(
       'SELECT to_jsonb(t)'+(table==='CarAmplifierComponent'?'||jsonb_build_object('id',$2::uuid)':'')+
       ' AS data FROM jsonb_populate_record(NULL::'+ident(table)+', $1::jsonb) t',
       table==='CarAmplifierComponent'?[JSON.stringify(row),row.id]:[JSON.stringify(row)]);
      return rows[0].data;
     },
     async stageClassAllowed(stageId,classId){
      const {rows}=await client.query(
       'SELECT 1 FROM "StageClass" sc JOIN "Class" c ON c.id=sc."classId" WHERE sc."stageId"=$1 AND sc."classId"=$2 AND sc."isActive"=true AND c."isActive"=true LIMIT 1',
       [stageId,classId]);
      return rows.length>0;
     },
     async participantEligible(participantId,stageId){
      const {rows}=await client.query(
       'SELECT 1 FROM "Disqualification" d JOIN "Stage" s ON s.id=$2 WHERE d."participantId"=$1 AND d.status=$3 AND (d.scope=$4 OR (d.scope=$5 AND d."seasonId"=s."seasonId") OR (d.scope=$6 AND d."stageId"=$2)) LIMIT 1',
       [participantId,stageId,'ACTIVE','FORMAT','SEASON','STAGE']);
      return rows.length===0;
     },
     async resultAdmission(result,stageId){
      const {rows}=await client.query(
       'SELECT 1 FROM "Registration" r JOIN "RegistrationClass" rc ON rc."registrationId"=r.id AND rc.id=$2 JOIN "Class" c ON c.id=rc."classId" LEFT JOIN "ParticipantStageInspection" ps ON ps."participantId"=r."participantId" AND ps."stageId"=r."stageId" LEFT JOIN "Inspection" i ON i."registrationId"=r.id LEFT JOIN "RegistrationClassInspection" ci ON ci."registrationClassId"=rc.id WHERE r.id=$1 AND r."stageId"=$3 AND r.status=$4 AND c.unit=$5 AND COALESCE(ci.status,ps.status,i.status)=$6 LIMIT 1',
       [result.registrationId,result.registrationClassId,stageId,'ACTIVE',result.unit,'PASSED']);
      return rows.length>0;
     },
     async numberOwner(stageId,number){
      const {rows}=await client.query(
       'SELECT id FROM "RegistrationNumber" WHERE "stageId"=$1 AND number=$2 FOR UPDATE',
       [stageId,number]);
      return rows[0]??null;
     },
     async write(table,operation,row,before){
      const name=ident(table);
      const kind=operation.kind,content=row??before;
      await assertSchema(table,content);
      if(table==='CarAmplifierComponent'){
       const json=JSON.stringify(row??before);
       if(kind==='INSERT'){
        const {rowCount}=await client.query(
         'INSERT INTO "CarAmplifierComponent" SELECT * FROM jsonb_populate_record(NULL::"CarAmplifierComponent",$1::jsonb)',[json]);
        if(rowCount!==1)throw Error('Venue link insert refused');
       }else if(kind==='UPDATE'){
        const {rowCount}=await client.query(
         'UPDATE "CarAmplifierComponent" SET quantity=$1 WHERE "amplifierId"=$2 AND "componentId"=$3',
         [row.quantity,before.amplifierId,before.componentId]);
        if(rowCount!==1)throw Error('Venue link update refused');
       }else if(kind==='DELETE'){
        const {rowCount}=await client.query(
         'DELETE FROM "CarAmplifierComponent" WHERE "amplifierId"=$1 AND "componentId"=$2',
         [before.amplifierId,before.componentId]);
        if(rowCount!==1)throw Error('Venue link deletion refused');
       }else throw Error('Unrecognized link operation');
       return;
      }
      if(kind==='INSERT'){
       const {rowCount}=await client.query(
        'INSERT INTO '+name+' SELECT * FROM jsonb_populate_record(NULL::'+name+',$1::jsonb)',
        [JSON.stringify(row)]);
       if(rowCount!==1)throw Error('VENUE DB: expected one insert');
      }else if(kind==='UPDATE'){
       const fields=RETURN_COLUMNS[table].filter(c=>c!=='id');
       const quoted=fields.map(c=>'"'+c+'"').join(',');
       const {rowCount}=await client.query(
        'UPDATE '+name+' SET ('+quoted+')=(SELECT '+quoted+
        ' FROM jsonb_populate_record(NULL::'+name+',$1::jsonb)) WHERE id=$2',
        [JSON.stringify(row),row.id]);
       if(rowCount!==1)throw Error('VENUE DB: updated row disappeared');
      }else if(kind==='DELETE'){
       const {rowCount}=await client.query('DELETE FROM '+name+' WHERE id=$1',[before.id]);
       if(rowCount!==1)throw Error('VENUE DB: deleted row disappeared');
      }else throw Error('VENUE DB: invalid operation');
     },
     async receipt(event){
      const {stageId,eventHash,sequence,journalEndHash,
       baselineSha256,entity,entityId,operator,action}=event;
      if(action!=='VENUE_FULL_EVENT_IMPORTED')throw Error('VENUE DB: unknown receipt');
      const metadata={stageId,eventHash,sequence,journalEndHash,baselineSha256,operator};
      await client.query(
       'INSERT INTO "AuditLog" (id,action,entity,"entityId",metadata,"createdAt") VALUES (gen_random_uuid(),$1,$2,$3,$4::jsonb,now())',
       [action,entity,entityId,JSON.stringify(metadata)]);
     },
    };
    const report=await cb(tx);
    await client.query(readOnly?'ROLLBACK':'COMMIT');
    return report;
   }catch(error){
    try{await client.query('ROLLBACK')}catch{}
    throw error;
   }
  },
 };
}
