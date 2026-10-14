// Knotwork: Celtic plaits by the grid-and-breaks rule (Bain / Glassner / Sloss). Crossing sites sit at
// the midpoints of a grid of primary dots; strands run diagonally between them. At each site the two
// strands either cross, or a "break" (a wall along a grid line, horizontal or vertical) turns them back
// on themselves. The board edge is always a wall, so every strand closes into a loop. Over/under
// alternates along every strand (site column parity decides, and walls on grid lines preserve it);
// the under-strand is cut back at each crossing so the relief reads as woven bands with real gaps.
(function () {
  const SP = (window.SP = window.SP || {});

  function hash(i, j, seed, salt) {
    let h = (i * 374761393 + j * 668265263 + seed * 2246822519 + salt * 3266489917) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // Ports: unit lattice directions out of a site (y down, so N = -y).
  const DIRS = [[1, -1], [-1, -1], [1, 1], [-1, 1]]; // NE, NW, SE, SW
  const NE = 0, NW = 1, SE = 2, SW = 3;
  const OPP = [SW, SE, NW, NE];
  // Port pairing per site state: 'x' cross, 'h' horizontal wall, 'v' vertical wall.
  const PAIR = { x: [SW, SE, NW, NE], h: [NW, NE, SW, SE], v: [SE, SW, NE, NW] };

  // Wall at site (i,j): null (cross), 'h' or 'v'. Sites are lattice points with i+j odd in a C×R lattice.
  function wallAt(p, i, j, C, R, f) {
    if (j === 0 || j === R) return 'h';
    if (i === 0 || i === C) return 'v';
    // Symmetry: decisions are made in a fundamental region and mirrored.
    const ci = p.symmetry !== 'none' ? Math.min(i, C - i) : i;
    const cj = p.symmetry === 'quad' ? Math.min(j, R - j) : j;
    const k = 2 * Math.max(1, Math.round(p.period));
    let w = null;
    if (p.pattern === 'panels' || p.pattern === 'rings') {
      // Walls run between primary dots (even lattice coords), so h-walls sit on even rows, v-walls on even columns.
      if (p.pattern === 'panels') {
        if (j % 2 === 0 && j % k === 0) w = 'h';
        else if (i % 2 === 0 && i % k === 0) w = 'v';
      } else {
        const dj = Math.min(j, R - j), di = Math.min(i, C - i);
        if (j % 2 === 0 && dj % k === 0 && di > dj) w = 'h';
        else if (i % 2 === 0 && di % k === 0 && dj > di) w = 'v';
      }
      if (w && hash(ci, cj, p.seed, 3) < p.doors) w = null;
    }
    if (!w) {
      const prob = (p.pattern === 'random' ? p.density : 0) + p.fieldBreak * f;
      if (hash(ci, cj, p.seed, 1) < prob) w = hash(ci, cj, p.seed, 2) < p.hBias ? 'h' : 'v';
    }
    return w;
  }

  SP.generators.knotwork = {
    id: 'knotwork',
    name: 'Knotwork',
    board: true,
    schema: [
      { group: 'Grid' },
      { key: 'cols', label: 'Columns', min: 1, max: 20, step: 1, def: 6, int: true, rand: [3, 8] },
      { key: 'rows', label: 'Rows', min: 1, max: 20, step: 1, def: 6, int: true, rand: [3, 8] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 10 },
      { group: 'Breaks' },
      { key: 'pattern', label: 'Breaks', type: 'select', def: 'random', options: [['random', 'Random breaks'], ['panels', 'Panels'], ['rings', 'Nested rings'], ['plait', 'Plain plait']] },
      { key: 'density', label: 'Break density', min: 0, max: 1, step: 0.01, def: 0.3, rand: [0.12, 0.45], show: (o) => o.pattern === 'random' },
      { key: 'period', label: 'Panel size (cells)', min: 1, max: 10, step: 1, def: 2, int: true, rand: [1, 3], show: (o) => o.pattern === 'panels' || o.pattern === 'rings' },
      { key: 'doors', label: 'Doors in walls', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0, 0.5], show: (o) => o.pattern === 'panels' || o.pattern === 'rings' },
      { key: 'hBias', label: 'Horizontal bias', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0.2, 0.8] },
      { key: 'symmetry', label: 'Symmetry', type: 'select', def: 'quad', options: [['none', 'None'], ['mirror', 'Mirror (left/right)'], ['quad', 'Mirror both ways']] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 17, int: true, rand: [1, 9999] },
      { group: 'Strand' },
      { key: 'width', label: 'Width (× spacing)', min: 0.15, max: 0.65, step: 0.005, def: 0.42, rand: [0.3, 0.52] },
      { key: 'gap', label: 'Crossing gap (mm)', min: 0.3, max: 6, step: 0.05, def: 1.6, rand: [1, 2.6] },
      { key: 'sharp', label: 'Turn sharpness', min: 0.2, max: 1, step: 0.01, def: 0.8, rand: [0.45, 1] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 2, step: 0.01, def: 0.3 },
      { group: 'Field points' },
      { key: 'fieldBreak', label: 'Points → breaks', min: -1, max: 1, step: 0.01, def: 0.5 },
      { key: 'fieldWidth', label: 'Points → width', min: -1, max: 1, step: 0.01, def: 0.3 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const C = 2 * Math.max(1, Math.round(p.cols)), R = 2 * Math.max(1, Math.round(p.rows));
      const u = Math.max(0.5, Math.min((B.w - 2 * p.margin) / C, (B.h - 2 * p.margin) / R));
      const x0 = B.w / 2 - (C * u) / 2, y0 = B.h / 2 - (R * u) / 2;
      const pos = (i, j) => [x0 + i * u, y0 + j * u];
      const fv = (x, y) => (points.length ? fieldAt(x, y) : 0);
      // Strand width: spacing between parallel strands is u·√2; keep turn tips clear of the wall.
      const w0 = Math.max(0.3 * u, Math.min(p.width * Math.SQRT2 * u, 0.9 * u - p.gap));
      const wAt = (x, y) => w0 * (p.fieldWidth && points.length ? Math.min(1.4, Math.max(0.4, 1 + p.fieldWidth * fv(x, y))) : 1);

      const sites = new Map(), key = (i, j) => i + ',' + j;
      for (let j = 0; j <= R; j++)
        for (let i = 0; i <= C; i++) {
          if ((i + j) % 2 === 0) continue;
          const [x, y] = pos(i, j);
          sites.set(key(i, j), { i, j, x, y, wall: wallAt(p, i, j, C, R, fv(x, y)), used: [0, 0, 0, 0] });
        }

      const L = u * Math.SQRT2, step = Math.max(0.4, Math.min(1.2, u / 10));
      const cubic = (a, b, c, d, n, pts) => {
        for (let k = 1; k <= n; k++) {
          const t = k / n, s = 1 - t;
          pts.push([s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0], s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]]);
        }
      };
      // Trace one closed strand from (site, port): returns dense points + indices of under-crossings.
      const trace = (s0, pin0) => {
        const pts = [], under = [];
        let s = s0, pin = pin0;
        for (let guard = 0; guard < 100000; guard++) {
          const pout = PAIR[s.wall || 'x'][pin];
          s.used[pin] = s.used[pout] = 1;
          const di = DIRS[pin], dout = DIRS[pout];
          const Min = [s.x + (di[0] * u) / 2, s.y + (di[1] * u) / 2], Mout = [s.x + (dout[0] * u) / 2, s.y + (dout[1] * u) / 2];
          if (!pts.length) pts.push(Min);
          const n = Math.max(2, Math.ceil(L / 2 / step));
          if (!s.wall) {
            for (let k = 1; k <= n; k++) pts.push([Min[0] + (s.x - Min[0]) * (k / n), Min[1] + (s.y - Min[1]) * (k / n)]);
            // NE–SW family is over on even columns; walls on grid lines keep this alternating.
            const neSw = pin === NE || pin === SW;
            if (neSw !== (s.i % 2 === 0)) under.push({ idx: pts.length - 1, w: wAt(s.x, s.y) });
            for (let k = 1; k <= n; k++) pts.push([s.x + (Mout[0] - s.x) * (k / n), s.y + (Mout[1] - s.y) * (k / n)]);
          } else {
            // Turn: one symmetric cubic from midpoint to midpoint with its handles along the diagonals (so
            // the strand stays G1). Handle reach toward the site sets how deep and pointed the turn is;
            // inside the board it is capped so the apex stays half a strand plus half the gap off the wall.
            const edge = s.i === 0 || s.i === C || s.j === 0 || s.j === R;
            let a = p.sharp * (L / 2);
            if (!edge) a = Math.min(a, Math.max(0, (u / 2 - Math.min(0.45 * u, wAt(s.x, s.y) / 2 + p.gap / 2)) / 0.53));
            const h1 = [-di[0] / Math.SQRT2, -di[1] / Math.SQRT2], h2 = [-dout[0] / Math.SQRT2, -dout[1] / Math.SQRT2];
            const m = Math.max(8, Math.ceil(L / step));
            cubic(Min, [Min[0] + h1[0] * a, Min[1] + h1[1] * a], [Mout[0] + h2[0] * a, Mout[1] + h2[1] * a], Mout, m, pts);
          }
          const nx = sites.get(key(s.i + dout[0], s.j + dout[1]));
          if (!nx) break; // cannot happen: the board edge is always a wall
          s = nx;
          pin = OPP[pout];
          if (s === s0 && pin === pin0) break;
        }
        pts.pop(); // last point repeats the first midpoint
        return { pts, under };
      };

      const out = { strokes: [], blobs: [], count: 0 };
      const rOf = (q) => Math.max(0.3, wAt(q[0], q[1]) / 2);
      for (const s of sites.values())
        for (let port = 0; port < 4; port++) {
          if (s.used[port] || !sites.get(key(s.i + DIRS[port][0], s.j + DIRS[port][1]))) continue;
          const { pts, under } = trace(s, port);
          if (pts.length < 3) continue;
          out.count++;
          if (!under.length) {
            const loop = pts.concat([pts[0]]);
            out.strokes.push({ pts: loop, r: loop.map(rOf) });
            continue;
          }
          // Cyclic arc length, then drop everything within the cut distance of an under-crossing.
          const N = pts.length, acc = [0];
          for (let k = 1; k <= N; k++) acc.push(acc[k - 1] + Math.hypot(pts[k % N][0] - pts[k - 1][0], pts[k % N][1] - pts[k - 1][1]));
          const total = acc[N];
          const keep = new Uint8Array(N).fill(1);
          for (const c of under) {
            const cut = Math.min(0.9 * L, c.w + p.gap); // cap clears the over-strand by `gap`
            for (let k = 0; k < N; k++) {
              let d = Math.abs(acc[k] - acc[c.idx]);
              d = Math.min(d, total - d);
              if (d < cut) keep[k] = 0;
            }
          }
          let start = keep.indexOf(0);
          let run = [];
          for (let q = 1; q <= N; q++) {
            const k = (start + q) % N;
            if (keep[k]) run.push(pts[k]);
            else if (run.length) { if (run.length > 1) out.strokes.push({ pts: run, r: run.map(rOf) }); run = []; }
          }
          if (run.length > 1) out.strokes.push({ pts: run, r: run.map(rOf) });
        }
      return out;
    },
  };
})();
