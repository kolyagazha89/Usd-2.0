import {formatPlateInput} from '../profile-validation';

type Props={value:string;onChange:(value:string)=>void};
const KEYS=[...'АВЕКМНОРСТУХ0123456789'];
/** Screen keypad for Russian registration plates; physical keyboard and paste remain available. */
export default function RussianPlateKeypad({value,onChange}:Props){
 const append=(key:string)=>onChange(formatPlateInput('RU',value+key));
 return <div className="usd-plate-keypad" role="group" aria-label="Клавиатура российского госномера">
  <p>Допустимые буквы госномера и цифры. Можно также вводить с обычной клавиатуры.</p>
  <div className="usd-plate-keys">
   {KEYS.map(key=><button type="button" key={key} aria-label={'Ввести '+key} onClick={()=>append(key)}>{key}</button>)}
   <button type="button" className="usd-plate-delete" aria-label="Удалить последний символ госномера" onClick={()=>onChange(value.slice(0,-1))}>⌫</button>
   <button type="button" className="usd-plate-clear" onClick={()=>onChange('')}>Очистить</button>
  </div>
 </div>;
}
