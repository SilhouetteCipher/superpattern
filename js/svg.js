// SVG export: mm units, 1:1 viewBox, absolute M/C/Z only, no transforms/strokes/CSS.
(function () {
  const SP = (window.SP = window.SP || {});

  function fmt(v, dp) {
    const s = v.toFixed(dp);
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }

  function loopD(segs, dp) {
    const n = (v) => fmt(v, dp);
    let d = `M${n(segs[0][0][0])} ${n(segs[0][0][1])}`;
    for (const [, c1, c2, p] of segs) d += `C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(p[0])} ${n(p[1])}`;
    return d + 'Z';
  }

  function inside(pt, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const a = P[i], b = P[j];
      if (a[1] > pt[1] !== b[1] > pt[1] && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
    }
    return c;
  }

  // Group holes with their outer loop. Fill loops have positive area in y-down coords.
  SP.groupShapes = function (contours) {
    const outers = contours.filter((c) => c.area > 0).map((c) => ({ outer: c, holes: [] }));
    for (const h of contours.filter((c) => c.area <= 0)) {
      let best = null;
      for (const o of outers)
        if (inside(h.P[0], o.outer.P) && (!best || o.outer.area < best.outer.area)) best = o;
      if (best) best.holes.push(h);
    }
    return outers;
  };

  SP.buildSVG = function (contours, opts) {
    const { w, h, dp = 4, mode = 'compound', fill = '#000000', title = 'pattern' } = opts;
    const lines = [];
    const attrs = `fill="${fill}" fill-rule="evenodd"`;
    if (mode === 'compound') {
      lines.push(`<path ${attrs} d="${contours.map((c) => loopD(c.segs, dp)).join('')}"/>`);
    } else if (mode === 'shapes') {
      for (const g of SP.groupShapes(contours)) lines.push(`<path ${attrs} d="${[g.outer, ...g.holes].map((c) => loopD(c.segs, dp)).join('')}"/>`);
    } else {
      for (const c of contours) lines.push(`<path ${attrs} d="${loopD(c.segs, dp)}"/>`);
    }
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(w, 3)}mm" height="${fmt(h, 3)}mm" viewBox="0 0 ${fmt(w, 3)} ${fmt(h, 3)}">`,
      `<title>${title}</title>`,
      ...lines,
      '</svg>',
      '',
    ].join('\n');
  };

  // Round-trip check: parse an exported SVG and validate it.
  SP.validateSVG = function (svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const paths = [...doc.querySelectorAll('path')];
    let subpaths = 0, curves = 0, nan = 0, unclosed = 0, bad = 0;
    for (const p of paths) {
      const d = p.getAttribute('d');
      const subs = d.split('M').filter(Boolean);
      subpaths += subs.length;
      for (const s of subs) {
        if (!s.trim().endsWith('Z')) unclosed++;
        curves += (s.match(/C/g) || []).length;
        const nums = s.replace(/[CZ]/g, ' ').trim().split(/\s+/).map(Number);
        nums.forEach((v) => { if (!isFinite(v)) nan++; });
        if ((nums.length - 2) % 6 !== 0) bad++;
      }
    }
    return { paths: paths.length, subpaths, curves, nan, unclosed, bad, ok: !nan && !unclosed && !bad && subpaths > 0 };
  };
})();
