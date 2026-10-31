// Jigsaw: the die-cutter's rule for a jigsaw puzzle. A frame is divided into cells, and every interior
// edge between two cells is replaced by a tab — three cubic Béziers (shoulder, bulb, shoulder) in the edge's
// own frame, the construction behind the classic browser puzzle generators: the tab's neck sits at ±t of the
// edge centre, its bulb reaches 3t across, and five small jitters (shoulder lifts a/e, shift b, lift c, skew d)
// make every piece different. Each tab flips to one side or the other, so every piece ends up with a mix of
// knobs and slots. Two layouts: a *grid* (optionally warped, so the cut lines wander), and *rings* — the
// concentric puzzle, a centre disc with rings of sector pieces whose arcs and spokes carry the same tabs.
// The pieces are the field: gap/2 minus the distance to the nearest cut line, with a soft-min across lines
// to round each piece's corners, clipped to the frame. Exported as one closed outline per piece.
(function () {
  const SP = (window.SP = window.SP || {});
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  function cubic(a, b, c, d, n, out) {
    for (let i = 1; i <= n; i++) {
      const t = i / n, v = 1 - t;
      out.push([v * v * v * a[0] + 3 * v * v * t * b[0] + 3 * v * t * t * c[0] + t * t * t * d[0], v * v * v * a[1] + 3 * v * v * t * b[1] + 3 * v * t * t * c[1] + t * t * t * d[1]]);
    }
  }

  // One cut line in edge-local coordinates: u along the edge in mm (0..L), v across in mm (+ = tab side).
  // t = tab size as a fraction of the cell size S; j = jitter fraction of S. Returns a polyline of [u, v].
  function edgeLocal(style, L, S, t, j, rand, flip) {
    const sgn = flip ? -1 : 1;
    if (style === 'straight' || L < 1e-6) { const pts = []; for (let i = 0; i <= 8; i++) pts.push([(L * i) / 8, 0]); return pts; } // sampled, so arcs stay arcs
    const pts = [[0, 0]];
    if (style === 'wave') {
      // A single S-curve: a sine of 1.5t amplitude across, with a jittered phase so no two edges match.
      const amp = 1.5 * t * S * sgn, ph = (rand() - 0.5) * j * 6;
      const n = 14;
      for (let i = 1; i <= n; i++) { const u = i / n; pts.push([u * L, amp * Math.sin(TAU * u + ph * Math.sin(Math.PI * u)) * Math.sin(Math.PI * u) ** 0.35]); }
      pts[n] = [L, 0];
      return pts;
    }
    // Classic three-Bézier tab. Everything but the shoulders is measured from the edge centre in units of S,
    // so tabs keep their real size on long or short edges.
    const J = () => (rand() * 2 - 1) * j;
    const a = J(), b = J(), c = J(), d = J(), e = J();
    const m = L / 2;
    const P = (du, v) => [m + du * S, v * S * sgn];
    const p0 = [0, 0], p9 = [L, 0];
    const p1 = [0.2 * L, a * S * sgn], p8 = [0.8 * L, e * S * sgn];
    const p2 = P(b + d, -t + c), p3 = P(-t + b, t + c);
    const p4 = P(-2 * t + b - d, 3 * t + c), p5 = P(2 * t + b - d, 3 * t + c);
    const p6 = P(t + b, t + c), p7 = P(b + d, -t + c);
    cubic(p0, p1, p2, p3, 7, pts);
    cubic(p3, p4, p5, p6, 10, pts);
    cubic(p6, p7, p8, p9, 7, pts);
    return pts;
  }

  // Frames: straight edge A→B, or an arc of radius r about (cx, cy) from angle a0 through a1 (u = arc length).
  const lineFrame = (A, B) => {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]), dx = (B[0] - A[0]) / (L || 1), dy = (B[1] - A[1]) / (L || 1);
    return { L, map: (u, v) => [A[0] + dx * u - dy * v, A[1] + dy * u + dx * v] };
  };
  const arcFrame = (cx, cy, r, a0, a1) => {
    const L = Math.abs(a1 - a0) * r, s = Math.sign(a1 - a0) || 1;
    return { L, map: (u, v) => { const th = a0 + (s * u) / r, rr = r + v; return [cx + rr * Math.cos(th), cy + rr * Math.sin(th)]; } };
  };

  let cache = { key: null };

  SP.generators.jigsaw = {
    id: 'jigsaw',
    name: 'Jigsaw',
    board: true,
    schema: [
      { group: 'Layout' },
      { key: 'style', label: 'Layout', type: 'select', def: 'grid', options: [['grid', 'Grid'], ['rings', 'Concentric rings']] },
      { key: 'cols', label: 'Columns', min: 2, max: 16, step: 1, def: 6, int: true, rand: [4, 9] },
      { key: 'rows', label: 'Rows (0 = match)', min: 0, max: 16, step: 1, def: 0, int: true },
      { key: 'rings', label: 'Rings', min: 1, max: 8, step: 1, def: 3, int: true, rand: [2, 5] },
      { key: 'warp', label: 'Warp', min: 0, max: 0.35, step: 0.01, def: 0, rand: [0, 0.22] },
      { key: 'outline', label: 'Frame', type: 'select', def: 'rect', options: [['rect', 'Rectangle'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 8 },
      { key: 'outerRound', label: 'Frame corner (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { group: 'Tabs' },
      { key: 'edge', label: 'Cut', type: 'select', def: 'tab', options: [['tab', 'Tab and slot'], ['wave', 'Wave'], ['straight', 'Straight']] },
      { key: 'tab', label: 'Tab size %', min: 6, max: 30, step: 0.5, def: 20, rand: [14, 26] },
      { key: 'jitter', label: 'Jitter %', min: 0, max: 10, step: 0.1, def: 4, rand: [1, 7] },
      { key: 'pattern', label: 'Tab sides', type: 'select', def: 'random', options: [['random', 'Random'], ['alternate', 'Alternate'], ['same', 'All one way']] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'gap', label: 'Gap (mm)', min: 0.5, max: 8, step: 0.05, def: 2, rand: [1.2, 3.2] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 6, step: 0.1, def: 1.5, rand: [0.5, 3] },
    ],

    generateBoard(p, ctx) {
      const B = ctx.board;
      const m = Math.min(p.margin, Math.min(B.w, B.h) / 2 - 5);
      const x0 = m, y0 = m, W = B.w - 2 * m, H = B.h - 2 * m, cx = B.w / 2, cy = B.h / 2;
      const circleR = Math.min(W, H) / 2;
      const outline = p.outline === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - circleR
        : (x, y) => { const r = Math.min(p.outerRound, W / 2, H / 2), qx = Math.abs(x - cx) - W / 2 + r, qy = Math.abs(y - cy) - H / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };

      const key = JSON.stringify([p.style, p.cols, p.rows, p.rings, p.warp, p.outline, p.margin, p.edge, p.tab, p.jitter, p.pattern, p.seed, p.gap, p.round, B.w, B.h]);
      if (cache.key !== key) {
        const rand = rng(p.seed * 2654435761);
        const j = p.jitter / 100;
        const edges = []; // [{ pts: [[x,y],...] }]
        let count = 0, S = 1;
        // Tab size: the neck (2tS) must survive the gap and the corner rounding, and the bulb (3tS) must
        // leave the neighbouring piece some body — so t is clamped to the cell size before anything is drawn.
        const tabFor = (cell, maxT = 0.15) => clamp(p.tab / 200, Math.min(maxT, (p.gap + p.round + 1.2) / (2 * cell)), maxT);
        const flipFor = (i, k) => (p.pattern === 'random' ? rand() < 0.5 : p.pattern === 'alternate' ? (i + k) % 2 === 1 : false);
        const addEdge = (frame, cell, flip, style = p.edge, maxT = 0.15) => {
          if (frame.L < 0.5) return;
          const t = tabFor(cell, maxT);
          const loc = edgeLocal(style, frame.L, Math.min(cell, frame.L), t, j, rand, flip);
          edges.push({ pts: loc.map((q) => frame.map(q[0], q[1])) });
        };

        if (p.style === 'rings') {
          // Centre disc + rings of sector pieces. Radii grow from a centre piece ~1.2 rings across; each ring
          // gets as many sectors as fit at roughly square proportions, turned by a random phase. Every arc is
          // split at the spoke angles of both rings it separates, and only the gaps long enough get a tab, so
          // no bulb ever runs into a spoke; spoke tabs are kept a little smaller for the same reason.
          const R = circleR, n = Math.max(1, Math.round(p.rings)), c0 = 1.2;
          const radii = []; for (let k = 0; k <= n; k++) radii.push((R * (k + c0)) / (n + c0));
          const T = radii[1] - radii[0];
          S = T;
          count = 1;
          const spokes = [];
          for (let k = 0; k < n; k++) {
            const rm = (radii[k] + radii[k + 1]) / 2, nk = Math.max(3, Math.round((TAU * rm) / T)), ph = rand() * TAU;
            const ang = []; for (let i = 0; i < nk; i++) ang.push((ph + (TAU * i) / nk) % TAU);
            spokes.push(ang.sort((a, b) => a - b));
            count += nk;
          }
          const t = tabFor(T, 0.12);
          for (let k = 0; k < n; k++) {
            const r = radii[k];
            const cuts = k ? spokes[k - 1].concat(spokes[k]).sort((a, b) => a - b) : spokes[k];
            cuts.forEach((a, i) => {
              const b = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + TAU;
              const tab = (b - a) * r >= 5.5 * t * T;
              addEdge(arcFrame(cx, cy, r, a, b), T, flipFor(i, k), tab ? p.edge : 'straight', 0.12);
            });
            spokes[k].forEach((a, i) => {
              const A = [cx + radii[k] * Math.cos(a), cy + radii[k] * Math.sin(a)], Bq = [cx + radii[k + 1] * Math.cos(a), cy + radii[k + 1] * Math.sin(a)];
              addEdge(lineFrame(A, Bq), T, flipFor(i, k + 1), p.edge, 0.1);
            });
          }
        } else {
          const cols = Math.max(2, Math.round(p.cols));
          const rows = p.rows > 0 ? Math.round(p.rows) : Math.max(2, Math.round((cols * H) / W));
          const cw = W / cols, ch = H / rows;
          S = Math.min(cw, ch);
          count = cols * rows;
          // Vertex lattice; interior vertices wander by up to warp × cell, so the cut lines meander.
          const V = [];
          for (let jv = 0; jv <= rows; jv++) {
            const row = [];
            for (let i = 0; i <= cols; i++) {
              const inner = i > 0 && i < cols && jv > 0 && jv < rows;
              const dx = inner ? (rand() - 0.5) * 2 * p.warp * S : 0, dy = inner ? (rand() - 0.5) * 2 * p.warp * S : 0;
              row.push([x0 + i * cw + dx, y0 + jv * ch + dy]);
            }
            V.push(row);
          }
          // Interior horizontal edges, then vertical ones (row/column order, as a die would be cut).
          for (let jv = 1; jv < rows; jv++) for (let i = 0; i < cols; i++) addEdge(lineFrame(V[jv][i], V[jv][i + 1]), S, flipFor(i, jv));
          for (let i = 1; i < cols; i++) for (let jv = 0; jv < rows; jv++) addEdge(lineFrame(V[jv][i], V[jv + 1][i]), S, flipFor(jv, i));
        }

        // Segments binned by a cell of `reach` mm; each segment is registered in every bin its box touches.
        const reach = p.gap / 2 + p.round + 1.5;
        const bs = reach, bins = new Map();
        const segs = [];
        edges.forEach((e, id) => {
          for (let i = 0; i + 1 < e.pts.length; i++) {
            const a = e.pts[i], b = e.pts[i + 1];
            const si = segs.length;
            segs.push([a[0], a[1], b[0], b[1], id]);
            const bi0 = Math.floor(Math.min(a[0], b[0]) / bs), bi1 = Math.floor(Math.max(a[0], b[0]) / bs);
            const bj0 = Math.floor(Math.min(a[1], b[1]) / bs), bj1 = Math.floor(Math.max(a[1], b[1]) / bs);
            for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) { const k = bi + ',' + bj; (bins.get(k) || bins.set(k, []).get(k)).push(si); }
          }
        });
        cache = { key, segs, bins, bs, reach, count, S };
      }
      const { segs, bins, bs, reach, count } = cache;
      const g = p.gap / 2, kr = p.round;

      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        // Nearest two distinct cut lines within reach.
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
        if (d1 > reach) return Math.max(g - reach, o);
        const d = d2 < Infinity ? smin(d1, d2, kr) : d1;
        return smax(g - d, o, Math.min(kr, g) * 0.5 + 0.2);
      };
      const pad = 3;
      return { evalFn, domain: { x0: x0 - pad, y0: y0 - pad, x1: x0 + W + pad, y1: y0 + H + pad }, count };
    },
  };
})();
