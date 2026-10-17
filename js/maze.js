// Maze: perfect mazes carved by a "growing tree" on a square grid or a circular theta grid (rings of
// cells subdivided outward so cells stay roughly square, as in Jamis Buck's polar grids). The carver
// keeps a list of active cells; "Branching" blends between always taking the newest cell (recursive
// backtracker: long winding corridors) and a random one (Prim-like: short, bushy dead ends), and
// "Straightness" prefers carving onward in the direction the cell was entered. "Braid" knocks dead ends
// through into loops. Drawn as walls, every wall of a perfect maze is one tree hanging off the outer
// frame, so the relief is a single connected piece; drawn as paths, the passage tree is the shape.
(function () {
  const SP = (window.SP = window.SP || {});
  const TAU = Math.PI * 2;

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Square grid: cell k = j*C + i. Neighbour list entries are [cell, dir] with dir 0 E, 1 S, 2 W, 3 N.
  function squareGrid(C, R) {
    const nb = [];
    for (let j = 0; j < R; j++)
      for (let i = 0; i < C; i++) {
        const l = [];
        if (i < C - 1) l.push([j * C + i + 1, 0]);
        if (j < R - 1) l.push([(j + 1) * C + i, 1]);
        if (i > 0) l.push([j * C + i - 1, 2]);
        if (j > 0) l.push([(j - 1) * C + i, 3]);
        nb.push(l);
      }
    return { nb, n: C * R };
  }

  // Theta grid: ring 0 is one centre cell; ring i splits each cell of ring i-1 into round(width/height)
  // children. dir 0 cw, 1 out, 2 ccw, 3 in (so "straight" means the same dir again, like the square grid).
  function thetaGrid(R) {
    const counts = [1];
    for (let i = 1; i < R; i++) {
      const prev = counts[i - 1];
      counts.push(prev * Math.max(1, Math.round((TAU * i) / prev)));
    }
    const start = [];
    let n = 0;
    for (const c of counts) { start.push(n); n += c; }
    const id = (i, j) => start[i] + (((j % counts[i]) + counts[i]) % counts[i]);
    const nb = [];
    for (let i = 0; i < R; i++)
      for (let j = 0; j < counts[i]; j++) {
        const l = [];
        if (i > 0 && counts[i] > 1) { l.push([id(i, j + 1), 0]); l.push([id(i, j - 1), 2]); }
        if (i > 0) l.push([id(i - 1, Math.floor((j * counts[i - 1]) / counts[i])), 3]);
        if (i < R - 1) {
          const k = counts[i + 1] / counts[i];
          for (let c = 0; c < k; c++) l.push([id(i + 1, j * k + c), 1]);
        }
        nb.push(l);
      }
    return { nb, n, counts, start, id };
  }

  // Growing tree over any neighbour graph → set of carved links "a,b" (a < b).
  function carve(g, p, rand) {
    const links = new Set();
    const key = (a, b) => (a < b ? a + ',' + b : b + ',' + a);
    const seen = new Uint8Array(g.n), lastDir = new Int8Array(g.n).fill(-1);
    const first = Math.floor(rand() * g.n);
    const active = [first];
    seen[first] = 1;
    while (active.length) {
      const ai = rand() < p.branch ? Math.floor(rand() * active.length) : active.length - 1;
      const c = active[ai];
      const open = g.nb[c].filter(([q]) => !seen[q]);
      if (!open.length) { active.splice(ai, 1); continue; }
      let pick = open[Math.floor(rand() * open.length)];
      const ahead = open.filter(([, d]) => d === lastDir[c]);
      if (ahead.length && rand() < p.straight) pick = ahead[Math.floor(rand() * ahead.length)];
      const [q, d] = pick;
      links.add(key(c, q));
      seen[q] = 1;
      lastDir[q] = d;
      active.push(q);
    }
    // Braid: knock a fraction of dead ends through to a neighbour, preferring another dead end.
    if (p.braid > 0) {
      const deg = new Int32Array(g.n);
      for (const k of links) { const [a, b] = k.split(',').map(Number); deg[a]++; deg[b]++; }
      for (let c = 0; c < g.n; c++) {
        if (deg[c] !== 1 || rand() >= p.braid) continue;
        const cand = g.nb[c].filter(([q]) => !links.has(key(c, q)));
        if (!cand.length) continue;
        const dead = cand.filter(([q]) => deg[q] === 1);
        const [q] = (dead.length ? dead : cand)[Math.floor(rand() * (dead.length ? dead : cand).length)];
        links.add(key(c, q));
        deg[c]++; deg[q]++;
      }
    }
    return { has: (a, b) => links.has(key(a, b)), links };
  }

  SP.generators.maze = {
    id: 'maze',
    name: 'Maze',
    board: true,
    schema: [
      { group: 'Grid' },
      { key: 'grid', label: 'Grid', type: 'select', def: 'square', options: [['square', 'Square'], ['theta', 'Circular (theta)']] },
      { key: 'cols', label: 'Columns (square)', min: 3, max: 40, step: 1, def: 15, int: true, rand: [9, 22] },
      { key: 'rows', label: 'Rows / rings', min: 3, max: 40, step: 1, def: 15, int: true, rand: [7, 18] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 60, step: 0.5, def: 8 },
      { group: 'Carve' },
      { key: 'branch', label: 'Branching', min: 0, max: 1, step: 0.01, def: 0.15, rand: [0, 0.8] },
      { key: 'straight', label: 'Straightness', min: 0, max: 1, step: 0.01, def: 0.3, rand: [0, 0.8] },
      { key: 'braid', label: 'Braid (loops)', min: 0, max: 1, step: 0.01, def: 0, rand: [0, 0.4] },
      { key: 'doors', label: 'Entrance & exit', type: 'bool', def: true },
      { key: 'seed', label: 'Seed', min: 1, max: 9999, step: 1, def: 42, int: true, rand: [1, 9999] },
      { group: 'Draw' },
      { key: 'draw', label: 'Draw', type: 'select', def: 'walls', options: [['walls', 'Walls'], ['paths', 'Passages']] },
      { key: 'width', label: 'Width (× cell)', min: 0.08, max: 0.8, step: 0.01, def: 0.3, rand: [0.2, 0.5] },
      { key: 'fillet', label: 'Fillet', min: 0.02, max: 3, step: 0.01, def: 0.4, rand: [0.15, 1.2] },
      { key: 'fieldWidth', label: 'Points → width', min: -1, max: 1, step: 0.01, def: 0.5 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const rand = rng(p.seed * 2654435761 + 7);
      const mg = Math.max(0, p.margin);
      const W = Math.max(1, B.w - 2 * mg), H = Math.max(1, B.h - 2 * mg);
      const cx = B.w / 2, cy = B.h / 2;
      const walls = p.draw !== 'paths';
      const out = { strokes: [], blobs: [], count: 0 };
      let cell; // mm per cell
      const rad = (x, y) => {
        let k = 1;
        if (points.length && p.fieldWidth) k += p.fieldWidth * fieldAt(x, y);
        return Math.max(0.3, (Math.min(0.85, Math.max(0.05, p.width * k)) * cell) / 2);
      };
      const push = (pts) => {
        if (pts.length < 2) return;
        out.strokes.push({ pts, r: pts.map((q) => rad(q[0], q[1])) });
      };

      if (p.grid === 'theta') {
        const R = Math.max(3, Math.min(40, Math.round(p.rows)));
        const g = thetaGrid(R);
        const M = carve(g, p, rand);
        const Ro = Math.min(W, H) / 2;
        cell = Ro / R;
        const ang = (i, j) => (TAU * j) / g.counts[i] - Math.PI / 2;
        // Arc from a0 to a1 at radius r, sampled so chords stay short.
        const arc = (r, a0, a1) => {
          const n = Math.max(1, Math.ceil((Math.abs(a1 - a0) * r) / Math.min(2, cell * 0.4)));
          const pts = [];
          for (let k = 0; k <= n; k++) { const a = a0 + ((a1 - a0) * k) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
          return pts;
        };
        const door = p.doors ? g.id(R - 1, Math.floor(rand() * g.counts[R - 1])) : -1;
        if (walls) {
          // Arc walls on each ring radius r_i (between ring i-1 and i, plus the frame at r_R), merged into runs.
          for (let i = 1; i <= R; i++) {
            const n = i < R ? g.counts[i] : g.counts[R - 1];
            const ring = i < R ? i : R - 1;
            const on = [];
            for (let j = 0; j < n; j++) {
              const c = g.id(ring, j);
              on.push(i < R ? !M.has(c, g.nb[c].find(([, d]) => d === 3)[0]) : c !== door);
            }
            const r = i * cell;
            if (on.every(Boolean)) {
              const pts = arc(r, -Math.PI / 2, TAU - Math.PI / 2);
              pts[pts.length - 1] = pts[0];
              push(pts);
              continue;
            }
            const s0 = on.indexOf(false); // start scanning just after a gap so runs don't wrap
            for (let t = 1, run = -1; t <= n; t++) {
              const j = (s0 + t) % n, live = t < n && on[j];
              if (live && run < 0) run = s0 + t;
              if (!live && run >= 0) { push(arc(r, ang(ring, run), ang(ring, s0 + t))); run = -1; }
            }
          }
          // Radial walls: the ccw side of each cell in rings ≥ 1, from r_i to r_{i+1}.
          for (let i = 1; i < R; i++)
            for (let j = 0; j < g.counts[i]; j++) {
              const c = g.id(i, j), q = g.id(i, j - 1);
              if (M.has(c, q)) continue;
              const a = ang(i, j);
              push([[cx + i * cell * Math.cos(a), cy + i * cell * Math.sin(a)], [cx + (i + 1) * cell * Math.cos(a), cy + (i + 1) * cell * Math.sin(a)]]);
            }
        } else {
          const mid = (i, j) => (i === 0 ? [cx, cy] : (() => { const a = ang(i, j + 0.5), r = (i + 0.5) * cell; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; })());
          for (let i = 1; i < R; i++)
            for (let j = 0; j < g.counts[i]; j++) {
              const c = g.id(i, j), r = (i + 0.5) * cell, a = ang(i, j + 0.5);
              // cw neighbour: arc along the ring's middle.
              if (g.counts[i] > 1 && M.has(c, g.id(i, j + 1))) push(arc(r, a, ang(i, j + 1.5)));
              // Inward: radial drop to the parent ring's middle, then along it to the parent's centre.
              const pj = Math.floor((j * g.counts[i - 1]) / g.counts[i]);
              const pc = g.id(i - 1, pj);
              if (!M.has(c, pc)) continue;
              if (i === 1) { push([mid(i, j), [cx, cy]]); continue; }
              const rp = (i - 0.5) * cell, ap = ang(i - 1, pj + 0.5);
              push([mid(i, j), ...arc(rp, a, ap)]);
            }
          if (door >= 0) {
            const j = door - g.start[R - 1], a = ang(R - 1, j + 0.5);
            push([mid(R - 1, j), [cx + (R + 0.15) * cell * Math.cos(a), cy + (R + 0.15) * cell * Math.sin(a)]]);
          }
        }
        out.count = g.n;
        return out;
      }

      // ---- Square grid ----
      const C = Math.max(3, Math.min(60, Math.round(p.cols))), R = Math.max(3, Math.min(60, Math.round(p.rows)));
      const g = squareGrid(C, R);
      const M = carve(g, p, rand);
      cell = Math.min(W / C, H / R);
      const x0 = cx - (C * cell) / 2, y0 = cy - (R * cell) / 2;
      const node = (i, j) => [x0 + i * cell, y0 + j * cell];
      const inDoor = p.doors ? Math.floor(rand() * R) : -1, outDoor = p.doors ? Math.floor(rand() * R) : -1;
      if (walls) {
        // Horizontal wall lines y = j (top of row j); wall between (i,j-1) and (i,j). Runs merge collinear cells.
        for (let j = 0; j <= R; j++) {
          let run = null;
          for (let i = 0; i <= C; i++) {
            const live = i < C && (j === 0 || j === R || !M.has((j - 1) * C + i, j * C + i));
            if (live) (run = run || [node(i, j)]).push(node(i + 1, j));
            else if (run) { push(run); run = null; }
          }
        }
        for (let i = 0; i <= C; i++) {
          let run = null;
          for (let j = 0; j <= R; j++) {
            const live = j < R && ((i === 0 && j !== inDoor) || (i === C && j !== outDoor) || (i > 0 && i < C && !M.has(j * C + i - 1, j * C + i)));
            if (live) (run = run || [node(i, j)]).push(node(i, j + 1));
            else if (run) { push(run); run = null; }
          }
        }
      } else {
        const mid = (k) => [x0 + ((k % C) + 0.5) * cell, y0 + (Math.floor(k / C) + 0.5) * cell];
        for (const k of M.links) {
          const [a, b] = k.split(',').map(Number);
          push([mid(a), mid(b)]);
        }
        if (inDoor >= 0) push([[x0 - 0.15 * cell, y0 + (inDoor + 0.5) * cell], mid(inDoor * C)]);
        if (outDoor >= 0) push([mid(outDoor * C + C - 1), [x0 + (C + 0.15) * cell, y0 + (outDoor + 0.5) * cell]]);
      }
      out.count = g.n;
      return out;
    },
  };
})();
