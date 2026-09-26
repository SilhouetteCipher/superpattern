// Field -> closed loops -> G1 cubic Béziers.
//  1. Sparse marching squares (coarse pass skips cells the Lipschitz bound proves empty).
//  2. Saddles resolved with a centre sample.
//  3. Vertices projected onto the true zero set (Newton, step-clamped).
//  4. Schneider curve fitting with tangents taken from the field gradient,
//     so every join shares one tangent (G1) and tolerance is in mm.
(function () {
  const SP = (window.SP = window.SP || {});
  const COARSE = 4;

  SP.extractLoops = function (field, dom, h, opts = {}) {
    const iters = opts.iters ?? 3;
    const f = (x, y) => field.eval(x, y);
    // Cap memory: grow the step if the dense value grid would exceed MAX_NODES.
    const MAX_NODES = 24e6;
    const area = (dom.x1 - dom.x0 + h) * (dom.y1 - dom.y0 + h);
    if (area / (h * h) > MAX_NODES) h = Math.sqrt(area / MAX_NODES) * 1.01;
    const H = h * COARSE;
    const NX = Math.max(1, Math.ceil((dom.x1 - dom.x0) / H)), NY = Math.max(1, Math.ceil((dom.y1 - dom.y0) / H));
    const nx = NX * COARSE, ny = NY * COARSE, W = nx + 1;
    const x0 = dom.x0, y0 = dom.y0;

    // Coarse pass; cells whose corners prove a uniform sign (1-Lipschitz field) are skipped.
    const cv = new Float64Array((NX + 1) * (NY + 1));
    for (let J = 0; J <= NY; J++) for (let I = 0; I <= NX; I++) cv[J * (NX + 1) + I] = f(x0 + I * H, y0 + J * H);
    const val = new Float32Array(W * (ny + 1)).fill(NaN);
    const active = new Uint8Array(NX * NY);
    const thr = H * 0.7072 * 1.02;
    for (let J = 0; J < NY; J++)
      for (let I = 0; I < NX; I++) {
        const a = cv[J * (NX + 1) + I], b = cv[J * (NX + 1) + I + 1], c = cv[(J + 1) * (NX + 1) + I + 1], d = cv[(J + 1) * (NX + 1) + I];
        if ((a > thr && b > thr && c > thr && d > thr) || (a < -thr && b < -thr && c < -thr && d < -thr)) continue;
        active[J * NX + I] = 1;
        for (let j = J * COARSE; j <= (J + 1) * COARSE; j++)
          for (let i = I * COARSE; i <= (I + 1) * COARSE; i++) {
            const id = j * W + i;
            if (val[id] !== val[id]) val[id] = f(x0 + i * h, y0 + j * h);
          }
      }
    const V = (i, j) => {
      const id = j * W + i;
      let v = val[id];
      if (v !== v) v = cv[Math.floor(j / COARSE) * (NX + 1) + Math.floor(i / COARSE)];
      if ((i === 0 || j === 0 || i === nx || j === ny) && v <= 0) v = h; // close at domain edge
      return v;
    };

    // Marching squares, oriented: each segment runs exit-edge -> enter-edge walking corners clockwise.
    // Crossings are stored sparsely (only edges the contour actually cuts).
    const HCOUNT = nx * (ny + 1);
    const index = new Map();
    const cx = [], cy = [], nxt = [];
    const crossing = (e) => {
      let k = index.get(e);
      if (k !== undefined) return k;
      k = cx.length;
      index.set(e, k);
      nxt.push(-1);
      if (e < HCOUNT) {
        const j = Math.floor(e / nx), i = e - j * nx;
        const va = V(i, j), vb = V(i + 1, j);
        const t = va / (va - vb);
        cx.push(x0 + (i + t) * h); cy.push(y0 + j * h);
      } else {
        const r = e - HCOUNT, j = Math.floor(r / W), i = r - j * W;
        const va = V(i, j), vb = V(i, j + 1);
        const t = va / (va - vb);
        cx.push(x0 + i * h); cy.push(y0 + (j + t) * h);
      }
      return k;
    };
    const link = (a, b) => { nxt[crossing(a)] = crossing(b); };
    const ins = [false, false, false, false], edges = [0, 0, 0, 0];
    for (let J = 0; J < NY; J++)
      for (let I = 0; I < NX; I++) {
        if (!active[J * NX + I]) continue;
        for (let j = J * COARSE; j < (J + 1) * COARSE; j++)
          for (let i = I * COARSE; i < (I + 1) * COARSE; i++) {
            const v0 = V(i, j), v1 = V(i + 1, j), v2 = V(i + 1, j + 1), v3 = V(i, j + 1);
            const code = (v0 < 0) | ((v1 < 0) << 1) | ((v2 < 0) << 2) | ((v3 < 0) << 3);
            if (code === 0 || code === 15) continue;
            ins[0] = v0 < 0; ins[1] = v1 < 0; ins[2] = v2 < 0; ins[3] = v3 < 0;
            edges[0] = j * nx + i; // top    c0->c1
            edges[1] = HCOUNT + j * W + i + 1; // right  c1->c2
            edges[2] = (j + 1) * nx + i; // bottom c2->c3
            edges[3] = HCOUNT + j * W + i; // left   c3->c0
            if (code === 5 || code === 10) {
              const centreIn = f(x0 + (i + 0.5) * h, y0 + (j + 0.5) * h) < 0;
              for (let k = 0; k < 4; k++)
                if (ins[k] && !ins[(k + 1) & 3]) link(edges[k], edges[centreIn ? (k + 1) & 3 : (k + 3) & 3]);
            } else {
              let xk = -1, nk = -1;
              for (let k = 0; k < 4; k++) {
                const a = ins[k], b = ins[(k + 1) & 3];
                if (a && !b) xk = k; else if (!a && b) nk = k;
              }
              link(edges[xk], edges[nk]);
            }
          }
      }

    // Chain into loops.
    const loops = [];
    const seen = new Uint8Array(cx.length);
    for (let e = 0; e < cx.length; e++) {
      if (nxt[e] < 0 || seen[e]) continue;
      const pts = [];
      let c = e;
      while (c >= 0 && !seen[c]) {
        seen[c] = 1;
        pts.push(cx[c], cy[c]);
        c = nxt[c];
      }
      if (pts.length >= 6) loops.push(pts);
    }

    // Project onto the zero set and take tangents from the gradient.
    const eps = h * 0.01;
    const minSep = h * 0.08;
    const out = [];
    for (const L of loops) {
      const n = L.length / 2;
      const P = [], T = [];
      if (opts.fast) {
        // Draft: no projection, tangents from the polyline.
        for (let q = 0; q < n; q++) {
          const x = L[2 * q], y = L[2 * q + 1];
          const pl = P.length;
          if (pl && Math.hypot(x - P[pl - 1][0], y - P[pl - 1][1]) < minSep) continue;
          P.push([x, y]);
        }
        const m = P.length;
        for (let q = 0; q < m; q++) {
          const a = P[(q + m - 1) % m], b = P[(q + 1) % m];
          const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
          T.push([dx / l, dy / l]);
        }
      } else
      for (let q = 0; q < n; q++) {
        let x = L[2 * q], y = L[2 * q + 1], gx = 0, gy = 0;
        for (let it = 0; it <= iters; it++) {
          const v = f(x, y);
          gx = (f(x + eps, y) - f(x - eps, y)) / (2 * eps);
          gy = (f(x, y + eps) - f(x, y - eps)) / (2 * eps);
          if (it === iters) break;
          const g2 = gx * gx + gy * gy;
          if (g2 < 1e-12) break;
          let dx = (-v * gx) / g2, dy = (-v * gy) / g2;
          const len = Math.hypot(dx, dy);
          if (len > h * 0.5) { dx *= (h * 0.5) / len; dy *= (h * 0.5) / len; }
          x += dx; y += dy;
          if (len < 1e-7) break;
        }
        const pl = P.length;
        if (pl && Math.hypot(x - P[pl - 1][0], y - P[pl - 1][1]) < minSep) continue;
        const gl = Math.hypot(gx, gy) || 1;
        P.push([x, y]);
        T.push([-gy / gl, gx / gl]);
      }
      while (P.length > 3 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < minSep) { P.pop(); T.pop(); }
      if (P.length < 4) continue;
      // Orient tangents along travel direction.
      for (let q = 0; q < P.length; q++) {
        const a = P[(q + P.length - 1) % P.length], b = P[(q + 1) % P.length];
        if ((b[0] - a[0]) * T[q][0] + (b[1] - a[1]) * T[q][1] < 0) { T[q][0] = -T[q][0]; T[q][1] = -T[q][1]; }
      }
      let area = 0;
      for (let q = 0; q < P.length; q++) {
        const a = P[q], b = P[(q + 1) % P.length];
        area += a[0] * b[1] - b[0] * a[1];
      }
      out.push({ P, T, area: area / 2 });
    }
    out.hUsed = h;
    return out;
  };

  // ---------- Schneider fitting ----------
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const scl = (a, s) => [a[0] * s, a[1] * s];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];

  function bez(b, t) {
    const u = 1 - t;
    const a0 = u * u * u, a1 = 3 * u * u * t, a2 = 3 * u * t * t, a3 = t * t * t;
    return [a0 * b[0][0] + a1 * b[1][0] + a2 * b[2][0] + a3 * b[3][0], a0 * b[0][1] + a1 * b[1][1] + a2 * b[2][1] + a3 * b[3][1]];
  }
  function bezD1(b, t) {
    const u = 1 - t;
    return [
      3 * (u * u * (b[1][0] - b[0][0]) + 2 * u * t * (b[2][0] - b[1][0]) + t * t * (b[3][0] - b[2][0])),
      3 * (u * u * (b[1][1] - b[0][1]) + 2 * u * t * (b[2][1] - b[1][1]) + t * t * (b[3][1] - b[2][1])),
    ];
  }
  function bezD2(b, t) {
    const u = 1 - t;
    return [
      6 * (u * (b[2][0] - 2 * b[1][0] + b[0][0]) + t * (b[3][0] - 2 * b[2][0] + b[1][0])),
      6 * (u * (b[2][1] - 2 * b[1][1] + b[0][1]) + t * (b[3][1] - 2 * b[2][1] + b[1][1])),
    ];
  }

  function chordParams(P, first, last) {
    const u = [0];
    for (let i = first + 1; i <= last; i++) u.push(u[u.length - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = u[u.length - 1] || 1;
    return u.map((v) => v / L);
  }

  function generate(P, first, last, u, t1, t2) {
    const p0 = P[first], p3 = P[last];
    let c00 = 0, c01 = 0, c11 = 0, x0 = 0, x1 = 0;
    for (let i = 0; i < u.length; i++) {
      const t = u[i], s = 1 - t;
      const b0 = s * s * s, b1 = 3 * s * s * t, b2 = 3 * s * t * t, b3 = t * t * t;
      const a1 = scl(t1, b1), a2 = scl(t2, b2);
      c00 += dot(a1, a1); c01 += dot(a1, a2); c11 += dot(a2, a2);
      const tmp = sub(P[first + i], add(scl(p0, b0 + b1), scl(p3, b2 + b3)));
      x0 += dot(a1, tmp); x1 += dot(a2, tmp);
    }
    const det = c00 * c11 - c01 * c01;
    let al = 0, ar = 0;
    if (Math.abs(det) > 1e-12) { al = (x0 * c11 - x1 * c01) / det; ar = (c00 * x1 - c01 * x0) / det; }
    const segLen = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
    const eps = 1e-6 * segLen;
    if (al < eps || ar < eps || al > segLen * 2 || ar > segLen * 2) al = ar = segLen / 3;
    return [p0, add(p0, scl(t1, al)), add(p3, scl(t2, ar)), p3];
  }

  function maxError(P, first, last, b, u) {
    let max = 0, split = (first + last) >> 1;
    for (let i = 1; i < u.length - 1; i++) {
      const q = bez(b, u[i]);
      const d = (q[0] - P[first + i][0]) ** 2 + (q[1] - P[first + i][1]) ** 2;
      if (d >= max) { max = d; split = first + i; }
    }
    return [max, split];
  }

  function reparam(P, first, b, u) {
    return u.map((t, i) => {
      const p = P[first + i];
      const q = bez(b, t), q1 = bezD1(b, t), q2 = bezD2(b, t);
      const num = (q[0] - p[0]) * q1[0] + (q[1] - p[1]) * q1[1];
      const den = q1[0] * q1[0] + q1[1] * q1[1] + (q[0] - p[0]) * q2[0] + (q[1] - p[1]) * q2[1];
      if (Math.abs(den) < 1e-12) return t;
      return Math.min(1, Math.max(0, t - num / den));
    });
  }

  function fitRange(P, T, first, last, t1, t2, tol2, out, depth) {
    if (last - first === 1) {
      const d = Math.hypot(P[last][0] - P[first][0], P[last][1] - P[first][1]) / 3;
      out.push([P[first], add(P[first], scl(t1, d)), add(P[last], scl(t2, d)), P[last]]);
      return;
    }
    let u = chordParams(P, first, last);
    let b = generate(P, first, last, u, t1, t2);
    let [err, split] = maxError(P, first, last, b, u);
    if (err < tol2) { out.push(b); return; }
    if (err < tol2 * 16) {
      for (let k = 0; k < 6; k++) {
        u = reparam(P, first, b, u);
        b = generate(P, first, last, u, t1, t2);
        [err, split] = maxError(P, first, last, b, u);
        if (err < tol2) { out.push(b); return; }
      }
    }
    if (depth > 40) { out.push(b); return; }
    if (split <= first) split = first + 1;
    if (split >= last) split = last - 1;
    const tc = T[split];
    fitRange(P, T, first, split, t1, [-tc[0], -tc[1]], tol2, out, depth + 1);
    fitRange(P, T, split, last, tc, t2, tol2, out, depth + 1);
  }

  // Closed loop -> array of cubic segments [[p0,c1,c2,p3], ...]
  SP.fitLoop = function (loop, tol) {
    const n = loop.P.length;
    const P = loop.P.concat([loop.P[0]]);
    const T = loop.T.concat([loop.T[0]]);
    const out = [];
    const mid = n >> 1;
    const tol2 = tol * tol;
    const neg = (t) => [-t[0], -t[1]];
    fitRange(P, T, 0, mid, T[0], neg(T[mid]), tol2, out, 0);
    fitRange(P, T, mid, n, T[mid], neg(T[n]), tol2, out, 0);
    return out;
  };

  // Convenience: field -> fitted contours.
  SP.contour = function (field, dom, h, tol, opts) {
    let loops = SP.extractLoops(field, dom, h, opts);
    const hUsed = loops.hUsed;
    if (opts && opts.minArea > 0) loops = loops.filter((l) => Math.abs(l.area) >= opts.minArea); // drop CAD-hostile specks
    loops.hUsed = hUsed;
    const out = loops.map((l) => ({ segs: SP.fitLoop(l, tol), area: l.area, P: l.P }));
    out.hUsed = loops.hUsed;
    return out;
  };
})();
