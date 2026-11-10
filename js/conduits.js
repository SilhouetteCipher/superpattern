// Conduits: sci-fi pipework. Runs are routed on a square grid with 90° elbows (Manhattan walks that never
// reuse a cell, so pipes never cross), each run drawn as a bundle of parallel pipes with rounded elbows.
// Straight stretches get collars (short, wider bands across the bundle) and each run ends in a junction
// box. Everything is strokes, so the shared field fuses pipe, collar and box with the usual fillet.
// Field points attract runs: starting cells are drawn with weight toward them.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  // Round every corner of an axis-aligned polyline with a circular arc of radius r (clamped to half a leg).
  function roundCorners(P, r) {
    if (P.length < 3 || r <= 1e-6) return P.slice();
    const out = [P[0]];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], v = P[i], b = P[i + 1];
      const la = Math.hypot(a[0] - v[0], a[1] - v[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
      const rr = Math.min(r, la / 2, lb / 2);
      const ua = [(a[0] - v[0]) / la, (a[1] - v[1]) / la], ub = [(b[0] - v[0]) / lb, (b[1] - v[1]) / lb];
      const p0 = [v[0] + ua[0] * rr, v[1] + ua[1] * rr], p2 = [v[0] + ub[0] * rr, v[1] + ub[1] * rr];
      const c = [p0[0] + ub[0] * rr, p0[1] + ub[1] * rr]; // arc centre (legs are perpendicular)
      const a0 = Math.atan2(p0[1] - c[1], p0[0] - c[0]);
      let a1 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const K = Math.max(3, Math.ceil(Math.abs(da) * rr / 0.6));
      for (let k = 0; k <= K; k++) { const t = a0 + da * (k / K); out.push([c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)]); }
    }
    out.push(P[P.length - 1]);
    return out;
  }
  // Offset a polyline sideways by d (averaged normals, miter-limited).
  function offset(P, d) {
    if (Math.abs(d) < 1e-9) return P;
    const n = P.length, out = [];
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    for (let i = 0; i < n; i++) {
      const n1 = i > 0 ? nrm(P[i - 1], P[i]) : null, n2 = i < n - 1 ? nrm(P[i], P[i + 1]) : null;
      let m = n1 && n2 ? [n1[0] + n2[0], n1[1] + n2[1]] : n1 || n2;
      const ml = Math.hypot(m[0], m[1]) || 1;
      m = [m[0] / ml, m[1] / ml];
      const cosH = Math.max(0.5, m[0] * (n1 || n2)[0] + m[1] * (n1 || n2)[1]);
      out.push([P[i][0] + (m[0] * d) / cosH, P[i][1] + (m[1] * d) / cosH]);
    }
    return out;
  }

  SP.generators.conduits = {
    id: 'conduits',
    name: 'Conduits',
    board: true,
    schema: [
      { group: 'Routing' },
      { key: 'pitch', label: 'Grid pitch (mm)', min: 5, max: 40, step: 0.5, def: 12, rand: [9, 18] },
      { key: 'runs', label: 'Runs', min: 1, max: 60, step: 1, def: 14, int: true, rand: [6, 24] },
      { key: 'turn', label: 'Turn chance', min: 0, max: 1, step: 0.01, def: 0.3, rand: [0.15, 0.5] },
      { key: 'minLen', label: 'Min run (cells)', min: 2, max: 20, step: 1, def: 4, int: true, rand: [3, 6] },
      { key: 'maxLen', label: 'Max run (cells)', min: 3, max: 60, step: 1, def: 18, int: true, rand: [8, 30] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 8 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 21, int: true, rand: [1, 9999] },
      { group: 'Pipes' },
      { key: 'pipes', label: 'Pipes per run', min: 1, max: 4, step: 1, def: 2, int: true, rand: [1, 3] },
      { key: 'pipeW', label: 'Pipe width (mm)', min: 0.6, max: 10, step: 0.05, def: 2.4, rand: [1.6, 3.5] },
      { key: 'pipeGap', label: 'Pipe gap (mm)', min: 0.4, max: 8, step: 0.05, def: 1.4, rand: [1, 2.2] },
      { key: 'elbow', label: 'Elbow radius (× pitch)', min: 0, max: 0.5, step: 0.01, def: 0.35, rand: [0.2, 0.5] },
      { key: 'vary', label: 'Vary pipe count', type: 'bool', def: true },
      { group: 'Fittings' },
      { key: 'collars', label: 'Collars', type: 'bool', def: true },
      { key: 'collarEvery', label: 'Collar every (× pitch)', min: 1, max: 6, step: 0.5, def: 2, rand: [1.5, 3] },
      { key: 'collarW', label: 'Collar width (mm)', min: 0.6, max: 8, step: 0.05, def: 1.8, rand: [1.2, 2.6] },
      { key: 'collarOut', label: 'Collar overhang (mm)', min: 0, max: 5, step: 0.05, def: 1, rand: [0.5, 1.6] },
      { key: 'boxes', label: 'Junction boxes', type: 'bool', def: true },
      { key: 'boxSize', label: 'Box size (mm)', min: 1, max: 20, step: 0.1, def: 6, rand: [4, 9] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.4, rand: [0.2, 0.8] },
      { group: 'Field' },
      { key: 'fieldPull', label: 'Points → more runs', min: -1, max: 1, step: 0.01, def: 0.7 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 5);
      const mg = p.margin;
      const C = Math.max(1, Math.floor((B.w - 2 * mg) / p.pitch)), R = Math.max(1, Math.floor((B.h - 2 * mg) / p.pitch));
      const x0 = B.w / 2 - (C * p.pitch) / 2 + p.pitch / 2, y0 = B.h / 2 - (R * p.pitch) / 2 + p.pitch / 2;
      const cx = (i) => x0 + i * p.pitch, cy = (j) => y0 + j * p.pitch;
      const used = new Uint8Array(C * R);
      const free = (i, j) => i >= 0 && j >= 0 && i < C && j < R && !used[j * C + i];
      // Candidate starts, weighted toward field points.
      const weight = (i, j) => (points.length && p.fieldPull ? Math.max(0.05, 1 + p.fieldPull * 2 * fieldAt(cx(i), cy(j))) : 1);
      const pick = () => {
        let tot = 0; const cand = [];
        for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) if (!used[j * C + i]) { const w = weight(i, j); cand.push([i, j, w]); tot += w; }
        if (!cand.length) return null;
        let u = rand() * tot;
        for (const c of cand) { u -= c[2]; if (u <= 0) return c; }
        return cand[cand.length - 1];
      };
      const maxLen = Math.max(p.minLen, p.maxLen);
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const bundleW = (n) => n * p.pipeW + (n - 1) * p.pipeGap;
      const nMax = Math.max(1, Math.min(Math.round(p.pipes), Math.floor((p.pitch - p.pipeGap) / (p.pipeW + p.pipeGap))));

      for (let r = 0; r < Math.round(p.runs); r++) {
        const s = pick();
        if (!s) break;
        // Manhattan walk, no cell reuse; keep going straight unless a turn is rolled or blocked.
        let [i, j] = s, d = Math.floor(rand() * 4);
        const cells = [[i, j]];
        used[j * C + i] = 1;
        const len = p.minLen + Math.floor(rand() * (maxLen - p.minLen + 1));
        while (cells.length < len) {
          let order = [d];
          if (rand() < p.turn) order = rand() < 0.5 ? [(d + 1) % 4, d, (d + 3) % 4] : [(d + 3) % 4, d, (d + 1) % 4];
          else order = [d, (d + 1) % 4, (d + 3) % 4];
          let moved = false;
          for (const nd of order) {
            const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1];
            if (free(ni, nj)) { i = ni; j = nj; d = nd; used[j * C + i] = 1; cells.push([i, j]); moved = true; break; }
          }
          if (!moved) break;
        }
        if (cells.length < p.minLen) { for (const [a, b] of cells) used[b * C + a] = 0; continue; }
        // Keep only the corners of the walk, then round them.
        const pts = [[cx(cells[0][0]), cy(cells[0][1])]];
        for (let k = 1; k < cells.length - 1; k++) {
          const a = cells[k - 1], b = cells[k], c = cells[k + 1];
          if (a[0] - b[0] !== b[0] - c[0] || a[1] - b[1] !== b[1] - c[1]) pts.push([cx(b[0]), cy(b[1])]);
        }
        pts.push([cx(cells[cells.length - 1][0]), cy(cells[cells.length - 1][1])]);
        const n = p.vary ? 1 + Math.floor(rand() * nMax) : nMax;
        const Rb = Math.min(p.elbow * p.pitch, p.pitch / 2 - bundleW(n) / 2);
        const centre = roundCorners(pts, Math.max(0, Rb));
        const rad = p.pipeW / 2;
        for (let t = 0; t < n; t++) {
          const dd = (t - (n - 1) / 2) * (p.pipeW + p.pipeGap);
          const Q = offset(centre, dd);
          out.strokes.push({ pts: Q, r: Q.map(() => rad) });
        }
        // Collars across the bundle along straight legs; junction boxes at both ends.
        const half = bundleW(n) / 2 + p.collarOut;
        if (p.collars) {
          const every = p.collarEvery * p.pitch;
          for (let k = 0; k + 1 < pts.length; k++) {
            const a = pts[k], b = pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
            // Stay clear of the elbows and the end boxes.
            const clear = Math.max(Rb + p.collarW, p.boxes ? p.boxSize * 0.6 + p.collarW : 0);
            const m = Math.floor((L - 2 * clear) / every);
            if (m < 0) continue;
            const start = (L - m * every) / 2;
            for (let q = 0; q <= m; q++) {
              const s0 = start + q * every;
              if (s0 < clear || s0 > L - clear) continue;
              const px = a[0] + ux * s0, py = a[1] + uy * s0;
              out.strokes.push({ pts: [[px - nx * half, py - ny * half], [px + nx * half, py + ny * half]], r: [p.collarW / 2, p.collarW / 2] });
            }
          }
        }
        if (p.boxes) {
          const bs = Math.max(p.boxSize / 2, half);
          for (const e of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
            const [a, b] = e, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
            const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
            // A short, fat stroke across the pipe end reads as a rounded junction box.
            const hw = Math.max(0.3, bs - p.boxSize * 0.3);
            const px = a[0] + ux * p.boxSize * 0.15, py = a[1] + uy * p.boxSize * 0.15;
            out.strokes.push({ pts: [[px - nx * hw, py - ny * hw], [px + nx * hw, py + ny * hw]], r: [p.boxSize * 0.3, p.boxSize * 0.3] });
          }
        }
        out.count++;
      }
      return out;
    },
  };
})();
