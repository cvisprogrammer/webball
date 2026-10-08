import { reboundPosition, reboundDuration, simulateShot, validGesture, sampleFrames, project, reboundWorld, START_POSITION } from './physics.js';
import { createCourt, pointerPosition } from './court3d.js';
import { createPractice, practiceAction } from './practice.js';
const $ = id => document.getElementById(id);
const canvas = $('court');
let drawCourt, graphicsReady = true;
try { drawCourt = createCourt(canvas); }
catch { graphicsReady = false; $('message').textContent = '3D rendering needs WebGL. Enable browser graphics acceleration and reload.'; drawCourt = () => {}; }
let swipe = null;
const playerPosition = () => game?.positions?.[game.seat] || START_POSITION;
const params = new URLSearchParams(location.hash.slice(1));
let id = params.get('game') || localStorage.getItem('webball-game');
let practice = createPractice(), game = practice, busy = false, playback = null, shot = null;
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
  if(!graphicsReady)message('3D rendering needs WebGL. Enable browser graphics acceleration and reload.');
  $('game').hidden = false;
  if(!game.solo)$('lobby').hidden = true;
  $('mode-label').textContent = game.solo ? 'SOLO SHOOTAROUND' : 'TWO PLAYER GAME';
  $('multiplayer').hidden = !game.solo; $('practice').hidden = !!game.solo;
  $('resume').hidden = !game.solo || !id;
  $('reset-position').hidden = !game.solo;
  for (let i = 0; i < 2; i++) {
    $(`p${i}`).textContent = (game.players[i] || 'Waiting for player') + (game.seat === i ? ' · YOU' : '');
    $(`s${i}`).textContent = game.scores[i]; $(`r${i}`).textContent = `${game.rebounds[i]} ${game.rebounds[i] === 1 ? 'rebound' : 'rebounds'}`;
  }
  if(game.solo) { $('p0').textContent='YOU'; $('p1').textContent='SHOTS'; $('s1').textContent=game.attempts; $('r1').textContent=`${game.attempts ? Math.round(game.baskets/game.attempts*100) : 0}% made`; }
  document.querySelector('.versus').textContent=game.solo?'·':'VS';
  const yours = game.turn === game.seat;
  $('shot-location').textContent = `${Math.hypot(playerPosition().x,playerPosition().z).toFixed(1)} m from the hoop · your rebound sets your next shot`;
  $('turn-label').textContent = game.solo ? 'SOLO · FIND YOUR TOUCH' : game.phase === 'waiting' ? 'INVITE YOUR TEAMMATE' : yours ? 'YOUR TURN' : 'SAVED · WAITING FOR PLAYER';
  $('invite-row').hidden = !game.invite;
  if (game.invite) $('invite').value = `${location.origin}/#game=${game.id}&invite=${game.invite}`;
  $('shot-controls').hidden = !(yours && game.phase === 'shoot');
  $('start-rebound').hidden = !(yours && game.phase === 'rebound' && !playback);
  $('start-rebound').textContent = game.startedAt === null ? 'Play the rebound →' : 'Replay the rebound →';
  $('catch-help').hidden = !playback;
  $('status').textContent = game.solo ? (game.phase==='rebound' ? playback ? 'Chase your rebound.' : 'Your rebound is waiting.' : 'The court is yours.') : game.phase === 'waiting' ? 'Good games need two.' :
    game.phase === 'rebound' ? (yours ? playback ? 'Get that rebound!' : 'A rebound is waiting for you.' : 'Your miss is saved.') :
    yours ? 'Make it count.' : `${game.players[game.turn]} is up next.`;
  $('instruction').textContent = game.solo && game.phase==='rebound' ? (playback ? 'Tap your moving ball to catch it. Your next shot starts right where you catch it.' : 'Replay the rebound, or return to the starting spot.') : game.phase === 'waiting' ? 'Share the link below. You’ll take the first shot when they join.' :
    game.phase === 'rebound' ? (yours ? 'The saved bounce starts when you’re ready. Catch it to shoot from that spot.' : 'The other player can catch this bounce whenever they return.') :
    yours ? `Press the ball, drag upward, then release. Faster flicks go farther.${game.solo?' Warm up solo or invite a friend.':''}` : 'You can leave and come back. This game stays right here.';
}
async function refresh() {
  if (!id || game.solo || busy || shot || playback) return;
  const matchId=id;
  try { const match=await api('game');if(game.solo || id!==matchId)return;game=match;render(); } catch (error) { if(!game.solo)message(error.message); }
}
async function action(body) {
  if (busy) return null;
  busy = true; $('start-rebound').disabled = true;
  try { game = game.solo ? practiceAction(game,body) : await api('action', { ...body, version: game.version }); message(''); return game; }
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
  swipe=null;shot=null;playback=null;$('power').value=0;
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
  if(busy)return;cancelInteractions();await action({action:'reset'});message('Back at the starting spot.');
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite').value); message('Invite copied. Send it to your teammate.'); }
  catch { $('invite').select(); message('Select and copy the invite link above.'); }
};
async function takeShot(gesture) {
  if (busy || shot || !game || game.phase !== 'shoot' || game.turn !== game.seat) return;
  if (!validGesture(gesture)) { message('Press the ball, drag upward, then release. Try a smooth, medium-length flick.'); return; }
  const trajectory = simulateShot(gesture, playerPosition());
  shot = { trajectory, start: performance.now(), player: {...playerPosition()} };

  const result = await action({ action: 'shoot', gesture });
  if (!result) shot = null;
  $('shot-feedback').textContent = 'Shot released';
}
$('start-rebound').onclick = async () => {
  const result = await action({ action: 'start' });
  if (result) { playback = { start: performance.now(), trajectory: result.trajectory }; render(); canvas.focus(); }
};
async function catchBall(x, y) {
  if (!playback || busy) return;
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
  swipe = { from: point, to: point, start: event.timeStamp, pointer: event.pointerId };
  message(''); canvas.focus();
});
canvas.addEventListener('pointermove', event => {
  if (!swipe || swipe.pointer !== event.pointerId) return;
  swipe.to = pointerPosition(canvas, event);
  $('power').value = Math.min(1, Math.max(0, (swipe.from.y - swipe.to.y) / .6));
});
canvas.addEventListener('pointerup', event => {
  if (!swipe || swipe.pointer !== event.pointerId) return;
  const end = pointerPosition(canvas, event), gesture = { dx: end.x - swipe.from.x,
    dy: swipe.from.y - end.y, duration: Math.max(.08, (event.timeStamp - swipe.start) / 1000) };
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
function draw() {
  let player=playerPosition(),position={x:player.x,y:1.6,z:player.z},focus=null;
  if(shot) {
    player=shot.player;
    const elapsed=performance.now()-shot.start;
    position=sampleFrames(shot.trajectory.flight,elapsed);focus=position;
    if(elapsed>=shot.trajectory.flightDuration) {
      const made=shot.trajectory.made;
      message(made?'Bucket! Two points.':game.solo ? `${shot.trajectory.feedback}. Tap your rebound or return to the starting spot.` : `${shot.trajectory.feedback}. Rebound saved for the other player.`);
      $('shot-feedback').textContent=shot.trajectory.feedback;
      shot=null;
      if(game.solo && !made){practiceAction(game,{action:'start'});playback={start:performance.now(),trajectory:game.trajectory};}
      render();
    }
  } else if(game?.phase==='rebound') {
    const elapsed=playback?performance.now()-playback.start:0;
    position=reboundWorld(game.trajectory,elapsed);focus=position;
    if(playback && elapsed>reboundDuration(playback.trajectory)){playback=null;message('It got away! Replay the saved rebound.');render();}
  }
  drawCourt({position,player,focus,time:performance.now(),ready:canShoot(),moving:Boolean(shot||playback)});
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
