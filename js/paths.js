// Line Paths: a centre path (chevron / meander / hook / spiral / wave) with filleted corners,
// drawn as a bundle of N parallel lines. Copies: rotational symmetry, mirror, repeat along x.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;

  // Base paths in unit coordinates (y down), roughly within [-1, 1].
  const PATHS = {
    chevron: (p) => {
      // Tails sit just outside the centre line so the upper and lower bundles never collide.
      const t = ((Math.round(p.lines) * p.spacing) / 2 + p.spacing * 0.35) / (p.size * p.aspect);
      return [[[-1, -1], [0.05, -t], [1, -t]], [[-1, 1], [0.05, t], [1, t]]];
    },
    hook: (p) => {
      // Vertical leg sits half a bundle-width off centre so the rotated copy interlocks without crossing.
      const h = ((Math.round(p.lines) * p.spacing) / 2 + p.spacing * 0.5) / p.size;
      return [[[1, -1], [h, -1], [h, 1]]];
    },
    meander: (p) => {
      const L = Math.max(1, Math.round(p.loops)), R = Math.max(1, Math.round(p.rowsN));
      const pts = [];
      const w = 2 / L, rh = 2 / R;
      for (let r = 0; r < R; r++) {
        const y0 = -1 + r * rh + rh * 0.08, y1 = -1 + (r + 1) * rh - rh * 0.08;
        const dir = r % 2 ? -1 : 1;
        for (let c = 0; c < L; c++) {
          const cc = dir > 0 ? c : L - 1 - c;
          const x = -1 + (cc + 0.5) * w;
          const down = c % 2 === 0;
          pts.push([x, down ? y0 : y1], [x, down ? y1 : y0]);
        }
      }
      return [pts];
    },
    spiral: (p) => {
      const turns = Math.max(1, Math.round(p.loops)), pts = [];
      let x = 1, y = -1, len = 2, dir = 0; // square spiral inward
      const step = 2 / (turns * 2 + 1);
      pts.push([x, y]);
      const dirs = [[-1, 0], [0, 1], [1, 0], [0, -1]];
      for (let k = 0; k < turns * 4 && len > 0; k++) {
        x += dirs[dir][0] * len; y += dirs[dir][1] * len; pts.push([x, y]);
        dir = (dir + 1) % 4;
        if (k % 2 === 1) len -= step;
      }
      return [pts];
    },
    wave: (p) => {
      const n = Math.max(1, Math.round(p.loops)), pts = [];
      for (let i = 0; i <= n * 2; i++) pts.push([-1 + i / n, i % 2 ? 0.6 : -0.6]);
      return [pts];
    },
  };

  // Fillet a polyline's corners with arcs of radius r (clamped to half the shorter adjacent leg).
  function fillet(pts, r, closed) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const d1 = [b[0] - a[0], b[1] - a[1]], d2 = [c[0] - b[0], c[1] - b[1]];
      const l1 = Math.hypot(...d1), l2 = Math.hypot(...d2);
      if (l1 < 1e-9 || l2 < 1e-9) continue;
      const u1 = [d1[0] / l1, d1[1] / l1], u2 = [d2[0] / l2, d2[1] / l2];
      const turn = Math.atan2(u1[0] * u2[1] - u1[1] * u2[0], u1[0] * u2[0] + u1[1] * u2[1]);
      if (Math.abs(turn) < 1e-4) { out.push(b); continue; }
      const t = Math.min(r * Math.tan(Math.abs(turn) / 2), l1 / 2, l2 / 2);
      const rr = t / Math.tan(Math.abs(turn) / 2);
      const p1 = [b[0] - u1[0] * t, b[1] - u1[1] * t];
      const s = Math.sign(turn);
      const cen = [p1[0] - u1[1] * rr * s, p1[1] + u1[0] * rr * s];
      const a0 = Math.atan2(p1[1] - cen[1], p1[0] - cen[0]);
      const steps = Math.max(4, Math.ceil(Math.abs(turn) / 0.12));
      for (let k = 0; k <= steps; k++) {
        const aa = a0 + turn * (k / steps);
        out.push([cen[0] + rr * Math.cos(aa), cen[1] + rr * Math.sin(aa)]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Resample so offsets stay smooth, then offset along the local normal.
  function resample(pts, step) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(l / step));
      for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    return out;
  }
  // Mitred offset of a raw polyline (each leg shifted by d, joins at leg intersections).
  function mitreOffset(pts, d) {
    const legs = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      const nx = -dy / l, ny = dx / l;
      legs.push([[a[0] + nx * d, a[1] + ny * d], [b[0] + nx * d, b[1] + ny * d]]);
    }
    const out = [legs[0][0]];
    for (let i = 0; i + 1 < legs.length; i++) {
      const [p1, p2] = legs[i], [p3, p4] = legs[i + 1];
      const d1 = [p2[0] - p1[0], p2[1] - p1[1]], d2 = [p4[0] - p3[0], p4[1] - p3[1]];
      const den = d1[0] * d2[1] - d1[1] * d2[0];
      if (Math.abs(den) < 1e-9) { out.push(p2); continue; }
      const t = ((p3[0] - p1[0]) * d2[1] - (p3[1] - p1[1]) * d2[0]) / den;
      out.push([p1[0] + d1[0] * t, p1[1] + d1[1] * t]);
    }
    out.push(legs[legs.length - 1][1]);
    return out;
  }
  function offset(pts, d) {
    return pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [p[0] - (dy / l) * d, p[1] + (dx / l) * d];
    });
  }

  SP.generators.paths = {
    id: 'paths',
    name: 'Line Paths',
    schema: [
      { group: 'Path' },
      { key: 'path', label: 'Path', type: 'select', def: 'chevron', options: [['chevron', 'Chevron'], ['meander', 'Meander'], ['hook', 'Hook'], ['spiral', 'Square spiral'], ['wave', 'Zigzag']], randomize: false },
      { key: 'size', label: 'Size (mm)', min: 5, max: 150, step: 0.5, def: 40 },
      { key: 'aspect', label: 'Aspect (h / w)', min: 0.2, max: 3, step: 0.01, def: 1 },
      { key: 'loops', label: 'Loops / turns', min: 1, max: 12, step: 1, def: 4, int: true, rand: [2, 7] },
      { key: 'rowsN', label: 'Rows (meander)', min: 1, max: 8, step: 1, def: 3, int: true, rand: [1, 4] },
      { key: 'corner', label: 'Corner radius (mm)', min: 0, max: 40, step: 0.1, def: 8, rand: [4, 14] },
      { group: 'Lines' },
      { key: 'lines', label: 'Lines in bundle', min: 1, max: 12, step: 1, def: 3, int: true, rand: [1, 5] },
      { key: 'spacing', label: 'Line spacing (mm)', min: 0.5, max: 30, step: 0.05, def: 4.5, rand: [3, 7] },
      { key: 'width', label: 'Line width (mm)', min: 0.2, max: 30, step: 0.05, def: 2.4, rand: [1.5, 4] },
      { key: 'fan', label: 'Stagger ends', min: -1, max: 1, step: 0.01, def: 0 },
      { group: 'Copies' },
      { key: 'copies', label: 'Rotational copies', min: 1, max: 8, step: 1, def: 1, int: true },
      { key: 'mirror', label: 'Mirror (vertical)', type: 'bool', def: false },
      { key: 'repeat', label: 'Repeat along x', min: 1, max: 8, step: 1, def: 1, int: true },
      { key: 'repeatGap', label: 'Repeat spacing (mm)', min: 0, max: 100, step: 0.5, def: 14 },
      { key: 'fillet', label: 'Line merge', min: 0.02, max: 4, step: 0.01, def: 0.05 },
    ],

    generate(p) {
      const out = { strokes: [], blobs: [], dots: [] };
      const sx = p.size, sy = p.size * p.aspect;
      const base = PATHS[p.path](p).map((l) => l.map(([x, y]) => [x * sx, y * sy]));
      const n = Math.max(1, Math.round(p.lines));
      const bundles = [];
      for (const line of base) {
        const step = Math.max(0.3, p.width * 0.4);
        for (let i = 0; i < n; i++) {
          const d = (i - (n - 1) / 2) * p.spacing;
          // Mitred offset first, then round this line's own corners: nested, knot-free bundles.
          let pts = resample(fillet(mitreOffset(line, d), p.corner, false), step);
          // Stagger: trim line ends progressively so bundle ends step like a staircase.
          if (p.fan) {
            const cut = Math.round(Math.abs(p.fan) * (p.fan > 0 ? i : n - 1 - i) * (p.spacing / step));
            pts = pts.slice(0, Math.max(2, pts.length - cut));
          }
          bundles.push(pts);
        }
      }
      const copies = [];
      const C = Math.max(1, Math.round(p.copies)), Rp = Math.max(1, Math.round(p.repeat));
      for (let r = 0; r < Rp; r++)
        for (let c = 0; c < C; c++)
          for (const m of p.mirror ? [1, -1] : [1]) {
            const a = (c * 2 * Math.PI) / C, ca = Math.cos(a), sa = Math.sin(a);
            const dx = (r - (Rp - 1) / 2) * p.repeatGap;
            for (const b of bundles) copies.push(b.map(([x, y]) => { const yy = y * m; return [ca * x - sa * yy + dx, sa * x + ca * yy]; }));
          }
      const rad = p.width / 2;
      let e = 0;
      for (const pts of copies) {
        out.strokes.push({ pts, r: pts.map(() => rad) });
        for (const q of pts) e = Math.max(e, Math.hypot(q[0], q[1]) + rad);
      }
      out.extent = e;
      return out;
    },
  };
})();
