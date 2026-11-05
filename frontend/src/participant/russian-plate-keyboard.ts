import {formatPlateInput} from '../profile-validation.ts';

const KEYS=[...'АВЕКМНОРСТУХ0123456789'];
const LETTERS=new Set('АВЕКМНОРСТУХ');

/** Allowed next keys at one position of an RU plate, including optional
 * three-digit region suffix. No arbitrary Cyrillic/Latin characters.
 */
export function nextRussianPlateKeys(value:string):string[]{
 const current=formatPlateInput('RU',value);
 const position=current.length;
 if(position>=9)return [];
 const isLetterSlot=position===0||position===4||position===5;
 return KEYS.filter(key=>LETTERS.has(key)===isLetterSlot);
}
