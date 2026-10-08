export const REBOUND_DURATION = 8000;
export const BALL_RADIUS = .12;
export const HOOP = { x: 0, y: 3.05, z: 0, radius: .23 };
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const START_POSITION = { x: 0, z: 6 };
export const MAX_SHOT_SPEED = 17;
export const shotSpeed = gesture => clamp(3.8 + gesture.dy * 7 + gesture.dy / Math.max(.08,gesture.duration) * 2.3, 4.5, MAX_SHOT_SPEED);
const launchAngle = distance => distance < .11 ? Math.PI/2 : Math.atan2(1.45+1.358*distance,distance);
export function cameraPose(player = START_POSITION, focus = null) {
  const distance = Math.hypot(player.x, player.z) || 1;
  const forward = { x: -player.x / distance, z: -player.z / distance };
  if(distance === 1 && player.x === 0 && player.z === 0) forward.z = -1;
  const eye = { x: player.x - forward.x * .9, y: 1.75, z: player.z - forward.z * .9 };
  const target = focus ? { x: focus.x, y: focus.y + .35, z: focus.z } :
    { x: eye.x + forward.x * 8, y: eye.y + .8, z: eye.z + forward.z * 8 };
  return { eye, target };
}
// Same first-person camera matrices as Three.js, including head tracking during a bounce.
export function project(p, player = START_POSITION, focus = null) {
  const {eye,target} = cameraPose(player,focus);
  let fx=target.x-eye.x, fy=target.y-eye.y, fz=target.z-eye.z;
  const length=Math.hypot(fx,fy,fz);fx/=length;fy/=length;fz/=length;
  const flat=Math.hypot(fx,fz)||1, rx=-fz/flat, rz=fx/flat;
  // cross(right, forward) gives camera up.
  const up={x:-rz*fy,y:rz*fx-rx*fz,z:rx*fy};
  const dx=p.x-eye.x,dy=p.y-eye.y,dz=p.z-eye.z;
  const depth=dx*fx+dy*fy+dz*fz, focal=1/Math.tan(Math.PI/6);
  return { x:.5+(dx*rx+dz*rz)/depth*focal/2/(700/650),
    y:.5-(dx*up.x+dy*up.y+dz*up.z)/depth*focal/2, scale:650*focal/2/depth,depth };
}
export function sampleFrames(frames, elapsed) {
  const t = clamp(elapsed / 1000, 0, frames.at(-1)[0]);
  let low = 0, high = frames.length - 1;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (frames[mid][0] <= t) low = mid; else high = mid; }
  const a = frames[low], b = frames[high], f = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f };
}
export function reboundWorld(trajectory, elapsed) {
  if (trajectory.frames) return sampleFrames(trajectory.frames,elapsed);
  // Keep rebounds already stored by the first release playable.
  const t = clamp(elapsed / REBOUND_DURATION, 0, 1);
  return { x: (trajectory.aim-.5)*6 + trajectory.direction*t*1.5,
    y: BALL_RADIUS + Math.abs(Math.sin(t*Math.PI*3))*.8*(1-t), z: 2+4*t };
}
export function reboundPosition(trajectory,elapsed,player=START_POSITION) {
  const ball=reboundWorld(trajectory,elapsed);return project(ball,player,ball);
}
export const reboundDuration = trajectory => trajectory.frames ? trajectory.duration : REBOUND_DURATION;
export function validGesture(g) {
  return g && ['dx', 'dy', 'duration'].every(k => Number.isFinite(g[k])) && Math.abs(g.dx) <= .8 && g.dy >= .08 && g.dy <= .85 && g.duration >= .08 && g.duration <= 6;
}
export function simulateShot(gesture, origin = START_POSITION) {
  if (!validGesture(gesture)) throw new Error('Swipe upward from the ball to shoot');
  const speed = shotSpeed(gesture);
  const distance = Math.hypot(origin.x,origin.z);
  const forward = {x:-origin.x/(distance||1),z:-origin.z/(distance||1)};
  if(origin.x===0 && origin.z===0)forward.z=-1;
  const side=clamp(gesture.dx/gesture.dy,-1.5,1.5);
  const angle=launchAngle(distance);
  const flat=speed*Math.cos(angle);
  let vx=flat*(forward.x-side*forward.z), vz=flat*(forward.z+side*forward.x);
  let vy = speed * Math.sin(angle);
  let x = origin.x, y = 1.6, z = origin.z, made = false, contact = null, feedback = 'Air ball', shotLive = true;
  const frames = [[0, x, y, z]], dt = 1 / 120;
  const impact = (time, kind) => { if (contact === null && !made) { contact = time; feedback = kind; } };
  for (let step = 1; step <= 1440; step++) {
    const time = step * dt, previousY = y, previousZ = z;
    vy -= 9.81 * dt;
    vx *= 1 - .025 * dt; vz *= 1 - .025 * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    // Plane backboard and a spherical ball, with energy lost on impact.
    if (Math.abs(x) < .91 && y > 2.55 && y < 3.85 && ((previousZ > -.33 && z <= -.33 && vz < 0) || (previousZ < -.57 && z >= -.57 && vz > 0))) {
      z = vz < 0 ? -.33 : -.57; vz = -vz * .68; vx *= .85; impact(time, 'Off the backboard');
    }
    // Closest point on the circular rim gives a torus collision normal.
    const radial = Math.hypot(x, z), rimX = radial ? x / radial * HOOP.radius : HOOP.radius;
    const rimZ = radial ? z / radial * HOOP.radius : 0;
    const nx = x - rimX, ny = y - HOOP.y, nz = z - rimZ;
    const distance = Math.hypot(nx, ny, nz), contactRadius = BALL_RADIUS + .018;
    if (!made && distance < contactRadius && distance > .00001) {
      const normal = [nx / distance, ny / distance, nz / distance];
      const velocity = vx * normal[0] + vy * normal[1] + vz * normal[2];
      if (velocity < 0) {
        vx -= 1.72 * velocity * normal[0]; vy -= 1.72 * velocity * normal[1]; vz -= 1.72 * velocity * normal[2];
        const push = contactRadius - distance; x += normal[0] * push; y += normal[1] * push; z += normal[2] * push;
        impact(time, 'Off the rim');
      }
    }
    if (shotLive && !made && previousY > HOOP.y && y <= HOOP.y && vy < 0 && Math.hypot(x, z) < HOOP.radius - BALL_RADIUS) {
      made = true; feedback = 'Bucket!'; vx *= .5; vz *= .5;
    }
    if (y < BALL_RADIUS) {
      shotLive = false;
      y = BALL_RADIUS;
      if (vy < 0) { impact(time, z > 2 ? 'Short of the hoop' : z < -.65 ? 'Long of the hoop' : 'Wide of the hoop'); vy = Math.abs(vy) > .5 ? -vy * .72 : 0; vx *= .82; vz *= .82; }
      vx *= .992; vz *= .992;
    }
    if(y<6 && Math.abs(x)>5.8){x=Math.sign(x)*5.8;vx*= -.65;shotLive=false;impact(time,'Wide of the hoop');}
    if(y<6 && z< -2){z=-2;vz=Math.abs(vz)*.65;shotLive=false;impact(time,'Long of the hoop');}
    if(z>10.8){z=10.8;vz=-Math.abs(vz)*.65;shotLive=false;impact(time,'Long of the hoop');}
    if(y>7.5){y=7.5;vy=-Math.abs(vy)*.5;shotLive=false;impact(time,'Too much power');}
    if (step % 3 === 0) frames.push([time, x, y, z]);
  }
  const split = contact === null ? 2 : contact;
  const start = sampleFrames(frames, split * 1000);
  const rebound = [[0, start.x, start.y, start.z], ...frames.filter(f => f[0] > split).map(f => [f[0] - split, ...f.slice(1)])];
  const flight = [...frames.filter(f => f[0] < split), [split, start.x, start.y, start.z]];
  return { version: 3, frames: rebound, flight: made ? frames.filter(f => f[0] <= 3) : flight,
    duration: rebound.at(-1)[0] * 1000, flightDuration: made ? 3000 : split * 1000, made, feedback, gesture, origin: {x:origin.x,z:origin.z} };
}

