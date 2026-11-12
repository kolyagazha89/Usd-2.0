const sourceQuery=(participantId?:string)=>participantId?'&participantId='+encodeURIComponent(participantId):'';
export const participantCardPath=(id:string)=>'/admin/participants?view='+encodeURIComponent(id);
export const adminCarCardPath=(id:string,participantId?:string)=>'/admin/cars?view='+encodeURIComponent(id)+sourceQuery(participantId);
export const adminCarConfigurationsPath=(id:string,participantId?:string)=>'/admin/cars/configurations?carId='+encodeURIComponent(id)+sourceQuery(participantId);
export const adminCarEditorPath=(id:string,participantId?:string)=>'/admin/cars/edit?carId='+encodeURIComponent(id)+sourceQuery(participantId);
