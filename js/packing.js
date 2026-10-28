// Circle Pack: greedy "largest hole first" circle packing (the generative-art staple behind Tyler Hobbs' QQL and
// countless Processing sketches). Every round throws a handful of seeded candidate points, measures how big a
// circle each could hold (distance to the boundary and to every placed circle, minus the gap) and keeps the
// roomiest one, capped by a size profile. Big circles therefore claim the open space first and smaller ones fill
// the leftovers, so the board fills Apollonian-style without any circle ever touching another. Packing stops when
// the count is reached or no candidate can hold the minimum radius. Five readings: plain discs, single rings,
// concentric rings (each circle a little target), nested (each ring packed again inside with smaller rings), and a
// tangency network where every ring is bridged to the neighbours it nearly touches, so the froth is one connected
// piece. The size profile (uniform, big centre, big edge, or a left→right / top→bottom ramp) plus field points
// set the radius cap. Rings never leave a hole narrower than 0.6 mm: a circle too small to ring becomes a disc.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3; // narrowest half-width (mm) of any band, bridge or hole
  const CANDIDATES = 24; // candidate points per round
  const PATIENCE = 200; // failed rounds before a region counts as full

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // Pack circles into a region. `room(x, y)` is the signed distance inside the region (positive inside), `cap(x, y)`
  // the largest radius allowed there; returns [{ x, y, r }] largest first.
  function pack(rand, box, room, cap, rMin, gap, max) {
    const out = [];
    let fails = 0;
    while (out.length < max && fails < PATIENCE) {
      let best = null;
      for (let c = 0; c < CANDIDATES; c++) {
        const x = box.x0 + rand() * (box.x1 - box.x0), y = box.y0 + rand() * (box.y1 - box.y0);
        let r = Math.min(room(x, y), cap(x, y));
        if (r < rMin) continue;
        for (let i = 0; i < out.length && r >= rMin; i++) {
          const o = out[i];
          r = Math.min(r, Math.hypot(x - o.x, y - o.y) - o.r - gap);
        }
        if (r >= rMin && (!best || r > best.r)) best = { x, y, r };
      }
      if (best) { out.push(best); fails = 0; } else fails++;
    }
    return out;
  }

  // Closed polyline around a circle, fine enough that the capsule union reads as a true circle.
  function ring(x, y, rc, half) {
    const n = Math.max(24, Math.min(160, Math.ceil((2 * Math.PI * rc) / 1.2)));
    const pts = [], r = [];
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * 2 * Math.PI;
      pts.push([x + rc * Math.cos(a), y + rc * Math.sin(a)]);
      r.push(half);
    }
    return { pts, r };
  }

  SP.generators.packing = {
    id: 'packing',
    name: 'Circle Pack',
    board: true,
    schema: [
      { group: 'Packing' },
      { key: 'count', label: 'Max circles', min: 5, max: 1500, step: 1, def: 400, int: true, rand: [60, 600] },
      { key: 'rMax', label: 'Largest radius (mm)', min: 3, max: 80, step: 0.1, def: 26, rand: [12, 40] },
      { key: 'rMin', label: 'Smallest radius (mm)', min: 1, max: 20, step: 0.1, def: 3, rand: [2, 5] },
      { key: 'gap', label: 'Gap (mm)', min: 0.6, max: 10, step: 0.05, def: 1.6, rand: [0.9, 3] },
      { key: 'profile', label: 'Size profile', type: 'select', def: 'uniform', options: [['uniform', 'Uniform'], ['centre', 'Big in the centre'], ['edge', 'Big at the edge'], ['ramp', 'Ramp left → right'], ['rampY', 'Ramp top → bottom']] },
      { key: 'profileAmt', label: 'Profile strength', min: 0, max: 1, step: 0.01, def: 0.8, rand: [0.4, 1], show: (o) => o.profile !== 'uniform' },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Draw' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'network', options: [['discs', 'Discs'], ['rings', 'Rings'], ['concentric', 'Concentric rings'], ['nested', 'Nested rings'], ['network', 'Tangency network']] },
      { key: 'band', label: 'Band width (mm)', min: 0.6, max: 8, step: 0.05, def: 1.8, rand: [1.2, 3], show: (o) => o.draw !== 'discs' },
      { key: 'pitch', label: 'Ring spacing (mm)', min: 0.6, max: 10, step: 0.05, def: 1.6, rand: [1, 3], show: (o) => o.draw === 'concentric' },
      { key: 'bridge', label: 'Bridge width (mm)', min: 0.6, max: 8, step: 0.05, def: 1.6, rand: [1, 3], show: (o) => o.draw === 'network' },
      { group: 'Board' },
      { key: 'clip', label: 'Fill', type: 'select', def: 'board', options: [['board', 'Whole board'], ['disc', 'Disc']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 4, step: 0.01, def: 0.4, rand: [0.15, 1] },
      { key: 'fieldGain', label: 'Points → grow', min: -2, max: 2, step: 0.01, def: 0.8 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 13);
      const cx = B.w / 2, cy = B.h / 2;
      const mg = Math.max(0, p.margin);
      const disc = p.clip === 'disc';
      const hw = Math.max(2, B.w / 2 - mg), hh = Math.max(2, B.h / 2 - mg);
      const R = Math.min(hw, hh);
      const gap = Math.max(2 * MIN_R, p.gap);
      const half = Math.max(MIN_R, p.band / 2);
      const rMin = Math.max(1, p.rMin);
      const rMax = Math.max(rMin, p.rMax);

      // ---- Size cap: profile (0..1 across the board) blended toward 1 by strength, scaled by field points ----
      const prof = (x, y) => {
        const u = (x - cx) / hw, v = (y - cy) / hh;
        if (p.profile === 'centre') return 1 - clamp01(Math.hypot(u, v) / Math.SQRT2);
        if (p.profile === 'edge') return clamp01(Math.hypot(u, v) / Math.SQRT2);
        if (p.profile === 'ramp') return clamp01((u + 1) / 2);
        if (p.profile === 'rampY') return clamp01((v + 1) / 2);
        return 1;
      };
      const amt = p.profile === 'uniform' ? 0 : clamp01(p.profileAmt);
      const warp = points.length && p.fieldGain ? (x, y) => Math.max(0.25, 1 + p.fieldGain * fieldAt(x, y)) : () => 1;
      const cap = (x, y) => (rMin + (rMax - rMin) * (1 - amt * (1 - prof(x, y)))) * warp(x, y);
      const room = disc
        ? (x, y) => R - Math.hypot(x - cx, y - cy)
        : (x, y) => Math.min(hw - Math.abs(x - cx), hh - Math.abs(y - cy));
      const box = disc ? { x0: cx - R, y0: cy - R, x1: cx + R, y1: cy + R } : { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh };
      const circles = pack(rand, box, room, cap, rMin, gap, Math.max(1, Math.round(p.count)));

      const out = { strokes: [], blobs: [], dots: [], count: circles.length, k: p.fillet };
      // A circle can carry a ring only if the hole inside it stays at least 0.6 mm across; otherwise it's a disc.
      const canRing = (r) => r - 2 * half >= MIN_R;
      const drawRing = (c) => {
        if (canRing(c.r)) out.strokes.push(ring(c.x, c.y, c.r - half, half));
        else out.blobs.push({ x: c.x, y: c.y, r: c.r });
      };

      if (p.draw === 'discs') {
        for (const c of circles) out.blobs.push({ x: c.x, y: c.y, r: c.r });
        return out;
      }

      if (p.draw === 'concentric') {
        // Rings step inward by band + spacing; whatever is left in the middle becomes a centre dot if it's big enough.
        const step = 2 * half + Math.max(2 * MIN_R, p.pitch);
        for (const c of circles) {
          if (!canRing(c.r)) { out.blobs.push({ x: c.x, y: c.y, r: c.r }); continue; }
          let rc = c.r - half;
          while (rc - half >= MIN_R) {
            out.strokes.push(ring(c.x, c.y, rc, half));
            rc -= step;
          }
          const core = rc + half; // outer edge of the next ring that didn't fit
          if (core >= Math.max(MIN_R, half * 0.75)) out.blobs.push({ x: c.x, y: c.y, r: core });
        }
        return out;
      }

      if (p.draw === 'nested') {
        // One more level: pack each ring's interior with circles up to half its free radius (same gap and rules).
        for (const c of circles) {
          drawRing(c);
          const inner = c.r - 2 * half - gap;
          if (inner < 2 * rMin) continue;
          const kids = pack(rand, { x0: c.x - inner, y0: c.y - inner, x1: c.x + inner, y1: c.y + inner },
            (x, y) => inner - Math.hypot(x - c.x, y - c.y), () => Math.max(rMin, inner * 0.5), rMin, gap, 80);
          for (const k of kids) drawRing(k);
          out.count += kids.length;
        }
        return out;
      }

      for (const c of circles) drawRing(c);
      if (p.draw === 'network') {
        // Bridge every pair of circles that nearly touch (gap within 1.6× the packing gap), centreline to centreline;
        // a circle left with no bridge is tied to its nearest neighbour so nothing floats loose.
        const bh = Math.max(MIN_R, Math.min(p.bridge / 2, half * 1.5));
        const reach = gap * 1.6 + 1e-6;
        const linked = new Uint8Array(circles.length);
        const bridge = (a, b) => {
          const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const ux = (b.x - a.x) / d, uy = (b.y - a.y) / d;
          const ra = canRing(a.r) ? a.r - half : a.r * 0.5, rb = canRing(b.r) ? b.r - half : b.r * 0.5;
          out.strokes.push({ pts: [[a.x + ux * ra, a.y + uy * ra], [b.x - ux * rb, b.y - uy * rb]], r: [bh, bh] });
        };
        for (let i = 0; i < circles.length; i++) {
          const a = circles[i];
          for (let j = i + 1; j < circles.length; j++) {
            const b = circles[j];
            if (Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r > reach) continue;
            bridge(a, b);
            linked[i] = linked[j] = 1;
          }
        }
        for (let i = 0; i < circles.length; i++) {
          if (linked[i]) continue;
          const a = circles[i];
          let best = -1, bd = Infinity;
          circles.forEach((b, j) => { const d = Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r; if (j !== i && d < bd) { bd = d; best = j; } });
          if (best >= 0) { bridge(a, circles[best]); linked[best] = 1; }
        }
      }
      return out;
    },
  };
})();
