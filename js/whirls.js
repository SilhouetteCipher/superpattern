// Whirls: nested-polygon pursuit figures and Erdély spidrons. Put a bug on every corner of a polygon and let each
// one crawl a fraction t of the way toward its neighbour: the new corners make a smaller polygon, turned a little,
// and repeating the step nests polygon inside polygon while the corners trace logarithmic spirals into the centre
// (the "four bugs" pursuit problem; the whirl designs of John Sharp and the Bridges "Fun with Whirls" paper). Each
// step leaves a ring of corner triangles. Tiling the board with squares, triangles or hexagons and flipping the
// spin on alternate tiles gives the classic checkerboard of left- and right-handed whirls whose spirals run on
// across the tile edges. The spidron rule is Dániel Erdély's: inside a hexagon, join every corner to the
// after-next one; the hexagram leaves a smaller hexagon turned 30° and scaled 1/√3 inside a ring of equilateral and
// 30-30-120 triangles, and repeating that inward gives six spiral arms of alternating triangles. Here it is
// generalised to any regular tile: the inner polygon is the tile turned by half a sector (plus an optional skew)
// and scaled by a ratio, and each inner corner is joined to the two outer corners it sits between.
// Recursion stops per tile when the next ring of triangles would be too small to hold a clean hole (or cell), so
// there are never hairline slivers near the centre; what is left is a core polygon, open or solid. The depth can
// also fall off toward the board edge. The field is an exact distance to the edge set, bucketed on a grid, with a
// polynomial smooth-min between edges that rounds every corner: drawn as a lattice of strokes (optionally framed)
// or as every triangle inset as its own rounded cell.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const SQ3 = Math.sqrt(3);
  const MIN_W = 0.6; // narrowest stroke / hole / cell (mm)
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  function signedArea(P) { let s = 0; for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
  function centroid(P) { let x = 0, y = 0; for (const q of P) { x += q[0]; y += q[1]; } return [x / P.length, y / P.length]; }
  // Inradius of triangle abc (2·area / perimeter).
  function inradius(a, b, c) {
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const A = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]));
    return A / Math.max(1e-9, ab + bc + ca);
  }
  function segDist(x, y, s) {
    const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy;
    const t = L2 > 0 ? clamp(((x - s[0]) * dx + (y - s[1]) * dy) / L2, 0, 1) : 0;
    return Math.hypot(x - s[0] - t * dx, y - s[1] - t * dy);
  }
  // Signed distance to a convex polygon (negative inside).
  function polySd(x, y, P) {
    let d = Infinity, inside = true;
    for (let i = 0, n = P.length; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n];
      d = Math.min(d, segDist(x, y, [a[0], a[1], b[0], b[1]]));
      if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) inside = false;
    }
    return inside ? -d : d;
  }

  // Tiles covering the box |x − cx| ≤ hx, |y − cy| ≤ hy (board coords), each { P: CCW vertices, parity }.
  function makeTiles(kind, s, rot, cx, cy, hx, hy) {
    const cr = Math.cos(rot), sr = Math.sin(rot);
    const place = (u, v) => [cx + u * cr - v * sr, cy + u * sr + v * cr];
    const reach = Math.hypot(hx, hy) + 2 * s;
    const tiles = [];
    const add = (pts, parity) => {
      const P = pts.map(([u, v]) => place(u, v));
      if (!P.some(([x, y]) => Math.abs(x - cx) < hx + s && Math.abs(y - cy) < hy + s)) return;
      if (signedArea(P) < 0) P.reverse();
      tiles.push({ P, parity });
    };
    if (kind === 'square') {
      const n = Math.ceil(reach / s);
      for (let j = -n; j <= n; j++)
        for (let i = -n; i <= n; i++) {
          const u = i * s, v = j * s, h = s / 2;
          add([[u - h, v - h], [u + h, v - h], [u + h, v + h], [u - h, v + h]], (i + j) & 1);
        }
    } else if (kind === 'triangle') {
      const ht = (s * SQ3) / 2, nj = Math.ceil(reach / ht), nk = Math.ceil((2 * reach) / s);
      for (let j = -nj; j <= nj; j++) {
        const y0 = (j - 0.5) * ht + ht / 6, y1 = y0 + ht; // the board centre sits on a triangle centroid
        for (let k = -nk; k <= nk; k++) {
          const x = (k * s) / 2, up = ((k + j) & 1) === 0;
          add(up ? [[x, y0], [x + s / 2, y1], [x - s / 2, y1]] : [[x - s / 2, y0], [x + s / 2, y0], [x, y1]], up ? 0 : 1);
        }
      }
    } else if (kind === 'hex') {
      const ni = Math.ceil(reach / (1.5 * s)), nj = Math.ceil(reach / (SQ3 * s));
      for (let i = -ni; i <= ni; i++)
        for (let j = -nj - 1; j <= nj + 1; j++) {
          const u = 1.5 * s * i, v = SQ3 * s * (j + (i & 1) / 2), pts = [];
          for (let k = 0; k < 6; k++) pts.push([u + s * Math.cos(k * 60 * D2R), v + s * Math.sin(k * 60 * D2R)]);
          // Three-colouring of the honeycomb; parity flips the spin on two of the three classes.
          add(pts, ((((i - 2 * j - (i & 1)) % 3) + 3) % 3) === 0 ? 0 : 1);
        }
    } else {
      // One big regular n-gon inscribed in the plate.
      // Built on the unit circle (a flat side at the bottom), then scaled and centred so its bounding box fits
      // the plate; it ignores the board rotation's effect on fit.
      const n = +kind.slice(1), a0 = Math.PI / 2 - Math.PI / n;
      const U = [];
      for (let k = 0; k < n; k++) U.push([Math.cos(a0 + (k * 2 * Math.PI) / n), Math.sin(a0 + (k * 2 * Math.PI) / n)]);
      const xs = U.map((q) => q[0]), ys = U.map((q) => q[1]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const sc = Math.min((2 * hx) / (bx1 - bx0), (2 * hy) / (by1 - by0));
      const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
      add(U.map(([x, y]) => [(x - mx) * sc, (y - my) * sc]), 0);
    }
    return tiles;
  }

  SP.generators.whirls = {
    id: 'whirls',
    name: 'Whirls',
    board: true,
    schema: [
      { group: 'Tiling' },
      { key: 'tiling', label: 'Tiles', type: 'select', def: 'square', options: [['square', 'Squares'], ['triangle', 'Triangles'], ['hex', 'Hexagons'], ['n3', 'One big triangle'], ['n4', 'One big square'], ['n5', 'One big pentagon'], ['n6', 'One big hexagon'], ['n8', 'One big octagon']] },
      { key: 'size', label: 'Tile size (mm)', min: 10, max: 120, step: 0.5, def: 50, rand: [28, 70], show: (o) => !/^n/.test(o.tiling) },
      { key: 'angle', label: 'Rotate °', min: -90, max: 90, step: 0.5, def: 0, rand: [0, 0] },
      { group: 'Rule' },
      { key: 'rule', label: 'Rule', type: 'select', def: 'whirl', options: [['whirl', 'Pursuit whirl (corners creep along edges)'], ['spidron', 'Spidron (inner corners joined to outer)']] },
      { key: 'frac', label: 'Creep fraction', min: 0.04, max: 0.5, step: 0.005, def: 0.18, rand: [0.1, 0.3], show: (o) => o.rule === 'whirl' },
      { key: 'ratio', label: 'Inner scale', min: 0.3, max: 0.85, step: 0.005, def: 0.577, rand: [0.45, 0.7], show: (o) => o.rule === 'spidron' },
      { key: 'skew', label: 'Skew °', min: -40, max: 40, step: 0.5, def: 0, rand: [-12, 12], show: (o) => o.rule === 'spidron' },
      { key: 'alt', label: 'Alternate spin per tile', type: 'bool', def: true },
      { key: 'depth', label: 'Max depth', min: 1, max: 60, step: 1, def: 30, int: true, rand: [6, 30] },
      { key: 'falloff', label: 'Depth falloff to edge', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.6] },
      { group: 'Draw' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'lines', options: [['lines', 'Lattice of edges'], ['cells', 'Every triangle as a cell']] },
      { key: 'width', label: 'Line width / cell gap (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6, rand: [1.2, 2.6] },
      { key: 'round', label: 'Corner rounding (mm)', min: 0, max: 6, step: 0.05, def: 1.2, rand: [0.5, 2] },
      { key: 'core', label: 'Core', type: 'select', def: 'open', options: [['open', 'Open (last polygon a hole)'], ['solid', 'Solid boss']], show: (o) => o.draw === 'lines' },
      { key: 'frame', label: 'Frame width (mm)', min: 0, max: 15, step: 0.25, def: 3, rand: [2, 5], show: (o) => o.draw === 'lines' },
      { group: 'Board' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'edgeRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Edge fillet', min: 0.02, max: 3, step: 0.01, def: 0.4 },
      { key: 'fieldGain', label: 'Points → widen', min: -2, max: 2, step: 0.01, def: 1 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2, hw = Math.max(1, B.w / 2 - mg), hh = Math.max(1, B.h / 2 - mg);
      const lines = p.draw !== 'cells';
      const w2 = Math.max(MIN_W, p.width) / 2;
      const kr = Math.max(0, p.round);
      const s = Math.max(5, p.size);
      const tiles = makeTiles(p.tiling, s, p.angle * D2R, cx, cy, hw, hh);

      // Smallest triangle a ring may contain: a hole a little over MIN_W between two half-strokes (lines), or a
      // cell of about 2 mm inside a half-gap (cells, so the cores do not crumble into specks). Rounding eats into
      // the corners of both, so it raises the limit a little.
      const minInr = lines ? w2 + MIN_W / 2 + 0.15 + kr * 0.15 : w2 + 1 + kr * 0.25;
      const reach = Math.hypot(hw, hh);
      const segs = [], cores = [];
      let count = 0;
      for (const t of tiles) {
        let P = t.P;
        const n = P.length;
        const spin = p.alt && t.parity ? -1 : 1;
        const c0 = centroid(P);
        const fall = clamp(1 - p.falloff * (Math.hypot(c0[0] - cx, c0[1] - cy) / reach), 0, 1);
        const depth = Math.max(0, Math.round(p.depth * fall));
        for (let i = 0; i < n; i++) segs.push([P[i][0], P[i][1], P[(i + 1) % n][0], P[(i + 1) % n][1]]);
        count++;
        for (let lvl = 0; lvl < depth; lvl++) {
          let W, tris;
          if (p.rule === 'spidron') {
            const C = centroid(P);
            const sk = clamp(p.skew * D2R, -0.7 * Math.PI / n, 0.7 * Math.PI / n);
            const ratio = Math.min(p.ratio, (0.92 * Math.cos(Math.PI / n)) / Math.cos(sk));
            const th = Math.PI / n + spin * sk, ct = Math.cos(th), st = Math.sin(th);
            W = P.map(([x, y]) => { const u = x - C[0], v = y - C[1]; return [C[0] + ratio * (u * ct - v * st), C[1] + ratio * (u * st + v * ct)]; });
            tris = [];
            for (let i = 0; i < n; i++) {
              const a = P[i], b = P[(i + 1) % n];
              tris.push([a, b, W[i]], [a, W[(i + n - 1) % n], W[i]]);
            }
          } else {
            const f = clamp(spin > 0 ? p.frac : 1 - p.frac, 0.01, 0.99);
            W = P.map((a, i) => { const b = P[(i + 1) % n]; return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])]; });
            tris = P.map((a, i) => [W[(i + n - 1) % n], a, W[i]]);
          }
          let small = Infinity;
          for (const [a, b, c] of tris) small = Math.min(small, inradius(a, b, c));
          if (small < minInr) break;
          for (let i = 0; i < n; i++) {
            const a = W[i], b = W[(i + 1) % n];
            segs.push([a[0], a[1], b[0], b[1]]);
            if (p.rule === 'spidron') {
              const q = P[i], r = P[(i + 1) % n];
              segs.push([q[0], q[1], a[0], a[1]], [r[0], r[1], a[0], a[1]]);
            }
          }
          P = W;
          count++;
        }
        // A tile that could not take a single ring stays a plain hole rather than a solid plug.
        if (lines && p.core === 'solid' && P !== t.P) cores.push(P);
      }

      // Bucket grid: every segment / core is listed in each bucket its padded bounding box touches, so within
      // `pad` of any edge the bucket holds every edge that matters and min(pad, ·) keeps the field exact there.
      const warpMax = 2.5;
      const pad = warpMax * w2 + kr + 2;
      const bs = clamp(s / 4, 3, 12);
      const gx0 = cx - hw - pad, gy0 = cy - hh - pad;
      const GW = Math.max(1, Math.ceil((2 * hw + 2 * pad) / bs)), GH = Math.max(1, Math.ceil((2 * hh + 2 * pad) / bs));
      const grid = new Array(GW * GH);
      const cgrid = cores.length ? new Array(GW * GH) : null;
      const insert = (g, item, x0, y0, x1, y1) => {
        const i0 = clamp(Math.floor((x0 - pad - gx0) / bs), 0, GW - 1), i1 = clamp(Math.floor((x1 + pad - gx0) / bs), 0, GW - 1);
        const j0 = clamp(Math.floor((y0 - pad - gy0) / bs), 0, GH - 1), j1 = clamp(Math.floor((y1 + pad - gy0) / bs), 0, GH - 1);
        if (x1 + pad < gx0 || x0 - pad > gx0 + GW * bs || y1 + pad < gy0 || y0 - pad > gy0 + GH * bs) return;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (g[j * GW + i] || (g[j * GW + i] = [])).push(item);
      };
      for (const sg of segs) insert(grid, sg, Math.min(sg[0], sg[2]), Math.min(sg[1], sg[3]), Math.max(sg[0], sg[2]), Math.max(sg[1], sg[3]));
      for (const P of cores) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of P) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        insert(cgrid, P, x0, y0, x1, y1);
      }
      const cell = (x, y) => {
        const i = Math.floor((x - gx0) / bs), j = Math.floor((y - gy0) / bs);
        return i < 0 || j < 0 || i >= GW || j >= GH ? -1 : j * GW + i;
      };
      // Clamped at 0: the smooth-min dips below zero where edges meet, which would flip the sign of a cell.
      const dist = (x, y) => {
        const c = cell(x, y);
        const list = c >= 0 ? grid[c] : null;
        if (!list) return pad;
        let d = pad;
        for (const sg of list) d = smin(d, segDist(x, y, sg), kr);
        return Math.max(0, Math.min(pad, d));
      };
      const coreSd = (x, y) => {
        const c = cell(x, y);
        const list = c >= 0 && cgrid ? cgrid[c] : null;
        if (!list) return pad;
        let d = pad;
        for (const P of list) d = Math.min(d, polySd(x, y, P));
        return Math.min(pad, d);
      };

      const warp = points.length && p.fieldGain ? (x, y) => clamp(1 + p.fieldGain * fieldAt(x, y), 0.3, warpMax) : null;
      const rr = Math.min(p.edgeRound, hw, hh);
      const outline = (x, y) => { const qx = Math.abs(x - cx) - hw + rr, qy = Math.abs(y - cy) - hh + rr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; };
      const fw = Math.max(0, p.frame);
      const k = Math.max(0.02, p.fillet);
      let shape;
      if (lines) {
        shape = (x, y) => {
          let f = dist(x, y) - w2 * (warp ? warp(x, y) : 1);
          if (cgrid) f = Math.min(f, coreSd(x, y));
          if (fw > 0) f = smin(f, -outline(x, y) - fw, kr);
          return f;
        };
      } else {
        // The plate edge counts as an edge too, so cells cut by the board are inset from it instead of ending in
        // slivers along the outline.
        shape = (x, y) => w2 * (warp ? warp(x, y) : 1) - Math.max(0, Math.min(dist(x, y), -outline(x, y)));
      }
      const evalFn = (x, y) => smax(shape(x, y), outline(x, y), k);
      return { evalFn, domain: { x0: mg - 3, y0: mg - 3, x1: B.w - mg + 3, y1: B.h - mg + 3 }, count };
    },
  };
})();
