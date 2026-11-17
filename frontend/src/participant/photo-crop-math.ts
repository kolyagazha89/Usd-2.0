/** All values use the CSS pixel coordinate space of the square crop area. */
export type CropMetrics={frame:number;width:number;height:number};
export type CropOffset={x:number;y:number};

export function cropMetrics(imageWidth:number,imageHeight:number,frame:number,zoom=1):CropMetrics{
 if(!Number.isFinite(imageWidth)||!Number.isFinite(imageHeight)||!Number.isFinite(frame)||
   imageWidth<=0||imageHeight<=0||frame<=0)throw new RangeError('Invalid crop dimensions');
 const factor=Math.max(frame/imageWidth,frame/imageHeight)*Math.max(1,Math.min(5,Number.isFinite(zoom)?zoom:1));
 return {frame,width:imageWidth*factor,height:imageHeight*factor};
}

export function clampCropOffsets(x:number,y:number,metrics:CropMetrics):CropOffset{
 const maxX=Math.max(0,(metrics.width-metrics.frame)/2);
 const maxY=Math.max(0,(metrics.height-metrics.frame)/2);
 return {x:Math.max(-maxX,Math.min(maxX,Number.isFinite(x)?x:0)),
         y:Math.max(-maxY,Math.min(maxY,Number.isFinite(y)?y:0))};
}

export function cropDrawRect(metrics:CropMetrics,offset:CropOffset){
 return {left:(metrics.frame-metrics.width)/2+offset.x,
         top:(metrics.frame-metrics.height)/2+offset.y,
         width:metrics.width,height:metrics.height};
}
