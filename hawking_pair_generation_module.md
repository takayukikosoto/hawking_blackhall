# Hawking Radiation Simulator - FastAPI Quantum Pair Generation Module

This document describes a **lightweight quantum fluctuation pair generation model** implemented with **FastAPI** for integration with the Hawking Radiation Simulator Pro.  
The model reproduces the qualitative behavior of quantum pair creation near a black hole event horizon, using statistical and thermodynamic approximations suitable for real-time visualization.

---

## 🧩 System Overview

### Frontend (JavaScript)
- Sends **black hole mass (M)** and **simulation time step (Δt)** to the API.  
- Periodically requests `/pair-generation` for particle updates.
- Renders particles (γ / ν / g) using GPU-based visualization.

### Backend (FastAPI, Python)
- Computes Hawking temperature from black hole mass.
- Determines emission rate via **Poisson process**.
- Samples particle energies using **Planck distribution**.
- Assigns particle species probabilistically (γ, ν, g).
- Returns generated particle data (energy, velocity, type).

---

## ⚙️ Implementation

```python
import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# --- Physical constants ---
G = 6.67430e-11
c = 2.99792458e8
h = 6.62607015e-34
kB = 1.380649e-23

class Input(BaseModel):
    mass: float  # kg
    dt: float = 0.1  # seconds

@app.post("/pair-generation")
def generate_pairs(data: Input):
    M = data.mass
    dt = data.dt

    # Hawking temperature
    T_H = (h * c**3) / (8 * np.pi * G * M * kB)

    # Base emission rate (1/M² scaling)
    base_rate = 500
    λ = base_rate * (1 / M**2)
    n = np.random.poisson(λ * dt)

    # Planck-distributed energy sampling
    def sample_energy(T, n):
        freqs = np.random.exponential(scale=kB*T/h, size=n)
        return h * freqs

    energies = sample_energy(T_H, n)
    types = np.random.choice(["γ", "ν", "g"], p=[0.7, 0.2, 0.1], size=n)

    # Random directions and velocities
    directions = np.random.randn(n, 3)
    directions /= np.linalg.norm(directions, axis=1)[:, None]
    speeds = c * np.random.uniform(0.5, 1.0, size=n)

    particles = [
        {
            "type": t,
            "energy": float(e),
            "velocity": (d * v).tolist(),
        }
        for t, e, d, v in zip(types, energies, directions, speeds)
    ]

    return {"temperature": T_H, "particles": particles}
```

---

## 🚀 Frontend Integration (Three.js Example)

```js
async function updateParticles(mass) {
  const res = await fetch("/pair-generation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mass, dt: 0.1 }),
  });
  const data = await res.json();
  for (const p of data.particles) {
    spawnParticle(p.type, p.energy, p.velocity);
  }
}
```

---

## 🧠 Model Summary

| Approach | Cost | Accuracy | Purpose |
|-----------|------|-----------|----------|
| Full QFT simulation | 💀 Very High | Exact | Research use |
| Poisson + Planck | ⚡ Low | Physically consistent | Real-time demo |
| Fixed-rate emission | 🌈 Minimal | Visual only | Education |

This implementation balances **physical realism** and **computational efficiency**, allowing **real-time visualization** of quantum pair creation near an event horizon without requiring GPU-based field computation.
