// Halftone: a dot lattice whose dot sizes sample a source image — a typed letter/word (canvas-rendered)
// or the reference image. A diffusion gradient progressively blurs and dissolves the source, so the
// letter is crisp at one side and scatters into sparse fine dots at the other.
(function () {
  const SP = (window.SP = window.SP || {});
  const N = 384; // source raster resolution

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function blur(src, r) {
    if (r < 0.5) return src;
    const tmp = new Float32Array(N * N), out = new Float32Array(N * N), R = Math.round(r);
    for (let pass = 0; pass < 3; pass++) {
      const a = pass === 0 ? src : out;
      for (let y = 0; y < N; y++) { let acc = 0; for (let k = -R; k <= R; k++) acc += a[y * N + Math.min(N - 1, Math.max(0, k))]; for (let x = 0; x < N; x++) { tmp[y * N + x] = acc / (2 * R + 1); acc += a[y * N + Math.min(N - 1, x + R + 1)] - a[y * N + Math.max(0, x - R)]; } }
      for (let x = 0; x < N; x++) { let acc = 0; for (let k = -R; k <= R; k++) acc += tmp[Math.min(N - 1, Math.max(0, k)) * N + x]; for (let y = 0; y < N; y++) { out[y * N + x] = acc / (2 * R + 1); acc += tmp[Math.min(N - 1, y + R + 1) * N + x] - tmp[Math.max(0, y - R) * N + x]; } }
    }
    return out;
  }
  const FONTS = { sans: '"Helvetica Neue", Helvetica, Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: '"JetBrains Mono", Menlo, monospace', rounded: '"Arial Rounded MT Bold", "Nunito", "Inter", sans-serif' };
  let cache = { key: null, levels: null };

  SP.generators.halftone = {
    id: 'halftone',
    name: 'Halftone',
    board: true,
    noTween: true,
    schema: [
      { group: 'Source' },
      { key: 'source', label: 'Source', type: 'select', def: 'letter', options: [['letter', 'Letter / text'], ['image', 'Reference image']], randomize: false },
      { key: 'text', label: 'Letter', type: 'text', def: 'G', show: (o) => o.source === 'letter' },
      { key: 'font', label: 'Font', type: 'select', def: 'sans', options: [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono'], ['rounded', 'Rounded']], show: (o) => o.source === 'letter', randomize: false },
      { key: 'weight', label: 'Weight', min: 100, max: 900, step: 100, def: 800, int: true, show: (o) => o.source === 'letter' },
      { key: 'size', label: 'Letter size', min: 0.1, max: 1.6, step: 0.01, def: 0.95, show: (o) => o.source === 'letter' },
      { key: 'offX', label: 'Offset X', min: -0.5, max: 0.5, step: 0.01, def: 0, show: (o) => o.source === 'letter' },
      { key: 'offY', label: 'Offset Y', min: -0.5, max: 0.5, step: 0.01, def: 0.24, show: (o) => o.source === 'letter' },
      { key: 'invert', label: 'Invert source', type: 'bool', def: false },
      { group: 'Dots' },
      { key: 'lattice', label: 'Lattice', type: 'select', def: 'square', options: [['square', 'Square'], ['hex', 'Hex']] },
      { key: 'cols', label: 'Dots across', min: 4, max: 120, step: 1, def: 22, int: true, rand: [16, 40] },
      { key: 'maxDot', label: 'Max dot size', min: 0.1, max: 0.75, step: 0.005, def: 0.46 },
      { key: 'minDot', label: 'Min dot size', min: 0, max: 0.3, step: 0.005, def: 0.05 },
      { key: 'gamma', label: 'Tone curve', min: 0.2, max: 3, step: 0.01, def: 0.9 },
      { key: 'base', label: 'Background dots', min: 0, max: 1, step: 0.01, def: 0.16 },
      { group: 'Diffusion' },
      { key: 'diffuse', label: 'Diffusion amount', min: 0, max: 1, step: 0.01, def: 0.9, rand: [0.4, 1] },
      { key: 'diffAngle', label: 'Diffusion direction °', min: -180, max: 180, step: 1, def: 90 },
      { key: 'diffStart', label: 'Diffusion start', min: -0.5, max: 0.5, step: 0.01, def: -0.45 },
      { key: 'blurMax', label: 'Max blur (× pitch)', min: 0, max: 6, step: 0.05, def: 4 },
      { key: 'streak', label: 'Streak (trails)', min: 0, max: 1.5, step: 0.01, def: 0.5 },
      { key: 'dissolve', label: 'Dissolve', min: 0, max: 1, step: 0.01, def: 0.45, rand: [0.2, 0.9] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 30, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 12 },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 4, step: 0.01, def: 0.05 },
      { key: 'fieldGain', label: 'Field points → dot size', min: -2, max: 2, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const cols = Math.max(2, Math.round(p.cols));
      const pitch = (Math.min(B.w, B.h) - 2 * p.margin) / cols;
      // Source raster covers the board square (in board mm, centred), sampled at N×N.
      const span = Math.max(B.w, B.h), ox = B.w / 2 - span / 2, oy = B.h / 2 - span / 2;
      const blurLevels = 6;
      const key = JSON.stringify([p.source, p.text, p.font, p.weight, p.size, p.offX, p.offY, p.invert, p.blurMax, cols, B.w, B.h, p.source === 'image' && SP.refImage ? SP.refImage.src.length + SP.refImage.src.slice(-40) : 0]);
      if (cache.key !== key) {
        let src = new Float32Array(N * N);
        if (typeof document !== 'undefined') {
          const cv = document.createElement('canvas');
          cv.width = cv.height = N;
          const c = cv.getContext('2d', { willReadFrequently: true });
          c.fillStyle = '#000'; c.fillRect(0, 0, N, N);
          if (p.source === 'image' && SP.refImage && SP.refImage.complete && SP.refImage.naturalWidth) {
            // Dark areas → big dots: draw the image, then use (1 - luminance).
            const im = SP.refImage, sc = Math.max(N / im.naturalWidth, N / im.naturalHeight);
            c.fillStyle = '#fff'; c.fillRect(0, 0, N, N);
            c.drawImage(im, (N - im.naturalWidth * sc) / 2, (N - im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
            const d = c.getImageData(0, 0, N, N).data;
            for (let i = 0; i < N * N; i++) src[i] = 1 - (0.3 * d[i * 4] + 0.59 * d[i * 4 + 1] + 0.11 * d[i * 4 + 2]) / 255;
          } else {
            const txt = (p.text || ' ').slice(0, 12);
            let fs = N * p.size;
            c.font = `${p.weight} ${fs}px ${FONTS[p.font] || FONTS.sans}`;
            const w = c.measureText(txt).width;
            if (w > N * 0.95) { fs *= (N * 0.95) / w; c.font = `${p.weight} ${fs}px ${FONTS[p.font] || FONTS.sans}`; }
            c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
            c.fillText(txt, N / 2 + p.offX * N, N / 2 + p.offY * N);
            const d = c.getImageData(0, 0, N, N).data;
            for (let i = 0; i < N * N; i++) src[i] = d[i * 4] / 255;
          }
        }
        if (p.invert) for (let i = 0; i < N * N; i++) src[i] = 1 - src[i];
        const pxPerMm = N / span, levels = [];
        for (let k = 0; k <= blurLevels; k++) levels.push(blur(src, (k / blurLevels) * p.blurMax * pitch * pxPerMm * 0.6));
        cache = { key, levels };
      }
      const L = cache.levels;
      const sample = (x, y, lev) => {
        const fx = ((x - ox) / span) * N - 0.5, fy = ((y - oy) / span) * N - 0.5;
        const i = Math.max(0, Math.min(N - 2, Math.floor(fx))), j = Math.max(0, Math.min(N - 2, Math.floor(fy)));
        const tx = Math.min(1, Math.max(0, fx - i)), ty = Math.min(1, Math.max(0, fy - j));
        const k0 = Math.floor(lev), k1 = Math.min(blurLevels, k0 + 1), lt = lev - k0;
        const at = (a) => (a[j * N + i] * (1 - tx) + a[j * N + i + 1] * tx) * (1 - ty) + (a[(j + 1) * N + i] * (1 - tx) + a[(j + 1) * N + i + 1] * tx) * ty;
        return at(L[k0]) * (1 - lt) + at(L[k1]) * lt;
      };
      const th = (p.diffAngle * Math.PI) / 180, dx = Math.cos(th), dy = -Math.sin(th);
      const rand = rng(p.seed * 48271 + 11);
      const rows = Math.max(1, Math.round((B.h - 2 * p.margin) / (pitch * (p.lattice === 'hex' ? 0.866 : 1))));
      const out = { strokes: [], blobs: [], count: 0 };
      const x0 = B.w / 2 - ((cols - 1) * pitch) / 2, y0 = B.h / 2 - ((rows - 1) * pitch * (p.lattice === 'hex' ? 0.866 : 1)) / 2;
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const x = x0 + (i + (p.lattice === 'hex' && j % 2 ? 0.5 : 0)) * pitch, y = y0 + j * pitch * (p.lattice === 'hex' ? 0.866 : 1);
          // Diffusion t ∈ [0,1] along the gradient direction, beginning at diffStart.
          const g = ((x - B.w / 2) / (B.w - 2 * p.margin)) * dx + ((y - B.h / 2) / (B.h - 2 * p.margin)) * dy;
          const t = Math.min(1, Math.max(0, (g - p.diffStart) / Math.max(0.05, 0.5 - p.diffStart))) * p.diffuse;
          let v = sample(x, y, t * blurLevels);
          if (p.streak > 0 && t > 0) {
            // Smear: pull tone from the crisp side back along the diffusion direction (rising trails).
            const len = p.streak * t * (B.h - 2 * p.margin) * 0.5;
            let acc = v, wsum = 1;
            for (let k = 1; k <= 8; k++) {
              const d = (len * k) / 8, wgt = 1 - k / 9;
              acc += wgt * sample(x - dx * d, y - dy * d, t * blurLevels * (1 - k / 10));
              wsum += wgt;
            }
            v = Math.max(v, acc / wsum);
          }
          v = p.base + (1 - p.base) * Math.pow(Math.min(1, Math.max(0, v)), p.gamma);
          if (points.length && p.fieldGain) v *= Math.max(0, 1 + p.fieldGain * fieldAt(x, y));
          if (rand() < p.dissolve * t * t) continue; // scatter: dots drop out where diffusion is strong
          const r = (pitch / 2) * p.maxDot * 2 * v;
          if (r < (pitch / 2) * p.minDot * 2) continue;
          out.blobs.push({ x, y, r });
        }
      out.count = out.blobs.length;
      return out;
    },
  };
})();
