import {ChevronLeft,ChevronRight} from 'lucide-react';
import {ADMIN_TABLE_PAGE_SIZES} from './admin-table-model';
/** Shared footer for resource and vehicle lists. */
export function AdminListPagination({label,total,page,pageCount,pageSize,onPageChange,onPageSizeChange}:{
 label:string;total:number;page:number;pageCount:number;pageSize:number;
 onPageChange:(page:number)=>void;onPageSizeChange:(size:number)=>void;
}){
 return <div className="usd-universal-pagination">
  <label className="usd-universal-page-size">На странице
   <select aria-label={'Количество '+label+' на странице'} value={pageSize} onChange={event=>onPageSizeChange(Number(event.target.value))}>
    {ADMIN_TABLE_PAGE_SIZES.map(size=><option key={size} value={size}>{size}</option>)}
   </select>
  </label>
  <span role="status" aria-live="polite">Показаны {(page-1)*pageSize+1}–{Math.min(page*pageSize,total)} из {total}</span>
  <nav aria-label={'Страницы '+label}>
   <button type="button" className="secondary-button compact" aria-label={'Предыдущая страница '+label} disabled={page<=1} onClick={()=>onPageChange(page-1)}><ChevronLeft size={17} aria-hidden="true"/></button>
   <span>Страница {page} из {pageCount}</span>
   <button type="button" className="secondary-button compact" aria-label={'Следующая страница '+label} disabled={page>=pageCount} onClick={()=>onPageChange(page+1)}><ChevronRight size={17} aria-hidden="true"/></button>
  </nav>
 </div>;
}
