#!/usr/bin/env python3
"""
Hawking Radiation Simulator Pro - API Server (FastAPI)
Provides REST API endpoints for physics calculations and simulation data
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Tuple
import math
import numpy as np
from scipy import integrate

# 高度な物理計算モジュールをインポート
try:
    import sys
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from physics_advanced import (
        NBodySolver, SPHSimulator, RadiativeTransfer,
        OrbitalIntegrator, calculate_photon_trajectory_relativistic,
        Particle
    )
    ADVANCED_PHYSICS_AVAILABLE = True
except ImportError as e:
    ADVANCED_PHYSICS_AVAILABLE = False
    print(f"Warning: Advanced physics module not available: {e}")

app = FastAPI(
    title="Hawking Radiation Simulator API",
    description="REST API for physics calculations of Hawking radiation",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 本番では適切なオリジンを指定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 物理定数 (SI単位)
G = 6.67430e-11  # 重力定数
c = 299792458  # 光速
hbar = 1.054571817e-34  # 換算プランク定数
kB = 1.380649e-23  # ボルツマン定数
M_sun = 1.98847e30  # 太陽質量
h = 6.62607015e-34  # プランク定数

# リクエストモデル
class BlackHoleRequest(BaseModel):
    mass_solar: float = Field(gt=0, description="太陽質量単位", example=10.0)

class SpawnRateRequest(BaseModel):
    mass_solar: float = Field(gt=0, description="太陽質量単位", example=10.0)
    pair_rate_ui: float = Field(ge=0, le=1, default=0.45, description="ペア生成率UI値")

class EnergyDistributionRequest(BaseModel):
    mass_solar: float = Field(gt=0, description="太陽質量単位", example=10.0)
    num_samples: int = Field(ge=1, le=10000, default=1000, description="サンプル数")

class GravityRequest(BaseModel):
    mass_solar: float = Field(gt=0, description="太陽質量単位", example=10.0)
    distance_m: float = Field(gt=0, description="ブラックホールからの距離（メートル）", example=1e6)

class PhotonTrajectoryRequest(BaseModel):
    mass_solar: float = Field(gt=0, description="太陽質量単位", example=10.0)
    start_pos: List[float] = Field(description="開始位置 [x, y, z] (m)", example=[1000.0, 0.0, 0.0])
    direction: List[float] = Field(description="初期方向 [dx, dy, dz] (正規化)", example=[-1.0, 0.0, 0.0])
    steps: int = Field(ge=10, le=10000, default=500, description="ステップ数")
    step_size: float = Field(gt=0, default=0.1, description="ステップサイズ")

class NBodyRequest(BaseModel):
    mass_solar: float = Field(gt=0, description="太陽質量単位", example=10.0)
    particles: List[dict] = Field(description="パーティクルのリスト [{'x': float, 'y': float, 'z': float, 'vx': float, 'vy': float, 'vz': float, 'mass': float}]")

class PairGenerationRequest(BaseModel):
    mass_solar: float = Field(gt=0, description="太陽質量単位", example=10.0)
    dt: float = Field(gt=0, default=0.1, description="時間ステップ（秒）", example=0.1)

class InflationSimulationRequest(BaseModel):
    phi_initial: float = Field(default=0.01, description="スカラー場の初期値", example=0.01)
    dphi_initial: float = Field(default=0.0, description="スカラー場の初期速度", example=0.0)
    rho_threshold: float = Field(gt=0, default=1e-4, description="インフレーショントリガー閾値", example=1e-4)
    potential_A: float = Field(gt=0, default=1.2, description="ポテンシャルパラメータA（力の強さ）", example=1.2)
    potential_B: float = Field(gt=0, default=0.2, description="ポテンシャルパラメータB（偽真空位置）", example=0.2)
    potential_C: float = Field(ge=0, default=0.1, description="ポテンシャルパラメータC（真空エネルギー）", example=0.1)
    quantum_fluctuation: bool = Field(default=True, description="量子揺らぎを有効化", example=True)
    dt: float = Field(gt=0, default=0.01, description="時間ステップ", example=0.01)
    steps: int = Field(ge=1, le=10000, default=1000, description="シミュレーションステップ数", example=1000)

class SupernovaSimulationRequest(BaseModel):
    initial_mass_solar: float = Field(gt=0, description="初期恒星質量（太陽質量単位）", example=20.0)
    explosion_energy: float = Field(gt=0, description="爆発エネルギー（J）", example=1e44)
    ejecta_mass_solar: float = Field(gt=0, description="放出物質質量（太陽質量単位）", example=10.0)
    dt: float = Field(gt=0, default=0.01, description="時間ステップ（秒）", example=0.01)
    steps: int = Field(ge=1, le=10000, default=1000, description="シミュレーションステップ数", example=1000)

# 計算関数
def schwarzschild_radius(M_kg: float) -> float:
    """シュヴァルツシルト半径を計算"""
    return 2 * G * M_kg / (c * c)

def hawking_temperature(M_kg: float) -> float:
    """ホーキング温度を計算"""
    return (hbar * (c ** 3)) / (8 * math.pi * G * M_kg * kB)

def relative_power_vs_solar(M_kg: float) -> float:
    """太陽質量に対する相対的な放射パワーを計算"""
    return (M_sun / M_kg) ** 2

def hawking_power_absolute(M_kg: float) -> float:
    """
    ホーキング放射の絶対的な放射パワーを計算（Stefan-Boltzmann則を使用）
    P = σ * A * T^4, where A = 4πr_s^2
    """
    rs = schwarzschild_radius(M_kg)
    temp = hawking_temperature(M_kg)
    sigma = 5.670374419e-8  # Stefan-Boltzmann constant
    area = 4 * math.pi * rs * rs
    return sigma * area * (temp ** 4)

def planck_spectrum(frequency_hz: float, temperature_K: float) -> float:
    """
    プランク分布によるエネルギースペクトル密度を計算
    B_ν(T) = (2hν³/c²) / (exp(hν/kT) - 1)
    """
    if frequency_hz <= 0 or temperature_K <= 0:
        return 0.0
    
    nu = frequency_hz
    T = temperature_K
    
    # Planck's law
    exponent = (h * nu) / (kB * T)
    if exponent > 700:  # expが大きすぎる場合の処理
        return 0.0
    
    numerator = 2 * h * (nu ** 3) / (c ** 2)
    denominator = math.exp(exponent) - 1.0
    
    if denominator <= 0:
        return 0.0
    
    return numerator / denominator

def total_hawking_power_numerical(M_kg: float, frequency_range: tuple = (1e10, 1e30)) -> float:
    """
    数値積分を使用してホーキング放射の総パワーを計算
    より正確な計算（Planck分布の積分）
    """
    temp = hawking_temperature(M_kg)
    
    def integrand(nu):
        return planck_spectrum(nu, temp) * math.pi  # 立体角の積分でπ倍
    
    try:
        result, _ = integrate.quad(integrand, frequency_range[0], frequency_range[1], limit=1000)
        return result
    except:
        # フォールバック: Stefan-Boltzmann則
        return hawking_power_absolute(M_kg)

def energy_distribution_sample(temperature_K: float, num_samples: int = 1000) -> List[float]:
    """
    ホーキング温度に基づくエネルギーの統計的分布を計算
    より正確なエネルギー分布のサンプリング
    """
    kT = kB * temperature_K
    
    # Planck分布からサンプリング（逆変換サンプリングの近似）
    # E = hν として、νの分布からサンプリング
    energies = []
    
    # 典型的な周波数範囲（可視光からガンマ線まで）
    freq_min = 1e14  # 可視光
    freq_max = 1e25  # 高エネルギーガンマ線
    
    for _ in range(num_samples):
        # 累積分布関数の逆関数を使ったサンプリング（簡略版）
        u = np.random.random()
        
        # Planck分布の累積分布の近似
        # より正確には数値積分が必要だが、簡略化
        if u < 0.5:
            # 低エネルギー側
            freq = freq_min * (freq_max / freq_min) ** (u * 2)
        else:
            # 高エネルギー側（指数分布に近い）
            freq = freq_min * (freq_max / freq_min) ** (0.5 + (u - 0.5) * 2)
        
        energy = h * freq
        # Boltzmann因子で重み付け
        weight = math.exp(-energy / (kT))
        if np.random.random() < weight:
            energies.append(energy)
    
    return energies[:num_samples] if len(energies) >= num_samples else energies

def sample_planck_energy(temperature_K: float, num_samples: int) -> List[float]:
    """
    Planck分布からエネルギーをサンプリング（量子揺らぎのペア生成用）
    
    Args:
        temperature_K: ホーキング温度 (K)
        num_samples: サンプル数
    
    Returns:
        エネルギーのリスト (J)
    """
    if num_samples == 0:
        return []
    
    kT = kB * temperature_K
    
    # Planck分布の簡略サンプリング: 指数分布から周波数をサンプリング
    # より正確には逆変換サンプリングが必要だが、簡略化
    energies = []
    for _ in range(num_samples):
        # 典型的な周波数範囲（ホーキング温度に基づく）
        freq_min = kB * temperature_K / h * 0.1  # 低周波数
        freq_max = kB * temperature_K / h * 100  # 高周波数
        
        # 指数分布で周波数をサンプリング（Planck分布の近似）
        u = np.random.random()
        freq = freq_min * (freq_max / freq_min) ** u
        
        # Boltzmann因子で重み付け
        energy = h * freq
        weight = np.exp(-energy / (kT))
        if np.random.random() < weight:
            energies.append(energy)
    
    # サンプル数が足りない場合は補完
    while len(energies) < num_samples:
        freq = np.random.exponential(scale=kB*temperature_K/h)
        energy = h * freq
        energies.append(energy)
    
    return energies[:num_samples]

def gravitational_acceleration(r: float, M_kg: float, rs: float) -> float:
    """
    一般相対論的効果を考慮した重力加速度（簡略版）
    Newton: a = -GM/r²
    相対論的補正（簡略）: a ≈ -GM/r² * (1 + 3rs/r) for r >> rs
    """
    if r <= rs:
        return float('inf')  # 事象の地平線内
    
    newtonian = -G * M_kg / (r * r)
    
    # 相対論的補正（1次の近似）
    correction = 1.0 + 3.0 * rs / r if r > rs * 1.1 else 1.0
    
    return newtonian * correction

# エンドポイント
@app.get("/api/health")
async def health():
    """ヘルスチェック"""
    return {
        "status": "ok",
        "service": "Hawking Radiation Simulator API",
        "version": "1.0.0",
        "framework": "FastAPI"
    }

@app.post("/api/blackhole/calculate")
async def calculate_blackhole(request: BlackHoleRequest):
    """
    ブラックホールの物理量を計算
    
    - **mass_solar**: 太陽質量単位でのブラックホールの質量
    """
    try:
        M_kg = request.mass_solar * M_sun
        rs = schwarzschild_radius(M_kg)
        temp = hawking_temperature(M_kg)
        power_rel = relative_power_vs_solar(M_kg)
        
        # より正確な計算を追加
        power_absolute = hawking_power_absolute(M_kg)
        power_numerical = total_hawking_power_numerical(M_kg)
        
        return {
            "mass_solar": request.mass_solar,
            "mass_kg": M_kg,
            "schwarzschild_radius_m": rs,
            "hawking_temperature_K": temp,
            "relative_power": power_rel,
            "event_horizon_diameter_m": 2 * rs,
            "hawking_power_watts": power_absolute,
            "hawking_power_numerical_watts": power_numerical,
            "surface_area_m2": 4 * math.pi * rs * rs
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/particles/spawn-rate")
async def calculate_spawn_rate(request: SpawnRateRequest):
    """
    パーティクルの生成率を計算
    
    - **mass_solar**: 太陽質量単位でのブラックホールの質量
    - **pair_rate_ui**: UI上のペア生成率（0.0-1.0）
    """
    try:
        M_kg = request.mass_solar * M_sun
        rel_power = relative_power_vs_solar(M_kg)
        
        base_rate = 500.0  # 最新の値に合わせる
        rate = base_rate * request.pair_rate_ui * max(0.01, rel_power)
        
        return {
            "spawn_rate_per_second": rate,
            "relative_power": rel_power,
            "base_rate": base_rate,
            "pair_rate_ui": request.pair_rate_ui
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/physics/constants")
async def get_constants():
    """物理定数を返す"""
    return {
        "G": G,
        "c": c,
        "hbar": hbar,
        "kB": kB,
        "M_sun": M_sun,
        "h": h,
        "units": "SI"
    }

@app.post("/api/particles/energy-distribution")
async def calculate_energy_distribution(request: EnergyDistributionRequest):
    """
    より正確なエネルギーの統計的分布を計算
    
    - **mass_solar**: 太陽質量単位でのブラックホールの質量
    - **num_samples**: サンプル数
    """
    try:
        M_kg = request.mass_solar * M_sun
        temp = hawking_temperature(M_kg)
        
        energies = energy_distribution_sample(temp, request.num_samples)
        
        if len(energies) == 0:
            # フォールバック: 簡易サンプリング
            kT = kB * temp
            energies = [kT * (1 + np.random.exponential(3)) for _ in range(request.num_samples)]
        
        return {
            "energies_joules": energies,
            "mean_energy_joules": float(np.mean(energies)) if len(energies) > 0 else 0.0,
            "temperature_K": temp,
            "num_samples": len(energies)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/physics/gravity")
async def calculate_gravity(request: GravityRequest):
    """
    一般相対論的効果を考慮した重力加速度を計算
    
    - **mass_solar**: 太陽質量単位でのブラックホールの質量
    - **distance_m**: ブラックホールからの距離（メートル）
    """
    try:
        M_kg = request.mass_solar * M_sun
        rs = schwarzschild_radius(M_kg)
        
        acc_relativistic = gravitational_acceleration(request.distance_m, M_kg, rs)
        acc_newtonian = -G * M_kg / (request.distance_m ** 2)
        
        return {
            "distance_m": request.distance_m,
            "schwarzschild_radius_m": rs,
            "newtonian_acceleration_ms2": acc_newtonian,
            "relativistic_acceleration_ms2": acc_relativistic,
            "correction_factor": acc_relativistic / acc_newtonian if acc_newtonian != 0 else 1.0
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/physics/photon-trajectory-relativistic")
async def calculate_photon_trajectory_relativistic(request: PhotonTrajectoryRequest):
    """
    より正確な一般相対論的フォトン軌道計算
    
    - **mass_solar**: 太陽質量単位でのブラックホールの質量
    - **start_pos**: 開始位置 [x, y, z] (m)
    - **direction**: 初期方向 [dx, dy, dz] (正規化)
    - **steps**: ステップ数
    - **step_size**: ステップサイズ
    """
    if not ADVANCED_PHYSICS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Advanced physics module not available")
    
    try:
        M_kg = request.mass_solar * M_sun
        
        trajectory = calculate_photon_trajectory_relativistic(
            tuple(request.start_pos),
            tuple(request.direction),
            M_kg,
            request.steps,
            request.step_size
        )
        
        return {
            "trajectory": trajectory,
            "num_points": len(trajectory),
            "mass_solar": request.mass_solar
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/physics/nbody-gravity")
async def calculate_nbody_gravity(request: NBodyRequest):
    """
    N体問題の重力計算（Tree法の簡略版）
    
    - **mass_solar**: 太陽質量単位でのブラックホールの質量
    - **particles**: パーティクルのリスト
    """
    if not ADVANCED_PHYSICS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Advanced physics module not available")
    
    try:
        M_kg = request.mass_solar * M_sun
        
        # パーティクルオブジェクトに変換
        particles = []
        for p_data in request.particles:
            p = Particle(
                x=p_data.get('x', 0.0),
                y=p_data.get('y', 0.0),
                z=p_data.get('z', 0.0),
                vx=p_data.get('vx', 0.0),
                vy=p_data.get('vy', 0.0),
                vz=p_data.get('vz', 0.0),
                mass=p_data.get('mass', 0.0),
                species=p_data.get('species', 0)
            )
            particles.append(p)
        
        solver = NBodySolver(theta=0.5)
        accelerations = solver.calculate_gravity_tree(particles, M_kg)
        
        return {
            "accelerations": accelerations,
            "num_particles": len(particles)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/pair-generation")
async def generate_quantum_pairs(request: PairGenerationRequest):
    """
    量子揺らぎによるペア生成（Poisson過程 + Planck分布）
    
    - **mass_solar**: 太陽質量単位でのブラックホールの質量
    - **dt**: 時間ステップ（秒）
    
    Returns:
        - temperature: ホーキング温度 (K)
        - particles: 生成された粒子のリスト
            - type: 粒子種別 ("γ", "ν", "g")
            - energy: エネルギー (J)
            - velocity: 速度ベクトル [vx, vy, vz] (m/s)
    """
    try:
        M_kg = request.mass_solar * M_sun
        dt = request.dt
        
        # ホーキング温度を計算
        temp = hawking_temperature(M_kg)
        
        # 基本生成率（1/M²スケーリング）
        base_rate = 500.0  # ベースレート（ペア/秒）
        M_sun_kg = M_sun
        lambda_rate = base_rate * (M_sun_kg / M_kg) ** 2  # 1/M²スケーリング
        
        # Poisson過程で生成数を決定
        n_pairs = np.random.poisson(lambda_rate * dt)
        
        # Planck分布からエネルギーをサンプリング
        energies = sample_planck_energy(temp, n_pairs)
        
        # 粒子種別を確率的に割り当て（γ: 70%, ν: 25%, g: 5%）
        types = np.random.choice(["γ", "ν", "g"], p=[0.7, 0.25, 0.05], size=n_pairs)
        
        # ランダムな方向と速度を生成
        directions = np.random.randn(n_pairs, 3)
        norms = np.linalg.norm(directions, axis=1)
        directions = directions / norms[:, np.newaxis]  # 正規化
        
        # 速度は光速の0.5-1.0倍（粒子種別により異なる）
        speeds = []
        for t in types:
            if t == "γ":
                speed = c * np.random.uniform(0.8, 1.0)  # フォトンは光速に近い
            elif t == "ν":
                speed = c * np.random.uniform(0.6, 0.9)  # ニュートリノ
            else:  # g
                speed = c * np.random.uniform(0.5, 0.8)  # グラビトン
            speeds.append(speed)
        
        speeds = np.array(speeds)
        velocities = directions * speeds[:, np.newaxis]
        
        # 粒子データを構築
        particles = []
        for i in range(n_pairs):
            particles.append({
                "type": types[i],
                "energy": float(energies[i]),
                "velocity": velocities[i].tolist()
            })
        
        return {
            "temperature": temp,
            "particles": particles,
            "num_pairs": n_pairs,
            "rate_per_second": lambda_rate
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/physics/sph-density")
async def calculate_sph_density(particles_data: List[dict]):
    """
    SPH法による密度計算
    
    - **particles**: パーティクルのリスト（mass必須）
    """
    if not ADVANCED_PHYSICS_AVAILABLE:
        raise HTTPException(status_code=503, detail="Advanced physics module not available")
    
    try:
        particles = []
        for p_data in particles_data:
            p = Particle(
                x=p_data.get('x', 0.0),
                y=p_data.get('y', 0.0),
                z=p_data.get('z', 0.0),
                vx=p_data.get('vx', 0.0),
                vy=p_data.get('vy', 0.0),
                vz=p_data.get('vz', 0.0),
                mass=p_data.get('mass', 1.0)  # デフォルト質量
            )
            particles.append(p)
        
        sph = SPHSimulator(smoothing_length=1.0)
        densities = sph.calculate_density(particles)
        pressures = sph.calculate_pressure(densities)
        
        return {
            "densities": densities,
            "pressures": pressures,
            "num_particles": len(particles)
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def potential_function(phi: float, A: float, B: float, C: float) -> float:
    """
    二重井戸ポテンシャル関数
    V(φ) = A * (φ² - B²)² + C
    """
    return A * ((phi ** 2 - B ** 2) ** 2) + C

def inflation_step(
    phi: float,
    dphi: float,
    dt: float,
    A: float,
    B: float,
    C: float,
    rho_threshold: float,
    quantum_fluctuation: bool
) -> dict:
    """
    インフレーションシミュレーションの1ステップ
    
    Returns:
        {
            'phi': 新しいφ値,
            'dphi': 新しいdφ/dt値,
            'rho': エネルギー密度,
            'H': ハッブルパラメータ,
            'T': 再加熱温度,
            'expansion': 膨張因子
        }
    """
    # 量子揺らぎ
    if quantum_fluctuation:
        phi += np.random.normal(0, 0.001)
    
    # エネルギー密度を計算
    V = potential_function(phi, A, B, C)
    rho = 0.5 * dphi * dphi + V
    
    if rho > rho_threshold:
        # インフレーション発動
        H = np.sqrt((8 * np.pi * G / 3) * rho * 1e10)  # スケール調整
        expansion = np.exp(H * dt)
        T = rho * 1e10  # 再加熱温度（簡略）
        
        # フィールドの減衰
        new_phi = phi * 0.95
        new_dphi = dphi * 0.1
    else:
        # 通常の進化
        damping = 0.99
        new_phi = phi + dphi * dt
        new_dphi = (dphi - A * phi * dt) * damping
        expansion = 1.0
        T = 0.0
        H = 0.0
    
    return {
        'phi': float(new_phi),
        'dphi': float(new_dphi),
        'rho': float(rho),
        'H': float(H),
        'T': float(T),
        'expansion': float(expansion)
    }

@app.post("/api/inflation/simulate")
async def simulate_inflation(request: InflationSimulationRequest):
    """
    インフレーションシミュレーション
    
    - **phi_initial**: スカラー場の初期値
    - **dphi_initial**: スカラー場の初期速度
    - **rho_threshold**: インフレーショントリガー閾値
    - **potential_A, B, C**: ポテンシャルパラメータ
    - **quantum_fluctuation**: 量子揺らぎの有効/無効
    - **dt**: 時間ステップ
    - **steps**: シミュレーションステップ数
    
    Returns:
        - trajectory: 時系列データ
        - inflation_triggered: インフレーションが発動したか
        - inflation_time: インフレーション発動時刻（発動しなかった場合はnull）
    """
    try:
        phi = request.phi_initial
        dphi = request.dphi_initial
        trajectory = []
        inflation_triggered = False
        inflation_time = None
        
        for step in range(request.steps):
            result = inflation_step(
                phi, dphi, request.dt,
                request.potential_A,
                request.potential_B,
                request.potential_C,
                request.rho_threshold,
                request.quantum_fluctuation
            )
            
            phi = result['phi']
            dphi = result['dphi']
            
            trajectory.append({
                'time': step * request.dt,
                'phi': result['phi'],
                'dphi': result['dphi'],
                'rho': result['rho'],
                'H': result['H'],
                'T': result['T'],
                'expansion': result['expansion']
            })
            
            # インフレーション発動を検出
            if result['rho'] > request.rho_threshold and not inflation_triggered:
                inflation_triggered = True
                inflation_time = step * request.dt
        
        return {
            'trajectory': trajectory,
            'inflation_triggered': inflation_triggered,
            'inflation_time': inflation_time
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

def calculate_supernova_evolution(initial_mass_solar, explosion_energy, ejecta_mass_solar, dt, steps):
    """
    超新星爆発からブラックホール形成までの進化を計算
    
    Returns:
        trajectory: 時系列データ
        black_hole_formed: ブラックホールが形成されたか
        formation_time: ブラックホール形成時刻
        remnant_mass: 残存質量（太陽質量単位）
        schwarzschild_radius: シュヴァルツシルト半径（km）
    """
    M_sun = 1.989e30  # kg
    G = 6.67430e-11
    c = 299792458
    
    initial_mass_kg = initial_mass_solar * M_sun
    ejecta_mass_kg = ejecta_mass_solar * M_sun
    remnant_mass_kg = initial_mass_kg - ejecta_mass_kg
    
    # シュヴァルツシルト半径
    rs = (2 * G * remnant_mass_kg) / (c * c)
    
    trajectory = []
    black_hole_formed = False
    formation_time = None
    
    explosion_duration = 10.0  # 秒
    collapse_duration = 5.0    # 秒
    
    for step in range(steps):
        t = step * dt
        
        # 段階1: 超新星爆発
        if t < explosion_duration:
            explosion_progress = t / explosion_duration
            core_radius_factor = 1.0 - explosion_progress * 0.5
            energy_release = explosion_energy * explosion_progress
        # 段階2: 重力崩壊
        elif t < explosion_duration + collapse_duration:
            collapse_progress = (t - explosion_duration) / collapse_duration
            core_radius_factor = 0.5 * (1.0 - collapse_progress)
            
            # ブラックホール形成判定
            if collapse_progress > 0.8 and not black_hole_formed:
                black_hole_formed = True
                formation_time = t
        else:
            core_radius_factor = 0.0
        
        trajectory.append({
            'time': t,
            'core_radius_factor': core_radius_factor,
            'energy_released': explosion_energy * min(1.0, t / explosion_duration),
            'mass_ejected': ejecta_mass_solar * min(1.0, t / explosion_duration),
            'black_hole_formed': black_hole_formed and t >= formation_time
        })
    
    return {
        'trajectory': trajectory,
        'black_hole_formed': black_hole_formed,
        'formation_time': formation_time,
        'remnant_mass_solar': remnant_mass_kg / M_sun,
        'schwarzschild_radius_km': rs / 1000
    }

@app.post("/api/supernova/simulate")
async def simulate_supernova(request: SupernovaSimulationRequest):
    """
    超新星爆発シミュレーション
    
    - **initial_mass_solar**: 初期恒星質量（太陽質量単位）
    - **explosion_energy**: 爆発エネルギー（J）
    - **ejecta_mass_solar**: 放出物質質量（太陽質量単位）
    - **dt**: 時間ステップ（秒）
    - **steps**: シミュレーションステップ数
    
    Returns:
        - trajectory: 時系列データ
        - black_hole_formed: ブラックホールが形成されたか
        - formation_time: ブラックホール形成時刻
        - remnant_mass_solar: 残存質量
        - schwarzschild_radius_km: シュヴァルツシルト半径
    """
    try:
        result = calculate_supernova_evolution(
            request.initial_mass_solar,
            request.explosion_energy,
            request.ejecta_mass_solar,
            request.dt,
            request.steps
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/")
async def root():
    """ルートエンドポイント"""
    features = [
        "Hawking radiation calculations",
        "Blackbody spectrum (Planck distribution)",
        "Relativistic gravity corrections",
        "Energy distribution sampling"
    ]
    
    if ADVANCED_PHYSICS_AVAILABLE:
        features.extend([
            "Advanced photon trajectory (relativistic)",
            "N-body gravity solver (Tree method)",
            "SPH fluid simulation"
        ])
    
    features.append("Inflation simulation (scalar field dynamics)")
    
    return {
        "message": "Hawking Radiation Simulator Pro API",
        "docs": "/docs",
        "version": "1.0.0",
        "features": features,
        "advanced_physics": ADVANCED_PHYSICS_AVAILABLE
    }

if __name__ == '__main__':
    import uvicorn
    print('🔬 Hawking Radiation Simulator Pro - API Server (FastAPI)')
    print('📡 Starting API server on http://localhost:8001')
    print('📚 API Documentation: http://localhost:8001/docs')
    print('📖 ReDoc: http://localhost:8001/redoc')
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=True)
