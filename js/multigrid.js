// Multigrid: n-fold rhombus quasi-tilings by de Bruijn's dual (multigrid) method. For s-fold symmetry lay n families of
// equally spaced parallel lines (n = s for odd s, s/2 for even s), family m along the unit vector e_m at angle
// 2π·m/s, each shifted by an offset γ_m. Every crossing of two lines is dual to one rhombus: the four cells round the
// crossing each map to a vertex Σ_m ⌈t_m − γ_m⌉·e_m, where t_m is the point's coordinate along e_m. n = 5 gives
// the Penrose rhombus tiling (fat and thin rhombi), n = 8 the Ammann–Beenker squares and 45° rhombi, 7, 9 and 12
// give the richer quasicrystal families; equal offsets of ½ give exact global 2n-fold symmetry, other equal
// offsets give the "generalised" Penrose tilings and a little seeded scatter breaks the symmetry. Each rhombus
// becomes a rounded tile inset by half the gap (tiles can be filtered by class: fat only, thin only, alternate
// classes, or a seeded fraction), or the tiling is drawn as strapwork along its edges. Tiles that would be
// narrower than 1 mm after the inset are dropped, so there are no hairlines or specks.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_HALF = 0.3; // minimum half-width (mm) of a band
  const MIN_TILE = 0.5; // minimum inradius (mm) of a surviving tile

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  // Exact signed distance to a convex polygon given counter-clockwise vertices (negative inside).
  function convexSDF(v) {
    const n = v.length, nx = [], ny = [], off = [];
    let gx = 0, gy = 0;
    for (let i = 0; i < n; i++) {
      const a = v[i], b = v[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey) || 1;
      nx.push(ey / L); ny.push(-ex / L); off.push((ey * a[0] - ex * a[1]) / L);
      gx += a[0] / n; gy += a[1] / n;
    }
    // Normals must point outward: flip them if the centroid reads as outside.
    let gmax = -Infinity;
    for (let i = 0; i < n; i++) gmax = Math.max(gmax, nx[i] * gx + ny[i] * gy - off[i]);
    if (gmax > 0) for (let i = 0; i < n; i++) { nx[i] = -nx[i]; ny[i] = -ny[i]; off[i] = -off[i]; }
    return (x, y) => {
      let inside = -Infinity;
      for (let i = 0; i < n; i++) inside = Math.max(inside, nx[i] * x + ny[i] * y - off[i]);
      if (inside <= 0) return inside;
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const a = v[i], b = v[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
        best = Math.min(best, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
      }
      return best;
    };
  }

  // Number of line families for s-fold symmetry: s for odd s (directions 2π·m/s round the full circle),
  // s/2 for even s (a line family and its opposite are the same family), e.g. 4 families for Ammann–Beenker.
  const familiesFor = (s) => (s % 2 === 1 ? s : s / 2);

  // Build the rhombi of the s-fold multigrid tiling, in mm, covering a circle of radius R about (cx, cy).
  // Each rhombus: { c: [x, y] centre, v: [[x,y]×4] CCW vertices, cls: 1..⌊n/2⌋ (1 = thinnest), rho: inradius }.
  function buildTiling(s, size, rot, gamma, cx, cy, R) {
    const n = familiesFor(s);
    const ex = [], ey = [];
    for (let m = 0; m < n; m++) {
      const a = (2 * Math.PI * m) / s + rot;
      ex.push(Math.cos(a)); ey.push(Math.sin(a));
    }
    // f(z) ≈ (n/2)·z for a regular star, so grid coordinates needed to cover R mm are ≈ R / (size·n/2).
    const Rg = (R / size) / (n / 2) * 1.15 + 2;
    const kmax = Math.ceil(Rg + 1);
    const tiles = [];
    const K = new Array(n);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const det = ex[i] * ey[j] - ey[i] * ex[j];
        if (Math.abs(det) < 1e-9) continue;
        const d = j - i, cls = Math.min(d, n - d) || n; // angle class of this family pair
        for (let ki = -kmax; ki <= kmax; ki++)
          for (let kj = -kmax; kj <= kmax; kj++) {
            // Crossing of line ki of family i and line kj of family j: solve z·e_i = ki + γ_i, z·e_j = kj + γ_j.
            const ti = ki + gamma[i], tj = kj + gamma[j];
            const zx = (ti * ey[j] - tj * ey[i]) / det, zy = (ex[i] * tj - ex[j] * ti) / det;
            if (zx * zx + zy * zy > Rg * Rg) continue;
            let bx = 0, by = 0;
            for (let m = 0; m < n; m++) {
              if (m === i || m === j) continue;
              const k = Math.ceil(zx * ex[m] + zy * ey[m] - gamma[m]);
              bx += k * ex[m]; by += k * ey[m];
            }
            // The four cells round the crossing take index ki or ki+1 along i and kj or kj+1 along j.
            const vx = (a, b) => bx + (ki + a) * ex[i] + (kj + b) * ex[j], vy = (a, b) => by + (ki + a) * ey[i] + (kj + b) * ey[j];
            const c = [cx + size * (bx + (ki + 0.5) * ex[i] + (kj + 0.5) * ex[j]), cy + size * (by + (ki + 0.5) * ey[i] + (kj + 0.5) * ey[j])];
            if (Math.hypot(c[0] - cx, c[1] - cy) > R + size) continue;
            let v = [[vx(0, 0), vy(0, 0)], [vx(1, 0), vy(1, 0)], [vx(1, 1), vy(1, 1)], [vx(0, 1), vy(0, 1)]].map((q) => [cx + size * q[0], cy + size * q[1]]);
            // Orient counter-clockwise (positive signed area in y-down screen space).
            let area = 0;
            for (let t = 0; t < 4; t++) { const a = v[t], b = v[(t + 1) % 4]; area += a[0] * b[1] - b[0] * a[1]; }
            if (area < 0) v.reverse();
            const sinA = Math.abs(det); // sin of the rhombus angle
            tiles.push({ c, v, cls, rho: (size * sinA) / 2 });
          }
      }
    return { tiles, classes: Math.floor(n / 2) };
  }

  SP.generators.multigrid = {
    id: 'multigrid',
    name: 'Multigrid',
    board: true,
    schema: [
      { group: 'Grid' },
      { key: 'fold', label: 'Symmetry', type: 'select', def: '5', options: [['5', '5-fold (Penrose)'], ['6', '6-fold (rhombille)'], ['7', '7-fold'], ['8', '8-fold (Ammann–Beenker)'], ['9', '9-fold'], ['11', '11-fold'], ['12', '12-fold'], ['16', '16-fold']] },
      { key: 'size', label: 'Edge (mm)', min: 4, max: 60, step: 0.5, def: 11, rand: [8, 18] },
      { key: 'rotate', label: 'Rotate °', min: 0, max: 180, step: 0.5, def: 0, rand: [0, 180] },
      { key: 'shift', label: 'Grid offset', min: 0.02, max: 0.98, step: 0.01, def: 0.5, rand: [0.1, 0.9] },
      { key: 'scatter', label: 'Offset scatter', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.6] },
      { key: 'centreX', label: 'Centre X', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.4, 0.4] },
      { key: 'centreY', label: 'Centre Y', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.4, 0.4] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Tiles' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'tiles', options: [['tiles', 'Rounded tiles'], ['edges', 'Edge strapwork']] },
      { key: 'select', label: 'Keep', type: 'select', def: 'all', options: [['all', 'All rhombi'], ['fat', 'Fat only'], ['thin', 'Thin only'], ['alt', 'Alternate classes'], ['random', 'Seeded fraction']] },
      { key: 'fill', label: 'Fraction kept', min: 0.1, max: 1, step: 0.01, def: 0.6, rand: [0.35, 0.85] },
      { key: 'gap', label: 'Gap (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6, rand: [1, 3] },
      { key: 'round', label: 'Corner (mm)', min: 0, max: 10, step: 0.05, def: 1.2, rand: [0.4, 2.5] },
      { key: 'width', label: 'Band (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6, rand: [1, 2.8] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.25, rand: [0.1, 0.6] },
      { group: 'Board' },
      { key: 'outline', label: 'Outline', type: 'select', def: 'board', options: [['board', 'Board (inside margin)'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'edgeRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fieldShrink', label: 'Points → shrink tiles', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const fold = Math.max(5, parseInt(p.fold, 10) || 5);
      const n = familiesFor(fold);
      const size = Math.max(2, p.size);
      const mg = Math.max(0, p.margin);
      const rand = rng(p.seed * 2654435761 + 11);
      const gamma = [];
      for (let m = 0; m < n; m++) {
        let g = p.shift + p.scatter * (rand() - 0.5);
        g -= Math.floor(g);
        gamma.push(Math.min(0.98, Math.max(0.02, g)));
      }
      const ox = B.w / 2 + (p.centreX * B.w) / 2, oy = B.h / 2 + (p.centreY * B.h) / 2;
      // Cover every corner of the board from the (possibly off-centre) tiling origin.
      const R = Math.hypot(Math.max(ox, B.w - ox), Math.max(oy, B.h - oy)) + size;
      const { tiles, classes } = buildTiling(fold, size, p.rotate * D2R, gamma, ox, oy, R);

      // ---- Tile selection ----
      const keep = (t) => {
        if (p.select === 'fat') return t.cls === classes;
        if (p.select === 'thin') return t.cls === 1;
        if (p.select === 'alt') return t.cls % 2 === 1;
        return true;
      };
      const pick = rng(p.seed * 7919 + 101);
      // Tiles come out grouped by family pair; the seeded pick is per tile in a stable order.
      const chosen = tiles.filter((t) => keep(t) && (p.select !== 'random' || pick() < p.fill));

      // ---- Outline (clip) ----
      const cx = B.w / 2, cy = B.h / 2, hw = B.w / 2 - mg, hh = B.h / 2 - mg;
      const outline = p.outline === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - Math.min(hw, hh)
        : (x, y) => { const r = Math.min(p.edgeRound, hw, hh), qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };

      if (p.draw === 'edges') {
        // Strapwork: every distinct rhombus edge as one band; the field smooth-unions the vertices.
        const r = Math.max(MIN_HALF, p.width / 2);
        const out = { strokes: [], blobs: [], dots: [], k: p.fillet, count: 0 };
        const seen = new Set();
        const key = (a) => Math.round(a[0] * 50) + ',' + Math.round(a[1] * 50);
        for (const t of chosen) {
          for (let i = 0; i < 4; i++) {
            const a = t.v[i], b = t.v[(i + 1) % 4];
            const ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
            if (seen.has(k)) continue;
            seen.add(k);
            // Skip edges that lie entirely outside the outline (plus the band).
            if (outline(a[0], a[1]) > r + 1 && outline(b[0], b[1]) > r + 1 && outline((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) > r + 1) continue;
            out.strokes.push({ pts: [a, b], r: [r, r] });
          }
          out.count++;
        }
        if (p.outline === 'circle') {
          // Circular outline: keep only the part of each band inside the circle, ending a band radius short of it.
          const Rc = Math.min(hw, hh), trimmed = [];
          for (const s of out.strokes) {
            const [a, b] = s.pts;
            if (Math.hypot(a[0] - cx, a[1] - cy) <= Rc - r && Math.hypot(b[0] - cx, b[1] - cy) <= Rc - r) { trimmed.push(s); continue; }
            const N = 12;
            let run = [];
            for (let i = 0; i <= N; i++) {
              const t = i / N, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
              if (Math.hypot(x - cx, y - cy) <= Rc - r) run.push([x, y]);
              else if (run.length) { if (run.length > 1) trimmed.push({ pts: run, r: run.map(() => r) }); run = []; }
            }
            if (run.length > 1) trimmed.push({ pts: run, r: run.map(() => r) });
          }
          out.strokes = trimmed;
        } else out.clip = { x0: mg, y0: mg, x1: B.w - mg, y1: B.h - mg, k: 0.2 };
        return out;
      }

      // ---- Rounded tiles as one SDF ----
      const g = p.gap / 2;
      const items = [];
      for (const t of chosen) {
        const F = points.length && p.fieldShrink ? fieldAt(t.c[0], t.c[1]) : 0;
        const inset = g + Math.max(-t.rho * 0.5, p.fieldShrink * F * t.rho * 0.6);
        const rho = t.rho - inset; // inradius left after the gap
        if (rho < MIN_TILE) continue; // too thin to print: drop it rather than leave a speck
        if (outline(t.c[0], t.c[1]) > size + 1) continue;
        const rr = Math.min(p.round, rho); // corner radius can't exceed the remaining inradius
        const s = (rho - rr) / t.rho; // shrink factor for the hard core, rounded back out by rr
        if (s < 1e-4) { // the corner radius swallows the tile: it is just a disc of radius rr
          const [qx, qy] = t.c;
          items.push({ c: t.c, f: (x, y) => Math.hypot(x - qx, y - qy) - rr });
          continue;
        }
        const core = t.v.map((q) => [t.c[0] + (q[0] - t.c[0]) * s, t.c[1] + (q[1] - t.c[1]) * s]);
        const sdf = convexSDF(core);
        items.push({ c: t.c, f: (x, y) => sdf(x, y) - rr });
      }
      // Spatial bins (cell = edge length; every tile lies within one edge length of its centre).
      const bs = size, x0 = -size * 2, y0 = -size * 2;
      const nbx = Math.ceil((B.w + 4 * size) / bs) + 1;
      const bins = new Map();
      items.forEach((it, i) => { const k = Math.floor((it.c[0] - x0) / bs) + nbx * Math.floor((it.c[1] - y0) / bs); (bins.get(k) || bins.set(k, []).get(k)).push(i); });
      const kr = Math.max(0.2, Math.min(p.edgeRound, 4) * 0.25);
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        const bi = Math.floor((x - x0) / bs), bj = Math.floor((y - y0) / bs);
        let f = size;
        for (let j = bj - 1; j <= bj + 1; j++)
          for (let i = bi - 1; i <= bi + 1; i++) {
            const L = bins.get(i + nbx * j);
            if (!L) continue;
            for (const k of L) { const v = items[k].f(x, y); if (v < f) f = v; }
          }
        return smax(f, o, kr);
      };
      return { evalFn, domain: { x0: mg - 3, y0: mg - 3, x1: B.w - mg + 3, y1: B.h - mg + 3 }, count: items.length };
    },
  };
})();
