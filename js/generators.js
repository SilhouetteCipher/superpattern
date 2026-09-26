// Motif generator registry. Each generator turns a param object into motif-local
// primitives (mm, centred on 0,0). Layout, field modulation and export are shared.
//
//   strokes: [{ pts: [[x,y],...], r: [radius per point] }]   tapered polylines
//   blobs:   [{ x, y, r }]                                    round bulbs (blended)
//   dots:    [{ x, y, r, gap }]                               islands that carve clearance
//   extent:  max distance of any geometry from the motif centre
(function () {
  const SP = (window.SP = window.SP || {});
  SP.generators = {};
  const D2R = Math.PI / 180;

  function extentOf(out) {
    let e = 0;
    for (const s of out.strokes) s.pts.forEach((p, i) => (e = Math.max(e, Math.hypot(p[0], p[1]) + s.r[i])));
    for (const b of out.blobs) e = Math.max(e, Math.hypot(b.x, b.y) + b.r);
    for (const d of out.dots) e = Math.max(e, Math.hypot(d.x, d.y) + d.r);
    return e;
  }

  // Quadratic arm from a to b bent sideways by `bend` (fraction of length).
  function armPoints(a, b, bend) {
    if (Math.abs(bend) < 1e-4) return [a, b];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const c = [(a[0] + b[0]) / 2 - dy * bend * 0.5, (a[1] + b[1]) / 2 + dx * bend * 0.5];
    const pts = [];
    const n = 6;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
    return pts;
  }

  SP.generators.molecule = {
    id: 'molecule',
    name: 'Molecule',
    schema: [
      { group: 'Structure' },
      { key: 'branches', label: 'Branches', min: 1, max: 16, step: 1, def: 6, int: true, rand: [3, 9] },
      { key: 'branchR', label: 'Branch radius', min: 0, max: 90, step: 0.1, def: 43.6, rand: [25, 60] },
      { key: 'arms', label: 'Outer arms', min: 0, max: 5, step: 1, def: 2, int: true, rand: [1, 3] },
      { key: 'spread', label: 'Arm spread °', min: 0, max: 300, step: 1, def: 128, rand: [50, 170] },
      { key: 'armLen', label: 'Arm length', min: 0, max: 80, step: 0.1, def: 20.4, rand: [10, 32] },
      { key: 'stemLen', label: 'Inner stem', min: 0, max: 80, step: 0.1, def: 22.4, rand: [0, 30] },
      { key: 'bend', label: 'Arm bend', min: -1.5, max: 1.5, step: 0.01, def: 0.22, rand: [-0.7, 0.7] },
      { key: 'twist', label: 'Twist °', min: -180, max: 180, step: 1, def: 0, rand: [-35, 35] },
      { key: 'alt', label: 'Alternate', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.4, 0.4] },
      { group: 'Body' },
      { key: 'stroke', label: 'Stroke radius', min: 0.2, max: 15, step: 0.05, def: 5, rand: [3.2, 7] },
      { key: 'taper', label: 'Taper', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.4, 0.4] },
      { key: 'bulb', label: 'Bulb ratio', min: 0, max: 2.5, step: 0.01, def: 1.47, rand: [1, 1.7] },
      { key: 'fillet', label: 'Fillet / fuse', min: 0.05, max: 8, step: 0.01, def: 1.38, rand: [0.8, 2.6] },
      { group: 'Dots' },
      { key: 'dots', label: 'Ring dots', type: 'bool', def: true },
      { key: 'dotR', label: 'Dot radius', min: 0, max: 20, step: 0.05, def: 7.6, rand: [3, 9] },
      { key: 'dotRing', label: 'Dot ring', min: 0, max: 100, step: 0.1, def: 36.5, rand: [20, 55] },
      { key: 'dotPhase', label: 'Dot phase', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'gap', label: 'Clearance', min: 0, max: 15, step: 0.05, def: 5.6, rand: [2.5, 6] },
      { key: 'carve', label: 'Carve smooth', min: 0.01, max: 8, step: 0.01, def: 1.45, rand: [0.5, 2.5] },
      { key: 'centerDot', label: 'Centre dot', type: 'bool', def: false },
      { key: 'centerR', label: 'Centre radius', min: 0, max: 30, step: 0.05, def: 8 },
    ],

    generate(p) {
      const out = { strokes: [], blobs: [], dots: [] };
      const N = Math.max(1, Math.round(p.branches));
      const M = Math.max(0, Math.round(p.arms));
      const step = (2 * Math.PI) / N;
      const rJ = p.stroke * (1 + p.taper * 0.5);
      const rT = Math.max(0, p.stroke * (1 - p.taper * 0.5));

      for (let i = 0; i < N; i++) {
        const th = i * step;
        const ls = i % 2 === 1 && N % 2 === 0 ? 1 - p.alt : 1;
        const J = [p.branchR * Math.cos(th), p.branchR * Math.sin(th)];
        const dir = th + p.twist * D2R;
        let hasLimb = false;

        for (let j = 0; j < M; j++) {
          const off = M > 1 ? p.spread * (j / (M - 1) - 0.5) : 0;
          const a = dir + off * D2R;
          const L = p.armLen * ls;
          if (L < 1e-3) continue;
          const tip = [J[0] + L * Math.cos(a), J[1] + L * Math.sin(a)];
          const side = M === 1 ? 1 : Math.sign(j - (M - 1) / 2);
          const pts = armPoints(J, tip, p.bend * side);
          out.strokes.push({ pts, r: pts.map((_, k) => rJ + (rT - rJ) * (k / (pts.length - 1))) });
          if (p.bulb > 0) out.blobs.push({ x: tip[0], y: tip[1], r: rT * p.bulb });
          hasLimb = true;
        }
        if (p.stemLen * ls > 1e-3) {
          const L = p.stemLen * ls;
          const tip = [J[0] - L * Math.cos(dir), J[1] - L * Math.sin(dir)];
          out.strokes.push({ pts: [J, tip], r: [rJ, rT] });
          if (p.bulb > 0) out.blobs.push({ x: tip[0], y: tip[1], r: rT * p.bulb });
          hasLimb = true;
        }
        if (!hasLimb) out.blobs.push({ x: J[0], y: J[1], r: rJ * Math.max(1, p.bulb) });
      }

      if (p.dots && p.dotR > 0) {
        for (let i = 0; i < N; i++) {
          const a = (i + p.dotPhase) * step;
          out.dots.push({ x: p.dotRing * Math.cos(a), y: p.dotRing * Math.sin(a), r: p.dotR, gap: p.gap });
        }
      }
      if (p.centerDot && p.centerR > 0) out.dots.push({ x: 0, y: 0, r: p.centerR, gap: p.gap });

      out.extent = extentOf(out);
      return out;
    },
  };

  // ---------------------------------------------------------------------------
  // Dash Grid: a lattice whose sites grow dot -> big dot -> dash -> cross with the
  // intensity field (base gradient + field points). A dash fuses two neighbouring
  // sites; a cross claims all four neighbours.
  function hash(i, j, seed) {
    let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, Math.max(0, t));

  SP.generators.dashgrid = {
    id: 'dashgrid',
    name: 'Dash Grid',
    board: true,
    schema: [
      { group: 'Lattice' },
      { key: 'lattice', label: 'Lattice', type: 'select', def: 'diagonal', options: [['diagonal', 'Diagonal (checker)'], ['square', 'Square']] },
      { key: 'cols', label: 'Columns', min: 2, max: 60, step: 1, def: 8, int: true, rand: [6, 14] },
      { key: 'rows', label: 'Rows', min: 2, max: 60, step: 1, def: 8, int: true, rand: [6, 14] },
      { key: 'pitch', label: 'Pitch (mm)', min: 2, max: 40, step: 0.1, def: 12.5 },
      { group: 'Intensity' },
      { key: 'base', label: 'Base level', min: -1, max: 2, step: 0.01, def: 0.385, rand: [0.3, 0.7] },
      { key: 'gradAmt', label: 'Gradient amount', min: 0, max: 3, step: 0.01, def: 0.86, rand: [0.6, 1.8] },
      { key: 'gradAngle', label: 'Gradient angle °', min: -180, max: 180, step: 1, def: 44, rand: [-180, 180] },
      { key: 'fieldGain', label: 'Field point gain', min: -2, max: 2, step: 0.01, def: 1 },
      { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0, 0.35] },
      { key: 'seed', label: 'Seed', min: 1, max: 999, step: 1, def: 921, int: true, rand: [1, 999] },
      { group: 'Elements (× pitch)' },
      { key: 'dotMin', label: 'Dot min radius', min: 0, max: 0.7, step: 0.005, def: 0.205, rand: [0.1, 0.25] },
      { key: 'dotMax', label: 'Dot max radius', min: 0, max: 0.7, step: 0.005, def: 0.41, rand: [0.3, 0.45] },
      { key: 'dashT', label: 'Dash threshold', min: 0, max: 1.5, step: 0.01, def: 0.83, rand: [0.45, 0.75] },
      { key: 'crossT', label: 'Cross threshold', min: 0, max: 2, step: 0.01, def: 1.245, rand: [0.85, 1.2] },
      { key: 'dashMin', label: 'Dash min radius', min: 0, max: 0.7, step: 0.005, def: 0.41, rand: [0.2, 0.35] },
      { key: 'dashMax', label: 'Dash max radius', min: 0, max: 0.7, step: 0.005, def: 0.505, rand: [0.38, 0.5] },
      { key: 'dashLen', label: 'Dash length', min: 0, max: 1.5, step: 0.01, def: 1 },
      { key: 'crossLen', label: 'Cross arm length', min: 0, max: 1.5, step: 0.01, def: 1 },
      { key: 'bias', label: 'Direction bias', min: 0, max: 1, step: 0.01, def: 0.89, rand: [0, 1] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 4, step: 0.01, def: 0.3 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt } = ctx;
      const a = p.pitch, C = Math.round(p.cols), R = Math.round(p.rows);
      const diag = p.lattice === 'diagonal';
      const cx = B.w / 2, cy = B.h / 2;
      const ex = Math.max(1, (C - 1) * a), ey = Math.max(1, (R - 1) * a);
      const th = (p.gradAngle * Math.PI) / 180, gx = Math.cos(th), gy = -Math.sin(th);
      const sites = new Map();
      for (let j = 0; j < R; j++)
        for (let i = 0; i < C; i++) {
          if (diag && (i + j) % 2) continue;
          const x = cx + (i - (C - 1) / 2) * a, y = cy + (j - (R - 1) / 2) * a;
          const u = (x - cx) / ex, w = (y - cy) / ey;
          const v = p.base + p.gradAmt * (u * gx + w * gy) + p.fieldGain * fieldAt(x, y) + p.jitter * (hash(i, j, p.seed) - 0.5);
          sites.set(i + ',' + j, { i, j, x, y, v, used: false });
        }
      // Link axes: A = "\" (or horizontal), B = "/" (or vertical).
      const axes = diag ? [[[1, 1], [-1, -1]], [[1, -1], [-1, 1]]] : [[[1, 0], [-1, 0]], [[0, 1], [0, -1]]];
      const get = (s, d) => sites.get(s.i + d[0] + ',' + (s.j + d[1]));
      const out = { strokes: [], blobs: [], dots: [], count: sites.size };
      const span = Math.max(1e-6, (p.crossT > p.dashT ? p.crossT : p.dashT + 1) - p.dashT);
      const seg = (s1, s2, r, len) => {
        const mx = (s1.x + s2.x) / 2, my = (s1.y + s2.y) / 2, k = len;
        out.strokes.push({ pts: [[mx + (s1.x - mx) * k, my + (s1.y - my) * k], [mx + (s2.x - mx) * k, my + (s2.y - my) * k]], r: [r, r] });
      };

      const order = [...sites.values()].sort((s, t) => t.v - s.v);
      for (const s of order) {
        if (s.used) continue;
        const tt = (s.v - p.dashT) / span;
        if (s.v >= p.crossT) {
          const n = [...axes[0], ...axes[1]].map((d) => get(s, d));
          if (n.every((q) => q && !q.used)) {
            const r = p.dashMax * a;
            s.used = true;
            n.forEach((q) => (q.used = true));
            const L = p.crossLen;
            for (const [d1, d2] of axes) {
              const q1 = get(s, d1), q2 = get(s, d2);
              out.strokes.push({ pts: [[s.x + (q1.x - s.x) * L, s.y + (q1.y - s.y) * L], [s.x + (q2.x - s.x) * L, s.y + (q2.y - s.y) * L]], r: [r, r] });
            }
            continue;
          }
        }
        if (s.v >= p.dashT) {
          const pref = hash(s.i, s.j, p.seed + 101) < p.bias ? 0 : 1;
          let partner = null;
          for (const ax of [pref, 1 - pref]) {
            for (const d of axes[ax]) {
              const q = get(s, d);
              if (q && !q.used && (!partner || q.v > partner.v)) partner = q;
            }
            if (partner) break;
          }
          if (partner) {
            s.used = partner.used = true;
            seg(s, partner, lerp(p.dashMin, p.dashMax, ((s.v + partner.v) / 2 - p.dashT) / span) * a, p.dashLen);
            continue;
          }
        }
        s.used = true;
        const r = s.v >= p.dashT ? p.dotMax : lerp(p.dotMin, p.dotMax, s.v / Math.max(1e-6, p.dashT));
        out.blobs.push({ x: s.x, y: s.y, r: r * a });
      }
      return out;
    },
  };

  SP.defaultsFor = function (genId) {
    const o = {};
    for (const s of SP.generators[genId].schema) if (s.key) o[s.key] = s.def;
    return o;
  };
})();
