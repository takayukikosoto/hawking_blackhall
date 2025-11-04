// GPU-based particle rendering
// Note: Physics calculations are done on CPU and passed to GPU via attributes
// Note: 'position' is automatically provided by Three.js, don't redeclare it

attribute vec3 aVelocity;
attribute float aAge;
attribute float aLifetime;
attribute vec3 aColor;
attribute float aSpecies;

varying float vAlpha;
varying vec3 vColor;

uniform vec3 uPointSizes; // [フォトン, ニュートリノ, グラビトン]

void main() {
    // ライフタイムに基づくアルファ値
    float lifeT = 1.0;
    if (aLifetime > 0.0 && aAge < aLifetime) {
        float normalizedAge = aAge / aLifetime;
        lifeT = clamp(1.0 - normalizedAge, 0.0, 1.0);
    } else {
        lifeT = 0.0;
    }
    
    vAlpha = lifeT * lifeT;
    vColor = aColor;
    
    // 位置が無効な場合は非表示
    if (length(position) > 1e4) {
        gl_Position = vec4(0.0, 0.0, -10.0, 0.0);
        gl_PointSize = 0.0;
        return;
    }
    
    // 位置の変換（Three.jsの標準的な変換）
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // 粒子種別に応じたポイントサイズを選択
    float baseSize;
    if (aSpecies < 0.5) {
        baseSize = uPointSizes.x; // フォトン
    } else if (aSpecies < 1.5) {
        baseSize = uPointSizes.y; // ニュートリノ
    } else {
        baseSize = uPointSizes.z; // グラビトン
    }
    
    // ポイントサイズ（距離とライフタイムに基づく）
    float pointSize = baseSize * (1.0 + 2.0 * lifeT);
    if (-mvPosition.z > 0.001) {
        pointSize /= -mvPosition.z;
    }
    gl_PointSize = max(1.0, pointSize);
}

