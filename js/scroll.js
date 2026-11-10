// Scrollwork: koru and rinceau scrolls drawn as magnetic curves (Xu & Mould, "Magnetic Curves: Curvature-Controlled
// Aesthetic Curves Using Magnetic Fields", Computational Aesthetics 2009). A charged particle moving at constant speed
// through a magnetic field that strengthens as it travels turns ever tighter, so its path is a spiral whose curvature
// rises monotonically: κ(s) = e^(Curl·s/R) / R for start radius R. Rising curvature means nested osculating circles
// (Tait–Kneser), so a scroll never crosses itself; it winds in until its radius reaches the eye and ends in a round
// bulb, the pītau head of a kōwhaiwhai koru. Every scroll buds smaller scrolls from its outer (convex) side at even
// arc intervals: each child leaves at the Branch angle, starts Child scale × its parent's radius and curls the
// opposite way (an S, the classic koiri), the same way (nested C hooks) or either at random, down to the set Depth.
// Roots are S-scrolls (a spiral grown both ways from the seed) scattered by dart throwing (Free), rise from the bottom edge like fern fronds (Fronds), or are the buds of
// undulating vine stems in rows (Vine, the acanthus rinceau). Growth is greedy: every point is checked against what is
// already placed (and the scroll's own earlier coils), and a scroll stops one Gap short of anything, so the export is
// a few large blended shapes with even clearances. Strokes taper from Width at the root to half of it at the tip;
// nothing thinner than 0.6 mm survives, and buds too short to read are dropped.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_R = 0.3; // narrowest half-width (mm): 0.6 mm lines
  const H = 0.4; // integration step (mm)
  const MAX_CURVES = 2500;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Uniform-grid index of placed discs (x, y, radius, owner) for clearance tests.
  function makeGrid(cell) {
    const m = new Map();
    const key = (i, j) => i * 73856093 ^ j * 19349663;
    return {
      add(x, y, r, id) {
        const kk = key(Math.floor(x / cell), Math.floor(y / cell));
        let b = m.get(kk);
        if (!b) m.set(kk, (b = []));
        b.push(x, y, r, id);
      },
      // Smallest edge distance (centre distance − disc radius) from (x,y) to any disc not owned by `skip`, up to `reach`.
      clear(x, y, reach, skip) {
        const ci = Math.floor(x / cell), cj = Math.floor(y / cell), n = Math.ceil(reach / cell);
        let best = reach;
        for (let j = cj - n; j <= cj + n; j++)
          for (let i = ci - n; i <= ci + n; i++) {
            const b = m.get(key(i, j));
            if (!b) continue;
            for (let t = 0; t < b.length; t += 4) {
              if (b[t + 3] === skip) continue;
              const d = Math.hypot(b[t] - x, b[t + 1] - y) - b[t + 2];
              if (d < best) best = d;
            }
          }
        return best;
      },
    };
  }

  let memoKey = '', memoOut = null;

  SP.generators.scroll = {
    id: 'scroll',
    name: 'Scrollwork',
    board: true,
    schema: [
      { group: 'Roots' },
      { key: 'layout', label: 'Roots', type: 'select', def: 'free', options: [['free', 'Free S-scrolls (scattered)'], ['fronds', 'Fronds (from the bottom edge)'], ['vine', 'Vine stems (rinceau)']] },
      { key: 'count', label: 'Roots / rows', min: 1, max: 60, step: 1, def: 24, int: true, rand: [6, 30] },
      { key: 'size', label: 'Scroll radius (mm)', min: 6, max: 80, step: 0.5, def: 26, rand: [16, 40] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 23, int: true, rand: [1, 9999] },
      { group: 'Scrolls' },
      { key: 'curl', label: 'Curl rate', min: 0.2, max: 3, step: 0.01, def: 0.55, rand: [0.35, 1] },
      { key: 'depth', label: 'Depth', min: 0, max: 4, step: 1, def: 2, int: true, rand: [1, 3] },
      { key: 'child', label: 'Child scale', min: 0.2, max: 0.9, step: 0.01, def: 0.5, rand: [0.35, 0.65] },
      { key: 'buds', label: 'Bud spacing (× radius)', min: 0.3, max: 4, step: 0.05, def: 0.9, rand: [0.6, 1.6] },
      { key: 'angle', label: 'Branch angle °', min: 0, max: 90, step: 1, def: 35, rand: [15, 60] },
      { key: 'sense', label: 'Child curl', type: 'select', def: 'opposite', options: [['opposite', 'Opposite (S-scrolls)'], ['same', 'Same (nested hooks)'], ['mixed', 'Mixed']] },
      { group: 'Stroke' },
      { key: 'width', label: 'Width (mm)', min: 1.2, max: 12, step: 0.05, def: 3.6, rand: [2.4, 5.5] },
      { key: 'bulb', label: 'Bulb radius (mm)', min: 0, max: 8, step: 0.05, def: 2.6, rand: [1.5, 4] },
      { key: 'gap', label: 'Gap (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6, rand: [1, 3] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.6, rand: [0.3, 1.2] },
    ],

    generateBoard(p, ctx) {
      const { board: B, points } = ctx;
      const key = JSON.stringify([p, B.w, B.h, points.map((q) => [q.x, q.y])]);
      if (key === memoKey && memoOut) return memoOut;
      const out = grow(p, B, points);
      memoKey = key;
      memoOut = out;
      return out;
    },
  };

  function grow(p, B, points) {
    const rand = rng(p.seed * 2654435761 + 11);
    const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
    const mg = Math.max(0, p.margin), gap = Math.max(0.6, p.gap);
    const R0 = Math.max(6, p.size);
    const rRoot = Math.max(MIN_R, p.width / 2);
    const bulbR = Math.max(0, p.bulb);
    const eye = Math.max(1.5, bulbR + gap * 0.5, rRoot); // a scroll stops winding once its radius reaches the eye
    const curl = Math.max(0.3, p.curl);
    const x0 = mg, y0 = mg, x1 = B.w - mg, y1 = B.h - mg;
    if (x1 - x0 < 4 * rRoot || y1 - y0 < 4 * rRoot) return out;
    const reach = 2 * Math.max(rRoot, bulbR) + gap + 1;
    const grid = makeGrid(Math.max(2, reach));
    let curves = 0;

    // Trace one magnetic curve. Returns { pts, r, k, s } (s = curl sign per point) or null if it is too short to read.
    // `exempt` is the parent's id, ignored for the first `free` mm so a bud can leave its parent's edge.
    // `pre` mm of nearly straight stem run first (the field is still weak there), as in a rising fern frond.
    const trace = (sx, sy, th, s, R, r0, exempt, free, pre = 0) => {
      const Lend = pre + (R / curl) * Math.log(Math.max(1.0001, R / eye)); // arc length at which ρ reaches the eye
      const rTip = Math.max(MIN_R, r0 * 0.5);
      const radAt = (L) => r0 + (rTip - r0) * Math.min(1, L / Math.max(1e-6, Lend));
      const pts = [[sx, sy]], rr = [radAt(0)];
      const own = makeGrid(Math.max(2, reach));
      let x = sx, y = sy, L = 0;
      const maxN = Math.ceil(Lend / H) + 1;
      const ok = (nx, ny, r) => {
        if (nx - r < x0 || nx + r > x1 || ny - r < y0 || ny + r > y1) return false;
        if (grid.clear(nx, ny, reach, L < free ? exempt : -2) - r < gap) return false;
        return own.clear(nx, ny, reach, -2) - r < gap ? false : true;
      };
      if (!ok(sx, sy, rr[0])) return null;
      const lag = Math.ceil((2 * (2 * r0 + gap)) / H); // own points this far back are near only by adjacency
      for (let k = 1; k <= maxN; k++) {
        const kap = Math.exp((curl * (L - pre) * (L < pre ? 5 : 1)) / R) / R; // the stem stays nearly straight (≈ 1/(5·Curl) rad in all)
        const tm = th + s * kap * H * 0.5; // midpoint heading
        const nx = x + Math.cos(tm) * H, ny = y + Math.sin(tm) * H;
        const nr = radAt(L + H);
        if (!ok(nx, ny, nr)) break;
        th += s * kap * H;
        L += H;
        x = nx; y = ny;
        pts.push([x, y]);
        rr.push(nr);
        if (pts.length > lag) { const q = pts.length - 1 - lag; own.add(pts[q][0], pts[q][1], rr[q], 0); }
      }
      if (L < Math.max(4 * r0, 0.5 * R + pre * 0.5)) return null; // shorter buds would read as bumps
      // Bulb at the end, as big as the clearance allows.
      let blob = null;
      if (bulbR > 0) {
        const e = pts[pts.length - 1];
        // Re-check against own points except the last stretch of the stroke itself.
        const near = Math.min(grid.clear(e[0], e[1], reach, -2), (() => {
          const g = makeGrid(Math.max(2, reach)), back = Math.ceil((2 * bulbR + gap) / H) + lag;
          for (let q = 0; q < pts.length - back; q++) g.add(pts[q][0], pts[q][1], rr[q], 0);
          return g.clear(e[0], e[1], reach, -2);
        })(), e[0] - x0, x1 - e[0], e[1] - y0, y1 - e[1]);
        const br = Math.min(bulbR, near - gap);
        if (br > rr[rr.length - 1] * 1.15 && br >= MIN_R) blob = { x: e[0], y: e[1], r: br };
      }
      return { pts, r: rr, th, s, R, pre, blob };
    };

    // Commit a curve to the grid and the output; returns its id.
    const commit = (c) => {
      const id = curves++;
      c.pts.forEach((q, i) => grid.add(q[0], q[1], c.r[i], id));
      if (c.blob) { grid.add(c.blob.x, c.blob.y, c.blob.r, id); out.blobs.push(c.blob); }
      out.strokes.push({ pts: c.pts, r: c.r });
      out.count++;
      c.id = id;
      return id;
    };

    const childSense = (s) => (p.sense === 'same' ? s : p.sense === 'mixed' ? (rand() < 0.5 ? s : -s) : -s);

    // Bud children off the convex side of a committed curve at even arc steps, then recurse breadth-first.
    // `sides(i)` gives the curl sign at point i (constant for scrolls, alternating along a vine).
    const queue = [];
    const budsOf = (c, level, Rc, firstL, sideAt) => {
      if (level >= p.depth || Rc * p.child < eye * 2) return;
      const step = Math.max(2 * rRoot + gap, p.buds * Rc);
      const n = c.pts.length;
      for (let L = firstL; L < (n - 1) * H * 0.8; L += step) {
        const i = Math.round(L / H);
        if (i <= 0 || i >= n - 1) continue;
        const a = c.pts[i - 1], b = c.pts[i + 1];
        const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const s = sideAt(i);
        const ox = s * Math.sin(th), oy = -s * Math.cos(th); // outward (away from the centre of curvature)
        const rp = c.r[i];
        queue.push({ x: c.pts[i][0] + ox * rp * 0.5, y: c.pts[i][1] + oy * rp * 0.5, th: th - s * p.angle * D2R,
          s: childSense(s), R: Rc * p.child, r0: Math.max(MIN_R, rp * 0.8), parent: c.id, free: 2 * rp + gap + 2 * H, level: level + 1 });
      }
    };
    const drain = () => {
      while (queue.length && curves < MAX_CURVES) {
        const q = queue.shift();
        const c = trace(q.x, q.y, q.th, q.s, q.R, q.r0, q.parent, q.free);
        if (!c) continue;
        commit(c);
        budsOf(c, q.level, q.R, q.R * 0.35, () => c.s);
      }
    };
    // `both`: also grow the half-turn copy from the seed (heading reversed, same turning sense) — an S-scroll.
    const root = (x, y, th, s, R, pre = 0, both = false) => {
      const c = trace(x, y, th, s, R, rRoot, -2, 0, pre);
      if (!c) return false;
      commit(c);
      budsOf(c, 0, R, R * 0.3 + pre * 0.4, () => c.s);
      if (both) {
        const d = trace(x, y, th + Math.PI, s, R * (0.75 + 0.3 * rand()), rRoot, c.id, 2 * rRoot + gap + 2 * H);
        if (d) { commit(d); budsOf(d, 0, d.R, d.R * 0.3, () => d.s); }
      }
      drain();
      return true;
    };
    const jit = () => R0 * (0.8 + 0.4 * rand());
    const open = (x, y) => grid.clear(x, y, R0 * 0.3, -2) >= R0 * 0.3 - 1e-6; // an open patch to start in
    const sgn = () => (rand() < 0.5 ? 1 : -1);
    const n = Math.max(1, Math.round(p.count));

    if (p.layout === 'vine') {
      // Sine stems in rows; buds sit just past every crest on the convex side, so scrolls alternate above and below.
      const rows = Math.min(n, Math.max(1, Math.floor((y1 - y0) / (R0 * 2))));
      const pitch = (y1 - y0) / rows, amp = Math.min(pitch * 0.18, R0 * 0.35), lam = R0 * 2.4;
      for (let row = 0; row < rows; row++) {
        const cy = y0 + pitch * (row + 0.5), ph = rand() * Math.PI * 2;
        const pts = [], r = [];
        for (let x = x0 + rRoot; x <= x1 - rRoot; x += H) { pts.push([x, cy + amp * Math.sin((2 * Math.PI * x) / lam + ph)]); r.push(rRoot); }
        if (pts.length < 2) continue;
        const stem = { pts, r, s: 1 };
        commit(stem);
        // Curl sign along the stem: the sign of y''; crests at sin = ±1.
        const side = (i) => (Math.sin((2 * Math.PI * pts[i][0]) / lam + ph) > 0 ? -1 : 1);
        const kq = Math.ceil((pts[0][0] * 2 * Math.PI / lam + ph - Math.PI / 2) / Math.PI);
        for (let k = kq; ; k++) {
          const xc = ((Math.PI / 2 + k * Math.PI - ph) * lam) / (2 * Math.PI) + lam * 0.06;
          const i = Math.round((xc - pts[0][0]) / H);
          if (i >= pts.length - 1) break;
          if (i < 1) continue;
          const a = pts[i - 1], b = pts[i + 1], th = Math.atan2(b[1] - a[1], b[0] - a[0]), s = side(i);
          // Each bud bends away from the stem and curls on round, the S of the rinceau.
          queue.push({ x: pts[i][0] + s * Math.sin(th) * rRoot * 0.5, y: pts[i][1] - s * Math.cos(th) * rRoot * 0.5,
            th: th - s * p.angle * D2R, s: -s, R: jit(), r0: rRoot, parent: stem.id, free: 2 * rRoot + gap + 2 * H, level: 0 });
        }
      }
      drain(); // every stem is placed before any scroll grows, so no row is crowded out
    } else if (p.layout === 'fronds') {
      // Evenly along the bottom edge, rising with a little lean and alternating curl.
      const nf = Math.min(n, Math.max(1, Math.floor((x1 - x0) / (R0 * 1.6)))); // room for each frond to roll over
      for (let k = 0; k < nf; k++) {
        const x = x0 + (x1 - x0) * ((k + 0.5 + (rand() - 0.5) * 0.4) / nf);
        const s = k % 2 ? 1 : -1, R = jit();
        root(x, y1 - rRoot - 0.5, -Math.PI / 2 + (rand() - 0.5) * 8 * D2R, s, R, Math.max(0, (y1 - y0) * (0.6 + 0.3 * rand()) - 1.2 * R));
      }
    } else {
      // Field points first, then dart-thrown roots heading anywhere.
      for (const q of points) if (out.count < MAX_CURVES && open(q.x, q.y)) root(q.x, q.y, rand() * Math.PI * 2, sgn(), jit(), 0, true);
      let placed = 0;
      for (let t = 0; t < n * 60 && placed < n; t++) {
        const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
        if (open(x, y) && root(x, y, rand() * Math.PI * 2, sgn(), jit(), 0, true)) placed++;
      }
    }
    return out;
  }
})();
