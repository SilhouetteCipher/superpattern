// Rays: tapered radial strokes over an angle range. Patterns: single rays, or every other ray split
// into a splayed V-pair. Length waves and a V-shaped inner "notch" make fans and wings.
(function () {
  const SP = (window.SP = window.SP || {});
  const D2R = Math.PI / 180;

  SP.generators.rays = {
    id: 'rays',
    name: 'Rays',
    schema: [
      { group: 'Layout' },
      { key: 'count', label: 'Rays', min: 1, max: 120, step: 1, def: 12, int: true, rand: [8, 40] },
      { key: 'a0', label: 'Start angle °', min: -360, max: 360, step: 1, def: 90 },
      { key: 'a1', label: 'End angle °', min: -360, max: 360, step: 1, def: 450 },
      { key: 'gapMid', label: 'Middle gap °', min: 0, max: 180, step: 1, def: 0 },
      { key: 'rIn', label: 'Inner radius (mm)', min: 0, max: 100, step: 0.1, def: 26, rand: [5, 40] },
      { key: 'len', label: 'Length (mm)', min: 1, max: 120, step: 0.1, def: 16, rand: [8, 40] },
      { group: 'Stroke' },
      { key: 'width', label: 'Width (mm)', min: 0.2, max: 20, step: 0.05, def: 4.2, rand: [2, 6] },
      { key: 'taper', label: 'Tip width', min: 0, max: 2, step: 0.01, def: 1, rand: [0.3, 1.2] },
      { key: 'pattern', label: 'Pattern', type: 'select', def: 'altpair', options: [['single', 'Single rays'], ['altpair', 'Alternate V-pairs'], ['pairs', 'All V-pairs']] },
      { key: 'splay', label: 'V splay °', min: -60, max: 60, step: 0.5, def: 16 },
      { key: 'pairLen', label: 'V-pair length', min: 0.2, max: 2, step: 0.01, def: 0.8 },
      { group: 'Modulation' },
      { key: 'lenVar', label: 'Length wave', min: -1, max: 1, step: 0.01, def: 0, rand: [-0.6, 0.6] },
      { key: 'lenFreq', label: 'Wave cycles', min: 0, max: 12, step: 0.5, def: 1 },
      { key: 'notch', label: 'Inner V-notch (mm)', min: -60, max: 60, step: 0.5, def: 0 },
      { key: 'curve', label: 'Ray curve °', min: -90, max: 90, step: 0.5, def: 0, rand: [-30, 30] },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 6, step: 0.01, def: 0.1 },
    ],

    generate(p) {
      const out = { strokes: [], blobs: [], dots: [] };
      const n = Math.max(1, Math.round(p.count));
      const full = Math.abs(p.a1 - p.a0) >= 359.9;
      let e = 0;
      const ray = (a, len, r0) => {
        const pts = [], r = [];
        const steps = p.curve ? 6 : 1;
        for (let k = 0; k <= steps; k++) {
          const t = k / steps, rr = r0 + len * t, aa = a + p.curve * D2R * t * t;
          pts.push([rr * Math.cos(aa), -rr * Math.sin(aa)]);
          r.push((p.width / 2) * (1 + (p.taper - 1) * t));
          e = Math.max(e, rr + p.width);
        }
        out.strokes.push({ pts, r });
      };
      const mid = (p.a0 + p.a1) / 2;
      for (let i = 0; i < n; i++) {
        const t = full ? i / n : n > 1 ? i / (n - 1) : 0.5;
        const deg = p.a0 + (p.a1 - p.a0) * t;
        const off = deg - mid;
        if (p.gapMid && Math.abs(off) < p.gapMid / 2) continue;
        const half = Math.abs(p.a1 - p.a0) / 2 || 1;
        const u = Math.min(1, Math.abs(off) / half); // 0 at the middle, 1 at the ends
        const len = p.len * Math.max(0.05, 1 + p.lenVar * Math.cos(2 * Math.PI * p.lenFreq * t));
        const r0 = p.rIn + p.notch * (1 - u);
        const a = deg * D2R;
        const pair = p.pattern === 'pairs' || (p.pattern === 'altpair' && i % 2 === 1);
        if (pair) {
          for (const s of [-1, 1]) {
            // V-pair: two rays leaning apart, anchored close together at the inner end.
            const pts = [], r = [];
            const L = len * p.pairLen;
            const base = [r0 * Math.cos(a), -r0 * Math.sin(a)];
            const lean = a + s * p.splay * D2R;
            for (let k = 0; k <= 1; k++) {
              pts.push([base[0] + Math.cos(lean) * L * k + Math.cos(a + (s * Math.PI) / 2) * p.width * 0.1, base[1] - Math.sin(lean) * L * k - Math.sin(a + (s * Math.PI) / 2) * p.width * 0.1]);
              r.push((p.width / 2) * (1 + (p.taper - 1) * k) * 0.85);
            }
            out.strokes.push({ pts, r });
            e = Math.max(e, r0 + L + p.width);
          }
        } else ray(a, len, r0);
      }
      out.extent = e;
      return out;
    },
  };
})();
