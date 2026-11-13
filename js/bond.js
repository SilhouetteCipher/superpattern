// Brick Bond: the bricklayer's and paver's bonds — the rules that decide where each brick sits so that no
// joint runs straight through the work. Every bond is a lattice: a cell of one to n rectangles repeated by
// two translation vectors. Wall bonds lay courses of stretchers (long faces) and headers (ends, half a
// stretcher): running bond shifts each course by a fraction of a brick (0 = stack bond); English bond
// alternates a course of stretchers with a course of headers; Flemish bond alternates stretcher and header
// within each course, the next course shifted half a period so every header sits centred on the stretcher
// below; garden-wall bond does the same with three stretchers to a header. Paving bonds use L × W pavers:
// basketweave packs n pavers into a square and turns alternate squares a quarter turn; herringbone is a
// staircase of horizontal and vertical pavers, cell vectors (W, W) and (L + W, W − L), so each paver's end
// butts the side of the next; pinwheel rings four pavers round a half-size square. The whole lattice is
// turned by `angle` (45° gives the classic herringbone floor). Each brick is a rounded rectangle inset by
// half the joint; bricks the frame cuts are clipped to it, and cut bricks keeping less than `trim` of their
// area are dropped, so the edge has no slivers. Wear shrinks bricks at random (and near field points).
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  // Signed distance to a box of half-size (hx, hy) with corners rounded by r, centred on the origin.
  function sdBox(x, y, hx, hy, r) {
    const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }

  // One lattice cell per bond: translation vectors a1, a2 and the bricks in the cell as [cx, cy, hx, hy].
  // L = stretcher / paver length, H = course height (wall bonds) or paver width (paving bonds).
  function bondCell(bond, L, H, p) {
    const B = (x0, y0, x1, y1) => [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2];
    switch (bond) {
      case 'english':
        return { a1: [L, 0], a2: [0, 2 * H], bricks: [B(0, 0, L, H), B(L / 4, H, (3 * L) / 4, 2 * H), B((3 * L) / 4, H, (5 * L) / 4, 2 * H)] };
      case 'flemish':
      case 'garden': {
        // k stretchers then a header; the next course moves half a period, centring each header on a stretcher.
        const k = bond === 'garden' ? 3 : 1, P = k * L + L / 2, bricks = [];
        for (let i = 0; i < k; i++) bricks.push(B(i * L, 0, (i + 1) * L, H));
        bricks.push(B(k * L, 0, P, H));
        return { a1: [P, 0], a2: [P / 2, H], bricks };
      }
      case 'basket': {
        // n pavers side by side make an L × L square; squares alternate horizontal / vertical like a chequerboard.
        const n = Math.max(2, Math.round(L / H)), w = L / n, bricks = [];
        for (let i = 0; i < n; i++) bricks.push(B(0, i * w, L, (i + 1) * w), B(L + i * w, 0, L + (i + 1) * w, L));
        return { a1: [2 * L, 0], a2: [L, L], bricks };
      }
      case 'herringbone':
        return { a1: [H, H], a2: [L + H, H - L], bricks: [B(0, 0, L, H), B(L, H - L, L + H, H)] };
      case 'pinwheel': {
        const S = L + H, bricks = [B(0, 0, L, H), B(L, 0, S, L), B(H, L, S, S), B(0, H, H, S)];
        if (p.centre) bricks.push(B(H, H, L, L));
        return { a1: [S, 0], a2: [0, S], bricks };
      }
      default: // running / stack
        return { a1: [L, 0], a2: [p.offset * L, H], bricks: [B(0, 0, L, H)] };
    }
  }

  let cache = { key: null };

  SP.generators.bond = {
    id: 'bond',
    name: 'Brick Bond',
    board: true,
    schema: [
      { group: 'Bond' },
      { key: 'bond', label: 'Bond', type: 'select', def: 'herringbone', options: [['running', 'Running / stack'], ['english', 'English'], ['flemish', 'Flemish'], ['garden', 'Garden wall'], ['basket', 'Basketweave'], ['herringbone', 'Herringbone'], ['pinwheel', 'Pinwheel']] },
      { key: 'length', label: 'Brick length (mm)', min: 8, max: 80, step: 0.5, def: 28, rand: [18, 40] },
      { key: 'ratio', label: 'Length : width', min: 1.5, max: 5, step: 0.05, def: 2, rand: [2, 3.2] },
      { key: 'offset', label: 'Course offset', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0, 0.5] },
      { key: 'angle', label: 'Angle °', min: -90, max: 90, step: 0.5, def: 45, rand: [-45, 45] },
      { key: 'centre', label: 'Pinwheel centre block', type: 'bool', def: true },
      { group: 'Joints' },
      { key: 'gap', label: 'Joint (mm)', min: 0.6, max: 8, step: 0.05, def: 1.8, rand: [1.2, 3] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 10, step: 0.1, def: 1.5, rand: [0.4, 3.5] },
      { key: 'wear', label: 'Wear (mm)', min: 0, max: 4, step: 0.05, def: 0, rand: [0, 1.2] },
      { key: 'missing', label: 'Missing bricks', min: 0, max: 0.6, step: 0.01, def: 0, rand: [0, 0.12] },
      { key: 'fieldWear', label: 'Field points → wear', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Frame' },
      { key: 'shape', label: 'Outline', type: 'select', def: 'square', options: [['square', 'Rounded rectangle'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'outerRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'frame', label: 'Border (mm)', min: 0, max: 20, step: 0.1, def: 0, rand: [0, 5] },
      { key: 'trim', label: 'Keep cut bricks ≥ %', min: 0, max: 100, step: 1, def: 35, rand: [20, 60] },
    ],

    generateBoard(p, ctx) {
      const { board: Bd, fieldAt, points } = ctx;
      const m = Math.min(p.margin, Math.min(Bd.w, Bd.h) / 2 - 5);
      const x0 = m, y0 = m, W = Bd.w - 2 * m, H = Bd.h - 2 * m, cx = Bd.w / 2, cy = Bd.h / 2;
      const R = Math.min(W, H) / 2;
      const outline = p.shape === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - R
        : (x, y) => { const r = Math.min(p.outerRound, W / 2, H / 2), qx = Math.abs(x - cx) - W / 2 + r, qy = Math.abs(y - cy) - H / 2 + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r; };
      const g = p.gap / 2, F = Math.max(0, p.frame);
      // The region bricks may occupy: inside the outline, or inside the border bar less a joint when there is one.
      const inner = F > 0 ? (x, y) => outline(x, y) + F + p.gap : outline;
      const useField = points.length && p.fieldWear > 0;

      const key = JSON.stringify([p.bond, p.length, p.ratio, p.offset, p.angle, p.centre, p.gap, p.round, p.wear, p.missing, p.fieldWear, p.seed, p.shape, p.margin, p.outerRound, p.frame, p.trim, Bd.w, Bd.h, useField ? points : 0]);
      if (cache.key !== key) {
        const rand = rng(p.seed * 2654435761);
        const L = Math.max(4, p.length), Hc = L / Math.max(1.2, p.ratio);
        const cell = bondCell(p.bond, L, Hc, p);
        const ca = Math.cos(p.angle * D2R), sa = Math.sin(p.angle * D2R);
        const cover = Math.hypot(W, H) / 2 + L * 1.5;
        // Lattice range: solve for the (i, j) span that covers a disc of radius `cover` round the centre.
        const [a1, a2] = [cell.a1, cell.a2], det = a1[0] * a2[1] - a1[1] * a2[0];
        const ni = Math.ceil((cover * Math.hypot(a2[0], a2[1])) / Math.abs(det)) + 2, nj = Math.ceil((cover * Math.hypot(a1[0], a1[1])) / Math.abs(det)) + 2;
        const keepFrac = clamp(p.trim / 100, 0, 1);
        const bricks = [];
        for (let j = -nj; j <= nj; j++)
          for (let i = -ni; i <= ni; i++)
            for (const b of cell.bricks) {
              const lx = i * a1[0] + j * a2[0] + b[0], ly = i * a1[1] + j * a2[1] + b[1];
              if (Math.hypot(lx, ly) > cover) continue;
              // Each brick draws its own random numbers in a fixed order, so changing trim never reshuffles wear.
              const rWear = rand(), rMiss = rand();
              if (rMiss < p.missing) continue;
              const bx = cx + lx * ca - ly * sa, by = cy + lx * sa + ly * ca;
              let shrink = g + p.wear * rWear;
              if (useField) shrink += p.fieldWear * Math.max(0, fieldAt(bx, by) || 0) * Math.min(b[2], b[3]) * 0.6;
              const hx = b[2] - shrink, hy = b[3] - shrink;
              if (hx < 0.6 || hy < 0.6) continue;
              // Share of the brick inside the frame, sampled on a 6 × 6 grid; whole-outside bricks go too.
              let inside = 0;
              for (let v = 0; v < 6; v++)
                for (let u = 0; u < 6; u++) {
                  const px = ((u + 0.5) / 6 - 0.5) * 2 * hx, py = ((v + 0.5) / 6 - 0.5) * 2 * hy;
                  if (inner(bx + px * ca - py * sa, by + px * sa + py * ca) < 0) inside++;
                }
              if (inside === 0 || inside / 36 < keepFrac) continue;
              bricks.push([bx, by, hx, hy, Math.min(p.round, hx - 0.05, hy - 0.05)]);
            }
        // Spatial bins: a brick is registered in every bin its bounding box touches.
        const bs = Math.max(6, L * 0.75), bins = new Map();
        bricks.forEach((b, bi) => {
          const e = Math.max(b[2], b[3]) * 1.42 + 1;
          for (let j = Math.floor((b[1] - e) / bs); j <= Math.floor((b[1] + e) / bs); j++)
            for (let i = Math.floor((b[0] - e) / bs); i <= Math.floor((b[0] + e) / bs); i++) { const k = i + ',' + j; (bins.get(k) || bins.set(k, []).get(k)).push(bi); }
        });
        cache = { key, bricks, bins, bs, ca, sa };
      }
      const { bricks, bins, bs, ca, sa } = cache;
      const kr = Math.min(p.round, g) * 0.5 + 0.2;
      const far = bs;
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        let d = far;
        const L = bins.get(Math.floor(x / bs) + ',' + Math.floor(y / bs));
        if (L)
          for (const bi of L) {
            const b = bricks[bi], dx = x - b[0], dy = y - b[1];
            const v = sdBox(dx * ca + dy * sa, -dx * sa + dy * ca, b[2], b[3], b[4]);
            if (v < d) d = v;
          }
        // Bricks are clipped to the brick region; the border bar, when on, is a band just inside the outline.
        let f = smax(d, inner(x, y), kr);
        if (F > 0) f = Math.min(f, Math.max(o, -(o + F)));
        return Math.max(f, o);
      };
      const pad = 3;
      return { evalFn, domain: { x0: x0 - pad, y0: y0 - pad, x1: x0 + W + pad, y1: y0 + H + pad }, count: bricks.length };
    },
  };
})();
