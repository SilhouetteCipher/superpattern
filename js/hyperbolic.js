// Hyperbolic: regular {p, q} tilings of the hyperbolic plane drawn in the Poincaré disc, the geometry behind
// Escher's Circle Limit woodcuts. In the disc, straight lines are circular arcs that meet the rim at right angles,
// and congruent tiles shrink toward the rim, so infinitely many fit inside the circle. A tiling exists whenever
// (p − 2)(q − 2) > 4: heptagons three to a vertex, pentagons four to a vertex, squares five to a vertex and so on.
// The construction is the (2, p, q) triangle group. One right triangle with angles π/p (at a tile centre), π/q (at
// a tile vertex) and π/2 (at an edge midpoint) is reflected across its own sides, over and over; the reflections
// are circle inversions, and the triangles they produce tile the whole disc without gaps. The tile edges are the
// hypotenuses of those triangles, the dual tiling {q, p} is the centre–midpoint legs, and all three sides together
// are the kaleidoscope. Triangles are 2-colourable by the parity of the reflections that made them, which is the
// alternating colouring of Circle Limit IV; tiles of {p, q} are 2-colourable when q is even.
// The seed triangle can be moved by a Möbius map so the disc is centred on a tile, a vertex or an edge midpoint.
// Generation stops at the radius where a tile edge would drop below a set length in mm, and everything beyond
// that becomes a solid rim, so there are no hairlines or specks. The field is the exact distance to the arcs,
// binned on a grid; a smooth-min between neighbouring arcs rounds the convex corners of every cell, and the gap
// or band width rounds the concave ones. Drawn as inset cells, as every other cell, or as the arcs themselves.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const TAU = 2 * Math.PI;
  const MIN_W = 0.6; // narrowest band / cell gap (mm)
  const MAX_TRI = 60000; // hard cap on reflected triangles

  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  // Geodesic through two points of the unit disc: a diameter (unit direction u) when the points are collinear
  // with the origin, otherwise the circle (centre c, radius r) through both that meets the unit circle at 90°,
  // i.e. |c|² = r² + 1, so c·z = (|z|² + 1) / 2 for each point.
  function geodesic(a, b) {
    const det = a[0] * b[1] - a[1] * b[0];
    if (Math.abs(det) < 1e-12) {
      const f = Math.hypot(a[0], a[1]) > Math.hypot(b[0], b[1]) ? a : b;
      const h = Math.hypot(f[0], f[1]) || 1;
      return { line: true, u: [f[0] / h, f[1] / h] };
    }
    const ra = (a[0] * a[0] + a[1] * a[1] + 1) / 2, rb = (b[0] * b[0] + b[1] * b[1] + 1) / 2;
    const cx = (ra * b[1] - rb * a[1]) / det, cy = (a[0] * rb - b[0] * ra) / det;
    return { c: [cx, cy], r: Math.sqrt(Math.max(1e-18, cx * cx + cy * cy - 1)) };
  }
  function reflect(g, z) {
    if (g.line) { const d = 2 * (z[0] * g.u[0] + z[1] * g.u[1]); return [d * g.u[0] - z[0], d * g.u[1] - z[1]]; }
    const dx = z[0] - g.c[0], dy = z[1] - g.c[1], s = (g.r * g.r) / (dx * dx + dy * dy || 1e-18);
    return [g.c[0] + dx * s, g.c[1] + dy * s];
  }
  // Which side of a geodesic a point lies on: 1 = inside the circle / left of the diameter.
  const sideOf = (g, z) => (g.line ? (g.u[0] * z[1] - g.u[1] * z[0] > 0 ? 1 : 0) : Math.hypot(z[0] - g.c[0], z[1] - g.c[1]) < g.r ? 1 : 0);
  // Möbius map of the disc sending `a` to the origin: z ↦ (z − a) / (1 − ā·z).
  function moveToOrigin(a, z) {
    const nx = z[0] - a[0], ny = z[1] - a[1];
    const dx = 1 - (a[0] * z[0] + a[1] * z[1]), dy = -(a[0] * z[1] - a[1] * z[0]);
    const dd = dx * dx + dy * dy || 1e-18;
    return [(nx * dx + ny * dy) / dd, (ny * dx - nx * dy) / dd];
  }

  SP.generators.hyperbolic = {
    id: 'hyperbolic',
    name: 'Hyperbolic',
    board: true,
    schema: [
      { group: 'Tiling' },
      { key: 'p', label: 'Sides per tile (p)', min: 3, max: 12, step: 1, def: 7, int: true, rand: [3, 9] },
      { key: 'q', label: 'Tiles per vertex (q)', min: 3, max: 12, step: 1, def: 3, int: true, rand: [3, 8] },
      { key: 'draw', label: 'Draw', type: 'select', def: 'tiles', options: [['tiles', 'Tiles {p, q}'], ['dual', 'Dual tiles {q, p}'], ['kaleido', 'Kaleidoscope triangles']] },
      { key: 'centre', label: 'Centre on', type: 'select', def: 'tile', options: [['tile', 'Tile centre'], ['vertex', 'Vertex'], ['edge', 'Edge midpoint']] },
      { key: 'rotate', label: 'Rotate °', min: 0, max: 180, step: 0.5, def: 90, rand: [0, 180] },
      { group: 'Detail' },
      { key: 'minEdge', label: 'Smallest tile (mm)', min: 1.5, max: 40, step: 0.1, def: 6, rand: [4, 11] },
      { key: 'rim', label: 'Rim (mm)', min: 1, max: 40, step: 0.5, def: 4, rand: [2, 8] },
      { group: 'Draw' },
      { key: 'style', label: 'Style', type: 'select', def: 'cells', options: [['cells', 'Every cell, inset'], ['alt', 'Alternate cells'], ['lines', 'Edges as bands']] },
      { key: 'gap', label: 'Cell gap (mm)', min: 0.6, max: 12, step: 0.05, def: 2.2, rand: [1.4, 3.5], show: (o) => o.style !== 'lines' },
      { key: 'width', label: 'Band width (mm)', min: 0.6, max: 12, step: 0.05, def: 2, rand: [1.2, 3.5], show: (o) => o.style === 'lines' },
      { key: 'round', label: 'Corner rounding (mm)', min: 0, max: 10, step: 0.05, def: 1.5, rand: [0.5, 3] },
      { group: 'Board' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 5 },
      { key: 'fillet', label: 'Edge fillet', min: 0.02, max: 3, step: 0.01, def: 0.4 },
      { key: 'fieldGain', label: 'Points → widen', min: -2, max: 2, step: 0.01, def: 1 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      // A hyperbolic {p, q} needs (p − 2)(q − 2) > 4; push q up until it is.
      const P = Math.max(3, Math.round(p.p));
      let Q = Math.max(3, Math.round(p.q));
      while ((P - 2) * (Q - 2) <= 4) Q++;
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2;
      const R = Math.max(2, Math.min(B.w / 2, B.h / 2) - mg); // disc radius (mm)

      // ---- Fundamental right triangle O (π/p), B (π/q), C (π/2), from the hyperbolic law of cosines ----
      const ap = Math.PI / P, aq = Math.PI / Q;
      const dOB = Math.acosh(Math.max(1, (1 / Math.tan(ap)) * (1 / Math.tan(aq)))); // centre → vertex
      const dOC = Math.acosh(Math.max(1, Math.cos(aq) / Math.sin(ap))); // centre → edge midpoint
      const dBC = Math.acosh(Math.max(1, Math.cos(ap) / Math.sin(aq))); // vertex → edge midpoint
      const rB = Math.tanh(dOB / 2), rC = Math.tanh(dOC / 2);
      let O = [0, 0], Bv = [rB, 0], Cv = [rC * Math.cos(ap), rC * Math.sin(ap)];
      if (p.centre !== 'tile') {
        const a = p.centre === 'vertex' ? Bv : Cv;
        [O, Bv, Cv] = [O, Bv, Cv].map((z) => moveToOrigin(a, z));
      }
      const rot = p.rotate * D2R, cr = Math.cos(rot), sr = Math.sin(rot);
      [O, Bv, Cv] = [O, Bv, Cv].map(([x, y]) => [x * cr - y * sr, x * sr + y * cr]);

      // ---- Where to stop: the Euclidean radius at which a cell's inscribed circle shrinks to `minEdge` mm ----
      // Lengths scale by (1 − r²)/2 at radius r (unit disc), so a hyperbolic length L spans ≈ L·R·(1 − r²)/2 mm.
      // Tiles are measured by their inscribed diameter (2·dOC, or 2·dBC for the dual); kaleidoscope triangles by
      // the incircle of the seed triangle (Euclidean estimate, ×2 for the metric at the origin).
      const draw = p.draw;
      let L;
      if (draw === 'tiles') L = 2 * dOC;
      else if (draw === 'dual') L = 2 * dBC;
      else {
        const eb = Math.hypot(rB, 0), ec = Math.hypot(rC * Math.cos(ap), rC * Math.sin(ap)), ebc = Math.hypot(rB - rC * Math.cos(ap), rC * Math.sin(ap));
        const sp = (eb + ec + ebc) / 2, area = Math.sqrt(Math.max(0, sp * (sp - eb) * (sp - ec) * (sp - ebc)));
        L = 2 * 2 * (area / sp); // 2 × Euclidean inradius × 2 (hyperbolic metric at the origin)
      }
      // Cells narrower than a couple of gaps would be eaten by the inset and leave specks, so the cutoff never
      // drops below that; in band mode the hole inside a cell stays at least one band wide.
      const feat = p.style === 'lines' ? Math.max(MIN_W, p.width) : Math.max(MIN_W, p.gap);
      const minEdge = Math.max(1, p.minEdge, feat * (p.style === 'lines' ? 2 : 2.2));
      const rEdge = Math.sqrt(Math.max(0.06, 1 - (2 * minEdge) / (R * Math.max(1e-6, L))));
      const rcut = Math.max(0.25, Math.min(rEdge, (R - Math.max(1, p.rim)) / R)); // unit-disc radius of the tiled area
      const rcutMM = rcut * R;

      // ---- Reflect the triangle across its sides until the tiled area is covered ----
      // par = [kaleidoscope parity, tile parity (flips across BC), dual parity (flips across OC)].
      const SIDES = [[0, 1, 2, -1], [0, 2, 1, 2], [1, 2, 0, 1]]; // [i, j, opposite, parity index flipped]
      const key = (v) => (((v[0][0] + v[1][0] + v[2][0]) * 1e6) | 0) + ',' + (((v[0][1] + v[1][1] + v[2][1]) * 1e6) | 0);
      const inside = (v) => {
        for (let i = 0; i < 3; i++) {
          if (Math.hypot(v[i][0], v[i][1]) < rcut) return true;
          const j = (i + 1) % 3, mx = (v[i][0] + v[j][0]) / 2, my = (v[i][1] + v[j][1]) / 2;
          if (Math.hypot(mx, my) < rcut) return true;
        }
        return false;
      };
      const seen = new Set();
      const tris = [];
      const seed = { v: [O, Bv, Cv], par: [0, 0, 0], in: true };
      seen.add(key(seed.v));
      tris.push(seed);
      for (let qi = 0; qi < tris.length && tris.length < MAX_TRI; qi++) {
        const t = tris[qi];
        if (!t.in) continue; // one layer past the tiled area, kept but not expanded
        for (const [i, j, k, flip] of SIDES) {
          const g = geodesic(t.v[i], t.v[j]);
          const v = t.v.slice();
          v[k] = reflect(g, t.v[k]);
          const kk = key(v);
          if (seen.has(kk)) continue;
          seen.add(kk);
          const par = t.par.slice();
          par[0] ^= 1;
          if (flip >= 0) par[flip] ^= 1;
          tris.push({ v, par, in: inside(v) });
        }
      }

      // ---- Collect the sides to draw, deduplicated, with the cell parity on each side ----
      // Every triangle side is half a tile edge, and sides that continue along one geodesic are chained into one
      // arc, so the corner rounding below only fires between arcs on different geodesics. Parity is kept per
      // half-edge along the chain, because cells alternate along a mirror line.
      const want = draw === 'tiles' ? [2] : draw === 'dual' ? [1] : [0, 1, 2];
      const parIdx = draw === 'tiles' ? 1 : draw === 'dual' ? 2 : 0;
      const altOK = draw === 'kaleido' || (draw === 'tiles' ? Q % 2 === 0 : P % 2 === 0);
      const style = p.style === 'alt' && !altOK ? 'cells' : p.style;
      const halves = [], hmap = new Map();
      const pk = (z) => Math.round(z[0] * 1e6) + ',' + Math.round(z[1] * 1e6);
      // Canonical side test: inside the circle, or left of the diameter (direction fixed by sign).
      const canon = (g) => { if (g.line && (g.u[0] < 0 || (g.u[0] === 0 && g.u[1] < 0))) g.u = [-g.u[0], -g.u[1]]; return g; };
      const sideU = (g, z) => (g.line ? (g.u[0] * z[1] - g.u[1] * z[0] > 0 ? 1 : 0) : Math.hypot(z[0] - g.c[0], z[1] - g.c[1]) < g.r ? 1 : 0);
      for (const t of tris) {
        for (const si of want) {
          const [i, j, k] = SIDES[si];
          const a = t.v[i], b = t.v[j];
          const ka = pk(a), kb = pk(b), ek = ka < kb ? ka + '|' + kb : kb + '|' + ka;
          let h = hmap.get(ek);
          if (!h) { h = { a, b, g: canon(geodesic(a, b)), par: [0, 0] }; hmap.set(ek, h); halves.push(h); }
          h.par[sideU(h.g, t.v[k])] = t.par[parIdx];
        }
      }
      // Group by geodesic, then chain touching intervals (angle around the centre, or distance along a diameter).
      const groups = new Map();
      for (const h of halves) {
        const g = h.g;
        const gk = g.line ? 'L' + Math.round(g.u[0] * 1e5) + ',' + Math.round(g.u[1] * 1e5) : 'C' + Math.round(g.c[0] * 1e4) + ',' + Math.round(g.c[1] * 1e4) + ',' + Math.round(g.r * 1e4);
        let s0, s1;
        if (g.line) { s0 = h.a[0] * g.u[0] + h.a[1] * g.u[1]; s1 = h.b[0] * g.u[0] + h.b[1] * g.u[1]; }
        else {
          s0 = Math.atan2(h.a[1] - g.c[1], h.a[0] - g.c[0]); s1 = Math.atan2(h.b[1] - g.c[1], h.b[0] - g.c[0]);
          let sw = s1 - s0; sw -= TAU * Math.round(sw / TAU);
          if (sw < 0) { s0 = s1; sw = -sw; }
          s0 -= TAU * Math.floor(s0 / TAU); s1 = s0 + sw;
        }
        if (s1 < s0) [s0, s1] = [s1, s0];
        let grp = groups.get(gk);
        if (!grp) { grp = { g, ivs: [] }; groups.set(gk, grp); }
        grp.ivs.push({ s: s0, e: s1, par: h.par });
      }
      const toMM = (z) => [cx + z[0] * R, cy + z[1] * R];
      const edges = [];
      const EPS = 1e-6;
      for (const { g, ivs } of groups.values()) {
        ivs.sort((u, v) => u.s - v.s);
        const chains = [];
        for (const iv of ivs) {
          const c = chains[chains.length - 1];
          if (c && iv.s <= c.e + EPS) { c.e = Math.max(c.e, iv.e); c.subs.push(iv); }
          else chains.push({ s: iv.s, e: iv.e, subs: [iv] });
        }
        // Arcs wrap at 2π: join the last chain onto the first if they touch across the seam.
        if (!g.line && chains.length > 1) {
          const f = chains[0], l = chains[chains.length - 1];
          if (f.s + TAU <= l.e + EPS) {
            for (const sub of f.subs) { sub.s += TAU; sub.e += TAU; }
            l.subs.push(...f.subs); l.e = Math.max(l.e, f.e + TAU); chains.shift();
          }
        }
        for (const c of chains) {
          if (g.line) {
            const A = toMM([g.u[0] * c.s, g.u[1] * c.s]), Bm = toMM([g.u[0] * c.e, g.u[1] * c.e]);
            edges.push({ line: true, A, B: Bm, u: g.u, len: (c.e - c.s) * R, subs: c.subs.map((iv) => ({ s: (iv.s - c.s) * R, e: (iv.e - c.s) * R, par: iv.par })) });
          } else {
            const cm = toMM(g.c), r = g.r * R;
            const A = [cm[0] + r * Math.cos(c.s), cm[1] + r * Math.sin(c.s)], Bm = [cm[0] + r * Math.cos(c.e), cm[1] + r * Math.sin(c.e)];
            edges.push({ line: false, A, B: Bm, c: cm, r, a0: c.s, sw: c.e - c.s, subs: c.subs.map((iv) => ({ s: iv.s - c.s, e: iv.e - c.s, par: iv.par })) });
          }
        }
      }

      // ---- Spatial bins over the disc; every edge is registered wherever it can be within Q mm ----
      const w2 = Math.max(MIN_W, p.width) / 2, g2 = Math.max(MIN_W, p.gap) / 2;
      const kr = Math.max(0, p.round);
      const QD = Math.max(w2, g2) * 2.5 + kr + 1; // distance cap; beyond it the exact value never matters
      const cs = Math.max(2, Math.min(6, QD));
      const x0 = cx - R - cs, y0 = cy - R - cs;
      const nx = Math.ceil((2 * R + 2 * cs) / cs) + 1, ny = nx;
      const bins = new Array(nx * ny);
      const addBox = (idx, bx0, by0, bx1, by1, marks) => {
        const i0 = Math.max(0, Math.floor((bx0 - QD - x0) / cs)), i1 = Math.min(nx - 1, Math.floor((bx1 + QD - x0) / cs));
        const j0 = Math.max(0, Math.floor((by0 - QD - y0) / cs)), j1 = Math.min(ny - 1, Math.floor((by1 + QD - y0) / cs));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const b = j * nx + i;
          if (marks.has(b)) continue;
          marks.add(b);
          (bins[b] || (bins[b] = [])).push(idx);
        }
      };
      edges.forEach((e, idx) => {
        const marks = new Set();
        if (e.line) addBox(idx, Math.min(e.A[0], e.B[0]), Math.min(e.A[1], e.B[1]), Math.max(e.A[0], e.B[0]), Math.max(e.A[1], e.B[1]), marks);
        else {
          const n = Math.max(1, Math.ceil((e.r * e.sw) / cs));
          let px = e.A[0], py = e.A[1];
          for (let s = 1; s <= n; s++) {
            const a = e.a0 + (e.sw * s) / n, qx = e.c[0] + e.r * Math.cos(a), qy = e.c[1] + e.r * Math.sin(a);
            addBox(idx, Math.min(px, qx), Math.min(py, qy), Math.max(px, qx), Math.max(py, qy), marks);
            px = qx; py = qy;
          }
        }
      });

      // Distance from a point to one edge, and which side of it the point is on.
      const edgeDist = (e, x, y) => {
        if (e.line) {
          const dx = e.B[0] - e.A[0], dy = e.B[1] - e.A[1], L2 = dx * dx + dy * dy || 1e-12;
          const t = Math.max(0, Math.min(1, ((x - e.A[0]) * dx + (y - e.A[1]) * dy) / L2));
          return Math.hypot(x - e.A[0] - t * dx, y - e.A[1] - t * dy);
        }
        const dx = x - e.c[0], dy = y - e.c[1];
        let a = Math.atan2(dy, dx) - e.a0;
        a -= TAU * Math.floor(a / TAU);
        if (a <= e.sw) return Math.abs(Math.hypot(dx, dy) - e.r);
        return Math.min(Math.hypot(x - e.A[0], y - e.A[1]), Math.hypot(x - e.B[0], y - e.B[1]));
      };
      // Parity of the cell at (x, y) next to edge e: which half-edge of the chain, and which side of it.
      const edgePar = (e, x, y) => {
        let t, side;
        if (e.line) { t = (x - e.A[0]) * e.u[0] + (y - e.A[1]) * e.u[1]; side = e.u[0] * (y - e.A[1]) - e.u[1] * (x - e.A[0]) > 0 ? 1 : 0; }
        else {
          t = Math.atan2(y - e.c[1], x - e.c[0]) - e.a0; t -= TAU * Math.floor(t / TAU);
          if (t > e.sw) t = t - TAU < -t + e.sw ? 0 : e.sw; // past the end: snap to the nearer end
          side = Math.hypot(x - e.c[0], y - e.c[1]) < e.r ? 1 : 0;
        }
        let sub = e.subs[0];
        for (const q of e.subs) if (t >= q.s - 1e-9) sub = q;
        return sub.par[side];
      };
      // Smoothed distance to the edge set (convex corners rounded by `round`) and the parity of the cell at (x, y).
      let lastSign = 1;
      const dist = (x, y) => {
        const i = Math.floor((x - x0) / cs), j = Math.floor((y - y0) / cs);
        if (i < 0 || j < 0 || i >= nx || j >= ny) return QD;
        const list = bins[j * nx + i];
        if (!list) return QD;
        let best = QD, near = -1, ds = QD;
        for (const idx of list) {
          const d = edgeDist(edges[idx], x, y);
          if (d < best) { best = d; near = idx; }
          ds = smin(ds, d, kr);
        }
        if (near >= 0) lastSign = edgePar(edges[near], x, y) ? -1 : 1;
        return Math.max(0, Math.min(QD, ds));
      };

      const warp = points.length && p.fieldGain ? (x, y) => Math.max(0.3, 1 + p.fieldGain * fieldAt(x, y)) : null;
      let shape;
      if (style === 'lines') shape = (x, y) => dist(x, y) - w2 * (warp ? warp(x, y) : 1);
      else if (style === 'alt') shape = (x, y) => { const d = dist(x, y); return g2 * (warp ? warp(x, y) : 1) - lastSign * d; };
      else shape = (x, y) => g2 * (warp ? warp(x, y) : 1) - dist(x, y);

      // Solid rim from the cut radius out to the disc edge; the disc outline clips everything.
      const k = Math.max(0.02, p.fillet);
      const evalFn = (x, y) => {
        const r = Math.hypot(x - cx, y - cy);
        const f = smin(shape(x, y), rcutMM - r, kr);
        return smax(f, r - R, k);
      };
      return { evalFn, domain: { x0: cx - R - 3, y0: cy - R - 3, x1: cx + R + 3, y1: cy + R + 3 }, count: 1 };
    },
  };
})();
