// Kirigami: the rotating-unit cut patterns of auxetic kirigami and laser-cut "flexure" sheets. A sheet is slit so
// that it falls apart into rigid units — squares on a square lattice, or triangles on a honeycomb of centres —
// still joined corner to corner by small hinges. Pulling the sheet turns every unit, neighbours in opposite
// senses, and the slits open into diamond (or star-hexagon) holes. One angle describes the whole mechanism: β, the
// angle between a unit's hinge corner and the line to the neighbour it is hinged to. β = 180°/n is the closed
// sheet (units edge to edge, the slits are just the cut), β = 0 is fully open (units touch only at their tips).
// For hinge corners to meet half-way between centres at pitch P, a unit's circumradius must be P / (2 cos β);
// unit k on sublattice σ = ±1 puts its hinge corner for the neighbour in direction φ at angle φ − σβ, so every
// corner is used once and the chequerboard of turns falls out of the sign. Here the opening u = 1 − β·n/180° is
// graded across the board (linear, radial, rings or smooth noise, plus field points), the way programmable
// kirigami grades its cuts: each unit takes its own β at a fixed lattice pitch, so units shrink and turn as the
// holes open. Each unit is the regular polygon shrunk by half the cut width and rounded; each hinge is a capsule
// joining the two rounded corners, so the sheet stays one connected piece. Units are clipped to a rectangle or
// circle frame, optionally with a solid rim.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_R = 0.3; // narrowest half-width anywhere (mm): 0.6 mm features
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (t) => t * t * (3 - 2 * t);

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  // Exact signed distance to a convex or simple polygon (flat array x0,y0,x1,y1,...).
  function sdPoly(x, y, v) {
    const n = v.length / 2;
    let d = (x - v[0]) ** 2 + (y - v[1]) ** 2, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const ax = v[2 * i], ay = v[2 * i + 1], bx = v[2 * j], by = v[2 * j + 1];
      const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1);
      const qx = wx - ex * t, qy = wy - ey * t;
      d = Math.min(d, qx * qx + qy * qy);
      const c1 = y >= ay, c2 = y < by, c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  }
  function sdSeg(x, y, ax, ay, bx, by) {
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey;
    const t = l2 > 0 ? clamp(((x - ax) * ex + (y - ay) * ey) / l2, 0, 1) : 0;
    return Math.hypot(x - ax - ex * t, y - ay - ey * t);
  }

  // Lattices of unit centres in lattice units (pitch 1): sublattices with their sign σ and neighbour directions.
  // Square: one site per cell, σ = (−1)^(i+j), four neighbours. Triangle: a honeycomb of centres — sublattice A
  // (σ = +1) has neighbours at 90°, 210°, 330°, sublattice B (σ = −1) the opposite three.
  const S3 = Math.sqrt(3);
  const LATTICES = {
    square: { n: 4, a1: [1, 0], a2: [0, 1], subs: [{ o: [0, 0], dirs: [0, 90, 180, 270] }] },
    triangle: { n: 3, a1: [S3, 0], a2: [S3 / 2, 1.5], subs: [{ o: [0, 0], dirs: [90, 210, 330], sg: 1 }, { o: [0, 1], dirs: [270, 30, 150], sg: -1 }] },
  };

  let cache = { key: null };

  SP.generators.kirigami = {
    id: 'kirigami',
    name: 'Kirigami',
    board: true,
    schema: [
      { group: 'Lattice' },
      { key: 'lattice', label: 'Units', type: 'select', def: 'square', options: [['square', 'Rotating squares'], ['triangle', 'Rotating triangles']] },
      { key: 'pitch', label: 'Pitch (mm)', min: 6, max: 50, step: 0.5, def: 15, rand: [11, 22] },
      { key: 'angle', label: 'Angle °', min: -90, max: 90, step: 0.5, def: 0, rand: [-30, 30] },
      { group: 'Opening' },
      { key: 'open', label: 'Opening at start', min: 0, max: 1, step: 0.01, def: 0.08, rand: [0.04, 0.45] },
      { key: 'openEnd', label: 'Opening at end', min: 0, max: 1, step: 0.01, def: 0.85, rand: [0.45, 1] },
      { key: 'grade', label: 'Grade', type: 'select', def: 'radial', options: [['uniform', 'Uniform'], ['linear', 'Linear'], ['radial', 'Radial'], ['rings', 'Rings'], ['noise', 'Smooth noise']] },
      { key: 'gradeAngle', label: 'Grade angle °', min: -180, max: 180, step: 1, def: 30, rand: [-180, 180] },
      { key: 'waves', label: 'Rings / noise scale', min: 0.5, max: 5, step: 0.1, def: 1.5, rand: [0.8, 2.5] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 11, int: true, rand: [1, 9999] },
      { key: 'fieldGain', label: 'Field points → opening', min: -1, max: 1, step: 0.01, def: 0.6 },
      { group: 'Cuts' },
      { key: 'kerf', label: 'Cut width (mm)', min: 0.6, max: 5, step: 0.05, def: 1.2, rand: [0.8, 2] },
      { key: 'hinge', label: 'Hinge width (mm)', min: 0.6, max: 4, step: 0.05, def: 1.3, rand: [0.8, 2] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 5, step: 0.05, def: 1, rand: [0.4, 2.2] },
      { key: 'hole', label: 'Centre hole', min: 0, max: 0.6, step: 0.01, def: 0, rand: [0, 0.4] },
      { group: 'Frame' },
      { key: 'shape', label: 'Outline', type: 'select', def: 'square', options: [['square', 'Rounded rectangle'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'outerRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'rim', label: 'Rim (mm)', min: 0, max: 20, step: 0.1, def: 4, rand: [0, 6] },
    ],

    generateBoard(p, ctx) {
      const { board: Bd, fieldAt, points } = ctx;
      const m = clamp(p.margin, 0, Math.min(Bd.w, Bd.h) / 2 - 5);
      const W = Bd.w - 2 * m, H = Bd.h - 2 * m, cx = Bd.w / 2, cy = Bd.h / 2;
      const R = Math.min(W, H) / 2;
      const outline = p.shape === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - R
        : (x, y) => { const r = Math.min(p.outerRound, W / 2, H / 2), qx = Math.abs(x - cx) - W / 2 + r, qy = Math.abs(y - cy) - H / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
      const kerf = Math.max(0.6, p.kerf), rim = Math.max(0, p.rim);
      // Units are clipped to the outline, or to the inside edge of the rim, which they run into and join.
      const inner = rim > 0 ? (x, y) => outline(x, y) + rim : outline;
      const useField = points.length && p.fieldGain !== 0;

      const key = JSON.stringify([p.lattice, p.pitch, p.angle, p.open, p.openEnd, p.grade, p.gradeAngle, p.waves, p.seed, p.fieldGain, kerf, p.hinge, p.round, p.hole, p.shape, m, p.outerRound, rim, Bd.w, Bd.h, useField ? points : 0]);
      if (cache.key !== key) {
        const Lt = LATTICES[p.lattice] || LATTICES.square, n = Lt.n;
        const P = Math.max(4, p.pitch), bMax = 180 / n;
        const ca = Math.cos(p.angle * D2R), sa = Math.sin(p.angle * D2R);
        const rand = rng(p.seed * 2654435761);
        // Smooth noise: a few plane waves with seeded directions and phases, scaled to the board.
        const waves = [];
        for (let i = 0; i < 4; i++) waves.push([rand() * 2 * Math.PI, rand() * 2 * Math.PI, 0.7 + rand() * 0.6]);
        const half = Math.hypot(W, H) / 2;
        const ga = p.gradeAngle * D2R, gx = Math.cos(ga), gy = Math.sin(ga);
        // Extent of the frame along the grade direction, so 'linear' runs exactly from one side to the other.
        const ext = p.shape === 'circle' ? R : (W / 2) * Math.abs(gx) + (H / 2) * Math.abs(gy);
        const gradeAt = (x, y) => {
          const dx = x - cx, dy = y - cy;
          switch (p.grade) {
            case 'linear': return clamp(0.5 + (dx * gx + dy * gy) / (2 * ext), 0, 1);
            case 'radial': return clamp(Math.hypot(dx, dy) / (p.shape === 'circle' ? R : half), 0, 1);
            case 'rings': return 0.5 - 0.5 * Math.cos((2 * Math.PI * p.waves * Math.hypot(dx, dy)) / (2 * half));
            case 'noise': {
              let s = 0, k = (2 * Math.PI * p.waves) / (2 * half);
              for (const [a, ph, f] of waves) s += Math.sin(k * f * (dx * Math.cos(a) + dy * Math.sin(a)) + ph);
              return clamp(0.5 + s / 4, 0, 1);
            }
            default: return 0;
          }
        };
        const openAt = (x, y) => {
          let u = p.open + (p.openEnd - p.open) * smooth(gradeAt(x, y));
          if (useField) u += p.fieldGain * (fieldAt(x, y) || 0);
          return clamp(u, 0.04, 1);
        };

        const rc = Math.max(0, p.round), hr = Math.max(MIN_R, p.hinge / 2);
        const dIn = kerf / 2 + rc; // inward offset of the sharp polygon before rounding by rc
        const cosN = Math.cos(Math.PI / n);
        // Lattice range covering the frame's circumscribed disc.
        const [a1, a2] = [Lt.a1, Lt.a2], det = Math.abs(a1[0] * a2[1] - a1[1] * a2[0]);
        const cover = half / P + 2;
        const ni = Math.ceil((cover * Math.hypot(a2[0], a2[1])) / det) + 1, nj = Math.ceil((cover * Math.hypot(a1[0], a1[1])) / det) + 1;
        const units = new Map(), list = [];
        for (let j = -nj; j <= nj; j++)
          for (let i = -ni; i <= ni; i++)
            Lt.subs.forEach((sb, si) => {
              const lx = (i * a1[0] + j * a2[0] + sb.o[0]) * P, ly = (i * a1[1] + j * a2[1] + sb.o[1]) * P;
              const x = cx + lx * ca - ly * sa, y = cy + lx * sa + ly * ca;
              const sg = sb.sg || ((i + j) & 1 ? -1 : 1);
              const u = openAt(x, y), beta = bMax * (1 - u) * D2R;
              const rho = P / (2 * Math.cos(beta)), rIn = rho - dIn / cosN;
              if (rIn * cosN < 0.5) return; // unit too small to survive the cut
              if (inner(x, y) > rho) return; // wholly outside the frame
              // Hinge corners first: corner k points at φ_k − σβ (lattice rotation added).
              const dirs = sb.dirs.map((d) => d * D2R + p.angle * D2R);
              const angs = dirs.map((d) => d - sg * beta);
              // Every corner is a hinge corner (n neighbours, n corners), so these angles are the whole polygon.
              angs.sort((a, b) => a - b);
              const v = [];
              for (const a of angs) v.push(x + rIn * Math.cos(a), y + rIn * Math.sin(a));
              // Share of the unit inside the frame (sampled on its corners and centre). Without a rim, slivers are
              // dropped; with one, any unit that reaches past the rim's inside edge stays and fuses into it.
              let inside = inner(x, y) < 0 ? 2 : 0;
              for (let k = 0; k < n; k++) if (inner(v[2 * k], v[2 * k + 1]) < 0) inside++;
              if (inside < (rim > 0 ? 1 : 2)) return;
              const apo = rIn * cosN;
              let holeR = p.hole > 0 ? p.hole * apo : 0;
              if (holeR > 0 && (holeR < 0.6 || apo - rc - holeR < 0.8)) holeR = 0;
              const corners = dirs.map((d) => { const a = d - sg * beta; return [x + rIn * Math.cos(a), y + rIn * Math.sin(a)]; });
              const unit = { x, y, v, rIn, holeR, corners, dirs: sb.dirs, i, j, si };
              units.set(i + ',' + j + ',' + si, unit);
              list.push(unit);
            });
        // Hinges: from each σ = +1 unit to each neighbour, joining the two rounded corners that face each other.
        const hinges = [];
        const nbKey = (u, d) => {
          if (Lt === LATTICES.square) {
            const di = Math.round(Math.cos(d * D2R)), dj = Math.round(Math.sin(d * D2R));
            return u.i + di + ',' + (u.j + dj) + ',0';
          }
          // Honeycomb: A(i,j) neighbours B(i,j) at 90°, B(i,j−1) at 210°, B(i+1,j−1) at 330°; B's are the inverse.
          if (u.si === 0) return d === 90 ? `${u.i},${u.j},1` : d === 210 ? `${u.i},${u.j - 1},1` : `${u.i + 1},${u.j - 1},1`;
          return d === 270 ? `${u.i},${u.j},0` : d === 30 ? `${u.i},${u.j + 1},0` : `${u.i - 1},${u.j + 1},0`;
        };
        const backDir = (d) => (d + 180) % 360;
        for (const u of list) {
          if (Lt === LATTICES.square ? (u.i + u.j) & 1 : u.si === 1) continue;
          u.dirs.forEach((d, k) => {
            const w = units.get(nbKey(u, d));
            if (!w) return;
            const kb = w.dirs.indexOf(backDir(d));
            const A = u.corners[k], B = w.corners[kb];
            hinges.push([A[0], A[1], B[0], B[1]]);
          });
        }
        // Spatial bins: each unit and hinge registered in every bin its bounding box touches.
        const bs = Math.max(6, P), bins = new Map();
        const reg = (x0, y0, x1, y1, item) => {
          for (let j = Math.floor(y0 / bs); j <= Math.floor(y1 / bs); j++)
            for (let i = Math.floor(x0 / bs); i <= Math.floor(x1 / bs); i++) { const k = i + ',' + j; (bins.get(k) || bins.set(k, []).get(k)).push(item); }
        };
        const pad = rc + hr + 2;
        for (const u of list) reg(u.x - u.rIn - pad, u.y - u.rIn - pad, u.x + u.rIn + pad, u.y + u.rIn + pad, u);
        for (const h of hinges) reg(Math.min(h[0], h[2]) - pad, Math.min(h[1], h[3]) - pad, Math.max(h[0], h[2]) + pad, Math.max(h[1], h[3]) + pad, h);
        cache = { key, bins, bs, rc, hr, count: list.length, far: bs };
      }
      const { bins, bs, rc, hr, far } = cache;
      const kf = Math.min(rc, hr) * 0.6 + 0.15; // hinge fillet
      const kr = Math.min(rc, kerf / 2) * 0.5 + 0.2;
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        let d = far;
        const L = bins.get(Math.floor(x / bs) + ',' + Math.floor(y / bs));
        if (L)
          for (const it of L) {
            let v;
            if (Array.isArray(it)) v = sdSeg(x, y, it[0], it[1], it[2], it[3]) - hr;
            else {
              v = sdPoly(x, y, it.v) - rc;
              if (it.holeR > 0) v = Math.max(v, it.holeR - Math.hypot(x - it.x, y - it.y));
            }
            d = smin(d, v, kf);
          }
        let f = smax(d, inner(x, y), kr);
        if (rim > 0) f = smin(f, Math.max(o, -(o + rim)), kr);
        return Math.max(f, o);
      };
      const pad = 3;
      return { evalFn, domain: { x0: m - pad, y0: m - pad, x1: Bd.w - m + pad, y1: Bd.h - m + pad }, count: cache.count };
    },
  };
})();
