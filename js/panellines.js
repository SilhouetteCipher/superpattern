// Panel Lines: scribed lines that break a large surface into panels. The board is split recursively
// (binary space partition) and every split is drawn as a thin line rather than a gap, so most of the
// surface stays plain. Lines get thinner with depth, some step sideways (jogs), some stop short
// (stubs), and the heaviest ones can be drawn as a double seam. Panels can carry an inner outline,
// an access hatch and corner dots. Lines that end on a jogged or doubled line snap to where it really
// runs, so junctions stay clean. Field points make the partition finer around them.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Closed rounded-rectangle polyline (first point repeated at the end).
  function rrect(x0, y0, x1, y1, r) {
    r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
    if (r <= 1e-6) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
    const pts = [], K = Math.max(3, Math.ceil((r * Math.PI) / 2 / 0.5));
    const corner = (cx, cy, a0) => { for (let k = 0; k <= K; k++) { const t = a0 + (Math.PI / 2) * (k / K); pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } };
    corner(x1 - r, y0 + r, -Math.PI / 2); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI);
    pts.push(pts[0]);
    return pts;
  }

  SP.generators.panellines = {
    id: 'panellines',
    name: 'Panel Lines',
    board: true,
    schema: [
      { group: 'Partition' },
      { key: 'splits', label: 'Split depth', min: 1, max: 10, step: 1, def: 6, int: true, rand: [4, 8] },
      { key: 'minSize', label: 'Min panel (mm)', min: 4, max: 80, step: 0.5, def: 14, rand: [8, 26] },
      { key: 'stop', label: 'Stop early', min: 0, max: 0.7, step: 0.01, def: 0.15, rand: [0.05, 0.35] },
      { key: 'border', label: 'Border line', type: 'bool', def: true },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 3, int: true, rand: [1, 9999] },
      { group: 'Lines' },
      { key: 'wMajor', label: 'Major width (mm)', min: 0.4, max: 8, step: 0.05, def: 1.6, rand: [1, 2.6] },
      { key: 'wMinor', label: 'Minor width (mm)', min: 0.3, max: 6, step: 0.05, def: 0.8, rand: [0.5, 1.2] },
      { key: 'jog', label: 'Jog chance', min: 0, max: 1, step: 0.01, def: 0.3, rand: [0.1, 0.5] },
      { key: 'jogSize', label: 'Jog size (mm)', min: 0.5, max: 20, step: 0.1, def: 4, rand: [2, 7] },
      { key: 'stub', label: 'Stub chance', min: 0, max: 1, step: 0.01, def: 0.12, rand: [0, 0.3] },
      { key: 'double', label: 'Double seam chance', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0, 0.5] },
      { key: 'doubleGap', label: 'Double gap (mm)', min: 0.8, max: 10, step: 0.1, def: 2.4, rand: [1.5, 4] },
      { group: 'Panel details' },
      { key: 'outlineChance', label: 'Inner outline chance', min: 0, max: 1, step: 0.01, def: 0.2, rand: [0, 0.4] },
      { key: 'outlineInset', label: 'Outline inset (mm)', min: 1, max: 15, step: 0.1, def: 3, rand: [2, 5] },
      { key: 'hatchChance', label: 'Hatch chance', min: 0, max: 1, step: 0.01, def: 0.15, rand: [0, 0.35] },
      { key: 'hatchRound', label: 'Hatch round (mm)', min: 0, max: 8, step: 0.1, def: 1.5, rand: [0.5, 3] },
      { key: 'dotChance', label: 'Corner dots chance', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0, 0.5] },
      { key: 'dotR', label: 'Dot radius (mm)', min: 0.3, max: 3, step: 0.05, def: 0.7, rand: [0.5, 1.1] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.1, rand: [0.05, 0.3] },
      { group: 'Field' },
      { key: 'fieldSplit', label: 'Points → finer panels', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 29);
      const mg = p.margin, X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg;
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const depthMax = Math.max(1, Math.round(p.splits) - 1);
      const widthAt = (d) => p.wMajor + (p.wMinor - p.wMajor) * Math.min(1, d / depthMax);
      // The largest sideways offset any line can take, so splits keep clear of a parent's jog or double seam.
      const jogCap = Math.min(p.jogSize, 0.4 * p.minSize);
      const clear = Math.max(jogCap, p.doubleGap / 2) + p.wMajor;
      // Split lines, keyed by axis and coordinate, so a child line can snap its end to the real position.
      const lines = []; // { v: bool, c, a, b, end (stub limit, or Infinity), j, u0, u1, half }
      const at = (L, u, side) => {
        if (L.end !== null && (L.stubLo ? u < L.end : u > L.end)) return null; // trimmed away by a stub
        return L.c + (u > L.u0 && u < L.u1 ? L.j : 0) + side * L.half;
      };
      const snap = (vertical, c, u, side) => {
        // A horizontal line (vertical=false) ending at x=c looks for a vertical parent line at c covering y=u.
        for (const L of lines) {
          if (L.v !== vertical || Math.abs(L.c - c) > 1e-6 || u < L.a - 1e-6 || u > L.b + 1e-6) continue;
          const r = at(L, u, side);
          return r === null ? c : r;
        }
        return c;
      };
      const stroke = (pts, w) => out.strokes.push({ pts, r: pts.map(() => w / 2) });
      const leaves = [];

      const split = (x0, y0, x1, y1, depth) => {
        const w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
        const fm = points.length && p.fieldSplit ? Math.max(0.2, 1 - p.fieldSplit * fieldAt(cx, cy)) : 1;
        const minS = Math.max(p.minSize * fm, clear);
        const can = Math.max(w, h) >= 2 * minS + 1;
        if (depth >= p.splits || !can || (depth >= 2 && rand() < p.stop)) { leaves.push([x0, y0, x1, y1, depth]); return; }
        const vertical = w > h * 1.15 || (Math.abs(w - h) <= h * 0.15 && rand() < 0.5);
        const len = vertical ? w : h, span = vertical ? h : w;
        const lo = minS / len, hi = 1 - minS / len;
        const t = lo + (hi - lo) * (0.25 + 0.5 * rand());
        const c = vertical ? x0 + w * t : y0 + h * t;
        const a = vertical ? y0 : x0, b = vertical ? y1 : x1;
        // Line record: double seam (major lines only), jog, stub.
        const L = { v: vertical, c, a, b, end: null, stubLo: false, j: 0, u0: Infinity, u1: Infinity, half: 0 };
        if (depth <= 1 && rand() < p.double && span > 4 * p.doubleGap) L.half = p.doubleGap / 2;
        const room = span - 2 * minS;
        if (rand() < p.jog && room > 2 * jogCap + 2) {
          L.j = (rand() < 0.5 ? -1 : 1) * jogCap * (0.5 + 0.5 * rand());
          L.u0 = a + minS + rand() * room;
          if (rand() < 0.5) L.u1 = Math.min(b - minS, L.u0 + Math.max(Math.abs(L.j) * 1.5, 3) + rand() * room * 0.5);
          if (L.u1 - L.u0 < Math.abs(L.j)) L.u1 = Infinity;
        }
        if (depth >= 1 && rand() < p.stub) { L.stubLo = rand() < 0.5; const cut = span * (0.15 + 0.35 * rand()); L.end = L.stubLo ? a + cut : b - cut; }
        lines.push(L);
        // Draw it: one or two polylines following the jog, trimmed by the stub, ends snapped to the parents.
        const wd = widthAt(depth);
        const lo0 = L.stubLo ? L.end : a, hi0 = L.end !== null && !L.stubLo ? L.end : b;
        const offs = L.half ? [-L.half, L.half] : [0];
        for (const o of offs) {
          const P = [];
          const X = (u) => L.c + o + (u > L.u0 && u < L.u1 ? L.j : 0);
          const toPt = (u, x) => (vertical ? [x, u] : [u, x]);
          // Ends snap to the parent line they land on (only if not trimmed by a stub).
          const eLo = L.stubLo ? lo0 : snap(!vertical, a, X(a), 1), eHi = L.end !== null && !L.stubLo ? hi0 : snap(!vertical, b, X(b), -1);
          P.push(toPt(eLo, X(lo0)));
          if (L.u0 > lo0 && L.u0 < hi0) { P.push(toPt(L.u0, L.c + o)); P.push(toPt(L.u0, L.c + o + L.j)); }
          if (L.u1 > lo0 && L.u1 < hi0) { P.push(toPt(L.u1, L.c + o + L.j)); P.push(toPt(L.u1, L.c + o)); }
          P.push(toPt(eHi, X(hi0)));
          stroke(P, L.half ? Math.min(wd, p.wMinor * 1.2) : wd);
        }
        out.count++;
        if (vertical) { split(x0, y0, c, y1, depth + 1); split(c, y0, x1, y1, depth + 1); }
        else { split(x0, y0, x1, c, depth + 1); split(x0, c, x1, y1, depth + 1); }
      };
      split(X0, Y0, X1, Y1, 0);
      if (p.border) { stroke([[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0]], p.wMajor); out.count++; }

      // Panel details inside the leaves (kept clear of the lines on their edges).
      for (const [x0, y0, x1, y1] of leaves) {
        const pad = p.wMajor / 2 + 0.5 + (p.jog > 0 ? jogCap : 0);
        const ix0 = x0 + pad, iy0 = y0 + pad, ix1 = x1 - pad, iy1 = y1 - pad;
        const w = ix1 - ix0, h = iy1 - iy0;
        if (w < 3 || h < 3) continue;
        const roll = rand();
        if (roll < p.outlineChance && Math.min(w, h) > 2 * p.outlineInset + 3) {
          const i = p.outlineInset;
          stroke(rrect(ix0 + i, iy0 + i, ix1 - i, iy1 - i, Math.min(p.hatchRound, 2)), p.wMinor);
        } else if (roll < p.outlineChance + p.hatchChance && Math.min(w, h) > 8) {
          const hw = w * (0.3 + 0.35 * rand()), hh = h * (0.3 + 0.35 * rand());
          const hx = ix0 + 1.5 + rand() * (w - hw - 3), hy = iy0 + 1.5 + rand() * (h - hh - 3);
          stroke(rrect(hx, hy, hx + hw, hy + hh, p.hatchRound), p.wMinor);
          if (rand() < 0.5 && hw > 6 * p.dotR && hh > 6 * p.dotR) {
            const o = p.dotR * 2;
            out.blobs.push({ x: hx + o, y: hy + o, r: p.dotR }, { x: hx + hw - o, y: hy + hh - o, r: p.dotR });
          }
        }
        if (rand() < p.dotChance && Math.min(w, h) > 6 * p.dotR) {
          const o = p.dotR * 1.5;
          out.blobs.push({ x: ix0 + o, y: iy0 + o, r: p.dotR }, { x: ix1 - o, y: iy0 + o, r: p.dotR }, { x: ix1 - o, y: iy1 - o, r: p.dotR }, { x: ix0 + o, y: iy1 - o, r: p.dotR });
        }
      }
      return out;
    },
  };
})();
