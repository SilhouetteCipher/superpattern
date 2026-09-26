// Op Art: stripes inside cell shapes with optical distortions.
//   base: parallel (along a direction) or concentric (around a focus)
//   lens: sphere mapping compresses stripes toward the rim (reads as a 3D ball)
//   waves: sinusoidal displacement across the stripes; swirl: twist that fades toward the rim
//   warp: smooth noise displacement (shared noise with Marble)
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  function smax(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  let cache = { key: null, G: 1 };

  SP.generators.opart = {
    id: 'opart',
    name: 'Op Art',
    board: true,
    tileable: true,
    schema: [
      { group: 'Shape' },
      { key: 'shape', label: 'Shape', type: 'select', def: 'circle', options: [['circle', 'Circle'], ['hex', 'Hexagon'], ['square', 'Rounded square'], ['board', 'Whole board']], randomize: false },
      { key: 'cellsX', label: 'Cells across', min: 1, max: 8, step: 1, def: 1, int: true },
      { key: 'cellsY', label: 'Cells down', min: 1, max: 8, step: 1, def: 1, int: true },
      { key: 'cellSize', label: 'Cell size (mm)', min: 10, max: 400, step: 0.5, def: 160 },
      { key: 'cellGap', label: 'Cell gap (mm)', min: 0, max: 60, step: 0.5, def: 12 },
      { key: 'margin', label: 'Board margin', min: 0, max: 40, step: 0.5, def: 10 },
      { key: 'edgeRound', label: 'Edge roundness (mm)', min: 0.02, max: 6, step: 0.01, def: 0.2 },
      { group: 'Stripes' },
      { key: 'mode', label: 'Stripes', type: 'select', def: 'parallel', options: [['parallel', 'Parallel'], ['concentric', 'Concentric']] },
      { key: 'spacing', label: 'Stripe spacing (mm)', min: 1, max: 60, step: 0.1, def: 10, rand: [6, 16] },
      { key: 'angle', label: 'Direction °', min: -180, max: 180, step: 1, def: 0, rand: [-90, 90] },
      { key: 'focusX', label: 'Focus X', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'focusY', label: 'Focus Y', min: -1, max: 1, step: 0.01, def: 0 },
      { key: 'duty', label: 'Stripe thickness', min: 0.05, max: 0.95, step: 0.01, def: 0.5, rand: [0.4, 0.6] },
      { group: 'Distortion' },
      { key: 'lens', label: 'Sphere lens', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.9] },
      { key: 'waveAmp', label: 'Wave amplitude (mm)', min: 0, max: 40, step: 0.1, def: 0, rand: [0, 10] },
      { key: 'waveLen', label: 'Wave length (mm)', min: 5, max: 400, step: 1, def: 80, rand: [40, 140] },
      { key: 'swirl', label: 'Swirl °', min: -720, max: 720, step: 1, def: 0, rand: [-200, 200] },
      { key: 'warp', label: 'Noise warp (mm)', min: 0, max: 80, step: 0.5, def: 0, rand: [0, 30] },
      { key: 'warpScale', label: 'Noise scale (mm)', min: 10, max: 400, step: 1, def: 120, rand: [70, 200] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 5, int: true, rand: [1, 9999] },
      { group: 'Field points' },
      { key: 'fieldThick', label: 'Points → thickness', min: -1, max: 1, step: 0.01, def: 0.3 },
      { key: 'fieldSwirl', label: 'Points → swirl °', min: -720, max: 720, step: 1, def: 0 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const mask = SP.makeCellMask(p, B);
      const fbm = SP.makeNoise(p.seed);
      const hasPts = points.length > 0;
      if (ctx.tile) {
        // Seamless: parallel stripes with the direction and waves snapped to whole repeats, periodic noise warp.
        // (Lens, swirl and concentric modes are centred compositions, so they're not used in a tile.)
        const ang = (p.angle * Math.PI) / 180;
        const kx = Math.round((B.w * Math.cos(ang)) / p.spacing) / B.w, ky = Math.round((B.h * -Math.sin(ang)) / p.spacing) / B.h;
        const wx = Math.round((B.w * Math.sin(ang)) / p.waveLen) / B.w, wy = Math.round((B.h * Math.cos(ang)) / p.waveLen) / B.h;
        const nX = Math.max(1, Math.round(B.w / p.warpScale)), nY = Math.max(1, Math.round(B.h / p.warpScale));
        const hT = (x, y) => {
          let u = x, v = y;
          if (p.warp > 0) { const X = (x * nX) / B.w, Y = (y * nY) / B.h; u += p.warp * fbm(X, Y, 2, nX, nY); v += p.warp * fbm(X + 5.2, Y + 1.3, 2, nX, nY); }
          const phase = u * kx + v * ky + (p.waveAmp / p.spacing) * Math.sin(2 * Math.PI * (u * wx + v * wy));
          let duty = p.duty + (hasPts && p.fieldThick ? p.fieldThick * fieldAt(x, y) : 0);
          duty = Math.min(0.98, Math.max(0.02, duty));
          return Math.cos(2 * Math.PI * phase) - Math.cos(Math.PI * duty);
        };
        let G = 0;
        const st = Math.max(0.25, p.spacing / 14, Math.max(B.w, B.h) / 220), e = Math.min(st, p.spacing / 14) * 0.25;
        for (let y = 0; y <= B.h; y += st) for (let x = 0; x <= B.w; x += st) { const v0 = hT(x, y); G = Math.max(G, Math.hypot(hT(x + e, y) - v0, hT(x, y + e) - v0) / e); }
        G = G * 1.5 + 1e-6;
        return { evalFn: (x, y) => -hT(x, y) / G, domain: { x0: -2, y0: -2, x1: B.w + 2, y1: B.h + 2 }, count: 1 };
      }
      const th = p.angle * D2R, dx = Math.cos(th), dy = -Math.sin(th);
      const cellOf = (x, y) => {
        let best = mask.cells[0], bd = Infinity;
        for (const c of mask.cells) { const d = (x - c.x) ** 2 + (y - c.y) ** 2; if (d < bd) { bd = d; best = c; } }
        return best;
      };
      const h = (x, y) => {
        const c = cellOf(x, y);
        const Rc = c.r ?? Math.min(c.hw, c.hh);
        let u = x - c.x, v = y - c.y;
        // Sphere lens: a point at normalised radius r samples the flat pattern at asin(r)/(π/2).
        if (p.lens > 0) {
          const r = Math.min(0.999, Math.hypot(u, v) / Rc);
          if (r > 1e-6) { const k = (1 - p.lens) + p.lens * (Math.asin(r) / (Math.PI / 2)) / r; u *= k; v *= k; }
        }
        // Swirl: rotation decays from the centre to the rim.
        const sw = (p.swirl + (hasPts && p.fieldSwirl ? p.fieldSwirl * fieldAt(x, y) : 0)) * D2R;
        if (sw) {
          const r = Math.min(1, Math.hypot(u, v) / Rc), a = sw * (1 - r) * (1 - r), ca = Math.cos(a), sa = Math.sin(a);
          [u, v] = [ca * u - sa * v, sa * u + ca * v];
        }
        if (p.warp > 0) {
          const X = u / p.warpScale + c.x * 0.013, Y = v / p.warpScale - c.y * 0.017;
          u += p.warp * fbm(X, Y, 2); v += p.warp * fbm(X + 5.2, Y + 1.3, 2);
        }
        let phase;
        if (p.mode === 'concentric') phase = Math.hypot(u - p.focusX * Rc, v + p.focusY * Rc) / p.spacing;
        else {
          const across = u * -dy + v * dx; // coordinate along the stripes
          phase = (u * dx + v * dy + p.waveAmp * Math.sin((2 * Math.PI * across) / p.waveLen)) / p.spacing;
        }
        if (p.mode === 'concentric' && p.waveAmp) phase += (p.waveAmp / p.spacing) * Math.sin(Math.atan2(v, u) * Math.max(1, Math.round((2 * Math.PI * Rc) / p.waveLen)));
        let duty = p.duty + (hasPts && p.fieldThick ? p.fieldThick * fieldAt(x, y) : 0);
        duty = Math.min(0.98, Math.max(0.02, duty));
        return Math.cos(2 * Math.PI * phase) - Math.cos(Math.PI * duty);
      };
      const b = mask.bounds;
      const key = JSON.stringify([p, B.w, B.h, hasPts ? points : 0]);
      if (cache.key !== key) {
        let G = 0;
        const st = Math.max(0.2, p.spacing / 16, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 280), e = Math.min(st, p.spacing / 16) * 0.25;
        for (let y = b.y0; y <= b.y1; y += st)
          for (let x = b.x0; x <= b.x1; x += st) {
            if (mask.sdf(x, y) > 0) continue;
            const v0 = h(x, y);
            const g = Math.hypot(h(x + e, y) - v0, h(x, y + e) - v0) / e;
            if (g > G) G = g;
          }
        cache = { key, G: G * 1.5 + 1e-6 };
      }
      const G = cache.G, kr = p.edgeRound;
      const evalFn = (x, y) => {
        const sd = mask.sdf(x, y);
        if (sd > kr) return sd;
        return smax(-h(x, y) / G, sd, kr);
      };
      return { evalFn, domain: { x0: b.x0 - 2, y0: b.y0 - 2, x1: b.x1 + 2, y1: b.y1 + 2 }, count: mask.count };
    },
  };
})();
