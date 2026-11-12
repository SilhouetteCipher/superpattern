// Karesansui: the raked gravel of a Japanese dry rock garden. The gardener's rule is simple: rocks sit in small
// groups (traditionally of one, two or three stones), the gravel round each group is raked into concentric rings that
// follow the stones' outline like ripples round an island, and beyond the rings the rake is pulled in long parallel
// lines across the whole garden, which stop short where they meet the outermost ring. Gardens also rake gentle waves
// in place of straight lines, or let the rings spread until the ripples of neighbouring groups meet.
// Everything is an implicit field. Rocks are wobbly circles; D, the distance from a point to the nearest rock group,
// is their smooth minimum, so the rings round two nearby groups fuse into one rounded offset outline instead of
// crossing. The rings are the bands where D lands on a multiple of the rake pitch (D is divided by |∇D| so the bands
// keep their width through the smooth blends), and the lines are bands of the rotated, optionally waved coordinate,
// cut back wherever D is inside the ring zone plus a gap. The wave amplitude is capped so steep wave flanks never
// pinch the gap between lines under 0.6 mm. A raised frame can run round the garden like its edging stones; field
// points drop extra rocks.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_W = 0.6; // narrowest rake ridge / gap between ridges (mm)
  const H = 0.05; // finite-difference step for |∇D| (mm)

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function smin(a, b, k) { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }

  SP.generators.karesansui = {
    id: 'karesansui',
    name: 'Karesansui',
    board: true,
    schema: [
      { group: 'Rocks' },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 23, int: true, rand: [1, 9999] },
      { key: 'groups', label: 'Rock groups', min: 1, max: 7, step: 1, def: 3, int: true, rand: [2, 5] },
      { key: 'perGroup', label: 'Stones per group', min: 1, max: 4, step: 1, def: 2, int: true, rand: [1, 3] },
      { key: 'rockSize', label: 'Rock size (mm)', min: 3, max: 30, step: 0.5, def: 10, rand: [6, 15] },
      { key: 'irregular', label: 'Irregularity', min: 0, max: 0.3, step: 0.01, def: 0.14, rand: [0, 0.25] },
      { key: 'rocks', label: 'Rocks', type: 'select', def: 'solid', options: [['solid', 'Raised stones'], ['hidden', 'Hidden (rings only)']] },
      { group: 'Rake' },
      { key: 'pitch', label: 'Rake pitch (mm)', min: 1.5, max: 14, step: 0.1, def: 4.5, rand: [3.2, 7] },
      { key: 'width', label: 'Ridge width (mm)', min: 0.6, max: 8, step: 0.05, def: 2, rand: [1.2, 3.2] },
      { key: 'rings', label: 'Rings per group', min: 1, max: 14, step: 1, def: 5, int: true, rand: [2, 8] },
      { key: 'firstGap', label: 'Gap to stone (mm)', min: 0.6, max: 12, step: 0.1, def: 2.4, rand: [1.2, 4] },
      { key: 'merge', label: 'Ring merge (mm)', min: 0, max: 40, step: 0.5, def: 12, rand: [4, 24] },
      { group: 'Gravel' },
      { key: 'sand', label: 'Open gravel', type: 'select', def: 'lines', options: [['lines', 'Raked lines'], ['ripples', 'Ripples fill the garden'], ['plain', 'Plain (rings only)']] },
      { key: 'angle', label: 'Line angle °', min: -90, max: 90, step: 1, def: 0, rand: [-30, 30], show: (o) => o.sand === 'lines' },
      { key: 'wave', label: 'Wave height (mm)', min: 0, max: 12, step: 0.1, def: 0, rand: [0, 5], show: (o) => o.sand === 'lines' },
      { key: 'waveLen', label: 'Wavelength (mm)', min: 15, max: 200, step: 1, def: 70, rand: [40, 120], show: (o) => o.sand === 'lines' },
      { key: 'lineGap', label: 'Gap to rings (mm)', min: 0.6, max: 12, step: 0.1, def: 2.4, rand: [1.2, 4], show: (o) => o.sand === 'lines' },
      { group: 'Board' },
      { key: 'frame', label: 'Edging frame (mm)', min: 0, max: 12, step: 0.1, def: 0, rand: [0, 5] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'edgeRound', label: 'Outline corner (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.5, rand: [0.2, 1] },
      { key: 'fieldRocks', label: 'Points → extra rocks', type: 'bool', def: true },
    ],

    generateBoard(p, ctx) {
      const { board: B, points } = ctx;
      const rand = rng(p.seed);
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2, hw = Math.max(1, B.w / 2 - mg), hh = Math.max(1, B.h / 2 - mg);
      const frame = Math.max(0, p.frame) >= MIN_W ? p.frame : 0;

      // ---- Rake geometry: ridge width never leaves less than MIN_W of gravel between ridges ----
      const pitch = Math.max(2 * MIN_W, p.pitch);
      const w2 = Math.max(MIN_W, Math.min(p.width, pitch - MIN_W)) / 2;
      const nRings = Math.max(1, Math.round(p.rings));
      const g0 = Math.max(MIN_W, p.firstGap);
      const zone = g0 + (nRings - 1) * pitch + 2 * w2; // rock surface → outer edge of the last ring
      const k = Math.max(0.02, p.fillet);

      // ---- Place rock groups by dart throwing inside the garden, then cluster stones round each centre ----
      const rs = Math.max(1.5, p.rockSize);
      const inset = frame + rs * 1.2;
      const ix = Math.max(0, hw - inset), iy = Math.max(0, hh - inset);
      const G = Math.max(1, Math.round(p.groups)), per = Math.max(1, Math.round(p.perGroup));
      const centres = [];
      let spacing = 2 * (rs + zone) * 0.85;
      for (let tries = 0; centres.length < G && tries < 4000; tries++) {
        if (tries && tries % 400 === 0) spacing *= 0.85; // crowded garden: relax the spacing rather than drop groups
        const x = cx + (rand() * 2 - 1) * ix, y = cy + (rand() * 2 - 1) * iy;
        if (centres.every((c) => Math.hypot(c[0] - x, c[1] - y) >= spacing)) centres.push([x, y]);
      }
      const rocks = [];
      const addRock = (x, y, r, grp) => rocks.push({ x, y, r, grp, a2: rand() * 2 * Math.PI, a3: rand() * 2 * Math.PI, w: Math.max(0, Math.min(0.3, p.irregular)) * (0.6 + 0.8 * rand()) });
      centres.forEach((c, gi) => {
        const r0 = rs * (0.8 + 0.4 * rand());
        addRock(c[0], c[1], r0, gi);
        let ang = rand() * 2 * Math.PI;
        for (let j = 1; j < per; j++) {
          // Companion stones are smaller and lean on the main one, so the group reads as one cluster.
          const rj = r0 * (0.4 + 0.3 * rand());
          const dj = (r0 + rj) * (0.85 + 0.3 * rand());
          ang += (2 * Math.PI) / per + (rand() - 0.5) * 1.2;
          addRock(c[0] + dj * Math.cos(ang), c[1] + dj * Math.sin(ang), rj, gi);
        }
      });
      if (p.fieldRocks && points.length) {
        points.forEach((q, i) => {
          if (Math.abs(q.x - cx) < hw && Math.abs(q.y - cy) < hh) addRock(q.x, q.y, rs * 0.8, G + i);
        });
      }
      if (!rocks.length) addRock(cx, cy, rs, 0);

      // Wobbly circle: radius modulated by two low harmonics (a near-distance while the wobble stays small).
      const rockD = (rk, x, y) => {
        const dx = x - rk.x, dy = y - rk.y, th = Math.atan2(dy, dx);
        const rr = rk.r * (1 + rk.w * (0.6 * Math.sin(2 * th + rk.a2) + 0.4 * Math.sin(3 * th + rk.a3)));
        return Math.hypot(dx, dy) - rr;
      };
      // Stones within a group fuse with a small blend; groups' ring outlines fuse with the larger "merge" blend.
      const kStone = Math.min(3, rs * 0.25), kMerge = Math.max(0, p.merge);
      const byGroup = new Map();
      for (const rk of rocks) { if (!byGroup.has(rk.grp)) byGroup.set(rk.grp, []); byGroup.get(rk.grp).push(rk); }
      const groupList = [...byGroup.values()];
      let stones = Infinity; // side result of groupD: the stones themselves (hard min across groups)
      const groupD = (x, y) => {
        let d = Infinity;
        stones = Infinity;
        for (const grp of groupList) {
          let g = Infinity;
          for (const rk of grp) g = smin(g, rockD(rk, x, y), kStone);
          stones = Math.min(stones, g);
          d = smin(d, g, kMerge);
        }
        return d;
      };

      // ---- Raked lines: the rotated (and optionally waved) coordinate, with the wave capped for MIN_W gaps ----
      const rot = (p.angle || 0) * D2R, cr = Math.cos(rot), sr = Math.sin(rot);
      const lam = Math.max(5, p.waveLen), kw = (2 * Math.PI) / lam;
      const gMax = pitch / (2 * w2 + MIN_W);
      const amp = Math.min(Math.max(0, p.wave), gMax > 1 ? Math.sqrt(gMax * gMax - 1) / kw : 0);
      const lineD = (x, y) => {
        const u = (x - cx) * cr + (y - cy) * sr, v0 = -(x - cx) * sr + (y - cy) * cr;
        const v = v0 + amp * Math.sin(kw * u);
        const g = Math.hypot(1, amp * kw * Math.cos(kw * u));
        return Math.abs(v - pitch * Math.round(v / pitch)) / g - w2;
      };

      // ---- Outline (rounded rectangle) and the garden bed inside the optional frame ----
      const rr = Math.min(p.edgeRound, hw, hh);
      const outline = (x, y) => { const qx = Math.abs(x - cx) - hw + rr, qy = Math.abs(y - cy) - hh + rr; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; };
      const bedGap = Math.max(MIN_W, p.lineGap);

      const sand = p.sand;
      const evalFn = (x, y) => {
        const o = outline(x, y);
        if (o > 2) return o;
        // Rings: bands of D at firstGap + w/2 + j·pitch, measured in mm through the blends.
        const d = groupD(x, y), st = stones;
        const gx = (groupD(x + H, y) - d) / H, gy = (groupD(x, y + H) - d) / H;
        const gr = Math.max(0.2, Math.hypot(gx, gy));
        const s = d - g0 - w2;
        let j = Math.round(s / pitch);
        j = Math.max(0, sand === 'ripples' ? j : Math.min(nRings - 1, j));
        let shape = Math.abs(s - j * pitch) / gr - w2;
        if (sand === 'lines') shape = Math.min(shape, smax(lineD(x, y), zone + bedGap - d, k));
        if (p.rocks === 'solid') shape = Math.min(shape, st);
        // Raking stops short of the frame; the frame itself is a band just inside the outline.
        let v;
        if (frame) {
          v = smax(shape, o + frame + bedGap, k);
          v = Math.min(v, Math.max(o, -(o + frame)));
        } else v = shape;
        return smax(v, o, k);
      };
      return { evalFn, domain: { x0: mg - 3, y0: mg - 3, x1: B.w - mg + 3, y1: B.h - mg + 3 }, count: 1 };
    },
  };
})();
