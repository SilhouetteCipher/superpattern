// Hull Panels: sci-fi plating. The board is split recursively into rectangular panels (binary space
// partition, always across the longer side), separated by an even gap. Each panel can get chamfered
// corners, an inset frame (rim · gap · inner plate), a row of vent slots, and rivet holes in its corners.
// Field points make the partition finer around them. The field is an exact signed distance (1-Lipschitz):
// a union of convex panel polygons with slots and rivets subtracted.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Exact signed distance to a convex polygon (CCW in screen space: inside = left of every edge).
  function polyDist(V, x, y) {
    let d = Infinity, inside = true;
    const n = V.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = V[i], [bx, by] = V[(i + 1) % n];
      const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay, l2 = ex * ex + ey * ey || 1e-12;
      const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / l2));
      d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
      if (ex * wy - ey * wx < 0) inside = false;
    }
    return inside ? -d : d;
  }
  // Inset a convex CCW polygon by r; null if it folds over.
  function inset(V, r) {
    const n = V.length, L = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = V[i], [bx, by] = V[(i + 1) % n], l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-9) continue;
      L.push([ax - ((by - ay) / l) * r, ay + ((bx - ax) / l) * r, (bx - ax) / l, (by - ay) / l]);
    }
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const [px, py, dx, dy] = L[(i - 1 + L.length) % L.length], [qx, qy, ex, ey] = L[i];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((qx - px) * ey - (qy - py) * ex) / den;
      out.push([px + dx * t, py + dy * t]);
    }
    let area = 0;
    for (let i = 0; i < out.length; i++) { const [ax, ay] = out[i], [bx, by] = out[(i + 1) % out.length]; area += ax * by - bx * ay; }
    return out.length >= 3 && area > 1e-6 ? out : null;
  }
  const segDist = (x, y, ax, ay, bx, by) => {
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey || 1e-12;
    const t = Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / l2));
    return Math.hypot(x - ax - ex * t, y - ay - ey * t);
  };

  SP.generators.panels = {
    id: 'panels',
    name: 'Hull Panels',
    board: true,
    schema: [
      { group: 'Partition' },
      { key: 'splits', label: 'Split depth', min: 1, max: 9, step: 1, def: 5, int: true, rand: [4, 7] },
      { key: 'minSize', label: 'Min panel (mm)', min: 4, max: 80, step: 0.5, def: 16, rand: [10, 28] },
      { key: 'stop', label: 'Stop early', min: 0, max: 0.7, step: 0.01, def: 0.18, rand: [0.05, 0.35] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Panel shape' },
      { key: 'gap', label: 'Gap (mm)', min: 0.4, max: 10, step: 0.05, def: 2, rand: [1.2, 3.5] },
      { key: 'chamfer', label: 'Chamfer size', min: 0, max: 1, step: 0.01, def: 0.35, rand: [0.15, 0.6] },
      { key: 'chamferChance', label: 'Chamfer chance', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0.2, 0.8] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 4, step: 0.05, def: 0.5, rand: [0.2, 1.2] },
      { group: 'Details' },
      { key: 'insetChance', label: 'Inset frame chance', min: 0, max: 1, step: 0.01, def: 0.3, rand: [0.1, 0.5] },
      { key: 'rim', label: 'Frame rim (mm)', min: 0.6, max: 12, step: 0.1, def: 3, rand: [2, 5] },
      { key: 'insetGap', label: 'Frame gap (mm)', min: 0.4, max: 6, step: 0.05, def: 1.5, rand: [1, 2.5] },
      { key: 'ventChance', label: 'Vent chance', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0.1, 0.45] },
      { key: 'slotW', label: 'Slot width (mm)', min: 0.5, max: 6, step: 0.05, def: 1.6, rand: [1, 2.5] },
      { key: 'slotPitch', label: 'Slot pitch (mm)', min: 1.5, max: 14, step: 0.1, def: 4, rand: [3, 6] },
      { key: 'rivetChance', label: 'Rivet chance', min: 0, max: 1, step: 0.01, def: 0.4, rand: [0.1, 0.7] },
      { key: 'rivetR', label: 'Rivet radius (mm)', min: 0.3, max: 3, step: 0.05, def: 0.9, rand: [0.6, 1.4] },
      { group: 'Field' },
      { key: 'fieldSplit', label: 'Points → finer panels', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 11);
      const mg = p.margin, g2 = p.gap / 2;
      const X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg;
      // Binary space partition. Field points lower the local minimum size so panels get finer near them.
      const leaves = [];
      const split = (x0, y0, x1, y1, depth) => {
        const w = x1 - x0, h = y1 - y0;
        const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const fm = points.length && p.fieldSplit ? Math.max(0.2, 1 - p.fieldSplit * fieldAt(cx, cy)) : 1;
        const minS = p.minSize * fm;
        const can = Math.max(w, h) >= 2 * minS + p.gap;
        if (depth >= p.splits || !can || (depth >= 2 && rand() < p.stop)) { leaves.push([x0, y0, x1, y1]); return; }
        // Split the longer side (the shorter one occasionally, to avoid pure stripes).
        const vertical = w > h * 1.15 || (Math.abs(w - h) <= h * 0.15 && rand() < 0.5);
        const len = vertical ? w : h;
        const lo = minS / len, hi = 1 - minS / len;
        const t = lo + (hi - lo) * (0.25 + 0.5 * rand());
        if (vertical) { split(x0, y0, x0 + w * t, y1, depth + 1); split(x0 + w * t, y0, x1, y1, depth + 1); }
        else { split(x0, y0, x1, y0 + h * t, depth + 1); split(x0, y0 + h * t, x1, y1, depth + 1); }
      };
      split(X0, Y0, X1, Y1, 0);

      // Build each panel: shrink by half the gap, chamfer corners, pick details.
      const panels = [];
      for (const [ax, ay, bx, by] of leaves) {
        const x0 = ax + g2, y0 = ay + g2, x1 = bx - g2, y1 = by - g2;
        const w = x1 - x0, h = y1 - y0;
        if (w < 1 || h < 1) continue;
        const cmax = Math.min(w, h) * 0.5 * p.chamfer;
        const c = [0, 1, 2, 3].map(() => (rand() < p.chamferChance ? cmax * (0.5 + 0.5 * rand()) : 0));
        // CCW in screen space (y down) = visually clockwise: TL → TR → BR → BL.
        const V = [];
        const push = (x, y) => { if (!V.length || Math.hypot(x - V[V.length - 1][0], y - V[V.length - 1][1]) > 1e-6) V.push([x, y]); };
        push(x0 + c[0], y0); push(x1 - c[1], y0); if (c[1]) push(x1, y0 + c[1]);
        push(x1, y1 - c[2]); if (c[2]) push(x1 - c[2], y1);
        push(x0 + c[3], y1); if (c[3]) push(x0, y1 - c[3]);
        if (c[0]) push(x0, y0 + c[0]);
        const r = Math.min(p.round, Math.min(w, h) * 0.2);
        const Vi = r > 0 ? inset(V, r) : null;
        const P = { V: Vi || V, r: Vi ? r : 0, bb: [x0, y0, x1, y1], cuts: [], frame: 0 };
        const small = Math.min(w, h);
        // Inset frame: rim · gap · inner plate (needs room for all three).
        if (rand() < p.insetChance && small > 2 * (p.rim + p.insetGap) + 3) P.frame = 1;
        // Vent slots across the shorter axis, in the inner plate if there is one.
        const inner = P.frame ? p.rim + p.insetGap : 0;
        const iw = w - 2 * inner, ih = h - 2 * inner;
        if (rand() < p.ventChance && Math.min(iw, ih) > p.slotW * 2 + 2 && Math.max(iw, ih) > p.slotPitch * 2) {
          const horiz = iw >= ih; // slots run across the short axis, repeating along the long one
          const run = horiz ? iw : ih, span = (horiz ? ih : iw) * 0.6;
          const n = Math.max(2, Math.floor((run - 2) / p.slotPitch));
          const start = (horiz ? x0 + inner : y0 + inner) + (run - (n - 1) * p.slotPitch) / 2;
          const mid = horiz ? y0 + h / 2 : x0 + w / 2;
          const rr = p.slotW / 2, hs = Math.max(0, span / 2 - rr);
          for (let i = 0; i < n; i++) {
            const u = start + i * p.slotPitch;
            P.cuts.push(horiz ? [u, mid - hs, u, mid + hs, rr] : [mid - hs, u, mid + hs, u, rr]);
          }
        }
        // Rivets sit in the corners of the outer plate, pulled in past any chamfer.
        if (rand() < p.rivetChance && small > 6 * p.rivetR + 2) {
          const d = p.rivetR * 2.2;
          const corners = [[x0 + d + c[0] * 0.5, y0 + d + c[0] * 0.5], [x1 - d - c[1] * 0.5, y0 + d + c[1] * 0.5], [x1 - d - c[2] * 0.5, y1 - d - c[2] * 0.5], [x0 + d + c[3] * 0.5, y1 - d - c[3] * 0.5]];
          for (const [qx, qy] of corners) if (polyDist(V, qx, qy) < -p.rivetR - 0.6) P.cuts.push([qx, qy, qx, qy, p.rivetR]);
        }
        panels.push(P);
      }

      // Bins: each panel is registered in every bin its box (grown by S) touches, so a query that finds
      // nothing in its bin is at least S from every panel and may safely return S.
      const S = Math.max(4, p.gap * 2 + 2);
      const bins = new Map(), bk = (i, j) => i + ',' + j;
      panels.forEach((P, k) => {
        const [x0, y0, x1, y1] = P.bb;
        for (let j = Math.floor((y0 - S) / S); j <= Math.floor((y1 + S) / S); j++)
          for (let i = Math.floor((x0 - S) / S); i <= Math.floor((x1 + S) / S); i++) {
            const key = bk(i, j); (bins.get(key) || bins.set(key, []).get(key)).push(k);
          }
      });
      const panelSDF = (P, x, y) => {
        let f = polyDist(P.V, x, y) - P.r;
        if (P.frame) {
          // Rim (outer band of width rim) ∪ inner plate (everything deeper than rim + gap).
          f = Math.min(Math.max(f, -(f + p.rim)), f + p.rim + p.insetGap);
        }
        for (const [ax, ay, bx, by, r] of P.cuts) f = Math.max(f, r - segDist(x, y, ax, ay, bx, by));
        return f;
      };
      const evalFn = (x, y) => {
        const L = bins.get(bk(Math.floor(x / S), Math.floor(y / S)));
        let f = S;
        if (L) for (const k of L) f = Math.min(f, panelSDF(panels[k], x, y));
        return f;
      };
      return { evalFn, domain: { x0: X0 - 2, y0: Y0 - 2, x1: X1 + 2, y1: Y1 + 2 }, count: panels.length };
    },
  };
})();
