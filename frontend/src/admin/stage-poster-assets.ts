/**
 * Each uploaded stage poster needs a new public address. S3 stores immutable
 * objects but /media/public-file/SITE_ASSET/:targetId can be cached by the
 * browser/CDN for several minutes. Reusing targetId displayed an old poster
 * after the upload completed and settings had been saved.
 *
 * No database migration or deletion of legacy posters is necessary.
 */
export function stagePosterAssetKey(stageId:string, revision:string=crypto.randomUUID()):string{
 const id=stageId.trim();
 if(!id)throw new Error('Не указан этап для афиши');
 if(!/^[a-zA-Z0-9-]+$/.test(id))throw new Error('Некорректный идентификатор этапа');
 if(!/^[a-zA-Z0-9-]+$/.test(revision))throw new Error('Некорректная версия афиши');
 return `stage-poster-${id}-${revision}`;
}
