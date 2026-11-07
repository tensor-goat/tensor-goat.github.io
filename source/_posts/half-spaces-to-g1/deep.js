// Two hidden layers of two units: the input plane, the plane after layer 1, and the plane after layer 2.
(function () {
  'use strict';
  const root = document.getElementById('dl-demo');
  if (!root) return;

  root.innerHTML = `
<div class="nd-plots three">
  <div class="nd-plot"><div class="nd-cap">Input plane x: layer 2's lines look bent here</div><div class="nd-box"><canvas id="dl-c0" tabindex="0" role="img" aria-label="Input plane with labeled points, layer 1 lines, layer 2 boundaries and the output region. Drag the yellow point, or use the arrow keys."></canvas></div></div>
  <div class="nd-plot"><div class="nd-cap">After layer 1, h₁: layer 2's lines are straight</div><div class="nd-box"><canvas id="dl-c1" role="img" aria-label="The plane after hidden layer 1, with layer 2's straight lines."></canvas></div></div>
  <div class="nd-plot"><div class="nd-cap">After layer 2, h₂: one straight readout</div><div class="nd-box"><canvas id="dl-c2" role="img" aria-label="The plane after hidden layer 2, with the straight readout line."></canvas></div></div>
</div>
<div class="nd-key">
  <span><i style="background:var(--pos);border-radius:50%"></i>Label +1</span>
  <span><i style="background:var(--neg)"></i>Label −1</span>
  <span><i style="background:var(--u1)"></i>Layer 1 lines</span>
  <span><i style="background:var(--l2)"></i>Layer 2 lines</span>
  <span><i style="background:var(--probe);border-radius:50%"></i>Drag me</span>
</div>
<div class="nd-bar">
  <label for="dl-task">Data <select id="dl-task"><option value="disk">Disk</option><option value="xor">XOR</option><option value="strip">Strip</option><option value="two strips">Two strips</option><option value="ring">Ring</option></select></label>
  <button type="button" id="dl-best">Load best found</button><button type="button" id="dl-train" class="nd-primary">Train</button><button type="button" id="dl-fresh">New start</button>
  <label for="dl-layer">Edit <select id="dl-layer"><option value="0">Layer 1</option><option value="1">Layer 2</option><option value="2">Readout</option></select></label>
</div>
<div class="nd-grid">
  <div class="nd-grp"><b id="dl-g0">Unit 1</b>
    <div class="nd-s"><label for="dl-a0">angle</label><input id="dl-a0" type="range" min="-180" max="180" step="1"><output id="dl-a0o"></output></div>
    <div class="nd-s"><label for="dl-m0">length</label><input id="dl-m0" type="range" min="0" max="12" step="0.05"><output id="dl-m0o"></output></div>
    <div class="nd-s"><label for="dl-b0">offset</label><input id="dl-b0" type="range" min="-15" max="15" step="0.1"><output id="dl-b0o"></output></div>
  </div>
  <div class="nd-grp" id="dl-unit2"><b>Unit 2</b>
    <div class="nd-s"><label for="dl-a1">angle</label><input id="dl-a1" type="range" min="-180" max="180" step="1"><output id="dl-a1o"></output></div>
    <div class="nd-s"><label for="dl-m1">length</label><input id="dl-m1" type="range" min="0" max="12" step="0.05"><output id="dl-m1o"></output></div>
    <div class="nd-s"><label for="dl-b1">offset</label><input id="dl-b1" type="range" min="-15" max="15" step="0.1"><output id="dl-b1o"></output></div>
  </div>
</div>
<div class="nd-out" id="dl-out" aria-live="polite"></div>`;

  const $ = i => document.getElementById('dl-' + i), R = 3.2;
  const css = getComputedStyle(root), cv = k => css.getPropertyValue(k).trim();
  const POS = cv('--pos'), NEG = cv('--neg'), L1 = cv('--u1'), L2 = cv('--l2'), PR = cv('--probe'), INK = cv('--nd-ink'), AXIS = cv('--nd-axis'), SOFT = cv('--nd-soft'), PANEL = cv('--nd-panel');
  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), POSc = rgb(POS), NEGc = rgb(NEG);
  // Best of 30 random starts per task, trained for 2,500 steps.
  const BEST = { "xor": [1.653, -1.843, 2.02, 1.795, -1.722, -2.209, -1.812, 1.754, 1.207, 2.14, -2.106, -1.487, 7.678, -3.965, 1.139], "strip": [2.889, 1.82, -2.585, -2.536, -1.423, -2.086, -2.078, -2.075, -1.67, 2.701, 2.561, 2.033, 5.917, -5.429, -0.506], "two strips": [1.797, -1.864, 6.133, -1.697, -1.021, 1.371, 5.155, 8.962, -6.043, 1.926, 11.876, 8.896, -7.1, 13.248, -7.154], "disk": [-0.411, -0.1, -0.243, 0.922, 0.057, -0.107, 13.94, 6.175, 4.755, 11.719, 6.424, 2.161, 14.898, -18.154, -12.057], "ring": [0.911, 2.239, -2.119, 2.136, 0.565, 1.636, 10.618, -10.706, 1.541, -10.729, 13.076, -15.269, -18.127, -10.71, -9.275] };
  const mul = s => { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  function data(task) {
    const r = mul(11), n = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r()), P = [];
    if (task === 'xor') { for (const [a, b, l] of [[1.5, 1.5, -1], [-1.5, -1.5, -1], [1.5, -1.5, 1], [-1.5, 1.5, 1]]) for (let i = 0; i < 14; i++) P.push([a + .32 * n(), b + .32 * n(), l]); return P; }
    for (let i = 0; i < 110; i++) {
      const x = -2.9 + 5.8 * r(), y = -2.9 + 5.8 * r(); let l; const s = (x + .6 * y) / 1.166, d = Math.hypot(x, y);
      if (task === 'strip') { if (Math.abs(Math.abs(s) - .8) < .12) continue; l = Math.abs(s) < .8 ? 1 : -1; }
      else if (task === 'two strips') { const q = Math.abs(s); if (Math.abs(q - .5) < .1 || Math.abs(q - 1.5) < .1) continue; l = q > .5 && q < 1.5 ? 1 : -1; }
      else if (task === 'disk') { if (Math.abs(d - 1.6) < .14) continue; l = d < 1.6 ? 1 : -1; }
      else { if (Math.abs(d - .9) < .12 || Math.abs(d - 2) < .12) continue; l = d > .9 && d < 2 ? 1 : -1; }
      P.push([x, y, l]);
    }
    return P;
  }
  let task = 'disk', P = data(task), T = Float64Array.from(BEST.disk), probe = [.7, .5], opt = null, seed = 60, layer = 0;
  let msg = 'Every training point is right, but this region is not a disk: it leaks toward the edges. On fresh points in this box it scores 91.0%.';
  const layer1 = (x, y) => [Math.tanh(T[0] * x + T[1] * y + T[2]), Math.tanh(T[3] * x + T[4] * y + T[5])];
  const layer2 = h => [Math.tanh(T[6] * h[0] + T[7] * h[1] + T[8]), Math.tanh(T[9] * h[0] + T[10] * h[1] + T[11])];
  const read = h => T[12] * h[0] + T[13] * h[1] + T[14];
  const out = (x, y) => read(layer2(layer1(x, y)));
  const wrong = () => P.filter(p => out(p[0], p[1]) * p[2] <= 0).length;
  function fit(c) { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2); c.width = Math.max(1, Math.round(r.width * d)); c.height = Math.max(1, Math.round(r.height * d)); const g = c.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); return { g, W: r.width, H: r.height }; }
  function pt(g, X, Y, l) { g.beginPath(); if (l > 0) { g.arc(X, Y, 3.4, 0, 7); g.fillStyle = POS; g.fill(); } else { g.rect(X - 3, Y - 3, 6, 6); g.fillStyle = NEG; g.fill(); } g.lineWidth = .8; g.strokeStyle = PANEL; g.stroke(); }
  const shade = document.createElement('canvas'); shade.width = shade.height = 80; const sc = shade.getContext('2d');
  function region(g, W, H, fn) { const N = 80, img = sc.createImageData(N, N); for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = fn((i + .5) / N, (j + .5) / N) > 0 ? POSc : NEGc, o = 4 * (j * N + i); img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 46; } sc.putImageData(img, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(shade, 0, 0, W, H); }
  function line(g, mx, my, a, b, c, col, dash, lw) { const m = Math.hypot(a, b); if (m < 1e-6) return; const px = -a * c / (m * m), py = -b * c / (m * m), dx = -b / m * 40, dy = a / m * 40; g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); g.moveTo(mx(px - dx), my(py - dy)); g.lineTo(mx(px + dx), my(py + dy)); g.stroke(); g.setLineDash([]); }
  function contour(g, mx, my, fn, col, lw, dash) {
    const N = 90, V = new Float32Array((N + 1) * (N + 1));
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) V[j * (N + 1) + i] = fn(-R + 2 * R * i / N, -R + 2 * R * j / N);
    g.strokeStyle = col; g.lineWidth = lw; g.setLineDash(dash); g.beginPath(); const w = i => -R + 2 * R * i / N;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = V[j * (N + 1) + i], b = V[j * (N + 1) + i + 1], c = V[(j + 1) * (N + 1) + i + 1], d = V[(j + 1) * (N + 1) + i], p = [];
      const add = (x0, y0, x1, y1, f0, f1) => { const k = f0 / (f0 - f1); p.push([w(x0 + (x1 - x0) * k), w(y0 + (y1 - y0) * k)]); };
      if ((a > 0) !== (b > 0)) add(i, j, i + 1, j, a, b); if ((b > 0) !== (c > 0)) add(i + 1, j, i + 1, j + 1, b, c); if ((d > 0) !== (c > 0)) add(i, j + 1, i + 1, j + 1, d, c); if ((a > 0) !== (d > 0)) add(i, j, i, j + 1, a, d);
      for (let k = 0; k + 1 < p.length; k += 2) { g.moveTo(mx(p[k][0]), my(p[k][1])); g.lineTo(mx(p[k + 1][0]), my(p[k + 1][1])); }
    }
    g.stroke(); g.setLineDash([]);
  }
  function warpGrid(q, hx, hy, map) { q.strokeStyle = SOFT; q.lineWidth = .7; q.globalAlpha = .4; for (let k = 0; k <= 12; k++) { const c = -R + 2 * R * k / 12; for (const dir of [0, 1]) { q.beginPath(); for (let i = 0; i <= 70; i++) { const s = -R + 2 * R * i / 70, z = dir ? map(c, s) : map(s, c); i ? q.lineTo(hx(z[0]), hy(z[1])) : q.moveTo(hx(z[0]), hy(z[1])); } q.stroke(); } } q.globalAlpha = 1; }
  function axes(q, hx, hy, lim) { q.strokeStyle = AXIS; q.lineWidth = .8; q.beginPath(); q.moveTo(hx(-lim), hy(0)); q.lineTo(hx(lim), hy(0)); q.moveTo(hx(0), hy(-lim)); q.lineTo(hx(0), hy(lim)); q.stroke(); }
  function dot(q, X, Y) { q.beginPath(); q.arc(X, Y, 6, 0, 7); q.fillStyle = PR; q.fill(); q.strokeStyle = PANEL; q.lineWidth = 2; q.stroke(); }
  function draw() {
    const a = fit($('c0')), g = a.g, W = a.W, H = a.H, mx = x => W / 2 + x / R * W / 2, my = y => H / 2 - y / R * H / 2;
    g.clearRect(0, 0, W, H); region(g, W, H, (u, z) => out(-R + 2 * R * u, R - 2 * R * z)); axes(g, mx, my, R);
    line(g, mx, my, T[0], T[1], T[2], L1, [], 1.6); line(g, mx, my, T[3], T[4], T[5], L1, [], 1.6);
    const z2a = (x, y) => { const h = layer1(x, y); return T[6] * h[0] + T[7] * h[1] + T[8]; }, z2b = (x, y) => { const h = layer1(x, y); return T[9] * h[0] + T[10] * h[1] + T[11]; };
    contour(g, mx, my, z2a, L2, 1.6, [5, 3]); contour(g, mx, my, z2b, L2, 1.6, [5, 3]); contour(g, mx, my, out, INK, 2.2, []);
    for (const p of P) pt(g, mx(p[0]), my(p[1]), p[2]); dot(g, mx(probe[0]), my(probe[1]));
    const lim = 1.3;
    const b = fit($('c1')), q = b.g, hx = z => b.W / 2 + z / lim * b.W / 2, hy = z => b.H / 2 - z / lim * b.H / 2;
    q.clearRect(0, 0, b.W, b.H); region(q, b.W, b.H, (u, z) => read(layer2([-lim + 2 * lim * u, lim - 2 * lim * z]))); axes(q, hx, hy, lim); warpGrid(q, hx, hy, layer1);
    line(q, hx, hy, T[6], T[7], T[8], L2, [5, 3], 2); line(q, hx, hy, T[9], T[10], T[11], L2, [5, 3], 2);
    for (const p of P) { const z = layer1(p[0], p[1]); pt(q, hx(z[0]), hy(z[1]), p[2]); }
    const v1 = layer1(probe[0], probe[1]); dot(q, hx(v1[0]), hy(v1[1]));
    const c = fit($('c2')), r = c.g, kx = z => c.W / 2 + z / lim * c.W / 2, ky = z => c.H / 2 - z / lim * c.H / 2;
    r.clearRect(0, 0, c.W, c.H); region(r, c.W, c.H, (u, z) => read([-lim + 2 * lim * u, lim - 2 * lim * z])); axes(r, kx, ky, lim); warpGrid(r, kx, ky, (x, y) => layer2(layer1(x, y)));
    line(r, kx, ky, T[12], T[13], T[14], INK, [], 2.4);
    for (const p of P) { const z = layer2(layer1(p[0], p[1])); pt(r, kx(z[0]), ky(z[1]), p[2]); }
    const v2 = layer2(v1); dot(r, kx(v2[0]), ky(v2[1]));
    sync();
    const f = x => { const t = Math.round(x * 100) / 100; return ((Object.is(t, -0) ? 0 : t).toFixed(2)).padStart(6); }, y = read(v2);
    $('out').textContent = `h₁ = σ(W₁x + b₁) = (${f(v1[0])}, ${f(v1[1])})\nh₂ = σ(W₂h₁ + b₂) = (${f(v2[0])}, ${f(v2[1])})\ny  = u·h₂ + c = ${f(y)}, output ${y > 0 ? '+1' : '−1'}\nmisclassified = ${wrong()} of ${P.length}\n${msg}`;
  }
  const set = (id, x, t) => { const e = $(id); if (document.activeElement !== e || opt) e.value = x; $(id + 'o').textContent = t; };
  const n1 = x => { const t = Math.round(x * 10) / 10; return (Object.is(t, -0) ? 0 : t).toFixed(1); };
  function sync() {
    const start = layer * 6, d = (x, y) => Math.atan2(y, x) * 180 / Math.PI;
    $('unit2').hidden = layer === 2; $('g0').textContent = layer === 2 ? 'Readout u, then c' : 'Unit 1';
    for (const k of (layer === 2 ? [0] : [0, 1])) { const o = start + 3 * k; set('a' + k, d(T[o], T[o + 1]), n1(d(T[o], T[o + 1])) + '°'); set('m' + k, Math.hypot(T[o], T[o + 1]), n1(Math.hypot(T[o], T[o + 1]))); set('b' + k, T[o + 2], n1(T[o + 2])); }
  }
  function grad() {
    const G = new Float64Array(15); let L = 0;
    for (const p of P) {
      const x = p[0], y = p[1], a = T[0] * x + T[1] * y + T[2], b = T[3] * x + T[4] * y + T[5], h1 = Math.tanh(a), h2 = Math.tanh(b), c = T[6] * h1 + T[7] * h2 + T[8], d = T[9] * h1 + T[10] * h2 + T[11], k1 = Math.tanh(c), k2 = Math.tanh(d), o = T[12] * k1 + T[13] * k2 + T[14], lab = p[2] > 0 ? 1 : 0, e = 1 / (1 + Math.exp(-o)) - lab;
      L += Math.max(o, 0) - o * lab + Math.log1p(Math.exp(-Math.abs(o))); G[12] += e * k1; G[13] += e * k2; G[14] += e;
      const g1 = e * T[12] * (1 - k1 * k1), g2 = e * T[13] * (1 - k2 * k2); G[6] += g1 * h1; G[7] += g1 * h2; G[8] += g1; G[9] += g2 * h1; G[10] += g2 * h2; G[11] += g2;
      const f1 = (g1 * T[6] + g2 * T[9]) * (1 - h1 * h1), f2 = (g1 * T[7] + g2 * T[10]) * (1 - h2 * h2); G[0] += f1 * x; G[1] += f1 * y; G[2] += f1; G[3] += f2 * x; G[4] += f2 * y; G[5] += f2;
    }
    for (let i = 0; i < 15; i++) G[i] /= P.length;
    return [G, L / P.length];
  }
  function step(o) { const [G, L] = grad(); o.k++; o.l = L; for (let i = 0; i < 15; i++) { o.m[i] = .9 * o.m[i] + .1 * G[i]; o.v[i] = .999 * o.v[i] + .001 * G[i] * G[i]; T[i] -= .04 * (o.m[i] / (1 - Math.pow(.9, o.k))) / (Math.sqrt(o.v[i] / (1 - Math.pow(.999, o.k))) + 1e-8); T[i] = Math.max(-30, Math.min(30, T[i])); } }
  function stop() { opt = null; $('train').textContent = 'Train'; }
  function loop() {
    if (!opt) return;
    for (let i = 0; i < 6 && opt.k < 2500; i++) step(opt);
    msg = `Training: step ${opt.k} of 2500, loss ${opt.l.toFixed(3)}.`;
    if (opt.k >= 2500) { const w = wrong(), l = opt.l; stop(); msg = w === 0 ? `Finished: loss ${l.toFixed(3)}, every training point is right.` : `Finished: loss ${l.toFixed(3)}, ${w} still wrong. Try another start.`; draw(); return; }
    draw(); requestAnimationFrame(loop);
  }
  const edit = fn => e => { stop(); fn(+e.target.value); msg = 'Set by hand.'; draw(); };
  const base = k => layer * 6 + 3 * k, polar = (o, deg, m) => { T[o] = m * Math.cos(deg * Math.PI / 180); T[o + 1] = m * Math.sin(deg * Math.PI / 180); };
  for (const k of [0, 1]) {
    $('a' + k).oninput = edit(x => { const o = base(k); polar(o, x, Math.hypot(T[o], T[o + 1])); });
    $('m' + k).oninput = edit(x => { const o = base(k); polar(o, Math.atan2(T[o + 1], T[o]) * 180 / Math.PI, x); });
    $('b' + k).oninput = edit(x => { T[base(k) + 2] = x; });
  }
  $('layer').onchange = e => { layer = +e.target.value; draw(); };
  $('task').onchange = e => { stop(); task = e.target.value; P = data(task); msg = 'New data, same network. Train it, or load the best start found.'; draw(); };
  $('best').onclick = () => { stop(); T = Float64Array.from(BEST[task]); const w = wrong(); msg = w === 0 ? 'The best of 30 random starts: every training point is right.' : `The best of 30 random starts: ${w} still wrong.`; draw(); };
  $('fresh').onclick = () => { stop(); seed++; const r = mul(seed * 977), n = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r()); for (let i = 0; i < 15; i++) T[i] = n() * ((i + 1) % 3 === 0 ? .5 : .9); msg = 'Random start. Press Train.'; draw(); };
  $('train').onclick = () => { if (opt) { stop(); msg = 'Paused.'; draw(); return; } opt = { k: 0, l: 0, m: new Float64Array(15), v: new Float64Array(15) }; $('train').textContent = 'Pause'; requestAnimationFrame(loop); };
  const c = $('c0'); let drag = false;
  const world = e => { const r = c.getBoundingClientRect(); return [((e.clientX - r.left) / r.width * 2 - 1) * R, (1 - (e.clientY - r.top) / r.height * 2) * R, r.width]; };
  const near = e => { const w = world(e); return Math.hypot(w[0] - probe[0], w[1] - probe[1]) < 22 / w[2] * 2 * R; };
  c.addEventListener('pointerdown', e => { if (near(e)) { drag = true; c.setPointerCapture(e.pointerId); e.preventDefault(); } });
  c.addEventListener('pointermove', e => { c.style.cursor = drag ? 'grabbing' : near(e) ? 'grab' : 'default'; if (!drag) return; const w = world(e); probe = [Math.max(-R, Math.min(R, w[0])), Math.max(-R, Math.min(R, w[1]))]; draw(); });
  c.addEventListener('pointerup', () => { drag = false; }); c.addEventListener('pointercancel', () => { drag = false; });
  c.addEventListener('touchstart', e => { const t = e.touches[0]; if (t && near(t)) e.preventDefault(); }, { passive: false });
  c.addEventListener('keydown', e => { const d = { ArrowLeft: [-.1, 0], ArrowRight: [.1, 0], ArrowUp: [0, .1], ArrowDown: [0, -.1] }[e.key]; if (!d) return; e.preventDefault(); probe = [Math.max(-R, Math.min(R, probe[0] + d[0])), Math.max(-R, Math.min(R, probe[1] + d[1]))]; draw(); });
  new ResizeObserver(draw).observe(c); draw();
})();
