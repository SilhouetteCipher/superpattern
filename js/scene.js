// Scene assembly: layout instances + attractor field modulation -> world primitives.
(function () {
  const SP = (window.SP = window.SP || {});

  SP.layoutSchema = [
    { key: 'type', label: 'Layout', type: 'select', def: 'single',
      options: [['single', 'Single'], ['hex', 'Hex grid'], ['square', 'Square grid'], ['radial', 'Radial ring']] },
    { key: 'spacing', label: 'Spacing', min: 10, max: 250, step: 0.5, def: 115, rand: [80, 140] },
    { key: 'scale', label: 'Motif scale', min: 0.05, max: 3, step: 0.01, def: 1 },
    { key: 'rotation', label: 'Rotation °', min: -180, max: 180, step: 1, def: 0 },
    { key: 'alternate', label: 'Alternate rotation', type: 'bool', def: false },
    { key: 'ringCount', label: 'Ring count', min: 2, max: 24, step: 1, def: 6, int: true, show: (l) => l.type === 'radial' },
    { key: 'ringRadius', label: 'Ring radius', min: 0, max: 200, step: 0.5, def: 70, show: (l) => l.type === 'radial' },
    { key: 'ringCenter', label: 'Centre motif', type: 'bool', def: true, show: (l) => l.type === 'radial' },
    { key: 'fit', label: 'Edges', type: 'select', def: 'whole', options: [['whole', 'Whole motifs only'], ['clip', 'Clip to board']] },
    { key: 'margin', label: 'Board margin', min: 0, max: 40, step: 0.5, def: 4 },
  ];

  SP.fieldSchema = [
    { key: 'scaleAmt', label: 'Motif scale amount', min: -2, max: 2, step: 0.01, def: 0 },
    { key: 'thickAmt', label: 'Stroke amount', min: -2, max: 2, step: 0.01, def: 0.6 },
    { key: 'dotAmt', label: 'Dot amount', min: -2, max: 2, step: 0.01, def: 0.6 },
    { key: 'gapScales', label: 'Clearance scales with field', type: 'bool', def: false },
    { key: 'minFeature', label: 'Min feature (mm)', min: 0, max: 3, step: 0.01, def: 0.6 },
    { key: 'minIsland', label: 'Drop islands < (mm²)', min: 0, max: 50, step: 0.1, def: 1.5 },
  ];

  SP.pointSchema = [
    { key: 'radius', label: 'Radius', min: 2, max: 400, step: 0.5, def: 90 },
    { key: 'strength', label: 'Strength', min: -1.5, max: 1.5, step: 0.01, def: 0.8 },
    { key: 'falloff', label: 'Falloff', type: 'select', def: 'smooth',
      options: [['smooth', 'Smooth'], ['linear', 'Linear'], ['gauss', 'Gaussian'], ['inverse', 'Inverse square'], ['step', 'Plateau']] },
  ];

  function falloff(kind, u) {
    switch (kind) {
      case 'linear': return u >= 1 ? 0 : 1 - u;
      case 'gauss': return u >= 2 ? 0 : Math.exp(-3 * u * u) * (1 - u / 2) ** 0.25;
      case 'inverse': return u >= 1 ? 0 : (1 / (1 + 8 * u * u) - 1 / 9) / (8 / 9);
      case 'step': { if (u >= 1) return 0; const t = Math.min(1, Math.max(0, (u - 0.6) / 0.4)); return 1 - t * t * (3 - 2 * t); }
      default: { if (u >= 1) return 0; return (1 - u) * (1 - u) * (1 + 2 * u); }
    }
  }
  SP.falloff = falloff;

  // Summed attractor field at a world point.
  SP.fieldAt = function (points, x, y) {
    let v = 0;
    for (const p of points) v += p.strength * falloff(p.falloff, Math.hypot(x - p.x, y - p.y) / Math.max(1e-6, p.radius));
    return v;
  };

  // Gradient coordinate in [-0.5, 0.5] along a direction (deg; 0 = →, 90 = ↑) across a W×H span.
  // On a wrapped (seamless) axis the linear ramp is replaced by a smooth periodic cosine so it repeats.
  SP.gradCoord = function (x, y, deg, cx, cy, W, H, T) {
    const t = (deg * Math.PI) / 180;
    const u = T && T.x ? -0.5 * Math.cos((2 * Math.PI * x) / T.W) : (x - cx) / W;
    const v = T && T.y ? -0.5 * Math.cos((2 * Math.PI * y) / T.H) : (y - cy) / H;
    return u * Math.cos(t) - v * Math.sin(t);
  };

  SP.layoutInstances = function (L, B, nBranches, T) {
    const out = [];
    const rot0 = (L.rotation * Math.PI) / 180;
    const altRot = Math.PI / Math.max(1, nBranches);
    const cx = B.w / 2, cy = B.h / 2;
    if (L.type === 'single') {
      out.push({ x: cx, y: cy, rot: rot0 });
    } else if (L.type === 'square' || L.type === 'hex') {
      let sp = Math.max(1, L.spacing);
      let rowH = L.type === 'hex' ? (sp * Math.sqrt(3)) / 2 : sp;
      if (T) {
        // Seamless tile: snap spacing so a whole number of repeats spans the tile (even counts where
        // alternation or hex row offsets need pairs).
        const even = (n) => Math.max(2, 2 * Math.round(n / 2));
        if (T.x) { const n = Math.max(1, Math.round(B.w / sp)); sp = B.w / (L.alternate && L.type === 'square' ? even(n) : n); }
        if (T.y) { const n = Math.max(1, Math.round(B.h / rowH)); rowH = B.h / (L.type === 'hex' || L.alternate ? even(n) : n); }
      }
      const ny = Math.ceil(B.h / 2 / rowH) + 2, nx = Math.ceil(B.w / 2 / sp) + 2;
      for (let gy = -ny; gy <= ny; gy++)
        for (let gx = -nx; gx <= nx; gx++) {
          const off = L.type === 'hex' && gy & 1 ? 0.5 : 0;
          const alt = L.alternate && (L.type === 'hex' ? gy & 1 : (gx + gy) & 1);
          out.push({ x: cx + (gx + off) * sp, y: cy + gy * rowH, rot: rot0 + (alt ? altRot : 0) });
        }
    } else if (L.type === 'radial') {
      const n = Math.max(1, Math.round(L.ringCount));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        out.push({ x: cx + L.ringRadius * Math.cos(a), y: cy + L.ringRadius * Math.sin(a), rot: rot0 + a + Math.PI / 2 + (L.alternate && i & 1 ? altRot : 0) });
      }
      if (L.ringCenter) out.push({ x: cx, y: cy, rot: rot0 });
    }
    return out;
  };

  // Build world primitives for the field.
  SP.buildScene = function (state) {
    const gen = SP.generators[state.gen];
    const p = state.params, L = state.layout, B = state.board, F = state.field;
    // Seamless tile: field points are copied one tile over in each wrapped direction so the field repeats.
    const T = state.tile && state.tile.on ? { W: B.w, H: B.h, x: !!state.tile.wrapX, y: !!state.tile.wrapY } : null;
    let pts = F.points;
    if (T && pts.length) {
      const out = [];
      for (const q of pts)
        for (const sy of T.y ? [-1, 0, 1] : [0])
          for (const sx of T.x ? [-1, 0, 1] : [0]) out.push(Object.assign({}, q, { x: q.x + sx * B.w, y: q.y + sy * B.h }));
      pts = out;
    }
    const fv = (x, y) => (pts.length ? SP.fieldAt(pts, x, y) : 0);
    const minR = F.minFeature / 2;
    const items = [], cutters = [], dots = [];

    // Board generators fill the whole board themselves and read the field directly.
    if (gen.board) {
      const out = gen.generateBoard(p, { board: B, fieldAt: fv, points: pts, margin: L.margin, tile: T });
      if (out.evalFn) {
        const d = out.domain;
        return { items: [], cutters: [], dots: [], k: 1, ks: 1, clip: null, evalFn: out.evalFn, instances: out.count,
          domain: d, overflow: d.x0 < 0 || d.y0 < 0 || d.x1 > B.w || d.y1 > B.h };
      }
      for (const st of out.strokes) {
        const segs = [];
        for (let i = 0; i + 1 < st.pts.length; i++) {
          const r1 = st.r[i], r2 = st.r[i + 1];
          if (r1 < minR && r2 < minR) continue;
          segs.push([st.pts[i][0], st.pts[i][1], st.pts[i + 1][0], st.pts[i + 1][1], Math.max(r1, minR), Math.max(r2, minR)]);
        }
        if (segs.length) items.push(segs);
      }
      for (const b of out.blobs) if (b.r >= minR) items.push([[b.x, b.y, b.x, b.y, b.r, b.r]]);
      // Optional carve strokes (e.g. over/under gaps) and post strokes (unioned after carving).
      const segsOf = (st) => {
        const segs = [];
        for (let i = 0; i + 1 < st.pts.length; i++) segs.push([st.pts[i][0], st.pts[i][1], st.pts[i + 1][0], st.pts[i + 1][1], st.r[i], st.r[i + 1]]);
        return segs;
      };
      for (const st of out.cuts || []) cutters.push(segsOf(st));
      for (const st of out.post || []) dots.push(segsOf(st));
      const k = out.k ?? (p.fillet || 0.3);
      return finishScene({ items, cutters, dots, k, ks: out.ks ?? 1, kPost: out.kPost || 0, clip: out.clip || null, B, pad: 2 + 4 * k, instances: out.count });
    }

    const motif = gen.generate(p);
    const clip = L.fit === 'clip' || !!T; // tiles keep every instance that touches the tile
    const insts = SP.layoutInstances(L, B, p.branches || 1, T);
    let used = 0;

    for (const inst of insts) {
      const s = L.scale * Math.max(0, 1 + F.scaleAmt * fv(inst.x, inst.y));
      const ext = motif.extent * s;
      if (ext < minR) continue;
      if (L.type !== 'single') {
        if (clip) {
          const mg = T ? 0 : L.margin;
          if (inst.x + ext < mg || inst.x - ext > B.w - mg || inst.y + ext < mg || inst.y - ext > B.h - mg) continue;
        } else if (inst.x - ext < L.margin || inst.x + ext > B.w - L.margin || inst.y - ext < L.margin || inst.y + ext > B.h - L.margin) continue;
      }
      used++;
      const c = Math.cos(inst.rot), sn = Math.sin(inst.rot);
      const tx = (lx, ly) => [inst.x + s * (c * lx - sn * ly), inst.y + s * (sn * lx + c * ly)];
      const thick = (x, y) => (F.thickAmt && pts.length ? Math.max(0, 1 + F.thickAmt * fv(x, y)) : 1);

      for (const st of motif.strokes) {
        const w = st.pts.map((q) => tx(q[0], q[1]));
        const rr = w.map((q, i) => st.r[i] * s * thick(q[0], q[1]));
        const segs = [];
        for (let i = 0; i + 1 < w.length; i++) {
          let r1 = rr[i], r2 = rr[i + 1];
          if (r1 < minR && r2 < minR) continue;
          r1 = Math.max(r1, minR); r2 = Math.max(r2, minR);
          segs.push([w[i][0], w[i][1], w[i + 1][0], w[i + 1][1], r1, r2]);
        }
        if (segs.length) items.push(segs);
      }
      for (const b of motif.blobs) {
        const [x, y] = tx(b.x, b.y);
        const r = b.r * s * thick(x, y);
        if (r >= minR) items.push([[x, y, x, y, r, r]]);
      }
      for (const d of motif.dots) {
        const [x, y] = tx(d.x, d.y);
        const td = F.dotAmt && pts.length ? Math.max(0, 1 + F.dotAmt * fv(x, y)) : 1;
        const r = d.r * s * td;
        const gap = d.gap * (F.gapScales ? s * td : L.scale);
        // Clearance fades out as the dot vanishes so nothing pops.
        const fade = minR > 0 ? Math.min(1, Math.max(0, (r - minR) / (2 * minR))) : 1;
        if (r * fade + gap * fade > 0) cutters.push([x, y, r + gap * fade]);
        if (r >= minR) dots.push([x, y, r]);
      }
      // Carve strokes (e.g. gaps cut through a shape) and post strokes (unioned after carving, e.g. a midrib).
      const strokeItem = (st, rad) => {
        const w = st.pts.map((q) => tx(q[0], q[1]));
        const rr = w.map((q, i) => rad(st.r[i], q));
        const segs = [];
        for (let i = 0; i + 1 < w.length; i++) {
          let r1 = rr[i], r2 = rr[i + 1];
          if (r1 < minR && r2 < minR) continue;
          segs.push([w[i][0], w[i][1], w[i + 1][0], w[i + 1][1], Math.max(r1, minR), Math.max(r2, minR)]);
        }
        return segs;
      };
      for (const st of motif.cuts || []) {
        const segs = strokeItem(st, (r, q) => r * (F.gapScales ? s * thick(q[0], q[1]) : s));
        if (segs.length) cutters.push(segs);
      }
      for (const st of motif.post || []) {
        const segs = strokeItem(st, (r, q) => r * s * thick(q[0], q[1]));
        if (segs.length) dots.push(segs);
      }
    }

    return finishScene({
      items, cutters, dots, B, instances: used, kPost: (motif.kPost || 0) * L.scale,
      k: (p.fillet || 1) * L.scale, ks: (p.carve ?? p.tipRound ?? 1) * L.scale,
      clip: clip && !T ? { x0: L.margin, y0: L.margin, x1: B.w - L.margin, y1: B.h - L.margin, k: 0.4 } : null,
      pad: 2 + 4 * (p.fillet || 1) * L.scale,
    });
  };

  // Contour domain: the board, grown to cover any geometry that overflows it (never cut shapes).
  function finishScene(sc) {
    const { items, dots, B, pad } = sc;
    let bx0 = 0, by0 = 0, bx1 = B.w, by1 = B.h;
    if (!sc.clip) {
      for (const it of items) for (const [ax, ay, bx, by, r1, r2] of it) {
        const r = Math.max(r1, r2);
        bx0 = Math.min(bx0, ax - r, bx - r); by0 = Math.min(by0, ay - r, by - r);
        bx1 = Math.max(bx1, ax + r, bx + r); by1 = Math.max(by1, ay + r, by + r);
      }
      for (const d of dots) {
        const segs = typeof d[0] === 'number' ? [[d[0], d[1], d[0], d[1], d[2], d[2]]] : d;
        for (const [ax, ay, bx, by, r1, r2] of segs) {
          const r = Math.max(r1, r2);
          bx0 = Math.min(bx0, ax - r, bx - r); by0 = Math.min(by0, ay - r, by - r);
          bx1 = Math.max(bx1, ax + r, bx + r); by1 = Math.max(by1, ay + r, by + r);
        }
      }
    }
    return {
      items, cutters: sc.cutters, dots, k: sc.k, ks: sc.ks, kPost: sc.kPost || 0, clip: sc.clip, instances: sc.instances,
      domain: { x0: bx0 - pad, y0: by0 - pad, x1: bx1 + pad, y1: by1 + pad },
      overflow: bx0 < 0 || by0 < 0 || bx1 > B.w || by1 > B.h,
    };
  }
})();
