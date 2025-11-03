import {G,c,hbar,kB,h,M_sun,schwarzschildRadius,hawkingTemperature,relativePowerVsSolar,sampleXGamma4,energyToRgb} from './constants.js';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- DOM ----------
const canvas = document.getElementById('c');
const massSlider = document.getElementById('massSlider');
const massNumber = document.getElementById('massNumber');
const rsMetersEl = document.getElementById('rsMeters');
const tKelvinEl = document.getElementById('tKelvin');
const pRelEl = document.getElementById('pRel');
const pairRate = document.getElementById('pairRate');
const pairRateLabel = document.getElementById('pairRateLabel');
const maxParticles = document.getElementById('maxParticles');
const maxParticlesLabel = document.getElementById('maxParticlesLabel');
const fPhoton = document.getElementById('fPhoton');
const fNeutrino = document.getElementById('fNeutrino');
const fGraviton = document.getElementById('fGraviton');

const lensEnable = document.getElementById('lensEnable');
const lensStrength = document.getElementById('lensStrength');
const lensStrengthLabel = document.getElementById('lensStrengthLabel');
const lensChrom = document.getElementById('lensChrom');

const resetBtn = document.getElementById('resetBtn');
const pauseBtn = document.getElementById('pauseBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const toggleUI = document.getElementById('toggleUI');
const ui = document.getElementById('ui');

let paused = false;
let uiCollapsed = false;

// UI折り畳み機能
toggleUI.addEventListener('click', ()=>{
  uiCollapsed = !uiCollapsed;
  if(uiCollapsed){
    ui.classList.add('collapsed');
    toggleUI.textContent = '⚙';
  } else {
    ui.classList.remove('collapsed');
    toggleUI.textContent = '✕';
  }
});

// ---------- Renderer / Scene ----------
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 1e9);
camera.position.set(0, 15, 42);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 10;
controls.maxDistance = 200;

// ---------- Lighting ----------
scene.add(new THREE.DirectionalLight(0xffffff, 1.6)).position.set(10,20,10);
scene.add(new THREE.AmbientLight(0xffffff, 0.35));

// ---------- BH + Disk ----------
const bhGroup = new THREE.Group();
scene.add(bhGroup);

const bhGeom = new THREE.SphereGeometry(1, 128, 128);
const bhMat = new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 1, roughness: 0.4, emissive: 0x000000 });
const bhMesh = new THREE.Mesh(bhGeom, bhMat);
bhGroup.add(bhMesh);

const diskGeom = new THREE.RingGeometry(1.2, 8.0, 256, 1);
const diskMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uTime: { value: 0 }, uInner: { value: 1.2 }, uOuter: { value: 8.0 } },
  vertexShader: `varying vec2 vUv2; void main(){ vUv2=uv*2.0-1.0; vec3 p=position; p.z+=sin((position.x*2.0+position.y*3.0))*0.05; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
  fragmentShader: `precision highp float; varying vec2 vUv2; uniform float uTime; uniform float uInner; uniform float uOuter;
  void main(){ float r=length(vUv2); float edge=smoothstep(uInner,uInner+0.2,r)*(1.0-smoothstep(uOuter-0.3,uOuter,r));
    float wave=0.5+0.5*sin(12.0*r-uTime*1.8); float glow=edge*wave;
    vec3 col=mix(vec3(0.08,0.16,0.35), vec3(0.95,0.65,0.2), glow);
    float a=smoothstep(0.0,1.0,glow)*0.85; gl_FragColor=vec4(col,a);} `
});
const disk = new THREE.Mesh(diskGeom, diskMat);
disk.rotation.x = -Math.PI/2; bhGroup.add(disk);

// Star background
const starGeo = new THREE.SphereGeometry(500, 32, 32);
const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent:true, opacity:0.06 });
scene.add(new THREE.Mesh(starGeo, starMat));

// ---------- Particles with species & spectrum ----------
let MAX_PARTICLES = parseInt(maxParticles.value);
const particleGeo = new THREE.BufferGeometry();

// バッファ配列（allocBuffersで初期化される）
let positions, velocities, lifetimes, ages, temps, species, colors;
let positionAttr, ageAttr, lifeAttr, tempAttr, colorAttr, velocityAttr;

// ---------- シェーダーファイルの読み込み（開発サーバー対応） ----------
async function fetchShader(url){ 
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load shader: ${url}`);
    return await res.text(); 
  } catch (error) {
    console.error(`Error loading shader ${url}:`, error);
    throw error;
  }
}

