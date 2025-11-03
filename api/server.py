#!/usr/bin/env python3
"""
Hawking Radiation Simulator Pro - API Server
Provides REST API endpoints for physics calculations and simulation data
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import math

app = Flask(__name__)
CORS(app)  # CORSを有効化（フロントエンドからアクセス可能に）

# 物理定数 (SI単位)
G = 6.67430e-11  # 重力定数
c = 299792458  # 光速
hbar = 1.054571817e-34  # 換算プランク定数
kB = 1.380649e-23  # ボルツマン定数
M_sun = 1.98847e30  # 太陽質量
h = 6.62607015e-34  # プランク定数


def schwarzschild_radius(M_kg):
    """シュヴァルツシルト半径を計算"""
    return 2 * G * M_kg / (c * c)


def hawking_temperature(M_kg):
    """ホーキング温度を計算"""
    return (hbar * (c ** 3)) / (8 * math.pi * G * M_kg * kB)


def relative_power_vs_solar(M_kg):
    """太陽質量に対する相対的な放射パワーを計算"""
    return (M_sun / M_kg) ** 2


@app.route('/api/health', methods=['GET'])
def health():
    """ヘルスチェック"""
    return jsonify({
        'status': 'ok',
        'service': 'Hawking Radiation Simulator API',
        'version': '1.0.0'
    })


@app.route('/api/blackhole/calculate', methods=['POST'])
def calculate_blackhole():
    """
    ブラックホールの物理量を計算
    
    Request body:
    {
        "mass_solar": 10.0  // 太陽質量単位
    }
    """
    try:
        data = request.get_json()
        mass_solar = float(data.get('mass_solar', 10.0))
        
        if mass_solar <= 0:
            return jsonify({'error': 'Mass must be positive'}), 400
        
        M_kg = mass_solar * M_sun
        rs = schwarzschild_radius(M_kg)
        temp = hawking_temperature(M_kg)
        power_rel = relative_power_vs_solar(M_kg)
        
        return jsonify({
            'mass_solar': mass_solar,
            'mass_kg': M_kg,
            'schwarzschild_radius_m': rs,
            'hawking_temperature_K': temp,
            'relative_power': power_rel,
            'event_horizon_diameter_m': 2 * rs
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/particles/spawn-rate', methods=['POST'])
def calculate_spawn_rate():
    """
    パーティクルの生成率を計算
    
    Request body:
    {
        "mass_solar": 10.0,
        "pair_rate_ui": 0.45
    }
    """
    try:
        data = request.get_json()
        mass_solar = float(data.get('mass_solar', 10.0))
        pair_rate_ui = float(data.get('pair_rate_ui', 0.45))
        
        M_kg = mass_solar * M_sun
        rel_power = relative_power_vs_solar(M_kg)
        
        base_rate = 300.0
        rate = base_rate * pair_rate_ui * max(0.01, rel_power)
        
        return jsonify({
            'spawn_rate_per_second': rate,
            'relative_power': rel_power,
            'base_rate': base_rate
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 400


@app.route('/api/physics/constants', methods=['GET'])
def get_constants():
    """物理定数を返す"""
    return jsonify({
        'G': G,
        'c': c,
        'hbar': hbar,
        'kB': kB,
        'M_sun': M_sun,
        'h': h
    })


if __name__ == '__main__':
    print('🔬 Hawking Radiation Simulator Pro - API Server')
    print('📡 Starting API server on http://localhost:5000')
    print('📚 API Documentation:')
    print('   GET  /api/health')
    print('   POST /api/blackhole/calculate')
    print('   POST /api/particles/spawn-rate')
    print('   GET  /api/physics/constants')
    app.run(host='0.0.0.0', port=5000, debug=True)

