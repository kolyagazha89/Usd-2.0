import type {ReactNode} from 'react';
import './collapsible-filters.css';

type CollapsibleFiltersProps={
 children:ReactNode;
 activeCount?:number;
 theme?:'admin'|'public';
 className?:string;
 label?:string;
};

/**
 * Compact, keyboard-accessible filter disclosure.
 * Native <details> retains its open state while controlled filter values change,
 * with an always-visible badge to show active filters when closed.
 */
export default function CollapsibleFilters({children,activeCount=0,theme='admin',className='',label='Фильтры'}:CollapsibleFiltersProps){
 const count=Math.max(0,Math.floor(Number.isFinite(activeCount)?activeCount:0));
 return <details className={['usd-filter-drawer','usd-filter-theme-'+theme,className].filter(Boolean).join(' ')}>
  <summary className="usd-filter-trigger">
   <span>{label}</span>
   {count>0&&<span className="usd-filter-active-count" aria-label={'Активных фильтров: '+count}>{count}</span>}
   <span className="usd-filter-chevron" aria-hidden="true"/>
  </summary>
  <div className="usd-filter-content">{children}</div>
 </details>;
}
