export const REBOUND_DURATION = 8000;
export const BALL_RADIUS = .12;
export const HOOP = { x: 0, y: 3.05, z: 0, radius: .23 };
export const NET_LENGTH = .42;
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
export const START_POSITION = { x: 0, z: 6 };
export const COURT_BOUNDS = { minX: -3.8, maxX: 3.8, minZ: -.75, maxZ: 7.5, maxY: 7.35 };
export const SHOT_ASSIST_RADIUS = .65;
export const MIN_SWIPE_DISTANCE = .01;
export function courtPosition(position = START_POSITION) {
  return { x: clamp(Number.isFinite(position?.x) ? position.x : START_POSITION.x, COURT_BOUNDS.minX, COURT_BOUNDS.maxX),
    z: clamp(Number.isFinite(position?.z) ? position.z : START_POSITION.z, COURT_BOUNDS.minZ, COURT_BOUNDS.maxZ) };
}
export const MAX_SHOT_SPEED = 17;
const swipeVelocity = gesture => gesture.velocity ?? gesture.dy / Math.max(.008,gesture.duration);
export function shotSpeed(gesture) {
  const velocity=Math.max(0,swipeVelocity(gesture));
  // Work per unit mass is proportional to upward travel and a push inferred
  // from release speed. The bounded push keeps everyday brisk flicks usable;
  // extra travel still adds energy. Convert that work to kinetic energy:
  // v_ball² = 2 * work / mass. This mapping is identical at every catch spot.
  const push=velocity/(velocity+2);
  return clamp(Math.sqrt(450*Math.max(0,gesture.dy)*push),0,MAX_SHOT_SPEED);
}
function launchModel(origin) {
  const distance=Math.hypot(origin.x,origin.z),underHoop=distance<=.85;
  // A layup includes reaching up from the caught standing position. This
  // clears the underside of the rim without moving the player's feet.
  const height=underHoop ? 2.1 : 1.6;
  let apex=underHoop ? 3.65 : 3.9+Math.max(0,distance-2)*.18;
  // A rebound can leave the player behind the board. Choose an arc that
  // passes below or above it instead of sending every layup into its back.
  if(!underHoop && origin.z<-.57 && Math.abs(origin.x*.57/origin.z)<1.03) {
    const fraction=1-.57/Math.abs(origin.z);
    const boardHeight=peak=>{
      const v=Math.sqrt(2*9.81*(peak-height));
      const t=(v+Math.sqrt(2*9.81*(peak-HOOP.y)))/9.81*fraction;
      return height+v*t-9.81*t*t/2;
    };
    const crossed=boardHeight(apex);
    if(crossed>2.4 && crossed<4) {
      const clear=[3.5,4.8,5.4,6.2,7].find(peak=>{const y=boardHeight(peak);return y<=2.4 || y>=4;});
      if(clear)apex=clear;
    }
  }
  const vertical=Math.sqrt(2*9.81*(apex-height));
  const time=(vertical+Math.sqrt(2*9.81*(apex-HOOP.y)))/9.81;
  const flat=underHoop ? 0 : distance/time;
  return {distance,underHoop,height,carryDuration:underHoop ? .18 : 0,
    angle:Math.atan2(vertical,flat),estimate:Math.hypot(vertical,flat)};
}
export function cameraPose(player = START_POSITION, focus = null) {
  player = courtPosition(player);
  const distance = Math.hypot(player.x, player.z) || 1;
  const forward = { x: -player.x / distance, z: -player.z / distance };
  if(distance === 1 && player.x === 0 && player.z === 0) forward.z = -1;
  const eye = { x: clamp(player.x - forward.x * .9, -4.7, 4.7), y: 1.75,
    z: clamp(player.z - forward.z * .9, -1.85, 8.5) };
  const target = focus ? { x: focus.x, y: focus.y + .35, z: focus.z } :
    { x: eye.x + forward.x * 8, y: eye.y + .8, z: eye.z + forward.z * 8 };
  // Looking straight up/down otherwise leaves the camera's right axis undefined.
  if(Math.hypot(target.x-eye.x,target.z-eye.z)<.02){target.x+=forward.x*.02;target.z+=forward.z*.02;}
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
  let ball;
  if (trajectory.frames) ball = sampleFrames(trajectory.frames,elapsed);
  // Keep rebounds already stored by the first release playable.
  else {
    const t = clamp(elapsed / REBOUND_DURATION, 0, 1);
    ball = { x: (trajectory.aim-.5)*6 + trajectory.direction*t*1.5,
      y: BALL_RADIUS + Math.abs(Math.sin(t*Math.PI*3))*.8*(1-t), z: 2+4*t };
  }
  // Older saved bounces may have escaped the former walls. Keep their replay
  // and catch location safe without discarding the saved turn or trajectory.
  return { ...courtPosition(ball), y: clamp(Number.isFinite(ball.y) ? ball.y : BALL_RADIUS, BALL_RADIUS, COURT_BOUNDS.maxY) };
}
export function reboundPosition(trajectory,elapsed,player=START_POSITION) {
  const ball=reboundWorld(trajectory,elapsed);return project(ball,player,ball);
}
export const reboundDuration = trajectory => trajectory.frames ? trajectory.duration : REBOUND_DURATION;
export function validGesture(g) {
  return g && ['dx', 'dy', 'duration'].every(k => Number.isFinite(g[k])) && Math.abs(g.dx) <= 2 && g.dy >= MIN_SWIPE_DISTANCE && g.dy <= 2 && g.duration >= .008 &&
    (g.velocity === undefined || (Number.isFinite(g.velocity) && g.velocity >= 0 && g.velocity <= 100));
}
export function simulateShot(gesture, origin = START_POSITION) {
  return simulate(gesture, courtPosition(origin), true);
}
export function shotOnTarget(gesture, origin = START_POSITION) {
  return !!validGesture(gesture) && simulate(gesture, courtPosition(origin), false).made;
}
function simulate(gesture, origin, savePath, physicalSpeed = null) {
  if (!validGesture(gesture)) throw new Error('Swipe upward from the ball to shoot');
  const model=launchModel(origin),distance=model.distance;
  const speed = physicalSpeed ?? shotSpeed(gesture);
  const forward = {x:-origin.x/(distance||1),z:-origin.z/(distance||1)};
  if(origin.x===0 && origin.z===0)forward.z=-1;
  // Aim follows the actual swipe angle, including small deviations.
  const side=clamp(gesture.dx/gesture.dy,-1.5,1.5);
  const flat=model.underHoop ? 0 : speed*Math.cos(model.angle)/Math.hypot(1,side);
  let vx=flat*(forward.x-side*forward.z), vz=flat*(forward.z+side*forward.x);
  let vy = speed * Math.sin(model.angle);
  let x = model.underHoop ? -side*forward.z*.25 : origin.x;
  let z = model.underHoop ? side*forward.x*.25 : origin.z;
  let y = model.height, made = false, contact = null, feedback = 'Air ball', shotLive = true, assisted = false, netImpact = null, netExited = false;
  const frames = savePath ? [[0, origin.x, 1.6, origin.z]] : null, dt = 1 / 120;
  if(savePath && model.carryDuration) {
    for(let t=.025;t<model.carryDuration;t+=.025) {
      const f=Math.sin(t/model.carryDuration*Math.PI/2);
      frames.push([t,origin.x+(x-origin.x)*f,1.6+(y-1.6)*f,origin.z+(z-origin.z)*f]);
    }
    frames.push([model.carryDuration,x,y,z]);
  }
  const impact = (time, kind) => { if (contact === null && !made) { contact = time; feedback = kind; } };
  for (let step = 1; step <= 1440; step++) {
    const time = model.carryDuration+step * dt, previousX = x, previousY = y, previousZ = z;
    vy -= 9.81 * dt;
    vx *= 1 - .025 * dt; vz *= 1 - .025 * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    // Redirect a nearby descending shot once, before the board or rim can
    // block it. Launch speed and large misses remain driven by the swipe.
    if (shotLive && !assisted && contact === null && y <= HOOP.y + 1.15 && y > HOOP.y + .15 && vy < 0) {
      const remaining = (vy + Math.sqrt(vy * vy + 2 * 9.81 * (y - HOOP.y))) / 9.81;
      const landingX = x + vx * remaining, landingZ = z + vz * remaining;
      if (remaining > .05 && Math.hypot(landingX, landingZ) <= SHOT_ASSIST_RADIUS) {
        const entryTime = (vy + Math.sqrt(vy * vy + 2 * 9.81 * (y - HOOP.y - .05))) / 9.81;
        vx = -x / entryTime; vz = -z / entryTime;
        assisted = true;
      }
    }
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
      const crossing=(previousY-HOOP.y)/(previousY-y);
      netImpact={time:time-dt+crossing*dt,x:previousX+(x-previousX)*crossing,z:previousZ+(z-previousZ)*crossing,velocity:{x:vx,y:vy,z:vz}};
      made = true; feedback = 'Bucket!'; vx *= .5; vz *= .5;
    }
    // The hanging cords dissipate energy only after a basket and while the
    // ball is inside the net. Gravity resumes its normal acceleration below it.
    if (made && !netExited) {
      if(y<=HOOP.y-NET_LENGTH || Math.hypot(x,z)>HOOP.radius+BALL_RADIUS)netExited=true;
      else if(y<=HOOP.y){vy *= Math.exp(-5*dt); vx *= Math.exp(-9*dt); vz *= Math.exp(-9*dt);}
    }
    if (y < BALL_RADIUS) {
      shotLive = false;
      y = BALL_RADIUS;
      if (vy < 0) { impact(time, z > 2 ? 'Short of the hoop' : z < -.65 ? 'Long of the hoop' : 'Wide of the hoop'); vy = Math.abs(vy) > .5 ? -vy * .72 : 0; vx *= .82; vz *= .82; }
      vx *= .992; vz *= .992;
    }
    if(x<COURT_BOUNDS.minX){x=COURT_BOUNDS.minX;vx=Math.abs(vx)*.65;shotLive=false;impact(time,'Wide of the hoop');}
    if(x>COURT_BOUNDS.maxX){x=COURT_BOUNDS.maxX;vx=-Math.abs(vx)*.65;shotLive=false;impact(time,'Wide of the hoop');}
    if(z<COURT_BOUNDS.minZ){z=COURT_BOUNDS.minZ;vz=Math.abs(vz)*.65;shotLive=false;impact(time,'Long of the hoop');}
    if(z>COURT_BOUNDS.maxZ){z=COURT_BOUNDS.maxZ;vz=-Math.abs(vz)*.65;shotLive=false;impact(time,'Long of the hoop');}
    if(y>COURT_BOUNDS.maxY){y=COURT_BOUNDS.maxY;vy=-Math.abs(vy)*.5;shotLive=false;impact(time,'Too much power');}
    if (!savePath && (made || !shotLive)) return { made };
    if (savePath && step % 3 === 0) frames.push([time, x, y, z]);
  }
  if (!savePath) return { made };
  const split = contact === null ? 2 : contact;
  const start = sampleFrames(frames, split * 1000);
  const rebound = [[0, start.x, start.y, start.z], ...frames.filter(f => f[0] > split).map(f => [f[0] - split, ...f.slice(1)])];
  const flight = [...frames.filter(f => f[0] < split), [split, start.x, start.y, start.z]];
  return { version: 10, launchSpeed:speed, netImpact, frames: rebound, flight: made ? frames.filter(f => f[0] <= 3) : flight,
    duration: rebound.at(-1)[0] * 1000, flightDuration: made ? 3000 : split * 1000, made, feedback, gesture, origin: {x:origin.x,z:origin.z} };
}

