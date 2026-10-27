// Growth: differential line growth (Anders Hoff / inconvergent; Jason Webb's 2D write-up). A few closed loops of
// nodes are relaxed under three rules every step: each node is pulled toward the midpoint of its two neighbours
// (keeps the line smooth), pushed away from every node within one "Spacing" (keeps folds apart), and any edge
// that grows longer than half a spacing is split at its midpoint (adds material). Because new nodes arrive
// faster than the repulsion can spread them, the loop has to buckle, and it folds into brain-coral meanders that
// pack the bounds. "Curvature bias" adds extra random splits weighted toward already-bent nodes (Hoff's
// "shepherding"), which makes tighter, lobed fingers; "Wiggle" adds seeded jitter. Loops start as one small ring,
// scattered seeds (plus one per field point), or one big ring that buckles inward from the boundary. Growth stops
// when the total line length reaches "Fill" of the area ÷ spacing, then the loops relax without splitting so
// neighbours settle at an even spacing. Each loop is drawn as a closed band whose radius never lets neighbours
// get closer than "Min gap"; "Swell" thickens the oldest stretches and thins the newest. Results are memoised so
// the simulation only reruns when a parameter, the board or the field points change.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3;
  const MAX_NODES = 9000;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  let memoKey = '', memoOut = null;

  SP.generators.growth = {
    id: 'growth',
    name: 'Growth',
    board: true,
    schema: [
      { group: 'Growth' },
      { key: 'start', label: 'Start from', type: 'select', def: 'centre', options: [['centre', 'One ring at the centre'], ['scatter', 'Scattered seeds'], ['ring', 'Boundary ring (buckles inward)']] },
      { key: 'seeds', label: 'Seeds', min: 1, max: 8, step: 1, def: 4, int: true, rand: [2, 6] },
      { key: 'fill', label: 'Fill', min: 0.2, max: 0.95, step: 0.01, def: 0.75, rand: [0.5, 0.88] },
      { key: 'spacing', label: 'Spacing (mm)', min: 3, max: 16, step: 0.1, def: 6, rand: [4.5, 9] },
      { key: 'bias', label: 'Curvature bias', min: 0, max: 1, step: 0.01, def: 0.4, rand: [0, 1] },
      { key: 'wiggle', label: 'Wiggle', min: 0, max: 1, step: 0.01, def: 0.2, rand: [0, 0.6] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 11, int: true, rand: [1, 9999] },
      { group: 'Bounds' },
      { key: 'bound', label: 'Shape', type: 'select', def: 'rect', options: [['rect', 'Rounded rectangle'], ['ellipse', 'Ellipse']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { group: 'Band' },
      { key: 'width', label: 'Width (× spacing)', min: 0.15, max: 0.85, step: 0.01, def: 0.5, rand: [0.32, 0.7] },
      { key: 'swell', label: 'Swell (old → new)', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.7] },
      { key: 'gap', label: 'Min gap (mm)', min: 0.6, max: 5, step: 0.05, def: 1 },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.4, rand: [0.1, 0.9] },
    ],

    generateBoard(p, ctx) {
      const { board: B, points } = ctx;
      const key = JSON.stringify([p, B.w, B.h, points.map((q) => [q.x, q.y])]);
      if (key === memoKey && memoOut) return memoOut;
      const out = grow(p, B, points);
      memoKey = key;
      memoOut = out;
      return out;
    },
  };

  function grow(p, B, points) {
    const rand = rng(p.seed * 2654435761 + 7);
    const D = Math.max(3, p.spacing); // repulsion radius = centreline spacing (mm)
    const gap = Math.max(0.6, p.gap);
    const rMax = Math.max(MIN_R, Math.min((p.width * D) / 2, (D - gap) / 2));
    const mg = Math.max(0, p.margin) + rMax;
    const out = { strokes: [], blobs: [], count: 0, k: p.fillet || 0.3 };
    const cx = B.w / 2, cy = B.h / 2, hx = B.w / 2 - mg, hy = B.h / 2 - mg;
    if (hx < 2 * D || hy < 2 * D) return out;
    const edgeMax = D * 0.5;

    // ---- Bounds as a signed distance (negative inside) ----
    const ell = p.bound === 'ellipse';
    const cr = Math.min(hx, hy, 3 * D); // rounded-rectangle corner radius
    const sd = ell
      ? (x, y) => { const u = (x - cx) / hx, v = (y - cy) / hy, q = Math.hypot(u, v); return (q - 1) * Math.min(hx, hy); }
      : (x, y) => {
        const qx = Math.abs(x - cx) - (hx - cr), qy = Math.abs(y - cy) - (hy - cr);
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - cr;
      };
    const area = ell ? Math.PI * hx * hy : 4 * hx * hy - (4 - Math.PI) * cr * cr;
    const targetLen = Math.max(0.2, Math.min(0.95, p.fill)) * area / D;

    // ---- Seed loops: each is { x: [], y: [], age: [] } ----
    const loops = [];
    const ring = (x, y, rx, ry) => {
      const n = Math.max(8, Math.ceil((Math.PI * (rx + ry)) / (edgeMax * 0.8)));
      const L = { x: [], y: [], age: [] };
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, j = 1 + (rand() - 0.5) * 0.04;
        L.x.push(x + Math.cos(a) * rx * j); L.y.push(y + Math.sin(a) * ry * j); L.age.push(0);
      }
      loops.push(L);
    };
    const r0 = D * 1.1;
    if (p.start === 'ring') {
      const f = Math.max(0.3, 1 - (2 * D) / Math.min(hx, hy));
      ring(cx, cy, hx * f, hy * f);
    } else if (p.start === 'scatter') {
      const n = Math.max(1, Math.min(8, Math.round(p.seeds)));
      const placed = [];
      for (let tries = 0; placed.length < n && tries < 400; tries++) {
        const x = cx + (rand() * 2 - 1) * (hx - 2 * D), y = cy + (rand() * 2 - 1) * (hy - 2 * D);
        if (sd(x, y) > -2 * D) continue;
        const minSep = Math.min(hx, hy) * (tries < 200 ? 0.5 : 0.2);
        if (placed.some((q) => Math.hypot(q[0] - x, q[1] - y) < minSep)) continue;
        placed.push([x, y]);
      }
      for (const q of placed) ring(q[0], q[1], r0, r0);
    } else ring(cx, cy, r0, r0);
    for (const q of points) if (sd(q.x, q.y) < -2 * D && !loops.some((L) => Math.hypot(L.x[0] - q.x, L.y[0] - q.y) < 3 * D)) ring(q.x, q.y, r0, r0);
    if (!loops.length) ring(cx, cy, r0, r0);

    // ---- Uniform grid over the board for neighbour queries (cell = D) ----
    const gw = Math.max(1, Math.ceil(B.w / D) + 2), gh = Math.max(1, Math.ceil(B.h / D) + 2);
    const cellStart = new Int32Array(gw * gh + 1);
    let GX = new Float64Array(0), GY = GX, GL = new Int32Array(0), GI = GL, order = GL, cellOf = GL;
    const cellIdx = (x, y) => {
      const i = Math.min(gw - 1, Math.max(0, Math.floor(x / D) + 1)), j = Math.min(gh - 1, Math.max(0, Math.floor(y / D) + 1));
      return j * gw + i;
    };
    const buildGrid = () => {
      let n = 0;
      for (const L of loops) n += L.x.length;
      if (GX.length < n) { GX = new Float64Array(n * 2); GY = new Float64Array(n * 2); GL = new Int32Array(n * 2); GI = new Int32Array(n * 2); order = new Int32Array(n * 2); cellOf = new Int32Array(n * 2); }
      cellStart.fill(0);
      let k = 0;
      loops.forEach((L, li) => {
        for (let i = 0; i < L.x.length; i++, k++) {
          GX[k] = L.x[i]; GY[k] = L.y[i]; GL[k] = li; GI[k] = i;
          const c = cellIdx(L.x[i], L.y[i]);
          cellOf[k] = c; cellStart[c + 1]++;
        }
      });
      for (let c = 0; c < gw * gh; c++) cellStart[c + 1] += cellStart[c];
      const fillPos = cellStart.slice(0, gw * gh);
      for (let t = 0; t < n; t++) order[fillPos[cellOf[t]]++] = t;
      return n;
    };
    // Visit grid nodes within D of (x, y): fn(globalIndex, dx, dy, dist).
    const visit = (x, y, fn) => {
      const ci = Math.floor(x / D) + 1, cj = Math.floor(y / D) + 1;
      for (let j = Math.max(0, cj - 1); j <= Math.min(gh - 1, cj + 1); j++)
        for (let i = Math.max(0, ci - 1); i <= Math.min(gw - 1, ci + 1); i++) {
          const c = j * gw + i;
          for (let s = cellStart[c]; s < cellStart[c + 1]; s++) {
            const t = order[s], dx = x - GX[t], dy = y - GY[t], d = Math.hypot(dx, dy);
            if (d < D) fn(t, dx, dy, d);
          }
        }
    };

    const totalLen = () => {
      let s = 0;
      for (const L of loops) for (let i = 0, n = L.x.length; i < n; i++) s += Math.hypot(L.x[(i + 1) % n] - L.x[i], L.y[(i + 1) % n] - L.y[i]);
      return s;
    };

    // One relaxation step: smoothing + repulsion + jitter, Jacobi update, then pushed back inside the bounds.
    const kS = 0.35, kR = 0.45, maxMove = D * 0.2, jit = p.wiggle * D * 0.06, wall = D * 0.5;
    const step = (growing) => {
      buildGrid();
      for (let li = 0; li < loops.length; li++) {
        const L = loops[li], n = L.x.length, nx = new Array(n), ny = new Array(n);
        for (let i = 0; i < n; i++) {
          const a = (i - 1 + n) % n, b = (i + 1) % n, x = L.x[i], y = L.y[i];
          let mx = ((L.x[a] + L.x[b]) / 2 - x) * kS, my = ((L.y[a] + L.y[b]) / 2 - y) * kS;
          let rx = 0, ry = 0;
          visit(x, y, (t, dx, dy, d) => {
            if (GL[t] === li && (GI[t] === i || GI[t] === a || GI[t] === b)) return;
            if (d < 1e-6) { dx = rand() - 0.5; dy = rand() - 0.5; d = Math.hypot(dx, dy); }
            const w = (D - d) / D;
            rx += (dx / d) * w; ry += (dy / d) * w;
          });
          mx += rx * kR * D * 0.25; my += ry * kR * D * 0.25;
          if (growing && jit) { mx += (rand() - 0.5) * jit; my += (rand() - 0.5) * jit; }
          const m = Math.hypot(mx, my);
          if (m > maxMove) { mx *= maxMove / m; my *= maxMove / m; }
          let X = x + mx, Y = y + my;
          const s = sd(X, Y);
          if (s > -wall) {
            const e = 0.01, gx = sd(X + e, Y) - sd(X - e, Y), gy = sd(X, Y + e) - sd(X, Y - e), gl = Math.hypot(gx, gy) || 1;
            const push = s > 0 ? s + wall * 0.2 : (s + wall) * 0.3;
            X -= (gx / gl) * push; Y -= (gy / gl) * push;
          }
          nx[i] = X; ny[i] = Y;
        }
        L.x = nx; L.y = ny;
      }
    };

    // Split long edges, plus a few curvature-weighted random splits (Hoff's shepherding).
    const split = (iter) => {
      let total = 0;
      for (const L of loops) total += L.x.length;
      for (const L of loops) {
        const n = L.x.length, X = [], Y = [], A = [];
        const extra = Math.max(1, Math.round(n * 0.006));
        const pick = new Set();
        if (total < MAX_NODES)
          for (let e = 0; e < extra; e++) {
            const i = Math.floor(rand() * n), a = (i - 1 + n) % n, b = (i + 1) % n;
            const ux = L.x[i] - L.x[a], uy = L.y[i] - L.y[a], vx = L.x[b] - L.x[i], vy = L.y[b] - L.y[i];
            const turn = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
            if (rand() < 1 - p.bias + p.bias * Math.min(1, turn * 3)) pick.add(i);
          }
        for (let i = 0; i < n; i++) {
          const b = (i + 1) % n;
          X.push(L.x[i]); Y.push(L.y[i]); A.push(L.age[i]);
          const d = Math.hypot(L.x[b] - L.x[i], L.y[b] - L.y[i]);
          if (total < MAX_NODES && (d > edgeMax || (pick.has(i) && d > edgeMax * 0.4))) {
            X.push((L.x[i] + L.x[b]) / 2); Y.push((L.y[i] + L.y[b]) / 2); A.push(iter);
            total++;
          }
        }
        L.x = X; L.y = Y; L.age = A;
      }
      return total;
    };

    let iter = 0;
    const maxIter = 2500;
    for (; iter < maxIter; iter++) {
      step(true);
      const n = split(iter + 1);
      if (n >= MAX_NODES || (iter % 10 === 0 && totalLen() >= targetLen)) break;
    }
    for (let k = 0; k < 40; k++) step(false); // settle to an even spacing

    // ---- Bands: radius limited by non-adjacent neighbours, optional swell by age ----
    buildGrid();
    const lastAge = Math.max(1, iter);
    for (let li = 0; li < loops.length; li++) {
      const L = loops[li], n = L.x.length;
      if (n < 6) continue;
      let len = 0;
      for (let i = 0; i < n; i++) len += Math.hypot(L.x[(i + 1) % n] - L.x[i], L.y[(i + 1) % n] - L.y[i]);
      const skip = Math.ceil((1.6 * D) / (len / n)); // nodes this close along the loop aren't "neighbours"
      let r = new Array(n);
      for (let i = 0; i < n; i++) {
        let near = D * 2;
        visit(L.x[i], L.y[i], (t, dx, dy, d) => {
          if (GL[t] === li) { const di = Math.abs(GI[t] - i), c = Math.min(di, n - di); if (c <= skip) return; }
          if (d < near) near = d;
        });
        const sw = 1 - p.swell * 0.6 * (L.age[i] / lastAge);
        r[i] = Math.max(MIN_R, Math.min(rMax * sw, (near - gap) / 2));
      }
      const bound = r.slice();
      for (let pass = 0; pass < 3; pass++) {
        const s = r.slice();
        for (let i = 0; i < n; i++) s[i] = Math.max(MIN_R, Math.min(bound[i], (r[(i - 1 + n) % n] + 2 * r[i] + r[(i + 1) % n]) / 4));
        r = s;
      }
      // Light Laplacian smoothing of the centreline before output.
      let X = L.x.slice(), Y = L.y.slice();
      for (let pass = 0; pass < 2; pass++) {
        const sx = X.slice(), sy = Y.slice();
        for (let i = 0; i < n; i++) {
          const a = (i - 1 + n) % n, b = (i + 1) % n;
          sx[i] = (X[a] + 2 * X[i] + X[b]) / 4; sy[i] = (Y[a] + 2 * Y[i] + Y[b]) / 4;
        }
        X = sx; Y = sy;
      }
      const pts = X.map((x, i) => [x, Y[i]]);
      out.strokes.push({ pts: [...pts, pts[0]], r: [...r, r[0]] });
      out.count++;
    }
    return out;
  }
})();
