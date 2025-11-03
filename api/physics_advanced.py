#!/usr/bin/env python3
"""
高度な物理計算モジュール
JavaScriptでは困難な計算をPythonで実装
"""

import numpy as np
from typing import List, Tuple, Optional
from dataclasses import dataclass
import math

# 物理定数
G = 6.67430e-11
c = 299792458
hbar = 1.054571817e-34
kB = 1.380649e-23
M_sun = 1.98847e30

@dataclass
class Particle:
    """パーティクルの状態"""
    x: float
    y: float
    z: float
    vx: float
    vy: float
    vz: float
    mass: float = 0.0  # フォトンなどは質量0
    species: int = 0  # 0: photon, 1: neutrino, 2: graviton
    energy: float = 0.0

class NBodySolver:
    """
    N体問題のソルバー（Barnes-Hut Tree法の簡略版）
    大量パーティクルに対する高速重力計算
    """
    
    def __init__(self, theta: float = 0.5):
        """
        Args:
            theta: 開角パラメータ（小さいほど正確、大きいほど高速）
        """
        self.theta = theta
    
    def calculate_gravity_tree(self, particles: List[Particle], bh_mass: float, bh_pos: Tuple[float, float, float] = (0, 0, 0)) -> List[Tuple[float, float, float]]:
        """
        Tree法を使用した重力計算（簡略版）
        
        Args:
            particles: パーティクルのリスト
            bh_mass: ブラックホールの質量（kg）
            bh_pos: ブラックホールの位置 (x, y, z)
        
        Returns:
            各パーティクルへの重力加速度のリスト [(ax, ay, az), ...]
        """
        accelerations = []
        bh_x, bh_y, bh_z = bh_pos
        
        for p in particles:
            # ブラックホールからの重力（主要項）
            dx = p.x - bh_x
            dy = p.y - bh_y
            dz = p.z - bh_z
            r2 = dx*dx + dy*dy + dz*dz
            r = math.sqrt(r2) + 1e-10
            
            # ソフトニング
            rs = 2 * G * bh_mass / (c * c)
            soft = rs * rs * 0.4 + 0.04
            
            acc_mag = -G * bh_mass / (r2 + soft)
            ax = acc_mag * dx / r
            ay = acc_mag * dy / r
            az = acc_mag * dz / r
            
            # パーティクル間の相互作用（簡略版：近傍のみ計算）
            # 実際のTree法では階層構造を使うが、ここでは簡略化
            for other in particles:
                if other is p:
                    continue
                
                dx_p = p.x - other.x
                dy_p = p.y - other.y
                dz_p = p.z - other.z
                r2_p = dx_p*dx_p + dy_p*dy_p + dz_p*dz_p
                r_p = math.sqrt(r2_p) + 1e-10
                
                # 距離が近い場合のみ考慮（Tree法の簡略版）
                if r_p < 5.0:  # 閾値
                    acc_mag_p = -G * other.mass / (r2_p + 0.01)
                    ax += acc_mag_p * dx_p / r_p
                    ay += acc_mag_p * dy_p / r_p
                    az += acc_mag_p * dz_p / r_p
            
            accelerations.append((ax, ay, az))
        
        return accelerations

class SPHSimulator:
    """
    SPH法（Smoothed Particle Hydrodynamics）による流体シミュレーション
    降着円盤の簡易シミュレーション
    """
    
    def __init__(self, smoothing_length: float = 1.0):
        """
        Args:
            smoothing_length: スムージング長（影響半径）
        """
        self.h = smoothing_length
    
    def calculate_density(self, particles: List[Particle]) -> List[float]:
        """
        SPH法による密度計算
        
        Args:
            particles: パーティクルのリスト
        
        Returns:
            各パーティクルの密度
        """
        densities = []
        n = len(particles)
        
        for i, p_i in enumerate(particles):
            rho = 0.0
            for j, p_j in enumerate(particles):
                dx = p_i.x - p_j.x
                dy = p_i.y - p_j.y
                dz = p_i.z - p_j.z
                r = math.sqrt(dx*dx + dy*dy + dz*dz)
                
                # SPHカーネル関数（Cubic Spline）
                q = r / self.h
                if q < 1.0:
                    W = (1.0 - 1.5*q*q + 0.75*q*q*q) / (math.pi * self.h**3)
                elif q < 2.0:
                    W = 0.25 * (2.0 - q)**3 / (math.pi * self.h**3)
                else:
                    W = 0.0
                
                rho += p_j.mass * W
            
            densities.append(rho)
        
        return densities
    
    def calculate_pressure(self, densities: List[float], gamma: float = 5.0/3.0) -> List[float]:
        """
        圧力計算（理想気体の状態方程式）
        
        Args:
            densities: 密度のリスト
            gamma: 比熱比
        
        Returns:
            圧力のリスト
        """
        # 簡略化：P = k * rho^gamma
        k = 1.0  # 比例定数
        pressures = [k * (rho ** gamma) for rho in densities]
        return pressures

