import {formatPlateInput} from '../profile-validation';
import {nextRussianPlateKeys} from './russian-plate-keyboard';

type Props={value:string;onChange:(value:string)=>void;nativeKeyboard?:boolean};
const STEPS=[
 'Буква', 'Первая цифра', 'Вторая цифра', 'Третья цифра',
 'Первая буква серии', 'Вторая буква серии',
 'Первая цифра региона', 'Вторая цифра региона',
 'Третья цифра региона (если нужна)',
];

/** Context-sensitive Russian plate keypad: invalid keys never appear.
 * Format: А000АА00, optionally a third region digit.
 */
export default function RussianPlateKeypad({value,onChange,nativeKeyboard=true}:Props){
 const current=formatPlateInput('RU',value);
 const position=current.length;
 const candidates=nextRussianPlateKeys(value);
 const append=(key:string)=>onChange(formatPlateInput('RU',value+key));
 return <div className="usd-plate-keypad" role="group" aria-label="Клавиатура российского госномера">
  <p role="status" aria-live="polite">{position>=9?'Номер введён. Проверьте регион.':STEPS[position]+': выберите допустимый символ.'}{nativeKeyboard?' Также доступен ввод с обычной клавиатуры.':''}</p>
  <div className="usd-plate-keys">
   {candidates.map(key=><button type="button" key={key} aria-label={'Ввести '+key} onClick={()=>append(key)}>{key}</button>)}
   <button type="button" className="usd-plate-delete" disabled={!value} aria-label="Удалить последний символ госномера" onClick={()=>onChange(value.slice(0,-1))}>⌫</button>
   <button type="button" className="usd-plate-clear" disabled={!value} onClick={()=>onChange('')}>Очистить</button>
  </div>
 </div>;
}
