// Schema-driven controls. onChange(key, value, final): final=false while dragging.
(function () {
  const SP = (window.SP = window.SP || {});

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  SP.el = el;

  function decimals(step) {
    const s = String(step);
    return s.includes('.') ? s.split('.')[1].length : 0;
  }

  SP.buildControls = function (container, schema, getObj, onChange) {
    container.innerHTML = '';
    const rows = [];
    for (const s of schema) {
      if (s.group) { container.appendChild(el('div', 'group-label', s.group)); continue; }
      let row, sync;
      if (s.type === 'bool') {
        row = el('label', 'switch', `<span>${s.label}</span><input type="checkbox"><span class="knob"></span>`);
        const cb = row.querySelector('input');
        cb.addEventListener('change', () => onChange(s.key, cb.checked, true));
        sync = (o) => (cb.checked = !!o[s.key]);
      } else if (s.type === 'text') {
        row = el('div', 'field-row', `<label>${s.label}</label>`);
        const inp = el('input');
        inp.type = 'text';
        inp.maxLength = s.maxLength || 12;
        inp.className = 'text-in';
        inp.addEventListener('input', () => onChange(s.key, inp.value, false));
        inp.addEventListener('change', () => onChange(s.key, inp.value, true));
        inp.addEventListener('keydown', (e) => e.stopPropagation());
        row.appendChild(inp);
        sync = (o) => { if (document.activeElement !== inp) inp.value = o[s.key] ?? ''; };
      } else if (s.type === 'select') {
        row = el('div', 'field-row', `<label>${s.label}</label>`);
        const sel = el('select');
        for (const [v, t] of s.options) sel.appendChild(Object.assign(el('option', null, t), { value: v }));
        sel.addEventListener('change', () => onChange(s.key, sel.value, true));
        row.appendChild(sel);
        sync = (o) => (sel.value = o[s.key]);
      } else {
        row = el('div', 'ctl');
        const lab = el('label', null, s.label);
        lab.title = 'Double-click to reset';
        const num = el('input', 'num');
        num.type = 'text';
        const rng = el('input');
        rng.type = 'range';
        rng.min = s.min; rng.max = s.max; rng.step = s.step;
        const dp = decimals(s.step);
        const paint = (v) => {
          rng.style.setProperty('--p', `${((v - s.min) / (s.max - s.min)) * 100}%`);
          if (document.activeElement !== num) num.value = (+v).toFixed(dp);
        };
        rng.addEventListener('input', () => { paint(+rng.value); onChange(s.key, +rng.value, false); });
        rng.addEventListener('change', () => onChange(s.key, +rng.value, true));
        num.addEventListener('change', () => {
          let v = parseFloat(num.value);
          if (!isFinite(v)) return sync(getObj());
          if (s.int) v = Math.round(v);
          num.blur();
          rng.value = v; paint(v);
          onChange(s.key, v, true);
        });
        num.addEventListener('keydown', (e) => { if (e.key === 'Enter') num.blur(); e.stopPropagation(); });
        lab.addEventListener('dblclick', () => { rng.value = s.def; paint(s.def); onChange(s.key, s.def, true); });
        row.append(lab, num, rng);
        sync = (o) => { const v = o[s.key]; rng.value = v; paint(v); };
      }
      container.appendChild(row);
      rows.push({ s, row, sync });
    }
    const api = {
      refresh() {
        const o = getObj();
        for (const r of rows) {
          r.sync(o);
          r.row.style.display = r.s.show && !r.s.show(o) ? 'none' : '';
        }
      },
    };
    api.refresh();
    return api;
  };

  let toastTimer;
  SP.toast = function (msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = el('div', 'toast'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  };
})();
