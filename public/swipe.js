// Measure recent velocity and net upward travel in court-height units. Both
// the guide and released shot use these inputs; the meter never sets power.
const VELOCITY_WINDOW = 80;
// Lifting a finger/button often adds a short stationary event after the flick.
// Keep its measured velocity through that gap, in both the guide and release.
const RELEASE_GRACE = 100;
export function createSwipe(point, time, pointer) {
  return { from: point, to: point, start: time, pointer, samples: [{ point, time }] };
}
export function moveSwipe(swipe, point, time) {
  if (time < swipe.samples.at(-1).time) return;
  if (point.x === swipe.to.x && point.y === swipe.to.y) return;
  swipe.to = point;
  swipe.samples.push({ point, time });
  while (swipe.samples.length > 2 && swipe.samples[1].time <= time - VELOCITY_WINDOW) swipe.samples.shift();
}
export function swipeGesture(swipe, time) {
  const samples = swipe.samples;
  const last = samples.at(-1);
  time = Math.max(time, last.time);
  const velocityTime = Math.max(last.time, time - RELEASE_GRACE);
  const cutoff = Math.max(swipe.start, velocityTime - VELOCITY_WINDOW);
  let first = samples[0];
  for (let i = 1; i < samples.length; i++) {
    const next = samples[i];
    if (next.time > cutoff) {
      const fraction = (cutoff - first.time) / (next.time - first.time || 1);
      first = { time: cutoff, point: { y: first.point.y + (next.point.y - first.point.y) * fraction } };
      break;
    }
    first = next;
  }
  const velocity = last.time <= cutoff ? 0 : Math.max(0, (first.point.y - swipe.to.y) / Math.max(.008, (velocityTime - first.time) / 1000));
  return { dx: swipe.to.x - swipe.from.x, dy: swipe.from.y - swipe.to.y,
    duration: Math.max(.08, (time - swipe.start) / 1000), velocity };
}
