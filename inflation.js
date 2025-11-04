import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// API設定
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8001'
  : 'https://hawking-sim-api.onrender.com';

// ---------- DOM要素 ----------
const canvas = document.getElementById('c');
const expansionCanvas = document.getElementById('expansionCanvas');
const densityCanvas = document.getElementById('densityCanvas');
const togglePanel = document.getElementById('togglePanel');
const controlPanel = document.getElementById('controlPanel');
const phiHandle = document.getElementById('phiHandle');
const velocityHandle = document.getElementById('velocityHandle');
const phiInput = document.getElementById('phiInput');
const velocityInput = document.getElementById('velocityInput');
const paramA = document.getElementById('paramA');
const paramB = document.getElementById('paramB');
const paramC = document.getElementById('paramC');
const paramALabel = document.getElementById('paramALabel');
const paramBLabel = document.getElementById('paramBLabel');
const paramCLabel = document.getElementById('paramCLabel');
const rhoThreshold = document.getElementById('rhoThreshold');
const rhoThresholdLabel = document.getElementById('rhoThresholdLabel');
const quantumFluctuation = document.getElementById('quantumFluctuation');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const phiValue = document.getElementById('phiValue');
const rhoValue = document.getElementById('rhoValue');
const hValue = document.getElementById('hValue');
const tempValue = document.getElementById('tempValue');

// 視覚的な誇張係数（先に定義）
const VISUAL_EXAGGERATION = {
  potentialHeight: 5.0,  // ポテンシャル地形の高さを5倍に
  particleSize: 3.0,     // パーティクルサイズを3倍に
  densityScale: 100.0,   // 密度の視覚化を100倍に
  expansionScale: 2.0     // 膨張の視覚的スケールを2倍に
};

// ---------- Three.jsシーン設定 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);

// カメラとレンダラーの初期化（DOMが読み込まれた後）
function initThreeJS() {
  if (!canvas) {
    console.error('Canvas element not found');
    return;
  }
  
  const width = canvas.clientWidth || window.innerWidth * 0.85;
  const height = canvas.clientHeight || window.innerHeight - 50;
  
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
  camera.position.set(3, 4, 6);
  camera.lookAt(0, 0, 0);
  
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);
  controls.enablePan = true;
  controls.enableZoom = true;
  
  // ライティング
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(10, 10, 10);
  scene.add(dirLight);
  
  const ambLight = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambLight);
  
  return { camera, renderer, controls };
}

// グローバル変数として保持
let camera, renderer, controls;
let cameraTarget = new THREE.Vector3(0, 0, 0); // カメラのターゲット（滑らかに移動）
let autoFollowBall = true; // ボールを自動追従するか

// ---------- ポテンシャル地形のメッシュ ----------
let potentialMesh = null;
let phiBall = null; // φの現在位置を示すボール
let phiTrail = null; // φの軌跡
let energyParticles = []; // エネルギー密度を表現するパーティクル
let explosionEffect = null; // インフレーション発動時の爆発エフェクト

function createPotentialMesh(A, B, C) {
  if (potentialMesh) {
    scene.remove(potentialMesh);
    potentialMesh.geometry.dispose();
    potentialMesh.material.dispose();
  }

  const width = 100;
  const height = 100;
  const geometry = new THREE.PlaneGeometry(4, 4, width, height);
  const positions = geometry.attributes.position;
  
  // ポテンシャル関数 V(φ) = A * (φ² - B²)² + C
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const phi = x; // 水平方向がφ軸
    const V = A * Math.pow(phi * phi - B * B, 2) + C;
    const y = V * VISUAL_EXAGGERATION.potentialHeight; // 高さを誇張
    positions.setY(i, y);
  }
  
  geometry.computeVertexNormals();
  
  // グラデーションカラーマップ（低いほど青、高いほど赤）
  const colors = [];
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i);
    const normalizedY = (y + 0.5) / 2.0; // 0-1に正規化
    const color = new THREE.Color();
    color.lerpColors(
      new THREE.Color(0x0099ff), // 青（低エネルギー）
      new THREE.Color(0xff4400), // 赤（高エネルギー）
      normalizedY
    );
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    wireframe: false,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    shininess: 100,
    specular: new THREE.Color(0xffffff)
  });
  
  potentialMesh = new THREE.Mesh(geometry, material);
  potentialMesh.rotation.x = -Math.PI / 2;
  scene.add(potentialMesh);
  
  // ワイヤーフレームも追加（輪郭を強調）
  const wireframeMaterial = new THREE.LineBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.2,
    linewidth: 1
  });
  const wireframe = new THREE.LineSegments(
    new THREE.WireframeGeometry(geometry),
    wireframeMaterial
  );
  wireframe.rotation.x = -Math.PI / 2;
  scene.add(wireframe);
  
  // グリッドヘルパーを追加（既存のものを削除）
  const existingGrid = scene.children.find(child => child.type === 'GridHelper');
  if (existingGrid) {
    scene.remove(existingGrid);
  }
  const gridHelper = new THREE.GridHelper(4, 20, 0x444444, 0x222222);
  gridHelper.position.y = -0.5;
  scene.add(gridHelper);
  
  console.log('Potential mesh created:', potentialMesh);
}

