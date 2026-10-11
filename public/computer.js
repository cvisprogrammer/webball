import { START_POSITION, courtPosition, validGesture, simulateShot, strokeGuide, reboundDuration, reboundPosition, reboundWorld } from './physics.js';

export const COMPUTER_LEVELS = {
  easy: { label:'Easy', power:.30, angle:.50 },
  normal: { label:'Normal', power:.20, angle:.30 },
  hard: { label:'Hard', power:.12, angle:.15 },
};
function levelFor(difficulty) {
  if(!Object.hasOwn(COMPUTER_LEVELS,difficulty))throw new Error('Choose an opponent difficulty.');
  return COMPUTER_LEVELS[difficulty];
}
export function createComputerMatch(difficulty='normal') {
  levelFor(difficulty);
  return { solo:true, computer:true, seat:0, players:['You','Computer'], scores:[0,0], rebounds:[0,0],
    positions:[{...START_POSITION},{...START_POSITION}], turn:0, phase:'shoot', trajectory:null,
    startedAt:null, version:0, attempts:[0,0], baskets:[0,0], difficulty, target:11, winner:null };
}
export function computerAction(game,body,now=Date.now(),seat=game.seat) {
  if(game.phase==='finished')throw new Error('This match has ended. Start a new match.');
  if(seat!==game.turn)throw new Error('It is the other player’s turn');
  if(body.action==='shoot' && game.phase==='shoot') {
    if(!validGesture(body.gesture))throw new Error('Press the ball, drag upward, then release to shoot.');
    const trajectory=simulateShot(body.gesture,game.positions[seat]);
    game.attempts[seat]++;
    if(trajectory.made) {
      game.scores[seat]+=trajectory.points;game.baskets[seat]++;
      game.positions=[{...START_POSITION},{...START_POSITION}];game.trajectory=null;game.startedAt=null;
      if(game.scores[seat]>=game.target){game.winner=seat;game.phase='finished';}
      else game.turn=1-seat;
    } else {
      game.trajectory=trajectory;game.turn=1-seat;game.phase='rebound';game.startedAt=null;
    }
  } else if(body.action==='start' && game.phase==='rebound') {
    game.startedAt=now;
  } else if(body.action==='catch' && game.phase==='rebound' && game.startedAt!==null) {
    const elapsed=now-game.startedAt;
    if(!Number.isFinite(elapsed) || elapsed<0 || elapsed>reboundDuration(game.trajectory))throw new Error('The ball got away. Replay the rebound.');
    const ball=reboundPosition(game.trajectory,elapsed,game.positions[seat]);
    if(!Number.isFinite(body.x) || !Number.isFinite(body.y) || Math.hypot(body.x-ball.x,body.y-ball.y)>.06)
      throw new Error('Tap closer to the ball');
    const caught=reboundWorld(game.trajectory,elapsed);
    game.positions[seat]=courtPosition(caught);game.rebounds[seat]++;
    game.phase='shoot';game.trajectory=null;game.startedAt=null;
  } else throw new Error('That action is unavailable');
  game.version++;
  return game;
}
export function computerGesture(origin,difficulty='normal',random=Math.random) {
  const level=levelFor(difficulty),guide=strokeGuide(origin);
  // One sampled attempt, with human-like variation in both power and aim.
  // Never retry a simulated miss or replace its physical result with a score.
  const noise=()=> (random()+random()+random()-1.5)/1.5;
  const power=1+noise()*level.power,side=noise()*level.angle;
  const dy=guide.length*power*power;
  return {dx:dy*side,dy,duration:dy/guide.velocity,velocity:guide.velocity};
}
export function computerCatchTime(trajectory,random=Math.random) {
  const earliest=.65+random()*.7;
  // Wait for the saved ball to descend within reach; catch its actual position.
  const frame=trajectory.frames.find(f=>f[0]>=earliest && f[2]<=2.15) || trajectory.frames.at(-1);
  return Math.min(frame[0]*1000,reboundDuration(trajectory));
}
