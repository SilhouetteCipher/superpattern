// Hull Markings: the painted marks that give a surface scale. Thin strips are packed onto the board
// without overlapping and each carries one marking: a solid band with a thin companion line, a dashed
// line, a run of chevrons, a block of registration bars (like a code strip), a hazard bar of diagonal
// stripes, a ruler of ticks, or four corner marks framing an empty area. Field points gather markings.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const KINDS = ['band', 'dashes', 'chevrons', 'blocks', 'hazard', 'ruler', 'corners'];
  const MIX = {
    balanced: [2, 2, 1.5, 2, 1, 1.5, 1.5],
    stripes: [4, 3, 1, 0.5, 2, 1, 0.5],
    codes: [1, 1, 0.5, 5, 0.5, 2, 1],
    frames: [1, 1, 0.5, 1, 0.5, 1, 5],
  };

  SP.generators.markings = {
    id: 'markings',
    name: 'Hull Markings',
    board: true,
    schema: [
      { group: 'Strips' },
      { key: 'count', label: 'Markings', min: 1, max: 80, step: 1, def: 16, int: true, rand: [8, 28] },
      { key: 'hMin', label: 'Strip height min (mm)', min: 1, max: 30, step: 0.5, def: 3, rand: [2, 5] },
      { key: 'hMax', label: 'Strip height max (mm)', min: 1, max: 60, step: 0.5, def: 9, rand: [6, 14] },
      { key: 'lMin', label: 'Length min (mm)', min: 5, max: 200, step: 1, def: 20, rand: [12, 30] },
      { key: 'lMax', label: 'Length max (mm)', min: 5, max: 400, step: 1, def: 90, rand: [50, 140] },
      { key: 'orient', label: 'Orientation', type: 'select', def: 'both', options: [['both', 'Both'], ['h', 'Horizontal'], ['v', 'Vertical']] },
      { key: 'gap', label: 'Strip gap (mm)', min: 0.5, max: 30, step: 0.5, def: 5, rand: [3, 10] },
      { key: 'grid', label: 'Snap grid (mm)', min: 0.5, max: 20, step: 0.5, def: 2, rand: [1, 4] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 6, int: true, rand: [1, 9999] },
      { group: 'Marks' },
      { key: 'mix', label: 'Mix', type: 'select', def: 'balanced', options: [['balanced', 'Balanced'], ['stripes', 'Stripes'], ['codes', 'Code blocks'], ['frames', 'Corner marks']] },
      { key: 'lineW', label: 'Thin line (mm)', min: 0.3, max: 6, step: 0.05, def: 1, rand: [0.6, 1.6] },
      { key: 'dash', label: 'Dash length (mm)', min: 1, max: 30, step: 0.5, def: 6, rand: [4, 10] },
      { key: 'frameSize', label: 'Corner frame size (mm)', min: 10, max: 150, step: 1, def: 40, rand: [25, 60] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.1, rand: [0.05, 0.3] },
      { group: 'Field' },
      { key: 'fieldMore', label: 'Points → more marks', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 43);
      const mg = p.margin, X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg, AW = X1 - X0, AH = Y1 - Y0;
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const stroke = (pts, w) => out.strokes.push({ pts, r: pts.map(() => w / 2) });
      const g = p.grid, snap = (v) => Math.round(v / g) * g;
      const hMin = Math.min(p.hMin, p.hMax), hMax = Math.max(p.hMin, p.hMax), lMin = Math.min(p.lMin, p.lMax), lMax = Math.max(p.lMin, p.lMax);
      const weights = MIX[p.mix] || MIX.balanced;
      const pickKind = () => { let t = 0; for (const w of weights) t += w; let u = rand() * t; for (let k = 0; k < weights.length; k++) { u -= weights[k]; if (u <= 0) return KINDS[k]; } return 'band'; };
      const taken = [];
      const fits = (x0, y0, x1, y1) => {
        if (x0 < X0 || y0 < Y0 || x1 > X1 || y1 > Y1) return false;
        for (const [a, b, c, d] of taken) if (x0 < c + p.gap && x1 > a - p.gap && y0 < d + p.gap && y1 > b - p.gap) return false;
        return true;
      };
      const lw = p.lineW;

      let placed = 0, tries = 0;
      while (placed < Math.round(p.count) && tries < 3000) {
        tries++;
        const kind = pickKind();
        const horiz = p.orient === 'h' ? true : p.orient === 'v' ? false : rand() < 0.5;
        let w, h;
        if (kind === 'corners') { const s = p.frameSize * (0.6 + 0.8 * rand()); w = snap(s * (0.8 + 0.6 * rand())); h = snap(s); }
        else { const L = snap(lMin + (lMax - lMin) * rand() ** 1.2), H = snap(hMin + (hMax - hMin) * rand()); w = horiz ? L : H; h = horiz ? H : L; }
        w = Math.max(g, w); h = Math.max(g, h);
        const x0 = snap(X0 + rand() * (AW - w)), y0 = snap(Y0 + rand() * (AH - h)), x1 = x0 + w, y1 = y0 + h;
        if (!fits(x0, y0, x1, y1)) continue;
        if (points.length && p.fieldMore) {
          const acc = Math.min(1, Math.max(0, 1 - p.fieldMore * (1 - 2 * fieldAt((x0 + x1) / 2, (y0 + y1) / 2))));
          if (rand() > acc) continue;
        }
        taken.push([x0, y0, x1, y1]);
        placed++;
        // Strip frame: along = long axis (u), across = short axis (v).
        const along = horiz ? w : h, across = horiz ? h : w;
        const P = (u, v) => (horiz ? [x0 + u, y0 + v] : [x0 + v, y0 + u]);
        const seg = (u0, v0, u1, v1, wd) => stroke([P(u0, v0), P(u1, v1)], wd);
        if (kind === 'band') {
          // Solid band across most of the strip with a thin line beside it.
          const bw = Math.max(lw, across * (0.45 + 0.3 * rand()));
          const thin = rand() < 0.7 && across > bw + 2 * lw + 1;
          const bv = thin ? bw / 2 : across / 2;
          const trim = rand() < 0.5 ? along * 0.15 * rand() : 0;
          seg(bw / 2 + trim, bv, along - bw / 2, bv, bw);
          if (thin) seg(lw / 2, across - lw / 2, along - lw / 2, across - lw / 2, lw);
        } else if (kind === 'dashes') {
          const d = Math.min(p.dash, along / 2), pitch = d * (1.5 + rand()), wd = Math.max(lw, across * 0.6);
          const n = Math.max(1, Math.floor((along - d) / pitch) + 1), start = (along - ((n - 1) * pitch + d)) / 2;
          for (let i = 0; i < n; i++) seg(start + i * pitch + wd / 2, across / 2, start + i * pitch + d - wd / 2, across / 2, wd);
        } else if (kind === 'chevrons') {
          const wd = Math.max(lw, across * 0.22), half = across / 2 - wd / 2, pitch = Math.max(wd * 2.2, half * 1.1);
          const n = Math.max(1, Math.floor((along - half - wd) / pitch) + 1), start = (along - ((n - 1) * pitch + half)) / 2 + wd / 2, dir = rand() < 0.5 ? 1 : -1;
          for (let i = 0; i < n; i++) {
            const u = start + i * pitch;
            const tip = dir > 0 ? u + half : u, tail = dir > 0 ? u : u + half;
            stroke([P(tail, wd / 2), P(tip, across / 2), P(tail, across - wd / 2)], wd);
          }
        } else if (kind === 'blocks') {
          // Registration bars of varying width, like a code strip.
          let u = 0;
          const unit = Math.max(lw, across * 0.18);
          while (u < along - unit) {
            const bw = unit * (1 + Math.floor(rand() * 3)), gp = unit * (1 + Math.floor(rand() * 2));
            if (u + bw > along) break;
            seg(u + bw / 2, bw / 2, u + bw / 2, across - bw / 2, bw);
            u += bw + gp;
          }
        } else if (kind === 'hazard') {
          // Diagonal stripes inside a thin outline, bars of equal width and gap.
          seg(lw / 2, lw / 2, along - lw / 2, lw / 2, lw); seg(lw / 2, across - lw / 2, along - lw / 2, across - lw / 2, lw);
          seg(lw / 2, lw / 2, lw / 2, across - lw / 2, lw); seg(along - lw / 2, lw / 2, along - lw / 2, across - lw / 2, lw);
          const inner = across - 4 * lw, bw = Math.max(lw, inner * 0.3), step = bw * 2.2;
          if (inner > bw) for (let u = step; u < along - inner - bw; u += step) stroke([P(u + bw / 2, 2 * lw + bw / 2), P(u + inner - bw / 2, across - 2 * lw - bw / 2)], bw);
        } else if (kind === 'ruler') {
          seg(lw / 2, lw / 2, along - lw / 2, lw / 2, lw);
          const pitch = Math.max(lw * 2.5, p.dash / 2), n = Math.floor((along - lw) / pitch) + 1, maj = 2 + Math.floor(rand() * 4);
          for (let i = 0; i < n; i++) { const u = lw / 2 + i * pitch, len = i % maj === 0 ? across - lw : (across - lw) * 0.5; seg(u, lw, u, len, lw * 0.8); }
        } else {
          // Four L-shaped corner marks framing an empty area.
          const L = Math.min(w, h) * (0.2 + 0.15 * rand()), wd = lw * (1 + rand());
          const h2 = wd / 2;
          stroke([[x0 + h2, y0 + L], [x0 + h2, y0 + h2], [x0 + L, y0 + h2]], wd);
          stroke([[x1 - L, y0 + h2], [x1 - h2, y0 + h2], [x1 - h2, y0 + L]], wd);
          stroke([[x1 - h2, y1 - L], [x1 - h2, y1 - h2], [x1 - L, y1 - h2]], wd);
          stroke([[x0 + L, y1 - h2], [x0 + h2, y1 - h2], [x0 + h2, y1 - L]], wd);
          if (rand() < 0.5) out.blobs.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: wd });
        }
        out.count++;
      }
      return out;
    },
  };
})();
