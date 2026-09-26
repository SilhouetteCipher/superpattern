// Implicit field: f(p) < 0 inside. Every primitive is an "item": a list of tapered segments
// (round cones; a circle is a zero-length segment). Three groups:
//   union  (items)   exponential smooth-min, order independent -> exact symmetry
//   carve  (cutters) hard-min of cutters, then polynomial smooth-max  f = smax(f, -C, ks)
//   post   (dots)    unioned after carving (polynomial smooth-min with kPost, or hard min)
//   clip             smooth-max with board rectangle
// All operators are 1-Lipschitz, which the contour extractor relies on for skipping.
(function () {
  const SP = (window.SP = window.SP || {});
  const BIG = 1e9;
  const STRIDE = 13; // ax, ay, ux, uy, h, r1, r2, b, a, bbox x0, y0, x1, y1 (incl. radius)

  // Circles [x, y, r] are accepted anywhere an item is expected.
  const asItem = (it) => (typeof it[0] === 'number' ? [[it[0], it[1], it[0], it[1], it[2], it[2]]] : it);

  class Field {
    constructor(scene) {
      if (scene.evalFn) {
        // Generator supplies its own (1-Lipschitz) field.
        const fn = scene.evalFn;
        this.eval = (x, y) => { this.evals++; return fn(x, y); };
        this.evals = 0;
        return;
      }
      this.k = Math.max(scene.k, 1e-3);
      this.ks = Math.max(scene.ks, 1e-4);
      this.kp = Math.max(scene.kPost || 0, 0);
      this.clip = scene.clip;

      const groups = [scene.items, scene.cutters, scene.dots].map((g) => (g || []).map(asItem));
      let nseg = 0;
      for (const g of groups) for (const it of g) nseg += it.length;
      const S = (this.S = new Float64Array(nseg * STRIDE));
      let q = 0;
      // Per group: items are split into chunks of ≤ CHUNK segments, so long strokes (Truchet paths, line
      // bundles) bin locally. Chunk c covers segments start[c]..start[c+1]; owner[c] is its item.
      const CHUNK = 12;
      const pack = (items, expand) => {
        const starts = [], owner = [], cores = [], boxes = [];
        items.forEach((it, i) => {
          for (let c0 = 0; c0 < it.length; c0 += CHUNK) {
            starts.push(q / STRIDE); owner.push(i);
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const [ax, ay, bx, by, r1, r2] of it.slice(c0, c0 + CHUNK)) {
              const dx = bx - ax, dy = by - ay, h = Math.hypot(dx, dy);
              S[q] = ax; S[q + 1] = ay;
              S[q + 2] = h > 1e-9 ? dx / h : 1; S[q + 3] = h > 1e-9 ? dy / h : 0;
              S[q + 4] = h; S[q + 5] = r1; S[q + 6] = r2;
              if (h > 1e-9 && Math.abs(r1 - r2) < h) {
                const b = (r1 - r2) / h;
                S[q + 7] = b; S[q + 8] = Math.sqrt(1 - b * b);
              } else { S[q + 7] = 0; S[q + 8] = -1; } // degenerate: min of end circles
              const r = Math.max(r1, r2);
              S[q + 9] = Math.min(ax, bx) - r; S[q + 10] = Math.min(ay, by) - r; S[q + 11] = Math.max(ax, bx) + r; S[q + 12] = Math.max(ay, by) + r;
              q += STRIDE;
              x0 = Math.min(x0, ax - r, bx - r); y0 = Math.min(y0, ay - r, by - r);
              x1 = Math.max(x1, ax + r, bx + r); y1 = Math.max(y1, ay + r, by + r);
            }
            cores.push(x0, y0, x1, y1);
            boxes.push([x0 - expand, y0 - expand, x1 + expand, y1 + expand]);
          }
        });
        starts.push(q / STRIDE);
        return { start: Int32Array.from(starts), owner: Int32Array.from(owner), core: Float64Array.from(cores), boxes, nItems: items.length };
      };
      this.U = pack(groups[0], 7 * this.k);
      this.Cg = pack(groups[1], 2 * this.ks);
      this.P = pack(groups[2], Math.max(this.k, 2 * this.kp));

      // Spatial bins over the domain.
      const d = scene.domain;
      const span = Math.max(d.x1 - d.x0, d.y1 - d.y0);
      this.bs = Math.max(span / 80, 1.5);
      this.bx0 = d.x0; this.by0 = d.y0;
      this.nbx = Math.ceil((d.x1 - d.x0) / this.bs) + 1;
      this.nby = Math.ceil((d.y1 - d.y0) / this.bs) + 1;
      for (const g of [this.U, this.Cg, this.P]) [g.off, g.idx] = this.bin(g.boxes);
      let maxPer = 1;
      for (let b = 0; b < this.nbx * this.nby; b++) maxPer = Math.max(maxPer, this.U.off[b + 1] - this.U.off[b]);
      this.tmp = new Int32Array(maxPer);
      this.itemBest = new Float64Array(Math.max(1, this.U.nItems));
      this.itemStamp = new Int32Array(Math.max(1, this.U.nItems));
      this.stamp = 0;
      this.evals = 0;
    }

    bin(boxes) {
      const nb = this.nbx * this.nby;
      const lists = Array.from({ length: nb }, () => []);
      boxes.forEach(([x0, y0, x1, y1], i) => {
        const i0 = Math.max(0, Math.floor((x0 - this.bx0) / this.bs)), i1 = Math.min(this.nbx - 1, Math.floor((x1 - this.bx0) / this.bs));
        const j0 = Math.max(0, Math.floor((y0 - this.by0) / this.bs)), j1 = Math.min(this.nby - 1, Math.floor((y1 - this.by0) / this.bs));
        for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) lists[j * this.nbx + k].push(i);
      });
      const off = new Int32Array(nb + 1);
      let n = 0;
      for (let b = 0; b < nb; b++) { off[b] = n; n += lists[b].length; }
      off[nb] = n;
      const idx = new Int32Array(n);
      for (let b = 0; b < nb; b++) idx.set(lists[b], off[b]);
      return [off, idx];
    }

    // Distance to one item (min over its round-cone segments).
    itemDist(g, it, x, y) {
      const S = this.S;
      let d = BIG;
      for (let s = g.start[it], se = g.start[it + 1]; s < se; s++) {
        const o = s * STRIDE;
        // Segment bbox lower bound (radius included): skip segments that cannot beat the current best.
        const bx = S[o + 9] - x > 0 ? S[o + 9] - x : x - S[o + 11] > 0 ? x - S[o + 11] : 0;
        const by = S[o + 10] - y > 0 ? S[o + 10] - y : y - S[o + 12] > 0 ? y - S[o + 12] : 0;
        if ((bx > 0 && bx > d) || (by > 0 && by > d)) continue; // outside the bbox, v ≥ bbox distance > 0
        const px = x - S[o], py = y - S[o + 1];
        const ux = S[o + 2], uy = S[o + 3];
        const h = S[o + 4], r1 = S[o + 5], r2 = S[o + 6];
        const along = px * ux + py * uy;
        let across = px * uy - py * ux;
        if (across < 0) across = -across;
        let v;
        const a = S[o + 8];
        if (a < 0) {
          v = Math.min(Math.hypot(px, py) - r1, Math.hypot(along - h, across) - r2);
        } else {
          const bb = S[o + 7];
          const kk = -bb * across + a * along;
          if (kk < 0) v = Math.hypot(across, along) - r1;
          else if (kk > a * h) v = Math.hypot(across, along - h) - r2;
          else v = across * a + along * bb - r1;
        }
        if (v < d) d = v;
      }
      return d;
    }

    // Hard min over a group's items in bin b, skipping items whose bbox is farther than `best`.
    groupMin(g, b, x, y) {
      let best = BIG;
      const core = g.core;
      for (let q = g.off[b], qe = g.off[b + 1]; q < qe; q++) {
        const it = g.idx[q], c4 = it * 4;
        const bx = core[c4] - x > 0 ? core[c4] - x : x - core[c4 + 2] > 0 ? x - core[c4 + 2] : 0;
        const by = core[c4 + 1] - y > 0 ? core[c4 + 1] - y : y - core[c4 + 3] > 0 ? y - core[c4 + 3] : 0;
        if (bx > best || by > best || (bx > 0 && by > 0 && Math.sqrt(bx * bx + by * by) > best)) continue;
        const d = this.itemDist(g, it, x, y);
        if (d < best) best = d;
      }
      return best;
    }

    eval(x, y) {
      this.evals++;
      let bi = Math.floor((x - this.bx0) / this.bs), bj = Math.floor((y - this.by0) / this.bs);
      if (bi < 0) bi = 0; else if (bi >= this.nbx) bi = this.nbx - 1;
      if (bj < 0) bj = 0; else if (bj >= this.nby) bj = this.nby - 1;
      const b = bj * this.nbx + bi;
      const U = this.U, tmp = this.tmp, k = this.k;

      // Smooth union of items: hard min over each item's chunks, then exponential smooth-min across items.
      let m = BIG, n = 0;
      const core = U.core, cut = 10 * k, best = this.itemBest, stampArr = this.itemStamp, st = ++this.stamp;
      for (let q = U.off[b], qe = U.off[b + 1]; q < qe; q++) {
        const c = U.idx[q];
        // Bounding-box lower bound: skip chunks that cannot contribute (< e^-10).
        const c4 = c * 4;
        const bx = core[c4] - x > 0 ? core[c4] - x : x - core[c4 + 2] > 0 ? x - core[c4 + 2] : 0;
        const by = core[c4 + 1] - y > 0 ? core[c4 + 1] - y : y - core[c4 + 3] > 0 ? y - core[c4 + 3] : 0;
        if (bx > m + cut || by > m + cut || (bx > 0 && by > 0 && Math.sqrt(bx * bx + by * by) > m + cut)) continue;
        const d = this.itemDist(U, c, x, y);
        const it = U.owner[c];
        if (stampArr[it] !== st) { stampArr[it] = st; best[it] = d; tmp[n++] = it; }
        else if (d < best[it]) best[it] = d;
        if (d < m) m = d;
      }
      let f = BIG;
      if (n > 0) {
        let sum = 0;
        for (let i = 0; i < n; i++) { const e = (best[tmp[i]] - m) / k; if (e < 12) sum += Math.exp(-e); }
        f = m - k * Math.log(sum);
      }

      // Carve.
      if (this.Cg.off[b] < this.Cg.off[b + 1]) {
        const c = this.groupMin(this.Cg, b, x, y);
        if (c < BIG) f = smax(f, -c, this.ks);
      }
      // Post union.
      if (this.P.off[b] < this.P.off[b + 1]) {
        const d = this.groupMin(this.P, b, x, y);
        f = this.kp > 0 ? smin(f, d, this.kp) : Math.min(f, d);
      }
      // Clip to board.
      const cl = this.clip;
      if (cl) {
        const cx = (cl.x0 + cl.x1) / 2, cy = (cl.y0 + cl.y1) / 2;
        const qx = Math.abs(x - cx) - (cl.x1 - cl.x0) / 2 + cl.k, qy = Math.abs(y - cy) - (cl.y1 - cl.y0) / 2 + cl.k;
        const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - cl.k;
        f = smax(f, box, cl.k);
      }
      return f;
    }
  }

  function smax(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + h * h * k * 0.25;
  }
  function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  }

  SP.Field = Field;

  // ---- Render modifiers (apply to any generator) ----
  SP.renderSchema = [
    { key: 'outline', label: 'Outline width (mm, 0 = filled)', min: 0, max: 10, step: 0.05, def: 0 },
    { key: 'invert', label: 'Invert (cut pattern from a blank)', type: 'bool', def: false },
    { key: 'blank', label: 'Blank shape', type: 'select', def: 'rect', options: [['rect', 'Rectangle'], ['circle', 'Circle']], show: (r) => r.invert },
    { key: 'blankMargin', label: 'Blank margin (mm)', min: -20, max: 60, step: 0.5, def: 0, show: (r) => r.invert },
    { key: 'blankRound', label: 'Blank corner radius', min: 0, max: 60, step: 0.5, def: 6, show: (r) => r.invert && r.blank === 'rect' },
  ];
  function blankSDF(r, B) {
    const cx = B.w / 2, cy = B.h / 2, m = r.blankMargin;
    if (r.blank === 'circle') { const R = Math.min(B.w, B.h) / 2 - m; return (x, y) => Math.hypot(x - cx, y - cy) - R; }
    const hw = B.w / 2 - m, hh = B.h / 2 - m, rr = Math.min(r.blankRound, hw, hh);
    return (x, y) => {
      const qx = Math.abs(x - cx) - hw + rr, qy = Math.abs(y - cy) - hh + rr;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr;
    };
  }
  // Field with outline / invert applied. Both keep the field 1-Lipschitz.
  // Exact distance to a set of closed polylines (the extracted zero-set), via a uniform bin grid.
  // Returns min(true distance, cell): exact within one cell, a valid lower bound beyond it.
  function polylineDistance(loops, cell) {
    const segs = [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const P of loops) {
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length];
        segs.push(a[0], a[1], b[0], b[1]);
        x0 = Math.min(x0, a[0]); y0 = Math.min(y0, a[1]); x1 = Math.max(x1, a[0]); y1 = Math.max(y1, a[1]);
      }
    }
    if (!segs.length) return () => cell;
    x0 -= cell; y0 -= cell;
    const nx = Math.ceil((x1 - x0) / cell) + 2, ny = Math.ceil((y1 - y0) / cell) + 2;
    const bins = new Map();
    for (let k = 0; k < segs.length; k += 4) {
      // A segment is registered in every bin its bounding box touches.
      const i0 = Math.floor((Math.min(segs[k], segs[k + 2]) - x0) / cell), i1 = Math.floor((Math.max(segs[k], segs[k + 2]) - x0) / cell);
      const j0 = Math.floor((Math.min(segs[k + 1], segs[k + 3]) - y0) / cell), j1 = Math.floor((Math.max(segs[k + 1], segs[k + 3]) - y0) / cell);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const key = j * nx + i; (bins.get(key) || bins.set(key, []).get(key)).push(k); }
    }
    return (x, y) => {
      const bi = Math.floor((x - x0) / cell), bj = Math.floor((y - y0) / cell);
      let best = cell * cell;
      for (let j = bj - 1; j <= bj + 1; j++)
        for (let i = bi - 1; i <= bi + 1; i++) {
          if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
          const L = bins.get(j * nx + i);
          if (!L) continue;
          for (const k of L) {
            const ax = segs[k], ay = segs[k + 1], dx = segs[k + 2] - ax, dy = segs[k + 3] - ay;
            const l2 = dx * dx + dy * dy;
            let t = l2 > 0 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = ax + t * dx - x, ey = ay + t * dy - y, d2 = ex * ex + ey * ey;
            if (d2 < best) best = d2;
          }
        }
      return Math.sqrt(best);
    };
  }

  // Field with outline / invert applied. Both keep the field 1-Lipschitz.
  // Outline: the zero-set is extracted first (projected onto the exact surface), then the outline is the
  // exact distance to that curve, so both edges run precisely parallel to it at any field quality.
  SP.tileSchema = [
    { key: 'on', label: 'Seamless tile', type: 'bool', def: false },
    { key: 'wrapX', label: 'Repeat left ↔ right', type: 'bool', def: true, show: (t) => t.on },
    { key: 'wrapY', label: 'Repeat top ↕ bottom', type: 'bool', def: true, show: (t) => t.on },
  ];

  // Periodic wrapper: content that crosses a wrapped edge is evaluated from the other side.
  function periodic(base, B, T) {
    return (x, y) => {
      let f = base(x, y);
      const sx = T.wrapX ? (x < B.w / 2 ? B.w : -B.w) : 0, sy = T.wrapY ? (y < B.h / 2 ? B.h : -B.h) : 0;
      if (sx) f = Math.min(f, base(x + sx, y));
      if (sy) f = Math.min(f, base(x, y + sy));
      if (sx && sy) f = Math.min(f, base(x + sx, y + sy));
      return f;
    };
  }
  const tileBox = (B) => (x, y) => Math.max(-x, x - B.w, -y, y - B.h); // exact straight cut at the tile edge

  SP.makeField = function (scene, state, opts = {}) {
    const field = new Field(scene);
    const r = state.render || {};
    const w = r.outline > 0 ? r.outline / 2 : 0;
    const T = state.tile && state.tile.on ? state.tile : null;
    if (!w && !r.invert && !T) return field;
    let base = field.eval.bind(field);
    if (T) base = periodic(base, state.board, T);
    const cut = T ? tileBox(state.board) : null;
    const blank = r.invert ? blankSDF(r, state.board) : null;
    let dist = null;
    if (w) {
      const B = state.board;
      const d = T ? { x0: -w * 3 - 2, y0: -w * 3 - 2, x1: B.w + w * 3 + 2, y1: B.h + w * 3 + 2 } : scene.domain, span = Math.max(d.x1 - d.x0, d.y1 - d.y0);
      const h = opts.outlineStep || Math.max(0.06, span / 2400);
      const loops = SP.extractLoops({ eval: base }, d, h, { iters: 3 }).map((l) => l.P);
      dist = polylineDistance(loops, Math.max(w * 2 + 1, h * 8));
    }
    field.eval = (x, y) => {
      let f = w ? dist(x, y) - w : base(x, y);
      if (blank) f = Math.max(-f, blank(x, y));
      if (cut) f = Math.max(f, cut(x, y));
      return f;
    };
    return field;
  };
  SP.renderDomain = function (scene, state) {
    const d = scene.domain, r = state.render || {}, B = state.board;
    if (state.tile && state.tile.on) return { x0: -1, y0: -1, x1: B.w + 1, y1: B.h + 1 };
    const g = (r.outline || 0) + 2;
    let o = { x0: d.x0 - g, y0: d.y0 - g, x1: d.x1 + g, y1: d.y1 + g };
    if (r.invert) o = { x0: Math.min(o.x0, -2), y0: Math.min(o.y0, -2), x1: Math.max(o.x1, B.w + 2), y1: Math.max(o.y1, B.h + 2) };
    return o;
  };
})();
