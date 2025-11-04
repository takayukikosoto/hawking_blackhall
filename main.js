import {G,c,hbar,kB,h,M_sun,schwarzschildRadius,hawkingTemperature,relativePowerVsSolar,sampleXGamma4,energyToRgb} from './constants.js';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// API設定（デプロイ環境に応じて自動切り替え）
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8001'
  : 'https://hawking-sim-api.onrender.com'; // Render にデプロイ時のURL（要変更）
let useAPI = true; // APIを使用するかどうか（フォールバック用）
let useQuantumPairGeneration = true; // 量子揺らぎのペア生成APIを使用するかどうか

// API結果のキャッシュ（パフォーマンス最適化）
let metricsCache = null;
let spawnRateCache = null;
let cacheTime = 0;
const CACHE_DURATION = 100; // 100ms間キャッシュ（毎フレーム呼ばないように）

// 量子ペア生成のキャッシュ
let quantumPairsCache = null;
let quantumPairsCacheTime = 0;
const QUANTUM_PAIRS_CACHE_DURATION = 200; // 200ms間キャッシュ
let lastSpawnTime = -1; // 初期値は-1（最初の呼び出しを許可）
const MIN_SPAWN_INTERVAL = 0.1; // 最小生成間隔（秒）- 10回/秒まで

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
const photonShotBtn = document.getElementById('photonShotBtn');
const evaporateBtn = document.getElementById('evaporateBtn');
const stopEvaporateBtn = document.getElementById('stopEvaporateBtn');
const instantEvaporateBtn = document.getElementById('instantEvaporateBtn');
const toggleUI = document.getElementById('toggleUI');
const cameraUp = document.getElementById('cameraUp');
const cameraDown = document.getElementById('cameraDown');
const cameraLeft = document.getElementById('cameraLeft');
const cameraRight = document.getElementById('cameraRight');
const cameraCenter = document.getElementById('cameraCenter');
const cameraZoomIn = document.getElementById('cameraZoomIn');
const cameraZoomOut = document.getElementById('cameraZoomOut');
const ui = document.getElementById('ui');
const viewMode = document.getElementById('viewMode');
const sectionPlane = document.getElementById('sectionPlane');
const showGravityWell = document.getElementById('showGravityWell');
const showSpacetimeGrid = document.getElementById('showSpacetimeGrid');
const showHorizonHalo = document.getElementById('showHorizonHalo');
const showEnergyStreamlines = document.getElementById('showEnergyStreamlines');
const showParticleTrails = document.getElementById('showParticleTrails');
const sizePhoton = document.getElementById('sizePhoton');
const sizeNeutrino = document.getElementById('sizeNeutrino');
const sizeGraviton = document.getElementById('sizeGraviton');
const sizePhotonLabel = document.getElementById('sizePhotonLabel');
const sizeNeutrinoLabel = document.getElementById('sizeNeutrinoLabel');
const sizeGravitonLabel = document.getElementById('sizeGravitonLabel');

let paused = false;
let uiCollapsed = false;
let isCrossSectionMode = false;
let currentSectionPlane = 'xy';

// 蒸発機能用の変数
let isEvaporating = false;
let isInstantEvaporating = false; // 一気蒸発中フラグ
let evaporationRate = 0.01; // 100倍の速度（通常の100倍で蒸発）
let lastEvaporationTime = 0;
let cameraShakeIntensity = 0;

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

// カメラ（3Dビュー用）
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.01, 1e9);
camera.position.set(0, 15, 42);

// 断面ビュー用の正投影カメラ
let orthoCamera = null;
let gridHelper = null;
let sectionHelper = null;

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 10;
controls.maxDistance = 200;

// 断面モードの設定
function setupCrossSectionMode(){
  // 正投影カメラを作成
  const viewSize = 50;
  orthoCamera = new THREE.OrthographicCamera(
    -viewSize, viewSize, viewSize, -viewSize, 0.1, 1000
  );
  
  // グリッドヘルパーを作成
  gridHelper = new THREE.GridHelper(100, 50, 0x444444, 0x222222);
  gridHelper.visible = false;
  scene.add(gridHelper);
  
  // 断面平面のヘルパー（透明度のある平面）
  const sectionGeometry = new THREE.PlaneGeometry(100, 100);
  const sectionMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
    wireframe: true
  });
  sectionHelper = new THREE.Mesh(sectionGeometry, sectionMaterial);
  sectionHelper.visible = false;
  scene.add(sectionHelper);
}

setupCrossSectionMode();

function updateCrossSectionView(){
  if(!isCrossSectionMode || !gridHelper || !sectionHelper || !orthoCamera) {
    if(gridHelper) gridHelper.visible = false;
    if(sectionHelper) sectionHelper.visible = false;
    return;
  }
  
  gridHelper.visible = true;
  sectionHelper.visible = true;
  
  const viewSize = 50;
  const viewDistance = 30;
  
  // 平面に応じてカメラ位置とグリッドの向きを設定
  switch(currentSectionPlane){
    case 'xy': // 上から見る（Z軸方向）
      orthoCamera.left = -viewSize;
      orthoCamera.right = viewSize;
      orthoCamera.top = viewSize;
      orthoCamera.bottom = -viewSize;
      orthoCamera.position.set(0, 0, viewDistance);
      orthoCamera.lookAt(0, 0, 0);
      gridHelper.rotation.x = 0;
      gridHelper.rotation.y = 0;
      gridHelper.rotation.z = 0;
      sectionHelper.rotation.x = 0;
      sectionHelper.rotation.y = 0;
      sectionHelper.rotation.z = 0;
      sectionHelper.position.set(0, 0, 0);
      break;
      
    case 'xz': // 前から見る（Y軸方向）
      orthoCamera.left = -viewSize;
      orthoCamera.right = viewSize;
      orthoCamera.top = viewSize;
      orthoCamera.bottom = -viewSize;
      orthoCamera.position.set(0, viewDistance, 0);
      orthoCamera.lookAt(0, 0, 0);
      gridHelper.rotation.x = Math.PI / 2;
      gridHelper.rotation.y = 0;
      gridHelper.rotation.z = 0;
      sectionHelper.rotation.x = Math.PI / 2;
      sectionHelper.rotation.y = 0;
      sectionHelper.rotation.z = 0;
      sectionHelper.position.set(0, 0, 0);
      break;
      
    case 'yz': // 横から見る（X軸方向）
      orthoCamera.left = -viewSize;
      orthoCamera.right = viewSize;
      orthoCamera.top = viewSize;
      orthoCamera.bottom = -viewSize;
      orthoCamera.position.set(viewDistance, 0, 0);
      orthoCamera.lookAt(0, 0, 0);
      gridHelper.rotation.x = 0;
      gridHelper.rotation.y = Math.PI / 2;
      gridHelper.rotation.z = 0;
      sectionHelper.rotation.x = 0;
      sectionHelper.rotation.y = Math.PI / 2;
      sectionHelper.rotation.z = 0;
      sectionHelper.position.set(0, 0, 0);
      break;
  }
  
  orthoCamera.updateProjectionMatrix();
}

viewMode.addEventListener('change', ()=>{
  isCrossSectionMode = viewMode.value === 'cross-section';
  updateCrossSectionView();
  if(isCrossSectionMode){
    controls.enabled = false; // 断面モードではコントロールを無効化
  } else {
    controls.enabled = true;
  }
});

sectionPlane.addEventListener('change', ()=>{
  currentSectionPlane = sectionPlane.value;
  updateCrossSectionView();
});

// 可視化要素の表示/非表示制御
showGravityWell.addEventListener('change', ()=>{
  if(gravityWellMesh) gravityWellMesh.visible = showGravityWell.checked;
});

showSpacetimeGrid.addEventListener('change', ()=>{
  if(spacetimeGrid) spacetimeGrid.visible = showSpacetimeGrid.checked;
});

showHorizonHalo.addEventListener('change', ()=>{
  if(horizonHalo) horizonHalo.visible = showHorizonHalo.checked;
});

