import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// API設定
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8001'
  : 'https://hawking-sim-api.onrender.com';

// ---------- DOM要素 ----------
const canvas = document.getElementById('c');
const toggleUI = document.getElementById('toggleUI');
const ui = document.getElementById('ui');
const initialMass = document.getElementById('initialMass');
const initialMassNumber = document.getElementById('initialMassNumber');
const initialRadius = document.getElementById('initialRadius');
const explosionEnergy = document.getElementById('explosionEnergy');
const explosionVelocity = document.getElementById('explosionVelocity');
const ejectaMass = document.getElementById('ejectaMass');
const ejectaMassValue = document.getElementById('ejectaMassValue');
const remnantMass = document.getElementById('remnantMass');
const remnantRs = document.getElementById('remnantRs');
const formationTime = document.getElementById('formationTime');
const bhFormedLabel = document.getElementById('bhFormedLabel');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const timeScale = document.getElementById('timeScale');
const elapsedTime = document.getElementById('elapsedTime');

// ---------- Three.jsシーン設定 ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

let camera, renderer, controls;

function initThreeJS() {
  if (!canvas) return null;
  
  const width = canvas.clientWidth || window.innerWidth;
  const height = canvas.clientHeight || window.innerHeight;
  
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 10000);
  camera.position.set(0, 50, 200);
  
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);
  
  // ライティング
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(100, 100, 100);
  scene.add(dirLight);
  
  const ambLight = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambLight);
  
  return { camera, renderer, controls };
}

// ---------- シミュレーション状態 ----------
let simulationState = {
  isRunning: false,
  isPaused: false,
  time: 0.0,
  initialMassSolar: 20.0,
  explosionEnergy: 10.0e44, // J
  ejectaMassSolar: 0.5,
  remnantMassSolar: 0.0,
  blackHoleFormed: false,
  formationTime: 0.0
};

let simulationParams = {
  timeScale: 100.0
};

// ---------- 3Dオブジェクト ----------
let starCore = null; // 恒星のコア
let explosionParticles = []; // 爆発パーティクル
let blackHole = null; // ブラックホール
let particleSystem = null; // パーティクルシステム

// 恒星のコアを作成
function createStarCore(radius) {
  if (starCore) {
    scene.remove(starCore);
    starCore.geometry.dispose();
    starCore.material.dispose();
  }
  
  const geometry = new THREE.SphereGeometry(radius, 32, 32);
  const material = new THREE.MeshPhongMaterial({
    color: 0xffaa00,
    emissive: 0xff4400,
    emissiveIntensity: 1.0,
    transparent: true,
    opacity: 0.9
  });
  
  starCore = new THREE.Mesh(geometry, material);
  scene.add(starCore);
}

// ブラックホールを作成
function createBlackHole(rs) {
  if (blackHole) {
    scene.remove(blackHole);
    blackHole.geometry.dispose();
    blackHole.material.dispose();
    // 既存のグローも削除
    const existingGlows = scene.children.filter(child => 
      child.type === 'Mesh' && 
      child.material && 
      child.material.type === 'MeshBasicMaterial' &&
      child.material.color.r > 0.9 && child.material.color.g > 0.6
    );
    existingGlows.forEach(glow => {
      scene.remove(glow);
      glow.geometry.dispose();
      glow.material.dispose();
    });
  }
  
  const visualRs = Math.max(2.0, rs); // 最小サイズを確保
  const geometry = new THREE.SphereGeometry(visualRs, 32, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.9
  });
  
  blackHole = new THREE.Mesh(geometry, material);
  blackHole.visible = true;
  scene.add(blackHole);
  
  // イベントホライズンのグロー（複数層）
  for (let i = 0; i < 3; i++) {
    const ringRadius = visualRs * (1.0 + i * 0.15);
    const glowGeometry = new THREE.RingGeometry(ringRadius * 0.95, ringRadius * 1.05, 64);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(0.1, 1.0, 0.5),
      transparent: true,
      opacity: 0.2 - i * 0.05,
      side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.rotation.x = Math.PI / 2;
    glow.userData.isGlow = true;
    scene.add(glow);
  }
}

