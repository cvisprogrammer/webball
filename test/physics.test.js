import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, sampleFrames, BALL_RADIUS, COURT_BOUNDS, courtPosition, project, reboundWorld, reboundPosition, validGesture, shotGuide, shotSpeed } from '../public/physics.js';
import { cameraPose } from '../public/physics.js';
import { PerspectiveCamera, Vector3 } from 'three';

test('swipe power and direction affect scoring; simulation replays deterministically', () => {
  const good = { dx: 0, dy: .35, duration: .32 };
  assert.equal(simulateShot(good).made, true);
  assert.equal(simulateShot({ ...good, dx: .12 }).made, false);
  assert.equal(simulateShot({ ...good, dy: .12 }).made, false);
  assert.equal(simulateShot({ ...good, duration: .08 }).made, false);
  const miss = simulateShot({ ...good, dx: .2 });
  assert.deepEqual(miss, simulateShot({ ...good, dx: .2 }));
  assert.deepEqual(reboundPosition(miss, 600), project(sampleFrames(miss.frames, 600), undefined, sampleFrames(miss.frames, 600)));
  assert.equal(validGesture({ dx: 0, dy: -.3, duration: .3 }), false);
  assert.equal(validGesture({ dx: Infinity, dy: .3, duration: .3 }), false);
});

test('ball respects the floor, loses bounce energy, and shot/rebound paths meet', () => {
  const shot = simulateShot({ dx: .2, dy: .35, duration: .32 });
  const impact = shot.flight.at(-1);
  assert.deepEqual(impact.slice(1), shot.frames[0].slice(1));
  assert.ok(shot.frames.every(f => f[2] >= BALL_RADIUS - 1e-9));
  const peaks = [];
  for (let i = 1; i < shot.frames.length - 1; i++) {
    if(shot.frames[i][2] > shot.frames[i-1][2] && shot.frames[i][2] > shot.frames[i+1][2]) peaks.push(shot.frames[i][2]);
  }
  assert.ok(peaks.length >= 3, 'multiple physical bounces occurred');
  assert.ok(peaks[1] < peaks[0] && peaks[2] < peaks[1], 'restitution dissipates energy');
});

test('rim and backboard physically deflect shots', () => {
  assert.equal(simulateShot({ dx: 0, dy: .34, duration: .32 },{x:.1,z:0}).feedback, 'Off the rim');
  const banks = [];
  for(let dy=.25;dy<=.65;dy+=.005) {
    const shot = simulateShot({dx: .03,dy,duration:.32});
    if(shot.feedback==='Off the backboard')banks.push(shot);
  }
  assert.ok(banks.length > 0, 'some shots hit the backboard');
  assert.ok(banks.some(s => s.frames.some((f,i)=>i>0 && f[3]>s.frames[i-1][3])), 'backboard reverses depth velocity');
});

test('first-person catch projection matches the WebGL camera from different positions', () => {
  for(const player of [{x:0,z:6},{x:2,z:3},{x:-1,z:-.4}]) {
    const p={x:.7,y:.4,z:2},pose=cameraPose(player,p);
    const camera=new PerspectiveCamera(60,700/650,.04,50);
    camera.position.set(pose.eye.x,pose.eye.y,pose.eye.z);camera.lookAt(pose.target.x,pose.target.y,pose.target.z);camera.updateMatrixWorld();
    const projected=new Vector3(p.x,p.y,p.z).project(camera),actual=project(p,player,p);
    assert.ok(Math.abs(actual.x-(projected.x+1)/2)<1e-9);
    assert.ok(Math.abs(actual.y-(1-projected.y)/2)<1e-9);
  }
});

test('equal-length deliberate flicks launch farther when faster', () => {
  const slow={dx:0,dy:.35,duration:.4};
  const fast={dx:0,dy:.35,duration:.1};
  const slowShot=simulateShot(slow),fastShot=simulateShot(fast);
  const slowStart=sampleFrames(slowShot.flight,100),fastStart=sampleFrames(fastShot.flight,100);
  assert.ok(fastStart.z<slowStart.z,'faster flick has more forward velocity');
  assert.equal(fastShot.made,false,'overpowered shot misses');
});

test('shots from nearby and sideways catch locations can reach the basket', () => {
  for(const origin of [{x:1,z:2},{x:.1,z:0},{x:2,z:-.7}]) {
    let basket=false;
    for(let dy=.08;dy<.85;dy+=.005) {
      const shot=simulateShot({dx:0,dy,duration:.32},origin);
      assert.equal(shot.flight[0][1],origin.x);assert.equal(shot.flight[0][3],origin.z);
      basket ||= shot.made;
    }
    assert.ok(basket,'a suitable swipe can score from the catch location');
  }
});

