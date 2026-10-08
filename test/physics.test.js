import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, sampleFrames, BALL_RADIUS, project, reboundPosition, validGesture } from '../public/physics.js';
import { cameraPose } from '../public/physics.js';
import { PerspectiveCamera, Vector3 } from 'three';
import { wheelGesture } from '../public/gestures.js';

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
  assert.equal(simulateShot({ dx: 0, dy: .34, duration: .32 }).feedback, 'Off the rim');
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

test('equal-length trackpad swipes launch farther when faster; line deltas also work', () => {
  const slow=wheelGesture([{dx:0,dy:-110,time:0},{dx:0,dy:-110,time:400}],650);
  const fast=wheelGesture([{dx:0,dy:-110,time:0},{dx:0,dy:-110,time:100}],650);
  const slowShot=simulateShot(slow),fastShot=simulateShot(fast);
  const slowStart=sampleFrames(slowShot.flight,100),fastStart=sampleFrames(fastShot.flight,100);
  assert.ok(fastStart.z<slowStart.z,'faster flick has more forward velocity');
  assert.equal(fastShot.made,false,'overpowered shot misses');
  assert.equal(wheelGesture([{dx:0,dy:2,mode:1,time:0}],640).dy,.05);
});

test('shots from nearby and sideways catch locations can reach the basket', () => {
  for(const origin of [{x:1,z:2},{x:.1,z:0},{x:2,z:-1}]) {
    let basket=false;
    for(let dy=.08;dy<.85;dy+=.005) {
      const shot=simulateShot({dx:0,dy,duration:.32},origin);
      assert.equal(shot.flight[0][1],origin.x);assert.equal(shot.flight[0][3],origin.z);
      basket ||= shot.made;
    }
    assert.ok(basket,'a suitable swipe can score from the catch location');
  }
});
