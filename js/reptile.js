// Rep-Tiles: substitution tilings from self-similar rep-tiles. A rep-tile is a shape that can be cut into
// smaller copies of itself (Golomb, 1964); cutting every piece again, and again, tiles the plane. Conway's
// pinwheel triangle (legs 1:2) splits into five copies scaled 1/√5, each turned by arctan ½ — an
// irrational angle, so the pieces appear in infinitely many orientations (Radin, 1994). The chair
// (L-tromino) and the sphinx hexiamond split into four half-size copies; the 30-60-90 triangle into three,
// and the right isosceles triangle into two. Instead of stopping every branch at the same depth, each piece
// splits only while it is larger than a target size, which can shrink toward the centre, sweep across the
// board or tighten round field points, and a seeded chance keeps some pieces whole a level early. So
// scales mix as in Hobbs-style recursive subdivision, but every piece keeps the rep-tile's own shape and the
// T-junctions follow the substitution rule. The field is the ice-ray rule: half the groove width minus the
// distance to the nearest edge, soft-min across the two nearest edge lines (which rounds every corner),
// clipped by the window — either the pieces as rounded cells, or the edges and frame as a lattice.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180, H = Math.sqrt(3) / 2, R3 = Math.sqrt(3);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  function area(P) { let s = 0; for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  function inPoly(P, x, y) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; }
    return c;
  }
  function edgeDist(P, x, y) {
    let d = Infinity;
    for (let i = 0, n = P.length; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
      d = Math.min(d, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
    }
    return d;
  }

  // Prototiles in canonical coordinates, with their children listed as vertex lists in the same vertex order
  // (that order carries the orientation, mirror images included). Each child is an affine image of the
  // prototile, recovered from its first three vertices.
  const TILES = {
    // Right triangle [right angle, end of long leg, end of short leg]: the altitude to the hypotenuse cuts
    // off one copy, and the larger remainder (similar, twice the size) splits by its midpoints into four.
    pinwheel: {
      poly: [[0, 0], [2, 0], [0, 1]],
      kids: [
        [[0.4, 0.8], [0, 0], [0, 1]],
        [[0.2, 0.4], [1, 0], [0, 0]],
        [[1.2, 0.4], [2, 0], [1, 0]],
        [[0.4, 0.8], [1.2, 0.4], [0.2, 0.4]],
        [[1, 0], [0.2, 0.4], [1.2, 0.4]],
      ],
    },
    // L-tromino: one half-size chair in the inner corner, one in the outer corner, one mirrored into each arm.
    chair: {
      poly: [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]],
      kids: [
        [[0, 0], [1, 0], [1, 0.5]],
        [[0.5, 0.5], [1.5, 0.5], [1.5, 1]],
        [[2, 0], [1, 0], [1, 0.5]],
        [[0, 2], [1, 2], [1, 1.5]],
      ],
    },
    // Sphinx hexiamond: the one way four half-size sphinxes fill it (found by exhaustive search).
    sphinx: {
      poly: [[0, 0], [3, 0], [2.5, H], [1.5, H], [1, 2 * H]],
      kids: [
        [[1.5, 0], [0, 0], [0.25, H / 2]],
        [[1, H], [2.5, H], [2.25, H / 2]],
        [[3, 0], [1.5, 0], [1.75, H / 2]],
        [[1, 2 * H], [0.25, H / 2], [0.75, H / 2]],
      ],
    },
    // 30-60-90 triangle [right angle, end of long leg, end of short leg]: bisect the 60° corner, then halve
    // the isosceles remainder — three copies scaled 1/√3.
    kite: {
      poly: [[0, 0], [R3, 0], [0, 1]],
      kids: [
        [[0, 0], [0, 1], [1 / R3, 0]],
        [[R3 / 2, 0.5], [0, 1], [1 / R3, 0]],
        [[R3 / 2, 0.5], [R3, 0], [1 / R3, 0]],
      ],
    },
    // Right isosceles triangle: the altitude splits it into two copies scaled 1/√2.
    halves: {
      poly: [[0, 0], [1, 0], [0, 1]],
      kids: [
        [[0.5, 0.5], [0, 0], [1, 0]],
        [[0.5, 0.5], [0, 1], [0, 0]],
      ],
    },
  };
  // Affine map [a, b, c, d, e, f] (x' = a·x + b·y + e, y' = c·x + d·y + f) taking p0, p1, p2 to q0, q1, q2.
  function affine3(p, q) {
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1];
    const det = ux * vy - uy * vx;
    const sx = q[1][0] - q[0][0], sy = q[1][1] - q[0][1], tx = q[2][0] - q[0][0], ty = q[2][1] - q[0][1];
    const a = (sx * vy - tx * uy) / det, b = (tx * ux - sx * vx) / det;
    const c = (sy * vy - ty * uy) / det, d = (ty * ux - sy * vx) / det;
    return [a, b, c, d, q[0][0] - a * p[0][0] - b * p[0][1], q[0][1] - c * p[0][0] - d * p[0][1]];
  }
  const compose = (T, M) => [T[0] * M[0] + T[1] * M[2], T[0] * M[1] + T[1] * M[3], T[2] * M[0] + T[3] * M[2], T[2] * M[1] + T[3] * M[3],
    T[0] * M[4] + T[1] * M[5] + T[4], T[2] * M[4] + T[3] * M[5] + T[5]];
  const apply = (T, v) => [T[0] * v[0] + T[1] * v[1] + T[4], T[2] * v[0] + T[3] * v[1] + T[5]];
  // Per prototile: the child maps, its area, and its largest inscribed circle (sampled), which places the
  // first supertile over the board and sets the smallest piece that can still hold a cell.
  for (const t of Object.values(TILES)) {
    t.maps = t.kids.map((k) => affine3(t.poly.slice(0, 3), k));
    t.area = area(t.poly);
    let best = [0, 0], br = 0;
    const xs = t.poly.map((v) => v[0]), ys = t.poly.map((v) => v[1]);
    const X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys);
    for (let j = 0; j <= 80; j++) for (let i = 0; i <= 80; i++) {
      const x = X0 + ((X1 - X0) * i) / 80, y = Y0 + ((Y1 - Y0) * j) / 80;
      if (!inPoly(t.poly, x, y)) continue;
      const d = edgeDist(t.poly, x, y);
      if (d > br) { br = d; best = [x, y]; }
    }
    t.centre = best;
    t.inr = br / Math.sqrt(t.area); // inscribed radius per unit of piece size (size = √area)
  }

  let cache = { key: null };

  SP.generators.reptile = {
    id: 'reptile',
    name: 'Rep-Tiles',
    board: true,
    schema: [
      { group: 'Tile' },
      { key: 'tile', label: 'Rep-tile', type: 'select', def: 'pinwheel', options: [['pinwheel', 'Pinwheel (5 × 1:2 triangle)'], ['chair', 'Chair (4 × L-tromino)'], ['sphinx', 'Sphinx (4 × hexiamond)'], ['kite', '30-60-90 (3 × triangle)'], ['halves', 'Right isosceles (2 ×)']] },
      { key: 'rotate', label: 'Rotate °', min: -180, max: 180, step: 0.5, def: 0, rand: [-180, 180] },
      { key: 'shape', label: 'Outline', type: 'select', def: 'square', options: [['square', 'Rounded square'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'frame', label: 'Frame bar (mm)', min: 0, max: 20, step: 0.1, def: 0, rand: [0, 4] },
      { group: 'Subdivide' },
      { key: 'cell', label: 'Piece size (mm)', min: 4, max: 80, step: 0.5, def: 18, rand: [11, 30] },
      { key: 'centre', label: 'Smaller at centre', min: -1, max: 0.9, step: 0.01, def: 0.35, rand: [-0.4, 0.75] },
      { key: 'sweep', label: 'Sweep left → right', min: -2, max: 2, step: 0.01, def: 0, rand: [-1, 1] },
      { key: 'keep', label: 'Keep pieces whole', min: 0, max: 0.8, step: 0.01, def: 0.25, rand: [0, 0.5] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 5, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'cells', options: [['cells', 'Pieces'], ['lines', 'Lattice']] },
      { key: 'gap', label: 'Groove width (mm)', min: 0.6, max: 12, step: 0.05, def: 1.8, rand: [1.2, 3] },
      { key: 'hier', label: 'Wider round big pieces', min: 0, max: 1, step: 0.01, def: 0.35, rand: [0, 0.7] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 15, step: 0.1, def: 1.6, rand: [0.4, 3.5] },
      { key: 'fieldGain', label: 'Field points → finer', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const T = TILES[p.tile] || TILES.pinwheel;
      const m = Math.min(p.margin, Math.min(B.w, B.h) / 2 - 5);
      const x0 = m, y0 = m, W = B.w - 2 * m, Hh = B.h - 2 * m, cx = B.w / 2, cy = B.h / 2;
      const R = Math.min(W, Hh) / 2;
      const outline = p.shape === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - R
        : (x, y) => { const r = Math.min(6, W / 2, Hh / 2), qx = Math.abs(x - cx) - W / 2 + r, qy = Math.abs(y - cy) - Hh / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
      const g = Math.max(0.3, p.gap / 2), kr = p.round, F = p.frame;
      const key = JSON.stringify([p.tile, p.rotate, p.shape, p.margin, p.cell, p.centre, p.sweep, p.keep, p.seed, p.gap, p.hier, B.w, B.h, p.fieldGain ? points : 0]);
      if (cache.key !== key) {
        const rand = rng(p.seed * 2654435761);
        // Smallest piece that still holds a cell after the groove eats in from every side.
        const sMin = (g * (1 + p.hier) + 0.7) / T.inr;
        const target = (x, y) => {
          const rr = Math.min(1, Math.hypot((x - cx) / (W / 2), (y - cy) / (Hh / 2)) / 1.1);
          let s = p.cell * (1 - p.centre * (1 - rr)) * Math.pow(2, p.sweep * clamp((x - cx) / (W / 2), -1, 1));
          if (points.length && p.fieldGain) s *= Math.max(0.2, 1 - p.fieldGain * fieldAt(x, y));
          return Number.isFinite(s) ? Math.max(sMin, s) : p.cell;
        };
        // First supertile: its inscribed circle, scaled to cover the board's half-diagonal, centred on the board.
        const half = Math.hypot(W, Hh) / 2 + 4;
        const s0 = (half / (T.inr * Math.sqrt(T.area))) * 1.02, a = p.rotate * D2R, ca = Math.cos(a) * s0, sa = Math.sin(a) * s0;
        const T0 = [ca, -sa, sa, ca, cx - (ca * T.centre[0] - sa * T.centre[1]), cy - (sa * T.centre[0] + ca * T.centre[1])];
        const bx0 = x0 - 2, by0 = y0 - 2, bx1 = x0 + W + 2, by1 = y0 + Hh + 2;
        const sizeOf = (M) => Math.sqrt(Math.abs(M[0] * M[3] - M[1] * M[2]) * T.area);
        const kidScale = 1 / Math.sqrt(T.maps.length);
        const leaves = [], queue = [T0];
        while (queue.length) {
          const M = queue.shift();
          const P = T.poly.map((v) => apply(M, v));
          let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
          for (const v of P) { X0 = Math.min(X0, v[0]); X1 = Math.max(X1, v[0]); Y0 = Math.min(Y0, v[1]); Y1 = Math.max(Y1, v[1]); }
          if (X1 < bx0 || X0 > bx1 || Y1 < by0 || Y0 > by1) continue;
          const s = sizeOf(M), c = apply(M, T.centre), t = target(c[0], c[1]);
          const split = s > t && s * kidScale >= sMin * 0.999 && leaves.length + queue.length < 7000;
          // Seeded chance to keep a piece whole when it's already within about two levels of its target.
          if (split && !(s < t * 2.2 && rand() < p.keep)) { for (const K of T.maps) queue.push(compose(M, K)); continue; }
          leaves.push({ P, s, c });
        }
        // Edge segments. Collinear edges share one id (a big piece's side and the small pieces' sides along it,
        // or straight runs through a vertex), so the soft-min rounds real corners only. Each edge carries its
        // own half-width: bigger pieces get wider grooves when `hier` > 0.
        const lineIds = new Map(), segs = [];
        let gMax = g;
        const sMean = leaves.reduce((acc, q) => acc + q.s, 0) / Math.max(1, leaves.length);
        for (const q of leaves) {
          const gs = clamp(g * Math.pow(q.s / sMean, p.hier), 0.3, g * 3);
          gMax = Math.max(gMax, gs);
          for (let i = 0, n = q.P.length; i < n; i++) {
            const A = q.P[i], Bv = q.P[(i + 1) % n];
            let ang = Math.atan2(Bv[1] - A[1], Bv[0] - A[0]);
            if (ang < 0) ang += Math.PI;
            if (ang >= Math.PI - 1e-5) ang = 0;
            const off = -Math.sin(ang) * A[0] + Math.cos(ang) * A[1];
            const lk = Math.round(ang * 2e4) + ':' + Math.round(off * 200);
            if (!lineIds.has(lk)) lineIds.set(lk, lineIds.size);
            segs.push([A[0], A[1], Bv[0], Bv[1], lineIds.get(lk), gs]);
          }
        }
        const count = leaves.filter((q) => outline(q.c[0], q.c[1]) < -F).length;
        const bs = Math.max(5, 2 * (gMax + kr) + 2), bins = new Map();
        segs.forEach((s, si) => {
          const bi0 = Math.floor(Math.min(s[0], s[2]) / bs), bi1 = Math.floor(Math.max(s[0], s[2]) / bs);
          const bj0 = Math.floor(Math.min(s[1], s[3]) / bs), bj1 = Math.floor(Math.max(s[1], s[3]) / bs);
          for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) { const k = bi + ',' + bj; (bins.get(k) || bins.set(k, []).get(k)).push(si); }
        });
        cache = { key, segs, bins, bs, count, gMax };
      }
      const { segs, bins, bs, count } = cache;
      const reach = bs;
      // The two smallest (distance − half-width) values from two different edge lines.
      const nearestTwo = (x, y) => {
        const bi = Math.floor(x / bs), bj = Math.floor(y / bs);
        let e1 = Infinity, id1 = -1, e2 = Infinity;
        for (let jj = bj - 1; jj <= bj + 1; jj++)
          for (let ii = bi - 1; ii <= bi + 1; ii++) {
            const L = bins.get(ii + ',' + jj);
            if (!L) continue;
            for (const si of L) {
              const s = segs[si];
              const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy;
              const t = L2 > 1e-12 ? clamp(((x - s[0]) * dx + (y - s[1]) * dy) / L2, 0, 1) : 0;
              const e = Math.hypot(x - (s[0] + dx * t), y - (s[1] + dy * t)) - s[5];
              if (s[4] === id1) { if (e < e1) e1 = e; }
              else if (e < e1) { e2 = e1; e1 = e; id1 = s[4]; }
              else if (e < e2) e2 = e;
            }
          }
        return [e1, e2];
      };
      const lattice = p.draw === 'lines';
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        const inner = o + F;
        const [e1, e2] = nearestTwo(x, y);
        const e = e1 > reach ? reach : e2 < Infinity ? smin(e1, e2, kr) : e1;
        if (lattice) {
          const band = F > 0 ? Math.max(o, -inner) : 1e9;
          return Math.max(smin(e, band, Math.min(kr, g) * 0.5 + 0.2), o);
        }
        // Pieces stay a groove's width off the frame too, and round into it like any other corner.
        return smax(-e, inner + (F > 0 ? g : 0), Math.min(kr, g) * 0.5 + 0.2);
      };
      const pad = 3;
      return { evalFn, domain: { x0: x0 - pad, y0: y0 - pad, x1: x0 + W + pad, y1: y0 + Hh + pad }, count };
    },
  };
})();
