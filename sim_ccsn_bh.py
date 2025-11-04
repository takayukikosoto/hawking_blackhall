import numpy as np

G = 6.67430e-8
c = 2.99792458e10
Msun = 1.98847e33

def poly_gamma(rho, rho_break, g_core=4/3, g_soft=1.30):
    return np.where(rho < rho_break, g_core, g_soft)

def pressure(rho, K, rho_break, g_core, g_soft):
    gam = poly_gamma(rho, rho_break, g_core, g_soft)
    return K * rho**gam, gam

def simulate_ccsn_to_bh(
    M_star_Msun=30.0,
    R_star_cm=2.0e13,
    N=256,
    t_max=5.0,
    dt=1e-4,
    K=1e13,
    rho_break=2e9,
    g_core=4/3,
    g_soft=1.30,
    alpha=0.5
):
    M_star = M_star_Msun * Msun
    mass_frac = np.linspace(0, 1, N, endpoint=False) + 0.5/N
    m_shell = M_star / N * (1.0 + 4.0*(1 - mass_frac))
    m_shell *= M_star / m_shell.sum()

    r = (mass_frac**(1/3)) * R_star_cm
    v = np.zeros_like(r)
    r3 = r**3
    r3_left  = np.concatenate(([0.0], r3[:-1]))
    vol = (4.0/3.0)*np.pi*(r3 - r3_left) + 1e-20
    rho = m_shell / vol

    steps = int(t_max/dt)
    t_log, rs_log, mbh_log, mdot_log = [], [], [], []
    M_bh = 0.0
    bh_active = False
    last_mbh = 0.0

    for k in range(steps):
        t = k*dt
        M_enclosed = np.cumsum(m_shell) + M_bh
        P, gam = pressure(rho, K, rho_break, g_core, g_soft)
        dPdr = np.zeros_like(P)
        dr = np.maximum(r - np.concatenate(([0.0], r[:-1])), 1e-6)
        dPdr[1:] = (P[1:] - P[:-1]) / dr[1:]
        a_grav = - G * M_enclosed / np.maximum(r**2, 1e-6)
        a_pres = - dPdr / np.maximum(rho, 1e-20)
        a_visc = - alpha * v
        a = a_grav + a_pres + a_visc
        v += a * dt
        r += v * dt
        r = np.maximum(r, 1e5)
        r3 = r**3
        r3_left = np.concatenate(([0.0], r3[:-1]))
        vol = (4.0/3.0)*np.pi*(r3 - r3_left) + 1e-20
        rho = m_shell / vol
        rs = 2*G*M_enclosed/c**2
        trapped = r <= rs
        if np.any(trapped):
            idx = np.argmax(trapped)
            absorb_mass = m_shell[:idx+1].sum()
            M_bh += absorb_mass
            m_shell[:idx+1] = 0.0
            r[:idx+1] = np.minimum(r[:idx+1], rs[:idx+1])
            v[:idx+1] = 0.0
            rho[:idx+1] = 1e15
            bh_active = True
        if bh_active:
            rs_now = 2*G*np.cumsum(m_shell)+2*G*M_bh
            rs_now = rs_now/c**2
            acc_mask = (r < 1.2*np.maximum(rs_now, 1e5)) & (m_shell>0)
            if np.any(acc_mask):
                M_bh += m_shell[acc_mask].sum()
                m_shell[acc_mask] = 0.0
                v[acc_mask] = 0.0
        t_log.append(t)
        rs_log.append(np.min(r))
        mdot_log.append((M_bh - last_mbh)/dt if k>0 else 0.0)
        mbh_log.append(M_bh)
        last_mbh = M_bh

    return {
        "t": np.array(t_log).tolist(),
        "r_min": np.array(rs_log).tolist(),
        "M_bh": np.array(mbh_log).tolist(),
        "M_bh_Msun": (np.array(mbh_log)/Msun).tolist(),
        "mdot_bh": np.array(mdot_log).tolist()
    }
