import { reboundPosition, reboundDuration, simulateShot, validGesture, sampleFrames, project, reboundWorld, START_POSITION } from './physics.js';
import { createCourt, pointerPosition } from './court3d.js';
import { wheelGesture } from './gestures.js';
const $ = id => document.getElementById(id);
const canvas = $('court');
let drawCourt, graphicsReady = true;
try { drawCourt = createCourt(canvas); }
catch { graphicsReady = false; $('message').textContent = '3D rendering needs WebGL. Enable browser graphics acceleration and reload.'; drawCourt = () => {}; }
let swipe = null, keyboardCharge = null, keyboardAim = 0, wheelSamples = [], wheelTimer = null, wheelDeadline = null, wheelCooldown = 0;
const playerPosition = () => game?.positions?.[game.seat] || START_POSITION;
const params = new URLSearchParams(location.hash.slice(1));
let id = params.get('game') || localStorage.getItem('webball-game');
let game = null, busy = false, playback = null, shot = null;
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
  $('lobby').hidden = true; $('game').hidden = false;
  for (let i = 0; i < 2; i++) {
    $(`p${i}`).textContent = (game.players[i] || 'Waiting for player') + (game.seat === i ? ' · YOU' : '');
    $(`s${i}`).textContent = game.scores[i]; $(`r${i}`).textContent = `${game.rebounds[i]} ${game.rebounds[i] === 1 ? 'rebound' : 'rebounds'}`;
  }
  const yours = game.turn === game.seat;
  $('shot-location').textContent = `${Math.hypot(playerPosition().x,playerPosition().z).toFixed(1)} m from the hoop · your rebound sets your next shot`;
  $('turn-label').textContent = game.phase === 'waiting' ? 'INVITE YOUR TEAMMATE' : yours ? 'YOUR TURN' : 'SAVED · WAITING FOR PLAYER';
  $('invite-row').hidden = !game.invite;
  if (game.invite) $('invite').value = `${location.origin}/#game=${game.id}&invite=${game.invite}`;
  $('shot-controls').hidden = !(yours && game.phase === 'shoot');
  $('start-rebound').hidden = !(yours && game.phase === 'rebound' && !playback);
  $('start-rebound').textContent = game.startedAt === null ? 'Play the rebound →' : 'Replay the rebound →';
  $('catch-help').hidden = !playback;
  $('status').textContent = game.phase === 'waiting' ? 'Good games need two.' :
    game.phase === 'rebound' ? (yours ? playback ? 'Get that rebound!' : 'A rebound is waiting for you.' : 'Your miss is saved.') :
    yours ? 'Make it count.' : `${game.players[game.turn]} is up next.`;
  $('instruction').textContent = game.phase === 'waiting' ? 'Share the link below. You’ll take the first shot when they join.' :
    game.phase === 'rebound' ? (yours ? 'The saved bounce starts when you’re ready. Catch it to shoot from that spot.' : 'The other player can catch this bounce whenever they return.') :
    yours ? 'Shoot from where you caught it. Swipe upward on the ball, or swipe on your trackpad over the court. Faster swipes travel farther.' : 'You can leave and come back. This game stays right here.';
}
async function refresh() {
  if (!id || busy || shot || playback) return;
  try { game = await api('game'); render(); } catch (error) { message(error.message); }
}
async function action(body) {
  if (busy) return null;
  busy = true; $('start-rebound').disabled = true;
  try { game = await api('action', { ...body, version: game.version }); message(''); return game; }
  catch (error) { message(error.message); return null; }
  finally { busy = false; $('start-rebound').disabled = false; render(); }
}
if (params.get('invite')) {
  $('lobby-title').textContent = 'Your court is waiting.';
  $('join-button').textContent = 'Join the game ↗';
} else $('resume').hidden = !id;
$('join-form').addEventListener('submit', async event => {
  event.preventDefault(); $('join-button').disabled = true;
  try {
    game = await api(params.get('invite') ? 'join' : 'create', { name: $('name').value, id: params.get('game'), invite: params.get('invite') });
    id = game.id; localStorage.setItem('webball-game', id);
    history.replaceState(null, '', `/#game=${id}`); message(''); render();
  } catch (error) { message(error.message); }
  finally { $('join-button').disabled = false; }
});
$('resume').onclick = refresh;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite').value); message('Invite copied. Send it to your teammate.'); }
  catch { $('invite').select(); message('Select and copy the invite link above.'); }
};
async function takeShot(gesture) {
  if (busy || shot || !game || game.phase !== 'shoot' || game.turn !== game.seat) return;
  if (!validGesture(gesture)) { message('Start on the ball and swipe upward. Try a smooth, medium-length flick.'); return; }
  const trajectory = simulateShot(gesture, playerPosition());
  shot = { trajectory, start: performance.now(), player: {...playerPosition()} };
keyboardAim = 0;
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
  if (!canShoot() || Math.hypot(point.x - ball.x, point.y - ball.y) > .1) return;
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
  if (['Space','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
  if (event.code === 'Space' && playback) {
    const ball = reboundPosition(playback.trajectory, performance.now() - playback.start, playerPosition()); catchBall(ball.x, ball.y);
  } else if (canShoot()) {
    if(event.code === 'ArrowLeft') keyboardAim = Math.max(-.2, keyboardAim - .015);
    if(event.code === 'ArrowRight') keyboardAim = Math.min(.2, keyboardAim + .015);
    if(event.code === 'Space' && !event.repeat) keyboardCharge = performance.now();
    $('shot-feedback').textContent = keyboardAim === 0 ? 'Aim: center' : `Aim: ${keyboardAim < 0 ? 'left' : 'right'}`;
  }
});
canvas.addEventListener('keyup', event => {
  if (event.code === 'Space' && keyboardCharge !== null) {
    const duration = Math.min(1.5, (performance.now() - keyboardCharge) / 1000);
    keyboardCharge = null; takeShot({ dx: keyboardAim, dy: Math.max(.08, Math.min(.8, duration)), duration: .32 });
  }
});
canvas.addEventListener('blur', () => { keyboardCharge = null; swipe = null; });
function finishWheel() {
  clearTimeout(wheelTimer); clearTimeout(wheelDeadline);
  if(!wheelSamples.length)return;
  const r=canvas.getBoundingClientRect(),height=Math.min(r.height,r.width*650/700);
  const gesture=wheelGesture(wheelSamples,height);
  wheelSamples=[];wheelCooldown=performance.now()+900;
  if(gesture?.dy>=.08)takeShot(gesture);
}
canvas.addEventListener('wheel',event=>{
  if(event.ctrlKey || event.metaKey)return; // Preserve pinch-to-zoom.
  if(performance.now()<wheelCooldown){event.preventDefault();return;}
  if(!canShoot() || swipe || Math.abs(event.deltaY)<.1)return;
  event.preventDefault();
  if(!wheelSamples.length)wheelDeadline=setTimeout(finishWheel,320);
  wheelSamples.push({dx:event.deltaX,dy:event.deltaY,mode:event.deltaMode,time:event.timeStamp});
  const r=canvas.getBoundingClientRect();$('power').value=Math.min(1,wheelGesture(wheelSamples,Math.min(r.height,r.width*650/700)).dy/.6);
  clearTimeout(wheelTimer);wheelTimer=setTimeout(finishWheel,110);
},{passive:false});
function draw() {
  let player=playerPosition(),position={x:player.x,y:1.6,z:player.z},focus=null;
  if(shot) {
    player=shot.player;
    const elapsed=performance.now()-shot.start;
    position=sampleFrames(shot.trajectory.flight,elapsed);focus=position;
    if(elapsed>=shot.trajectory.flightDuration) {
      message(shot.trajectory.made?'Bucket! Two points.':`${shot.trajectory.feedback}. Rebound saved for the other player.`);
      $('shot-feedback').textContent=shot.trajectory.feedback;
      shot=null;render();
    }
  } else if(game?.phase==='rebound') {
    const elapsed=playback?performance.now()-playback.start:0;
    position=reboundWorld(game.trajectory,elapsed);focus=position;
    if(playback && elapsed>reboundDuration(playback.trajectory)){playback=null;message('It got away! Replay the saved rebound.');render();}
  }
  if(keyboardCharge!==null)$('power').value=Math.min(1,(performance.now()-keyboardCharge)/600);
  drawCourt({position,player,focus,time:performance.now(),ready:canShoot(),moving:Boolean(shot||playback)});
  requestAnimationFrame(draw);
}
draw();
if (id && !params.get('invite')) refresh();
setInterval(() => { if(game) refresh(); }, 2500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playback) { playback = null; render(); }
  if (!document.hidden && game) refresh();
});
