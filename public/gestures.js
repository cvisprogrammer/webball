// WheelEvent is how browsers expose direct trackpad scrolling. Accept either
// scroll sign because OS natural-scrolling settings reverse the vertical sign.
export function wheelGesture(samples,height) {
  if(!samples.length || height<=0)return null;
  let dx=0,dy=0;
  for(const sample of samples){const unit=sample.mode===1?16:sample.mode===2?height:1;dx+=sample.dx*unit;dy+=Math.abs(sample.dy)*unit;}
  return {dx:Math.max(-.8,Math.min(.8,dx/height)),dy:Math.min(.85,dy/height),duration:Math.max(.08,Math.min(2,(samples.at(-1).time-samples[0].time)/1000))};
}
