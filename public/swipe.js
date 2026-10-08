// Measure recent pointer motion in court heights per second. Both the guide
// and the released shot use this sample; the meter never sets shot power.
const VELOCITY_WINDOW = 80;
export function createSwipe(point, time, pointer) {
  return { from: point, to: point, start: time, pointer, samples: [{ point, time }] };
}
export function moveSwipe(swipe, point, time) {
  if (time < swipe.samples.at(-1).time) return;
  swipe.to = point;
  swipe.samples.push({ point, time });
  while (swipe.samples.length > 2 && swipe.samples[1].time <= time - VELOCITY_WINDOW) swipe.samples.shift();
}
export function swipeGesture(swipe, time) {
  const samples = swipe.samples;
  const last = samples.at(-1);
  time = Math.max(time, last.time);
  const cutoff = Math.max(swipe.start, time - VELOCITY_WINDOW);
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
  const velocity = last.time <= cutoff ? 0 : Math.max(0, (first.point.y - swipe.to.y) / Math.max(.008, (time - first.time) / 1000));
  return { dx: swipe.to.x - swipe.from.x, dy: swipe.from.y - swipe.to.y,
    duration: Math.max(.08, (time - swipe.start) / 1000), velocity };
}
