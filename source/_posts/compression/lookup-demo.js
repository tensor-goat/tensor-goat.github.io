// "Try it" widget for the section "Prediction is Compression".
// Needs lookup.js (id="cz-lookupjs") and bard.js (id="cz-bard") on the page; shakespeare.txt
// sits next to them. The corpus is loaded only when the widget scrolls into view.
(() => {
  const $ = (id) => document.getElementById(id);
  const root = $('cz-try');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '1';

  const SAMPLES = {
    richard: "Now is the winter of our discontent\nMade glorious summer by this sun of York;\nAnd all the clouds that lour'd upon our house\nIn the deep bosom of the ocean buried.",
    sonnet: "Shall I compare thee to a summer's day?\nThou art more lovely and more temperate:\nRough winds do shake the darling buds of May,\nAnd summer's lease hath all too short a date;",
    modern: "The train to Bucharest was late again, so I bought a coffee and read the timetable twice. Nobody could tell me when the next one would leave.",
    repeat: "Ping the server, wait a second, then ping it again. Ping the server, wait a second, then ping it again. Ping the server, wait a second, then ping it again.",
    mash: "qzv jxkw pflt vbnq zrmx kwyj ghqv xtpz"
  };
  const NAMES = { lookup: 'lookup model', warm: 'Bard after reading Shakespeare' };
  const MAX_CHARS = 4000;
  const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtInt = (n) => n.toLocaleString('en-US');
  const show = (ch) => ch === '\n' ? '↵' : ch === ' ' ? '␣' : ch;
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '↵');
  const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();

  let corpus = null, huff = null, corpusLen = 0;
  const state = { text: '', steps: [], order: 10, adaptive: false, sel: 0, engine: 'lookup', seq: 0, res: { lookup: null, warm: null } };
  const warm = { worker: null, ready: false, bits: 0, started: false };
  let reqId = 0;
  const pending = new Map();

  function setStatus(msg) { $('cz-lStatus').textContent = msg; }
  const assetUrl = (name) => new URL(name, $('cz-lookupjs').src).href;

  // ---------- Bard after reading ----------
  function startWarm(clean) {
    const bardTag = $('cz-bard');
    if (!bardTag) { $('cz-lWarmPill').textContent = 'unavailable'; return; }
    try { warm.worker = new Worker(bardTag.src); } catch (e) { $('cz-lWarmPill').textContent = 'unavailable'; return; }
    warm.worker.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'progress') {
        $('cz-lWarmBar').style.width = (100 * d.n / clean.length).toFixed(1) + '%';
        $('cz-lWarmPill').textContent = `reading ${Math.round(100 * d.n / clean.length)}%`;
        $('cz-lWarmCost').textContent = `So far ${fmt(d.bits / 8 / 1024, 0)} KB for ${fmtInt(d.n)} characters.`;
      } else if (d.type === 'warm-ready') {
        warm.ready = true; warm.bits = d.bits;
        $('cz-lWarmBar').style.width = '100%';
        $('cz-lWarmPill').textContent = 'ready'; $('cz-lWarmPill').classList.add('ready');
        $('cz-lWarmCost').textContent = `Paid ${fmt(d.bits / 8 / 1024, 1)} KB to read all ${fmtInt(d.n)} characters (${fmt(d.bits / d.n, 3)} bits each).`;
        setStatus('Both models are ready.');
        requestWarm();
      } else if (d.type === 'warm-encoded') {
        const p = pending.get(d.id); if (p) { pending.delete(d.id); p(d); }
      } else if (d.type === 'error') {
        $('cz-lWarmPill').textContent = 'failed';
      }
    };
    warm.worker.onerror = () => { $('cz-lWarmPill').textContent = 'failed to load'; };
    const bytes = new TextEncoder().encode(clean);
    warm.worker.postMessage({ type: 'warm-init', corpus: bytes }, [bytes.buffer]);
  }
  const bytesToBits = (b) => { let s = ''; for (let i = 0; i < b.length; i++) s += b[i].toString(2).padStart(8, '0'); return s.replace(/0+$/, ''); };
  function requestWarm() {
    if (!warm.ready) return;
    const seq = state.seq, text = state.text;
    const id = ++reqId;
    pending.set(id, (d) => {
      if (seq !== state.seq) return;
      state.res.warm = { text, bits: bytesToBits(d.payload), perChar: Array.from(d.perByte) };
      renderAll(false);
    });
    warm.worker.postMessage({ type: 'warm-encode', id, bytes: new TextEncoder().encode(text) });
  }

  // ---------- start when visible ----------
  async function init() {
    setStatus('Loading 1.1 million characters of Shakespeare…');
    try {
      const res = await fetch(assetUrl('shakespeare.txt'));
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const raw = LM.clean(await res.text());
      corpusLen = raw.length;
      setStatus(`Indexing ${fmtInt(raw.length)} characters…`);
      await new Promise(r => setTimeout(r, 30));
      const t0 = performance.now();
      corpus = new LM.Corpus(raw);
      huff = LM.huffmanLengths(corpus);
      setStatus(`Lookup model ready in ${Math.round(performance.now() - t0)} ms. Bard is reading the corpus in the background.`);
      run();
      startWarm(raw);
    } catch (e) {
      setStatus('Could not load the Shakespeare corpus (' + e.message + '). Reload the page to try again.');
    }
  }
  const go = () => { if (!warm.started) { warm.started = true; init(); } };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { if (es.some(e => e.isIntersecting)) { io.disconnect(); go(); } }, { rootMargin: '300px' });
    io.observe(root);
  } else go();

  let timer = null;
  function schedule() { clearTimeout(timer); timer = setTimeout(run, 180); }

  function run() {
    if (!corpus) return;
    const raw = $('cz-lInput').value;
    let text = LM.clean(raw);
    const dropped = raw.replace(/\r\n?/g, '\n').length - text.length;
    let note = dropped > 0 ? `${dropped} character${dropped === 1 ? '' : 's'} outside plain ASCII were left out.` : '';
    if (text.length > MAX_CHARS) { text = text.slice(0, MAX_CHARS); note += ` Only the first ${fmtInt(MAX_CHARS)} characters are coded.`; }
    $('cz-lClean').textContent = note.trim();
    state.order = +$('cz-lOrder').value;
    state.adaptive = $('cz-lAdaptive').checked;
    $('cz-lOrderVal').textContent = state.order + (state.order === 1 ? ' character' : ' characters');
    state.seq++;
    state.text = text;
    state.steps = LM.analyse(corpus, text, state.order, state.adaptive);
    const enc = LM.encode(state.steps);
    state.res.lookup = { bits: enc.bits, perChar: state.steps.map(cost) };
    if (state.res.warm && state.res.warm.text !== text) state.res.warm = null;
    if (state.sel >= text.length) state.sel = Math.max(0, text.length - 1);
    renderAll(true);
    requestWarm();
  }
  function cost(st) { return -Math.log2(st.f[st.sym] / LM.TOTAL); }
  const cur = () => state.res[state.engine];

  function renderAll(textChanged) {
    renderSummary(); renderBits(); renderHeat();
    if (textChanged) { renderDetail(); renderLadder(); } else renderDetailCost();
    $('cz-lControls').classList.toggle('off', state.engine !== 'lookup');
  }

  function renderSummary() {
    const n = state.text.length, r = cur();
    const b = r ? r.bits.length : null;
    $('cz-lChars').textContent = fmtInt(n);
    $('cz-lBitsN').textContent = b == null ? '…' : fmtInt(b);
    $('cz-lBpc').textContent = b == null ? '…' : n ? fmt(b / n) : '–';
    $('cz-lRatio').textContent = b == null ? '…' : n && b ? fmt(8 * n / b, 1) + '×' : '–';
    let hb = 0; for (const st of state.steps) hb += huff[st.sym];
    const rows = [
      ['ASCII, 8 bits each', 8 * n, ''],
      ['Huffman, per letter', hb, ''],
      ['Lookup model', state.res.lookup ? state.res.lookup.bits.length : null, 'lookup'],
      ['Bard, after reading', state.res.warm ? state.res.warm.bits.length : null, 'warm'],
    ];
    const max = Math.max(1, ...rows.map(r => r[1] || 0));
    $('cz-lBars').innerHTML = rows.map(([k, v, e]) =>
      `<div class="bar${e === state.engine ? ' me' : ''}"><span>${k}</span><span class="track"><span class="fill" style="width:${v == null ? 0 : (100 * v / max).toFixed(2)}%"></span></span><span class="num">${v == null ? (e === 'warm' && !warm.ready ? 'reading…' : '…') : fmtInt(v) + ' bits'}</span></div>`).join('');
    $('cz-lHonest').innerHTML = state.engine === 'lookup'
      ? `<b>Hidden in the decoder:</b> all ${fmtInt(corpusLen)} characters of the corpus, about ${fmt(corpusLen / 1024, 0)} KB, not counted above.`
      : `<b>Hidden in the decoder:</b> the same corpus, but Bard has shown its price: ${warm.ready ? fmt(warm.bits / 8 / 1024, 0) + ' KB' : 'still being measured'}, paid once and shared by every later message.`;
  }

  function renderBits() {
    const r = cur();
    if (!r) { $('cz-lBits').innerHTML = `<span class="pt">${state.engine === 'warm' && !warm.ready ? 'Bard is still reading Shakespeare. Watch its progress bar above.' : 'Working…'}</span>`; return; }
    const groups = r.bits.replace(/(.{8})/g, '$1 ').trim();
    $('cz-lBits').innerHTML = `<span class="pt">0.</span>${groups || '<span class="pt">(nothing to send)</span>'}`;
  }

  const heatColor = (bits) => `rgba(${css('--cz-heat')}, ${(Math.min(1, bits / 8) * 0.62).toFixed(3)})`;
  function renderHeat() {
    $('cz-lRamp').style.background = `linear-gradient(90deg, rgba(${css('--cz-heat')},0), rgba(${css('--cz-heat')},.62))`;
    const r = cur();
    const frag = document.createDocumentFragment();
    state.steps.forEach((st, i) => {
      const s = document.createElement('span');
      const c = r ? r.perChar[i] : null;
      s.textContent = st.ch;
      if (st.ch === '\n') s.className = 'nl';
      if (c != null) { s.style.background = heatColor(c); s.title = `${show(st.ch)}: ${fmt(c)} bits`; }
      s.dataset.i = i;
      if (i === state.sel) s.classList.add('sel');
      frag.appendChild(s);
    });
    $('cz-lHeat').replaceChildren(frag);
    $('cz-lHeatNote').textContent = `Showing ${NAMES[state.engine]}.`;
  }
  $('cz-lHeat').addEventListener('click', (e) => { const t = e.target.closest('span[data-i]'); if (t) select(+t.dataset.i); });
  function select(i) {
    const prev = $('cz-lHeat').querySelector('span.sel'); if (prev) prev.classList.remove('sel');
    state.sel = i;
    const c = $('cz-lHeat').querySelector(`span[data-i="${i}"]`); if (c) c.classList.add('sel');
    renderDetail(); renderLadder();
  }

  function renderDetailCost() {
    const el = $('cz-lDetailCost'), st = state.steps[state.sel];
    if (!el || !st) return;
    el.innerHTML = ['lookup', 'warm'].map(k => `${NAMES[k]}: ${state.res[k] ? '<b>' + fmt(state.res[k].perChar[state.sel]) + ' bits</b>' : '…'}`).join(' · ');
  }
  function renderDetail() {
    const el = $('cz-lDetail'), st = state.steps[state.sel];
    if (!st) { el.innerHTML = '<span class="hint">Type something to see predictions.</span>'; return; }
    const s = LM.PREFIX + state.text, at = LM.PREFIX.length + state.sel;
    const ctx = s.slice(Math.max(0, at - state.order), at);
    const used = ctx.slice(ctx.length - st.depth), unused = ctx.slice(0, ctx.length - st.depth);
    const ranked = [...st.f].map((f, sym) => [sym, f]).sort((a, b) => b[1] - a[1]);
    const top = ranked.slice(0, 7);
    if (!top.some(([sym]) => sym === st.sym)) top.push([st.sym, st.f[st.sym]]);
    const maxp = ranked[0][1] / LM.TOTAL;
    el.innerHTML = `
      <div>Character ${state.sel + 1} of ${state.text.length}: <b>${esc(show(st.ch))}</b></div>
      <div class="hint" id="cz-lDetailCost"></div>
      <div class="ctx" title="Context the lookup model used">${unused ? `<span style="opacity:.45">${esc(unused)}</span>` : ''}<b>${esc(used)}</b> → ?</div>
      <div class="hint">Longest context found: ${st.depth} character${st.depth === 1 ? '' : 's'}, seen ${fmtInt(st.seen)} time${st.seen === 1 ? '' : 's'} in the corpus${state.adaptive ? ' and in this message so far' : ''}.</div>
      <div class="preds">${top.map(([sym, f]) => {
        const p = f / LM.TOTAL;
        return `<div class="pred${sym === st.sym ? ' hit' : ''}"><span>${esc(show(LM.ALPHA[sym]))}</span><span class="t"><span class="f" style="width:${(100 * p / maxp).toFixed(1)}%"></span></span><span class="n">${fmt(100 * p, 1)}%</span></div>`;
      }).join('')}</div>`;
    renderDetailCost();
  }

  // Ladder: one row per character, each the lookup model's distribution stretched to full width.
  const ROWS = 10;
  function renderLadder() {
    const cv = $('cz-lLadder');
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(640, cv.clientWidth || 640);
    const rowH = 28, gap = 18, top = 28;
    const n = state.steps.length;
    const start = Math.max(0, Math.min(state.sel, n - ROWS));
    const end = Math.min(n, start + ROWS);
    const H = top + Math.max(1, end - start) * (rowH + gap) + 6;
    cv.style.height = H + 'px';
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const ink = css('--cz-ink'), muted = css('--cz-muted'), accent = css('--cz-accent'), segA = css('--cz-seg'), segB = css('--cz-seg-2');
    const mono = css('--cz-mono'), ui = css('--cz-ui');
    if (!n) { g.fillStyle = muted; g.font = `14px ${ui}`; g.fillText('Type something to see the intervals.', 0, 20); return; }
    const P = BigInt(LM.PREC_BITS);
    let A = 0n, Wd = 1n, cum = 0;
    for (let i = 0; i < start; i++) {
      const st = state.steps[i];
      A = (A << P) + Wd * BigInt(st.cum[st.sym]); Wd = Wd * BigInt(st.f[st.sym]); cum += cost(st);
    }
    const lockedLen = (A, Wd, D) => {
      if (D === 0) return { len: 0, s: '' };
      const lo = A.toString(2).padStart(D, '0');
      const hi = (A + Wd - 1n).toString(2).padStart(D, '0');
      let L = 0; while (L < D && lo[L] === hi[L]) L++;
      return { len: L, s: lo.slice(0, L) };
    };
    let lockedPrev = lockedLen(A, Wd, start * LM.PREC_BITS).len;
    const barW = W - 250;
    g.font = `12px ${ui}`; g.fillStyle = muted;
    g.fillText(start === 0 ? 'Start: the whole interval [0, 1)' : `Already inside an interval of width 2^−${fmt(cum, 1)} after ${start} characters`, 0, 16);
    g.fillText('width', barW + 60, 16); g.fillText('bits fixed so far', barW + 120, 16);
    for (let r = 0, i = start; i < end; i++, r++) {
      const st = state.steps[i];
      const y = top + r * (rowH + gap);
      let alt = false;
      for (let s = 0; s < LM.V; s++) {
        const a = st.cum[s] / LM.TOTAL * barW, b = st.cum[s + 1] / LM.TOTAL * barW;
        if (b - a < 0.02) continue;
        g.fillStyle = s === st.sym ? accent : (alt ? segA : segB);
        alt = !alt;
        g.fillRect(a, y, Math.max(0.5, b - a - (b - a > 3 ? 1 : 0)), rowH);
        if (b - a >= 13) {
          g.fillStyle = s === st.sym ? css('--cz-accent-ink') : ink;
          g.font = `13px ${mono}`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(show(LM.ALPHA[s]), (a + b) / 2, y + rowH / 2);
          g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        }
      }
      if (i + 1 < end) {
        const a = st.cum[st.sym] / LM.TOTAL * barW, b = st.cum[st.sym + 1] / LM.TOTAL * barW;
        g.fillStyle = css('--cz-accent-soft');
        g.beginPath(); g.moveTo(a, y + rowH); g.lineTo(b, y + rowH);
        g.lineTo(barW, y + rowH + gap); g.lineTo(0, y + rowH + gap); g.closePath(); g.fill();
      }
      A = (A << P) + Wd * BigInt(st.cum[st.sym]); Wd = Wd * BigInt(st.f[st.sym]); cum += cost(st);
      const lk = lockedLen(A, Wd, (i + 1) * LM.PREC_BITS);
      g.fillStyle = ink; g.font = `13px ${mono}`; g.textBaseline = 'middle';
      g.fillText(show(st.ch), barW + 12, y + rowH / 2);
      g.fillStyle = muted; g.fillText(`2^−${fmt(cum, 1)}`, barW + 36, y + rowH / 2);
      const shown = lk.s.length > 14 ? '…' + lk.s.slice(-13) : lk.s;
      const newCount = Math.min(lk.len - lockedPrev, shown.replace('…', '').length);
      const oldPart = shown.slice(0, shown.length - newCount), newPart = shown.slice(shown.length - newCount);
      let tx = barW + 120;
      g.fillStyle = muted; g.fillText(oldPart || (lk.len ? '' : '(none yet)'), tx, y + rowH / 2);
      tx += g.measureText(oldPart).width;
      g.fillStyle = accent; g.fillText(newPart, tx, y + rowH / 2);
      g.textBaseline = 'alphabetic';
      lockedPrev = lk.len;
    }
  }
  let resizeT = null;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (corpus) renderLadder(); }, 120); });

  // ---------- controls ----------
  root.querySelectorAll('[data-sample]').forEach(b => b.addEventListener('click', () => {
    $('cz-lInput').value = SAMPLES[b.dataset.sample];
    if (b.dataset.sample === 'repeat') $('cz-lAdaptive').checked = true;
    state.sel = 0; run();
  }));
  root.querySelectorAll('input[name="cz-engine"]').forEach(r => r.addEventListener('change', () => { state.engine = r.value; renderAll(false); }));
  $('cz-lInput').addEventListener('input', schedule);
  $('cz-lOrder').addEventListener('input', () => { $('cz-lOrderVal').textContent = $('cz-lOrder').value + ' characters'; schedule(); });
  $('cz-lAdaptive').addEventListener('change', run);
  $('cz-lInput').value = SAMPLES.richard;
})();
