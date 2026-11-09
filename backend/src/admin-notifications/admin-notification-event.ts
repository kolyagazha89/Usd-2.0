export const catalogRequestNotification = (request:{id:string;createdAt?:Date}) => ({
 eventKey:'catalog-request:'+request.id,kind:'CATALOG_REQUEST',sourceId:request.id,
 title:'Запрос на добавление комплектующего',
 body:'Участник предложил новое оборудование. Проверьте запрос в справочнике комплектующих.',
 path:'/admin/components?tab=requests',...(request.createdAt?{createdAt:request.createdAt}:{}),
});
