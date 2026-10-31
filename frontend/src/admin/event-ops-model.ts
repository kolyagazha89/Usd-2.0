/**
 * Shared operations model for the registration desk and entrance inspection.
 * The backend is the source of truth; client-side filtering only changes what
 * the operator sees and never changes saved registration/inspection records.
 */
export type RegistrationFilter = 'ALL' | 'ACTIVE' | 'CANCELLED';
export type InspectionFilter = 'ALL' | 'PASSED' | 'FAILED' | 'PENDING';

type OperationsRow = {
  status?: string | null;
  participantNumber?: number | string | null;
  numbers?: Array<{number?: number | string | null}> | null;
  participant?: {
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    team?: string | {name?: string | null} | null;
  } | null;
  car?: {
    brand?: string | {name?: string | null} | null;
    make?: string | {name?: string | null} | null;
    model?: string | {name?: string | null} | null;
    registrationNumber?: string | null;
  } | null;
  classes?: Array<{
    number?: {number?: number | string | null} | null;
    class?: {name?: string | null;direction?: {name?: string | null} | null} | null;
  }> | null;
  inspection?: {status?: string | null} | null;
  stageInspection?: {status?: string | null} | null;
};

const label=(value:unknown):string=>{
  if(value===null||value===undefined)return '';
  if(typeof value==='object'&&'name' in value)return String((value as {name?:unknown}).name??'');
  return typeof value==='string'||typeof value==='number'?String(value):'';
};
const normalize=(value:string)=>value.toLocaleLowerCase('ru').replace(/ё/g,'е').trim();
const inspectionStatus=(row:OperationsRow)=>row.inspection?.status??row.stageInspection?.status??'';
export const isPendingInspection=(row:OperationsRow):boolean=>!['PASSED','FAILED'].includes(inspectionStatus(row));

export function operationsSearchText(row:OperationsRow):string {
  const person=row.participant,car=row.car;
  const parts=[
    row.participantNumber,
    ...(row.numbers??[]).map(n=>n.number),
    person?.lastName,person?.firstName,person?.middleName,
    label(person?.team),
    label(car?.brand),label(car?.make),label(car?.model),car?.registrationNumber,
    ...(row.classes??[]).flatMap(c=>[c.class?.name,c.class?.direction?.name,c.number?.number]),
  ];
  return normalize(parts.map(label).filter(Boolean).join(' '));
}

export function matchesOperationsSearch(row:OperationsRow,query:string):boolean {
  const terms=normalize(query).split(/\s+/).filter(Boolean);
  if(!terms.length)return true;
  const source=operationsSearchText(row);
  return terms.every(term=>source.includes(term));
}

export function summarizeRegistrations(rows:readonly OperationsRow[]){
  const active=rows.filter(r=>r.status==='ACTIVE').length;
  return {total:rows.length,active,cancelled:rows.filter(r=>r.status==='CANCELLED').length};
}

export function filterRegistrations<T extends OperationsRow>(
  rows:readonly T[],status:RegistrationFilter,query:string,showAllStatuses=false,
):T[]{
  return rows.filter(r=>(showAllStatuses||status==='ALL'||r.status===status)&&matchesOperationsSearch(r,query));
}

export function summarizeInspections(rows:readonly OperationsRow[]){
  return {
    total:rows.length,
    passed:rows.filter(r=>inspectionStatus(r)==='PASSED').length,
    failed:rows.filter(r=>inspectionStatus(r)==='FAILED').length,
    pending:rows.filter(isPendingInspection).length,
  };
}

export function filterInspections<T extends OperationsRow>(
  rows:readonly T[],status:InspectionFilter,query:string,
):T[]{
  return rows.filter(r=>(status==='ALL'
    ||(status==='PASSED'&&inspectionStatus(r)==='PASSED')
    ||(status==='FAILED'&&inspectionStatus(r)==='FAILED')
    ||(status==='PENDING'&&isPendingInspection(r)))
    &&matchesOperationsSearch(r,query));
}

/** CSV for the post-inspection admitted roster. No pending or failed entries. */
export function buildAdmittedRosterCsv(rows:readonly OperationsRow[]):string {
  const safe=(value:unknown):string=>{
    const raw=String(value??'').trim();
    // Spreadsheet applications can interpret user-provided names as formulas.
    const neutral=/^[\s\u0000-\u001f]*[=+@-]/.test(raw)?"'"+raw:raw;
    return '"'+neutral.replace(/"/g,'""')+'"';
  };
  const headers=['Номер','ФИО','Команда','Автомобиль','Госномер','Классы'];
  const admitted=rows.filter(r=>r.status!=='CANCELLED'&&inspectionStatus(r)==='PASSED');
  const items=admitted.map(r=>{
    const participant=r.participant,car=r.car;
    const numbers=(r.numbers??[]).map(n=>label(n.number)).filter(Boolean);
    const fullName=[participant?.lastName,participant?.firstName,participant?.middleName].filter(Boolean).join(' ');
    const classNames=(r.classes??[]).map(c=>[c.class?.name,c.number?.number?('№'+c.number.number):''].filter(Boolean).join(' ')).join(', ');
    return [
      numbers.join(', ')||label(r.participantNumber),
      fullName,label(participant?.team),
      [label(car?.brand)||label(car?.make),label(car?.model)].filter(Boolean).join(' '),
      label(car?.registrationNumber),classNames,
    ].map(safe).join(';');
  });
  return [headers.map(safe).join(';'),...items].join('\r\n');
}
