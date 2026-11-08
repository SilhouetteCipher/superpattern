// Circuit: printed-circuit-board trace art, routed by the rules a PCB designer follows rather than drawn freehand.
// Traces live on a square node grid and only ever run octilinear (0°, 45°, 90°, …), turning 45° at a time with
// at least two straight steps between turns, so every bend can be mitred into a smooth arc. Two traces may never
// share a node, and two diagonals may never cross inside the same grid square, so copper never touches copper.
// Each trace is a seeded random walk that runs straight with probability "Straightness" and stops when it is
// blocked or reaches its length; walks shorter than "Min length" are ripped up. A bus routes several lanes as
// translated copies of one walk, so they run side by side through every bend. Chips are rounded-rectangle
// footprints whose pins on the long sides fan traces outward. Free trace ends finish in round pads or drilled
// vias (a pad with a hole carved through, ring never thinner than 0.6 mm); field points swell the pads. Pad and
// trace sizes are clamped against the pitch so the tightest case (a pad beside a diagonal one node away) still
// keeps "Min gap" of clearance.
(function () {
  const SP = (window.SP = window.SP || {});
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // The eight octilinear steps, counter-clockwise from east (grid y runs down the board).
  const DIRS = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]];

  // Node path → polyline with every turn replaced by a quadratic blend cut back `cut` mm along both legs.
  function rounded(path, cut) {
    if (path.length < 3 || cut <= 0) return path.map((q) => [q[0], q[1]]);
    const out = [[path[0][0], path[0][1]]];
    for (let i = 1; i + 1 < path.length; i++) {
      const A = path[i - 1], P = path[i], C = path[i + 1];
      const ax = A[0] - P[0], ay = A[1] - P[1], cx = C[0] - P[0], cy = C[1] - P[1];
      const la = Math.hypot(ax, ay), lc = Math.hypot(cx, cy);
      if (Math.abs(ax * cy - ay * cx) < 1e-9 * la * lc) { out.push([P[0], P[1]]); continue; }
      const u = Math.min(cut, la / 2) / la, w = Math.min(cut, lc / 2) / lc;
      const S = [P[0] + ax * u, P[1] + ay * u], E = [P[0] + cx * w, P[1] + cy * w];
      const n = 6;
      for (let k = 0; k <= n; k++) {
        const t = k / n, s = 1 - t;
        out.push([s * s * S[0] + 2 * s * t * P[0] + t * t * E[0], s * s * S[1] + 2 * s * t * P[1] + t * t * E[1]]);
      }
    }
    out.push([path[path.length - 1][0], path[path.length - 1][1]]);
    return out;
  }

  SP.generators.circuit = {
    id: 'circuit',
    name: 'Circuit',
    board: true,
    schema: [
      { group: 'Grid' },
      { key: 'pitch', label: 'Pitch (mm)', min: 2.5, max: 20, step: 0.1, def: 5, rand: [4, 7.5] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 42, int: true, rand: [1, 9999] },
      { group: 'Routing' },
      { key: 'density', label: 'Density', min: 0.05, max: 1, step: 0.01, def: 0.7, rand: [0.4, 1] },
      { key: 'straight', label: 'Straightness', min: 0.3, max: 0.98, step: 0.01, def: 0.8, rand: [0.6, 0.92] },
      { key: 'minLen', label: 'Min length (steps)', min: 2, max: 40, step: 1, def: 5, int: true, rand: [3, 8] },
      { key: 'maxLen', label: 'Max length (steps)', min: 4, max: 200, step: 1, def: 40, int: true, rand: [15, 70] },
      { key: 'bus', label: 'Bus lanes', min: 1, max: 6, step: 1, def: 3, int: true, rand: [1, 4] },
      { key: 'chips', label: 'Chips', min: 0, max: 6, step: 1, def: 2, int: true, rand: [0, 3] },
      { group: 'Copper' },
      { key: 'trace', label: 'Trace width (mm)', min: 0.6, max: 8, step: 0.05, def: 1.4, rand: [1, 2] },
      { key: 'pad', label: 'Pad diameter (mm)', min: 0.6, max: 14, step: 0.05, def: 3.2, rand: [2.4, 4.2] },
      { key: 'ends', label: 'Trace ends', type: 'select', def: 'mixed', options: [['pad', 'Pads'], ['via', 'Vias (drilled)'], ['mixed', 'Pads and vias'], ['none', 'Round ends']] },
      { key: 'hole', label: 'Via hole (mm)', min: 0, max: 8, step: 0.05, def: 1.2, rand: [0.8, 1.6] },
      { key: 'corner', label: 'Bend round', min: 0, max: 1, step: 0.01, def: 0.7, rand: [0.3, 1] },
      { group: 'Field points' },
      { key: 'fieldPad', label: 'Points → pad size', min: -1, max: 1, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 11);
      const pitch = Math.max(2.5, p.pitch), gap = 0.6, diag = pitch / Math.SQRT2;
      // Parallel diagonals one node apart sit pitch/√2 apart; a pad beside a diagonal is the tightest fit.
      const tr = clamp(p.trace / 2, 0.3, (diag - gap) / 2);
      const padMax = Math.max(tr, Math.min((pitch - gap) / 2, diag - tr - gap));
      const pr0 = clamp(p.pad / 2, tr, padMax);
      const out = { strokes: [], blobs: [], cuts: [], count: 0, k: Math.min(0.4, tr * 0.5), ks: 0.15 };

      const mg = Math.max(0, p.margin) + padMax;
      const nx = Math.floor((B.w - 2 * mg) / pitch) + 1, ny = Math.floor((B.h - 2 * mg) / pitch) + 1;
      if (nx < 3 || ny < 3) return out;
      const ox = (B.w - (nx - 1) * pitch) / 2, oy = (B.h - (ny - 1) * pitch) / 2;
      const X = (i) => ox + i * pitch, Y = (j) => oy + j * pitch;
      const used = new Uint8Array(nx * ny); // 1 = copper on the node
      const diagUsed = new Uint8Array(nx * ny); // a diagonal crosses the square whose top-left node is this
      const inGrid = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny;
      const free = (i, j) => inGrid(i, j) && !used[j * nx + i];
      const sq = (i, j, d) => Math.min(j, j + DIRS[d][1]) * nx + Math.min(i, i + DIRS[d][0]);
      const canStep = (i, j, d) => {
        const ni = i + DIRS[d][0], nj = j + DIRS[d][1];
        if (!free(ni, nj)) return false;
        return d % 2 === 0 || !diagUsed[sq(i, j, d)];
      };
      const claim = (path) => {
        for (let k = 0; k < path.length; k++) {
          used[path[k].j * nx + path[k].i] = 1;
          if (k && path[k].d % 2) diagUsed[sq(path[k - 1].i, path[k - 1].j, path[k].d)] = 1;
        }
      };

      // ---- Chips: frame through the outer nodes, pins on the long sides fan outward ----
      const starts = []; // { i, j, d, pinned }
      const minLen = Math.max(2, Math.round(p.minLen));
      const maxLen = Math.max(minLen, Math.round(p.maxLen));
      const nChips = Math.max(0, Math.round(p.chips));
      for (let c = 0, tries = 0; c < nChips && tries < 60; tries++) {
        const w = 3 + Math.floor(rand() * 5), h = 2 + Math.floor(rand() * 3);
        const horiz = rand() < 0.5, cw = horiz ? w : h, ch = horiz ? h : w;
        if (cw + 4 >= nx || ch + 4 >= ny) continue;
        const a = 2 + Math.floor(rand() * (nx - cw - 4)), b = 2 + Math.floor(rand() * (ny - ch - 4));
        let ok = true;
        for (let j = b - 2; j <= b + ch + 2 && ok; j++) for (let i = a - 2; i <= a + cw + 2; i++) if (!free(i, j)) { ok = false; break; }
        if (!ok) continue;
        for (let j = b; j <= b + ch; j++) for (let i = a; i <= a + cw; i++) used[j * nx + i] = 1;
        // Rounded-rectangle frame through the chip's outer nodes, a closed stroke.
        const rc = Math.min(pitch * 0.5, (Math.min(cw, ch) * pitch) / 2);
        const L = X(a), R = X(a + cw), T = Y(b), Bt = Y(b + ch);
        const M = (L + R) / 2, frame = rounded([[M, T], [R, T], [R, Bt], [L, Bt], [L, T], [M, T]], rc);
        out.strokes.push({ pts: frame, r: frame.map(() => tr) });
        // Pin-1 marker inside the frame, clear of it by the gap.
        const mr = Math.min(pitch * 0.3, Math.min(cw, ch) * pitch * 0.25);
        const mo = tr + gap + mr + rc * 0.3;
        if (mr >= 0.3) out.blobs.push({ x: L + mo, y: T + mo, r: mr });
        if (horiz) for (let i = a + 1; i < a + cw; i++) { starts.push({ i, j: b, d: 2, pinned: true }); starts.push({ i, j: b + ch, d: 6, pinned: true }); }
        else for (let j = b + 1; j < b + ch; j++) { starts.push({ i: a, j, d: 4, pinned: true }); starts.push({ i: a + cw, j, d: 0, pinned: true }); }
        out.count++; c++;
      }

      // ---- Random walk router ----
      // Walk from (i, j) heading d; returns a list of { i, j, d } steps (the start included, d = arrival dir).
      const walk = (i, j, d, target) => {
        const path = [{ i, j, d }];
        let run = 0;
        for (let s = 0; s < target; s++) {
          let nd = d;
          if (run >= 2 && rand() > p.straight) nd = (d + (rand() < 0.5 ? 1 : 7)) % 8;
          const tryOrder = nd === d ? [d] : [nd, d];
          if (run >= 2 && nd === d) tryOrder.push((d + 1) % 8, (d + 7) % 8); // blocked straight: try to bend round
          let moved = false;
          for (const t of tryOrder) {
            if (!canStep(i, j, t)) continue;
            // Mark the step tentatively so the walk can't cross its own diagonals.
            if (t % 2) diagUsed[sq(i, j, t)] = 2;
            i += DIRS[t][0]; j += DIRS[t][1];
            used[j * nx + i] = 2;
            run = t === d ? run + 1 : 1;
            d = t; path.push({ i, j, d }); moved = true; break;
          }
          if (!moved) break;
        }
        return path;
      };
      // Undo tentative marks (value 2) of a path, keeping the start node as it was.
      const release = (path, startWas) => {
        for (let k = 1; k < path.length; k++) {
          used[path[k].j * nx + path[k].i] = 0;
          if (path[k].d % 2) diagUsed[sq(path[k - 1].i, path[k - 1].j, path[k].d)] = 0;
        }
        used[path[0].j * nx + path[0].i] = startWas;
      };
      // Replay a move sequence from a translated start; stops at the first blocked step.
      const replay = (i, j, moves) => {
        if (!free(i, j)) return null;
        const path = [{ i, j, d: moves[0] }];
        used[j * nx + i] = 2;
        for (const t of moves) {
          if (!canStep(i, j, t)) break;
          if (t % 2) diagUsed[sq(i, j, t)] = 2;
          i += DIRS[t][0]; j += DIRS[t][1];
          used[j * nx + i] = 2;
          path.push({ i, j, d: t });
        }
        return path;
      };

      const routes = []; // { path, pinned }
      const accept = (path, pinned) => { claim(path); routes.push({ path, pinned }); };
      for (const s of starts) {
        const target = minLen + Math.floor(rand() * (maxLen - minLen + 1));
        const path = walk(s.i, s.j, s.d, target);
        if (path.length - 1 >= Math.min(minLen, 3)) accept(path, true);
        else release(path, 1);
      }
      const lanes = Math.max(1, Math.round(p.bus));
      const attempts = Math.round(clamp(p.density, 0, 1) * nx * ny * 0.12) + 1;
      for (let a = 0; a < attempts; a++) {
        const i = Math.floor(rand() * nx), j = Math.floor(rand() * ny);
        if (!free(i, j)) continue;
        const d = Math.floor(rand() * 8);
        const target = minLen + Math.floor(rand() * (maxLen - minLen + 1));
        used[j * nx + i] = 2;
        const lead = walk(i, j, d, target);
        if (lead.length - 1 < minLen) { release(lead, 0); continue; }
        accept(lead, false);
        // Bus lanes: translated copies of the lead's moves, alternating either side of it.
        const nl = lanes > 1 && rand() < 0.75 ? 1 + Math.floor(rand() * lanes) : 1;
        if (nl < 2) continue;
        const moves = lead.slice(1).map((q) => q.d);
        const px = -DIRS[d][1], py = DIRS[d][0];
        const pq = Math.abs(px) + Math.abs(py) === 2 ? [Math.sign(px - py) || px, 0] : [px, py]; // diagonal heading: step along one axis
        for (let k = 1, side = 1, dist = 1; k < nl; k++) {
          const li = i + pq[0] * side * dist, lj = j + pq[1] * side * dist;
          const lane = replay(li, lj, moves);
          if (lane && lane.length - 1 >= minLen) accept(lane, false);
          else if (lane) release(lane, 0);
          if (side < 0) dist++;
          side = -side;
        }
      }

      // ---- Copper ----
      const cut = clamp(p.corner, 0, 1) * pitch * 0.5;
      let viaToggle = 0;
      const endCap = (q) => {
        if (p.ends === 'none') return;
        const x = X(q.i), y = Y(q.j);
        const f = points.length && p.fieldPad ? fieldAt(x, y) * p.fieldPad : 0;
        const r = clamp(pr0 * (1 + f), tr, padMax);
        out.blobs.push({ x, y, r });
        const via = p.ends === 'via' || (p.ends === 'mixed' && (viaToggle++ % 3 === 0));
        const hr = Math.min(p.hole / 2, r - gap);
        if (via && hr >= 0.3) out.cuts.push({ pts: [[x, y], [x, y]], r: [hr, hr] });
      };
      for (const { path, pinned } of routes) {
        const pts = rounded(path.map((q) => [X(q.i), Y(q.j)]), cut);
        out.strokes.push({ pts, r: pts.map(() => tr) });
        if (!pinned) endCap(path[0]);
        endCap(path[path.length - 1]);
        out.count++;
      }
      return out;
    },
  };
})();
