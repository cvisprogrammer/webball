import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, sampleFrames, BALL_RADIUS, COURT_BOUNDS, courtPosition, project, reboundWorld, reboundPosition, validGesture, shotGuide, strokeGuide, shotLesson, shotSpeed, shotValue, releaseFeedback, START_POSITION, HOOP, NET_LENGTH, netResponse, netPoint } from '../public/physics.js';
import { cameraPose } from '../public/physics.js';
import { PerspectiveCamera, Vector3 } from 'three';

const FAR={x:0,z:6};

function gestureAtSpeed(speed,velocity=2.5) {
  let low=.01,high=1;
  for(let i=0;i<40;i++) {
    const dy=(low+high)/2;
    if(shotSpeed({dy,velocity})<speed)low=dy;else high=dy;
  }
  const dy=(low+high)/2;
  return {dx:0,dy,duration:dy/velocity,velocity};
}

test('only shots standing on the painted foul line are worth two points',()=>{
  assert.deepEqual(START_POSITION,{x:0,z:3});
  for(const origin of [START_POSITION,{x:1,z:3},{x:-1.22,z:3.15},{x:1.22,z:2.85}]) {
    assert.equal(shotValue(origin),2);
    assert.equal(simulateShot(gestureAtSpeed(shotGuide(origin).speed),origin).points,2);
  }
  for(const origin of [{x:0,z:1},{x:0,z:6},{x:1.23,z:3},{x:0,z:2.84},{x:0,z:3.16}]) {
    assert.equal(shotValue(origin),1);
    assert.equal(simulateShot(gestureAtSpeed(shotGuide(origin).speed),origin).points,1);
  }
  assert.equal(simulateShot({dx:0,dy:.02,duration:.4}).points,0,'a miss awards no points');
});

test('swipe power and direction affect scoring; simulation replays deterministically', () => {
  const good = { dx: 0, dy: .35, duration: .175 };
  assert.equal(simulateShot(good,FAR).made, true);
  assert.equal(simulateShot({ ...good, dx: .015 },FAR).made, true,'a small near-rim error can still score');
  assert.equal(simulateShot({ ...good, dx: .02 },FAR).made, false,'a larger error hits the rim instead of being pulled into the net');
  assert.equal(simulateShot({ ...good, dx: .04 },FAR).made, false,'a modest angular error now misses');
  assert.equal(simulateShot({ ...good, dx: .12 },FAR).made, false,'a more sideways flick now misses');
  assert.equal(simulateShot({ ...good, dy: .12 },FAR).made, false,'a weak swipe now falls outside the smaller power window');
  assert.equal(simulateShot({ ...good, dy: .08, duration: 1.2 },FAR).made, false,'a tiny slow drag still misses');
  assert.equal(simulateShot({ ...good, duration: .08 },FAR).made, false);
  const miss = simulateShot({ ...good, dx: .2 },FAR);
  assert.deepEqual(miss, simulateShot({ ...good, dx: .2 },FAR));
  assert.deepEqual(reboundPosition(miss, 600,FAR), project(sampleFrames(miss.frames, 600), FAR, sampleFrames(miss.frames, 600)));
  assert.equal(validGesture({ dx: 0, dy: -.3, duration: .3 }), false);
  assert.equal(validGesture({ dx: Infinity, dy: .3, duration: .3 }), false);
});