const guideCache = new Map();
export function shotGuide(origin = START_POSITION) {
  const key=`${origin.x},${origin.z}`;
  if(guideCache.has(key))return guideCache.get(key);
  const distance=Math.hypot(origin.x,origin.z),angle=launchAngle(distance);
  const estimate=distance<.11 ? 6 : Math.sqrt(9.81*distance*distance/(2*Math.cos(angle)**2*(distance*Math.tan(angle)-1.45)));
  // Find a generous successful release interval in the actual simulation,
  // including its gravity, air drag, rim and backboard collisions.
  const makes = speed => speed>=5 && speed<=15.8 && simulateShot({dx:0,dy:(speed-3.8)/(7+2.3/.32),duration:.32},origin).made;
  let best=null;
  function search(low,high,step) {
    let band=null;
    for(let speed=Math.max(5,low);speed<=Math.min(15.8,high)+1e-9;speed+=step) {
      if(makes(speed)) {
        band ||= {minSpeed:speed,maxSpeed:speed};band.maxSpeed=speed;
        if(!best || band.maxSpeed-band.minSpeed > best.maxSpeed-best.minSpeed)best={...band};
      } else band=null;
    }
  }
  search(estimate-.5,estimate+.5,.01);
  if(!best)search(5,15.8,.03);
  if(best){const broad=best;best=null;search(broad.minSpeed,broad.maxSpeed,.002);best ||= broad;}
  if(best) {
    for(let i=0;i<5 && makes(best.minSpeed-.002);i++)best.minSpeed-=.002;
    for(let i=0;i<5 && makes(best.maxSpeed+.002);i++)best.maxSpeed+=.002;
  }
  const speed=best?(best.minSpeed+best.maxSpeed)/2:clamp(estimate,5,15.8);
  const guide={speed:best && !makes(speed)?best.minSpeed:speed,minSpeed:best?.minSpeed??speed,maxSpeed:best?.maxSpeed??speed,reachable:!!best};
  if(guideCache.size>200)guideCache.clear();guideCache.set(key,guide);return guide;
}
