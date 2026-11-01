// Venation: leaf veins grown by space colonization (Runions, Fuhrer, Lane, Federl, Rolland-Lagan & Prusinkiewicz,
// "Modeling and visualization of leaf venation patterns", SIGGRAPH 2005). The bounds are scattered with seeded
// "auxin" sources at least one Spacing apart (dart throwing). Each step every source finds the closest vein node
// within its reach, each node that was chosen grows one short segment toward the average direction of its sources,
// and any source that a node comes within the kill distance of is consumed. Veins therefore race into empty space,
// split where sources pull two ways and stop when the space around them is used up, so the gaps between veins stay
// even. Vein width follows the pipe model (Murray's law): a tip has the Tip width, every junction r = (Σ rᵢⁿ)^(1/n),
// capped at Max width, so main veins swell toward the root. Bounds are a leaf (pointed ovate outline along the
// longer board axis), an ellipse or a rounded rectangle; roots sit at the base (with an optional pre-grown midrib),
// spread along the bottom edge, at the centre, or around the rim growing inward; field points add extra roots.
// "Join tips" bridges each vein end to the nearest unrelated vein (or the rim) within reach, turning the open tree
// into the closed, looped areoles of a real leaf. Twigs shorter than 0.9 spacing are pruned so nothing hairline
// survives. Results are memoised so the growth only reruns when a parameter, the board or the field points change.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3;
  const MAX_NODES = 12000;
  const REACH = 3.5; // source influence radius (× spacing)
  const KILL = 0.6; // kill distance (× spacing)
  const STEP = 0.3; // growth step (× spacing)
  const PIPE = 2.6; // pipe-model exponent (Murray's law is 3; a little lower keeps the hierarchy visible)

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  let memoKey = '', memoOut = null;

  SP.generators.venation = {
    id: 'venation',
    name: 'Venation',
    board: true,
    schema: [
      { group: 'Bounds' },
      { key: 'bound', label: 'Shape', type: 'select', def: 'leaf', options: [['leaf', 'Leaf'], ['ellipse', 'Ellipse'], ['rect', 'Rounded rectangle']] },
      { key: 'leafW', label: 'Leaf width', min: 0.25, max: 1, step: 0.01, def: 0.6, rand: [0.4, 0.85] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 6 },
      { key: 'rim', label: 'Rim width (mm)', min: 0, max: 8, step: 0.1, def: 2.4, rand: [1.2, 4] },
      { group: 'Roots' },
      { key: 'root', label: 'Roots', type: 'select', def: 'base', options: [['base', 'Base'], ['edge', 'Along the bottom edge'], ['centre', 'Centre'], ['ring', 'Around the rim (inward)']] },
      { key: 'roots', label: 'Root count', min: 1, max: 24, step: 1, def: 5, int: true, rand: [3, 9] },
      { key: 'midrib', label: 'Midrib', type: 'bool', def: true },
      { group: 'Growth' },
      { key: 'spacing', label: 'Spacing (mm)', min: 3, max: 20, step: 0.1, def: 7, rand: [5, 11] },
      { key: 'sweep', label: 'Sweep', min: 0, max: 1.5, step: 0.01, def: 0.6, rand: [0.2, 1] },
      { key: 'wiggle', label: 'Wiggle', min: 0, max: 1, step: 0.01, def: 0.15, rand: [0, 0.5] },
      { key: 'join', label: 'Join tips (loops)', type: 'bool', def: true },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 7, int: true, rand: [1, 9999] },
      { group: 'Veins' },
      { key: 'tipW', label: 'Tip width (mm)', min: 0.6, max: 4, step: 0.05, def: 1, rand: [0.8, 1.8] },
      { key: 'maxW', label: 'Max width (mm)', min: 1, max: 14, step: 0.1, def: 5, rand: [3, 8] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.6, rand: [0.2, 1.2] },
    ],

    generateBoard(p, ctx) {
      const { board: B, points } = ctx;
      const key = JSON.stringify([p, B.w, B.h, points.map((q) => [q.x, q.y])]);
      if (key === memoKey && memoOut) return memoOut;
      const out = grow(p, B, points);
      memoKey = key;
      memoOut = out;
      return out;
    },
  };

  // Closed outline polygon of the bounds, shrunk by `inset` mm; first point is not repeated.
  function outline(p, B, inset) {
    const m = Math.max(0, p.margin) + inset;
    const cx = B.w / 2, cy = B.h / 2, hx = B.w / 2 - m, hy = B.h / 2 - m;
    if (hx < 1 || hy < 1) return null;
    const pts = [];
    if (p.bound === 'ellipse') {
      for (let i = 0; i < 160; i++) { const a = (i / 160) * 2 * Math.PI; pts.push([cx + hx * Math.cos(a), cy + hy * Math.sin(a)]); }
    } else if (p.bound === 'rect') {
      const cr = Math.max(0.5, Math.min(hx, hy, 12 - inset));
      const corners = [[hx - cr, hy - cr, 0], [-(hx - cr), hy - cr, 1], [-(hx - cr), -(hy - cr), 2], [hx - cr, -(hy - cr), 3]];
      for (const [ox, oy, q] of corners)
        for (let i = 0; i <= 10; i++) { const a = (q + i / 10) * Math.PI / 2; pts.push([cx + ox + cr * Math.cos(a), cy + oy + cr * Math.sin(a)]); }
    } else {
      // Ovate leaf: half-width h(t) = H · sin(π t^k)^0.7, widest at t ≈ 0.42 from the base, along the longer axis.
      const vert = B.h >= B.w;
      const half = vert ? hy : hx, Hmax = Math.max(1, Math.min(vert ? hx : hy, (p.leafW * (half + inset)) - inset));
      const k = Math.log(0.5) / Math.log(0.42), n = 90;
      const side = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n, h = Hmax * Math.pow(Math.sin(Math.PI * Math.pow(t, k)), 0.7);
        side.push([h, half - 2 * half * t]); // (across, along) with the base at +half
      }
      const map = (u, v) => (vert ? [cx + u, cy + v] : [cx - v, cy + u]);
      for (let i = 0; i <= n; i++) pts.push(map(side[i][0], side[i][1]));
      for (let i = n - 1; i > 0; i--) pts.push(map(-side[i][0], side[i][1]));
    }
    return pts;
  }

  function inside(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // Closest point on the closed polygon to (x, y): [px, py, dist].
  function nearestOn(poly, x, y) {
    let best = [poly[0][0], poly[0][1], Infinity];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
      const px = a[0] + t * dx, py = a[1] + t * dy, d = Math.hypot(x - px, y - py);
      if (d < best[2]) best = [px, py, d];
    }
    return best;
  }

  function polyLength(poly) {
    let L = 0;
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return L;
  }

  // Point at arc length s around the closed polygon.
  function pointAt(poly, s) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (s <= l) return [a[0] + ((b[0] - a[0]) * s) / (l || 1), a[1] + ((b[1] - a[1]) * s) / (l || 1)];
      s -= l;
    }
    return poly[0].slice();
  }

  function grow(p, B, points) {
    const rand = rng(p.seed * 2654435761 + 13);
    const S = Math.max(3, p.spacing), D = S * STEP, kd = S * KILL, di = S * REACH;
    const tipR = Math.max(MIN_R, p.tipW / 2), maxR = Math.max(tipR, p.maxW / 2);
    const rimR = p.rim > 0 ? Math.max(0.5, p.rim / 2) : 0;
    const out = { strokes: [], blobs: [], count: 0, k: p.fillet || 0.3 };
    const poly = outline(p, B, rimR); // rim centreline / growth boundary
    const inner = outline(p, B, 2 * rimR + Math.max(tipR, S * 0.35)); // sources stay this far inside
    if (!poly || !inner) return out;
    if (rimR) out.strokes.push({ pts: [...poly, poly[0]], r: poly.map(() => rimR).concat(rimR) });

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of inner) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    if (x1 - x0 < 2 * S || y1 - y0 < 2 * S) return out;

    // ---- Sources: dart throwing at least S apart ----
    const sx = [], sy = [];
    {
      const cs = S, gw = Math.ceil((x1 - x0) / cs) + 1, gh = Math.ceil((y1 - y0) / cs) + 1;
      const grid = new Map();
      const tries = Math.ceil(((x1 - x0) * (y1 - y0)) / (S * S)) * 30;
      for (let t = 0; t < tries; t++) {
        const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
        if (!inside(inner, x, y)) continue;
        const ci = Math.floor((x - x0) / cs), cj = Math.floor((y - y0) / cs);
        let ok = true;
        for (let j = Math.max(0, cj - 1); ok && j <= Math.min(gh - 1, cj + 1); j++)
          for (let i = Math.max(0, ci - 1); ok && i <= Math.min(gw - 1, ci + 1); i++)
            for (const s of grid.get(j * gw + i) || []) if (Math.hypot(sx[s] - x, sy[s] - y) < S) { ok = false; break; }
        if (!ok) continue;
        const c = cj * gw + ci;
        if (!grid.has(c)) grid.set(c, []);
        grid.get(c).push(sx.length);
        sx.push(x); sy.push(y);
      }
    }
    const NS = sx.length;
    if (!NS) return out;

    // ---- Vein nodes ----
    const nx = [], ny = [], par = [], kids = [];
    const add = (x, y, pa) => { nx.push(x); ny.push(y); par.push(pa); kids.push([]); if (pa >= 0) kids[pa].push(nx.length - 1); return nx.length - 1; };

    let cx = 0, cy = 0;
    for (const q of poly) { cx += q[0]; cy += q[1]; }
    cx /= poly.length; cy /= poly.length;
    const vert = B.h >= B.w;
    // Base point: the leaf's stalk end, else the middle of the bottom (or left, for wide boards) of the bounds.
    let bx = cx, by = cy;
    if (p.bound === 'leaf') { const q = poly[0]; bx = q[0]; by = q[1]; }
    else if (vert) by = nearestOn(poly, cx, B.h)[1]; else bx = nearestOn(poly, 0, cy)[0];
    const pull = (x, y, d) => { const L = Math.hypot(cx - x, cy - y) || 1; return [x + ((cx - x) * d) / L, y + ((cy - y) * d) / L]; };

    if (p.root === 'centre') add(cx, cy, -1);
    else if (p.root === 'ring' || p.root === 'edge') {
      const n = Math.max(1, Math.min(24, Math.round(p.roots)));
      if (p.root === 'ring') {
        const L = polyLength(poly), off = rand() * L;
        for (let i = 0; i < n; i++) { const q = pointAt(poly, (off + (i * L) / n) % L); const r = pull(q[0], q[1], rimR ? 0 : D); add(r[0], r[1], -1); }
      } else {
        // Evenly across the bounds' bottom (left, for wide boards), dropped onto the rim.
        for (let i = 0; i < n; i++) {
          const f = (i + 0.5) / n;
          const q = vert ? nearestOn(poly, x0 + f * (x1 - x0), B.h) : nearestOn(poly, 0, y0 + f * (y1 - y0));
          if (!nx.some((_, j) => Math.hypot(nx[j] - q[0], ny[j] - q[1]) < S)) add(q[0], q[1], -1);
        }
      }
    } else add(bx, by, -1);

    if (p.midrib && p.root === 'base') {
      // Pre-grown midrib from the base toward the far end, ending 2 spacings short of the rim.
      const tx = vert ? bx : x1, ty = vert ? y0 : by;
      const T = Math.hypot(tx - bx, ty - by) || 1, L = T - S * 0.5;
      let last = nx.length ? nearestNode(bx, by) : -1;
      if (last < 0 || Math.hypot(nx[last] - bx, ny[last] - by) > D) last = add(bx, by, -1);
      for (let s = D; s < L; s += D) last = add(bx + ((tx - bx) * s) / T, by + ((ty - by) * s) / T, last);
    }
    for (const q of points) if (inside(inner, q.x, q.y) && !nx.some((_, j) => Math.hypot(nx[j] - q.x, ny[j] - q.y) < S)) add(q.x, q.y, -1);
    function nearestNode(x, y) { let b = 0, bd = Infinity; for (let j = 0; j < nx.length; j++) { const d = Math.hypot(nx[j] - x, ny[j] - y); if (d < bd) { bd = d; b = j; } } return b; }

    // ---- Source grid (cell = reach) for incremental nearest-node and kill updates ----
    const gw = Math.ceil(B.w / di) + 2, gh = Math.ceil(B.h / di) + 2;
    const cellOf = (x, y) => Math.min(gh - 1, Math.max(0, Math.floor(y / di) + 1)) * gw + Math.min(gw - 1, Math.max(0, Math.floor(x / di) + 1));
    const sgrid = new Map();
    for (let s = 0; s < NS; s++) { const c = cellOf(sx[s], sy[s]); if (!sgrid.has(c)) sgrid.set(c, []); sgrid.get(c).push(s); }
    const alive = new Uint8Array(NS).fill(1);
    const near = new Int32Array(NS).fill(-1), nearD = new Float64Array(NS).fill(Infinity);
    const visitSources = (x, y, fn) => {
      const ci = Math.floor(x / di) + 1, cj = Math.floor(y / di) + 1;
      for (let j = Math.max(0, cj - 1); j <= Math.min(gh - 1, cj + 1); j++)
        for (let i = Math.max(0, ci - 1); i <= Math.min(gw - 1, ci + 1); i++)
          for (const s of sgrid.get(j * gw + i) || []) if (alive[s]) fn(s, Math.hypot(sx[s] - x, sy[s] - y));
    };
    const absorb = (n) => visitSources(nx[n], ny[n], (s, d) => {
      if (d < kd) alive[s] = 0;
      else if (d < di && d < nearD[s]) { nearD[s] = d; near[s] = n; }
    });
    for (let n = 0; n < nx.length; n++) absorb(n);

    // ---- Growth ----
    const wig = Math.max(0, p.wiggle), sw = Math.max(0, p.sweep);
    // Sweep direction: toward the far end for base/edge roots, outward from the centre for centre roots, inward for
    // rim roots, so side veins lean the way they do in a real leaf instead of leaving the midrib square-on.
    const ax = vert ? 0 : 1, ay = vert ? -1 : 0;
    const sweepAt = (x, y) => {
      if (p.root === 'base' || p.root === 'edge') return [ax, ay];
      const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1;
      return p.root === 'ring' ? [-dx / L, -dy / L] : [dx / L, dy / L];
    };
    for (let iter = 0; iter < 2000 && nx.length < MAX_NODES; iter++) {
      const acc = new Map();
      for (let s = 0; s < NS; s++) {
        if (!alive[s] || near[s] < 0) continue;
        const n = near[s], d = nearD[s] || 1;
        const a = acc.get(n) || [0, 0];
        a[0] += (sx[s] - nx[n]) / d; a[1] += (sy[s] - ny[n]) / d;
        acc.set(n, a);
      }
      if (!acc.size) break;
      const born = [];
      for (const [n, a] of acc) {
        let L = Math.hypot(a[0], a[1]);
        if (L < 1e-6) continue;
        const sv = sweepAt(nx[n], ny[n]);
        let ux = a[0] / L + sv[0] * sw, uy = a[1] / L + sv[1] * sw;
        L = Math.hypot(ux, uy);
        if (L < 1e-6) continue;
        ux /= L; uy /= L;
        if (wig) { const t = (rand() - 0.5) * wig * 1.6, c = Math.cos(t), s = Math.sin(t); [ux, uy] = [ux * c - uy * s, ux * s + uy * c]; }
        const x = nx[n] + ux * D, y = ny[n] + uy * D;
        if (kids[n].some((k) => Math.hypot(nx[k] - x, ny[k] - y) < D * 0.5)) continue; // stalled between sources
        born.push(add(x, y, n));
      }
      if (!born.length) break;
      for (const n of born) absorb(n);
    }
    const N = nx.length;

    // ---- Prune short twigs (one pass): drop tip chains shorter than 0.9 spacing ----
    const dead = new Uint8Array(N);
    for (let n = 0; n < N; n++) {
      if (kids[n].length) continue;
      let len = 0, m = n;
      const chain = [];
      while (par[m] >= 0 && kids[par[m]].length === 1) { chain.push(m); len += Math.hypot(nx[m] - nx[par[m]], ny[m] - ny[par[m]]); m = par[m]; }
      if (par[m] < 0) continue; // a whole unbranched root chain stays
      chain.push(m); len += Math.hypot(nx[m] - nx[par[m]], ny[m] - ny[par[m]]);
      if (len < S * 0.9) for (const c of chain) dead[c] = 1;
    }
    const live = (n) => !dead[n];
    const kidsL = kids.map((ks) => ks.filter(live));

    // ---- Pipe-model radii (children always have higher indices than their parent) ----
    const ex = PIPE;
    const rr = new Float64Array(N), acc = new Float64Array(N);
    for (let n = N - 1; n >= 0; n--) {
      if (dead[n]) continue;
      rr[n] = Math.min(maxR, kidsL[n].length ? Math.pow(acc[n], 1 / ex) : tipR);
      if (par[n] >= 0) acc[par[n]] += Math.pow(rr[n], ex);
    }

    // ---- Chains: follow the thickest child; side branches start at their junction ----
    const smooth = (pts) => {
      for (let pass = 0; pass < 4; pass++)
        for (let i = 1, prev = pts[0].slice(); i + 1 < pts.length; i++) {
          const cur = pts[i].slice();
          pts[i] = [0.25 * prev[0] + 0.5 * cur[0] + 0.25 * pts[i + 1][0], 0.25 * prev[1] + 0.5 * cur[1] + 0.25 * pts[i + 1][1]];
          prev = cur;
        }
      return pts;
    };
    const stack = [];
    for (let n = 0; n < N; n++) if (par[n] < 0 && !dead[n]) stack.push([n, -1]);
    while (stack.length) {
      const [start, from] = stack.pop();
      const pts = [], r = [];
      if (from >= 0) { pts.push([nx[from], ny[from]]); r.push(rr[start]); }
      let n = start;
      for (;;) {
        pts.push([nx[n], ny[n]]); r.push(rr[n]);
        const ks = kidsL[n];
        if (!ks.length) break;
        let main = ks[0];
        for (const k of ks) if (rr[k] > rr[main]) main = k;
        for (const k of ks) if (k !== main) stack.push([k, n]);
        n = main;
      }
      if (pts.length === 1) { out.blobs.push({ x: pts[0][0], y: pts[0][1], r: r[0] }); continue; }
      out.strokes.push({ pts: smooth(pts), r });
    }

    // ---- Join tips: bridge each vein end to the nearest unrelated vein, or the rim, within reach ----
    const tips = [];
    for (let n = 0; n < N; n++) if (!dead[n] && !kidsL[n].length && par[n] >= 0) tips.push(n);
    out.count = tips.length;
    if (p.join) {
      const depth = new Int32Array(N);
      for (let n = 0; n < N; n++) depth[n] = par[n] >= 0 ? depth[par[n]] + 1 : 0;
      const rootOf = (n) => { while (par[n] >= 0) n = par[n]; return n; };
      const hops = (a, b) => { // tree distance in nodes, Infinity across different roots
        let h = 0;
        while (depth[a] > depth[b]) { a = par[a]; h++; }
        while (depth[b] > depth[a]) { b = par[b]; h++; }
        while (a !== b) { a = par[a]; b = par[b]; h += 2; if (a < 0 || b < 0) return Infinity; }
        return h;
      };
      // Node grid (cell = spacing) for the nearest-vein query.
      const cs = S, ngw = Math.ceil(B.w / cs) + 2, ngrid = new Map();
      const ncell = (x, y) => (Math.floor(y / cs) + 1) * ngw + Math.floor(x / cs) + 1;
      for (let n = 0; n < N; n++) if (!dead[n]) { const c = ncell(nx[n], ny[n]); if (!ngrid.has(c)) ngrid.set(c, []); ngrid.get(c).push(n); }
      const reach = S * 1.25, minHops = Math.ceil((2.5 * S) / D);
      for (const t of tips) {
        const hx = nx[t] - nx[par[t]], hy = ny[t] - ny[par[t]], hl = Math.hypot(hx, hy) || 1;
        let best = -1, bd = reach;
        const ci = Math.floor(nx[t] / cs) + 1, cj = Math.floor(ny[t] / cs) + 1;
        for (let j = cj - 2; j <= cj + 2; j++)
          for (let i = ci - 2; i <= ci + 2; i++)
            for (const m of ngrid.get(j * ngw + i) || []) {
              const dx = nx[m] - nx[t], dy = ny[m] - ny[t], d = Math.hypot(dx, dy);
              if (d >= bd || d < 1e-6) continue;
              if ((dx * hx + dy * hy) / (d * hl) < -0.2) continue; // don't hook back behind the tip
              if (rootOf(m) === rootOf(t) && hops(m, t) < minHops) continue;
              bd = d; best = m;
            }
        if (best >= 0) { out.strokes.push({ pts: [[nx[t], ny[t]], [nx[best], ny[best]]], r: [tipR, Math.max(tipR, Math.min(rr[best], tipR * 1.4))] }); continue; }
        if (rimR) {
          const q = nearestOn(poly, nx[t], ny[t]);
          if (q[2] < reach + rimR) out.strokes.push({ pts: [[nx[t], ny[t]], [q[0], q[1]]], r: [tipR, tipR] });
        }
      }
    }
    return out;
  }
})();
