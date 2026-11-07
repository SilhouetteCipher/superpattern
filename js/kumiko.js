// Kumiko: the Japanese shoji lattice, built the way the joiner builds it. First the jigumi, a base grid of
// strips half-lapped into equilateral triangles; then a tsukeko insert is pressed into every triangle cell. The
// insert decides the motif: three arms from the corners to the centre give asanoha (hemp leaf), arms from the
// centre to the side midpoints give kikkō (tortoise-shell hexagons), the medial triangle nests a smaller grid,
// asanoha with a ring adds a small inner triangle, and the pinwheel lays three cevians that stop at each other
// (Routh's inner triangle). Panels mix two inserts: up/down triangles alternate, whole hexagonal flowers
// switch (the six cells around every third lattice vertex), cells switch at random, or the panel fades from
// one insert to the other across the board or out from the centre, the way kumiko panels often do. Field
// points pull cells over to the second insert. The field is the ice-ray rule: half a bar width minus the
// distance to the nearest strip (soft-min across the two nearest, which rounds each opening), with jigumi
// strips allowed to be heavier than inserts, inside an optional frame bar.
(function () {
  const SP = (window.SP = window.SP || {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  // Hash of a lattice cell, so per-cell and per-hexagon choices don't depend on loop order.
  function hash(a, b, c, seed) {
    let h = Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791) ^ Math.imul(seed | 0, 2654435761);
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  const mid = (P, Q, t = 0.5) => [P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t];
  // Parameter along P→Q where it meets line R→S (or Infinity if parallel).
  function cross(P, Q, R, S) {
    const dx = Q[0] - P[0], dy = Q[1] - P[1], ex = S[0] - R[0], ey = S[1] - R[1], den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return Infinity;
    return ((R[0] - P[0]) * ey - (R[1] - P[1]) * ex) / den;
  }

  // The insert strips for one triangle cell A, B, C (counter-clockwise). `inner` shapes ringed and pinwheel.
  function insert(kind, A, B, C, inner) {
    const G = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3];
    const V = [A, B, C], out = [];
    if (kind === 'asanoha' || kind === 'ringed') {
      for (const P of V) out.push([P, G]);
      if (kind === 'ringed') {
        const s = 0.18 + 0.42 * inner, R = V.map((P) => mid(G, P, s));
        for (let i = 0; i < 3; i++) out.push([R[i], R[(i + 1) % 3]]);
      }
    } else if (kind === 'kikko') {
      for (let i = 0; i < 3; i++) out.push([G, mid(V[i], V[(i + 1) % 3])]);
    } else if (kind === 'medial') {
      const M = [mid(A, B), mid(B, C), mid(C, A)];
      for (let i = 0; i < 3; i++) out.push([M[i], M[(i + 1) % 3]]);
    } else if (kind === 'pinwheel') {
      // Cevian from each corner to the next-but-one side at fraction t; each runs to its farther crossing.
      const t = 0.18 + 0.26 * inner;
      const cev = V.map((P, i) => [P, mid(V[(i + 1) % 3], V[(i + 2) % 3], t)]);
      for (let i = 0; i < 3; i++) {
        const [P, Q] = cev[i];
        let far = 0;
        for (let j = 0; j < 3; j++) if (j !== i) { const u = cross(P, Q, cev[j][0], cev[j][1]); if (u > 0 && u < 1) far = Math.max(far, u); }
        if (far > 0) out.push([P, mid(P, Q, far)]);
      }
    }
    return out;
  }

  let cache = { key: null };

  SP.generators.kumiko = {
    id: 'kumiko',
    name: 'Kumiko',
    board: true,
    schema: [
      { group: 'Panel' },
      { key: 'shape', label: 'Outline', type: 'select', def: 'square', options: [['square', 'Rounded rectangle'], ['circle', 'Circle']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'frame', label: 'Frame bar (mm)', min: 0, max: 20, step: 0.1, def: 4, rand: [0, 6] },
      { group: 'Jigumi' },
      { key: 'cell', label: 'Triangle side (mm)', min: 8, max: 120, step: 0.5, def: 30, rand: [20, 48] },
      { key: 'turn', label: 'Grid turn', type: 'select', def: 0, options: [[0, 'Rows across'], [90, 'Rows down']] },
      { key: 'jigumi', label: 'Grid strip (mm)', min: 0.6, max: 12, step: 0.05, def: 2.2, rand: [1.4, 3.4] },
      { group: 'Tsukeko' },
      { key: 'insA', label: 'Insert', type: 'select', def: 'asanoha', options: [['asanoha', 'Asanoha (hemp leaf)'], ['kikko', 'Kikkō (tortoise shell)'], ['ringed', 'Asanoha with ring'], ['pinwheel', 'Pinwheel'], ['medial', 'Nested triangle'], ['plain', 'Plain grid']] },
      { key: 'insB', label: 'Second insert', type: 'select', def: 'plain', options: [['asanoha', 'Asanoha (hemp leaf)'], ['kikko', 'Kikkō (tortoise shell)'], ['ringed', 'Asanoha with ring'], ['pinwheel', 'Pinwheel'], ['medial', 'Nested triangle'], ['plain', 'Plain grid']] },
      { key: 'arrange', label: 'Mix', type: 'select', def: 'hexes', options: [['single', 'First insert only'], ['alternate', 'Up / down cells'], ['hexes', 'Hexagon flowers'], ['cells', 'Random cells'], ['fade', 'Fade across'], ['radial', 'Fade from centre']] },
      { key: 'mix', label: 'Second insert share', min: 0, max: 1, step: 0.01, def: 0.4, rand: [0.2, 0.7] },
      { key: 'inner', label: 'Ring / pinwheel size', min: 0, max: 1, step: 0.01, def: 0.5, rand: [0.2, 0.8] },
      { key: 'bar', label: 'Insert strip (mm)', min: 0.6, max: 10, step: 0.05, def: 1.5, rand: [1, 2.4] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 5, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'round', label: 'Opening round (mm)', min: 0, max: 10, step: 0.1, def: 1.2, rand: [0.4, 2.5] },
      { key: 'fieldGain', label: 'Field points → second', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const m = Math.min(p.margin, Math.min(B.w, B.h) / 2 - 5);
      const x0 = m, y0 = m, W = B.w - 2 * m, H = B.h - 2 * m, cx = B.w / 2, cy = B.h / 2;
      const R = Math.min(W, H) / 2, cr = Math.min(8, W / 2, H / 2);
      const outline = p.shape === 'circle'
        ? (x, y) => Math.hypot(x - cx, y - cy) - R
        : (x, y) => { const qx = Math.abs(x - cx) - W / 2 + cr, qy = Math.abs(y - cy) - H / 2 + cr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - cr; };
      const s = Math.max(4, p.cell), h = (s * Math.sqrt(3)) / 2;
      const key = JSON.stringify([p.shape, p.margin, s, +p.turn, p.jigumi, p.insA, p.insB, p.arrange, p.mix, p.inner, p.bar, p.seed, p.fieldGain, B.w, B.h, p.fieldGain ? points : 0]);
      if (cache.key !== key) {
        const rand = rng(p.seed * 2654435761);
        const off = rand() * 0.6 - 0.3; // dither for the fades
        const rot = +p.turn === 90;
        // Lattice vertex (a, b) = a·e1 + b·e2 around the board centre, which is a hexagon centre.
        const V = (a, b) => { const u = (a + b / 2) * s, v = b * h; return rot ? [cx + v, cy + u] : [cx + u, cy + v]; };
        const span = Math.hypot(W, H) / 2 + 2 * s;
        const nb = Math.ceil(span / h) + 1, na = Math.ceil(span / s) + nb;
        const Rmax = p.shape === 'circle' ? R : Math.hypot(W, H) / 2;
        const segs = [];
        let count = 0;
        const pickB = (a, b, up, P) => {
          let t;
          switch (p.arrange) {
            case 'single': t = false; break;
            case 'alternate': t = !up; break;
            case 'hexes': {
              // The cell's corner with (a − b) ≡ 0 (mod 3) is the centre of its hexagon.
              const cs = up ? [[a, b], [a + 1, b], [a, b + 1]] : [[a + 1, b], [a + 1, b + 1], [a, b + 1]];
              const c = cs.find(([i, j]) => (((i - j) % 3) + 3) % 3 === 0);
              t = hash(c[0], c[1], 7, p.seed) < p.mix; break;
            }
            case 'cells': t = hash(a, b, up ? 1 : 2, p.seed) < p.mix; break;
            case 'fade': case 'radial': {
              const u = p.arrange === 'fade' ? (rot ? (P[1] - y0) / H : (P[0] - x0) / W) : Math.hypot(P[0] - cx, P[1] - cy) / Rmax;
              t = u + (hash(a, b, up ? 3 : 4, p.seed) - 0.5) * 0.35 + off * 0.1 < p.mix; break;
            }
            default: t = false;
          }
          if (points.length && p.fieldGain) { const f = fieldAt(P[0], P[1]) * p.fieldGain; if (f > 0.5) t = true; else if (f < -0.5) t = false; }
          return t;
        };
        for (let b = -nb; b <= nb; b++)
          for (let a = -na; a <= na; a++) {
            const A = V(a, b), Bv = V(a + 1, b), C = V(a, b + 1), D = V(a + 1, b + 1);
            for (const up of [true, false]) {
              const T = up ? [A, Bv, C] : [Bv, D, C];
              const G = [(T[0][0] + T[1][0] + T[2][0]) / 3, (T[0][1] + T[1][1] + T[2][1]) / 3];
              if (outline(G[0], G[1]) > s * 0.6) continue;
              count++;
              const kind = pickB(a, b, up, G) ? p.insB : p.insA;
              for (const e of insert(kind, T[0], T[1], T[2], p.inner)) segs.push([e[0][0], e[0][1], e[1][0], e[1][1], p.bar / 2]);
              // Each jigumi edge borders one up cell: the up cell lays all three.
              if (up) for (const e of [[A, Bv], [Bv, C], [C, A]]) segs.push([e[0][0], e[0][1], e[1][0], e[1][1], p.jigumi / 2]);
            }
          }
        segs.forEach((sg, i) => sg.push(i));
        const bs = Math.max(4, s * 0.5), bins = new Map();
        segs.forEach((sg, si) => {
          const bi0 = Math.floor(Math.min(sg[0], sg[2]) / bs), bi1 = Math.floor(Math.max(sg[0], sg[2]) / bs);
          const bj0 = Math.floor(Math.min(sg[1], sg[3]) / bs), bj1 = Math.floor(Math.max(sg[1], sg[3]) / bs);
          for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) { const k = bi + ',' + bj; (bins.get(k) || bins.set(k, []).get(k)).push(si); }
        });
        cache = { key, segs, bins, bs, count };
      }
      const { segs, bins, bs, count } = cache;
      const kr = p.round, F = p.frame, reach = bs;
      // The two smallest signed strip distances (distance minus half-width), from different strips.
      const nearestTwo = (x, y) => {
        const bi = Math.floor(x / bs), bj = Math.floor(y / bs);
        let d1 = Infinity, id1 = -1, d2 = Infinity;
        for (let jj = bj - 1; jj <= bj + 1; jj++)
          for (let ii = bi - 1; ii <= bi + 1; ii++) {
            const L = bins.get(ii + ',' + jj);
            if (!L) continue;
            for (const si of L) {
              const sg = segs[si];
              const dx = sg[2] - sg[0], dy = sg[3] - sg[1], L2 = dx * dx + dy * dy;
              const t = L2 > 1e-12 ? clamp(((x - sg[0]) * dx + (y - sg[1]) * dy) / L2, 0, 1) : 0;
              const d = Math.hypot(x - (sg[0] + dx * t), y - (sg[1] + dy * t)) - sg[4];
              if (sg[5] === id1) { if (d < d1) d1 = d; }
              else if (d < d1) { d2 = d1; d1 = d; id1 = sg[5]; }
              else if (d < d2) d2 = d;
            }
          }
        return [d1, d2];
      };
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        const [d1, d2] = nearestTwo(x, y);
        const d = d1 > reach ? reach : d2 < Infinity ? smin(d1, d2, kr) : d1;
        // Strips plus the frame band, filleted where they meet; nothing outside the panel.
        const band = F > 0 ? Math.max(o, -(o + F)) : 1e9;
        return Math.max(smin(d, band, Math.min(kr, p.bar / 2) * 0.5 + 0.2), o);
      };
      const pad = 3;
      return { evalFn, domain: { x0: x0 - pad, y0: y0 - pad, x1: x0 + W + pad, y1: y0 + H + pad }, count };
    },
  };
})();
