// Glyph Grid: tiles of random dot-matrix glyphs. Each tile has a sub-grid of dots; random bridges join
// neighbouring dots. Everything goes through the shared smooth union, so "fillet" gives metaball necks.
// Mirror makes glyphs left-right symmetric; field points swell dots.
(function () {
  const SP = (window.SP = window.SP || {});

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  SP.generators.glyphs = {
    id: 'glyphs',
    name: 'Glyph Grid',
    board: true,
    tileable: true,
    schema: [
      { group: 'Tiles' },
      { key: 'sub', label: 'Dots per side', min: 1, max: 12, step: 1, def: 4, int: true, rand: [3, 6] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 80, step: 0.5, def: 25 },
      { key: 'tilesX', label: 'Repeat across', min: 1, max: 20, step: 1, def: 1, int: true },
      { key: 'tilesY', label: 'Repeat down', min: 1, max: 20, step: 1, def: 1, int: true },
      { key: 'tileGap', label: 'Repeat gap (mm)', min: 0, max: 60, step: 0.5, def: 10, show: (o) => o.tilesX > 1 || o.tilesY > 1 },
      { group: 'Glyph' },
      { key: 'fill', label: 'Dot probability', min: 0, max: 1, step: 0.01, def: 1, rand: [0.6, 1] },
      { key: 'bridge', label: 'Bridge probability', min: 0, max: 1, step: 0.01, def: 0.45, rand: [0.25, 0.7] },
      { key: 'diag', label: 'Diagonal bridges', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.3] },
      { key: 'dotR', label: 'Dot radius', min: 0.05, max: 0.7, step: 0.005, def: 0.36, rand: [0.3, 0.45] },
      { key: 'bridgeW', label: 'Bridge width', min: 0.05, max: 1, step: 0.01, def: 0.62, rand: [0.4, 1] },
      { key: 'mirror', label: 'Mirror symmetric', type: 'bool', def: false },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 16, int: true, rand: [1, 9999] },
      { group: 'Finish' },
      { key: 'fillet', label: 'Metaball fillet', min: 0.02, max: 10, step: 0.01, def: 3 },
      { key: 'fieldGain', label: 'Field points → dot size', min: -2, max: 2, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt } = ctx;
      const TX = Math.round(p.tilesX), TY = Math.round(p.tilesY), n = Math.max(1, Math.round(p.sub));
      // Tiles are sized to fill the board inside the margin (one tile = one full-board glyph).
      // Seamless: repeats span the tile exactly, with the gap split across the seam.
      const T = ctx.tile;
      let tile = Math.max(1, Math.min((B.w - 2 * p.margin - (TX - 1) * p.tileGap) / TX, (B.h - 2 * p.margin - (TY - 1) * p.tileGap) / TY));
      let pitch = tile + p.tileGap;
      if (T) { pitch = B.w / TX; tile = Math.max(1, Math.min(pitch, T.y ? B.h / TY : pitch) - p.tileGap); }
      const pitchY = T && T.y ? B.h / TY : pitch, sp = tile / n;
      const rand = rng(p.seed * 7919 + 3);
      const out = { strokes: [], blobs: [], count: TX * TY };
      const sz = (x, y) => Math.max(0, 1 + p.fieldGain * fieldAt(x, y));
      for (let ty = 0; ty < TY; ty++)
        for (let tx = 0; tx < TX; tx++) {
          const ox = (T && T.x ? (tx + 0.5) * pitch : B.w / 2 + (tx - (TX - 1) / 2) * pitch) - tile / 2 + sp / 2;
          const oy = (T && T.y ? (ty + 0.5) * pitchY : B.h / 2 + (ty - (TY - 1) / 2) * pitchY) - tile / 2 + sp / 2;
          // On/off dots (mirrored columns share decisions).
          const half = p.mirror ? Math.ceil(n / 2) : n;
          const on = [];
          let count = 0;
          for (let j = 0; j < n; j++) {
            on.push([]);
            for (let i = 0; i < n; i++) {
              const src = p.mirror && i >= half ? n - 1 - i : i;
              const v = src === i ? rand() < p.fill : on[j][src];
              on[j].push(v);
              count += v;
            }
          }
          if (!count) on[Math.floor(n / 2)][Math.floor(n / 2)] = true;
          const pos = (i, j) => [ox + i * sp, oy + j * sp];
          for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++) {
              if (!on[j][i]) continue;
              const [x, y] = pos(i, j);
              out.blobs.push({ x, y, r: p.dotR * sp * sz(x, y) });
            }
          // Bridges: decide on the left half, mirror to the right.
          const bridges = new Map();
          const link = (i, j, di, dj, prob) => {
            const i2 = i + di, j2 = j + dj;
            if (i2 < 0 || i2 >= n || j2 < 0 || j2 >= n || !on[j][i] || !on[j2][i2]) return;
            const key = `${i},${j},${di},${dj}`;
            if (bridges.has(key)) return;
            let v;
            if (p.mirror) {
              const mi = n - 1 - i2, mj = j2, mdi = di, mdj = dj; // mirrored partner of this link
              const mkey = di === 0 ? `${n - 1 - i},${j},${di},${dj}` : `${mi},${mj},${mdi},${-mdj}`;
              v = bridges.has(mkey) ? bridges.get(mkey) : rand() < prob;
              bridges.set(mkey, v);
            } else v = rand() < prob;
            bridges.set(key, v);
          };
          for (let j = 0; j < n; j++)
            for (let i = 0; i < n; i++) {
              link(i, j, 1, 0, p.bridge);
              link(i, j, 0, 1, p.bridge);
              link(i, j, 1, 1, p.diag);
              link(i, j, 1, -1, p.diag);
            }
          for (const [key, v] of bridges) {
            if (!v) continue;
            const [i, j, di, dj] = key.split(',').map(Number);
            if (i + di < 0 || i + di >= n || j + dj < 0 || j + dj >= n || !on[j][i] || !on[j + dj][i + di]) continue;
            const a = pos(i, j), b = pos(i + di, j + dj);
            const r = p.dotR * sp * p.bridgeW;
            out.strokes.push({ pts: [a, b], r: [r * sz(a[0], a[1]), r * sz(b[0], b[1])] });
          }
        }
      return out;
    },
  };
})();
