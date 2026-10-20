// Guilloché: rose-engine "engine turning". A rose engine rocks the work against a rosette cam while it turns,
// so the cutter traces r(θ) = R + A·cos(n·θ + φ): a circle with n lobes. The pattern is built one pass at a
// time — every pass steps the radius out by one pitch and *phases* the rosette by a fraction of a lobe, and
// the whole look comes from how the phase is indexed between passes:
//   phased      each pass advances the phase by a fixed fraction of a lobe, so the lobes twist into spirals
//   barleycorn  the phase alternates by half a lobe, so neighbouring passes bulge into each other and the
//               space between them breaks into a lattice of grains (grain d'orge)
//   crossed     every pass is cut twice, phased a little either side, so each ring carries a chain of lenses
//               and the rings interlock like barleycorn: a basketweave
// A linear amplitude ramp copies the deeper cams used toward the rim; a centre drift gives the eccentric
// (offset-circle) guilloché of watch dials. Each pass is one closed band of constant width, so the field's
// smooth union fillets every crossing and the shared margin clips the board edge flat.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;
  const MIN_R = 0.3;

  SP.generators.guilloche = {
    id: 'guilloche',
    name: 'Guilloché',
    board: true,
    schema: [
      { group: 'Rosette' },
      { key: 'pattern', label: 'Phasing', type: 'select', def: 'barleycorn', options: [['phased', 'Phased (spiral twist)'], ['barleycorn', 'Barleycorn (alternate half lobe)'], ['crossed', 'Crossed (basketweave)']] },
      { key: 'lobes', label: 'Lobes', min: 1, max: 96, step: 1, def: 12, int: true, rand: [6, 36] },
      { key: 'amp', label: 'Amplitude (× pitch)', min: 0, max: 1.5, step: 0.01, def: 0.45, rand: [0.2, 0.65] },
      { key: 'sharp', label: 'Lobe sharpness', min: -0.6, max: 1, step: 0.01, def: 0, rand: [-0.3, 0.6] },
      { key: 'phaseStep', label: 'Phase step (lobes / pass)', min: -0.5, max: 0.5, step: 0.005, def: 0.12, rand: [-0.3, 0.3] },
      { key: 'rotate', label: 'Rotate °', min: -180, max: 180, step: 0.5, def: 0 },
      { group: 'Passes' },
      { key: 'pitch', label: 'Pitch (mm)', min: 2.5, max: 30, step: 0.1, def: 5, rand: [3.5, 8] },
      { key: 'rIn', label: 'Inner radius (mm)', min: 0, max: 80, step: 0.5, def: 8, rand: [2, 16] },
      { key: 'fit', label: 'Fit', type: 'select', def: 'circle', options: [['circle', 'Inscribed circle'], ['board', 'Fill the board']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'ampRamp', label: 'Amplitude ramp (in → out)', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.6, 0.6] },
      { key: 'drift', label: 'Centre drift (mm)', min: 0, max: 60, step: 0.5, def: 0, rand: [0, 12] },
      { group: 'Band' },
      { key: 'width', label: 'Band width (mm)', min: 0.6, max: 6, step: 0.05, def: 1.5, rand: [1, 2.4] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.3, rand: [0.1, 0.8] },
      { group: 'Field points' },
      { key: 'fieldAmp', label: 'Points → amplitude', min: -2, max: 2, step: 0.01, def: 1 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], count: 0, k: p.fillet };
      const n = Math.max(1, Math.round(p.lobes));
      const pitch = Math.max(1, p.pitch);
      // A band wider than the pitch would weld the passes into a disc; keep a gap.
      const w = Math.min(p.width, pitch * 0.8), r = Math.max(MIN_R, w / 2);
      const mg = Math.max(0, p.margin);
      const cx = B.w / 2, cy = B.h / 2;
      const half = Math.min(B.w, B.h) / 2;

      // Amplitude of pass k (mm): base × linear ramp across the passes, never negative.
      const ampAt = (t) => Math.max(0, p.amp * pitch * (1 + p.ampRamp * (2 * t - 1)));
      const maxAmp = Math.max(ampAt(0), ampAt(1)) * (points.length ? 1 + Math.abs(p.fieldAmp) : 1);

      // Number of passes: inscribed circle keeps every lobe inside the margin; board fill runs the passes out
      // to the far corner and lets the margin rectangle clip them.
      let rOut;
      if (p.fit === 'board') rOut = Math.hypot(B.w, B.h) / 2 + maxAmp;
      else rOut = half - mg - r - maxAmp - p.drift; // (uncapped drift: conservative)
      const N = Math.max(1, Math.min(240, Math.floor((rOut - p.rIn) / pitch) + 1));
      // Eccentric drift: the passes bunch up on the side the centre walks away from; cap it so they keep a gap.
      const drift = Math.min(p.drift, Math.max(0, (pitch - w - 0.8) * (N - 1)));

      // Lobe shaping: |cos|^q keeps the zero crossings and extrema in place; q > 1 points the lobes,
      // q < 1 squares them off toward a scalloped cam.
      const q = Math.exp(1.2 * p.sharp);
      const shape = (c) => (c >= 0 ? Math.pow(c, q) : -Math.pow(-c, q));
      const rot = p.rotate * D2R;

      // One closed pass: lobed circle of mean radius R about (ox, oy) with phase phi.
      const pass = (R, A0, phi, ox, oy) => {
        // Near the centre a lobe spans only a few mm of arc; cap the amplitude at a fraction of the lobe's
        // arc length so the inner passes stay gently waved instead of folding into a spiky knot.
        const A = Math.min(A0, (0.3 * 2 * Math.PI * R) / n);
        if (R + A < r) return; // degenerate pass inside its own band
        const M = Math.min(1440, Math.max(48, 16 * n, Math.ceil((2 * Math.PI * (R + A)) / 0.7)));
        const pts = [], rr = [];
        for (let i = 0; i < M; i++) {
          const th = (i / M) * 2 * Math.PI;
          const c = shape(Math.cos(n * (th - rot) + phi));
          let a = A;
          if (points.length && p.fieldAmp) {
            const bx = ox + R * Math.cos(th), by = oy - R * Math.sin(th);
            a = Math.max(0, A * (1 + p.fieldAmp * fieldAt(bx, by)));
          }
          const rad = Math.max(0, R + a * c);
          pts.push([ox + rad * Math.cos(th), oy - rad * Math.sin(th)]);
          rr.push(r);
        }
        pts.push(pts[0]); rr.push(r); // close the loop
        out.strokes.push({ pts, r: rr });
        out.count++;
      };

      const lobe = 2 * Math.PI; // one whole lobe of phase inside cos(n·θ + φ)
      for (let k = 0; k < N; k++) {
        const t = N > 1 ? k / (N - 1) : 0;
        const R = p.rIn + k * pitch;
        if (p.fit === 'board' && R - ampAt(t) - r > Math.hypot(B.w, B.h) / 2) break;
        const A = ampAt(t);
        // Eccentric guilloché: the centre walks upward as the passes grow.
        const ox = cx, oy = cy - drift * t;
        if (p.pattern === 'barleycorn') pass(R, A, (k & 1) * lobe * 0.5, ox, oy);
        else if (p.pattern === 'crossed') {
          // Basketweave: every pass is cut twice, phased ± the step either side of the barleycorn phase, so
          // each ring carries its own chain of lenses and neighbouring rings still interlock.
          const base = (k & 1) * lobe * 0.5, d = p.phaseStep * lobe;
          pass(R, A, base + d, ox, oy);
          if (Math.abs(d) > 1e-6 && A > 1e-6) pass(R, A, base - d, ox, oy);
        } else pass(R, A, k * p.phaseStep * lobe, ox, oy);
      }

      if (p.fit === 'board') out.clip = { x0: mg, y0: mg, x1: B.w - mg, y1: B.h - mg, k: 0.3 };
      return out;
    },
  };
})();
