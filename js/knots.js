// Knotwork: a Celtic knot on a grid, built as the medial graph of the grid. Every grid edge is either
// a crossing (strands pass straight over it), a wall (strands bounce off it) or a break (strands turn
// back around its ends). Strands run on the diagonals between edge midpoints, corners are filleted,
// and crossings alternate over/under — the under strand is cut with a clearance gap.
(function () {
  const SP = (window.SP = window.SP || {});
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Fillet the corners of a polyline with arcs of radius r (each corner may use at most `maxT` of a leg).
  function fillet(pts, r, maxT) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1 = [b[0] - a[0], b[1] - a[1]], d2 = [c[0] - b[0], c[1] - b[1]];
      const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
      if (l1 < 1e-9 || l2 < 1e-9) continue;
      const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2];
      const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]);
      if (Math.abs(turn) < 1e-4) { out.push(b); continue; }
      const t = Math.min(r * Math.tan(Math.abs(turn) / 2), maxT);
      if (t < 1e-6) { out.push(b); continue; }
      const rr = t / Math.tan(Math.abs(turn) / 2);
      const p1 = [b[0] - u1[0] * t, b[1] - u1[1] * t];
      const s = Math.sign(turn);
      const cen = [p1[0] - u1[1] * rr * s, p1[1] + u1[0] * rr * s];
      const a0 = Math.atan2(p1[1] - cen[1], p1[0] - cen[0]);
      const steps = Math.max(6, Math.ceil(Math.abs(turn) / 0.08));
      for (let k = 0; k <= steps; k++) {
        const aa = a0 + turn * (k / steps);
        out.push([cen[0] + rr * Math.cos(aa), cen[1] + rr * Math.sin(aa)]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Grid knot. Edges: h(i,j) joins vertex (i,j)-(i+1,j); v(i,j) joins (i,j)-(i,j+1).
  // State: 0 = crossing, 1 = wall (bounce), 2 = break (turn around the ends).
  function makeKnot(W, H, state) {
    const hId = (i, j) => j * W + i, vId = (i, j) => (H + 1) * W + j * (W + 1) + i;
    // Trace from cell (ci,cj), corner vertex (vx,vy), heading toward edge e (an edge of the cell at that corner).
    // Corner diagonal of a cell joins its horizontal and vertical edge at that vertex.
    const cornerEdges = (ci, cj, vx, vy) => [hId(ci, vy), vId(vx, cj)];
    const seen = new Set();
    const key = (ci, cj, vx, vy) => ((cj * W + ci) * 4) + (vy - cj) * 2 + (vx - ci);
    const strands = [];
    for (let cj = 0; cj < H; cj++)
      for (let ci = 0; ci < W; ci++)
        for (let k = 0; k < 4; k++) {
          const vx = ci + (k & 1), vy = cj + (k >> 1);
          if (seen.has(key(ci, cj, vx, vy))) continue;
          // Walk: we are on cell (c), corner (v), travelling from edge `from` to the other edge at v.
          let c = [ci, cj], v = [vx, vy];
          let [eh, ev] = cornerEdges(c[0], c[1], v[0], v[1]);
          let to = eh; // start by heading to the horizontal edge
          const path = [];
          for (let guard = 0; guard < 8 * W * H + 8; guard++) {
            seen.add(key(c[0], c[1], v[0], v[1]));
            // Arrive at edge `to`: find its endpoints and the neighbour cell across it.
            let other, across, mid, horiz;
            if (to < (H + 1) * W) {
              const j = Math.floor(to / W), i = to % W; horiz = true;
              other = [v[0] === i ? i + 1 : i, j];
              across = [c[0], c[1] === j ? j - 1 : j];
              mid = [i + 0.5, j];
            } else {
              const t = to - (H + 1) * W, j = Math.floor(t / (W + 1)), i = t % (W + 1); horiz = false;
              other = [i, v[1] === j ? j + 1 : j];
              across = [c[0] === i ? i - 1 : i, c[1]];
              mid = [i, j + 0.5];
            }
            const st = state[to];
            path.push({ x: mid[0], y: mid[1], cross: st === 0, horiz, edge: to });
            if (st === 0) { c = across; v = other; }
            else if (st === 1) { v = other; }
            else { c = across; }
            [eh, ev] = cornerEdges(c[0], c[1], v[0], v[1]);
            to = eh === to ? ev : eh;
            if (c[0] === ci && c[1] === cj && v[0] === vx && v[1] === vy && to === hId(ci, vy)) break;
          }
          strands.push(path);
        }
    return strands;
  }

  SP.generators.knots = {
    id: 'knots',
    name: 'Knotwork',
    board: true,
    noTween: true,
    schema: [
      { group: 'Grid' },
      { key: 'cols', label: 'Cells across', min: 1, max: 16, step: 1, def: 3, int: true, rand: [2, 5] },
      { key: 'rows', label: 'Cells down', min: 1, max: 16, step: 1, def: 3, int: true, rand: [2, 5] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 22 },
      { group: 'Knot' },
      { key: 'walls', label: 'Walls', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0.05, 0.4] },
      { key: 'breaks', label: 'Breaks', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0.05, 0.4] },
      { key: 'symmetry', label: 'Symmetry', type: 'select', def: 'xy', options: [['none', 'None'], ['x', 'Mirror left–right'], ['y', 'Mirror top–bottom'], ['xy', 'Both'], ['rot', '180° rotation']] },
      { key: 'join', label: 'Join into fewer strands', type: 'bool', def: true },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 38, int: true, rand: [1, 9999] },
      { group: 'Ribbon' },
      { key: 'width', label: 'Width (× cell)', min: 0.04, max: 0.5, step: 0.005, def: 0.2, rand: [0.12, 0.28] },
      { key: 'round', label: 'Corner rounding', min: 0, max: 1, step: 0.01, def: 1 },
      { key: 'weave', label: 'Over / under', type: 'bool', def: true },
      { key: 'gap', label: 'Crossing gap (mm)', min: 0, max: 10, step: 0.05, def: 1.6, show: (o) => o.weave },
    ],

    generateBoard(p, ctx) {
      const B = ctx.board;
      const W = Math.max(1, Math.round(p.cols)), H = Math.max(1, Math.round(p.rows));
      const s = Math.min((B.w - 2 * p.margin) / W, (B.h - 2 * p.margin) / H);
      const ox = B.w / 2 - (W * s) / 2, oy = B.h / 2 - (H * s) / 2;
      const nE = (H + 1) * W + H * (W + 1);
      const hId = (i, j) => j * W + i, vId = (i, j) => (H + 1) * W + j * (W + 1) + i;
      // Symmetry orbits of interior edges.
      const images = (e) => {
        let hz, i, j;
        if (e < (H + 1) * W) { hz = true; j = Math.floor(e / W); i = e % W; } else { hz = false; const t = e - (H + 1) * W; j = Math.floor(t / (W + 1)); i = t % (W + 1); }
        const out = [e];
        const mx = () => (hz ? hId(W - 1 - i, j) : vId(W - i, j));
        const my = () => (hz ? hId(i, H - j) : vId(i, H - 1 - j));
        const mr = () => (hz ? hId(W - 1 - i, H - j) : vId(W - i, H - 1 - j));
        if (p.symmetry === 'x' || p.symmetry === 'xy') out.push(mx());
        if (p.symmetry === 'y' || p.symmetry === 'xy') out.push(my());
        if (p.symmetry === 'xy' || p.symmetry === 'rot') out.push(mr());
        return out;
      };
      const boundary = (e) => {
        if (e < (H + 1) * W) { const j = Math.floor(e / W); return j === 0 || j === H; }
        const i = (e - (H + 1) * W) % (W + 1); return i === 0 || i === W;
      };
      const rand = rng(p.seed * 2654435761 + 11);
      const state = new Uint8Array(nE);
      const orbits = [];
      const done = new Uint8Array(nE);
      for (let e = 0; e < nE; e++) {
        if (boundary(e)) { state[e] = 1; continue; }
        if (done[e]) continue;
        const orb = [...new Set(images(e))];
        orb.forEach((q) => (done[q] = 1));
        orbits.push(orb);
      }
      const pick = () => { const r = rand(); return r < p.walls ? 1 : r < p.walls + p.breaks ? 2 : 0; };
      for (const orb of orbits) { const st = pick(); for (const q of orb) state[q] = st; }
      let strands = makeKnot(W, H, state);
      // Join: random single-orbit changes that never increase the strand count (keeps the wall/break mix).
      if (p.join && orbits.length) {
        for (let it = 0; it < 60 * orbits.length && strands.length > 1; it++) {
          const orb = orbits[Math.floor(rand() * orbits.length)], old = state[orb[0]];
          const st = pick();
          if (st === old) continue;
          for (const q of orb) state[q] = st;
          const next = makeKnot(W, H, state);
          if (next.length <= strands.length) strands = next;
          else for (const q of orb) state[q] = old;
        }
      }

      const r = (p.width * s) / 2, gap = p.weave ? p.gap : 0;
      const leg = s * Math.SQRT1_2; // midpoint-to-midpoint diagonal
      const hl = r, postHalf = hl + r + gap; // cutter half-length, post half-length along the over strand
      const maxT = Math.max(0, Math.min(leg / 2, leg - (p.weave ? postHalf + r : 0)));
      const rho = p.round * leg; // requested fillet radius (tangent length is clamped by maxT)
      const world = (q) => [ox + q.x * s, oy + q.y * s];
      const out = { strokes: [], blobs: [], cuts: [], post: [], count: strands.length, k: 0.05, ks: 0.15, kPost: 0 };
      for (const path of strands) {
        const n = path.length;
        if (n < 2) continue;
        // Open the loop mid-leg so no corner sits at the seam.
        const P = path.map(world);
        const start = [(P[0][0] + P[1][0]) / 2, (P[0][1] + P[1][1]) / 2];
        const poly = [start];
        for (let i = 1; i <= n; i++) poly.push(P[i % n]);
        poly.push(start);
        const pts = fillet(poly, rho, maxT);
        out.strokes.push({ pts, r: pts.map(() => r) });
        if (!p.weave) continue;
        for (let i = 0; i < n; i++) {
          const q = path[i];
          if (!q.cross) continue;
          const a = P[(i - 1 + n) % n], b = P[(i + 1) % n], m = P[i];
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
          // Alternating rule: the "\" strand is over on horizontal edges, the "/" strand on vertical ones.
          const over = q.horiz ? ux * uy > 0 : ux * uy < 0;
          if (!over) continue;
          out.cuts.push({ pts: [[m[0] - ux * hl, m[1] - uy * hl], [m[0] + ux * hl, m[1] + uy * hl]], r: [r + gap, r + gap] });
          out.post.push({ pts: [[m[0] - ux * postHalf, m[1] - uy * postHalf], [m[0] + ux * postHalf, m[1] + uy * postHalf]], r: [r, r] });
        }
      }
      return out;
    },
  };
})();