// GPU対応のバッファ割り当て関数（グローバルに定義）
function allocBuffers(N){
    positions = new Float32Array(N*3);
    velocities = new Float32Array(N*3);
    lifetimes = new Float32Array(N);
    ages = new Float32Array(N);
    temps = new Float32Array(N);
    species = new Uint8Array(N);
    colors = new Float32Array(N*3);
    
    // 全てのパーティクルを「死んでいる」状態で初期化
    for(let i=0;i<N;i++){
      const i3 = i*3;
      positions[i3+0]=positions[i3+1]=positions[i3+2]=99999;
      velocities[i3+0]=velocities[i3+1]=velocities[i3+2]=0;
      lifetimes[i]=0; 
      ages[i]=1e9; // 寿命を超えた状態
      temps[i]=0;
      colors[i3+0]=colors[i3+1]=colors[i3+2]=0;
      species[i]=0;
    }
    
    // バッファ属性を作成・更新
    positionAttr = new THREE.BufferAttribute(positions,3);
    velocityAttr = new THREE.BufferAttribute(velocities,3);
    ageAttr = new THREE.BufferAttribute(ages,1);
    lifeAttr = new THREE.BufferAttribute(lifetimes,1);
    tempAttr = new THREE.BufferAttribute(temps,1);
    colorAttr = new THREE.BufferAttribute(colors,3);
    
    particleGeo.setAttribute('position', positionAttr);
    particleGeo.setAttribute('aVelocity', velocityAttr);
    particleGeo.setAttribute('aAge', ageAttr);
    particleGeo.setAttribute('aLifetime', lifeAttr);
    particleGeo.setAttribute('aTemp', tempAttr);
    particleGeo.setAttribute('aColor', colorAttr);
    
    // Speciesをfloatとして扱う（シェーダー用）
    const speciesFloat = new Float32Array(N);
    for(let i=0; i<N; i++) speciesFloat[i] = species[i];
    particleGeo.setAttribute('aSpecies', new THREE.BufferAttribute(speciesFloat, 1));
}

// GPUベースのパーティクルマテリアル（物理計算をGPU上で実行）
let particleMat;
let particles;

async function setupParticleSystem(){
  // シェーダーを読み込む
  const particleRenderVS = await fetchShader('./assets/shaders/particle_render.vert.glsl');
  console.log('Particle shader loaded');
  
  // バッファを初期化
  allocBuffers(MAX_PARTICLES);
  
  // マテリアルを作成（パーティクルサイズを大きくして個々の粒子を識別可能に）
  particleMat = new THREE.ShaderMaterial({
    transparent: true, 
    depthWrite: false, 
    blending: THREE.AdditiveBlending,
    uniforms: { 
      uPointSize: {value: 16.0} // 小さめの粒子で大量に表示
    },
    vertexShader: particleRenderVS,
    fragmentShader: `precision highp float; 
      varying float vAlpha; 
      varying vec3 vColor;
      void main(){ 
        vec2 uv = gl_PointCoord - 0.5; 
        float d = length(uv); 
        float a = smoothstep(0.5, 0.0, d) * vAlpha; 
        gl_FragColor = vec4(vColor, a); 
      }`
  });
  
  // パーティクルシステムを作成
  particles = new THREE.Points(particleGeo, particleMat);
  scene.add(particles);
  console.log('Particle system created');
  
  // 初期パーティクルを生成（ペアで生成）
  function initializeParticles(){
    const temp = hawkingTemperature(BH_Mass_kg);
    const initialPairs = Math.min(1000, Math.floor(MAX_PARTICLES / 2)); // ペア数（増やす）
    let spawnedPairs = 0;
    let idx1 = -1, idx2 = -1;
    
    for(let i=0; i<MAX_PARTICLES && spawnedPairs < initialPairs; i++){
      if(ages[i] >= lifetimes[i]){
        if(idx1 === -1){
          idx1 = i;
        } else {
          idx2 = i;
          spawnParticlePair(idx1, idx2, temp);
          spawnedPairs++;
          idx1 = -1;
          idx2 = -1;
        }
      }
    }
    console.log(`Initialized ${spawnedPairs} particle pairs (${spawnedPairs*2} particles)`);
    needsBufferUpdate = true;
    
    // バッファを即座に更新
    if (positionAttr) positionAttr.needsUpdate = true;
    if (velocityAttr) velocityAttr.needsUpdate = true;
    if (ageAttr) ageAttr.needsUpdate = true;
    if (lifeAttr) lifeAttr.needsUpdate = true;
    if (colorAttr) colorAttr.needsUpdate = true;
    if (particleGeo.attributes.aSpecies) particleGeo.attributes.aSpecies.needsUpdate = true;
  }
  
  // 初期パーティクルを生成
  initializeParticles();
}

