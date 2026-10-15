// Hankin Stars: Islamic star patterns by Hankin's "polygons in contact" rule (as formalised by Kaplan).
// Lay down a tiling of regular polygons. From the midpoint of every edge send two rays into each tile,
// leaning away from the edge by the contact angle θ. Each ray runs until it meets its partner from the
// neighbouring edge, so every tile corner grows one star point; then the tiling itself is erased. Across
// a shared edge the rays line up straight, so the bands run on unbroken through the whole lattice.
// A contact offset splits each midpoint in two (Kaplan's δ) for doubled, interlaced-looking strapwork;
// sweeping θ across the board gives a Huff-style parquet deformation from one star family to another.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;

  // Periodic tilings by regular polygons, edge length 1: lattice vectors and the polygons in one cell,
  // each { n, x, y, rot } with vertex k at angle rot + 360k/n around (x, y).
  const S3 = Math.sqrt(3);
  const TILINGS = (() => {
    const w8 = 1 + Math.SQRT2;
    const r12 = 1 / (2 * Math.tan(15 * D2R)); // dodecagon inradius
    const D4 = 2 * r12 + 1, D3 = 2 * r12;
    return {
      square: { t1: [1, 0], t2: [0, 1], polys: [{ n: 4, x: 0, y: 0, rot: 45 }] },
      hex: { t1: [S3, 0], t2: [S3 / 2, 1.5], polys: [{ n: 6, x: 0, y: 0, rot: 30 }] },
      oct: { t1: [w8, 0], t2: [0, w8], polys: [{ n: 8, x: 0, y: 0, rot: 22.5 }, { n: 4, x: w8 / 2, y: w8 / 2, rot: 0 }] },
      trihex: {
        t1: [2, 0], t2: [1, S3],
        polys: [{ n: 6, x: 0, y: 0, rot: 0 }, { n: 3, x: 1, y: 1 / S3, rot: 30 }, { n: 3, x: 2, y: 2 / S3, rot: 90 }],
      },
      dodeca: {
        t1: [D4, 0], t2: [D4 / 2, (D4 * S3) / 2],
        polys: [
          { n: 12, x: 0, y: 0, rot: 15 },
          { n: 6, x: D4 / 2, y: D4 / (2 * S3), rot: 0 }, { n: 6, x: D4, y: D4 / S3, rot: 0 },
          { n: 4, x: D4 / 2, y: 0, rot: 45 }, { n: 4, x: D4 / 4, y: (D4 * S3) / 4, rot: 15 }, { n: 4, x: (3 * D4) / 4, y: (D4 * S3) / 4, rot: 75 },
        ],
      },
      trunchex: {
        t1: [D3, 0], t2: [D3 / 2, (D3 * S3) / 2],
        polys: [{ n: 12, x: 0, y: 0, rot: 15 }, { n: 3, x: D3 / 2, y: D3 / (2 * S3), rot: 30 }, { n: 3, x: D3, y: D3 / S3, rot: 90 }],
      },
    };
  })();

  SP.generators.hankin = {
    id: 'hankin',
    name: 'Hankin Stars',
    board: true,
    schema: [
      { group: 'Tiling' },
      { key: 'tiling', label: 'Tiling', type: 'select', def: 'oct', options: [['square', 'Squares (4.4.4.4)'], ['hex', 'Hexagons (6.6.6)'], ['oct', 'Octagons + squares (4.8.8)'], ['trihex', 'Hexagons + triangles (3.6.3.6)'], ['dodeca', 'Dodecagons (4.6.12)'], ['trunchex', 'Dodecagons + triangles (3.12.12)']] },
      { key: 'size', label: 'Edge length (mm)', min: 6, max: 80, step: 0.5, def: 20, rand: [12, 30] },
      { key: 'rotate', label: 'Rotate °', min: -180, max: 180, step: 1, def: 0 },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { group: 'Stars' },
      { key: 'angle', label: 'Contact angle °', min: 10, max: 85, step: 0.5, def: 67.5, rand: [40, 78] },
      { key: 'delta', label: 'Contact offset', min: 0, max: 0.8, step: 0.01, def: 0, rand: [0, 0.35] },
      { key: 'sweep', label: 'Angle sweep °', min: -60, max: 60, step: 0.5, def: 0, rand: [-15, 15] },
      { key: 'sweepDir', label: 'Sweep direction °', min: -180, max: 180, step: 1, def: 0, rand: [-180, 180] },
      { group: 'Bands' },
      { key: 'width', label: 'Band width (mm)', min: 0.6, max: 10, step: 0.05, def: 2.4, rand: [1.6, 3.6] },
      { key: 'frame', label: 'Keep tile edges', type: 'bool', def: false },
      { key: 'frameW', label: 'Edge width (× band)', min: 0.3, max: 1.5, step: 0.01, def: 0.6, rand: [0.4, 1] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.5, rand: [0.2, 1] },
      { group: 'Field points' },
      { key: 'fieldAngle', label: 'Points → angle °', min: -40, max: 40, step: 0.5, def: 15 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const T = TILINGS[p.tiling] || TILINGS.oct;
      const a = Math.max(1, p.size), cx = B.w / 2, cy = B.h / 2;
      const rc = Math.cos(p.rotate * D2R), rs = Math.sin(p.rotate * D2R);
      const world = (x, y) => [cx + a * (rc * x - rs * y), cy + a * (rs * x + rc * y)];
      const span = Math.hypot(B.w, B.h) / 2;
      // Contact angle at a point: base + linear sweep across the board + field points.
      const sd = [Math.cos(p.sweepDir * D2R), Math.sin(p.sweepDir * D2R)];
      const ext = Math.abs(sd[0]) * B.w + Math.abs(sd[1]) * B.h || 1;
      const thetaAt = (x, y) => {
        let t = p.angle + p.sweep * (((x - cx) * sd[0] + (y - cy) * sd[1]) / ext);
        if (points.length && p.fieldAngle) t += p.fieldAngle * fieldAt(x, y);
        return Math.min(86, Math.max(6, t)) * D2R;
      };
      const r = Math.max(0.3, p.width / 2);
      const out = { strokes: [], blobs: [], count: 0 };
      const edges = new Map();
      const keyOf = (q) => Math.round(q[0] * 20) + ',' + Math.round(q[1] * 20);

      // Lattice range: enough cells to cover the board's circumcircle in any rotation.
      const cell = Math.min(Math.hypot(...T.t1), Math.hypot(...T.t2)) * a;
      const N = Math.ceil(span / cell / 0.86) + 2; // 0.86 ≥ sin of the lattice angle (60° or 90°)
      const lim = { x0: -a * 2, y0: -a * 2, x1: B.w + a * 2, y1: B.h + a * 2 };
      for (let j = -N; j <= N; j++)
        for (let i = -N; i <= N; i++)
          for (const P of T.polys) {
            const lx = P.x + i * T.t1[0] + j * T.t2[0], ly = P.y + i * T.t1[1] + j * T.t2[1];
            const C = world(lx, ly);
            if (C[0] < lim.x0 || C[0] > lim.x1 || C[1] < lim.y0 || C[1] > lim.y1) continue;
            const n = P.n, R = 1 / (2 * Math.sin(Math.PI / n));
            const V = [];
            for (let k = 0; k < n; k++) {
              const ang = (P.rot + (360 * k) / n) * D2R;
              V.push(world(lx + R * Math.cos(ang), ly + R * Math.sin(ang)));
            }
            out.count++;
            const half = Math.PI / 2 - Math.PI / n; // half the interior angle
            // Edge k runs V[k] → V[k+1]; its midpoint's θ is shared with the neighbouring tile.
            const E = V.map((v, k) => {
              const w = V[(k + 1) % n], L = Math.hypot(w[0] - v[0], w[1] - v[1]);
              const m = [(v[0] + w[0]) / 2, (v[1] + w[1]) / 2];
              return { v, w, m, e: [(w[0] - v[0]) / L, (w[1] - v[1]) / L], L, th: thetaAt(m[0], m[1]) };
            });
            if (p.frame) for (const ed of E) { const kk = keyOf(ed.m); if (!edges.has(kk)) edges.set(kk, ed); }
            for (let k = 0; k < n; k++) {
              // Star point at corner V[k]: ray from edge k-1 (heading toward V[k]) meets ray from edge k.
              const e1 = E[(k + n - 1) % n], e2 = E[k], vk = V[k];
              const off1 = (p.delta * e1.L) / 2, off2 = (p.delta * e2.L) / 2;
              // With an offset, each ray starts on the far side of the midpoint, so a tile's two rays
              // from one edge cross in an X just inside it.
              const S1 = [e1.m[0] - e1.e[0] * off1, e1.m[1] - e1.e[1] * off1];
              const S2 = [e2.m[0] + e2.e[0] * off2, e2.m[1] + e2.e[1] * off2];
              const inward = (d, s, th) => {
                // Rotate d by ±th, picking the sign that points into the tile.
                const c = Math.cos(th), sn = Math.sin(th);
                const d1 = [c * d[0] - sn * d[1], sn * d[0] + c * d[1]];
                return (d1[0] * (C[0] - s[0]) + d1[1] * (C[1] - s[1]) > 0) ? d1 : [c * d[0] + sn * d[1], -sn * d[0] + c * d[1]];
              };
              const d1 = inward(e1.e, S1, e1.th), d2 = inward([-e2.e[0], -e2.e[1]], S2, e2.th);
              let Pt = null;
              const den = d1[0] * d2[1] - d1[1] * d2[0];
              if (Math.abs(den) > 1e-6) {
                const qx = S2[0] - S1[0], qy = S2[1] - S1[1];
                const t = (qx * d2[1] - qy * d2[0]) / den, s = (qx * d1[1] - qy * d1[0]) / den;
                if (t > 0 && s > 0 && t < 2 * R * a && s < 2 * R * a) Pt = [S1[0] + d1[0] * t, S1[1] + d1[1] * t];
              }
              if (!Pt) {
                // Symmetric fallback: the meeting point on the corner bisector, for the mean angle.
                const th = (e1.th + e2.th) / 2, toC = [C[0] - vk[0], C[1] - vk[1]], lc = Math.hypot(toC[0], toC[1]);
                const d = (((1 + p.delta) * e1.L) / 2) * Math.sin(th) / Math.sin(th + half);
                Pt = [vk[0] + (toC[0] / lc) * d, vk[1] + (toC[1] / lc) * d];
              }
              out.strokes.push({ pts: [S1, Pt, S2], r: [r, r, r] });
            }
          }
      if (p.frame) {
        const rf = Math.max(0.3, r * p.frameW);
        for (const ed of edges.values()) out.strokes.push({ pts: [ed.v, ed.w], r: [rf, rf] });
      }
      const mg = Math.max(0, p.margin);
      out.clip = { x0: mg, y0: mg, x1: B.w - mg, y1: B.h - mg, k: 0.2 };
      return out;
    },
  };
})();