// ---------- φボールの作成 ----------
function createPhiBall() {
  if (phiBall) {
    scene.remove(phiBall);
    // Groupの場合は子要素を削除
    if (phiBall.children) {
      phiBall.children.forEach(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
    } else {
      if (phiBall.geometry) phiBall.geometry.dispose();
      if (phiBall.material) phiBall.material.dispose();
    }
  }
  
  const geometry = new THREE.SphereGeometry(0.25 * VISUAL_EXAGGERATION.particleSize, 32, 32);
  const material = new THREE.MeshPhongMaterial({
    color: 0x00d4ff,
    emissive: 0x0044aa,
    emissiveIntensity: 1.0,  // グローを強く
    transparent: true,
    opacity: 0.95
  });
  
  // グローエフェクト用の外側の球
  const glowGeometry = new THREE.SphereGeometry(0.3 * VISUAL_EXAGGERATION.particleSize, 16, 16);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.3,
    side: THREE.BackSide
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  phiBall = new THREE.Group();
  phiBall.add(new THREE.Mesh(geometry, material));
  phiBall.add(glow);
  
  // エネルギーパーティクルを追加（ボールの周りに）
  const particleCount = 20;
  for (let i = 0; i < particleCount; i++) {
    const particleGeometry = new THREE.SphereGeometry(0.05, 8, 8);
    const particleMaterial = new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.6
    });
    const particle = new THREE.Mesh(particleGeometry, particleMaterial);
    particle.userData = {
      angle: (Math.PI * 2 / particleCount) * i,
      radius: 0.5,
      speed: 0.02 + Math.random() * 0.03
    };
    phiBall.add(particle);
  }
  
  scene.add(phiBall);
  
  // 軌跡のライン
  const trailGeometry = new THREE.BufferGeometry();
  const trailMaterial = new THREE.LineBasicMaterial({
    color: 0x00d4ff,
    transparent: true,
    opacity: 0.6,
    linewidth: 2
  });
  phiTrail = new THREE.Line(trailGeometry, trailMaterial);
  scene.add(phiTrail);
}

// ---------- 空間膨張の可視化（2D Canvas） ----------
const expansionCtx = expansionCanvas.getContext('2d');
expansionCanvas.width = expansionCanvas.clientWidth;
expansionCanvas.height = expansionCanvas.clientHeight;

let expansionParticles = [];
const EXPANSION_PARTICLE_COUNT = 200;

function initExpansionParticles() {
  expansionParticles = [];
  for (let i = 0; i < EXPANSION_PARTICLE_COUNT; i++) {
    expansionParticles.push({
      x: Math.random() * expansionCanvas.width,
      y: Math.random() * expansionCanvas.height,
      baseX: Math.random() * expansionCanvas.width,
      baseY: Math.random() * expansionCanvas.height,
      size: (2 + Math.random() * 3) * VISUAL_EXAGGERATION.particleSize
    });
  }
}