// ---------- Simulation State ----------
let BH_Mass_solar = parseFloat(massSlider.value);
let BH_Mass_kg = BH_Mass_solar * M_sun;
let rs_m = schwarzschildRadius(BH_Mass_kg);
const RS_BASE_VISUAL = 1.0;

// パーティクルシステム用の変数
let spawnAccumulator = 0;
let needsBufferUpdate = false;

await setupParticleSystem();

// ---------- Postprocess: screen-space lens ----------
let lensMaterial;
let postScene, postCam, rt;

async function setupPost(){
  // 開発サーバーでは通常のfetchで読み込む
  const fs = await fetchShader('./assets/shaders/post_lens.frag.glsl');
  const vs = await fetchShader('./assets/shaders/post_fullscreen.vert.glsl');

  rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { depthBuffer: true });
  postScene = new THREE.Scene();
  postCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const quadGeo = new THREE.PlaneGeometry(2,2);
  lensMaterial = new THREE.RawShaderMaterial({
    uniforms:{
      uTex:{ value: rt.texture },
      uResolution:{ value: new THREE.Vector2(innerWidth, innerHeight) },
      uBHCenter:{ value: new THREE.Vector2(0.5,0.5) },
      uBHScreenR:{ value: 0.1 },
      uStrength:{ value: parseFloat(lensStrength.value) },
      uChrom:{ value: parseFloat(lensChrom.value) },
      uEnabled:{ value: lensEnable.checked }
    },
    vertexShader: vs,
    fragmentShader: fs
  });
  const quad = new THREE.Mesh(quadGeo, lensMaterial);
  postScene.add(quad);
}
await setupPost();

function updateBHScale(){
  BH_Mass_kg = BH_Mass_solar * M_sun;
  rs_m = schwarzschildRadius(BH_Mass_kg);
  const rs_ref = schwarzschildRadius(10 * M_sun);
  const s = (rs_m / rs_ref) * RS_BASE_VISUAL;
  bhMesh.scale.setScalar(s);
  disk.scale.setScalar(s * 1.0);
}
updateBHScale();

function updateMetrics(){
  const tK = hawkingTemperature(BH_Mass_kg);
  const pRel = relativePowerVsSolar(BH_Mass_kg);
  rsMetersEl.textContent = rs_m.toExponential(3);
  tKelvinEl.textContent = tK.toExponential(3);
  pRelEl.textContent = pRel.toExponential(3);
}
updateMetrics();

// ---------- Helpers ----------
function normSpecies(){
  let a = parseFloat(fPhoton.value);
  let b = parseFloat(fNeutrino.value);
  let c = parseFloat(fGraviton.value);
  let s = a+b+c; if (s<=1e-6){ a=1; b=c=0; s=1; }
  return [a/s, b/s, c/s];
}

