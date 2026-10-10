import * as THREE from '/vendor/three.module.js';
import { cameraPose, BALL_RADIUS, START_POSITION, FOUL_LINE, HOOP, NET_LENGTH, netResponse } from './physics.js';
const W=700,H=650;
export function pointerPosition(canvas,event) {
  const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/W,r.height/H);
  return {x:(event.clientX-r.left-(r.width-W*scale)/2)/(W*scale),y:(event.clientY-r.top-(r.height-H*scale)/2)/(H*scale)};
}
export function createCourt(canvas, { onContextLost = () => {}, onContextRestored = () => {} } = {}) {
  const mobile=innerWidth<600 || matchMedia('(pointer: coarse)').matches;
  const renderer=new THREE.WebGLRenderer({canvas,antialias:!mobile,alpha:false,powerPreference:mobile?'low-power':'default'});
  renderer.setSize(W,H,false);renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1:1.5));
  renderer.shadowMap.enabled=!mobile;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
  canvas.dataset.renderer='webgl';
  const scene=new THREE.Scene();scene.background=new THREE.Color('#25343b');scene.fog=new THREE.Fog('#25343b',14,30);
  const camera=new THREE.PerspectiveCamera(60,W/H,.04,50);
  scene.add(new THREE.HemisphereLight('#dce9f0','#75623e',2));
  const sun=new THREE.DirectionalLight('#fff3d7',3.5);sun.position.set(-3,8,4);sun.castShadow=true;
  sun.shadow.mapSize.set(mobile?256:1024,mobile?256:1024);Object.assign(sun.shadow.camera,{left:-7,right:7,top:9,bottom:-9,near:1,far:22});sun.shadow.normalBias=.015;sun.shadow.bias=-.0003;scene.add(sun);
  const fill=new THREE.PointLight('#b6e1d5',35,18);fill.position.set(4,5,-1);scene.add(fill);
  const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.65,...extra});
  function mesh(geometry,material,x=0,y=0,z=0,shadow=true) {
    const object=new THREE.Mesh(geometry,material);object.position.set(x,y,z);object.castShadow=shadow;object.receiveShadow=true;scene.add(object);return object;
  }
  function box(w,h,d,color,x,y,z,extra={}) {return mesh(new THREE.BoxGeometry(w,h,d),mat(color,extra),x,y,z)}
  function tube(points,radius,material) {
    const curve=new THREE.CurvePath();
    for(let i=1;i<points.length;i++)curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i-1]),new THREE.Vector3(...points[i])));
    return mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*3),radius,6,false),material);
  }
  function arc(x,z,r,start=0,end=Math.PI*2,color='#f4e8ce') {
    const points=[];for(let i=0;i<=72;i++){const a=start+(end-start)*i/72;points.push([x+Math.cos(a)*r,.016,z+Math.sin(a)*r]);}
    tube(points,.013,mat(color));
  }
  // Deterministic wooden parquet texture generated locally; no external image requests.
  const wood=document.createElement('canvas');wood.width=mobile?512:1024;wood.height=wood.width;const wc=wood.getContext('2d');wc.scale(wood.width/1024,wood.height/1024);
  for(let i=0;i<24;i++) {
    wc.fillStyle=['#b87d46','#c99861','#bb874f','#cca16d'][i%4];wc.fillRect(i*44,0,43,1024);
    for(let j=0;j<32;j++){wc.strokeStyle=j%3?'#643b1320':'#fce1b52a';wc.lineWidth=.5;wc.beginPath();wc.moveTo(i*44+3+j%37,0);wc.bezierCurveTo(i*44+6+j%35,330,i*44+j%40,690,i*44+4+j%38,1024);wc.stroke();}
    for(let z=(i%3)*125;z<1024;z+=375){wc.fillStyle='#6b452a55';wc.fillRect(i*44,z,44,1);}
  }
  const woodTexture=new THREE.CanvasTexture(wood);woodTexture.colorSpace=THREE.SRGBColorSpace;woodTexture.wrapS=woodTexture.wrapT=THREE.RepeatWrapping;woodTexture.repeat.set(2,2.5);woodTexture.anisotropy=Math.min(mobile?1:4,renderer.capabilities.getMaxAnisotropy());
  const floor=mesh(new THREE.PlaneGeometry(12,16),mat('#ffffff',{map:woodTexture,roughness:.4,metalness:.04}),0,0,3,false);floor.rotation.x=-Math.PI/2;
  const paint=mesh(new THREE.PlaneGeometry(2.44,4.2),mat('#244d42',{roughness:.72}),0,.008,.9,false);paint.rotation.x=-Math.PI/2;
  const boundary=[[-3.8,.02,-1.2],[3.8,.02,-1.2],[3.8,.02,7.5],[-3.8,.02,7.5],[-3.8,.02,-1.2]];
  tube(boundary,.014,mat('#f1e7d0'));
  tube([[-FOUL_LINE.halfWidth,.02,-1.2],[-FOUL_LINE.halfWidth,.02,FOUL_LINE.z],[FOUL_LINE.halfWidth,.02,FOUL_LINE.z],[FOUL_LINE.halfWidth,.02,-1.2]],.014,mat('#f1e7d0'));
  arc(0,FOUL_LINE.z,FOUL_LINE.halfWidth,0,Math.PI);arc(0,0,4.1,0,Math.PI);arc(0,0,.6,0,Math.PI);
  const wall=mat('#3a4848',{roughness:.95});
  mesh(new THREE.BoxGeometry(12,6,.25),wall,0,3,-2.2);mesh(new THREE.BoxGeometry(.25,6,16),wall,-6,3,3);mesh(new THREE.BoxGeometry(.25,6,16),wall,6,3,3);
  mesh(new THREE.BoxGeometry(12,.15,16),wall,0,7.6,3,false);
  for(let row=0;row<9;row++)box(11.6,.008,.012,'#1d3030',0,1.1+row*.5,-2.063);
  for(const side of[-1,1])for(let row=0;row<3;row++) {
    box(1,.2,9,'#394d44',side*(4.8+row*.35),.4+row*.4,3.3);
    for(let seat=0;seat<8;seat++)box(.35,.18,.6,'#6b7963',side*(4.8+row*.35),.6+row*.4,-.3+seat*1.05);
  }
  for(const x of[-3.5,3.5]){box(1.3,.05,.12,'#eeeccc',x,5,-1.7,{emissive:'#faf4ca',emissiveIntensity:2});}
  box(.14,3.8,.14,'#5f6c6b',0,1.9,-.9);box(.14,.14,.55,'#5f6c6b',0,3.05,-.7);
  box(1.84,1.3,.04,'#d7e7e8',0,3.2,-.45,{transparent:true,opacity:.27,roughness:.16,metalness:.06,depthWrite:false});
  const boardLine=mat('#f4f3e8');
  tube([[-.92,2.55,-.42],[.92,2.55,-.42],[.92,3.85,-.42],[-.92,3.85,-.42],[-.92,2.55,-.42]],.015,boardLine);
  tube([[-.3,2.98,-.418],[.3,2.98,-.418],[.3,3.5,-.418],[-.3,3.5,-.418],[-.3,2.98,-.418]],.012,boardLine);
  box(.13,.045,.22,'#da6b2a',0,3.05,-.34);
  const rim=mesh(new THREE.TorusGeometry(.23,.018,12,64),mat('#eb7028',{metalness:.6,roughness:.3}),0,3.05,0);rim.rotation.x=Math.PI/2;
  const net=new THREE.Group();net.name='basketball-net';scene.add(net);const netMaterial=mat('#e5e2d3',{roughness:1});
  const cords=[];
  for(let i=0;i<16;i++)for(const direction of[-1,1]) {
    const a=i/16*Math.PI*2,points=[];for(let j=0;j<=5;j++){const t=j/5,r=HOOP.radius-.1*t,angle=a+direction*.45*t;points.push([Math.cos(angle)*r,HOOP.y-.02-NET_LENGTH*t,Math.sin(angle)*r]);}
    const lace=tube(points,.0035,netMaterial);scene.remove(lace);net.add(lace);
    const attribute=lace.geometry.getAttribute('position'),base=attribute.array.slice();
    attribute.setUsage(THREE.DynamicDrawUsage);
    const depths=new Float32Array(attribute.count);
    for(let v=0;v<depths.length;v++)depths[v]=Math.max(0,Math.min(1,(HOOP.y-.02-base[v*3+1])/NET_LENGTH));
    cords.push({attribute,base,depths});
  }
  // Equirectangular leather texture with seams and pebbled bump detail.
  const leather=document.createElement('canvas');leather.width=mobile?512:1024;leather.height=leather.width/2;const lc=leather.getContext('2d');lc.scale(leather.width/1024,leather.height/512);lc.fillStyle='#d77624';lc.fillRect(0,0,1024,512);
  let seed=41;for(let i=0;i<26000;i++){seed=(seed*1664525+1013904223)>>>0;const x=seed%1024;seed=(seed*1664525+1013904223)>>>0;const y=seed%512;lc.fillStyle=i%2?'#71390840':'#ffb26160';lc.fillRect(x,y,1.5,1.5);}
  lc.strokeStyle='#38200c';lc.lineWidth=7;for(let i=0;i<4;i++){lc.beginPath();lc.moveTo(i*256,0);lc.lineTo(i*256,512);lc.stroke();}lc.beginPath();lc.moveTo(0,256);lc.lineTo(1024,256);lc.stroke();
  for(let side=0;side<2;side++){lc.beginPath();for(let i=0;i<=128;i++){const x=i*8,y=256+Math.sin(i/128*Math.PI*2+side*Math.PI)*180;lc[i?'lineTo':'moveTo'](x,y);}lc.stroke();}
  const leatherTexture=new THREE.CanvasTexture(leather);leatherTexture.colorSpace=THREE.SRGBColorSpace;
  const basketball=mesh(new THREE.SphereGeometry(BALL_RADIUS,mobile?24:48,mobile?16:32),mat('#ffffff',{map:leatherTexture,bumpMap:mobile?null:leatherTexture,bumpScale:.0008,roughness:.86}),0,1.6,6);
  basketball.name='basketball';
  // A small billboard provides soft glow without a bloom pass or extra light.
  const glowMap=document.createElement('canvas');glowMap.width=glowMap.height=128;
  const gc=glowMap.getContext('2d'),gradient=gc.createRadialGradient(64,64,12,64,64,64);
  gradient.addColorStop(0,'rgba(255,255,255,.7)');gradient.addColorStop(.45,'rgba(255,255,255,.3)');gradient.addColorStop(1,'rgba(255,255,255,0)');
  gc.fillStyle=gradient;gc.fillRect(0,0,128,128);
  const glow=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowMap),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
  glow.name='release-glow';glow.scale.set(.46,.46,1);scene.add(glow);
  const contactShadow=mesh(new THREE.CircleGeometry(.16,24),new THREE.MeshBasicMaterial({color:'#17221a',transparent:true,opacity:.25,depthWrite:false}),0,.025,6,false);contactShadow.rotation.x=-Math.PI/2;contactShadow.visible=mobile;
  const halo=mesh(new THREE.TorusGeometry(.15,.002,6,48),new THREE.MeshBasicMaterial({color:'#d3f775',transparent:true,opacity:.7,depthTest:false}),0,1.6,6,false);
  const hint=document.getElementById('court-hint');
  let previousFrame=null,renderWidth=W,lost=false,lastRender=-Infinity,recoveryTimer;
  let recoveryExtension=renderer.getContext().getExtension('WEBGL_lose_context');
  canvas.addEventListener('webglcontextlost',event=>{
    event.preventDefault();lost=true;previousFrame=null;onContextLost();
    clearTimeout(recoveryTimer);
    recoveryTimer=setTimeout(()=>{if(lost)recoveryExtension?.restoreContext();},500);
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    lost=false;previousFrame=null;lastRender=-Infinity;clearTimeout(recoveryTimer);
    recoveryExtension=renderer.getContext().getExtension('WEBGL_lose_context');
    renderer.shadowMap.enabled=false;renderer.setPixelRatio(1);canvas.dataset.renderer='webgl';onContextRestored();
  });
  let previousNet=null;
  return function draw({position={...START_POSITION,y:1.6},player=START_POSITION,focus=null,netState=netResponse(null,0),releaseCue={strength:0,state:'building'},time=0,ready=false,moving=false}={}) {
    if(lost || (mobile && moving && time-lastRender<1000/30))return;
    const bounds=canvas.getBoundingClientRect();
    const width=Math.round(Math.min(bounds.width||W,(bounds.height||H)*W/H,W));
    if(width!==renderWidth){renderWidth=width;renderer.setSize(width,width*H/W,false);}
    const frame=JSON.stringify([position,player,focus,ready,netState,releaseCue,renderWidth,moving?time:0]);
    if(frame===previousFrame)return;previousFrame=frame;
    const pose=cameraPose(player,focus);camera.position.set(pose.eye.x,pose.eye.y,pose.eye.z);camera.lookAt(pose.target.x,pose.target.y,pose.target.z);
    const netFrame=JSON.stringify(netState);
    if(netFrame!==previousNet) {
      previousNet=netFrame;
      for(const {attribute,base,depths} of cords) {
        for(let v=0;v<depths.length;v++) {
          const i=v*3,depth=depths[v],weight=depth*depth,spread=1+netState.flare*depth/.13;
          attribute.array[i]=base[i]*spread+netState.swayX*weight;
          attribute.array[i+1]=base[i+1]-netState.stretch*weight;
          attribute.array[i+2]=base[i+2]*spread+netState.swayZ*weight;
        }
        attribute.needsUpdate=true;
      }
    }
    basketball.position.set(position.x,position.y,position.z);basketball.rotation.set(position.z*.6,moving?time*.0008:0,position.x*.4);
    const strength=ready ? releaseCue.strength : 0;
    const tint=releaseCue.state==='ready' ? '#87f7a3' : releaseCue.state==='strong' ? '#ff7655' : '#ffc15c';
    basketball.material.emissive.set(tint);basketball.material.emissiveIntensity=strength*.22;
    glow.visible=strength>.002;glow.position.copy(basketball.position);glow.material.color.set(tint);glow.material.opacity=strength*.9;
    halo.visible=ready;halo.position.copy(basketball.position);halo.quaternion.copy(camera.quaternion);
    halo.material.color.set(strength>.02 ? tint : '#d3f775');halo.material.opacity=.7+strength*.25;
    if(contactShadow.visible){contactShadow.position.set(position.x,.025,position.z);contactShadow.scale.setScalar(1+position.y*.15);contactShadow.material.opacity=Math.max(.04,.25-position.y*.025);}
    if(hint)hint.hidden=!ready;
    canvas.dataset.eye=JSON.stringify(pose.eye);renderer.render(scene,camera);lastRender=time;
  };
}
