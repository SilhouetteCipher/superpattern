// Tile Grid: one shape per grid cell (rounded box, bar, circle or polygon) whose rotation, scale,
// width (squash) and skew are driven by linear gradients, quantised random angles and field points.
// Shape Tiles: each cell holds a random rounded primitive — square, quarter-circle, half-circle,
// triangle, circle or leaf — rotated in 90° steps, with optional double-size tiles.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  const box = (x, y, hw, hh, r) => {
    r = Math.min(r, hw, hh);
    const qx = Math.abs(x) - hw + r, qy = Math.abs(y) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  // Grid geometry shared by both generators: cells fill the board inside the margin.
  function grid(p, B, T) {
    const C = Math.max(1, Math.round(p.cols));
    let R = Math.max(1, Math.round(p.rows));
    const pitch = Math.min((B.w - 2 * p.margin) / C, (B.h - 2 * p.margin) / R);
    if (T) {
      // Seamless: cells span the tile exactly; px/py may differ very slightly so both axes repeat.
      const px = T.x ? B.w / C : pitch;
      if (T.y) R = Math.max(1, Math.round(B.h / px));
      const py = T.y ? B.h / R : px;
      return { C, R, pitch: Math.min(px, py), px, py, x0: T.x ? 0 : B.w / 2 - (C * px) / 2, y0: T.y ? 0 : B.h / 2 - (R * py) / 2 };
    }
    return { C, R, pitch, px: pitch, py: pitch, x0: B.w / 2 - (C * pitch) / 2, y0: B.h / 2 - (R * pitch) / 2 };
  }
  // Evaluate min over the tiles registered in the 3×3 cells around a point.
  function lookup(g, tiles, reachCells = 1) {
    const cells = new Map();
    tiles.forEach((t, n) => {
      for (const [i, j] of t.cells) { const k = j * g.C + i; (cells.get(k) || cells.set(k, []).get(k)).push(n); }
    });
    return (x, y, far) => {
      const i = Math.floor((x - g.x0) / g.px), j = Math.floor((y - g.y0) / g.py);
      let f = far;
      for (let jj = j - reachCells; jj <= j + reachCells; jj++)
        for (let ii = i - reachCells; ii <= i + reachCells; ii++) {
          if (ii < 0 || jj < 0 || ii >= g.C || jj >= g.R) continue;
          const L = cells.get(jj * g.C + ii);
          if (L) for (const n of L) { const v = tiles[n].sdf(x, y); if (v < f) f = v; }
        }
      return f;
    };
  }

  SP.generators.tilegrid = {
    id: 'tilegrid',
    name: 'Tile Grid',
    board: true,
    tileable: true,
    schema: [
      { group: 'Grid' },
      { key: 'cols', label: 'Columns', min: 1, max: 60, step: 1, def: 12, int: true, rand: [5, 16] },
      { key: 'rows', label: 'Rows', min: 1, max: 60, step: 1, def: 12, int: true, rand: [5, 16] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 14 },
      { group: 'Shape' },
      { key: 'shape', label: 'Shape', type: 'select', def: 'box', options: [['box', 'Rounded box'], ['bar', 'Bar'], ['circle', 'Circle'], ['poly', 'Polygon']] },
      { key: 'sides', label: 'Sides', min: 3, max: 10, step: 1, def: 6, int: true, show: (o) => o.shape === 'poly' },
      { key: 'size', label: 'Size (× cell)', min: 0.05, max: 1.4, step: 0.01, def: 0.72, rand: [0.5, 0.85] },
      { key: 'aspect', label: 'Aspect (w / h)', min: 0.05, max: 1, step: 0.01, def: 1, show: (o) => o.shape !== 'circle' },
      { key: 'round', label: 'Corner radius (× size)', min: 0, max: 0.5, step: 0.005, def: 0.06 },
      { group: 'Rotation' },
      { key: 'rot', label: 'Base rotation °', min: -180, max: 180, step: 0.5, def: 0 },
      { key: 'rotGrad', label: 'Rotation gradient °', min: -360, max: 360, step: 1, def: 45, rand: [-90, 90] },
      { key: 'rotAngle', label: 'Rotation gradient dir °', min: -180, max: 180, step: 1, def: 0 },
      { key: 'rotRandom', label: 'Random rotation °', min: 0, max: 180, step: 1, def: 0, rand: [0, 180] },
      { key: 'rotStep', label: 'Snap random to °', min: 0, max: 90, step: 1, def: 0 },
      { group: 'Squash & skew' },
      { key: 'scaleGrad', label: 'Scale gradient', min: -2, max: 2, step: 0.01, def: 0 },
      { key: 'scaleAngle', label: 'Scale gradient dir °', min: -180, max: 180, step: 1, def: 0 },
      { key: 'squash', label: 'Width gradient', min: -3, max: 3, step: 0.01, def: 0 },
      { key: 'squashAngle', label: 'Width gradient dir °', min: -180, max: 180, step: 1, def: 0 },
      { key: 'skew', label: 'Skew gradient', min: -4, max: 4, step: 0.01, def: 0 },
      { key: 'skewAngle', label: 'Skew gradient dir °', min: -180, max: 180, step: 1, def: 90 },
      { key: 'skewCross', label: 'Keep centre cross straight', type: 'bool', def: false },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 1, int: true, rand: [1, 9999] },
      { group: 'Field points' },
      { key: 'fieldRot', label: 'Points → rotation °', min: -180, max: 180, step: 1, def: 45 },
      { key: 'fieldScale', label: 'Points → scale', min: -1, max: 1, step: 0.01, def: 0 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const T = ctx.tile;
      const g = grid(p, B, T);
      const rand = rng(p.seed * 69069 + 5);
      const G = (x, y, deg) => SP.gradCoord(x, y, deg, B.w / 2, B.h / 2, g.C * g.px, g.R * g.py, T);
      const tiles = [];
      for (let j = 0; j < g.R; j++)
        for (let i = 0; i < g.C; i++) {
          const cx = g.x0 + (i + 0.5) * g.px, cy = g.y0 + (j + 0.5) * g.py;
          const F = points.length ? fieldAt(cx, cy) : 0;
          let rr = p.rotRandom ? (rand() - 0.5) * 2 * p.rotRandom : 0;
          if (p.rotStep > 0) rr = Math.round(rr / p.rotStep) * p.rotStep;
          const th = (p.rot + p.rotGrad * (G(cx, cy, p.rotAngle) + 0.5) + rr + p.fieldRot * F) * D2R;
          const sc = Math.max(0.02, 1 + p.scaleGrad * G(cx, cy, p.scaleAngle) + p.fieldScale * F);
          const wf = Math.min(1, Math.max(0.03, 1 + p.squash * G(cx, cy, p.squashAngle)));
          // Cross mode: skew vanishes along both centre lines (a clean "+" of square tiles).
          const k = p.skew * G(cx, cy, p.skewAngle) * (p.skewCross ? Math.min(1, 2.2 * Math.abs(G(cx, cy, p.skewAngle + 90))) : 1);
          const S = g.pitch * p.size * sc;
          const hh = S / 2, hw = (S / 2) * (p.shape === 'circle' ? 1 : p.shape === 'bar' ? Math.min(1, p.aspect) : p.aspect) * wf;
          const r = (p.shape === 'circle' ? 0.5 : p.round) * S;
          const ca = Math.cos(th), sa = Math.sin(th), lip = Math.sqrt(1 + k * k);
          const poly = p.shape === 'poly' ? SP.polySDF(Math.round(p.sides), hh, Math.PI / 2, r) : null;
          const sdf = (x, y) => {
            const dx = x - cx, dy = y - cy;
            let u = ca * dx + sa * dy, v = -sa * dx + ca * dy; // rotate into the tile frame
            u -= k * v; // skew
            if (poly) return poly(u / (hw / hh || 1), -v) * Math.min(1, hw / hh) / lip;
            if (p.shape === 'bar') return box(u, v, hw, hh, Math.min(r, hw)) / lip;
            if (p.shape === 'circle') return (Math.hypot(u / (wf || 1), v) - hh) * Math.min(1, wf) / lip;
            return box(u, v, hw, hh, r) / lip;
          };
          const reach = Math.ceil((Math.hypot(hw, hh) * (1 + Math.abs(k))) / g.pitch - 0.5);
          const cells = [];
          for (let jj = j - reach; jj <= j + reach; jj++) for (let ii = i - reach; ii <= i + reach; ii++) if (ii >= 0 && jj >= 0 && ii < g.C && jj < g.R) cells.push([ii, jj]);
          tiles.push({ sdf, cells });
        }
      const find = lookup(g, tiles, 0);
      const far = g.pitch;
      return { evalFn: (x, y) => find(x, y, far), domain: { x0: g.x0 - 2, y0: g.y0 - 2, x1: g.x0 + g.C * g.px + 2, y1: g.y0 + g.R * g.py + 2 }, count: tiles.length };
    },
  };

  const KINDS = ['square', 'quarter', 'half', 'triangle', 'circle', 'leaf'];
  SP.generators.shapetiles = {
    id: 'shapetiles',
    name: 'Shape Tiles',
    board: true,
    tileable: true,
    schema: [
      { group: 'Grid' },
      { key: 'cols', label: 'Columns', min: 1, max: 40, step: 1, def: 5, int: true, rand: [3, 8] },
      { key: 'rows', label: 'Rows', min: 1, max: 40, step: 1, def: 4, int: true, rand: [3, 8] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 10 },
      { key: 'gap', label: 'Gap (mm)', min: 0, max: 20, step: 0.1, def: 2.4, rand: [1, 4] },
      { key: 'bigProb', label: 'Double-size tiles', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0, 0.4] },
      { group: 'Shape mix' },
      ...KINDS.map((k, n) => ({ key: 'w_' + k, label: k[0].toUpperCase() + k.slice(1), min: 0, max: 5, step: 0.1, def: [1, 2, 1, 1.5, 0.5, 1][n], rand: [0, 3] })),
      { key: 'round', label: 'Soft corners (mm)', min: 0, max: 12, step: 0.05, def: 2.2 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 29, int: true, rand: [1, 9999] },
    ],

    generateBoard(p, ctx) {
      const { board: B } = ctx;
      const T = ctx.tile;
      const g = grid(p, B, T);
      const rand = rng(p.seed * 40503 + 17);
      const weights = KINDS.map((k) => Math.max(0, p['w_' + k]));
      const wsum = weights.reduce((a, b) => a + b, 0) || 1;
      const pick = () => { let r = rand() * wsum; for (let n = 0; n < KINDS.length; n++) { r -= weights[n]; if (r <= 0) return KINDS[n]; } return 'square'; };
      const used = new Uint8Array(g.C * g.R), tiles = [];
      const kr = p.round;
      for (let j = 0; j < g.R; j++)
        for (let i = 0; i < g.C; i++) {
          if (used[j * g.C + i]) continue;
          let n = 1;
          // (in a seamless tile, double tiles can't straddle the seam)
          if (i + 1 < g.C && j + 1 < g.R && !used[j * g.C + i + 1] && !used[(j + 1) * g.C + i] && !used[(j + 1) * g.C + i + 1] && rand() < p.bigProb) n = 2;
          const cells = [];
          for (let jj = j; jj < j + n; jj++) for (let ii = i; ii < i + n; ii++) { used[jj * g.C + ii] = 1; cells.push([ii, jj]); }
          const s = n * g.pitch - p.gap, h = s / 2;
          const cx = g.x0 + (i + n / 2) * g.px, cy = g.y0 + (j + n / 2) * g.py;
          const kind = pick(), q = Math.floor(rand() * 4) * (Math.PI / 2), ca = Math.cos(q), sa = Math.sin(q);
          const sdf = (x, y) => {
            const dx = x - cx, dy = y - cy, u = ca * dx + sa * dy, v = -sa * dx + ca * dy;
            const b = box(u, v, h, h, kr);
            switch (kind) {
              case 'quarter': return smax(b, Math.hypot(u + h, v + h) - s, kr);            // corner-centred quarter disc
              case 'half': return smax(b, Math.hypot(u, v + h) - h, kr);                    // semicircle on one edge
              case 'triangle': return smax(b, (u + v) / Math.SQRT2, kr);                     // half square on the diagonal
              case 'circle': return Math.hypot(u, v) - h;
              case 'leaf': return smax(Math.hypot(u + h, v + h) - s, Math.hypot(u - h, v - h) - s, kr); // lens between opposite corners
              default: return b;
            }
          };
          tiles.push({ sdf, cells });
        }
      const find = lookup(g, tiles, 1);
      return { evalFn: (x, y) => find(x, y, g.pitch), domain: { x0: g.x0 - 2, y0: g.y0 - 2, x1: g.x0 + g.C * g.px + 2, y1: g.y0 + g.R * g.py + 2 }, count: tiles.length };
    },
  };
})();