// ホーキング放射の対生成：粒子ペアを生成（一方はブラックホールに落ち、もう一方は放射される）
function spawnParticlePair(index1, index2, tempK){
  // Choose species
  const [fp, fn, fg] = normSpecies();
  const u = Math.random();
  let sp=0;
  if (u<fp) sp=0; else if (u<fp+fn) sp=1; else sp=2;

  // Sample energy ~ kT * x, x ~ gamma(4) proxy for blackbody
  const kT = kB*tempK;
  const x = sampleXGamma4(Math.random);
  const E = Math.max(1e-25, kT * x);

  // Color mapping
  let col;
  if (sp===0){ // photon: spectral color by energy
    const rgb = energyToRgb(E);
    col = new THREE.Color(rgb[0], rgb[1], rgb[2]);
  }else if (sp===1){ // neutrino: faint cyan
    col = new THREE.Color(0.6,0.9,1.0);
  }else{ // graviton: faint violet-white
    col = new THREE.Color(0.85,0.8,1.0);
  }

  // Lifetime inversely ~ energy; neutrino/graviton live longer (visual)
  const baseLife = 8.0; // 少し長めにして観察しやすく
  let life = baseLife / Math.sqrt(x*0.8+0.2);
  if (sp===1) life *= 1.6;
  if (sp===2) life *= 1.3;

  // 対生成の位置：イベントホライズン付近
  const rsVisual = bhMesh.scale.x;
  const r0 = rsVisual * (1.01 + Math.random()*0.08); // よりホライズンに近い位置
  const theta = Math.acos(1 - 2*Math.random());
  const phi = Math.random()*Math.PI*2;
  const sx = r0 * Math.sin(theta)*Math.cos(phi);
  const sy = r0 * Math.cos(theta);
  const sz = r0 * Math.sin(theta)*Math.sin(phi);
  
  const spawnPos = new THREE.Vector3(sx, sy, sz);
  const dirFromBH = spawnPos.clone().normalize(); // ブラックホールからの方向

  // エネルギーに基づく速度
  const vmag = 0.8 + 2.2*Math.min(1.0, x/4.0);
  
  // パーティクル1: ブラックホールに落ちる（負の方向、内側へ）
  const i1_3 = index1*3;
  species[index1] = sp;
  positions[i1_3+0] = sx;
  positions[i1_3+1] = sy;
  positions[i1_3+2] = sz;
  // ブラックホールに向かう速度（負の方向）
  const velInward = dirFromBH.clone().multiplyScalar(-vmag * 0.7); // 内側へ落ちる
  velocities[i1_3+0] = velInward.x;
  velocities[i1_3+1] = velInward.y;
  velocities[i1_3+2] = velInward.z;
  lifetimes[index1] = life * 0.3; // 短い寿命（すぐにブラックホールに落ちる）
  ages[index1] = 0.0;
  temps[index1] = tempK;
  colors[i1_3+0] = col.r * 0.6; // 暗めの色（落ちる粒子）
  colors[i1_3+1] = col.g * 0.6;
  colors[i1_3+2] = col.b * 0.6;
  
  // パーティクル2: 外側に放射される（正の方向、外側へ）
  const i2_3 = index2*3;
  species[index2] = sp;
  positions[i2_3+0] = sx;
  positions[i2_3+1] = sy;
  positions[i2_3+2] = sz;
  // 外側に放射される速度（正の方向）
  const velOutward = dirFromBH.clone().multiplyScalar(vmag); // 外側へ放射
  const jitter = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(0.4);
  velOutward.add(jitter);
  velocities[i2_3+0] = velOutward.x;
  velocities[i2_3+1] = velOutward.y;
  velocities[i2_3+2] = velOutward.z;
  lifetimes[index2] = life; // 長い寿命（外側に飛んでいく）
  ages[index2] = 0.0;
  temps[index2] = tempK;
  colors[i2_3+0] = col.r; // 明るい色（放射される粒子）
  colors[i2_3+1] = col.g;
  colors[i2_3+2] = col.b;
  
  // Speciesバッファも更新
  if (particleGeo.attributes.aSpecies) {
    particleGeo.attributes.aSpecies.array[index1] = sp;
    particleGeo.attributes.aSpecies.array[index2] = sp;
    particleGeo.attributes.aSpecies.needsUpdate = true;
  }
}