// パーティクルシステムを作成
let particleVelocities = [];
let particleLifetimes = [];

function createParticleSystem() {
  if (particleSystem) {
    scene.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem.material.dispose();
  }
  
  const particleCount = 3000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  
  particleVelocities = [];
  particleLifetimes = [];
  
  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    positions[i3] = 0;
    positions[i3 + 1] = 0;
    positions[i3 + 2] = 0;
    
    // 色（青→白→黄→赤）
    const hue = Math.random() * 0.15 + 0.0; // 0.0-0.15 (赤〜オレンジ)
    const color = new THREE.Color();
    color.setHSL(hue, 1.0, 0.5);
    colors[i3] = color.r;
    colors[i3 + 1] = color.g;
    colors[i3 + 2] = color.b;
    
    sizes[i] = 3 + Math.random() * 5;
    
    // 各パーティクルの速度ベクトルを初期化（まだ使わない）
    particleVelocities.push(new THREE.Vector3(0, 0, 0));
    particleLifetimes.push(0.0);
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0.0 }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 color;
      varying vec3 vColor;
      uniform float time;
      
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (300.0 / -mvPosition.z);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      
      void main() {
        float d = distance(gl_PointCoord, vec2(0.5));
        float alpha = 1.0 - smoothstep(0.0, 0.5, d);
        gl_FragColor = vec4(vColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    depthWrite: false
  });
  
  particleSystem = new THREE.Points(geometry, material);
  scene.add(particleSystem);
}

// ---------- イベントリスナー ----------
toggleUI.addEventListener('click', () => {
  ui.classList.toggle('collapsed');
});

initialMass.addEventListener('input', (e) => {
  const mass = parseFloat(e.target.value);
  initialMassNumber.value = mass;
  simulationState.initialMassSolar = mass;
  updateInitialRadius();
});

initialMassNumber.addEventListener('input', (e) => {
  const mass = parseFloat(e.target.value);
  initialMass.value = mass;
  simulationState.initialMassSolar = mass;
  updateInitialRadius();
});

explosionEnergy.addEventListener('input', (e) => {
  const energy = parseFloat(e.target.value) * 1e44;
  simulationState.explosionEnergy = energy;
  updateExplosionVelocity();
});

ejectaMass.addEventListener('input', (e) => {
  const mass = parseFloat(e.target.value);
  simulationState.ejectaMassSolar = mass * simulationState.initialMassSolar;
  ejectaMassValue.textContent = simulationState.ejectaMassSolar.toFixed(2);
});

timeScale.addEventListener('input', (e) => {
  simulationParams.timeScale = parseFloat(e.target.value);
});

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
  simulationState.isRunning = false;
  simulationState.isPaused = false;
  simulationState.time = 0.0;
  simulationState.blackHoleFormed = false;
  simulationState.formationTime = 0.0;
  explosionTriggered = false;
  startBtn.textContent = '開始';
  startBtn.disabled = false;
  pauseBtn.textContent = '一時停止';
  bhFormedLabel.style.display = 'none';
  
  // リセット
  if (starCore) {
    starCore.scale.set(1, 1, 1);
    starCore.visible = true;
    starCore.material.color.setRGB(1.0, 0.6, 0.2);
    starCore.material.emissiveIntensity = 1.0;
  }
  
  if (blackHole) {
    scene.remove(blackHole);
    // グローも削除
    const glows = scene.children.filter(child => child.type === 'Mesh' && child.material && child.material.color.r === 1 && child.material.color.g === 0.67);
    glows.forEach(glow => scene.remove(glow));
  }
  blackHole = null;
  
  // パーティクルをリセット
  if (particleSystem) {
    const positions = particleSystem.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = 0;
      positions[i + 1] = 0;
      positions[i + 2] = 0;
    }
    
    // 速度もリセット
    particleVelocities.forEach(vel => vel.set(0, 0, 0));
    particleLifetimes.fill(0.0);
    
    particleSystem.geometry.attributes.position.needsUpdate = true;
  }
});

