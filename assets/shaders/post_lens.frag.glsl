// Screen-space gravitational lensing (approx)
// Sample source texture with an offset radially away from BH center based on deflection ~ k * rs / r
precision highp float;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform vec2 uBHCenter;   // in screen UV (0..1)
uniform float uBHScreenR; // approximate horizon radius in screen units
uniform float uStrength;  // lens strength knob
uniform float uChrom;     // chromatic aberration amount
uniform bool uEnabled;

varying vec2 vUv;

void main(){
  vec2 uv = vUv;
  if (!uEnabled){
    gl_FragColor = texture2D(uTex, uv);
    return;
  }
  vec2 p = uv - uBHCenter;
  float r = length(p) + 1e-5;
  // Deflection magnitude: proportional to (uBHScreenR / r) with softening
  float def = uStrength * (uBHScreenR) / (r + 1e-4);
  vec2 dir = normalize(p);
  // Chromatic aberration by sampling different radii per channel
  vec2 offR = dir * def * (1.0 + 0.5*uChrom);
  vec2 offG = dir * def * (1.0);
  vec2 offB = dir * def * (1.0 - 0.5*uChrom);
  vec3 col;
  col.r = texture2D(uTex, uv - offR).r;
  col.g = texture2D(uTex, uv - offG).g;
  col.b = texture2D(uTex, uv - offB).b;

  // Mild brightness near Einstein ring
  float ring = smoothstep(uBHScreenR*0.9, uBHScreenR*1.1, r) * 0.2;
  col += ring;

  gl_FragColor = vec4(col, 1.0);
}
