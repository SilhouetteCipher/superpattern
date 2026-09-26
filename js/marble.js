// Marble: flowing bands from a domain-warped stripe field.
//   phase(p) = dot(p + warp·r(p), dir) / spacing,  r = nested fBm warp (q -> r)
//   black where cos(2π·phase) > cos(π·duty(p)); duty varies with low-frequency noise and field points,
//   so bands swell and taper to points. Fully analytic (C² noise) -> smooth edges.
// Each mask cell gets its own noise offset and (optionally) its own direction.
(function () {
  const SP = (window.SP = window.SP || {});

  // Seeded 2D gradient (Perlin) noise with quintic fade -> C² continuous.
  function makeNoise(seed) {
    let a = (seed * 2654435761) >>> 0 || 1;
    const rnd = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return (a >>> 0) / 4294967296; };
    const perm = new Uint8Array(512), gx = new Float32Array(256), gy = new Float32Array(256);
    const p = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) { const t = rnd() * Math.PI * 2; gx[i] = Math.cos(t); gy[i] = Math.sin(t); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const noise = (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const h00 = perm[X + perm[Y]], h10 = perm[X + 1 + perm[Y]], h01 = perm[X + perm[Y + 1]], h11 = perm[X + 1 + perm[Y + 1]];
      const n00 = gx[h00] * xf + gy[h00] * yf;
      const n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
      const n01 = gx[h01] * xf + gy[h01] * (yf - 1);
      const n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
      const u = fade(xf), v = fade(yf);
      return (n00 + u * (n10 - n00) + v * (n01 - n00 + u * (n11 - n01 - n10 + n00))) * 1.41;
    };
    // Periodic variant: lattice indices wrap with period (px, py) cells; octaves double exactly
    // (no rotation), so every octave repeats over the same tile.
    const noiseP = (x, y, px, py) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const w = (i, n) => (((i % n) + n) % n) & 255;
      const X0 = w(xi, px), X1 = w(xi + 1, px), Y0 = w(yi, py), Y1 = w(yi + 1, py);
      const h00 = perm[X0 + perm[Y0]], h10 = perm[X1 + perm[Y0]], h01 = perm[X0 + perm[Y1]], h11 = perm[X1 + perm[Y1]];
      const n00 = gx[h00] * xf + gy[h00] * yf, n10 = gx[h10] * (xf - 1) + gy[h10] * yf;
      const n01 = gx[h01] * xf + gy[h01] * (yf - 1), n11 = gx[h11] * (xf - 1) + gy[h11] * (yf - 1);
      const u = fade(xf), v = fade(yf);
      return (n00 + u * (n10 - n00) + v * (n01 - n00 + u * (n11 - n01 - n10 + n00))) * 1.41;
    };
    return (x, y, oct, px, py) => {
      if (px) {
        let s = 0, amp = 0.5, f = 1, norm = 0;
        for (let o = 0; o < oct; o++) { s += amp * noiseP(x * f, y * f, px * f, py * f); norm += amp; amp *= 0.5; f *= 2; }
        return s / norm;
      }
      let s = 0, amp = 0.5, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) {
        s += amp * noise(x * f, y * f);
        norm += amp; amp *= 0.5; f *= 2.03;
        // rotate between octaves to hide grid alignment
        const nx = 0.8 * x - 0.6 * y, ny = 0.6 * x + 0.8 * y; x = nx; y = ny;
      }
      return s / norm;
    };
  }

  function smax(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  }

  SP.makeNoise = makeNoise;
  let cache = { key: null, G: 1 };

  SP.generators.marble = {
    id: 'marble',
    name: 'Marble',
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
      { key: 'edgeRound', label: 'Edge roundness (mm)', min: 0.02, max: 6, step: 0.01, def: 0.3 },
      { group: 'Bands' },
      { key: 'spacing', label: 'Band spacing (mm)', min: 2, max: 60, step: 0.1, def: 16, rand: [11, 22] },
      { key: 'angle', label: 'Direction °', min: -180, max: 180, step: 1, def: 20, rand: [-180, 180] },
      { key: 'varyDir', label: 'Vary direction per cell', type: 'bool', def: true },
      { key: 'duty', label: 'Band thickness', min: 0.05, max: 0.95, step: 0.01, def: 0.45, rand: [0.35, 0.55] },
      { key: 'thickVar', label: 'Thickness variation', min: 0, max: 0.8, step: 0.01, def: 0.3, rand: [0.15, 0.45] },
      { key: 'thickScale', label: 'Variation scale (mm)', min: 5, max: 300, step: 1, def: 60, rand: [35, 90] },
      { group: 'Flow' },
      { key: 'warp', label: 'Warp amount (mm)', min: 0, max: 150, step: 0.5, def: 45, rand: [25, 55] },
      { key: 'warpScale', label: 'Warp scale (mm)', min: 10, max: 400, step: 1, def: 150, rand: [110, 200] },
      { key: 'twist', label: 'Swirl', min: 0, max: 3, step: 0.01, def: 0.6, rand: [0.3, 0.9] },
      { key: 'octaves', label: 'Detail octaves', min: 1, max: 6, step: 1, def: 1, int: true },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 3, int: true, rand: [1, 9999] },
      { group: 'Field points' },
      { key: 'fieldThick', label: 'Points → thickness', min: -1, max: 1, step: 0.01, def: 0.3 },
      { key: 'fieldWarp', label: 'Points → swirl', min: -3, max: 3, step: 0.01, def: 0 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const mask = SP.makeCellMask(p, B);
      const fbm = makeNoise(p.seed);
      const oct = Math.max(1, Math.round(p.octaves));
      const cells = mask.cells.map((c, i) => {
        const h = (Math.sin((i + 1) * 12.9898 + p.seed * 78.233) * 43758.5453) % 1;
        const ang = ((p.angle + (p.varyDir && mask.cells.length > 1 ? Math.abs(h) * 360 : 0)) * Math.PI) / 180;
        return { x: c.x, y: c.y, dx: Math.cos(ang), dy: Math.sin(ang), o: 17.3 * (i + 1) };
      });
      const hasPts = points.length > 0;
      const cellOf = (x, y) => {
        let best = cells[0], bd = Infinity;
        for (const c of cells) { const d = (x - c.x) ** 2 + (y - c.y) ** 2; if (d < bd) { bd = d; best = c; } }
        return best;
      };
      const ws = 1 / p.warpScale, tw = p.twist * 4;
      const T = ctx.tile;
      if (T) {
        // Seamless: periodic noise with a whole number of lattice cells per tile, and a stripe
        // direction snapped so a whole number of bands crosses the tile each way.
        const nX = Math.max(1, Math.round(B.w / p.warpScale)), nY = Math.max(1, Math.round(B.h / p.warpScale));
        const tX = Math.max(1, Math.round(B.w / p.thickScale)), tY = Math.max(1, Math.round(B.h / p.thickScale));
        const ang = (p.angle * Math.PI) / 180;
        const kx = Math.round((B.w * Math.cos(ang)) / p.spacing) / B.w, ky = Math.round((B.h * Math.sin(ang)) / p.spacing) / B.h;
        const hT = (x, y) => {
          const X = (x * nX) / B.w, Y = (y * nY) / B.h;
          const fw = hasPts && p.fieldWarp ? 1 + p.fieldWarp * fieldAt(x, y) : 1;
          const qx = fbm(X, Y, oct, nX, nY), qy = fbm(X + 5.2, Y + 1.3, oct, nX, nY);
          const rx = fbm(X + tw * fw * qx + 1.7, Y + tw * fw * qy + 9.2, oct, nX, nY);
          const ry = fbm(X + tw * fw * qx + 8.3, Y + tw * fw * qy + 2.8, oct, nX, nY);
          const phase = (x + p.warp * rx) * kx + (y + p.warp * ry) * ky;
          let duty = p.duty + p.thickVar * fbm((x * tX) / B.w + 31.7, (y * tY) / B.h - 11.1, 2, tX, tY);
          if (hasPts && p.fieldThick) duty += p.fieldThick * fieldAt(x, y);
          duty = Math.min(0.98, Math.max(0.02, duty));
          return Math.cos(2 * Math.PI * phase) - Math.cos(Math.PI * duty);
        };
        const keyT = JSON.stringify([p, B.w, B.h, hasPts ? points : 0, 'tile']);
        if (cache.key !== keyT) {
          let G = 0;
          const st = Math.max(0.25, p.spacing / 14, Math.max(B.w, B.h) / 260), e = Math.min(st, p.spacing / 14) * 0.25;
          for (let y = 0; y <= B.h; y += st) for (let x = 0; x <= B.w; x += st) { const v = hT(x, y); G = Math.max(G, Math.hypot(hT(x + e, y) - v, hT(x, y + e) - v) / e); }
          cache = { key: keyT, G: G * 1.5 + 1e-6 };
        }
        const GT = cache.G;
        return { evalFn: (x, y) => -hT(x, y) / GT, domain: { x0: -2, y0: -2, x1: B.w + 2, y1: B.h + 2 }, count: 1 };
      }
      // h(p) > 0 inside a band.
      const h = (x, y) => {
        const c = cellOf(x, y);
        const X = (x - c.x) * ws + c.o, Y = (y - c.y) * ws - c.o;
        const fw = hasPts && p.fieldWarp ? 1 + p.fieldWarp * fieldAt(x, y) : 1;
        const qx = fbm(X, Y, oct), qy = fbm(X + 5.2, Y + 1.3, oct);
        const rx = fbm(X + tw * fw * qx + 1.7, Y + tw * fw * qy + 9.2, oct);
        const ry = fbm(X + tw * fw * qx + 8.3, Y + tw * fw * qy + 2.8, oct);
        const px = x + p.warp * rx, py = y + p.warp * ry;
        const phase = (px * c.dx + py * c.dy) / p.spacing;
        let duty = p.duty + p.thickVar * fbm(X * p.warpScale / p.thickScale + 31.7, Y * p.warpScale / p.thickScale - 11.1, 2);
        if (hasPts && p.fieldThick) duty += p.fieldThick * fieldAt(x, y);
        duty = Math.min(0.98, Math.max(0.02, duty));
        return Math.cos(2 * Math.PI * phase) - Math.cos(Math.PI * duty);
      };

      // Lipschitz estimate for h over the mask bounds (so f = -h/G behaves like a distance bound).
      const b = mask.bounds;
      const key = JSON.stringify([p, B.w, B.h, hasPts ? points : 0]);
      if (cache.key !== key) {
        let G = 0;
        const st = Math.max(0.25, p.spacing / 14, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 260), e = Math.min(st, p.spacing / 14) * 0.25;
        for (let y = b.y0; y <= b.y1; y += st)
          for (let x = b.x0; x <= b.x1; x += st) {
            if (mask.sdf(x, y) > 0) continue;
            const v = h(x, y);
            const g = Math.hypot(h(x + e, y) - v, h(x, y + e) - v) / e;
            if (g > G) G = g;
          }
        cache = { key, G: G * 1.5 + 1e-6 };
      }
      const G = cache.G, kr = p.edgeRound;
      const evalFn = (x, y) => {
        const sd = mask.sdf(x, y);
        if (sd > kr) return sd; // outside: skip the noise entirely
        return smax(-h(x, y) / G, sd, kr);
      };
      const pad = 2;
      return { evalFn, domain: { x0: b.x0 - pad, y0: b.y0 - pad, x1: b.x1 + pad, y1: b.y1 + pad }, count: mask.count };
    },
  };
})();