// 単一パーティクル生成（後方互換性のため残す）
function spawnParticleAt(i, tempK){
  // ペア生成を使うため、デフォルトでは使わない
  // ただし、初期化時などに単独で生成する場合はこちらを使用
  const [fp, fn, fg] = normSpecies();
  const u = Math.random();
  let sp=0;
  if (u<fp) sp=0; else if (u<fp+fn) sp=1; else sp=2;
  species[i] = sp;

  const kT = kB*tempK;
  const x = sampleXGamma4(Math.random);
  const E = Math.max(1e-25, kT * x);

  let col;
  if (sp===0){
    const rgb = energyToRgb(E);
    col = new THREE.Color(rgb[0], rgb[1], rgb[2]);
  }else if (sp===1){
    col = new THREE.Color(0.6,0.9,1.0);
  }else{
    col = new THREE.Color(0.85,0.8,1.0);
  }

  const baseLife = 8.0;
  let life = baseLife / Math.sqrt(x*0.8+0.2);
  if (sp===1) life *= 1.6;
  if (sp===2) life *= 1.3;

  const rsVisual = bhMesh.scale.x;
  const r0 = rsVisual * (1.02 + Math.random()*0.14);
  const theta = Math.acos(1 - 2*Math.random());
  const phi = Math.random()*Math.PI*2;
  const sx = r0 * Math.sin(theta)*Math.cos(phi);
  const sy = r0 * Math.cos(theta);
  const sz = r0 * Math.sin(theta)*Math.sin(phi);

  const dir = new THREE.Vector3(sx,sy,sz).normalize();
  const vmag = 0.8 + 2.2*Math.min(1.0, x/4.0);
  dir.multiplyScalar(vmag);
  const jitter = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).multiplyScalar(0.4);
  dir.add(jitter);

  const i3 = i*3;
  positions[i3+0]=sx; positions[i3+1]=sy; positions[i3+2]=sz;
  velocities[i3+0]=dir.x; velocities[i3+1]=dir.y; velocities[i3+2]=dir.z;
  lifetimes[i]=life;
  ages[i]=0.0;
  temps[i]=tempK;
  colors[i3+0]=col.r; colors[i3+1]=col.g; colors[i3+2]=col.b;
  
  if (particleGeo.attributes.aSpecies) {
    particleGeo.attributes.aSpecies.array[i] = sp;
    particleGeo.attributes.aSpecies.needsUpdate = true;
  }
}

function spawnParticles(dt){
  const rateUI = parseFloat(pairRate.value);
  const relPower = relativePowerVsSolar(BH_Mass_kg);
  const temp = hawkingTemperature(BH_Mass_kg);
  
  // 生成率の計算：ペア生成なので、ペア数で計算
  const baseRate = 500.0; // ペア生成率（増やす）
  const rate = baseRate * rateUI * Math.max(0.01, relPower);
  
  spawnAccumulator += rate * dt;
  let pairsToSpawn = Math.floor(spawnAccumulator);
  spawnAccumulator -= pairsToSpawn;
  
  // 最低でも時々ペアを生成
  if (pairsToSpawn <= 0 && rate > 0 && Math.random() < 0.1) {
    pairsToSpawn = 1;
    spawnAccumulator = 0;
  }
  
  if (pairsToSpawn <= 0) return;

  // 死んだパーティクルのインデックスを事前に収集（ペア用に2倍必要）
  const deadIndices = [];
  for (let k=0; k<MAX_PARTICLES; k++){
    if (ages[k] >= lifetimes[k]) {
      deadIndices.push(k);
      if (deadIndices.length >= pairsToSpawn * 2) break; // ペアなので2倍必要
    }
  }

  // ペアで生成：2つずつ使ってペアを作る
  const availablePairs = Math.floor(deadIndices.length / 2);
  const pairsToCreate = Math.min(pairsToSpawn, availablePairs);
  
  for (let p=0; p<pairsToCreate; p++){
    const idx1 = deadIndices[p*2];
    const idx2 = deadIndices[p*2 + 1];
    spawnParticlePair(idx1, idx2, temp);
  }
  
  if (pairsToCreate > 0) {
    needsBufferUpdate = true;
  }
}

