(function () {
  const SP = window.SP;
  const $ = (id) => document.getElementById(id);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const defaultsOf = (schema) => { const o = {}; for (const s of schema) if (s.key) o[s.key] = s.def; return o; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  // ---------------- State ----------------
  const state = {
    gen: 'molecule',
    params: SP.defaultsFor('molecule'),
    layout: defaultsOf(SP.layoutSchema),
    field: Object.assign(defaultsOf(SP.fieldSchema), { points: [] }),
    board: { w: 200, h: 200 },
    render: defaultsOf(SP.renderSchema),
    tile: defaultsOf(SP.tileSchema),
  };
  const ui = {
    ref: { show: false, opacity: 0.4, w: 220.8, x: 100, y: 100 },
    exp: { mode: 'shapes', tol: 0.004, res: 0.08, dp: 4 },
    showNodes: false, showField: false, refMove: false, selected: -1, showRepeats: true,
  };
  const view = { cx: 100, cy: 100, zoom: 3 };

  const refSchema = [
    { key: 'show', label: 'Show underlay', type: 'bool', def: false },
    { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.01, def: 0.4 },
    { key: 'w', label: 'Width (mm)', min: 10, max: 600, step: 0.1, def: 220.8 },
    { key: 'x', label: 'Centre X', min: -200, max: 600, step: 0.1, def: 100 },
    { key: 'y', label: 'Centre Y', min: -200, max: 600, step: 0.1, def: 100 },
  ];
  const exportSchema = [
    { key: 'mode', label: 'Structure', type: 'select', def: 'shapes',
      options: [['shapes', 'One path per shape'], ['compound', 'Single compound path'], ['separate', 'Every loop separate']] },
    { key: 'tol', label: 'Curve tolerance (mm)', min: 0.001, max: 0.05, step: 0.001, def: 0.004 },
    { key: 'res', label: 'Sampling step (mm)', min: 0.02, max: 0.4, step: 0.01, def: 0.08 },
    { key: 'dp', label: 'Decimals', min: 2, max: 6, step: 1, def: 4, int: true },
  ];

  // ---------------- Presets ----------------
  const P = (over) => Object.assign(SP.defaultsFor('molecule'), over);
  const BUILTIN = [
    { name: 'Molecule', ref: { src: 'ref/molecule.png', w: 220.8, x: 100, y: 100 },
      state: { gen: 'molecule', params: P({}), layout: defaultsOf(SP.layoutSchema), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Molecule field', state: {
      gen: 'molecule', params: P({}), layout: Object.assign(defaultsOf(SP.layoutSchema), { type: 'hex', spacing: 34, scale: 0.29, fit: 'whole' }),
      field: { scaleAmt: 1, thickAmt: 0, dotAmt: 0, points: [{ x: 92, y: 96, radius: 115, strength: -0.8, falloff: 'smooth' }] } } },
    { name: 'Snowflake', state: { gen: 'molecule', params: P({ branches: 6, branchR: 40, arms: 3, spread: 110, armLen: 20, stemLen: 26, stroke: 3.6, bulb: 1.5, dotR: 4.2, dotRing: 44, gap: 3.2, centerDot: true, centerR: 7 }) } },
    { name: 'Swirl', state: { gen: 'molecule', params: P({ branches: 8, branchR: 44, arms: 2, spread: 90, armLen: 22, stemLen: 16, bend: 0.8, twist: 28, stroke: 4, bulb: 1.35, dotR: 5, dotRing: 40, gap: 3.5 }) } },
    { name: 'Tri node', state: { gen: 'molecule', params: P({ branches: 3, branchR: 34, arms: 2, spread: 150, armLen: 30, stemLen: 20, stroke: 6.5, bulb: 1.3, fillet: 2.4, dotR: 9, dotRing: 42, gap: 5 }) } },
    { name: 'Petals', state: { gen: 'molecule', params: P({ branches: 10, branchR: 48, arms: 1, spread: 0, armLen: 18, stemLen: 26, taper: 0.6, stroke: 4.2, bulb: 1.6, fillet: 2, dotR: 4, dotRing: 58, gap: 3, centerDot: true, centerR: 10 }) } },
    { name: 'Lattice', state: {
      gen: 'molecule', params: P({ branches: 4, branchR: 22, arms: 2, spread: 90, armLen: 14, stemLen: 10, stroke: 3.4, bulb: 1.35, fillet: 1.8, dotR: 3.6, dotRing: 25, gap: 2.6 }),
      layout: Object.assign(defaultsOf(SP.layoutSchema), { type: 'square', spacing: 64, scale: 1, alternate: true }),
      field: { scaleAmt: 0, thickAmt: 0.7, dotAmt: 0.7, points: [{ x: 100, y: 100, radius: 120, strength: 0.8, falloff: 'smooth' }] } } },
  ];
  const DG = (over) => Object.assign(SP.defaultsFor('dashgrid'), over);
  BUILTIN.push(
    { name: 'Dash grid', ref: { src: 'ref/dashgrid.png', w: 224.4, x: 61.5, y: 60.5 },
      state: { gen: 'dashgrid', params: DG({}), field: { points: [{ x: 74.2, y: 61.2, radius: 82.7, strength: 0.89, falloff: 'smooth' }] }, board: { w: 120, h: 120 } } },
    { name: 'Dash field', state: { gen: 'dashgrid', params: DG({ cols: 17, rows: 17, pitch: 10, base: 0.15, gradAmt: 0.2, jitter: 0.15, fieldGain: 1.2 }),
      field: { points: [{ x: 70, y: 75, radius: 85, strength: 1, falloff: 'smooth' }, { x: 150, y: 140, radius: 50, strength: 0.7, falloff: 'gauss' }] }, board: { w: 200, h: 200 } } },
    { name: 'Dash square', state: { gen: 'dashgrid', params: DG({ lattice: 'square', cols: 14, rows: 14, pitch: 12, gradAngle: -45, gradAmt: 1.4, bias: 0.5, dotMax: 0.38, dashMax: 0.4, crossT: 1.05 }), field: { points: [] }, board: { w: 200, h: 200 } } },
  );
  const TU = (over) => Object.assign(SP.defaultsFor('turing'), over);
  BUILTIN.push(
    { name: 'Turing', state: { gen: 'turing', params: TU({}), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Turing fine', state: { gen: 'turing', params: TU({ wavelength: 12, seed: 11 }), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Turing flow', state: { gen: 'turing', params: TU({ shape: 'hex', aniso: 0.6, flowAngle: 30, seed: 5, cellSize: 170 }), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Turing field', state: { gen: 'turing', params: TU({ shape: 'board', wavelength: 11, seed: 21, fieldThick: 0.6, fieldBias: 1.2 }),
      field: { points: [{ x: 70, y: 70, radius: 90, strength: 0.9, falloff: 'smooth' }, { x: 145, y: 145, radius: 60, strength: -0.6, falloff: 'smooth' }] }, board: { w: 200, h: 200 } } },
  );
  const MA = (over) => Object.assign(SP.defaultsFor('marble'), over);
  BUILTIN.push(
    { name: 'Marble', state: { gen: 'marble', params: MA({}), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Marble fine', state: { gen: 'marble', params: MA({ spacing: 9, warp: 30, warpScale: 120, seed: 4 }), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Marble board', state: { gen: 'marble', params: MA({ shape: 'board', spacing: 11, warp: 55, warpScale: 170, seed: 14 }), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Marble vortex', state: { gen: 'marble', params: MA({ seed: 14, fieldWarp: 2.2, fieldThick: 0.2 }),
      field: { points: [{ x: 100, y: 100, radius: 70, strength: 1, falloff: 'smooth' }] }, board: { w: 200, h: 200 } } },
  );
  const DT = (over) => Object.assign(SP.defaultsFor('dotgrid'), over);
  BUILTIN.push(
    { name: 'Dot grid', state: { gen: 'dotgrid', params: DT({}), field: { points: [{ x: 145, y: 145, radius: 80, strength: 1, falloff: 'smooth' }] }, board: { w: 200, h: 200 } } },
    { name: 'Dot field', state: { gen: 'dotgrid', params: DT({ cols: 18, rows: 18, pitch: 10, depth: 0, gather: 0.55, stretch: 0.6, shrink: 0.15, pull: 0 }),
      field: { points: [{ x: 128, y: 120, radius: 75, strength: 1, falloff: 'smooth' }, { x: 55, y: 60, radius: 45, strength: 0.8, falloff: 'gauss' }] }, board: { w: 200, h: 200 } } },
    { name: 'Dot bloom', state: { gen: 'dotgrid', params: DT({ lattice: 'hex', cols: 13, rows: 15, pitch: 12, gain: -0.8, shrink: 0.6, stretch: 0.8, subdiv: 3, merge: 0 }),
      field: { points: [{ x: 100, y: 100, radius: 85, strength: 1, falloff: 'smooth' }] }, board: { w: 200, h: 200 } } },
  );
  const TR = (over) => Object.assign(SP.defaultsFor('truchet'), over);
  BUILTIN.push(
    { name: 'Truchet path', state: { gen: 'truchet', params: TR({ seed: 234, flip: 0.1 }), field: { points: [] }, board: { w: 150, h: 200 } } },
    { name: 'Truchet weave', state: { gen: 'truchet', params: TR({ pattern: 'random', cols: 10, rows: 10, select: 'all', width: 0.2, seed: 7 }), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Truchet tracks', state: { gen: 'truchet', params: TR({ pattern: 'random', cols: 7, rows: 7, select: 'all', width: 0.3, tracks: 3, trackGap: 0.13, seed: 21 }), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Truchet circles', state: { gen: 'truchet', params: TR({ pattern: 'checker', flip: 0.18, cols: 9, rows: 9, select: 'all', width: 0.26, seed: 5 }), field: { points: [] }, board: { w: 200, h: 200 } } },
    { name: 'Truchet field', state: { gen: 'truchet', params: TR({ pattern: 'random', cols: 12, rows: 12, select: 'all', width: 0.18, fieldWidth: 1.2, seed: 12 }),
      field: { points: [{ x: 100, y: 100, radius: 90, strength: 1, falloff: 'smooth' }] }, board: { w: 200, h: 200 } } },
  );
  BUILTIN.push(
    { name: 'Truchet → grid', state: { gen: 'truchet', params: TR({ pattern: 'random', cols: 14, rows: 14, select: 'all', width: 0.22, fieldMorph: 1.5, morphSharp: 3, seed: 8 }),
      field: { points: [{ x: 125, y: 90, radius: 85, strength: 1, falloff: 'smooth' }] }, board: { w: 200, h: 200 } } },
    { name: 'Halftone G', state: { gen: 'halftone', params: Object.assign(SP.defaultsFor('halftone'), {}), field: { points: [], minIsland: 0.3 }, board: { w: 140, h: 200 } } },
    { name: 'Halftone word', state: { gen: 'halftone', params: Object.assign(SP.defaultsFor('halftone'), { text: 'Aa', size: 0.7, offY: 0.1, cols: 34, lattice: 'hex', diffAngle: 0, diffStart: -0.2, streak: 0.3 }), field: { points: [], minIsland: 0.3 } } },
    { name: 'Tile twist', state: { gen: 'tilegrid', params: Object.assign(SP.defaultsFor('tilegrid'), { rotGrad: 0, fieldRot: 90, fieldScale: -0.4 }),
      field: { points: [{ x: 100, y: 100, radius: 90, strength: 1, falloff: 'smooth' }] } } },
    { name: 'Hex rhythm', state: { gen: 'tilegrid', params: Object.assign(SP.defaultsFor('tilegrid'), { shape: 'poly', sides: 6, cols: 10, rows: 10, size: 0.8, rotGrad: 30, scaleGrad: -0.8, scaleAngle: 90 }) } },
    { name: 'Shape tiles fine', state: { gen: 'shapetiles', params: Object.assign(SP.defaultsFor('shapetiles'), { cols: 8, rows: 8, gap: 1.6, round: 1.2, seed: 7 }) } },
  );
  // Seamless tiles for lampshades and repeats (board = unwrapped cylinder: circumference × height).
  const TILE = { on: true, wrapX: true, wrapY: true };
  const SHADE = { w: 377, h: 160 }; // Ø120 mm × 160 mm drum
  const TP = (name, gen, params, extra = {}) => ({
    name, group: 'Tiling',
    state: { gen, params: Object.assign(SP.defaultsFor(gen), params), layout: Object.assign(defaultsOf(SP.layoutSchema), extra.layout || {}),
      field: Object.assign({ points: [] }, extra.field || {}), board: extra.board || SHADE, tile: Object.assign({}, TILE, extra.tile || {}), render: extra.render || {} },
  });
  BUILTIN.push(
    TP('Truchet wrap', 'truchet', { pattern: 'random', cols: 28, select: 'all', width: 0.24, seed: 4 }),
    TP('Truchet → grid band', 'truchet', { pattern: 'random', cols: 30, select: 'all', width: 0.3, widthGrad: 0.4, widthAngle: -90, morph: 0.5, morphGrad: 2.5, morphAngle: 90, morphSharp: 4, seed: 12 }, { tile: { wrapY: false } }),
    TP('Truchet bands wrap', 'truchet', { pattern: 'random', cols: 16, select: 'all', width: 0.3, tracks: 2, trackGap: 0.333, vdot: 0.09, vdotWhere: 'free', seed: 26 }),
    TP('Turing wrap', 'turing', { wavelength: 13, seed: 5 }),
    TP('Turing flow wrap', 'turing', { wavelength: 11, aniso: 0.8, seed: 9 }),
    TP('Marble wrap', 'marble', { spacing: 13, warp: 40, warpScale: 110, angle: 90, seed: 3 }),
    TP('Op wave wrap', 'opart', { spacing: 10, angle: 90, waveAmp: 7, waveLen: 75, warp: 10, warpScale: 90 }),
    TP('Voronoi wrap', 'voronoi', { cell: 30, gap: 2.4, round: 5, seed: 4 }),
    TP('Dot fisheye wrap', 'dotgrid', { cols: 34, pitch: 11, depth: 0, gather: 0.55, stretch: 0.6, shrink: 0.15, pull: 0 },
      { field: { points: [{ x: 90, y: 80, radius: 55, strength: 1, falloff: 'smooth' }, { x: 280, y: 60, radius: 45, strength: 0.8, falloff: 'smooth' }] } }),
    TP('Shape tiles wrap', 'shapetiles', { cols: 14, gap: 2.2, seed: 9 }),
    TP('Rotating squares wrap', 'tilegrid', { cols: 30, size: 0.66, rotGrad: 90, rotAngle: 0 }),
    TP('Rhythm wrap', 'tilegrid', { cols: 16, shape: 'bar', aspect: 0.12, size: 0.8, round: 0, rotGrad: 0, rotRandom: 180, rotStep: 45, seed: 31 }),
    TP('Glyph band', 'glyphs', { tilesX: 9, tilesY: 3, sub: 3, tileGap: 9, dotR: 0.4, bridge: 0.55, fillet: 1.5, seed: 8 }),
    TP('Molecule lattice', 'molecule', {}, { layout: { type: 'hex', spacing: 60, scale: 0.42 } }),
  );
  if (SP.pinPresets) BUILTIN.push(...SP.pinPresets);
  const loadUserPresets = () => { try { return JSON.parse(localStorage.getItem('sp.presets') || '[]'); } catch { return []; } };
  const saveUserPresets = (list) => { try { localStorage.setItem('sp.presets', JSON.stringify(list)); } catch {} };
  let activePreset = 'Molecule';

  // ---------------- Canvas ----------------
  const canvas = $('view');
  const ctx = canvas.getContext('2d');
  let dpr = 1, cw = 1, ch = 1;
  const refImg = new Image();
  let refLoaded = false;
  refImg.onload = () => { refLoaded = true; SP.refImage = refImg; if (state.gen === 'halftone' && state.params.source === 'image') invalidate(false); redraw(); };
  refImg.src = 'ref/molecule.png';

  let contours = [], path = null, lastStats = '', scene = null, draftDiv = 300;
  let fieldCanvas = null, fieldDirty = true;

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cw = r.width; ch = r.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    if (!view.userMoved) fitView();
    redraw();
  }
  function fitView() {
    const { w, h } = state.board;
    view.zoom = Math.max(0.2, Math.min(cw / (w * 1.18), Math.max(ch * 0.5, ch - 90) / (h * 1.18)));
    view.userMoved = false;
    view.cx = w / 2; view.cy = h / 2;
    redraw();
  }
  const toScreen = (x, y) => [(x - view.cx) * view.zoom + cw / 2, (y - view.cy) * view.zoom + ch / 2];
  const toWorld = (sx, sy) => [(sx - cw / 2) / view.zoom + view.cx, (sy - ch / 2) / view.zoom + view.cy];

  // ---------------- Compute ----------------
  function compute(draft) {
    const t0 = performance.now();
    scene = SP.buildScene(state);
    const field = SP.makeField(scene, state, draft ? { outlineStep: Math.max(state.board.w, state.board.h) / 700 } : {});
    const span = Math.max(state.board.w, state.board.h);
    const h = span / (draft ? draftDiv : 640);
    contours = SP.contour(field, SP.renderDomain(scene, state), h, h * (draft ? 0.12 : 0.03), { iters: 2, fast: draft, minArea: state.field.minIsland || 0 });
    path = new Path2D();
    let nseg = 0;
    for (const c of contours) {
      const s = c.segs;
      path.moveTo(s[0][0][0], s[0][0][1]);
      for (const [, a, b, p] of s) path.bezierCurveTo(a[0], a[1], b[0], b[1], p[0], p[1]);
      path.closePath();
      nseg += s.length;
    }
    const ms = performance.now() - t0;
    // Adaptive draft resolution: keep interactive frames around ~35 ms.
    if (draft) draftDiv = Math.min(360, Math.max(120, draftDiv * Math.min(1.25, Math.max(0.7, Math.sqrt(35 / Math.max(ms, 1))))));
    const shapes = contours.filter((c) => c.area > 0).length;
    lastStats = `${shapes} shapes · ${contours.length} loops · ${nseg} curves · ${scene.instances} ${SP.generators[state.gen].board ? 'sites' : 'motifs'} · ${ms.toFixed(0)} ms${draft ? ' · draft' : ''}`;
    $('stats').textContent = lastStats;
  }

  function buildFieldCanvas() {
    fieldDirty = false;
    const pts = state.field.points;
    if (!pts.length) { fieldCanvas = null; return; }
    const { w, h } = state.board;
    const res = 180;
    const W = Math.round(res * Math.min(1, w / h)) || 1, H = Math.round(res * Math.min(1, h / w)) || 1;
    fieldCanvas = fieldCanvas && fieldCanvas.width === W && fieldCanvas.height === H ? fieldCanvas : Object.assign(document.createElement('canvas'), { width: W, height: H });
    const fc = fieldCanvas.getContext('2d');
    const img = fc.createImageData(W, H);
    for (let j = 0; j < H; j++)
      for (let i = 0; i < W; i++) {
        const v = SP.fieldAt(pts, ((i + 0.5) / W) * w, ((j + 0.5) / H) * h);
        const o = (j * W + i) * 4;
        const a = Math.min(1, Math.abs(v));
        const band = Math.abs(((v * 8) % 1 + 1) % 1 - 0.5) < 0.04 ? 0.35 : 0;
        if (v >= 0) { img.data[o] = 255; img.data[o + 1] = 106; img.data[o + 2] = 61; }
        else { img.data[o] = 70; img.data[o + 1] = 140; img.data[o + 2] = 255; }
        img.data[o + 3] = Math.round((a * 0.45 + band * Math.min(1, a * 4)) * 255);
      }
    fc.putImageData(img, 0, 0);
  }

  // ---------------- Draw ----------------
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const { w, h } = state.board;
    const z = view.zoom;

    ctx.save();
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cw / 2 - view.cx * z), dpr * (ch / 2 - view.cy * z));
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 40 * dpr;
    ctx.shadowOffsetY = 10 * dpr;
    ctx.fillStyle = '#f3f0e9';
    ctx.fillRect(0, 0, w, h);
    ctx.shadowColor = 'transparent';

    const refOn = ui.ref.show && refLoaded;
    if (refOn) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      ctx.globalAlpha = ui.ref.opacity;
      const rh = (ui.ref.w * refImg.naturalHeight) / refImg.naturalWidth;
      ctx.drawImage(refImg, ui.ref.x - ui.ref.w / 2, ui.ref.y - rh / 2, ui.ref.w, rh);
      ctx.restore();
    }
    if (ui.showField && state.field.points.length) {
      if (fieldDirty) buildFieldCanvas();
      if (fieldCanvas) { ctx.imageSmoothingEnabled = true; ctx.drawImage(fieldCanvas, 0, 0, w, h); }
    }
    if (path && state.tile.on && ui.showRepeats) {
      // Neighbouring repeats, dimmed, so seams can be checked by eye.
      const sx = state.tile.wrapX ? [-1, 0, 1] : [0], sy = state.tile.wrapY ? [-1, 0, 1] : [0];
      for (const j of sy) for (const i of sx) {
        if (!i && !j) continue;
        ctx.save(); ctx.translate(i * w, j * h);
        ctx.fillStyle = 'rgba(243,240,233,0.55)'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(23,23,27,0.45)'; ctx.fill(path, 'evenodd');
        ctx.restore();
      }
    }
    if (path) {
      ctx.fillStyle = refOn ? 'rgba(232, 72, 36, 0.62)' : '#17171b';
      ctx.fill(path, 'evenodd');
    }
    if (state.tile.on) {
      ctx.strokeStyle = 'rgba(255,106,61,0.8)'; ctx.lineWidth = 1.5 / z; ctx.setLineDash([6 / z, 4 / z]);
      ctx.strokeRect(0, 0, w, h); ctx.setLineDash([]);
    }
    // margin guide
    if (state.layout.type !== 'single' && state.layout.margin > 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1 / z;
      ctx.setLineDash([4 / z, 4 / z]);
      const m = state.layout.margin;
      ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
      ctx.setLineDash([]);
    }
    ctx.restore();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ui.showNodes) drawNodes();
    drawPoints();
  }

  function drawNodes() {
    ctx.lineWidth = 1;
    const showHandles = view.zoom > 5;
    for (const c of contours) {
      for (const [p0, a, b, p3] of c.segs) {
        const s0 = toScreen(p0[0], p0[1]);
        if (showHandles) {
          const sa = toScreen(a[0], a[1]), sb = toScreen(b[0], b[1]), s3 = toScreen(p3[0], p3[1]);
          ctx.strokeStyle = 'rgba(60,140,255,0.55)';
          ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(sa[0], sa[1]); ctx.moveTo(s3[0], s3[1]); ctx.lineTo(sb[0], sb[1]); ctx.stroke();
          ctx.fillStyle = 'rgba(60,140,255,0.9)';
          ctx.beginPath(); ctx.arc(sa[0], sa[1], 1.8, 0, 7); ctx.arc(sb[0], sb[1], 1.8, 0, 7); ctx.fill();
        }
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#2f7bff';
        ctx.fillRect(s0[0] - 2.5, s0[1] - 2.5, 5, 5);
        ctx.strokeRect(s0[0] - 2.5, s0[1] - 2.5, 5, 5);
      }
    }
  }

  function drawPoints() {
    const pts = state.field.points;
    pts.forEach((p, i) => {
      const [sx, sy] = toScreen(p.x, p.y);
      const col = p.strength >= 0 ? '255,106,61' : '70,140,255';
      const sel = i === ui.selected;
      const rr = p.radius * view.zoom;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(1, rr));
      g.addColorStop(0, `rgba(${col},${sel ? 0.16 : 0.09})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, rr), 0, Math.PI * 2); ctx.fill();
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = sel ? 1.5 : 1;
      ctx.strokeStyle = `rgba(${col},${sel ? 0.95 : 0.5})`;
      ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, rr), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // strength arc
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.beginPath(); ctx.arc(sx, sy, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, Math.abs(p.strength) / 1.5)); ctx.stroke();
      ctx.fillStyle = `rgb(${col})`;
      ctx.strokeStyle = sel ? '#fff' : 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (sel) {
        // radius grip
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(sx + rr, sy, 4.5, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // ---------------- Scheduling ----------------
  let raf = 0, dirty = true, draftMode = false, fullTimer = 0;
  function frame() {
    raf = 0;
    if (dirty) { dirty = false; compute(draftMode); }
    draw();
  }
  function redraw() { if (!raf) raf = requestAnimationFrame(frame); }
  function invalidate(draft) {
    if (draft) lastInteract = performance.now();
    dirty = true;
    draftMode = !!draft;
    fieldDirty = true;
    clearTimeout(fullTimer);
    if (draft) fullTimer = setTimeout(() => invalidate(false), 180);
    redraw();
  }

  // ---------------- History ----------------
  const snap = () => JSON.stringify({ gen: state.gen, params: state.params, layout: state.layout, field: state.field, board: state.board, render: state.render, tile: state.tile });
  let hist = [], hi = -1;
  function commit() {
    const s = snap();
    if (hist[hi] === s) return;
    hist = hist.slice(0, hi + 1);
    hist.push(s);
    if (hist.length > 200) hist.shift();
    hi = hist.length - 1;
  }
  function restore(s) {
    const o = JSON.parse(s);
    if (o.gen && !SP.generators[o.gen]) return;
    Object.assign(state, o);
    state.render = Object.assign(defaultsOf(SP.renderSchema), o.render || {});
    state.tile = Object.assign(defaultsOf(SP.tileSchema), o.tile || {});
    if (ui.selected >= state.field.points.length) ui.selected = -1;
    refreshAll();
    invalidate(false);
  }
  const undo = () => { if (hi > 0) restore(hist[--hi]); };
  const redo = () => { if (hi < hist.length - 1) restore(hist[++hi]); };

  // ---------------- Tween ----------------
  let tween = null;
  function tweenTo(target, ms = 700) {
    // target: { params?, layout?, field?, board? } — numeric values glide, others switch instantly.
    const from = clone({ params: state.params, layout: state.layout, field: state.field });
    const to = {
      params: Object.assign({}, state.params, target.params || {}),
      layout: Object.assign({}, state.layout, target.layout || {}),
      field: Object.assign({}, state.field, target.field || {}),
    };
    if (target.field && target.field.points) { state.field.points = clone(target.field.points); ui.selected = -1; }
    if (target.board) Object.assign(state.board, target.board);
    for (const sec of ['params', 'layout', 'field'])
      for (const k in to[sec]) if (typeof to[sec][k] !== 'number' && k !== 'points') state[sec][k] = to[sec][k];
    if (SP.generators[state.gen].noTween) ms = 0;
    const intKeys = new Set(SP.generators[state.gen].schema.filter((x) => x.int).map((x) => x.key));
    const t0 = performance.now();
    if (tween) cancelAnimationFrame(tween);
    const step = () => {
      const t = ms > 0 ? Math.min(1, (performance.now() - t0) / ms) : 1;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      for (const sec of ['params', 'layout', 'field'])
        for (const k in to[sec]) {
          if (typeof to[sec][k] !== 'number' || typeof from[sec][k] !== 'number') continue;
          const v = from[sec][k] + (to[sec][k] - from[sec][k]) * e;
          state[sec][k] = sec === 'params' && intKeys.has(k) ? Math.round(v) : v;
        }
      refreshControls();
      if (t < 1) { invalidate(true); tween = requestAnimationFrame(step); }
      else { tween = null; for (const sec of ['params', 'layout', 'field']) for (const k in to[sec]) if (k !== 'points') state[sec][k] = to[sec][k]; refreshAll(); invalidate(false); commit(); }
    };
    tween = requestAnimationFrame(step);
  }

  function randomParams() {
    const p = {};
    p.branches = pick([3, 4, 5, 6, 6, 6, 7, 8, 8, 10, 12]);
    p.stroke = rnd(3, 6.2);
    p.branchR = rnd(26, 55);
    p.arms = pick([1, 2, 2, 2, 3]);
    p.spread = p.arms === 1 ? 0 : rnd(60, 165);
    p.armLen = rnd(10, 30);
    p.stemLen = chance(0.2) ? 0 : rnd(6, p.branchR * 0.65);
    p.bend = chance(0.45) ? rnd(-0.8, 0.8) : 0;
    p.twist = chance(0.3) ? rnd(-40, 40) : 0;
    p.alt = chance(0.2) ? rnd(-0.4, 0.4) : 0;
    p.taper = rnd(-0.3, 0.45);
    p.bulb = rnd(1.05, 1.65);
    p.fillet = rnd(0.8, 2.6);
    p.dots = chance(0.85);
    p.dotR = p.stroke * rnd(0.8, 1.4);
    p.dotRing = p.branchR * rnd(0.72, 1.12);
    p.dotPhase = chance(0.8) ? 0.5 : rnd(0, 1);
    p.gap = rnd(2.5, 6);
    p.carve = rnd(0.6, 2);
    p.centerDot = chance(0.3);
    p.centerR = rnd(4, 11);
    return p;
  }
  function randomFromSchema(schema) {
    const p = {};
    for (const sc of schema) {
      if (!sc.key) continue;
      if (sc.rand) { const v = rnd(sc.rand[0], sc.rand[1]); p[sc.key] = sc.int ? Math.round(v) : v; }
      else if (sc.type === 'select' && sc.randomize !== false && chance(0.25)) p[sc.key] = pick(sc.options)[0];
    }
    return p;
  }
  function randomize() {
    activePreset = null; renderPresets();
    const g = SP.generators[state.gen];
    tweenTo({ params: state.gen === 'molecule' ? randomParams() : g.randomize ? g.randomize() : randomFromSchema(g.schema) });
  }
  function mutate() {
    const schema = SP.generators[state.gen].schema;
    const p = {};
    for (const s of schema) {
      if (!s.key || s.int || s.type) continue;
      const span = s.rand ? s.rand[1] - s.rand[0] : s.max - s.min;
      const cur = state.params[s.key];
      if (s.key === 'bend' || s.key === 'twist' || s.key === 'alt') { if (cur === 0 && !chance(0.15)) continue; }
      p[s.key] = Math.min(s.max, Math.max(s.min, cur + (Math.random() - 0.5) * 0.18 * span));
    }
    activePreset = null; renderPresets();
    tweenTo({ params: p }, 450);
  }

  // ---------------- Panel ----------------
  let motifCtl, layoutCtl, fieldCtl, refCtl, expCtl, pointCtl, renderCtl, tileCtl;
  function onParam(sec) {
    return (k, v, final) => {
      state[sec][k] = v;
      if (sec === 'layout' && k === 'type') layoutCtl.refresh();
      invalidate(!final);
      if (final) commit();
    };
  }
  function buildPanel() {
    const gs = $('genSelect');
    gs.innerHTML = '';
    for (const id in SP.generators) gs.appendChild(Object.assign(SP.el('option', null, SP.generators[id].name), { value: id }));
    gs.value = state.gen;
    gs.onchange = () => { state.gen = gs.value; state.params = SP.defaultsFor(state.gen); buildPanel(); invalidate(false); commit(); };
    motifCtl = SP.buildControls($('motifControls'), SP.generators[state.gen].schema, () => state.params, onParam('params'));
    const isBoard = !!SP.generators[state.gen].board;
    layoutCtl = SP.buildControls($('layoutControls'), isBoard ? [] : SP.layoutSchema, () => state.layout, onParam('layout'));
    fieldCtl = SP.buildControls($('fieldControls'), isBoard ? SP.fieldSchema.filter((f) => f.key === 'minFeature' || f.key === 'minIsland') : SP.fieldSchema, () => state.field, onParam('field'));
    tileCtl = SP.buildControls($('tileControls'), SP.tileSchema, () => state.tile, (k, v, final) => {
      state.tile[k] = v; tileCtl.refresh(); invalidate(!final); if (final) commit(); redraw();
    });
    const tileable = !!SP.generators[state.gen].tileable || !SP.generators[state.gen].board;
    $('tileNote').textContent = tileable ? '' : `${SP.generators[state.gen].name} doesn't have a seamless mode — its composition isn't periodic.`;
    renderCtl = SP.buildControls($('renderControls'), SP.renderSchema, () => state.render, (k, v, final) => {
      state.render[k] = v; renderCtl.refresh(); invalidate(!final); if (final) commit();
    });
    refCtl = SP.buildControls($('refControls'), refSchema, () => ui.ref, (k, v) => { ui.ref[k] = v; $('btnRef').classList.toggle('on', ui.ref.show); redraw(); });
    expCtl = SP.buildControls($('exportControls'), exportSchema, () => ui.exp, (k, v) => { ui.exp[k] = v; });
    $('boardW').value = state.board.w; $('boardH').value = state.board.h;
    renderPoints();
    renderPresets();
  }
  function refreshControls() { motifCtl.refresh(); layoutCtl.refresh(); fieldCtl.refresh(); if (renderCtl) renderCtl.refresh(); if (tileCtl) tileCtl.refresh(); }
  function refreshAll() {
    if ($('genSelect').value !== state.gen) return buildPanel();
    refreshControls();
    $('boardW').value = +state.board.w.toFixed(2); $('boardH').value = +state.board.h.toFixed(2);
    renderPoints();
  }

  function renderPoints() {
    const chips = $('pointChips');
    chips.innerHTML = '';
    const pts = state.field.points;
    if (!pts.length) chips.appendChild(SP.el('div', 'empty', 'No points yet — double-click the board to drop one.'));
    pts.forEach((p, i) => {
      const c = SP.el('span', 'chip' + (i === ui.selected ? ' on' : ''), `<span class="swatch" style="background:${p.strength >= 0 ? 'var(--accent)' : '#468cff'}"></span>P${i + 1}<span class="x" title="Delete">✕</span>`);
      c.onclick = (e) => {
        if (e.target.classList.contains('x')) { deletePoint(i); return; }
        ui.selected = i; renderPoints(); redraw();
      };
      chips.appendChild(c);
    });
    const ed = $('pointEditor');
    ed.innerHTML = '';
    pointCtl = null;
    if (ui.selected >= 0 && pts[ui.selected]) {
      const card = SP.el('div', 'point-card');
      ed.appendChild(card);
      pointCtl = SP.buildControls(card, SP.pointSchema, () => state.field.points[ui.selected], (k, v, final) => {
        state.field.points[ui.selected][k] = v;
        if (k === 'strength') renderPointChipsOnly();
        invalidate(!final);
        if (final) commit();
      });
    }
  }
  function renderPointChipsOnly() {
    const sw = $('pointChips').querySelectorAll('.swatch');
    state.field.points.forEach((p, i) => { if (sw[i]) sw[i].style.background = p.strength >= 0 ? 'var(--accent)' : '#468cff'; });
  }
  function addPoint(x, y) {
    const r = Math.max(state.board.w, state.board.h) * 0.4;
    state.field.points.push({ x, y, radius: r, strength: 0.8, falloff: 'smooth' });
    ui.selected = state.field.points.length - 1;
    renderPoints();
    invalidate(false);
    commit();
  }
  function deletePoint(i) {
    state.field.points.splice(i, 1);
    ui.selected = -1;
    renderPoints();
    invalidate(false);
    commit();
  }

  // ---------------- Library (tabs · generators · preset cards) ----------------
  const FAMILIES = [
    { id: 'organic', name: 'Organic', gens: ['turing', 'marble', 'voronoi'] },
    { id: 'geometric', name: 'Geometric', gens: ['molecule', 'carved', 'polyring', 'rays', 'spokes', 'trigrid', 'knots'] },
    { id: 'grids', name: 'Grids', gens: ['dotgrid', 'halftone', 'tilegrid', 'shapetiles', 'quadgrid', 'capsules', 'dashgrid', 'glyphs'] },
    { id: 'lines', name: 'Lines', gens: ['truchet', 'paths', 'opart', 'hatch'] },
    { id: 'tiling', name: 'Tiling' },
    { id: 'board', name: 'Board' },
    { id: 'saved', name: 'Saved' },
  ];
  const GEN_DESC = {
    turing: 'Reaction–diffusion labyrinths', marble: 'Flowing warped bands', voronoi: 'Rounded cells',
    molecule: 'Rosettes of blended arms and dots', carved: 'Shapes split by curved cuts', polyring: 'Rings of polygons', rays: 'Radial bars and fans',
    dotgrid: 'Dots squeezed by the field', halftone: 'Letters and images as diffusing dots', tilegrid: 'Tiles that rotate, squash and skew', shapetiles: 'Random rounded shape tiles', dashgrid: 'Dots that grow into dashes and crosses', glyphs: 'Dot-matrix glyphs with bridges',
    truchet: 'Smith tiles joined into paths and loops', paths: 'Parallel line bundles', opart: 'Stripes with lens, waves, folds and insets',
    spokes: 'Rings of wedge spokes, slotted and twisted', trigrid: 'Triangle-grid emblems with rotational symmetry', knots: 'Celtic knotwork with over/under weaving',
    quadgrid: 'Squares that drop into wedges and triangles', capsules: 'Dashes that morph into bars and blobs',
    hatch: 'Parallel dashes, breaks and swells in a shape',
  };
  const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  ui.tab = lsGet('sp.tab', 'organic');

  const fullState = (pr) => {
    const s = pr.state;
    const gen = s.gen || 'molecule';
    return {
      gen,
      params: Object.assign(SP.defaultsFor(gen), s.params || {}),
      layout: Object.assign(defaultsOf(SP.layoutSchema), s.layout || {}),
      field: Object.assign(defaultsOf(SP.fieldSchema), { points: [] }, s.field || {}),
      board: s.board || { w: 200, h: 200 },
      render: Object.assign(defaultsOf(SP.renderSchema), s.render || {}),
      tile: Object.assign(defaultsOf(SP.tileSchema), s.tile || {}),
    };
  };

  // Thumbnails render in the background, one per idle slot, and pause while the user is interacting.
  const thumbs = new Map();
  let thumbQueue = [], thumbBusy = false, lastInteract = 0;
  function drawThumb(canvas, img) { const c = canvas.getContext('2d'); c.putImageData(img, 0, 0); }
  function renderThumb(pr) {
    const N = 112, st = fullState(pr);
    const sc = SP.buildScene(st), f = SP.makeField(sc, st);
    const B = st.board, span = Math.max(B.w, B.h) * 1.04, s = span / N;
    const img = new ImageData(N, N);
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let cov = 0;
        for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
          const x = B.w / 2 + (i + ox - N / 2) * s, y = B.h / 2 + (j + oy - N / 2) * s;
          if (f.eval(x, y) < 0) cov++;
        }
        const t = cov / 4, o = (j * N + i) * 4;
        img.data[o] = 243 + (23 - 243) * t; img.data[o + 1] = 240 + (23 - 240) * t; img.data[o + 2] = 233 + (27 - 233) * t; img.data[o + 3] = 255;
      }
    return img;
  }
  function pumpThumbs() {
    if (thumbBusy || !thumbQueue.length) return;
    thumbBusy = true;
    const step = () => {
      if (performance.now() - lastInteract < 700 || tween) { setTimeout(step, 250); return; }
      const job = thumbQueue.shift();
      if (!job) { thumbBusy = false; return; }
      if (!thumbs.has(job.key)) {
        try { thumbs.set(job.key, renderThumb(job.pr)); } catch (e) { thumbs.set(job.key, null); }
      }
      const img = thumbs.get(job.key);
      document.querySelectorAll(`canvas[data-thumb="${CSS.escape(job.key)}"]`).forEach((cv) => img && drawThumb(cv, img));
      if (window.requestIdleCallback) requestIdleCallback(step, { timeout: 300 }); else setTimeout(step, 16);
    };
    step();
  }
  function thumbCanvas(key, pr) {
    const cv = SP.el('canvas');
    cv.width = cv.height = 112;
    cv.dataset.thumb = key;
    if (thumbs.get(key)) drawThumb(cv, thumbs.get(key));
    else { const c = cv.getContext('2d'); c.fillStyle = '#e9e5dc'; c.fillRect(0, 0, 112, 112); if (!thumbQueue.some((q) => q.key === key)) thumbQueue.push({ key, pr }); }
    return cv;
  }

  function presetCard(pr, deletable) {
    const card = SP.el('div', 'card' + (activePreset === pr.name ? ' on' : ''));
    card.title = pr.name;
    card.appendChild(thumbCanvas('p:' + pr.name, pr));
    if (pr.group === 'Coasters board' && pr.ref) {
      const im = SP.el('img', 'pin'); im.alt = ''; im.onerror = () => im.remove(); im.src = pr.ref.src; card.appendChild(im);
    }
    card.appendChild(SP.el('div', 'label', pr.name));
    if (deletable) {
      const x = SP.el('span', 'x', '✕'); x.title = 'Delete preset';
      x.onclick = (e) => { e.stopPropagation(); saveUserPresets(loadUserPresets().filter((u) => u.name !== pr.name)); renderPresets(); };
      card.appendChild(x);
    }
    card.onclick = () => applyPreset(pr);
    return card;
  }

  function renderPresets() {
    const tabs = $('libTabs'), body = $('libBody');
    const user = loadUserPresets();
    const all = BUILTIN;
    const count = (f) => f.id === 'board' ? all.filter((p) => p.group === 'Coasters board').length : f.id === 'tiling' ? all.filter((p) => p.group === 'Tiling').length : f.id === 'saved' ? user.length
      : all.filter((p) => f.gens.includes(p.state.gen || 'molecule') && p.group !== 'Tiling').length;
    tabs.innerHTML = '';
    for (const f of FAMILIES) {
      const t = SP.el('span', 'tab' + (ui.tab === f.id ? ' on' : ''), `${f.name}<span class="count">${count(f)}</span>`);
      t.onclick = () => { ui.tab = f.id; lsSet('sp.tab', f.id); renderPresets(); };
      tabs.appendChild(t);
    }
    const scroll = body.scrollTop;
    body.innerHTML = '';
    const fam = FAMILIES.find((f) => f.id === ui.tab) || FAMILIES[0];
    if (fam.id === 'board') {
      body.appendChild(SP.el('div', 'gen-desc', 'One preset per pin on your Coasters board (pin shown top-right).'));
      const cards = SP.el('div', 'cards');
      all.filter((p) => p.group === 'Coasters board').forEach((pr) => cards.appendChild(presetCard(pr)));
      body.appendChild(cards);
    } else if (fam.id === 'tiling') {
      body.appendChild(SP.el('div', 'gen-desc', 'Seamless repeats: the left/right (and top/bottom) edges join exactly — ready to wrap round a lampshade. Neighbouring repeats are previewed dimmed.'));
      const cards = SP.el('div', 'cards');
      all.filter((p) => p.group === 'Tiling').forEach((pr) => cards.appendChild(presetCard(pr)));
      body.appendChild(cards);
    } else if (fam.id === 'saved') {
      if (!user.length) body.appendChild(SP.el('div', 'lib-empty', 'Nothing saved yet — use “Save current” below.'));
      const cards = SP.el('div', 'cards');
      user.forEach((pr) => cards.appendChild(presetCard(pr, true)));
      body.appendChild(cards);
    } else {
      for (const g of fam.gens) {
        const gen = SP.generators[g];
        if (!gen) continue;
        const block = SP.el('div', 'gen-block');
        const head = SP.el('div', 'gen-head', `<span class="name${state.gen === g ? ' on' : ''}">${gen.name}</span>`);
        const nb = SP.el('button', null, 'New');
        nb.title = `Start a fresh ${gen.name} with default settings`;
        nb.onclick = () => applyPreset({ name: gen.name, state: { gen: g, params: {}, field: { points: [] } } });
        head.appendChild(nb);
        block.appendChild(head);
        block.appendChild(SP.el('div', 'gen-desc', GEN_DESC[g] || ''));
        const cards = SP.el('div', 'cards');
        // Generator presets first, then the board pins built with this generator.
        const mine = all.filter((p) => (p.state.gen || 'molecule') === g && p.group !== 'Tiling');
        [...mine.filter((p) => !p.group), ...mine.filter((p) => p.group)].forEach((pr) => cards.appendChild(presetCard(pr)));
        block.appendChild(cards);
        body.appendChild(block);
      }
    }
    body.scrollTop = scroll;
    // Prioritise thumbnails for the visible tab.
    const visible = new Set([...body.querySelectorAll('canvas[data-thumb]')].map((c) => c.dataset.thumb));
    thumbQueue.sort((a, b) => visible.has(b.key) - visible.has(a.key));
    pumpThumbs();
    $('motifTitle').textContent = SP.generators[state.gen] ? SP.generators[state.gen].name : 'Motif';
  }
  function applyPreset(pr) {
    if (pr.state && pr.state.gen && !SP.generators[pr.state.gen]) { SP.toast('That preset uses a generator that has been removed'); return; }
    activePreset = pr.name;
    if (pr.ref) {
      if (!refImg.src.endsWith(pr.ref.src)) { refLoaded = false; refImg.src = pr.ref.src; }
      Object.assign(ui.ref, { w: pr.ref.w, x: pr.ref.x, y: pr.ref.y });
      if (refCtl) refCtl.refresh();
    }
    renderPresets();
    const s = clone(pr.state);
    if (s.gen && s.gen !== state.gen) { state.gen = s.gen; state.params = SP.defaultsFor(s.gen); buildPanel(); }
    const target = {
      params: Object.assign(SP.defaultsFor(state.gen), s.params || {}),
      layout: Object.assign(defaultsOf(SP.layoutSchema), s.layout || {}),
      field: Object.assign(defaultsOf(SP.fieldSchema), { points: [] }, s.field || {}),
    };
    if (s.board && (s.board.w !== state.board.w || s.board.h !== state.board.h)) { target.board = s.board; setTimeout(fitView, 0); }
    state.render = Object.assign(defaultsOf(SP.renderSchema), s.render || {});
    state.tile = Object.assign(defaultsOf(SP.tileSchema), s.tile || {});
    if (renderCtl) renderCtl.refresh();
    if (tileCtl) tileCtl.refresh();
    tweenTo(target);
  }

  // ---------------- Export ----------------
  function makeSVG() {
    const sc = SP.buildScene(state);
    const field = SP.makeField(sc, state);
    const t0 = performance.now();
    const cs = SP.contour(field, SP.renderDomain(sc, state), ui.exp.res, ui.exp.tol, { iters: 4, minArea: state.field.minIsland || 0 });
    const svg = SP.buildSVG(cs, { w: state.board.w, h: state.board.h, dp: ui.exp.dp, mode: ui.exp.mode, title: `${state.gen} pattern` });
    const check = SP.validateSVG(svg);
    return { svg, check, ms: performance.now() - t0, loops: cs.length, hUsed: cs.hUsed, overflow: sc.overflow };
  }
  function exportSVG() {
    $('exportInfo').textContent = 'Exporting…';
    setTimeout(() => {
      const { svg, check, ms, hUsed, overflow } = makeSVG();
      const kb = (svg.length / 1024).toFixed(1);
      const notes = [];
      if (hUsed > ui.exp.res * 1.001) notes.push(`⚠ step raised to ${hUsed.toFixed(3)} mm (board too large for requested step)`);
      if (overflow) notes.push('⚠ geometry extends past the board edge');
      $('exportInfo').textContent = `${check.ok ? '✓ valid' : '⚠ check failed'} · ${check.paths} paths · ${check.subpaths} loops · ${check.curves} curves\n${kb} KB · ${ms.toFixed(0)} ms · ${state.board.w}×${state.board.h} mm${notes.length ? '\n' + notes.join('\n') : ''}`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.download = `${activePreset ? activePreset.toLowerCase().replace(/\s+/g, '-') : state.gen}-${stamp}.svg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      SP.toast('SVG exported');
    }, 20);
  }

  // ---------------- Interaction ----------------
  let drag = null;
  function hitPoint(sx, sy) {
    const pts = state.field.points;
    if (ui.selected >= 0 && pts[ui.selected]) {
      const p = pts[ui.selected];
      const [px, py] = toScreen(p.x, p.y);
      if (Math.hypot(sx - (px + p.radius * view.zoom), sy - py) < 9) return { i: ui.selected, grip: true };
    }
    for (let i = pts.length - 1; i >= 0; i--) {
      const [px, py] = toScreen(pts[i].x, pts[i].y);
      if (Math.hypot(sx - px, sy - py) < 12) return { i, grip: false };
    }
    return null;
  }
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    canvas.setPointerCapture(e.pointerId);
    const hit = hitPoint(sx, sy);
    if (hit) {
      if (ui.selected !== hit.i) { ui.selected = hit.i; renderPoints(); }
      drag = { kind: hit.grip ? 'radius' : 'point', i: hit.i, sx, sy };
    } else if (ui.refMove) {
      drag = { kind: 'ref', sx, sy, ox: ui.ref.x, oy: ui.ref.y };
    } else {
      drag = { kind: 'pan', sx, sy, cx: view.cx, cy: view.cy, moved: false };
      canvas.className = 'grabbing';
    }
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (!drag) {
      const hit = hitPoint(sx, sy);
      canvas.className = hit ? 'point' : ui.refMove ? 'grab' : '';
      return;
    }
    if (drag.kind === 'pan') {
      view.cx = drag.cx - (sx - drag.sx) / view.zoom;
      view.cy = drag.cy - (sy - drag.sy) / view.zoom;
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = view.userMoved = true;
      redraw();
    } else if (drag.kind === 'ref') {
      ui.ref.x = drag.ox + (sx - drag.sx) / view.zoom;
      ui.ref.y = drag.oy + (sy - drag.sy) / view.zoom;
      refCtl.refresh();
      redraw();
    } else {
      const p = state.field.points[drag.i];
      const [wx, wy] = toWorld(sx, sy);
      if (drag.kind === 'point') { p.x = wx; p.y = wy; }
      else p.radius = Math.max(2, Math.hypot(wx - p.x, wy - p.y));
      if (pointCtl) pointCtl.refresh();
      invalidate(true);
    }
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.kind === 'point' || drag.kind === 'radius') { invalidate(false); commit(); }
    if (drag.kind === 'pan' && !drag.moved && ui.selected >= 0) { ui.selected = -1; renderPoints(); redraw(); }
    drag = null;
    canvas.className = '';
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('dblclick', (e) => {
    const r = canvas.getBoundingClientRect();
    const [wx, wy] = toWorld(e.clientX - r.left, e.clientY - r.top);
    if (!hitPoint(e.clientX - r.left, e.clientY - r.top)) addPoint(wx, wy);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const [wx, wy] = toWorld(sx, sy);
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    view.zoom = Math.min(200, Math.max(0.2, view.zoom * f));
    view.userMoved = true;
    view.cx = wx - (sx - cw / 2) / view.zoom;
    view.cy = wy - (sy - ch / 2) / view.zoom;
    redraw();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (k === 'r') randomize();
    else if (k === 'm') mutate();
    else if (k === 'f') fitView();
    else if (k === 'n') toggle('showNodes', $('btnNodes'));
    else if (k === 'v') toggle('showField', $('btnFieldViz'));
    else if ((k === 'delete' || k === 'backspace') && ui.selected >= 0) deletePoint(ui.selected);
    else if (k === 'escape') { ui.selected = -1; renderPoints(); redraw(); }
  });

  function toggle(key, btn) { ui[key] = !ui[key]; btn.classList.toggle('on', ui[key]); redraw(); }

  // ---------------- Wiring ----------------
  const setLib = (show) => { $('app').classList.toggle('lib-hidden', !show); lsSet('sp.lib', show ? '1' : '0'); resize(); };
  $('btnLibToggle').onclick = () => setLib(false);
  $('btnLibShow').onclick = () => setLib(true);
  if (lsGet('sp.lib', '1') === '0') $('app').classList.add('lib-hidden');
  $('btnCyl').onclick = () => {
    const d = +$('cylD').value, hgt = +$('cylH').value;
    if (!(d > 0 && hgt > 0)) return;
    state.board.w = +(Math.PI * d).toFixed(3); state.board.h = hgt;
    Object.assign(state.tile, { on: true, wrapX: true });
    tileCtl.refresh(); fitView(); invalidate(false); commit();
    SP.toast(`Board set to ${state.board.w} × ${hgt} mm (circumference × height)`);
  };
  $('btnRepeats').onclick = () => toggle('showRepeats', $('btnRepeats'));
  $('btnRepeats').classList.toggle('on', ui.showRepeats);
  $('btnRandom').onclick = randomize;
  $('btnMutate').onclick = mutate;
  $('btnUndo').onclick = undo;
  $('btnRedo').onclick = redo;
  $('btnFit').onclick = fitView;
  $('btnNodes').onclick = () => toggle('showNodes', $('btnNodes'));
  $('btnFieldViz').onclick = () => toggle('showField', $('btnFieldViz'));
  $('btnRef').onclick = () => { ui.ref.show = !ui.ref.show; $('btnRef').classList.toggle('on', ui.ref.show); refCtl.refresh(); redraw(); };
  $('btnAddPoint').onclick = () => addPoint(state.board.w * (0.3 + Math.random() * 0.4), state.board.h * (0.3 + Math.random() * 0.4));
  $('btnClearPoints').onclick = () => { state.field.points = []; ui.selected = -1; renderPoints(); invalidate(false); commit(); };
  $('btnRefMove').onclick = () => toggle('refMove', $('btnRefMove'));
  $('btnExport').onclick = exportSVG;
  $('btnCopy').onclick = async () => {
    const { svg, check } = makeSVG();
    try { await navigator.clipboard.writeText(svg); SP.toast(`Copied SVG · ${check.subpaths} loops`); } catch { SP.toast('Clipboard unavailable'); }
  };
  const boardChange = () => {
    const w = Math.max(10, +$('boardW').value || 200), h = Math.max(10, +$('boardH').value || 200);
    state.board.w = w; state.board.h = h;
    fitView(); invalidate(false); commit();
  };
  $('boardW').onchange = boardChange;
  $('boardH').onchange = boardChange;
  $('btnSavePreset').onclick = () => {
    const name = prompt('Preset name', `My pattern ${loadUserPresets().length + 1}`);
    if (!name) return;
    const list = loadUserPresets().filter((p) => p.name !== name);
    list.push({ name, state: JSON.parse(snap()) });
    saveUserPresets(list);
    activePreset = name;
    renderPresets();
    SP.toast('Preset saved');
  };
  $('btnExportJson').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(JSON.parse(snap()), null, 2)], { type: 'application/json' }));
    a.download = 'pattern.json';
    a.click();
  };
  $('inJson').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then((t) => { try { const o = JSON.parse(t); applyPreset({ name: f.name.replace(/\.json$/, ''), state: o.state || o }); } catch { SP.toast('Invalid JSON'); } });
    e.target.value = '';
  };
  $('inRef').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      refLoaded = false;
      refImg.src = rd.result;
      Object.assign(ui.ref, { show: true, w: state.board.w, x: state.board.w / 2, y: state.board.h / 2 });
      refCtl.refresh();
    };
    rd.readAsDataURL(f);
    e.target.value = '';
  };

  window.addEventListener('resize', () => { resize(); });
  buildPanel();
  resize();
  fitView();
  invalidate(false);
  commit();

  // Debug / self-check hooks.
  SP.app = { state, ui, view, makeSVG, invalidate, commit, get contours() { return contours; } };
})();