// ---------- 計算関数 ----------
function updateInitialRadius() {
  // 質量-半径関係（簡略化）
  const M_sun = 1.989e30; // kg
  const R_sun = 6.96e8; // m
  const mass_kg = simulationState.initialMassSolar * M_sun;
  const radius = R_sun * Math.pow(simulationState.initialMassSolar / 1.0, 0.8);
  initialRadius.textContent = (radius / R_sun).toFixed(2);
  
  if (starCore) {
    const visualRadius = (radius / R_sun) * 5; // 視覚的なスケール
    starCore.scale.setScalar(visualRadius);
  }
}

function updateExplosionVelocity() {
  const M_ejecta = simulationState.ejectaMassSolar * 1.989e30; // kg
  const E = simulationState.explosionEnergy;
  const v = Math.sqrt(2 * E / M_ejecta);
  explosionVelocity.textContent = (v / 1000).toFixed(0);
}

// ---------- シミュレーション更新 ----------
let explosionTriggered = false;

function updateSimulation(dt) {
  if (!simulationState.isRunning || simulationState.isPaused) return;
  
  const scaledDt = dt * simulationParams.timeScale * 0.1; // 時間スケールを調整
  simulationState.time += scaledDt;
  elapsedTime.textContent = simulationState.time.toFixed(2);
  
  // 超新星爆発の段階
  const explosionStartTime = 0.0;
  const explosionDuration = 10.0; // 秒
  const collapseStartTime = explosionDuration;
  const collapseDuration = 5.0; // 秒
  
  if (simulationState.time < explosionStartTime + explosionDuration) {
    // 爆発フェーズ
    const explosionProgress = (simulationState.time - explosionStartTime) / explosionDuration;
    
    // コアが縮小
    if (starCore) {
      const shrinkFactor = Math.max(0.3, 1.0 - explosionProgress * 0.7);
      starCore.scale.setScalar(shrinkFactor);
      starCore.material.emissiveIntensity = 1.0 + explosionProgress * 3.0;
      
      // コアの色を変化（オレンジ→赤→暗赤）
      const colorIntensity = 1.0 - explosionProgress * 0.5;
      starCore.material.color.setRGB(1.0, colorIntensity * 0.6, colorIntensity * 0.2);
    }
    
    // パーティクルを爆発させる（一度だけ初期化）
    if (particleSystem && !explosionTriggered && explosionProgress > 0.05) {
      explosionTriggered = true;
      const positions = particleSystem.geometry.attributes.position.array;
      
      // 各パーティクルにランダムな速度を設定
      for (let i = 0; i < particleVelocities.length; i++) {
        const angle1 = Math.random() * Math.PI * 2;
        const angle2 = Math.acos(1 - 2 * Math.random()); // 球面一様分布
        const speed = 5 + Math.random() * 25; // km/s相当
        
        particleVelocities[i].set(
          Math.sin(angle2) * Math.cos(angle1) * speed,
          Math.sin(angle2) * Math.sin(angle1) * speed,
          Math.cos(angle2) * speed
        );
        
        particleLifetimes[i] = 0.0;
      }
    }
    
    // パーティクルを更新
    if (particleSystem && explosionTriggered) {
      const positions = particleSystem.geometry.attributes.position.array;
      
      for (let i = 0; i < particleVelocities.length; i++) {
        const i3 = i * 3;
        const vel = particleVelocities[i];
        
        // 位置を更新
        positions[i3] += vel.x * scaledDt;
        positions[i3 + 1] += vel.y * scaledDt;
        positions[i3 + 2] += vel.z * scaledDt;
        
        // 速度を減衰（空気抵抗的な効果）
        vel.multiplyScalar(0.999);
        
        // ライフタイムを更新
        particleLifetimes[i] += scaledDt;
        
        // 遠くに飛んだパーティクルはフェードアウト
        const distance = Math.sqrt(
          positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2
        );
        const fadeDistance = 200;
        if (distance > fadeDistance) {
          const fade = 1.0 - (distance - fadeDistance) / fadeDistance;
          const colors = particleSystem.geometry.attributes.color.array;
          colors[i3 + 3] = Math.max(0, fade); // alpha相当
        }
      }
      
      particleSystem.geometry.attributes.position.needsUpdate = true;
    }
  } else if (simulationState.time < collapseStartTime + collapseDuration) {
    // 重力崩壊フェーズ
    const collapseProgress = (simulationState.time - collapseStartTime) / collapseDuration;
    
    if (starCore) {
      const shrinkFactor = Math.max(0.01, 0.3 * (1.0 - collapseProgress));
      starCore.scale.setScalar(shrinkFactor);
      starCore.material.emissiveIntensity = 0.5 + collapseProgress * 2.0;
      
      // コアが暗くなる
      starCore.material.color.setRGB(0.2, 0.1, 0.05);
      
      if (shrinkFactor < 0.05) {
        starCore.visible = false;
      }
    }
    
    // ブラックホール形成
    if (collapseProgress > 0.7 && !simulationState.blackHoleFormed) {
      simulationState.blackHoleFormed = true;
      simulationState.formationTime = simulationState.time;
      simulationState.remnantMassSolar = simulationState.initialMassSolar - simulationState.ejectaMassSolar;
      
      const G = 6.67430e-11;
      const c = 299792458;
      const M_kg = simulationState.remnantMassSolar * 1.989e30;
      const rs = (2 * G * M_kg) / (c * c);
      
      remnantMass.textContent = simulationState.remnantMassSolar.toFixed(2);
      remnantRs.textContent = (rs / 1000).toFixed(2);
      formationTime.textContent = simulationState.formationTime.toFixed(2);
      bhFormedLabel.style.display = 'block';
      
      createBlackHole(rs / 1000 * 0.05); // 視覚的なスケール
    }
  } else {
    // ブラックホール安定状態
    if (blackHole && !blackHole.visible) {
      blackHole.visible = true;
    }
  }
}

