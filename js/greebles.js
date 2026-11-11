// Greebles: sparse islands of detail on a plain surface, for scale. Rectangular islands are packed
// onto a grid without overlapping, some clustered against earlier ones, and each is filled with one
// kind of detail: an access hatch outline with corner bolts, a bank of slots, a bolt grid, a few long
// stripes, a ladder of rungs, a frame with a bar, or nested frames. Field points gather islands.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function rrect(x0, y0, x1, y1, r) {
    r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
    if (r <= 1e-6) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    const pts = [], K = Math.max(3, Math.ceil((r * Math.PI) / 2 / 0.5));
    const corner = (cx, cy, a0) => { for (let k = 0; k <= K; k++) { const t = a0 + (Math.PI / 2) * (k / K); pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } };
    corner(x1 - r, y0 + r, -Math.PI / 2); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI);
    pts.push(pts[0]);
    return pts;
  }
  // Kind weights per mix: hatch, slots, bolts, stripes, ladder, bar, nested.
  const KINDS = ['hatch', 'slots', 'bolts', 'stripes', 'ladder', 'bar', 'nested'];
  const MIX = {
    balanced: [3, 2, 1.5, 2, 1.5, 1.5, 1],
    hatches: [5, 1, 1, 1, 0.5, 1, 2],
    vents: [1, 5, 0.5, 2, 2, 0.5, 0.5],
    bolts: [2, 1, 5, 1, 0.5, 1, 1],
    lines: [1, 1, 0.5, 5, 2, 1, 1],
  };

  SP.generators.greebles = {
    id: 'greebles',
    name: 'Greebles',
    board: true,
    schema: [
      { group: 'Islands' },
      { key: 'cover', label: 'Coverage', min: 0.02, max: 0.7, step: 0.01, def: 0.22, rand: [0.1, 0.4] },
      { key: 'sizeMin', label: 'Size min (mm)', min: 3, max: 80, step: 0.5, def: 8, rand: [5, 14] },
      { key: 'sizeMax', label: 'Size max (mm)', min: 3, max: 150, step: 0.5, def: 30, rand: [18, 45] },
      { key: 'aspect', label: 'Max aspect', min: 1, max: 6, step: 0.1, def: 3, rand: [1.5, 4] },
      { key: 'grid', label: 'Snap grid (mm)', min: 0.5, max: 20, step: 0.5, def: 4, rand: [2, 6] },
      { key: 'gap', label: 'Island gap (mm)', min: 0.5, max: 30, step: 0.5, def: 4, rand: [2, 8] },
      { key: 'cluster', label: 'Clustering', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0.2, 0.8] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 12, int: true, rand: [1, 9999] },
      { group: 'Detail' },
      { key: 'mix', label: 'Mix', type: 'select', def: 'balanced', options: [['balanced', 'Balanced'], ['hatches', 'Hatches'], ['vents', 'Vents'], ['bolts', 'Bolts'], ['lines', 'Stripes']] },
      { key: 'lineW', label: 'Line width (mm)', min: 0.3, max: 6, step: 0.05, def: 1, rand: [0.6, 1.6] },
      { key: 'dotR', label: 'Dot radius (mm)', min: 0.3, max: 4, step: 0.05, def: 0.8, rand: [0.5, 1.2] },
      { key: 'slotW', label: 'Slot width (mm)', min: 0.4, max: 6, step: 0.05, def: 1.2, rand: [0.8, 2] },
      { key: 'slotPitch', label: 'Slot pitch (mm)', min: 1, max: 15, step: 0.1, def: 3, rand: [2.2, 4.5] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 8, step: 0.1, def: 1.5, rand: [0.5, 3] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.1, rand: [0.05, 0.3] },
      { group: 'Field' },
      { key: 'fieldMore', label: 'Points → more islands', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 41);
      const mg = p.margin, X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg, AW = X1 - X0, AH = Y1 - Y0;
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const stroke = (pts, w) => out.strokes.push({ pts, r: pts.map(() => w / 2) });
      const dot = (x, y, r) => out.blobs.push({ x, y, r });
      const g = p.grid, snap = (v) => Math.round(v / g) * g;
      const sMin = Math.min(p.sizeMin, p.sizeMax), sMax = Math.max(p.sizeMin, p.sizeMax);
      const weights = MIX[p.mix] || MIX.balanced;
      const pickKind = () => { let t = 0; for (const w of weights) t += w; let u = rand() * t; for (let k = 0; k < weights.length; k++) { u -= weights[k]; if (u <= 0) return KINDS[k]; } return 'hatch'; };
      const islands = []; // [x0, y0, x1, y1]
      const fits = (x0, y0, x1, y1) => {
        if (x0 < X0 || y0 < Y0 || x1 > X1 || y1 > Y1) return false;
        for (const [a, b, c, d] of islands) if (x0 < c + p.gap && x1 > a - p.gap && y0 < d + p.gap && y1 > b - p.gap) return false;
        return true;
      };
      const target = p.cover * AW * AH;
      let area = 0, tries = 0;
      while (area < target && tries < 4000) {
        tries++;
        // Size: one side from the range, the other by a random aspect.
        const s = sMin + (sMax - sMin) * rand() ** 1.3, asp = 1 + (p.aspect - 1) * rand();
        let w = Math.max(g, snap(rand() < 0.5 ? s : s / asp)), h = Math.max(g, snap(rand() < 0.5 ? s : s / asp));
        if (w < sMin * 0.5 && h < sMin * 0.5) continue;
        let x0, y0;
        if (islands.length && rand() < p.cluster) {
          // Butt up against an existing island on a random side, aligned to its edge.
          const [a, b, c, d] = islands[Math.floor(rand() * islands.length)], side = Math.floor(rand() * 4);
          if (side === 0) { x0 = snap(c + p.gap); y0 = rand() < 0.5 ? b : d - h; }
          else if (side === 1) { x0 = snap(a - p.gap - w); y0 = rand() < 0.5 ? b : d - h; }
          else if (side === 2) { y0 = snap(d + p.gap); x0 = rand() < 0.5 ? a : c - w; }
          else { y0 = snap(b - p.gap - h); x0 = rand() < 0.5 ? a : c - w; }
        } else { x0 = snap(X0 + rand() * (AW - w)); y0 = snap(Y0 + rand() * (AH - h)); }
        if (!fits(x0, y0, x0 + w, y0 + h)) continue;
        if (points.length && p.fieldMore) {
          const acc = Math.min(1, Math.max(0, 1 - p.fieldMore * (1 - 2 * fieldAt(x0 + w / 2, y0 + h / 2))));
          if (rand() > acc) continue;
        }
        islands.push([x0, y0, x0 + w, y0 + h]);
        area += w * h;
      }

      const lw = p.lineW;
      for (const [x0, y0, x1, y1] of islands) {
        const w = x1 - x0, h = y1 - y0, small = Math.min(w, h), horiz = w >= h;
        let kind = pickKind();
        if (small < 3 * lw + 2 && kind !== 'bolts' && kind !== 'slots') kind = 'slots';
        if (kind === 'hatch') {
          stroke(rrect(x0 + lw / 2, y0 + lw / 2, x1 - lw / 2, y1 - lw / 2, p.round), lw);
          if (small > 6 * p.dotR + 2 * lw) {
            const o = lw + 1.5 * p.dotR;
            dot(x0 + o, y0 + o, p.dotR); dot(x1 - o, y0 + o, p.dotR); dot(x1 - o, y1 - o, p.dotR); dot(x0 + o, y1 - o, p.dotR);
          }
          if (rand() < 0.4 && small > 10) { const i = lw * 2.5 + p.dotR * 2; if (horiz) stroke([[x0 + i, (y0 + y1) / 2], [x1 - i, (y0 + y1) / 2]], lw); else stroke([[(x0 + x1) / 2, y0 + i], [(x0 + x1) / 2, y1 - i]], lw); }
        } else if (kind === 'slots') {
          // Slots across the short axis, repeating along the long one.
          const run = horiz ? w : h, span = horiz ? h : w;
          const n = Math.max(1, Math.floor((run - p.slotW) / p.slotPitch) + 1), start = (horiz ? x0 : y0) + (run - (n - 1) * p.slotPitch) / 2;
          const a0 = (horiz ? y0 : x0) + p.slotW / 2, a1 = (horiz ? y1 : x1) - p.slotW / 2;
          if (a1 - a0 < 0.3) continue;
          for (let i = 0; i < n; i++) { const u = start + i * p.slotPitch; stroke(horiz ? [[u, a0], [u, a1]] : [[a0, u], [a1, u]], Math.min(p.slotW, span)); }
        } else if (kind === 'bolts') {
          const pitch = Math.max(p.dotR * 4, g);
          const nx = Math.max(1, Math.floor((w - 2 * p.dotR) / pitch) + 1), ny = Math.max(1, Math.floor((h - 2 * p.dotR) / pitch) + 1);
          const sx = x0 + (w - (nx - 1) * pitch) / 2, sy = y0 + (h - (ny - 1) * pitch) / 2;
          for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) dot(sx + i * pitch, sy + j * pitch, p.dotR);
        } else if (kind === 'stripes') {
          const span = horiz ? h : w, n = Math.max(2, Math.min(6, Math.floor(span / (lw * 2.5))));
          const pitch = (span - lw) / (n - 1);
          for (let i = 0; i < n; i++) {
            const c = (horiz ? y0 : x0) + lw / 2 + i * pitch;
            const trim = rand() < 0.4 ? (horiz ? w : h) * 0.25 * rand() : 0;
            stroke(horiz ? [[x0 + trim, c], [x1, c]] : [[c, y0 + trim], [c, y1]], lw);
          }
        } else if (kind === 'ladder') {
          const rail = lw;
          if (horiz) {
            stroke([[x0, y0 + rail / 2], [x1, y0 + rail / 2]], rail); stroke([[x0, y1 - rail / 2], [x1, y1 - rail / 2]], rail);
            const n = Math.max(2, Math.floor(w / p.slotPitch / 1.5) + 1), pitch = (w - lw) / (n - 1);
            for (let i = 0; i < n; i++) stroke([[x0 + lw / 2 + i * pitch, y0 + rail], [x0 + lw / 2 + i * pitch, y1 - rail]], lw * 0.8);
          } else {
            stroke([[x0 + rail / 2, y0], [x0 + rail / 2, y1]], rail); stroke([[x1 - rail / 2, y0], [x1 - rail / 2, y1]], rail);
            const n = Math.max(2, Math.floor(h / p.slotPitch / 1.5) + 1), pitch = (h - lw) / (n - 1);
            for (let i = 0; i < n; i++) stroke([[x0 + rail, y0 + lw / 2 + i * pitch], [x1 - rail, y0 + lw / 2 + i * pitch]], lw * 0.8);
          }
        } else if (kind === 'bar') {
          stroke(rrect(x0 + lw / 2, y0 + lw / 2, x1 - lw / 2, y1 - lw / 2, p.round), lw);
          const i = lw * 2.5, bw = Math.max(lw, (horiz ? h : w) * 0.3);
          if (small > 2 * i + bw) {
            const len = (horiz ? w : h) - 2 * i, f = 0.3 + 0.6 * rand();
            if (horiz) stroke([[x0 + i + bw / 2, (y0 + y1) / 2], [x0 + i + Math.max(bw / 2, len * f - bw / 2), (y0 + y1) / 2]], bw);
            else stroke([[(x0 + x1) / 2, y0 + i + bw / 2], [(x0 + x1) / 2, y0 + i + Math.max(bw / 2, len * f - bw / 2)]], bw);
          }
        } else {
          stroke(rrect(x0 + lw / 2, y0 + lw / 2, x1 - lw / 2, y1 - lw / 2, p.round), lw);
          const i = lw * 3;
          if (small > 2 * i + lw) stroke(rrect(x0 + i, y0 + i, x1 - i, y1 - i, Math.max(0, p.round - i / 2)), lw * 0.8);
        }
        out.count++;
      }
      return out;
    },
  };
})();
