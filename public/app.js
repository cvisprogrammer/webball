import { reboundPosition, reboundDuration, simulateShot, validGesture, sampleFrames, project, reboundWorld, START_POSITION, courtPosition, releaseFeedback, strokeGuide, shotLesson, shotValue, MAX_SHOT_SPEED, MIN_SWIPE_DISTANCE, netResponse } from './physics.js';
import { createCourt, pointerPosition } from './court3d.js';
import { createPractice, practiceAction } from './practice.js';
import { createComputerMatch, computerAction, computerGesture, computerCatchTime, COMPUTER_LEVELS } from './computer.js';
import { createSwipe, moveSwipe, swipeGesture } from './swipe.js';
import { createLightCourt } from './light-court.js';
const $ = id => document.getElementById(id);
const canvas = $('court');
let swipe = null;
let releaseCue={strength:0,state:'building'};
let lastShot=null, strokeLayout=null;
let drawCourt, drawLightCourt, lightView = false;
function useLightView() {
  swipe = null;
  drawLightCourt ||= createLightCourt(canvas);
  lightView = true; $('graphics-note').hidden = false;
}
try { drawCourt = createCourt(canvas,{ onContextLost: useLightView, onContextRestored: () => {lightView=false;drawLightCourt?.hide();$('graphics-note').hidden=true;} }); }
catch { useLightView(); }
const playerPosition = () => courtPosition(game?.positions?.[game.seat] || START_POSITION);
const params = new URLSearchParams(location.hash.slice(1));
let id = params.get('game') || localStorage.getItem('webball-game');
let practice = createPractice(), computer = null, game = practice, busy = false, playback = null, shot = null, computerNext = null;
let invite = params.get('invite'), inviteId = params.get('game');
const message = text => { $('message').textContent = text; };
async function api(route, body) {
  const response = await fetch(`/api/${route}${route === 'game' || route === 'action' ? `?id=${encodeURIComponent(id)}` : ''}`, {
    method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}
function render() {
  $('game').hidden = false;
  if(!game.solo)$('lobby').hidden = true;
  const againstComputer=!!game.computer,finished=againstComputer && game.winner!==null && !shot;
  $('mode-label').textContent = againstComputer ? 'YOU VS COMPUTER' : game.solo ? game.drill ? 'SOLO FREE-THROW DRILL' : 'SOLO SHOOTAROUND' : 'TWO PLAYER GAME';
  $('practice-modes').hidden=!game.solo;
  $('drill-mode').setAttribute('aria-pressed',String(!!game.drill));
  $('shootaround-mode').setAttribute('aria-pressed',String(!againstComputer && !game.drill));
  $('computer-mode').setAttribute('aria-pressed',String(againstComputer));
  $('practice-mode-help').textContent=againstComputer ? 'First to 11. Score to keep shooting; a miss gives the other player the rebound.' : game.drill ? 'Repeat from the foul line after every shot. Stats stay with you.' : 'Catch rebounds and shoot from where you catch them.';
  $('drill-mode').disabled=$('shootaround-mode').disabled=$('computer-mode').disabled=busy;
  $('computer-controls').hidden=!againstComputer;
  $('new-match').textContent=finished ? 'Play again →' : 'New match';
  $('new-match').disabled=$('computer-difficulty').disabled=busy;
  $('match-banner').hidden=!againstComputer;
  $('multiplayer').hidden = !game.solo; $('practice').hidden = !!game.solo;
  $('resume').hidden = !game.solo || !id;
  $('reset-position').hidden = !game.solo || againstComputer;
  for (let i = 0; i < 2; i++) {
    $(`p${i}`).textContent = (game.players[i] || 'Waiting for player') + (!game.solo && game.seat === i ? ' · YOU' : '');
    $(`s${i}`).textContent = game.scores[i]; $(`r${i}`).textContent = `${game.rebounds[i]} ${game.rebounds[i] === 1 ? 'rebound' : 'rebounds'}`;
  }
  if(game.solo && !againstComputer) { $('p0').textContent='YOU'; $('p1').textContent='SHOTS'; $('s1').textContent=game.attempts; $('r1').textContent=`${game.attempts ? Math.round(game.baskets/game.attempts*100) : 0}% made`; }
  document.querySelector('.versus').textContent=game.solo && !againstComputer?'·':'VS';
  const yours = game.turn === game.seat;
  updateRangeGuide();
  const value=shotValue(playerPosition());
  $('shot-location').textContent = `${Math.hypot(playerPosition().x,playerPosition().z).toFixed(1)} m from the hoop · ${value===2 ? 'foul line · 2 points' : '1 point'} · baskets return you to the foul line`;
  $('turn-label').textContent = againstComputer ? finished ? 'MATCH COMPLETE' : yours ? 'YOUR TURN' : 'COMPUTER’S TURN' : game.solo ? game.drill ? 'DRILL · BUILD YOUR TOUCH' : 'SOLO · FIND YOUR TOUCH' : game.phase === 'waiting' ? 'INVITE YOUR TEAMMATE' : yours ? 'YOUR TURN' : 'SAVED · WAITING FOR PLAYER';
  $('invite-row').hidden = !game.invite;
  if (game.invite) $('invite').value = `${location.origin}/#game=${game.id}&invite=${game.invite}`;
  $('shot-controls').hidden = !(yours && game.phase === 'shoot' && !shot);
  $('start-rebound').hidden = !(yours && game.phase === 'rebound' && !playback && !shot);
  $('start-rebound').textContent = game.startedAt === null ? 'Play the rebound →' : 'Replay the rebound →';
  $('catch-help').hidden = !playback || !yours;
  $('status').textContent = againstComputer ? finished ? game.winner===0 ? 'You win!' : 'Computer wins. Rematch?' : shot ? shot.seat===1 ? 'Computer is shooting.' : 'Your shot is in the air.' : yours ? game.phase==='rebound' ? 'Catch the computer’s miss!' : 'Your shot.' : game.phase==='rebound' ? 'Computer is chasing your rebound.' : 'Computer is lining up a shot.' : game.solo ? (game.phase==='rebound' ? playback ? 'Chase your rebound.' : 'Your rebound is waiting.' : 'The court is yours.') : game.phase === 'waiting' ? 'Good games need two.' :
    game.phase === 'rebound' ? (yours ? playback ? 'Get that rebound!' : 'A rebound is waiting for you.' : 'Your miss is saved.') :
    yours ? 'Make it count.' : `${game.players[game.turn]} is up next.`;
  $('instruction').textContent = againstComputer ? finished ? `Final score: ${game.scores[0]}–${game.scores[1]}. Choose Play again for a new match.` : shot ? 'Watch the shot. Foul-line baskets earn 2 points; other baskets earn 1.' : yours ? game.phase==='rebound' ? 'Tap the moving ball to catch it. Your next shot starts where you catch it.' : 'Press the ball, swipe upward and release. First to 11 wins.' : 'The computer uses the same court and bounces. Its misses become your rebounds.' : game.solo && game.phase==='rebound' ? (playback ? 'Tap your moving ball to catch it. Your next shot starts right where you catch it.' : 'Replay the rebound, or return to the foul line.') : game.phase === 'waiting' ? 'Share the link below. You’ll take the first shot when they join.' :
    game.phase === 'rebound' ? (yours ? 'The saved bounce starts when you’re ready. Catch it to shoot from that spot.' : 'The other player can catch this bounce whenever they return.') :
    yours ? `Press the ball, follow the trail with a smooth upward stroke, then release while moving.${game.solo ? game.drill ? ' Repeat the same shot and use the feedback to adjust.' : ' Try the free-throw drill to build a feel for it.' : ''}` : 'You can leave and come back. This game stays right here.';
  if(againstComputer)$('match-banner').textContent=`${finished ? game.winner===0 ? 'YOU WIN' : 'COMPUTER WINS' : shot ? shot.seat===1 ? 'COMPUTER SHOOTING' : 'YOUR SHOT' : yours ? game.phase==='rebound' ? 'YOUR REBOUND' : 'YOUR TURN' : game.phase==='rebound' ? 'COMPUTER REBOUND' : 'COMPUTER’S TURN'} · ${COMPUTER_LEVELS[game.difficulty].label} · first to ${game.target}`;
}
async function refresh() {
  if (!id || game.solo || busy || shot || playback) return;
  const matchId=id;
  try { const match=await api('game');if(game.solo || id!==matchId)return;game=match;render(); } catch (error) { if(!game.solo)message(error.message); }
}
async function action(body) {
  if (busy) return null;
  busy = true; $('start-rebound').disabled = true;
  try { game = game.computer ? computerAction(game,body) : game.solo ? practiceAction(game,body) : await api('action', { ...body, version: game.version }); message(''); return game; }
  catch (error) { message(error.message); return null; }
  finally { busy = false; $('start-rebound').disabled = false; render(); }
}
if (invite) {
  $('lobby').hidden = false;
  $('lobby-title').textContent = 'Your court is waiting.';
  $('join-button').textContent = 'Join the game ↗';
} else $('resume').hidden = !id;
$('join-form').addEventListener('submit', async event => {
  event.preventDefault(); $('join-button').disabled = true;
  try {
    const match = await api(invite ? 'join' : 'create', { name: $('name').value, id: inviteId, invite });
    cancelInteractions(); game = match; invite = null;
    id = game.id; localStorage.setItem('webball-game', id);
    history.replaceState(null, '', `/#game=${id}`); message(''); render();
  } catch (error) { message(error.message); }
  finally { $('join-button').disabled = false; }
});
async function loadMatch() {
  try { const match=await api('game');cancelInteractions();game=match;history.replaceState(null,'',`/#game=${id}`);message('');render(); }
  catch(error){message(error.message);}
}
function cancelInteractions() {
  if(swipe && canvas.hasPointerCapture(swipe.pointer))canvas.releasePointerCapture(swipe.pointer);
  swipe=null;shot=null;playback=null;lastShot=null;strokeLayout=null;computerNext=null;$('shot-review').hidden=true;$('power').value=0;
}
$('resume').onclick = loadMatch;
$('multiplayer').onclick = () => {
  invite=null;$('lobby-title').textContent='Invite a friend.';$('join-button').textContent='Create a game ↗';
  $('lobby').hidden=false;$('name').focus();
};
$('practice').onclick = () => {
  if(busy)return;cancelInteractions();game=practice;history.replaceState(null,'','/');message('');render();
};
$('reset-position').onclick = async () => {
  if(busy || !game.solo || game.computer)return;cancelInteractions();await action({action:'reset'});message('Back at the foul line.');
};
async function setDrill(enabled) {
  if(busy || !game.solo)return;
  cancelInteractions();game=practice;await action({action:'drill',enabled});
  message(enabled ? 'Free-throw drill: every attempt starts at the foul line.' : 'Shootaround: catch your rebounds and shoot from that spot.');
}
$('drill-mode').onclick=()=>setDrill(true);
$('shootaround-mode').onclick=()=>setDrill(false);
$('computer-mode').onclick=()=>{
  if(busy || game.computer)return;
  cancelInteractions();computer ||= createComputerMatch($('computer-difficulty').value);game=computer;
  history.replaceState(null,'','/');message(game.winner!==null ? 'Match complete. Choose Play again for a rematch.' : 'First to 11 wins!');render();
};
function newComputerMatch() {
  if(busy || !game.computer)return;
  cancelInteractions();computer=createComputerMatch($('computer-difficulty').value);game=computer;
  message('New match. Your ball!');render();
}
$('new-match').onclick=newComputerMatch;
$('computer-difficulty').onchange=newComputerMatch;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite').value); message('Invite copied. Send it to your teammate.'); }
  catch { $('invite').select(); message('Select and copy the invite link above.'); }
};
async function takeShot(gesture) {
  if (busy || shot || !game || game.phase !== 'shoot' || game.turn !== game.seat) return;
  if (!validGesture(gesture)) { message('Press the ball, move it slightly upward, then release to shoot.'); return; }
  const trajectory = simulateShot(gesture, playerPosition());
  shot = { trajectory, start: performance.now(), player: {...playerPosition()}, seat:game.seat };
  lastShot={...shotLesson(gesture,shot.player),player:shot.player};
  $('shot-review').hidden=false;
  $('shot-outcome').textContent='LAST SHOT · IN FLIGHT';
  $('shot-feedback').textContent=lastShot.summary;
  $('shot-adjustment').textContent=lastShot.tip;
  const result = await action({ action: 'shoot', gesture });
  if (!result) {shot=null;lastShot=null;$('shot-review').hidden=true;}
}
$('start-rebound').onclick = async () => {
  if(shot || busy || game.turn!==game.seat || game.phase!=='rebound')return;
  const result = await action({ action: 'start' });
  if (result) { playback = { start: performance.now(), trajectory: result.trajectory, seat:result.turn }; render(); canvas.focus(); }
};
async function catchBall(x, y) {
  if (!playback || shot || busy || game.turn!==game.seat) return;
  const result = await action({ action: 'catch', x, y });
  if (result) { playback = null; message('Rebound caught. Shoot from this spot!'); render(); }
}
function canShoot() { return game && game.phase === 'shoot' && game.turn === game.seat && !busy && !shot; }
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const point = pointerPosition(canvas, event);
  if (playback) { catchBall(point.x, point.y); return; }
  const player=playerPosition();
  const ball = project({ x: player.x, y: 1.6, z: player.z },player);
  if (swipe || !canShoot() || Math.hypot(point.x - ball.x, point.y - ball.y) > .1) return;
  event.preventDefault(); canvas.setPointerCapture(event.pointerId);
  lastShot=null;$('shot-review').hidden=true;
  swipe = createSwipe(point, event.timeStamp, event.pointerId);
  updateRangeGuide(event.timeStamp);
  message(''); canvas.focus();
});
canvas.addEventListener('pointermove', event => {
  if (!swipe || swipe.pointer !== event.pointerId) return;
  const events = event.getCoalescedEvents?.() || [];
  for (const sample of events) moveSwipe(swipe, pointerPosition(canvas, sample), sample.timeStamp);
  moveSwipe(swipe, pointerPosition(canvas, event), event.timeStamp);
  updateRangeGuide(event.timeStamp);
});
canvas.addEventListener('pointerup', event => {
  if (!swipe || swipe.pointer !== event.pointerId) return;
  moveSwipe(swipe, pointerPosition(canvas, event), event.timeStamp);
  const gesture = swipeGesture(swipe, event.timeStamp);
  swipe = null; canvas.releasePointerCapture(event.pointerId); takeShot(gesture);
});
canvas.addEventListener('pointercancel', () => { swipe = null; $('power').value = 0; });
canvas.addEventListener('keydown', event => {
  if(event.code==='Space' && playback) {
    event.preventDefault();const ball=reboundPosition(playback.trajectory,performance.now()-playback.start,playerPosition());catchBall(ball.x,ball.y);
  }
});
canvas.addEventListener('blur', () => { swipe=null;$('power').value=0; });
window.addEventListener('blur', () => { swipe=null;$('power').value=0; });
function updateRangeGuide(time=performance.now()) {
  const display=$('range-display');
  const ready=canShoot(),frozen=!!lastShot && !swipe;
  updateStrokeGuide(ready,time);
  display.hidden=!ready && !frozen;
  if(display.hidden){releaseCue={strength:0,state:'building'};return;}
  const player=frozen ? lastShot.player : playerPosition();
  const gesture=ready && swipe ? swipeGesture(swipe,time) : null;
  const feedback=frozen ? lastShot : releaseFeedback(gesture,player);
  const {guide,speed,inRange,onTarget:aligned}=feedback;
  releaseCue=gesture ? {strength:feedback.strength,state:feedback.state} : {strength:0,state:'building'};
  const distance=Math.hypot(player.x,player.z);
  display.querySelector('.range-title').textContent=frozen ? 'LAST SHOT' : distance<=2 ? 'LAYUP' : 'RANGE';
  display.classList.toggle('frozen',frozen);
  display.style.setProperty('--target-level',`${guide.speed/MAX_SHOT_SPEED*100}%`);
  display.style.setProperty('--zone-bottom',`${guide.minSpeed/MAX_SHOT_SPEED*100}%`);
  display.style.setProperty('--zone-height',`${(guide.maxSpeed-guide.minSpeed)/MAX_SHOT_SPEED*100}%`);
  display.style.setProperty('--power-level',`${speed/MAX_SHOT_SPEED*100}%`);
  display.classList.toggle('aligned',!!aligned);
  $('range-distance').textContent=`${distance.toFixed(1)} m`;
  $('range-status').textContent=frozen ? lastShot.power==='good' ? 'Power good' : lastShot.power==='strong' ? 'Too strong' : 'Too weak' : !gesture ? 'Hold ball' : gesture.dy<MIN_SWIPE_DISTANCE ? 'Move upward' : aligned ? 'On target' : inRange ? 'Aim straight' : speed>guide.maxSpeed ? 'Shorter / slower' : 'Longer / faster';
  $('power').value=speed;
  $('power').setAttribute('aria-valuetext',`${speed.toFixed(1)} meters per second; target ${guide.speed.toFixed(1)}`);
}
function updateStrokeGuide(ready,time) {
  const overlay=$('stroke-guide');
  overlay.toggleAttribute('hidden',!ready);
  $('court-hint').hidden=!ready;
  if(!ready)return;
  const player=playerPosition(),guide=strokeGuide(player);
  const ball=project({x:player.x,y:1.6,z:player.z},player);
  const start=swipe?.from || ball;
  const x=start.x*700,y=start.y*650,target=(start.y-guide.length)*650;
  const key=`${x},${y},${guide.length}`;
  if(strokeLayout!==key) {
    strokeLayout=key;
    $('stroke-path').setAttribute('d',`M ${x} ${y} L ${x} ${target}`);
    $('stroke-zone').setAttribute('x',x-13);
    $('stroke-zone').setAttribute('y',(start.y-guide.maxLength)*650);
    $('stroke-zone').setAttribute('height',Math.max(2,(guide.maxLength-guide.minLength)*650));
    $('stroke-target').setAttribute('cx',x);$('stroke-target').setAttribute('cy',target);
    $('stroke-label').setAttribute('x',x+24);$('stroke-label').setAttribute('y',target+5);
    $('stroke-demo').setAttribute('cx',x);
    // Restart the demonstration when its layout changes.
    overlay.dataset.start=String(time);
  }
  $('stroke-demo').style.display=swipe ? 'none' : '';
  if(!swipe) {
    const age=Math.max(0,time-Number(overlay.dataset.start))/1000;
    const progress=Math.min(1,(age%(guide.duration+1.1))/guide.duration);
    $('stroke-demo').setAttribute('cy',y-guide.length*650*progress);
    $('court-hint').textContent=`Follow the dot’s pace · ${guide.duration.toFixed(1)}-second stroke`;
  } else {
    $('court-hint').textContent='Smooth upward · release while moving';
    $('stroke-input').setAttribute('d',`M ${x} ${y} L ${swipe.to.x*700} ${swipe.to.y*650}`);
  }
  $('stroke-input').style.display=swipe ? '' : 'none';
}
function startLocalRebound(time) {
  if(game.phase!=='rebound' || !game.trajectory)return;
  const seat=game.turn;
  if(game.computer)computerAction(game,{action:'start'},Date.now(),seat);
  else practiceAction(game,{action:'start'});
  playback={start:time,trajectory:game.trajectory,seat,
    catchAt:seat===1 ? computerCatchTime(game.trajectory) : null};
  render();
}
function advanceComputer(time) {
  if(!game.computer || document.hidden || busy || shot || game.phase==='finished' || game.turn!==1)return;
  if(game.phase==='rebound') {
    if(!playback)startLocalRebound(time);
    const elapsed=time-playback.start;
    if(elapsed>reboundDuration(playback.trajectory)){startLocalRebound(time);return;}
    if(elapsed>=playback.catchAt && reboundWorld(playback.trajectory,elapsed).y<=2.15) {
      const point=reboundPosition(playback.trajectory,elapsed,game.positions[1]);
      computerAction(game,{action:'catch',...point},game.startedAt+elapsed,1);
      playback=null;message('Computer caught the rebound.');render();
    }
    return;
  }
  if(!computerNext || computerNext.game!==game || computerNext.version!==game.version)
    computerNext={game,version:game.version,at:time+1100};
  if(time<computerNext.at)return;
  computerNext=null;
  const player={...game.positions[1]},gesture=computerGesture(player,game.difficulty);
  const trajectory=simulateShot(gesture,player);
  shot={trajectory,start:time,player,seat:1};
  computerAction(game,{action:'shoot',gesture},Date.now(),1);
  message('Computer takes a shot.');render();
}
function draw() {
  const time=performance.now();
  advanceComputer(time);
  let player=game.computer && game.turn===1 ? courtPosition(game.positions[1]) : playerPosition();
  let position={x:player.x,y:1.6,z:player.z},focus=null,netState=netResponse(null,0);
  if(shot) {
    player=shot.player;
    const elapsed=performance.now()-shot.start;
    netState=netResponse(shot.trajectory.netImpact,elapsed/1000);
    position=sampleFrames(shot.trajectory.flight,elapsed);focus=position;
    if(elapsed>=shot.trajectory.flightDuration) {
      const made=shot.trajectory.made;
      const opponent=game.computer && shot.seat===1;
      message(game.computer ? made ? `${opponent ? 'Computer scores' : 'Bucket!'} ${shot.trajectory.points} ${shot.trajectory.points===1 ? 'point' : 'points'}. ${opponent ? 'Computer shoots again.' : 'Your ball again! Back to the foul line.'}` : opponent ? 'Computer missed. Catch its rebound!' : 'You missed. Computer gets the rebound.' : made?`Bucket! ${shot.trajectory.points} ${shot.trajectory.points===1 ? 'point' : 'points'}. Back to the foul line. Your ball again!`:game.solo ? game.drill ? `${shot.trajectory.feedback}. Try again from the foul line.` : `${shot.trajectory.feedback}. Tap your rebound or return to the foul line.` : `${shot.trajectory.feedback}. Rebound saved for the other player.`);
      if(!opponent)$('shot-outcome').textContent=made ? `BASKET · ${shot.trajectory.points} ${shot.trajectory.points===1 ? 'POINT' : 'POINTS'}` : 'LAST SHOT · MISS';
      shot=null;strokeLayout=null;
      if(game.solo && !game.drill && !made)startLocalRebound(performance.now());
      if(game.computer && game.winner!==null)message(game.winner===0 ? `You win ${game.scores[0]}–${game.scores[1]}!` : `Computer wins ${game.scores[1]}–${game.scores[0]}. Try a rematch!`);
      render();
    }
  } else if(game?.phase==='rebound') {
    const elapsed=playback?performance.now()-playback.start:0;
    position=reboundWorld(game.trajectory,elapsed);focus=position;
    if(playback && elapsed>reboundDuration(playback.trajectory)){playback=null;message('It got away! Replay the saved rebound.');render();}
  }
  updateRangeGuide();
  const state={position,player,focus,netState,releaseCue,time:performance.now(),ready:canShoot(),moving:Boolean(shot||playback)};
  if(lightView)drawLightCourt(state);
  else {
    try { drawCourt(state); }
    catch { useLightView();drawLightCourt(state); }
  }
  requestAnimationFrame(draw);
}
draw();
render();
if (params.get('game') && !invite) loadMatch();
setInterval(() => { if(!game.solo) refresh(); }, 2500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playback) { playback = null; render(); }
  if (!document.hidden && game) refresh();
});
