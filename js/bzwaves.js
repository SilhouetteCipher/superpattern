// BZ Waves: the wavefronts of an excitable medium, the Belousov–Zhabotinsky reaction in a dish. A pacemaker
// sends out a wave every period. In a *target* source that wave is a ring. In a *spiral* source it is a broken
// front rotating round a phase singularity, so the crests form an m-armed Archimedean spiral of constant pitch λ.
// Each source i has a wave phase (in periods)
//   Φ_i(x) = r_i/λ − s_i·m_i·θ_i/2π + o_i       (s = ±1 chirality, m arms, m = 0 for a target)
// and a crest wherever Φ_i is a whole number. Two waves meeting head-on annihilate, so the medium splits into
// domains, one per source, and on the boundary both fronts arrive together: frac(Φ_i) = frac(Φ_j). Every such
// curve is a valid steady state, so the boundary between i and j is taken as Δ_ij = 0, where Δ_ij is Φ_i − Φ_j
// measured with each source's angle taken from the direction to the other one (so the branch cuts point away,
// behind the cores) and shifted by a whole number of periods to sit near the middle. Crests then meet exactly on
// the boundary and fuse into the V-shaped collision cusps of the real reaction ("merge"), or the domains are
// kept apart by a groove ("seam"). A point belongs to the source with the smallest max_j Δ_ij.
// Each domain draws |frac(Φ_i)| < duty/2 as bands, turned into a pseudo-distance by dividing by |∇Φ_i|, and the
// pinch at a spiral's centre is covered by a round core. Sources are spaced at least (m_i + m_j)/2 + 1
// wavelengths apart so the branch cuts never cross a boundary. Field points can add spiral cores.
(function () {
  const SP = (window.SP = window.SP || {});
  const TAU = Math.PI * 2;
  const MIN_W = 0.6; // narrowest band / gap (mm)

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  function smin(a, b, k) { return -smax(-a, -b, k); }
  const wrap = (a) => a - TAU * Math.round(a / TAU); // to (−π, π]

  SP.generators.bzwaves = {
    id: 'bzwaves',
    name: 'BZ Waves',
    board: true,
    schema: [
      { group: 'Sources' },
      { key: 'kind', label: 'Sources', type: 'select', def: 'mixed', options: [['mixed', 'Spirals and targets'], ['spirals', 'Spirals'], ['pairs', 'Counter-rotating pairs'], ['targets', 'Target rings']] },
      { key: 'count', label: 'Sources (pairs)', min: 1, max: 12, step: 1, def: 5, int: true, rand: [2, 7] },
      { key: 'arms', label: 'Spiral arms', min: 1, max: 3, step: 1, def: 1, int: true, rand: [1, 2] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Waves' },
      { key: 'wavelength', label: 'Wavelength (mm)', min: 3, max: 40, step: 0.1, def: 11, rand: [8, 15] },
      { key: 'width', label: 'Front width (× λ)', min: 0.1, max: 0.9, step: 0.01, def: 0.5, rand: [0.35, 0.6] },
      { key: 'core', label: 'Core size (× λ)', min: 0.1, max: 0.6, step: 0.01, def: 0.24, rand: [0.18, 0.34] },
      { key: 'collide', label: 'Collisions', type: 'select', def: 'merge', options: [['merge', 'Fronts fuse into cusps'], ['seam', 'Domains split by a seam']] },
      { key: 'seam', label: 'Seam gap (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6, rand: [1, 2.6] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.4, rand: [0.2, 0.8] },
      { group: 'Board' },
      { key: 'frame', label: 'Outline', type: 'select', def: 'rect', options: [['rect', 'Rounded rectangle'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'edgeRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { group: 'Field points' },
      { key: 'fieldCores', label: 'Points → spiral cores', type: 'bool', def: true },
      { key: 'fieldThick', label: 'Points → front width', min: -1, max: 1, step: 0.01, def: 0 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 7919 + 13);
      const lam = Math.max(3, p.wavelength);
      const M = Math.max(1, Math.min(3, Math.round(p.arms)));
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2, hw = Math.max(1, B.w / 2 - mg), hh = Math.max(1, B.h / 2 - mg);
      const R = Math.min(hw, hh);
      const inside = p.frame === 'circle' ? (x, y) => Math.hypot(x - cx, y - cy) < R : (x, y) => Math.abs(x - cx) < hw && Math.abs(y - cy) < hh;

      // ---- Pacemakers: dart throwing, spaced so neighbouring domains never see each other's branch cuts ----
      const src = [];
      const farEnough = (x, y, m) => src.every((q) => Math.hypot(x - q.x, y - q.y) >= lam * ((m + q.m) / 2 + 1.2));
      const add = (x, y, m, s) => src.push({ x, y, m, s, o: m ? rand() : 0 });
      const n = Math.max(1, Math.round(p.count));
      for (let k = 0, tries = 0; k < n && tries < 4000; tries++) {
        const x = cx + (rand() * 2 - 1) * hw, y = cy + (rand() * 2 - 1) * hh;
        if (!inside(x, y)) continue;
        if (p.kind === 'pairs') {
          // A broken front curls into two counter-rotating spirals: cores ~(m + 1.2)·λ apart.
          const a = rand() * TAU, d = (lam * (M + 1.2)) / 2;
          const x1 = x + d * Math.cos(a), y1 = y + d * Math.sin(a), x2 = x - d * Math.cos(a), y2 = y - d * Math.sin(a);
          if (!inside(x1, y1) || !inside(x2, y2) || !farEnough(x1, y1, M) || !farEnough(x2, y2, M)) continue;
          const s = rand() < 0.5 ? 1 : -1;
          add(x1, y1, M, s); add(x2, y2, M, -s);
        } else {
          const target = p.kind === 'targets' || (p.kind === 'mixed' && rand() < 0.3);
          const m = target ? 0 : M;
          if (!farEnough(x, y, m)) continue;
          add(x, y, m, rand() < 0.5 ? 1 : -1);
        }
        k++;
      }
      if (!src.length) add(cx, cy, p.kind === 'targets' ? 0 : M, 1);
      if (p.fieldCores) for (const q of points) if (inside(q.x, q.y)) add(q.x, q.y, M, (q.strength || 1) < 0 ? -1 : 1);
      const N = src.length;

      // Pair constants: direction from i to j, and the whole-period shift that centres the Δ_ij = 0 boundary.
      const dir = new Float64Array(N * N), shift = new Float64Array(N * N);
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          dir[i * N + j] = Math.atan2(src[j].y - src[i].y, src[j].x - src[i].x);
        }
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          if (i === j) continue;
          const a = src[i], b = src[j];
          const K = a.o - b.o - (a.s * a.m * dir[i * N + j]) / TAU + (b.s * b.m * dir[j * N + i]) / TAU;
          shift[i * N + j] = K - Math.round(K);
        }

      const rc = (m) => p.core * lam * (0.6 + 0.4 * m);
      const sx = new Float64Array(N), sy = new Float64Array(N), sr = new Float64Array(N), st = new Float64Array(N);
      // Δ_ij with its gradient (analytic), from the per-source dx, dy, r, θ filled in below.
      const delta = (i, j) => {
        const a = src[i], b = src[j];
        const ti = wrap(st[i] - dir[i * N + j]), tj = wrap(st[j] - dir[j * N + i]);
        return (sr[i] - sr[j]) / lam - (a.s * a.m * ti - b.s * b.m * tj) / TAU + shift[i * N + j];
      };
      const gradDelta = (i, j) => {
        const a = src[i], b = src[j];
        const ri = sr[i] + 1e-9, rj = sr[j] + 1e-9;
        const ki = (a.s * a.m) / TAU / (ri * ri), kj = (b.s * b.m) / TAU / (rj * rj);
        const gx = (sx[i] / ri - sx[j] / rj) / lam - (-sy[i] * ki + sy[j] * kj);
        const gy = (sy[i] / ri - sy[j] / rj) / lam - (sx[i] * ki - sx[j] * kj);
        return Math.hypot(gx, gy) + 1e-9;
      };

      const k = Math.max(0.02, p.fillet), g2 = p.collide === 'seam' ? Math.max(MIN_W, p.seam) / 2 : 0;
      const hasThick = points.length && p.fieldThick;
      const dutyAt = (x, y) => {
        let d = p.width + (hasThick ? p.fieldThick * 0.5 * fieldAt(x, y) : 0);
        return Math.min(1 - MIN_W / lam, Math.max(MIN_W / lam, d));
      };
      // Bands of source i as a pseudo-distance in mm (negative inside a front), with its round core.
      const band = (i, duty) => {
        const a = src[i], r = sr[i];
        const phi = r / lam - (a.s * a.m * st[i]) / TAU + a.o;
        const u = Math.abs(phi - Math.round(phi));
        const g = Math.hypot(1 / lam, a.m / (TAU * (r + 1e-9)));
        let d = (u - duty / 2) / g;
        if (a.m) d = smin(d, r - rc(a.m), k);
        return d;
      };

      const outline = p.frame === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - R
        : (() => { const rr = Math.min(p.edgeRound, hw, hh); return (x, y) => { const qx = Math.abs(x - cx) - hw + rr, qy = Math.abs(y - cy) - hh + rr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; }; })();

      const shape = (x, y) => {
        for (let i = 0; i < N; i++) {
          const dx = x - src[i].x, dy = y - src[i].y;
          sx[i] = dx; sy[i] = dy; sr[i] = Math.hypot(dx, dy); st[i] = Math.atan2(dy, dx);
        }
        const duty = dutyAt(x, y);
        if (N === 1) return band(0, duty);
        // Owning domain: smallest worst-case Δ; its binding neighbour j shares the nearest boundary.
        let best = 0, bestS = Infinity, bestJ = 1;
        for (let i = 0; i < N; i++) {
          let s = -Infinity, sj = -1;
          for (let j = 0; j < N; j++) { if (j === i) continue; const v = delta(i, j); if (v > s) { s = v; sj = j; } }
          if (s < bestS) { bestS = s; best = i; bestJ = sj; }
        }
        const i = best, j = bestJ;
        const rho = delta(i, j) / gradDelta(i, j); // ≈ signed mm from the i|j boundary, negative on i's side
        const fi = g2 ? smax(band(i, duty), rho + g2, k) : Math.max(band(i, duty), rho);
        const fj = g2 ? smax(band(j, duty), -rho + g2, k) : Math.max(band(j, duty), -rho);
        return Math.min(fi, fj);
      };

      const DMAX = lam * 2;
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        return smax(Math.max(-DMAX, Math.min(DMAX, shape(x, y))), o, k);
      };
      return { evalFn, domain: { x0: cx - hw - 3, y0: cy - hh - 3, x1: cx + hw + 3, y1: cy + hh + 3 }, count: N };
    },
  };
})();
