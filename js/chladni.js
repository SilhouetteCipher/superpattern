// Chladni: the sand figures of a vibrating plate. Bow a plate dusted with sand and the grains hop off the moving
// antinodes and settle on the nodal lines, the curves where the standing wave is still. For a rectangular plate
// the (n, m) mode is a product of cosines (free edges) or sines (pinned edges), and the classic centre-driven
// figures are the *difference* of a mode and its transpose,
//   f = cos(nπx/W)·cos(mπy/H) + mix·cos(mπx/W)·cos(nπy/H)      (mix = −1 difference, 0 pure mode, +1 sum)
// so one knob slides from the diagonal, X-ish Chladni figures through the plain grid of a single mode to the
// sum form. A circular plate clamped at the rim has modes J_n(z·r/R)·cos(nθ) with z the m-th zero of the Bessel
// function J_n: n nodal diameters and m − 1 nodal circles, mixed with the transposed (m, n) mode the same way.
// The nodal set is the zero contour of f; dividing f by its gradient turns it into an approximate signed
// distance in mm, so the figure can be drawn as nodal *lines* of a set width, as the *plates* between the lines
// separated by a set gap, or as every other plate (one sign of f). Near a crossing f ≈ x·y, so f/|∇f| rounds the
// corners of every plate and band on its own, and the shared outline (the plate's own edge) clips the rest.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_W = 0.6; // narrowest nodal band / plate gap (mm)
  const DMAX = 60; // cap on the pseudo-distance far from any nodal line (mm)
  const H = 0.04; // finite-difference step for the gradient (mm)

  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  // Bessel function of the first kind by Bessel's integral, J_n(x) = (1/π)∫₀^π cos(nτ − x·sin τ) dτ. The integrand
  // is smooth and periodic, so the midpoint rule converges spectrally once it resolves the n + x radians of phase.
  function besselJ(n, x) {
    const M = Math.ceil(2 * (n + Math.abs(x))) + 48;
    let s = 0;
    for (let i = 0; i < M; i++) {
      const t = ((i + 0.5) / M) * Math.PI;
      s += Math.cos(n * t - x * Math.sin(t));
    }
    return s / M;
  }
  // m-th positive zero of J_n (m ≥ 1): scan past the turning point at x ≈ n, bisect each sign change.
  function besselZero(n, m) {
    let x = Math.max(0.5, n), f0 = besselJ(n, x), found = 0;
    const step = 0.25;
    for (let i = 0; i < 2000; i++) {
      const x1 = x + step, f1 = besselJ(n, x1);
      if (f0 === 0 || f0 * f1 < 0) {
        found++;
        if (found === m) {
          let a = x, b = x1, fa = f0;
          for (let k = 0; k < 40; k++) {
            const c = (a + b) / 2, fc = besselJ(n, c);
            if (fa * fc <= 0) b = c; else { a = c; fa = fc; }
          }
          return (a + b) / 2;
        }
      }
      x = x1; f0 = f1;
    }
    return x;
  }
  // Radial profile J_n(z·r/R) tabulated on [0, 1.2·R] and linearly interpolated (the marching grid runs a little
  // past the rim before the outline clips it).
  function radialTable(n, z, R) {
    const N = 1024, rMax = 1.2 * R, tab = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) tab[i] = besselJ(n, (z * (i / N) * rMax) / R);
    return (r) => {
      const u = Math.min(Math.max(r, 0), rMax) / rMax * N, i = Math.min(N - 1, Math.floor(u)), t = u - i;
      return tab[i] * (1 - t) + tab[i + 1] * t;
    };
  }

  SP.generators.chladni = {
    id: 'chladni',
    name: 'Chladni',
    board: true,
    schema: [
      { group: 'Plate' },
      { key: 'plate', label: 'Plate', type: 'select', def: 'free', options: [['free', 'Rectangle, free edges (cos)'], ['pinned', 'Rectangle, pinned edges (sin)'], ['circle', 'Circle, clamped rim (Bessel)']] },
      { key: 'n', label: 'Mode n', min: 0, max: 14, step: 1, def: 5, int: true, rand: [1, 8] },
      { key: 'm', label: 'Mode m', min: 0, max: 14, step: 1, def: 2, int: true, rand: [1, 8] },
      { key: 'mix', label: 'Mix (difference → sum)', min: -1, max: 1, step: 0.01, def: -1, rand: [-1, 1] },
      { key: 'rotate', label: 'Rotate ° (circle)', min: 0, max: 180, step: 0.5, def: 0, rand: [0, 180] },
      { group: 'Draw' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'plates', options: [['plates', 'Plates between the lines'], ['lines', 'Nodal lines (sand)'], ['alt', 'Alternate plates']] },
      { key: 'width', label: 'Line width (mm)', min: 0.6, max: 10, step: 0.05, def: 2.2, rand: [1.2, 4] },
      { key: 'gap', label: 'Plate gap (mm)', min: 0.6, max: 12, step: 0.05, def: 2.6, rand: [1.5, 4.5] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.4, rand: [0.15, 0.8] },
      { group: 'Board' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'edgeRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fieldWarp', label: 'Points → warp lines', min: -2, max: 2, step: 0.01, def: 1 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      // Pinned edges need n, m ≥ 1 (sin(0·x) ≡ 0), and a (0, 0) mode is a flat plate with no nodal line at all.
      const lo = p.plate === 'pinned' ? 1 : 0;
      let n = Math.max(lo, Math.round(p.n)), m = Math.max(lo, Math.round(p.m));
      if (n === 0 && m === 0) m = 1;
      // A mode mixed with its own transpose is the same mode: the difference form would vanish everywhere.
      const mix = n === m ? 0 : p.mix;
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2, hw = Math.max(1, B.w / 2 - mg), hh = Math.max(1, B.h / 2 - mg);
      const warp = points.length && p.fieldWarp ? (x, y) => p.fieldWarp * 0.5 * fieldAt(x, y) : null;

      // ---- Mode shape f(x, y) on the plate ----
      let f, outline;
      if (p.plate === 'circle') {
        const R = Math.min(hw, hh), rot = p.rotate * D2R;
        const gA = radialTable(n, besselZero(n, Math.max(1, m)), R);
        const gB = mix ? radialTable(m, besselZero(m, Math.max(1, n)), R) : null;
        f = (x, y) => {
          const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx) - rot;
          let v = gA(r) * Math.cos(n * th);
          if (gB) v += mix * gB(r) * Math.cos(m * th);
          return v;
        };
        outline = (x, y) => Math.hypot(x - cx, y - cy) - R;
      } else {
        const W = 2 * hw, Hh = 2 * hh, x0 = cx - hw, y0 = cy - hh;
        const wave = p.plate === 'pinned' ? Math.sin : Math.cos;
        const kn = (n * Math.PI), km = (m * Math.PI);
        f = (x, y) => {
          const u = (x - x0) / W, v = (y - y0) / Hh;
          let s = wave(kn * u) * wave(km * v);
          if (mix) s += mix * wave(km * u) * wave(kn * v);
          return s;
        };
        const rr = Math.min(p.edgeRound, hw, hh);
        outline = (x, y) => { const qx = Math.abs(x - cx) - hw + rr, qy = Math.abs(y - cy) - hh + rr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; };
      }
      const F = warp ? (x, y) => f(x, y) + warp(x, y) : f;

      // Pseudo signed distance to the nodal set: f / |∇f| (central differences), capped far from the lines.
      const dist = (x, y) => {
        const v = F(x, y);
        const gx = (F(x + H, y) - F(x - H, y)) / (2 * H), gy = (F(x, y + H) - F(x, y - H)) / (2 * H);
        const g = Math.hypot(gx, gy);
        const d = v / (g + 1e-9);
        return Math.max(-DMAX, Math.min(DMAX, d));
      };

      const w2 = Math.max(MIN_W, p.width) / 2, g2 = Math.max(MIN_W, p.gap) / 2;
      const k = Math.max(0.02, p.fillet);
      let shape;
      if (p.draw === 'lines') shape = (x, y) => Math.abs(dist(x, y)) - w2; // the sand ridge along each nodal line
      else if (p.draw === 'alt') shape = (x, y) => g2 - dist(x, y); // only the plates where f > 0
      else shape = (x, y) => g2 - Math.abs(dist(x, y)); // every plate, inset half a gap from its lines

      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        return smax(shape(x, y), o, k);
      };
      return { evalFn, domain: { x0: mg - 3, y0: mg - 3, x1: B.w - mg + 3, y1: B.h - mg + 3 }, count: 1 };
    },
  };
})();
