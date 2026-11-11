// Hull Seams: staggered plating drawn as scribed lines. Courses of plates run across the board at an
// angle; course lines run the full width and short joint lines divide each course into plates with
// staggered (brick-like) joints. Plates can carry a rivet row along their long edges and an inner
// outline, and a course can be a double seam. Everything is strokes clipped to the board, so the
// plating can run at any angle. Field points make the plates shorter around them.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Liang–Barsky: the part of segment a→b inside the rectangle, or null.
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

  SP.generators.seams = {
    id: 'seams',
    name: 'Hull Seams',
    board: true,
    schema: [
      { group: 'Courses' },
      { key: 'angle', label: 'Angle °', min: -90, max: 90, step: 1, def: 0, rand: [-15, 15] },
      { key: 'hMin', label: 'Course min (mm)', min: 3, max: 80, step: 0.5, def: 12, rand: [8, 18] },
      { key: 'hMax', label: 'Course max (mm)', min: 3, max: 120, step: 0.5, def: 26, rand: [18, 36] },
      { key: 'lMin', label: 'Plate min (mm)', min: 4, max: 150, step: 0.5, def: 20, rand: [12, 30] },
      { key: 'lMax', label: 'Plate max (mm)', min: 4, max: 250, step: 0.5, def: 60, rand: [35, 90] },
      { key: 'bond', label: 'Bond', type: 'select', def: 'random', options: [['random', 'Random lengths'], ['half', 'Half bond'], ['third', 'Third bond']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 8, int: true, rand: [1, 9999] },
      { group: 'Lines' },
      { key: 'courseW', label: 'Course line (mm)', min: 0.3, max: 8, step: 0.05, def: 1.4, rand: [0.8, 2.2] },
      { key: 'jointW', label: 'Joint line (mm)', min: 0.3, max: 6, step: 0.05, def: 0.9, rand: [0.5, 1.4] },
      { key: 'double', label: 'Double seam chance', min: 0, max: 1, step: 0.01, def: 0.15, rand: [0, 0.4] },
      { key: 'doubleGap', label: 'Double gap (mm)', min: 0.8, max: 10, step: 0.1, def: 2.2, rand: [1.5, 3.5] },
      { key: 'partial', label: 'Partial joint chance', min: 0, max: 1, step: 0.01, def: 0.1, rand: [0, 0.3] },
      { key: 'border', label: 'Border line', type: 'bool', def: false },
      { group: 'Plate details' },
      { key: 'rivetChance', label: 'Rivet row chance', min: 0, max: 1, step: 0.01, def: 0.45, rand: [0.1, 0.8] },
      { key: 'rivetR', label: 'Rivet radius (mm)', min: 0.3, max: 3, step: 0.05, def: 0.6, rand: [0.4, 1] },
      { key: 'rivetPitch', label: 'Rivet pitch (mm)', min: 1.5, max: 20, step: 0.1, def: 5, rand: [3.5, 8] },
      { key: 'rivetInset', label: 'Rivet inset (mm)', min: 1, max: 12, step: 0.1, def: 2.4, rand: [1.8, 4] },
      { key: 'insetChance', label: 'Inner outline chance', min: 0, max: 1, step: 0.01, def: 0.12, rand: [0, 0.3] },
      { key: 'insetBy', label: 'Outline inset (mm)', min: 1, max: 15, step: 0.1, def: 3, rand: [2, 5] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.1, rand: [0.05, 0.3] },
      { group: 'Field' },
      { key: 'fieldFine', label: 'Points → shorter plates', min: -1, max: 1, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 31);
      const mg = p.margin, X0 = mg, Y0 = mg, X1 = B.w - mg, Y1 = B.h - mg;
      const cx = B.w / 2, cy = B.h / 2, R = Math.hypot(B.w, B.h) / 2 + 1;
      const t = (p.angle * Math.PI) / 180, ca = Math.cos(t), sa = Math.sin(t);
      const W = (u, v) => [cx + u * ca - v * sa, cy + u * sa + v * ca];
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const line = (u0, v0, u1, v1, w) => {
        const s = clipSeg(W(u0, v0), W(u1, v1), X0, Y0, X1, Y1);
        if (s && Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]) > 0.3) out.strokes.push({ pts: s, r: [w / 2, w / 2] });
      };
      const dot = (u, v, r) => { const [x, y] = W(u, v); if (x > X0 + r && x < X1 - r && y > Y0 + r && y < Y1 - r) out.blobs.push({ x, y, r }); };
      const hMin = Math.min(p.hMin, p.hMax), hMax = Math.max(p.hMin, p.hMax);
      const lMin = Math.min(p.lMin, p.lMax), lMax = Math.max(p.lMin, p.lMax);
      const bondN = p.bond === 'half' ? 2 : p.bond === 'third' ? 3 : 0;
      const Lfix = (lMin + lMax) / 2;

      // Courses from the top of the cover circle down; each course line is drawn once (shared edge).
      let v = -R + rand() * hMin, ci = 0;
      while (v < R) {
        const h = hMin + (hMax - hMin) * rand();
        const vb = Math.min(R, v + h);
        // Plates along this course.
        let u = -R - (bondN ? ((ci % bondN) * Lfix) / bondN : rand() * lMax);
        while (u < R) {
          const [wx, wy] = W(u + lMin / 2, (v + vb) / 2);
          const fm = points.length && p.fieldFine ? Math.max(0.3, 1 - p.fieldFine * fieldAt(wx, wy)) : 1;
          const L = bondN ? Lfix * fm : (lMin + (lMax - lMin) * rand()) * fm;
          const u1 = u + L;
          // Joint line at the start of this plate (skipped before the first one, drawn as the course edge there).
          if (u > -R) {
            if (rand() < p.partial) { const cut = h * (0.3 + 0.4 * rand()); if (rand() < 0.5) line(u, v, u, v + cut, p.jointW); else line(u, vb - cut, u, vb, p.jointW); }
            else line(u, v, u, vb, p.jointW);
          }
          // Plate details.
          const [pxw, pyw] = W((u + u1) / 2, (v + vb) / 2);
          if (pxw > X0 - L && pxw < X1 + L && pyw > Y0 - h && pyw < Y1 + h) {
            const r = rand();
            if (r < p.rivetChance && h > 2 * p.rivetInset + 2 * p.rivetR && L > 2 * p.rivetInset) {
              const n = Math.max(1, Math.floor((L - 2 * p.rivetInset) / p.rivetPitch));
              const start = u + (L - (n - 1) * p.rivetPitch) / 2;
              const both = rand() < 0.6;
              for (let k = 0; k < n; k++) { dot(start + k * p.rivetPitch, v + p.rivetInset, p.rivetR); if (both) dot(start + k * p.rivetPitch, vb - p.rivetInset, p.rivetR); }
            } else if (r < p.rivetChance + p.insetChance && Math.min(h, L) > 2 * p.insetBy + 3) {
              const i = p.insetBy;
              line(u + i, v + i, u1 - i, v + i, p.jointW); line(u1 - i, v + i, u1 - i, vb - i, p.jointW);
              line(u1 - i, vb - i, u + i, vb - i, p.jointW); line(u + i, vb - i, u + i, v + i, p.jointW);
            }
            out.count++;
          }
          u = u1;
        }
        // Course line along the top edge of this course (double seam sometimes).
        if (rand() < p.double) { line(-R, v - p.doubleGap / 2, R, v - p.doubleGap / 2, Math.min(p.courseW, p.jointW * 1.2)); line(-R, v + p.doubleGap / 2, R, v + p.doubleGap / 2, Math.min(p.courseW, p.jointW * 1.2)); }
        else line(-R, v, R, v, p.courseW);
        v = vb;
        ci++;
      }
      if (p.border) out.strokes.push({ pts: [[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0]], r: [1, 1, 1, 1, 1].map(() => p.courseW / 2) });
      return out;
    },
  };
})();
