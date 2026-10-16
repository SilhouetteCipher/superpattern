// Space Fill: classic space-filling curves (Hilbert, Moore, Peano, Gosper's flowsnake) grown by
// Lindenmayer rewriting and drawn as one continuous band. A turtle walks the rewritten string on a unit
// grid (90° turns, or 60° for the hexagonal flowsnake); the path is scaled to fill the board, its corners
// are rounded with a quadratic blend whose depth is set by "Corner", and it can be doubled into parallel
// tracks. The Moore curve closes on itself, so its band is a single closed loop splitting the board into
// two interlocking combs. Seeded breaks cut the band into runs (short runs are dropped, so there are no
// tiny islands); width can swell across the board or around field points.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // L-systems: F, A, B draw one unit step; + / − turn by `turn` degrees; other symbols only rewrite.
  // maxOrder keeps the vertex count (and the smallest feature) sane on a 200 mm board.
  const CURVES = {
    hilbert: { axiom: 'X', rules: { X: '+YF-XFX-FY+', Y: '-XF+YFY+FX-' }, turn: 90, maxOrder: 6 },
    moore: { axiom: 'XFX+F+XFX', rules: { X: '-YF+XFX+FY-', Y: '+XF-YFY-FX+' }, turn: 90, maxOrder: 5, closed: true },
    peano: { axiom: 'X', rules: { X: 'XFYFX+F+YFXFY-F-XFYFX', Y: 'YFXFY-F-XFYFX+F+YFXFY' }, turn: 90, maxOrder: 3 },
    gosper: { axiom: 'A', rules: { A: 'A-B--B+A++AA+B-', B: '+A-BB--B-A++A+B' }, turn: 60, maxOrder: 4 },
  };

  // Rewrite `order` times and walk the turtle → unit-step vertices.
  function walk(C, order) {
    let s = C.axiom;
    for (let k = 0; k < order; k++) {
      let n = '';
      for (const ch of s) n += C.rules[ch] ?? ch;
      s = n;
    }
    const pts = [[0, 0]];
    let x = 0, y = 0, a = 0;
    const t = C.turn * D2R;
    for (const ch of s) {
      if (ch === 'F' || ch === 'A' || ch === 'B') {
        x += Math.cos(a); y += Math.sin(a);
        pts.push([x, y]);
      } else if (ch === '+') a += t;
      else if (ch === '-') a -= t;
    }
    return pts;
  }

  // Round every corner of a polyline: cut back c along both legs and blend with a quadratic whose control
  // point is the corner (G1 with the straight legs). `closed` wraps the first/last corner too.
  function roundCorners(P, c, closed) {
    const n = P.length, out = [];
    if (c <= 1e-6 || n < 3) return closed ? [...P, P[0]] : P.slice();
    const K = 6;
    const corner = (a, v, b) => {
      const la = Math.hypot(a[0] - v[0], a[1] - v[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
      const ca = Math.min(c, la / 2) / la, cb = Math.min(c, lb / 2) / lb;
      const p0 = [v[0] + (a[0] - v[0]) * ca, v[1] + (a[1] - v[1]) * ca];
      const p2 = [v[0] + (b[0] - v[0]) * cb, v[1] + (b[1] - v[1]) * cb];
      // Straight-through vertex: no blend needed.
      const cr = (v[0] - a[0]) * (b[1] - v[1]) - (v[1] - a[1]) * (b[0] - v[0]);
      if (Math.abs(cr) < 1e-9 * la * lb) { out.push(v); return; }
      for (let k = 0; k <= K; k++) {
        const t = k / K, u = 1 - t;
        out.push([u * u * p0[0] + 2 * u * t * v[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * v[1] + t * t * p2[1]]);
      }
    };
    if (closed) {
      for (let i = 0; i < n; i++) corner(P[(i + n - 1) % n], P[i], P[(i + 1) % n]);
      out.push(out[0]);
    } else {
      out.push(P[0]);
      for (let i = 1; i < n - 1; i++) corner(P[i - 1], P[i], P[i + 1]);
      out.push(P[n - 1]);
    }
    // Neighbouring blends can share an end point (corner = 1); drop repeats so normals stay defined.
    return out.filter((q, i) => i === 0 || Math.hypot(q[0] - out[i - 1][0], q[1] - out[i - 1][1]) > 1e-7);
  }

  // Offset a polyline sideways by d (miter-limited averaged normals) for parallel tracks.
  function offset(P, d, closed) {
    if (Math.abs(d) < 1e-9) return P;
    const n = P.length, out = [];
    const nrm = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [-dy / l, dx / l]; };
    for (let i = 0; i < n; i++) {
      let prev = i > 0 ? P[i - 1] : closed ? P[n - 2] : null;
      let next = i < n - 1 ? P[i + 1] : closed ? P[1] : null;
      const n1 = prev ? nrm(prev, P[i]) : null, n2 = next ? nrm(P[i], next) : null;
      let m = n1 && n2 ? [n1[0] + n2[0], n1[1] + n2[1]] : n1 || n2;
      const ml = Math.hypot(m[0], m[1]) || 1;
      m = [m[0] / ml, m[1] / ml];
      const cosH = Math.max(0.5, m[0] * (n1 || n2)[0] + m[1] * (n1 || n2)[1]);
      out.push([P[i][0] + (m[0] * d) / cosH, P[i][1] + (m[1] * d) / cosH]);
    }
    return out;
  }

  SP.generators.spacefill = {
    id: 'spacefill',
    name: 'Space Fill',
    board: true,
    schema: [
      { group: 'Curve' },
      { key: 'curve', label: 'Curve', type: 'select', def: 'moore', options: [['hilbert', 'Hilbert'], ['moore', 'Moore (closed loop)'], ['peano', 'Peano'], ['gosper', 'Gosper flowsnake']] },
      { key: 'order', label: 'Order', min: 1, max: 6, step: 1, def: 4, int: true, rand: [3, 5] },
      { key: 'rotate', label: 'Rotate °', min: -180, max: 180, step: 1, def: 0 },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { group: 'Band' },
      { key: 'width', label: 'Width (× pitch)', min: 0.1, max: 0.9, step: 0.01, def: 0.42, rand: [0.28, 0.6] },
      { key: 'corner', label: 'Corner rounding', min: 0, max: 1, step: 0.01, def: 1, rand: [0.4, 1] },
      { key: 'tracks', label: 'Tracks', min: 1, max: 3, step: 1, def: 1, int: true, rand: [1, 2] },
      { key: 'trackGap', label: 'Track spacing (× pitch)', min: 0.1, max: 0.6, step: 0.01, def: 0.3, rand: [0.24, 0.36] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.3, rand: [0.15, 0.8] },
      { group: 'Breaks' },
      { key: 'breaks', label: 'Break chance', min: 0, max: 0.5, step: 0.005, def: 0, rand: [0, 0.12] },
      { key: 'minRun', label: 'Min run (steps)', min: 1, max: 40, step: 1, def: 4, int: true, rand: [3, 10] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 17, int: true, rand: [1, 9999] },
      { group: 'Swell' },
      { key: 'grad', label: 'Width gradient', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.5, 0.5] },
      { key: 'gradAngle', label: 'Gradient angle °', min: -180, max: 180, step: 1, def: 0, rand: [-180, 180] },
      { key: 'fieldWidth', label: 'Points → width', min: -1, max: 1, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const C = CURVES[p.curve] || CURVES.moore;
      const order = Math.max(1, Math.min(C.maxOrder, Math.round(p.order)));
      let P = walk(C, order);
      const closed = !!C.closed; // the Moore curve ends one step from its start, so it wraps


      // Rotate, then fit the unit-step path (plus half a step all round) into the board minus margin.
      const rc = Math.cos(p.rotate * D2R), rs = Math.sin(p.rotate * D2R);
      P = P.map(([x, y]) => [rc * x - rs * y, rs * x + rc * y]);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const mg = Math.max(0, p.margin);
      const W = Math.max(1, B.w - 2 * mg), H = Math.max(1, B.h - 2 * mg);
      const L = Math.min(W / (x1 - x0 + 1), H / (y1 - y0 + 1)); // pitch: mm per step
      const ox = B.w / 2 - ((x0 + x1) / 2) * L, oy = B.h / 2 - ((y0 + y1) / 2) * L;
      P = P.map(([x, y]) => [ox + x * L, oy + y * L]);

      // Split into runs at seeded breaks (a break removes one step); runs shorter than minRun are dropped.
      const rand = rng(p.seed * 2654435761 + 3);
      const nSeg = closed ? P.length : P.length - 1; // closed: segment P[n-1] → P[0] too
      const runs = [];
      let cur = [0];
      let broke = false;
      for (let i = 0; i < nSeg; i++) {
        if (p.breaks > 0 && rand() < p.breaks) {
          broke = true;
          if (cur.length > 1) runs.push(cur);
          cur = [(i + 1) % P.length];
        } else cur.push((i + 1) % P.length);
      }
      if (cur.length > 1) runs.push(cur);
      let paths;
      if (!broke) paths = [{ pts: P, closed }];
      else {
        // A closed loop's last run continues into its first one.
        if (closed && runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1].at(-1) === 0) {
          const last = runs.pop();
          runs[0] = last.concat(runs[0].slice(1));
        }
        paths = runs.filter((r) => r.length - 1 >= Math.max(1, p.minRun)).map((r) => ({ pts: r.map((k) => P[k]), closed: false }));
      }

      // Width: base fraction of pitch, swelled by a linear gradient and field points.
      const ga = p.gradAngle * D2R, gx = Math.cos(ga), gy = -Math.sin(ga);
      const ext = Math.abs(gx) * B.w + Math.abs(gy) * B.h || 1;
      const radiusAt = (x, y) => {
        let k = 1 + p.grad * (((x - B.w / 2) * gx + (y - B.h / 2) * gy) / ext) * 2;
        if (points.length && p.fieldWidth) k += p.fieldWidth * fieldAt(x, y);
        const w = Math.min(0.92, Math.max(0.05, p.width * k)) * L;
        return Math.max(0.3, w / 2);
      };

      // Tracks need room: below ~0.6 mm per track the band stays single.
      let nT = Math.max(1, Math.round(p.tracks));
      while (nT > 1 && 0.6 * Math.min(p.trackGap, 0.32 / ((nT - 1) / 2 + 0.3)) * L < 0.6) nT--;
      const out = { strokes: [], blobs: [], count: 0 };
      const c = Math.max(0, Math.min(1, p.corner)) * L * 0.5;
      // Track spacing, limited so the outer tracks stay clear of the neighbouring run one pitch away.
      const g = nT > 1 ? Math.min(p.trackGap, 0.32 / ((nT - 1) / 2 + 0.3)) : 0;
      for (const path of paths) {
        const R = roundCorners(path.pts, c, path.closed);
        for (let t = 0; t < nT; t++) {
          const d = (t - (nT - 1) / 2) * g * L;
          const Q = offset(R, d, path.closed);
          // Tracks are capped at 0.3 × spacing wide each side, so they always keep a gap between them.
          out.strokes.push({ pts: Q, r: Q.map((q) => Math.max(0.3, nT > 1 ? Math.min(radiusAt(q[0], q[1]), 0.3 * g * L) : radiusAt(q[0], q[1]))) });
        }
        out.count++;
      }
      return out;
    },
  };
})();
