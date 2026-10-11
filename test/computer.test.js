import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createComputerMatch,computerAction,computerGesture,computerCatchTime} from '../public/computer.js';
import {createPractice} from '../public/practice.js';
import {START_POSITION,strokeGuide,validGesture,shotOnTarget,simulateShot,reboundDuration,reboundPosition,reboundWorld} from '../public/physics.js';

const good=origin=>{const guide=strokeGuide(origin);return {dx:0,dy:guide.length,duration:guide.duration,velocity:guide.velocity};};
const miss={dx:.2,dy:.35,duration:.175};
function seeded(initial) {let seed=initial;return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};}

test('computer matches start locally with two scores and enforce whose turn it is',()=>{
  const match=createComputerMatch(),practice=createPractice();
  assert.equal(match.computer,true);assert.equal(match.solo,true);assert.equal(match.seat,0);
  assert.deepEqual(match.scores,[0,0]);assert.equal(match.turn,0);assert.equal(match.target,11);
  assert.deepEqual(match.positions,[START_POSITION,START_POSITION]);
  assert.throws(()=>computerAction(match,{action:'shoot',gesture:good()},1000,1),/other player/);
  assert.throws(()=>computerAction(match,{action:'shoot',gesture:{dx:0,dy:0,duration:1}}),/Press the ball/);
  computerAction(match,{action:'shoot',gesture:good(),points:100,origin:{x:0,z:1}},1000);
  assert.deepEqual(match.scores,[2,0]);assert.equal(match.turn,1);assert.equal(match.phase,'shoot');
  assert.throws(()=>computerAction(match,{action:'shoot',gesture:good()}),/other player/);
  computerAction(match,{action:'shoot',gesture:good()},2000,1);
  assert.deepEqual(match.scores,[2,2]);assert.equal(match.turn,0);
  assert.deepEqual(match.attempts,[1,1]);assert.deepEqual(match.baskets,[1,1]);
  assert.deepEqual(practice.scores,[0,0]);assert.equal(practice.attempts,0);
  assert.throws(()=>createComputerMatch('unknown'),/difficulty/);
  assert.throws(()=>createComputerMatch('__proto__'),/difficulty/);
  assert.throws(()=>computerAction(match,{action:'reset'}),/unavailable/);
});

test('both players must catch the other player’s actual rebound and shoot from that location',()=>{
  const match=createComputerMatch();
  computerAction(match,{action:'shoot',gesture:miss},1000);
  const trajectory=match.trajectory;
  assert.equal(match.turn,1);assert.equal(match.phase,'rebound');
  assert.throws(()=>computerAction(match,{action:'shoot',gesture:good()},1500,1),/unavailable/);
  assert.throws(()=>computerAction(match,{action:'catch',x:0,y:0},1500,1),/unavailable/);
  computerAction(match,{action:'start'},2000,1);
  const caughtAt=2000+computerCatchTime(trajectory,()=>.5),elapsed=caughtAt-2000,world=reboundWorld(trajectory,elapsed);
  assert.ok(elapsed>0 && elapsed<=reboundDuration(trajectory));assert.ok(world.y<=2.15);
  assert.throws(()=>computerAction(match,{action:'catch',x:0,y:0},2000+elapsed,1),/closer/);
  computerAction(match,{action:'catch',...reboundPosition(trajectory,elapsed,match.positions[1])},2000+elapsed,1);
  assert.deepEqual(match.positions[1],{x:world.x,z:world.z});assert.equal(match.turn,1);
  assert.deepEqual(match.rebounds,[0,1]);assert.equal(match.phase,'shoot');
  computerAction(match,{action:'shoot',gesture:{dx:0,dy:.01,duration:.5,velocity:.02}},3000,1);
  assert.deepEqual(match.trajectory.origin,{x:world.x,z:world.z});assert.equal(match.turn,0);
  computerAction(match,{action:'start'},4000);
  const humanWorld=reboundWorld(match.trajectory,750),humanPoint=reboundPosition(match.trajectory,750,match.positions[0]);
  computerAction(match,{action:'catch',...humanPoint},4750);
  assert.deepEqual(match.positions[0],{x:humanWorld.x,z:humanWorld.z});
  assert.deepEqual(match.rebounds,[1,1]);assert.equal(match.phase,'shoot');assert.equal(match.turn,0);
});

