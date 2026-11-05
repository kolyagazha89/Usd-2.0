/** Shared identity for a vehicle's registration plate across participant,
 * admin and on-site intake. Never compare the raw display string: historic
 * imports include Latin lookalikes and punctuation.
 */
const RUSSIAN_LOOKALIKES:Record<string,string>={
 A:'А',B:'В',E:'Е',K:'К',M:'М',H:'Н',O:'О',
 P:'Р',C:'С',T:'Т',Y:'У',X:'Х',
};

export function normalizePlateNumber(country:string,value:string):string {
 let number=value.normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/g,'')
  .replace(/[\u00A0\u202F]/g,' ')
  .trim().toLocaleUpperCase('ru-RU');
 if(country==='RU'){
  number=[...number].map(char=>
   /[|\s.\-_/\\]/.test(char)?'':RUSSIAN_LOOKALIKES[char]??char
  ).join('');
 }else{
  number=number.replace(/\s+/g,' ');
 }
 return number;
}

export function canonicalPlateIdentity(country:string,value:string):string {
 return normalizePlateNumber(country,value).replace(/[^\p{L}\p{N}]/gu,'');
}

/** All paths that assign a plate MUST lock exactly this key before looking
 * for duplicates. A PostgreSQL transaction-scoped lock lasts through insert
 * or update, preventing the read-then-write duplicate race.
 */
export function plateAdvisoryKey(country:string,value:string):string {
 return 'vehicle-plate:'+country+':'+canonicalPlateIdentity(country,value);
}
