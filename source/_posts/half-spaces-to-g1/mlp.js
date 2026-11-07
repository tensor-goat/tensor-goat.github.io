// One hidden layer of two units: the input plane, and the plane after the hidden layer.
(function () {
  'use strict';
  const root = document.getElementById('ml-demo');
  if (!root) return;

  root.innerHTML = `
<div class="nd-plots">
  <div class="nd-plot"><div class="nd-cap">Input plane x: two half-plane lines</div><div class="nd-box"><canvas id="ml-cx" tabindex="0" role="img" aria-label="Input plane with labeled points, two hidden-unit lines and the shaded output region. Drag the yellow point, or use the arrow keys."></canvas></div></div>
  <div class="nd-plot"><div class="nd-cap">Hidden plane h = σ(Wx + b): one straight line</div><div class="nd-box"><canvas id="ml-ch" role="img" aria-label="Hidden plane showing the warped input grid, the points after the hidden layer and the straight readout line."></canvas></div></div>
</div>
<div class="nd-key">
  <span><i style="background:var(--pos);border-radius:50%"></i>Label +1</span>
  <span><i style="background:var(--neg)"></i>Label −1</span>
  <span><i style="background:var(--u1)"></i>Hidden unit 1</span>
  <span><i style="background:var(--u2)"></i>Hidden unit 2</span>
  <span><i style="background:var(--probe);border-radius:50%"></i>Drag me</span>
</div>
<div class="nd-bar">
  <label for="ml-task">Data <select id="ml-task"><option value="xor">XOR</option><option value="strip">Strip</option><option value="line">Half-plane</option><option value="disk">Disk</option></select></label>
  <label for="ml-act">σ <select id="ml-act"><option value="tanh">tanh</option><option value="step">sign</option><option value="linear">linear</option></select></label>
  <button type="button" id="ml-train" class="nd-primary">Train</button><button type="button" id="ml-fresh">New start</button><button type="button" id="ml-reset">Reset</button>
</div>
<div class="nd-grid">
  <div class="nd-grp"><b>Row 1 of W, then b₁</b>
    <div class="nd-s"><label for="ml-a1">angle</label><input id="ml-a1" type="range" min="-180" max="180" step="1"><output id="ml-a1o"></output></div>
    <div class="nd-s"><label for="ml-m1">length</label><input id="ml-m1" type="range" min="0" max="8" step="0.05"><output id="ml-m1o"></output></div>
    <div class="nd-s"><label for="ml-b1">b₁</label><input id="ml-b1" type="range" min="-12" max="12" step="0.1"><output id="ml-b1o"></output></div>
  </div>
  <div class="nd-grp"><b>Row 2 of W, then b₂</b>
    <div class="nd-s"><label for="ml-a2">angle</label><input id="ml-a2" type="range" min="-180" max="180" step="1"><output id="ml-a2o"></output></div>
    <div class="nd-s"><label for="ml-m2">length</label><input id="ml-m2" type="range" min="0" max="8" step="0.05"><output id="ml-m2o"></output></div>
    <div class="nd-s"><label for="ml-b2">b₂</label><input id="ml-b2" type="range" min="-12" max="12" step="0.1"><output id="ml-b2o"></output></div>
  </div>
  <div class="nd-grp"><b>Readout u, then c</b>
    <div class="nd-s"><label for="ml-ua">angle</label><input id="ml-ua" type="range" min="-180" max="180" step="1"><output id="ml-uao"></output></div>
    <div class="nd-s"><label for="ml-um">length</label><input id="ml-um" type="range" min="0" max="12" step="0.05"><output id="ml-umo"></output></div>
    <div class="nd-s"><label for="ml-cc">c</label><input id="ml-cc" type="range" min="-12" max="12" step="0.1"><output id="ml-cco"></output></div>
  </div>
</div>
<div class="nd-out" id="ml-out" aria-live="polite"></div>`;

  const $ = i => document.getElementById('ml-' + i), R = 3.2;
  const css = getComputedStyle(root), v = k => css.getPropertyValue(k).trim();
  const POS = v('--pos'), NEG = v('--neg'), U1 = v('--u1'), U2 = v('--u2'), PR = v('--probe'), INK = v('--nd-ink'), AXIS = v('--nd-axis'), SOFT = v('--nd-soft'), PANEL = v('--nd-panel');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), POSc = rgb(POS), NEGc = rgb(NEG);
  const mul = s => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  function data(task) {
    const r = mul(11), n = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r()), P = [];
    if (task === 'xor') { for (const [a, b, l] of [[1.5, 1.5, -1], [-1.5, -1.5, -1], [1.5, -1.5, 1], [-1.5, 1.5, 1]]) for (let i = 0; i < 14; i++) P.push([a + .32 * n(), b + .32 * n(), l]); }
    else {
      for (let i = 0; i < 70; i++) {
        const x = -2.9 + 5.8 * r(), y = -2.9 + 5.8 * r(); let l;
        if (task === 'strip') { const s = (x + .6 * y) / 1.166; if (Math.abs(Math.abs(s) - .8) < .12) continue; l = Math.abs(s) < .8 ? 1 : -1; }
        else if (task === 'line') { const s = (x - .5 * y - .3) / 1.118; if (Math.abs(s) < .12) continue; l = s > 0 ? 1 : -1; }
        else { const d = Math.hypot(x, y); if (Math.abs(d - 1.6) < .14) continue; l = d < 1.6 ? 1 : -1; }
        P.push([x, y, l]);
      }
    }
    return P;
  }
  const START = [2.12, 2.12, 3, 2.12, 2.12, -3, 3, -3, -3];
  const INTRO = 'Two parallel lines cut out a band. The hidden layer folds the plane so one line can read it.';
  let T = Float64Array.from(START), P = data('xor'), act = 'tanh', probe = [1.4, -.9], opt = null, msg = INTRO, seed = 40;
  const sg = x => act === 'tanh' ? Math.tanh(x) : act === 'step' ? (x > 0 ? 1 : x < 0 ? -1 : 0) : x;
  const hid = (x, y) => [sg(T[0] * x + T[1] * y + T[2]), sg(T[3] * x + T[4] * y + T[5])];
  const out = (x, y) => { const h = hid(x, y); return T[6] * h[0] + T[7] * h[1] + T[8]; };
  const wrong = () => P.filter(p => out(p[0], p[1]) * p[2] <= 0).length;
  function fit(c) { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d)); const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g, W: r.width, H: r.height }; }
  function pt(g, X, Y, l) { g.beginPath(); if (l > 0) { g.arc(X, Y, 4, 0, 7); g.fillStyle = POS; g.fill(); } else { g.rect(X - 3.5, Y - 3.5, 7, 7); g.fillStyle = NEG; g.fill(); } g.lineWidth = 1; g.strokeStyle = PANEL; g.stroke(); }
  const shade = document.createElement('canvas'); shade.width = shade.height = 80; const sx = shade.getContext('2d');
  function region(g, W, H, sX, sY, fn) { const N = 80, img = sx.createImageData(N, N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = fn(sX(i + .5, N), sY(j + .5, N)) > 0 ? POSc : NEGc, o = 4 * (j * N + i); img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 46; } sx.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(shade, 0, 0, W, H); }
  function line(g, mx, my, a, b, c, col, dash, lw) { const m = Math.hypot(a, b); if (m < 1e-6) return; const px = -a * c / (m * m), py = -b * c / (m * m), dx = -b / m * 40, dy = a / m * 40; g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.moveTo(mx(px - dx), my(py - dy)); g.lineTo(mx(px + dx), my(py + dy)); g.stroke(); g.setLineDash([]); }
  function dot(g, X, Y) { g.beginPath(); g.arc(X, Y, 7, 0, 7); g.fillStyle = PR; g.fill(); g.strokeStyle = PANEL; g.lineWidth = 2; g.stroke(); }
  function axes(g, mx, my, lim) { g.strokeStyle = AXIS; g.lineWidth = .8; g.beginPath(); g.moveTo(mx(-lim), my(0)); g.lineTo(mx(lim), my(0)); g.moveTo(mx(0), my(-lim)); g.lineTo(mx(0), my(lim)); g.stroke(); }
  function draw() {
    const a = fit($('cx')), g = a.g, W = a.W, H = a.H, mx = x => W / 2 + x / R * W / 2, my = y => H / 2 - y / R * H / 2;
    g.clearRect(0, 0, W, H); region(g, W, H, (i, N) => -R + 2 * R * i / N, (j, N) => R - 2 * R * j / N, out); axes(g, mx, my, R);
    line(g, mx, my, T[0], T[1], T[2], U1, [6, 4], 2); line(g, mx, my, T[3], T[4], T[5], U2, [6, 4], 2);
    for (const p of P) pt(g, mx(p[0]), my(p[1]), p[2]);
    dot(g, mx(probe[0]), my(probe[1]));
    const b = fit($('ch')), q = b.g, w = b.W, h = b.H;
    let lim = 1.35;
    if (act === 'linear') { lim = 1.2; for (const c of [[-R, -R], [R, -R], [R, R], [-R, R]]) { const z = hid(c[0], c[1]); lim = Math.max(lim, Math.abs(z[0]) * 1.08, Math.abs(z[1]) * 1.08); } }
    const hx = z => w / 2 + z / lim * w / 2, hy = z => h / 2 - z / lim * h / 2, yOf = (u, z) => T[6] * u + T[7] * z + T[8];
    q.clearRect(0, 0, w, h); region(q, w, h, (i, N) => -lim + 2 * lim * i / N, (j, N) => lim - 2 * lim * j / N, yOf); axes(q, hx, hy, lim);
    q.strokeStyle = SOFT; q.lineWidth = .8; q.globalAlpha = .45;
    if (act !== 'step') for (let k = 0; k <= 12; k++) { const c = -R + 2 * R * k / 12; for (const dir of [0, 1]) { q.beginPath(); for (let i = 0; i <= 70; i++) { const s = -R + 2 * R * i / 70, z = dir ? hid(c, s) : hid(s, c); i ? q.lineTo(hx(z[0]), hy(z[1])) : q.moveTo(hx(z[0]), hy(z[1])); } q.stroke(); } }
    q.globalAlpha = 1; line(q, hx, hy, T[6], T[7], T[8], INK, [], 2.4);
    for (const p of P) { const z = hid(p[0], p[1]); pt(q, hx(z[0]), hy(z[1]), p[2]); }
    const pv = hid(probe[0], probe[1]); dot(q, hx(pv[0]), hy(pv[1]));
    sync();
    const f = x => { const t = Math.round(x * 100) / 100; return ((Object.is(t, -0) ? 0 : t).toFixed(2)).padStart(6); };
    const yy = T[6] * pv[0] + T[7] * pv[1] + T[8];
    $('out').textContent = `Wx + b = (${f(T[0] * probe[0] + T[1] * probe[1] + T[2])}, ${f(T[3] * probe[0] + T[4] * probe[1] + T[5])})\nh      = (${f(pv[0])}, ${f(pv[1])})\ny      = u·h + c = ${f(yy)}, output ${yy > 0 ? '+1' : '−1'}\nmisclassified = ${wrong()} of ${P.length}\n${msg}`;
  }
  const set = (id, x, txt) => { const e = $(id); if (document.activeElement !== e || opt) e.value = x; $(id + 'o').textContent = txt; };
  function sync() {
    const d = (x, y) => Math.atan2(y, x) * 180 / Math.PI, n = x => { const t = Math.round(x * 10) / 10; return (Object.is(t, -0) ? 0 : t).toFixed(1); };
    set('a1', d(T[0], T[1]), n(d(T[0], T[1])) + '°'); set('m1', Math.hypot(T[0], T[1]), n(Math.hypot(T[0], T[1]))); set('b1', T[2], n(T[2]));
    set('a2', d(T[3], T[4]), n(d(T[3], T[4])) + '°'); set('m2', Math.hypot(T[3], T[4]), n(Math.hypot(T[3], T[4]))); set('b2', T[5], n(T[5]));
    set('ua', d(T[6], T[7]), n(d(T[6], T[7])) + '°'); set('um', Math.hypot(T[6], T[7]), n(Math.hypot(T[6], T[7]))); set('cc', T[8], n(T[8]));
  }
  function grad() {
    const G = new Float64Array(9), N = P.length; let L = 0;
    for (const p of P) {
      const lab = p[2] > 0 ? 1 : 0, z1 = T[0] * p[0] + T[1] * p[1] + T[2], z2 = T[3] * p[0] + T[4] * p[1] + T[5];
      let h1, h2, d1, d2;
      if (act === 'tanh') { h1 = Math.tanh(z1); h2 = Math.tanh(z2); d1 = 1 - h1 * h1; d2 = 1 - h2 * h2; }
      else if (act === 'linear') { h1 = z1; h2 = z2; d1 = 1; d2 = 1; }
      else { h1 = z1 > 0 ? 1 : -1; h2 = z2 > 0 ? 1 : -1; d1 = 0; d2 = 0; }
      const y = T[6] * h1 + T[7] * h2 + T[8], e = 1 / (1 + Math.exp(-y)) - lab;
      L += Math.max(y, 0) - y * lab + Math.log1p(Math.exp(-Math.abs(y)));
      const a = e * T[6] * d1, b = e * T[7] * d2;
      G[0] += a * p[0]; G[1] += a * p[1]; G[2] += a; G[3] += b * p[0]; G[4] += b * p[1]; G[5] += b; G[6] += e * h1; G[7] += e * h2; G[8] += e;
    }
    for (let i = 0; i < 9; i++) G[i] /= N;
    return [G, L / N];
  }
  function trainStep(o) { const [G, L] = grad(), lr = .04; o.k++; o.l = L; for (let i = 0; i < 9; i++) { o.m[i] = .9 * o.m[i] + .1 * G[i]; o.v[i] = .999 * o.v[i] + .001 * G[i] * G[i]; T[i] -= lr * (o.m[i] / (1 - Math.pow(.9, o.k))) / (Math.sqrt(o.v[i] / (1 - Math.pow(.999, o.k))) + 1e-8); T[i] = Math.max(-30, Math.min(30, T[i])); } }
  function stop() { opt = null; $('train').textContent = 'Train'; }
  function loop() {
    if (!opt) return;
    for (let i = 0; i < 8 && opt.k < 1600; i++) trainStep(opt);
    msg = `Training: step ${opt.k} of 1600, loss ${opt.l.toFixed(3)}.`;
    if (opt.k >= 1600) { const w = wrong(), l = opt.l; stop(); msg = act === 'linear' ? `Finished: loss ${l.toFixed(3)}. With linear σ this is one half-plane, however it trains.` : w === 0 ? `Finished: loss ${l.toFixed(3)}, every point is right.` : `Finished: loss ${l.toFixed(3)}, ${w} still wrong.`; draw(); return; }
    draw(); requestAnimationFrame(loop);
  }
  const polar = (i, deg, m) => { T[i] = m * Math.cos(deg * Math.PI / 180); T[i + 1] = m * Math.sin(deg * Math.PI / 180); };
  const edit = fn => e => { stop(); fn(+e.target.value); msg = 'Set by hand.'; draw(); };
  const ang = i => Math.atan2(T[i + 1], T[i]) * 180 / Math.PI, len = i => Math.hypot(T[i], T[i + 1]);
  $('a1').oninput = edit(x => polar(0, x, len(0))); $('m1').oninput = edit(x => polar(0, ang(0), x)); $('b1').oninput = edit(x => { T[2] = x; });
  $('a2').oninput = edit(x => polar(3, x, len(3))); $('m2').oninput = edit(x => polar(3, ang(3), x)); $('b2').oninput = edit(x => { T[5] = x; });
  $('ua').oninput = edit(x => polar(6, x, len(6))); $('um').oninput = edit(x => polar(6, ang(6), x)); $('cc').oninput = edit(x => { T[8] = x; });
  $('task').onchange = e => { stop(); P = data(e.target.value); msg = 'New data, same network. Press Train.'; draw(); };
  $('act').onchange = e => { stop(); act = e.target.value; msg = act === 'step' ? 'Sign has zero slope, so gradients vanish. Set it by hand, or train with tanh first.' : act === 'linear' ? 'With linear σ, the two layers collapse into one half-plane.' : 'Smooth folds: tanh can be trained.'; draw(); };
  $('train').onclick = () => {
    if (opt) { stop(); msg = 'Paused.'; draw(); return; }
    if (act === 'step') { msg = 'Sign has zero slope, so there is nothing to follow. Switch σ to tanh to train.'; draw(); return; }
    opt = { k: 0, l: 0, m: new Float64Array(9), v: new Float64Array(9) }; $('train').textContent = 'Pause'; requestAnimationFrame(loop);
  };
  $('fresh').onclick = () => { stop(); seed++; const r = mul(seed * 977), n = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r()); for (let i = 0; i < 9; i++) T[i] = n() * (i === 2 || i === 5 || i === 8 ? .5 : .9); msg = 'Random start. Press Train.'; draw(); };
  $('reset').onclick = () => { stop(); T = Float64Array.from(START); act = 'tanh'; $('task').value = 'xor'; $('act').value = 'tanh'; P = data('xor'); msg = INTRO; draw(); };
  const c = $('cx'); let drag = false;
  const world = e => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width * 2 - 1) * R, (1 - (e.clientY - r.top) / r.height * 2) * R, r.width]; };
  const near = e => { const w = world(e); return Math.hypot(w[0] - probe[0], w[1] - probe[1]) < 22 / w[2] * 2 * R; };
  c.addEventListener('pointerdown', e => { if (near(e)) { drag = true; c.setPointerCapture(e.pointerId); c.style.touchAction = 'none'; e.preventDefault(); } });
  c.addEventListener('pointermove', e => { c.style.cursor = drag ? 'grabbing' : near(e) ? 'grab' : 'default'; if (!drag) return; const w = world(e); probe = [Math.max(-R, Math.min(R, w[0])), Math.max(-R, Math.min(R, w[1]))]; draw(); });
  const up = () => { drag = false; c.style.touchAction = ''; };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('touchstart', e => { const t = e.touches[0]; if (t && near(t)) e.preventDefault(); }, { passive: false });
  c.addEventListener('keydown', e => { const d = { ArrowLeft: [-.1, 0], ArrowRight: [.1, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1] }[e.key]; if (!d) return; e.preventDefault(); probe = [Math.max(-R, Math.min(R, probe[0] + d[0])), Math.max(-R, Math.min(R, probe[1] + d[1]))]; draw(); });
  new ResizeObserver(draw).observe(c); draw();
})();
