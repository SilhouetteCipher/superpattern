// Hex Plating: sci-fi armour. A hexagonal grid of plates separated by an even gap; each plate is solid,
// an inset frame (rim · gap · inner plate), split into three rhombi or six triangles, pierced by a round
// hole, or missing. Missing plates follow a base rate, a linear gradient and the field points, so damage
// can sweep across the board or cluster around a point. The board edge either keeps only whole plates or
// clips the plating to a straight edge. Exact signed distance (1-Lipschitz).
(function () {
  const SP = (window.SP = window.SP || {});
  const SQ3 = Math.sqrt(3);

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Signed distance to a pointy-top hexagon (vertex up) with inradius h, centred at the origin.
  function hexDist(x, y, h) {
    let px = Math.abs(x), py = Math.abs(y);
    const kx = -0.8660254, ky = 0.5, kz = 0.57735027;
    const d = Math.min(kx * px + ky * py, 0);
    px -= 2 * d * kx; py -= 2 * d * ky;
    px -= Math.min(Math.max(px, -kz * h), kz * h); py -= h;
    return Math.hypot(px, py) * Math.sign(py);
  }
  const segDist = (x, y, ax, ay, bx, by) => {
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-12;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / l2));
    return Math.hypot(x - ax - ex * t, y - ay - ey * t);
  };
  const NB = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

  SP.generators.hexplate = {
    id: 'hexplate',
    name: 'Hex Plating',
    board: true,
    schema: [
      { group: 'Grid' },
      { key: 'cell', label: 'Plate size (mm)', min: 4, max: 80, step: 0.5, def: 16, rand: [10, 26] },
      { key: 'gap', label: 'Gap (mm)', min: 0.4, max: 10, step: 0.05, def: 1.8, rand: [1, 3] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 6, step: 0.05, def: 0.8, rand: [0.2, 1.5] },
      { key: 'orient', label: 'Orientation', type: 'select', def: 'pointy', options: [['pointy', 'Pointy top'], ['flat', 'Flat top']] },
      { key: 'edge', label: 'Board edge', type: 'select', def: 'clip', options: [['clip', 'Clip to straight edge'], ['whole', 'Whole plates only']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 3, int: true, rand: [1, 9999] },
      { group: 'Missing plates' },
      { key: 'missing', label: 'Missing rate', min: 0, max: 0.9, step: 0.01, def: 0.1, rand: [0, 0.25] },
      { key: 'missGrad', label: 'Missing gradient', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.5, 0.5] },
      { key: 'missAngle', label: 'Gradient angle °', min: -180, max: 180, step: 1, def: 0, rand: [-180, 180] },
      { group: 'Plate details' },
      { key: 'insetChance', label: 'Inset frame chance', min: 0, max: 1, step: 0.01, def: 0.3, rand: [0.1, 0.5] },
      { key: 'rim', label: 'Frame rim (mm)', min: 0.6, max: 12, step: 0.1, def: 2.4, rand: [1.5, 4] },
      { key: 'insetGap', label: 'Frame gap (mm)', min: 0.4, max: 6, step: 0.05, def: 1.2, rand: [0.8, 2] },
      { key: 'splitChance', label: 'Split chance', min: 0, max: 1, step: 0.01, def: 0.2, rand: [0.05, 0.4] },
      { key: 'splitN', label: 'Split into', type: 'select', def: '3', options: [['3', 'Three rhombi'], ['6', 'Six triangles'], ['mix', 'Mixed']] },
      { key: 'holeChance', label: 'Hole chance', min: 0, max: 1, step: 0.01, def: 0.15, rand: [0, 0.35] },
      { key: 'holeR', label: 'Hole size', min: 0.1, max: 0.7, step: 0.01, def: 0.3, rand: [0.2, 0.45] },
      { group: 'Field' },
      { key: 'fieldMiss', label: 'Points → missing', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 17);
      const pointy = p.orient !== 'flat';
      const h = p.cell / 2, a = h / (SQ3 / 2); // inradius, circumradius
      const mg = p.margin, X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg;
      // World → hex frame: the flat-top grid is the pointy one rotated by 90°.
      const toF = pointy ? (x, y) => [x, y] : (x, y) => [y, -x];
      const fromF = pointy ? (x, y) => [x, y] : (x, y) => [-y, x];
      const centre = (q, r) => fromF(a * (SQ3 * q + (SQ3 / 2) * r), a * 1.5 * r);
      const axial = (x, y) => { const [fx, fy] = toF(x, y); return [((SQ3 / 3) * fx - fy / 3) / a, ((2 / 3) * fy) / a]; };
      const roundAx = (q, r) => {
        let s = -q - r, rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
        const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
        if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
        return [rq, rr];
      };
      // Half extents of one plate in world axes (for the whole-plate test).
      const hw = pointy ? h : a, hh = pointy ? a : h;
      // Enumerate cells covering the board (axial ranges from the corners, padded).
      let qmin = Infinity, qmax = -Infinity, rmin = Infinity, rmax = -Infinity;
      for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) { const [q, r] = axial(x, y); qmin = Math.min(qmin, q); qmax = Math.max(qmax, q); rmin = Math.min(rmin, r); rmax = Math.max(rmax, r); }
      const cells = new Map(), key = (q, r) => q * 100003 + r;
      const W = X1 - X0, H = Y1 - Y0;
      for (let r = Math.floor(rmin) - 2; r <= Math.ceil(rmax) + 2; r++)
        for (let q = Math.floor(qmin) - 2; q <= Math.ceil(qmax) + 2; q++) {
          const [cx, cy] = centre(q, r);
          const inside = p.edge === 'whole'
            ? cx - hw >= X0 - 1e-6 && cx + hw <= X1 + 1e-6 && cy - hh >= Y0 - 1e-6 && cy + hh <= Y1 + 1e-6
            : cx + a > X0 && cx - a < X1 && cy + a > Y0 && cy - a < Y1;
          if (!inside) continue;
          const G = SP.gradCoord(cx, cy, p.missAngle, B.w / 2, B.h / 2, W, H, null);
          let miss = p.missing + p.missGrad * (G + 0.5);
          if (points.length && p.fieldMiss) miss += p.fieldMiss * fieldAt(cx, cy);
          const u = rand(), v = rand(), w3 = rand();
          if (u < miss) continue;
          let kind = 'solid';
          if (v < p.insetChance && h > p.rim + p.insetGap + 1.5) kind = 'inset';
          else if (v < p.insetChance + p.splitChance) kind = p.splitN === 'mix' ? (w3 < 0.5 ? 'split3' : 'split6') : 'split' + p.splitN;
          else if (v < p.insetChance + p.splitChance + p.holeChance) kind = 'hole';
          cells.set(key(q, r), { cx, cy, kind });
        }

      const h2 = h - p.gap / 2, rr = Math.min(p.round, h2 * 0.5);
      const hole = p.holeR * h2;
      const rectSDF = (x, y) => { const dx = Math.max(X0 - x, x - X1), dy = Math.max(Y0 - y, y - Y1); return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)); };
      const cellSDF = (c, x, y) => {
        const [lx, ly] = toF(x - c.cx, y - c.cy);
        let f = hexDist(lx, ly, h2 - rr) - rr;
        if (c.kind === 'inset') f = Math.min(Math.max(f, -(f + p.rim)), f + p.rim + p.insetGap);
        else if (c.kind === 'hole') f = Math.max(f, hole - Math.hypot(lx, ly));
        else if (c.kind === 'split3' || c.kind === 'split6') {
          // Cut strips of the gap width from the centre out to the vertices (vertex up = 90°).
          const step = c.kind === 'split3' ? 120 : 60;
          for (let ang = 90; ang < 450; ang += step) {
            const t = (ang * Math.PI) / 180;
            f = Math.max(f, p.gap / 2 - segDist(lx, ly, 0, 0, Math.cos(t) * a, Math.sin(t) * a));
          }
        }
        return f;
      };
      const evalFn = (x, y) => {
        const [q0, r0] = roundAx(...axial(x, y));
        let f = h; // nothing in reach → at least one apothem from any plate
        const c0 = cells.get(key(q0, r0));
        if (c0) f = Math.min(f, cellSDF(c0, x, y));
        for (const [dq, dr] of NB) { const c = cells.get(key(q0 + dq, r0 + dr)); if (c) f = Math.min(f, cellSDF(c, x, y)); }
        return p.edge === 'clip' ? Math.max(f, rectSDF(x, y)) : f;
      };
      return { evalFn, domain: { x0: X0 - 2, y0: Y0 - 2, x1: X1 + 2, y1: Y1 + 2 }, count: cells.size };
    },
  };
})();
