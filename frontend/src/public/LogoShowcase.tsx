import React, { useEffect, useRef, useState } from 'react';
import {Pause,Play} from 'lucide-react';
import {logoHaptic} from './logo-haptics';
const logoUrl='/usd/usd-original.png';
import './logo-showcase.css';

const smokeVertex = `
varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
const smokeFragment = `
uniform float uTime;
uniform float uPulse;
varying vec2 vUv;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);
}
float fbm(vec2 p){
 float a=.5,n=0.;
 for(int i=0;i<4;i++){n+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+2.3;a*=.5;}
 return n;
}
void main(){
 vec2 uv=vUv;
 float t=uTime*.15;
 float spread=.055+uv.y*.18;
 float bend=sin(uv.y*7.-t*.65)*.075;
 float left=exp(-pow((uv.x-.26-bend)/spread,2.));
 float right=exp(-pow((uv.x-.74+bend*.85)/spread,2.));
 float column=max(left,right);
 float n=fbm(vec2(uv.x*6.+sin(t*.3),uv.y*5.-t));
 float swirl=fbm(vec2(uv.x*10.+n*2.,uv.y*8.-t*1.3));
 float density=smoothstep(.27,.77,n*.65+swirl*.5);
 float envelope=smoothstep(.04,.19,uv.y)*(1.-smoothstep(.65,1.,uv.y));
 float edges=smoothstep(0.,.12,uv.x)*(1.-smoothstep(.88,1.,uv.x));
 float alpha=column*density*envelope*edges*(.64+uPulse*.38);
 vec3 col=mix(vec3(.34,.40,.44),vec3(.83,.87,.90),swirl);
 col=mix(col,vec3(.59,.10,.15),(1.-uv.y)*.18);
 gl_FragColor=vec4(col,alpha);
 #include <colorspace_fragment>
}
`;
/** Give the original alpha silhouette a real metal side wall, without redrawing the mark. */
function silhouetteSides(T:any, image:any, width:number, height:number, depth:number) {
 const canvas=document.createElement('canvas');
 canvas.width=image.naturalWidth||image.width;canvas.height=image.naturalHeight||image.height;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw new Error('Canvas unavailable');
 ctx.drawImage(image,0,0);
 const {data}=ctx.getImageData(0,0,canvas.width,canvas.height);
 const w=canvas.width,h=canvas.height,vertices:number[]=[];
 const opaque=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&data[(y*w+x)*4+3]>145;
 const point=(x:number,y:number,z:number)=>[(x/w-.5)*width,(.5-y/h)*height,z];
 function edge(x1:number,y1:number,x2:number,y2:number){
  const a=point(x1,y1,0),b=point(x2,y2,0),c=point(x2,y2,-depth),d=point(x1,y1,-depth);
  vertices.push(...a,...b,...c,...a,...c,...d);
 }
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  if(!opaque(x,y))continue;
  if(!opaque(x,y-1))edge(x,y,x+1,y);
  if(!opaque(x+1,y))edge(x+1,y,x+1,y+1);
  if(!opaque(x,y+1))edge(x+1,y+1,x,y+1);
  if(!opaque(x-1,y))edge(x,y+1,x,y);
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();
 return geometry;
}


/** A mechanical assembly: solid plate, raised USD ink, eighteen bars, and a moving woofer. */
function buildMechanicalLogo(T:any,image:HTMLImageElement,texture:any,model:any,ownGeometry:any,ownMaterial:any,textures:any[]){
 const width=2.42,height=width*image.naturalHeight/image.naturalWidth,w=image.naturalWidth,h=image.naturalHeight;
 const px=(x:number)=>(x/w-.5)*width,py=(y:number)=>(.5-y/h)*height;
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,w,h).data;
 const opaque=(x:number,y:number)=>x>=0&&x<w&&y>=0&&y<h&&pixels[(y*w+x)*4+3]>145;
 const steel=ownMaterial(new T.MeshStandardMaterial({color:0x9aa6b1,metalness:.68,roughness:.44,envMapIntensity:.5}));
 const darkSteel=ownMaterial(new T.MeshStandardMaterial({color:0x1a2025,metalness:.58,roughness:.62,envMapIntensity:.35}));
 const rubber=ownMaterial(new T.MeshStandardMaterial({color:0x111619,metalness:.04,roughness:.88}));
 const plateShape=new T.Shape();
 const outline=[[4,103],[264,149],[525,103],[525,369],[264,326],[4,369]];
 outline.forEach(([x,y],i)=>i?plateShape.lineTo(px(x),py(y)):plateShape.moveTo(px(x),py(y)));plateShape.closePath();
 const body=ownGeometry(new T.ExtrudeGeometry(plateShape,{depth:.31,bevelEnabled:true,bevelThickness:.014,bevelSize:.008,bevelSegments:3,steps:1}));
 // UVs stay attached to the original artwork; bevel/side surfaces use their own matte material.
 const position=body.getAttribute('position'),uv=new Float32Array(position.count*2);
 for(let i=0;i<position.count;i++){uv[i*2]=position.getX(i)/width+.5;uv[i*2+1]=position.getY(i)/height+.5}
 body.setAttribute('uv',new T.BufferAttribute(uv,2));body.translate(0,0,-.31);
 const inkMaterial=ownMaterial(new T.MeshStandardMaterial({map:texture,color:0xd3d9de,alphaTest:.45,metalness:.3,roughness:.57,envMapIntensity:.4}));
 const plate=new T.Mesh(body,[inkMaterial,darkSteel]);plate.name='USD / solid shield';model.add(plate);

 // A separate silver ink relief follows only the USD glyphs, never the frame or speaker.
 const maskCanvas=document.createElement('canvas');maskCanvas.width=w;maskCanvas.height=h;
 const maskCtx=maskCanvas.getContext('2d')!,mask=maskCtx.createImageData(w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4;
  const top=149-Math.abs(x-264)*.177,bottom=326+Math.abs(x-264)*.164;
  const brightness=(pixels[i]+pixels[i+1]+pixels[i+2])/3;
  const inLetter=x>23&&x<506&&y>top+17&&y<bottom-15;
  const alpha=inLetter?Math.max(0,Math.min(255,(brightness-175)*5)):0;
  mask.data[i]=alpha;mask.data[i+1]=alpha;mask.data[i+2]=alpha;mask.data[i+3]=alpha;
 }
 maskCtx.putImageData(mask,0,0);
 const alphaMask=new T.CanvasTexture(maskCanvas);textures.push(alphaMask);
 const reliefPlane=ownGeometry(new T.PlaneGeometry(width,height));
 const reliefMat=ownMaterial(new T.MeshStandardMaterial({map:texture,alphaMap:alphaMask,alphaTest:.72,color:0xf0f2f4,metalness:.35,roughness:.5,envMapIntensity:.42}));
 const letterFace=new T.Mesh(reliefPlane,reliefMat);letterFace.position.z=.061;letterFace.name='USD / raised lettering';model.add(letterFace);
 const letterSides=new T.Mesh(ownGeometry(silhouetteSides(T,maskCanvas,width,height,.067)),steel);letterSides.position.z=.061;model.add(letterSides);

 // Read the exact bar positions and rest lengths from the supplied mark.
 const runs:number[][]=[];let start=-1;
 for(let x=18;x<w-17;x++){
  if(opaque(x,375)&&start<0)start=x;
  if((!opaque(x,375)||x===w-18)&&start>=0){if(x-start>6)runs.push([start,x-1]);start=-1}
 }
 const bars:any[]=[];
 const barFace=ownMaterial(new T.MeshStandardMaterial({color:0x080b0e,metalness:.28,roughness:.62,envMapIntensity:.18}));
 const barEdge=ownMaterial(new T.MeshStandardMaterial({color:0x20262c,metalness:.4,roughness:.55,envMapIntensity:.22}));
 runs.forEach(([lo,hi],index)=>{
  const center=(lo+hi)/2;let bottom=375;
  for(let y=375;y<h;y++)if(opaque(Math.floor(center),y))bottom=y;
  const top=326+Math.abs(center-264)*.164-5;
  const bw=(hi-lo+1)/w*width,bh=(bottom-top)/h*height;
  const shape=new T.Shape();shape.moveTo(-bw/2,0);shape.lineTo(bw/2,0);shape.lineTo(bw/2,-bh);shape.lineTo(-bw/2,-bh);shape.closePath();
  const geo=ownGeometry(new T.ExtrudeGeometry(shape,{depth:.155,bevelEnabled:true,bevelThickness:.006,bevelSize:.004,bevelSegments:2,steps:1}));geo.translate(0,0,-.155);
  const bar=new T.Mesh(geo,[barFace,barEdge]);bar.position.set(px(center),py(top),-.037);bar.name='EQ / '+String(index+1).padStart(2,'0');
  model.add(bar);bars.push(bar);
 });

 const speaker=new T.Group();speaker.name='USD / woofer';speaker.position.set(px(264),py(136),-.045);model.add(speaker);
 function ring(radius:number,tube:number,z:number,mat:any,group=speaker){
  const mesh=new T.Mesh(ownGeometry(new T.TorusGeometry(radius,tube,10,96)),mat);
  mesh.position.z=z;group.add(mesh);return mesh;
 }
 const outerRadius=130/w*width;
 const frame=new T.Mesh(ownGeometry(new T.CylinderGeometry(outerRadius,outerRadius,.13,96,1,true)),steel);frame.rotation.x=Math.PI/2;frame.position.z=-.12;speaker.add(frame);
 const rim=new T.Mesh(ownGeometry(new T.RingGeometry(outerRadius-.068,outerRadius,96)),steel);rim.position.z=-.035;speaker.add(rim);
 ring(outerRadius-.008,.008,-.031,darkSteel);ring(outerRadius-.067,.010,-.032,darkSteel);
 ring(outerRadius-.092,.027,-.084,rubber);
 const cone=new T.Group();cone.name='USD / moving diaphragm';speaker.add(cone);
 const profile=[new T.Vector2(.025,-.32),new T.Vector2(.12,-.32),new T.Vector2(.17,-.30),new T.Vector2(.25,-.265),new T.Vector2(.34,-.214),new T.Vector2(.43,-.145),new T.Vector2(.49,-.12)];
 const coneMesh=new T.Mesh(ownGeometry(new T.LatheGeometry(profile,96)),ownMaterial(new T.MeshStandardMaterial({color:0x282e33,metalness:.14,roughness:.77,side:T.DoubleSide})));
 coneMesh.rotation.x=Math.PI/2;cone.add(coneMesh);
 for(let i=0;i<13;i++){const r=.19+i*.021;const z=-.29+(r-.19)*.51;ring(r,.0025,z, i%3===0?steel:darkSteel,cone);}
 const dome=new T.Mesh(ownGeometry(new T.SphereGeometry(.17,48,24)),ownMaterial(new T.MeshStandardMaterial({color:0x4b535a,metalness:.5,roughness:.61,envMapIntensity:.45})));
 dome.scale.z=.38;dome.position.z=-.285;cone.add(dome);
 for(let i=0;i<6;i++){
  const angle=Math.PI/2+i*Math.PI/3,r=outerRadius-.032;
  const screw=new T.Group();screw.position.set(Math.cos(angle)*r,Math.sin(angle)*r,-.015);
  const head=new T.Mesh(ownGeometry(new T.CylinderGeometry(.022,.022,.011,16)),darkSteel);head.rotation.x=Math.PI/2;screw.add(head);
  const slit=new T.Mesh(ownGeometry(new T.BoxGeometry(.026,.003,.003)),steel);slit.position.z=.008;slit.rotation.z=i*.8;screw.add(slit);speaker.add(screw);
 }
 return {bars,cone,speaker};
}

export default function LogoShowcase() {
 const host=useRef<HTMLButtonElement>(null);
 const canvas=useRef<HTMLCanvasElement>(null);
 const pulse=useRef<()=>void>(()=>{});
 const playback=useRef<()=>void>(()=>{});
 const [ready,setReady]=useState(false);
 const [boost,setBoost]=useState(0);
 const [motion,setMotion]=useState('loading');
 const [strike,setStrike]=useState(0),[arriving,setArriving]=useState(false);
 const introPlayed=useRef(false);
 useEffect(()=>{
  if((!ready&&motion!=='fallback')||introPlayed.current||typeof matchMedia!=='function')return;
  introPlayed.current=true;if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  try{if(sessionStorage.getItem('usd-logo-arrival-v1'))return;sessionStorage.setItem('usd-logo-arrival-v1','seen')}catch{/* Storage-disabled visitors still get only one reveal per mount. */}
  setArriving(true);setStrike(n=>n+1);
  const impact=setTimeout(()=>{pulse.current();setBoost(n=>n+1)},180);
  const finish=setTimeout(()=>setArriving(false),1800);
  return()=>{clearTimeout(impact);clearTimeout(finish)};
 },[ready,motion==='fallback']);

 useEffect(()=>{
  const node=host.current, surface=canvas.current;
  if(!node||!surface||typeof matchMedia!=='function')return;
  let disposed=false;
  let cleanup=()=>{};
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const small=matchMedia('(max-width: 740px)');
  async function init(){
   let renderer:any;
   try{
    const [T,{RoomEnvironment}]=await Promise.all([
     import('three'),import('three/addons/environments/RoomEnvironment.js')
    ]);
    if(disposed)return;
    renderer=new T.WebGLRenderer({canvas:surface!,alpha:true,antialias:true,powerPreference:'low-power'});
    renderer.setClearColor(0x000000,0);
    renderer.outputColorSpace=T.SRGBColorSpace;
    renderer.toneMapping=T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1.06;
    const scene=new T.Scene();
    const camera=new T.PerspectiveCamera(32,1,.1,30);
    camera.position.set(0,0,5.6);
    const room=new RoomEnvironment();
    const pmrem=new T.PMREMGenerator(renderer);
    const environment=pmrem.fromScene(room,.035);
    scene.environment=environment.texture;scene.environmentIntensity=.72;
    room.dispose();pmrem.dispose();
    const geometryResources:any[]=[],materialResources:any[]=[],textures:any[]=[];
    const ownGeometry=(r:any)=>{geometryResources.push(r);return r};
    const ownMaterial=(r:any)=>{materialResources.push(r);return r};
    const key=new T.DirectionalLight(0xeef5ff,2.2);key.position.set(-2,3,4);scene.add(key);
    const fill=new T.DirectionalLight(0xffffff,.8);fill.position.set(3,.4,4);scene.add(fill);
    const rim=new T.PointLight(0xff123b,10,9,2);rim.position.set(2,-.3,-.3);scene.add(rim);
    const ambient=new T.HemisphereLight(0xe8f3ff,0x221218,.85);scene.add(ambient);

    const model=new T.Group();scene.add(model);
    const image=await new Promise<HTMLImageElement>((resolve,reject)=>{
     const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('Logo load failed'));im.src=logoUrl;
    });
    if(disposed){renderer.dispose();environment.dispose();return}
    const texture=new T.Texture(image);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());textures.push(texture);
    const rig=buildMechanicalLogo(T,image,texture,model,ownGeometry,ownMaterial,textures);
    const smokeUniforms={uTime:{value:0},uPulse:{value:0}};
    const smoke=new T.Mesh(ownGeometry(new T.PlaneGeometry(4.15,3.25)),ownMaterial(new T.ShaderMaterial({
     uniforms:smokeUniforms,vertexShader:smokeVertex,fragmentShader:smokeFragment,
     transparent:true,depthWrite:false,side:T.DoubleSide
    })));smoke.position.set(0,.06,-.35);smoke.renderOrder=-1;scene.add(smoke);

    // Sparse drifting embers use a single draw call.
    const count=small.matches?22:42,points=new Float32Array(count*3),colors=new Float32Array(count*3);
    let seed=3947;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
    for(let i=0;i<count;i++){points[i*3]=(random()-.5)*3.9;points[i*3+1]=(random()-.5)*3.0;points[i*3+2]=-.15-random()*.7;
     const c=new T.Color(i%5===0?0xff2e4e:0xc3d1da);colors.set([c.r,c.g,c.b],i*3);}
    const pointGeometry=ownGeometry(new T.BufferGeometry());pointGeometry.setAttribute('position',new T.BufferAttribute(points,3));pointGeometry.setAttribute('color',new T.BufferAttribute(colors,3));
    const pointMaterial=ownMaterial(new T.PointsMaterial({size:small.matches?.009:.012,vertexColors:true,transparent:true,opacity:.58,depthWrite:false,blending:T.AdditiveBlending}));
    const dust=new T.Points(pointGeometry,pointMaterial);scene.add(dust);

    let elapsed=0,last=0,pulseAt=-100,visible=true,manualPause=false,targetX=0,targetY=0,smoothX=0,smoothY=0;
    const hero=node!.closest('.u-cinema-hero') as HTMLElement;
    function resize(){
     const r=node!.getBoundingClientRect();
     const width=Math.max(1,Math.round(r.width*1.6)),height=Math.max(1,Math.round(r.height*1.5));
     renderer.setPixelRatio(Math.min(devicePixelRatio||1,small.matches?1.25:1.6));
     renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
     renderer.render(scene,camera);
    }
    function draw(now:number){
     if(disposed)return;
     if(last)elapsed+=Math.min((now-last)/1000,.05);last=now;
     const t=reduce.matches?0:elapsed;
     const amplitude=reduce.matches?0:Math.max(0,1-(t-pulseAt)/1.7);
     smoothX+=(targetX-smoothX)*.045;smoothY+=(targetY-smoothY)*.045;
     model.rotation.y=reduce.matches?0:-.10+Math.sin(t*.42)*.20+smoothX*.19;
     model.rotation.x=reduce.matches?0:-.045+Math.sin(t*.3+.4)*.05-smoothY*.065;
     model.rotation.z=reduce.matches?0:Math.sin(t*.23)*.012;
     model.position.y=reduce.matches?0:Math.sin(t*.72)*.028;
     model.position.z=amplitude*Math.sin((t-pulseAt)*17)*.025;
     model.scale.setScalar(1+amplitude*.014);
     key.position.x=Math.sin(t*.35)*3.1;fill.intensity=.8+Math.sin(t*.5)*.08;
     scene.environmentRotation.y=t*.09;
     rim.intensity=5.5+Math.sin(t*.9)+amplitude*4;
     const beat=reduce.matches?0:Math.pow(Math.max(0,Math.sin(t*7.2)),3);
     rig.bars.forEach((bar:any,i:number)=>{
      const envelope=.5+.5*Math.sin(t*3.0+i*.68)*Math.cos(t*1.1-i*.31);
      bar.scale.y=reduce.matches?1:.62+envelope*.34+beat*.055+amplitude*.06;
      bar.position.z=-.037+(reduce.matches?0:Math.sin(t*7.2+i*.28)*.009);
     });
     rig.cone.position.z=reduce.matches?0:Math.sin(t*15.5)*(.019+beat*.027+amplitude*.045);
     rig.speaker.position.z=-.045+(reduce.matches?0:Math.sin(t*7.2)*.004);

     smokeUniforms.uTime.value=t;smokeUniforms.uPulse.value=amplitude;
     dust.rotation.z=Math.sin(t*.08)*.05;dust.position.y=(t*.025)%.35;
     renderer.render(scene,camera);
    }
    function sync(){
     const running=visible&&!document.hidden&&!reduce.matches&&!manualPause;
     last=0;renderer.setAnimationLoop(running?draw:null);
     node!.dataset.motion=running?'running':reduce.matches?'reduced':'paused';
     setMotion(node!.dataset.motion);
     if(!running)draw(performance.now());
    }
    const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(node!);
    const intersection=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;sync()},{threshold:.06});intersection.observe(node!);
    const pointer=(event:PointerEvent)=>{if(event.pointerType==='touch'||reduce.matches)return;const r=hero.getBoundingClientRect();targetX=Math.max(-1,Math.min(1,(event.clientX-r.left-r.width*.5)/(r.width*.5)));targetY=Math.max(-1,Math.min(1,(event.clientY-r.top-r.height*.5)/(r.height*.5)))};
    const leave=()=>{targetX=0;targetY=0};
    const lost=(event:Event)=>{event.preventDefault();renderer.setAnimationLoop(null);if(!disposed){setReady(false);setMotion('fallback')}};
    playback.current=()=>{manualPause=!manualPause;sync()};
    pulse.current=()=>{pulseAt=elapsed;if(reduce.matches){renderer.render(scene,camera)}};
    hero.addEventListener('pointermove',pointer,{passive:true});hero.addEventListener('pointerleave',leave);
    document.addEventListener('visibilitychange',sync);reduce.addEventListener('change',sync);surface!.addEventListener('webglcontextlost',lost);
    cleanup=()=>{
     renderer.setAnimationLoop(null);resizeObserver.disconnect();intersection.disconnect();
     hero.removeEventListener('pointermove',pointer);hero.removeEventListener('pointerleave',leave);
     document.removeEventListener('visibilitychange',sync);reduce.removeEventListener('change',sync);surface!.removeEventListener('webglcontextlost',lost);
     for(const r of geometryResources)r.dispose();for(const r of materialResources)r.dispose();for(const r of textures)r.dispose();
     environment.dispose();renderer.dispose();pulse.current=()=>{};playback.current=()=>{};
    };
    resize();draw(0);setReady(true);sync();
   }catch{
    renderer?.setAnimationLoop(null);renderer?.dispose();
    if(!disposed){setReady(false);setMotion('fallback')}
   }
  }
  init();
  return()=>{disposed=true;cleanup()};
 },[]);

 return <><button ref={host}
  className={'u-stage-emblem u-logo-showcase '+(ready?'is-webgl':'is-fallback')+(arriving?' is-arriving':'')}
  aria-label="Запустить визуальный импульс"
  data-motion={motion}
  onClick={event=>{pulse.current();setBoost(n=>n+1);const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;if(!reduced)setStrike(n=>n+1);logoHaptic(navigator,event.isTrusted,reduced)}}>
  <img className="u-logo-static" src={logoUrl} alt="USD — Ultimate Sound Destruction" width="529" height="474"/>
  <canvas ref={canvas} className="u-logo-webgl" aria-hidden="true"/>
  <span key={'pressure-'+boost} className={boost?'u-logo-pressure is-triggered':'u-logo-pressure'} aria-hidden="true"/>
  <span className="u-logo-aura" aria-hidden="true"/>
  {strike>0&&<span key={'strike-'+strike} className="u-logo-impact" aria-hidden="true"><svg viewBox="0 0 400 500" fill="none"><path className="u-lightning-main" d="M267 0L216 90L249 80L195 175L225 162L183 265L212 246L194 330"/><path className="u-lightning-branch" d="M225 162L298 132L281 177L334 161M216 90L141 108L163 150L114 170"/></svg><span className="u-logo-bloom"/><span className="u-logo-arrival-ring"/></span>}
 </button><button className="u-logo-playback" type="button" aria-label={motion==='running'?'Остановить анимацию':'Включить анимацию'} title={motion==='running'?'Остановить анимацию':'Включить анимацию'} aria-pressed={motion==='paused'} disabled={motion==='loading'||motion==='fallback'||motion==='reduced'} onClick={()=>playback.current()}>{motion==='running'?<Pause size={13}/>:<Play size={13}/>}</button></>;
}
