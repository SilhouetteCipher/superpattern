// Palm leaf motif: a teardrop silhouette carved by curved, flaring gaps that radiate from a curved
// midrib, leaving pointed leaflets. Midrib + stem are unioned back on top so gaps stop at the rib.
// Uses the shared motif pipeline, so layouts and field-point modulation work unchanged.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const rot = (v, t) => [Math.cos(t) * v[0] + Math.sin(t) * v[1], -Math.sin(t) * v[0] + Math.cos(t) * v[1]]; // visual CCW
  const lerp = (a, b, t) => a + (b - a) * t;

  SP.generators.leaf = {
    id: 'leaf',
    name: 'Palm Leaf',
    schema: [
      { group: 'Silhouette' },
      { key: 'radius', label: 'Leaf radius', min: 5, max: 120, step: 0.1, def: 60 },
      { key: 'baseLen', label: 'Base length', min: 0, max: 1.2, step: 0.01, def: 0.35, rand: [0.2, 0.6] },
      { key: 'baseR', label: 'Base width', min: 0.05, max: 1, step: 0.01, def: 0.35, rand: [0.2, 0.6] },
      { key: 'angle', label: 'Rib direction °', min: -180, max: 180, step: 1, def: 56 },
      { group: 'Midrib & stem' },
      { key: 'ribReach', label: 'Rib reach', min: 0, max: 1.2, step: 0.01, def: 0.62, rand: [0.4, 0.85] },
      { key: 'ribBend', label: 'Rib bend', min: -0.8, max: 0.8, step: 0.01, def: -0.05, rand: [-0.3, 0.3] },
      { key: 'ribShift', label: 'Rib offset', min: -0.6, max: 0.6, step: 0.01, def: 0.05, rand: [-0.15, 0.2] },
      { key: 'ribW', label: 'Rib width', min: 0.1, max: 6, step: 0.05, def: 2.2 },
      { key: 'stemLen', label: 'Stem length', min: 0, max: 80, step: 0.1, def: 30, rand: [10, 40] },
      { key: 'stemBend', label: 'Stem bend', min: -1, max: 1, step: 0.01, def: 0.25, rand: [-0.4, 0.4] },
      { key: 'stemTaper', label: 'Stem taper', min: 0.1, max: 1.5, step: 0.01, def: 0.4 },
      { key: 'join', label: 'Stem fillet', min: 0, max: 6, step: 0.01, def: 1.2 },
      { group: 'Leaflets' },
      { key: 'countL', label: 'Leaflets (left)', min: 0, max: 30, step: 1, def: 6, int: true, rand: [4, 10] },
      { key: 'countR', label: 'Leaflets (right)', min: 0, max: 30, step: 1, def: 8, int: true, rand: [5, 12] },
      { key: 'tStart', label: 'First leaflet', min: 0, max: 0.9, step: 0.01, def: 0.06 },
      { key: 'tEnd', label: 'Last leaflet', min: 0.1, max: 1, step: 0.01, def: 1 },
      { key: 'stagger', label: 'Left/right stagger', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 1] },
      { key: 'angBase', label: 'Angle at base °', min: 5, max: 170, step: 1, def: 95, rand: [45, 95] },
      { key: 'angTip', label: 'Angle at tip °', min: 5, max: 170, step: 1, def: 45, rand: [15, 50] },
      { key: 'curl', label: 'Curl °', min: -120, max: 120, step: 1, def: 70, rand: [0, 55] },
      { group: 'Gaps' },
      { key: 'gapMin', label: 'Gap at rib', min: 0, max: 3, step: 0.01, def: 0.9 },
      { key: 'gapMax', label: 'Gap growth', min: 0, max: 12, step: 0.05, def: 1.5, rand: [1, 3.5] },
      { key: 'gapTip', label: 'Tip flare', min: 0, max: 20, step: 0.05, def: 3.5, rand: [3, 9] },
      { key: 'flare', label: 'Flare curve', min: 0.3, max: 6, step: 0.01, def: 2, rand: [1.5, 3.5] },
      { key: 'flareLen', label: 'Flare reach', min: 0.02, max: 1, step: 0.01, def: 0.25, rand: [0.2, 0.5] },
      { key: 'tipRound', label: 'Tip roundness', min: 0.02, max: 6, step: 0.01, def: 1.8, rand: [0.5, 2] },
    ],

    generate(p) {
      const out = { strokes: [], blobs: [], dots: [], cuts: [], post: [], kPost: p.join };
      const R = p.radius;
      const a0 = p.angle * D2R;
      const dir = [Math.cos(a0), -Math.sin(a0)];
      const perp = [dir[1], -dir[0]]; // visual left of dir
      const add = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s];

      // Silhouette: round cone from the base (narrow) to the centre (full radius).
      const A = add([0, 0], dir, -R * p.baseLen);
      out.strokes.push({ pts: [A, [0, 0]], r: [R * p.baseR, R] });

      // Midrib: quadratic from the base tip to ribReach.
      // Rib starts on the silhouette's rear edge.
      const rear = Math.max(R, R * (p.baseLen + p.baseR));
      const B = add(add([0, 0], dir, -rear * 0.96), perp, R * p.ribShift);
      const T = add(add([0, 0], dir, R * p.ribReach), perp, R * p.ribShift);
      const M = add([(B[0] + T[0]) / 2, (B[1] + T[1]) / 2], perp, R * p.ribBend);
      const rib = (t) => {
        const u = 1 - t;
        return [u * u * B[0] + 2 * u * t * M[0] + t * t * T[0], u * u * B[1] + 2 * u * t * M[1] + t * t * T[1]];
      };
      const ribTan = (t) => {
        const d = [2 * (1 - t) * (M[0] - B[0]) + 2 * t * (T[0] - M[0]), 2 * (1 - t) * (M[1] - B[1]) + 2 * t * (T[1] - M[1])];
        const l = Math.hypot(d[0], d[1]) || 1;
        return [d[0] / l, d[1] / l];
      };
      const ribPts = [], ribR = [];
      for (let i = 0; i <= 10; i++) { ribPts.push(rib(i / 10)); ribR.push(p.ribW * lerp(1, 0.35, i / 10)); }
      out.post.push({ pts: ribPts, r: ribR });

      // Stem: continues backwards from the base, bending sideways.
      if (p.stemLen > 0.01) {
        const t0 = ribTan(0);
        const E = add(add(B, t0, -p.stemLen), perp, p.stemBend * p.stemLen);
        const C = add(B, t0, -p.stemLen * 0.5);
        const pts = [], r = [];
        for (let i = 0; i <= 8; i++) {
          const t = i / 8, u = 1 - t;
          pts.push([u * u * B[0] + 2 * u * t * C[0] + t * t * E[0], u * u * B[1] + 2 * u * t * C[1] + t * t * E[1]]);
          r.push(p.ribW * lerp(1, p.stemTaper, t));
        }
        out.post.push({ pts, r });
      }

      // Silhouette SDF (uneven capsule A -> O), used to flare gaps as they approach the rim.
      const silSD = (q) => {
        const ax = q[0] - A[0], ay = q[1] - A[1];
        const h = Math.hypot(A[0], A[1]), r1 = R * p.baseR, r2 = R;
        if (h < 1e-6 || Math.abs(r1 - r2) >= h) return Math.hypot(q[0], q[1]) - R;
        const ux = -A[0] / h, uy = -A[1] / h;
        const along = ax * ux + ay * uy, across = Math.abs(ax * uy - ay * ux);
        const b = (r1 - r2) / h, a = Math.sqrt(1 - b * b), k = -b * across + a * along;
        if (k < 0) return Math.hypot(across, along) - r1;
        if (k > a * h) return Math.hypot(across, along - h) - r2;
        return across * a + along * b - r1;
      };

      // Gaps between leaflets.
      const L = R * 2.4, steps = 14, ds = L / steps;
      for (const [side, count, off] of [[1, Math.round(p.countL), p.stagger], [-1, Math.round(p.countR), 0]]) {
        for (let i = 0; i < count; i++) {
          const f = (i + off) / Math.max(1, count - 1 + off);
          const t = lerp(p.tStart, p.tEnd, Math.min(1, f));
          let pos = rib(t);
          const ang = lerp(p.angBase, p.angTip, t) * D2R;
          let head = rot(ribTan(t), side * ang);
          // Curl is spent within one leaf radius, where it is visible.
          const curlSteps = Math.max(1, Math.round(R / ds)), turn = (-side * p.curl * D2R) / curlSteps;
          const pts = [pos], r = [p.gapMin];
          for (let k = 1; k <= steps; k++) {
            if (k <= curlSteps) head = rot(head, turn);
            pos = add(pos, head, ds);
            pts.push(pos);
            // Width grows with arc length and flares hard near the rim, so leaflets taper to tips.
            const u = Math.min(1, (k * ds) / R);
            const rim = Math.min(1, Math.max(0, 1 + silSD(pos) / (R * p.flareLen)));
            r.push(p.gapMin + (p.gapMax - p.gapMin) * u + p.gapTip * Math.pow(rim, p.flare));
          }
          out.cuts.push({ pts, r });
        }
      }

      let e = R;
      for (const s of out.post) s.pts.forEach((q, i) => (e = Math.max(e, Math.hypot(q[0], q[1]) + s.r[i])));
      e = Math.max(e, Math.hypot(A[0], A[1]) + R * p.baseR);
      out.extent = e;
      return out;
    },
  };
})();