const calibrationCache = new Map();
function shotCalibration(origin) {
  origin = courtPosition(origin);
  const key=`${origin.x},${origin.z}`;
  if(calibrationCache.has(key))return calibrationCache.get(key);
  const model=launchModel(origin);
  // Find a successful release interval in the actual simulation,
  // including its gravity, air drag, rim and backboard collisions.
  const makes = speed => speed>=3.5 && speed<=15.8 && simulate({dx:0,dy:.35,duration:.32},origin,false,speed).made;
  let best=null;
  function search(low,high,step) {
    let band=null;
    for(let speed=Math.max(3.5,low);speed<=Math.min(15.8,high)+1e-9;speed+=step) {
      if(makes(speed)) {
        band ||= {minSpeed:speed,maxSpeed:speed};band.maxSpeed=speed;
        if(!best || band.maxSpeed-band.minSpeed > best.maxSpeed-best.minSpeed)best={...band};
      } else band=null;
    }
  }
  search(3.5,15.8,.025);
  // Near the underside of the rim, small collision changes can separate
  // successful powers. Resolve those bands finely instead of bridging gaps.
  let precision=.002;
  if(best){
    const broad=best,narrow=broad.maxSpeed-broad.minSpeed<.1;
    precision=narrow ? .0001 : .002;best=null;
    const padding=narrow ? .025 : 0;
    search(broad.minSpeed-padding,broad.maxSpeed+padding,precision);best ||= broad;
  }
  if(best) {
    for(let i=0;i<5 && makes(best.minSpeed-precision);i++)best.minSpeed-=precision;
    for(let i=0;i<5 && makes(best.maxSpeed+precision);i++)best.maxSpeed+=precision;
  }
  let speed=best ? clamp(model.estimate,best.minSpeed+(best.maxSpeed-best.minSpeed)*.1,best.maxSpeed-(best.maxSpeed-best.minSpeed)*.1) : model.estimate;
  if(best && !makes(speed))speed=(best.minSpeed+best.maxSpeed)/2;
  const calibration={speed,minSpeed:best?.minSpeed??speed,maxSpeed:best?.maxSpeed??speed,
    reachable:!!best};
  if(calibrationCache.size>200)calibrationCache.clear();calibrationCache.set(key,calibration);return calibration;
}
export function shotGuide(origin = START_POSITION) {
  return shotCalibration(origin);
}

// The recorded crossing drives both renderers without restarting the motion
// if a phone switches to the light court partway through a basket.
export function netResponse(impact, elapsed) {
  const age=impact ? elapsed-impact.time : -1;
  if(age<0 || age>1.5)return {stretch:0,flare:0,swayX:0,swayZ:0};
  const strength=clamp(-impact.velocity.y/6,.4,1.2);
  const pulse=Math.sin(age*10)*Math.exp(-age*4);
  const sway=Math.sin(age*9)*Math.exp(-age*3);
  return {stretch:.1*strength*pulse,
    flare:.04*strength*Math.sin(Math.PI*clamp(age/.2,0,1))*Math.exp(-age*4),
    swayX:clamp(impact.velocity.x*.035+impact.x*.25,-.06,.06)*sway,
    swayZ:clamp(impact.velocity.z*.035+impact.z*.25,-.06,.06)*sway};
}
export function netPoint(point, response) {
  const depth=clamp((HOOP.y-.02-point.y)/NET_LENGTH,0,1),weight=depth*depth;
  const spread=1+response.flare*depth/.13;
  return {x:point.x*spread+response.swayX*weight,y:point.y-response.stretch*weight,z:point.z*spread+response.swayZ*weight};
}
