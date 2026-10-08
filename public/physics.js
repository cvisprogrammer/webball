export const REBOUND_DURATION = 8000;
export function reboundPosition(trajectory, elapsed) {
  const t = Math.max(0, Math.min(1, elapsed / REBOUND_DURATION));
  return {
    x: trajectory.aim + ((trajectory.direction > 0 ? .92 : .08) - trajectory.aim) * t,
    y: .19 + .63 * t - Math.abs(Math.sin(t * Math.PI * 3)) * .22 * (1 - t),
  };
}
export function shotResult(aim) {
  return Math.abs(aim - .5) <= .035;
}
