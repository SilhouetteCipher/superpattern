// Arctic: random tilings from statistical mechanics, and the "arctic circle" they freeze into. A lozenge tiling
// of a hexagon with sides a, b, c is the same thing as a stack of unit cubes in an a × b × c box seen from the
// corner (a plane partition: column heights h[i][j] that never increase away from the back corner); a domino
// tiling of the Aztec diamond (rows of 2, 4, … 2n, 2n, … 4, 2 cells) is its two-tile cousin. Both are sampled
// by Glauber dynamics, the Markov chain physicists use for crystals: pick a random site and try the one local
// move there — add or remove a cube (rotating three lozenges round a vertex), or turn a 2 × 2 pair of dominoes
// a quarter turn — accepting it whenever the result is still a tiling. Run long enough, every tiling is equally
// likely, and the law of large numbers takes over: near the corners the tiles lock into frozen bricked regions,
// and only inside the inscribed circle (the arctic circle of Jockusch, Propp and Shor) is the tiling disordered.
// `melt` stops the chain early, so the crystal is caught half-thawed from its frozen start; `bias` weights the
// moves (per cube for lozenges, per vertical domino for dominoes), pushing the circle into an ellipse or a heap.
// A domino rectangle has no frozen corners — it is the uniform random brick texture. Tiles are drawn as rounded
// polygons inset by half the joint, optionally thinned to some tile families; or, for lozenges, as the strands
// through the two non-flat families: non-crossing lattice paths that are the contour lines of the cube heap.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_TILE = 0.5; // minimum inradius (mm) of a surviving tile
  const MIN_HALF = 0.3; // minimum half-width (mm) of a strand

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  // Exact signed distance to a convex polygon (negative inside), any winding.
  function convexSDF(v) {
    const n = v.length, nx = [], ny = [], off = [];
    let gx = 0, gy = 0;
    for (let i = 0; i < n; i++) {
      const a = v[i], b = v[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      nx.push(ey / L); ny.push(-ex / L); off.push((ey * a[0] - ex * a[1]) / L);
      gx += a[0] / n; gy += a[1] / n;
    }
    let gmax = -Infinity;
    for (let i = 0; i < n; i++) gmax = Math.max(gmax, nx[i] * gx + ny[i] * gy - off[i]);
    if (gmax > 0) for (let i = 0; i < n; i++) { nx[i] = -nx[i]; ny[i] = -ny[i]; off[i] = -off[i]; }
    return (x, y) => {
      let inside = -Infinity;
      for (let i = 0; i < n; i++) inside = Math.max(inside, nx[i] * x + ny[i] * y - off[i]);
      if (inside <= 0) return inside;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const a = v[i], b = v[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
        best = Math.min(best, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
      }
      return best;
    };
  }

  // Move every edge of a convex polygon inward by d (vertices = crossings of the offset edge lines).
  function insetPoly(v, d) {
    const n = v.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = v[i], b = v[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const s = area > 0 ? 1 : -1; // inward normal side
    const lines = [];
    for (let i = 0; i < n; i++) {
      const a = v[i], b = v[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      const nx = (-ey / L) * s, ny = (ex / L) * s;
      lines.push([a[0] + nx * d, a[1] + ny * d, ex, ey]);
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      const A = lines[(i + n - 1) % n], B = lines[i];
      const det = A[2] * B[3] - A[3] * B[2];
      if (Math.abs(det) < 1e-12) { out.push([B[0], B[1]]); continue; }
      const t = ((B[0] - A[0]) * B[3] - (B[1] - A[1]) * B[2]) / det;
      out.push([A[0] + A[2] * t, A[1] + A[3] * t]);
    }
    return out;
  }

  // Inradius of a centrally symmetric polygon: distance from its centre to the nearest edge line.
  function inradius(v, c) {
    let r = Infinity;
    for (let i = 0; i < v.length; i++) {
      const a = v[i], b = v[(i + 1) % v.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      r = Math.min(r, Math.abs((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / L);
    }
    return r;
  }

  // ---- Lozenges: Glauber dynamics on a plane partition in an A × B × C box ----
  // Returns tiles in iso units ({ v, type: 0 top / 1 x-wall / 2 y-wall, level }) and the strands (one per level).
  function lozenges(A, B, C, steps, bias, rand) {
    const h = new Int32Array(A * B);
    const H = (i, j) => (i < 0 || j < 0 ? C : i >= A || j >= B ? 0 : h[i * B + j]);
    const q = Math.exp(bias); // weight per cube
    const pAdd = Math.min(1, q), pDel = Math.min(1, 1 / q);
    for (let s = 0; s < steps; s++) {
      const i = (rand() * A) | 0, j = (rand() * B) | 0, k = i * B + j, v = h[k];
      if (rand() < 0.5) {
        // Add a cube: the column must stay no taller than the columns behind it.
        if (v < C && v < H(i - 1, j) && v < H(i, j - 1) && rand() < pAdd) h[k] = v + 1;
      } else if (v > 0 && v > H(i + 1, j) && v > H(i, j + 1) && rand() < pDel) h[k] = v - 1;
    }
    // Isometric projection: x along u, y along v, z up; u + v + w = 0 on screen.
    const r3 = Math.sqrt(3) / 2;
    const P = (x, y, z) => [(x - y) * r3, (x + y) * 0.5 - z];
    const tiles = [];
    for (let i = 0; i < A; i++)
      for (let j = 0; j < B; j++) {
        const z = H(i, j);
        tiles.push({ v: [P(i, j, z), P(i + 1, j, z), P(i + 1, j + 1, z), P(i, j + 1, z)], type: 0, level: z });
      }
    // Wall faces: in the plane x = i the face at (j, k) shows where column i is lower than column i − 1.
    const strandPts = new Map(); // level → list of [i, j] w-edge midpoints, as segments
    const seg = (k, a, b) => (strandPts.get(k) || strandPts.set(k, []).get(k)).push([a, b]);
    for (let i = 0; i <= A; i++)
      for (let j = 0; j < B; j++)
        for (let k = H(i, j); k < H(i - 1, j); k++) {
          tiles.push({ v: [P(i, j, k), P(i, j + 1, k), P(i, j + 1, k + 1), P(i, j, k + 1)], type: 1, level: k });
          seg(k, [i, j], [i, j + 1]);
        }
    for (let j = 0; j <= B; j++)
      for (let i = 0; i < A; i++)
        for (let k = H(i, j); k < H(i, j - 1); k++) {
          tiles.push({ v: [P(i, j, k), P(i + 1, j, k), P(i + 1, j, k + 1), P(i, j, k + 1)], type: 2, level: k });
          seg(k, [i, j], [i + 1, j]);
        }
    // Each level's segments chain into one staircase path: the contour h = k + ½ of the heap.
    const strands = [];
    for (const [k, segs] of strandPts) {
      const adj = new Map(), key = (p) => p[0] + ',' + p[1];
      for (const [a, b] of segs) {
        (adj.get(key(a)) || adj.set(key(a), []).get(key(a))).push(b);
        (adj.get(key(b)) || adj.set(key(b), []).get(key(b))).push(a);
      }
      const used = new Set();
      for (const [ka, nb] of adj) {
        if (nb.length !== 1 || used.has(ka)) continue;
        let cur = ka.split(',').map(Number), prev = null;
        const path = [];
        for (;;) {
          path.push(P(cur[0], cur[1], k + 0.5));
          used.add(key(cur));
          const next = (adj.get(key(cur)) || []).find((p) => !prev || key(p) !== key(prev));
          if (!next || used.has(key(next))) break;
          prev = cur; cur = next;
        }
        if (path.length > 1) strands.push(path);
      }
    }
    return { tiles, strands };
  }

  // ---- Dominoes: Glauber dynamics on a region of the square grid ----
  // cells: Uint8Array mask over W × H; starts all-horizontal (every row of the region has even length).
  function dominoes(W, H, inside, steps, bias, rand) {
    // dir per cell: 0 partner right, 1 left, 2 down (+y), 3 up (−y); 255 outside.
    const d = new Uint8Array(W * H).fill(255);
    for (let y = 0; y < H; y++) {
      let run = 0;
      for (let x = 0; x < W; x++) {
        if (!inside(x, y)) { run = 0; continue; }
        d[y * W + x] = run % 2 === 0 ? 0 : 1;
        run++;
      }
    }
    const w = Math.exp(bias); // weight per vertical domino
    const pV = Math.min(1, w * w), pH = Math.min(1, 1 / (w * w));
    for (let s = 0; s < steps; s++) {
      const x = (rand() * (W - 1)) | 0, y = (rand() * (H - 1)) | 0, k = y * W + x;
      const a = d[k], b = d[k + W], c = d[k + 1];
      if (a === 0 && b === 0) { if (rand() < pV) { d[k] = 2; d[k + W] = 3; d[k + 1] = 2; d[k + W + 1] = 3; } }
      else if (a === 2 && c === 2) { if (rand() < pH) { d[k] = 0; d[k + 1] = 1; d[k + W] = 0; d[k + W + 1] = 1; } }
    }
    const tiles = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const v = d[y * W + x];
        if (v === 0) tiles.push({ v: [[x, y], [x + 2, y], [x + 2, y + 1], [x, y + 1]], type: (x + y) % 2, level: 0 });
        else if (v === 2) tiles.push({ v: [[x, y], [x + 1, y], [x + 1, y + 2], [x, y + 2]], type: 2 + ((x + y) % 2), level: 0 });
      }
    return { tiles, strands: [] };
  }

  let cache = { key: null };

  SP.generators.arctic = {
    id: 'arctic',
    name: 'Arctic',
    board: true,
    schema: [
      { group: 'Tiling' },
      { key: 'kind', label: 'Tiling', type: 'select', def: 'lozenge', options: [['lozenge', 'Lozenges in a hexagon (cube heap)'], ['aztec', 'Dominoes in an Aztec diamond'], ['rect', 'Dominoes filling the board']] },
      { key: 'size', label: 'Order (tiles per side)', min: 3, max: 40, step: 1, def: 14, int: true, rand: [8, 22] },
      { key: 'depth', label: 'Box depth (lozenge)', min: 0.3, max: 2, step: 0.01, def: 1, rand: [0.6, 1.4] },
      { key: 'melt', label: 'Melt', min: 0, max: 1, step: 0.01, def: 1, rand: [0.15, 1] },
      { key: 'bias', label: 'Bias', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.25, 0.25] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 3, int: true, rand: [1, 9999] },
      { group: 'Look' },
      { key: 'style', label: 'Draw', type: 'select', def: 'tiles', options: [['tiles', 'Tiles'], ['strands', 'Strands (lozenge contours)']] },
      { key: 'show', label: 'Show', type: 'select', def: 'all', options: [['all', 'All tiles'], ['drop', 'Drop one family'], ['one', 'One family only'], ['alt', 'Alternate classes']] },
      { key: 'gap', label: 'Joint (mm)', min: 0.6, max: 6, step: 0.05, def: 1.2, rand: [0.8, 2.2] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 6, step: 0.05, def: 0.8, rand: [0.2, 2] },
      { key: 'width', label: 'Strand width (mm)', min: 0.6, max: 6, step: 0.05, def: 1.6, rand: [1, 2.6] },
      { key: 'angle', label: 'Rotate °', min: -180, max: 180, step: 0.5, def: 0, rand: [0, 0] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'fieldShrink', label: 'Field points → shrink', min: 0, max: 1, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: Bd, fieldAt, points } = ctx;
      const mg = Math.max(0, Math.min(p.margin, Math.min(Bd.w, Bd.h) / 2 - 5));
      const W = Bd.w - 2 * mg, Hh = Bd.h - 2 * mg, cx = Bd.w / 2, cy = Bd.h / 2;
      const n = Math.max(2, Math.round(p.size));
      const melt = Math.max(0, Math.min(1, p.melt));

      // ---- Sample the tiling (cached: the chain is the expensive part) ----
      const key = JSON.stringify([p.kind, n, p.depth, melt, p.bias, p.seed, p.kind === 'rect' ? [W, Hh] : 0]);
      if (cache.key !== key) {
        const rand = rng(p.seed * 2654435761 + 17);
        let res;
        if (p.kind === 'aztec') {
          // Cells (x, y), 0 ≤ x, y < 2n, inside |x − n + ½| + |y − n + ½| ≤ n.
          const inside = (x, y) => Math.abs(x - n + 0.5) + Math.abs(y - n + 0.5) <= n;
          res = dominoes(2 * n, 2 * n, inside, Math.round(melt * 40 * n * 4 * n * n), p.bias, rand);
        } else if (p.kind === 'rect') {
          // `size` cells across the short side; the long side rounded so the cells stay square.
          const s0 = Math.min(W, Hh) / n;
          let cols = Math.max(2, Math.round(W / s0)), rows = Math.max(2, Math.round(Hh / s0));
          if (cols % 2) cols += W / cols < Hh / rows ? -1 : 1; // even columns: an all-horizontal start exists
          res = dominoes(cols, rows, () => true, Math.round(melt * 40 * n * cols * rows), p.bias, rand);
        } else {
          const C = Math.max(1, Math.round(n * p.depth));
          res = lozenges(n, n, C, Math.round(melt * 40 * n * n * n), (p.bias * 6) / n, rand);
        }
        cache = { key, res };
      }
      const { tiles, strands } = cache.res;

      // ---- Tile selection ----
      const lz = p.kind === 'lozenge';
      const keep = (t) => {
        if (p.show === 'drop') return lz ? t.type !== 0 : t.type < 2;
        if (p.show === 'one') return t.type === 0;
        if (p.show === 'alt') return lz ? (t.level + t.type) % 2 === 0 : t.type === 0 || t.type === 3;
        return true;
      };

      // ---- Fit into the board: rotate, then scale the bounding box into the margin box ----
      const ca = Math.cos(p.angle * D2R), sa = Math.sin(p.angle * D2R);
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      // Strands are fitted on their own bounds (they leave the flat-topped part of the hexagon empty).
      let fitPts = p.style === 'strands' && strands.length ? strands.flat() : tiles.filter(keep).flatMap((t) => t.v);
      if (!fitPts.length) fitPts = tiles.flatMap((t) => t.v);
      for (const q of fitPts) {
        const x = q[0] * ca - q[1] * sa, y = q[0] * sa + q[1] * ca;
        bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
      }
      const S = Math.min(W / (bx1 - bx0 || 1), Hh / (by1 - by0 || 1));
      const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
      const T = (q) => [cx + (q[0] * ca - q[1] * sa - mx) * S, cy + (q[0] * sa + q[1] * ca - my) * S];

      // ---- Strands: contour lines of the cube heap, smoothed into flowing bands ----
      if (p.style === 'strands' && strands.length) {
        // Neighbouring strands can sit one lozenge height (√3/2 edge) apart: keep the band a third of that.
        const r = Math.max(MIN_HALF, Math.min(p.width / 2, S * 0.866 * 0.34));
        const out = { strokes: [], blobs: [], dots: [], k: 0.4, count: strands.length };
        for (const path of strands) {
          let pts = path.map(T);
          for (let it = 0; it < 3; it++) { // Chaikin corner cutting, ends pinned
            const nx = [pts[0]];
            for (let i = 0; i < pts.length - 1; i++) {
              const a = pts[i], b = pts[i + 1];
              nx.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
            }
            nx.push(pts[pts.length - 1]);
            pts = nx;
          }
          const rr = pts.map((q) => {
            const F = points.length && p.fieldShrink ? Math.max(0, fieldAt(q[0], q[1]) || 0) : 0;
            return Math.max(MIN_HALF, r * (1 - 0.6 * p.fieldShrink * F));
          });
          out.strokes.push({ pts, r: rr });
        }
        return out;
      }

      // ---- Rounded tiles as one SDF ----
      const g = p.gap / 2;
      const items = [];
      for (const t of tiles) {
        if (!keep(t)) continue;
        const v = t.v.map(T);
        const c = [v.reduce((s, q) => s + q[0], 0) / v.length, v.reduce((s, q) => s + q[1], 0) / v.length];
        const rho0 = inradius(v, c);
        const F = points.length && p.fieldShrink ? Math.max(0, fieldAt(c[0], c[1]) || 0) : 0;
        const inset = g + p.fieldShrink * F * rho0 * 0.6;
        const rho = rho0 - inset;
        if (rho < MIN_TILE) continue; // too thin to print: drop it rather than leave a speck
        const rr = Math.min(p.round, rho * 0.95);
        const sdf = convexSDF(insetPoly(v, inset + rr));
        let ext = 0;
        for (const q of v) ext = Math.max(ext, Math.hypot(q[0] - c[0], q[1] - c[1]));
        items.push({ c, e: ext, f: (x, y) => sdf(x, y) - rr });
      }
      // Spatial bins: each tile is registered in every bin its bounding circle touches.
      let emax = 1;
      for (const it of items) emax = Math.max(emax, it.e);
      const bs = Math.max(2, emax), bins = new Map();
      items.forEach((it, i) => {
        for (let j = Math.floor((it.c[1] - it.e) / bs); j <= Math.floor((it.c[1] + it.e) / bs); j++)
          for (let k = Math.floor((it.c[0] - it.e) / bs); k <= Math.floor((it.c[0] + it.e) / bs); k++) { const kk = k + ',' + j; (bins.get(kk) || bins.set(kk, []).get(kk)).push(i); }
      });
      const far = bs;
      const evalFn = (x, y) => {
        const L = bins.get(Math.floor(x / bs) + ',' + Math.floor(y / bs));
        let f = far;
        if (L) for (const k of L) { const v = items[k].f(x, y); if (v < f) f = v; }
        return f;
      };
      return { evalFn, domain: { x0: mg - 3, y0: mg - 3, x1: Bd.w - mg + 3, y1: Bd.h - mg + 3 }, count: items.length };
    },
  };
})();
