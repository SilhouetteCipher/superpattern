// Log Cabin: the quilter's block of strips ("logs") sewn round a centre square, each round adding one log to
// every side so the block grows outward like a spiral. The block is split on its diagonal: the logs on two
// adjacent sides are light, on the other two dark, so each block reads as a dark triangle of nested L's.
// The design lives in the setting — how blocks are turned on the quilt. Light & dark turns them all one
// way; Barn Raising points each block's dark corner out or in by diamond ring (|i| + |j| from the centre)
// so the halves meet as concentric diamonds; Straight Furrow alternates by diagonal (i − j) for diagonal
// stripes; Streak of Lightning mirrors alternate columns of that into zigzags; Diamonds turns every 2 × 2
// group's dark corners inward; Windmill rotates them a quarter turn round the group. Curvy log cabin uses
// dark logs wider than light ones (here `curve`), which pushes the centre toward the light corner and makes
// the straight bands read as curves; field points add to it locally. Courthouse Steps lays logs on
// opposite sides instead (light top and bottom, dark left and right). Only dark logs (and the centre) are
// raised unless light logs are switched on; each log is a rounded rectangle inset by half the seam, and a
// round's two dark logs can be joined into one filleted L.
(function () {
  const SP = (window.SP = window.SP || {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Signed distance to an axis-aligned box [cx, cy, hx, hy, r] with corners rounded by r.
  function sdBox(x, y, b) {
    const qx = Math.abs(x - b[0]) - b[2] + b[4], qy = Math.abs(y - b[1]) - b[3] + b[4];
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - b[4];
  }
  const sdRect = (x, y, x0, y0, x1, y1, r) => sdBox(x, y, [(x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2)]);

  // Which corner of block (i, j) is dark, as [sx, sy] with y down; u, v are the block's offsets from centre.
  function darkCorner(setting, i, j, u, v) {
    switch (setting) {
      case 'barn': {
        const qx = u >= 0 ? 1 : -1, qy = v >= 0 ? 1 : -1, n = Math.floor(Math.abs(u)) + Math.floor(Math.abs(v));
        return n % 2 ? [-qx, -qy] : [qx, qy];
      }
      case 'furrow': return (i - j) % 2 ? [1, -1] : [-1, 1];
      case 'lightning': {
        const c = (i - j) % 2 ? [1, -1] : [-1, 1];
        return i % 2 ? [c[0], -c[1]] : c;
      }
      case 'diamonds': return [i % 2 ? -1 : 1, j % 2 ? -1 : 1];
      case 'windmill': return [[1, -1], [1, 1], [-1, 1], [-1, -1]][[0, 1, 3, 2][(i % 2) + 2 * (j % 2)]];
      default: return [-1, 1];
    }
  }

  // One block's logs in local coords (centred on 0,0, dark corner at bottom-left = (−x, +y)), as rectangles
  // [x0, y0, x1, y1, dark, round]. `round` numbers the rings so joined pairs can be found.
  function blockLogs(kind, S, k, c, w, curve) {
    const logs = [];
    if (kind === 'courthouse') {
      // Light logs top and bottom, dark left and right; the block stays square, so curve stretches the centre.
      const wD = w * (1 + curve), wL = w * (1 - curve), cx = S - 2 * k * wD, cy = S - 2 * k * wL;
      let x0 = -cx / 2, x1 = cx / 2, y0 = -cy / 2, y1 = cy / 2;
      const centre = [x0, y0, x1, y1];
      for (let r = 0; r < k; r++) {
        logs.push([x0, y0 - wL, x1, y0, 0, r], [x0, y1, x1, y1 + wL, 0, r]);
        y0 -= wL; y1 += wL;
        logs.push([x0 - wD, y0, x0, y1, 1, r], [x1, y0, x1 + wD, y1, 1, r]);
        x0 -= wD; x1 += wD;
      }
      return { logs, centre };
    }
    // Standard: light on top then right, dark on bottom then left; recentre since the two halves differ in width.
    const wD = w * (1 + curve), wL = w * (1 - curve), ox = (k * (wL - wD)) / 2, oy = (k * (wD - wL)) / 2;
    let x0 = -c / 2 - ox, x1 = c / 2 - ox, y0 = -c / 2 - oy, y1 = c / 2 - oy;
    const centre = [x0, y0, x1, y1];
    for (let r = 0; r < k; r++) {
      logs.push([x0, y0 - wL, x1, y0, 0, r]); y0 -= wL;
      logs.push([x1, y0, x1 + wL, y1, 0, r]); x1 += wL;
      logs.push([x0, y1, x1, y1 + wD, 1, r]); y1 += wD;
      logs.push([x0 - wD, y0, x0, y1, 1, r]); x0 -= wD;
    }
    return { logs, centre };
  }

  let cache = { key: null };

  SP.generators.logcabin = {
    id: 'logcabin',
    name: 'Log Cabin',
    board: true,
    schema: [
      { group: 'Quilt' },
      { key: 'setting', label: 'Setting', type: 'select', def: 'barn', options: [['plain', 'Light & dark'], ['barn', 'Barn raising'], ['furrow', 'Straight furrow'], ['lightning', 'Streak of lightning'], ['diamonds', 'Diamonds'], ['windmill', 'Windmill']] },
      { key: 'block', label: 'Block', type: 'select', def: 'standard', options: [['standard', 'Log cabin'], ['courthouse', 'Courthouse steps']] },
      { key: 'cols', label: 'Blocks across', min: 1, max: 16, step: 1, def: 6, int: true, rand: [4, 7] },
      { key: 'rounds', label: 'Rounds', min: 1, max: 8, step: 1, def: 4, int: true, rand: [2, 4] },
      { key: 'centre', label: 'Centre size', min: 0.05, max: 0.5, step: 0.01, def: 0.2, rand: [0.12, 0.3] },
      { key: 'shuffle', label: 'Random turns', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.2] },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 11, int: true, rand: [1, 9999] },
      { group: 'Logs' },
      { key: 'curve', label: 'Curve (dark : light width)', min: -0.6, max: 0.6, step: 0.01, def: 0, rand: [-0.1, 0.45] },
      { key: 'fieldCurve', label: 'Field points → curve', min: -1, max: 1, step: 0.01, def: 0.5 },
      { key: 'gap', label: 'Seam (mm)', min: 0.6, max: 5, step: 0.05, def: 1.2, rand: [0.9, 2] },
      { key: 'round', label: 'Corner round (mm)', min: 0, max: 4, step: 0.05, def: 0.6, rand: [0.2, 1.2] },
      { key: 'join', label: 'Join dark pairs into L', type: 'bool', def: true },
      { key: 'light', label: 'Light logs', type: 'select', def: 'off', options: [['off', 'Off (recessed)'], ['on', 'Raised'], ['thin', 'Raised, slimmer']] },
      { key: 'core', label: 'Centre', type: 'select', def: 'square', options: [['square', 'Square'], ['circle', 'Circle'], ['none', 'None']] },
      { group: 'Frame' },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { key: 'sashing', label: 'Sashing (mm)', min: 0, max: 12, step: 0.1, def: 0, rand: [0, 3] },
      { key: 'border', label: 'Border (mm)', min: 0, max: 20, step: 0.1, def: 0, rand: [0, 5] },
    ],

    generateBoard(p, ctx) {
      const { board: Bd, fieldAt, points } = ctx;
      const g = p.gap / 2, F = Math.max(0, p.border);
      const m = Math.min(p.margin, Math.min(Bd.w, Bd.h) / 2 - 5);
      // Blocks fill the frame less the border (and a seam inside it); the border then hugs the blocks.
      const inset = m + (F > 0 ? F + p.gap : 0);
      const W = Math.max(10, Bd.w - 2 * inset), H = Math.max(10, Bd.h - 2 * inset), sh = Math.max(0, p.sashing);
      const C = Math.max(1, Math.round(p.cols));
      let S = (W - (C - 1) * sh) / C;
      const R = Math.max(1, Math.round((H + sh) / (S + sh)));
      S = Math.min(S, (H - (R - 1) * sh) / R);
      const P = S + sh, qx0 = (Bd.w - (C * S + (C - 1) * sh)) / 2, qy0 = (Bd.h - (R * S + (R - 1) * sh)) / 2;
      const qx1 = Bd.w - qx0, qy1 = Bd.h - qy0;

      const key = JSON.stringify([p.setting, p.block, C, p.rounds, p.centre, p.shuffle, p.seed, p.curve, p.fieldCurve, p.gap, p.round, p.join, p.light, p.core, m, sh, F, Bd.w, Bd.h, p.fieldCurve ? points : 0]);
      if (cache.key !== key) {
        const rand = rng(p.seed * 2654435761);
        const k = Math.max(1, Math.round(p.rounds));
        const c = clamp(p.centre, 0.02, 0.9) * S, w = (S - c) / (2 * k);
        const thin = p.light === 'thin' ? Math.min(w * 0.3, 1.2) : 0;
        const blocks = [];
        let count = 0;
        for (let j = 0; j < R; j++)
          for (let i = 0; i < C; i++) {
            const bx = qx0 + i * P + S / 2, by = qy0 + j * P + S / 2;
            // Each block draws its random numbers in a fixed order so changing shuffle never reshuffles which turn.
            const rTurn = rand(), rCorner = rand();
            let [sx, sy] = darkCorner(p.setting, i, j, i - (C - 1) / 2, j - (R - 1) / 2);
            if (rTurn < p.shuffle) [sx, sy] = [[1, 1], [1, -1], [-1, -1], [-1, 1]][Math.floor(rCorner * 4)];
            let cv = p.curve + (p.fieldCurve && points.length ? p.fieldCurve * (fieldAt(bx, by) || 0) : 0);
            // Courthouse keeps the centre at least a tenth of the block wide whichever way curve stretches it.
            const lim = p.block === 'courthouse' ? Math.max(0, (c - 0.1 * S) / Math.max(1e-6, S - c)) : 0.8;
            cv = clamp(cv, -Math.min(0.8, lim), Math.min(0.8, lim));
            const { logs, centre } = blockLogs(p.block, S, k, c, w, cv);
            // Local → world: courthouse turns its dark axis by the corner's diagonal; standard mirrors (−x, +y) onto it.
            const tf = p.block === 'courthouse'
              ? (sx * sy < 0 ? (r) => [r[0], r[1], r[2], r[3]] : (r) => [r[1], r[0], r[3], r[2]])
              : (r) => { const ax = -sx * r[0], bx2 = -sx * r[2], ay = sy * r[1], by2 = sy * r[3]; return [Math.min(ax, bx2), Math.min(ay, by2), Math.max(ax, bx2), Math.max(ay, by2)]; };
            const world = (r) => { const t = tf(r); return [bx + t[0], by + t[1], bx + t[2], by + t[3]]; };
            const box = (t, extra) => {
              const hx = (t[2] - t[0]) / 2 - g - extra, hy = (t[3] - t[1]) / 2 - g - extra;
              if (hx < 0.3 || hy < 0.3) return null;
              return [(t[0] + t[2]) / 2, (t[1] + t[3]) / 2, hx, hy, Math.min(p.round, hx - 0.05, hy - 0.05)];
            };
            const pieces = [];
            const add = (list, extra) => {
              // A joined pair is one L: its bounding box less the notch the two logs wrap round. The notch is
              // grown by the seam and rounded, which fillets the L's inside corner.
              if (p.join && p.block !== 'courthouse' && list.length === 2) {
                const [a, b] = list, a2 = a[0] === b[2] ? [b[0], a[1], a[2], a[3]] : [a[0], a[1], b[2], a[3]];
                const A = world(a2), Bw = world(b), bb = [Math.min(A[0], Bw[0]), Math.min(A[1], Bw[1]), Math.max(A[2], Bw[2]), Math.max(A[3], Bw[3])];
                const outer = box(bb, extra), e = g + extra, far = S;
                const nx = Bw[0] === bb[0] ? [Bw[2] - e, bb[2] + far] : [bb[0] - far, Bw[0] + e];
                const ny = A[1] === bb[1] ? [A[3] - e, bb[3] + far] : [bb[1] - far, A[1] + e];
                const thick = Math.min(Bw[2] - Bw[0], A[3] - A[1]) - 2 * e;
                if (outer && thick >= 0.6) {
                  pieces.push([outer, [(nx[0] + nx[1]) / 2, (ny[0] + ny[1]) / 2, (nx[1] - nx[0]) / 2, (ny[1] - ny[0]) / 2, Math.min(p.round, thick * 0.5)]]);
                  return;
                }
              }
              for (const l of list) { const b = box(world(l), extra); if (b) pieces.push([b]); }
            };
            for (let r = 0; r < k; r++) {
              add(logs.filter((l) => l[5] === r && l[4] === 1), 0);
              if (p.light !== 'off') add(logs.filter((l) => l[5] === r && l[4] === 0), thin);
            }
            if (p.core !== 'none') {
              const b = box(world(centre), 0);
              if (b) {
                if (p.core === 'circle') { const rr = Math.min(b[2], b[3]); b[2] = b[3] = b[4] = rr; }
                pieces.push([b]);
              }
            }
            count += pieces.length;
            blocks.push(pieces);
          }
        cache = { key, blocks, count };
      }
      const { blocks } = cache;
      // Border band round the blocks, a seam outside them.
      const bo = [qx0 - p.gap - F, qy0 - p.gap - F, qx1 + p.gap + F, qy1 + p.gap + F];
      const evalFn = (x, y) => {
        const ci = clamp(Math.floor((x - qx0) / P), 0, C - 1), cj = clamp(Math.floor((y - qy0) / P), 0, R - 1);
        let d = P;
        for (let j = Math.max(0, cj - 1); j <= Math.min(R - 1, cj + 1); j++)
          for (let i = Math.max(0, ci - 1); i <= Math.min(C - 1, ci + 1); i++)
            for (const pc of blocks[j * C + i]) {
              let v = sdBox(x, y, pc[0]);
              if (pc.length > 1) v = Math.max(v, -sdBox(x, y, pc[1]));
              if (v < d) d = v;
            }
        if (F > 0) {
          const o = sdRect(x, y, bo[0], bo[1], bo[2], bo[3], p.round * 2 + F);
          d = Math.min(d, Math.max(o, -(o + F)));
        }
        return d;
      };
      const pad = 3, ex = F > 0 ? p.gap + F : 0;
      return { evalFn, domain: { x0: qx0 - ex - pad, y0: qy0 - ex - pad, x1: qx1 + ex + pad, y1: qy1 + ex + pad }, count: cache.count };
    },
  };
})();
