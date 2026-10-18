// Quad Grid: each cell holds a square whose two top corners drop by different amounts — squares become
// trapezoids, wedges and right triangles — then turn by quarter turns. Drops follow two linear
// gradients plus randomness and field points, so the grid morphs across the board.
(function () {
  const SP = (window.SP = window.SP || {});
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // Exact signed distance to a convex polygon (vertices in order).
  function polyDist(V, x, y) {
    let d = Infinity, inside = true;
    const n = V.length;
    for (let i = 0; i < n; i++) {
      const [ax, ay] = V[i], [bx, by] = V[(i + 1) % n];
      const ex = bx - ax, ey = by - ay, wx = x - ax, wy = y - ay, l2 = ex * ex + ey * ey || 1e-12;
      const t = Math.min(1, Math.max(0, (wx * ex + wy * ey) / l2));
      d = Math.min(d, Math.hypot(wx - ex * t, wy - ey * t));
      if (ex * wy - ey * wx < 0) inside = false; // CCW polygon: point must be left of every edge
    }
    return inside ? -d : d;
  }
  // Inset a convex CCW polygon by r (drops edges that collapse).
  function inset(V, r) {
    const n = V.length, L = [];
    for (let i = 0; i < n; i++) {
      const [ax, ay] = V[i], [bx, by] = V[(i + 1) % n], l = Math.hypot(bx - ax, by - ay);
      if (l < 1e-9) continue;
      const nx = -(by - ay) / l, ny = (bx - ax) / l; // inward normal for CCW
      L.push([ax + nx * r, ay + ny * r, (bx - ax) / l, (by - ay) / l]);
    }
    const out = [];
    for (let i = 0; i < L.length; i++) {
      const [px, py, dx, dy] = L[(i - 1 + L.length) % L.length], [qx, qy, ex, ey] = L[i];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((qx - px) * ey - (qy - py) * ex) / den;
      out.push([px + dx * t, py + dy * t]);
    }
    return out.length >= 3 ? out : null;
  }

  SP.generators.quadgrid = {
    id: 'quadgrid',
    name: 'Quad Grid',
    board: true,
    tileable: true,
    schema: [
      { group: 'Grid' },
      { key: 'cols', label: 'Columns', min: 1, max: 40, step: 1, def: 8, int: true, rand: [4, 12] },
      { key: 'rows', label: 'Rows', min: 1, max: 40, step: 1, def: 8, int: true, rand: [4, 12] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 12 },
      { key: 'gap', label: 'Gap (mm)', min: 0, max: 20, step: 0.1, def: 4, rand: [2, 6] },
      { key: 'round', label: 'Corner radius (mm)', min: 0, max: 5, step: 0.05, def: 0.3 },
      { group: 'Left corner drop' },
      { key: 'aBase', label: 'Base', min: -1, max: 2, step: 0.01, def: 0 },
      { key: 'aGrad', label: 'Gradient amount', min: -3, max: 3, step: 0.01, def: 1.4, rand: [-2, 2] },
      { key: 'aAngle', label: 'Gradient dir °', min: -180, max: 180, step: 1, def: 0, rand: [-180, 180] },
      { group: 'Right corner drop' },
      { key: 'bBase', label: 'Base', min: -1, max: 2, step: 0.01, def: 0.3 },
      { key: 'bGrad', label: 'Gradient amount', min: -3, max: 3, step: 0.01, def: 1.2, rand: [-2, 2] },
      { key: 'bAngle', label: 'Gradient dir °', min: -180, max: 180, step: 1, def: -90, rand: [-180, 180] },
      { group: 'Variation' },
      { key: 'random', label: 'Random drop', min: 0, max: 2, step: 0.01, def: 0.3, rand: [0, 0.8] },
      { key: 'quant', label: 'Snap drops to steps (0 = off)', min: 0, max: 8, step: 1, def: 0, int: true },
      { key: 'turn', label: 'Quarter turns', type: 'select', def: 'none', options: [['none', 'None'], ['random', 'Random'], ['checker', 'Checker'], ['rows', 'By row'], ['mirror', 'Random mirror']] },
      { key: 'fieldGain', label: 'Field points → drop', min: -3, max: 3, step: 0.01, def: 1 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 40, int: true, rand: [1, 9999] },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const T = ctx.tile;
      const C = Math.max(1, Math.round(p.cols));
      let R = Math.max(1, Math.round(p.rows));
      let px = (B.w - 2 * p.margin) / C, py = (B.h - 2 * p.margin) / R;
      px = py = Math.min(px, py);
      if (T) { if (T.x) px = B.w / C; if (T.y) { R = Math.max(1, Math.round(B.h / px)); py = B.h / R; } if (!T.y) py = px; if (!T.x) px = py; }
      const x0 = T && T.x ? 0 : B.w / 2 - (C * px) / 2, y0 = T && T.y ? 0 : B.h / 2 - (R * py) / 2;
      const rand = rng(p.seed * 31337 + 1);
      const G = (x, y, deg) => SP.gradCoord(x, y, deg, B.w / 2, B.h / 2, C * px, R * py, T);
      const q = (v) => (p.quant > 0 ? Math.round(v * p.quant) / p.quant : v);
      const cells = [];
      for (let j = 0; j < R; j++)
        for (let i = 0; i < C; i++) {
          const cx = x0 + (i + 0.5) * px, cy = y0 + (j + 0.5) * py;
          const F = points.length ? p.fieldGain * fieldAt(cx, cy) : 0;
          // Drop of each top corner, 0 = square corner, 1 = all the way to the bottom (triangle).
          const a = q(clamp01(p.aBase + p.aGrad * (G(cx, cy, p.aAngle) + 0.5) + p.random * (rand() - 0.5) + F));
          const b = q(clamp01(p.bBase + p.bGrad * (G(cx, cy, p.bAngle) + 0.5) + p.random * (rand() - 0.5) + F));
          const k = p.turn === 'random' ? Math.floor(rand() * 4) : p.turn === 'checker' ? ((i + j) & 1) * 2 : p.turn === 'rows' ? j & 3 : 0;
          const hx = px / 2 - p.gap / 2, hy = py / 2 - p.gap / 2;
          // CCW in y-down screen space means clockwise visually; polyDist uses the screen convention.
          let V = [[-hx, -hy + 2 * hy * a], [-hx, hy], [hx, hy], [hx, -hy + 2 * hy * b]];
          if (a >= 0.999) V = [[-hx, hy], [hx, hy], [hx, -hy + 2 * hy * b]];
          if (b >= 0.999) V = [[-hx, -hy + 2 * hy * a], [-hx, hy], [hx, hy]];
          if (a >= 0.999 && b >= 0.999) { cells.push(null); continue; }
          const c = [1, 0, -1, 0][k], s = [0, 1, 0, -1][k];
          const m = p.turn === 'mirror' && rand() < 0.5 ? -1 : 1;
          V = V.map(([x, y]) => [cx + c * x * m - s * y, cy + s * x * m + c * y]);
          // Orientation: polyDist expects left-of-edge = inside; fix winding if needed.
          let area = 0;
          for (let n = 0; n < V.length; n++) { const [ax, ay] = V[n], [bx, by] = V[(n + 1) % V.length]; area += ax * by - bx * ay; }
          if (area < 0) V.reverse();
          const r = Math.min(p.round, hx * 0.3, hy * 0.3);
          // Inset for rounded corners; fall back to sharp corners if the inset folds (tiny edges).
          let Vi = r > 0 ? inset(V, r) : V;
          if (Vi && r > 0) {
            let a2 = 0;
            for (let n = 0; n < Vi.length; n++) { const [ax, ay] = Vi[n], [bx, by] = Vi[(n + 1) % Vi.length]; a2 += ax * by - bx * ay; }
            if (!(a2 > 0) || Vi.some(([vx, vy]) => polyDist(V, vx, vy) > -r * 0.99)) Vi = null;
          }
          cells.push(Vi ? { V: Vi, r } : { V, r: 0 });
        }
      const evalFn = (x, y) => {
        const ci = Math.floor((x - x0) / px), cj = Math.floor((y - y0) / py);
        let f = Math.max(px, py);
        for (let j = cj - 1; j <= cj + 1; j++)
          for (let i = ci - 1; i <= ci + 1; i++) {
            let ii = i, jj = j;
            if (T && T.x) ii = ((i % C) + C) % C; else if (i < 0 || i >= C) continue;
            if (T && T.y) jj = ((j % R) + R) % R; else if (j < 0 || j >= R) continue;
            const c = cells[jj * C + ii];
            if (!c) continue;
            f = Math.min(f, polyDist(c.V, x - (i - ii) * px, y - (j - jj) * py) - c.r);
          }
        return f;
      };
      return { evalFn, domain: { x0: x0 - 2, y0: y0 - 2, x1: x0 + C * px + 2, y1: y0 + R * py + 2 }, count: cells.length };
    },
  };
})();
