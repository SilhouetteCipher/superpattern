// Truchet: Smith tiles — each grid cell holds two quarter-circle arcs (radius ½ cell) centred on opposite
// corners, in one of two orientations. Arcs join through edge midpoints into continuous paths and loops,
// which are traced as a graph so you can draw all of them, only the longest, or the top N.
// Paths can be drawn as parallel tracks; board edges cut the strokes flat.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Trace the Truchet graph for a given parameter set → array of { pts, closed, length } (unit = mm).
  function trace(p, B, fieldAt, T) {
    const C = Math.max(1, Math.round(p.cols));
    let R = Math.max(1, Math.round(p.rows));
    let s = Math.max(0.5, Math.min((B.w - 2 * p.margin) / C, (B.h - 2 * p.margin) / R));
    let x0 = B.w / 2 - (C * s) / 2, y0 = B.h / 2 - (R * s) / 2;
    if (T) {
      // Seamless: cells span the tile exactly (rows follow from the column size; y is stretched to fit).
      s = T.x ? B.w / C : s;
      if (T.y) R = Math.max(1, Math.round(B.h / s));
      x0 = T.x ? 0 : B.w / 2 - (C * s) / 2;
      y0 = T.y ? 0 : B.h / 2 - (R * s) / 2;
    }
    const rand = rng(p.seed * 2246822519 + 7);
    // Node ids: horizontal-edge midpoints H(i,j) (top edge of cell i,j), then vertical V(i,j) (left edge).
    const H = (i, j) => j * C + i, V = (i, j) => C * (R + 1) + j * (C + 1) + i;
    const nodePos = (n) => {
      if (n < C * (R + 1)) { const j = Math.floor(n / C), i = n - j * C; return [x0 + (i + 0.5) * s, y0 + j * s]; }
      const m = n - C * (R + 1), j = Math.floor(m / (C + 1)), i = m - j * (C + 1);
      return [x0 + i * s, y0 + (j + 0.5) * s];
    };
    const adj = new Map();
    const arcs = [];
    // Linear gradient coordinate in [-0.5, 0.5] across the grid, direction in degrees (0 = →, 90 = ↑).
    const grad = (x, y, deg) => SP.gradCoord(x, y, deg, B.w / 2, B.h / 2, C * s, R * s, T);
    const dropRand = rng(p.seed * 7919 + 13);
    const centred = new Map(); // grid vertex -> number of arcs centred on it
    const link = (a, b, cx, cy, tcx, tcy, m) => {
      const fd = p.fieldDrop ? p.fieldDrop * fieldAt(tcx, tcy) : 0;
      if (dropRand() < p.dropout + fd) return; // missing arcs break lines into dashes
      const vk = Math.round((cx - x0) / s) + ',' + Math.round((cy - y0) / s);
      centred.set(vk, (centred.get(vk) || 0) + 1);
      const k = arcs.length;
      arcs.push({ a, b, cx, cy, tcx, tcy, m });
      (adj.get(a) || adj.set(a, []).get(a)).push(k);
      (adj.get(b) || adj.set(b, []).get(b)).push(k);
    };
    // Per-column / per-row wave phases: mirrored neighbours join into loops and U-turns.
    const colPhase = Array.from({ length: C }, () => (rand() < 0.5 ? 1 : 0));
    const rowPhase = Array.from({ length: R }, () => (rand() < 0.5 ? 1 : 0));
    for (let j = 0; j < R; j++)
      for (let i = 0; i < C; i++) {
        const cx = x0 + (i + 0.5) * s, cy = y0 + (j + 0.5) * s;
        const fb = p.fieldBias ? p.fieldBias * fieldAt(cx, cy) : 0;
        let o;
        if (p.pattern === 'random') o = rand() < p.bias + fb ? 1 : 0;
        else {
          const base = p.pattern === 'columns' ? j % 2 : p.pattern === 'rows' ? i % 2
            : p.pattern === 'colphase' ? (j + colPhase[i]) % 2 : p.pattern === 'rowphase' ? (i + rowPhase[j]) % 2
            : p.pattern === 'checker' ? (i + j) % 2 : Math.floor((i + j) / 2) % 2;
          o = rand() < p.flip + fb ? 1 - base : base; // flipped tiles create the turns that join waves
        }
        const top = H(i, j), bottom = H(i, j + 1), left = V(i, j), right = V(i + 1, j);
        const X0 = x0 + i * s, Y0 = y0 + j * s, X1 = X0 + s, Y1 = Y0 + s;
        // Grid morph: 0 = quarter arcs, 1 = straight lines through the tile centre ("+" grid).
        let m = p.morph + p.morphGrad * grad(cx, cy, p.morphAngle) + (p.fieldMorph ? p.fieldMorph * fieldAt(cx, cy) : 0);
        m = Math.min(1, Math.max(0, 0.5 + (m - 0.5) * p.morphSharp));
        if (o === 0) { link(top, left, X0, Y0, cx, cy, m); link(bottom, right, X1, Y1, cx, cy, m); }
        else { link(top, right, X1, Y0, cx, cy, m); link(bottom, left, X0, Y1, cx, cy, m); }
      }
    // Walk components: open paths start at degree-1 (border) nodes; what remains are closed loops.
    const used = new Uint8Array(arcs.length);
    const comps = [];
    // Each connection is a rounded "L" through the tile centre P with corner radius rc:
    // rc = s/2 is exactly the Smith quarter arc; rc → 0 is two straight half-edges meeting at P.
    const arcPts = (k, from) => {
      const A = arcs[k], to = A.a === from ? A.b : A.a;
      const pa = nodePos(from), pb = nodePos(to);
      const P = [A.tcx, A.tcy];
      const da = [(pa[0] - P[0]) / (s / 2), (pa[1] - P[1]) / (s / 2)], db = [(pb[0] - P[0]) / (s / 2), (pb[1] - P[1]) / (s / 2)];
      const rc = Math.max(1e-4, (s / 2) * (1 - A.m));
      const st = [P[0] + da[0] * rc, P[1] + da[1] * rc], en = [P[0] + db[0] * rc, P[1] + db[1] * rc];
      const Q = [P[0] + (da[0] + db[0]) * rc, P[1] + (da[1] + db[1]) * rc];
      const pts = [];
      const legN = Math.max(1, Math.round((1 - rc / (s / 2)) * 4));
      for (let t = 1; t <= legN; t++) pts.push([pa[0] + (st[0] - pa[0]) * (t / legN), pa[1] + (st[1] - pa[1]) * (t / legN)]);
      let a0 = Math.atan2(st[1] - Q[1], st[0] - Q[0]), a1 = Math.atan2(en[1] - Q[1], en[0] - Q[0]);
      let d = a1 - a0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const n = Math.max(2, Math.round(10 * (rc / (s / 2))));
      for (let t = 1; t <= n; t++) { const a = a0 + (d * t) / n; pts.push([Q[0] + rc * Math.cos(a), Q[1] + rc * Math.sin(a)]); }
      for (let t = 1; t <= legN; t++) pts.push([en[0] + (pb[0] - en[0]) * (t / legN), en[1] + (pb[1] - en[1]) * (t / legN)]);
      return { pts, to };
    };
    const walk = (start, closedHint) => {
      const pts = [nodePos(start)];
      let node = start, len = 0;
      for (;;) {
        const k = (adj.get(node) || []).find((q) => !used[q]);
        if (k === undefined) break;
        used[k] = 1;
        const { pts: ap, to } = arcPts(k, node);
        pts.push(...ap);
        len += (Math.PI / 4) * s;
        node = to;
      }
      const closed = closedHint && node === start;
      if (closed) pts.pop();
      return { pts, closed, length: len };
    };
    for (const [n, list] of adj) if (list.length === 1 && !used[list[0]]) comps.push(walk(n, false));
    for (let k = 0; k < arcs.length; k++) if (!used[k]) comps.push(walk(arcs[k].a, true));
    return { comps, s, x0, y0, C, R, centred, grad };
  }

  // Normal offset of a (closed or open) polyline.
  function offset(pts, d, closed) {
    const n = pts.length;
    return pts.map((q, i) => {
      const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [q[0] - (dy / l) * d, q[1] + (dx / l) * d];
    });
  }

  SP.generators.truchet = {
    id: 'truchet',
    name: 'Truchet',
    board: true,
    tileable: true,
    schema: [
      { group: 'Tiles' },
      { key: 'cols', label: 'Columns', min: 1, max: 60, step: 1, def: 6, int: true, rand: [4, 12] },
      { key: 'rows', label: 'Rows', min: 1, max: 60, step: 1, def: 8, int: true, rand: [4, 12] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 10 },
      { key: 'pattern', label: 'Tile pattern', type: 'select', def: 'colphase', options: [['colphase', 'Vertical waves, mixed phase'], ['columns', 'Vertical waves'], ['rowphase', 'Horizontal waves, mixed phase'], ['rows', 'Horizontal waves'], ['checker', 'Circles (checker)'], ['diagonal', 'Diagonal'], ['random', 'Random']] },
      { key: 'flip', label: 'Flip probability', min: 0, max: 1, step: 0.01, def: 0.12, rand: [0.05, 0.3], show: (o) => o.pattern !== 'random' },
      { key: 'bias', label: 'Orientation bias', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0.3, 0.7], show: (o) => o.pattern === 'random' },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 49, int: true, rand: [1, 9999] },
      { group: 'Paths' },
      { key: 'select', label: 'Show', type: 'select', def: 'longest', options: [['all', 'All paths & loops'], ['longest', 'Longest path only'], ['top', 'Longest N'], ['loops', 'Closed loops only'], ['open', 'Open paths only']] },
      { key: 'topN', label: 'N', min: 1, max: 40, step: 1, def: 3, int: true, show: (o) => o.select === 'top' },
      { key: 'minLen', label: 'Min length (cells)', min: 0, max: 40, step: 0.5, def: 0 },
      { group: 'Stroke' },
      { key: 'width', label: 'Width (× cell)', min: 0.02, max: 0.95, step: 0.005, def: 0.38, rand: [0.12, 0.34] },
      { key: 'tracks', label: 'Parallel tracks', min: 1, max: 8, step: 1, def: 1, int: true, rand: [1, 3] },
      { key: 'trackGap', label: 'Track spacing (× cell)', min: 0.02, max: 0.5, step: 0.005, def: 0.14 },
      { key: 'cut', label: 'Cut flat at grid edge', type: 'bool', def: true },
      { key: 'widthGrad', label: 'Width gradient (× cell)', min: -1.5, max: 1.5, step: 0.01, def: 0 },
      { key: 'widthAngle', label: 'Width gradient angle °', min: -180, max: 180, step: 1, def: -90 },
      { group: 'Grid morph' },
      { key: 'morph', label: 'Arcs → grid', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'morphGrad', label: 'Morph gradient', min: -3, max: 3, step: 0.01, def: 0 },
      { key: 'morphAngle', label: 'Morph gradient angle °', min: -180, max: 180, step: 1, def: 0 },
      { key: 'morphSharp', label: 'Morph sharpness', min: 0.2, max: 20, step: 0.1, def: 1 },
      { key: 'dropout', label: 'Dropout', min: 0, max: 0.9, step: 0.01, def: 0 },
      { key: 'vdot', label: 'Vertex dots (× cell)', min: 0, max: 0.5, step: 0.005, def: 0 },
      { key: 'vdotWhere', label: 'Dots at', type: 'select', def: 'free', options: [['free', 'Open vertices'], ['all', 'Every vertex']], show: (o) => o.vdot > 0 },
      { group: 'Field points' },
      { key: 'fieldMorph', label: 'Points → grid morph', min: -2, max: 2, step: 0.01, def: 0 },
      { key: 'fieldDrop', label: 'Points → dropout', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'fieldBias', label: 'Points → orientation', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'fieldWidth', label: 'Points → width', min: -1, max: 1, step: 0.01, def: 0.4 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const TL = ctx.tile;
      const { comps, s, x0, y0, C, R, centred, grad } = trace(p, B, fieldAt, TL);
      // Seamless + vertical wrap: stretch y so a whole number of rows spans the tile height.
      const ky = TL && TL.y ? B.h / (R * s) : 1;
      const sy = (q) => (ky === 1 ? q : [q[0], y0 + (q[1] - y0) * ky]);
      let chosen = comps.filter((c) => c.length >= p.minLen * s * (Math.PI / 4) * 2);
      chosen.sort((a, b) => b.length - a.length);
      if (p.select === 'longest') { const open = chosen.find((c) => !c.closed); chosen = open ? [open] : chosen.slice(0, 1); }
      else if (p.select === 'top') chosen = chosen.slice(0, Math.round(p.topN));
      else if (p.select === 'loops') chosen = chosen.filter((c) => c.closed);
      else if (p.select === 'open') chosen = chosen.filter((c) => !c.closed);
      const out = { strokes: [], blobs: [], count: chosen.length };
      const T = Math.max(1, Math.round(p.tracks));
      const w = (p.width * s) / (T > 1 ? T : 1);
      const wAt = (q) => {
        let ww = w + (p.widthGrad ? (p.widthGrad * s * grad(q[0], q[1], p.widthAngle)) / (T > 1 ? T : 1) : 0);
        if (points.length && p.fieldWidth) ww *= Math.max(0.1, 1 + p.fieldWidth * fieldAt(q[0], q[1]));
        return Math.max(0.01 * s, ww / 2);
      };
      for (const c of chosen) {
        for (let t = 0; t < T; t++) {
          const d = (t - (T - 1) / 2) * p.trackGap * s;
          let pts = d ? offset(c.pts, d, c.closed) : c.pts;
          if (c.closed) pts = pts.concat([pts[0]]);
          else if (p.cut) {
            // Extend the ends outward so the flat edge cut lands cleanly on the grid boundary.
            const ext = (a, b) => { const dx = a[0] - b[0], dy = a[1] - b[1], l = Math.hypot(dx, dy) || 1; return [a[0] + (dx / l) * s * 0.5, a[1] + (dy / l) * s * 0.5]; };
            pts = [ext(pts[0], pts[1]), ...pts, ext(pts[pts.length - 1], pts[pts.length - 2])];
          }
          pts = pts.map(sy);
          out.strokes.push({ pts, r: pts.map(wAt) });
        }
      }
      if (p.vdot > 0)
        for (let j = 0; j <= R; j++)
          for (let i = 0; i <= C; i++) {
            if (p.vdotWhere === 'free' && centred.get(i + ',' + j)) continue;
            const q = sy([x0 + i * s, y0 + j * s]);
            out.blobs.push({ x: q[0], y: q[1], r: p.vdot * s });
          }
      if (p.cut && !TL) out.clip = { x0, y0, x1: x0 + C * s, y1: y0 + R * s, k: 0.2 };
      return out;
    },

    // Helpers exposed for the preset seed search.
    trace,
  };
})();
