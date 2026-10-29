// Meander: the Greek key and the Bronze-Age running spiral, read as one rule. Every classic key is a double
// spiral: a line winds in, turns back at the centre and winds out again between its own coils, so the whole unit
// is symmetric under a half-turn about its centre. On a unit grid the inward half is a turtle walk with leg
// lengths n, n−1, …, 1 turning the same way each time (n = Turns); one more unit step reaches the half-turn centre
// and the outward half is the inward half rotated 180° about it. That keeps every pair of parallel legs exactly
// one grid unit apart, enters at the bottom-left corner and leaves at the top-right. The round form is the same
// construction with Archimedean arms (two units of radius per turn, interleaved half a turn apart so neighbouring
// coils are one unit apart) and an S-curve through the eye. Units are chained along a band in one of two ways:
// alternate (every other unit mirrored, joined by short straight links along the top and bottom, the classic
// frieze) or running (all units the same way round, joined by a drop between keys or an S-wave between spirals,
// the "running dog"). Bands are stacked to fill the board, optionally edged with rails one unit off the line,
// and every line is one round-capped stroke so the export is a few long closed outlines rather than islands.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3; // narrowest half-width (mm): 0.6 mm lines
  const MIN_GAP = 0.6; // narrowest gap between neighbouring lines (mm)
  const RHO0 = 0.6; // spiral eye radius (grid units)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const HEAD = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // up, right, down, left (y up): one clockwise turn per leg

  // One square key in grid units: enters at (0, 0) heading up, leaves at (n, n + 1) heading up.
  function keyUnit(n) {
    const half = [[0, 0]];
    let x = 0, y = 0, h = 0;
    for (let L = n; L >= 1; L--, h = (h + 1) % 4) { x += HEAD[h][0] * L; y += HEAD[h][1] * L; half.push([x, y]); }
    const c = [x + HEAD[h][0] * 0.5, y + HEAD[h][1] * 0.5]; // half-turn centre, half a step on from the last leg
    const out = half.slice();
    for (let i = half.length - 1; i >= 0; i--) out.push([2 * c[0] - half[i][0], 2 * c[1] - half[i][1]]);
    return out;
  }

  // Replace each corner of an orthogonal polyline with a quarter arc of radius rc (grid units, ≤ ½).
  function roundCorners(pts, rc) {
    if (rc <= 0.01) return pts;
    const out = [pts[0]];
    for (let i = 1; i + 1 < pts.length; i++) {
      const a = pts[i - 1], v = pts[i], b = pts[i + 1];
      const la = Math.hypot(v[0] - a[0], v[1] - a[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
      if (la < 1e-9 || lb < 1e-9) continue;
      const da = [(v[0] - a[0]) / la, (v[1] - a[1]) / la], db = [(b[0] - v[0]) / lb, (b[1] - v[1]) / lb];
      const cr = da[0] * db[1] - da[1] * db[0];
      if (Math.abs(cr) < 1e-6) { out.push(v); continue; } // straight through
      const r = Math.min(rc, la / 2, lb / 2);
      const p1 = [v[0] - da[0] * r, v[1] - da[1] * r];
      const cen = [p1[0] + db[0] * r, p1[1] + db[1] * r];
      const a0 = Math.atan2(p1[1] - cen[1], p1[0] - cen[0]);
      const sweep = cr > 0 ? Math.PI / 2 : -Math.PI / 2;
      for (let k = 0; k <= 6; k++) { const t = a0 + (sweep * k) / 6; out.push([cen[0] + Math.cos(t) * r, cen[1] + Math.sin(t) * r]); }
    }
    out.push(pts[pts.length - 1]);
    // Drop coincident points where two arcs meet on a one-unit leg.
    return out.filter((q, i) => i === 0 || Math.hypot(q[0] - out[i - 1][0], q[1] - out[i - 1][1]) > 1e-6);
  }

  // One round double spiral centred on (cx, 0) in grid units, `turns` turns per arm, handedness s (−1 = clockwise).
  // Returned from the bottom arm's outer end, through the eye, to the top arm's outer end.
  function spiralUnit(cx, turns, s) {
    const T = Math.max(0.25, turns), Rm = RHO0 + 2 * T;
    const f1 = Math.PI / 2, f0 = f1 - s * 2 * Math.PI * T;
    const n = Math.max(12, Math.ceil(2 * Math.PI * T * Rm * 3));
    const arm = [];
    for (let i = 0; i <= n; i++) { const t = i / n, f = f0 + (f1 - f0) * t, r = RHO0 + 2 * T * t; arm.push([Math.cos(f) * r, Math.sin(f) * r]); }
    // Eye: cubic from the lower arm's inner end to the upper arm's, both heading along the arm tangent d.
    const u = [Math.cos(f0), Math.sin(f0)], d = [-s * u[1], s * u[0]];
    const q2 = [-u[0] * RHO0, -u[1] * RHO0], q1 = [u[0] * RHO0, u[1] * RHO0], hd = RHO0 * 1.2;
    const eye = cubic(q2, [q2[0] + d[0] * hd, q2[1] + d[1] * hd], [q1[0] - d[0] * hd, q1[1] - d[1] * hd], q1, 10);
    const pts = [];
    for (let i = arm.length - 1; i >= 1; i--) pts.push([-arm[i][0], -arm[i][1]]); // lower arm, outer → inner
    for (const q of eye) pts.push(q);
    for (let i = 1; i < arm.length; i++) pts.push(arm[i]);
    return pts.map((q) => [q[0] + cx, q[1]]);
  }

  function cubic(a, b, c, d, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, v = 1 - t;
      pts.push([v * v * v * a[0] + 3 * v * v * t * b[0] + 3 * v * t * t * c[0] + t * t * t * d[0], v * v * v * a[1] + 3 * v * v * t * b[1] + 3 * v * t * t * c[1] + t * t * t * d[1]]);
    }
    return pts;
  }

  // One band of `count` units in grid units (x along, y across, y up). Returns { line, y0, y1, x1 }.
  function band(kind, p, count) {
    const running = p.link === 'running';
    const sp = Math.max(0, p.spread);
    let line = [];
    if (kind === 'key') {
      const n = clamp(Math.round(p.turns), 2, 9);
      const unit = keyUnit(n);
      if (!running) {
        const P = n + 1 + sp;
        for (let k = 0; k < count; k++) for (const q of unit) line.push([q[0] + k * P, k & 1 ? n + 1 - q[1] : q[1]]);
      } else {
        const P = n + 2 + sp, xd = n + 1 + sp / 2; // the drop runs midway between neighbouring keys
        for (let k = 0; k < count; k++) {
          const ox = k * P;
          for (const q of unit) line.push([q[0] + ox, q[1]]);
          if (k + 1 < count) line.push([ox + xd, n + 1], [ox + xd, -1], [ox + P, -1]);
        }
      }
      line = line.filter((q, i) => i === 0 || Math.hypot(q[0] - line[i - 1][0], q[1] - line[i - 1][1]) > 1e-9);
      line = roundCorners(line, clamp(p.round, 0, 0.5));
    } else {
      const T = clamp(p.curl, 0.25, 4), Rm = RHO0 + 2 * T;
      if (!running) {
        const P = 2 * Rm + sp;
        for (let k = 0; k < count; k++) {
          const u = spiralUnit(k * P, T, k & 1 ? 1 : -1);
          line.push(...(k & 1 ? u.reverse() : u)); // clockwise units run bottom → top, the others top → bottom
        }
      } else {
        const P = 2 * Rm + 1.5 + sp, h = P * 0.55;
        for (let k = 0; k < count; k++) {
          const cx = k * P;
          line.push(...spiralUnit(cx, T, -1));
          if (k + 1 < count) line.push(...cubic([cx, Rm], [cx + h, Rm], [cx + P - h, -Rm], [cx + P, -Rm], 28).slice(1, -1));
        }
      }
    }
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of line) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
    return { line: line.map((q) => [q[0] - x0, q[1]]), x1: x1 - x0, y0, y1 };
  }

  SP.generators.meander = {
    id: 'meander',
    name: 'Meander',
    board: true,
    schema: [
      { group: 'Key' },
      { key: 'style', label: 'Style', type: 'select', def: 'key', options: [['key', 'Greek key (square)'], ['spiral', 'Running spiral (round)'], ['mix', 'Alternate rows']] },
      { key: 'turns', label: 'Key legs', min: 2, max: 9, step: 1, def: 4, int: true, rand: [3, 6], show: (o) => o.style !== 'spiral' },
      { key: 'curl', label: 'Spiral turns', min: 0.25, max: 4, step: 0.05, def: 1.25, rand: [0.75, 2], show: (o) => o.style !== 'key' },
      { key: 'link', label: 'Chain', type: 'select', def: 'alternate', options: [['alternate', 'Alternate (mirrored units)'], ['running', 'Running (same way round)']] },
      { key: 'spread', label: 'Spread (units)', min: 0, max: 6, step: 0.1, def: 0, rand: [0, 1.5] },
      { key: 'round', label: 'Corner round (× unit)', min: 0, max: 0.5, step: 0.01, def: 0.3, rand: [0, 0.5], show: (o) => o.style !== 'spiral' },
      { group: 'Line' },
      { key: 'unit', label: 'Grid unit (mm)', min: 2, max: 14, step: 0.1, def: 4.4, rand: [3.4, 6.5] },
      { key: 'weight', label: 'Line weight', min: 0.2, max: 0.8, step: 0.01, def: 0.5, rand: [0.38, 0.62] },
      { group: 'Rows' },
      { key: 'rails', label: 'Rails', type: 'bool', def: true },
      { key: 'rowGap', label: 'Row gap (units)', min: 1, max: 8, step: 0.1, def: 1.6, rand: [1, 3] },
      { key: 'rowMode', label: 'Alternate rows', type: 'select', def: 'same', options: [['same', 'Same'], ['reverse', 'Run the other way'], ['flip', 'Upside down']] },
      { key: 'vertical', label: 'Vertical bands', type: 'bool', def: false },
      { group: 'Board' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 3, step: 0.01, def: 0.25 },
      { key: 'fieldGain', label: 'Points → weight', min: -2, max: 2, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], count: 0 };
      const u = Math.max(1, p.unit);
      const hwMax = Math.max(MIN_R, (u - MIN_GAP) / 2);
      const hw = clamp((p.weight * u) / 2, MIN_R, hwMax);
      const mg = Math.max(0, p.margin);
      const vert = !!p.vertical;
      // Usable span in grid units, keeping each line's half-width inside the margin.
      const along = ((vert ? B.h : B.w) - 2 * mg - 2 * hw) / u;
      const across = ((vert ? B.w : B.h) - 2 * mg - 2 * hw) / u;
      if (along <= 1 || across <= 1) return out;
      const rails = !!p.rails;

      // Fit as many units as the band length allows: width grows linearly with the count.
      const fit = (kind) => {
        const a = band(kind, p, 1), b = band(kind, p, 2), pitch = b.x1 - a.x1;
        const c = Math.max(1, Math.floor((along - a.x1) / pitch) + 1);
        const bd = band(kind, p, c);
        return Object.assign(bd, { count: c, lo: bd.y0 - (rails ? 1 : 0), hi: bd.y1 + (rails ? 1 : 0) });
      };
      const kinds = p.style === 'mix' ? ['key', 'spiral'] : [p.style === 'spiral' ? 'spiral' : 'key'];
      const bands = kinds.map(fit);
      const gap = Math.max(1, p.rowGap);

      // Stack rows top to bottom while they fit.
      const rows = [];
      let y = 0;
      for (let r = 0; ; r++) {
        const bd = bands[r % bands.length], h = bd.hi - bd.lo;
        if (y + h > across + 1e-9 && rows.length) break;
        rows.push({ bd, top: y, r });
        y += h + gap;
        if (rows.length > 400) break;
      }
      const used = y - gap;
      const offA = Math.max(0, (across - used) / 2);

      const warp = points.length && p.fieldGain ? (x, y) => 1 + p.fieldGain * fieldAt(x, y) : null;
      const half = (x, y) => clamp(warp ? hw * warp(x, y) : hw, MIN_R, hwMax);
      const toBoard = (a, c) => {
        // a along, c across (grid units from the usable box corner) → board mm.
        const A = mg + hw + a * u, C = mg + hw + c * u;
        return vert ? [C, A] : [A, C];
      };
      const push = (pts) => {
        if (pts.length < 2) return;
        out.strokes.push({ pts, r: pts.map((q) => half(q[0], q[1])) });
      };

      for (const { bd, top, r } of rows) {
        const offB = Math.max(0, (along - bd.x1) / 2);
        const odd = r & 1;
        const rev = odd && p.rowMode === 'reverse', flip = odd && p.rowMode === 'flip';
        // Band y is "up": the band's top edge (hi) sits at `top` on the board, or its bottom edge when flipped.
        const map = (q) => toBoard(offB + (rev ? bd.x1 - q[0] : q[0]), offA + top + (flip ? q[1] - bd.lo : bd.hi - q[1]));
        push(bd.line.map(map));
        if (rails) {
          for (const ry of [bd.y0 - 1, bd.y1 + 1]) {
            const seg = [];
            const n = Math.max(2, Math.ceil(bd.x1 / 2));
            for (let i = 0; i <= n; i++) seg.push(map([(bd.x1 * i) / n, ry]));
            push(seg);
          }
        }
        out.count += bd.count;
      }

      const sep = u - 2 * hw;
      out.k = Math.min(Math.max(0.02, p.fillet), Math.max(0.02, sep * 0.35));
      return out;
    },
  };
})();
