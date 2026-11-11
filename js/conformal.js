// Conformal: a square lattice pushed through a complex function. A conformal map keeps angles, so a small square
// stays a small square however far it is bent: the tiles change size and swing round the map's poles but never
// shear. The rule comes from conformal grid plots and from the logarithmic transform behind Escher's Print Gallery
// and the twisted Droste effect, where log z turns rings and spokes into a straight grid and a rotate-and-scale of
// that grid makes it spiral. Here the map runs from the board into lattice space: W(z) says which lattice point
// every board point lands on. Six maps are offered. log z gives rings and spokes (or a spiral), a ratio of two
// products gives circles round alternating pole pairs (the Apollonian circle net of bipolar coordinates at order 1),
// log(zⁿ − aⁿ) gives Cassini ovals, the Joukowski log gives confocal ellipses and hyperbolae, 1/z gives circles
// tangent at a point, and zⁿ gives hyperbola nets.
// The logarithm is multivalued, and a seam-free lattice needs one circuit of a pole to be a lattice vector: W =
// κ·log ζ with κ = (B − iA)/2π sends the 2πi of a circuit to the lattice vector (A, B), so `divs` and `spiral` are
// integers (and A + B is forced even for the checkerboard, A even for bands, so colours also close up).
// Everything is an implicit field: W is evaluated at the sample, the rounded tile is measured in lattice units and
// converted to mm by 1/|W′| (the local scale, which is exact to first order because the map is conformal), so the gap
// between tiles is the same in mm everywhere. Tiles cannot shrink without limit towards a pole, so each sample finds
// its tile's true centre by Newton's method on W(z) − W(z₀) (using ratio logs, so it never trips over the branch cut)
// and whole tiles are dropped by their measured size at that centre: every sample in a tile agrees, so a tile goes or
// stays in one piece and nothing is cut into a sliver. Poles can carry a solid cap with the clearance kept round it.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_GAP = 0.6; // narrowest gap between tiles (mm)
  const MIN_TILE = 0.8; // narrowest tile or band kept (mm)
  const MIN_ROUND = 0.3; // corner radius left on a tile after the gap is taken off (mm)
  const K = 0.4; // blend between bands and caps (mm)
  const K_EDGE = 1.4; // corner rounding where a tile is clipped by the board outline (mm)

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  function cpow(x, y, n) { let a = 1, b = 0; for (let i = 0; i < n; i++) { const t = a * x - b * y; b = a * y + b * x; a = t; } return [a, b]; }
  const cdiv = (a, b, c, d) => { const q = c * c + d * d || 1e-30; return [(a * c + b * d) / q, (b * c - a * d) / q]; };
  function csqrt(a, b) { const m = Math.sqrt(Math.hypot(a, b)), t = Math.atan2(b, a) / 2; return [m * Math.cos(t), m * Math.sin(t)]; }

  // The maps, in board-centred mm. `f` is ζ for the log maps (W = κ·log ζ) or F for the others (W = κ·F);
  // `df` is ζ′/ζ or F′. `poles` are the points where tiles shrink away.
  function makeMap(kind, n, a, R) {
    if (kind === 'poles') {
      // ζ = (tⁿ − 1)/(tⁿ + 1) with t = z/a: 2n poles of alternating sign on a circle, Apollonian circles at n = 1.
      const poles = [];
      for (let m = 0; m < 2 * n; m++) poles.push([a * Math.cos((m * Math.PI) / n), a * Math.sin((m * Math.PI) / n)]);
      return {
        log: true, poles,
        f(x, y) { const [px, py] = cpow(x / a, y / a, n); return cdiv(px - 1, py, px + 1, py); },
        df(x, y) {
          const [px, py] = cpow(x / a, y / a, n - 1), tn = cpow(x / a, y / a, 2 * n);
          const r = cdiv(2 * n * px, 2 * n * py, tn[0] - 1, tn[1]);
          return [r[0] / a, r[1] / a];
        },
      };
    }
    if (kind === 'cassini') {
      const m = Math.max(2, n), poles = [];
      for (let i = 0; i < m; i++) poles.push([a * Math.cos((i * 2 * Math.PI) / m), a * Math.sin((i * 2 * Math.PI) / m)]);
      return {
        log: true, poles,
        f(x, y) { const [px, py] = cpow(x / a, y / a, m); return [px - 1, py]; },
        df(x, y) { const [px, py] = cpow(x / a, y / a, m - 1), tn = cpow(x / a, y / a, m); const r = cdiv(m * px, m * py, tn[0] - 1, tn[1]); return [r[0] / a, r[1] / a]; },
      };
    }
    if (kind === 'confocal') {
      // ζ = (z + √(z − a)·√(z + a))/a keeps |ζ| ≥ 1, so u ≥ 0 and the focal segment sits on a lattice line.
      const root = (x, y) => { const s = csqrt(x - a, y), t = csqrt(x + a, y); return [s[0] * t[0] - s[1] * t[1], s[0] * t[1] + s[1] * t[0]]; };
      return {
        log: true, poles: [[-a, 0], [a, 0]],
        f(x, y) { const s = root(x, y); return [(x + s[0]) / a, (y + s[1]) / a]; },
        df(x, y) { const s = root(x, y); return cdiv(1, 0, s[0], s[1]); },
      };
    }
    if (kind === 'inversion') {
      return {
        log: false, poles: [[0, 0]],
        f(x, y) { return cdiv(R * R, 0, x, y); },
        df(x, y) { const q = cpow(x, y, 2); return cdiv(-R * R, 0, q[0], q[1]); },
      };
    }
    if (kind === 'power') {
      // Scaled so |F′| = 1 at radius R. No poles: tiles swell at the origin instead.
      const m = Math.max(2, n);
      return {
        log: false, poles: [],
        f(x, y) { const [px, py] = cpow(x / R, y / R, m); return [(px * R) / m, (py * R) / m]; },
        df(x, y) { return cpow(x / R, y / R, m - 1); },
      };
    }
    return { log: true, poles: [[0, 0]], f: (x, y) => [x, y], df: (x, y) => cdiv(1, 0, x, y) }; // spiral: ζ = z
  }

  SP.generators.conformal = {
    id: 'conformal',
    name: 'Conformal',
    board: true,
    schema: [
      { group: 'Map' },
      { key: 'map', label: 'Function', type: 'select', def: 'poles', options: [['poles', 'Alternating poles (Apollonian)'], ['spiral', 'log z (rings, spirals)'], ['cassini', 'Cassini ovals'], ['confocal', 'Confocal ellipses'], ['inversion', 'Inversion 1/z'], ['power', 'Power zⁿ (hyperbolae)']] },
      { key: 'order', label: 'Order', min: 1, max: 6, step: 1, def: 1, int: true, rand: [1, 3], show: (o) => o.map === 'poles' || o.map === 'cassini' || o.map === 'power' },
      { key: 'spread', label: 'Pole spread', min: 0.1, max: 1.2, step: 0.01, def: 0.5, rand: [0.35, 0.85], show: (o) => o.map === 'poles' || o.map === 'cassini' || o.map === 'confocal' },
      { key: 'angle', label: 'Rotate °', min: -180, max: 180, step: 1, def: 0, rand: [-45, 45] },
      { group: 'Lattice' },
      { key: 'divs', label: 'Divisions', min: 6, max: 72, step: 1, def: 28, int: true, rand: [16, 40] },
      { key: 'spiral', label: 'Spiral steps', min: -24, max: 24, step: 1, def: 0, int: true, rand: [-8, 8], show: (o) => o.map === 'poles' || o.map === 'spiral' || o.map === 'cassini' },
      { key: 'drift', label: 'Drift (cells)', min: 0, max: 2, step: 0.01, def: 0, rand: [0, 1], show: (o) => o.map !== 'confocal' },
      { group: 'Tiles' },
      { key: 'pattern', label: 'Pattern', type: 'select', def: 'checker', options: [['checker', 'Checkerboard'], ['tiles', 'Every tile'], ['diamond', 'Diamonds'], ['bands', 'Bands']] },
      { key: 'gap', label: 'Gap (mm)', min: 0.6, max: 8, step: 0.05, def: 1.2, rand: [0.8, 2.2] },
      { key: 'round', label: 'Corner rounding', min: 0, max: 1, step: 0.01, def: 0.4, rand: [0.15, 1], show: (o) => o.pattern !== 'bands' },
      { key: 'minTile', label: 'Smallest tile (mm)', min: 0.8, max: 12, step: 0.1, def: 2, rand: [1.4, 3.5] },
      { key: 'cap', label: 'Pole cap (mm)', min: 0, max: 40, step: 0.5, def: 5, rand: [0, 10] },
      { group: 'Board' },
      { key: 'edge', label: 'At the edge', type: 'select', def: 'clip', options: [['clip', 'Clip to outline'], ['whole', 'Whole tiles only']], show: (o) => o.pattern !== 'bands' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fieldGain', label: 'Points → gap', min: -2, max: 2, step: 0.01, def: 1 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2, hw = Math.max(1, B.w / 2 - mg), hh = Math.max(1, B.h / 2 - mg);
      const R = Math.max(1, Math.min(hw, hh));
      const rot = (p.angle || 0) * D2R, cr = Math.cos(rot), sr = Math.sin(rot);
      const kind = p.map;
      const pattern = p.pattern;
      const bands = pattern === 'bands';
      const map = makeMap(kind, Math.max(1, Math.round(p.order)), Math.max(1, clamp(p.spread, 0.05, 2) * hw), R);

      // ---- Lattice: W = κ·log ζ closes up on the vector (A, B) round a pole; W = κ·F has nothing to close ----
      let divs = Math.max(6, Math.round(p.divs));
      let spiral = kind === 'confocal' || !map.log ? 0 : Math.round(p.spiral);
      if (map.log) {
        if (pattern === 'checker' && (spiral + divs) & 1) divs++;
        if (bands && spiral & 1) spiral += spiral > 0 ? 1 : -1;
      }
      const ka = map.log ? divs / (2 * Math.PI) : divs / (2 * R), kb = map.log ? -spiral / (2 * Math.PI) : 0;
      const drift = kind === 'confocal' ? 0 : p.drift || 0;
      const fmin = 1 / (2 * Math.max(B.w, B.h)); // |W′| floor: cells never measure bigger than this across (zeros of W′)

      const W = (x, y) => {
        const v = map.f(x, y);
        if (!map.log) return [ka * v[0] - kb * v[1], ka * v[1] + kb * v[0]];
        const lx = Math.log(Math.hypot(v[0], v[1]) || 1e-30), ly = Math.atan2(v[1], v[0]);
        return [ka * lx - kb * ly, ka * ly + kb * lx];
      };
      const slope = (x, y) => { const d = map.df(x, y); return [ka * d[0] - kb * d[1], ka * d[1] + kb * d[0]]; };
      // W(z₁) − W(z₀), branch-free: log of the ratio stays on one sheet for nearby points.
      const delta = (x1, y1, x0, y0) => {
        const a = map.f(x1, y1), b = map.f(x0, y0);
        if (!map.log) { const dx = a[0] - b[0], dy = a[1] - b[1]; return [ka * dx - kb * dy, ka * dy + kb * dx]; }
        const q = cdiv(a[0], a[1], b[0], b[1]);
        const lx = Math.log(Math.hypot(q[0], q[1]) || 1e-30), ly = Math.atan2(q[1], q[0]);
        return [ka * lx - kb * ly, ka * ly + kb * lx];
      };
      // Newton: the board point z with W(z) − W(z₀) = q, in at most one-cell steps. Null if it fails to settle,
      // which only happens beside a zero of W′ where the tile is huge and there is nothing to drop anyway.
      const walk = (x0, y0, qx, qy) => {
        let x = x0, y = y0;
        for (let it = 0; it < 14; it++) {
          const r = delta(x, y, x0, y0), d = slope(x, y);
          const ex = qx - r[0], ey = qy - r[1], den = d[0] * d[0] + d[1] * d[1];
          if (den < 1e-16) return null;
          let sx = (ex * d[0] + ey * d[1]) / den, sy = (ey * d[0] - ex * d[1]) / den;
          const s = Math.hypot(sx, sy), mx = 0.75 / Math.sqrt(den);
          if (s > mx) { sx *= mx / s; sy *= mx / s; }
          x += sx; y += sy;
          if (s < 1e-5) return [x, y];
        }
        return null;
      };

      // ---- Board shape, gap, caps ----
      const gap0 = Math.max(MIN_GAP, p.gap);
      const warp = points.length && p.fieldGain ? (x, y) => Math.max(0.3, 1 + p.fieldGain * fieldAt(x, y)) : null;
      const rr = Math.min(6, hw, hh);
      const outline = (x, y, grow) => { const qx = Math.abs(x - cx) - hw - grow + rr, qy = Math.abs(y - cy) - hh - grow + rr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; };
      const minTile = Math.max(MIN_TILE, p.minTile);
      const whole = !bands && p.edge === 'whole';
      // Bands have no tiles to drop, so a pole's cap must reach out to where a band is wide enough to keep.
      let capR = p.cap >= 1 ? p.cap : 0; // a smaller cap would be a speck
      if (bands) for (const q of map.poles) {
        let r = 0.5;
        const ok = (rad) => { for (let a = 0; a < 16; a++) { const th = (a * Math.PI) / 8, d = slope(q[0] + rad * Math.cos(th), q[1] + rad * Math.sin(th)); if (1 / (Math.hypot(d[0], d[1]) || 1e-9) - gap0 < minTile) return false; } return true; };
        while (r < R && !ok(r)) r *= 1.04;
        capR = Math.max(capR, r);
      }
      const poleDist = (x, y) => { let d = Infinity; for (const q of map.poles) d = Math.min(d, Math.hypot(x - q[0], y - q[1])); return d; };
      const toLocal = (X, Y) => { const dx = X - cx, dy = Y - cy; return [dx * cr + dy * sr, -dx * sr + dy * cr]; };
      const toBoard = (x, y) => [cx + x * cr - y * sr, cy + x * sr + y * cr];

      // Keep this tile? Decided at its true centre, so every sample in the tile gets the same answer.
      const keeps = (x, y, qx, qy, g) => {
        const c = walk(x, y, qx, qy);
        if (!c) return true;
        const d = slope(c[0], c[1]);
        const size = 1 / Math.max(Math.hypot(d[0], d[1]), fmin);
        const reach = (pattern === 'diamond' ? 0.5 : 0.71) * size;
        if ((pattern === 'diamond' ? size * 0.71 : size) - g < minTile) return false;
        if (capR > 0 && poleDist(c[0], c[1]) - reach < capR + g) return false;
        const b = toBoard(c[0], c[1]);
        if (whole) return outline(b[0], b[1], -reach) <= 0;
        return outline(b[0], b[1], 0) <= -0.18 * size; // a clipped tile keeps most of itself, never a sliver
      };

      const tile = (qu, qv, m, rmin) => {
        if (pattern === 'diamond') {
          const h = 0.5 * Math.SQRT1_2, s = (qu + qv) * Math.SQRT1_2, t = (qu - qv) * Math.SQRT1_2, rc = Math.min(h, Math.max(clamp(p.round, 0, 1) * h, rmin));
          const a = Math.abs(s) - h + rc, b = Math.abs(t) - h + rc;
          return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) - rc;
        }
        const rc = Math.min(0.5, Math.max(clamp(p.round, 0, 1) * 0.5, rmin));
        const a = Math.abs(qu) - 0.5 + rc, b = Math.abs(qv) - 0.5 + rc;
        return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0) - rc;
      };

      const evalFn = (X, Y) => {
        const z = toLocal(X, Y);
        let x = z[0], y = z[1];
        if (Math.abs(x) + Math.abs(y) < 1e-6) x = 1e-6; // the origin is a pole for two of the maps
        const w = W(x, y), s = slope(x, y);
        const m = Math.max(Math.hypot(s[0], s[1]), fmin);
        const g = gap0 * (warp ? warp(X, Y) : 1);
        const u = w[0] + drift, v = w[1];
        const i = Math.floor(u), j = Math.floor(v);
        const qu = u - i - 0.5, qv = v - j - 0.5;
        const pd = capR > 0 && map.poles.length ? poleDist(x, y) : Infinity;
        const open = (0.5 - Math.max(Math.abs(qu), Math.abs(qv))) / m + g / 2; // distance back to the cell's edge
        let f;
        if (m * minTile > 3 && !bands) return Math.min(open, pd - capR); // far smaller than any kept tile: right by a pole
        if (bands) f = i & 1 ? (0.5 - Math.abs(qu)) / m + g / 2 : (Math.abs(qu) - 0.5) / m + g / 2;
        else if (pattern === 'checker' && (i + j) & 1) f = open;
        else if (!keeps(x, y, -qu, -qv, g)) f = open;
        else f = tile(qu, qv, m, (g / 2 + MIN_ROUND) * m) / m + g / 2;
        if (bands) { f = smax(f, capR + g - pd, K); }
        f = whole ? smax(f, outline(X, Y, 1), K) : smax(f, outline(X, Y, 0), K_EDGE);
        if (pd !== Infinity) f = Math.min(f, pd - capR); // the cap is solid, tiles keep their distance
        return Number.isFinite(f) ? f : g;
      };
      return { evalFn, domain: { x0: mg - 3, y0: mg - 3, x1: B.w - mg + 3, y1: B.h - mg + 3 }, count: 1 };
    },
  };
})();
