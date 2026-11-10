// HUD Rings: heads-up-display reticles. Concentric rings are broken into arc segments with even gaps and a
// random phase per ring; some rings are replaced by tick rings (short dashes), some segments are dropped so
// sweeps read as partial gauges. Optional crosshair bars, a centre dot and four corner brackets frame the
// dial. Arcs are polyline strokes with constant radius, so ends are round caps; width can swell toward
// field points.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Arc polyline from angle a0 to a1 (radians) at radius r about (cx, cy); chord error well under 0.05 mm.
  function arc(cx, cy, r, a0, a1) {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / 1.2));
    const pts = [];
    for (let k = 0; k <= n; k++) { const t = a0 + ((a1 - a0) * k) / n; pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
    return pts;
  }

  SP.generators.hud = {
    id: 'hud',
    name: 'HUD Rings',
    board: true,
    schema: [
      { group: 'Rings' },
      { key: 'rings', label: 'Rings', min: 1, max: 20, step: 1, def: 7, int: true, rand: [4, 10] },
      { key: 'inner', label: 'Inner radius (mm)', min: 1, max: 120, step: 0.5, def: 14, rand: [6, 24] },
      { key: 'pitch', label: 'Ring pitch (mm)', min: 1.5, max: 30, step: 0.1, def: 7, rand: [4, 10] },
      { key: 'wMin', label: 'Width min (mm)', min: 0.6, max: 12, step: 0.05, def: 1.2, rand: [0.8, 2] },
      { key: 'wMax', label: 'Width max (mm)', min: 0.6, max: 20, step: 0.05, def: 3.6, rand: [2, 5] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 11, int: true, rand: [1, 9999] },
      { group: 'Segments' },
      { key: 'segMax', label: 'Segments per ring', min: 1, max: 16, step: 1, def: 6, int: true, rand: [3, 9] },
      { key: 'gapDeg', label: 'Segment gap °', min: 1, max: 60, step: 0.5, def: 8, rand: [4, 16] },
      { key: 'drop', label: 'Drop segments', min: 0, max: 0.8, step: 0.01, def: 0.25, rand: [0.1, 0.45] },
      { key: 'tickChance', label: 'Tick ring chance', min: 0, max: 1, step: 0.01, def: 0.3, rand: [0.15, 0.5] },
      { key: 'tickDeg', label: 'Tick pitch °', min: 1, max: 30, step: 0.5, def: 4, rand: [2.5, 8] },
      { key: 'tickLen', label: 'Tick length (mm)', min: 0.6, max: 12, step: 0.1, def: 2.4, rand: [1.5, 4] },
      { group: 'Frame' },
      { key: 'cross', label: 'Crosshair', type: 'bool', def: true },
      { key: 'crossW', label: 'Crosshair width (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6 },
      { key: 'centreDot', label: 'Centre dot (mm)', min: 0, max: 20, step: 0.1, def: 3, rand: [0, 5] },
      { key: 'brackets', label: 'Corner brackets', type: 'bool', def: true },
      { key: 'bracketLen', label: 'Bracket length (mm)', min: 2, max: 60, step: 0.5, def: 14, rand: [8, 22] },
      { key: 'offX', label: 'Centre X', min: -0.5, max: 0.5, step: 0.01, def: 0 },
      { key: 'offY', label: 'Centre Y', min: -0.5, max: 0.5, step: 0.01, def: 0 },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 8 },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.15, rand: [0.1, 0.4] },
      { group: 'Field' },
      { key: 'fieldWidth', label: 'Points → width', min: -1, max: 1, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 9);
      const cx = B.w / 2 + p.offX * B.w, cy = B.h / 2 + p.offY * B.h;
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const swell = (x, y) => (points.length && p.fieldWidth ? Math.max(0.3, 1 + p.fieldWidth * fieldAt(x, y)) : 1);
      const stroke = (pts, w) => { out.strokes.push({ pts, r: pts.map((q) => Math.max(0.3, (w / 2) * swell(q[0], q[1]))) }); };
      const wMin = Math.min(p.wMin, p.wMax), wMax = Math.max(p.wMin, p.wMax);
      const limit = Math.min(cx, cy, B.w - cx, B.h - cy) - p.margin; // largest radius that fits the board
      let r = p.inner, rings = 0;
      for (let i = 0; i < Math.round(p.rings); i++) {
        const w = wMin + (wMax - wMin) * rand() ** 1.5;
        if (r + w / 2 > limit) break;
        const phase = rand() * 2 * Math.PI;
        if (rand() < p.tickChance) {
          // Tick ring: short radial dashes.
          const n = Math.max(4, Math.round(360 / p.tickDeg));
          const tl = Math.min(p.tickLen, p.pitch * 0.8);
          const tw = Math.max(0.6, Math.min(w, tl * 0.6));
          const maj = 1 + Math.floor(rand() * 4); // every k-th tick is longer
          for (let k = 0; k < n; k++) {
            const a = phase + (2 * Math.PI * k) / n, L = k % maj === 0 ? tl : tl * 0.55;
            stroke([[cx + (r - L / 2) * Math.cos(a), cy + (r - L / 2) * Math.sin(a)], [cx + (r + L / 2) * Math.cos(a), cy + (r + L / 2) * Math.sin(a)]], tw);
          }
          r += Math.max(tl, p.pitch * 0.6) + p.pitch * 0.4;
          rings++;
          continue;
        }
        const segs = 1 + Math.floor(rand() * Math.round(p.segMax));
        const gap = segs > 1 ? Math.min(p.gapDeg * D2R, (2 * Math.PI) / segs - 0.5 / r) : 0;
        // Arc gap is measured on the centreline, grown by the cap radius so the gap stays `gapDeg` wide.
        const capA = segs > 1 ? w / 2 / r : 0;
        const span = (2 * Math.PI) / segs - gap - 2 * capA;
        if (span > 0.02) {
          for (let s = 0; s < segs; s++) {
            if (segs > 1 && rand() < p.drop) continue;
            const a0 = phase + (s * 2 * Math.PI) / segs + gap / 2 + capA;
            stroke(arc(cx, cy, r, a0, a0 + span), w);
          }
        }
        r += w / 2 + p.pitch;
        rings++;
      }
      if (p.centreDot > 0.6) out.blobs.push({ x: cx, y: cy, r: p.centreDot / 2 });
      if (p.cross) {
        // Four bars from just outside the centre dot to just past the outer ring, broken by the rings' gaps.
        const r0 = Math.max(p.centreDot / 2 + p.crossW, 1), r1 = Math.min(limit, r + p.pitch * 0.5);
        if (r1 > r0 + 1)
          for (const a of [0, 90, 180, 270]) {
            const ux = Math.cos(a * D2R), uy = Math.sin(a * D2R);
            stroke([[cx + ux * r0, cy + uy * r0], [cx + ux * r1, cy + uy * r1]], p.crossW);
          }
      }
      if (p.brackets) {
        const L = Math.min(p.bracketLen, (Math.min(B.w, B.h) - 2 * p.margin) / 3), bw = Math.max(0.8, wMax * 0.6);
        const X0 = p.margin + bw / 2, Y0 = p.margin + bw / 2, X1 = B.w - p.margin - bw / 2, Y1 = B.h - p.margin - bw / 2;
        stroke([[X0, Y0 + L], [X0, Y0], [X0 + L, Y0]], bw);
        stroke([[X1 - L, Y0], [X1, Y0], [X1, Y0 + L]], bw);
        stroke([[X1, Y1 - L], [X1, Y1], [X1 - L, Y1]], bw);
        stroke([[X0 + L, Y1], [X0, Y1], [X0, Y1 - L]], bw);
      }
      out.count = rings;
      return out;
    },
  };
})();
