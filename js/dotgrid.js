// Dot Grid: a lattice of dots deformed by the field-point intensity F.
//   near an attractor, dots shrink, stretch along the field gradient (pointing at the attractor),
//   get pulled toward it, and cells above a threshold subdivide into 2×2 smaller dots (quadtree).
// Each dot is an exact ellipse; field = min of 1-Lipschitz ellipse bounds (optional smooth merge).
(function () {
  const SP = (window.SP = window.SP || {});

  function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }

  SP.generators.dotgrid = {
    id: 'dotgrid',
    name: 'Dot Grid',
    board: true,
    tileable: true,
    schema: [
      { group: 'Grid' },
      { key: 'lattice', label: 'Lattice', type: 'select', def: 'square', options: [['square', 'Square'], ['hex', 'Hex (offset rows)']] },
      { key: 'cols', label: 'Columns', min: 1, max: 60, step: 1, def: 4, int: true, rand: [4, 12] },
      { key: 'rows', label: 'Rows', min: 1, max: 60, step: 1, def: 4, int: true, rand: [4, 12] },
      { key: 'pitch', label: 'Pitch (mm)', min: 2, max: 60, step: 0.1, def: 24 },
      { key: 'dotR', label: 'Dot size', min: 0.05, max: 0.7, step: 0.005, def: 0.4, rand: [0.3, 0.46] },
      { key: 'shape', label: 'Dot shape', type: 'select', def: 'ellipse', options: [['ellipse', 'Ellipse'], ['squircle', 'Squircle']] },
      { key: 'square', label: 'Squareness', min: 2, max: 12, step: 0.1, def: 4.5, show: (o) => o.shape === 'squircle' },
      { key: 'roundAmt', label: 'Field → rounder', min: 0, max: 2, step: 0.01, def: 0, show: (o) => o.shape === 'squircle' },
      { key: 'angle', label: 'Grid rotation °', min: -90, max: 90, step: 0.5, def: 0 },
      { group: 'Field response' },
      { key: 'gain', label: 'Field gain', min: -3, max: 3, step: 0.01, def: 1 },
      { key: 'shrink', label: 'Shrink', min: -1, max: 1, step: 0.01, def: 0.3, rand: [0.1, 0.5] },
      { key: 'stretch', label: 'Stretch', min: 0, max: 4, step: 0.01, def: 1.6, rand: [0.4, 1.8] },
      { key: 'pull', label: 'Pull toward point', min: -1, max: 1, step: 0.01, def: 0.1, rand: [-0.1, 0.3] },
      { group: 'Smooth transition' },
      { key: 'gather', label: 'Gather (smooth density)', min: -0.9, max: 0.92, step: 0.01, def: 0, rand: [0, 0.6] },
      { key: 'subdiv', label: 'Subdivide above', min: 0.05, max: 3, step: 0.01, def: 0.62, rand: [0.5, 0.9] },
      { key: 'depth', label: 'Subdivision steps', min: 0, max: 5, step: 1, def: 1, int: true },
      { key: 'stepSpread', label: 'Step spacing', min: 0.02, max: 2, step: 0.01, def: 0.62 },
      { key: 'childSize', label: 'Child dot size', min: 0.3, max: 1.5, step: 0.01, def: 0.95 },
      { key: 'childStretch', label: 'Child stretch', min: 0, max: 1, step: 0.01, def: 0.2 },
      { group: 'Finish' },
      { key: 'merge', label: 'Merge (metaball)', min: 0, max: 10, step: 0.01, def: 0 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt } = ctx;
      const T = ctx.tile;
      const C = Math.round(p.cols);
      let R = Math.round(p.rows), a = p.pitch;
      // Seamless: the lattice spans the tile exactly (hex needs an even row count to wrap vertically).
      let ax = a, ay = a;
      if (T) {
        if (T.x) { ax = B.w / C; a = ax; }
        if (T.y) { R = Math.max(1, Math.round(B.h / (a * (p.lattice === 'hex' ? 1 : 1)))); if (p.lattice === 'hex') R = Math.max(2, 2 * Math.round(R / 2)); ay = B.h / R; }
        else ay = a;
      }
      const cx = B.w / 2, cy = B.h / 2;
      const F = (x, y) => p.gain * fieldAt(x, y);
      const e = a * 0.05;
      const ells = [];
      const sq = p.shape === 'squircle' ? Math.max(2, p.square) : 0;
      const ang = T ? 0 : p.angle; // rotation would break the repeat
      const ca = Math.cos((ang * Math.PI) / 180), sa = Math.sin((ang * Math.PI) / 180);
      // Gather: lattice points are pulled toward field points with a smooth falloff, so density rises
      // continuously (no block edges). Each dot is then the image of a circle under the local Jacobian.
      const pts = ctx.points || [];
      const warp = (x, y) => {
        if (!p.gather || !pts.length) return [x, y];
        let dx = 0, dy = 0, wsum = 0;
        for (const q of pts) {
          const w = p.gather * q.strength * SP.falloff(q.falloff, Math.hypot(x - q.x, y - q.y) / Math.max(1e-6, q.radius));
          dx += w * (q.x - x); dy += w * (q.y - y); wsum += Math.abs(w);
        }
        if (wsum > 0.92) { dx *= 0.92 / wsum; dy *= 0.92 / wsum; }
        return [x + dx, y + dy];
      };
      const make = (ux, uy, cell, depth) => {
        const [x, y] = warp(ux, uy);
        const f = F(x, y);
        if (f > p.subdiv + depth * p.stepSpread && depth < p.depth) {
          const q = cell / 4;
          for (const [ox, oy] of [[-q, -q], [q, -q], [-q, q], [q, q]]) make(ux + ca * ox - sa * oy, uy + sa * ox + ca * oy, cell / 2, depth + 1);
          return;
        }
        // Gradient direction of the field: elongation axis and pull direction.
        let gx = F(x + e, y) - F(x - e, y), gy = F(x, y + e) - F(x, y - e);
        const gl = Math.hypot(gx, gy);
        if (gl > 1e-9 && f > 1e-6 && p.stretch > 0) { gx /= gl; gy /= gl; } else { gx = ca; gy = sa; }
        const fc = Math.max(0, f);
        const size = cell * p.dotR * (depth ? p.childSize : 1) * Math.max(0.05, 1 - p.shrink * f);
        const st = 1 + p.stretch * fc * (depth ? p.childStretch : 1);
        let ra = size * Math.sqrt(st), rb = size / Math.sqrt(st), ex = gx, ey = gy;
        if (p.gather && pts.length) {
          // A = J · (stretch ellipse); axes of the resulting ellipse via 2×2 SVD.
          const h = cell * 0.05;
          const px1 = warp(ux + h, uy), px0 = warp(ux - h, uy), py1 = warp(ux, uy + h), py0 = warp(ux, uy - h);
          const J = [(px1[0] - px0[0]) / (2 * h), (py1[0] - py0[0]) / (2 * h), (px1[1] - px0[1]) / (2 * h), (py1[1] - py0[1]) / (2 * h)];
          // M = [[ra·gx, -rb·gy], [ra·gy, rb·gx]] maps the unit circle to the current ellipse.
          const m00 = ra * gx, m01 = -rb * gy, m10 = ra * gy, m11 = rb * gx;
          const a = J[0] * m00 + J[1] * m10, b = J[0] * m01 + J[1] * m11, c = J[2] * m00 + J[3] * m10, d = J[2] * m01 + J[3] * m11;
          const E = a * a + b * b, Fv = a * c + b * d, G = c * c + d * d;
          const root = Math.sqrt(((E - G) / 2) ** 2 + Fv * Fv);
          ra = Math.sqrt(Math.max(1e-9, (E + G) / 2 + root)); rb = Math.sqrt(Math.max(1e-9, (E + G) / 2 - root));
          const th = 0.5 * Math.atan2(2 * Fv, E - G);
          ex = Math.cos(th); ey = Math.sin(th);
        }
        const px = x + gx * p.pull * fc * cell, py = y + gy * p.pull * fc * cell;
        const n = sq ? 2 + (sq - 2) * Math.max(0, 1 - p.roundAmt * fc) : 0;
        ells.push({ x: px, y: py, ux: ex, uy: ey, ra, rb, m: Math.min(ra, rb), n });
      };
      for (let j = 0; j < R; j++)
        for (let i = 0; i < C; i++) {
          const off = p.lattice === 'hex' && j % 2 ? 0.5 : 0;
          if (T) { make((T.x ? (i + off + 0.5) * ax : cx + (i + off - (C - 1) / 2) * ax), (T.y ? (j + 0.5) * ay : cy + (j - (R - 1) / 2) * ay), a, 0); continue; }
          const lx = (i + off - (C - 1) / 2) * a, ly = (j - (R - 1) / 2) * a;
          make(cx + ca * lx - sa * ly, cy + sa * lx + ca * ly, a, 0);
        }

      // Bin ellipses by bounding box for fast lookup.
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const el of ells) { const r = el.ra; x0 = Math.min(x0, el.x - r); y0 = Math.min(y0, el.y - r); x1 = Math.max(x1, el.x + r); y1 = Math.max(y1, el.y + r); }
      if (!ells.length) { x0 = y0 = 0; x1 = B.w; y1 = B.h; }
      const pad = a * 0.6 + p.merge * 2;
      x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const bs = Math.max(a / 2, 1), nbx = Math.ceil((x1 - x0) / bs) + 1, nby = Math.ceil((y1 - y0) / bs) + 1;
      const bins = Array.from({ length: nbx * nby }, () => []);
      const reach = a * 0.75 + p.merge;
      ells.forEach((el, n) => {
        const r = el.ra + reach;
        for (let j = Math.max(0, Math.floor((el.y - r - y0) / bs)); j <= Math.min(nby - 1, Math.floor((el.y + r - y0) / bs)); j++)
          for (let i = Math.max(0, Math.floor((el.x - r - x0) / bs)); i <= Math.min(nbx - 1, Math.floor((el.x + r - x0) / bs)); i++) bins[j * nbx + i].push(n);
      });
      const far = a; // value returned where no dot is near (positive, below the reach so sign is right)
      const k = p.merge;
      const evalFn = (x, y) => {
        const bi = Math.min(nbx - 1, Math.max(0, Math.floor((x - x0) / bs))), bj = Math.min(nby - 1, Math.max(0, Math.floor((y - y0) / bs)));
        let f = far;
        for (const n of bins[bj * nbx + bi]) {
          const el = ells[n];
          const dx = x - el.x, dy = y - el.y;
          const u = (dx * el.ux + dy * el.uy) / el.ra, v = (-dx * el.uy + dy * el.ux) / el.rb;
          const e2 = el.n;
          const nrm = e2 ? Math.pow(Math.pow(Math.abs(u), e2) + Math.pow(Math.abs(v), e2), 1 / e2) : Math.hypot(u, v);
          const d = (nrm - 1) * el.m; // 1-Lipschitz bound (n-norm, n ≥ 2), exact zero set
          f = k > 0 ? smin(f, d, k) : Math.min(f, d);
        }
        return f;
      };
      return { evalFn, domain: { x0, y0, x1, y1 }, count: ells.length };
    },
  };
})();