test('ball respects the floor, loses bounce energy, and shot/rebound paths meet', () => {
  const shot = simulateShot({ dx: .2, dy: .35, duration: .175 },FAR);
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
  assert.equal(simulateShot({ dx: .1, dy: .255, duration: .175 },{x:.1,z:0}).feedback, 'Off the rim');
  const banks = [];
  for(let dy=.25;dy<=.65;dy+=.005) {
    const shot = simulateShot({dx: .01,dy,duration:.175},FAR);
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
  const slowShot=simulateShot(slow,FAR),fastShot=simulateShot(fast,FAR);
  const slowStart=sampleFrames(slowShot.flight,100),fastStart=sampleFrames(fastShot.flight,100);
  assert.ok(fastStart.z<slowStart.z,'faster flick has more forward velocity');
  assert.equal(fastShot.made,false,'overpowered shot misses');
});

test('shots from nearby and sideways catch locations can reach the basket', () => {
  for(const origin of [{x:1,z:2},{x:.1,z:0},{x:2,z:-.7}]) {
    let basket=false;
    for(let dy=.08;dy<.85;dy+=.005) {
      const shot=simulateShot({dx:0,dy,duration:.175},origin);
      assert.equal(shot.flight[0][1],origin.x);assert.equal(shot.flight[0][3],origin.z);
      basket ||= shot.made;
    }
    assert.ok(basket,'a suitable swipe can score from the catch location');
  }
});

test('release speed and direction need accuracy while the guide remains valid at each catch location',()=>{
  const width=shotGuide(FAR).maxSpeed-shotGuide(FAR).minSpeed;
  assert.ok(width>.65 && width<1.2,'power now needs precision instead of the previous 5.4 m/s window');
  for(const origin of [{x:0,z:6},{x:1,z:2},{x:.1,z:0},{x:0,z:1},{x:.1,z:1},{x:2,z:-.7},{x:3.8,z:7.5}]) {
    const guide=shotGuide(origin);
    assert.equal(guide.reachable,true);
    const margin=(guide.maxSpeed-guide.minSpeed)*.2;
    for(const speed of [guide.minSpeed+margin,guide.speed,guide.maxSpeed-margin]) {
      const gesture=gestureAtSpeed(speed);
      assert.ok(validGesture(gesture));
      assert.equal(simulateShot(gesture,origin).made,true,`guide power ${speed} scores at ${JSON.stringify(origin)}`);
    }
  }
  for(const velocity of [.05,.5,1,1.5,3,5])assert.equal(simulateShot({dx:0,dy:.35,duration:.175,velocity},FAR).made,false,'different release speeds genuinely miss');
  assert.equal(simulateShot({dx:.15,dy:.35,duration:.175},FAR).made,false);
  assert.equal(simulateShot({dx:0,dy:.85,duration:.08},FAR).made,false);
});

test('short gentle swipes release below the hoop rather than being rejected',()=>{
  const soft={dx:0,dy:.012,duration:.6,velocity:.02};
  assert.equal(validGesture(soft),true);
  const shot=simulateShot(soft,FAR);
  assert.equal(shot.made,false);assert.equal(shot.feedback,'Short of the hoop');
  assert.ok(shot.flight.every(f=>f[2]<HOOP.y),'a soft release never reaches hoop height');
  assert.ok(shot.flight.at(-1)[3]>5,'a soft release falls near the player');
  for(const dy of [0,.004,-.01])assert.equal(validGesture({...soft,dy}),false,'clicks, tiny jitter and downward drags do not shoot');
  assert.equal(validGesture({...soft,dy:.03,duration:.02}),true,'a short, quick flick also releases');
});

test('small angular changes steer the launch without an aim dead zone',()=>{
  const straight={dx:0,dy:.35,duration:.175};
  const center=sampleFrames(simulateShot(straight,FAR).flight,100);
  const right=sampleFrames(simulateShot({...straight,dx:.02},FAR).flight,100);
  const left=sampleFrames(simulateShot({...straight,dx:-.02},FAR).flight,100);
  assert.equal(center.x,0);assert.ok(right.x>.01 && left.x<-.01);
  assert.ok(Math.abs(right.x+left.x)<1e-9,'equal angular offsets steer symmetrically');
  assert.ok(Math.abs(Math.hypot(right.x,right.z-6)-Math.abs(center.z-6))<1e-9,'changing aim preserves the energy supplied by the swipe');
});

test('sideways assistance is gradual and wider angled shots are not redirected into the net',()=>{
  const good={dx:.012,dy:.22,duration:.088,velocity:2.5};
  const shot=simulateShot(good);
  assert.equal(shot.made,true,'a small aim error can still score');
  assert.equal(simulateShot({...good,dx:.033}).made,false,'a wider angle that previously snapped into the hoop now misses');
  const descending=shot.flight.filter((f,i,a)=>i>0 && f[2]>HOOP.y+.1 && f[2]<a[i-1][2]);
  const velocities=descending.slice(1).map((f,i)=>(f[1]-descending[i][1])/(f[0]-descending[i][0]));
  assert.ok(velocities.some(v=>v<0),'the small nudge can bend the approach');
  assert.ok(velocities.slice(1).every((v,i)=>Math.abs(v-velocities[i])<.12),'the approach has no sudden sideways velocity reversal');
  assert.ok(Math.max(...shot.flight.filter(f=>f[2]>HOOP.y+.1).map(f=>f[1]))>.07,'the original lateral travel remains visible');
});

test('release glow builds toward ideal power and only signals green for a scoring release',()=>{
  for(const origin of [{x:0,z:1},START_POSITION,FAR]) {
    const guide=shotGuide(origin),target=gestureAtSpeed(guide.speed);
    const low=releaseFeedback(gestureAtSpeed(guide.speed*.55),origin);
    const closer=releaseFeedback(gestureAtSpeed(guide.speed*.85),origin);
    const ready=releaseFeedback(target,origin);
    assert.ok(low.strength<closer.strength && closer.strength<ready.strength);
    assert.ok(ready.strength>.999);assert.equal(ready.state,'ready');assert.equal(ready.onTarget,true);
    assert.equal(ready.speed,simulateShot(target,origin).launchSpeed,'the cue predicts the actual release power');
    const wrongAim=releaseFeedback({...target,dx:target.dy},origin);
    assert.equal(wrongAim.strength,ready.strength,'power feedback stays useful when aim is wrong');
    assert.equal(wrongAim.state,'aim');assert.equal(wrongAim.onTarget,false,'correct power alone never promises a basket');
    const tooMuch=releaseFeedback(gestureAtSpeed(guide.maxSpeed*1.2),origin);
    assert.equal(tooMuch.state,'strong');assert.ok(tooMuch.strength<ready.strength);
    assert.equal(releaseFeedback(null,origin).strength,0);
    assert.equal(releaseFeedback({...target,dy:0},origin).strength,0,'a click does not charge the glow');
    assert.equal(releaseFeedback({...target,velocity:0},origin).strength,0,'pausing until the release stops removes the glow');
  }
});

test('the demonstrated smooth stroke scores using unchanged physical input power',()=>{
  const origins=[{x:0,z:1},START_POSITION,FAR,{x:3.8,z:7.5},{x:0,z:0}];
  const guides=origins.map(origin=>{
    const guide=strokeGuide(origin);
    const gesture={dx:0,dy:guide.length,duration:guide.duration,velocity:guide.velocity};
    assert.ok(validGesture(gesture));
    assert.ok(guide.length<=.6+1e-9,'the demonstration fits above the held ball');
    assert.ok(Math.abs(shotSpeed(gesture)-guide.speed)<1e-9);
    assert.equal(simulateShot(gesture,origin).made,true);
    assert.ok(guide.minLength<=guide.length && guide.maxLength>=guide.length);
    assert.ok(Math.abs(shotSpeed({...gesture,dy:guide.minLength})-guide.minSpeed)<1e-9);
    assert.ok(Math.abs(shotSpeed({...gesture,dy:guide.maxLength})-guide.maxSpeed)<1e-9);
    return guide;
  });
  assert.ok(guides[1].duration>.4 && guides[1].duration<.6,'foul-line practice has time to see feedback');
  assert.ok(guides[2].length>guides[1].length && guides[1].length>guides[0].length);
  assert.ok((guides[1].maxLength-guides[1].minLength)/guides[1].velocity>.14,'the scoring glow lasts over 140 ms during a smooth stroke');
});

test('shot lessons distinguish power from aim and give a consistent next adjustment',()=>{
  const guide=strokeGuide(),good={dx:0,dy:guide.length,duration:guide.duration,velocity:guide.velocity};
  const lesson=shotLesson(good);
  assert.equal(lesson.power,'good');assert.equal(lesson.aim,'straight');assert.equal(lesson.onTarget,true);
  const short=shotLesson({...good,dy:good.dy*.4});
  assert.equal(short.power,'short');assert.match(short.tip,/longer stroke/);
  const strong=shotLesson({...good,dy:good.dy*1.6});
  assert.equal(strong.power,'strong');assert.match(strong.tip,/shorter stroke/);
  for(const sign of[-1,1]) {
    const angle=shotLesson({...good,dx:good.dy*.15*sign});
    assert.equal(angle.power,'good');assert.equal(angle.aim,sign>0?'right':'left');
    assert.equal(angle.onTarget,false);assert.match(angle.tip,new RegExp(`aim a little ${sign>0?'left':'right'}`));
    assert.equal(angle.speed,lesson.speed,'direction feedback does not change input energy');
  }
  assert.match(shotLesson({...good,dx:good.dy*.05}).summary,/slightly right/);
  const stopped=shotLesson({...good,velocity:0});
  assert.equal(stopped.power,'short');assert.match(stopped.tip,/avoid pausing/);
});

test('a basket loses speed in the net, then accelerates freely below it',()=>{
  const shot=simulateShot({dx:0,dy:.35,duration:.175},FAR);
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
  assert.equal(simulateShot({dx:.2,dy:.35,duration:.175},FAR).netImpact,null,'a miss never triggers a swish');
});

test('net motion begins with the basket, keeps the rim attachments fixed and settles',()=>{
  const shot=simulateShot({dx:0,dy:.35,duration:.175},FAR),impact=shot.netImpact;
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
  assert.deepEqual(courtPosition({x:Infinity,z:NaN}),{x:0,z:3});
});

test('the guide calls for longer swipes farther away at the same release speed',()=>{
  const origins=[{x:.1,z:0},{x:0,z:1},{x:1,z:2},{x:0,z:6},{x:3.8,z:7.5}];
  const lengths=[];
  for(const origin of origins) {
    const guide=shotGuide(origin),gesture=gestureAtSpeed(guide.speed);
    assert.equal(guide.reachable,true);
    assert.ok(guide.speed>=guide.minSpeed && guide.speed<=guide.maxSpeed);
    assert.equal(simulateShot(gesture,origin).made,true,'the guide target scores in the real simulation');
    assert.ok(Math.abs(simulateShot(gesture,origin).launchSpeed-shotSpeed(gesture))<1e-9,'no distance-dependent boost changes the swipe energy');
    lengths.push(gesture.dy);
  }
  assert.ok(lengths.every((length,i)=>i===0 || length>lengths[i-1]),'a more distant shot needs a longer stroke at the same speed');
  assert.ok(lengths[3]>lengths[1]*1.6,'a distant shot needs noticeably more travel than a close shot');
  assert.equal(validGesture({dx:0,dy:.4,duration:3,velocity:1}),true,'a flick after a long hold still releases');
});

test('short quick flicks score close; longer swipes and accurate aim are needed farther away',()=>{
  const close={x:0,z:1},far={x:0,z:6};
  const short={dx:0,dy:.18,duration:.072,velocity:2.5};
  const long={...short,dy:.32,duration:.128};
  assert.equal(simulateShot(short,close).made,true,'a short quick swipe is sufficient near the basket');
  assert.equal(simulateShot(short,far).made,false,'the same short swipe cannot reach a distant basket');
  assert.equal(simulateShot(long,far).made,true,'continuing the swipe farther supplies enough energy');
  assert.equal(simulateShot(long,close).made,false,'the game does not scale a long swipe down into a layup');
  for(const dy of [.14,.18,.25])assert.equal(simulateShot({...short,dy},close).made,true,'the layup has a generous travel window');
  for(const dy of [.14,.18,.25,.45])assert.equal(simulateShot({...short,dy},far).made,false,'underpowered and overpowered distant strokes miss');
  for(const velocity of [1.8,2.5,3.5])assert.equal(simulateShot({...short,velocity},close).made,true,'normal brisk release speeds are forgiving close up');
  for(const velocity of [.05,10])assert.equal(simulateShot({...long,velocity},far).made,false,'speed still matters with the same travel distance');
  for(const origin of [close,far]) {
    assert.equal(simulateShot({...short,dy:.025,velocity:100},origin).made,false,'even a very fast tiny swipe lacks sufficient work');
    const target=gestureAtSpeed(shotGuide(origin).speed);
    assert.equal(simulateShot({...target,dx:target.dy},origin).made,false,'a large sideways aim error still misses');
  }
  const widths=[1,2,3,4,5,6].map(z=>{const guide=shotGuide({x:0,z});return (guide.maxSpeed-guide.minSpeed)/guide.speed;});
  assert.ok(widths.every((width,i)=>i===0 || width<widths[i-1]),'the physical scoring window narrows gradually with distance');
});

test('a gentle layup starts at the caught position and clears the underside of the rim',()=>{
  for(const origin of [{x:.23,z:0},{x:0,z:.8},{x:.1,z:1},{x:0,z:2}]) {
    const shot=simulateShot(gestureAtSpeed(shotGuide(origin).speed),origin);
    assert.equal(shot.made,true);assert.deepEqual(shot.origin,origin);
    assert.deepEqual(shot.flight[0],[0,origin.x,1.6,origin.z],'the hand motion begins where the rebound was caught');
    assert.ok(Math.max(...shot.flight.map(f=>f[2]))<4.1,'the comfortable close release follows a gentle arc');
    assert.ok(shot.netImpact.time>.5 && shot.netImpact.velocity.y<0,'the ball descends through the hoop');
  }
  const underOrigin={x:.23,z:0},under=simulateShot(gestureAtSpeed(shotGuide(underOrigin).speed),underOrigin);
  assert.ok(under.flight.some(f=>f[0]<.2 && f[1]<.05 && f[2]>2),'the ball is reached up while the saved standing position stays fixed');
});

test('launch power uses both recent speed and swipe travel, but holding still adds no energy',()=>{
  const gesture={dx:0,dy:.35,duration:.175};
  const original=simulateShot(gesture,FAR);
  assert.deepEqual(simulateShot({...gesture,velocity:2},FAR).flight,original.flight);
  assert.deepEqual(simulateShot({...gesture,duration:5,velocity:2},FAR).flight,original.flight,'holding before the same flick does not charge it');
  const longer=simulateShot({...gesture,dy:.7,velocity:2},FAR);
  assert.ok(longer.launchSpeed>original.launchSpeed,'more travel at the same release velocity adds power');
  assert.ok(Math.abs(longer.launchSpeed**2/original.launchSpeed**2-2)<1e-9,'twice the upward work doubles kinetic energy');
  for(const origin of [{x:0,z:1},{x:0,z:6}])assert.equal(simulateShot(gesture,origin).launchSpeed,original.launchSpeed,'the same gesture delivers the same energy from every position');
  const stopped={...gesture,dy:.8,duration:5,velocity:0};
  assert.equal(simulateShot(stopped,FAR).launchSpeed,0,'travel without an upward release supplies no push');
  assert.equal(simulateShot(stopped,FAR).made,false);
  const fast=simulateShot({...gesture,velocity:3},FAR),slow=simulateShot({...gesture,velocity:.4},FAR);
  assert.ok(sampleFrames(fast.flight,100).z<sampleFrames(slow.flight,100).z);
  for(const velocity of [NaN,Infinity,-1,101,null,'1'])assert.equal(validGesture({...gesture,velocity}),false);
});
