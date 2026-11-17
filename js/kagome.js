// Kagome: triaxial basketry (kagome / mutsume-ami, "six-eyed weave"). Three families of straight strips run at
// 60° to each other and interlace around hexagonal holes, like a bamboo basket or a cane chair seat. Family k
// lies on the lines n_k · (x − c) = (i + o_k) · pitch with normals 120° apart, so n_0 + n_1 + n_2 = 0 and three
// lines can only meet when the offsets o_k sum to an integer. Shifting one family by `shift` of a pitch pulls
// the triple points apart into two triangles per point: 0.5 gives the true kagome (trihexagonal) net with equal
// triangles, smaller values give the lopsided triangles of a loosely woven basket. The weave rule is one line:
// family k always passes over family k + 1 (mod 3). Along any strip the crossings alternate between the other
// two families, so each strip goes over, under, over, under — the classic self-bracing triaxial interlace.
// A strip is drawn as pillow-shaped pieces running from one under-crossing to the next; each tip stops `gap`
// short of the edge of the strip it dives under (measured across the 60° crossing), and the radius ramps up
// slower than the tip pulls away from that strip, so every piece is its own closed island. Omitted strips
// open bigger holes and simply join the pieces of the strips that would have dived under them. An optional
// ripple or dome bends the whole weave through one smooth map whose strain is capped and paid for up front in
// the clearances. Pieces are trimmed against a rectangle, circle or hexagon frame, optionally with a rim band.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3; // narrowest half-width anywhere (mm): 0.6 mm features
  const SIN60 = Math.sqrt(3) / 2;
  const MAX_STRAIN = 0.25; // warp shrinks local distances by at most this fraction
  const RAMP_SLOPE = 0.55; // radius growth per mm along a strip; < sin 60° · (1 − MAX_STRAIN)

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const smooth = (t) => t * t * (3 - 2 * t);

  // Frame as a signed distance (negative inside; exact inside, which is all the trimming needs) plus the closed
  // centreline of a rim band of half-width rh hugging it.
  function makeFrame(shape, B, mg) {
    const cx = B.w / 2, cy = B.h / 2;
    if (shape === 'circle') {
      const R = Math.max(5, Math.min(B.w, B.h) / 2 - mg);
      return {
        sdf: (x, y) => Math.hypot(x - cx, y - cy) - R,
        rim: (rh) => { const pts = []; for (let i = 0; i <= 160; i++) { const a = (i / 160) * 2 * Math.PI; pts.push([cx + (R - rh) * Math.cos(a), cy + (R - rh) * Math.sin(a)]); } return pts; },
      };
    }
    let verts;
    if (shape === 'hexagon') {
      // Flat-topped regular hexagon as large as the board allows.
      const R = Math.max(5, Math.min((B.w - 2 * mg) / 2, (B.h - 2 * mg) / Math.sqrt(3)));
      verts = [];
      for (let i = 0; i < 6; i++) verts.push([cx + R * Math.cos((i * Math.PI) / 3), cy + R * Math.sin((i * Math.PI) / 3)]);
    } else {
      const hw = Math.max(5, B.w / 2 - mg), hh = Math.max(5, B.h / 2 - mg);
      verts = [[cx - hw, cy - hh], [cx + hw, cy - hh], [cx + hw, cy + hh], [cx - hw, cy + hh]];
    }
    // Convex polygon: max over edges of the signed distance to the edge line (outward normals).
    const edges = verts.map((a, i) => {
      const b = verts[(i + 1) % verts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
      const s = (cx - a[0]) * nx + (cy - a[1]) * ny < 0 ? 1 : -1; // flip so the normal points out
      return [a[0], a[1], nx * s, ny * s];
    });
    const inr = Math.min(...edges.map(([ax, ay, nx, ny]) => (ax - cx) * nx + (ay - cy) * ny));
    return {
      sdf: (x, y) => { let d = -Infinity; for (const [ax, ay, nx, ny] of edges) d = Math.max(d, (x - ax) * nx + (y - ay) * ny); return d; },
      rim: (rh) => {
        // Every edge moves in by rh: a rectangle's corners step in diagonally, a regular hexagon scales.
        const pts = shape === 'hexagon'
          ? verts.map(([x, y]) => { const f = (inr - rh) / inr; return [cx + (x - cx) * f, cy + (y - cy) * f]; })
          : verts.map(([x, y]) => [x + (x < cx ? rh : -rh), y + (y < cy ? rh : -rh)]);
        pts.push(pts[0].slice());
        return pts;
      },
    };
  }

  SP.generators.kagome = {
    id: 'kagome',
    name: 'Kagome',
    board: true,
    schema: [
      { group: 'Lattice' },
      { key: 'pitch', label: 'Strip pitch (mm)', min: 5, max: 40, step: 0.1, def: 13, rand: [9, 18] },
      { key: 'shift', label: 'Triangle split (0.5 = kagome)', min: 0.2, max: 0.5, step: 0.01, def: 0.5, rand: [0.36, 0.5] },
      { key: 'angle', label: 'Rotation °', min: 0, max: 60, step: 0.5, def: 0, rand: [0, 60] },
      { key: 'omit', label: 'Omit strips', min: 0, max: 0.5, step: 0.01, def: 0, rand: [0, 0.22] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999], show: (o) => o.omit > 0 },
      { group: 'Strips' },
      { key: 'width', label: 'Strip width (× room)', min: 0.4, max: 1, step: 0.01, def: 1, rand: [0.75, 1] },
      { key: 'gap', label: 'Gap (mm)', min: 0.8, max: 4, step: 0.05, def: 1.1, rand: [0.9, 1.6] },
      { key: 'pinch', label: 'Tip pinch', min: 0.2, max: 1, step: 0.01, def: 0.8, rand: [0.55, 1] },
      { group: 'Warp' },
      { key: 'warp', label: 'Warp', type: 'select', def: 'none', options: [['none', 'Flat'], ['ripple', 'Ripple'], ['dome', 'Dome']] },
      { key: 'warpAmt', label: 'Warp amount', min: 0, max: 1, step: 0.01, def: 0.6, rand: [0.3, 1], show: (o) => o.warp !== 'none' },
      { group: 'Frame' },
      { key: 'shape', label: 'Frame', type: 'select', def: 'rect', options: [['rect', 'Board'], ['circle', 'Circle'], ['hexagon', 'Hexagon']] },
      { key: 'rim', label: 'Rim band', type: 'bool', def: false },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 2, step: 0.01, def: 0.25 },
      { key: 'fieldGain', label: 'Points → thicken', min: -1, max: 1, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], count: 0 };
      const s = Math.max(5, p.pitch), gap = Math.max(0.8, p.gap);
      const pinch = Math.min(1, Math.max(0.2, p.pinch));
      const sh = Math.min(0.5, Math.max(0.2, p.shift));
      const cx = B.w / 2, cy = B.h / 2;
      const half = Math.hypot(B.w, B.h) / 2;

      // Warp: one smooth map for the whole weave. Its worst-case strain eps is paid for in every clearance.
      const amt = p.warp === 'none' ? 0 : Math.min(1, Math.max(0, p.warpAmt));
      const eps = MAX_STRAIN * amt;
      let warp = (x, y) => [x, y];
      let reach = half + s; // lattice must cover the pre-image of the board
      let stepLen = Math.min(s / 6, 2);
      if (amt > 0 && p.warp === 'ripple') {
        // Two crossed sine displacements; amplitude · wavenumber = eps bounds the strain.
        const lam = Math.max(60, s * 9), k = (2 * Math.PI) / lam, A = eps / k;
        warp = (x, y) => [x + A * Math.sin(k * (y - cy) + 0.7), y + A * Math.sin(k * (x - cx) + 1.9)];
        reach += A;
        stepLen = Math.min(stepLen, lam / 16);
      } else if (amt > 0 && p.warp === 'dome') {
        // Radial pull-in v·(1 − b·|v|²/R²): the middle swells, the edges crowd (radial strain 3b·ρ² ≤ eps).
        const R = half * 1.15, b = eps / (3 * (half / R) ** 2);
        warp = (x, y) => { const vx = x - cx, vy = y - cy, f = 1 - (b * (vx * vx + vy * vy)) / (R * R); return [cx + vx * f, cy + vy * f]; };
        reach = half * 1.3 + s;
      }
      const shrink = 1 - eps;

      // Room: parallel strips keep `gap` apart, and a tip cut at an under-crossing must stop well before the
      // nearest over-crossing (e = shortest spacing between crossings along a strip) so the strip is at full
      // width where it carries another one (over half of each piece stays visible).
      const e = ((2 * s) / Math.sqrt(3)) * Math.min(sh, 1 - sh);
      const parRoom = Math.max(MIN_R, (s * shrink - gap) / 2);
      const tipRoom = (0.55 * e * shrink * SIN60 - gap) / (1 + pinch);
      const rmax = Math.max(MIN_R, Math.min(parRoom, tipRoom));
      const r0 = Math.min(parRoom, Math.max(MIN_R / pinch, rmax * Math.min(1, Math.max(0.4, p.width))));
      const rad = points.length && p.fieldGain
        ? (x, y) => Math.min(parRoom, Math.max(r0 * 0.4, r0 * (1 + p.fieldGain * fieldAt(x, y))))
        : () => r0;

      // Frame, with the rim band (if any) as one more closed stroke the strips keep `gap` from.
      const frame = makeFrame(p.shape, B, Math.max(0, p.margin));
      const rh = Math.max(MIN_R * 2, r0 * 1.15);
      let inset = 0;
      if (p.rim) {
        const pts = frame.rim(rh);
        out.strokes.push({ pts, r: pts.map(() => rh) });
        inset = 2 * rh + gap;
      }

      // Lattice. Family k: unit normal n_k at 120° steps, direction d_k = n_k turned 90°.
      const a0 = ((p.angle || 0) + 30) * (Math.PI / 180); // angle 0 → one family runs horizontally
      const fam = [0, 1, 2].map((k) => {
        const t = a0 + (k * 2 * Math.PI) / 3;
        return { n: [Math.cos(t), Math.sin(t)], d: [-Math.sin(t), Math.cos(t)], o: k === 2 ? sh : 0 };
      });
      const iMax = Math.ceil(reach / s) + 1;
      const omit = Math.min(0.5, Math.max(0, p.omit));
      const seed = Math.round(p.seed) || 1;
      const present = fam.map((f, k) => {
        const on = new Map();
        for (let i = -iMax; i <= iMax; i++) on.set(i, omit <= 0 || rng(seed * 7919 + k * 104729 + (i + 5000) * 31)() >= omit);
        return on;
      });

      // Keep the parts of a sampled piece whose discs sit `inset` inside the frame; ends are moved onto the
      // boundary by linear interpolation so each cut end is a round cap tangent to the frame (or rim gap).
      const emit = (pts, r) => {
        const f = pts.map(([x, y], i) => frame.sdf(x, y) + r[i] + inset);
        let run = null;
        const flush = () => {
          if (!run || run.pts.length < 2) { run = null; return; }
          let len = 0, rm = 0;
          for (let i = 1; i < run.pts.length; i++) len += Math.hypot(run.pts[i][0] - run.pts[i - 1][0], run.pts[i][1] - run.pts[i - 1][1]);
          for (const v of run.r) rm = Math.max(rm, v);
          if (len >= 3 * rm) { out.strokes.push(run); out.count++; } // no stubs at the frame
          run = null;
        };
        const cut = (i, j) => { const t = f[i] / (f[i] - f[j]); return [[pts[i][0] + (pts[j][0] - pts[i][0]) * t, pts[i][1] + (pts[j][1] - pts[i][1]) * t], r[i] + (r[j] - r[i]) * t]; };
        for (let i = 0; i < pts.length; i++) {
          if (f[i] <= 0) {
            if (!run) { run = { pts: [], r: [] }; if (i > 0) { const [q, rr] = cut(i, i - 1); run.pts.push(q); run.r.push(rr); } }
            run.pts.push(pts[i]); run.r.push(r[i]);
          } else if (run) {
            const [q, rr] = cut(i - 1, i); run.pts.push(q); run.r.push(rr);
            flush();
          }
        }
        flush();
      };

      for (let k = 0; k < 3; k++) {
        const F = fam[k], U = fam[(k + 2) % 3]; // k dives under family k + 2
        const uSign = -1 / SIN60; // n_{k+2} · d_k = −sin 60°
        for (let i = -iMax; i <= iMax; i++) {
          if (!present[k].get(i)) continue;
          const a = (i + F.o) * s;
          if (Math.abs(a) > reach) continue;
          const L = Math.sqrt(reach * reach - a * a);
          const at = (u) => [cx + a * F.n[0] + u * F.d[0], cy + a * F.n[1] + u * F.d[1]];
          // Under-crossings with the present lines of family k + 2, in order along the strip.
          const unders = [];
          for (let m = -iMax; m <= iMax; m++) {
            if (!present[(k + 2) % 3].get(m)) continue;
            const u = ((m + U.o) * s + a / 2) * uSign;
            if (u > -L - s * 2 && u < L + s * 2) unders.push(u);
          }
          unders.sort((x, y) => x - y);
          // Open ends past the first/last crossing run on to the edge of the lattice disc.
          unders.unshift(Math.min(-L - s * 2, (unders[0] ?? 0) - 2 * s));
          unders.push(Math.max(L + s * 2, unders[unders.length - 1] + 2 * s));
          for (let q = 0; q + 1 < unders.length; q++) {
            const u0 = unders[q], u1 = unders[q + 1];
            const open0 = q === 0, open1 = q + 2 === unders.length;
            // Tip radius and cut distance from the over-strip's actual radius at the crossing.
            const tip = (u) => {
              const w = warp(...at(u));
              const rr = rad(w[0], w[1]), re = Math.max(MIN_R, rr * pinch);
              return { re, du: (rr + gap + re) / (shrink * SIN60) };
            };
            const t0 = open0 ? { re: r0 * pinch, du: 0 } : tip(u0), t1 = open1 ? { re: r0 * pinch, du: 0 } : tip(u1);
            const uA = u0 + t0.du, uB = u1 - t1.du;
            if (uB - uA < 0.05) continue;
            const n = Math.max(8, Math.ceil((uB - uA) / stepLen));
            const pts = [], r = [];
            for (let j = 0; j <= n; j++) {
              const u = uA + ((uB - uA) * j) / n;
              const w = warp(...at(u));
              const full = rad(w[0], w[1]);
              const dA = u - uA, dB = uB - u, end = dA <= dB ? t0.re : t1.re;
              const ramp = (Math.max(end, full) - end) / RAMP_SLOPE * 1.5 + 1e-6;
              pts.push(w);
              r.push(Math.max(MIN_R, end + (Math.max(end, full) - end) * smooth(Math.min(1, Math.min(dA, dB) / ramp))));
            }
            emit(pts, r);
          }
        }
      }

      out.k = Math.min(Math.max(0.02, p.fillet), gap * 0.35);
      return out;
    },
  };
})();
