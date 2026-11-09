/**
 * Shared async catalog snapshot for every participant/admin car picker.
 * A successful ADMIN write can invalidate the snapshot without remounting
 * the page; late responses started before invalidation are never published.
 */
export function createRefreshableDirectoryCache<T>(loader:()=>Promise<T>){
 let current:T|null=null;
 let pending:Promise<T>|null=null;
 let revision=0;
 const listeners=new Set<()=>void>();
 const notify=()=>{for(const listener of listeners)listener()};
 const getSnapshot=()=>current;
 const subscribe=(listener:()=>void)=>{
  listeners.add(listener);
  return ()=>{listeners.delete(listener)};
 };
 const invalidate=()=>{
  revision++;
  current=null;
  pending=null;
  notify();
 };
 const load=():Promise<T>=>{
  if(current!==null)return Promise.resolve(current);
  if(pending)return pending;
  const thisRevision=revision;
  pending=Promise.resolve().then(loader).then(data=>{
   if(revision===thisRevision){
    current=data;
    notify();
   }
   return data;
  }).finally(()=>{
   if(revision===thisRevision)pending=null;
  });
  return pending;
 };
 return {getSnapshot,subscribe,invalidate,load};
}
