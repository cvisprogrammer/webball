import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSwipe, moveSwipe, swipeGesture } from '../public/swipe.js';
import { shotSpeed, simulateShot, validGesture } from '../public/physics.js';

test('a steady flick uses its measured velocity and the guide matches its release',()=>{
  const swipe=createSwipe({x:.5,y:.8},0,1);
  for(let time=40;time<=320;time+=40)moveSwipe(swipe,{x:.5,y:.8-.35*time/320},time);
  const preview=swipeGesture(swipe,320);
  moveSwipe(swipe,{...swipe.to},320);
  const release=swipeGesture(swipe,320);
  assert.ok(Math.abs(preview.velocity-.35/.32)<1e-9);
  assert.equal(shotSpeed(preview),shotSpeed(release));
  assert.equal(simulateShot(release).made,true);
});

test('a very gentle short drag and a flick after holding both release',()=>{
  const soft=createSwipe({x:.5,y:.8},0,1);
  moveSwipe(soft,{x:.5,y:.79},200);
  moveSwipe(soft,{x:.5,y:.78},400);
  const release=swipeGesture(soft,432);
  assert.equal(validGesture(release),true);assert.equal(simulateShot(release).made,false);
  const held=createSwipe({x:.5,y:.8},0,1);
  for(let i=0;i<=8;i++)moveSwipe(held,{x:.5,y:.8-.35*i/8},3000+i*40);
  const flick=swipeGesture(held,3352);
  assert.ok(flick.duration>3);assert.equal(validGesture(flick),true);
  assert.equal(simulateShot(flick).made,true,'waiting before a real flick does not reject it');
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
    for(let time=40;time<=320;time+=40)moveSwipe(swipe,{x:.5,y:.8-.35*time/320},time);
    const preview=swipeGesture(swipe,320),power=shotSpeed(preview);
    assert.equal(shotSpeed(swipeGesture(swipe,320+gap)),power,'live guide holds through the brief lift-off gap');
    moveSwipe(swipe,{...swipe.to},320+gap);
    const release=swipeGesture(swipe,320+gap);
    assert.equal(shotSpeed(release),power,'release launches with the same previewed velocity');
    assert.equal(simulateShot(release).made,true,'the normal lift-off gap does not turn a good swipe into a miss');
    assert.deepEqual(simulateShot(release).flight,simulateShot(preview).flight);
  }
});
