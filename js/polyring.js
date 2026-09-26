// Polygon Ring: up to two concentric rings of rounded regular polygons with independent spin,
// e.g. triangle "aperture" rings. Each polygon is an exact rounded-polygon SDF.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const ring = (k, label, def) => [
    { group: label },
    { key: k + 'n', label: 'Count', min: 0, max: 36, step: 1, def: def.n, int: true, rand: [k === 'a' ? 3 : 0, 12] },
    { key: k + 'sides', label: 'Sides', min: 3, max: 10, step: 1, def: def.sides, int: true },
    { key: k + 'r', label: 'Ring radius (mm)', min: 0, max: 120, step: 0.1, def: def.r, rand: [10, 60] },
    { key: k + 'size', label: 'Polygon size (mm)', min: 1, max: 80, step: 0.1, def: def.size, rand: [6, 30] },
    { key: k + 'spin', label: 'Spin °', min: -180, max: 180, step: 0.5, def: def.spin, rand: [-180, 180] },
    { key: k + 'phase', label: 'Ring phase °', min: -180, max: 180, step: 0.5, def: def.phase },
    { key: k + 'stretch', label: 'Stretch', min: 0.2, max: 5, step: 0.01, def: def.stretch || 1 },
    { key: k + 'skew', label: 'Skew', min: -2, max: 2, step: 0.01, def: def.skew || 0 },
  ];
  SP.generators.polyring = {
    id: 'polyring',
    name: 'Polygon Ring',
    board: true,
    schema: [
      ...ring('a', 'Outer ring', { n: 6, sides: 3, r: 44, size: 20, spin: 0, phase: 0 }),
      ...ring('b', 'Inner ring', { n: 6, sides: 3, r: 26, size: 15, spin: 180, phase: 30 }),
      { group: 'Finish' },
      { key: 'round', label: 'Corner radius', min: 0, max: 10, step: 0.05, def: 1 },
    ],
    generateBoard(p, ctx) {
      const B = ctx.board, cx = B.w / 2, cy = B.h / 2;
      const polys = [];
      let ext = 0;
      for (const k of ['a', 'b']) {
        const n = Math.round(p[k + 'n']);
        for (let i = 0; i < n; i++) {
          const a = (p[k + 'phase'] + (i * 360) / n) * D2R;
          const x = p[k + 'r'] * Math.cos(a), y = -p[k + 'r'] * Math.sin(a);
          // polygon oriented relative to its radial direction, then spun
          // Local frame: rotate by (radial angle + spin), then stretch/skew the polygon in that frame.
          const th = a + p[k + 'spin'] * D2R, c = Math.cos(th), sn = Math.sin(th);
          const st = p[k + 'stretch'], sk = p[k + 'skew'];
          const base = SP.polySDF(Math.round(p[k + 'sides']), p[k + 'size'], 0, Math.min(p.round, p[k + 'size'] * 0.4));
          const lip = Math.max(1, 1 / st) * Math.sqrt(1 + sk * sk); // keep the warped SDF 1-Lipschitz
          polys.push({ x, y, sdf: (dx, dy) => {
            const u = c * dx - sn * dy, v = -(sn * dx + c * dy); // visual CCW frame, y up
            return base((u - sk * v) / st, -v) / lip;
          } });
          ext = Math.max(ext, p[k + 'r'] + p[k + 'size'] * Math.max(1, st) * (1 + Math.abs(sk)));
        }
      }
      const evalFn = (X, Y) => {
        let f = 1e9;
        for (const q of polys) { const v = q.sdf(X - cx - q.x, Y - cy - q.y); if (v < f) f = v; }
        return f;
      };
      const e = ext + 4;
      return { evalFn, domain: { x0: cx - e, y0: cy - e, x1: cx + e, y1: cy + e }, count: polys.length };
    },
  };
})();
