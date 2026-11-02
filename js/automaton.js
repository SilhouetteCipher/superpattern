// Automaton: a one-dimensional elementary cellular automaton (Wolfram's 256 rules) drawn as its space-time
// diagram. A row of cells evolves one generation per row: each cell's next state is looked up from its own
// state and its two neighbours' (8 cases → the 8 bits of the rule number). Rule 30 gives the chaotic shell
// texture of Conus textile (and the cladding of Cambridge North station), Rule 90 the Sierpinski triangle,
// 110 its interlocking gliders. The board is a grid of square cells centred within the margin; generations run
// top to bottom, or out from the middle row in both directions for a mirrored, coaster-friendly read.
// Drawn four ways, all as one exact signed-distance field so the export is clean:
//   tiles   — every live cell a rounded square, inset so neighbours keep a ≥ 0.6 mm gap
//   joined  — the same tiles fused to their orthogonal neighbours by bridges (2×2 blocks are filled solid,
//             so no pinhole is left in the middle); diagonal neighbours stay apart, never pinch at a corner
//   runs    — each horizontal run of live cells one rounded bar, rows separated by a gap (barcode / weave read)
//   lineage — a network: each live cell is a node linked to the live cell above it, or, when that one is dead,
//             to both live diagonal parents. That choice can never make two links cross, so the network has
//             no slivers — only cell-sized openings.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_W = 0.6; // narrowest feature / gap (mm)
  const RULES = [30, 45, 57, 73, 86, 90, 105, 110, 124, 126, 129, 150, 18, 22, 60, 102, 135, 137, 169, 182, 193, 225];

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  // Rounded box centred on (cx, cy), half sizes hw × hh, corner radius r.
  function box(x, y, cx, cy, hw, hh, r) {
    const qx = Math.abs(x - cx) - hw + r, qy = Math.abs(y - cy) - hh + r;
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  }
  function seg(x, y, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
    return Math.hypot(x - ax - t * dx, y - ay - t * dy);
  }

  // Evolve `gens` generations of rule `rule` on `n` cells. Returns an array of Uint8Array rows.
  function evolve(p, n, gens, rand) {
    const rule = p.rule === 'custom' ? Math.round(p.ruleNum) & 255 : +p.rule;
    let row = new Uint8Array(n);
    if (p.start === 'single') row[n >> 1] = 1;
    else if (p.start === 'scatter') {
      const k = Math.max(1, Math.round(p.seeds));
      for (let i = 0; i < k; i++) row[Math.floor(rand() * n)] = 1;
    } else if (p.start === 'mirror') {
      for (let i = 0; i < (n + 1) >> 1; i++) row[i] = row[n - 1 - i] = rand() < p.density ? 1 : 0;
    } else for (let i = 0; i < n; i++) row[i] = rand() < p.density ? 1 : 0;
    const wrap = p.edge === 'wrap';
    const at = (r, i) => (i < 0 || i >= n ? (wrap ? r[(i + n) % n] : 0) : r[i]);
    const step = (r) => {
      const nx = new Uint8Array(n);
      for (let i = 0; i < n; i++) nx[i] = (rule >> ((at(r, i - 1) << 2) | (r[i] << 1) | at(r, i + 1))) & 1;
      return nx;
    };
    for (let g = 0; g < Math.round(p.skip); g++) row = step(row);
    const rows = [row];
    for (let g = 1; g < gens; g++) rows.push((row = step(row)));
    return rows;
  }

  SP.generators.automaton = {
    id: 'automaton',
    name: 'Automaton',
    board: true,
    schema: [
      { group: 'Rule' },
      { key: 'rule', label: 'Rule', type: 'select', def: '30', options: RULES.map((r) => [String(r), 'Rule ' + r]).concat([['custom', 'Custom number…']]) },
      { key: 'ruleNum', label: 'Rule number', min: 0, max: 255, step: 1, def: 150, int: true, show: (o) => o.rule === 'custom' },
      { key: 'edge', label: 'Row ends', type: 'select', def: 'wrap', options: [['wrap', 'Wrap around'], ['dead', 'Dead cells beyond']] },
      { group: 'First row' },
      { key: 'start', label: 'Start from', type: 'select', def: 'single', options: [['single', 'One centre cell'], ['scatter', 'A few cells'], ['random', 'Seeded random row'], ['mirror', 'Mirrored random row']] },
      { key: 'seeds', label: 'Live cells', min: 1, max: 12, step: 1, def: 3, int: true, rand: [2, 5], show: (o) => o.start === 'scatter' },
      { key: 'density', label: 'Density', min: 0.05, max: 0.95, step: 0.01, def: 0.5, rand: [0.3, 0.6], show: (o) => o.start === 'random' || o.start === 'mirror' },
      { key: 'skip', label: 'Skip generations', min: 0, max: 200, step: 1, def: 0, int: true, rand: [0, 0] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Grid' },
      { key: 'cell', label: 'Cell size (mm)', min: 2.5, max: 30, step: 0.1, def: 6, rand: [4.5, 9] },
      { key: 'flow', label: 'Generations run', type: 'select', def: 'down', options: [['down', 'Top to bottom'], ['centre', 'Out from the middle (mirrored)']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { group: 'Draw' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'joined', options: [['tiles', 'Tiles'], ['joined', 'Joined tiles'], ['runs', 'Row runs (bars)'], ['lineage', 'Lineage network']] },
      { key: 'fill', label: 'Tile size (× cell)', min: 0.3, max: 0.95, step: 0.01, def: 0.78, rand: [0.6, 0.9], show: (o) => o.draw !== 'lineage' },
      { key: 'width', label: 'Link width (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6, rand: [1.2, 2.6], show: (o) => o.draw === 'lineage' },
      { key: 'node', label: 'Node size (× width)', min: 1, max: 3, step: 0.01, def: 1.6, rand: [1.1, 2.2], show: (o) => o.draw === 'lineage' },
      { key: 'round', label: 'Corner round', min: 0, max: 1, step: 0.01, def: 0.35, rand: [0.15, 1], show: (o) => o.draw !== 'lineage' },
      { key: 'merge', label: 'Merge (mm)', min: 0, max: 4, step: 0.05, def: 0.6 },
      { key: 'fieldGain', label: 'Points → grow', min: -1, max: 1, step: 0.01, def: 0.3 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const c = Math.max(1, p.cell);
      const mg = Math.max(0, p.margin);
      const C = Math.max(1, Math.floor((B.w - 2 * mg) / c)), R = Math.max(1, Math.floor((B.h - 2 * mg) / c));
      const x0 = (B.w - C * c) / 2, y0 = (B.h - R * c) / 2;
      const centre = p.flow === 'centre';
      const mid = (R - 1) / 2;
      // Display row j → generation; the parent row is the neighbour one generation earlier (none for gen 0).
      const genOf = (j) => (centre ? Math.floor(Math.abs(j - mid)) : j);
      // With an even row count the middle holds two copies of generation 0; the lower one links up to the
      // upper so the two mirrored halves stay one network.
      const parentOf = (j) => (genOf(j) === 0 ? (centre && j > mid ? j - 1 : -1) : centre ? (j > mid ? j - 1 : j + 1) : j - 1);
      const rows = evolve(p, C, centre ? Math.floor(mid) + 1 : R, rng(Math.round(p.seed) * 7919 + 13));
      const live = (i, j) => i >= 0 && i < C && j >= 0 && j < R && rows[genOf(j)][i] === 1;
      const cx = (i) => x0 + (i + 0.5) * c, cy = (j) => y0 + (j + 0.5) * c;

      const grow = points.length && p.fieldGain ? (x, y) => Math.max(0.5, Math.min(1.5, 1 + p.fieldGain * fieldAt(x, y))) : () => 1;
      const k = Math.max(0, p.merge);
      // Tile half size: never closer than MIN_W to a neighbour, even when the field grows it.
      const hs = Math.max(MIN_W / 2, Math.min(p.fill * c, c - MIN_W * 1.5) / 2);
      const rr = Math.max(0, Math.min(1, p.round)) * hs;
      const draw = p.draw;
      let count = 0;
      for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) count += live(i, j);

      // Horizontal runs: run[j][i] = [start, end] of the run containing live cell i.
      let runOf = null;
      if (draw === 'runs') {
        runOf = [];
        for (let j = 0; j < R; j++) {
          const r = new Array(C).fill(null);
          for (let i = 0; i < C; ) {
            if (!live(i, j)) { i++; continue; }
            let e = i;
            while (e + 1 < C && live(e + 1, j)) e++;
            const span = [i, e];
            for (let q = i; q <= e; q++) r[q] = span;
            i = e + 1;
          }
          runOf.push(r);
        }
      }

      // Field growth never closes the gap to a neighbouring cell.
      const hMax = (c - MIN_W * 1.5) / 2;
      const w2 = Math.max(MIN_W, p.width) / 2, nr = w2 * Math.max(1, p.node);
      const cellDist = (i, j, x, y, s) => {
        const X = cx(i), Y = cy(j), h = Math.min(hs * s, hMax), rc = (rr * h) / hs;
        if (draw === 'tiles') return box(x, y, X, Y, h, h, rc);
        if (draw === 'runs') {
          const sp = runOf[j][i];
          return box(x, y, (cx(sp[0]) + cx(sp[1])) / 2, Y, ((sp[1] - sp[0]) * c) / 2 + h, h, rc);
        }
        if (draw === 'joined') {
          let d = box(x, y, X, Y, h, h, rc);
          // Bridges to the right and downward neighbours (each bridge owned by one cell), plus a solid
          // centre where a full 2×2 block meets.
          if (live(i + 1, j)) d = Math.min(d, box(x, y, X + c / 2, Y, c / 2, h, 0));
          if (live(i, j + 1)) d = Math.min(d, box(x, y, X, Y + c / 2, h, c / 2, 0));
          if (live(i + 1, j) && live(i, j + 1) && live(i + 1, j + 1)) d = Math.min(d, box(x, y, X + c / 2, Y + c / 2, c / 2, c / 2, 0));
          return d;
        }
        // lineage
        let d = Math.hypot(x - X, y - Y) - Math.min(nr * s, hMax);
        const pj = parentOf(j);
        if (pj >= 0) {
          const links = live(i, pj) ? [i] : [i - 1, i + 1].filter((q) => live(q, pj));
          for (const q of links) d = Math.min(d, seg(x, y, X, Y, cx(q), cy(pj)) - Math.min(w2 * s, hMax / 2));
        }
        return d;
      };

      // Cells whose shapes can reach a point: runs can be long, so they look along the whole row.
      const evalFn = (x, y) => {
        const ci = Math.floor((x - x0) / c), cj = Math.floor((y - y0) / c);
        const s = grow(x, y);
        let f = 1e9;
        for (let j = cj - 1; j <= cj + 1; j++) {
          if (j < 0 || j >= R) continue;
          if (draw === 'runs') {
            // Only the runs that cover columns ci−1 … ci+1 can be nearest.
            let last = null;
            for (let i = Math.max(0, ci - 1); i <= Math.min(C - 1, ci + 1); i++) {
              const sp = runOf[j][i];
              if (!sp || sp === last) continue;
              last = sp;
              f = smin(f, cellDist(i, j, x, y, s), k);
            }
            continue;
          }
          for (let i = ci - 1; i <= ci + 1; i++) if (live(i, j)) f = smin(f, cellDist(i, j, x, y, s), k);
        }
        return f;
      };
      const pad = c + 2;
      return { evalFn, domain: { x0: x0 - pad, y0: y0 - pad, x1: x0 + C * c + pad, y1: y0 + R * c + pad }, count: Math.max(1, count) };
    },
  };
})();