// GPUベースのパーティクル更新（物理計算を効率的に実行）
// CPU側で物理計算を行い、GPU側でレンダリング（最も効率的なアプローチ）
function updateParticles(dt){
  // dtを適切に制限
  const clampedDt = Math.min(dt, 0.05);
  
  const rsVisual = bhMesh.scale.x;
  const soft = rsVisual*rsVisual*0.4 + 0.04;
  const Gvis = 4.0 * rsVisual;
  
  let hasUpdates = false;
  
  // パーティクルを並列処理（GPUの並列性を意識した効率的なループ）
  for (let i=0; i<MAX_PARTICLES; i++){
    // 死んでいるパーティクルはスキップ
    if (ages[i] >= lifetimes[i]) continue;
    
    const i3 = i*3;
    let x = positions[i3+0];
    let y = positions[i3+1];
    let z = positions[i3+2];
    
    // 位置が無効な場合はスキップ
    if (Math.abs(x) > 1e5 || Math.abs(y) > 1e5 || Math.abs(z) > 1e5) continue;
    
    // ブラックホールからの距離
    const r2 = x*x + y*y + z*z;
    const r = Math.sqrt(r2) + 1e-6;
    
    // 重力加速度の計算（GPU並列計算を意識）
    const accMag = -Gvis / (r2 + soft);
    const invR = 1.0 / r;
    const ax = accMag * x * invR;
    const ay = accMag * y * invR;
    const az = accMag * z * invR;
    
    // 速度を更新
    velocities[i3+0] += ax * clampedDt;
    velocities[i3+1] += ay * clampedDt;
    velocities[i3+2] += az * clampedDt;
    
    // 速度の減衰（種別に応じて）
    const sp = species[i];
    const damping = (sp === 0) ? 0.998 : (sp === 1) ? 0.9995 : 0.999;
    velocities[i3+0] *= damping;
    velocities[i3+1] *= damping;
    velocities[i3+2] *= damping;
    
    // 位置を更新
    x += velocities[i3+0] * clampedDt;
    y += velocities[i3+1] * clampedDt;
    z += velocities[i3+2] * clampedDt;
    
    positions[i3+0] = x;
    positions[i3+1] = y;
    positions[i3+2] = z;
    
    // 年齢を更新
    ages[i] += clampedDt;
    
    // ブラックホールに吸収されたかチェック
    const newR = Math.sqrt(x*x + y*y + z*z);
    if (newR < rsVisual * 1.01 || ages[i] >= lifetimes[i]){
      // 吸収または寿命切れ：パーティクルを無効化
      ages[i] = lifetimes[i];
      positions[i3+0] = positions[i3+1] = positions[i3+2] = 99999;
      velocities[i3+0] = velocities[i3+1] = velocities[i3+2] = 0;
    }
    
    hasUpdates = true;
  }
  
  if (hasUpdates) {
    needsBufferUpdate = true;
  }
}

// ---------- Resize ----------
addEventListener('resize', ()=>{
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  if (rt){
    rt.setSize(innerWidth, innerHeight);
    lensMaterial.uniforms.uResolution.value.set(innerWidth, innerHeight);
  }
});

