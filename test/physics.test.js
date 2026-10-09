import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, sampleFrames, BALL_RADIUS, COURT_BOUNDS, courtPosition, project, reboundWorld, reboundPosition, validGesture, shotGuide, shotSpeed, HOOP, NET_LENGTH, netResponse, netPoint } from '../public/physics.js';
import { cameraPose } from '../public/physics.js';
import { PerspectiveCamera, Vector3 } from 'three';

test('swipe power and direction affect scoring; simulation replays deterministically', () => {
  const good = { dx: 0, dy: .35, duration: .32 };
  assert.equal(simulateShot(good).made, true);
  assert.equal(simulateShot({ ...good, dx: .02 }).made, true,'a small near-rim error can still score');
  assert.equal(simulateShot({ ...good, dx: .04 }).made, false,'a modest angular error now misses');
  assert.equal(simulateShot({ ...good, dx: .12 }).made, false,'a more sideways flick now misses');
  assert.equal(simulateShot({ ...good, dy: .12 }).made, false,'a weak swipe now falls outside the smaller power window');
  assert.equal(simulateShot({ ...good, dy: .08, duration: 1.2 }).made, false,'a tiny slow drag still misses');
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
  assert.equal(simulateShot({ dx: 0, dy: .39, duration: .32 },{x:.1,z:0}).feedback, 'Off the rim');
  const banks = [];
  for(let dy=.25;dy<=.65;dy+=.005) {
    const shot = simulateShot({dx: .01,dy,duration:.32});
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

test('release speed and direction need accuracy while the guide remains valid at each catch location',()=>{
  const width=shotGuide().maxSpeed-shotGuide().minSpeed;
  assert.ok(width>.65 && width<1.2,'power now needs precision instead of the previous 5.4 m/s window');
  for(const origin of [{x:0,z:6},{x:1,z:2},{x:.1,z:0},{x:0,z:1},{x:.1,z:1},{x:2,z:-.7},{x:3.8,z:7.5}]) {
    const guide=shotGuide(origin);
    assert.equal(guide.reachable,true);
    const margin=(guide.maxSpeed-guide.minSpeed)*.2;
    for(const speed of [guide.minSpeed+margin,guide.speed,guide.maxSpeed-margin]) {
      const dy=(speed-1.2)/7*.32,gesture={dx:0,dy,duration:.32,velocity:dy/.32};
      assert.ok(validGesture(gesture));
      assert.equal(simulateShot(gesture,origin).made,true,`guide power ${speed} scores at ${JSON.stringify(origin)}`);
    }
  }
  for(const velocity of [.05,.5,.9,1.3,2])assert.equal(simulateShot({dx:0,dy:.35,duration:.32,velocity}).made,false,'different release speeds genuinely miss');
  assert.equal(simulateShot({dx:.15,dy:.35,duration:.32}).made,false);
  assert.equal(simulateShot({dx:0,dy:.85,duration:.08}).made,false);
});

test('short gentle swipes release below the hoop rather than being rejected',()=>{
  const soft={dx:0,dy:.012,duration:.6,velocity:.02};
  assert.equal(validGesture(soft),true);
  const shot=simulateShot(soft);
  assert.equal(shot.made,false);assert.equal(shot.feedback,'Short of the hoop');
  assert.ok(shot.flight.every(f=>f[2]<HOOP.y),'a soft release never reaches hoop height');
  assert.ok(shot.flight.at(-1)[3]>5,'a soft release falls near the player');
  for(const dy of [0,.004,-.01])assert.equal(validGesture({...soft,dy}),false,'clicks, tiny jitter and downward drags do not shoot');
  assert.equal(validGesture({...soft,dy:.03,duration:.02}),true,'a short, quick flick also releases');
});

test('small angular changes steer the launch without an aim dead zone',()=>{
  const straight={dx:0,dy:.35,duration:.32};
  const center=sampleFrames(simulateShot(straight).flight,100);
  const right=sampleFrames(simulateShot({...straight,dx:.02}).flight,100);
  const left=sampleFrames(simulateShot({...straight,dx:-.02}).flight,100);
  assert.equal(center.x,0);assert.ok(right.x>.01 && left.x<-.01);
  assert.ok(Math.abs(right.x+left.x)<1e-9,'equal angular offsets steer symmetrically');
});

test('a basket loses speed in the net, then accelerates freely below it',()=>{
  const shot=simulateShot({dx:0,dy:.35,duration:.32});
  assert.equal(shot.made,true);
  const impact=shot.netImpact;
  assert.ok(impact.time>0 && impact.velocity.y<0);
  const entry=sampleFrames(shot.flight,impact.time*1000);
  assert.ok(Math.abs(entry.y-HOOP.y)<.015,'the net reaction begins at the descending hoop crossing');
  const exitIndex=shot.flight.findIndex(f=>f[0]>impact.time && f[2]<HOOP.y-NET_LENGTH);
  const before=shot.flight[exitIndex-1],exit=shot.flight[exitIndex];
  const exitSpeed=(before[2]-exit[2])/(exit[0]-before[0]);
  assert.ok(exitSpeed < -impact.velocity.y*.9,'the net noticeably slows the downward ball');
  const later=shot.flight[exitIndex+3],next=shot.flight[exitIndex+4];
  const laterSpeed=(later[2]-next[2])/(next[0]-later[0]);
  assert.ok(laterSpeed>exitSpeed+.5,'gravity accelerates the ball again after it exits');
  assert.equal(simulateShot({dx:.2,dy:.35,duration:.32}).netImpact,null,'a miss never triggers a swish');
});

test('net motion begins with the basket, keeps the rim attachments fixed and settles',()=>{
  const shot=simulateShot({dx:0,dy:.35,duration:.32}),impact=shot.netImpact;
  const rest=netResponse(null,0),before=netResponse(impact,impact.time-.01);
  assert.deepEqual(before,rest);
  const pulled=netResponse(impact,impact.time+.1),settling=netResponse(impact,impact.time+.9);
  const attachment={x:HOOP.radius,y:HOOP.y-.02,z:0};
  const bottom={x:.13,y:HOOP.y-.02-NET_LENGTH,z:0};
  assert.deepEqual(netPoint(attachment,pulled),attachment,'the cords stay tied to the rim');
  const stretched=netPoint(bottom,pulled);
  assert.ok(stretched.y<bottom.y-.03 && stretched.x>bottom.x,'the lower net stretches and opens');
  assert.ok(Math.abs(pulled.swayZ)>.005,'incoming horizontal momentum sways the net');
  assert.ok(Math.abs(settling.stretch)<Math.abs(pulled.stretch)*.1,'the reaction damps out');
  assert.deepEqual(netPoint(bottom,netResponse(impact,impact.time+2)),bottom,'the resting shape is restored');
  assert.deepEqual(netResponse(JSON.parse(JSON.stringify(impact)),impact.time+.1),pulled,'saved contact data reproduces the same motion');
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
    const dy=(guide.speed-1.2)/7*.32;
    const gesture={dx:0,dy,duration:.32,velocity:dy/.32};
    assert.ok(Math.abs(shotSpeed(gesture)-guide.speed)<1e-9);
    assert.equal(simulateShot(gesture,origin).made,true,'releasing at the target with straight aim scores');
    targets.push(guide.speed);
  }
  assert.ok(targets[0]>targets[1]+1,'a farther shot needs a higher target velocity');
  assert.equal(validGesture({dx:0,dy:.4,duration:3,velocity:1}),true,'a flick after a long hold still releases');
});

test('recent velocity sets launch power regardless of drag length or time held',()=>{
  const gesture={dx:0,dy:.35,duration:.32};
  const original=simulateShot(gesture);
  assert.deepEqual(simulateShot({...gesture,velocity:.35/.32}).flight,original.flight);
  assert.deepEqual(simulateShot({...gesture,dy:.7,duration:5,velocity:.35/.32}).flight,original.flight,'drag length and holding do not charge the shot');
  const stopped={...gesture,dy:.8,duration:5,velocity:0};
  assert.equal(simulateShot(stopped).made,false,'a long drag with no release velocity stays weak');
  const fast=simulateShot({...gesture,velocity:3});
  const slow=simulateShot({...gesture,velocity:.4});
  assert.ok(sampleFrames(fast.flight,100).z<sampleFrames(slow.flight,100).z);
  for(const velocity of [NaN,Infinity,-1,101,null,'1'])assert.equal(validGesture({...gesture,velocity}),false);
});