showEnergyStreamlines.addEventListener('change', ()=>{
  if(energyStreamlines) energyStreamlines.visible = showEnergyStreamlines.checked;
});

showParticleTrails.addEventListener('change', ()=>{
  // 軌跡の表示/非表示はtick関数で処理
});

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

// 事象の地平線のハロー（概念的な表現、控えめに）
const horizonGeom = new THREE.SphereGeometry(1.02, 64, 64);
const horizonMat = new THREE.MeshBasicMaterial({
  color: 0x444466, // オレンジからグレー・青系に変更
  transparent: true,
  opacity: 0.08, // より透明に
  side: THREE.BackSide,
  wireframe: false
});
const horizonHalo = new THREE.Mesh(horizonGeom, horizonMat);
horizonHalo.visible = false; // デフォルトで非表示
bhGroup.add(horizonHalo);

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

// ---------- 重力ポテンシャルメッシュ（重力の井戸の可視化） ----------
let gravityWellMesh = null;
let spacetimeGrid = null;
let energyStreamlines = null;
let particleTrails = new Map(); // パーティクルID -> 軌跡配列
const MAX_TRAIL_LENGTH = 50; // 軌跡の最大長さ
const TRAIL_UPDATE_INTERVAL = 2; // 軌跡更新間隔（フレーム）
let trailUpdateCounter = 0;

function createGravityWellMesh(rsVisual) {
  if (gravityWellMesh) {
    scene.remove(gravityWellMesh);
    gravityWellMesh.geometry.dispose();
    gravityWellMesh.material.dispose();
  }
  
  const segments = 64;
  const radius = 25.0;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];
  const indices = [];
  
  // 極座標でメッシュを生成
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    for (let j = 0; j <= segments; j++) {
      const phi = (j / segments) * Math.PI;
      const r_base = radius * (0.3 + 0.7 * (j / segments));
      
      // 重力ポテンシャルに基づく高さ（z方向の歪み）
      const r_from_bh = Math.sqrt(r_base * r_base + (rsVisual * 2) * (rsVisual * 2));
      const potential = -1.0 / (r_from_bh + rsVisual * 0.5);
      const height = potential * 8.0; // 視覚的なスケール
      
      const x = r_base * Math.sin(phi) * Math.cos(theta);
      const y = r_base * Math.sin(phi) * Math.sin(theta);
      const z = height;
      
      vertices.push(x, y, z);
      
      // 距離に応じた色（控えめなグレー・青系）
      const distFactor = Math.min(1.0, r_from_bh / (radius * 2));
      colors.push(
        0.15 + 0.15 * (1.0 - distFactor), // R（低く）
        0.15 + 0.15 * distFactor,         // G
        0.2 + 0.2 * distFactor            // B（青系）
      );
    }
  }
  
  // インデックス生成
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * (segments + 1) + j;
      const b = a + segments + 1;
      indices.push(a, b, a + 1);
      indices.push(b, b + 1, a + 1);
    }
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.15, // より透明に
    wireframe: false,
    side: THREE.DoubleSide
  });
  
  gravityWellMesh = new THREE.Mesh(geometry, material);
  gravityWellMesh.rotation.x = Math.PI / 2; // XY平面に配置
  gravityWellMesh.visible = false; // デフォルトで非表示
  scene.add(gravityWellMesh);
}

// ---------- 時空の歪みを表現するグリッド ----------
function createSpacetimeGrid(rsVisual) {
  if (spacetimeGrid) {
    scene.remove(spacetimeGrid);
    spacetimeGrid.geometry.dispose();
    spacetimeGrid.material.dispose();
  }
  
  const gridSize = 30;
  const divisions = 40;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];
  
  // グリッド線を生成
  for (let i = 0; i <= divisions; i++) {
    const x = (i / divisions - 0.5) * gridSize;
    for (let j = 0; j <= divisions; j++) {
      const y = (j / divisions - 0.5) * gridSize;
      const r = Math.sqrt(x * x + y * y);
      
      // 重力による空間の歪み（z方向の変位）
      const potential = -1.0 / (r + rsVisual * 0.5);
      const z = potential * 3.0;
      
      vertices.push(x, y, z);
      
      // 歪みに応じた色（控えめなグレー・青系）
      const distortion = Math.min(1.0, Math.abs(z) / 2.0);
      colors.push(
        0.2 + 0.2 * distortion,           // R（低く）
        0.25 + 0.25 * (1.0 - distortion), // G
        0.3 + 0.3 * distortion            // B（青系）
      );
    }
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  // 線のインデックス
  const indices = [];
  for (let i = 0; i <= divisions; i++) {
    for (let j = 0; j < divisions; j++) {
      const a = i * (divisions + 1) + j;
      const b = a + 1;
      indices.push(a, b);
    }
  }
  for (let j = 0; j <= divisions; j++) {
    for (let i = 0; i < divisions; i++) {
      const a = i * (divisions + 1) + j;
      const b = a + divisions + 1;
      indices.push(a, b);
    }
  }
  
  geometry.setIndex(indices);
  
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.12, // より透明に
    linewidth: 1
  });
  
  spacetimeGrid = new THREE.LineSegments(geometry, material);
  spacetimeGrid.rotation.x = Math.PI / 2; // XY平面に配置
  spacetimeGrid.visible = false; // デフォルトで非表示
  scene.add(spacetimeGrid);
}

// ---------- エネルギー流線の作成 ----------
function createEnergyStreamlines(rsVisual) {
  if (energyStreamlines) {
    scene.remove(energyStreamlines);
    energyStreamlines.geometry.dispose();
    energyStreamlines.material.dispose();
  }

  const numStreamlines = 30; // 流線の数
  const streamlineLength = 100; // 流線の長さ
  const stepSize = 0.5;
  
  const points = [];
  const colors = [];
  
  // サンプリング位置を生成（球面上）
  for (let i = 0; i < numStreamlines; i++) {
    const theta = (i / numStreamlines) * Math.PI * 2;
    const phi = Math.PI / 2 - (i % 10) * 0.2;
    const radius = rsVisual * 3 + (i % 5) * rsVisual * 2;
    
    const startX = radius * Math.sin(phi) * Math.cos(theta);
    const startY = radius * Math.cos(phi);
    const startZ = radius * Math.sin(phi) * Math.sin(theta);
    
    let x = startX;
    let y = startY;
    let z = startZ;
    
    // 流線の開始点
    points.push(x, y, z);
    colors.push(0.2, 0.6, 1.0); // 青系
    
    // 流線を追跡
    for (let step = 0; step < streamlineLength; step++) {
      const r2 = x*x + y*y + z*z;
      const r = Math.sqrt(r2) + 1e-6;
      
      // ブラックホールに近づきすぎたら停止
      if (r < rsVisual * 1.1) break;
      
      // 速度場を計算（パーティクルの平均速度方向を模擬）
      // 放射方向の速度成分
      const toCenter = new THREE.Vector3(-x, -y, -z).normalize();
      const radialSpeed = 2.0;
      
      // 角運動量を保存するための接線方向速度
      const tangent = new THREE.Vector3().crossVectors(
        new THREE.Vector3(0, 1, 0),
        toCenter
      ).normalize();
      const tangentialSpeed = Math.sqrt(rsVisual * 5.0 / r); // ケプラー速度
      
      // 速度ベクトル
      const vx = toCenter.x * radialSpeed + tangent.x * tangentialSpeed;
      const vy = toCenter.y * radialSpeed + tangent.y * tangentialSpeed;
      const vz = toCenter.z * radialSpeed + tangent.z * tangentialSpeed;
      
      // 位置を更新
      x += vx * stepSize;
      y += vy * stepSize;
      z += vz * stepSize;
      
      points.push(x, y, z);
      
      // 距離に応じて色を変化（エネルギーが高いほど明るく）
      const distFactor = Math.min(1.0, r / (rsVisual * 10));
      colors.push(0.2 + distFactor * 0.8, 0.6 + distFactor * 0.4, 1.0);
    }
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    linewidth: 1
  });
  
  energyStreamlines = new THREE.LineSegments(geometry, material);
  energyStreamlines.visible = false; // デフォルトで非表示
  scene.add(energyStreamlines);
}

