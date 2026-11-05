// Wallpaper: the 17 plane symmetry groups (Fedorov 1891, Pólya 1924; orbifold names from Conway) used as a
// kaleidoscope. A small seeded motif — a few spline strands, closed loops or sprigs with a bulb — is drawn once
// in one lattice cell, then copied by every operation of the chosen group (rotations, mirrors, glide
// reflections) and repeated over the lattice to fill the board. The operations are the group's "general
// positions" from the International Tables, written in lattice (fractional) coordinates as x' = M·x + t, so the
// motif is converted into the cell's basis, transformed and converted back: every copy is an exact isometry, and
// where a strand meets its own reflection on a mirror the smooth union fuses them into one symmetric shape. The
// lattice type follows the group (oblique, rectangular, centred, square, hexagonal), is centred on the board and
// can be rotated; the pattern is clipped to the board margin.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_W = 0.6; // narrowest band (mm)
  const D2R = Math.PI / 180;
  const S3 = Math.sqrt(3) / 2;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Operations [m00, m01, m10, m11, tx, ty] in fractional coordinates.
  const I = [1, 0, 0, 1, 0, 0], R2 = [-1, 0, 0, -1, 0, 0];
  const MX = [-1, 0, 0, 1, 0, 0], MY = [1, 0, 0, -1, 0, 0];
  const SQ4 = [I, [0, -1, 1, 0, 0, 0], R2, [0, 1, -1, 0, 0, 0]];
  const SQM = [MX, MY, [0, 1, 1, 0, 0, 0], [0, -1, -1, 0, 0, 0]];
  const HX3 = [I, [0, -1, 1, -1, 0, 0], [-1, 1, -1, 0, 0, 0]];
  const HX6 = [R2, [0, 1, -1, 1, 0, 0], [1, -1, 1, 0, 0, 0]];
  const HM1 = [[0, -1, -1, 0, 0, 0], [-1, 1, 0, 1, 0, 0], [1, 0, 1, -1, 0, 0]]; // p3m1 mirrors
  const HM2 = [[0, 1, 1, 0, 0, 0], [1, -1, 0, -1, 0, 0], [-1, 0, -1, 1, 0, 0]]; // p31m mirrors
  const half = (o) => [o[0], o[1], o[2], o[3], o[4] + 0.5, o[5] + 0.5];
  const centred = (ops) => ops.concat(ops.map(half));

  // lattice: oblique | rect | square | hex. Orbifold names in the labels.
  const GROUPS = {
    p1: { lat: 'oblique', ops: [I] },
    p2: { lat: 'oblique', ops: [I, R2] },
    pm: { lat: 'rect', ops: [I, MX] },
    pg: { lat: 'rect', ops: [I, [-1, 0, 0, 1, 0, 0.5]] },
    cm: { lat: 'rect', ops: centred([I, MX]) },
    pmm: { lat: 'rect', ops: [I, R2, MX, MY] },
    pmg: { lat: 'rect', ops: [I, R2, [-1, 0, 0, 1, 0.5, 0], [1, 0, 0, -1, 0.5, 0]] },
    pgg: { lat: 'rect', ops: [I, R2, [-1, 0, 0, 1, 0.5, 0.5], [1, 0, 0, -1, 0.5, 0.5]] },
    cmm: { lat: 'rect', ops: centred([I, R2, MX, MY]) },
    p4: { lat: 'square', ops: SQ4 },
    p4m: { lat: 'square', ops: SQ4.concat(SQM) },
    p4g: { lat: 'square', ops: SQ4.concat(SQM.map(half)) },
    p3: { lat: 'hex', ops: HX3 },
    p3m1: { lat: 'hex', ops: HX3.concat(HM1) },
    p31m: { lat: 'hex', ops: HX3.concat(HM2) },
    p6: { lat: 'hex', ops: HX3.concat(HX6) },
    p6m: { lat: 'hex', ops: HX3.concat(HX6, HM1, HM2) },
  };

  // Catmull–Rom through control points (closed loops wrap around).
  function spline(C, closed, per) {
    const n = C.length, out = [];
    if (n < 2) return C.slice();
    const at = (i) => (closed ? C[(i + n) % n] : C[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let k = 0; k < per; k++) {
        const t = k / per, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(closed ? out[0].slice() : C[n - 1].slice());
    return out;
  }

  SP.generators.wallpaper = {
    id: 'wallpaper',
    name: 'Wallpaper',
    board: true,
    schema: [
      { group: 'Symmetry' },
      { key: 'group', label: 'Group', type: 'select', def: 'p4m', options: [
        ['p1', 'p1 · o (translations)'], ['p2', 'p2 · 2222'], ['pm', 'pm · **'], ['pg', 'pg · xx'], ['cm', 'cm · *x'],
        ['pmm', 'pmm · *2222'], ['pmg', 'pmg · 22*'], ['pgg', 'pgg · 22x'], ['cmm', 'cmm · 2*22'],
        ['p4', 'p4 · 442'], ['p4m', 'p4m · *442'], ['p4g', 'p4g · 4*2'],
        ['p3', 'p3 · 333'], ['p3m1', 'p3m1 · *333'], ['p31m', 'p31m · 3*3'], ['p6', 'p6 · 632'], ['p6m', 'p6m · *632']] },
      { key: 'cell', label: 'Cell size (mm)', min: 20, max: 160, step: 0.5, def: 60, rand: [40, 85] },
      { key: 'aspect', label: 'Cell aspect', min: 0.5, max: 2, step: 0.01, def: 1, rand: [0.7, 1.4], show: (o) => !['p4', 'p4m', 'p4g', 'p3', 'p3m1', 'p31m', 'p6', 'p6m'].includes(o.group) },
      { key: 'skew', label: 'Cell angle °', min: 45, max: 135, step: 1, def: 75, rand: [60, 110], show: (o) => o.group === 'p1' || o.group === 'p2' },
      { key: 'rot', label: 'Rotate °', min: -180, max: 180, step: 1, def: 0 },
      { group: 'Motif' },
      { key: 'style', label: 'Motif', type: 'select', def: 'curves', options: [['curves', 'Strands'], ['loops', 'Loops'], ['sprigs', 'Sprigs with bulbs']] },
      { key: 'strands', label: 'Strands', min: 1, max: 6, step: 1, def: 2, int: true, rand: [1, 3] },
      { key: 'nodes', label: 'Bends per strand', min: 1, max: 6, step: 1, def: 3, int: true, rand: [2, 4] },
      { key: 'reach', label: 'Reach (× cell)', min: 0.1, max: 0.9, step: 0.01, def: 0.4, rand: [0.25, 0.55] },
      { key: 'beads', label: 'Beads', min: 0, max: 4, step: 1, def: 0, int: true, rand: [0, 2] },
      { key: 'beadR', label: 'Bead radius (mm)', min: 0.6, max: 12, step: 0.05, def: 3, rand: [1.8, 4.5] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 12, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'width', label: 'Band width (mm)', min: 0.6, max: 14, step: 0.05, def: 2.6, rand: [2, 5] },
      { key: 'taper', label: 'Taper', min: 0, max: 1, step: 0.01, def: 0.35, rand: [0, 0.7] },
      { key: 'fillet', label: 'Fillet / fuse', min: 0.05, max: 6, step: 0.01, def: 1.2, rand: [0.6, 2.2] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'fieldGain', label: 'Points → thicker', min: -1, max: 1, step: 0.01, def: 0.4 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], dots: [], count: 0, k: p.fillet };
      const G = GROUPS[p.group] || GROUPS.p4m;
      const L = Math.max(10, p.cell);
      // Lattice basis (columns a, b), then rotated.
      let a, b;
      if (G.lat === 'hex') { a = [L, 0]; b = [-L / 2, L * S3]; }
      else if (G.lat === 'square') { a = [L, 0]; b = [0, L]; }
      else if (G.lat === 'rect') { a = [L, 0]; b = [0, L * p.aspect]; }
      else { const g = p.skew * D2R, lb = L * p.aspect; a = [L, 0]; b = [lb * Math.cos(g), lb * Math.sin(g)]; }
      const cr = Math.cos(p.rot * D2R), sr = Math.sin(p.rot * D2R);
      const rot = (v) => [v[0] * cr - v[1] * sr, v[0] * sr + v[1] * cr];
      a = rot(a); b = rot(b);
      const det = a[0] * b[1] - a[1] * b[0];
      const toF = (x, y) => [(x * b[1] - y * b[0]) / det, (a[0] * y - a[1] * x) / det];
      const toC = (u, v) => [u * a[0] + v * b[0], u * a[1] + v * b[1]];
      const apply = (o, q) => { const f = toF(q[0], q[1]); return toC(o[0] * f[0] + o[1] * f[1] + o[4], o[2] * f[0] + o[3] * f[1] + o[5]); };

      // The motif, in cell-local mm around the lattice origin. Strands start inside the fundamental cell and
      // wander by `reach` per bend, turning gently so the splines stay smooth rather than zig-zagging.
      const rand = rng(Math.round(p.seed) * 2654435761 + 11);
      const step = L * p.reach;
      const w2 = Math.max(MIN_W, p.width) / 2;
      const motif = []; // { pts, closed, bulb }
      for (let s = 0; s < Math.max(1, Math.round(p.strands)); s++) {
        const c = toC(0.1 + rand() * 0.8, 0.1 + rand() * 0.8);
        const n = Math.max(1, Math.round(p.nodes));
        if (p.style === 'loops') {
          const m = Math.max(3, n + 2), r0 = step * (0.5 + rand() * 0.5), th0 = rand() * Math.PI * 2, C = [];
          for (let i = 0; i < m; i++) {
            const th = th0 + (i / m) * Math.PI * 2 + (rand() - 0.5) * (1.2 / m) * Math.PI;
            const r = r0 * (0.55 + rand() * 0.6);
            C.push([c[0] + r * Math.cos(th), c[1] + r * Math.sin(th)]);
          }
          motif.push({ pts: spline(C, true, 8), closed: true });
        } else {
          const C = [c];
          let h = rand() * Math.PI * 2;
          for (let i = 0; i < n; i++) {
            h += (rand() - 0.5) * 2.2;
            const q = C[C.length - 1], d = step * (0.6 + rand() * 0.6);
            C.push([q[0] + d * Math.cos(h), q[1] + d * Math.sin(h)]);
          }
          motif.push({ pts: spline(C, false, 7), closed: false, bulb: p.style === 'sprigs' });
        }
      }
      const beads = [];
      for (let i = 0; i < Math.round(p.beads); i++) beads.push(toC(rand(), rand()));

      // Copy the motif by every group operation (lattice origin = board centre).
      const cx = B.w / 2, cy = B.h / 2;
      const copies = [], beadCopies = [];
      for (const o of G.ops) {
        for (const m of motif) copies.push({ pts: m.pts.map((q) => apply(o, q)), closed: m.closed, bulb: m.bulb });
        for (const q of beads) beadCopies.push(apply(o, q));
      }

      // Repeat over every lattice translation that can reach the board, and keep what lands inside the margin box.
      const mg = Math.max(0, Math.min(p.margin, Math.min(B.w, B.h) / 2 - 2));
      const box = { x0: mg, y0: mg, x1: B.w - mg, y1: B.h - mg };
      const reachMax = L * 3 + step * (Math.round(p.nodes) + 1) + w2 * 4;
      const corners = [[-cx - reachMax, -cy - reachMax], [cx + reachMax, -cy - reachMax], [cx + reachMax, cy + reachMax], [-cx - reachMax, cy + reachMax]].map((q) => toF(q[0], q[1]));
      const u0 = Math.floor(Math.min(...corners.map((f) => f[0]))), u1 = Math.ceil(Math.max(...corners.map((f) => f[0])));
      const v0 = Math.floor(Math.min(...corners.map((f) => f[1]))), v1 = Math.ceil(Math.max(...corners.map((f) => f[1])));
      const grow = points.length && p.fieldGain ? (x, y) => Math.max(0.3, Math.min(2, 1 + p.fieldGain * fieldAt(x, y))) : () => 1;
      const pad = w2 * 2 + p.beadR + 2;
      const hits = (x0, y0, x1, y1) => x1 >= box.x0 - pad && x0 <= box.x1 + pad && y1 >= box.y0 - pad && y0 <= box.y1 + pad;
      const cells = new Set();
      for (let v = v0; v <= v1; v++)
        for (let u = u0; u <= u1; u++) {
          const t = toC(u, v), ox = cx + t[0], oy = cy + t[1];
          for (const c of copies) {
            const P = c.pts.map((q) => [ox + q[0], oy + q[1]]);
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
            if (!hits(x0, y0, x1, y1)) continue;
            const n = P.length - 1;
            const r = P.map(([x, y], i) => {
              const tt = c.closed ? 0 : i / n;
              return Math.max(MIN_W / 2, w2 * (1 - p.taper * tt) * grow(x, y));
            });
            out.strokes.push({ pts: P, r });
            if (c.bulb) { const e = P[n]; out.blobs.push({ x: e[0], y: e[1], r: Math.max(MIN_W / 2, w2 * 1.9 * grow(e[0], e[1])) }); }
            cells.add(u + ',' + v);
          }
          for (const q of beadCopies) {
            const x = ox + q[0], y = oy + q[1];
            if (hits(x, y, x, y)) out.blobs.push({ x, y, r: Math.max(MIN_W / 2, p.beadR * grow(x, y)) });
          }
        }
      out.clip = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, k: 0.4 };
      out.count = Math.max(1, cells.size);
      return out;
    },
  };
})();
