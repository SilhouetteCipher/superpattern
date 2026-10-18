// One preset per pin on the "Coasters" Pinterest board (ref/pins/pinNN.jpg is the underlay).
(function () {
  const SP = (window.SP = window.SP || {});
  const pt = (x, y, radius, strength, falloff = 'smooth') => ({ x, y, radius, strength, falloff });
  const P = (n, name, gen, params, extra = {}) => ({
    name: `${String(n).padStart(2, '0')} · ${name}`,
    group: 'Coasters board',
    ref: Object.assign({ src: `ref/pins/pin${String(n).padStart(2, '0')}.jpg`, w: extra.refW || 200, x: (extra.board || { w: 200 }).w / 2, y: (extra.board || { h: 200 }).h / 2 }, extra.ref || {}),
    state: {
      gen, params,
      layout: extra.layout || {},
      field: extra.field || { points: [] },
      board: extra.board || { w: 200, h: 200 },
      render: extra.render || {},
    },
  });
  // Field points strung along both diagonals of an X, fading toward the tips.
  const xLine = (cx, cy, len, step) => {
    const out = [];
    for (const [dx, dy] of [[1, 1.25], [1, -1.25]]) {
      const l = Math.hypot(dx, dy);
      for (let t = -len / 2; t <= len / 2 + 1e-6; t += step) {
        if (dx === 1 && dy < 0 && Math.abs(t) < step / 2) continue; // centre point once
        out.push(pt(+(cx + (t * dx) / l).toFixed(1), +(cy + (t * dy) / l).toFixed(1), 44, +(0.3 * (1 - (0.6 * Math.abs(t)) / (len / 2))).toFixed(3)));
      }
    }
    return out;
  };
  SP.pinPresets = [
    P(1, 'Glyph outline', 'glyphs', { sub: 4, margin: 30, dotR: 0.42, bridge: 0.62, bridgeW: 1, fill: 1, fillet: 0.35, seed: 3 },
      { render: { outline: 1.4 } }),
    P(2, 'Squircle grid', 'dotgrid', { cols: 11, rows: 11, pitch: 17.5, dotR: 0.485, shape: 'squircle', square: 10, roundAmt: 1.4, gain: 1, shrink: 0.05, stretch: 0, pull: 0, subdiv: 3 },
      { field: { points: [pt(100, 100, 115, 1, 'linear')] } }),
    P(3, 'Shattered cells', 'voronoi', { cell: 100, centre: 0.93, focus: 1.2, centreX: 0.1, centreY: 0, relax: 0, gap: 1.8, gapGrow: 1.6, round: 4, seed: 12 }),
    P(4, 'Wave disc', 'opart', { angle: 90, spacing: 20, waveAmp: 8, waveLen: 85, duty: 0.52 }),
    P(5, 'Contour sphere', 'opart', { mode: 'concentric', spacing: 11, focusX: -0.35, focusY: 0.45, lens: 0.8, warp: 30, warpScale: 100, swirl: 60, duty: 0.5, seed: 9 }),
    P(6, 'Turing disc', 'turing', { cellSize: 160, wavelength: 19, seed: 11 }),
    P(7, 'Molecule', 'molecule', {}),
    P(8, 'Blob glyph', 'glyphs', { sub: 5, margin: 25, dotR: 0.42, bridge: 0.55, diag: 0.25, bridgeW: 0.85, fill: 0.85, mirror: true, fillet: 2.5, seed: 8 }),
    P(9, 'Coral line', 'turing', { cellSize: 140, wavelength: 17, thickness: 0, seed: 9, smooth: 1.3, clip: false, edgeGap: 0.15 },
      { render: { outline: 2.8, invert: true, blank: 'rect', blankMargin: 0, blankRound: 0 } }),
    P(10, 'Dash grid', 'dashgrid', {}, { field: { points: [pt(74.2, 61.2, 82.7, 0.89)] }, board: { w: 120, h: 120 }, ref: { w: 224.4, x: 61.5, y: 60.5 } }),
    P(11, 'Carved cube', 'carved', { mode: 'line', sides: 6, shapeRot: 90, rot: 90, dist: 0.9, rad: 0.8, gap: 1.2 }),
    P(12, 'Chevron lines', 'paths', { path: 'chevron', size: 40, aspect: 1.2, lines: 6, spacing: 5, width: 3, corner: 2.5, fan: 0.6 }),
    P(13, 'Swirl sphere', 'opart', { angle: 60, spacing: 24, swirl: 260, warp: 25, warpScale: 110, duty: 0.62, lens: 0.4, seed: 13 }),
    P(14, 'Sun ring', 'rays', { count: 16, rIn: 34, len: 18, width: 5.5, splay: 18, pairLen: 0.85 }),
    P(16, 'Metaball glyph', 'glyphs', { sub: 3, margin: 35, dotR: 0.36, bridge: 0.5, bridgeW: 0.62, fillet: 3, seed: 16 }),
    P(17, 'Dot squeeze', 'dotgrid', {}, { field: { points: [pt(145, 145, 80, 1)] } }),
    P(18, 'Truchet path', 'truchet', { seed: 234, flip: 0.1 }, { board: { w: 150, h: 200 }, refW: 150 }),
    P(19, 'Interlock', 'paths', { path: 'hook', size: 45, lines: 4, spacing: 6, width: 3.4, corner: 10, copies: 2 }),
    P(20, 'Warped sphere', 'opart', { angle: 80, spacing: 7, lens: 0.9, warp: 40, warpScale: 110, duty: 0.5, seed: 3 }),
    P(21, 'Split disc', 'carved', { rot: 70, offX: 0.38, offY: 0, dist: 3, rad: 2.75, gap: 0.9, explode: 2.5 }),
    P(22, 'Aperture', 'polyring', { an: 6, asides: 4, ar: 31, asize: 11, aspin: 45, astretch: 2, askew: 0.6, bn: 6, bsides: 3, br: 44, bsize: 8, bspin: 180, bphase: 30, round: 0.4 }),
    P(23, 'Tri-cut disc', 'carved', {}),
    P(24, 'Merged dots', 'glyphs', { sub: 4, margin: 45, dotR: 0.47, bridge: 0.5, bridgeW: 0.95, fillet: 1.2, seed: 24 }),
    P(25, 'Ray wing', 'rays', { count: 26, a0: 112, a1: 428, rIn: 3, len: 44, width: 4.6, taper: 1.25, pattern: 'single', lenVar: 0.35, lenFreq: 1 }),
    P(26, 'Truchet bands', 'truchet', { pattern: 'random', cols: 6, rows: 6, margin: 4, select: 'all', width: 0.3, tracks: 2, trackGap: 0.333, vdot: 0.09, vdotWhere: 'free', cut: false, seed: 26 }),
    P(27, 'Flip cross', 'tilegrid', { cols: 15, rows: 15, margin: 8, size: 0.9, round: 0.02, rotGrad: 0, squash: 1.6, squashAngle: 0, skew: 2.4, skewAngle: 90, skewCross: true }),
    P(28, 'Rotating squares', 'tilegrid', { cols: 14, rows: 14, size: 0.66, rotGrad: 45, scaleGrad: 0.25 }),
    P(29, 'Shape tiles', 'shapetiles', {}),
    P(30, 'Diffusing letter', 'halftone', {}, { board: { w: 140, h: 200 }, refW: 140, field: { points: [], minIsland: 0.3 } }),
    P(31, 'Rhythm bars', 'tilegrid', { cols: 4, rows: 4, margin: 30, shape: 'bar', aspect: 0.12, size: 0.8, round: 0, rotGrad: 0, rotRandom: 180, rotStep: 45, seed: 31 }),
    P(32, 'Truchet → grid', 'truchet', { pattern: 'random', cols: 16, rows: 40, margin: 3, select: 'all', width: 0.43, widthGrad: 0.62, widthAngle: -90, morph: 0.5, morphGrad: 2, morphAngle: 0, morphSharp: 12, dropout: 0.06, seed: 3 },
      { board: { w: 100, h: 250 }, refW: 100 }),
    P(33, 'Pill flow', 'capsules', { cols: 15, rows: 17, margin: 0, profile: 'band', bandCentre: 0.5, t0: 0.08, t1: 0.3, wA: 0.26, hA: 0.8, wB: 2, hB: 0.74, wC: 2, hC: 0.92, drip: 0.22, merge: 0.6 },
      { board: { w: 160, h: 200 }, refW: 160, field: { points: [pt(80, 95, 135, 1)] } }),
    P(45, 'Dash cross', 'capsules', { cols: 19, rows: 13, margin: 0, stagger: 0.5, profile: 'ramp', t0: 0.05, t1: 1.1, wA: 0.16, hA: 0.62, wB: 0.9, hB: 0.9, round: 0.6, drip: 0.2, merge: 0.5 },
      { board: { w: 160, h: 200 }, refW: 160, field: { points: xLine(80, 100, 250, 11) } }),
    P(38, 'Knotwork', 'knots', { cols: 3, rows: 3, margin: 30, walls: 0.3, breaks: 0.3, symmetry: 'xy', width: 0.22, gap: 2, seed: 38 }, { render: { outline: 1.4 } }),
    P(34, 'Y ring', 'rays', { count: 12, a0: 90, a1: 450, rIn: 28, len: 36, taper: 1, pattern: 'pairs', splay: 11, pairLen: 1, curve: 22, width: 8.5, fillet: 0.4 }),
    P(42, 'Slotted spokes', 'spokes', { count: 12, rIn: 22, rOut: 93, gap: 5, round: 3.5, every: 2, slotFrom: 'inner', slotW: 14, slotDepth: 0.78, slotTaper: false, accWidth: 1.7, plainIn: 6, plainOut: -3 }),
    P(43, 'Dash hatch', 'hatch', { shape: 'circle', size: 172, angle: 35, spacing: 9.5, width: 5.8, breaks: 2, breakGap: 6, minSeg: 10, seed: 43, fieldGain: 0 }),
    P(47, 'Thread swell', 'hatch', { shape: 'square', size: 132, angle: 0, spacing: 7, width: 1.6, breaks: 0, fieldGain: 1, gradAmt: 1.6, gradAngle: 180, lineJitter: 0.9, thickW: 5.6, profile: 'capsule', thresh: 0.5, seed: 47 },
      { field: { points: [pt(122, 50, 9, 1), pt(120, 62, 13, 1), pt(117, 76, 16, 1), pt(114, 92, 20, 1), pt(115, 108, 22, 1), pt(115, 122, 26, 1), pt(95, 140, 30, 1), pt(125, 140, 30, 1), pt(80, 148, 26, 1), pt(135, 148, 26, 1)] } }),
    P(40, 'Falling squares', 'quadgrid', { cols: 8, rows: 8, margin: 14, gap: 4.2, round: 0.3, aBase: -0.15, aGrad: 1.1, aAngle: 0, bBase: -0.5, bGrad: 0.8, bAngle: 90, random: 0.7, turn: 'mirror', seed: 40 }),
    P(35, 'Crescent columns', 'opart', { shape: 'board', margin: 8, mode: 'parallel', angle: 0, spacing: 3.9, duty: 0.5, dutyRamp: 0.95, dutyGroup: 16, waveAmp: 5, waveLen: 34, waveShape: 'scallop', edgeRound: 0.3 },
      { board: { w: 140, h: 200 }, refW: 140 }),
    P(39, 'Folded stripes', 'opart', { shape: 'circle', cellSize: 186, mode: 'parallel', angle: 120, spacing: 9, duty: 0.5, warp: 6, warpScale: 120, lens: 0.4, swirl: 60, stepAmp: 30, stepWidth: 10, stepPos: 0.1, stepSkew: 0.9, seed: 39 }),
    P(46, 'Stripe wave', 'opart', { shape: 'board', margin: 0, mode: 'parallel', angle: 90, spacing: 12.4, duty: 0.5, stepAmp: -12.4, stepWidth: 5, stepPos: 0.05, stepSkew: -0.45, stepCurve: 0.2, edgeRound: 0.05 },
      { board: { w: 112, h: 200 }, refW: 112 }),
    P(44, 'Ring gradient', 'tilegrid', { cols: 14, rows: 14, margin: 12, shape: 'ring', size: 0.94, ringT: 0.46, ringGrad: -0.37, ringAngle: 45, ringMirror: true, ringDot: 0.7, rotGrad: 0, rot: 0 }),
    P(48, 'Slant bars', 'tilegrid', { cols: 28, rows: 17, margin: 4, cellRatio: 2.3, shape: 'bar', size: 0.96, aspect: 0.3, round: 0.02, rot: 0, rotGrad: 0, skew0: -0.35, fieldRot: 38 },
      { board: { w: 141, h: 200 }, refW: 141, field: { points: [pt(58, 42, 16, 1), pt(78, 62, 16, 1), pt(58, 82, 16, 1), pt(78, 102, 16, 1), pt(58, 122, 16, 1), pt(76, 142, 16, 1), pt(60, 160, 14, 0.9)] } }),
    P(37, 'Iso hooks', 'trigrid', { n: 3, size: 72, rot: 30, symmetry: 'rot3', fill: 0.6, seed: 37, round: 2.2, gap: 1.6 }),
  ];
  SP.pinPresets.sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10));
})();
