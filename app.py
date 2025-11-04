from fastapi import FastAPI
from pydantic import BaseModel
from sim_ccsn_bh import simulate_ccsn_to_bh

app = FastAPI()

class Params(BaseModel):
    M_star_Msun: float = 30.0
    R_star_cm: float = 2.0e13
    N: int = 256
    t_max: float = 5.0
    dt: float = 1e-4
    K: float = 1e13
    rho_break: float = 2e9
    g_core: float = 4/3
    g_soft: float = 1.30
    alpha: float = 0.5

@app.post("/simulate_ccsn_bh")
def run(p: Params):
    return simulate_ccsn_to_bh(**p.model_dump())
