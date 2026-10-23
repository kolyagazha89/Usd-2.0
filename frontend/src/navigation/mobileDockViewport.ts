/** Place an iOS mobile dock at the visual viewport's actual bottom.
 * Anchoring via top avoids iOS 26 WebKit's intermittent bottom:0 drift.
 */
export function mobileDockTop(visibleBottom:number,dockHeight:number):number{
 if(!Number.isFinite(visibleBottom)||!Number.isFinite(dockHeight))return 0;
 return Math.max(0,Math.round(visibleBottom-Math.max(0,dockHeight)));
}
