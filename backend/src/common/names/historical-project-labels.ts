/** Exact project/nickname labels present in Results. Never use this list to
 * invent a legal name or fuzzy-match a new label to an existing performer. */
export const historicalProjectLabels: Readonly<Record<string,string>> = {
 '34sound':'34 Sound', 'bassmarket':'Bassmarket', 'caraudiobryansk':'Car Audio Bryansk',
 'alekseysf':'Aleksey SF', 'antohasf':'Antoha SF', 'igorbassfix63':'Igor Bassfix63',
 'makssf':'Maks SF', 'alladinsf':'Alladin SF', 'teamalladinsf':'Team Alladin SF',
 'teamacv':'Team ACV', 'carvshishku':'Car V Shishku', 'ilyhavshishku':'Ilyha Vshishku',
 'dksound':'Dksound', 'antohaforce':'Antoha Force', 'soundof':'Sound Of',
 'shpion007':'Shpion 007', 'stich':'Stich', 'kostyaterritoriyadb':'Kostya Territoriya Db',
 'антохаaplhardcustoms':'Антоха Aplhard Customs', 'ksyaperol':'Ксю Апероль',
};
export function historicalProjectKey(label:string):string|null {
 const compact=label.normalize('NFKC').toLocaleLowerCase('ru').replace(/[\s._-]+/g,'');
 const key=compact==='antohafs'?'antohasf':compact==='ксюапероль'?'ksyaperol':compact;
 return Object.hasOwn(historicalProjectLabels,key)?key:null;
}
export function historicalProjectLabel(label:string):string|null {
 const key=historicalProjectKey(label);return key?historicalProjectLabels[key]:null;
}
