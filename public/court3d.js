import { project, BALL_RADIUS } from './physics.js';
const W = 700, H = 650;
export function pointerPosition(canvas, event) {
  const r = canvas.getBoundingClientRect(), scale = Math.min(r.width / W, r.height / H);
  return { x: (event.clientX - r.left - (r.width - W * scale) / 2) / (W * scale),
    y: (event.clientY - r.top - (r.height - H * scale) / 2) / (H * scale) };
}
export function createCourt(canvas) {
  const ctx = canvas.getContext('2d');
  function line(points, color = '#f0e2c0aa', width = 2, close = false) {
    ctx.beginPath(); points.forEach((p, i) => {const s = project(p);ctx[i ? 'lineTo' : 'moveTo'](s.x * W, s.y * H);});
    if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();
  }
  function polygon(points, color) {
    ctx.beginPath();points.forEach((p,i)=>{const s=project(p);ctx[i?'lineTo':'moveTo'](s.x*W,s.y*H);});ctx.closePath();ctx.fillStyle=color;ctx.fill();
  }
  function ring(cx, y, cz, radius, color, width = 2, start = 0, end = Math.PI * 2) {
    const points=[];for(let i=0;i<=64;i++){const a=start+(end-start)*i/64;points.push({x:cx+Math.cos(a)*radius,y,z:cz+Math.sin(a)*radius});}line(points,color,width);
  }
  function shadow(p) {
    const s=project({x:p.x,y:.012,z:p.z}), radius=BALL_RADIUS*s.scale*(1+p.y*.25);
    ctx.save();ctx.translate(s.x*W,s.y*H);ctx.scale(1,.32);ctx.fillStyle=`rgba(0,0,0,${.32/(1+p.y*.4)})`;ctx.filter='blur(4px)';ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function ball(p, time, screen) {
    const s=screen || project(p), radius=screen ? 15 : Math.max(6,BALL_RADIUS*s.scale);
    const x=s.x*W,y=s.y*H;
    ctx.save();ctx.translate(x,y);
    const gradient=ctx.createRadialGradient(-radius*.38,-radius*.4,radius*.05,radius*.25,radius*.25,radius*1.2);
    gradient.addColorStop(0,'#ffcb7a');gradient.addColorStop(.4,'#ed8a38');gradient.addColorStop(.8,'#bc4d19');gradient.addColorStop(1,'#562819');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(0,0,radius,0,Math.PI*2);ctx.fill();ctx.clip();
    ctx.rotate(time*.0012+p.z*.35);ctx.strokeStyle='#482411';ctx.lineWidth=Math.max(1,radius*.07);
    ctx.beginPath();ctx.moveTo(-radius,0);ctx.lineTo(radius,0);ctx.moveTo(0,-radius);ctx.lineTo(0,radius);ctx.stroke();
    for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*radius,0,radius*.8,radius*1.05,0,0,Math.PI*2);ctx.stroke();}
    // Pebbled leather surface, deterministic so the ball doesn't flicker.
    ctx.fillStyle='#4c250e30';for(let i=0;i<90;i++){const angle=i*2.39996,r=Math.sqrt(i/90)*radius;ctx.beginPath();ctx.arc(Math.cos(angle)*r,Math.sin(angle)*r,.5,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  function basket(time) {
    polygon([{x:-.12,y:0,z:-.85},{x:.12,y:0,z:-.85},{x:.12,y:4,z:-.85},{x:-.12,y:4,z:-.85}],'#64716a');
    polygon([{x:-.92,y:2.55,z:-.45},{x:.92,y:2.55,z:-.45},{x:.92,y:3.85,z:-.45},{x:-.92,y:3.85,z:-.45}],'#cddedc33');
    line([{x:-.92,y:2.55,z:-.45},{x:.92,y:2.55,z:-.45},{x:.92,y:3.85,z:-.45},{x:-.92,y:3.85,z:-.45}],'#ccdcdbaa',3,true);
    line([{x:-.3,y:2.98,z:-.44},{x:.3,y:2.98,z:-.44},{x:.3,y:3.5,z:-.44},{x:-.3,y:3.5,z:-.44}],'#f0e8d4bb',2,true);
    line([{x:0,y:3.05,z:-.45},{x:0,y:3.05,z:-.23}],'#e77535',4);
    for(let i=0;i<14;i++){const a=i/14*Math.PI*2,b=a+.35;
      line([{x:Math.cos(a)*.23,y:3.03,z:Math.sin(a)*.23},{x:Math.cos(b)*.13,y:2.63,z:Math.sin(b)*.13}],'#f0f1dc88',1);
      line([{x:Math.cos(a)*.23,y:3.03,z:Math.sin(a)*.23},{x:Math.cos(a-.35)*.13,y:2.63,z:Math.sin(a-.35)*.13}],'#f0f1dc66',1);
    }
    ring(0,2.82,0,.18,'#f0f1dc66',1);ring(0,3.05,0,.23,'#ff8e44',4);
  }
  return function draw({position={x:0,y:1.6,z:6},time=0,trail=null,ready=false,legacy=null}={}) {
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#101d24');sky.addColorStop(.65,'#31423b');sky.addColorStop(1,'#29372e');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    // World-space stadium walls and wooden court, projected with the same camera as the ball.
    polygon([{x:-5,y:0,z:-2},{x:5,y:0,z:-2},{x:5,y:5,z:-2},{x:-5,y:5,z:-2}],'#1d302e');
    for(let i=-4;i<=4;i++){polygon([{x:i-.4,y:.2,z:-1.95},{x:i+.3,y:.2,z:-1.95},{x:i+.3,y:1.1,z:-1.95},{x:i-.4,y:1.1,z:-1.95}],i%2?'#2c403a':'#263a34');}
    for(const x of [-3.5,3.5]){const light=project({x,y:4.5,z:-1.8});ctx.save();ctx.shadowColor='#e0e9b3';ctx.shadowBlur=22;ctx.fillStyle='#e9efc9';ctx.fillRect(light.x*W-20,light.y*H,40,3);ctx.restore();}
    polygon([{x:-4.5,y:0,z:-2},{x:4.5,y:0,z:-2},{x:4.5,y:0,z:8},{x:-4.5,y:0,z:8}],'#a57448');
    for(let i=0;i<30;i++){const x=-4.5+i*.3;polygon([{x,y:.001,z:-2},{x:x+.295,y:.001,z:-2},{x:x+.295,y:.001,z:8},{x,y:.001,z:8}],['#ae7d50','#b78352','#aa7649','#ba8757'][i%4]);
      for(let z=-2+(i%3);z<8;z+=3)line([{x,y:.003,z},{x:x+.3,y:.003,z}],'#593c2725',.6);
    }
    polygon([{x:-1.22,y:.005,z:-1.2},{x:1.22,y:.005,z:-1.2},{x:1.22,y:.005,z:3},{x:-1.22,y:.005,z:3}],'#294e45c9');
    line([{x:-3.8,y:.01,z:-1.2},{x:3.8,y:.01,z:-1.2},{x:3.8,y:.01,z:7.5},{x:-3.8,y:.01,z:7.5}],'#f2e3c5bb',2,true);
    line([{x:-1.22,y:.01,z:-1.2},{x:-1.22,y:.01,z:3},{x:1.22,y:.01,z:3},{x:1.22,y:.01,z:-1.2}]);
    ring(0,.01,3,1.22,'#f2e3c5bb',2,0,Math.PI);ring(0,.01,0,4.1,'#f2e3c5bb',2,0,Math.PI);
    ring(0,.01,0,.6,'#f2e3c588',1,0,Math.PI);shadow(position);
    if(position.z<-.45)ball(position,time,legacy);basket(time);if(position.z>=-.45)ball(position,time,legacy);
    if(ready){const s=project(position),r=BALL_RADIUS*s.scale+8;ctx.strokeStyle='#d3f77599';ctx.setLineDash([3,5]);ctx.lineWidth=1;ctx.beginPath();ctx.arc(s.x*W,s.y*H,r,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#edf4d0bb';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('SWIPE FROM THE BALL',s.x*W,Math.min(H-35,s.y*H+r+23));}
    if(trail){ctx.strokeStyle='#d3f775';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(trail.from.x*W,trail.from.y*H);ctx.lineTo(trail.to.x*W,trail.to.y*H);ctx.stroke();}
  };
}
