import jsQR from 'jsqr';

const MAX_IMAGE_BYTES=8*1024*1024;
const MAX_IMAGE_SIDE=1600;

/** Photos stay on-device; never upload ID/registration screenshots to the API. */
export function assertQrImageFile(file:Pick<File,'type'|'size'>):void{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))
  throw new Error('Выберите PNG, JPEG или WebP с изображением QR-кода');
 if(!Number.isFinite(file.size)||file.size<=0)throw new Error('Пустой файл изображения QR-кода');
 if(file.size>MAX_IMAGE_BYTES)throw new Error('Изображение QR-кода должно быть не больше 8 МБ');
}
export function scaledQrDimensions(width:number,height:number):{width:number;height:number}{
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||
    width>16000||height>16000||width*height>80_000_000)
  throw new Error('Недопустимые размеры изображения QR-кода');
 const scale=Math.min(1,MAX_IMAGE_SIDE/Math.max(width,height));
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}

export async function readInspectionQrImage(file:File):Promise<string>{
 assertQrImageFile(file);
 const objectUrl=URL.createObjectURL(file);
 const image=new Image();
 try{
  await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(new Error('Не удалось открыть изображение. Используйте скриншот PNG или JPEG.'));
   image.src=objectUrl;
  });
  const {width,height}=scaledQrDimensions(image.naturalWidth,image.naturalHeight);
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});
  if(!context)throw new Error('Не удалось прочитать пиксели QR-кода на этом устройстве');
  context.drawImage(image,0,0,width,height);
  const detected=jsQR(context.getImageData(0,0,width,height).data,width,height,{inversionAttempts:'attemptBoth'});
  if(!detected?.data)throw new Error('QR-код не найден. Обрежьте скриншот или используйте камеру.');
  return detected.data;
 }finally{
  image.onload=null;image.onerror=null;
  URL.revokeObjectURL(objectUrl);
 }
}
