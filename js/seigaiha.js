// Seigaiha: the Japanese "blue ocean wave" and its Art Deco cousin, the fish-scale fan. The rule is a layering
// rule, not a tiling: identical scales sit on an offset grid (horizontal pitch 2R, every other row shifted by
// half a pitch, rows R/2 apart in the classic proportion) and are laid down row by row, each new row in front of
// the last, so every scale hides the lower part of the ones behind it. What survives of each scale is a crest:
// nested arches whose feet tuck under the two scales in front. A scale is filled with concentric rings (the wave),
// radial ribs under a rim (the Deco fan), or a mix by row, checkerboard or seeded coin flip. The scale outline can
// be stretched tall or flat and drawn up to a pointed ogee top, which turns waves into fish scales or roof tiles.
// Occlusion is computed, not painted: every ring and rib is sampled, a sample is kept only if it stays `gap` plus
// its own half-width outside every scale in front (signed distance to that scale's outline polygon) and inside
// the margin, and run ends are found by bisection. Each surviving run is a round-capped stroke, so the cut ends
// stand exactly `gap` off the scale in front and nothing is ever clipped into a sliver; runs shorter than a
// band's width are dropped. Ring pitch and band width are tied so the gap between rings never drops below 0.6 mm.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3; // narrowest half-width (mm): 0.6 mm bands
  const MIN_GAP = 0.6; // narrowest gap between neighbouring rings or ribs (mm)
  const NPOLY = 120; // outline polygon used for occlusion tests
  const STEP = 1.2; // sample spacing along rings and ribs (mm)

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Unit scale outline in direction th (0 = right, π/2 = up). Horizontal radius 1, height `asp`; the upper half
  // is drawn up to a point by `pt` (the |cos| term has a kink at the top, which is the ogee tip). Screen y grows
  // downward, so "up" is −y.
  function shapeDir(th, asp, pt) {
    const c = Math.cos(th), s = Math.sin(th);
    const k = s > 0 ? asp * (1 + pt * (1 - Math.abs(c))) : asp;
    return [c, -s * k];
  }

  // Signed distance from (x, y) to a closed polygon given as a flat [x0, y0, x1, y1, …] array (negative inside).
  function sdPoly(poly, x, y) {
    const n = poly.length / 2;
    let d2 = Infinity, inside = false;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = poly[2 * j], ay = poly[2 * j + 1], bx = poly[2 * i], by = poly[2 * i + 1];
      const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1), 0, 1);
      const dx = wx - ex * t, dy = wy - ey * t;
      d2 = Math.min(d2, dx * dx + dy * dy);
      if ((ay > y) !== (by > y) && x < ax + ((y - ay) * ex) / ey) inside = !inside;
    }
    return inside ? -Math.sqrt(d2) : Math.sqrt(d2);
  }

  SP.generators.seigaiha = {
    id: 'seigaiha',
    name: 'Seigaiha',
    board: true,
    schema: [
      { group: 'Scales' },
      { key: 'size', label: 'Scale radius (mm)', min: 4, max: 50, step: 0.5, def: 14, rand: [9, 22] },
      { key: 'pitch', label: 'Pitch (× diameter)', min: 0.6, max: 1.5, step: 0.01, def: 1, rand: [0.85, 1.12] },
      { key: 'rowStep', label: 'Row step (× radius)', min: 0.3, max: 1.4, step: 0.01, def: 0.5, rand: [0.42, 0.8] },
      { key: 'aspect', label: 'Height (× radius)', min: 0.6, max: 1.8, step: 0.01, def: 1, rand: [0.85, 1.35] },
      { key: 'point', label: 'Pointed top', min: 0, max: 0.7, step: 0.01, def: 0, rand: [0, 0.35] },
      { key: 'flip', label: 'Fans open downward', type: 'bool', def: false },
      { group: 'Fill' },
      { key: 'fill', label: 'Fill', type: 'select', def: 'rings', options: [['rings', 'Rings (wave)'], ['ribs', 'Ribs (fan)'], ['rows', 'Alternate rows'], ['checker', 'Checkerboard'], ['random', 'Random']] },
      { key: 'rings', label: 'Rings', min: 1, max: 14, step: 1, def: 5, int: true, rand: [3, 7] },
      { key: 'ribs', label: 'Ribs', min: 4, max: 48, step: 1, def: 16, int: true, rand: [10, 24], show: (o) => o.fill !== 'rings' },
      { key: 'hub', label: 'Solid centre', type: 'bool', def: true },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999], show: (o) => o.fill === 'random' },
      { group: 'Bands' },
      { key: 'weight', label: 'Band weight', min: 0.2, max: 0.9, step: 0.01, def: 0.55, rand: [0.4, 0.7] },
      { key: 'gap', label: 'Tuck gap (mm)', min: 0.6, max: 6, step: 0.05, def: 1.2, rand: [0.8, 2] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 3, step: 0.01, def: 0.25 },
      { key: 'fieldGain', label: 'Points → weight', min: -2, max: 2, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], count: 0 };
      const rand = rng(Math.round(p.seed) * 2654435761 + 11);
      const R = Math.max(3, p.size);
      const asp = clamp(p.aspect, 0.5, 2), pt = clamp(p.point, 0, 0.8);
      const m = Math.min(1, asp); // narrowest direction of the outline (× R)
      const up = asp * (1 + pt), dn = asp; // reach above / below the centre (× R)
      const P = Math.max(0.5, p.pitch) * 2 * R, S = Math.max(0.2, p.rowStep) * R;
      const gap = Math.max(MIN_GAP, p.gap);
      const mg = Math.max(0, p.margin);
      const flip = !!p.flip;
      // Everything is built with fans opening up (−y) and later rows (+y) in front, then mirrored if flipped.
      const scr = (x, y) => (flip ? [x, B.h - y] : [x, y]);

      // ---- Ring pitch and band half-width, so rings always keep MIN_GAP between them ----
      let nR = Math.max(1, Math.round(p.rings));
      while (nR > 1 && (R / (nR + 0.5)) * m < 2 * MIN_R + MIN_GAP) nR--;
      const d = R / (nR + 0.5); // ring pitch along the outline's horizontal radius
      const rMax = Math.max(MIN_R, ((d * m - MIN_GAP) / 2)); // widest half-width that keeps the gap
      const r0 = clamp(p.weight * d * m * 0.5, MIN_R, rMax);
      const sep = Math.max(MIN_GAP, d * m - 2 * r0); // gap between neighbouring bands at default weight
      const rho0 = R - r0 / m; // outer ring centre, so its outer edge never passes the outline
      const warp = points.length && p.fieldGain ? (x, y) => 1 + p.fieldGain * fieldAt(x, y) : null;
      const halfAt = (x, y, base, cap) => clamp(warp ? base * warp(...scr(x, y)) : base, MIN_R, cap);

      // ---- Outline polygon (relative to a scale centre, full size R) ----
      const poly = new Float64Array(NPOLY * 2);
      for (let i = 0; i < NPOLY; i++) { const q = shapeDir((i / NPOLY) * 2 * Math.PI, asp, pt); poly[2 * i] = q[0] * R; poly[2 * i + 1] = q[1] * R; }
      const reach = R * Math.max(1, up) + gap + rMax; // beyond this a scale cannot hide anything

      // ---- The offset grid: every scale whose outline (grown by the gap) touches the margin rectangle ----
      const cx = B.w / 2, cy = B.h / 2;
      const J = Math.ceil((B.h / 2 + R * (up + dn) + gap) / S) + 1, I = Math.ceil((B.w / 2 + R + gap) / P) + 1;
      const grow = gap + rMax;
      const scales = [];
      for (let j = -J; j <= J; j++)
        for (let i = -I; i <= I; i++) {
          const x = cx + (i + (j & 1) * 0.5) * P, y = cy + j * S;
          if (x + R + grow < mg || x - R - grow > B.w - mg || y + R * dn + grow < mg || y - R * up - grow > B.h - mg) continue;
          scales.push({ i, j, x, y });
        }
      // Who is in front: later rows within reach.
      const byRow = new Map();
      for (const s of scales) (byRow.get(s.j) || byRow.set(s.j, []).get(s.j)).push(s);
      const rowsAhead = Math.ceil((R * (up + dn) + grow) / S);
      for (const s of scales) {
        s.front = [];
        for (let jj = s.j + 1; jj <= s.j + rowsAhead; jj++)
          for (const q of byRow.get(jj) || []) if (Math.abs(q.x - s.x) <= 2 * R + grow) s.front.push(q);
      }

      const visible = (s, x, y, r) => {
        if (x - r < mg || x + r > B.w - mg || y - r < mg || y + r > B.h - mg) return false;
        for (const q of s.front) {
          const dx = x - q.x, dy = y - q.y;
          if (dx * dx + dy * dy > reach * reach) continue;
          if (sdPoly(poly, dx, dy) <= gap + r) return false;
        }
        return true;
      };

      // Sample a curve at(u) (u in [0, 1], periodic when closed), keep the visible runs, bisect their ends and
      // emit each run as a round-capped stroke.
      const emit = (s, at, len, closed, base, cap) => {
        const n = Math.max(closed ? 24 : 2, Math.ceil(len / STEP));
        const N = closed ? n : n + 1;
        const P0 = [], V = [];
        for (let k = 0; k < N; k++) { const q = at(k / n); P0.push(q); V.push(visible(s, q[0], q[1], halfAt(q[0], q[1], base, cap))); }
        const vis = (u) => { const q = at(u); return visible(s, q[0], q[1], halfAt(q[0], q[1], base, cap)); };
        // Boundary between a visible u and a hidden u: bisect towards the last visible point.
        const edge = (uIn, uOut) => { for (let it = 0; it < 7; it++) { const um = (uIn + uOut) / 2; if (vis(um)) uIn = um; else uOut = um; } return at(uIn); };
        const push = (pts) => {
          let L = 0;
          for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
          if (L < Math.max(2 * base, 1.2)) return;
          const sp = pts.map((q) => scr(q[0], q[1]));
          out.strokes.push({ pts: sp, r: pts.map((q) => halfAt(q[0], q[1], base, cap)) });
        };
        if (closed && V.every(Boolean)) { push([...P0, P0[0]]); return; }
        // Walk the samples once, starting just after a hidden one when closed so no run wraps.
        let start = 0;
        if (closed) start = V.indexOf(false);
        const idx = (k) => (closed ? (k % N + N) % N : k);
        const uOf = (k) => k / n; // unwrapped: at() is periodic for closed curves
        let run = null;
        const last = closed ? start + N : N - 1;
        for (let k = closed ? start + 1 : 0; k <= last; k++) {
          const v = closed && k === start + N ? false : V[idx(k)];
          if (v && !run) run = [k > 0 || closed ? edge(uOf(k), uOf(k - 1)) : P0[0]];
          if (v) run.push(P0[idx(k)]);
          if (!v && run) { run.push(edge(uOf(k - 1), uOf(k))); push(run); run = null; }
        }
        if (run) push(run); // open curve visible to its end
      };

      // ---- Fill each scale ----
      for (const s of scales) {
        let kind = p.fill;
        if (kind === 'rows') kind = s.j & 1 ? 'ribs' : 'rings';
        else if (kind === 'checker') kind = (s.i + s.j) & 1 ? 'ribs' : 'rings';
        else if (kind === 'random') kind = rand() < 0.5 ? 'rings' : 'ribs';
        const ring = (rho) => emit(s, (u) => { const q = shapeDir(u * 2 * Math.PI, asp, pt); return [s.x + q[0] * rho, s.y + q[1] * rho]; }, 2 * Math.PI * rho * Math.max(1, asp), true, r0, rMax);
        // A solid centre of radius a is a circle of radius a/2 drawn with half-width a/2, so it is cut like a ring.
        const disc = (a) => { if (a < 2 * MIN_R) return; const h = a / 2; emit(s, (u) => [s.x + Math.cos(u * 2 * Math.PI) * h, s.y + Math.sin(u * 2 * Math.PI) * h], 2 * Math.PI * h, true, h, h); };

        if (kind === 'rings') {
          let rho = rho0, k = 0;
          for (; k < nR && rho * m >= r0 + MIN_R; k++, rho -= d) ring(rho);
          if (p.hub) disc((rho0 - k * d) * m + r0);
        } else {
          ring(rho0); // the rim
          // Ribs start where neighbours are a band plus a gap apart; fewer ribs if that is too far out.
          let nb = Math.max(4, Math.round(p.ribs));
          const rs = (k) => (k * (2 * r0 + sep)) / (2 * Math.PI * m);
          while (nb > 4 && rs(nb) > rho0 * 0.72) nb--;
          const rIn = rs(nb);
          for (let b = 0; b < nb; b++) {
            const th = Math.PI / 2 + (b * 2 * Math.PI) / nb; // one rib points straight up
            const q = shapeDir(th, asp, pt);
            const a = [s.x + q[0] * rIn, s.y + q[1] * rIn], z = [s.x + q[0] * rho0, s.y + q[1] * rho0];
            emit(s, (u) => [a[0] + (z[0] - a[0]) * u, a[1] + (z[1] - a[1]) * u], Math.hypot(z[0] - a[0], z[1] - a[1]), false, r0, rMax);
          }
          if (p.hub) disc(rIn * m + r0);
        }
      }

      out.k = Math.min(Math.max(0.02, p.fillet), sep * 0.35);
      out.count = scales.length;
      return out;
    },
  };
})();
