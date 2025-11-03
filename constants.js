// Physical constants (SI)
export const G = 6.67430e-11;
export const c = 299792458;
export const hbar = 1.054571817e-34;
export const kB = 1.380649e-23;
export const M_sun = 1.98847e30;
export const h = 6.62607015e-34; // Planck (exact)

export function schwarzschildRadius(Mkg){ return 2*G*Mkg/(c*c); }
export function hawkingTemperature(Mkg){ return (hbar*Math.pow(c,3))/(8*Math.PI*G*Mkg*kB); }
export function relativePowerVsSolar(Mkg){ const Ms = M_sun; return Math.pow(Ms/Mkg, 2); }

// Approximate gamma(4) sampler (shape ~ x^3 e^{-x}) as a proxy for blackbody x^3/(exp(x)-1) with x = E/(kT).
export function sampleXGamma4(rand01){
  // Sum of 4 exponentials ~ Erlang(k=4, theta=1)
  let x = 0;
  for(let i=0;i<4;i++){ const u = Math.max(1e-12, rand01()); x += -Math.log(u); }
  return x; // mean 4
}

// Map photon energy (J) -> approx visible RGB using wavelength conversion (nm), clamped to 380–700nm visual band.
export function energyToRgb(E){
  const lambda = (h*c)/E; // meters
  const nm = lambda*1e9;
  // Clamp band
  const L = Math.max(380, Math.min(700, nm));
  // Approximate CIE-ish to RGB (very rough)
  let r=0,g=0,b=0;
  if (L>=380 && L<440){ r = -(L-440)/(440-380); g=0; b=1; }
  else if (L<490){ r=0; g=(L-440)/(490-440); b=1; }
  else if (L<510){ r=0; g=1; b=-(L-510)/(510-490); }
  else if (L<580){ r=(L-510)/(580-510); g=1; b=0; }
  else if (L<645){ r=1; g=-(L-645)/(645-580); b=0; }
  else { r=1; g=0; b=0; }
  // Apply attenuated intensity near edges
  let s=1;
  if (L<420) s=0.3+0.7*(L-380)/(40);
  if (L>645) s=0.3+0.7*(700-L)/(55);
  return [r*s, g*s, b*s];
}
