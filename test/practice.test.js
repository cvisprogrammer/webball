import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPractice,practiceAction} from '../public/practice.js';
import {reboundPosition,reboundWorld,START_POSITION,strokeGuide} from '../public/physics.js';

test('solo shootaround needs no second player, counts baskets, and allows another shot',()=>{
  const game=createPractice();
  assert.equal(game.phase,'shoot');assert.equal(game.solo,true);assert.deepEqual(game.positions[0],START_POSITION);
  practiceAction(game,{action:'shoot',gesture:{dx:0,dy:.22,duration:.088,velocity:2.5}});
  assert.equal(game.scores[0],2);assert.equal(game.baskets,1);assert.equal(game.attempts,1);
  assert.equal(game.phase,'shoot');assert.equal(game.turn,0);
  practiceAction(game,{action:'shoot',gesture:{dx:.2,dy:.35,duration:.175}});
  assert.equal(game.phase,'rebound');assert.equal(game.attempts,2);
});

test('solo player catches their own miss and shoots from the catch location',()=>{
  const game=createPractice();
  const gesture={dx:.2,dy:.35,duration:.175};
  practiceAction(game,{action:'shoot',gesture},1000);
  const trajectory=game.trajectory;
  practiceAction(game,{action:'start'},2000);
  assert.throws(()=>practiceAction(game,{action:'catch',x:0,y:0},2500),/closer/);
  const point=reboundPosition(trajectory,500,game.positions[0]),world=reboundWorld(trajectory,500);
  practiceAction(game,{action:'catch',...point},2500);
  assert.equal(game.phase,'shoot');assert.equal(game.rebounds[0],1);
  assert.deepEqual(game.positions[0],{x:world.x,z:world.z});
  practiceAction(game,{action:'shoot',gesture},3000);
  assert.deepEqual(game.trajectory.origin,{x:world.x,z:world.z});
});

test('a rebound basket earns one point and returns solo play to a two-point foul-line shot',()=>{
  const game=createPractice();
  game.positions[0]={x:0,z:1};
  practiceAction(game,{action:'shoot',gesture:{dx:0,dy:.18,duration:.072,velocity:2.5}});
  assert.equal(game.scores[0],1);assert.equal(game.baskets,1);assert.equal(game.attempts,1);
  assert.deepEqual(game.positions[0],START_POSITION);assert.equal(game.phase,'shoot');
  assert.equal(game.trajectory,null);assert.equal(game.startedAt,null);
  practiceAction(game,{action:'shoot',gesture:{dx:0,dy:.22,duration:.088,velocity:2.5}});
  assert.equal(game.scores[0],3);assert.equal(game.baskets,2);assert.equal(game.attempts,2);
  assert.deepEqual(game.positions[0],START_POSITION);
  game.positions[0]={x:0,z:6};
  practiceAction(game,{action:'shoot',gesture:{dx:0,dy:.32,duration:.128,velocity:2.5}});
  assert.equal(game.scores[0],4,'a shot beyond the foul line also earns one point');
  assert.deepEqual(game.positions[0],START_POSITION);
});

test('returning to the starting spot keeps practice stats and changes no multiplayer state',()=>{
  const first=createPractice(),other=createPractice();
  practiceAction(first,{action:'shoot',gesture:{dx:.2,dy:.35,duration:.175}});
  first.positions[0]={x:2,z:3};
  practiceAction(first,{action:'reset'});
  assert.deepEqual(first.positions[0],START_POSITION);assert.equal(first.phase,'shoot');assert.equal(first.attempts,1);
  assert.equal(other.attempts,0);assert.deepEqual(other.positions[0],START_POSITION);
});

test('free-throw drill repeats both misses and baskets at the foul line and keeps stats',()=>{
  const game=createPractice(),other=createPractice();
  practiceAction(game,{action:'shoot',gesture:{dx:.2,dy:.35,duration:.175}});
  practiceAction(game,{action:'drill',enabled:true});
  assert.equal(game.drill,true);assert.equal(game.phase,'shoot');assert.equal(game.trajectory,null);
  assert.equal(game.attempts,1);assert.deepEqual(game.positions[0],START_POSITION);
  for(const gesture of[{dx:0,dy:.02,duration:.5,velocity:.9},{dx:.2,dy:.4,duration:.44,velocity:.9}]) {
    practiceAction(game,{action:'shoot',gesture});
    assert.equal(game.phase,'shoot');assert.deepEqual(game.positions[0],START_POSITION);
    assert.equal(game.trajectory,null);assert.equal(game.startedAt,null);assert.equal(game.rebounds[0],0);
    assert.throws(()=>practiceAction(game,{action:'start'}),/unavailable/);
  }
  const guide=strokeGuide();
  practiceAction(game,{action:'shoot',gesture:{dx:0,dy:guide.length,duration:guide.duration,velocity:guide.velocity}});
  assert.equal(game.attempts,4);assert.equal(game.scores[0],2);assert.equal(game.baskets,1);
  assert.equal(game.phase,'shoot');assert.deepEqual(game.positions[0],START_POSITION);
  practiceAction(game,{action:'drill',enabled:false});
  practiceAction(game,{action:'shoot',gesture:{dx:0,dy:.02,duration:.5,velocity:.9}});
  assert.equal(game.phase,'rebound');assert.ok(game.trajectory);assert.equal(game.attempts,5);
  assert.equal(game.scores[0],2);assert.equal(game.baskets,1);
  assert.equal(other.drill,false);assert.equal(other.attempts,0);
  assert.throws(()=>practiceAction(game,{action:'drill',enabled:'true'}),/practice mode/);
});
