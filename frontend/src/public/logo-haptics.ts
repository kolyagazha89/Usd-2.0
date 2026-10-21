/** Call only from a trusted user interaction; unsupported browsers keep the visual effect. */
export function logoHaptic(device:{vibrate?:(pattern:number[])=>boolean},trusted:boolean,reduced:boolean){
 if(!trusted||reduced||typeof device.vibrate!=='function')return false;
 try{return device.vibrate([35,35,65])===true}catch{return false}
}
