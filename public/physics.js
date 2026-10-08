export const REBOUND_DURATION = 8000;
export const BALL_RADIUS = .12;
export const HOOP = { x: 0, y: 3.05, z: 0, radius: .23 };
const clamp = (v, low, high) => Math.max(low, Math.min(high, v));
// Fixed perspective camera shared by rendering and authoritative catch validation.
export function project(p) {
  const dy = p.y - 3.8, dz = p.z - 11;
  const depth = -.17 * dy - .98545 * dz;
  return { x: .5 + p.x / depth * 1.05, y: .5 - (.98545 * dy - .17 * dz) / depth * 1.05 * 700 / 650, scale: 735 / depth, depth };
}
export function sampleFrames(frames, elapsed) {
  const t = clamp(elapsed / 1000, 0, frames.at(-1)[0]);
  let low = 0, high = frames.length - 1;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (frames[mid][0] <= t) low = mid; else high = mid; }
  const a = frames[low], b = frames[high], f = clamp((t - a[0]) / (b[0] - a[0] || 1), 0, 1);
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f };
}
export function reboundPosition(trajectory, elapsed) {
  if (trajectory.version === 2) return project(sampleFrames(trajectory.frames, elapsed));
  // Keep rebounds already stored by the first release playable.
  const t = clamp(elapsed / REBOUND_DURATION, 0, 1);
  return { x: trajectory.aim + ((trajectory.direction > 0 ? .92 : .08) - trajectory.aim) * t,
    y: .19 + .63 * t - Math.abs(Math.sin(t * Math.PI * 3)) * .22 * (1 - t) };
}
export const reboundDuration = trajectory => trajectory.version === 2 ? trajectory.duration : REBOUND_DURATION;
export function validGesture(g) {
  return g && ['dx', 'dy', 'duration'].every(k => Number.isFinite(g[k])) && Math.abs(g.dx) <= .8 && g.dy >= .08 && g.dy <= .85 && g.duration >= .08 && g.duration <= 2;
}
export function simulateShot(gesture) {
  if (!validGesture(gesture)) throw new Error('Swipe upward from the ball to shoot');
  const speed = clamp(5.5 + gesture.dy * 8 + gesture.dy / gesture.duration * .65, 6, 14);
  let vx = clamp(gesture.dx / gesture.dy, -1.5, 1.5) * speed * Math.cos(58 * Math.PI / 180);
  let vy = speed * Math.sin(58 * Math.PI / 180), vz = -speed * Math.cos(58 * Math.PI / 180);
  let x = 0, y = 1.6, z = 6, made = false, contact = null, feedback = 'Air ball';
  const frames = [[0, x, y, z]], dt = 1 / 120;
  const impact = (time, kind) => { if (contact === null && !made) { contact = time; feedback = kind; } };
  for (let step = 1; step <= 1440; step++) {
    const time = step * dt, previousY = y;
    vy -= 9.81 * dt;
    vx *= 1 - .025 * dt; vz *= 1 - .025 * dt;
    x += vx * dt; y += vy * dt; z += vz * dt;
    // Plane backboard and a spherical ball, with energy lost on impact.
    if (Math.abs(x) < .91 && y > 2.55 && y < 3.85 && z < -.33 && vz < 0 && z > -.65) {
      z = -.33; vz = -vz * .68; vx *= .85; impact(time, 'Off the backboard');
    }
    // Closest point on the circular rim gives a torus collision normal.
    const radial = Math.hypot(x, z), rimX = radial ? x / radial * HOOP.radius : HOOP.radius;
    const rimZ = radial ? z / radial * HOOP.radius : 0;
    const nx = x - rimX, ny = y - HOOP.y, nz = z - rimZ;
    const distance = Math.hypot(nx, ny, nz), contactRadius = BALL_RADIUS + .018;
    if (!made && distance < contactRadius && distance > .00001) {
      const normal = [nx / distance, ny / distance, nz / distance];
      const velocity = vx * normal[0] + vy * normal[1] + vz * normal[2];
      if (velocity < 0) {
        vx -= 1.72 * velocity * normal[0]; vy -= 1.72 * velocity * normal[1]; vz -= 1.72 * velocity * normal[2];
        const push = contactRadius - distance; x += normal[0] * push; y += normal[1] * push; z += normal[2] * push;
        impact(time, 'Off the rim');
      }
    }
    if (!made && previousY > HOOP.y && y <= HOOP.y && vy < 0 && Math.hypot(x, z) < HOOP.radius - BALL_RADIUS) {
      made = true; feedback = 'Bucket!'; vx *= .5; vz *= .5;
    }
    if (y < BALL_RADIUS) {
      y = BALL_RADIUS;
      if (vy < 0) { impact(time, z > 2 ? 'Short of the hoop' : z < -.65 ? 'Long of the hoop' : 'Wide of the hoop'); vy = Math.abs(vy) > .5 ? -vy * .72 : 0; vx *= .82; vz *= .82; }
      vx *= .992; vz *= .992;
    }
    if (Math.abs(x) > 3.7) { x = Math.sign(x) * 3.7; vx *= -.65; }
    if (z < -1.7) { z = -1.7; vz = Math.abs(vz) * .65; }
    if (z > 7.4) { z = 7.4; vz = -Math.abs(vz) * .65; }
    if (step % 3 === 0) frames.push([time, x, y, z]);
  }
  const split = contact === null ? 2 : contact;
  const start = sampleFrames(frames, split * 1000);
  const rebound = [[0, start.x, start.y, start.z], ...frames.filter(f => f[0] > split).map(f => [f[0] - split, ...f.slice(1)])];
  const flight = [...frames.filter(f => f[0] < split), [split, start.x, start.y, start.z]];
  return { version: 2, frames: rebound, flight: made ? frames.filter(f => f[0] <= 3) : flight,
    duration: rebound.at(-1)[0] * 1000, flightDuration: made ? 3000 : split * 1000, made, feedback, gesture };
}
