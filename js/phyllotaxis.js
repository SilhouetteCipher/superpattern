// Phyllotaxis: the seed-head rule behind sunflowers, pine cones and daisies. Vogel's model places seed n at
//   r = c·n^spread,  θ = n·α
// with α the divergence angle. At the golden angle (α = 360°/φ² ≈ 137.508°) and spread ½ every seed gets the same
// area, so the disc packs evenly and the eye picks out two families of secondary spirals (parastichies) winding
// opposite ways, counted by consecutive Fibonacci numbers (8/13, 13/21, 21/34, …). Other angles give other
// families: 99.5° gives Lucas numbers, a rational angle collapses the head into straight arms. The divergence
// angle, the growth exponent and the seed count are the whole genome; everything visible is a consequence.
// Four readings of the same lattice are offered. Seeds are blobs sized from the real nearest-neighbour distance,
// so the gap between neighbours is always honoured. Scales are tapered capsules pointing along the radius, the
// tangent or the chosen parastichy, which gives the pine-cone / daisy look. Cells are the Voronoi tiling of the
// lattice (phyllotaxis is literally the Voronoi tiling of a spiral lattice): the field is the soft-min of the
// bisector distances to the nearest seeds, so corners round themselves. Spirals connect seed n to seed n + k for
// one or two Fibonacci steps k and draw the parastichy curves as bands whose width follows the local spacing.
// The lattice is scaled so the outermost seed just fits the disc (or the board rectangle), so counts change the
// density and never the footprint. Nothing thinner than 0.6 mm is emitted.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_R = 0.3; // narrowest half-width (mm) of any seed, scale, cell gap or band
  const FIB = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  // Nearest-neighbour distance of every seed, by a uniform bin grid over the lattice.
  function nearest(seeds, cell) {
    const n = seeds.length;
    const out = new Float64Array(n).fill(Infinity);
    if (n < 2) return out;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of seeds) { x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
    const cs = Math.max(cell, 1e-3);
    const nx = Math.floor((x1 - x0) / cs) + 1, ny = Math.floor((y1 - y0) / cs) + 1;
    const bins = new Map();
    const key = (i, j) => j * nx + i;
    seeds.forEach((s, idx) => {
      const k = key(Math.floor((s.x - x0) / cs), Math.floor((s.y - y0) / cs));
      (bins.get(k) || bins.set(k, []).get(k)).push(idx);
    });
    seeds.forEach((s, idx) => {
      const i = Math.floor((s.x - x0) / cs), j = Math.floor((s.y - y0) / cs);
      let best = Infinity;
      for (let ring = 1; ring <= 4; ring++) {
        for (let dj = -ring; dj <= ring; dj++) for (let di = -ring; di <= ring; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const list = bins.get(key(ii, jj));
          if (!list) continue;
          for (const o of list) if (o !== idx) best = Math.min(best, Math.hypot(seeds[o].x - s.x, seeds[o].y - s.y));
        }
        // Everything within ring·cs of the seed has been seen, so a candidate nearer than that is final.
        if (best <= ring * cs) break;
      }
      out[idx] = best;
    });
    return out;
  }


  SP.generators.phyllotaxis = {
    id: 'phyllotaxis',
    name: 'Phyllotaxis',
    board: true,
    schema: [
      { group: 'Lattice' },
      { key: 'angle', label: 'Divergence angle °', min: 60, max: 180, step: 0.001, def: 137.508, rand: [128, 150] },
      { key: 'count', label: 'Seeds', min: 20, max: 2500, step: 1, def: 420, int: true, rand: [150, 900] },
      { key: 'spread', label: 'Growth exponent', min: 0.3, max: 1, step: 0.005, def: 0.5, rand: [0.42, 0.65] },
      { key: 'hole', label: 'Skip centre seeds', min: 0, max: 200, step: 1, def: 0, int: true, rand: [0, 30] },
      { key: 'rotate', label: 'Rotate °', min: 0, max: 360, step: 0.5, def: 0, rand: [0, 360] },
      { key: 'mirror', label: 'Wind the other way', type: 'bool', def: false },
      { group: 'Draw' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'seeds', options: [['seeds', 'Seeds'], ['scales', 'Scales'], ['cells', 'Voronoi cells'], ['spirals', 'Parastichy spirals']] },
      { key: 'size', label: 'Seed size (× spacing)', min: 0.2, max: 1, step: 0.005, def: 0.74, rand: [0.5, 0.88], show: (o) => o.draw === 'seeds' || o.draw === 'scales' },
      { key: 'elong', label: 'Scale length (× spacing)', min: 0.5, max: 4, step: 0.01, def: 1.35, rand: [0.9, 1.8], show: (o) => o.draw === 'scales' },
      { key: 'taper', label: 'Scale tip', min: 0.1, max: 1, step: 0.01, def: 0.45, rand: [0.2, 1], show: (o) => o.draw === 'scales' },
      { key: 'orient', label: 'Scales point', type: 'select', def: 'radial', options: [['radial', 'Outward'], ['tangent', 'Around'], ['spiral', 'Along spiral']], show: (o) => o.draw === 'scales' },
      { key: 'gap', label: 'Cell gap (mm)', min: 0.6, max: 10, step: 0.05, def: 1.8, rand: [1.2, 3], show: (o) => o.draw === 'cells' },
      { key: 'round', label: 'Corner rounding (mm)', min: 0, max: 10, step: 0.05, def: 1.5, rand: [0.5, 3], show: (o) => o.draw === 'cells' },
      { key: 'auto', label: 'Follow the visible families', type: 'bool', def: true, show: (o) => o.draw === 'spirals' || (o.draw === 'scales' && o.orient === 'spiral') },
      { key: 'step', label: 'Spiral step (seeds)', min: 1, max: 89, step: 1, def: 13, int: true, rand: [5, 34], show: (o) => !o.auto && (o.draw === 'spirals' || (o.draw === 'scales' && o.orient === 'spiral')) },
      { key: 'both', label: 'Both families', type: 'bool', def: true, show: (o) => o.draw === 'spirals' },
      { key: 'width', label: 'Band width (× spacing)', min: 0.15, max: 0.9, step: 0.005, def: 0.45, rand: [0.3, 0.6], show: (o) => o.draw === 'spirals' },
      { group: 'Board' },
      { key: 'clip', label: 'Fill', type: 'select', def: 'disc', options: [['disc', 'Disc'], ['board', 'Whole board']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 4, step: 0.01, def: 0.15 },
      { key: 'fieldGain', label: 'Points → grow', min: -2, max: 2, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const cx = B.w / 2, cy = B.h / 2;
      const mg = Math.max(0, p.margin);
      const disc = p.clip !== 'board';
      const hw = Math.max(2, B.w / 2 - mg), hh = Math.max(2, B.h / 2 - mg);
      const R = disc ? Math.min(hw, hh) : Math.hypot(hw, hh); // radius the lattice must reach
      const N = Math.max(5, Math.round(p.count));
      const n0 = Math.min(Math.max(0, Math.round(p.hole)), N - 5);
      const alpha = p.angle * D2R * (p.mirror ? -1 : 1);
      const rot = p.rotate * D2R;
      const sp = Math.max(0.3, p.spread);
      const warp = points.length && p.fieldGain ? (x, y) => Math.max(0.25, 1 + p.fieldGain * fieldAt(x, y)) : () => 1;

      // ---- The lattice, in unit scale first, then fitted so seed N sits at radius R minus its own size ----
      const raw = [];
      for (let n = n0 + 1; n <= N; n++) {
        const r = Math.pow(n, sp), a = n * alpha + rot;
        raw.push({ n, x: r * Math.cos(a), y: r * Math.sin(a), r, a });
      }
      // Typical spacing in unit scale: Vogel's model gives area π per seed at spread ½; measure it instead so
      // other exponents are right too.
      const rMax = Math.pow(N, sp);
      const dUnit = nearest(raw, rMax / Math.sqrt(raw.length) * 2.5);
      let dMed = 0;
      { const s = Array.from(dUnit).filter(Number.isFinite).sort((a, b) => a - b); dMed = s.length ? s[s.length >> 1] : 1; }
      // Outer seeds reach out by roughly one spacing (a seed, a scale or a cell), so keep that inside R.
      const reach = p.draw === 'scales' ? Math.max(p.size, p.elong) * 0.55 : p.draw === 'cells' ? 0.6 : p.draw === 'spirals' ? 0.3 : p.size * 0.5;
      const scale = R / (rMax + reach * dMed);
      // Each seed also carries the area of its own annular slice, π(r(n+½)² − r(n−½)²), the area it "owns".
      const seeds = raw.map((s, i) => ({ n: s.n, x: cx + s.x * scale, y: cy + s.y * scale, a: s.a, d: (Number.isFinite(dUnit[i]) ? dUnit[i] : dMed) * scale,
        A: Math.PI * (Math.pow(s.n + 0.5, 2 * sp) - Math.pow(s.n - 0.5, 2 * sp)) * scale * scale }));
      const byN = new Map(seeds.map((s) => [s.n, s]));
      const spacing = dMed * scale; // mm between neighbours
      const inBoard = (x, y, e) => disc ? Math.hypot(x - cx, y - cy) + e <= R + 1e-6 : Math.abs(x - cx) + e <= hw && Math.abs(y - cy) + e <= hh;

      const out = { strokes: [], blobs: [], dots: [], count: 0, k: p.fillet };

      if (p.draw === 'seeds') {
        for (const s of seeds) {
          const r = Math.min(s.d * 0.5 * p.size * warp(s.x, s.y), s.d * 0.5 - MIN_R * 0.5);
          if (r < MIN_R) continue;
          if (!inBoard(s.x, s.y, r)) continue;
          out.blobs.push({ x: s.x, y: s.y, r });
        }
        out.count = out.blobs.length;
        return out;
      }

      if (p.draw === 'scales') {
        const kFix = Math.max(1, Math.round(p.step));
        // Along-spiral scales follow the shortest step from each seed (the most visible family) in auto mode.
        const stepOf = (s) => {
          if (!p.auto) return kFix;
          let k1 = 0, l1 = Infinity;
          for (let k = 1; k <= Math.min(89, N - s.n); k++) { const t = byN.get(s.n + k); if (!t) continue; const l = Math.hypot(t.x - s.x, t.y - s.y); if (l < l1 && l <= 1.8 * s.d) { l1 = l; k1 = k; } }
          return k1 || kFix;
        };
        for (const s of seeds) {
          const w = warp(s.x, s.y);
          const k = stepOf(s);
          const half = Math.min(s.d * 0.5 * p.size * w, s.d * 0.5 - MIN_R * 0.5); // half-width at the fat end
          if (half < MIN_R) continue;
          const len = Math.max(0, s.d * p.elong * w - 2 * half); // length between the cap centres
          let ux, uy;
          if (p.orient === 'tangent') { ux = -Math.sin(s.a); uy = Math.cos(s.a); }
          else if (p.orient === 'spiral') {
            const t = byN.get(s.n + k) || byN.get(s.n - k);
            if (t) { const dx = t.x - s.x, dy = t.y - s.y, h = Math.hypot(dx, dy) || 1; ux = dx / h; uy = dy / h; if (t.n < s.n) { ux = -ux; uy = -uy; } }
            else { ux = Math.cos(s.a); uy = Math.sin(s.a); }
          } else { ux = Math.cos(s.a); uy = Math.sin(s.a); }
          const tip = Math.max(MIN_R, half * p.taper);
          const a = [s.x - ux * len * 0.5, s.y - uy * len * 0.5], b = [s.x + ux * len * 0.5, s.y + uy * len * 0.5];
          const e = Math.max(len * 0.5 + half, len * 0.5 + tip);
          if (!inBoard(s.x, s.y, e)) continue;
          if (len < 1e-6) out.blobs.push({ x: s.x, y: s.y, r: half });
          else out.strokes.push({ pts: [a, b], r: [half, tip] });
        }
        out.count = out.strokes.length + out.blobs.length;
        return out;
      }

      if (p.draw === 'spirals') {
        // A parastichy family is the set of chains n → n + k. Its bands sit side by side with a *lateral*
        // spacing of (area per seed) / (step length): short steps mean a conspicuous, widely spaced family,
        // long steps a crowded one. Band half-width follows that lateral spacing, so bands of one family
        // never touch, and a family fades out where it stops being visible instead of filling solid.
        const wf = Math.max(0.15, p.width) * 0.5;
        const halfFor = (s, len) => {
          const lat = s.A / Math.max(1e-6, len);
          const h = Math.min(lat * wf * warp(s.x, s.y), lat * 0.5 - MIN_R * 0.5, s.d * 0.5 - MIN_R * 0.5);
          return h >= MIN_R ? h : 0;
        };
        const seg = (s, t, k) => {
          const len = Math.hypot(t.x - s.x, t.y - s.y);
          const r1 = halfFor(s, len), r2 = halfFor(t, len);
          if (!r1 && !r2) return;
          if (!inBoard(s.x, s.y, r1) || !inBoard(t.x, t.y, r2)) return;
          out.strokes.push({ pts: [[s.x, s.y], [t.x, t.y]], r: [Math.max(r1, MIN_R), Math.max(r2, MIN_R)], fam: k });
        };
        if (p.auto) {
          // Visible families: for each seed the one or two shortest steps to a later seed (the second not a
          // multiple of the first, so straight arms are drawn once). The families change with radius, which
          // is exactly how a real seed head switches from 8/13 to 13/21 to 21/34 as it grows.
          const KMAX = Math.min(89, N - n0 - 1);
          for (const s of seeds) {
            let k1 = 0, l1 = Infinity, k2 = 0, l2 = Infinity;
            for (let k = 1; k <= KMAX; k++) {
              const t = byN.get(s.n + k);
              if (!t) continue;
              const l = Math.hypot(t.x - s.x, t.y - s.y);
              if (l > 1.8 * s.d) continue; // not a neighbour: the outermost seeds have no later seed that way
              if (l < l1) { if (k1 && k % k1) { k2 = k1; l2 = l1; } k1 = k; l1 = l; }
              else if (l < l2 && k % k1) { k2 = k; l2 = l; }
            }
            if (k1) seg(s, byN.get(s.n + k1), k1);
            if (p.both && k2) seg(s, byN.get(s.n + k2), k2);
          }
        } else {
          const k1 = Math.max(1, Math.round(p.step));
          // The partner family is the next Fibonacci number up (it winds the other way); for a non-golden angle
          // use the auto mode instead, which finds whatever families the lattice actually has.
          const k2 = FIB.find((f) => f > k1) || k1;
          for (const k of p.both && k2 !== k1 ? [k1, k2] : [k1])
            for (const s of seeds) { const t = byN.get(s.n + k); if (t) seg(s, t, k); }
        }
        // Merge consecutive segments of one family into chains so the union has fewer, longer strokes.
        const chains = [], open = new Map(); // key: `${fam}|${x},${y}` of a chain's last point
        for (const st of out.strokes) {
          const kEnd = `${st.fam}|${st.pts[0][0].toFixed(5)},${st.pts[0][1].toFixed(5)}`;
          const c = open.get(kEnd);
          if (c) { open.delete(kEnd); c.pts.push(st.pts[1]); c.r.push(st.r[1]); open.set(`${st.fam}|${st.pts[1][0].toFixed(5)},${st.pts[1][1].toFixed(5)}`, c); }
          else { const nc = { pts: st.pts.slice(), r: st.r.slice() }; chains.push(nc); open.set(`${st.fam}|${st.pts[1][0].toFixed(5)},${st.pts[1][1].toFixed(5)}`, nc); }
        }
        out.strokes = chains;
        out.count = out.strokes.length;
        return out;
      }

      // ---- Voronoi cells: soft-min of bisector distances to the nearest seeds, inset by half the gap ----
      const g2 = Math.max(MIN_R, p.gap / 2);
      const kr = Math.max(0, p.round);
      const cs = Math.max(1, spacing);
      const gx0 = cx - R - cs, gy0 = cy - R - cs;
      const gnx = Math.ceil((2 * R + 2 * cs) / cs) + 1, gny = gnx;
      const bins = new Array(gnx * gny);
      for (let idx = 0; idx < seeds.length; idx++) {
        const s = seeds[idx];
        const i = Math.floor((s.x - gx0) / cs), j = Math.floor((s.y - gy0) / cs);
        if (i < 0 || j < 0 || i >= gnx || j >= gny) continue;
        (bins[j * gnx + i] || (bins[j * gnx + i] = [])).push(idx);
      }
      // Distance to the cell boundary at (x, y): find the nearest seed, then soft-min over the half-distances
      // to the bisectors with every other seed in the 5×5 neighbourhood (cells span at most ~2 spacings).
      const dist = (x, y) => {
        const i = Math.floor((x - gx0) / cs), j = Math.floor((y - gy0) / cs);
        let d1 = Infinity, near = -1;
        const cand = [];
        for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= gnx || jj >= gny) continue;
          const list = bins[jj * gnx + ii];
          if (!list) continue;
          for (const idx of list) {
            const s = seeds[idx], d = Math.hypot(x - s.x, y - s.y);
            cand.push(idx, d);
            if (d < d1) { d1 = d; near = idx; }
          }
        }
        if (near < 0) return -R; // far outside the lattice: solid (the clip removes it)
        const s1 = seeds[near];
        let e = Infinity;
        for (let q = 0; q < cand.length; q += 2) {
          const idx = cand[q];
          if (idx === near) continue;
          const s = seeds[idx];
          // Signed distance to the bisector between the nearest seed and this one.
          const mx = (s.x + s1.x) / 2, my = (s.y + s1.y) / 2, nx = s.x - s1.x, ny = s.y - s1.y, h = Math.hypot(nx, ny) || 1;
          const bd = ((mx - x) * nx + (my - y) * ny) / h;
          e = smin(e, bd, kr);
        }
        return e === Infinity ? -R : e;
      };
      const kf = Math.max(0.02, p.fillet);
      const outer = disc
        ? (x, y) => Math.hypot(x - cx, y - cy) - R
        : (x, y) => Math.max(Math.abs(x - cx) - hw, Math.abs(y - cy) - hh);
      const evalFn = (x, y) => {
        const f = g2 * warp(x, y) - dist(x, y);
        // The rim cells are open, so close them with the outline and keep a gap-wide margin inside it.
        return smax(f, outer(x, y) + g2, kf);
      };
      return { evalFn, domain: { x0: cx - R - 3, y0: cy - R - 3, x1: cx + R + 3, y1: cy + R + 3 }, count: seeds.length };
    },
  };
})();
