// Lissajous: the figure a spot traces when two perpendicular oscillations are added — x = sin(a·t + δ),
// y = sin(b·t). Whole-number frequencies a : b close the figure after one period; the ratio sets how many
// lobes it has across and down (a ratio is reduced first, so 4 : 2 draws the same curve as 2 : 1), and the
// phase δ morphs it from an open arc (δ = 0 with a or b even) through the woven, symmetric figure (δ = 90°).
// A harmonograph is the same rule with pendulums that lose energy: the amplitude decays by e^(−decay) each
// period and one frequency is detuned a little, so every pass lands a little inside and turned from the last
// and the figure spirals in; it is drawn for `loops` periods and stops before the passes crowd together.
// The board is a grid of cells: one figure everywhere, a Lissajous table (a steps along each row, b down each
// column, the classic oscilloscope chart), a phase sweep (one ratio, δ stepping cell by cell), or one large
// figure. The band can swell where the pen slows at the turning points, like ink pooling on a plotter.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_W = 0.6; // narrowest band (mm)
  const D2R = Math.PI / 180;
  const MAX_PTS = 6000;
  const CORE = 0.3; // a harmonograph stops at this share of full size

  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; }

  // Unit-size figure: points in [−1, 1]² and a slowness weight (0 where the pen moves fastest, 1 where it
  // stops) per point. One period for a closed Lissajous; `loops` damped periods for a harmonograph.
  function trace(a, b, phase, loops, decay, detune) {
    const g = gcd(a, b);
    a /= g; b /= g;
    const harm = loops > 1 || decay > 0;
    const L = harm ? loops : 1;
    const n = Math.min(MAX_PTS, Math.max(96, Math.round(128 * Math.max(a, b) * L)));
    const bt = b * (1 + (harm ? detune : 0));
    const pts = [], spd = [];
    for (let k = 0; k <= n; k++) {
      const t = (k / n) * 2 * Math.PI * L;
      const A = harm ? Math.exp((-decay * t) / (2 * Math.PI)) : 1;
      const x = A * Math.sin(a * t + phase), y = A * Math.sin(bt * t);
      // Pen speed from the undamped derivative, scaled by the current amplitude.
      const vx = A * a * Math.cos(a * t + phase), vy = A * bt * Math.cos(bt * t);
      pts.push([x, y]);
      spd.push(Math.hypot(vx, vy));
    }
    const vmax = Math.max(...spd, 1e-9);
    // Smallest amplitude reached and the spacing between successive passes (as a share of the half-size).
    const amin = harm ? Math.exp(-decay * L) : 1;
    const pass = harm && decay > 0 ? 1 - Math.exp(-decay) : 1;
    return { pts, slow: spd.map((v) => 1 - v / vmax), closed: !harm, a, b, amin, pass };
  }

  SP.generators.lissajous = {
    id: 'lissajous',
    name: 'Lissajous',
    board: true,
    schema: [
      { group: 'Curve' },
      { key: 'freqA', label: 'Frequency a (across)', min: 1, max: 9, step: 1, def: 3, int: true, rand: [1, 5] },
      { key: 'freqB', label: 'Frequency b (down)', min: 1, max: 9, step: 1, def: 2, int: true, rand: [1, 5] },
      { key: 'phase', label: 'Phase δ °', min: 0, max: 180, step: 1, def: 90, rand: [0, 180] },
      { group: 'Harmonograph' },
      { key: 'loops', label: 'Periods', min: 1, max: 16, step: 1, def: 1, int: true, rand: [1, 5] },
      { key: 'decay', label: 'Decay per period', min: 0, max: 0.6, step: 0.005, def: 0.25, rand: [0.18, 0.35], show: (o) => o.loops > 1 },
      { key: 'detune', label: 'Detune b', min: -0.05, max: 0.05, step: 0.001, def: 0.005, rand: [-0.012, 0.012], show: (o) => o.loops > 1 },
      { group: 'Layout' },
      { key: 'layout', label: 'Layout', type: 'select', def: 'single', options: [['single', 'One large figure'], ['same', 'Same figure in every cell'], ['table', 'Table (a across, b down)'], ['sweep', 'Phase sweep cell by cell']] },
      { key: 'cols', label: 'Columns', min: 1, max: 10, step: 1, def: 4, int: true, rand: [2, 5], show: (o) => o.layout !== 'single' },
      { key: 'rows', label: 'Rows', min: 1, max: 10, step: 1, def: 4, int: true, rand: [2, 5], show: (o) => o.layout !== 'single' },
      { key: 'fit', label: 'Fill cell', min: 0.3, max: 1, step: 0.01, def: 0.86, rand: [0.75, 0.94] },
      { key: 'rot', label: 'Rotation °', min: -180, max: 180, step: 1, def: 0, rand: [-45, 45] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { group: 'Band' },
      { key: 'width', label: 'Band width (mm)', min: 0.6, max: 12, step: 0.05, def: 3, rand: [1.4, 3.6] },
      { key: 'swell', label: 'Swell at turns', min: 0, max: 1.5, step: 0.01, def: 0.4, rand: [0, 1] },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 4, step: 0.01, def: 0.6 },
      { key: 'fieldGain', label: 'Points → grow', min: -1, max: 1, step: 0.01, def: 0.3 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], dots: [], count: 0 };
      const single = p.layout === 'single';
      const C = single ? 1 : Math.max(1, Math.round(p.cols)), R = single ? 1 : Math.max(1, Math.round(p.rows));
      const mg = Math.max(0, Math.min(p.margin, Math.min(B.w, B.h) / 2 - 2));
      const cw = (B.w - 2 * mg) / C, ch = (B.h - 2 * mg) / R;
      const fa = Math.max(1, Math.round(p.freqA)), fb = Math.max(1, Math.round(p.freqB));
      const loops = Math.max(1, Math.round(p.loops));
      const decay = loops > 1 ? Math.max(0, p.decay) : 0, detune = loops > 1 ? p.detune : 0;
      const grow = points.length && p.fieldGain ? (x, y) => Math.max(0.5, Math.min(1.6, 1 + p.fieldGain * fieldAt(x, y))) : () => 1;
      const a = p.rot * D2R, ca = Math.cos(a), sa = Math.sin(a);
      const cache = new Map();

      for (let j = 0; j < R; j++)
        for (let i = 0; i < C; i++) {
          let A = fa, Bf = fb, ph = p.phase;
          if (p.layout === 'table') { A = fa + i; Bf = fb + j; }
          // Shifting t by π / b turns δ by a·π / b and only flips y, so 180° / b holds every distinct figure.
          else if (p.layout === 'sweep') ph = p.phase + ((180 / fb) * (j * C + i)) / Math.max(1, C * R);
          const key = [A, Bf, ph].join();
          if (!cache.has(key)) cache.set(key, trace(A, Bf, ph * D2R, loops, decay, detune));
          const f = cache.get(key);
          if (f.amin < CORE && decay > 0) {
            // Cut the spiral where it shrinks below CORE of full size: the centre would be a solid knot.
            const keep = Math.ceil((Math.log(1 / CORE) / decay / loops) * (f.pts.length - 1));
            f.pts.length = Math.min(f.pts.length, keep + 1);
            f.slow.length = f.pts.length;
            f.amin = CORE;
          }

          // Rotate, then scale the figure's bounding box into the cell.
          const rp = f.pts.map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]);
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const [x, y] of rp) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
          const sw = 1 + Math.max(0, p.swell);
          const w2 = (Math.max(MIN_W, p.width) / 2) * sw;
          const s = Math.max(1e-3, (Math.min(cw, ch) * p.fit - 2 * w2) / Math.max(x1 - x0, y1 - y0, 1e-6));
          const ox = mg + (i + 0.5) * cw - ((x0 + x1) / 2) * s, oy = mg + (j + 0.5) * ch - ((y0 + y1) / 2) * s;
          // Neighbouring lobes sit about π / (2·max(a, b)) apart at the figure's waist, and harmonograph passes
          // `pass` apart at the rim; keep the band to a third of the tighter one so the gaps stay open.
          const lobe = (Math.PI / (2 * Math.max(f.a, f.b))) * s;
          const ring = f.pass * s * f.amin;
          const cap = Math.max(MIN_W / 2, 0.33 * Math.min(lobe, ring > 0 ? ring : lobe) / sw);
          const r0 = Math.max(MIN_W / 2, Math.min(Math.max(MIN_W, p.width) / 2, cap));
          const pts = rp.map(([x, y]) => [ox + x * s, oy + y * s]);
          if (f.closed) pts[pts.length - 1] = pts[0];
          const r = pts.map(([x, y], k) => Math.max(MIN_W / 2, r0 * (1 + Math.max(0, p.swell) * f.slow[k] * f.slow[k]) * grow(x, y)));
          out.strokes.push({ pts, r });
          out.count++;
        }
      out.count = Math.max(1, out.count);
      return out;
    },
  };
})();