function drawExpansion(expansionFactor) {
  expansionCtx.fillStyle = 'rgba(5, 7, 11, 0.5)';
  expansionCtx.fillRect(0, 0, expansionCanvas.width, expansionCanvas.height);
  
  const centerX = expansionCanvas.width / 2;
  const centerY = expansionCanvas.height / 2;
  
  // 誇張された膨張因子
  const visualExpansion = 1.0 + (expansionFactor - 1.0) * VISUAL_EXAGGERATION.expansionScale;
  
  expansionParticles.forEach(particle => {
    const dx = particle.baseX - centerX;
    const dy = particle.baseY - centerY;
    particle.x = centerX + dx * visualExpansion;
    particle.y = centerY + dy * visualExpansion;
    
    const distance = Math.sqrt(dx * dx + dy * dy) * visualExpansion;
    const alpha = Math.max(0.5, 1.0 - distance / (expansionCanvas.width * 0.4));
    
    // 膨張に応じて色を変化（青→白→黄→赤）
    const colorIntensity = Math.min(1.0, visualExpansion / 5.0);
    const r = Math.floor(255 * colorIntensity);
    const g = Math.floor(255 * (1.0 - colorIntensity * 0.5));
    const b = Math.floor(255 * (1.0 - colorIntensity));
    
    expansionCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    expansionCtx.beginPath();
    expansionCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    expansionCtx.fill();
    
    // グローエフェクト
    const gradient = expansionCtx.createRadialGradient(
      particle.x, particle.y, 0,
      particle.x, particle.y, particle.size * 2
    );
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.5})`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    expansionCtx.fillStyle = gradient;
    expansionCtx.fillRect(particle.x - particle.size * 2, particle.y - particle.size * 2, particle.size * 4, particle.size * 4);
  });
}

// ---------- 密度フィールドの可視化（2D Canvas） ----------
const densityCtx = densityCanvas.getContext('2d');
densityCanvas.width = densityCanvas.clientWidth;
densityCanvas.height = densityCanvas.clientHeight;

const DENSITY_GRID_SIZE = 30;
let densityGrid = [];

function initDensityGrid() {
  densityGrid = [];
  for (let y = 0; y < DENSITY_GRID_SIZE; y++) {
    densityGrid[y] = [];
    for (let x = 0; x < DENSITY_GRID_SIZE; x++) {
      densityGrid[y][x] = 0.0;
    }
  }
}

function drawDensityField(rho, rhoThreshold) {
  densityCtx.fillStyle = 'rgba(5, 7, 11, 0.3)';
  densityCtx.fillRect(0, 0, densityCanvas.width, densityCanvas.height);
  
  const cellWidth = densityCanvas.width / DENSITY_GRID_SIZE;
  const cellHeight = densityCanvas.height / DENSITY_GRID_SIZE;
  
  // 密度をグリッドに反映（誇張）
  const normalizedRho = Math.min(1.0, (rho * VISUAL_EXAGGERATION.densityScale) / rhoThreshold);
  
  for (let y = 0; y < DENSITY_GRID_SIZE; y++) {
    for (let x = 0; x < DENSITY_GRID_SIZE; x++) {
      const localDensity = normalizedRho * (0.8 + Math.random() * 0.4);
      const intensity = Math.min(1.0, localDensity);
      
      // 色を計算（低密度=青、高密度=赤）
      const r = intensity * 255;
      const b = (1.0 - intensity) * 255;
      const g = intensity * 128;
      
      densityCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.7 + intensity * 0.3})`;
      densityCtx.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
      
      // パーティクルを描画（密度が高いほど多い、サイズも大きい）
      if (intensity > 0.1) {
        const particleCount = Math.floor(intensity * 10 * VISUAL_EXAGGERATION.particleSize);
        const particleSize = 1 + intensity * 2;
        for (let p = 0; p < particleCount; p++) {
          const px = x * cellWidth + Math.random() * cellWidth;
          const py = y * cellHeight + Math.random() * cellHeight;
          densityCtx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.8})`;
          densityCtx.beginPath();
          densityCtx.arc(px, py, particleSize, 0, Math.PI * 2);
          densityCtx.fill();
        }
      }
    }
  }
  
  // 閾値ラインを表示（太く、点滅）
  if (normalizedRho >= 0.8) {
    const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.005);
    densityCtx.strokeStyle = `rgba(255, 68, 0, ${0.8 * pulse})`;
    densityCtx.lineWidth = 5;
    densityCtx.beginPath();
    densityCtx.moveTo(0, 0);
    densityCtx.lineTo(densityCanvas.width, densityCanvas.height);
    densityCtx.moveTo(densityCanvas.width, 0);
    densityCtx.lineTo(0, densityCanvas.height);
    densityCtx.stroke();
  }
}

// ---------- シミュレーション状態 ----------
// 視覚的にわかりやすくするため、初期値を調整（閾値に近い値）
let simulationState = {
  phi: 0.25,  // より大きな初期値（B=0.2に近い）
  dphi: 0.02, // 初期速度を追加して動きを生む
  rho: 0.0,
  H: 0.0,
  T: 0.0,
  expansion: 1.0,
  time: 0.0,
  isRunning: false,
  isPaused: false,
  trajectory: []
};

let simulationParams = {
  A: 1.2,
  B: 0.2,
  C: 0.1,
  rhoThreshold: 0.05,  // 閾値を大きくして視覚的にわかりやすく（1e-4 → 0.05）
  quantumFluctuation: true,
  speed: 10.0
};

// ---------- ポテンシャル関数 ----------
function potential(phi, A, B, C) {
  return A * Math.pow(phi * phi - B * B, 2) + C;
}

// ---------- インフレーションステップ（簡略版） ----------
function inflationStep(phi, dphi, dt, A, B, C, rhoThreshold, quantumFluctuation) {
  // 量子揺らぎ
  if (quantumFluctuation) {
    phi += (Math.random() - 0.5) * 0.001;
  }
  
  // エネルギー密度を計算
  const V = potential(phi, A, B, C);
  const rho = 0.5 * dphi * dphi + V;
  
  let newPhi = phi;
  let newDphi = dphi;
  let expansion = 1.0;
  let T = 0.0;
  let H = 0.0;
  
  if (rho > rhoThreshold) {
    // インフレーション発動
    const G = 6.67430e-11;
    H = Math.sqrt((8 * Math.PI * G / 3) * rho * 1e10); // スケール調整
    expansion = Math.exp(H * dt);
    T = rho * 1e10; // 再加熱温度（簡略）
    
    // フィールドの減衰
    newPhi = phi * 0.95;
    newDphi = dphi * 0.1;
  } else {
    // 通常の進化
    const damping = 0.99;
    newPhi = phi + dphi * dt;
    newDphi = (dphi - A * phi * dt) * damping;
  }
  
  return { phi: newPhi, dphi: newDphi, rho, H, T, expansion };
}

// ---------- API呼び出し（オプション） ----------
async function fetchInflationSimulation(params) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/inflation/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phi_initial: params.phi,
        dphi_initial: params.dphi,
        rho_threshold: params.rhoThreshold,
        potential_A: params.A,
        potential_B: params.B,
        potential_C: params.C,
        quantum_fluctuation: params.quantumFluctuation,
        dt: 0.01,
        steps: 1
      })
    });
    
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn('API unavailable, using local calculation:', error);
    return null;
  }
}

// ---------- イベントリスナー ----------
togglePanel.addEventListener('click', () => {
  controlPanel.classList.toggle('collapsed');
});

// パラメータスライダー
paramA.addEventListener('input', (e) => {
  simulationParams.A = parseFloat(e.target.value);
  paramALabel.textContent = simulationParams.A.toFixed(1);
  createPotentialMesh(simulationParams.A, simulationParams.B, simulationParams.C);
});

paramB.addEventListener('input', (e) => {
  simulationParams.B = parseFloat(e.target.value);
  paramBLabel.textContent = simulationParams.B.toFixed(2);
  createPotentialMesh(simulationParams.A, simulationParams.B, simulationParams.C);
});

paramC.addEventListener('input', (e) => {
  simulationParams.C = parseFloat(e.target.value);
  paramCLabel.textContent = simulationParams.C.toFixed(2);
  createPotentialMesh(simulationParams.A, simulationParams.B, simulationParams.C);
});

rhoThreshold.addEventListener('input', (e) => {
  simulationParams.rhoThreshold = parseFloat(e.target.value);
  rhoThresholdLabel.textContent = simulationParams.rhoThreshold.toExponential(1);
});

quantumFluctuation.addEventListener('change', (e) => {
  simulationParams.quantumFluctuation = e.target.checked;
});

speedSlider.addEventListener('input', (e) => {
  simulationParams.speed = parseFloat(e.target.value);
  speedLabel.textContent = `${simulationParams.speed}x`;
});

// カメラ制御
const autoFollow = document.getElementById('autoFollow');
const resetCameraBtn = document.getElementById('resetCameraBtn');
const focusBallBtn = document.getElementById('focusBallBtn');

autoFollow.addEventListener('change', (e) => {
  autoFollowBall = e.target.checked;
});

resetCameraBtn.addEventListener('click', () => {
  if (camera && controls) {
    camera.position.set(3, 4, 6);
    cameraTarget.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }
});

focusBallBtn.addEventListener('click', () => {
  if (phiBall && camera && controls) {
    const ballPos = phiBall.position;
    cameraTarget.copy(ballPos);
    controls.target.copy(ballPos);
    
    // ボールに近づく
    const direction = new THREE.Vector3(2, 3, 4).normalize();
    const distance = 3;
    camera.position.copy(ballPos).add(direction.multiplyScalar(distance));
    controls.update();
  }
});

// カメラ矢印操作
const cameraUp = document.getElementById('cameraUp');
const cameraDown = document.getElementById('cameraDown');
const cameraLeft = document.getElementById('cameraLeft');
const cameraRight = document.getElementById('cameraRight');
const cameraCenter = document.getElementById('cameraCenter');
const cameraZoomIn = document.getElementById('cameraZoomIn');
const cameraZoomOut = document.getElementById('cameraZoomOut');

const CAMERA_MOVE_SPEED = 0.5;
const CAMERA_ZOOM_SPEED = 0.2;

function moveCamera(direction) {
  if (!camera || !controls) return;
  
  const moveVector = new THREE.Vector3();
  
  switch(direction) {
    case 'up':
      moveVector.set(0, CAMERA_MOVE_SPEED, 0);
      break;
    case 'down':
      moveVector.set(0, -CAMERA_MOVE_SPEED, 0);
      break;
    case 'left':
      moveVector.set(-CAMERA_MOVE_SPEED, 0, 0);
      break;
    case 'right':
      moveVector.set(CAMERA_MOVE_SPEED, 0, 0);
      break;
    case 'forward':
      moveVector.set(0, 0, -CAMERA_MOVE_SPEED);
      break;
    case 'backward':
      moveVector.set(0, 0, CAMERA_MOVE_SPEED);
      break;
  }
  
  // カメラのローカル座標系で移動
  camera.position.add(moveVector);
  cameraTarget.add(moveVector);
  controls.target.copy(cameraTarget);
  controls.update();
}

function zoomCamera(direction) {
  if (!camera || !controls) return;
  
  const directionVec = new THREE.Vector3();
  camera.getWorldDirection(directionVec);
  
  if (direction === 'in') {
    camera.position.add(directionVec.multiplyScalar(-CAMERA_ZOOM_SPEED));
  } else {
    camera.position.add(directionVec.multiplyScalar(CAMERA_ZOOM_SPEED));
  }
  
  controls.update();
}

cameraUp.addEventListener('click', () => moveCamera('up'));
cameraDown.addEventListener('click', () => moveCamera('down'));
cameraLeft.addEventListener('click', () => moveCamera('left'));
cameraRight.addEventListener('click', () => moveCamera('right'));
cameraCenter.addEventListener('click', () => {
  if (camera && controls) {
    camera.position.set(3, 4, 6);
    cameraTarget.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
  }
});
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

// φハンドルのドラッグ
let isDraggingPhi = false;
phiHandle.addEventListener('mousedown', (e) => {
  isDraggingPhi = true;
});

document.addEventListener('mousemove', (e) => {
  if (isDraggingPhi) {
    const track = phiHandle.parentElement;
    const rect = track.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const clampedX = Math.max(0, Math.min(1, x));
    phiHandle.style.left = `${clampedX * 100}%`;
    simulationState.phi = (clampedX - 0.5) * 2; // -1 to 1
    phiInput.value = simulationState.phi.toFixed(3);
    updatePhiBallPosition();
  }
});

document.addEventListener('mouseup', () => {
  isDraggingPhi = false;
});

phiInput.addEventListener('input', (e) => {
  simulationState.phi = parseFloat(e.target.value);
  // 初期値をHTMLにも反映
  if (phiHandle) {
    const normalizedPhi = (simulationState.phi + 1) / 2; // -1 to 1 -> 0 to 1
    phiHandle.style.left = `${normalizedPhi * 100}%`;
  }
  updatePhiBallPosition();
});

velocityInput.addEventListener('input', (e) => {
  simulationState.dphi = parseFloat(e.target.value);
});

// ボタン
startBtn.addEventListener('click', () => {
  simulationState.isRunning = true;
  simulationState.isPaused = false;
  startBtn.textContent = '実行中...';
  startBtn.disabled = true;
});

pauseBtn.addEventListener('click', () => {
  simulationState.isPaused = !simulationState.isPaused;
  pauseBtn.textContent = simulationState.isPaused ? '再開' : '一時停止';
});

resetBtn.addEventListener('click', () => {
  simulationState.phi = parseFloat(phiInput.value);
  simulationState.dphi = parseFloat(velocityInput.value);
  simulationState.rho = 0.0;
  simulationState.H = 0.0;
  simulationState.T = 0.0;
  simulationState.expansion = 1.0;
  simulationState.time = 0.0;
  simulationState.isRunning = false;
  simulationState.isPaused = false;
  simulationState.trajectory = [];
  startBtn.textContent = '開始';
  startBtn.disabled = false;
  pauseBtn.textContent = '一時停止';
  initExpansionParticles();
  updatePhiBallPosition();
  updateStatus('stable');
});

// ---------- φボールの位置更新 ----------
function updatePhiBallPosition() {
  if (!phiBall) return;
  
  const phi = simulationState.phi;
  const V = potential(phi, simulationParams.A, simulationParams.B, simulationParams.C);
  
  // ボールを地形の上に配置（地形に沿って転がる）
  phiBall.position.x = phi;
  phiBall.position.y = V * VISUAL_EXAGGERATION.potentialHeight + 0.25; // 地形の上に
  phiBall.position.z = 0;
  
  // ボールの回転（転がる動き）
  if (simulationState.dphi !== 0) {
    const rollSpeed = Math.abs(simulationState.dphi) * 10;
    phiBall.rotation.x += rollSpeed;
  }
  
  // エネルギー密度に応じてボールの色とサイズを変化
  const rho = 0.5 * simulationState.dphi * simulationState.dphi + V;
  const normalizedRho = Math.min(1.0, rho / simulationParams.rhoThreshold);
  
  if (phiBall.children && phiBall.children.length > 0) {
    const ball = phiBall.children[0];
    const glow = phiBall.children[1];
    
    // 色を変化（低密度=青、高密度=赤）
    const color = new THREE.Color();
    color.lerpColors(
      new THREE.Color(0x00d4ff), // 青
      new THREE.Color(0xff4400), // 赤
      normalizedRho
    );
    ball.material.color.copy(color);
    ball.material.emissive.copy(color);
    ball.material.emissiveIntensity = 0.5 + normalizedRho * 1.5; // グローを強く
    glow.material.color.copy(color);
    glow.material.opacity = 0.3 + normalizedRho * 0.7;
    
    // サイズを変化（臨界に近づくと大きくなる）
    const scale = 1.0 + normalizedRho * 1.0; // より大きく変化
    phiBall.scale.set(scale, scale, scale);
    
    // エネルギーパーティクルをアニメーション
    for (let i = 2; i < phiBall.children.length; i++) {
      const particle = phiBall.children[i];
      if (particle.userData) {
        particle.userData.angle += particle.userData.speed * (1 + normalizedRho * 2);
        particle.userData.radius = 0.5 + normalizedRho * 1.5; // 密度が高いほど広がる
        
        const x = Math.cos(particle.userData.angle) * particle.userData.radius;
        const z = Math.sin(particle.userData.angle) * particle.userData.radius;
        const y = Math.sin(particle.userData.angle * 2) * 0.3 * normalizedRho;
        
        particle.position.set(x, y, z);
        
        // パーティクルの色も変化
        const particleColor = new THREE.Color();
        particleColor.lerpColors(
          new THREE.Color(0x00d4ff),
          new THREE.Color(0xffaa00),
          normalizedRho
        );
        particle.material.color.copy(particleColor);
        particle.material.opacity = 0.4 + normalizedRho * 0.6;
      }
    }
    
    // 臨界状態でパルス効果とワープエフェクト
    if (normalizedRho > 0.8) {
      const pulse = 1.0 + Math.sin(Date.now() * 0.01) * 0.3;
      const currentScale = phiBall.scale.x;
      phiBall.scale.setScalar(currentScale * (pulse / currentScale));
      
      // ワープエフェクト（空間の歪み）
      phiBall.rotation.y += 0.05 * normalizedRho;
      phiBall.rotation.z += 0.03 * normalizedRho;
    }
  }
  
  // 軌跡を更新
  simulationState.trajectory.push({ phi, V });
  if (simulationState.trajectory.length > 100) {
    simulationState.trajectory.shift();
  }
  
  if (phiTrail && simulationState.trajectory.length >= 2) {
    const points = simulationState.trajectory.map(t => 
      new THREE.Vector3(t.phi, t.V * VISUAL_EXAGGERATION.potentialHeight, 0)
    );
    phiTrail.geometry.setFromPoints(points);
    
    // 軌跡の色も変化
    const rho = 0.5 * simulationState.dphi * simulationState.dphi + V;
    const normalizedRho = Math.min(1.0, rho / simulationParams.rhoThreshold);
    const trailColor = new THREE.Color();
    trailColor.lerpColors(
      new THREE.Color(0x00d4ff),
      new THREE.Color(0xff4400),
      normalizedRho
    );
    phiTrail.material.color.copy(trailColor);
  }
}

// ---------- 爆発エフェクトの作成 ----------
function createExplosionEffect(position) {
  if (explosionEffect) {
    scene.remove(explosionEffect);
    explosionEffect.children.forEach(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  
  explosionEffect = new THREE.Group();
  explosionEffect.userData = { lifetime: 200, age: 0 };
  
  // 爆発パーティクル（より劇的に）
  const particleCount = 100;
  for (let i = 0; i < particleCount; i++) {
    const size = 0.15 + Math.random() * 0.15;
    const geometry = new THREE.SphereGeometry(size, 8, 8);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(Math.random() * 0.3 + 0.05, 1, 0.5), // 赤〜オレンジ系
      transparent: true,
      opacity: 1,
      emissive: new THREE.Color().setHSL(Math.random() * 0.3 + 0.05, 1, 0.5)
    });
    const particle = new THREE.Mesh(geometry, material);
    
    const angle1 = Math.random() * Math.PI * 2;
    const angle2 = Math.random() * Math.PI * 2;
    const speed = 0.3 + Math.random() * 0.4; // より速く
    
    particle.userData = {
      velocity: new THREE.Vector3(
        Math.sin(angle1) * Math.cos(angle2) * speed,
        Math.cos(angle1) * speed * 0.5,
        Math.sin(angle1) * Math.sin(angle2) * speed
      ),
      life: 1.0,
      rotationSpeed: (Math.random() - 0.5) * 0.2
    };
    
    particle.position.copy(position);
    explosionEffect.add(particle);
  }
  
  // 爆発の中心に大きな光る球を追加
  const coreGeometry = new THREE.SphereGeometry(0.5, 16, 16);
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.8,
    emissive: 0xffffff,
    emissiveIntensity: 2.0
  });
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.position.copy(position);
  explosionEffect.add(core);
  
  scene.add(explosionEffect);
}

// ---------- 爆発エフェクトの更新 ----------
function updateExplosionEffect() {
  if (!explosionEffect) return;
  
  explosionEffect.userData.age++;
  explosionEffect.userData.lifetime--;
  
  if (explosionEffect.userData.lifetime <= 0) {
    scene.remove(explosionEffect);
    explosionEffect = null;
    return;
  }
  
  const lifeRatio = explosionEffect.userData.age / 200;
  
  explosionEffect.children.forEach(particle => {
    if (particle.userData) {
      particle.position.add(particle.userData.velocity);
      particle.userData.velocity.multiplyScalar(0.97); // わずかに減速
      
      // 回転
      if (particle.userData.rotationSpeed) {
        particle.rotation.x += particle.userData.rotationSpeed;
        particle.rotation.y += particle.userData.rotationSpeed * 0.7;
      }
      
      const alpha = 1.0 - lifeRatio;
      particle.material.opacity = alpha;
      particle.scale.setScalar(1.0 + lifeRatio * 3); // より大きく拡大
      
      // コアは特別な処理
      if (particle.material.emissiveIntensity > 1) {
        particle.material.opacity = 0.8 * (1.0 - lifeRatio);
        particle.scale.setScalar(1.0 + lifeRatio * 5);
      }
    }
  });
}

// ---------- ステータス更新 ----------
function updateStatus(status) {
  statusIndicator.className = `status-indicator ${status}`;
  const statusTexts = {
    stable: '安定状態',
    critical: '臨界状態（不安定化）',
    inflation: 'インフレーション発動中！'
  };
  statusText.textContent = statusTexts[status] || '未知の状態';
}

// ---------- リサイズ処理 ----------
window.addEventListener('resize', () => {
  if (!camera || !renderer) return;
  
  const width = canvas.clientWidth || window.innerWidth * 0.85;
  const height = canvas.clientHeight || window.innerHeight - 50;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  
  expansionCanvas.width = expansionCanvas.clientWidth;
  expansionCanvas.height = expansionCanvas.clientHeight;
  initExpansionParticles();
  
  densityCanvas.width = densityCanvas.clientWidth;
  densityCanvas.height = densityCanvas.clientHeight;
  initDensityGrid();
});

// ---------- アニメーションループ ----------
function tick() {
  requestAnimationFrame(tick);
  
  if (!camera || !renderer || !controls) return;
  
  controls.update();
  
  // 初期状態でもエネルギー密度を計算して表示
  if (!simulationState.isRunning) {
    const V = potential(simulationState.phi, simulationParams.A, simulationParams.B, simulationParams.C);
    simulationState.rho = 0.5 * simulationState.dphi * simulationState.dphi + V;
    
    // UI更新（初期状態でも表示）
    phiValue.textContent = simulationState.phi.toFixed(4);
    rhoValue.textContent = simulationState.rho.toExponential(2);
    hValue.textContent = '0.00';
    tempValue.textContent = '0.00 K';
    
    // ビジュアル更新
    updatePhiBallPosition();
    drawDensityField(simulationState.rho, simulationParams.rhoThreshold);
    
    // 初期状態でもパーティクルを少し動かす
    drawExpansion(1.0 + Math.sin(Date.now() * 0.001) * 0.05);
  }
  
  // シミュレーション実行中
  if (simulationState.isRunning && !simulationState.isPaused) {
    const dt = 0.01 * simulationParams.speed;
    
    const result = inflationStep(
      simulationState.phi,
      simulationState.dphi,
      dt,
      simulationParams.A,
      simulationParams.B,
      simulationParams.C,
      simulationParams.rhoThreshold,
      simulationParams.quantumFluctuation
    );
    
    simulationState.phi = result.phi;
    simulationState.dphi = result.dphi;
    simulationState.rho = result.rho;
    simulationState.H = result.H;
    simulationState.T = result.T;
    simulationState.expansion *= result.expansion;
    simulationState.time += dt;
    
    // ステータス更新
    if (result.rho > simulationParams.rhoThreshold) {
      updateStatus('inflation');
      // インフレーション発動時の爆発エフェクト
      if (!explosionEffect || explosionEffect.userData.lifetime <= 0) {
        createExplosionEffect(phiBall.position);
      }
    } else if (result.rho > simulationParams.rhoThreshold * 0.8) {
      updateStatus('critical');
    } else {
      updateStatus('stable');
    }
    
    // UI更新
    phiValue.textContent = simulationState.phi.toFixed(4);
    rhoValue.textContent = simulationState.rho.toExponential(2);
    hValue.textContent = simulationState.H.toExponential(2);
    tempValue.textContent = `${(simulationState.T / 1e10).toFixed(2)} × 10¹⁰ K`;
    
    updatePhiBallPosition();
    drawExpansion(simulationState.expansion);
    drawDensityField(simulationState.rho, simulationParams.rhoThreshold);
  }
  
  // 爆発エフェクトの更新
  updateExplosionEffect();
  
  // カメラのターゲットを動的に更新
  if (autoFollowBall && phiBall) {
    // ボールの位置をターゲットに（滑らかに追従）
    const targetPos = phiBall.position.clone();
    cameraTarget.lerp(targetPos, 0.05); // 滑らかに追従
    
    // インフレーション発動時は爆発エフェクトを追従
    if (explosionEffect && explosionEffect.userData.lifetime > 0) {
      const explosionPos = explosionEffect.children[0]?.position || phiBall.position;
      cameraTarget.lerp(explosionPos, 0.1);
    }
  }
  
  // カメラを少し動かして臨場感を出す（エネルギー密度が高いほど）
  if (simulationState.rho > 0) {
    const normalizedRho = Math.min(1.0, simulationState.rho / simulationParams.rhoThreshold);
    const shake = normalizedRho * 0.05; // より強いシェイク
    const basePos = new THREE.Vector3(3, 4, 6);
    
    // カメラ位置の計算
    let camPos = basePos.clone();
    
    // インフレーション発動時はズームアウト
    if (normalizedRho > 0.9) {
      const zoomOut = 1.0 + (normalizedRho - 0.9) * 10;
      camPos.multiplyScalar(zoomOut);
    }
    
    // シェイクを追加
    camPos.x += (Math.random() - 0.5) * shake;
    camPos.y += (Math.random() - 0.5) * shake;
    camPos.z += (Math.random() - 0.5) * shake;
    
    camera.position.copy(camPos);
    
    // カメラの視線をターゲットに向ける
    camera.lookAt(cameraTarget);
    
    // OrbitControlsのターゲットも更新
    if (controls) {
      controls.target.copy(cameraTarget);
    }
  } else {
    // 通常時もターゲットを更新
    if (controls) {
      controls.target.lerp(cameraTarget, 0.05);
    }
    camera.lookAt(cameraTarget);
  }
  
  renderer.render(scene, camera);
}

// ---------- 初期化 ----------
// DOMが完全に読み込まれてから初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  console.log('Initializing inflation simulator...');
  console.log('Canvas element:', canvas);
  console.log('Canvas size:', canvas?.clientWidth, 'x', canvas?.clientHeight);
  
  // 少し待ってから初期化（DOMが完全にレンダリングされるまで）
  setTimeout(() => {
    // Three.jsの初期化
    const threeResult = initThreeJS();
    if (!threeResult) {
      console.error('Failed to initialize Three.js');
      return;
    }
    
    ({ camera, renderer, controls } = threeResult);
    
    console.log('Three.js initialized. Camera:', camera, 'Renderer:', renderer);
    
    // ポテンシャル地形とボールを作成
    createPotentialMesh(simulationParams.A, simulationParams.B, simulationParams.C);
    createPhiBall();
    
    // 2D Canvasの初期化
    if (expansionCanvas) {
      expansionCanvas.width = expansionCanvas.clientWidth;
      expansionCanvas.height = expansionCanvas.clientHeight;
      initExpansionParticles();
    }
    
    if (densityCanvas) {
      densityCanvas.width = densityCanvas.clientWidth;
      densityCanvas.height = densityCanvas.clientHeight;
      initDensityGrid();
    }
    
    // 初期位置の更新
    updatePhiBallPosition();
    
    // アニメーションループ開始
    tick();
    
    console.log('Initialization complete. Scene children:', scene.children.length);
    console.log('Scene objects:', scene.children.map(c => c.type || c.constructor.name));
  }, 100);
}

