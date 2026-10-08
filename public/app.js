import { reboundPosition, REBOUND_DURATION, shotResult } from './physics.js';
const $ = id => document.getElementById(id);
const canvas = $('court'), ctx = canvas.getContext('2d');
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
  $('lobby').hidden = true; $('game').hidden = false;
  for (let i = 0; i < 2; i++) {
    $(`p${i}`).textContent = (game.players[i] || 'Waiting for player') + (game.seat === i ? ' · YOU' : '');
    $(`s${i}`).textContent = game.scores[i]; $(`r${i}`).textContent = `${game.rebounds[i]} ${game.rebounds[i] === 1 ? 'rebound' : 'rebounds'}`;
  }
  const yours = game.turn === game.seat;
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
    game.phase === 'rebound' ? (yours ? 'The saved bounce starts when you’re ready. Catch it to earn your next shot.' : 'The other player can catch this bounce whenever they return.') :
    yours ? 'Move the aim slider toward the hoop, then shoot. A basket is worth two points.' : 'You can leave and come back. This game stays right here.';
}
async function refresh() {
  if (!id || busy || shot || playback) return;
  try { game = await api('game'); render(); } catch (error) { message(error.message); }
}
async function action(body) {
  if (busy) return null;
  busy = true; $('shoot').disabled = true; $('start-rebound').disabled = true;
  try { game = await api('action', { ...body, version: game.version }); message(''); return game; }
  catch (error) { message(error.message); return null; }
  finally { busy = false; $('shoot').disabled = false; $('start-rebound').disabled = false; render(); }
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
$('shoot').onclick = async () => {
  const aim = Number($('aim').value) / 100;
  const pending = action({ action: 'shoot', aim });
  shot = { aim, start: performance.now(), made: shotResult(aim) };
  const result = await pending;
  if (!result) shot = null;
};
$('start-rebound').onclick = async () => {
  const result = await action({ action: 'start' });
  if (result) { playback = { start: performance.now(), trajectory: result.trajectory }; render(); canvas.focus(); }
};
async function catchBall(x, y) {
  if (!playback || busy) return;
  const result = await action({ action: 'catch', x, y });
  if (result) { playback = null; message('Rebound caught. Your shot!'); render(); }
}
canvas.addEventListener('pointerdown', event => {
  const rect = canvas.getBoundingClientRect();
  // Canvas is constrained with object-fit; account for the letterboxing on wide screens.
  const scale = Math.min(rect.width / 700, rect.height / 650);
  const left = rect.left + (rect.width - 700 * scale) / 2;
  const top = rect.top + (rect.height - 650 * scale) / 2;
  catchBall((event.clientX - left) / (700 * scale), (event.clientY - top) / (650 * scale));
});
canvas.addEventListener('keydown', event => {
  if (event.code === 'Space' && playback) {
    event.preventDefault(); const ball = reboundPosition(playback.trajectory, performance.now() - playback.start); catchBall(ball.x, ball.y);
  }
});
function ball(x, y) {
  ctx.save();ctx.translate(x * 700, y * 650);ctx.shadowColor='#0007';ctx.shadowBlur=15;ctx.shadowOffsetY=7;
  ctx.fillStyle='#ee914d';ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.fill();ctx.shadowColor='transparent';
  ctx.strokeStyle='#683a22';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,20,0,Math.PI*2);ctx.moveTo(-20,0);ctx.lineTo(20,0);ctx.moveTo(0,-20);ctx.lineTo(0,20);ctx.stroke();ctx.restore();
}
function draw() {
  ctx.clearRect(0,0,700,650);ctx.fillStyle='#334b36';ctx.fillRect(0,0,700,650);
  for(let x=0;x<700;x+=70){ctx.fillStyle=x%140===0?'#ffffff03':'#00000003';ctx.fillRect(x,0,70,650);}
  ctx.strokeStyle='#d0ddaa55';ctx.lineWidth=2;ctx.strokeRect(45,35,610,590);ctx.strokeRect(240,35,220,290);
  ctx.beginPath();ctx.arc(350,325,110,0,Math.PI);ctx.stroke();ctx.beginPath();ctx.arc(350,140,255,.07,Math.PI-.07);ctx.stroke();
  ctx.beginPath();ctx.arc(350,625,105,Math.PI,2*Math.PI);ctx.stroke();
  ctx.fillStyle='#e5e8cc';ctx.fillRect(294,90,112,9);ctx.strokeStyle='#ef9857';ctx.lineWidth=5;
  ctx.beginPath();ctx.ellipse(350,120,30,11,0,0,Math.PI*2);ctx.stroke();ctx.strokeStyle='#e5e8cc88';ctx.lineWidth=1;
  for(let i=0;i<7;i++){ctx.beginPath();ctx.moveTo(322+i*9,125);ctx.lineTo(335+i*5,158);ctx.stroke();}
  let pos={x:.5,y:.84};
  if(shot){const t=Math.min(1,(performance.now()-shot.start)/950);pos={x:.5+(shot.aim-.5)*t,y:.84-.65*t-.23*Math.sin(t*Math.PI)};if(t===1){message(shot.made?'Bucket! Two points.':'Off the rim. Rebound saved for the other player.');shot=null;render();}}
  else if(playback){const elapsed=performance.now()-playback.start;pos=reboundPosition(playback.trajectory,elapsed);if(elapsed>REBOUND_DURATION){playback=null;message('It got away! You can replay the saved rebound.');render();}}
  else if(game?.phase==='rebound')pos=reboundPosition(game.trajectory,0);
  if(game?.phase==='shoot' && game.turn===game.seat && !shot){ctx.setLineDash([5,8]);ctx.strokeStyle='#d3f77588';ctx.beginPath();ctx.moveTo(350,546);ctx.lineTo(Number($('aim').value)*7,120);ctx.stroke();ctx.setLineDash([]);}
  ball(pos.x,pos.y);requestAnimationFrame(draw);
}
draw();
if (id && !params.get('invite')) refresh();
setInterval(() => { if(game) refresh(); }, 2500);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playback) { playback = null; render(); }
  if (!document.hidden && game) refresh();
});
