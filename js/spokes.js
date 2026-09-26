// Spoke Ring: a ring cut into wedge spokes by constant-width gaps. Accent spokes (every Nth) can be
// slotted from the inner end (a "∩" shape) or the outer end (a fork), shifted in or out, and the
// whole ring can twist into a spiral. Rounded corners are exact; twist is Lipschitz-corrected.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180, TAU = Math.PI * 2;
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  // Intersection of two ~perpendicular regions with the convex corner rounded by radius r.
  const roundMax = (a, b, r) => { const qa = a + r, qb = b + r; return Math.hypot(Math.max(qa, 0), Math.max(qb, 0)) + Math.min(Math.max(qa, qb), 0) - r; };

  SP.generators.spokes = {
    id: 'spokes',
    name: 'Spoke Ring',
    board: true,
    schema: [
      { group: 'Ring' },
      { key: 'count', label: 'Spokes', min: 2, max: 48, step: 1, def: 12, int: true, rand: [6, 20] },
      { key: 'rIn', label: 'Inner radius (mm)', min: 0, max: 150, step: 0.5, def: 24, rand: [10, 40] },
      { key: 'rOut', label: 'Outer radius (mm)', min: 5, max: 200, step: 0.5, def: 92, rand: [60, 95] },
      { key: 'gap', label: 'Gap (mm)', min: 0, max: 30, step: 0.1, def: 5, rand: [2, 9] },
      { key: 'round', label: 'Corner radius (mm)', min: 0, max: 15, step: 0.1, def: 3, rand: [0.5, 5] },
      { key: 'rot', label: 'Rotation °', min: -180, max: 180, step: 0.5, def: 90 },
      { key: 'twist', label: 'Twist °', min: -120, max: 120, step: 0.5, def: 0, rand: [-50, 50] },
      { group: 'Accent spokes' },
      { key: 'every', label: 'Every Nth spoke (0 = none)', min: 0, max: 6, step: 1, def: 2, int: true, rand: [0, 3] },
      { key: 'slotFrom', label: 'Slot opens at', type: 'select', def: 'inner', options: [['inner', 'Inner end'], ['outer', 'Outer end (fork)'], ['none', 'No slot']] },
      { key: 'slotW', label: 'Slot width (mm)', min: 0.2, max: 30, step: 0.1, def: 4.5, rand: [2, 8] },
      { key: 'slotDepth', label: 'Slot depth', min: 0.05, max: 0.98, step: 0.01, def: 0.7, rand: [0.4, 0.85] },
      { key: 'slotTaper', label: 'Slot widens with radius', type: 'bool', def: true },
      { key: 'accWidth', label: 'Accent width (× spoke)', min: 0.3, max: 3, step: 0.01, def: 1 },
      { key: 'accIn', label: 'Accent inner shift (mm)', min: -60, max: 60, step: 0.5, def: 0 },
      { key: 'accOut', label: 'Accent outer shift (mm)', min: -60, max: 60, step: 0.5, def: 0 },
      { key: 'plainIn', label: 'Other spokes inner shift (mm)', min: -60, max: 60, step: 0.5, def: 0 },
      { key: 'plainOut', label: 'Other spokes outer shift (mm)', min: -60, max: 60, step: 0.5, def: 0 },
    ],

    generateBoard(p, ctx) {
      const B = ctx.board, cx = B.w / 2, cy = B.h / 2;
      const N = Math.max(2, Math.round(p.count)), half = Math.PI / N, g = p.gap / 2, rho = p.round;
      const L = Math.max(1e-3, p.rOut - p.rIn), tau = (p.twist * D2R) / L;
      const lip = Math.sqrt(1 + (tau * (p.rOut + Math.max(0, p.accOut, p.plainOut))) ** 2);
      const every = Math.round(p.every);
      // Angular layout: in each period of `every` spokes the accent takes accWidth shares, the rest split
      // what's left, so accents can be wider (or narrower) than plain spokes.
      const E = every > 0 ? every : 1, aw = every > 0 && E > 1 ? p.accWidth : 1;
      const share = (E * aw) / (aw + E - 1), plainShare = E / (aw + E - 1);
      const cen = [], hw = [];
      let acc0 = 0;
      for (let i = 0; i < N; i++) {
        const sh = (every > 0 && i % E === 0 ? share : plainShare) * 2 * half;
        cen.push(acc0 + sh / 2); hw.push(sh / 2); acc0 += sh;
      }
      const shift = cen[0]; // spoke 0 centred on `rot`
      for (let i = 0; i < N; i++) cen[i] -= shift;
      const spoke = (i, x, y) => {
        const acc = every > 0 && i % every === 0;
        const a = p.rot * D2R + cen[i] * (TAU / acc0);
        const half = hw[i] * (TAU / acc0);
        const ca = Math.cos(a), sa = Math.sin(a);
        const u = ca * x + sa * y, v = -sa * x + ca * y; // u along the spoke axis, v across (visual: y up handled by sign)
        const r = Math.hypot(u, v);
        // Side lines through the centre at ±half, pushed inward by g.
        const s1 = Math.sin(half), c1 = Math.cos(half);
        const d1 = v * c1 - u * s1 + g, d2 = -v * c1 - u * s1 + g;
        const wedge = Math.max(d1, d2);
        const r0 = p.rIn + (acc ? p.accIn : p.plainIn), r1 = p.rOut + (acc ? p.accOut : p.plainOut);
        let f = roundMax(wedge, Math.max(r0 - r, r - r1), Math.min(rho, (r1 - r0) / 2));
        if (acc && p.slotFrom !== 'none') {
          const depth = p.slotDepth * (r1 - r0);
          const inner = p.slotFrom === 'inner';
          const ra = inner ? r0 - 50 : r1 - depth, rb = inner ? r0 + depth : r1 + 50;
          const t = Math.min(rb, Math.max(ra, u));
          // Slot half-width grows with radius so its walls stay parallel to the spoke sides when tapered.
          const hw = p.slotTaper ? (p.slotW / 2) * Math.max(0.2, t / ((r0 + r1) / 2)) : p.slotW / 2;
          const slot = Math.hypot(u - t, v) - hw;
          f = smax(f, -slot, Math.min(rho, p.slotW / 2) * 0.8);
        }
        return f;
      };
      const evalFn = (X, Y) => {
        let x = X - cx, y = -(Y - cy);
        if (tau) {
          const t = Math.hypot(x, y) - p.rIn, ph = -tau * Math.min(L * 1.5, Math.max(-L * 0.5, t));
          const c = Math.cos(ph), s = Math.sin(ph);
          [x, y] = [c * x - s * y, s * x + c * y];
        }
        const th = Math.atan2(y, x) - p.rot * D2R;
        const i0 = Math.round(th / (2 * half));
        let f = 1e9;
        for (let k = -2; k <= 2; k++) f = Math.min(f, spoke((((i0 + k) % N) + N) % N, x, y));
        return f / lip;
      };
      const e = Math.max(p.rOut, p.rOut + p.accOut, p.rOut + p.plainOut) + 4;
      return { evalFn, domain: { x0: cx - e, y0: cy - e, x1: cx + e, y1: cy + e }, count: N };
    },
  };
})();
