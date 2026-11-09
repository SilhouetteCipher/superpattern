// Chainmail: maille weaves seen from above, built by the armourer's linking rules rather than drawn. Japanese
// weaves are flat: large rings sit on a lattice (square for 4-in-1, triangular for 6-in-1, honeycomb for the
// 3-link lace) and every lattice edge gets a small connector ring standing on edge, so from above it reads as an
// ellipse squashed across the link. European 4-in-1 is rows of tilted rings, alternate rows leaning opposite
// ways, each ring passing through two in the row above and two below. Rings are closed loops of wire; wherever
// two rings cross, one passes over and one under. A linked pair crosses twice, so the rule is "over at one
// crossing, under at the other": crossings are ranked by their side of the line between the two centres (the chirality
// setting flips it, or alternates it by link direction). The under-wire is cut back around every crossing it
// passes beneath, clear of the over-wire by "Crossing gap", so the relief reads as interlocked rings. Missing
// rings (random holes, or field points) drop out of the mesh along with any connector that loses a partner.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Closed polyline of an ellipse (semi-axes a along `rot`, b across), sampled about every `step` mm.
  function ellipse(cx, cy, a, b, rot, step) {
    const n = Math.max(32, Math.ceil((Math.PI * (a + b)) / step));
    const c = Math.cos(rot), s = Math.sin(rot), pts = [];
    for (let k = 0; k < n; k++) {
      const t = (2 * Math.PI * k) / n, x = a * Math.cos(t), y = b * Math.sin(t);
      pts.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return pts;
  }

  // All crossings of two closed polylines: point, arc position on each, and the crossing angle's sine.
  function crossings(A, B) {
    const hits = [];
    const na = A.pts.length, nb = B.pts.length;
    for (let i = 0; i < na; i++) {
      const p = A.pts[i], q = A.pts[(i + 1) % na];
      const rx = q[0] - p[0], ry = q[1] - p[1];
      for (let j = 0; j < nb; j++) {
        const u = B.pts[j], v = B.pts[(j + 1) % nb];
        const sx = v[0] - u[0], sy = v[1] - u[1];
        const den = rx * sy - ry * sx;
        if (Math.abs(den) < 1e-12) continue;
        const wx = u[0] - p[0], wy = u[1] - p[1];
        const t = (wx * sy - wy * sx) / den, w = (wx * ry - wy * rx) / den;
        if (t < 0 || t >= 1 || w < 0 || w >= 1) continue;
        const la = Math.hypot(rx, ry), lb = Math.hypot(sx, sy);
        hits.push({ x: p[0] + rx * t, y: p[1] + ry * t, sa: A.acc[i] + la * t, sb: B.acc[j] + lb * w, sin: Math.abs(den) / (la * lb) });
      }
    }
    return hits;
  }

  SP.generators.chainmail = {
    id: 'chainmail',
    name: 'Chainmail',
    board: true,
    schema: [
      { group: 'Weave' },
      { key: 'weave', label: 'Weave', type: 'select', def: 'jp6', options: [['jp6', 'Japanese 6-in-1'], ['jp4', 'Japanese 4-in-1'], ['lace', 'Hex lace (3 links)'], ['euro', 'European 4-in-1']] },
      { key: 'size', label: 'Ring diameter (mm)', min: 6, max: 50, step: 0.1, def: 22, rand: [14, 28] },
      { key: 'spacing', label: 'Ring spacing', min: 1, max: 1.8, step: 0.01, def: 1.12, rand: [1.04, 1.3] },
      { key: 'link', label: 'Link reach', min: 0.15, max: 0.8, step: 0.01, def: 0.38, rand: [0.25, 0.55] },
      { key: 'flat', label: 'Ring roundness', min: 0.25, max: 1, step: 0.01, def: 0.5, rand: [0.35, 0.8] },
      { key: 'lean', label: 'Row lean °', min: 0, max: 45, step: 0.5, def: 20, rand: [8, 32], show: (o) => o.weave === 'euro' },
      { key: 'rotate', label: 'Rotate °', min: -90, max: 90, step: 0.5, def: 0, rand: [-30, 30] },
      { group: 'Wire' },
      { key: 'wire', label: 'Wire (mm)', min: 0.6, max: 5, step: 0.05, def: 1.5, rand: [1.1, 2.2] },
      { key: 'gap', label: 'Crossing gap (mm)', min: 0.3, max: 4, step: 0.05, def: 0.8, rand: [0.6, 1.4] },
      { key: 'chirality', label: 'Over/under', type: 'select', def: 'right', options: [['right', 'Right-handed'], ['left', 'Left-handed'], ['alt', 'Alternate by link']] },
      { group: 'Layout' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'holes', label: 'Missing rings', min: 0, max: 0.6, step: 0.01, def: 0, rand: [0, 0.25] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 23, int: true, rand: [1, 9999] },
      { group: 'Field points' },
      { key: 'fieldHoles', label: 'Points → holes', min: 0, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 5);
      const fv = (x, y) => (points.length ? fieldAt(x, y) : 0);
      const R = Math.max(2, p.size / 2);
      // Wire never so thick that a ring's hole closes up (inner radius ≥ 0.6 mm across the narrow axis).
      const wire = clamp(p.wire, 0.6, Math.max(0.6, R * Math.max(0.25, p.flat) - 0.6));
      const hw = wire / 2, step = clamp(R / 12, 0.35, 1);
      const cx0 = B.w / 2, cy0 = B.h / 2, rot = p.rotate * D2R, cr = Math.cos(rot), sr = Math.sin(rot);
      const place = (x, y) => [cx0 + x * cr - y * sr, cy0 + x * sr + y * cr];
      const x0 = p.margin, y0 = p.margin, x1 = B.w - p.margin, y1 = B.h - p.margin;
      const inside = (x, y, e) => x - e >= x0 && x + e <= x1 && y - e >= y0 && y + e <= y1;
      const span = Math.hypot(B.w, B.h) / 2 + 2 * R;
      const dropped = (x, y) => rand() < p.holes || (p.fieldHoles > 0 && fv(x, y) > 1 - p.fieldHoles);
      const rings = [];
      const addRing = (x, y, a, b, ang, kind) => {
        const pts = ellipse(x, y, a, b, ang, step), acc = [0];
        for (let k = 1; k <= pts.length; k++) acc.push(acc[k - 1] + Math.hypot(pts[k % pts.length][0] - pts[k - 1][0], pts[k % pts.length][1] - pts[k - 1][1]));
        rings.push({ x, y, ext: Math.max(a, b) + hw, pts, acc, kind });
      };

      if (p.weave === 'euro') {
        // Rows of rings, long axis across the rows, leaning ±lean on alternate rows. In-row neighbours and rings two
        // rows apart are kept clear; each ring overlaps its four diagonal neighbours.
        const a = R, b = R * clamp(p.flat, 0.25, 1), L = p.lean * D2R;
        const ex = Math.sqrt((b * Math.cos(L)) ** 2 + (a * Math.sin(L)) ** 2), ey = Math.sqrt((a * Math.cos(L)) ** 2 + (b * Math.sin(L)) ** 2);
        // Row pitch shrinks as reach grows, so diagonal neighbours overlap deeply (crossing near their middles, not
        // grazing at the tips, which would leave every ring cut away top and bottom).
        const dx = Math.max(2 * ex + wire + p.gap, 2 * ex * p.spacing);
        const dy = Math.max(ey + hw + p.gap / 2 + 0.1, ey * (1.45 - 0.6 * clamp(p.link, 0.15, 0.8)));
        const nj = Math.ceil(span / dy), ni = Math.ceil(span / dx) + 1;
        for (let j = -nj; j <= nj; j++)
          for (let i = -ni; i <= ni; i++) {
            const odd = ((j % 2) + 2) % 2;
            const [x, y] = place(i * dx + (odd ? dx / 2 : 0), j * dy);
            if (!inside(x, y, Math.max(a, b) + hw) || dropped(x, y)) continue;
            addRing(x, y, a, b, Math.PI / 2 + (odd ? L : -L) + rot, 'big');
          }
      } else {
        // Lattice of big rings plus a connector on every edge. Spacing keeps neighbouring big rings clear.
        const s = Math.max(2 * R * p.spacing, 2 * R + wire + p.gap);
        const nodes = new Map(), edges = [];
        const key = (q, r) => q + ',' + r;
        const n = Math.ceil(span / (s * 0.85)) + 1;
        let pos, nbr, keep = () => true;
        if (p.weave === 'jp4') {
          pos = (q, r) => [q * s, r * s];
          nbr = [[1, 0], [0, 1]];
        } else {
          // Triangular lattice in axial coordinates; the lace drops one of its three sublattices to leave a honeycomb.
          pos = (q, r) => [(q + r / 2) * s, r * s * (Math.sqrt(3) / 2)];
          nbr = [[1, 0], [0, 1], [-1, 1]];
          if (p.weave === 'lace') keep = (q, r) => (((q - r) % 3) + 3) % 3 !== 0;
        }
        for (let r = -n * 2; r <= n * 2; r++)
          for (let q = -n * 2; q <= n * 2; q++) {
            if (!keep(q, r)) continue;
            const [lx, ly] = pos(q, r);
            if (Math.abs(lx) > span + s || Math.abs(ly) > span + s) continue;
            const [x, y] = place(lx, ly);
            if (!inside(x, y, R + hw) || dropped(x, y)) continue;
            nodes.set(key(q, r), { x, y });
          }
        for (const [k, A] of nodes) {
          const [q, r] = k.split(',').map(Number);
          addRing(A.x, A.y, R, R, 0, 'big');
          for (const [dq, dr] of nbr) {
            const Bn = nodes.get(key(q + dq, r + dr));
            if (Bn) edges.push([A, Bn]);
          }
        }
        // Connector: an ellipse along the link, long enough to reach `link`·R past each big ring's wire centre,
        // squashed by roundness (a ring standing on edge seen from above) but always keeping an open hole.
        const reach = s / 2 - R + clamp(p.link, 0.15, 0.8) * R;
        const cb = Math.max(wire + 0.6, Math.min(reach, reach * clamp(p.flat, 0.25, 1)));
        for (const [A, Bn] of edges) addRing((A.x + Bn.x) / 2, (A.y + Bn.y) / 2, reach, cb, Math.atan2(Bn.y - A.y, Bn.x - A.x), 'link');
      }

      // Crossings between every pair of rings that come close; the side of the centre line picks who is on top.
      const cuts = rings.map(() => []);
      const sign = p.chirality === 'left' ? -1 : 1;
      for (let i = 0; i < rings.length; i++)
        for (let j = i + 1; j < rings.length; j++) {
          const A = rings[i], Bq = rings[j];
          const ddx = Bq.x - A.x, ddy = Bq.y - A.y;
          if (Math.hypot(ddx, ddy) > A.ext + Bq.ext) continue;
          const flip = p.chirality === 'alt' ? (ddx * ddy >= 0 ? 1 : -1) : sign;
          // Rank the crossings by their side of the centre line and alternate, so a linked pair always gets one
          // over and one under even when both crossings fall on the same side (leaning European rings).
          const hs = crossings(A, Bq).map((h) => Object.assign(h, { side: flip * (ddx * (h.y - A.y) - ddy * (h.x - A.x)) }));
          hs.sort((u, v) => v.side - u.side);
          hs.forEach((h, k) => {
            const aOver = k % 2 === 0;
            // Cut back the under wire so its round end clears the over wire by `gap` along a slanted crossing.
            const cut = hw / Math.max(0.3, h.sin) + hw + p.gap;
            if (aOver) cuts[j].push({ s: h.sb, cut });
            else cuts[i].push({ s: h.sa, cut });
          });
        }

      const out = { strokes: [], blobs: [], count: rings.length, k: Math.min(0.4, wire * 0.25), ks: 0.15 };
      const rOf = () => hw;
      rings.forEach((g, gi) => {
        const total = g.acc[g.pts.length], N = g.pts.length;
        const at = (sv) => {
          sv = ((sv % total) + total) % total;
          let lo = 0, hi = N;
          while (hi - lo > 1) { const m = (lo + hi) >> 1; if (g.acc[m] <= sv) lo = m; else hi = m; }
          const a = g.pts[lo], b = g.pts[(lo + 1) % N], f = (sv - g.acc[lo]) / Math.max(1e-9, g.acc[lo + 1] - g.acc[lo]);
          return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
        };
        if (!cuts[gi].length) {
          const loop = g.pts.concat([g.pts[0]]);
          out.strokes.push({ pts: loop, r: loop.map(rOf) });
          return;
        }
        // Removed arc intervals (cyclic), merged; what's left becomes open wire pieces with exact end points.
        const iv = cuts[gi].map((c) => [c.s - c.cut, c.s + c.cut]).sort((u, v) => u[0] - v[0]);
        const merged = [];
        for (const v of iv) {
          if (merged.length && v[0] <= merged[merged.length - 1][1]) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], v[1]);
          else merged.push(v.slice());
        }
        if (merged.length > 1 && merged[merged.length - 1][1] - total >= merged[0][0]) {
          merged[0][0] = merged[merged.length - 1][0] - total;
          merged[0][1] = Math.max(merged[0][1], merged[merged.length - 1][1] - total);
          merged.pop();
        }
        if (merged[0][1] - merged[0][0] >= total) return;
        for (let m = 0; m < merged.length; m++) {
          const sA = merged[m][1], sB = m + 1 < merged.length ? merged[m + 1][0] : merged[0][0] + total;
          if (sB - sA < wire * 1.5) continue; // no crumbs: every piece is a real length of wire
          const n = Math.max(2, Math.ceil((sB - sA) / step));
          const run = [];
          for (let k = 0; k <= n; k++) run.push(at(sA + ((sB - sA) * k) / n));
          out.strokes.push({ pts: run, r: run.map(rOf) });
        }
      });
      return out;
    },
  };
})();
