// Replays saved G1 growth runs: the sheet, its footprint, why each bend won, and every bend's curve.
(function () {
  'use strict';
  const root = document.getElementById('g1-demo'), DATA = window.G1_DATA;
  if (!root || !DATA) return;

  root.innerHTML = `
<ol class="g1-steps">
  <li>Start as a perceptron: a flat sheet, cut where its height is zero.</li>
  <li>Try about 30 directions to measure along. For each one, fit a new curve and lift the sheet by it.</li>
  <li>Refit every free curve and the line together in one solve. Keep the direction with the lowest loss on held-out points.</li>
  <li>Repeat until the held-out shape is right, nothing helps, or there are 12 bends.</li>
</ol>
<div class="g1-bar">
  <div class="nd-bar">
    <label for="g1-task">Task <select id="g1-task"></select></label>
    <button type="button" id="g1-prev">Back</button>
    <button type="button" id="g1-next">Add bend</button>
    <button type="button" id="g1-play" class="nd-primary">Grow</button>
    <input id="g1-stage" class="g1-stage" type="range" min="0" max="1" step="1" value="0" aria-label="Number of bends">
  </div>
  <div class="g1-readout" id="g1-readout"></div>
  <p class="g1-story" id="g1-story" role="status"></p>
</div>
<div class="g1-two">
  <figure>
    <figcaption><b>The sheet</b>Height is the answer y, squashed so tall sheets fit. The cut is the grey plane. Drag to turn.</figcaption>
    <div class="nd-box"><canvas id="g1-sheet" class="g1-sheet" tabindex="0" role="img" aria-label="Three-dimensional view of the answer as a height over the input plane. Arrow keys turn it."></canvas></div>
  </figure>
  <figure>
    <figcaption><b>What it answers</b>Orange above the cut, blue below. Dashed: the target. Light speckle: still wrong.</figcaption>
    <div class="nd-box"><canvas id="g1-map" role="img" aria-label="Top view of the answer with the target outline and wrong areas."></canvas></div>
  </figure>
</div>
<section class="g1-panel">
  <h4 id="g1-triedhead">Why this bend won</h4>
  <div class="g1-tried" id="g1-triedwrap">
    <canvas id="g1-dial" role="img" aria-label="Held-out improvement for each of the 24 plane directions."></canvas>
    <div id="g1-rows"></div>
  </div>
  <p class="g1-small" id="g1-triedhelp">Each spoke is one of the 24 plane directions, and a longer spoke cut the held-out loss more. The bars compare the best candidate of each kind on the same scale.</p>
</section>
<section class="g1-panel">
  <h4>The neuron at this stage</h4>
  <p class="g1-eq" id="g1-eq"></p>
  <p class="g1-small">Left in each card: what that bend adds across the plane, with orange raising the sheet and blue lowering it. Right: its learned curve f(s), with the previous stage's curve dashed. The two differ when a new bend makes an earlier one reshape.</p>
  <div class="g1-cards" id="g1-cards"></div>
</section>`;

  const $ = id => document.getElementById('g1-' + id);
  const KNOTS = Array.from({ length: 20 }, (_, i) => -1 + 2 * (i + 1) / 21);
  const rad = d => d * Math.PI / 180;
  const rot = (x, y, deg) => { const c = Math.cos(rad(deg)), s = Math.sin(rad(deg)); return [x * c + y * s, -x * s + y * c]; };
  const strip = (x, y, deg, c, h) => Math.abs(x * Math.cos(rad(deg)) + y * Math.sin(rad(deg)) - c) < h;
  const sq = (x, y, half, cx, cy) => { const [a, b] = rot(x - cx, y - cy, 20); return Math.abs(a) < half && Math.abs(b) < half; };
  const crs = (x, y, h1, h2) => strip(x, y, 15, 0.1, h1) || strip(x, y, 115, -0.05, h2);
  const d2 = (x, y, cx, cy) => Math.hypot(x - cx, y - cy);
  const SHAPES = {
    "slab": (x, y) => Math.abs(rot(x, y, 30)[0] - 0.1) < 0.35, "outside slab": (x, y) => Math.abs(rot(x, y, -40)[0] + 0.1) > 0.4,
    "square": (x, y) => sq(x, y, 0.55, 0.1, -0.05), "disk": (x, y) => d2(x, y, -0.1, 0.1) < 0.65, "cross": (x, y) => crs(x, y, 0.25, 0.22),
    "two parallel strips": (x, y) => strip(x, y, 60, 0.65, 0.22) || strip(x, y, 60, -0.55, 0.22),
    "hollow cross": (x, y) => strip(x, y, 15, 0.1, 0.25) !== strip(x, y, 115, -0.05, 0.22),
    "ring": (x, y) => { const d = d2(x, y, -0.05, 0.1); return d > 0.35 && d < 0.75; },
    "picture frame": (x, y) => sq(x, y, 0.72, 0.05, -0.05) && !sq(x, y, 0.38, 0.05, -0.05),
    "cross outline": (x, y) => crs(x, y, 0.42, 0.42) && !crs(x, y, 0.16, 0.16),
  };
  const curve = (b, s) => { const t = (s - b.lo) / (b.hi - b.lo + 1e-9) * 2 - 1; let f = b.a[0] * t; for (let j = 0; j < 20; j++) if (t > KNOTS[j]) f += b.a[j + 1] * (t - KNOTS[j]); return f; };
  const measure = (b, Z) => { let s = 0; for (let i = 0; i < b.v.length; i++) s += b.v[i] * Z[i]; return s; };
  function lifts(st, x, y) { const Z = [x, y]; for (const b of st.bends) Z.push(curve(b, measure(b, Z))); return Z; }
  function answer(st, x, y) { const Z = lifts(st, x, y); let v = st.w[0] * x + st.w[1] * y + st.c; st.bends.forEach((b, k) => { v += b.r * Z[2 + k]; }); return v; }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = { task: 'disk', k: 2, az: rad(-35), el: rad(35), playing: null, shownH: null, morph: null };
  const lim = () => S.task === 'xor' ? [-0.4, 1.4] : [-1.2, 1.2];
  const css = getComputedStyle(root), g = k => css.getPropertyValue(k).trim(), hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const C = { above: g('--above'), below: g('--below'), mark: g('--mark'), ink: g('--nd-ink'), muted: g('--nd-soft'), line: g('--nd-line'), panel: g('--nd-plot'), plane: g('--plane'), mono: g('--mono') || 'monospace' };
  C.a = hex(C.above); C.b = hex(C.below); C.p = hex(C.panel); C.i = hex(C.ink);

  function fit(c) { const r = c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2), w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); return { g: x, W: r.width, H: r.height }; }

  // ---------- heights
  const N = 61, heightCache = new Map(), mapCache = new Map();
  function heights(task, k) {
    const key = task + '|' + k; if (heightCache.has(key)) return heightCache.get(key);
    const st = DATA[task].stages[k], [a, b] = task === 'xor' ? [-0.4, 1.4] : [-1.2, 1.2], H = new Float32Array(N * N);
    for (let j = 0, i = 0; j < N; j++) for (let q = 0; q < N; q++, i++) H[i] = answer(st, a + (b - a) * q / (N - 1), a + (b - a) * j / (N - 1));
    heightCache.set(key, H); return H;
  }
  const squash = y => 0.72 * Math.tanh(y / 6);
  function marching(val, n, emit) {
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = val(i, j), b = val(i + 1, j), c = val(i + 1, j + 1), d = val(i, j + 1), p = [];
      const add = (x0, y0, x1, y1, f0, f1) => { const k = f0 / (f0 - f1); p.push([x0 + (x1 - x0) * k, y0 + (y1 - y0) * k]); };
      if ((a > 0) !== (b > 0)) add(i, j, i + 1, j, a, b);
      if ((b > 0) !== (c > 0)) add(i + 1, j, i + 1, j + 1, b, c);
      if ((d > 0) !== (c > 0)) add(i, j + 1, i + 1, j + 1, d, c);
      if ((a > 0) !== (d > 0)) add(i, j, i, j + 1, a, d);
      for (let q = 0; q + 1 < p.length; q += 2) emit(p[q][0], p[q][1], p[q + 1][0], p[q + 1][1]);
    }
  }
  function drawSheet(H) {
    const { g: x, W } = fit($('sheet')), ca = Math.cos(S.az), sa = Math.sin(S.az), ce = Math.cos(S.el), se = Math.sin(S.el), scale = W * 0.32, cx = W / 2, cy = W * 0.5;
    const P = (px, py, z) => { const xr = px * ca - py * sa, yr = px * sa + py * ca; return [cx + scale * xr, cy - scale * (z * ce + yr * se), yr * ce - z * se]; };
    x.clearRect(0, 0, W, W);
    const pts = new Array(N * N), Z = new Float32Array(N * N);
    for (let j = 0, i = 0; j < N; j++) for (let q = 0; q < N; q++, i++) { Z[i] = squash(H[i]); pts[i] = P(-1 + 2 * q / (N - 1), -1 + 2 * j / (N - 1), Z[i]); }
    const below = [], above = [];
    const part = (idx, keepAbove) => {
      const out = [];
      for (let i = 0; i < 4; i++) {
        const p = idx[i], q = idx[(i + 1) % 4], zp = Z[p], zq = Z[q], inP = keepAbove ? zp > 0 : zp <= 0, inQ = keepAbove ? zq > 0 : zq <= 0;
        if (inP) out.push(pts[p]);
        if (inP !== inQ) { const k = zp / (zp - zq); out.push([pts[p][0] + k * (pts[q][0] - pts[p][0]), pts[p][1] + k * (pts[q][1] - pts[p][1]), pts[p][2] + k * (pts[q][2] - pts[p][2])]); }
      }
      return out;
    };
    for (let j = 0; j < N - 1; j++) for (let q = 0; q < N - 1; q++) {
      const a = j * N + q, b = a + 1, c = a + N + 1, d = a + N, idx = [a, b, c, d], slope = (Z[b] - Z[a] + Z[c] - Z[d]) * sa + (Z[d] - Z[a] + Z[c] - Z[b]) * ca;
      for (const [list, up] of [[above, true], [below, false]]) { const poly = part(idx, up); if (poly.length > 2) list.push([poly, up, poly.reduce((s, p) => s + p[2], 0) / poly.length, slope]); }
    }
    const paint = list => {
      list.sort((p, q) => q[2] - p[2]);
      for (const [poly, up, , slope] of list) {
        const col = up ? C.a : C.b, lit = Math.min(1, Math.max(0, 0.72 - slope * 4)), m = 0.1 + 0.45 * (1 - lit), r = col[0] + (C.p[0] - col[0]) * m, gr = col[1] + (C.p[1] - col[1]) * m, bl = col[2] + (C.p[2] - col[2]) * m, f = `rgb(${r | 0},${gr | 0},${bl | 0})`;
        x.fillStyle = f; x.strokeStyle = f; x.lineWidth = .6; x.beginPath(); poly.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); x.stroke();
      }
    };
    paint(below);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([px, py]) => P(px, py, 0));
    x.globalAlpha = .42; x.fillStyle = C.plane; x.beginPath(); corners.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.fill(); x.globalAlpha = 1;
    x.strokeStyle = C.ink; x.lineWidth = 2; x.beginPath();
    marching((i, j) => H[j * N + i], N, (x0, y0, x1, y1) => { const a = P(-1 + 2 * x0 / (N - 1), -1 + 2 * y0 / (N - 1), 0), b = P(-1 + 2 * x1 / (N - 1), -1 + 2 * y1 / (N - 1), 0); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); });
    x.stroke();
    x.strokeStyle = C.plane; x.lineWidth = 1; x.beginPath(); corners.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])); x.closePath(); x.stroke();
    paint(above);
  }

  // ---------- top view
  const GN = 181, off = document.createElement('canvas'); off.width = off.height = GN;
  const offG = off.getContext('2d');
  function topData(task, k) {
    const key = task + '|' + k; if (mapCache.has(key)) return mapCache.get(key);
    const st = DATA[task].stages[k], [a, b] = task === 'xor' ? [-0.4, 1.4] : [-1.2, 1.2], Y = new Float64Array(GN * GN), f = SHAPES[task], img = offG.createImageData(GN, GN);
    for (let j = 0, i = 0; j < GN; j++) for (let q = 0; q < GN; q++, i++) {
      const px = a + (b - a) * q / (GN - 1), py = a + (b - a) * j / (GN - 1), v = answer(st, px, py); Y[i] = v;
      const o = 4 * ((GN - 1 - j) * GN + q), col = v > 0 ? C.a : C.b; let al = 70 + 100 * Math.min(1, Math.abs(v) / 3);
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2];
      if (f && (v > 0) !== f(px, py) && (q + j) % 3 === 0) { img.data[o] = C.i[0]; img.data[o + 1] = C.i[1]; img.data[o + 2] = C.i[2]; al = 210; }
      img.data[o + 3] = al;
    }
    const out = { Y, img }; mapCache.set(key, out); return out;
  }
  let tgtFor = null, tgtSegs = [];
  function targetSegs(task) {
    if (tgtFor === task) return tgtSegs;
    tgtFor = task; tgtSegs = [];
    if (!SHAPES[task]) return tgtSegs;
    const f = SHAPES[task], n = 241, m = new Float32Array(n * n);
    for (let j = 0, i = 0; j < n; j++) for (let q = 0; q < n; q++, i++) m[i] = f(-1.2 + 2.4 * q / (n - 1), -1.2 + 2.4 * j / (n - 1)) ? 1 : 0;
    const v = (i, j) => { let s = 0, c = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { const p = i + a, q = j + b; if (p >= 0 && q >= 0 && p < n && q < n) { s += m[q * n + p]; c++; } } return s / c - .5; };
    marching(v, n, (a, b, c, d) => tgtSegs.push(a / (n - 1), b / (n - 1), c / (n - 1), d / (n - 1)));
    return tgtSegs;
  }
  function drawMap() {
    const { g: x, W } = fit($('map')), T = topData(S.task, S.k), [a, b] = lim(), st = DATA[S.task].stages[S.k];
    offG.putImageData(T.img, 0, 0); x.clearRect(0, 0, W, W); x.imageSmoothingEnabled = false; x.drawImage(off, 0, 0, W, W);
    x.strokeStyle = C.ink; x.lineWidth = 2.2; x.beginPath();
    marching((i, j) => T.Y[j * GN + i], GN, (x0, y0, x1, y1) => { x.moveTo(x0 / (GN - 1) * W, W - y0 / (GN - 1) * W); x.lineTo(x1 / (GN - 1) * W, W - y1 / (GN - 1) * W); });
    x.stroke();
    x.lineWidth = 1.4; x.setLineDash([5, 4]); x.beginPath(); const s = targetSegs(S.task);
    for (let i = 0; i < s.length; i += 4) { x.moveTo(s[i] * W, W - s[i + 1] * W); x.lineTo(s[i + 2] * W, W - s[i + 3] * W); }
    x.stroke(); x.setLineDash([]);
    if (S.task === 'xor') for (const [px, py, l] of [[0, 0, 0], [1, 0, 1], [0, 1, 1], [1, 1, 0]]) { const X = (px - a) / (b - a) * W, Y = W - (py - a) / (b - a) * W; x.beginPath(); x.arc(X, Y, 9, 0, 7); x.fillStyle = l ? C.ink : C.panel; x.fill(); x.strokeStyle = C.ink; x.lineWidth = 2; x.stroke(); }
    const last = st.bends[S.k - 1];
    if (last && last.kind === 'angle') {
      const u = [last.v[0], last.v[1]], X = z => (z - a) / (b - a) * W, Y = z => W - (z - a) / (b - a) * W, c = (a + b) / 2, r = (b - a) * .44;
      x.strokeStyle = C.mark; x.lineWidth = 2.5; x.setLineDash([9, 5]); x.beginPath(); x.moveTo(X(c - u[0] * r), Y(c - u[1] * r)); x.lineTo(X(c + u[0] * r), Y(c + u[1] * r)); x.stroke(); x.setLineDash([]);
    }
  }

  // ---------- candidates
  const kindName = { "angle": "Plane direction", "own answer": "Its own answer", "error spread": "Error spread", "error spread, lifted": "Error spread, lifted" };
  const nameOf = kind => kindName[kind] || 'Earlier lift';
  function drawTried() {
    const st = DATA[S.task].stages[S.k], has = !!st.tried;
    $('triedwrap').hidden = !has; $('triedhelp').hidden = !has;
    if (!has) { $('triedhead').textContent = 'No choice yet: this is the starting perceptron'; return; }
    $('triedhead').textContent = `Why bend ${S.k} won`;
    const gains = st.tried.map(c => ({ ...c, gain: st.base - c.loss })), maxG = Math.max(1e-9, st.base - st.loss, ...gains.map(c => c.gain));
    const { g: x, W } = fit($('dial')), cx = W / 2, cy = W / 2, R = W / 2 - 22;
    x.clearRect(0, 0, W, W); x.strokeStyle = C.line; x.lineWidth = 1;
    for (const f of [.5, 1]) { x.beginPath(); x.arc(cx, cy, R * f, 0, 7); x.stroke(); }
    const bestAngle = st.kind === 'angle' ? Math.atan2(st.bends[S.k - 1].v[1], st.bends[S.k - 1].v[0]) * 180 / Math.PI : null;
    for (const c of gains.filter(c => c.kind === 'angle')) {
      const a = rad(c.angle), r = Math.max(0, c.gain) / maxG * R, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      x.strokeStyle = C.plane; x.lineWidth = 3; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - dx, cy + dy); x.lineTo(cx + dx, cy - dy); x.stroke();
    }
    if (bestAngle !== null) { const a = rad(bestAngle), dx = Math.cos(a) * R, dy = Math.sin(a) * R; x.strokeStyle = C.mark; x.lineWidth = 4; x.beginPath(); x.moveTo(cx - dx, cy + dy); x.lineTo(cx + dx, cy - dy); x.stroke(); }
    x.fillStyle = C.muted; x.font = '11px ' + C.mono; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('0°', W - 10, cy); x.fillText('90°', cx, 9); x.fillText('45°', cx + (R + 9) * .72, cy - (R + 9) * .72); x.fillText('135°', cx - (R + 7) * .72, cy - (R + 9) * .72);
    const groups = {}; for (const c of gains) { const n = nameOf(c.kind); if (!groups[n] || c.gain > groups[n].gain) groups[n] = c; }
    const won = nameOf(st.kind);
    if (groups[won]) groups[won] = { ...groups[won], gain: st.base - st.loss, kind: st.kind };
    $('rows').innerHTML = Object.entries(groups).sort((a, b) => b[1].gain - a[1].gain).map(([n, c]) => `<div class="g1-row ${n === won ? 'on' : ''}"><span>${n}${c.kind.startsWith('lift') ? ' (' + c.kind.slice(5) + ')' : ''}</span><div class="g1-track"><div class="g1-fill" style="width:${(Math.max(0, c.gain) / maxG * 100).toFixed(1)}%"></div></div><output>${c.gain >= 0 ? '−' : '+'}${Math.abs(c.gain).toFixed(3)}</output></div>`).join('') + `<p class="g1-small" style="margin-top:.4rem">Change in held-out loss. It started this round at ${st.base.toFixed(3)}. ${st.tried.length} candidates were tried.</p>`;
  }

  // ---------- the cards
  const pool = [];
  for (let i = 0; i < 12; i++) {
    const el = document.createElement('article'); el.className = 'g1-card'; el.hidden = true;
    el.innerHTML = '<header><span class="g1-title"></span><span class="g1-tag"></span></header><canvas class="g1-map" aria-hidden="true"></canvas><canvas class="g1-curve" aria-hidden="true"></canvas>';
    $('cards').appendChild(el); pool.push(el);
  }
  function drawCard(i, st, prev) {
    const el = pool[i], b = st.bends[i], old = prev && prev.bends[i], isNew = i === S.k - 1, ang = ((Math.atan2(b.v[1], b.v[0]) * 180 / Math.PI) % 180 + 180) % 180;
    el.hidden = false; el.classList.toggle('new', isNew);
    const what = b.kind === 'angle' ? `measures ${ang.toFixed(1)}°` : b.kind.startsWith('lift') ? `measures bend ${b.kind.slice(5)}'s output` : b.kind === 'own answer' ? 'measures its own answer' : b.kind.endsWith('lifted') ? 'measures an error direction in the lifted space' : `measures the error direction at ${ang.toFixed(1)}°`;
    el.querySelector('.g1-title').innerHTML = `<b>Bend ${i + 1}</b> ${what}`;
    el.querySelector('.g1-tag').textContent = b.frozen ? `frozen, weight ${b.r.toFixed(2)}` : 'free';
    const [a0, a1] = lim(), n = 48, c1 = el.querySelector('.g1-map'), r = fit(c1), vals = new Float32Array(n * n); let mx = 1e-6;
    for (let j = 0, q = 0; j < n; j++) for (let p = 0; p < n; p++, q++) { const Z = lifts(st, a0 + (a1 - a0) * p / (n - 1), a0 + (a1 - a0) * j / (n - 1)); vals[q] = b.r * Z[2 + i]; }
    let mean = 0; for (const v of vals) mean += v; mean /= vals.length;
    for (let q = 0; q < vals.length; q++) { vals[q] -= mean; mx = Math.max(mx, Math.abs(vals[q])); }
    const cell = r.W / n; r.g.clearRect(0, 0, r.W, r.H);
    for (let j = 0, q = 0; j < n; j++) for (let p = 0; p < n; p++, q++) { const v = vals[q] / mx, col = v > 0 ? C.a : C.b; r.g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${Math.abs(v).toFixed(2)})`; r.g.fillRect(p * cell, r.H - (j + 1) * cell, cell + .5, cell + .5); }
    const c2 = el.querySelector('.g1-curve'), R2 = fit(c2), x = R2.g, W = R2.W, H = R2.H, pts = 120, span = b.hi - b.lo, xs = Array.from({ length: pts }, (_, q) => b.lo + span * q / (pts - 1)), f0 = xs.map(s => curve(b, s)), f1 = old ? xs.map(s => curve(old, s)) : null;
    let lo = Math.min(...f0), hi = Math.max(...f0); if (f1) { lo = Math.min(lo, ...f1); hi = Math.max(hi, ...f1); } const pad = (hi - lo) * .1 + 1e-6;
    const X = q => 4 + (W - 8) * q / (pts - 1), Y = v => H - 16 - (v - lo + pad) / (hi - lo + 2 * pad) * (H - 22);
    x.clearRect(0, 0, W, H); x.strokeStyle = C.line; x.lineWidth = 1; x.beginPath(); x.moveTo(0, H - 14); x.lineTo(W, H - 14); x.stroke();
    if (f1) { x.strokeStyle = C.muted; x.lineWidth = 1.3; x.setLineDash([4, 3]); x.beginPath(); f1.forEach((v, q) => q ? x.lineTo(X(q), Y(v)) : x.moveTo(X(q), Y(v))); x.stroke(); x.setLineDash([]); }
    x.strokeStyle = isNew ? C.mark : C.ink; x.lineWidth = 2; x.beginPath(); f0.forEach((v, q) => q ? x.lineTo(X(q), Y(v)) : x.moveTo(X(q), Y(v))); x.stroke();
    x.fillStyle = C.muted; x.font = '10px ' + C.mono; x.textAlign = 'left'; x.textBaseline = 'alphabetic'; x.fillText(b.lo.toFixed(2), 2, H - 2); x.textAlign = 'right'; x.fillText('s = ' + b.hi.toFixed(2), W - 2, H - 2);
  }
  function drawCards() {
    const stages = DATA[S.task].stages, st = stages[S.k], prev = S.k > 0 ? stages[S.k - 1] : null;
    pool.forEach((el, i) => { if (i < st.bends.length) drawCard(i, st, prev); else el.hidden = true; });
    const sgn = v => v < 0 ? '−' : '+', num = v => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2), sub = '₁₂₃₄₅₆₇₈₉', f = k => 'f' + (k < 9 ? sub[k] : '₁' + '₀₁₂'[k - 9]);
    const terms = st.bends.map((b, k) => b.frozen ? `${num(b.r)}·${f(k)}` : f(k));
    $('eq').textContent = `y = ${num(st.w[0])}·x₁ ${sgn(st.w[1])} ${num(Math.abs(st.w[1]))}·x₂ ${terms.length ? '+ ' + terms.join(' + ') + ' ' : ''}${sgn(st.c)} ${num(Math.abs(st.c))}   (${st.numbers} stored numbers)`;
  }

  // ---------- story
  function story() {
    const r = DATA[S.task], st = r.stages[S.k], K = r.stages.length - 1, label = S.task === 'xor' ? `${Math.round(st.score * 4)} of 4 corners right` : `IoU ${st.score.toFixed(3)}`;
    let s;
    if (S.k === 0) s = `G1 starts as a perceptron, a flat tilted sheet with one straight cut. Score: ${label}.`;
    else {
      const b = st.bends[S.k - 1], ang = ((Math.atan2(b.v[1], b.v[0]) * 180 / Math.PI) % 180 + 180) % 180;
      const how = st.kind === 'angle' ? `measures the plane at ${ang.toFixed(1)}°, the purple dashed line` : st.kind.startsWith('lift') ? `measures the output of bend ${st.kind.slice(5)}, which freezes that bend's curve` : st.kind === 'own answer' ? "measures the neuron's own current answer, which freezes every earlier curve it reads" : st.kind.endsWith('lifted') ? 'measures the direction its remaining errors spread along in the lifted space' : `measures the direction its remaining errors spread along, ${ang.toFixed(1)}°`;
      s = `Bend ${S.k} ${how}. It won against ${st.tried.length - 1} other candidates and cut held-out loss from ${st.base.toFixed(3)} to ${st.loss.toFixed(3)}. Score: ${label}.`;
    }
    if (S.k === K) s += { target: ' Growth stops here because it reached the target on held-out points.', limit: ' Growth stops here at the 12-bend limit.', 'no gain': ' Growth stops here because no candidate helps.' }[r.stop];
    $('story').textContent = s;
    $('readout').textContent = `${S.k} of ${K} bends · ${st.numbers} numbers · ${S.task === 'xor' ? Math.round(st.score * 100) + '% right' : 'IoU ' + st.score.toFixed(3)}`;
  }

  let sheetFrame = 0;
  function render(instant) {
    const target = heights(S.task, S.k);
    if (instant || reduced || !S.shownH || S.shownH.length !== target.length) { S.shownH = target; S.morph = null; drawSheet(target); }
    else if (S.shownH !== target) { S.morph = { from: S.shownH, to: target, t0: performance.now() }; animate(); }
    else drawSheet(target);
    drawMap(); drawTried(); drawCards(); story();
    $('stage').value = S.k; $('prev').disabled = S.k === 0; $('next').disabled = S.k === DATA[S.task].stages.length - 1;
  }
  function animate() {
    cancelAnimationFrame(sheetFrame);
    const step = now => {
      if (!S.morph) return;
      const k = Math.min(1, (now - S.morph.t0) / 500), e = k * k * (3 - 2 * k), { from, to } = S.morph, H = new Float32Array(to.length);
      for (let i = 0; i < to.length; i++) H[i] = from[i] + e * (to[i] - from[i]);
      S.shownH = k >= 1 ? to : H; drawSheet(S.shownH);
      if (k < 1) sheetFrame = requestAnimationFrame(step); else S.morph = null;
    };
    sheetFrame = requestAnimationFrame(step);
  }
  function stop() { if (S.playing) { clearInterval(S.playing); S.playing = null; $('play').textContent = 'Grow'; } }
  function go(k) { S.k = Math.max(0, Math.min(DATA[S.task].stages.length - 1, k)); render(false); }
  function pickTask(t) { stop(); S.task = t; $('task').value = t; $('stage').max = DATA[t].stages.length - 1; S.k = 0; S.shownH = null; render(true); }

  const LABEL = t => t === 'xor' ? 'XOR' : t;
  $('task').innerHTML = Object.keys(DATA).map(t => `<option value="${t}">${LABEL(t)} (${DATA[t].stages.length - 1} bend${DATA[t].stages.length === 2 ? '' : 's'})</option>`).join('');
  $('task').onchange = e => pickTask(e.target.value);
  $('prev').onclick = () => { stop(); go(S.k - 1); };
  $('next').onclick = () => { stop(); go(S.k + 1); };
  $('stage').oninput = e => { stop(); go(+e.target.value); };
  $('play').onclick = () => {
    if (S.playing) { stop(); return; }
    if (S.k === DATA[S.task].stages.length - 1) go(0);
    $('play').textContent = 'Pause';
    S.playing = setInterval(() => { if (S.k >= DATA[S.task].stages.length - 1) { stop(); return; } go(S.k + 1); }, reduced ? 2600 : 1800);
  };
  const sc = $('sheet'); let drag = null;
  sc.addEventListener('pointerdown', e => { drag = [e.clientX, e.clientY]; sc.setPointerCapture(e.pointerId); sc.style.cursor = 'grabbing'; });
  sc.addEventListener('pointermove', e => { if (!drag) return; S.az += (e.clientX - drag[0]) * .008; S.el = Math.max(rad(10), Math.min(rad(85), S.el + (e.clientY - drag[1]) * .006)); drag = [e.clientX, e.clientY]; drawSheet(S.shownH); });
  const up = () => { drag = null; sc.style.cursor = 'grab'; };
  sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', up);
  sc.addEventListener('keydown', e => { const d = { ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, .05], ArrowDown: [0, -.05] }[e.key]; if (!d) return; e.preventDefault(); S.az += d[0]; S.el = Math.max(rad(10), Math.min(rad(85), S.el + d[1])); drawSheet(S.shownH); });
  let lastW = 0;
  new ResizeObserver(() => { const w = root.clientWidth; if (w === lastW || !S.shownH) return; lastW = w; drawSheet(S.shownH); drawMap(); drawTried(); drawCards(); }).observe(root);
  $('task').value = S.task; $('stage').max = DATA[S.task].stages.length - 1;
  render(true);
})();
