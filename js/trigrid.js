// Tri Glyph: a hexagon of equilateral triangles, filled at random with rotational (or mirror) symmetry.
// Each symmetry sector is one piece: its triangles merge exactly, outer corners are rounded, and a
// thin gap separates neighbouring pieces — isometric "impossible" knots and emblems.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180, S3 = Math.sqrt(3);
  function smax(a, b, k) { if (k <= 0) return Math.max(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
  function hash(x, y, seed) {
    let h = (Math.round(x * 1000) * 374761393 + Math.round(y * 1000) * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // Exact signed distance to a CCW triangle.
  function triDist(V, x, y) {
    let d = Infinity, inside = true;
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = V[i], [bx, by] = V[(i + 1) % 3];
      const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay, l2 = ex * ex + ey * ey;
      const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / l2));
      d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
      if (ex * wy - ey * wx < 0) inside = false;
    }
    return inside ? -d : d;
  }

  SP.generators.trigrid = {
    id: 'trigrid',
    name: 'Tri Glyph',
    board: true,
    noTween: true,
    schema: [
      { group: 'Grid' },
      { key: 'n', label: 'Triangles per side', min: 1, max: 10, step: 1, def: 3, int: true, rand: [2, 5] },
      { key: 'size', label: 'Radius (mm)', min: 10, max: 150, step: 0.5, def: 70 },
      { key: 'rot', label: 'Rotation °', min: -180, max: 180, step: 0.5, def: 30 },
      { group: 'Fill' },
      { key: 'symmetry', label: 'Symmetry', type: 'select', def: 'rot3', options: [['rot3', '3-fold (3 pieces)'], ['rot6', '6-fold (6 pieces)'], ['rot2', '2-fold (2 pieces)'], ['mirror', 'Mirror'], ['none', 'None']] },
      { key: 'fill', label: 'Fill probability', min: 0, max: 1, step: 0.01, def: 0.62, rand: [0.45, 0.75] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 37, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'round', label: 'Corner radius (mm)', min: 0, max: 10, step: 0.05, def: 2.2 },
      { key: 'gap', label: 'Gap between pieces (mm)', min: 0, max: 10, step: 0.05, def: 1.6 },
    ],

    generateBoard(p, ctx) {
      const B = ctx.board, cx = B.w / 2, cy = B.h / 2;
      const n = Math.max(1, Math.round(p.n)), u = p.size / n, rot = p.rot * D2R, h = (u * S3) / 2;
      const sect = { rot3: 3, rot6: 6, rot2: 2 }[p.symmetry] || 1;
      const Rt = u / S3; // triangle circumradius
      const ro = Math.min(p.round, Rt * 0.4);
      // Work in lattice space: P(i,j) = (i·u + j·u/2, j·h). Up triangle (i,j): P(i,j) P(i+1,j) P(i,j+1);
      // down triangle (i,j): P(i+1,j) P(i+1,j+1) P(i,j+1).
      const P = (i, j) => [i * u + (j * u) / 2, j * h];
      const inHex = (x, y) => {
        const ax = Math.abs(x), ay = Math.abs(y), R = n * u;
        return ay <= (R * S3) / 2 + 1e-9 && ax * (S3 / 2) + ay / 2 <= (R * S3) / 2 + 1e-9;
      };
      const ccw = (V) => { let a = 0; for (let m = 0; m < 3; m++) { const [ax, ay] = V[m], [bx, by] = V[(m + 1) % 3]; a += ax * by - bx * ay; } return a < 0 ? V.slice().reverse() : V; };
      const filled = new Map(); // "i,j,u|d" -> piece
      const tris = [];
      for (let j = -2 * n - 1; j <= 2 * n + 1; j++)
        for (let i = -3 * n - 1; i <= 3 * n + 1; i++)
          for (const up of [true, false]) {
            const V = up ? [P(i, j), P(i + 1, j), P(i, j + 1)] : [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)];
            const gx = (V[0][0] + V[1][0] + V[2][0]) / 3, gy = (V[0][1] + V[1][1] + V[2][1]) / 3;
            if (!inHex(gx, gy)) continue;
            const ang = Math.atan2(gy, gx), r = Math.hypot(gx, gy);
            let k = 0, hx = gx, hy = gy;
            if (sect > 1) {
              const w = (2 * Math.PI) / sect;
              k = Math.floor((((ang + 1e-7) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / w);
              hx = r * Math.cos(ang - k * w); hy = r * Math.sin(ang - k * w);
            } else if (p.symmetry === 'mirror') hx = Math.abs(gx);
            if (hash(hx, hy, p.seed) >= p.fill) continue;
            filled.set(`${i},${j},${up ? 'u' : 'd'}`, k);
            // Rounded triangle: shrink about the centroid so an offset of `ro` restores the edges.
            const sh = 1 - (2 * ro) / Rt;
            tris.push({ k, gx, gy, V: ccw(V), Vi: ccw(V.map(([vx, vy]) => [gx + (vx - gx) * sh, gy + (vy - gy) * sh])) });
          }
      // Vertex patches: where several triangles of one piece meet at a lattice vertex, the separately
      // rounded corners leave a notch. Fill it — sharp for flat/concave corners, rounded for convex ones.
      const around = (a, b) => [[a, b, 'u'], [a - 1, b, 'd'], [a - 1, b, 'u'], [a - 1, b - 1, 'd'], [a, b - 1, 'u'], [a, b - 1, 'd']];
      const patches = [];
      for (let b = -2 * n - 1; b <= 2 * n + 2; b++)
        for (let a = -3 * n - 1; a <= 3 * n + 2; a++) {
          // Pieces are separated later by carving along the sector boundaries, so fans ignore the piece.
          const ks = around(a, b).map(([i, j, t]) => (filled.has(`${i},${j},${t}`) ? 0 : -1));
          if (ks.filter((x) => x >= 0).length < 2) continue;
          const [vx, vy] = P(a, b);
          // Contiguous runs (fans) of one piece around the vertex.
          const all = ks.every((x) => x === ks[0] && x >= 0);
          if (all) { patches.push({ k: ks[0], type: 'disc', vx, vy }); continue; }
          let start = ks.findIndex((x, q) => x >= 0 && ks[(q + 5) % 6] !== x);
          if (start < 0) continue;
          for (let q0 = 0; q0 < 6; q0++) {
            const q = (start + q0) % 6;
            if (ks[q] < 0 || ks[(q + 5) % 6] === ks[q]) continue; // not the start of a run
            let m = 1;
            while (m < 6 && ks[(q + m) % 6] === ks[q]) m++;
            if (m < 2) continue;
            const fan = [];
            for (let t = 0; t < m; t++) { const [i, j, ty] = around(a, b)[(q + t) % 6]; fan.push(ccw(ty === 'u' ? [P(i, j), P(i + 1, j), P(i, j + 1)] : [P(i + 1, j), P(i + 1, j + 1), P(i, j + 1)])); }
            patches.push({ k: ks[q], type: m <= 2 ? 'convex' : 'fill', vx, vy, fan, bis: ((60 * q + 30 * m) * Math.PI) / 180, half: ((30 * m) * Math.PI) / 180 });
          }
        }
      const pieces = [{ tris, patches }];
      const g2 = sect > 1 ? p.gap / 2 : 0, c = Math.cos(rot), s = Math.sin(rot);
      // Gaps: rays from the centre along the sector boundaries (lattice lines, so they run between triangles).
      const rays = [];
      for (let k = 0; k < sect; k++) { const a = (2 * Math.PI * k) / sect; rays.push([Math.cos(a), Math.sin(a)]); }
      const rayDist = (x, y) => {
        let d = 1e9;
        for (const [rx, ry] of rays) { const t = x * rx + y * ry; d = Math.min(d, t > 0 ? Math.abs(x * ry - y * rx) : Math.hypot(x, y)); }
        return d;
      };
      const fanDist = (fan, x, y) => { let d = 1e9; for (const V of fan) d = Math.min(d, triDist(V, x, y)); return d; };
      const evalFn = (X, Y) => {
        const dx0 = X - cx, dy0 = Y - cy, x = c * dx0 + s * dy0, y = -s * dx0 + c * dy0;
        let f = 1e9;
        for (const pc of pieces) {
          let q = 1e9;
          for (const t of pc.tris) {
            const dx = x - t.gx, dy = y - t.gy;
            if (dx * dx + dy * dy > (Rt + 4) ** 2) { q = Math.min(q, Math.hypot(dx, dy) - Rt); continue; }
            q = Math.min(q, triDist(t.Vi, x, y) - ro);
          }
          for (const pt of pc.patches) {
            const dx = x - pt.vx, dy = y - pt.vy, rr = Math.hypot(dx, dy), reach = 3 * ro + 0.5;
            if (rr > reach + 1) continue;
            let v;
            if (pt.type === 'disc') v = rr - Math.min(2.2 * ro, Rt * 0.45);
            else {
              v = Math.max(fanDist(pt.fan, x, y), rr - reach);
              if (pt.type === 'convex') {
                // Exact wedge with its apex pulled in so an offset of ro rounds the corner.
                const bx = Math.cos(pt.bis), by = Math.sin(pt.bis), off = ro / Math.sin(pt.half);
                const qx = dx - bx * off, qy = dy - by * off;
                const yy = qx * bx + qy * by, xx = Math.abs(-qx * by + qy * bx);
                const sa = Math.sin(pt.half), ca = Math.cos(pt.half);
                const w = xx * sa + yy * ca < 0 ? Math.hypot(xx, yy) : xx * ca - yy * sa;
                v = Math.max(v, w - ro);
              }
            }
            q = Math.min(q, v);
          }
          f = Math.min(f, q);
        }
        return g2 > 0 ? smax(f, g2 - rayDist(x, y), Math.min(ro, g2 * 2)) : f;
      };
      const e = p.size + 4;
      return { evalFn, domain: { x0: cx - e, y0: cy - e, x1: cx + e, y1: cy + e }, count: tris.length };
    },
  };
})();
