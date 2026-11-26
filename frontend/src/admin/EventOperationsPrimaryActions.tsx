import {Plus,ScanQrCode} from 'lucide-react';

export function EventOperationsPrimaryActions({onCreate,onScan,createLabel='Регистрация на месте',createDisabled=false,scanDisabled=false}:{onCreate:()=>void;onScan:()=>void;createLabel?:string;createDisabled?:boolean;scanDisabled?:boolean}){
 return <div className="event-ops-primary-actions" role="group" aria-label="Основные действия этапа">
  <button type="button" className="primary-button" aria-label={createLabel} title={createLabel} disabled={createDisabled} onClick={onCreate}><Plus size={21} aria-hidden="true"/></button>
  <button type="button" className="secondary-button" aria-label="Сканировать QR" title="Сканировать QR" disabled={scanDisabled} onClick={onScan}><ScanQrCode size={21} aria-hidden="true"/></button>
 </div>;
}