// ---------- パーティクル軌跡の更新 ----------
function updateParticleTrails() {
  if (!showParticleTrails.checked) {
    // 軌跡をクリア
    particleTrails.forEach((trail, id) => {
      if (trail.line) {
        scene.remove(trail.line);
        trail.line.geometry.dispose();
        trail.line.material.dispose();
      }
    });
    particleTrails.clear();
    return;
  }
  
  trailUpdateCounter++;
  if (trailUpdateCounter < TRAIL_UPDATE_INTERVAL) return;
  trailUpdateCounter = 0;
  
  const rsVisual = bhMesh.scale.x;
  
  // アクティブなパーティクルの軌跡を更新
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (ages[i] >= lifetimes[i]) {
      // 死んでいるパーティクルは軌跡を削除
      if (particleTrails.has(i)) {
        const trail = particleTrails.get(i);
        if (trail.line) {
          scene.remove(trail.line);
          trail.line.geometry.dispose();
          trail.line.material.dispose();
        }
        particleTrails.delete(i);
      }
      continue;
    }
    
    const i3 = i * 3;
    const x = positions[i3 + 0];
    const y = positions[i3 + 1];
    const z = positions[i3 + 2];
    
    // 無効な位置はスキップ
    if (Math.abs(x) > 1e5) continue;
    
    const r = Math.sqrt(x*x + y*y + z*z);
    if (r < rsVisual * 1.1) continue; // ブラックホールに近すぎる場合はスキップ
    
    // 軌跡を取得または作成
    if (!particleTrails.has(i)) {
      particleTrails.set(i, {
        positions: [],
        species: species[i]
      });
    }
    
    const trail = particleTrails.get(i);
    
    // 現在の位置を追加
    trail.positions.push(new THREE.Vector3(x, y, z));
    
    // 最大長さを超えたら古いものを削除
    if (trail.positions.length > MAX_TRAIL_LENGTH) {
      trail.positions.shift();
    }
    
    // 軌跡が十分な長さになったら描画
    if (trail.positions.length >= 2) {
      // 既存のLineを削除
      if (trail.line) {
        scene.remove(trail.line);
        trail.line.geometry.dispose();
        trail.line.material.dispose();
      }
      
      // 新しいLineを作成
      const trailPoints = trail.positions.map(p => new THREE.Vector3(p.x, p.y, p.z));
      const geometry = new THREE.BufferGeometry().setFromPoints(trailPoints);
      
      // 種別に応じた色
      let color;
      if (trail.species === 0) {
        color = new THREE.Color(1.0, 0.8, 0.6); // フォトン（暖色）
      } else if (trail.species === 1) {
        color = new THREE.Color(0.6, 0.9, 1.0); // ニュートリノ（シアン）
      } else {
        color = new THREE.Color(0.85, 0.8, 1.0); // グラビトン（紫）
      }
      
      const material = new THREE.LineBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.3,
        linewidth: 1
      });
      
      trail.line = new THREE.Line(geometry, material);
      scene.add(trail.line);
    }
  }
  
  // 死んだパーティクルの軌跡をフェードアウト
  particleTrails.forEach((trail, id) => {
    if (ages[id] >= lifetimes[id] && trail.line) {
      trail.line.material.opacity *= 0.95;
      if (trail.line.material.opacity < 0.01) {
        scene.remove(trail.line);
        trail.line.geometry.dispose();
        trail.line.material.dispose();
        particleTrails.delete(id);
      }
    }
  });
}

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
      uPointSizes: {value: new THREE.Vector3(20.0, 18.0, 16.0)} // [フォトン, ニュートリノ, グラビトン]
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
  async function initializeParticles(){
    // APIから温度を取得
    const metrics = await fetchBlackHoleMetrics(BH_Mass_solar);
    const temp = metrics.hawking_temperature_K;
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
  await initializeParticles();
  
  // 初期メトリクスを更新
  await updateBHScale();
  await updateMetrics();
  
  // 初期粒子サイズを設定
  updateParticleSizes();
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

// Python APIを使用してブラックホールの物理量を計算
async function fetchBlackHoleMetrics(massSolar, useCache = true) {
  const now = Date.now();
  
  // キャッシュチェック
  if (useCache && metricsCache && metricsCache.mass_solar === massSolar && (now - cacheTime) < CACHE_DURATION) {
    return metricsCache;
  }
  
  if (!useAPI) {
    // フォールバック: フロントエンドで計算
    const M_kg = massSolar * M_sun;
    const result = {
      mass_solar: massSolar,
      mass_kg: M_kg,
      schwarzschild_radius_m: schwarzschildRadius(M_kg),
      hawking_temperature_K: hawkingTemperature(M_kg),
      relative_power: relativePowerVsSolar(M_kg)
    };
    metricsCache = result;
    cacheTime = now;
    return result;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/blackhole/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mass_solar: massSolar })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();
    metricsCache = result;
    cacheTime = now;
    return result;
  } catch (error) {
    console.warn('API request failed, using fallback calculation:', error);
    useAPI = false; // 一度失敗したらフォールバックに切り替え
    return fetchBlackHoleMetrics(massSolar, useCache); // 再帰的にフォールバックを呼び出し
  }
}

// Python APIを使用してパーティクル生成率を計算
async function fetchSpawnRate(massSolar, pairRateUI, useCache = true) {
  const now = Date.now();
  const cacheKey = `${massSolar}_${pairRateUI}`;
  
  // キャッシュチェック
  if (useCache && spawnRateCache && spawnRateCache.key === cacheKey && (now - cacheTime) < CACHE_DURATION) {
    return spawnRateCache.data;
  }
  
  if (!useAPI) {
    // フォールバック: フロントエンドで計算
    const M_kg = massSolar * M_sun;
    const relPower = relativePowerVsSolar(M_kg);
    const baseRate = 500.0;
    const result = {
      spawn_rate_per_second: baseRate * pairRateUI * Math.max(0.01, relPower),
      relative_power: relPower,
      base_rate: baseRate,
      pair_rate_ui: pairRateUI
    };
    spawnRateCache = { key: cacheKey, data: result };
    cacheTime = now;
    return result;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/particles/spawn-rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        mass_solar: massSolar,
        pair_rate_ui: pairRateUI 
      })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();
    spawnRateCache = { key: cacheKey, data: result };
    cacheTime = now;
    return result;
  } catch (error) {
    console.warn('API request failed, using fallback calculation:', error);
    useAPI = false;
    return fetchSpawnRate(massSolar, pairRateUI, useCache);
  }
}

async function updateBHScale(){
  BH_Mass_kg = BH_Mass_solar * M_sun;
  
  // APIからシュヴァルツシルト半径を取得（キャッシュなしで最新値を取得）
  const metrics = await fetchBlackHoleMetrics(BH_Mass_solar, false);
  rs_m = metrics.schwarzschild_radius_m;
  
  // 参照値（10太陽質量）のシュヴァルツシルト半径を計算
  const rs_ref_metrics = await fetchBlackHoleMetrics(10, false);
  const rs_ref = rs_ref_metrics.schwarzschild_radius_m;
  
  const s = (rs_m / rs_ref) * RS_BASE_VISUAL;
  bhMesh.scale.setScalar(s);
  disk.scale.setScalar(s * 1.0);
  horizonHalo.scale.setScalar(s * 1.02);
  
  // 重力ポテンシャルメッシュと時空グリッドを更新
  createGravityWellMesh(s);
  createSpacetimeGrid(s);
  createEnergyStreamlines(s);
  
  // キャッシュをクリア（質量が変わったので）
  metricsCache = null;
  spawnRateCache = null;
}

