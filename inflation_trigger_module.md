# 🪐 Inflation Trigger Module Specification
**Version:** 2025.11  
**Author:** Kosoto  
**Purpose:**  
空間の“狭さ”や“密度”が一定閾値を超えると、真空エネルギー（スカラー場のポテンシャル）が変化し、  
インフレーション的な急膨張をトリガーするモデルを導入する。  
これにより、単なる放射・ホーキング放射に加え、「空間密度から宇宙生成へ」のダイナミクスを再現する。

---

## 🧩 Concept Overview

### 1. Core Idea
- 「空間が狭い＝エネルギー密度が高い」状態をトリガー条件にする。  
- 真空エネルギー（V(φ)）が一定値を超えると、ポテンシャルが変化し“偽の真空”→“真の真空”への遷移が起こる。  
- このポテンシャル遷移を**インフレーション爆発（空間膨張）**としてモデル化する。

### 2. System Behavior
| 状態 | 条件 | 結果 |
|------|------|------|
| Stable | 空間密度 < 臨界値 | 通常の放射シミュレーション |
| Critical | 空間密度 ≈ 臨界値 | スカラー場が不安定化（揺らぎ増加） |
| Inflation | 空間密度 > 臨界値 | 急膨張＋温度上昇（Reheating） |

---

## 🧠 Mathematical Model

### Scalar Field Equation
\[
\rho_{\phi} = \frac{1}{2}\dot{\phi}^2 + V(\phi)
\]
\[
p_{\phi} = \frac{1}{2}\dot{\phi}^2 - V(\phi)
\]

### Friedmann Equation (simplified)
\[
H^2 = \frac{8\pi G}{3}\rho_{\phi}
\]

### Example Potential Function
```python
def potential(phi):
    # Double-well potential (false vacuum to true vacuum)
    return A * (phi**2 - B**2)**2 + C
```

- `A` = curvature strength  
- `B` = potential well position  
- `C` = vacuum energy offset  
- フィールド `φ` が局所的に不安定（空間が狭い・密度高い）になると、`φ` が跳ね上がり、V(φ) が急減 → インフレーション発動。

---

## 🧮 Simulation Parameters

| Parameter | Symbol | Description | Default |
|------------|---------|--------------|----------|
| Scalar field | φ | スカラー場の初期値 | 0.01 |
| Field velocity | ẋ | dφ/dt | 0 |
| Potential curvature | A | 力の強さ | 1.2 |
| Vacuum shift | B | 偽真空位置 | 0.2 |
| Density threshold | ρ_c | インフレーショントリガー閾値 | 1e-4 |
| Expansion rate | H | 膨張率 | auto |
| Reheat temperature | T_r | 再加熱温度 | 10¹⁰ K |

---

## ⚙️ Implementation Example (FastAPI Backend)

```python
from fastapi import FastAPI
import numpy as np

app = FastAPI()

# Constants
G = 6.674e-11
A, B, C = 1.2, 0.2, 0.1
rho_c = 1e-4

def potential(phi):
    return A * (phi**2 - B**2)**2 + C

def inflation_step(phi, dphi, dt):
    rho = 0.5 * dphi**2 + potential(phi)
    if rho > rho_c:
        # inflation: exponential expansion
        H = np.sqrt((8 * np.pi * G / 3) * rho)
        expansion = np.exp(H * dt)
        T = rho * 1e10  # approximate reheating temperature
        return phi * 0.9, dphi * 0.1, expansion, T
    else:
        # normal evolution
        return phi + dphi * dt, dphi - A * phi * dt, 1.0, 0.0

@app.get("/simulate_inflation")
def simulate_inflation(phi: float = 0.01, dphi: float = 0.0, dt: float = 0.01, steps: int = 1000):
    results = []
    for _ in range(steps):
        phi, dphi, expansion, T = inflation_step(phi, dphi, dt)
        results.append({"phi": phi, "expansion": expansion, "temperature": T})
    return {"data": results}
```

---

## 🎨 Frontend Integration (JS Visualization)

- パラメータスライダー：
  - 空間密度（density）
  - スカラー場ポテンシャル（V(φ)）
  - φ初期値
- グラフ：
  - V(φ) vs φ（ポテンシャル曲線）
  - ρ vs time（エネルギー密度推移）
  - expansion vs time（膨張率）

---

## 🔮 Expected Visual Outcome

1. **空間が狭くなる（密度上昇）**  
   → グラフ上で φ が急激に不安定化。  
2. **閾値を超える**  
   → Exponential expansion（インフレーション）発動。  
3. **Reheating（再加熱）**  
   → エネルギーが放射へ変換。光の海が再現。  

---

## 📘 Notes

- 量子揺らぎ導入を考慮する場合、`phi` に乱数項を加える：
  ```python
  phi += np.random.normal(0, 0.001)
  ```
- このモジュールを「ビッグバンの前提条件生成」として利用し、  
  ホーキング放射や重力井戸モデルと連結可能。

---

## 💡 Conceptual Summary
> 「空間が狭すぎると、安定を保つために“膨張”という解を選ぶ。」  
> 物理的にはスカラー場のポテンシャル崩壊、哲学的には「空間が呼吸する」瞬間。  