test('friendly shot assistance forgives broader power and aim errors while large errors still miss',()=>{
  const guide=shotGuide();
  assert.ok(guide.maxSpeed-guide.minSpeed>1.2,'a broad scoring window rather than the previous 0.44 m/s interval');
  for(const speed of [8.3,8.65,9.35]) {
    const dy=.35,gesture={dx:.025,dy,duration:.32,velocity:(speed-3.8-dy*7)/2.3};
    assert.equal(simulateShot(gesture).made,true,`power and aim error at ${speed} m/s still scores`);
  }
  assert.equal(simulateShot({dx:.15,dy:.35,duration:.32}).made,false);
  assert.equal(simulateShot({dx:0,dy:.85,duration:.08}).made,false);
});

test('high and sideways shots stay on court, including every rebound sample',()=>{
  const gestures=[{dx:.8,dy:.85,duration:.08},{dx:-.8,dy:.35,duration:.08},{dx:0,dy:.85,duration:.08}];
  for(const origin of [{x:0,z:6},{x:3.8,z:7.5},{x:-3.8,z:-.75}])for(const gesture of gestures) {
    const shot=simulateShot(gesture,origin);
    for(const [,x,y,z] of [...shot.flight,...shot.frames]) {
      assert.ok(Number.isFinite(x+y+z));
      assert.ok(x>=COURT_BOUNDS.minX && x<=COURT_BOUNDS.maxX);
      assert.ok(z>=COURT_BOUNDS.minZ && z<=COURT_BOUNDS.maxZ);
      assert.ok(y>=BALL_RADIUS && y<=COURT_BOUNDS.maxY);
    }
  }
});

test('old escaped rebounds and catch positions remain playable with cameras inside the room',()=>{
  const trajectory={frames:[[0,9,6.2,-3],[1,-10,.12,12]],duration:1000};
  for(const elapsed of [0,500,1000]) {
    const ball=reboundWorld(trajectory,elapsed),player=courtPosition(ball),pose=cameraPose(player);
    assert.deepEqual(courtPosition(ball),player);
    assert.ok(ball.x>=COURT_BOUNDS.minX && ball.x<=COURT_BOUNDS.maxX);
    assert.ok(ball.z>=COURT_BOUNDS.minZ && ball.z<=COURT_BOUNDS.maxZ);
    assert.ok(pose.eye.x>-5.8 && pose.eye.x<5.8 && pose.eye.z>-2 && pose.eye.z<11);
    const held=project({...player,y:1.6},player);
    assert.ok(held.depth>0 && held.x>0 && held.x<1 && held.y>0 && held.y<1,'the held ball is visible');
    assert.equal(shotGuide(player).reachable,true,'the repaired catch location can shoot');
  }
  const player={x:0,z:6},pose=cameraPose(player),focus={x:pose.eye.x,y:6,z:pose.eye.z};
  const overhead=project(focus,player,focus);
  assert.ok(Number.isFinite(overhead.x+overhead.y+overhead.scale));
  assert.deepEqual(courtPosition({x:Infinity,z:NaN}),{x:0,z:6});
});

test('range guide target scores in the real simulation and adapts to the catch position',()=>{
  const origins=[{x:0,z:6},{x:1,z:2},{x:.1,z:0},{x:2,z:-1}];
  const targets=[];
  for(const origin of origins) {
    const guide=shotGuide(origin);
    assert.equal(guide.reachable,true);
    assert.ok(guide.speed>=guide.minSpeed && guide.speed<=guide.maxSpeed);
    const dy=(guide.speed-3.8)/(7+2.3/.32);
    const gesture={dx:0,dy,duration:.32,velocity:dy/.32};
    assert.ok(Math.abs(shotSpeed(gesture)-guide.speed)<1e-9);
    assert.equal(simulateShot(gesture,origin).made,true,'releasing at the target with straight aim scores');
    targets.push(guide.speed);
  }
  assert.ok(targets[0]>targets[1]+1,'a farther shot needs a higher target velocity');
  assert.equal(validGesture({dx:0,dy:.4,duration:3}),false,'shoot with a deliberate flick rather than holding to charge');
});

test('recent swipe velocity sets launch power and legacy gestures keep their original physics',()=>{
  const gesture={dx:0,dy:.35,duration:.32};
  const original=simulateShot(gesture);
  assert.deepEqual(simulateShot({...gesture,velocity:.35/.32}).flight,original.flight);
  const fast=simulateShot({...gesture,velocity:3});
  const slow=simulateShot({...gesture,velocity:.4});
  assert.ok(sampleFrames(fast.flight,100).z<sampleFrames(slow.flight,100).z);
  for(const velocity of [NaN,Infinity,-1,101,null,'1'])assert.equal(validGesture({...gesture,velocity}),false);
});
