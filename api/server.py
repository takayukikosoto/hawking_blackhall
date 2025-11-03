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
