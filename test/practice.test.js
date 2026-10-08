import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPractice,practiceAction} from '../public/practice.js';
import {reboundPosition,reboundWorld} from '../public/physics.js';

test('solo shootaround needs no second player, counts baskets, and allows another shot',()=>{
  const game=createPractice();
  assert.equal(game.phase,'shoot');assert.equal(game.solo,true);
  practiceAction(game,{action:'shoot',gesture:{dx:0,dy:.35,duration:.32}});
  assert.equal(game.scores[0],2);assert.equal(game.baskets,1);assert.equal(game.attempts,1);
  assert.equal(game.phase,'shoot');assert.equal(game.turn,0);
  practiceAction(game,{action:'shoot',gesture:{dx:.2,dy:.35,duration:.32}});
  assert.equal(game.phase,'rebound');assert.equal(game.attempts,2);
});

test('solo player catches their own miss and shoots from the catch location',()=>{
  const game=createPractice();
  const gesture={dx:.2,dy:.35,duration:.32};
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

test('returning to the starting spot keeps practice stats and changes no multiplayer state',()=>{
  const first=createPractice(),other=createPractice();
  practiceAction(first,{action:'shoot',gesture:{dx:.2,dy:.35,duration:.32}});
  first.positions[0]={x:2,z:3};
  practiceAction(first,{action:'reset'});
  assert.deepEqual(first.positions[0],{x:0,z:6});assert.equal(first.phase,'shoot');assert.equal(first.attempts,1);
  assert.equal(other.attempts,0);assert.deepEqual(other.positions[0],{x:0,z:6});
});
