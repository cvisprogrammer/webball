import { START_POSITION, courtPosition, validGesture, simulateShot, reboundDuration, reboundPosition, reboundWorld } from './physics.js';

export function createPractice() {
  return { solo:true, seat:0, players:['You',null], scores:[0,0], rebounds:[0,0],
    positions:[{...START_POSITION},{...START_POSITION}], turn:0, phase:'shoot',
    trajectory:null, startedAt:null, version:0, attempts:0, baskets:0 };
}
export function practiceAction(game,body,now=Date.now()) {
  game.positions[0] = courtPosition(game.positions[0]);
  if(body.action==='reset') {
    game.positions[0]={...START_POSITION};game.phase='shoot';game.trajectory=null;game.startedAt=null;
  } else if(body.action==='shoot' && game.phase==='shoot') {
    if(!validGesture(body.gesture))throw new Error('Press the ball, drag upward, then release to shoot.');
    const trajectory=simulateShot(body.gesture,game.positions[0]);
    game.attempts++;
    if(trajectory.made){game.scores[0]+=2;game.baskets++;}
    else{game.phase='rebound';game.trajectory=trajectory;game.startedAt=null;}
  } else if(body.action==='start' && game.phase==='rebound') {
    game.startedAt=now;
  } else if(body.action==='catch' && game.phase==='rebound' && game.startedAt!==null) {
    const elapsed=now-game.startedAt;
    if(elapsed<0 || elapsed>reboundDuration(game.trajectory))throw new Error('The ball got away. Replay the rebound.');
    const ball=reboundPosition(game.trajectory,elapsed,game.positions[0]);
    if(!Number.isFinite(body.x) || !Number.isFinite(body.y) || Math.hypot(body.x-ball.x,body.y-ball.y)>.06)
      throw new Error('Tap closer to the ball');
    const caught=reboundWorld(game.trajectory,elapsed);
    game.positions[0]={x:caught.x,z:caught.z};game.rebounds[0]++;game.phase='shoot';game.trajectory=null;game.startedAt=null;
  } else throw new Error('That action is unavailable');
  game.version++;
  return game;
}
