// Weave: cloth from a loom draft. A draft is three small tables: the threading (which shaft each warp thread
// is drawn through), the treadling (which treadle is pressed for each pick of weft) and the tie-up (which
// shafts each treadle lifts). Warp thread i is on top at pick j exactly when tieup[treadling[j]][threading[i]]
// is set, so the whole cloth (the drawdown) is F = R · Uᵀ · T, as in the weaving-math literature. Twill is a
// circulant tie-up (m up, n down) on a straight draw; herringbone reverses the threading every `block` ends
// at a broken (offset) seam; diamond (bird's-eye) point-draws both threading and treadling; satin lifts one
// shaft per pick, stepping by a number coprime to the shaft count so no two interlacements touch; basket is
// plain weave with threads grouped in twos or threes; "random draft" draws a seeded tie-up with random-walk
// threading and treadling (the networked drafts handweavers use), with over-long floats broken.
// Every cell has exactly one thread on top. A float is a run of cells where the same thread stays on top; it
// is drawn as a pillow-shaped tapered stroke whose round tip stops `gap` short of the edge of the crossing
// thread it dives under, so every float is its own closed island and parallel threads never merge (thread
// width is capped at pitch − gap). An optional ripple bends the whole cloth through one smooth displacement,
// gentle enough that clearances shrink by at most a quarter.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3; // narrowest half-width anywhere (mm): 0.6 mm features
  const MAX_RAND_FLOAT = 6; // random drafts: break floats longer than this many cells

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const mod = (a, n) => ((a % n) + n) % n;
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  // Point draw: up for `b` ends, then back down without repeating the turning end, so the cloth mirrors
  // about that end (diamond / bird's-eye).
  const point = (k, b) => { const q = mod(k, 2 * b - 2); return q < b ? q : 2 * b - 2 - q; };
  // Broken draw: `b` ends up, then `b` ends down starting two shafts on, so the twill lines meet
  // offset at a clean seam instead of doubling into a long float (herringbone).
  const broken = (k, b) => { const q = mod(k, 2 * b); return q < b ? q : 2 * b + 1 - q; };

  // Build the draft and return up(i, j): 1 when warp i is on top at pick j. i, j are centred indices.
  function makeDraft(p, rand) {
    const up = Math.max(1, Math.round(p.up)), dn = Math.max(1, Math.round(p.down));
    const blk = Math.max(2, Math.round(p.block));
    const dir = p.flip ? -1 : 1;
    let N, T, R, U;
    switch (p.structure) {
      case 'plain':
        N = 2; T = (i) => mod(i, 2); R = (j) => mod(j, 2); U = (t, s) => t === s;
        break;
      case 'basket': {
        const g = Math.max(2, Math.round(p.group));
        N = 2; T = (i) => mod(Math.floor(i / g), 2); R = (j) => mod(Math.floor(j / g), 2); U = (t, s) => t === s;
        break;
      }
      case 'satin': {
        N = Math.max(5, Math.round(p.shafts));
        // Smallest step > 1 that is coprime to N and not N − 1 (which would just be a twill).
        let st = 2;
        while (st < N - 1 && gcd(st, N) !== 1) st++;
        if (st >= N - 1) st = 2;
        T = (i) => mod(dir * i, N); R = (j) => mod(j, N); U = (t, s) => mod(t * st, N) === s;
        break;
      }
      case 'random': {
        N = Math.max(3, Math.round(p.shafts));
        const tie = [];
        for (let t = 0; t < N; t++) {
          const row = [];
          for (let s = 0; s < N; s++) row.push(rand() < 0.5 ? 1 : 0);
          // Every treadle lifts something and leaves something down.
          row[Math.floor(rand() * N)] = 1;
          if (row.every(Boolean)) row[Math.floor(rand() * N)] = 0;
          tie.push(row);
        }
        const walk = (n) => { const a = [Math.floor(rand() * N)]; for (let k = 1; k < n; k++) a.push(mod(a[k - 1] + (rand() < 0.5 ? -1 : 1), N)); return a; };
        const tw = walk(64), rw = walk(64);
        T = (i) => tw[mod(i, 64)]; R = (j) => rw[mod(j, 64)]; U = (t, s) => tie[t][s] === 1;
        break;
      }
      default: {
        // Twill family on N = up + down shafts: circulant tie-up, treadle t lifts shafts t … t + up − 1.
        N = up + dn;
        U = (t, s) => mod(s - t, N) < up;
        R = p.structure === 'diamond' ? (j) => mod(point(j, blk), N) : (j) => mod(j, N);
        T = p.structure === 'herringbone' ? (i) => mod(dir * broken(i, blk), N) : p.structure === 'diamond' ? (i) => mod(dir * point(i, blk), N) : (i) => mod(dir * i, N);
      }
    }
    return (i, j) => (U(R(j), T(i)) ? 1 : 0);
  }

  SP.generators.weave = {
    id: 'weave',
    name: 'Weave',
    board: true,
    schema: [
      { group: 'Draft' },
      { key: 'structure', label: 'Structure', type: 'select', def: 'twill', options: [['plain', 'Plain (tabby)'], ['basket', 'Basket / hopsack'], ['twill', 'Twill'], ['herringbone', 'Herringbone twill'], ['diamond', 'Diamond (bird\'s-eye)'], ['satin', 'Satin'], ['random', 'Random draft']] },
      { key: 'up', label: 'Twill: ends up', min: 1, max: 5, step: 1, def: 2, int: true, rand: [1, 3], show: (o) => ['twill', 'herringbone', 'diamond'].includes(o.structure) },
      { key: 'down', label: 'Twill: ends down', min: 1, max: 5, step: 1, def: 2, int: true, rand: [1, 3], show: (o) => ['twill', 'herringbone', 'diamond'].includes(o.structure) },
      { key: 'block', label: 'Reverse every (ends)', min: 2, max: 16, step: 1, def: 6, int: true, rand: [3, 10], show: (o) => o.structure === 'herringbone' || o.structure === 'diamond' },
      { key: 'group', label: 'Threads per group', min: 2, max: 4, step: 1, def: 2, int: true, rand: [2, 3], show: (o) => o.structure === 'basket' },
      { key: 'shafts', label: 'Shafts', min: 3, max: 10, step: 1, def: 5, int: true, rand: [4, 8], show: (o) => o.structure === 'satin' || o.structure === 'random' },
      { key: 'flip', label: 'Z twill (mirror diagonal)', type: 'bool', def: false },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 11, int: true, rand: [1, 9999], show: (o) => o.structure === 'random' },
      { group: 'Threads' },
      { key: 'pitch', label: 'Thread pitch (mm)', min: 3, max: 30, step: 0.1, def: 8, rand: [6, 13] },
      { key: 'width', label: 'Thread width (× room)', min: 0.4, max: 1, step: 0.01, def: 0.9, rand: [0.7, 1] },
      { key: 'gap', label: 'Gap (mm)', min: 0.8, max: 6, step: 0.05, def: 1.3, rand: [1, 2.2] },
      { key: 'pinch', label: 'Float end pinch', min: 0.15, max: 1, step: 0.01, def: 0.5, rand: [0.3, 0.9] },
      { key: 'faces', label: 'Show', type: 'select', def: 'both', options: [['both', 'Warp and weft'], ['warp', 'Warp floats only'], ['weft', 'Weft floats only']] },
      { group: 'Ripple' },
      { key: 'ripple', label: 'Ripple (mm)', min: 0, max: 6, step: 0.05, def: 0, rand: [0, 2.5] },
      { key: 'rippleLen', label: 'Ripple wavelength (mm)', min: 30, max: 300, step: 1, def: 120, rand: [70, 200] },
      { group: 'Board' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 2, step: 0.01, def: 0.2 },
      { key: 'fieldGain', label: 'Points → thicken', min: -1, max: 1, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], count: 0 };
      const rand = rng(Math.round(p.seed) * 2654435761 + 3);
      const up = makeDraft(p, rand);

      const P = Math.max(3, p.pitch), gap = Math.max(0.8, p.gap);
      const mg = Math.max(0, p.margin);
      const W = Math.max(P, B.w - 2 * mg), H = Math.max(P, B.h - 2 * mg);
      const C = Math.max(1, Math.min(200, Math.floor(W / P))), Rw = Math.max(1, Math.min(200, Math.floor(H / P)));
      const cx = B.w / 2, cy = B.h / 2;
      const x0 = cx - ((C - 1) * P) / 2, y0 = cy - ((Rw - 1) * P) / 2;
      const ic = Math.floor(C / 2), jc = Math.floor(Rw / 2); // centre the draft on the board
      const top = (i, j) => up(i - ic, j - jc);

      // Random drafts: break floats longer than MAX_RAND_FLOAT by flipping the cell that would overrun.
      let grid = null;
      if (p.structure === 'random') {
        grid = [];
        for (let i = 0; i < C; i++) { grid.push([]); for (let j = 0; j < Rw; j++) grid[i].push(top(i, j)); }
        for (let pass = 0; pass < 3; pass++) {
          for (let i = 0; i < C; i++) for (let j = 0, run = 0, v = -1; j < Rw; j++) { run = grid[i][j] === v ? run + 1 : 1; v = grid[i][j]; if (run > MAX_RAND_FLOAT) { grid[i][j] ^= 1; v = grid[i][j]; run = 1; } }
          for (let j = 0; j < Rw; j++) for (let i = 0, run = 0, v = -1; i < C; i++) { run = grid[i][j] === v ? run + 1 : 1; v = grid[i][j]; if (run > MAX_RAND_FLOAT) { grid[i][j] ^= 1; v = grid[i][j]; run = 1; } }
        }
      }
      const cellUp = grid ? (i, j) => grid[i][j] : top;

      // Half-width of a thread at a point: room is pitch − gap, so neighbouring parallel threads never touch.
      const room = (P - gap) / 2;
      const r0 = Math.max(MIN_R / Math.max(0.15, p.pinch), room * Math.min(1, Math.max(0.4, p.width)));
      const rad = points.length && p.fieldGain
        ? (x, y) => Math.min(room, Math.max(r0 * 0.4, r0 * (1 + p.fieldGain * fieldAt(x, y))))
        : () => Math.min(room, r0);
      const pinch = Math.min(1, Math.max(0.15, p.pinch));

      // Ripple: one smooth displacement for the whole cloth; amplitude capped so local strain ≤ 0.25.
      const lam = Math.max(30, p.rippleLen);
      const A = Math.min(Math.max(0, p.ripple), lam * 0.04);
      const k = (2 * Math.PI) / lam;
      const warpPt = A > 0 ? (x, y) => [x + A * Math.sin(k * (y - cy) + 0.7), y + A * Math.sin(k * (x - cx) + 1.9)] : (x, y) => [x, y];
      const stepLen = Math.min(P / 4, A > 0 ? lam / 16 : Infinity);

      // One float along an axis: `fixed` is the thread's cross position, a..b the cell run along it.
      // `along(c)` gives the cell-centre coordinate, `pt(u)` maps a coordinate along the thread to (x, y).
      const float = (a, b, along, pt) => {
        // Tips stop `gap` short of the edge of the crossing thread before a and after b (or of an imagined
        // one past the edge of the cloth, so edge floats end neatly).
        const ra = rad(...pt(along(a - 1))), rb = rad(...pt(along(b + 1)));
        const tipA = along(a - 1) + ra + gap, tipB = along(b + 1) - rb - gap;
        const eA = Math.max(MIN_R, rad(...pt(tipA)) * pinch), eB = Math.max(MIN_R, rad(...pt(tipB)) * pinch);
        let uA = tipA + eA, uB = tipB - eB;
        if (uB - uA < 0.02) { const m = (uA + uB) / 2; uA = m - 0.01; uB = m + 0.01; }
        const L = uB - uA;
        const ramp = Math.max(1e-6, Math.min(P * 0.55, L / 2));
        const n = Math.max(2, Math.ceil(L / stepLen));
        const pts = [], r = [];
        for (let s = 0; s <= n; s++) {
          const u = uA + (L * s) / n;
          const [x, y] = pt(u);
          const full = rad(x, y), end = s * 2 <= n ? eA : eB;
          const t = Math.min(1, Math.min(u - uA, uB - u) / ramp);
          const sm = t * t * (3 - 2 * t);
          pts.push(warpPt(x, y));
          r.push(Math.max(MIN_R, end + (Math.max(end, full) - end) * Math.sqrt(sm)));
        }
        out.strokes.push({ pts, r });
      };

      // Warp floats: columns, runs of cells where warp is on top.
      if (p.faces !== 'weft')
        for (let i = 0; i < C; i++) {
          const x = x0 + i * P;
          const along = (j) => y0 + j * P, pt = (u) => [x, u];
          for (let j = 0; j < Rw; j++) {
            if (!cellUp(i, j)) continue;
            let b = j;
            while (b + 1 < Rw && cellUp(i, b + 1)) b++;
            float(j, b, along, pt);
            j = b;
          }
        }
      // Weft floats: rows, runs of cells where weft is on top.
      if (p.faces !== 'warp')
        for (let j = 0; j < Rw; j++) {
          const y = y0 + j * P;
          const along = (i) => x0 + i * P, pt = (u) => [u, y];
          for (let i = 0; i < C; i++) {
            if (cellUp(i, j)) continue;
            let b = i;
            while (b + 1 < C && !cellUp(b + 1, j)) b++;
            float(i, b, along, pt);
            i = b;
          }
        }

      out.k = Math.min(Math.max(0.02, p.fillet), gap * 0.35);
      out.count = C * Rw;
      return out;
    },
  };
})();
