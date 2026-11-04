// Spirolateral: Frank Odds' turtle-geometry rule (1962, published 1973). A turtle walks segments of length
// 1, 2, 3 … n, turning by a fixed angle after each one; that cycle of n moves is repeated until the turtle is
// back at its start facing its first heading. Some turns can be reversed (turn the other way), which gives a
// whole second family of figures from the same order and angle. Whether a figure closes is not obvious —
// the net turn of one cycle must be a whole number of turns ≠ 0, and even then (Krawczyk found) some drift
// away — so each figure is walked in exact integer-degree headings and only accepted once it returns home.
// A figure that will not close is nudged to the nearest order (or reversal set) that does.
// The board is a grid of cells, one figure per cell, fitted to the cell: every cell the same figure, a table
// that steps the order along each row and reverses a different turn down each column (Odds' own charts), a
// seeded random sampler, or one large figure filling the board. Corners can be rounded into arcs (Krawczyk
// used the vertices as control points for arcs), and the band is one stroke per figure, closed on itself.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_W = 0.6; // narrowest band (mm)
  const D2R = Math.PI / 180;
  const MAX_VERTS = 2400;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Walk order `n` at `angle` degrees with turn i reversed where rev[i]. Returns the unit-step vertices of the
  // closed figure (start point not repeated), or null if it never comes home.
  function walk(n, angle, rev) {
    let turn = 0;
    for (let i = 0; i < n; i++) turn += rev[i] ? -angle : angle;
    turn = ((turn % 360) + 360) % 360;
    if (turn === 0) return null; // heading never changes: the figure drifts off in a straight line
    let reps = 360 / gcd(turn, 360);
    // A turn that is a whole number of degrees always gets back to heading 0 within 360 cycles; we cap well
    // below that to keep figures drawable.
    if (n * reps > MAX_VERTS) return null;
    const pts = [];
    let x = 0, y = 0, h = 0, len = 0;
    for (let r = 0; r < reps; r++)
      for (let i = 0; i < n; i++) {
        pts.push([x, y]);
        x += (i + 1) * Math.cos(h * D2R);
        y -= (i + 1) * Math.sin(h * D2R);
        len += i + 1;
        h = (h + (rev[i] ? -angle : angle) + 360) % 360;
      }
    if (Math.hypot(x, y) > 1e-6 * len) return null; // heading came home but the position did not
    return pts;
  }
  function gcd(a, b) { a = Math.round(a); b = Math.round(b); while (b) [a, b] = [b, a % b]; return a; }

  // Turn-reversal flags for a figure of order n.
  function reversals(mode, n, rand, which) {
    const rev = new Array(n).fill(false);
    if (mode === 'alt') for (let i = 1; i < n; i += 2) rev[i] = true;
    else if (mode === 'last') rev[n - 1] = true;
    else if (mode === 'random') for (let i = 0; i < n; i++) rev[i] = rand() < 0.35;
    else if (mode === 'one' && which >= 0) rev[which % n] = true;
    return rev;
  }

  // A closed figure as near as possible to what was asked: try the order, then neighbouring orders, then (for
  // random reversals) fresh draws, then no reversals at all.
  function figure(n, angle, mode, rand, which, nMin, nMax) {
    const tries = [0, 1, -1, 2, -2, 3, -3];
    for (const pass of [mode, 'none']) {
      for (const dn of tries) {
        const m = n + dn;
        if (m < Math.max(2, nMin) || m > Math.max(nMax, n)) continue;
        for (let k = 0; k < (pass === 'random' ? 8 : 1); k++) {
          const pts = walk(m, angle, reversals(pass, m, rand, which));
          if (pts) return pts;
        }
      }
    }
    return null;
  }

  // Replace each corner of a closed polygon with a quadratic arc; `t` is the share of half the shorter
  // neighbouring segment that the arc cuts off.
  function roundCorners(pts, t) {
    const n = pts.length;
    if (t <= 0) return pts.slice();
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i - 1 + n) % n], v = pts[i], b = pts[(i + 1) % n];
      const la = Math.hypot(a[0] - v[0], a[1] - v[1]), lb = Math.hypot(b[0] - v[0], b[1] - v[1]);
      const c = (t * Math.min(la, lb)) / 2;
      const p1 = [v[0] + ((a[0] - v[0]) * c) / la, v[1] + ((a[1] - v[1]) * c) / la];
      const p2 = [v[0] + ((b[0] - v[0]) * c) / lb, v[1] + ((b[1] - v[1]) * c) / lb];
      const steps = 6;
      for (let k = 0; k <= steps; k++) {
        const s = k / steps, u = 1 - s;
        out.push([u * u * p1[0] + 2 * u * s * v[0] + s * s * p2[0], u * u * p1[1] + 2 * u * s * v[1] + s * s * p2[1]]);
      }
    }
    return out;
  }

  SP.generators.spirolateral = {
    id: 'spirolateral',
    name: 'Spirolateral',
    board: true,
    schema: [
      { group: 'Rule' },
      { key: 'angle', label: 'Turn angle', type: 'select', def: '90', options: [['90', '90° (square)'], ['60', '60° (hexagonal)'], ['120', '120° (triangular)'], ['72', '72° (pentagonal)'], ['144', '144° (star)'], ['45', '45° (octagonal)'], ['135', '135° (octagram)']] },
      { key: 'order', label: 'Order (segments)', min: 2, max: 16, step: 1, def: 5, int: true, rand: [3, 9] },
      { key: 'orderMax', label: 'Max order', min: 2, max: 16, step: 1, def: 9, int: true, rand: [6, 11], show: (o) => o.layout === 'table' || o.layout === 'random' },
      { key: 'reverse', label: 'Reversed turns', type: 'select', def: 'none', options: [['none', 'None'], ['last', 'Last turn'], ['alt', 'Every other turn'], ['random', 'Seeded random']] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 11, int: true, rand: [1, 9999] },
      { group: 'Layout' },
      { key: 'layout', label: 'Layout', type: 'select', def: 'same', options: [['same', 'Same figure in every cell'], ['table', 'Table (order across, reversed turn down)'], ['random', 'Random figure per cell'], ['single', 'One large figure']] },
      { key: 'cols', label: 'Columns', min: 1, max: 12, step: 1, def: 3, int: true, rand: [2, 5], show: (o) => o.layout !== 'single' },
      { key: 'rows', label: 'Rows', min: 1, max: 12, step: 1, def: 3, int: true, rand: [2, 5], show: (o) => o.layout !== 'single' },
      { key: 'fit', label: 'Fill cell', min: 0.3, max: 1, step: 0.01, def: 0.86, rand: [0.75, 0.95] },
      { key: 'rot', label: 'Rotation °', min: -180, max: 180, step: 1, def: 0, rand: [-45, 45] },
      { key: 'flip', label: 'Alternate cells', type: 'select', def: 'none', options: [['none', 'All alike'], ['mirror', 'Mirror on a checker'], ['turn', 'Quarter-turn on a checker']], show: (o) => o.layout !== 'single' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { group: 'Band' },
      { key: 'width', label: 'Band width (mm)', min: 0.6, max: 12, step: 0.05, def: 2.2, rand: [1.4, 3.2] },
      { key: 'round', label: 'Corner round', min: 0, max: 1, step: 0.01, def: 0.4, rand: [0, 0.9] },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 4, step: 0.01, def: 0.5 },
      { key: 'fieldGain', label: 'Points → grow', min: -1, max: 1, step: 0.01, def: 0.3 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], dots: [], count: 0 };
      const angle = +p.angle || 90;
      const single = p.layout === 'single';
      const C = single ? 1 : Math.max(1, Math.round(p.cols)), R = single ? 1 : Math.max(1, Math.round(p.rows));
      const mg = Math.max(0, Math.min(p.margin, Math.min(B.w, B.h) / 2 - 2));
      const cw = (B.w - 2 * mg) / C, ch = (B.h - 2 * mg) / R;
      const nLo = Math.max(2, Math.round(Math.min(p.order, p.orderMax ?? p.order)));
      const nHi = Math.max(nLo, Math.round(Math.max(p.order, p.orderMax ?? p.order)));
      const rand = rng(Math.round(p.seed) * 7919 + 17);
      const grow = points.length && p.fieldGain ? (x, y) => Math.max(0.5, Math.min(1.6, 1 + p.fieldGain * fieldAt(x, y))) : () => 1;
      const cache = new Map();

      for (let j = 0; j < R; j++)
        for (let i = 0; i < C; i++) {
          let pts;
          if (p.layout === 'table') {
            // Order steps along the row; row 0 has no reversal, row r reverses turn r (1-based).
            const n = nLo + (i % (nHi - nLo + 1));
            pts = figure(n, angle, j ? 'one' : 'none', rand, j - 1, 2, 16);
          } else if (p.layout === 'random') {
            const n = nLo + Math.floor(rand() * (nHi - nLo + 1));
            pts = figure(n, angle, p.reverse, rand, -1, 2, 16);
          } else {
            // Same figure everywhere: walk it once (random reversals drawn once, so every cell matches).
            if (!cache.has('f')) cache.set('f', figure(nLo, angle, p.reverse, rand, -1, 2, 16));
            pts = cache.get('f');
          }
          if (!pts) continue;

          // Centre on the bounding box of the rotated figure, then scale it into the cell.
          const odd = (i + j) % 2 === 1;
          const a = (p.rot + (p.flip === 'turn' && odd ? 90 : 0)) * D2R, ca = Math.cos(a), sa = Math.sin(a);
          const mx = p.flip === 'mirror' && odd ? -1 : 1;
          const rp = pts.map(([x, y]) => [mx * x * ca - y * sa, mx * x * sa + y * ca]);
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const [x, y] of rp) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
          const w2 = Math.max(MIN_W, p.width) / 2;
          const s = Math.max(1e-3, (Math.min(cw, ch) * p.fit - 2 * w2) / Math.max(x1 - x0, y1 - y0, 1e-6));
          const ox = mg + (i + 0.5) * cw - ((x0 + x1) / 2) * s, oy = mg + (j + 0.5) * ch - ((y0 + y1) / 2) * s;
          // Keep a gap between bands one unit apart: never wider than 70 % of a unit step.
          const r0 = Math.max(MIN_W / 2, Math.min(w2, s * 0.35));
          const sm = roundCorners(rp.map(([x, y]) => [ox + x * s, oy + y * s]), Math.max(0, Math.min(1, p.round)));
          sm.push(sm[0]);
          out.strokes.push({ pts: sm, r: sm.map(([x, y]) => Math.max(MIN_W / 2, Math.min(r0 * grow(x, y), s * 0.42))) });
          out.count++;
        }
      out.count = Math.max(1, out.count);
      return out;
    },
  };
})();