test('an escaped rebound can be replayed without changing scores or the next shooter',()=>{
  const match=createComputerMatch();computerAction(match,{action:'shoot',gesture:miss},1000);
  computerAction(match,{action:'start'},2000,1);const trajectory=match.trajectory;
  assert.throws(()=>computerAction(match,{action:'catch',x:.5,y:.5},2000+reboundDuration(trajectory)+1,1),/Replay/);
  assert.throws(()=>computerAction(match,{action:'catch',x:.5,y:.5},1999,1),/Replay/);
  computerAction(match,{action:'start'},12000,1);
  computerAction(match,{action:'catch',...reboundPosition(trajectory,500,match.positions[1])},12500,1);
  assert.deepEqual(match.scores,[0,0]);assert.equal(match.turn,1);assert.equal(match.rebounds[1],1);
});

test('foul shots earn two, other shots earn one, and either player can finish a match',()=>{
  for(const seat of[0,1]) {
    const match=createComputerMatch();match.turn=seat;match.scores[seat]=8;
    match.positions[seat]={x:0,z:1};
    computerAction(match,{action:'shoot',gesture:good(match.positions[seat])},1000,seat);
    assert.equal(match.scores[seat],9);assert.equal(match.winner,null);
    assert.deepEqual(match.positions,[START_POSITION,START_POSITION]);
    computerAction(match,{action:'shoot',gesture:good()},2000,1-seat);
    computerAction(match,{action:'shoot',gesture:good()},3000,seat);
    assert.equal(match.scores[seat],11);assert.equal(match.winner,seat);assert.equal(match.phase,'finished');
    assert.throws(()=>computerAction(match,{action:'shoot',gesture:good()},4000,1-seat),/ended/);
    assert.throws(()=>computerAction(match,{action:'start'},4000,seat),/ended/);
    const rematch=createComputerMatch('easy');assert.deepEqual(rematch.scores,[0,0]);assert.equal(rematch.winner,null);
  }
  const match=createComputerMatch();match.scores[0]=10;
  computerAction(match,{action:'shoot',gesture:good()});assert.equal(match.scores[0],12);assert.equal(match.winner,0);
});

test('difficulty changes real gesture accuracy and every level has physical hits and misses',()=>{
  const rates=[];
  for(const difficulty of['easy','normal','hard']) {
    const random=seeded(42);let hits=0,first=null;
    for(let i=0;i<250;i++) {
      const gesture=computerGesture(START_POSITION,difficulty,random);
      assert.equal(validGesture(gesture),true);assert.ok(Math.abs(gesture.dx)>0);
      if(shotOnTarget(gesture))hits++;
      first ||= gesture;
    }
    assert.ok(hits>0 && hits<250,`${difficulty} does not guarantee baskets or misses`);
    const match=createComputerMatch(difficulty);match.turn=1;
    const actual=simulateShot(first);computerAction(match,{action:'shoot',gesture:first},1000,1);
    assert.equal(match.scores[1],actual.points);assert.equal(match.phase,actual.made?'shoot':'rebound');
    if(!actual.made)assert.deepEqual(match.trajectory.flight,actual.flight);
    rates.push(hits);
    for(const origin of[{x:0,z:1},{x:0,z:6},{x:2,z:4},{x:-1,z:-.75}])
      assert.equal(validGesture(computerGesture(origin,difficulty,random)),true);
  }
  assert.ok(rates[0]<rates[1] && rates[1]<rates[2]);
});
