/** Quantity checks shared by the member and admin configuration editor.
 * Never silently turn an invalid or fractional count into one unit: the saved
 * snapshot is evidence of the actual competition setup.
 */
export type ConfigurationQuantityGroup = 'audioComponents' | 'amplifiers' | 'batteries' | 'generators';
const labels:Record<ConfigurationQuantityGroup,string>={
 audioComponents:'акустики',amplifiers:'усилителей',batteries:'аккумуляторов',generators:'генераторов',
};

export function validateConfigurationQuantities(value:Record<string,unknown>):string|null{
 for(const group of ['audioComponents','amplifiers','batteries','generators'] as const){
  const rows=value[group];
  if(!Array.isArray(rows))return 'Не удалось проверить список '+labels[group]+'. Обновите страницу.';
  for(const [index,row] of rows.entries()){
   const count=Number(row?.quantity);
   if(!Number.isSafeInteger(count)||count<1){
    return 'Укажите целое количество '+labels[group]+' больше нуля (позиция '+(index+1)+').';
   }
  }
 }
 return null;
}
