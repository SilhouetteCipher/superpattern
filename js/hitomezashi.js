// Hitomezashi: the "one-stitch" sashiko rule. Every grid line carries one bit. Along a line the running stitch
// covers every other unit segment, and the bit says which parity it starts on. Where lines cross, each lattice
// point ends up with exactly one stitch in every direction, so on the square grid the stitches chain into forced
// staircase strands (every lattice point is an L-turn, never a crossing) that close into loops or run off the
// edge, and the regions they bound are 2-colourable: colour(i, j) = i·j + Σv + Σh + i + j (mod 2) flips exactly
// where a stitch is crossed. On the triangular grid three line families meet at every lattice point, so the
// strands branch instead and the regions are a crazy-paving of triangles, trapezia and hexagonal nets.
// The bits come from a seeded coin, a word (vowels = 1, as in Ayliean MacDonald's Numberphile demonstration),
// the digits of π (odd = 1), or a mirrored coin that makes the pattern symmetric about both board axes.
// The field is an exact distance to the stitch set: for a point, only the two nearest lines of each family
// matter, and on a line only the unit segment under the point and its two neighbours (one of which is always a
// stitch). A polynomial smooth-min between lines rounds the convex corners of every region; the inset gap
// rounds the concave ones. Drawn as the regions of one colour (the classic two-tone embroidery read), as every
// region inset by a gap, or as the strands themselves, optionally broken back into individual stitches.
(function () {
  const SP = (window.SP = window.SP || {});
  const SQ3 = Math.sqrt(3);
  const MIN_W = 0.6; // narrowest strand / region gap (mm)
  const PI_DIGITS = '14159265358979323846264338327950288419716939937510582097494459230781640628620899862803482534211706798214808651328230664709384460955058223172535940812848111745028410270193852110555964462294895493038196';

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  const mod2 = (n) => ((n % 2) + 2) % 2;
  const mod = (a, n) => ((a % n) + n) % n;

  // Bit sequence for one line family. `k` is the line index (negative allowed), `n` the running position in
  // the shared word / π sequence.
  function makeBits(p, f, kmin, kmax, rand, half) {
    const bits = {};
    const word = String(p.word || '').toUpperCase();
    const vowels = 'AEIOUY';
    const base = Math.round(p.shift) + f * 37;
    for (let k = kmin; k <= kmax; k++) {
      let b;
      if (p.source === 'word' && word.length) b = vowels.includes(word[mod(base + k - kmin, word.length)]) ? 1 : 0;
      else if (p.source === 'pi') b = +PI_DIGITS[mod(base + k - kmin, PI_DIGITS.length)] & 1;
      else if (p.source === 'mirror') {
        // Lines k and its mirror image share a bit. Square lines sit at (k + ½)·cell so the image of k is −k−1;
        // triangular lines pass through the centre so it is −k.
        const m = half ? (k < 0 ? -k - 1 : k) : Math.abs(k);
        if (bits[m] === undefined) bits[m] = rand() < p.ratio ? 1 : 0;
        b = bits[m];
      } else b = rand() < p.ratio ? 1 : 0;
      bits[k] = b;
    }
    return bits;
  }

  SP.generators.hitomezashi = {
    id: 'hitomezashi',
    name: 'Hitomezashi',
    board: true,
    schema: [
      { group: 'Grid' },
      { key: 'grid', label: 'Grid', type: 'select', def: 'square', options: [['square', 'Square (loops, two-colour regions)'], ['triangle', 'Triangular (branching nets)']] },
      { key: 'cell', label: 'Stitch length (mm)', min: 3, max: 40, step: 0.1, def: 9, rand: [6, 14] },
      { key: 'angle', label: 'Rotate °', min: -45, max: 45, step: 0.5, def: 0, rand: [0, 0] },
      { group: 'Stitch bits' },
      { key: 'source', label: 'Bits from', type: 'select', def: 'random', options: [['random', 'Seeded coin'], ['mirror', 'Mirrored coin (symmetric)'], ['word', 'A word (vowels = 1)'], ['pi', 'Digits of π (odd = 1)']] },
      { key: 'word', label: 'Word', type: 'text', def: 'SUPERPATTERN', maxLength: 24, show: (o) => o.source === 'word' },
      { key: 'ratio', label: 'Share of 1s', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0.3, 0.7], show: (o) => o.source === 'random' || o.source === 'mirror' },
      { key: 'shift', label: 'Sequence shift', min: 0, max: 60, step: 1, def: 0, int: true, rand: [0, 60], show: (o) => o.source === 'word' || o.source === 'pi' },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Draw' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'regions', options: [['regions', 'Regions of one colour'], ['cells', 'Every region, inset'], ['strands', 'Strands (stitch lines)']] },
      { key: 'swap', label: 'Swap colours', type: 'bool', def: false, show: (o) => o.draw === 'regions' },
      { key: 'gap', label: 'Region gap (mm)', min: 0.6, max: 15, step: 0.05, def: 2.4, rand: [1.4, 4], show: (o) => o.draw !== 'strands' },
      { key: 'width', label: 'Strand width (mm)', min: 0.6, max: 15, step: 0.05, def: 2.2, rand: [1.4, 4], show: (o) => o.draw === 'strands' },
      { key: 'stitchGap', label: 'Gap between stitches (mm)', min: 0, max: 10, step: 0.05, def: 0, rand: [0, 0], show: (o) => o.draw === 'strands' },
      { key: 'round', label: 'Corner rounding (mm)', min: 0, max: 10, step: 0.05, def: 1.6, rand: [0.6, 3] },
      { group: 'Board' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'edgeRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Edge fillet', min: 0.02, max: 3, step: 0.01, def: 0.4 },
      { key: 'fieldGain', label: 'Points → widen', min: -2, max: 2, step: 0.01, def: 1 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const tri = p.grid === 'triangle';
      const c = Math.max(1, p.cell);
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2, hw = Math.max(1, B.w / 2 - mg), hh = Math.max(1, B.h / 2 - mg);
      const rand = rng(Math.round(p.seed) * 7919 + 11);
      const rot = (p.angle * Math.PI) / 180, cr = Math.cos(rot), sr = Math.sin(rot);

      // Line families: unit direction d, normal n, perpendicular spacing s. Lines of a family sit at
      // P·n = (k + off)·s; lattice points on line k are at P·d = (tOff(k) + m)·c.
      // Square: lines at (k + ½)·cell so the board centre is a cell centre (mirror symmetry works out).
      // Triangle: lines through the centre, spaced cell·√3/2, lattice points shifted by k/2 along the line.
      const dirs = tri ? [[1, 0], [0.5, SQ3 / 2], [-0.5, SQ3 / 2]] : [[1, 0], [0, 1]];
      const spacing = tri ? (c * SQ3) / 2 : c;
      const off = tri ? 0 : 0.5;
      const fams = dirs.map(([dx, dy], f) => {
        const d = [dx * cr - dy * sr, dx * sr + dy * cr];
        const n = [-d[1], d[0]];
        // Line index range that covers the board (corners of the full board, not just the plate).
        let kmin = Infinity, kmax = -Infinity;
        for (const [x, y] of [[0, 0], [B.w, 0], [0, B.h], [B.w, B.h]]) {
          const s = ((x - cx) * n[0] + (y - cy) * n[1]) / spacing - off;
          kmin = Math.min(kmin, Math.floor(s) - 1); kmax = Math.max(kmax, Math.ceil(s) + 1);
        }
        return { d, n, kmin, kmax, bits: makeBits(p, f, kmin, kmax, rand, !tri) };
      });
      const tOff = (k) => (tri ? k / 2 : 0.5);
      // Stitch on unit segment m of line k of family `fam`?
      const stitch = (fam, k, m) => mod2(m + fam.bits[Math.min(fam.kmax, Math.max(fam.kmin, k))]) === 0;

      const w2 = Math.max(MIN_W, p.width) / 2, g2 = Math.max(MIN_W, p.gap) / 2;
      // Strands broken into stitches: neighbouring stitches meet at a lattice point at 90° (square) or 60°
      // (triangle), so their ends sit 2·pullback·sin(θ/2) apart. Pull each end back so the clear distance
      // between the round caps is exactly `stitchGap`.
      const sinHalf = tri ? 0.5 : Math.SQRT1_2;
      const shrink = p.draw === 'strands' && p.stitchGap > 0 ? Math.min(0.45, (p.stitchGap + 2 * w2) / (2 * sinHalf) / c) : 0;
      // Distance (mm) from a point to the stitch set of one line family.
      const famDist = (fam, x, y) => {
        const px = x - cx, py = y - cy;
        const s = (px * fam.n[0] + py * fam.n[1]) / spacing - off;
        const t = (px * fam.d[0] + py * fam.d[1]) / c;
        const k0 = Math.floor(s);
        let best = Infinity;
        for (let k = k0; k <= k0 + 1; k++) {
          const dn = Math.abs(s - k) * spacing;
          if (dn >= best) continue;
          const tt = t - tOff(k), m0 = Math.floor(tt);
          for (let m = m0 - 1; m <= m0 + 1; m++) {
            if (!stitch(fam, k, m)) continue;
            const dt = Math.max(0, m + shrink - tt, tt - (m + 1 - shrink)) * c;
            best = Math.min(best, Math.hypot(dn, dt));
          }
        }
        return best;
      };
      const kr = Math.max(0, p.round);
      // Clamped at 0: the smooth-min dips below zero right at a lattice point, and in the two-colour read that
      // sign flip would open a notch across the stitch.
      const dist = (x, y) => {
        let d = famDist(fams[0], x, y);
        for (let f = 1; f < fams.length; f++) d = smin(d, famDist(fams[f], x, y), kr);
        return Math.max(0, d);
      };

      // Two-colouring of the square-grid regions (cell (i, j) lies between lines i, i+1 and j, j+1).
      let colour = null;
      if (!tri && p.draw === 'regions') {
        const pre = fams.map((fam) => {
          const acc = {};
          let s = 0;
          for (let k = fam.kmin; k <= fam.kmax; k++) { s += fam.bits[k]; acc[k] = s; }
          return acc;
        });
        const V = pre[1], H = pre[0]; // family 1 (vertical lines) is indexed along x, family 0 along y
        const flip = p.swap ? 1 : 0;
        colour = (x, y) => {
          const px = x - cx, py = y - cy;
          const i = Math.floor((px * fams[1].n[0] + py * fams[1].n[1]) / spacing - off);
          const j = Math.floor((px * fams[0].n[0] + py * fams[0].n[1]) / spacing - off);
          const ci = Math.min(fams[1].kmax, Math.max(fams[1].kmin, i)), cj = Math.min(fams[0].kmax, Math.max(fams[0].kmin, j));
          return mod2(i * j + V[ci] + H[cj] + i + j + flip) === 0 ? 1 : -1;
        };
      }

      const warp = points.length && p.fieldGain ? (x, y) => Math.max(0.3, 1 + p.fieldGain * fieldAt(x, y)) : null;
      let shape;
      if (p.draw === 'strands') shape = (x, y) => dist(x, y) - w2 * (warp ? warp(x, y) : 1);
      else if (colour) shape = (x, y) => g2 * (warp ? warp(x, y) : 1) - colour(x, y) * dist(x, y);
      else shape = (x, y) => g2 * (warp ? warp(x, y) : 1) - dist(x, y);

      const rr = Math.min(p.edgeRound, hw, hh);
      const outline = (x, y) => { const qx = Math.abs(x - cx) - hw + rr, qy = Math.abs(y - cy) - hh + rr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; };
      const k = Math.max(0.02, p.fillet);
      const evalFn = (x, y) => smax(shape(x, y), outline(x, y), k);
      return { evalFn, domain: { x0: mg - 3, y0: mg - 3, x1: B.w - mg + 3, y1: B.h - mg + 3 }, count: 1 };
    },
  };
})();
