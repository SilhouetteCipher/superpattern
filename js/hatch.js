// Line Hatch: parallel round-capped lines clipped to a circle, square or the board. Lines break into
// dashes at random, and a level (field points + gradient + per-line jitter) swells them — smoothly,
// or as crisp capsules riding on a thin thread.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6))); return t * t * (3 - 2 * t); };

  SP.generators.hatch = {
    id: 'hatch',
    name: 'Line Hatch',
    board: true,
    schema: [
      { group: 'Shape' },
      { key: 'shape', label: 'Shape', type: 'select', def: 'circle', options: [['circle', 'Circle'], ['square', 'Square'], ['board', 'Whole board']] },
      { key: 'size', label: 'Size (mm)', min: 10, max: 400, step: 0.5, def: 160, show: (o) => o.shape !== 'board' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 10, show: (o) => o.shape === 'board' },
      { group: 'Lines' },
      { key: 'angle', label: 'Angle °', min: -180, max: 180, step: 0.5, def: 35, rand: [-90, 90] },
      { key: 'spacing', label: 'Spacing (mm)', min: 1, max: 40, step: 0.05, def: 9, rand: [5, 14] },
      { key: 'width', label: 'Width (mm)', min: 0.2, max: 30, step: 0.05, def: 5.5, rand: [2, 7] },
      { group: 'Breaks' },
      { key: 'breaks', label: 'Breaks per 100 mm', min: 0, max: 10, step: 0.05, def: 0.9, rand: [0, 2] },
      { key: 'breakGap', label: 'Break gap (mm)', min: 0, max: 40, step: 0.1, def: 4.5, rand: [2, 8] },
      { key: 'minSeg', label: 'Shortest dash (mm)', min: 0, max: 80, step: 0.5, def: 12 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 43, int: true, rand: [1, 9999] },
      { group: 'Swell' },
      { key: 'fieldGain', label: 'Field points gain', min: -3, max: 3, step: 0.01, def: 1 },
      { key: 'gradAmt', label: 'Gradient amount', min: -3, max: 3, step: 0.01, def: 0 },
      { key: 'gradAngle', label: 'Gradient dir °', min: -180, max: 180, step: 1, def: 0 },
      { key: 'lineJitter', label: 'Per-line jitter', min: 0, max: 2, step: 0.01, def: 0 },
      { key: 'thickW', label: 'Swollen width (mm)', min: 0.2, max: 40, step: 0.05, def: 9 },
      { key: 'profile', label: 'Swell style', type: 'select', def: 'smooth', options: [['smooth', 'Smooth'], ['capsule', 'Capsules on a thread']] },
      { key: 'thresh', label: 'Threshold', min: -1, max: 2, step: 0.01, def: 0.5 },
      { key: 'soft', label: 'Softness', min: 0.01, max: 1, step: 0.01, def: 0.35, show: (o) => o.profile === 'smooth' },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 4, step: 0.01, def: 0.2 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const cx = B.w / 2, cy = B.h / 2;
      const th = p.angle * D2R, dx = Math.cos(th), dy = -Math.sin(th), nx = -dy, ny = dx;
      const rand = rng(p.seed * 16807 + 5);
      const r0 = p.width / 2, r1 = p.thickW / 2;
      const half = p.shape === 'board' ? null : p.size / 2;
      const hw = p.shape === 'board' ? B.w / 2 - p.margin : half, hh = p.shape === 'board' ? B.h / 2 - p.margin : half;
      const reach = p.shape === 'circle' ? half : Math.hypot(hw, hh);
      const swell = points.length || p.gradAmt || p.lineJitter;
      const G = (x, y) => SP.gradCoord(x, y, p.gradAngle, cx, cy, 2 * hw, 2 * hh);
      // Chord of the line {c + t·d} inside the shape, shrunk by the cap radius r.
      const chord = (ox, oy, r) => {
        if (p.shape === 'circle') {
          const c = (ox - cx) * nx + (oy - cy) * ny, R = half - r;
          if (Math.abs(c) >= R) return null;
          const h = Math.sqrt(R * R - c * c);
          return [-h, h];
        }
        let t0 = -1e9, t1 = 1e9;
        for (const [d, o, lo, hi] of [[dx, ox - cx, -hw + r, hw - r], [dy, oy - cy, -hh + r, hh - r]]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
          let a = (lo - o) / d, b = (hi - o) / d;
          if (a > b) [a, b] = [b, a];
          t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        }
        return t1 > t0 ? [t0, t1] : null;
      };
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const n = Math.floor(reach / p.spacing);
      for (let i = -n; i <= n; i++) {
        const ox = cx + nx * i * p.spacing, oy = cy + ny * i * p.spacing;
        const ch = chord(ox, oy, r0);
        if (!ch) continue;
        const jit = p.lineJitter * (rand() - 0.5);
        // Split the chord at random breaks (never leaving a dash shorter than minSeg).
        const runs = [];
        let a = ch[0];
        const L = ch[1] - ch[0];
        const nb = p.breaks > 0 ? Math.floor((L / 100) * p.breaks + rand()) : 0;
        const cuts = [];
        for (let k = 0; k < nb; k++) cuts.push(ch[0] + rand() * L);
        cuts.sort((u, v) => u - v);
        for (const c of cuts) {
          if (c - p.breakGap / 2 - a < p.minSeg || ch[1] - (c + p.breakGap / 2) < p.minSeg) continue;
          runs.push([a, c - p.breakGap / 2]); a = c + p.breakGap / 2;
        }
        runs.push([a, ch[1]]);
        const P = (t) => [ox + dx * t, oy + dy * t];
        const level = (x, y) => (points.length ? p.fieldGain * fieldAt(x, y) : 0) + p.gradAmt * G(x, y) + jit;
        for (const [t0, t1] of runs) {
          out.count++;
          if (!swell) { out.strokes.push({ pts: [P(t0), P(t1)], r: [r0, r0] }); continue; }
          const steps = Math.max(1, Math.ceil((t1 - t0) / 0.8));
          const ts = [], lv = [];
          for (let k = 0; k <= steps; k++) { const t = t0 + ((t1 - t0) * k) / steps, q = P(t); ts.push(t); lv.push(level(q[0], q[1])); }
          if (p.profile === 'smooth') {
            // Keep swollen caps inside the shape by re-clipping with the larger radius near the ends.
            const pts = [], rr = [];
            for (let k = 0; k <= steps; k++) {
              const t = ts[k], r = r0 + (r1 - r0) * sstep(p.thresh - p.soft, p.thresh + p.soft, lv[k]);
              const c2 = chord(ox, oy, r);
              if (!c2 || t < c2[0] - 1e-6 || t > c2[1] + 1e-6) continue;
              pts.push(P(t)); rr.push(r);
            }
            if (pts.length > 1) out.strokes.push({ pts, r: rr });
          } else {
            out.strokes.push({ pts: [P(t0), P(t1)], r: [r0, r0] });
            // Capsules over the runs where the level is above the threshold.
            const c2 = chord(ox, oy, r1);
            let s = -1;
            for (let k = 0; k <= steps + 1; k++) {
              const on = k <= steps && lv[k] >= p.thresh;
              if (on && s < 0) s = k;
              if (!on && s >= 0) {
                let ta = ts[s], tb = ts[k - 1];
                if (c2) { ta = Math.max(ta, c2[0]); tb = Math.min(tb, c2[1]); }
                if (c2 && tb >= ta) out.strokes.push({ pts: [P(ta), P(tb)], r: [r1, r1] });
                s = -1;
              }
            }
          }
        }
      }
      return out;
    },
  };
})();
