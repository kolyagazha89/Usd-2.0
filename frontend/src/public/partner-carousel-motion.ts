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
