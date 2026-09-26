// Carved: a base shape split into N pieces by thin gaps, with a concave curved-polygon hole
// where the gaps meet. Pieces can be "exploded" outward.
//   arc mode:  piece i = inside circle i and outside circles j<i (priority order) -> swept arcs
//   line mode: piece i = angular sector i, trimmed by circle i -> straight gaps, curved hole
// Circle i is centred along the piece bisector at distance D·R with radius Rc·R.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;

  function smax(a, b, k) {
    if (k <= 0) return Math.max(a, b);
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  }

  // Regular polygon (vertex at angle a0, visual CCW, y up) with rounded corners; n=0 -> circle.
  function polySDF(n, R, a0, round) {
    if (n < 3) return (x, y) => Math.hypot(x, y) - R;
    const apo = R * Math.cos(Math.PI / n) - round;
    const normals = [];
    for (let i = 0; i < n; i++) { const a = a0 + (i + 0.5) * (2 * Math.PI / n); normals.push([Math.cos(a), -Math.sin(a)]); }
    const sector = (2 * Math.PI) / n;
    return (x, y) => {
      // Exact rounded polygon via folding into one edge's sector.
      let ang = Math.atan2(-y, x) - a0;
      ang = ((ang % sector) + sector) % sector;
      const r = Math.hypot(x, y);
      const lx = r * Math.cos(ang - sector / 2), ly = r * Math.sin(ang - sector / 2);
      const half = apo * Math.tan(Math.PI / n);
      const dx = lx - apo, dy = Math.abs(ly) - half;
      const out = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
      return out - round;
    };
  }

  SP.polySDF = polySDF;

  SP.generators.carved = {
    id: 'carved',
    name: 'Carved',
    board: true,
    schema: [
      { group: 'Base shape' },
      { key: 'sides', label: 'Sides (0 = circle)', min: 0, max: 12, step: 1, def: 0, int: true },
      { key: 'size', label: 'Size (mm)', min: 10, max: 200, step: 0.5, def: 70 },
      { key: 'shapeRot', label: 'Shape rotation °', min: -180, max: 180, step: 1, def: 90 },
      { key: 'corner', label: 'Corner radius', min: 0, max: 30, step: 0.1, def: 0.5 },
      { group: 'Cuts' },
      { key: 'mode', label: 'Cut style', type: 'select', def: 'arc', options: [['arc', 'Swept arcs'], ['line', 'Straight + curved hole']] },
      { key: 'pieces', label: 'Pieces', min: 2, max: 8, step: 1, def: 3, int: true },
      { key: 'rot', label: 'Cut rotation °', min: -180, max: 180, step: 1, def: 90, rand: [-180, 180] },
      { key: 'dist', label: 'Circle distance', min: 0, max: 5, step: 0.01, def: 2.9, rand: [1.2, 3.5] },
      { key: 'rad', label: 'Circle radius', min: 0.1, max: 5, step: 0.01, def: 2.5, rand: [0.9, 3] },
      { key: 'gap', label: 'Gap (mm)', min: 0, max: 20, step: 0.05, def: 1.2, rand: [0.8, 4] },
      { key: 'offX', label: 'Cut centre X', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'offY', label: 'Cut centre Y', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'explode', label: 'Explode (mm)', min: 0, max: 30, step: 0.1, def: 0, rand: [0, 4] },
      { key: 'twist', label: 'Piece twist °', min: -45, max: 45, step: 0.5, def: 0 },
      { key: 'soft', label: 'Corner softness', min: 0, max: 10, step: 0.01, def: 0.4 },
    ],

    // Keep circle distance and radius coupled so the cut circles always reach the shape.
    randomize() {
      const r = (a, b) => a + Math.random() * (b - a);
      const dist = r(1.2, 3.5);
      return {
        pieces: [2, 3, 3, 3, 4, 5][Math.floor(Math.random() * 6)],
        rot: r(-180, 180), dist, rad: dist - r(0.12, 0.45),
        gap: r(0.8, 3.5), explode: Math.random() < 0.35 ? r(0.5, 4) : 0,
        twist: Math.random() < 0.2 ? r(-6, 6) : 0, offX: Math.random() < 0.3 ? r(-0.3, 0.3) : 0,
      };
    },

    generateBoard(p, ctx) {
      const B = ctx.board, cx = B.w / 2, cy = B.h / 2;
      const R = p.size, n = Math.max(2, Math.round(p.pieces));
      const base = polySDF(Math.round(p.sides), R, p.shapeRot * D2R, p.corner);
      const g = p.gap / 2, kr = p.soft;
      const pcs = [];
      for (let i = 0; i < n; i++) {
        const b = (p.rot + (i * 360) / n) * D2R; // piece bisector (visual, y up)
        const ux = Math.cos(b), uy = -Math.sin(b);
        const a1 = b - Math.PI / n, a2 = b + Math.PI / n; // sector edges (line mode)
        pcs.push({
          ux, uy, cxc: ux * p.dist * R + p.offX * R, cyc: uy * p.dist * R - p.offY * R,
          // outward normals of the two sector edges
          n1: [Math.cos(a1 - Math.PI / 2), -Math.sin(a1 - Math.PI / 2)], n2: [Math.cos(a2 + Math.PI / 2), -Math.sin(a2 + Math.PI / 2)],
          ex: ux * p.explode, ey: uy * p.explode, tw: (p.twist * D2R) * (i % 2 ? -1 : 1),
        });
      }
      const Rc = p.rad * R;
      const circ = (q, x, y) => Math.hypot(x - q.cxc, y - q.cyc) - Rc;
      // Line mode: the hole is the region outside every circle, bounded by the triangle of its corners
      // (corner k lies on the gap ray between pieces k and k+1, where their circles meet).
      const corners = [];
      if (p.mode === 'line') {
        for (let i = 0; i < n; i++) {
          const a = (p.rot + ((i + 0.5) * 360) / n) * D2R, ux = Math.cos(a), uy = -Math.sin(a);
          const ox = p.offX * R, oy = -p.offY * R;
          const f = (c) => circ(pcs[i], ox + ux * c, oy + uy * c);
          // Bracket between the cut centre (outside the circle) and the ray's closest approach to its centre.
          let lo = 0, hi = Math.max(0, ux * (pcs[i].cxc - ox) + uy * (pcs[i].cyc - oy));
          if (f(0) < 0 || f(hi) > 0) { corners.push([ox, oy]); continue; }
          for (let it = 0; it < 50; it++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
          corners.push([ox + ux * lo, oy + uy * lo]);
        }
      }
      const edges = corners.map((c, i) => {
        const d = corners[(i + 1) % n], ex = d[0] - c[0], ey = d[1] - c[1], l = Math.hypot(ex, ey) || 1;
        let nx = ey / l, ny = -ex / l;
        if (nx * (p.offX * R - c[0]) + ny * (-p.offY * R - c[1]) > 0) { nx = -nx; ny = -ny; } // outward from the cut centre
        return [c[0], c[1], nx, ny];
      });
      const hole = (x, y) => {
        let out = -Infinity;
        for (const q of pcs) out = Math.max(out, -circ(q, x, y)); // <0 when outside all circles
        let tri = -Infinity;
        for (const [ax, ay, nx, ny] of edges) tri = Math.max(tri, (x - ax) * nx + (y - ay) * ny);
        return Math.max(out, tri);
      };
      const region = (i, x, y) => {
        const q = pcs[i];
        let r;
        if (p.mode === 'line') {
          const w = n > 2 ? Math.max(x * q.n1[0] + y * q.n1[1], x * q.n2[0] + y * q.n2[1]) : x * q.n1[0] + y * q.n1[1];
          r = Math.max(w + g, -hole(x, y) + g);
        } else {
          r = circ(q, x, y) + g;
          for (let j = 0; j < i; j++) r = Math.max(r, -circ(pcs[j], x, y) + g);
        }
        return smax(r, base(x, y), kr);
      };
      const evalFn = (X, Y) => {
        const x0 = X - cx, y0 = Y - cy;
        let f = Infinity;
        for (let i = 0; i < n; i++) {
          const q = pcs[i];
          let x = x0 - q.ex, y = y0 - q.ey;
          if (q.tw) { const c = Math.cos(q.tw), s = Math.sin(q.tw); [x, y] = [c * x - s * y, s * x + c * y]; }
          const v = region(i, x, y);
          if (v < f) f = v;
        }
        return f;
      };
      const e = R + p.explode + 4;
      return { evalFn, domain: { x0: cx - e, y0: cy - e, x1: cx + e, y1: cy + e }, count: n };
    },
  };
})();
