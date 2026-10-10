import { BALL_RADIUS, HOOP, NET_LENGTH, START_POSITION, FOUL_LINE, cameraPose, project, netResponse, netPoint } from './physics.js';
const W = 700, H = 650;

// A separate canvas remains usable when the original WebGL context is lost.
// It uses the same camera projection, ball path and pointer surface as 3D.
export function createLightCourt(canvas) {
  const layer = document.createElement('canvas');
  layer.className = 'light-court'; layer.setAttribute('aria-hidden', 'true');
  canvas.after(layer);
  const ctx = layer.getContext('2d');
  let active = false, previous = null;
  function projected(point, player, focus) { const p = project(point, player, focus); return { x: p.x * W, y: p.y * H, depth: p.depth, scale: p.scale }; }
  function clipped(points, player, focus) {
    const output = [], near = .06;
    let a = points.at(-1), da = project(a, player, focus).depth;
    for (const b of points) {
      const db = project(b, player, focus).depth;
      if ((da >= near) !== (db >= near)) {
        const f = (near - da) / (db - da);
        output.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
      }
      if (db >= near) output.push(b);
      a = b; da = db;
    }
    return output.map(p => projected(p, player, focus));
  }
  const point = (x, y, z) => ({ x, y, z });
  const draw = ({ position, player = START_POSITION, focus = null, ready = false, netState = netResponse(null,0), releaseCue = {strength:0,state:'building'} } = {}) => {
    if (!active) { active = true; canvas.style.opacity = '0'; layer.hidden = false; }
    const bounds = canvas.getBoundingClientRect(), width = Math.round(bounds.width), height = Math.round(bounds.height);
    if (!width || !height) return;
    const frame = JSON.stringify([position, player, focus, ready, netState, releaseCue, width, height]);
    if (frame === previous) return;
    previous = frame;
    if (layer.width !== width || layer.height !== height) { layer.width = width; layer.height = height; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const background = ctx.createLinearGradient(0, 0, 0, height); background.addColorStop(0, '#203c35'); background.addColorStop(1, '#526852');
    ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
    const scale = Math.min(width / W, height / H);
    ctx.translate((width - W * scale) / 2, (height - H * scale) / 2); ctx.scale(scale, scale);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    function polygon(points, color) {
      const p = clipped(points, player, focus); if (p.length < 3) return;
      ctx.beginPath(); p.forEach((v, i) => ctx[i ? 'lineTo' : 'moveTo'](v.x, v.y)); ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    }
    function line(a, b, color = '#eee2bd', thickness = 2) {
      const p = clipped([a, b], player, focus); if (p.length < 2) return;
      ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); ctx.lineTo(p.at(-1).x, p.at(-1).y); ctx.strokeStyle = color; ctx.lineWidth = thickness; ctx.stroke();
    }
    polygon([point(-6, 0, -2.2), point(6, 0, -2.2), point(6, 0, 11), point(-6, 0, 11)], '#bd925c');
    polygon([point(-6, 0, -2.2), point(6, 0, -2.2), point(6, 6, -2.2), point(-6, 6, -2.2)], '#394f48');
    for (const x of [-6, 6]) polygon([point(x, 0, -2.2), point(x, 0, 11), point(x, 6, 11), point(x, 6, -2.2)], '#2c4039');
    for (let x = -5; x <= 5; x++) line(point(x, .01, -2), point(x, .01, 11), '#9e764955', 1);
    polygon([point(-1.22, .02, -1.2), point(1.22, .02, -1.2), point(1.22, .02, 3), point(-1.22, .02, 3)], '#315e4c');
    for (const x of [-3.8, 3.8]) line(point(x, .03, -1.2), point(x, .03, 7.5));
    for (const z of [-1.2, 7.5]) line(point(-3.8, .03, z), point(3.8, .03, z));
    for (const x of [-FOUL_LINE.halfWidth, FOUL_LINE.halfWidth]) line(point(x, .03, -1.2), point(x, .03, FOUL_LINE.z));
    line(point(-FOUL_LINE.halfWidth, .03, FOUL_LINE.z), point(FOUL_LINE.halfWidth, .03, FOUL_LINE.z));
    line(point(0, 0, -.9), point(0, 3.7, -.9), '#9aa79a', 5);
    const board = [point(-.92, 2.55, -.45), point(.92, 2.55, -.45), point(.92, 3.85, -.45), point(-.92, 3.85, -.45)];
    polygon(board, '#d6e5d02b'); board.forEach((p, i) => line(p, board[(i + 1) % 4]));
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, b = (i + 1) / 16 * Math.PI * 2;
      line(point(Math.cos(a) * HOOP.radius, HOOP.y, Math.sin(a) * HOOP.radius), point(Math.cos(b) * HOOP.radius, HOOP.y, Math.sin(b) * HOOP.radius), '#f08942', 3);
      for(const direction of [-1,1])for(let j=0;j<5;j++) {
        const cord=t=>netPoint(point(Math.cos(a+direction*.45*t)*(HOOP.radius-.1*t),HOOP.y-.02-NET_LENGTH*t,Math.sin(a+direction*.45*t)*(HOOP.radius-.1*t)),netState);
        line(cord(j/5),cord((j+1)/5),'#e8e9ce',1);
      }
    }
    const ball = projected(position, player, focus);
    if (ball.depth > .06 && Number.isFinite(ball.x + ball.y + ball.scale)) {
      const radius = Math.min(H * .4, BALL_RADIUS * ball.scale);
      const strength=ready ? releaseCue.strength : 0;
      const tint=releaseCue.state==='ready' ? '#87f7a3' : releaseCue.state==='strong' ? '#ff7655' : '#ffc15c';
      if(strength>.002) {
        const rgb=releaseCue.state==='ready' ? '135,247,163' : releaseCue.state==='strong' ? '255,118,85' : '255,193,92';
        const glow=ctx.createRadialGradient(ball.x,ball.y,radius*.75,ball.x,ball.y,radius*1.9);
        glow.addColorStop(0,`rgba(${rgb},${strength*.55})`);glow.addColorStop(.45,`rgba(${rgb},${strength*.25})`);glow.addColorStop(1,`rgba(${rgb},0)`);
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(ball.x,ball.y,radius*1.9,0,Math.PI*2);ctx.fill();
      }
      ctx.save(); ctx.beginPath(); ctx.arc(ball.x, ball.y, radius, 0, Math.PI * 2); ctx.clip();
      const leather = ctx.createRadialGradient(ball.x - radius * .4, ball.y - radius * .5, radius * .1, ball.x, ball.y, radius);
      leather.addColorStop(0, '#ffbb55'); leather.addColorStop(1, '#a54b16'); ctx.fillStyle = leather; ctx.fillRect(ball.x - radius, ball.y - radius, radius * 2, radius * 2);
      ctx.globalAlpha=strength*.2;ctx.fillStyle=tint;ctx.fillRect(ball.x-radius,ball.y-radius,radius*2,radius*2);ctx.globalAlpha=1;
      ctx.strokeStyle = '#48270f'; ctx.lineWidth = Math.max(1, radius * .035);
      ctx.beginPath(); ctx.moveTo(ball.x - radius, ball.y); ctx.lineTo(ball.x + radius, ball.y); ctx.moveTo(ball.x, ball.y - radius); ctx.lineTo(ball.x, ball.y + radius);
      ctx.stroke(); ctx.beginPath();ctx.ellipse(ball.x, ball.y, radius * .45, radius, 0, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      if (ready) { ctx.beginPath(); ctx.arc(ball.x, ball.y, radius * 1.2, 0, Math.PI * 2); ctx.strokeStyle = strength>.02 ? tint : '#d3f775'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    ctx.restore();
    const hint = document.getElementById('court-hint'); if (hint) hint.hidden = !ready;
    canvas.dataset.renderer = 'light';
    canvas.dataset.eye = JSON.stringify(cameraPose(player, focus).eye);
  };
  draw.hide = () => { active = false; previous = null; canvas.style.opacity = ''; layer.hidden = true; };
  layer.hidden = true;
  return draw;
}
