// Gear Train: a board of spur gears that genuinely mesh, grown one gear at a time. Every gear shares one module m
// (pitch diameter ÷ teeth), so any two can run together: a new gear of n teeth has pitch radius m·n/2 and is set
// down tangent to a parent's pitch circle, at a seeded random bearing, only if its tip circle stays clear of every
// other gear and of the board. Its rotation is then solved so a tooth of the parent sits in one of its gaps — the
// parent's tooth phase at the contact bearing, mirrored (ccw on one pitch circle is cw on the other) and shifted half
// a pitch — so turning the whole train by "Turn" keeps every pair in mesh. Teeth follow the standard proportions
// (addendum m, dedendum 1.25 m, 20° pressure angle): each is a chain of capsules whose widths follow the exact involute
// tooth thickness — half the circular pitch on the pitch circle, less the mesh gap — narrowing toward the tip and held
// at its base-circle width below, with the tip trimmed so meshing gears keep the gap on every flank and under every tip. Bodies are solid discs or rim-hub-spoke wheels, with an optional axle bore.
// "Sprawl" chooses between a winding chain (always grow from the newest gear) and a bushy cluster (any gear).
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3; // narrowest half-width (mm) of any tooth tip, spoke or rim
  const PRESS = (20 * Math.PI) / 180; // pressure angle
  const FLANK = 4; // capsule segments along each involute flank
  const TRIES = 60; // placement attempts per gear before the train counts as full

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const frac = (v) => v - Math.floor(v);

  // Closed polyline around a circle, fine enough that the capsule union reads as a true circle.
  function ring(x, y, rc, half) {
    const n = Math.max(24, Math.min(160, Math.ceil((2 * Math.PI * rc) / 1.2)));
    const pts = [], r = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      pts.push([x + rc * Math.cos(a), y + rc * Math.sin(a)]);
      r.push(half);
    }
    return { pts, r };
  }

  SP.generators.gears = {
    id: 'gears',
    name: 'Gear Train',
    board: true,
    schema: [
      { group: 'Train' },
      { key: 'module', label: 'Module (mm)', min: 1.2, max: 10, step: 0.05, def: 3.5, rand: [2.2, 4.2] },
      { key: 'teethMin', label: 'Fewest teeth', min: 6, max: 60, step: 1, def: 10, int: true, rand: [8, 14] },
      { key: 'teethMax', label: 'Most teeth', min: 8, max: 120, step: 1, def: 32, int: true, rand: [18, 44] },
      { key: 'count', label: 'Max gears', min: 1, max: 200, step: 1, def: 60, int: true, rand: [12, 90] },
      { key: 'sprawl', label: 'Chain ↔ cluster', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0, 1] },
      { key: 'turn', label: 'Turn (teeth)', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 1] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 11, int: true, rand: [1, 9999] },
      { group: 'Teeth' },
      { key: 'gap', label: 'Mesh gap (mm)', min: 0.6, max: 3, step: 0.05, def: 1, rand: [0.8, 1.5] },
      { key: 'clear', label: 'Gear spacing (mm)', min: 0.6, max: 20, step: 0.1, def: 2.5, rand: [1.2, 6] },
      { group: 'Body' },
      { key: 'body', label: 'Body', type: 'select', def: 'spoked', options: [['solid', 'Solid disc'], ['spoked', 'Rim, hub and spokes']] },
      { key: 'spokes', label: 'Spokes', min: 2, max: 12, step: 1, def: 5, int: true, rand: [3, 7], show: (o) => o.body === 'spoked' },
      { key: 'rim', label: 'Rim / spoke width (mm)', min: 1.2, max: 10, step: 0.05, def: 3, rand: [2, 4.5], show: (o) => o.body === 'spoked' },
      { key: 'axle', label: 'Axle bore (mm)', min: 0, max: 12, step: 0.1, def: 2, rand: [0, 4] },
      { group: 'Board' },
      { key: 'edges', label: 'Edges', type: 'select', def: 'inside', options: [['inside', 'Whole gears only'], ['crop', 'Crop at the board']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 1.5, step: 0.01, def: 0.35, rand: [0.15, 0.5] },
      { key: 'fieldGain', label: 'Points → bigger gears', min: -2, max: 2, step: 0.01, def: 0.8 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 29);
      const m = Math.max(1.2, p.module);
      const mg = Math.max(0, p.margin);
      const crop = p.edges === 'crop';
      const fit = Math.max(2, Math.min(B.w, B.h) / 2 - (crop ? 0 : mg)); // largest tip radius any gear may have
      const nCap = Math.max(6, Math.floor((2 * (fit - m)) / m));
      const tMin = Math.min(nCap, Math.max(6, Math.round(p.teethMin)));
      const tMax = Math.min(nCap, Math.max(tMin, Math.round(p.teethMax)));
      const clear = Math.max(2 * MIN_R, p.clear);
      const field = points.length && p.fieldGain ? (x, y) => Math.max(0, Math.min(1, 0.5 + 0.5 * p.fieldGain * fieldAt(x, y))) : () => null;
      // Tooth count: uniform between the limits, or pulled toward the large end where field points push. `shrink`
      // (0..1, rising as placements fail) narrows the pick toward the small end so late gears fill the gaps.
      const pickN = (x, y, shrink = 0) => {
        const f = field(x, y);
        const u = f === null ? rand() : Math.min(1, Math.max(0, f + (rand() - 0.5) * 0.5));
        return Math.round(tMin + u * (1 - shrink) * (tMax - tMin));
      };
      const gear = (x, y, n, th) => ({ x, y, n, th, R: (m * n) / 2, ra: (m * n) / 2 + m });
      // Whole gears keep their tips inside the margin; cropped gears only need their centre on the board.
      const onBoard = (g) => crop
        ? g.x >= mg && g.x <= B.w - mg && g.y >= mg && g.y <= B.h - mg
        : g.x - g.ra >= mg && g.x + g.ra <= B.w - mg && g.y - g.ra >= mg && g.y + g.ra <= B.h - mg;

      // ---- Grow the train ----
      const gears = [];
      for (let t = 0; t < TRIES && !gears.length; t++) {
        const n = pickN(B.w / 2, B.h / 2, 0.4); // a mid-sized first gear leaves room to grow
        const g = gear(B.w * (0.35 + 0.3 * rand()), B.h * (0.35 + 0.3 * rand()), n, 0);
        g.th = rand() * 2 * Math.PI / n + (p.turn * 2 * Math.PI) / n;
        if (onBoard(g)) gears.push(g);
      }
      const max = Math.max(1, Math.round(p.count));
      let fails = 0;
      const patience = TRIES * 6;
      while (gears.length && gears.length < max && fails < patience) {
        const par = rand() < p.sprawl ? gears[Math.floor(rand() * gears.length)] : gears[gears.length - 1 - Math.floor(rand() * Math.min(2, gears.length))];
        const n = pickN(par.x, par.y, fails / patience);
        const a = rand() * 2 * Math.PI;
        const d = par.R + (m * n) / 2;
        const g = gear(par.x + d * Math.cos(a), par.y + d * Math.sin(a), n, 0);
        let ok = onBoard(g);
        for (let i = 0; ok && i < gears.length; i++) {
          const o = gears[i];
          if (o !== par && Math.hypot(g.x - o.x, g.y - o.y) < g.ra + o.ra + clear) ok = false;
        }
        if (!ok) { fails++; continue; }
        // Mesh: the parent's tooth sits φ pitches behind the contact bearing (ccw); mirrored onto the new gear, its
        // gap must fall there, so its nearest tooth is φ + ½ pitch ccw of the bearing back to the parent.
        const phi = frac(((a - par.th) * par.n) / (2 * Math.PI));
        g.th = a + Math.PI + ((phi + 0.5) * 2 * Math.PI) / n;
        gears.push(g);
        fails = 0;
      }

      // ---- Draw ----
      // The mesh gap thins every tooth flank and trims every tip so meshing gears keep a clear gap (about two-thirds of
      // the setting at the tightest point, as the capsule chain rounds off the involute). Merge is held below gap / 4:
      // the field's exponential smooth union sums every nearby tooth, and would otherwise bridge a mesh.
      const gap = Math.min(Math.max(2 * MIN_R, p.gap), 0.6 * m);
      const out = { strokes: [], blobs: [], dots: [], cuts: [], count: gears.length, k: Math.min(p.fillet, gap / 4), ks: 0.3 };
      if (crop) out.clip = { x0: mg, y0: mg, x1: B.w - mg, y1: B.h - mg, k: 0.4 };
      const s = (Math.PI * m) / 2 - gap / Math.cos(PRESS); // tooth thickness on the pitch circle
      const add = Math.min(m, 1.25 * m - gap); // addendum, cut back so the tip clears the partner's root by `gap`
      const rimW = Math.max(2 * MIN_R, p.rim);
      const axle = Math.max(0, p.axle);
      for (const g of gears) {
        const rb = g.R * Math.cos(PRESS); // base circle
        const rf = g.R - 1.25 * m; // root circle
        // Involute tooth thickness at radius r: 2r·(s/2R + inv αp − inv αr), inv α = tan α − α, cos αr = rb / r.
        const inv = (r) => { const al = Math.acos(Math.min(1, rb / r)); return Math.tan(al) - al; };
        const half = (r) => Math.max(MIN_R, r * (s / (2 * g.R) + inv(g.R) - inv(Math.max(rb, r))));
        const r0 = Math.max(rf, rb), baseHalf = half(r0);
        const ra = g.R + add, tipHalf = half(ra);
        // Body stops at the root circle: a meshing partner's tips come within `gap` of it.
        const rBody = rf;
        const hubR = axle + Math.max(rimW, 1.5);
        const spoked = p.body === 'spoked' && rBody - rimW - hubR > Math.max(3, rimW * 1.5);
        // Each tooth starts inside the body (on a spoked wheel, its round foot stays within the rim), keeps its base
        // width up to the base circle, then follows the involute thickness out to a round tip on the trimmed addendum.
        let rIn = rf - Math.min(baseHalf, 0.5 * m);
        if (spoked) rIn = Math.min(r0, Math.max(rIn, rf - rimW + baseHalf + 0.2));
        const radii = [rIn, r0];
        const r1 = ra - tipHalf;
        for (let j = 1; j <= FLANK; j++) radii.push(r0 + ((r1 - r0) * j) / FLANK);
        const hw = radii.map((r, j) => (j < 2 ? baseHalf : half(r)));
        for (let k = 0; k < g.n; k++) {
          const a = g.th + (k / g.n) * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a);
          out.strokes.push({ pts: radii.map((r) => [g.x + r * c, g.y + r * sn]), r: hw.slice() });
        }
        if (spoked) {
          const rc = rBody - rimW / 2;
          out.strokes.push(ring(g.x, g.y, rc, rimW / 2));
          out.blobs.push({ x: g.x, y: g.y, r: hubR });
          const ns = Math.max(2, Math.round(p.spokes));
          for (let k = 0; k < ns; k++) {
            const a = g.th + (k / ns) * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a);
            out.strokes.push({ pts: [[g.x + hubR * 0.5 * c, g.y + hubR * 0.5 * sn], [g.x + rc * c, g.y + rc * sn]], r: [rimW / 2, rimW / 2] });
          }
        } else out.blobs.push({ x: g.x, y: g.y, r: rBody });
        // Axle bore, only where it leaves at least a rim's width of body round it.
        if (axle >= MIN_R && axle < rBody - rimW) out.cuts.push({ pts: [[g.x, g.y], [g.x, g.y]], r: [axle, axle] });
      }
      return out;
    },
  };
})();
