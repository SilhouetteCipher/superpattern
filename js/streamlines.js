// Streamlines: evenly spaced flow lines (Jobard & Lefer, 1997) through a designed vector field. The field is a
// uniform drift plus seeded singularities — each one a source/sink rotated by "Spin" toward a vortex, so 0° makes
// magnet-like field lines and 90° whirlpools — plus a smooth noise twist (the Tyler Hobbs flow-field look). Field
// points add extra vortices. Lines are traced greedily: the first runs from one seed, new seeds are tried one
// spacing to either side of every finished line, then any leftover holes are scanned and filled. A line stops at
// the margin, at a singularity, or when it comes within "Stop distance" of another line; one that comes back
// round to its own start closes into a ring. Each line is drawn as a band whose radius shrinks wherever another
// line comes near, so neighbours never get closer than "Gap"; ends taper like brush strokes, and anything left
// thinner than 0.6 mm is trimmed off, so there are no hairlines or specks.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_R = 0.3;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Seeded 2D gradient noise with quintic fade, roughly in [-1, 1].
  function makeNoise(seed) {
    const rand = rng(seed * 7919 + 13);
    const perm = new Uint8Array(512), gx = new Float32Array(256), gy = new Float32Array(256);
    const idx = [...Array(256).keys()];
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = idx[i & 255];
    for (let i = 0; i < 256; i++) { const a = rand() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      const g = (i, j, dx, dy) => { const h = perm[(perm[(xi + i) & 255] + yi + j) & 255]; return gx[h] * dx + gy[h] * dy; };
      const u = fade(xf), v = fade(yf);
      const a = g(0, 0, xf, yf) + u * (g(1, 0, xf - 1, yf) - g(0, 0, xf, yf));
      const b = g(0, 1, xf, yf - 1) + u * (g(1, 1, xf - 1, yf - 1) - g(0, 1, xf, yf - 1));
      return (a + v * (b - a)) * 1.4;
    };
  }

  // Uniform-grid point index for separation tests (cell = spacing).
  function makeGrid(cell) {
    const m = new Map();
    const key = (i, j) => i * 73856093 ^ j * 19349663;
    return {
      add(x, y, line, k) {
        const kk = key(Math.floor(x / cell), Math.floor(y / cell));
        let b = m.get(kk);
        if (!b) m.set(kk, (b = []));
        b.push(x, y, line, k);
      },
      // Nearest distance from (x,y) to any stored point not on `skip`, searched within r (r ≤ cell·reach).
      near(x, y, r, skip) {
        const ci = Math.floor(x / cell), cj = Math.floor(y / cell), n = Math.ceil(r / cell);
        let best = r * r;
        for (let j = cj - n; j <= cj + n; j++)
          for (let i = ci - n; i <= ci + n; i++) {
            const b = m.get(key(i, j));
            if (!b) continue;
            for (let t = 0; t < b.length; t += 4) {
              if (b[t + 2] === skip) continue;
              const dx = b[t] - x, dy = b[t + 1] - y, d = dx * dx + dy * dy;
              if (d < best) best = d;
            }
          }
        return Math.sqrt(best);
      },
    };
  }

  SP.generators.streamlines = {
    id: 'streamlines',
    name: 'Streamlines',
    board: true,
    schema: [
      { group: 'Flow' },
      { key: 'field', label: 'Field', type: 'select', def: 'mixed', options: [['mixed', 'Mixed singularities'], ['swirl', 'Whirlpools (one sense)'], ['dipoles', 'Dipole pairs'], ['noise', 'Noise drift only']] },
      { key: 'count', label: 'Singularities', min: 1, max: 8, step: 1, def: 3, int: true, rand: [1, 5] },
      { key: 'spin', label: 'Spin °', min: 0, max: 90, step: 1, def: 70, rand: [0, 90] },
      { key: 'flow', label: 'Drift', min: 0, max: 2, step: 0.01, def: 0.35, rand: [0, 0.9] },
      { key: 'angle', label: 'Drift angle °', min: -180, max: 180, step: 1, def: 20, rand: [-180, 180] },
      { key: 'noise', label: 'Noise twist', min: 0, max: 1.5, step: 0.01, def: 0.25, rand: [0, 0.7] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 17, int: true, rand: [1, 9999] },
      { group: 'Lines' },
      { key: 'spacing', label: 'Spacing (mm)', min: 2.5, max: 20, step: 0.1, def: 6, rand: [4.5, 9] },
      { key: 'test', label: 'Stop distance (× spacing)', min: 0.3, max: 0.95, step: 0.01, def: 0.55, rand: [0.4, 0.8] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { group: 'Band' },
      { key: 'width', label: 'Width (× spacing)', min: 0.15, max: 0.9, step: 0.01, def: 0.55, rand: [0.35, 0.75] },
      { key: 'taper', label: 'End taper (mm)', min: 0, max: 40, step: 0.5, def: 10, rand: [0, 20] },
      { key: 'gap', label: 'Min gap (mm)', min: 0.6, max: 5, step: 0.05, def: 0.9 },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.3, rand: [0.1, 0.8] },
      { group: 'Field points' },
      { key: 'fieldSpin', label: 'Points → vortex', min: -2, max: 2, step: 0.01, def: 1 },
    ],

    generateBoard(p, ctx) {
      const { board: B, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 3);
      const mg = Math.max(0, p.margin);
      const dsep = Math.max(2.5, p.spacing);
      const gap = Math.max(0.6, p.gap);
      const rMax = Math.max(MIN_R, Math.min((p.width * dsep) / 2, (dsep - gap) / 2));
      const dtest = Math.max(0.3, Math.min(0.95, p.test)) * dsep;
      const h = Math.min(1, dsep * 0.2); // integration step (mm)
      const x0 = mg + rMax, y0 = mg + rMax, x1 = B.w - mg - rMax, y1 = B.h - mg - rMax;
      const out = { strokes: [], blobs: [], count: 0 };
      if (x1 - x0 < dsep || y1 - y0 < dsep) return out;
      const L = Math.min(x1 - x0, y1 - y0) / 4; // singularity reach: |v| ≈ 1 at distance L
      const core = dsep * 0.5;

      // ---- Vector field ----
      const sing = [];
      if (p.field !== 'noise') {
        const n = Math.max(1, Math.min(8, Math.round(p.count)));
        const pad = Math.min(x1 - x0, y1 - y0) * 0.12;
        const place = () => [x0 + pad + rand() * (x1 - x0 - 2 * pad), y0 + pad + rand() * (y1 - y0 - 2 * pad)];
        for (let k = 0; k < n; k++) {
          const [x, y] = place();
          const s = 0.6 + 0.4 * rand();
          if (p.field === 'dipoles') {
            // Opposite pair a few spacings apart: field lines loop from one to the other.
            const a = rand() * Math.PI * 2, d = L * (0.35 + 0.3 * rand());
            sing.push({ x: x - Math.cos(a) * d / 2, y: y - Math.sin(a) * d / 2, s, phi: p.spin * D2R });
            sing.push({ x: x + Math.cos(a) * d / 2, y: y + Math.sin(a) * d / 2, s: -s, phi: p.spin * D2R });
          } else {
            const sg = p.field === 'swirl' || rand() < 0.5 ? 1 : -1;
            sing.push({ x, y, s: s * sg, phi: p.spin * D2R });
          }
        }
      }
      for (const q of points) // field points: pure vortices, strength sign sets the turning sense
        if (p.fieldSpin) sing.push({ x: q.x, y: q.y, s: p.fieldSpin * (q.strength || 0), phi: Math.PI / 2, reach: Math.max(1, q.radius || L) });
      const drift = p.field === 'noise' ? Math.max(0.3, p.flow) : p.flow;
      const ux = drift * Math.cos(p.angle * D2R), uy = -drift * Math.sin(p.angle * D2R);
      const noise = makeNoise(p.seed), ns = Math.min(B.w, B.h) / 3, twist = p.noise * Math.PI;
      const vel = (x, y) => {
        let vx = ux, vy = uy;
        for (const q of sing) {
          const dx = x - q.x, dy = y - q.y, r = Math.hypot(dx, dy) + 1e-9;
          const m = (q.s * (q.reach || L)) / (r + core) / r; // radial unit × magnitude
          const c = Math.cos(q.phi), sn = Math.sin(q.phi);
          vx += m * (c * dx - sn * dy);
          vy += m * (sn * dx + c * dy);
        }
        if (twist) {
          const a = twist * noise(x / ns, y / ns), c = Math.cos(a), sn = Math.sin(a);
          const tx = c * vx - sn * vy;
          vy = sn * vx + c * vy;
          vx = tx;
        }
        return [vx, vy];
      };
      const dir = (x, y, sgn) => {
        const [vx, vy] = vel(x, y), m = Math.hypot(vx, vy);
        return m < 1e-4 ? null : [(sgn * vx) / m, (sgn * vy) / m];
      };
      const inside = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
      const nearSing = (x, y) => sing.some((q) => Math.hypot(x - q.x, y - q.y) < core * 0.6);

      // ---- Jobard–Lefer placement ----
      const grid = makeGrid(dsep);
      const lines = [];
      const maxSteps = Math.ceil((4 * (B.w + B.h)) / h);

      // Trace one direction from the seed (seed excluded). Returns { pts, closed }.
      const trace = (sx, sy, sgn, id, allowClose) => {
        const pts = [];
        let x = sx, y = sy, len = 0;
        const d0 = dir(sx, sy, sgn);
        const own = makeGrid(dsep), lag = Math.ceil((2.2 * dtest) / h);
        for (let k = 0; k < maxSteps; k++) {
          const a = dir(x, y, sgn);
          if (!a) break;
          const b = dir(x + a[0] * h * 0.5, y + a[1] * h * 0.5, sgn);
          if (!b) break;
          const nx = x + b[0] * h, ny = y + b[1] * h;
          if (!inside(nx, ny) || nearSing(nx, ny)) break;
          if (grid.near(nx, ny, dtest, id) < dtest) break;
          len += h;
          // Back at the start, heading the same way: close the ring.
          if (allowClose && len > 4 * dsep && Math.hypot(nx - sx, ny - sy) < dtest) {
            const c = dir(nx, ny, sgn);
            if (c && d0 && c[0] * d0[0] + c[1] * d0[1] > 0.6) return { pts, closed: true };
          }
          if (pts.length > lag) { const q = pts[pts.length - lag]; own.add(q[0], q[1], 0, 0); }
          if (own.near(nx, ny, dtest, -1) < dtest && !(allowClose && Math.hypot(nx - sx, ny - sy) < dtest)) break;
          pts.push([nx, ny]);
          x = nx; y = ny;
        }
        return { pts, closed: false };
      };

      const minLen = 2.5 * dsep;
      const tryLine = (sx, sy) => {
        if (!inside(sx, sy) || nearSing(sx, sy) || !dir(sx, sy, 1)) return null;
        if (grid.near(sx, sy, dsep * 0.98, -1) < dsep * 0.98) return null;
        const id = lines.length;
        const f = trace(sx, sy, 1, id, true);
        let pts, closed = f.closed;
        if (closed) pts = [[sx, sy], ...f.pts];
        else {
          const bk = trace(sx, sy, -1, id, false);
          pts = [...bk.pts.reverse(), [sx, sy], ...f.pts];
        }
        if ((pts.length - 1) * h < minLen) return null;
        const line = { pts, closed };
        lines.push(line);
        pts.forEach((q, k) => grid.add(q[0], q[1], id, k));
        return line;
      };

      // Scan leftover holes in random order for one fresh seed.
      const refill = () => {
        const cand = [];
        for (let y = y0; y <= y1; y += dsep / 2) for (let x = x0; x <= x1; x += dsep / 2) cand.push([x, y]);
        for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
        for (const c of cand) if (tryLine(c[0] + (rand() - 0.5) * 0.2, c[1] + (rand() - 0.5) * 0.2)) return true;
        return false;
      };
      if (!tryLine(x0 + (x1 - x0) * (0.35 + 0.3 * rand()), y0 + (y1 - y0) * (0.35 + 0.3 * rand()))) refill();
      const every = Math.max(1, Math.round(dsep / 2 / h));
      for (let li = 0; li < lines.length && lines.length < 4000; li++) {
        const P = lines[li].pts;
        for (let k = 0; k < P.length; k += every) {
          const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)];
          const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
          for (const s of [-1, 1]) tryLine(P[k][0] - (s * ty * dsep) / tl, P[k][1] + (s * tx * dsep) / tl);
        }
        if (li === lines.length - 1) refill(); // queue drained: keep going from a fresh hole
      }

      // ---- Bands: radius limited by neighbours, tapered ends, trimmed below the minimum ----
      for (let id = 0; id < lines.length; id++) {
        const { pts, closed } = lines[id];
        const n = pts.length;
        const reach = 2 * rMax + gap;
        let r = pts.map(([x, y]) => Math.min(rMax, (grid.near(x, y, reach, id) - gap) / 2));
        const bound = r.slice();
        for (let pass = 0; pass < 3; pass++) {
          const s = r.slice();
          for (let k = 0; k < n; k++) {
            const a = closed ? (k - 1 + n) % n : Math.max(0, k - 1), b = closed ? (k + 1) % n : Math.min(n - 1, k + 1);
            s[k] = Math.min(bound[k], (r[a] + 2 * r[k] + r[b]) / 4);
          }
          r = s;
        }
        if (!closed && p.taper > 0)
          for (let k = 0; k < n; k++) {
            const sEnd = Math.min(k, n - 1 - k) * h;
            r[k] *= Math.sin((Math.PI / 2) * Math.min(1, (sEnd + h) / p.taper));
          }
        // Split into runs where the band stays printable; keep runs long enough not to be specks.
        const runs = [];
        let cur = [];
        for (let k = 0; k < n; k++) {
          if (r[k] >= MIN_R) cur.push(k);
          else { if (cur.length) runs.push(cur); cur = []; }
        }
        if (cur.length) runs.push(cur);
        if (closed && runs.length === 1 && runs[0].length === n) {
          out.strokes.push({ pts: [...pts, pts[0]], r: [...r, r[0]] });
          out.count++;
          continue;
        }
        if (closed && runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][runs[runs.length - 1].length - 1] === n - 1)
          runs[0] = [...runs.pop(), ...runs[0]]; // join across the ring's seam
        for (const run of runs) {
          if (run.length * h < Math.max(2 * rMax, dsep * 0.8)) continue;
          out.strokes.push({ pts: run.map((k) => pts[k]), r: run.map((k) => r[k]) });
          out.count++;
        }
      }
      return out;
    },
  };
})();
