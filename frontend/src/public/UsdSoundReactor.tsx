import {useEffect,useRef,useState} from 'react';
import './UsdSoundReactor.css';

type Props={logoUrl?:string|null;heroImageUrl?:string|null};

/** Decorative, dependency-free perspective rings. No sound or data requests.
 * Canvas pauses off-screen/in background and respects reduced motion.
 * The official CMS logo is used in the center when available.
 */
export default function UsdSoundReactor({logoUrl,heroImageUrl}:Props){
 const hostRef=useRef<HTMLDivElement>(null);
 const canvasRef=useRef<HTMLCanvasElement>(null);
 const pulseRef=useRef<()=>void>(()=>{});
 const [pulsing,setPulsing]=useState(false);
 const [logoBroken,setLogoBroken]=useState(false);
 useEffect(()=>setLogoBroken(false),[logoUrl]);

 useEffect(()=>{
  const host=hostRef.current,canvas=canvasRef.current;
  if(!host||!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)return;
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
  const mobile=window.matchMedia('(max-width: 720px)');
  const finePointer=window.matchMedia('(pointer: fine)');
  let disposed=false,visible=true,frame=0,width=0,height=0,last=0,pulseAt=-1e5,timeout=0;
  let aimX=0,aimY=0,dx=0,dy=0;
  const rand=(n:number)=>{const x=Math.sin(n*19.19+7.91)*43758.5453;return x-Math.floor(x)};
  const dots=Array.from({length:72},(_,i)=>({a:rand(i)*Math.PI*2,r:1.3+rand(i+91)*.83,z:(rand(i+37)-.5)*1.3,sz:.45+rand(i+177)*1.3}));
  const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
  const resize=()=>{
   if(disposed)return;
   const box=host.getBoundingClientRect();
   width=Math.max(1,Math.round(box.width));height=Math.max(1,Math.round(box.height));
   const dpr=Math.min(window.devicePixelRatio||1,mobile.matches?1.5:2);
   canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
   ctx.setTransform(dpr,0,0,dpr,0,0);draw(performance.now());
  };
  const project=(x:number,y:number,z:number,rx:number,ry:number,spin:number):[number,number,number]=>{
   const u=x*Math.cos(spin)-y*Math.sin(spin),v=x*Math.sin(spin)+y*Math.cos(spin);
   const a=u*Math.cos(ry)+z*Math.sin(ry),b=z*Math.cos(ry)-u*Math.sin(ry);
   const c=v*Math.cos(rx)-b*Math.sin(rx),depth=v*Math.sin(rx)+b*Math.cos(rx);
   const scale=Math.min(width,height)*.255*(3.8/(3.8+depth*.2));
   return [width*.5+a*scale,height*(mobile.matches?.465:.5)+c*scale,depth];
  };
  function draw(t:number){
   if(!width||!height)return;
   ctx.clearRect(0,0,width,height);
   const time=reduced.matches?0:t/1000;
   const pulse=clamp(1-(t-pulseAt)/1450,0,1);
   dx+=(aimX-dx)*.055;dy+=(aimY-dy)*.055;
   const rx=.32+dy*.13,ry=.2+dx*.24;
   const rings=[
    {r:1.83,tilt:.6,z:-.38,speed:.12,color:'245,54,83',opacity:.48,width:1.6},
    {r:1.51,tilt:-.47,z:.15,speed:-.09,color:'185,201,229',opacity:.50,width:2},
    {r:1.18,tilt:.84,z:.30,speed:.15,color:'255,79,111',opacity:.43,width:1},
    {r:2.02,tilt:-.74,z:-.55,speed:-.05,color:'239,55,82',opacity:.26,width:.7}
   ];
   for(const ring of rings){
    ctx.beginPath();
    const steps=mobile.matches?88:136;
    for(let i=0;i<=steps;i++){
     const a=i/steps*Math.PI*2;
     const [x,y]=project(Math.cos(a)*ring.r,Math.sin(a)*ring.r,ring.z,rx+ring.tilt,ry,ring.speed*time);
     if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }
    ctx.strokeStyle='rgba('+ring.color+','+(ring.opacity+pulse*.16)+')';
    ctx.lineWidth=ring.width*(1+pulse*.17);ctx.stroke();
   }
   for(let i=0;i<(mobile.matches?30:dots.length);i++){
    const dot=dots[i],ang=dot.a+time*(i%2?-.035:.035);
    const [x,y]=project(Math.cos(ang)*dot.r,Math.sin(ang)*dot.r,dot.z,rx*.5,ry,time*.03);
    const alpha=reduced.matches?.35:.25+.4*(.5+.5*Math.sin(time*.72+i));
    ctx.fillStyle='rgba('+(i%5?'185,203,231':'255,73,111')+','+alpha+')';
    ctx.beginPath();ctx.arc(x,y,dot.sz,0,Math.PI*2);ctx.fill();
   }
   if(pulse>0){
    const elapsed=(t-pulseAt)/1100;
    for(let i=0;i<3;i++){
     const v=elapsed-i*.18;
     if(v<0||v>=1)continue;
     const radius=Math.min(width,height)*(.21+v*.43);
     ctx.beginPath();ctx.ellipse(width*.5,height*.5,radius,radius*.92,0,0,Math.PI*2);
     ctx.strokeStyle='rgba(255,85,120,'+(1-v)*.44+')';ctx.lineWidth=2.2*(1-v)+.4;ctx.stroke();
    }
   }
  }
  const stop=()=>{if(frame)cancelAnimationFrame(frame);frame=0;};
  const run=()=>{
   if(disposed||frame||!visible||document.hidden||reduced.matches)return;
   const tick=(time:number)=>{
    frame=0;
    if(disposed||!visible||document.hidden||reduced.matches)return;
    if(time-last>=(mobile.matches?34:22)){draw(time);last=time;}
    frame=requestAnimationFrame(tick);
   };
   frame=requestAnimationFrame(tick);
  };
  const handleVisibility=()=>{if(document.hidden)stop();else run();};
  const handleMotion=()=>{if(reduced.matches){stop();draw(performance.now());}else run();};
  const handlePointer=(event:PointerEvent)=>{
   if(!finePointer.matches||reduced.matches)return;
   const r=host.getBoundingClientRect();
   aimX=clamp((event.clientX-r.left-r.width/2)/(r.width/2),-1,1);
   aimY=clamp((event.clientY-r.top-r.height/2)/(r.height/2),-1,1);
   host.style.setProperty('--usd-tilt-y',(-13+aimX*8)+'deg');
   host.style.setProperty('--usd-tilt-x',(6-aimY*7)+'deg');
  };
  const resetPointer=()=>{aimX=aimY=0;host.style.removeProperty('--usd-tilt-x');host.style.removeProperty('--usd-tilt-y');};
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;if(visible)run();else stop();},{threshold:.03});
  observer.observe(host);
  const resizer=new ResizeObserver(resize);resizer.observe(host);
  host.addEventListener('pointermove',handlePointer,{passive:true});
  host.addEventListener('pointerleave',resetPointer);
  document.addEventListener('visibilitychange',handleVisibility);
  reduced.addEventListener('change',handleMotion);
  pulseRef.current=()=>{pulseAt=performance.now();draw(pulseAt);setPulsing(true);window.clearTimeout(timeout);timeout=window.setTimeout(()=>{if(!disposed)setPulsing(false);},1080);run();};
  resize();run();
  return ()=>{
   disposed=true;stop();window.clearTimeout(timeout);observer.disconnect();resizer.disconnect();
   host.removeEventListener('pointermove',handlePointer);host.removeEventListener('pointerleave',resetPointer);
   document.removeEventListener('visibilitychange',handleVisibility);reduced.removeEventListener('change',handleMotion);
   pulseRef.current=()=>{};
  };
 },[]);
 return <div ref={hostRef} className={'usd-release-reactor'+(pulsing?' is-pulsing':'')} aria-label="USD Sound Reactor — декоративная визуализация">
  {heroImageUrl&&<img className="usd-release-reactor-backdrop" src={heroImageUrl} alt="" aria-hidden="true" loading="eager"/>}
  <div className="usd-release-reactor-glow" aria-hidden="true"/>
  <canvas ref={canvasRef} className="usd-release-reactor-canvas" aria-hidden="true"/>
  <div className="usd-release-reactor-depth" aria-hidden="true">
   <div className="usd-release-reactor-shadow"/>
   <div className="usd-release-reactor-ring usd-release-ring-outer"/>
   <div className="usd-release-reactor-ring usd-release-ring-middle"/>
   <div className="usd-release-reactor-ring usd-release-ring-inner"/>
   <div className="usd-release-reactor-woofer"><div className="usd-release-reactor-woofer-rim"><div className="usd-release-reactor-face">
    {logoUrl&&!logoBroken?<img className="usd-release-reactor-brand" src={logoUrl} alt="" onError={()=>setLogoBroken(true)} loading="eager"/>:<span className="usd-release-reactor-wordmark">USD<i/></span>}
    <small>ULTIMATE SOUND DESTRUCTION</small>
   </div></div></div>
  </div>
  <div className="usd-release-reactor-telemetry" aria-hidden="true">
   <span>USD / SOUND REACTOR <b>● ACTIVE</b></span>
   <span className="usd-release-reactor-frequency">40 <small>Hz</small></span>
   <span className="usd-release-reactor-reference">PRESSURE ENGINE / 01</span>
  </div>
  <button type="button" className="usd-release-reactor-pulse" onClick={()=>pulseRef.current()} aria-label="Запустить визуальный импульс баса">
   <span aria-hidden="true">◉</span> ПОЧУВСТВОВАТЬ БАСС <span aria-hidden="true">↗</span>
  </button>
 </div>;
}
