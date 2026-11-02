const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const pattern = new RegExp('^team-post-('+uuid+')-('+uuid+')$','i');

/** An independent image slot, scoped to exactly one existing team post. */
export function teamPostIdFromAssetKey(targetId:string):string|null {
 const match = typeof targetId === 'string' ? pattern.exec(targetId) : null;
 return match ? match[1].toLowerCase() : null;
}

export function teamPhotoKeys(images:unknown):string[] {
 return Array.isArray(images) && images.length <= 8 && images.every(x=>typeof x==='string' && teamPostIdFromAssetKey(x))
   ? images as string[] : [];
}
