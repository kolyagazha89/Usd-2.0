/** Automatic partner scrolling is transiently paused for pointer hover/focus.
 * Manual interaction stops automatic scrolling until the carousel remounts.
 * The user can always swipe/scroll manually, independently of this timer.
 */
export type PartnerCarouselMotionState={
 itemsCount:number;
 hasOverflow:boolean;
 manuallyPaused:boolean;
 hovered:boolean;
 focused:boolean;
 hidden:boolean;
 reducedMotion:boolean;
};
export function shouldAutoAdvancePartnerCarousel(state:PartnerCarouselMotionState):boolean{
 return state.itemsCount>1 && state.hasOverflow &&
  !state.manuallyPaused && !state.hovered && !state.focused &&
  !state.hidden && !state.reducedMotion;
}

export type PartnerGesturePoint={x:number;y:number};
export function isIntentionalHorizontalSwipe(start:PartnerGesturePoint,end:PartnerGesturePoint):boolean{
 const dx=Math.abs(end.x-start.x),dy=Math.abs(end.y-start.y);
 return dx>=40&&dx>dy*1.25;
}
export function isHorizontalWheelGesture(dx:number,dy:number):boolean{
 return Number.isFinite(dx)&&Number.isFinite(dy)&&Math.abs(dx)>=5&&Math.abs(dx)>Math.abs(dy);
}
