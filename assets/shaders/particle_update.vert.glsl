// GPU-based particle update shader (Transform Feedback)
// Updates particle positions, velocities, and ages on GPU

#version 300 es

// Input attributes (current state)
in vec3 aPosition;
in vec3 aVelocity;
in float aAge;
in float aLifetime;
in float aSpecies; // 0: photon, 1: neutrino, 2: graviton
in vec3 aColor;

// Outputs (will be captured by Transform Feedback)
out vec3 vPosition;
out vec3 vVelocity;
out float vAge;
out float vLifetime;
out float vSpecies;
out vec3 vColor;

// Uniforms
uniform float uDeltaTime;
uniform float uTime;
uniform vec3 uBHPosition; // Black hole position (world space)
uniform float uBHRadius; // Schwarzschild radius (visual)
uniform float uGravityStrength; // Gravity constant (visual scale)
uniform float uSoftening; // Softening parameter for gravity
uniform float uSpawnRadius; // Radius where particles spawn
uniform float uRandomSeed; // Random seed for spawning

// Random function (simple hash)
float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
}

// Generate random position on sphere surface
vec3 randomSpherePosition(float radius, float particleId) {
    float theta = acos(1.0 - 2.0 * random(vec2(particleId, uTime)));
    float phi = 2.0 * 3.14159265359 * random(vec2(particleId + 1000.0, uTime));
    return vec3(
        radius * sin(theta) * cos(phi),
        radius * cos(theta),
        radius * sin(theta) * sin(phi)
    );
}

// Generate random velocity
vec3 randomVelocity(vec3 pos, float particleId) {
    vec3 dir = normalize(pos - uBHPosition);
    float speed = 0.6 + 1.8 * random(vec2(particleId + 2000.0, uTime));
    vec3 jitter = vec3(
        random(vec2(particleId + 3000.0, uTime)) - 0.5,
        random(vec2(particleId + 4000.0, uTime)) - 0.5,
        random(vec2(particleId + 5000.0, uTime)) - 0.5
    ) * 0.35;
    return dir * speed + jitter;
}

void main() {
    float particleId = float(gl_VertexID);
    
    // Check if particle is dead
    if (aAge >= aLifetime || aLifetime <= 0.0) {
        // Try to spawn new particle
        float spawnChance = random(vec2(particleId, uTime + uRandomSeed));
        if (spawnChance < 0.01) { // Spawn rate controlled by CPU
            // Spawn new particle
            vec3 spawnPos = randomSpherePosition(uSpawnRadius, particleId);
            vPosition = spawnPos;
            vVelocity = randomVelocity(spawnPos, particleId);
            vAge = 0.0;
            vLifetime = 6.0 + random(vec2(particleId + 6000.0, uTime)) * 4.0;
            vSpecies = floor(random(vec2(particleId + 7000.0, uTime)) * 3.0);
            
            // Set color based on species (simplified)
            if (vSpecies < 0.5) {
                vColor = vec3(1.0, 0.8, 0.6); // Photon (warm)
            } else if (vSpecies < 1.5) {
                vColor = vec3(0.6, 0.9, 1.0); // Neutrino (cyan)
            } else {
                vColor = vec3(0.85, 0.8, 1.0); // Graviton (violet)
            }
        } else {
            // Keep dead
            vPosition = vec3(99999.0);
            vVelocity = vec3(0.0);
            vAge = 1e9;
            vLifetime = 0.0;
            vSpecies = aSpecies;
            vColor = vec3(0.0);
        }
    } else {
        // Update living particle
        vec3 pos = aPosition;
        vec3 vel = aVelocity;
        
        // Calculate distance from black hole
        vec3 toBH = pos - uBHPosition;
        float r2 = dot(toBH, toBH);
        float r = sqrt(r2) + 1e-6;
        
        // Gravity acceleration
        float accMag = -uGravityStrength / (r2 + uSoftening);
        vec3 acc = normalize(toBH) * accMag;
        
        // Update velocity
        vel += acc * uDeltaTime;
        
        // Damping based on species
        float damping = (aSpecies < 0.5) ? 0.998 : (aSpecies < 1.5) ? 0.9995 : 0.999;
        vel *= damping;
        
        // Update position
        pos += vel * uDeltaTime;
        
        // Check if absorbed by black hole
        float newR = length(pos - uBHPosition);
        if (newR < uBHRadius * 1.01) {
            // Absorbed
            vPosition = vec3(99999.0);
            vVelocity = vec3(0.0);
            vAge = vLifetime;
            vLifetime = aLifetime;
            vSpecies = aSpecies;
            vColor = vec3(0.0);
        } else {
            // Update age
            vPosition = pos;
            vVelocity = vel;
            vAge = aAge + uDeltaTime;
            vLifetime = aLifetime;
            vSpecies = aSpecies;
            vColor = aColor;
        }
    }
}

