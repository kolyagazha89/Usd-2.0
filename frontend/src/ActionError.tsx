import {AlertTriangle} from 'lucide-react';
import './action-error.css';

/** Keep validation and API feedback in the same action group as its button. */
export function ActionError({message}:{message:string}){
 return message?<div className="form-error action-error" role="alert"><AlertTriangle size={16} aria-hidden="true"/><span>{message}</span></div>:null;
}
