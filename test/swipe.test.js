import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSwipe, moveSwipe, swipeGesture } from '../public/swipe.js';
import { shotSpeed, simulateShot, validGesture } from '../public/physics.js';

const FAR={x:0,z:6};

test('a steady flick uses its measured velocity and the guide matches its release',()=>{
  const swipe=createSwipe({x:.5,y:.8},0,1);
  for(let time=25;time<=175;time+=25)moveSwipe(swipe,{x:.5,y:.8-.35*time/175},time);
  const preview=swipeGesture(swipe,175);
  moveSwipe(swipe,{...swipe.to},175);
  const release=swipeGesture(swipe,175);
  assert.ok(Math.abs(preview.velocity-.35/.175)<1e-9);
  assert.equal(shotSpeed(preview),shotSpeed(release));
  assert.equal(simulateShot(release,FAR).made,true);
});

test('continuing the same-speed swipe adds travel even beyond the velocity sampling window',()=>{
  const gestures=[72,128].map(end=>{
    const swipe=createSwipe({x:.5,y:.8},0,1);
    for(let time=8;time<=end;time+=8)moveSwipe(swipe,{x:.5,y:.8-2.5*time/1000},time);
    const preview=swipeGesture(swipe,end),release=swipeGesture(swipe,end+32);
    assert.equal(shotSpeed(release),shotSpeed(preview),'live energy matches the released shot');
    return release;
  });
  const [short,long]=gestures;
  assert.ok(Math.abs(short.velocity-long.velocity)<1e-9,'release speed stays the same');
  assert.ok(Math.abs(short.dy-.18)<1e-9 && Math.abs(long.dy-.32)<1e-9,'the full upward stroke is retained');
  assert.ok(shotSpeed(long)>shotSpeed(short),'continuing the stroke increases power');
  assert.equal(simulateShot(short,{x:0,z:1}).made,true);
  assert.equal(simulateShot(short,FAR).made,false);
  assert.equal(simulateShot(long,FAR).made,true);
});

test('a very gentle short drag and a flick after holding both release',()=>{
  const soft=createSwipe({x:.5,y:.8},0,1);
  moveSwipe(soft,{x:.5,y:.79},200);
  moveSwipe(soft,{x:.5,y:.78},400);
  const release=swipeGesture(soft,432);
  assert.equal(validGesture(release),true);assert.equal(simulateShot(release,FAR).made,false);
  const held=createSwipe({x:.5,y:.8},0,1);
  for(let i=0;i<=7;i++)moveSwipe(held,{x:.5,y:.8-.35*i/7},3000+i*25);
  const flick=swipeGesture(held,3207);
  assert.ok(flick.duration>3);assert.equal(validGesture(flick),true);
  assert.equal(simulateShot(flick,FAR).made,true,'waiting before a real flick does not reject it');
});

test('the recent flick controls velocity even after an initial slow drag or hold',()=>{
  const swipe=createSwipe({x:.5,y:.8},0,1);
  moveSwipe(swipe,{x:.5,y:.8},800);
  moveSwipe(swipe,{x:.5,y:.79},1000);
  moveSwipe(swipe,{x:.5,y:.69},1040);
  moveSwipe(swipe,{x:.5,y:.59},1080);
  const gesture=swipeGesture(swipe,1080);
  assert.ok(Math.abs(gesture.velocity-2.5)<1e-9,'uses the final flick rather than averaging in the earlier hold');
  assert.ok(shotSpeed(gesture)>shotSpeed({...gesture,velocity:undefined})+4);
});

test('slowing, pausing and reversing affect the live guide and release together',()=>{
  const swipe=createSwipe({x:.5,y:.8},0,1);
  moveSwipe(swipe,{x:.5,y:.6},80);
  const fast=swipeGesture(swipe,80);
  moveSwipe(swipe,{x:.5,y:.57},160);
  const slow=swipeGesture(swipe,160);
  assert.ok(shotSpeed(slow)<shotSpeed(fast));
  assert.ok(swipeGesture(swipe,280).velocity<slow.velocity,'a pause still lowers the live velocity');
  const stopped=swipeGesture(swipe,360);
  assert.equal(stopped.velocity,0);
  moveSwipe(swipe,{...swipe.to},360);
  assert.equal(shotSpeed(swipeGesture(swipe,360)),shotSpeed(stopped));
  moveSwipe(swipe,{x:.5,y:.67},440);
  assert.equal(swipeGesture(swipe,440).velocity,0,'a downward reversal does not count as an upward flick');
});

test('lifting a finger briefly after a scoring flick keeps the previewed velocity',()=>{
  for(const gap of [12,32,49,75,95]) {
    const swipe=createSwipe({x:.5,y:.8},0,1);
    for(let time=25;time<=175;time+=25)moveSwipe(swipe,{x:.5,y:.8-.35*time/175},time);
    const preview=swipeGesture(swipe,175),power=shotSpeed(preview);
    assert.equal(shotSpeed(swipeGesture(swipe,175+gap)),power,'live guide holds through the brief lift-off gap');
    moveSwipe(swipe,{...swipe.to},175+gap);
    const release=swipeGesture(swipe,175+gap);
    assert.equal(shotSpeed(release),power,'release launches with the same previewed velocity');
    assert.equal(simulateShot(release,FAR).made,true,'the normal lift-off gap does not turn a good swipe into a miss');
    assert.deepEqual(simulateShot(release,FAR).flight,simulateShot(preview,FAR).flight);
  }
});
