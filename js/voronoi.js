// Voronoi: rounded cells separated by even gaps, inside a rounded square / circle.
// Seeds: dart throwing with a spacing that shrinks toward the centre and near field points,
// then a few Lloyd-style relaxation passes. Cell SDF = soft-min of bisector-plane distances
// (soft-min rounds the corners), minus half the gap, clipped by the outline.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  let cache = { key: null, seeds: null };

  // Seamless tile: seeds live on a torus the size of the board (wrapped spacing test), then every seed
  // is copied one tile over in each direction so cells continue across the seams. Density comes from
  // cell size and (periodic) field points; the centred density options don't apply to a repeat.
  let tcache = { key: null };
  function tileVoronoi(p, ctx) {
    const { board: B, fieldAt, points } = ctx;
    const W = B.w, Hh = B.h;
    const spacing = (x, y) => Math.max(1, p.cell * (points.length && p.fieldGain ? Math.max(0.15, 1 - p.fieldGain * fieldAt(x, y)) : 1));
    const key = JSON.stringify([p.cell, p.seed, p.fieldGain, W, Hh, p.fieldGain ? points : 0]);
    if (tcache.key !== key) {
      const rand = rng(p.seed * 2654435761);
      const cand = [];
      for (let t = 0; t < 40000; t++) { const x = rand() * W, y = rand() * Hh; cand.push([x, y, spacing(x, y)]); }
      cand.sort((a, b) => a[2] - b[2]);
      const ngx = Math.max(1, Math.floor(W / p.cell)), ngy = Math.max(1, Math.floor(Hh / p.cell)), gsx = W / ngx, gsy = Hh / ngy;
      const grid = new Map(), seeds = [];
      const wrapD = (d, P) => d - P * Math.round(d / P);
      for (const c of cand) {
        if (seeds.length >= 3000) break;
        const gi = Math.floor(c[0] / gsx), gj = Math.floor(c[1] / gsy);
        let ok = true;
        for (let j = gj - 1; j <= gj + 1 && ok; j++)
          for (let i = gi - 1; i <= gi + 1 && ok; i++) {
            const L = grid.get(((i % ngx) + ngx) % ngx + ',' + (((j % ngy) + ngy) % ngy));
            if (L) for (const q of L) { const m = 0.5 * (c[2] + q[2]); if (wrapD(q[0] - c[0], W) ** 2 + wrapD(q[1] - c[1], Hh) ** 2 < m * m * 0.8) { ok = false; break; } }
          }
        if (ok) { seeds.push(c); const k = gi + ',' + gj; (grid.get(k) || grid.set(k, []).get(k)).push(c); }
      }
      // Periodic copies (3×3), then neighbour lists and bins over the extended set.
      const all = [];
      for (const sy of [-1, 0, 1]) for (const sx of [-1, 0, 1]) for (const q of seeds) all.push([q[0] + sx * W, q[1] + sy * Hh, q[2]]);
      const bs = p.cell * 0.75, bins = new Map(), bk = (x, y) => Math.floor(x / bs) + ',' + Math.floor(y / bs);
      all.forEach((q, i) => { const k = bk(q[0], q[1]); (bins.get(k) || bins.set(k, []).get(k)).push(i); });
      const reach = Math.ceil((2.6 * p.cell) / bs);
      const nb = all.map((q, i) => {
        const out = [], bi = Math.floor(q[0] / bs), bj = Math.floor(q[1] / bs);
        for (let j = bj - reach; j <= bj + reach; j++) for (let k = bi - reach; k <= bi + reach; k++) {
          const L = bins.get(k + ',' + j); if (!L) continue;
          for (const jj of L) if (jj !== i && Math.hypot(all[jj][0] - q[0], all[jj][1] - q[1]) < 2.6 * Math.max(q[2], all[jj][2])) out.push(jj);
        }
        return out;
      });
      tcache = { key, all, nb, bins, bs, count: seeds.length };
    }
    const { all, nb, bins, bs } = tcache;
    const nearest = (x, y) => {
      const bi = Math.floor(x / bs), bj = Math.floor(y / bs);
      let best = -1, bd = Infinity;
      for (let r = 1; r <= 4 && (best < 0 || r <= 2); r++)
        for (let j = bj - r; j <= bj + r; j++) for (let i = bi - r; i <= bi + r; i++) {
          const L = bins.get(i + ',' + j); if (!L) continue;
          for (const k of L) { const d = (all[k][0] - x) ** 2 + (all[k][1] - y) ** 2; if (d < bd) { bd = d; best = k; } }
        }
      return best;
    };
    const g = p.gap / 2;
    const evalFn = (x, y) => {
      const i = nearest(x, y);
      if (i < 0) return p.cell;
      const s = all[i], ds = (s[0] - x) ** 2 + (s[1] - y) ** 2, kr = Math.min(p.round, s[2] * 0.3);
      let e = 1e9;
      for (const j of nb[i]) { const q = all[j], L = Math.hypot(q[0] - s[0], q[1] - s[1]); e = smin(e, ((q[0] - x) ** 2 + (q[1] - y) ** 2 - ds) / (2 * L), kr); }
      return g - e;
    };
    return { evalFn, domain: { x0: -2, y0: -2, x1: W + 2, y1: Hh + 2 }, count: tcache.count };
  }

  SP.generators.voronoi = {
    id: 'voronoi',
    name: 'Voronoi',
    board: true,
    tileable: true,
    schema: [
      { group: 'Outline' },
      { key: 'shape', label: 'Outline', type: 'select', def: 'square', options: [['square', 'Rounded square'], ['circle', 'Circle']] },
      { key: 'size', label: 'Size (mm)', min: 10, max: 400, step: 0.5, def: 160 },
      { key: 'outerRound', label: 'Outline corner (mm)', min: 0, max: 80, step: 0.5, def: 12 },
      { group: 'Cells' },
      { key: 'cell', label: 'Cell size (mm)', min: 3, max: 150, step: 0.5, def: 44, rand: [20, 60] },
      { key: 'centre', label: 'Smaller at centre', min: -1, max: 0.95, step: 0.01, def: 0.55, rand: [0, 0.8] },
      { key: 'focus', label: 'Density focus', min: 0.3, max: 8, step: 0.05, def: 1 },
      { key: 'centreX', label: 'Density centre X', min: -1, max: 1, step: 0.01, def: -0.1 },
      { key: 'centreY', label: 'Density centre Y', min: -1, max: 1, step: 0.01, def: 0.05 },
      { key: 'relax', label: 'Relax passes', min: 0, max: 10, step: 1, def: 2, int: true },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 3, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'gap', label: 'Gap (mm)', min: 0.1, max: 20, step: 0.05, def: 3.2, rand: [1.5, 5] },
      { key: 'gapGrow', label: 'Gap growth at centre', min: 0, max: 5, step: 0.01, def: 0 },
      { key: 'round', label: 'Cell roundness (mm)', min: 0, max: 30, step: 0.1, def: 6, rand: [2, 10] },
      { key: 'fieldGain', label: 'Field points → denser', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      if (ctx.tile) return tileVoronoi(p, ctx);
      const { board: B, fieldAt, points } = ctx;
      const cx = B.w / 2, cy = B.h / 2, H = p.size / 2;
      const outline = p.shape === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - H
        : (x, y) => { const r = Math.min(p.outerRound, H), qx = Math.abs(x - cx) - H + r, qy = Math.abs(y - cy) - H + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
      const spacing = (x, y) => {
        const dx = (x - cx) / H - p.centreX, dy = (y - cy) / H + p.centreY;
        const rr = Math.min(1, Math.hypot(dx, dy) / 1.2);
        let s = p.cell * (1 - p.centre * Math.pow(1 - rr, p.focus));
        if (points.length && p.fieldGain) s *= Math.max(0.15, 1 - p.fieldGain * fieldAt(x, y));
        return Math.max(1, s);
      };
      const key = JSON.stringify([p.shape, p.size, p.outerRound, p.cell, p.centre, p.focus, p.centreX, p.centreY, p.relax, p.seed, p.fieldGain, B.w, B.h, p.fieldGain ? points : 0]);
      if (cache.key !== key) {
        // Dart throwing, spacing-aware.
        const rand = rng(p.seed * 2654435761);
        const seeds = [];
        const pad = p.cell * 0.4;
        // Candidates sorted small-spacing first, so dense regions fill before big cells claim space.
        const cand = [];
        for (let t = 0; t < 40000; t++) {
          const x = cx - H - pad + rand() * (2 * H + 2 * pad), y = cy - H - pad + rand() * (2 * H + 2 * pad);
          if (outline(x, y) > pad) continue;
          cand.push([x, y, spacing(x, y)]);
        }
        cand.sort((a, b) => a[2] - b[2]);
        // Acceptance test via a coarse grid of accepted seeds (radius ≤ max spacing).
        const gs = Math.max(2, p.cell), grid = new Map();
        const gk = (x, y) => Math.floor(x / gs) + ',' + Math.floor(y / gs);
        for (const c of cand) {
          if (seeds.length >= 3000) break;
          let ok = true;
          const gx = Math.floor(c[0] / gs), gy = Math.floor(c[1] / gs);
          for (let j = gy - 1; j <= gy + 1 && ok; j++)
            for (let i = gx - 1; i <= gx + 1 && ok; i++) {
              const L = grid.get(i + ',' + j);
              if (L) for (const q of L) { const m = 0.5 * (c[2] + q[2]); if ((q[0] - c[0]) ** 2 + (q[1] - c[1]) ** 2 < m * m * 0.8) { ok = false; break; } }
            }
          if (ok) { seeds.push(c); const key = gk(c[0], c[1]); (grid.get(key) || grid.set(key, []).get(key)).push(c); }
        }
        // Lloyd-ish relaxation: move each seed toward the centroid of samples it owns.
        // (sample count capped, and skipped for very dense seedings, so small cell sizes stay responsive)
        for (let it = 0; it < (seeds.length > 400 ? 0 : p.relax); it++) {
          const acc = seeds.map(() => [0, 0, 0]);
          const st = Math.max(p.cell / 10, Math.sqrt((4 * H * H) / 30000));
          for (let y = cy - H; y <= cy + H; y += st)
            for (let x = cx - H; x <= cx + H; x += st) {
              if (outline(x, y) > 0) continue;
              let bi = 0, bd = Infinity;
              for (let i = 0; i < seeds.length; i++) { const d = ((seeds[i][0] - x) ** 2 + (seeds[i][1] - y) ** 2) / (seeds[i][2] * seeds[i][2]); if (d < bd) { bd = d; bi = i; } }
              acc[bi][0] += x; acc[bi][1] += y; acc[bi][2]++;
            }
          seeds.forEach((s, i) => { if (acc[i][2]) { s[0] = acc[i][0] / acc[i][2]; s[1] = acc[i][1] / acc[i][2]; } });
        }
        // Neighbour lists (generous radius so every bisector that can bound the cell is present).
        const idx = new Map();
        seeds.forEach((q, j) => { const key = gk(q[0], q[1]); (idx.get(key) || idx.set(key, []).get(key)).push(j); });
        const reachCells = 3; // 2.6 × spacing ≤ 3 grid cells since spacing ≤ cell
        const nb = seeds.map((s, i) => {
          const out = [];
          const gx = Math.floor(s[0] / gs), gy = Math.floor(s[1] / gs);
          for (let j = gy - reachCells; j <= gy + reachCells; j++)
            for (let k = gx - reachCells; k <= gx + reachCells; k++) {
              const L = idx.get(k + ',' + j);
              if (L) for (const jj of L) { const q = seeds[jj]; if (jj !== i && Math.hypot(q[0] - s[0], q[1] - s[1]) < 2.6 * Math.max(s[2], q[2])) out.push(jj); }
            }
          return out;
        });
        cache = { key, seeds, nb };
      }
      const { seeds, nb } = cache;
      // Spatial bins for nearest-seed lookup.
      const bs = p.cell * 0.75, x0 = cx - H - p.cell, y0 = cy - H - p.cell;
      const nbx = Math.ceil((2 * H + 2 * p.cell) / bs) + 1;
      const bins = new Map();
      seeds.forEach((s, i) => { const k = Math.floor((s[0] - x0) / bs) + nbx * Math.floor((s[1] - y0) / bs); (bins.get(k) || bins.set(k, []).get(k)).push(i); });
      const nearest = (x, y) => {
        const bi = Math.floor((x - x0) / bs), bj = Math.floor((y - y0) / bs);
        let best = -1, bd = Infinity;
        for (let r = 1; r <= 4 && (best < 0 || r <= 2); r++) {
          for (let j = bj - r; j <= bj + r; j++) for (let i = bi - r; i <= bi + r; i++) {
            const L = bins.get(i + nbx * j); if (!L) continue;
            for (const s of L) { const d = (seeds[s][0] - x) ** 2 + (seeds[s][1] - y) ** 2; if (d < bd) { bd = d; best = s; } }
          }
        }
        return best;
      };
      const g = p.gap / 2, kr0 = p.round;
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        const i = nearest(x, y);
        if (i < 0) return o;
        const s = seeds[i];
        const ds = (s[0] - x) ** 2 + (s[1] - y) ** 2;
        let e = 1e9;
        const kr = Math.min(kr0, s[2] * 0.3); // rounding scales down for small cells
        for (const j of nb[i]) {
          const q = seeds[j], L = Math.hypot(q[0] - s[0], q[1] - s[1]);
          const d = ((q[0] - x) ** 2 + (q[1] - y) ** 2 - ds) / (2 * L); // distance to bisector (≥ 0 inside)
          e = smin(e, d, kr);
        }
        let gl = g;
        if (p.gapGrow) {
          const dx = (x - cx) / H - p.centreX, dy = (y - cy) / H + p.centreY;
          gl *= 1 + p.gapGrow * Math.pow(1 - Math.min(1, Math.hypot(dx, dy) / 1.2), p.focus * 2);
        }
        return smax(gl - e, o, kr0 * 0.5 + 0.2);
      };
      return { evalFn, domain: { x0: cx - H - 3, y0: cy - H - 3, x1: cx + H + 3, y1: cy + H + 3 }, count: seeds.length };
    },
  };
})();
