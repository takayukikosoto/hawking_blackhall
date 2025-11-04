# ブラックホール蒸発ボタン実装メモ

## 概要
ブラックホールをゲーム的に蒸発させる機能の実装仕様。

## UI要件

### ボタン配置
- **位置**: 画面右上（目立たない場所）
- **スタイル**: 小さめのボタン、控えめなデザイン
- **ボタン**: 
  - 蒸発開始ボタン（`evaporateBtn`）
  - 蒸発停止ボタン（`stopEvaporateBtn`）

### HTML構造
```html
<div class="evaporate-controls">
  <button id="evaporateBtn" class="evaporate-btn-small" title="ブラックホールを蒸発させる">
    <span class="evaporate-icon-small">💨</span>
  </button>
  <button id="stopEvaporateBtn" class="stop-btn" style="display: none;" title="蒸発を停止">
    <span>⏹</span>
  </button>
</div>
```

## ゲームメカニクス

### 蒸発速度
- **加速率**: 通常の100倍の速度で蒸発
- **計算式**: `BH_Mass_solar -= evaporationRate * dt`
- **evaporationRate**: 100倍に設定（実際の物理速度の100倍）

### 蒸発ループ
```javascript
function evaporationLoop() {
  if (!isEvaporating) return;
  
  const dt = Math.min(0.05, (performance.now() - lastEvaporationTime) * 0.001);
  lastEvaporationTime = performance.now();
  
  // 質量を減少（100倍速度）
  BH_Mass_solar -= evaporationRate * dt;
  
  // 質量が0以下にならないように
  if (BH_Mass_solar <= 0.001) {
    stopEvaporation();
    createExplosionEffect();
    return;
  }
  
  // UI更新
  massSlider.value = BH_Mass_solar;
  massNumber.value = BH_Mass_solar;
  
  // 物理量の更新
  updateBHScale();
  updateMetrics();
  
  // 視覚効果: 追加パーティクル生成
  spawnAdditionalParticles();
  
  // カメラシェイク
  applyCameraShake();
  
  requestAnimationFrame(evaporationLoop);
}
```

## 視覚効果

### 1. パーティクル生成
- 蒸発中は通常より多くのパーティクルを生成
- 高温のパーティクルを強調

### 2. カメラシェイク
- 蒸発中はカメラを微細に振動させる
- 強度は質量の減少に応じて増加

### 3. 爆発エフェクト
- 質量が0.001太陽質量以下になったら爆発エフェクトを生成
- 大量の高エネルギーパーティクルを放出
- ブラックホールのメッシュを非表示に

```javascript
function createExplosionEffect() {
  // 大量のパーティクルを生成
  for (let i = 0; i < 1000; i++) {
    spawnParticleAt({
      position: new THREE.Vector3(0, 0, 0),
      velocity: randomDirection().multiplyScalar(10),
      temperature: 1e10,
      species: Math.random() < 0.7 ? 0 : (Math.random() < 0.9 ? 1 : 2)
    });
  }
  
  // ブラックホールを非表示
  bhMesh.visible = false;
  horizonHalo.visible = false;
}
```

## 状態管理

### 変数
- `isEvaporating`: 蒸発中フラグ（boolean）
- `evaporationRate`: 蒸発速度係数（100倍）
- `lastEvaporationTime`: 最後の蒸発更新時刻

### 関数
- `startEvaporation()`: 蒸発を開始
- `stopEvaporation()`: 蒸発を停止
- `evaporationLoop()`: 蒸発アニメーションループ
- `createExplosionEffect()`: 爆発エフェクト生成

## CSS要件

### ボタンスタイル
```css
.evaporate-controls {
  position: fixed;
  top: 70px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.evaporate-btn-small {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(100, 50, 150, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  cursor: pointer;
  transition: all 0.3s;
}

.evaporate-btn-small:hover {
  background: rgba(100, 50, 150, 0.5);
  transform: scale(1.1);
}

.evaporating {
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

## イベントリスナー

```javascript
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
```

## 完了時の処理

質量が0.001太陽質量以下になったら：
1. 蒸発を自動停止
2. 爆発エフェクトを生成
3. ブラックホールを非表示
4. アラート表示（オプション）
5. ボタン状態をリセット

## 注意事項

- 蒸発中は通常のパーティクル生成と並行して動作
- 質量の更新は`updateBHScale()`と`updateMetrics()`で反映
- パフォーマンスに注意（大量のパーティクル生成時）
- カメラシェイクは控えめに（ユーザー体験への影響を最小化）