async function updateMetrics(){
  const metrics = await fetchBlackHoleMetrics(BH_Mass_solar, false);
  rsMetersEl.textContent = metrics.schwarzschild_radius_m.toExponential(3);
  tKelvinEl.textContent = metrics.hawking_temperature_K.toExponential(3);
  pRelEl.textContent = metrics.relative_power.toExponential(3);
}

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

// 量子揺らぎのペア生成APIを呼び出す（キャッシュ付き）
async function fetchQuantumPairs(massSolar, dt, useCache = true) {
  const now = performance.now();
  const cacheKey = `${massSolar}_${dt.toFixed(3)}`;
  
  // キャッシュチェック
  if (useCache && quantumPairsCache && 
      quantumPairsCache.key === cacheKey && 
      (now - quantumPairsCacheTime) < QUANTUM_PAIRS_CACHE_DURATION) {
    return quantumPairsCache.data;
  }
  
  try {
    const response = await fetch(`${API_BASE_URL}/api/pair-generation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mass_solar: massSolar,
        dt: dt
      })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const result = await response.json();
    
    // キャッシュに保存
    quantumPairsCache = { key: cacheKey, data: result };
    quantumPairsCacheTime = now;
    
    return result;
  } catch (error) {
    console.warn('Quantum pair generation API failed, using fallback:', error);
    return null;
  }
}

async function spawnParticles(dt){
  const rateUI = parseFloat(pairRate.value);
  
  // 最小生成間隔をチェック（初期状態では常に許可）
  const currentTime = performance.now() / 1000; // 秒単位
  const canCallAPI = (lastSpawnTime < 0 || (currentTime - lastSpawnTime >= MIN_SPAWN_INTERVAL));
  
  // 量子揺らぎのペア生成APIを使用する場合（間隔が十分開いている場合のみ）
  if (useQuantumPairGeneration && useAPI && canCallAPI) {
    try {
      // より大きなdtで一度に取得（呼び出し頻度を減らす）
      const accumulatedDt = Math.min(dt * 5, 0.5); // 最大0.5秒
      const quantumData = await fetchQuantumPairs(BH_Mass_solar, accumulatedDt, true);
      if (quantumData && quantumData.particles && quantumData.particles.length > 0) {
        const particles = quantumData.particles;
        const temp = quantumData.temperature;
        
        // 死んだパーティクルのインデックスを事前に収集（ペア用に2倍必要）
        const deadIndices = [];
        for (let k=0; k<MAX_PARTICLES; k++){
          if (ages[k] >= lifetimes[k]) {
            deadIndices.push(k);
            if (deadIndices.length >= particles.length * 2) break; // ペアなので2倍必要
          }
        }
        
        const availablePairs = Math.floor(deadIndices.length / 2);
        const pairsToCreate = Math.min(particles.length, availablePairs);
        
        // 量子揺らぎのペア生成を使用
        for (let p=0; p<pairsToCreate; p++){
          const particle = particles[p];
          const idx1 = deadIndices[p*2];
          const idx2 = deadIndices[p*2 + 1];
          
          // 粒子種別をマッピング（"γ" -> 0, "ν" -> 1, "g" -> 2）
          let sp = 0;
          if (particle.type === "ν") sp = 1;
          else if (particle.type === "g") sp = 2;
          
          // エネルギーから色を計算
          const E = particle.energy;
          let col;
          if (sp === 0) { // photon
            const rgb = energyToRgb(E);
            col = new THREE.Color(rgb[0], rgb[1], rgb[2]);
          } else if (sp === 1) { // neutrino
            col = new THREE.Color(0.6, 0.9, 1.0);
          } else { // graviton
            col = new THREE.Color(0.85, 0.8, 1.0);
          }
          
          // ライフタイム計算（エネルギーに基づく）
          const kT = kB * temp;
          const x = E / kT;
          const baseLife = 8.0;
          let life = baseLife / Math.sqrt(x * 0.8 + 0.2);
          if (sp === 1) life *= 1.6;
          if (sp === 2) life *= 1.3;
          
          // 生成位置（イベントホライズン付近）
          const rsVisual = bhMesh.scale.x;
          const r0 = rsVisual * (1.01 + Math.random() * 0.08);
          const theta = Math.acos(1 - 2 * Math.random());
          const phi = Math.random() * Math.PI * 2;
          const sx = r0 * Math.sin(theta) * Math.cos(phi);
          const sy = r0 * Math.cos(theta);
          const sz = r0 * Math.sin(theta) * Math.sin(phi);
          
          const spawnPos = new THREE.Vector3(sx, sy, sz);
          const dirFromBH = spawnPos.clone().normalize();
          
          // APIから取得した速度ベクトルを使用
          const velVec = new THREE.Vector3(
            particle.velocity[0],
            particle.velocity[1],
            particle.velocity[2]
          );
          
          // パーティクル1: ブラックホールに落ちる（内側へ）
          const i1_3 = idx1 * 3;
          species[idx1] = sp;
          positions[i1_3+0] = sx;
          positions[i1_3+1] = sy;
          positions[i1_3+2] = sz;
          const velInward = dirFromBH.clone().multiplyScalar(-velVec.length() * 0.7);
          velocities[i1_3+0] = velInward.x;
          velocities[i1_3+1] = velInward.y;
          velocities[i1_3+2] = velInward.z;
          lifetimes[idx1] = life * 0.3;
          ages[idx1] = 0.0;
          temps[idx1] = temp;
          colors[i1_3+0] = col.r * 0.6;
          colors[i1_3+1] = col.g * 0.6;
          colors[i1_3+2] = col.b * 0.6;
          
          // パーティクル2: 外側に放射される
          const i2_3 = idx2 * 3;
          species[idx2] = sp;
          positions[i2_3+0] = sx;
          positions[i2_3+1] = sy;
          positions[i2_3+2] = sz;
          velocities[i2_3+0] = velVec.x;
          velocities[i2_3+1] = velVec.y;
          velocities[i2_3+2] = velVec.z;
          lifetimes[idx2] = life;
          ages[idx2] = 0.0;
          temps[idx2] = temp;
          colors[i2_3+0] = col.r;
          colors[i2_3+1] = col.g;
          colors[i2_3+2] = col.b;
          
          // Speciesバッファも更新
          if (particleGeo.attributes.aSpecies) {
            particleGeo.attributes.aSpecies.array[idx1] = sp;
            particleGeo.attributes.aSpecies.array[idx2] = sp;
            particleGeo.attributes.aSpecies.needsUpdate = true;
          }
        }
        
        if (pairsToCreate > 0) {
          needsBufferUpdate = true;
          lastSpawnTime = currentTime; // パーティクル生成成功時に時刻を更新
          return; // 量子揺らぎAPIを使用してパーティクルを生成した場合はここで終了
        }
        // パーティクルが生成されなかった場合はフォールバックに続行
      } else {
        // APIからのデータが空の場合はフォールバックに続行
      }
    } catch (error) {
      console.warn('Quantum pair generation failed, falling back to standard method:', error);
      // エラーが続く場合は一時的に無効化
      if (error.message && error.message.includes('Failed to fetch')) {
        useQuantumPairGeneration = false;
      }
      // エラー時はフォールバックに続行
    }
  }
  
  // フォールバック: 従来の方法（APIを使わない、または間隔が短い場合、またはAPIが失敗した場合）
  // この部分は常に実行される（APIが成功した場合は上でreturnされる）
  const spawnData = await fetchSpawnRate(BH_Mass_solar, rateUI);
  const rate = spawnData.spawn_rate_per_second;
  
  // 温度もAPIから取得
  const metrics = await fetchBlackHoleMetrics(BH_Mass_solar);
  const temp = metrics.hawking_temperature_K;
  
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
  if(orthoCamera){
    const viewSize = 50;
    orthoCamera.left = -viewSize * (innerWidth/innerHeight);
    orthoCamera.right = viewSize * (innerWidth/innerHeight);
    orthoCamera.top = viewSize;
    orthoCamera.bottom = -viewSize;
    orthoCamera.updateProjectionMatrix();
  }
  if (rt){
    rt.setSize(innerWidth, innerHeight);
    lensMaterial.uniforms.uResolution.value.set(innerWidth, innerHeight);
  }
});

// ---------- UI ----------
async function syncMassInputs(from){
  if (from==='slider'){ massNumber.value = parseFloat(massSlider.value); }
  if (from==='number'){ massSlider.value = parseFloat(massNumber.value); }
  BH_Mass_solar = parseFloat(massSlider.value);
  await updateBHScale();
  await updateMetrics();
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

// 粒子サイズの更新
function updateParticleSizes() {
  if (particleMat && particleMat.uniforms.uPointSizes) {
    particleMat.uniforms.uPointSizes.value.set(
      parseFloat(sizePhoton.value),
      parseFloat(sizeNeutrino.value),
      parseFloat(sizeGraviton.value)
    );
  }
}

sizePhoton.addEventListener('input', ()=>{
  const val = parseFloat(sizePhoton.value);
  sizePhotonLabel.textContent = val;
  updateParticleSizes();
});

sizeNeutrino.addEventListener('input', ()=>{
  const val = parseFloat(sizeNeutrino.value);
  sizeNeutrinoLabel.textContent = val;
  updateParticleSizes();
});

sizeGraviton.addEventListener('input', ()=>{
  const val = parseFloat(sizeGraviton.value);
  sizeGravitonLabel.textContent = val;
  updateParticleSizes();
});

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
pauseBtn.addEventListener('click', ()=>{ paused=!paused; pauseBtn.textContent = paused? '再開' : '一時停止'; });
screenshotBtn.addEventListener('click', ()=>{ const dataURL = renderer.domElement.toDataURL('image/png'); const a=document.createElement('a'); a.href=dataURL; a.download='hawking-sim.png'; a.click(); });

// ---------- フォトンショット発射機能（派手なビーム表示） ----------
let currentPhotonBeams = []; // 複数のビームを管理
const PHOTON_BEAM_LIFETIME = 2.5; // 2.5秒で消える（より長く見えるように）

// 四方八方の方向を定義（14方向：6軸方向 + 8対角線方向）
function getAllDirections() {
  const directions = [];
  
  // 6軸方向（±X, ±Y, ±Z）
  directions.push(new THREE.Vector3(1, 0, 0));   // +X
  directions.push(new THREE.Vector3(-1, 0, 0));  // -X
  directions.push(new THREE.Vector3(0, 1, 0));   // +Y
  directions.push(new THREE.Vector3(0, -1, 0));  // -Y
  directions.push(new THREE.Vector3(0, 0, 1));   // +Z
  directions.push(new THREE.Vector3(0, 0, -1)); // -Z
  
  // 8対角線方向（立方体の頂点方向）
  const sqrt3 = 1 / Math.sqrt(3);
  directions.push(new THREE.Vector3(sqrt3, sqrt3, sqrt3));
  directions.push(new THREE.Vector3(-sqrt3, sqrt3, sqrt3));
  directions.push(new THREE.Vector3(sqrt3, -sqrt3, sqrt3));
  directions.push(new THREE.Vector3(sqrt3, sqrt3, -sqrt3));
  directions.push(new THREE.Vector3(-sqrt3, -sqrt3, sqrt3));
  directions.push(new THREE.Vector3(-sqrt3, sqrt3, -sqrt3));
  directions.push(new THREE.Vector3(sqrt3, -sqrt3, -sqrt3));
  directions.push(new THREE.Vector3(-sqrt3, -sqrt3, -sqrt3));
  
  return directions;
}

function firePhotonShot() {
  // ボタンの派手なアニメーション効果
  photonShotBtn.style.transform = 'scale(0.85)';
  photonShotBtn.style.boxShadow = '0 0 50px rgba(0,212,255,.8), 0 0 100px rgba(0,153,255,.6)';
  setTimeout(() => {
    photonShotBtn.style.transform = '';
    photonShotBtn.style.boxShadow = '';
  }, 150);
  
  // 既存のビームがあれば削除
  currentPhotonBeams.forEach(beamData => {
    if (beamData && beamData.beam) {
      scene.remove(beamData.beam);
      beamData.beam.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material && child.material.dispose) child.material.dispose();
      });
    }
  });
  currentPhotonBeams = [];
  
  // 四方八方の方向を取得
  const directions = getAllDirections();
  const startDistance = 50; // ブラックホールから離れた位置（十分に遠い距離）
  
  // 各方向からフォトンを発射
  directions.forEach((dir, index) => {
    // ブラックホールの中心（原点）から離れた位置の14箇所から発射
    const startPos = dir.clone().multiplyScalar(startDistance);
    
    // ブラックホールの中心（原点）に向かう方向
    const bhCenter = new THREE.Vector3(0, 0, 0);
    const direction = bhCenter.clone().sub(startPos).normalize();
    
    // フォトンの軌道を計算して超派手なビームで表示
    const beam = createPhotonBeam(startPos, direction, index);
    if (beam) {
      currentPhotonBeams.push({
        beam: beam,
        age: 0
      });
    }
  });
}

function createPhotonBeam(startPos, direction, beamIndex = 0) {
  const points = [];
  const steps = 400; // より多くのステップで滑らかに
  const stepSize = 0.25;
  
  let pos = startPos.clone();
  let vel = direction.clone().normalize().multiplyScalar(stepSize * 150); // より速く
  
  const rsVisual = bhMesh.scale.x;
  const Gvis = 4.0 * rsVisual;
  const soft = rsVisual * rsVisual * 0.4 + 0.04;
  
  let absorbed = false;
  
  for (let i = 0; i < steps; i++) {
    points.push(pos.x, pos.y, pos.z);
    
    // ブラックホールからの距離
    const r2 = pos.x * pos.x + pos.y * pos.y + pos.z * pos.z;
    const r = Math.sqrt(r2) + 1e-6;
    
    // 事象の地平線に到達したら、そこから先は吸い込まれる
    if (r < rsVisual * 1.05) {
      // ブラックホールの中心に向かって吸い込まれる様子を表現
      const toCenter = new THREE.Vector3(-pos.x, -pos.y, -pos.z).normalize();
      const fallSpeed = (rsVisual * 1.05 - r) * 5.0; // 落下速度を加速
      
      // さらに数点追加してブラックホールに落ちていく様子を描画
      for (let fall = 0; fall < 10; fall++) {
        pos.add(toCenter.clone().multiplyScalar(fallSpeed * 0.1));
        const rAfter = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
        if (rAfter < rsVisual * 0.3) {
          // 完全に吸い込まれた
          absorbed = true;
          break;
        }
        points.push(pos.x, pos.y, pos.z);
      }
      absorbed = true;
      break;
    }
    
    // 重力による曲がり（光の経路の曲がり）
    // ブラックホールに近づくほど強く曲がる
    const accMag = -Gvis / (r2 + soft);
    const invR = 1.0 / r;
    const ax = accMag * pos.x * invR;
    const ay = accMag * pos.y * invR;
    const az = accMag * pos.z * invR;
    
    // 速度の方向を更新（重力の影響）
    // ブラックホールに近いほど強く引き寄せられる
    const pullStrength = 1.0 + (rsVisual / r) * 2.0; // 距離に応じて強度を増加
    vel.x += ax * stepSize * 0.15 * pullStrength;
    vel.y += ay * stepSize * 0.15 * pullStrength;
    vel.z += az * stepSize * 0.15 * pullStrength;
    
    // 速度を正規化（光速を保つ）
    vel.normalize().multiplyScalar(stepSize * 150);
    
    // 位置を更新
    pos.add(vel.clone().multiplyScalar(stepSize));
    
    // 遠くに離れたら停止（ブラックホールから離れていく場合）
    if (r > 200 && vel.dot(new THREE.Vector3(pos.x, pos.y, pos.z).normalize()) > 0) {
      break;
    }
  }
  
  const beamGroup = new THREE.Group();
  
  // 距離に応じた色と太さの計算（ブラックホールに近づくほど赤く、細く）
  const colors = [];
  const widths = [];
  
  for (let i = 0; i < points.length / 3; i++) {
    const px = points[i * 3];
    const py = points[i * 3 + 1];
    const pz = points[i * 3 + 2];
    const r = Math.sqrt(px * px + py * py + pz * pz);
    
    // ブラックホールに近づくほど赤く変化（ドップラー効果的な表現）
    const distFactor = Math.min(1.0, r / (rsVisual * 10));
    const redIntensity = 1.0 - distFactor; // 近いほど赤い
    const color = new THREE.Color().lerpColors(
      new THREE.Color(0x00ffff), // シアン（遠い）
      new THREE.Color(0xff4400), // オレンジ/赤（近い）
      redIntensity
    );
    colors.push(color.r, color.g, color.b);
    
    // ブラックホールに近づくほど細くなる（速度が上がる表現）
    const width = 0.3 + distFactor * 0.7; // 近いほど細い
    widths.push(width);
  }
  
  // 超太いコアビーム（5本重ねてより派手に）
  for (let core = 0; core < 5; core++) {
    const coreGeometry = new THREE.BufferGeometry();
    coreGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    
    // 距離に応じた色を適用
    const coreColors = [];
    for (let i = 0; i < colors.length; i += 3) {
      const factor = core === 0 ? 1.0 : (0.7 - core * 0.15);
      coreColors.push(colors[i] * factor, colors[i + 1] * factor, colors[i + 2] * factor);
    }
    coreGeometry.setAttribute('color', new THREE.Float32BufferAttribute(coreColors, 3));
    
    const coreMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: core === 0 ? 1.0 : (0.7 - core * 0.15),
      linewidth: core === 0 ? 8 : (6 - core * 1)
    });
    const coreLine = new THREE.Line(coreGeometry, coreMaterial);
    beamGroup.add(coreLine);
  }
  
  // 外側のグローライン（10本でより派手に）
  for (let i = 0; i < 10; i++) {
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    
    // 距離に応じた色を適用（グローはより控えめに）
    const glowColors = [];
    const hue = (i / 10) * 0.3;
    const baseColor = new THREE.Color().setHSL(0.5 + hue, 1.0, 0.5 + i * 0.05);
    for (let j = 0; j < colors.length; j += 3) {
      const distColor = new THREE.Color(colors[j], colors[j + 1], colors[j + 2]);
      const blended = baseColor.clone().lerp(distColor, 0.5).multiplyScalar(0.6 - i * 0.05);
      glowColors.push(blended.r, blended.g, blended.b);
    }
    glowGeometry.setAttribute('color', new THREE.Float32BufferAttribute(glowColors, 3));
    
    const glowMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.6 - i * 0.05,
      linewidth: 2
    });
    const glowLine = new THREE.Line(glowGeometry, glowMaterial);
    beamGroup.add(glowLine);
  }
  
  // 発射点のエフェクトは削除（リングとパーティクルを削除）
  
  scene.add(beamGroup);
  
  return beamGroup;
}

photonShotBtn.addEventListener('click', firePhotonShot);

// ---------- ブラックホール蒸発機能 ----------
function startEvaporation() {
  if (isEvaporating) return;
  
  isEvaporating = true;
  lastEvaporationTime = performance.now();
  
  // UI更新
  evaporateBtn.style.display = 'none';
  stopEvaporateBtn.style.display = 'flex';
  evaporateBtn.classList.add('evaporating');
  
  // 蒸発ループを開始
  evaporationLoop();
}

function stopEvaporation() {
  if (!isEvaporating) return;
  
  isEvaporating = false;
  cameraShakeIntensity = 0;
  
  // UI更新
  evaporateBtn.style.display = 'flex';
  stopEvaporateBtn.style.display = 'none';
  evaporateBtn.classList.remove('evaporating');
  
  // 質量がほぼ0になったら爆発エフェクト
  if (BH_Mass_solar <= 0.001) {
    createExplosionEffect();
    bhMesh.visible = false;
    horizonHalo.visible = false;
    alert('ブラックホールが完全に蒸発しました！');
  }
}

function evaporationLoop() {
  if (!isEvaporating) return;
  
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastEvaporationTime) * 0.001);
  lastEvaporationTime = now;
  
  // 質量を減少（100倍速度）
  BH_Mass_solar -= evaporationRate * dt;
  
  // 質量が0以下にならないように
  if (BH_Mass_solar <= 0.001) {
    stopEvaporation();
    return;
  }
  
  // 質量をkg単位に更新
  BH_Mass_kg = BH_Mass_solar * M_sun;
  
  // UI更新
  massSlider.value = BH_Mass_solar;
  massNumber.value = BH_Mass_solar;
  
  // 物理量の更新
  updateBHScale().catch(err => console.warn('updateBHScale error:', err));
  updateMetrics().catch(err => console.warn('updateMetrics error:', err));
  
  // 視覚効果: 追加パーティクル生成
  spawnAdditionalParticles();
  
  // カメラシェイク
  const massRatio = BH_Mass_solar / 10.0; // 初期質量10に対する比率
  cameraShakeIntensity = Math.max(0, 0.3 * (1.0 - massRatio));
  
  requestAnimationFrame(evaporationLoop);
}

function spawnAdditionalParticles() {
  // 蒸発中は通常より多くのパーティクルを生成
  const tempK = hawkingTemperature(BH_Mass_kg);
  const additionalCount = 5; // 一度に生成する追加パーティクル数
  
  let spawned = 0;
  let idx1 = -1, idx2 = -1;
  
  for (let i = 0; i < MAX_PARTICLES && spawned < additionalCount; i++) {
    if (ages[i] >= lifetimes[i]) {
      if (idx1 === -1) {
        idx1 = i;
      } else {
        idx2 = i;
        spawnParticlePair(idx1, idx2, tempK);
        spawned++;
        idx1 = -1;
        idx2 = -1;
      }
    }
  }
  
  if (spawned > 0) {
    needsBufferUpdate = true;
  }
}

function createExplosionEffect() {
  // 大量の高エネルギーパーティクルを生成
  const tempK = 1e10; // 非常に高温
  const explosionParticles = 500;
  
  let spawned = 0;
  let idx1 = -1, idx2 = -1;
  
  for (let i = 0; i < MAX_PARTICLES && spawned < explosionParticles; i++) {
    if (ages[i] >= lifetimes[i]) {
      if (idx1 === -1) {
        idx1 = i;
      } else {
        idx2 = i;
        
        // 爆発パーティクルを生成（通常のspawnParticlePairを使用）
        spawnParticlePair(idx1, idx2, tempK);
        
        // 爆発用に速度を大幅に増加
        const i1_3 = idx1 * 3;
        const i2_3 = idx2 * 3;
        const explosionSpeed = 15.0; // 通常よりはるかに速い
        
        // ランダムな方向に高速で飛ばす
        const dir1 = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        const dir2 = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5
        ).normalize();
        
        velocities[i1_3 + 0] = dir1.x * explosionSpeed;
        velocities[i1_3 + 1] = dir1.y * explosionSpeed;
        velocities[i1_3 + 2] = dir1.z * explosionSpeed;
        
        velocities[i2_3 + 0] = dir2.x * explosionSpeed;
        velocities[i2_3 + 1] = dir2.y * explosionSpeed;
        velocities[i2_3 + 2] = dir2.z * explosionSpeed;
        
        // 寿命を長くする
        lifetimes[idx1] = 10.0;
        lifetimes[idx2] = 10.0;
        
        spawned++;
        idx1 = -1;
        idx2 = -1;
      }
    }
  }
  
  needsBufferUpdate = true;
}

// イベントリスナー
evaporateBtn.addEventListener('click', () => {
  if (!isEvaporating) {
    startEvaporation();
  }
});

stopEvaporateBtn.addEventListener('click', () => {
  if (isEvaporating) {
    stopEvaporation();
  }
});

// ---------- 一気蒸発機能 ----------
function startInstantEvaporation() {
  if (isInstantEvaporating || isEvaporating) return;
  
  isInstantEvaporating = true;
  instantEvaporateBtn.disabled = true;
  instantEvaporateBtn.style.opacity = '0.5';
  
  // 一気蒸発ループ（非常に高速で質量を減少）
  instantEvaporationLoop();
}

function instantEvaporationLoop() {
  if (!isInstantEvaporating) return;
  
  const now = performance.now();
  const dt = Math.min(0.05, (now - (lastEvaporationTime || now)) * 0.001);
  lastEvaporationTime = now;
  
  // 超高速で質量を減少（500倍速度）
  const instantRate = evaporationRate * 500; // 通常の500倍
  BH_Mass_solar -= instantRate * dt;
  
  // 質量をkg単位に更新
  BH_Mass_kg = BH_Mass_solar * M_sun;
  
  // UI更新
  massSlider.value = Math.max(0.001, BH_Mass_solar);
  massNumber.value = Math.max(0.001, BH_Mass_solar);
  
  // 物理量の更新
  updateBHScale().catch(err => console.warn('updateBHScale error:', err));
  updateMetrics().catch(err => console.warn('updateMetrics error:', err));
  
  // 大量のパーティクルを生成（視覚効果）
  spawnMassiveParticles();
  
  // 激しいカメラシェイク
  const massRatio = BH_Mass_solar / 10.0;
  cameraShakeIntensity = Math.max(0, 1.0 * (1.0 - massRatio)); // より強いシェイク
  
  // 質量がほぼ0になったら大爆発
  if (BH_Mass_solar <= 0.001) {
    finishInstantEvaporation();
    return;
  }
  
  requestAnimationFrame(instantEvaporationLoop);
}

function spawnMassiveParticles() {
  // 一気蒸発中は大量のパーティクルを生成
  const tempK = hawkingTemperature(BH_Mass_kg);
  const massiveCount = 20; // 一度に生成する大量のパーティクル
  
  let spawned = 0;
  let idx1 = -1, idx2 = -1;
  
  for (let i = 0; i < MAX_PARTICLES && spawned < massiveCount; i++) {
    if (ages[i] >= lifetimes[i]) {
      if (idx1 === -1) {
        idx1 = i;
      } else {
        idx2 = i;
        spawnParticlePair(idx1, idx2, tempK);
        
        // 一気蒸発用に速度を大幅に増加
        const i1_3 = idx1 * 3;
        const i2_3 = idx2 * 3;
        const speedMultiplier = 3.0; // 通常より3倍速い
        
        velocities[i1_3 + 0] *= speedMultiplier;
        velocities[i1_3 + 1] *= speedMultiplier;
        velocities[i1_3 + 2] *= speedMultiplier;
        velocities[i2_3 + 0] *= speedMultiplier;
        velocities[i2_3 + 1] *= speedMultiplier;
        velocities[i2_3 + 2] *= speedMultiplier;
        
        spawned++;
        idx1 = -1;
        idx2 = -1;
      }
    }
  }
  
  if (spawned > 0) {
    needsBufferUpdate = true;
  }
}

function finishInstantEvaporation() {
  isInstantEvaporating = false;
  cameraShakeIntensity = 0;
  
  // ブラックホールを非表示
  bhMesh.visible = false;
  horizonHalo.visible = false;
  
  // 超巨大な爆発エフェクト
  createMassiveExplosion();
  
  // ボタンをリセット
  instantEvaporateBtn.disabled = false;
  instantEvaporateBtn.style.opacity = '0.9';
  
  // 質量を0に設定
  BH_Mass_solar = 0.001;
  BH_Mass_kg = BH_Mass_solar * M_sun;
  massSlider.value = BH_Mass_solar;
  massNumber.value = BH_Mass_solar;
  updateBHScale().catch(err => console.warn('updateBHScale error:', err));
  updateMetrics().catch(err => console.warn('updateMetrics error:', err));
}

function createMassiveExplosion() {
  // 超巨大な爆発エフェクト - 全方向にエネルギーを放出
  const tempK = 1e12; // 極めて高温
  const explosionParticles = 2000; // 大量のパーティクル
  
  let spawned = 0;
  let idx1 = -1, idx2 = -1;
  
  for (let i = 0; i < MAX_PARTICLES && spawned < explosionParticles; i++) {
    if (ages[i] >= lifetimes[i]) {
      if (idx1 === -1) {
        idx1 = i;
      } else {
        idx2 = i;
        
        // 爆発パーティクルを生成
        spawnParticlePair(idx1, idx2, tempK);
        
        // 爆発用に超高速で全方向に飛ばす
        const i1_3 = idx1 * 3;
        const i2_3 = idx2 * 3;
        const explosionSpeed = 30.0; // 超高速
        
        // ランダムな方向に超高速で飛ばす
        const dir1 = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize();
        const dir2 = new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2
        ).normalize();
        
        velocities[i1_3 + 0] = dir1.x * explosionSpeed;
        velocities[i1_3 + 1] = dir1.y * explosionSpeed;
        velocities[i1_3 + 2] = dir1.z * explosionSpeed;
        
        velocities[i2_3 + 0] = dir2.x * explosionSpeed;
        velocities[i2_3 + 1] = dir2.y * explosionSpeed;
        velocities[i2_3 + 2] = dir2.z * explosionSpeed;
        
        // 寿命を長くする（長時間見えるように）
        lifetimes[idx1] = 15.0;
        lifetimes[idx2] = 15.0;
        
        // 明るい色にする
        colors[i1_3 + 0] = Math.min(1.0, colors[i1_3 + 0] * 2.0);
        colors[i1_3 + 1] = Math.min(1.0, colors[i1_3 + 1] * 2.0);
        colors[i1_3 + 2] = Math.min(1.0, colors[i1_3 + 2] * 2.0);
        colors[i2_3 + 0] = Math.min(1.0, colors[i2_3 + 0] * 2.0);
        colors[i2_3 + 1] = Math.min(1.0, colors[i2_3 + 1] * 2.0);
        colors[i2_3 + 2] = Math.min(1.0, colors[i2_3 + 2] * 2.0);
        
        spawned++;
        idx1 = -1;
        idx2 = -1;
      }
    }
  }
  
  needsBufferUpdate = true;
}

// 一気蒸発ボタンのイベントリスナー
instantEvaporateBtn.addEventListener('click', () => {
  if (!isInstantEvaporating && !isEvaporating) {
    startInstantEvaporation();
  }
});

// ---------- カメラ操作（キーボード + UIボタン） ----------
const CAMERA_MOVE_SPEED = 2.0;
const CAMERA_ROTATE_SPEED = 0.05;
const CAMERA_ZOOM_SPEED = 2.0;

// カメラを移動（パン）
function moveCamera(direction) {
  if (!camera || !controls || isCrossSectionMode) return;
  
  const moveVector = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  
  camera.getWorldDirection(new THREE.Vector3().negate()); // forward
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  
  switch(direction) {
    case 'up':
      moveVector.copy(up).multiplyScalar(CAMERA_MOVE_SPEED);
      break;
    case 'down':
      moveVector.copy(up).multiplyScalar(-CAMERA_MOVE_SPEED);
      break;
    case 'left':
      moveVector.copy(right).multiplyScalar(-CAMERA_MOVE_SPEED);
      break;
    case 'right':
      moveVector.copy(right).multiplyScalar(CAMERA_MOVE_SPEED);
      break;
  }
  
  camera.position.add(moveVector);
  controls.target.add(moveVector);
  controls.update();
}

// カメラを回転
function rotateCamera(direction) {
  if (!camera || !controls || isCrossSectionMode) return;
  
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  right.setFromMatrixColumn(camera.matrixWorld, 0);
  up.setFromMatrixColumn(camera.matrixWorld, 1);
  
  const rotationAxis = new THREE.Vector3();
  let angle = CAMERA_ROTATE_SPEED;
  
  switch(direction) {
    case 'up':
      rotationAxis.copy(right);
      break;
    case 'down':
      rotationAxis.copy(right);
      angle = -angle;
      break;
    case 'left':
      rotationAxis.copy(up);
      break;
    case 'right':
      rotationAxis.copy(up);
      angle = -angle;
      break;
  }
  
  const quaternion = new THREE.Quaternion().setFromAxisAngle(rotationAxis, angle);
  const directionToTarget = controls.target.clone().sub(camera.position);
  directionToTarget.applyQuaternion(quaternion);
  controls.target.copy(camera.position).add(directionToTarget);
  controls.update();
}

// カメラをズーム
function zoomCamera(direction) {
  if (!camera || !controls || isCrossSectionMode) return;
  
  const directionVec = new THREE.Vector3();
  camera.getWorldDirection(directionVec);
  directionVec.negate();
  
  if (direction === 'in') {
    camera.position.add(directionVec.multiplyScalar(CAMERA_ZOOM_SPEED));
  } else {
    camera.position.add(directionVec.multiplyScalar(-CAMERA_ZOOM_SPEED));
  }
  
  controls.update();
}

// カメラをリセット
function resetCamera() {
  if (!camera || !controls || isCrossSectionMode) return;
  
  camera.position.set(0, 15, 42);
  controls.target.set(0, 0, 0);
  controls.update();
}

// UIボタンのイベントリスナー
cameraUp.addEventListener('click', () => moveCamera('up'));
cameraDown.addEventListener('click', () => moveCamera('down'));
cameraLeft.addEventListener('click', () => moveCamera('left'));
cameraRight.addEventListener('click', () => moveCamera('right'));
cameraCenter.addEventListener('click', resetCamera);
cameraZoomIn.addEventListener('click', () => zoomCamera('in'));
cameraZoomOut.addEventListener('click', () => zoomCamera('out'));

// 長押し対応
let cameraMoveInterval = null;
function startCameraMove(direction) {
  if (cameraMoveInterval) return;
  moveCamera(direction);
  cameraMoveInterval = setInterval(() => moveCamera(direction), 50);
}
function stopCameraMove() {
  if (cameraMoveInterval) {
    clearInterval(cameraMoveInterval);
    cameraMoveInterval = null;
  }
}

[cameraUp, cameraDown, cameraLeft, cameraRight].forEach((btn, index) => {
  const directions = ['up', 'down', 'left', 'right'];
  btn.addEventListener('mousedown', () => startCameraMove(directions[index]));
  btn.addEventListener('mouseup', stopCameraMove);
  btn.addEventListener('mouseleave', stopCameraMove);
});

let cameraZoomInterval = null;
function startCameraZoom(direction) {
  if (cameraZoomInterval) return;
  zoomCamera(direction);
  cameraZoomInterval = setInterval(() => zoomCamera(direction), 50);
}
function stopCameraZoom() {
  if (cameraZoomInterval) {
    clearInterval(cameraZoomInterval);
    cameraZoomInterval = null;
  }
}
cameraZoomIn.addEventListener('mousedown', () => startCameraZoom('in'));
cameraZoomIn.addEventListener('mouseup', stopCameraZoom);
cameraZoomIn.addEventListener('mouseleave', stopCameraZoom);
cameraZoomOut.addEventListener('mousedown', () => startCameraZoom('out'));
cameraZoomOut.addEventListener('mouseup', stopCameraZoom);
cameraZoomOut.addEventListener('mouseleave', stopCameraZoom);

// キーボードショートカット
const keysPressed = new Set();
document.addEventListener('keydown', (e) => {
  if (isCrossSectionMode) return; // 断面モードでは無効
  
  keysPressed.add(e.key.toLowerCase());
  
  // 修飾キー（Cmd, Option, Ctrl）を押しながらの操作
  const isModifierPressed = e.metaKey || e.altKey || e.ctrlKey;
  
  if (isModifierPressed) {
    switch(e.key.toLowerCase()) {
      case 'arrowup':
      case 'w':
        e.preventDefault();
        moveCamera('up');
        break;
      case 'arrowdown':
      case 's':
        e.preventDefault();
        moveCamera('down');
        break;
      case 'arrowleft':
      case 'a':
        e.preventDefault();
        moveCamera('left');
        break;
      case 'arrowright':
      case 'd':
        e.preventDefault();
        moveCamera('right');
        break;
      case '+':
      case '=':
        e.preventDefault();
        zoomCamera('in');
        break;
      case '-':
      case '_':
        e.preventDefault();
        zoomCamera('out');
        break;
    }
  }
  
  // 単独キーでの操作
  switch(e.key.toLowerCase()) {
    case 'r':
      resetCamera();
      break;
  }
});

document.addEventListener('keyup', (e) => {
  keysPressed.delete(e.key.toLowerCase());
});

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
  
  // フォトンビームのアニメーションとフェードアウト（複数ビーム対応）
  currentPhotonBeams = currentPhotonBeams.filter(beamData => {
    if (!beamData || !beamData.beam) return false;
    
    beamData.age += dt;
    const fade = 1.0 - (beamData.age / PHOTON_BEAM_LIFETIME);
    const time = now * 0.001;
    
    // ビームの各要素をアニメーション（リングとパーティクルは削除済み）
    beamData.beam.children.forEach((child, index) => {
      // ラインのフェードアウトとパルス
      if (child.material && child.material.opacity !== undefined) {
        const pulse = 1.0 + Math.sin(time * 15.0 + index + beamData.age * 10) * 0.2;
        child.material.opacity = Math.max(0, fade * pulse * (index < 5 ? 1.0 : (0.6 - (index - 5) * 0.05)));
      }
    });
    
    // 寿命が来たら削除
    if (beamData.age >= PHOTON_BEAM_LIFETIME) {
      scene.remove(beamData.beam);
      beamData.beam.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material && child.material.dispose) child.material.dispose();
      });
      return false; // フィルターで削除
    }
    
    return true; // 生きているビームは保持
  });

  // パーティクル数の変更を処理
  const desired = parseInt(maxParticles.value);
  if (desired !== MAX_PARTICLES){
    MAX_PARTICLES = desired; 
    allocBuffers(MAX_PARTICLES);
    needsBufferUpdate = true;
  }

  // パーティクルの更新
  if (!paused){ 
    // spawnParticlesは非同期なので、awaitなしで呼ぶ（Promiseはバックグラウンドで処理）
    // API呼び出し間隔の制御はspawnParticles内で行う
    spawnParticles(dt).catch(err => {
      console.warn('spawnParticles error:', err);
    });
    updateParticles(dt);
    updateParticleTrails(); // 軌跡の更新
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

  // 断面モードの更新
  updateCrossSectionView();

  // カメラシェイク（蒸発中）- レンダリング時のみ一時的に適用
  let cameraShakeOffset = null;
  if (cameraShakeIntensity > 0 && !isCrossSectionMode) {
    const shakeX = (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
    const shakeY = (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
    const shakeZ = (Math.random() - 0.5) * cameraShakeIntensity * 0.5;
    cameraShakeOffset = new THREE.Vector3(shakeX, shakeY, shakeZ);
    camera.position.add(cameraShakeOffset);
  }

  // render to RT then lens
  renderer.setRenderTarget(rt);
  
  // 断面モードの場合は正投影カメラを使用
  const activeCamera = isCrossSectionMode ? orthoCamera : camera;
  renderer.render(scene, activeCamera);
  
  renderer.setRenderTarget(null);
  
  // 断面モードでは重力レンズ効果を無効化
  if(!isCrossSectionMode){
    updateLensUniforms();
  }
  renderer.render(postScene, postCam);
  
  // カメラシェイクのオフセットを元に戻す
  if (cameraShakeOffset) {
    camera.position.sub(cameraShakeOffset);
  }
}
requestAnimationFrame(tick);