// ---------- アニメーションループ ----------
let lastTime = performance.now();
let frameCount = 0;

function tick() {
  requestAnimationFrame(tick);
  
  if (!camera || !renderer || !controls) return;
  
  // フレームレート制御（60fps目標）
  const currentTime = performance.now();
  const deltaTime = Math.min((currentTime - lastTime) / 1000, 0.1); // 最大0.1秒
  lastTime = currentTime;
  
  controls.update();
  
  // シミュレーション更新（固定タイムステップ）
  const dt = 0.016; // 約60fps
  updateSimulation(dt);
  
  // パーティクルの時間更新
  if (particleSystem && particleSystem.material) {
    particleSystem.material.uniforms.time.value += dt;
  }
  
  // ブラックホールのグローをアニメーション
  if (blackHole) {
    const glows = scene.children.filter(child => child.userData && child.userData.isGlow);
    glows.forEach((glow, index) => {
      glow.rotation.z += dt * (0.5 + index * 0.2);
      const pulse = 1.0 + Math.sin(currentTime * 0.001 + index) * 0.1;
      glow.scale.setScalar(pulse);
    });
  }
  
  renderer.render(scene, camera);
  
  // デバッグ: フレームレート表示（開発時のみ）
  frameCount++;
  if (frameCount % 60 === 0) {
    const fps = 1.0 / deltaTime;
    if (fps < 30) {
      console.warn(`Low FPS: ${fps.toFixed(1)}`);
    }
  }
}

// ---------- リサイズ処理 ----------
window.addEventListener('resize', () => {
  if (!camera || !renderer) return;
  
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});

// ---------- 初期化 ----------
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  const threeResult = initThreeJS();
  if (!threeResult) return;
  
  ({ camera, renderer, controls } = threeResult);
  
  // 初期オブジェクト作成
  createStarCore(10);
  createParticleSystem();
  
  // 初期値を設定
  updateInitialRadius();
  updateExplosionVelocity();
  
  // アニメーション開始
  tick();
}

