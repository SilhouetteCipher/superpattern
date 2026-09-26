// Capsule Grid: one rounded capsule per grid cell that morphs between two states — e.g. thin vertical
// dashes and wide horizontal pills — driven by a level from a linear gradient, field points and jitter.
// Wide states overlap their neighbours and merge into long bars; "band" profile puts state A in the
// middle of the level range with B on both sides (dashes ringed by bars).
(function () {
  const SP = (window.SP = window.SP || {});
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };

  SP.generators.capsules = {
    id: 'capsules',
    name: 'Capsule Grid',
    board: true,
    tileable: true,
    schema: [
      { group: 'Grid' },
      { key: 'cols', label: 'Columns', min: 1, max: 80, step: 1, def: 16, int: true, rand: [8, 24] },
      { key: 'rows', label: 'Rows', min: 1, max: 80, step: 1, def: 18, int: true, rand: [8, 24] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'stagger', label: 'Column stagger', min: 0, max: 1, step: 0.01, def: 0 },
      { group: 'Level' },
      { key: 'base', label: 'Base level', min: -2, max: 2, step: 0.01, def: 0 },
      { key: 'gradAmt', label: 'Gradient amount', min: -3, max: 3, step: 0.01, def: 0, rand: [-1.2, 1.2] },
      { key: 'gradAngle', label: 'Gradient dir °', min: -180, max: 180, step: 1, def: 90, rand: [-180, 180] },
      { key: 'fieldGain', label: 'Field points gain', min: -3, max: 3, step: 0.01, def: 1 },
      { key: 'jitter', label: 'Jitter', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.3] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { key: 'profile', label: 'Profile', type: 'select', def: 'band', options: [['ramp', 'Ramp (A → B)'], ['band', 'Band (B · A · B)']] },
      { key: 'bandCentre', label: 'Band centre', min: -1, max: 2, step: 0.01, def: 0.5, show: (o) => o.profile === 'band' },
      { key: 't0', label: 'Transition start', min: 0, max: 2, step: 0.01, def: 0.1 },
      { key: 't1', label: 'Transition end', min: 0, max: 2, step: 0.01, def: 0.35 },
      { group: 'State A (× cell)' },
      { key: 'wA', label: 'Width', min: 0.02, max: 2.5, step: 0.01, def: 0.28, rand: [0.15, 0.5] },
      { key: 'hA', label: 'Height', min: 0.02, max: 2.5, step: 0.01, def: 0.78, rand: [0.5, 1] },
      { group: 'State B (× cell)' },
      { key: 'wB', label: 'Width', min: 0.02, max: 2.5, step: 0.01, def: 1.25, rand: [0.8, 1.6] },
      { key: 'hB', label: 'Height', min: 0.02, max: 2.5, step: 0.01, def: 0.72, rand: [0.5, 1] },
      { group: 'State C — above the band (× cell)', show: (o) => o.profile === 'band' },
      { key: 'wC', label: 'Width', min: 0.02, max: 2.5, step: 0.01, def: 1.25, rand: [0.8, 1.6], show: (o) => o.profile === 'band' },
      { key: 'hC', label: 'Height', min: 0.02, max: 2.5, step: 0.01, def: 0.72, rand: [0.5, 1], show: (o) => o.profile === 'band' },
      { group: 'Finish' },
      { key: 'drip', label: 'Transition drip (× cell)', min: 0, max: 2, step: 0.01, def: 0, rand: [0, 0.8] },
      { key: 'round', label: 'Roundness', min: 0, max: 1, step: 0.01, def: 1 },
      { key: 'merge', label: 'Merge (mm)', min: 0, max: 6, step: 0.05, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const T = ctx.tile;
      const C = Math.max(1, Math.round(p.cols)), R = Math.max(1, Math.round(p.rows));
      const px = T && T.x ? B.w / C : (B.w - 2 * p.margin) / C;
      const py = T && T.y ? B.h / R : (B.h - 2 * p.margin) / R;
      const x0 = T && T.x ? 0 : p.margin, y0 = T && T.y ? 0 : p.margin;
      const rand = rng(p.seed * 7919 + 3);
      const cells = new Array(C * R);
      let maxW = 0, maxH = 0;
      for (let i = 0; i < C; i++)
        for (let j = 0; j < R; j++) {
          const off = i & 1 ? p.stagger * py : 0;
          const cx = x0 + (i + 0.5) * px, cy = y0 + (j + 0.5) * py + off;
          const g = SP.gradCoord(cx, cy, p.gradAngle, B.w / 2, B.h / 2, C * px, R * py, T);
          const v = p.base + p.gradAmt * g + (points.length ? p.fieldGain * fieldAt(cx, cy) : 0) + p.jitter * (rand() - 0.5);
          const band = p.profile === 'band';
          const u = band ? sstep(p.t0, p.t1, Math.abs(v - p.bandCentre)) : sstep(p.t0, p.t1, v);
          const up = band && v > p.bandCentre; // above the band: state C
          const wX = up ? p.wC : p.wB, hX = up ? p.hC : p.hB;
          // Drips: dashes stretch vertically early in the transition, before they widen into bars.
          const uw = p.drip ? sstep(0.45, 1, u) : u, dr = p.drip * Math.sin(Math.PI * Math.min(1, u / 0.6));
          const hw = ((p.wA + (wX - p.wA) * uw) * px) / 2, hh = ((p.hA + (hX - p.hA) * u + dr) * py) / 2;
          maxW = Math.max(maxW, hw); maxH = Math.max(maxH, hh);
          cells[i * R + j] = { cx, cy, hw, hh, r: Math.min(hw, hh) * p.round };
        }
      const k = p.merge;
      const rx = Math.ceil((maxW + k) / px) + 1, ry = Math.ceil((maxH + k) / py) + 1;
      const box = (c, x, y) => {
        const qx = Math.abs(x - c.cx) - c.hw + c.r, qy = Math.abs(y - c.cy) - c.hh + c.r;
        return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - c.r;
      };
      const evalFn = (x, y) => {
        const ci = Math.floor((x - x0) / px);
        let f = 1e9;
        for (let i = ci - rx; i <= ci + rx; i++) {
          let ii = i;
          if (T && T.x) ii = ((i % C) + C) % C; else if (i < 0 || i >= C) continue;
          const sx = (i - ii) * px; // periodic copy offset
          const off = ii & 1 ? p.stagger * py : 0;
          const cj = Math.floor((y - y0 - off) / py);
          for (let j = cj - ry; j <= cj + ry; j++) {
            let jj = j;
            if (T && T.y) jj = ((j % R) + R) % R; else if (j < 0 || j >= R) continue;
            const c = cells[ii * R + jj];
            f = smin(f, box(c, x - sx, y - (j - jj) * py), k);
          }
        }
        return f;
      };
      const pad = maxW + maxH + 2;
      return { evalFn, domain: { x0: x0 - pad, y0: y0 - pad, x1: x0 + C * px + pad, y1: y0 + R * py + pad }, count: C * R };
    },
  };
})();
