// Stepped Lines: long parallel scribed lines that jog sideways. Lines run along one axis in lanes of
// even pitch; every column they may step to the next lane with a 45° or 90° jog, end (optionally on a
// pad), or a new line may start in a free lane. Lines keep their order, so they never cross or touch.
// Everything is strokes clipped to the board, so the run can take any angle. Field points make lines
// step more often around them.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function clipSeg(a, b, X0, Y0, X1, Y1) {
    let t0 = 0, t1 = 1;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const P = [-dx, dx, -dy, dy], Q = [a[0] - X0, X1 - a[0], a[1] - Y0, Y1 - a[1]];
    for (let i = 0; i < 4; i++) {
      if (P[i] === 0) { if (Q[i] < 0) return null; continue; }
      const t = Q[i] / P[i];
      if (P[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
    return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
  }
  // Clip a polyline to a rectangle: the pieces inside, each a polyline.
  function clipPoly(pts, X0, Y0, X1, Y1) {
    const out = [];
    let cur = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const s = clipSeg(pts[i], pts[i + 1], X0, Y0, X1, Y1);
      if (!s) { cur = null; continue; }
      if (cur && Math.hypot(cur[cur.length - 1][0] - s[0][0], cur[cur.length - 1][1] - s[0][1]) < 1e-6) cur.push(s[1]);
      else { cur = [s[0], s[1]]; out.push(cur); }
    }
    return out;
  }

  SP.generators.steplines = {
    id: 'steplines',
    name: 'Stepped Lines',
    board: true,
    schema: [
      { group: 'Lanes' },
      { key: 'angle', label: 'Angle °', min: -90, max: 90, step: 1, def: 0, rand: [-20, 20] },
      { key: 'pitch', label: 'Lane pitch (mm)', min: 1.5, max: 30, step: 0.1, def: 5, rand: [3.5, 9] },
      { key: 'fill', label: 'Lanes used', min: 0.05, max: 0.9, step: 0.01, def: 0.4, rand: [0.2, 0.6] },
      { key: 'colW', label: 'Step spacing (mm)', min: 3, max: 80, step: 0.5, def: 14, rand: [8, 24] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 5, int: true, rand: [1, 9999] },
      { group: 'Steps' },
      { key: 'style', label: 'Step style', type: 'select', def: '45', options: [['45', '45° jog'], ['90', '90° jog']] },
      { key: 'stepChance', label: 'Step chance', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0.1, 0.45] },
      { key: 'stepMax', label: 'Max step (lanes)', min: 1, max: 4, step: 1, def: 2, int: true, rand: [1, 3] },
      { key: 'endChance', label: 'End chance', min: 0, max: 0.5, step: 0.01, def: 0.06, rand: [0.02, 0.12] },
      { key: 'startChance', label: 'Start chance', min: 0, max: 0.5, step: 0.01, def: 0.05, rand: [0.02, 0.1] },
      { group: 'Lines' },
      { key: 'wMin', label: 'Width min (mm)', min: 0.3, max: 6, step: 0.05, def: 0.8, rand: [0.5, 1.2] },
      { key: 'wMax', label: 'Width max (mm)', min: 0.3, max: 10, step: 0.05, def: 2, rand: [1.4, 3] },
      { key: 'thick', label: 'Thick line share', min: 0, max: 1, step: 0.01, def: 0.25, rand: [0.1, 0.4] },
      { key: 'pads', label: 'End pads', type: 'bool', def: true },
      { key: 'padR', label: 'Pad radius (mm)', min: 0.3, max: 6, step: 0.05, def: 1.5, rand: [1, 2.5] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.1, rand: [0.05, 0.3] },
      { group: 'Field' },
      { key: 'fieldStep', label: 'Points → more steps', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 37);
      const mg = p.margin, X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg;
      const cx = B.w / 2, cy = B.h / 2, R = Math.hypot(B.w, B.h) / 2 + 1;
      const t = (p.angle * Math.PI) / 180, ca = Math.cos(t), sa = Math.sin(t);
      const W = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const wMin = Math.min(p.wMin, p.wMax), wMax = Math.max(p.wMin, p.wMax);
      const NL = Math.max(2, Math.floor((2 * R) / p.pitch)), NC = Math.ceil((2 * R) / p.colW) + 1;
      const laneV = (i) => -R + (i + 0.5) * p.pitch;
      const inside = (x, y, r) => x > X0 + r && x < X1 - r && y > Y0 + r && y < Y1 - r;
      const diag = p.style === '45';
      const stepMax = Math.max(1, Math.round(p.stepMax));

      const newLine = (lane, u) => ({ lane, prev: lane, pts: [[u, laneV(lane)]], w: rand() < p.thick ? wMax : wMin + (wMax - wMin) * rand() * 0.5, born: u, padStart: u > -R });
      const finish = (L, u) => {
        L.pts.push([u, laneV(L.lane)]);
        const world = L.pts.map(([uu, vv]) => W(uu, vv));
        for (const piece of clipPoly(world, X0, Y0, X1, Y1)) out.strokes.push({ pts: piece, r: piece.map(() => L.w / 2) });
        if (p.pads) {
          const pr = Math.max(p.padR, L.w / 2);
          if (L.padStart) { const [x, y] = world[0]; if (inside(x, y, pr)) out.blobs.push({ x, y, r: pr }); }
          if (u < R) { const [x, y] = world[world.length - 1]; if (inside(x, y, pr)) out.blobs.push({ x, y, r: pr }); }
        }
        out.count++;
      };

      // Seed the lanes at the far edge.
      let active = [];
      for (let i = 0; i < NL; i++) if (rand() < p.fill) active.push(newLine(i, -R));
      if (!active.length) active.push(newLine(Math.floor(NL / 2), -R));

      for (let k = 1; k < NC; k++) {
        const u = -R + k * p.colW;
        // Ends.
        const keep = [];
        for (const L of active) {
          if (u - L.born >= 2 * p.colW && rand() < p.endChance && u < R) finish(L, u); else keep.push(L);
        }
        active = keep;
        // Steps: new lanes stay strictly increasing, so lines never cross.
        const maxDiag = diag ? Math.max(1, Math.floor((p.colW * 0.8) / p.pitch)) : stepMax;
        for (let i = 0; i < active.length; i++) {
          const L = active[i];
          L.prev = L.lane;
          const lo = i > 0 ? active[i - 1].lane + 1 : 0, hi = i + 1 < active.length ? active[i + 1].lane - 1 : NL - 1;
          const [wx, wy] = W(u, laneV(L.lane));
          const chance = points.length && p.fieldStep ? Math.min(1, Math.max(0, p.stepChance * (1 + p.fieldStep * 2 * fieldAt(wx, wy)))) : p.stepChance;
          if (rand() >= chance) continue;
          const dir = rand() < 0.5 ? -1 : 1;
          const n = 1 + Math.floor(rand() * Math.min(stepMax, maxDiag));
          const target = Math.max(lo, Math.min(hi, L.lane + dir * n));
          if (target === L.lane) continue;
          const run = diag ? Math.abs(target - L.lane) * p.pitch : 0;
          L.pts.push([u, laneV(L.lane)], [u + run, laneV(target)]);
          L.lane = target;
        }
        // Starts in lanes nobody used in this column or the last.
        if (u < R - 2 * p.colW) {
          const taken = new Set();
          for (const L of active) { taken.add(L.lane); taken.add(L.prev); }
          const nStart = Math.round(p.startChance * NL * (0.5 + rand()));
          for (let s = 0; s < nStart; s++) {
            const lane = Math.floor(rand() * NL);
            if (taken.has(lane) || taken.has(lane - 1) && taken.has(lane + 1)) continue;
            taken.add(lane);
            active.push(newLine(lane, u));
          }
          active.sort((a, b) => a.lane - b.lane);
        }
      }
      for (const L of active) finish(L, R);
      return out;
    },
  };
})();
