// Ice Ray: the Chinese "cracked ice" (bingliè) window lattice, built by George Stiny's ice-ray grammar
// (Environment and Planning B, 1977) from Daniel Sheets Dye's catalogue of Chinese lattice. One rule,
// x → div(x): take a polygon of the window and lay a stick between two of its sides, dividing it in two.
// Starting from the window frame and applying the rule again and again gives triangles, quadrilaterals and
// pentagons that look like ice cracking on still water. The craftsman's judgement is the parameter set here:
// sticks join sides near their middles (spread), both halves keep a fair share of the parent (balance),
// occasional corner cuts clip triangles off, pieces stop at a target size that can shrink toward the
// centre or around field points, and no piece grows more than `maxSides` sides or an angle sharper than
// `minAngle`, so the lattice has no slivers. Mirror symmetry builds half or a quarter and reflects it,
// as the catalogued windows mostly do. The field is the jigsaw rule: gap/2 minus the distance to the nearest
// stick (soft-min across the two nearest, which rounds every corner), clipped by the frame — either the
// pieces as rounded cells, or the sticks and frame as a lattice.
(function () {
  const SP = (window.SP = window.SP || {});
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  function area(P) { let s = 0; for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  function centroid(P) { let x = 0, y = 0; for (const q of P) { x += q[0]; y += q[1]; } return [x / P.length, y / P.length]; }
  // Width of a convex polygon: the smallest distance between parallel support lines, taken over its edges.
  function minWidth(P) {
    let w = Infinity;
    for (let i = 0, n = P.length; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-9) continue;
      let far = 0;
      for (const q of P) far = Math.max(far, Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / L);
      w = Math.min(w, far);
    }
    return w;
  }
  function diameter(P) { let d = 0; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) d = Math.max(d, Math.hypot(P[i][0] - P[j][0], P[i][1] - P[j][1])); return d; }
  // Sides of a polygon as runs of edges: consecutive edges that turn by less than 20° belong to one side
  // (so a circular frame, drawn as a polygon, still counts as one curved side). Each run lists its edge indices.
  function sides(P) {
    const n = P.length, dir = [];
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; dir.push(Math.atan2(b[1] - a[1], b[0] - a[0])); }
    const turn = (i) => { let t = dir[i] - dir[(i + n - 1) % n]; t = Math.atan2(Math.sin(t), Math.cos(t)); return Math.abs(t); };
    let start = 0;
    for (let i = 0; i < n; i++) if (turn(i) >= 20 * D2R) { start = i; break; }
    const runs = [];
    let cur = null;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (k === 0 || turn(i) >= 20 * D2R) { cur = { edges: [], len: 0 }; runs.push(cur); }
      cur.edges.push(i);
      cur.len += Math.hypot(P[(i + 1) % n][0] - P[i][0], P[(i + 1) % n][1] - P[i][1]);
    }
    return runs;
  }
  // The point a distance s along a run (as an edge index and the point).
  function alongRun(P, run, s) {
    const n = P.length;
    for (const i of run.edges) {
      const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (s <= L || i === run.edges[run.edges.length - 1]) { const t = clamp(s / L, 0, 1); return { i, pt: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] }; }
      s -= L;
    }
    return null;
  }
  // Smallest angle between the stick and the side it lands on (both interior angles must clear minAngle).
  function landing(P, i, pt, other) {
    const n = P.length, a = P[i], b = P[(i + 1) % n];
    const ex = b[0] - a[0], ey = b[1] - a[1], sx = other[0] - pt[0], sy = other[1] - pt[1];
    const c = Math.abs(ex * sx + ey * sy) / (Math.hypot(ex, ey) * Math.hypot(sx, sy) + 1e-12);
    return Math.acos(clamp(c, 0, 1));
  }

  // Divide `poly` by one stick, Stiny's x → div(x). Returns [child, child, stick] or null if no placement
  // satisfies the craftsman's constraints after a few tries.
  function divide(P, p, rand, gap) {
    const runs = sides(P).filter((r) => r.len >= 2 * p.endGap);
    if (!runs.length) return null;
    const minA = p.minAngle * D2R, minW = gap + 1.2, n = runs.length;
    const maxSides = p.maxSides;
    const curved = (r) => r.edges.length > 2; // an arc of the circular frame: a chord can join it to itself
    for (let tries = 0; tries < 60; tries++) {
      // Pick two sides: non-adjacent for a proper split, adjacent (a corner cut) only by the corner chance.
      const ia = Math.floor(rand() * n), ra = runs[ia];
      const nonAdj = [], adj = [];
      for (let k = 0; k < n; k++) {
        if (k === ia) { if (curved(ra)) nonAdj.push(k); continue; }
        const isAdj = (ia + 1) % n === k || (k + 1) % n === ia;
        (isAdj && !curved(ra) && !curved(runs[k]) ? adj : nonAdj).push(k);
      }
      const pool = nonAdj.length && (!adj.length || rand() >= p.corner) ? nonAdj : adj;
      if (!pool.length) continue;
      const rb = runs[pool[Math.floor(rand() * pool.length)]];
      const pick = (r) => { const t = 0.5 + (rand() * 2 - 1) * p.spread; const s = clamp(t * r.len, p.endGap, r.len - p.endGap); return Object.assign({ s }, alongRun(P, r, s)); };
      const A = pick(ra);
      let B;
      if (ra === rb && n === 1) {
        // A whole disc: the first stick runs across it, near a diameter.
        const s = (A.s + ra.len * (0.5 + (rand() * 2 - 1) * p.spread * 0.5)) % ra.len;
        B = Object.assign({ s }, alongRun(P, ra, s));
      } else B = pick(rb);
      if (!A || !B || A.i === B.i) continue;
      if (ra === rb && n > 1 && Math.abs(A.s - B.s) < 0.3 * ra.len) continue;
      if (landing(P, A.i, A.pt, B.pt) < minA || landing(P, B.i, B.pt, A.pt) < minA) continue;
      // Children: A.pt → vertices after edge A up to edge B → B.pt, and the rest.
      const m = P.length, c1 = [A.pt], c2 = [B.pt];
      for (let k = (A.i + 1) % m; k !== (B.i + 1) % m; k = (k + 1) % m) c1.push(P[k]);
      c1.push(B.pt);
      for (let k = (B.i + 1) % m; k !== (A.i + 1) % m; k = (k + 1) % m) c2.push(P[k]);
      c2.push(A.pt);
      const a1 = area(c1), a2 = area(c2), aP = a1 + a2;
      if (Math.min(a1, a2) < p.balance * aP) continue;
      if (maxSides && (sides(c1).length > maxSides || sides(c2).length > maxSides)) continue;
      // No slivers: each child must be at least `gap + 1.2` wide, and its width a fair fraction of its
      // length (chunkiness ≈ 1/aspect: 0.3 allows pieces up to about 3:1).
      const w1 = minWidth(c1), w2 = minWidth(c2);
      if (w1 < minW || w2 < minW) continue;
      if (w1 < p.chunky * diameter(c1) || w2 < p.chunky * diameter(c2)) continue;
      return [c1, c2, [A.pt, B.pt]];
    }
    return null;
  }

  let cache = { key: null };

  SP.generators.iceray = {
    id: 'iceray',
    name: 'Ice Ray',
    board: true,
    schema: [
      { group: 'Window' },
      { key: 'shape', label: 'Outline', type: 'select', def: 'square', options: [['square', 'Rounded square'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 10 },
      { key: 'outerRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'frame', label: 'Frame bar (mm)', min: 0, max: 20, step: 0.1, def: 3, rand: [0, 5] },
      { key: 'symmetry', label: 'Symmetry', type: 'select', def: 'none', options: [['none', 'None'], ['mirror', 'Mirror left–right'], ['quad', 'Mirror both ways']] },
      { group: 'Cracks' },
      { key: 'cell', label: 'Piece size (mm)', min: 6, max: 120, step: 0.5, def: 30, rand: [16, 45] },
      { key: 'centre', label: 'Smaller at centre', min: -1, max: 0.9, step: 0.01, def: 0, rand: [-0.3, 0.6] },
      { key: 'spread', label: 'Stick spread', min: 0, max: 0.45, step: 0.01, def: 0.25, rand: [0.05, 0.4] },
      { key: 'balance', label: 'Balance', min: 0.08, max: 0.48, step: 0.01, def: 0.28, rand: [0.15, 0.38] },
      { key: 'corner', label: 'Corner cuts', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0, 0.6] },
      { key: 'chunky', label: 'Chunkiness', min: 0, max: 0.6, step: 0.01, def: 0.3, rand: [0.15, 0.4] },
      { key: 'maxSides', label: 'Most sides', type: 'select', def: 5, options: [[4, 'Quadrilaterals'], [5, 'Pentagons'], [6, 'Hexagons'], [0, 'Any']] },
      { key: 'minAngle', label: 'Sharpest angle °', min: 15, max: 60, step: 1, def: 30, rand: [22, 40] },
      { key: 'endGap', label: 'Keep off corners (mm)', min: 1, max: 20, step: 0.5, def: 5, rand: [3, 8] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'cells', options: [['cells', 'Pieces'], ['sticks', 'Lattice']] },
      { key: 'gap', label: 'Stick width (mm)', min: 0.6, max: 15, step: 0.05, def: 2.6, rand: [1.6, 4] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 20, step: 0.1, def: 2.5, rand: [0.5, 6] },
      { key: 'fieldGain', label: 'Field points → finer', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const m = Math.min(p.margin, Math.min(B.w, B.h) / 2 - 5);
      const x0 = m, y0 = m, W = B.w - 2 * m, H = B.h - 2 * m, cx = B.w / 2, cy = B.h / 2;
      const R = Math.min(W, H) / 2;
      const outline = p.shape === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - R
        : (x, y) => { const r = Math.min(p.outerRound, W / 2, H / 2), qx = Math.abs(x - cx) - W / 2 + r, qy = Math.abs(y - cy) - H / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
      const maxSides = +p.maxSides;
      const key = JSON.stringify([p.shape, p.margin, p.frame, p.symmetry, p.cell, p.centre, p.spread, p.balance, p.corner, p.chunky, maxSides, p.minAngle, p.endGap, p.seed, p.gap, p.fieldGain, B.w, B.h, p.fieldGain ? points : 0]);
      if (cache.key !== key) {
        const rand = rng(p.seed * 2654435761);
        const mx = p.symmetry !== 'none', my = p.symmetry === 'quad';
        // The frame polygon the grammar starts from: the window, or the half / quarter that gets mirrored.
        // Mirrored builds keep the seams as sticks, so every piece meets the seam the way it meets a stick.
        let frame = [];
        const sticks = [];
        if (p.shape === 'circle') {
          const a0 = mx ? Math.PI / 2 : 0, a1 = my ? Math.PI : mx ? (3 * Math.PI) / 2 : TAU, N = Math.max(12, Math.round((72 * (a1 - a0)) / TAU));
          for (let k = 0; k <= N - (mx ? 0 : 1); k++) { const a = a0 + ((a1 - a0) * k) / N; frame.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]); }
          if (my) frame.push([cx, cy]);
          if (mx) sticks.push([[cx, cy - R], [cx, my ? cy : cy + R]]);
          if (my) sticks.push([[cx - R, cy], [cx, cy]]);
        } else {
          const x1 = mx ? cx : x0 + W, y1 = my ? cy : y0 + H;
          frame = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
          if (mx) sticks.push([[cx, y0], [cx, y1]]);
          if (my) sticks.push([[x0, cy], [x1, cy]]);
        }
        // Piece size at a point: the target shrinks toward the centre and near field points.
        const target = (x, y) => {
          const rr = Math.min(1, Math.hypot((x - cx) / (W / 2), (y - cy) / (H / 2)) / 1.1);
          let s = p.cell * (1 - p.centre * (1 - rr));
          if (points.length && p.fieldGain) s *= Math.max(0.2, 1 - p.fieldGain * fieldAt(x, y));
          return Math.max(2, s) ** 2;
        };
        // Apply x → div(x) to the roomiest piece until every piece is at its target size or can't be split.
        const pieces = [{ P: frame, a: area(frame), want: 0, done: false, jit: 0.75 + rand() * 0.6 }];
        const measure = (q) => { const c = centroid(q.P); q.want = target(c[0], c[1]) * q.jit; };
        measure(pieces[0]);
        for (let it = 0; it < 4000; it++) {
          let best = null, bs = 1;
          for (const q of pieces) if (!q.done && q.a / q.want > bs) { bs = q.a / q.want; best = q; }
          if (!best) break;
          const d = divide(best.P, Object.assign({}, p, { maxSides }), rand, p.gap);
          if (!d) { best.done = true; continue; }
          sticks.push(d[2]);
          best.P = d[0]; best.a = area(d[0]); best.jit = 0.75 + rand() * 0.6; measure(best);
          const q = { P: d[1], a: area(d[1]), want: 0, done: false, jit: 0.75 + rand() * 0.6 }; measure(q); pieces.push(q);
        }
        // Mirror the sticks back over the seams.
        const all = [];
        for (const s of sticks) {
          const copies = [s];
          if (mx) copies.push(s.map((q) => [2 * cx - q[0], q[1]]));
          if (my) for (const c of copies.slice()) copies.push(c.map((q) => [q[0], 2 * cy - q[1]]));
          for (const c of copies) all.push(c);
        }
        const count = pieces.length * (mx ? 2 : 1) * (my ? 2 : 1);
        // Spatial bins over the stick segments, so the field only measures nearby sticks.
        const bs = Math.max(4, p.cell * 0.5), bins = new Map();
        const segs = all.map((s, id) => [s[0][0], s[0][1], s[1][0], s[1][1], id]);
        segs.forEach((s, si) => {
          const bi0 = Math.floor(Math.min(s[0], s[2]) / bs), bi1 = Math.floor(Math.max(s[0], s[2]) / bs);
          const bj0 = Math.floor(Math.min(s[1], s[3]) / bs), bj1 = Math.floor(Math.max(s[1], s[3]) / bs);
          // A segment may cross cells diagonally; registering its bounding box of cells is safe (superset).
          for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) { const k = bi + ',' + bj; (bins.get(k) || bins.set(k, []).get(k)).push(si); }
        });
        cache = { key, segs, bins, bs, count };
      }
      const { segs, bins, bs, count } = cache;
      const g = p.gap / 2, kr = p.round, F = p.frame, reach = bs;
      const nearestTwo = (x, y) => {
        const bi = Math.floor(x / bs), bj = Math.floor(y / bs);
        let d1 = Infinity, id1 = -1, d2 = Infinity;
        for (let jj = bj - 1; jj <= bj + 1; jj++)
          for (let ii = bi - 1; ii <= bi + 1; ii++) {
            const L = bins.get(ii + ',' + jj);
            if (!L) continue;
            for (const si of L) {
              const s = segs[si];
              const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy;
              const t = L2 > 1e-12 ? clamp(((x - s[0]) * dx + (y - s[1]) * dy) / L2, 0, 1) : 0;
              const d = Math.hypot(x - (s[0] + dx * t), y - (s[1] + dy * t));
              if (s[4] === id1) { if (d < d1) d1 = d; }
              else if (d < d1) { d2 = d1; d1 = d; id1 = s[4]; }
              else if (d < d2) d2 = d;
            }
          }
        return [d1, d2];
      };
      const lattice = p.draw === 'sticks';
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        const inner = o + F; // the clear opening inside the frame bar
        const [d1, d2] = nearestTwo(x, y);
        const d = d1 > reach ? reach : d2 < Infinity ? smin(d1, d2, kr) : d1;
        if (lattice) {
          // Sticks plus the frame band, filleted where they meet; nothing outside the window.
          const band = F > 0 ? Math.max(o, -inner) : 1e9;
          return Math.max(smin(d - g, band, Math.min(kr, g) * 0.5 + 0.2), o);
        }
        return smax(g - d, inner, Math.min(kr, g) * 0.5 + 0.2);
      };
      const pad = 3;
      return { evalFn, domain: { x0: x0 - pad, y0: y0 - pad, x1: x0 + W + pad, y1: y0 + H + pad }, count };
    },
  };
})();
