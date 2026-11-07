(function () {
  'use strict';
  var root = document.getElementById('hs-demo');
  if (!root) return;

  var style = document.createElement('style');
  style.textContent = [
    '.hs-demo{margin:2rem 0;padding:1rem;background:var(--paper-deep);border:1px solid var(--line);font-family:var(--mono);font-size:.875rem;line-height:1.5}',
    '.hs-plot{display:block;width:100%;max-width:30rem;margin:0 auto;background:var(--paper)}',
    '.hs-grid{stroke:var(--line);stroke-width:1}',
    '.hs-half{fill:var(--cyan);opacity:.16}',
    '.hs-hyp{stroke:var(--ink);stroke-width:2.5}',
    '.hs-w{stroke:var(--pencil);stroke-width:3;fill:none}',
    '.hs-wtip{fill:var(--pencil)}',
    '.hs-proj{stroke:var(--pencil);stroke-width:1.5;stroke-dasharray:5 5}',
    '.hs-pos{fill:var(--cyan)}',
    '.hs-neg{fill:var(--pink)}',
    '.hs-ring{fill:none;stroke:var(--ink);stroke-width:1.75}',
    '.hs-label{fill:var(--ink-soft);font:400 13px var(--mono)}',
    '.hs-wlabel{fill:var(--pencil);font:600 16px var(--mono)}',
    '.hs-test{fill:var(--pencil);stroke:var(--paper-deep);stroke-width:2}',
    '.hs-hit{fill:transparent;cursor:grab;touch-action:none}',
    '.hs-handle:focus-visible .hs-test{stroke:var(--ink);stroke-width:3}',
    '.hs-handle:focus{outline:none}',
    '.hs-key{display:flex;flex-wrap:wrap;gap:.25rem 1.25rem;margin:.75rem 0;color:var(--ink-soft);font-size:.8125rem}',
    '.hs-key span{display:inline-flex;align-items:center;gap:.4rem}',
    '.hs-key svg{flex:none}',
    '.hs-sliders{display:grid;gap:.4rem;margin:.75rem 0}',
    '.hs-sliders label{display:grid;grid-template-columns:2rem minmax(0,1fr) 3.75rem;align-items:center;gap:.6rem;color:var(--ink-soft)}',
    '.hs-sliders input{width:100%;margin:0;accent-color:var(--pencil)}',
    '.hs-sliders output{color:var(--ink);text-align:right}',
    '.hs-btns{display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0}',
    '.hs-btns button{padding:.45rem .75rem;background:transparent;border:1px solid var(--line);color:var(--ink);font:inherit;cursor:pointer}',
    '.hs-btns button:hover{border-color:var(--pencil);color:var(--pencil)}',
    '.hs-out{padding:.75rem;background:var(--paper);border:1px solid var(--line);color:var(--ink);overflow-wrap:anywhere}',
    '.hs-out div{min-height:1.5em}',
    '.prose .katex-display{overflow:auto hidden;padding-block:.25rem}'
  ].join('');
  document.head.appendChild(style);

  var P = [[2, 3, 1], [3, 1.5, 1], [1, 3.5, 1], [3.5, 3, 1], [0.5, 1.5, 1], [-2, -1, -1], [-1, -3, -1], [-3, -2, -1], [0, -2, -1], [-3, 1, -1]];
  var ETA = 0.25, SCALE = 40, MID = 200, LIMIT = 5;
  var sx = function (x) { return MID + SCALE * x; };
  var sy = function (y) { return MID - SCALE * y; };

  root.innerHTML =
    '<svg class="hs-plot" viewBox="0 0 400 400" role="img" aria-label="The plane with a separating line, its positive half-plane, the weight vector, ten labeled points and a test point you can move.">' +
    '<defs><marker id="hs-tip" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path class="hs-wtip" d="M0 0L10 5L0 10z"/></marker></defs>' +
    '<polygon id="hs-half" class="hs-half"/>' +
    '<line class="hs-grid" x1="0" y1="200" x2="400" y2="200"/><line class="hs-grid" x1="200" y1="0" x2="200" y2="400"/>' +
    '<text class="hs-label" x="384" y="192" text-anchor="end">x₁</text><text class="hs-label" x="208" y="18">x₂</text>' +
    '<line id="hs-hyp" class="hs-hyp"/><line id="hs-proj" class="hs-proj"/>' +
    '<line id="hs-wv" class="hs-w" x1="200" y1="200" marker-end="url(#hs-tip)"/><text id="hs-wl" class="hs-wlabel">w</text>' +
    '<g id="hs-pts"></g>' +
    '<g id="hs-handle" class="hs-handle" tabindex="0" role="slider" aria-label="Test point. Use the arrow keys to move it."><circle id="hs-test" class="hs-test" r="8"/><circle id="hs-hit" class="hs-hit" r="22"/></g>' +
    '</svg>' +
    '<div class="hs-key">' +
    '<span><svg width="12" height="12"><circle class="hs-pos" cx="6" cy="6" r="5"/></svg>Label +1</span>' +
    '<span><svg width="12" height="12"><rect class="hs-neg" x="1" y="1" width="10" height="10"/></svg>Label −1</span>' +
    '<span><svg width="14" height="14"><circle class="hs-ring" cx="7" cy="7" r="5.5"/></svg>Misclassified</span>' +
    '<span><svg width="12" height="12"><rect class="hs-half" style="opacity:.5" width="12" height="12"/></svg>w·x + b &gt; 0</span>' +
    '<span><svg width="12" height="12"><circle class="hs-test" style="stroke:none" cx="6" cy="6" r="5"/></svg>Drag me</span>' +
    '</div>' +
    '<div class="hs-sliders">' +
    '<label>w₁<input id="hs-w1" type="range" min="-3" max="3" step="0.05"><output id="hs-w1o"></output></label>' +
    '<label>w₂<input id="hs-w2" type="range" min="-3" max="3" step="0.05"><output id="hs-w2o"></output></label>' +
    '<label>b<input id="hs-b" type="range" min="-5" max="5" step="0.05"><output id="hs-bo"></output></label>' +
    '</div>' +
    '<div class="hs-btns"><button type="button" id="hs-step">Perceptron step</button><button type="button" id="hs-run">Run to separation</button><button type="button" id="hs-reset">Reset</button></div>' +
    '<div class="hs-out" aria-live="polite"><div id="hs-o1"></div><div id="hs-o2"></div><div id="hs-o3"></div><div id="hs-o4"></div></div>';

  var $ = function (id) { return document.getElementById('hs-' + id); };
  var w, b, t, msg, timer = null;
  var fmt = function (n) { var v = Math.round(n * 100) / 100; if (v === 0) v = 0; return v.toFixed(2).replace('-', '−'); };
  var val = function (x, y) { return w[0] * x + w[1] * y + b; };
  var bad = function () { return P.filter(function (p) { return p[2] * val(p[0], p[1]) <= 0; }); };
  var corners = [[-LIMIT, -LIMIT], [LIMIT, -LIMIT], [LIMIT, LIMIT], [-LIMIT, LIMIT]];

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  function setLine(el, a, c) {
    el.setAttribute('x1', sx(a[0])); el.setAttribute('y1', sy(a[1]));
    el.setAttribute('x2', sx(c[0])); el.setAttribute('y2', sy(c[1]));
  }

  function draw() {
    var n = w[0] * w[0] + w[1] * w[1];
    $('w1').value = w[0]; $('w2').value = w[1]; $('b').value = b;
    $('w1o').textContent = fmt(w[0]); $('w2o').textContent = fmt(w[1]); $('bo').textContent = fmt(b);

    var poly = [], cross = [];
    corners.forEach(function (a, i) {
      var c = corners[(i + 1) % 4], va = val(a[0], a[1]), vc = val(c[0], c[1]);
      if (va >= 0) poly.push(a);
      if (va * vc < 0) {
        var s = va / (va - vc), q = [a[0] + s * (c[0] - a[0]), a[1] + s * (c[1] - a[1])];
        poly.push(q); cross.push(q);
      }
    });
    $('half').setAttribute('points', poly.map(function (q) { return sx(q[0]) + ',' + sy(q[1]); }).join(' '));
    var hyp = $('hyp');
    if (cross.length >= 2) { setLine(hyp, cross[0], cross[1]); hyp.style.display = ''; } else hyp.style.display = 'none';

    setLine($('wv'), [0, 0], w);
    $('wv').style.display = n > 1e-9 ? '' : 'none';
    var wlx = Math.max(8, Math.min(380, sx(w[0]) + (w[0] >= 0 ? 8 : -18))), wly = Math.max(16, Math.min(394, sy(w[1]) + (w[1] >= 0 ? -8 : 18)));
    $('wl').setAttribute('x', wlx); $('wl').setAttribute('y', wly);

    var miss = bad();
    $('pts').innerHTML = P.map(function (p) {
      var X = sx(p[0]), Y = sy(p[1]), ring = miss.indexOf(p) >= 0 ? '<circle class="hs-ring" cx="' + X + '" cy="' + Y + '" r="11"/>' : '';
      return ring + (p[2] > 0 ? '<circle class="hs-pos" cx="' + X + '" cy="' + Y + '" r="6"/>' : '<rect class="hs-neg" x="' + (X - 6) + '" y="' + (Y - 6) + '" width="12" height="12"/>');
    }).join('');

    ['test', 'hit'].forEach(function (id) { $(id).setAttribute('cx', sx(t[0])); $(id).setAttribute('cy', sy(t[1])); });
    var v = val(t[0], t[1]), c = n > 1e-9 ? (w[0] * t[0] + w[1] * t[1]) / n : 0;
    setLine($('proj'), t, [c * w[0], c * w[1]]);
    $('handle').setAttribute('aria-valuetext', 'x = ' + fmt(t[0]) + ', y = ' + fmt(t[1]));

    $('o1').textContent = 'w·x + b = (' + fmt(w[0]) + ')(' + fmt(t[0]) + ') + (' + fmt(w[1]) + ')(' + fmt(t[1]) + ') + (' + fmt(b) + ') = ' + fmt(v);
    $('o2').textContent = 'output = ' + (v > 0 ? '+1' : v < 0 ? '−1' : 'on the hyperplane') + ', signed distance = ' + (n > 1e-9 ? fmt(v / Math.sqrt(n)) : 'undefined');
    $('o3').textContent = 'misclassified = ' + miss.length + ' of ' + P.length;
    $('o4').textContent = msg;
  }

  function reset() { stop(); w = [1, -1]; b = -0.5; t = [-1.5, 3]; msg = 'Press "Perceptron step" to correct one misclassified point.'; draw(); }

  function step() {
    var m = bad();
    if (!m.length) { msg = 'No misclassified points: the data is separated.'; stop(); draw(); return false; }
    var p = m[0], old = [w[0], w[1], b];
    w = [w[0] + ETA * p[2] * p[0], w[1] + ETA * p[2] * p[1]]; b += ETA * p[2];
    msg = 'Updated with x = (' + fmt(p[0]) + ', ' + fmt(p[1]) + '), y = ' + (p[2] > 0 ? '+1' : '−1') + '. (w, b) was (' + fmt(old[0]) + ', ' + fmt(old[1]) + ', ' + fmt(old[2]) + ').';
    draw();
    return true;
  }

  function slider(id, set) {
    $(id).addEventListener('input', function (e) { stop(); set(+e.target.value); msg = 'Set by hand.'; draw(); });
  }
  slider('w1', function (v) { w[0] = v; });
  slider('w2', function (v) { w[1] = v; });
  slider('b', function (v) { b = v; });
  $('step').addEventListener('click', function () { stop(); step(); });
  $('run').addEventListener('click', function () { stop(); if (step()) timer = setInterval(function () { if (!step()) stop(); }, 350); });
  $('reset').addEventListener('click', reset);

  var svg = root.querySelector('svg'), hit = $('hit'), drag = false;
  hit.addEventListener('pointerdown', function (e) { drag = true; hit.setPointerCapture(e.pointerId); e.preventDefault(); });
  hit.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var r = svg.getBoundingClientRect(), k = 400 / r.width, X = (e.clientX - r.left) * k, Y = (e.clientY - r.top) * k;
    t = [Math.max(-LIMIT, Math.min(LIMIT, (X - MID) / SCALE)), Math.max(-LIMIT, Math.min(LIMIT, (MID - Y) / SCALE))];
    draw();
  });
  ['pointerup', 'pointercancel'].forEach(function (name) { hit.addEventListener(name, function () { drag = false; }); });
  $('handle').addEventListener('keydown', function (e) {
    var move = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
    if (!move) return;
    e.preventDefault();
    t = [Math.max(-LIMIT, Math.min(LIMIT, t[0] + move[0])), Math.max(-LIMIT, Math.min(LIMIT, t[1] + move[1]))];
    draw();
  });

  reset();
})();
