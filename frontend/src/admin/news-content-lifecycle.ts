export type NewsItem={
 id?:string;title?:string;excerpt?:string;body?:string;url?:string;
 isPublished?:boolean;publishedAt?:string|null;createdAt?:string|null;
 photoUrl?:string|null;file?:unknown;[key:string]:unknown;
};

/** First save is private until the ADMIN explicitly publishes it. */
export const newNewsDraft=():NewsItem=>({
 title:'',excerpt:'',body:'',url:'',isPublished:false,publishedAt:null,
});

/** Store only JSON in the CMS, not browser File objects. */
export function prepareNewsItem(editor:NewsItem,id:string,now:string):NewsItem {
 const {file:discarded,...data}=editor;
 void discarded;
 const title=String(data.title??'').trim();
 if(!title)throw new Error('Укажите заголовок новости.');
 const isPublished=data.isPublished!==false;
 return {
  ...data,id,title,
  excerpt:String(data.excerpt??'').trim(),
  body:String(data.body??'').trim(),
  url:String(data.url??'').trim(),
  isPublished,
  createdAt:data.createdAt||now,
  // The first real publication is the event time, not the draft creation.
  publishedAt:data.publishedAt||(isPublished?now:null),
 };
}

/** Hiding must not rewrite a previously published article's date. */
export function switchNewsPublication(item:NewsItem,now:string):NewsItem {
 const isPublished=item.isPublished===false;
 return {...item,isPublished,publishedAt:item.publishedAt||(isPublished?now:null)};
}
