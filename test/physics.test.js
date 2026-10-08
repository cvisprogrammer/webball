import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateShot, sampleFrames, BALL_RADIUS, project, reboundPosition, validGesture } from '../public/physics.js';

test('swipe power and direction affect scoring; simulation replays deterministically', () => {
  const good = { dx: 0, dy: .34, duration: .32 };
  assert.equal(simulateShot(good).made, true);
  assert.equal(simulateShot({ ...good, dx: .12 }).made, false);
  assert.equal(simulateShot({ ...good, dy: .12 }).made, false);
  assert.equal(simulateShot({ ...good, duration: .08 }).made, false);
  const miss = simulateShot({ ...good, dx: .2 });
  assert.deepEqual(miss, simulateShot({ ...good, dx: .2 }));
  assert.deepEqual(reboundPosition(miss, 600), project(sampleFrames(miss.frames, 600)));
  assert.equal(validGesture({ dx: 0, dy: -.3, duration: .3 }), false);
  assert.equal(validGesture({ dx: Infinity, dy: .3, duration: .3 }), false);
});

test('ball respects the floor, loses bounce energy, and shot/rebound paths meet', () => {
  const shot = simulateShot({ dx: .2, dy: .34, duration: .32 });
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
  assert.equal(simulateShot({ dx: 0, dy: .32, duration: .32 }).feedback, 'Off the rim');
  const banks = [];
  for(let dy=.25;dy<=.65;dy+=.005) {
    const shot = simulateShot({dx: .03,dy,duration:.32});
    if(shot.feedback==='Off the backboard')banks.push(shot);
  }
  assert.ok(banks.length > 0, 'some shots hit the backboard');
  assert.ok(banks.some(s => s.frames.some((f,i)=>i>0 && f[3]>s.frames[i-1][3])), 'backboard reverses depth velocity');
});
