// Tracery: Gothic window tracery as a setting-out rule. A window is a pointed (two-centred) arch over n lights,
// its arcs struck with one radius from centres on the springing line; everything above the lights is built from
// the same compass settings. Three heads: *Intersecting / Y* — every mullion (and jamb) branches into two arcs of
// the same radius as a j-light arch, so the bars cross each other in lozenges and run on to the window edge
// (j = Lights gives the classic intersecting head, j = 1 the Y-tracery lancets); *Reticulated* — the net of
// ogee-ended lozenges, a honeycomb of pointed hexagons one light wide whose vertical sides continue the mullions
// and whose upper sides are S-curves meeting in a point; *Panel* — Perpendicular tracery, mullions running
// straight to the arch and crossed by transoms, each panel capped with a small pointed head. Then the mason's
// last step: wherever a pocket of the head is big enough, a foiled roundel is set into it — found here by
// searching for the largest empty circle in every pocket above the springing, ringed and cusped with 3–6 lobes.
// All bars are round-capped strokes clipped to the window, so the export is a handful of long closed outlines.
(function () {
  const SP = (window.SP = window.SP || {});
  const MIN_R = 0.3; // narrowest half-width (mm): 0.6 mm bars
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const SIN60 = Math.sqrt(3) / 2;
  const OGEE_HALF = 17 * (Math.PI / 180); // half-angle at an ogee apex
  const LOBE_OVER = 1.12; // lobe radius over the tangent-lobe radius: the lobes overlap, so the cusps are sharp

  function arcPts(cx, cy, r, a0, a1, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return pts;
  }

  function cubic(a, b, c, d, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, v = 1 - t;
      pts.push([v * v * v * a[0] + 3 * v * v * t * b[0] + 3 * v * t * t * c[0] + t * t * t * d[0], v * v * v * a[1] + 3 * v * v * t * b[1] + 3 * v * t * t * c[1] + t * t * t * d[1]]);
    }
    return pts;
  }

  function segDist(x, y, s) {
    const dx = s[2] - s[0], dy = s[3] - s[1];
    const L2 = dx * dx + dy * dy;
    const t = L2 > 1e-12 ? clamp(((x - s[0]) * dx + (y - s[1]) * dy) / L2, 0, 1) : 0;
    return Math.hypot(x - (s[0] + dx * t), y - (s[1] + dy * t));
  }

  const wrapPi = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };

  SP.generators.tracery = {
    id: 'tracery',
    name: 'Tracery',
    board: true,
    schema: [
      { group: 'Window' },
      { key: 'windows', label: 'Windows across', min: 1, max: 4, step: 1, def: 1, int: true, rand: [1, 2] },
      { key: 'lights', label: 'Lights', min: 1, max: 8, step: 1, def: 3, int: true, rand: [2, 5] },
      { key: 'arch', label: 'Arch radius (× span)', min: 0.5, max: 1.5, step: 0.01, def: 1, rand: [0.65, 1.3] },
      { key: 'head', label: 'Head', type: 'select', def: 'pointed', options: [['pointed', 'Pointed arch'], ['square', 'Square head']] },
      { key: 'margin', label: 'Margin (mm)', min: 0, max: 40, step: 0.5, def: 6 },
      { group: 'Tracery' },
      { key: 'style', label: 'Style', type: 'select', def: 'intersect', options: [['intersect', 'Intersecting / Y'], ['reticulated', 'Reticulated net'], ['panel', 'Perpendicular panels']] },
      { key: 'branch', label: 'Branch span (lights)', min: 1, max: 8, step: 1, def: 3, int: true, rand: [1, 4] },
      { key: 'vert', label: 'Lozenge height', min: 0.3, max: 1.5, step: 0.01, def: 0.58, rand: [0.4, 1] },
      { key: 'transom', label: 'Panel height', min: 0.9, max: 3, step: 0.01, def: 1.6, rand: [1, 2.4] },
      { group: 'Foils' },
      { key: 'foils', label: 'Roundels', type: 'select', def: '4', options: [['none', 'None'], ['ring', 'Plain ring'], ['3', 'Trefoil'], ['4', 'Quatrefoil'], ['5', 'Cinquefoil'], ['6', 'Sexfoil']] },
      { key: 'minR', label: 'Smallest pocket (mm)', min: 2, max: 40, step: 0.5, def: 7, rand: [5, 12] },
      { group: 'Bars' },
      { key: 'barW', label: 'Bar width (mm)', min: 0.6, max: 8, step: 0.05, def: 2.2, rand: [1.4, 3.2] },
      { key: 'mullionW', label: 'Mullion width (mm)', min: 0.6, max: 10, step: 0.05, def: 3, rand: [2, 4] },
      { key: 'fillet', label: 'Merge', min: 0.02, max: 3, step: 0.01, def: 0.3 },
      { key: 'fieldW', label: 'Points → weight', min: -1, max: 2, step: 0.01, def: 0.6 },
    ],

    generateBoard(p, ctx) {
      const { board: B, fieldAt, points } = ctx;
      const out = { strokes: [], blobs: [], count: 0 };
      const mg = Math.max(0, p.margin);
      const nW = clamp(Math.round(p.windows), 1, 4), n = clamp(Math.round(p.lights), 1, 8);
      const W = (B.w - 2 * mg) / nW, H = B.h - 2 * mg;
      if (W < 4 || H < 4) return out;
      const barHW = Math.max(MIN_R, p.barW / 2), mulHW = Math.max(MIN_R, p.mullionW / 2);
      const warp = points.length && p.fieldW ? (x, y) => clamp(1 + p.fieldW * fieldAt(x, y), 0.3, 3) : null;
      const yTop = mg, yBot = B.h - mg;
      const s = W / n;

      for (let k = 0; k < nW; k++) {
        const xL = mg + k * W, xR = xL + W, xM = (xL + xR) / 2;
        // Arch: radius kA·W struck from the springing line; rise = W·√(kA − ¼). Drop to a square head if even a
        // semicircle will not fit the board.
        let kA = clamp(p.arch, 0.5, 1.5);
        let rise = W * Math.sqrt(kA - 0.25);
        if (rise > 0.92 * H) { kA = Math.max(0.5, (0.92 * H / W) ** 2 + 0.25); rise = W * Math.sqrt(kA - 0.25); }
        const pointed = p.head === 'pointed' && rise <= H - 1;
        if (!pointed) rise = Math.min(rise, Math.max(0, H - s));
        const ys = yTop + rise; // springing line
        const R = kA * W, cLx = xL + R, cRx = xR - R;
        const sdWin = (x, y) => {
          if (!pointed || y >= ys) return Math.min(x - xL, xR - x, yBot - y, pointed ? Infinity : y - yTop);
          return Math.min(R - Math.hypot(x - cLx, y - ys), R - Math.hypot(x - cRx, y - ys));
        };
        const segs = []; // [x0, y0, x1, y1, hw] of every bar in this window, for the pocket search
        const push = (pts, hw, keep) => {
          if (pts.length < 2) return;
          out.strokes.push({ pts, r: pts.map((q) => (warp ? hw * warp(q[0], q[1]) : hw)) });
          if (keep !== false) for (let i = 0; i + 1 < pts.length; i++) segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], hw]);
        };
        // Clip a polyline to the window: runs inside are kept, ends extended to the exact crossing.
        const clipPush = (pts, hw) => {
          const cross = (a, b) => { // a inside, b outside → crossing point
            let lo = a, hi = b;
            for (let i = 0; i < 8; i++) { const m = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2]; if (sdWin(m[0], m[1]) >= 0) lo = m; else hi = m; }
            return lo;
          };
          let run = [];
          for (let i = 0; i < pts.length; i++) {
            const inside = sdWin(pts[i][0], pts[i][1]) >= 0;
            if (inside) { if (!run.length && i > 0) run.push(cross(pts[i], pts[i - 1])); run.push(pts[i]); }
            else if (run.length) { run.push(cross(pts[i - 1], pts[i])); push(run, hw); run = []; }
          }
          if (run.length) push(run, hw);
        };

        // Frame: jambs, arch (or lintel) and sill as one closed loop.
        const frame = [[xL, yBot], [xL, ys]];
        if (pointed) {
          const aA = Math.atan2(yTop - ys, xM - cLx) + 2 * Math.PI; // apex seen from the left centre, in (π, 2π)
          const left = arcPts(cLx, ys, R, Math.PI, aA, 28);
          frame.push(...left.slice(1));
          for (let i = left.length - 2; i >= 0; i--) frame.push([2 * xM - left[i][0], left[i][1]]);
        } else frame.push([xL, yTop], [xR, yTop]);
        frame.push([xR, ys], [xR, yBot], [xL, yBot]);
        push(frame, mulHW);

        // Mullions: to the springing line, or to the arch for Perpendicular panels. A square-headed net starts at
        // the sill, so its verticals are the mullions.
        const mulTop = p.style === 'panel' ? yTop : ys;
        if (!(p.style === 'reticulated' && !pointed)) for (let i = 1; i < n; i++) clipPush([[xL + i * s, yBot], [xL + i * s, mulTop]], mulHW);

        if (p.style === 'intersect') {
          // Every mullion and jamb branches both ways with the radius of a j-light arch; the arcs end where they
          // meet their partner (60° round, the pointed meeting) or leave the window.
          const j = clamp(Math.round(p.branch), 1, n), rb = j * s;
          for (let i = 0; i <= n; i++) {
            const xi = xL + i * s;
            if (i < n && !(j === n && i === 0)) clipPush(arcPts(xi + rb, ys, rb, Math.PI, Math.PI * 4 / 3, 24), barHW);
            if (i > 0 && !(j === n && i === n)) clipPush(arcPts(xi - rb, ys, rb, 0, -Math.PI / 3, 24), barHW);
          }
        } else if (p.style === 'reticulated') {
          // Honeycomb of pointed hexagons one light wide: verticals continue the mullions, upper sides are ogees.
          const hv = Math.max(0.6, s * p.vert), ha = s * 0.2887;
          const L1 = 0.3 * Math.hypot(s / 2, ha), L2 = 0.58 * Math.hypot(s / 2, ha);
          let y0 = pointed ? ys : yBot, r = 0;
          while (y0 > yTop && r < 60) {
            const off = r & 1 ? s / 2 : 0;
            for (let i = 0; i <= n; i++) {
              const x = xL + off + i * s;
              if (x >= xR - 1e-6) break;
              const yV = y0 - hv;
              if (!(off === 0 && (i === 0 || i === n))) clipPush([[x, y0], [x, yV]], barHW);
              for (const sx of [-1, 1]) {
                const A = [x + sx * s / 2, yV - ha];
                clipPush(cubic([x, yV], [x, yV - L1], [A[0] - sx * L2 * Math.sin(OGEE_HALF), A[1] + L2 * Math.cos(OGEE_HALF)], A, 14), barHW);
              }
            }
            y0 -= hv + ha; r++;
          }
        } else {
          // Perpendicular: transoms at a set pitch, each panel capped by a pointed head touching the transom.
          const T = Math.max(0.9, p.transom) * s;
          for (let m = 1; m < 80; m++) {
            const yt = yBot - m * T;
            if (yt <= yTop) break;
            clipPush([[xL, yt], [xR, yt]], barHW);
            const ysp = yt + s * SIN60; // head springing
            for (let i = 0; i < n; i++) {
              const xi = xL + i * s;
              clipPush(arcPts(xi + s, ysp, s, Math.PI, Math.PI * 4 / 3, 16), barHW);
              clipPush(arcPts(xi, ysp, s, 0, -Math.PI / 3, 16), barHW);
            }
          }
        }

        // Roundels: the largest empty circle of every pocket above the springing, ringed and foiled.
        if (p.foils !== 'none') {
          const dist = (x, y) => {
            let d = sdWin(x, y) - mulHW;
            for (const sg of segs) { const v = segDist(x, y, sg) - sg[4]; if (v < d) d = v; }
            return d;
          };
          const g = clamp(Math.min(s / 6, p.minR / 2), 0.8, 4);
          const nx = Math.max(2, Math.ceil(W / g)), ny = Math.max(2, Math.ceil(H / g));
          const D = new Float64Array((nx + 1) * (ny + 1));
          for (let iy = 0; iy <= ny; iy++) for (let ix = 0; ix <= nx; ix++) D[iy * (nx + 1) + ix] = dist(xL + (W * ix) / nx, yTop + (H * iy) / ny);
          const found = [];
          for (let iy = 1; iy < ny; iy++) for (let ix = 1; ix < nx; ix++) {
            const d0 = D[iy * (nx + 1) + ix];
            if (d0 < p.minR * 0.8) continue;
            let top = true;
            for (let dy = -1; dy <= 1 && top; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && D[(iy + dy) * (nx + 1) + ix + dx] > d0) { top = false; break; }
            if (!top) continue;
            // Refine by pattern search.
            let cx = xL + (W * ix) / nx, cy = yTop + (H * iy) / ny, d = d0, step = g / 2;
            while (step > 0.03) {
              let moved = false;
              for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
                const v = dist(cx + ux * step, cy + uy * step);
                if (v > d) { d = v; cx += ux * step; cy += uy * step; moved = true; }
              }
              if (!moved) step /= 2;
            }
            if (d < p.minR) continue;
            // Strict maximum only: a plateau (a tall light or panel) is not a pocket.
            const e = 0.35 * d;
            if ([dist(cx + e, cy), dist(cx - e, cy), dist(cx, cy + e), dist(cx, cy - e)].some((v) => v > d - 0.02 * d)) continue;
            if (p.style !== 'panel' && cy + d > ys + 0.01) continue; // sits in a light, not in the head
            found.push({ cx, cy, d });
          }
          found.sort((a, b) => b.d - a.d);
          const kept = [];
          for (const f of found) if (!kept.some((q) => Math.hypot(q.cx - f.cx, q.cy - f.cy) < Math.max(q.d, f.d))) kept.push(f);
          const nL = parseInt(p.foils, 10) || 0;
          for (const { cx, cy, d } of kept) {
            const Rr = d - barHW * 0.6;
            if (Rr < 2 * barHW) continue;
            push(arcPts(cx, cy, Rr, 0, 2 * Math.PI, 48), barHW, false);
            if (nL >= 3) {
              const sn = Math.sin(Math.PI / nL);
              const rl = (LOBE_OVER * Rr * sn) / (1 + sn), dc = Rr - rl; // lobes tangent inside the ring, overlapping each other
              const rho = dc * Math.cos(Math.PI / nL) + Math.sqrt(Math.max(0, rl * rl - dc * dc * sn * sn)); // cusp radius
              if (rl < 1.5 * barHW) continue;
              const foil = [];
              for (let q = 0; q < nL; q++) {
                const th = -Math.PI / 2 + (2 * Math.PI * q) / nL;
                const ckx = cx + dc * Math.cos(th), cky = cy + dc * Math.sin(th);
                const I0 = [cx + rho * Math.cos(th - Math.PI / nL), cy + rho * Math.sin(th - Math.PI / nL)];
                const I1 = [cx + rho * Math.cos(th + Math.PI / nL), cy + rho * Math.sin(th + Math.PI / nL)];
                const u0 = wrapPi(Math.atan2(I0[1] - cky, I0[0] - ckx) - th), u1 = wrapPi(Math.atan2(I1[1] - cky, I1[0] - ckx) - th);
                const pts = arcPts(ckx, cky, rl, th + u0, th + u1, 16);
                foil.push(...(q ? pts.slice(1) : pts));
              }
              push(foil, barHW, false);
            }
          }
        }
        out.count++;
      }
      out.k = Math.max(0.02, p.fillet);
      return out;
    },
  };
})();
