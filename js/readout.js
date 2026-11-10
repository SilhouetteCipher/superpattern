// Readout: sci-fi console strips. The board is filled row by row (in one to three columns) with data
// widgets laid left to right: block-glyph "text" from a seeded alien alphabet, segmented progress bars,
// equaliser gauges, thin rules, framed boxes, dot runs and solid blocks, with blanks between groups.
// Every widget is a set of rounded boxes; the field is their exact signed-distance union (1-Lipschitz).
// Field points make rows busier around them.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Widget weights per mix: text, bar, gauge, line, frame, dots, block.
  const MIX = {
    balanced: [3, 3, 2, 2, 1.5, 1.5, 1],
    text: [6, 2, 0.5, 1.5, 1, 1, 0.5],
    bars: [1, 5, 2, 1, 1.5, 0.5, 1],
    gauges: [1, 1.5, 5, 1, 0.5, 1, 0.5],
    minimal: [0.5, 1, 0.5, 4, 1, 3, 1],
  };
  const KINDS = ['text', 'bar', 'gauge', 'line', 'frame', 'dots', 'block'];

  SP.generators.readout = {
    id: 'readout',
    name: 'Readout',
    board: true,
    schema: [
      { group: 'Layout' },
      { key: 'rowH', label: 'Row height (mm)', min: 2, max: 24, step: 0.1, def: 6, rand: [4, 9] },
      { key: 'rowGap', label: 'Row gap (mm)', min: 0.5, max: 12, step: 0.1, def: 2.5, rand: [1.5, 4] },
      { key: 'vary', label: 'Vary row height', min: 0, max: 1, step: 0.01, def: 0.35, rand: [0, 0.6] },
      { key: 'columns', label: 'Columns', min: 1, max: 3, step: 1, def: 1, int: true, rand: [1, 2] },
      { key: 'colGap', label: 'Column gap (mm)', min: 1, max: 30, step: 0.5, def: 8 },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 8 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 42, int: true, rand: [1, 9999] },
      { group: 'Content' },
      { key: 'mix', label: 'Mix', type: 'select', def: 'balanced', options: [['balanced', 'Balanced'], ['text', 'Text heavy'], ['bars', 'Bars heavy'], ['gauges', 'Gauges'], ['minimal', 'Minimal']] },
      { key: 'density', label: 'Density', min: 0.2, max: 1, step: 0.01, def: 0.8, rand: [0.55, 0.95] },
      { key: 'gapX', label: 'Group gap (mm)', min: 0.5, max: 14, step: 0.1, def: 3, rand: [2, 5] },
      { key: 'glyphGap', label: 'Glyph spacing', min: 0.2, max: 1.5, step: 0.05, def: 0.5, rand: [0.3, 0.8] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 3, step: 0.05, def: 0.3, rand: [0, 0.8] },
      { group: 'Field' },
      { key: 'fieldBusy', label: 'Points → busier', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 23);
      const mg = p.margin, X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg;
      const boxes = []; // [x0, y0, x1, y1, r]
      const box = (x0, y0, x1, y1) => { if (x1 - x0 > 0.2 && y1 - y0 > 0.2) boxes.push([x0, y0, x1, y1, Math.min(p.round, (x1 - x0) / 2, (y1 - y0) / 2)]); };
      // Alien alphabet: 24 glyphs on a 3 × 5 pixel grid; every column and the top/bottom rows get a pixel
      // so glyphs read as characters, and pixels touch so each glyph is one piece.
      const alphabet = [];
      for (let g = 0; g < 24; g++) {
        const bits = new Uint8Array(15);
        for (let c = 0; c < 3; c++) {
          const top = rand() < 0.75, bot = rand() < 0.75, mid = rand() < 0.55;
          const span = rand() < 0.4; // full vertical stroke
          for (let r = 0; r < 5; r++) bits[r * 3 + c] = span || (r === 0 && top) || (r === 4 && bot) || (r === 2 && mid) || rand() < 0.2 ? 1 : 0;
        }
        // Horizontal links so columns connect: top, middle or bottom rows filled across.
        const link = Math.floor(rand() * 3) * 2;
        for (let c = 0; c < 3; c++) bits[link * 3 + c] = 1;
        alphabet.push(bits);
      }
      const weights = MIX[p.mix] || MIX.balanced;
      const pickKind = () => { let t = 0; for (const w of weights) t += w; let u = rand() * t; for (let k = 0; k < weights.length; k++) { u -= weights[k]; if (u <= 0) return KINDS[k]; } return 'line'; };

      const cols = Math.max(1, Math.round(p.columns));
      const colW = (X1 - X0 - (cols - 1) * p.colGap) / cols;
      let rows = 0;
      for (let c = 0; c < cols; c++) {
        const cx0 = X0 + c * (colW + p.colGap), cx1 = cx0 + colW;
        let y = Y0;
        while (true) {
          const rh = Math.max(1.5, p.rowH * (1 + p.vary * (rand() * 1.6 - 0.6)));
          if (y + rh > Y1 + 1e-6) break;
          const u = rh / 5; // glyph pixel
          let x = cx0;
          const busy = (xx) => (points.length && p.fieldBusy ? Math.min(1, Math.max(0, p.density + p.fieldBusy * fieldAt(xx, y + rh / 2))) : p.density);
          while (x < cx1 - 2 * u) {
            const kind = pickKind();
            const rem = cx1 - x;
            let w = 0;
            if (rand() > busy(x)) { x += Math.min(rem, colW * (0.04 + 0.12 * rand())) + p.gapX; continue; }
            if (kind === 'text') {
              const n = 2 + Math.floor(rand() * 7), adv = 3 * u + p.glyphGap * u;
              const m = Math.min(n, Math.floor((rem + p.glyphGap * u) / adv));
              if (m < 1) break;
              for (let k = 0; k < m; k++) {
                const gx = x + k * adv, bits = alphabet[Math.floor(rand() * alphabet.length)];
                for (let r = 0; r < 5; r++) for (let cc = 0; cc < 3; cc++) if (bits[r * 3 + cc]) box(gx + cc * u - 0.02, y + r * u - 0.02, gx + (cc + 1) * u + 0.02, y + (r + 1) * u + 0.02);
              }
              w = m * adv - p.glyphGap * u;
            } else if (kind === 'bar') {
              const sw = rh * (0.45 + 0.45 * rand()), sg = sw * 0.35, adv = sw + sg;
              const n = Math.min(4 + Math.floor(rand() * 10), Math.floor((rem + sg) / adv));
              if (n < 2) break;
              const filled = Math.round(n * (0.3 + 0.7 * rand()));
              for (let k = 0; k < n; k++) {
                const bx = x + k * adv;
                if (k < filled) box(bx, y, bx + sw, y + rh); else box(bx, y + rh * 0.38, bx + sw, y + rh * 0.62);
              }
              w = n * adv - sg;
            } else if (kind === 'gauge') {
              const bw = Math.max(0.6, rh * 0.22), adv = bw * 2;
              const n = Math.min(5 + Math.floor(rand() * 12), Math.floor((rem + bw) / adv));
              if (n < 3) break;
              let hgt = 0.3 + 0.5 * rand();
              for (let k = 0; k < n; k++) {
                hgt = Math.min(1, Math.max(0.15, hgt + (rand() - 0.5) * 0.45));
                box(x + k * adv, y + rh * (1 - hgt), x + k * adv + bw, y + rh);
              }
              w = n * adv - bw;
            } else if (kind === 'line') {
              w = Math.min(rem, colW * (0.08 + 0.3 * rand()));
              const t = Math.max(0.6, rh * 0.16), yy = y + rh * (rand() < 0.5 ? 0.5 : 0.85) - t / 2;
              box(x, yy, x + w, yy + t);
            } else if (kind === 'frame') {
              w = Math.min(rem, colW * (0.12 + 0.25 * rand()));
              const t = Math.max(0.6, rh * 0.16);
              if (w < 4 * t) break;
              box(x, y, x + w, y + t); box(x, y + rh - t, x + w, y + rh);
              box(x, y, x + t, y + rh); box(x + w - t, y, x + w, y + rh);
              // Inner bar, inset by one gap.
              const inset = t * 2.2;
              if (rand() < 0.7 && rh - 2 * inset > 0.6) box(x + inset, y + inset, x + inset + (w - 2 * inset) * (0.2 + 0.7 * rand()), y + rh - inset);
            } else if (kind === 'dots') {
              const s = Math.max(0.7, rh * 0.38), adv = s * 2;
              const n = Math.min(3 + Math.floor(rand() * 8), Math.floor((rem + s) / adv));
              if (n < 2) break;
              for (let k = 0; k < n; k++) box(x + k * adv, y + (rh - s) / 2, x + k * adv + s, y + (rh + s) / 2);
              w = n * adv - s;
            } else {
              w = Math.min(rem, colW * (0.04 + 0.1 * rand()));
              box(x, y, x + w, y + rh);
            }
            x += w + p.gapX;
          }
          y += rh + p.rowGap;
          rows++;
        }
      }

      // Bins over the boxes (each registered in every bin its box grown by S touches, so an empty bin is ≥ S away).
      const S = Math.max(4, p.rowH + p.rowGap);
      const bins = new Map(), bk = (i, j) => i + ',' + j;
      boxes.forEach((b, k) => {
        for (let j = Math.floor((b[1] - S) / S); j <= Math.floor((b[3] + S) / S); j++)
          for (let i = Math.floor((b[0] - S) / S); i <= Math.floor((b[2] + S) / S); i++) { const kk = bk(i, j); (bins.get(kk) || bins.set(kk, []).get(kk)).push(k); }
      });
      const evalFn = (x, y) => {
        const L = bins.get(bk(Math.floor(x / S), Math.floor(y / S)));
        let f = S;
        if (L) for (const k of L) {
          const [x0, y0, x1, y1, r] = boxes[k];
          const dx = Math.max(x0 + r - x, x - x1 + r), dy = Math.max(y0 + r - y, y - y1 + r);
          f = Math.min(f, Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - r);
        }
        return f;
      };
      return { evalFn, domain: { x0: X0 - 2, y0: Y0 - 2, x1: X1 + 2, y1: Y1 + 2 }, count: rows };
    },
  };
})();