// ---------- UI ----------
function syncMassInputs(from){
  if (from==='slider'){ massNumber.value = parseFloat(massSlider.value); }
  if (from==='number'){ massSlider.value = parseFloat(massNumber.value); }
  BH_Mass_solar = parseFloat(massSlider.value);
  updateBHScale();
  updateMetrics();
}
massSlider.addEventListener('input', ()=>syncMassInputs('slider'));
massNumber.addEventListener('input', ()=>syncMassInputs('number'));
pairRate.addEventListener('input', ()=>{ pairRateLabel.textContent = parseFloat(pairRate.value).toFixed(2); });
maxParticles.addEventListener('input', ()=>{ 
  const v = parseInt(maxParticles.value); 
  maxParticlesLabel.textContent = v; 
  // バッファの再割り当てはtickループで処理される
});
lensStrength.addEventListener('input', ()=>{ lensStrengthLabel.textContent = parseFloat(lensStrength.value).toFixed(2); if(lensMaterial) lensMaterial.uniforms.uStrength.value=parseFloat(lensStrength.value); });
lensChrom.addEventListener('input', ()=>{ if(lensMaterial) lensMaterial.uniforms.uChrom.value=parseFloat(lensChrom.value); });
lensEnable.addEventListener('change', ()=>{ if(lensMaterial) lensMaterial.uniforms.uEnabled.value=lensEnable.checked; });

resetBtn.addEventListener('click', ()=>{
  for (let i=0; i<MAX_PARTICLES; i++){
    const i3 = i*3;
    positions[i3+0] = positions[i3+1] = positions[i3+2] = 99999;
    velocities[i3+0] = velocities[i3+1] = velocities[i3+2] = 0;
    lifetimes[i] = 0; 
    ages[i] = 1e9; 
    temps[i] = 0;
    colors[i3+0] = colors[i3+1] = colors[i3+2] = 0;
    species[i] = 0;
    if (particleGeo.attributes.aSpecies) {
      particleGeo.attributes.aSpecies.array[i] = 0;
    }
  }
  needsBufferUpdate = true;
});
pauseBtn.addEventListener('click', ()=>{ paused=!paused; pauseBtn.textContent = paused? 'Resume' : 'Pause'; });
screenshotBtn.addEventListener('click', ()=>{ const dataURL = renderer.domElement.toDataURL('image/png'); const a=document.createElement('a'); a.href=dataURL; a.download='hawking-sim.png'; a.click(); });

// ---------- Animate with lens postprocess ----------
let last = performance.now();
function updateLensUniforms(){
  if (!lensMaterial) return;
  // Project BH center to screen UV
  const v = new THREE.Vector3(0,0,0).applyMatrix4(bhMesh.matrixWorld).project(camera);
  const uv = new THREE.Vector2(0.5*v.x+0.5, -0.5*v.y+0.5);
  lensMaterial.uniforms.uBHCenter.value.copy(uv);
  // Estimate horizon screen radius by projecting a point at r_s along +x
  const rs = bhMesh.scale.x;
  const pEdge = new THREE.Vector3(rs,0,0).applyMatrix4(bhMesh.matrixWorld).project(camera);
  const uvEdge = new THREE.Vector2(0.5*pEdge.x+0.5, -0.5*pEdge.y+0.5);
  const rScreen = uv.distanceTo(uvEdge);
  lensMaterial.uniforms.uBHScreenR.value = rScreen;
}
function tick(now){
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now-last)*0.001); 
  last = now;

  diskMat.uniforms.uTime.value = now*0.001;

  // パーティクル数の変更を処理
  const desired = parseInt(maxParticles.value);
  if (desired !== MAX_PARTICLES){
    MAX_PARTICLES = desired; 
    allocBuffers(MAX_PARTICLES);
    needsBufferUpdate = true;
  }

  // パーティクルの更新
  if (!paused){ 
    spawnParticles(dt); 
    updateParticles(dt); 
  }

  // バッファの更新（パーティクルが動いている場合は毎フレーム更新が必要）
  if (needsBufferUpdate || !paused) {
    if (positionAttr) positionAttr.needsUpdate = true;
    if (velocityAttr) velocityAttr.needsUpdate = true;
    if (ageAttr) ageAttr.needsUpdate = true;
    if (lifeAttr) lifeAttr.needsUpdate = true;
    if (tempAttr) tempAttr.needsUpdate = true;
    if (colorAttr) colorAttr.needsUpdate = true;
    if (particleGeo.attributes.aSpecies) particleGeo.attributes.aSpecies.needsUpdate = true;
    needsBufferUpdate = false;
  }

  controls.update();

  // render to RT then lens
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  updateLensUniforms();
  renderer.render(postScene, postCam);
}
requestAnimationFrame(tick);