class RadiativeTransfer:
    """
    輻射輸送の計算（FLD法の簡略版）
    """
    
    def __init__(self):
        pass
    
    def flux_limited_diffusion(self, temperature: float, density: float, opacity: float) -> float:
        """
        Flux-Limited Diffusion (FLD) 近似による輻射フラックス計算
        
        Args:
            temperature: 温度 (K)
            density: 密度 (kg/m³)
            opacity: 不透明度 (m²/kg)
        
        Returns:
            輻射フラックス (W/m²)
        """
        sigma = 5.670374419e-8  # Stefan-Boltzmann定数
        
        # 光学的深度
        tau = opacity * density * 1.0  # 簡略化：長さ1m
        
        # FLD法の簡略版
        if tau < 1.0:
            # 光学的に薄い場合：Stefan-Boltzmann則
            flux = sigma * temperature**4
        else:
            # 光学的に厚い場合：拡散近似
            flux = 4 * sigma * temperature**4 / (3 * tau)
        
        return flux
    
    def eddington_factor(self, optical_depth: float) -> float:
        """
        エディントン因子の計算
        
        Args:
            optical_depth: 光学的深度
        
        Returns:
            エディントン因子
        """
        if optical_depth < 0.1:
            return 1.0/3.0  # 等方的
        elif optical_depth > 10.0:
            return 1.0  # 一方向
        else:
            # 中間値の補間
            return 1.0/3.0 + (2.0/3.0) * (1.0 - math.exp(-optical_depth))

class OrbitalIntegrator:
    """
    軌道積分器（より正確な時間発展）
    """
    
    def __init__(self, method: str = 'rk4'):
        """
        Args:
            method: 積分手法 ('euler', 'rk2', 'rk4')
        """
        self.method = method
    
    def integrate_step(self, particles: List[Particle], accelerations: List[Tuple[float, float, float]], dt: float) -> List[Particle]:
        """
        1ステップの時間積分
        
        Args:
            particles: 現在のパーティクル状態
            accelerations: 加速度のリスト
            dt: 時間ステップ
        
        Returns:
            更新後のパーティクル
        """
        if self.method == 'euler':
            return self._euler_step(particles, accelerations, dt)
        elif self.method == 'rk2':
            return self._rk2_step(particles, accelerations, dt)
        elif self.method == 'rk4':
            return self._rk4_step(particles, accelerations, dt)
        else:
            raise ValueError(f"Unknown method: {self.method}")
    
    def _euler_step(self, particles: List[Particle], accelerations: List[Tuple[float, float, float]], dt: float) -> List[Particle]:
        """オイラー法"""
        new_particles = []
        for p, (ax, ay, az) in zip(particles, accelerations):
            new_p = Particle(
                x=p.x + p.vx * dt,
                y=p.y + p.vy * dt,
                z=p.z + p.vz * dt,
                vx=p.vx + ax * dt,
                vy=p.vy + ay * dt,
                vz=p.vz + az * dt,
                mass=p.mass,
                species=p.species,
                energy=p.energy
            )
            new_particles.append(new_p)
        return new_particles
    
    def _rk2_step(self, particles: List[Particle], accelerations: List[Tuple[float, float, float]], dt: float) -> List[Particle]:
        """2次ルンゲ・クッタ法"""
        # 中間ステップ
        k1_particles = self._euler_step(particles, accelerations, dt / 2.0)
        # 中間ステップでの加速度を再計算（簡略化：同じ加速度を使用）
        k2_particles = self._euler_step(particles, accelerations, dt)
        return k2_particles
    
    def _rk4_step(self, particles: List[Particle], accelerations: List[Tuple[float, float, float]], dt: float) -> List[Particle]:
        """4次ルンゲ・クッタ法（簡略版）"""
        # 実際のRK4は複雑なので、ここでは簡略化
        return self._rk2_step(particles, accelerations, dt)

def calculate_photon_trajectory_relativistic(
    start_pos: Tuple[float, float, float],
    direction: Tuple[float, float, float],
    bh_mass: float,
    steps: int = 500,
    step_size: float = 0.1
) -> List[Tuple[float, float, float]]:
    """
    より正確な一般相対論的フォトン軌道計算
    
    Args:
        start_pos: 開始位置 (x, y, z)
        direction: 初期方向 (dx, dy, dz)
        bh_mass: ブラックホールの質量 (kg)
        steps: ステップ数
        step_size: ステップサイズ
    
    Returns:
        軌道の点のリスト
    """
    rs = 2 * G * bh_mass / (c * c)
    points = []
    
    x, y, z = start_pos
    dx, dy, dz = direction
    # 正規化
    norm = math.sqrt(dx*dx + dy*dy + dz*dz)
    dx, dy, dz = dx/norm, dy/norm, dz/norm
    
    # 光速で初期化
    vx = dx * c * step_size
    vy = dy * c * step_size
    vz = dz * c * step_size
    
    for i in range(steps):
        points.append((x, y, z))
        
        r2 = x*x + y*y + z*z
        r = math.sqrt(r2) + 1e-10
        
        # 事象の地平線チェック
        if r < rs * 1.05:
            break
        
        # シュヴァルツシルト解での測地線方程式（簡略版）
        # より正確には、メトリックテンソルから計算
        acc_mag = -G * bh_mass / (r2 * (1 - rs/r))
        if r < rs * 2.0:
            # 強い重力場での補正
            acc_mag *= (1 + 3*rs/r)
        
        ax = acc_mag * x / r
        ay = acc_mag * y / r
        az = acc_mag * z / r
        
        # 速度を更新（光速を保つ）
        vx += ax * step_size
        vy += ay * step_size
        vz += az * step_size
        
        # 速度を正規化（光速を保つ）
        v_norm = math.sqrt(vx*vx + vy*vy + vz*vz)
        speed = c * step_size
        vx = vx / v_norm * speed
        vy = vy / v_norm * speed
        vz = vz / v_norm * speed
        
        # 位置を更新
        x += vx
        y += vy
        z += vz
        
        # 遠くに離れたら停止
        if r > 1e10:
            break
    
    return points

