// Turing (reaction–diffusion style) labyrinths.
// An activator–inhibitor simulation on a grid: u += dt·tanh(g·(G_a*u − G_i*u + bias)),
// with Gaussian blurs of radius σ and 2σ (the difference-of-Gaussians peaks at wavelength ≈ 6.54σ).
// Cells outside the shape mask are pinned "off", so stripes terminate with round ends at the edge.
// The result is sampled with bicubic interpolation into a smooth implicit field for the shared contour pipeline.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Separable box blur along one axis (running sum, clamped edges).
  function boxAxis(src, dst, nx, ny, r, horiz, wrap) {
    if (r < 1) { dst.set(src); return; }
    const inv = 1 / (2 * r + 1);
    const n = horiz ? nx : ny, lines = horiz ? ny : nx;
    const stride = horiz ? 1 : nx, lstride = horiz ? nx : 1;
    // Edges clamp normally; on a torus (seamless tile) they wrap.
    const at = wrap ? (i) => ((i % n) + n) % n : (i) => (i < 0 ? 0 : i >= n ? n - 1 : i);
    for (let l = 0; l < lines; l++) {
      const base = l * lstride;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[base + at(k) * stride];
      for (let i = 0; i < n; i++) {
        dst[base + i * stride] = acc * inv;
        acc += src[base + at(i + r + 1) * stride] - src[base + at(i - r) * stride];
      }
    }
  }
  // Gaussian ≈ 3 box passes per axis; σx/σy allow anisotropy.
  function boxRadii(sigma) {
    const n = 3;
    const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    const out = [];
    for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
    return out;
  }
  function gauss(src, out, tmp, nx, ny, sx, sy, wrap) {
    const rx = boxRadii(sx), ry = boxRadii(sy);
    let a = src;
    const bufs = [tmp, out];
    let k = 0;
    const pass = (r, h) => { const d = bufs[k++ & 1]; boxAxis(a, d, nx, ny, r, h, wrap); a = d; };
    for (const r of rx) pass(r, true);
    for (const r of ry) pass(r, false);
    if (a !== out) out.set(a);
  }

  // Signed distance to the union of shape cells (negative inside).
  function makeMask(p, B) {
    const cells = [];
    const C = Math.max(1, Math.round(p.cellsX)), R = Math.max(1, Math.round(p.cellsY));
    if (p.shape === 'board') {
      cells.push({ x: B.w / 2, y: B.h / 2, hw: B.w / 2 - p.margin, hh: B.h / 2 - p.margin });
    } else {
      const pitch = p.cellSize + p.cellGap;
      for (let j = 0; j < R; j++)
        for (let i = 0; i < C; i++)
          cells.push({ x: B.w / 2 + (i - (C - 1) / 2) * pitch, y: B.h / 2 + (j - (R - 1) / 2) * pitch, r: p.cellSize / 2 });
    }
    const shape = p.shape;
    const sdf = (x, y) => {
      let d = Infinity;
      for (const c of cells) {
        let v;
        const dx = x - c.x, dy = y - c.y;
        if (shape === 'circle') v = Math.hypot(dx, dy) - c.r;
        else if (shape === 'hex') {
          const qx = Math.abs(dx), qy = Math.abs(dy);
          v = Math.max(qx * 0.8660254 + qy * 0.5, qy) - c.r * 0.9;
        } else {
          const hw = c.hw ?? c.r, hh = c.hh ?? c.r, rr = Math.min(hw, hh) * 0.12;
          const qx = Math.abs(dx) - hw + rr, qy = Math.abs(dy) - hh + rr;
          v = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
        }
        if (v < d) d = v;
      }
      return d;
    };
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of cells) {
      const hw = c.hw ?? c.r, hh = c.hh ?? c.r;
      x0 = Math.min(x0, c.x - hw); x1 = Math.max(x1, c.x + hw);
      y0 = Math.min(y0, c.y - hh); y1 = Math.max(y1, c.y + hh);
    }
    return { sdf, cells, bounds: { x0, y0, x1, y1 }, count: cells.length };
  }

  SP.makeCellMask = makeMask;
  let cache = { key: null, sim: null };

  // Seamless tile: the same simulation on a torus exactly the size of the board (both axes wrap),
  // so the pattern has no edges and repeats perfectly.
  function simulateTorus(p, B, fieldAt, h) {
    const lambda = p.wavelength, MAXN = 640;
    const nx = Math.min(MAXN, Math.max(8, Math.round(B.w / h))), ny = Math.min(MAXN, Math.max(8, Math.round(B.h / h)));
    const cx = B.w / nx, cy = B.h / ny, N = nx * ny;
    const u = new Float32Array(N), A = new Float32Array(N), I = new Float32Array(N), tmp = new Float32Array(N), bias = new Float32Array(N);
    const rand = rng(p.seed * 9973 + 17);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        u[k] = (rand() * 2 - 1) * 0.2;
        bias[k] = p.fieldBias ? p.fieldBias * 0.6 * fieldAt(i * cx, j * cy) : 0;
      }
    const sig = lambda / 6.54 / cx, an = Math.max(0.2, 1 + p.aniso);
    const sax = sig * Math.sqrt(an), say = (sig / Math.sqrt(an)) * (cx / cy);
    let Dmax = 1e-6;
    for (const f of [0.8, 0.9, 1, 1.1, 1.25]) {
      const lam = (lambda / cx) * f;
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tmp[j * nx + i] = Math.cos((2 * Math.PI * i) / lam);
      const Tt = Float32Array.from(tmp);
      gauss(Tt, A, tmp, nx, ny, sax, say, true);
      gauss(Tt, I, tmp, nx, ny, 2 * sax, 2 * say, true);
      const k0 = (ny >> 1) * nx + (nx >> 2);
      let best = k0;
      for (let o = 0; o < Math.ceil(lam); o++) if (Math.abs(Tt[k0 + o]) > Math.abs(Tt[best])) best = k0 + o;
      Dmax = Math.max(Dmax, (A[best] - I[best]) / Tt[best]);
    }
    const c = (1 + p.growth) / Dmax, dt = 0.8, q = p.bias * 0.6;
    for (let it = 0; it < p.iters; it++) {
      gauss(u, A, tmp, nx, ny, sax, say, true);
      gauss(u, I, tmp, nx, ny, 2 * sax, 2 * say, true);
      for (let k = 0; k < N; k++) { const v = u[k]; u[k] = (v + dt * (c * (A[k] - I[k]) + (q + bias[k]) * v * v)) / (1 + dt * (1 + v * v)); }
    }
    const sm = new Float32Array(N), ss = Math.max(0.3, sig * p.smooth);
    gauss(u, sm, tmp, nx, ny, ss, ss * (cx / cy), true);
    let amp = 1e-6;
    for (let k = 0; k < N; k++) amp = Math.max(amp, Math.abs(sm[k]));
    let G = 0;
    for (let k = 0; k < N; k++) {
      sm[k] /= amp;
    }
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const gx = (sm[j * nx + ((i + 1) % nx)] - sm[j * nx + ((i - 1 + nx) % nx)]) / (2 * cx), gy = (sm[((j + 1) % ny) * nx + i] - sm[((j - 1 + ny) % ny) * nx + i]) / (2 * cy);
        G = Math.max(G, gx * gx + gy * gy);
      }
    return { data: sm, nx, ny, torus: true, cellX: cx, cellY: cy, G: Math.sqrt(G) * 1.6 + 1e-6, clipInset: 0 };
  }

  function simulate(p, B, mask, fieldAt, T) {
    const lambda = p.wavelength;
    const h = lambda / p.detail; // mm per grid cell
    if (T) return simulateTorus(p, B, fieldAt, h);
    const th = (p.flowAngle * Math.PI) / 180, ca = Math.cos(th), sa = Math.sin(th);
    // Grid in a frame rotated by flowAngle, covering the mask bounds.
    const bx = mask.bounds, cx = (bx.x0 + bx.x1) / 2, cy = (bx.y0 + bx.y1) / 2;
    const half = Math.hypot(bx.x1 - bx.x0, bx.y1 - bx.y0) / 2 + 2 * lambda;
    let cell = h;
    let n = Math.ceil((2 * half) / cell);
    const MAXN = 640;
    if (n > MAXN) { cell = (2 * half) / MAXN; n = MAXN; }
    const nx = n, ny = n;
    const toWorld = (i, j) => {
      const u = -half + i * cell, v = -half + j * cell;
      return [cx + ca * u - sa * v, cy + sa * u + ca * v];
    };
    const N = nx * ny;
    const u = new Float32Array(N), A = new Float32Array(N), I = new Float32Array(N), tmp = new Float32Array(N);
    const inside = new Uint8Array(N), bias = new Float32Array(N);
    const rand = rng(p.seed * 9973 + 17);
    const inset = p.edgeGap * lambda;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const [x, y] = toWorld(i, j);
        const k = j * nx + i;
        inside[k] = mask.sdf(x, y) < -inset ? 1 : 0;
        u[k] = inside[k] ? (rand() * 2 - 1) * 0.2 : 0;
        bias[k] = p.fieldBias ? p.fieldBias * 0.6 * fieldAt(x, y) : 0;
      }
    // σ in grid cells; anisotropy stretches the kernels along the flow axis.
    const sig = lambda / 6.54 / cell;
    const an = Math.max(0.2, 1 + p.aniso);
    const sax = sig * Math.sqrt(an), say = sig / Math.sqrt(an);
    // Swift–Hohenberg-like update: band-pass growth (DoG peaks at 0.472) with cubic saturation,
    // plus a quadratic term that tips stripes toward spots. Keeps a near-sinusoidal profile,
    // so a level cut gives stripes of uniform width.
    // Measure the discrete operator's peak gain on test waves (box blurs differ from ideal Gaussians).
    let Dmax = 1e-6;
    for (const f of [0.7, 0.8, 0.9, 1, 1.1, 1.25, 1.4]) {
      for (const horiz of [true, false]) {
        const lam = (lambda / cell) * f;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) tmp[j * nx + i] = Math.cos((2 * Math.PI * (horiz ? i : j)) / lam);
        const T = Float32Array.from(tmp);
        gauss(T, A, tmp, nx, ny, sax, say);
        gauss(T, I, tmp, nx, ny, 2 * sax, 2 * say);
        const k = (ny >> 1) * nx + (nx >> 1);
        let best = 0;
        for (let o = 0; o < Math.ceil(lam); o++) { const q = k + (horiz ? o : o * nx); if (Math.abs(T[q]) > Math.abs(T[k + (horiz ? best : best * nx)])) best = o; }
        const q = k + (horiz ? best : best * nx);
        Dmax = Math.max(Dmax, (A[q] - I[q]) / T[q]);
      }
    }
    const eps = p.growth, c = (1 + eps) / Dmax, dt = 0.8, q = p.bias * 0.6;
    for (let it = 0; it < p.iters; it++) {
      gauss(u, A, tmp, nx, ny, sax, say);
      gauss(u, I, tmp, nx, ny, 2 * sax, 2 * say);
      for (let k = 0; k < N; k++) {
        if (!inside[k]) { u[k] = 0; continue; } // neutral boundary: no forced ring
        const v = u[k];
        // Linear decay and cubic saturation treated implicitly: unconditionally stable.
        u[k] = (v + dt * (c * (A[k] - I[k]) + (q + bias[k]) * v * v)) / (1 + dt * (1 + v * v));
      }
    }
    let amp = 1e-6;
    for (let k = 0; k < N; k++) if (inside[k] && Math.abs(u[k]) > amp) amp = Math.abs(u[k]);
    for (let k = 0; k < N; k++) u[k] = inside[k] ? u[k] / amp : -1;
    // Final smoothing rounds stripe ends.
    const sm = new Float32Array(N);
    const ss = Math.max(0.3, sig * p.smooth);
    gauss(u, sm, tmp, nx, ny, ss, ss);
    // Re-normalise so thickness keeps its meaning whatever the smoothing.
    let amp2 = 1e-6;
    for (let k = 0; k < N; k++) if (inside[k] && Math.abs(sm[k]) > amp2) amp2 = Math.abs(sm[k]);
    for (let k = 0; k < N; k++) sm[k] /= amp2;
    // Lipschitz bound of the interpolated field (per mm), used to scale into a distance-like field.
    let G = 0;
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        const gx = (sm[k + 1] - sm[k - 1]) / 2, gy = (sm[k + nx] - sm[k - nx]) / 2;
        const gg = gx * gx + gy * gy;
        if (gg > G) G = gg;
      }
    G = (Math.sqrt(G) / cell) * 1.6 + 1e-6;
    // Analytic outline sits inside the pixel mask edge, past any stair-stepping.
    const clipInset = inset + cell * (2 + 2 * ss);
    return { data: sm, nx, ny, cell, half, cx, cy, ca, sa, G, clipInset };
  }

  // Catmull–Rom bicubic sample of the grid at world (x, y).
  function sample(s, x, y) {
    if (s.torus) {
      const gu = x / s.cellX, gv = y / s.cellY, i = Math.floor(gu), j = Math.floor(gv), tx = gu - i, ty = gv - j;
      const nx = s.nx, ny = s.ny, d = s.data;
      const wt = (t) => { const t2 = t * t, t3 = t2 * t; return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2]; };
      const wx = wt(tx), wy = wt(ty);
      let v = 0;
      for (let b = 0; b < 4; b++) {
        const row = ((((j - 1 + b) % ny) + ny) % ny) * nx;
        let acc = 0;
        for (let a = 0; a < 4; a++) acc += wx[a] * d[row + ((((i - 1 + a) % nx) + nx) % nx)];
        v += wy[b] * acc;
      }
      return v;
    }
    const dx = x - s.cx, dy = y - s.cy;
    const gu = (s.ca * dx + s.sa * dy + s.half) / s.cell, gv = (-s.sa * dx + s.ca * dy + s.half) / s.cell;
    const i = Math.floor(gu), j = Math.floor(gv);
    const tx = gu - i, ty = gv - j;
    if (i < 1 || j < 1 || i >= s.nx - 2 || j >= s.ny - 2) return -1;
    const d = s.data, nx = s.nx;
    const w = (t) => {
      const t2 = t * t, t3 = t2 * t;
      return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2];
    };
    const wx = w(tx), wy = w(ty);
    let v = 0;
    for (let b = 0; b < 4; b++) {
      const row = (j - 1 + b) * nx + i - 1;
      v += wy[b] * (wx[0] * d[row] + wx[1] * d[row + 1] + wx[2] * d[row + 2] + wx[3] * d[row + 3]);
    }
    return v;
  }

  function smax(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  }

  SP.generators.turing = {
    id: 'turing',
    name: 'Turing',
    board: true,
    tileable: true,
    noTween: true, // each frame would re-run the simulation
    schema: [
      { group: 'Shape' },
      { key: 'shape', label: 'Shape', type: 'select', def: 'circle', options: [['circle', 'Circle'], ['hex', 'Hexagon'], ['square', 'Rounded square'], ['board', 'Whole board']], randomize: false },
      { key: 'cellsX', label: 'Cells across', min: 1, max: 8, step: 1, def: 1, int: true },
      { key: 'cellsY', label: 'Cells down', min: 1, max: 8, step: 1, def: 1, int: true },
      { key: 'cellSize', label: 'Cell size (mm)', min: 10, max: 400, step: 0.5, def: 160 },
      { key: 'cellGap', label: 'Cell gap (mm)', min: 0, max: 60, step: 0.5, def: 12 },
      { key: 'margin', label: 'Board margin', min: 0, max: 40, step: 0.5, def: 10 },
      { group: 'Pattern' },
      { key: 'wavelength', label: 'Stripe spacing (mm)', min: 2, max: 60, step: 0.1, def: 20, rand: [14, 26] },
      { key: 'thickness', label: 'Stripe thickness', min: -0.9, max: 0.9, step: 0.01, def: -0.15, rand: [-0.3, 0.1] },
      { key: 'bias', label: 'Stripes → spots', min: -2, max: 2, step: 0.01, def: 0, rand: [-0.3, 0.3] },
      { key: 'aniso', label: 'Flow strength', min: -0.8, max: 3, step: 0.01, def: 0, rand: [0, 0.8] },
      { key: 'flowAngle', label: 'Flow angle °', min: -180, max: 180, step: 1, def: 0, rand: [-90, 90] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'smooth', label: 'Roundness', min: 0, max: 2, step: 0.01, def: 1.0 },
      { key: 'edgeGap', label: 'Edge inset (× spacing)', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'clip', label: 'Clip to outline (off = natural lobes)', type: 'bool', def: true },
      { key: 'edgeRound', label: 'Edge roundness (mm)', min: 0.05, max: 8, step: 0.01, def: 1.5 },
      { group: 'Simulation' },
      { key: 'iters', label: 'Iterations', min: 10, max: 400, step: 1, def: 90, int: true },
      { key: 'growth', label: 'Growth rate', min: 0.05, max: 1.5, step: 0.01, def: 1.2 },
      { key: 'detail', label: 'Grid detail (px / spacing)', min: 5, max: 20, step: 1, def: 12, int: true },
      { group: 'Field points' },
      { key: 'fieldThick', label: 'Points → thickness', min: -1, max: 1, step: 0.01, def: 0.35 },
      { key: 'fieldBias', label: 'Points → spots/stripes', min: -3, max: 3, step: 0.01, def: 0 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const mask = makeMask(p, B);
      const simKeys = ['shape', 'cellsX', 'cellsY', 'cellSize', 'cellGap', 'margin', 'wavelength', 'bias', 'aniso', 'flowAngle', 'seed', 'smooth', 'edgeGap', 'iters', 'growth', 'detail', 'fieldBias'];
      const T = ctx.tile;
      const key = JSON.stringify([simKeys.map((k) => p[k]), B.w, B.h, p.fieldBias ? points : 0, !!T]);
      if (cache.key !== key) cache = { key, sim: simulate(p, B, mask, fieldAt, T) };
      const s = cache.sim;
      const G = s.G, kr = p.edgeRound, ci = s.clipInset;
      const ft = p.fieldThick && points.length;
      const evalFn = (x, y) => {
        const t = -p.thickness - (ft ? p.fieldThick * fieldAt(x, y) : 0);
        let f = (t - sample(s, x, y)) / G;
        if (p.clip && !T) f = smax(f, mask.sdf(x, y) + ci, kr);
        return f;
      };
      if (T) return { evalFn, domain: { x0: -2, y0: -2, x1: B.w + 2, y1: B.h + 2 }, count: 1 };
      const b = mask.bounds, pad = p.wavelength * 0.5 + 2;
      return { evalFn, domain: { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, count: mask.count };
    },
  };
})();
