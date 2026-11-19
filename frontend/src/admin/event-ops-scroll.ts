/** Scroll to the working list without changing the URL or requiring an anchor reload. */
export function jumpToEventOpsRecords(doc:Pick<Document,'activeElement'|'getElementById'>=document):boolean{
 const target=doc.getElementById('event-ops-records');
 if(!target)return false;
 const active=doc.activeElement as HTMLElement|null;
 active?.blur?.(); // close the iOS keyboard before scrolling to a participant
 target.scrollIntoView({block:'start',behavior:'smooth'});
 return true;
}
