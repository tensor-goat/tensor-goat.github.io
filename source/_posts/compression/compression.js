// Encoder and decoder for the post "Compression is intelligence, one bit at a time".
// Needs bard.js on the page as <script id="cz-bard" src=".../bard.js">; the same file runs as the worker.
(() => {
  const $ = (id) => document.getElementById(id);
  if (!$('cz-encDrop') || $('cz-encDrop').dataset.ready) return;
  $('cz-encDrop').dataset.ready = '1';
  const MAX = 10 * 1024 * 1024;
  const fmtInt = (n) => n.toLocaleString('en-US');
  const fmt = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const human = (n) => n < 1024 ? `${fmtInt(n)} B` : n < 1048576 ? `${fmt(n / 1024, 1)} KB` : `${fmt(n / 1048576, 2)} MB`;
  const css = (v) => getComputedStyle(document.querySelector('.cz-lab') || document.documentElement).getPropertyValue(v).trim();

  // ---------- worker ----------
  const bardTag = document.getElementById('cz-bard');
  const workerUrl = bardTag && bardTag.src ? bardTag.src : null;
  function runJob(msg, transfer, onProgress, holder) {
    return new Promise((resolve, reject) => {
      let w;
      try { w = new Worker(workerUrl); } catch (e) { reject(new Error('This browser blocked the background worker the compressor needs.')); return; }
      holder.worker = w;
      holder.cancel = () => { w.terminate(); reject(new Error('cancelled')); };
      w.onmessage = (e) => {
        const d = e.data;
        if (d.type === 'progress') onProgress(d.n);
        else if (d.type === 'header') holder.onHeader && holder.onHeader(d);
        else if (d.type === 'error') { w.terminate(); reject(new Error(d.message)); }
        else { w.terminate(); resolve(d); }
      };
      w.onerror = (e) => { w.terminate(); reject(new Error(e.message || 'The compressor stopped unexpectedly.')); };
      w.postMessage(msg, transfer);
    });
  }

  // ---------- downloads ----------
  let dl = null, decFileBuf = null, decoded = null;
  // Inside Claude the page saves through the downloads capability; anywhere else
  // (your own site, a local file) a plain link download works.
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  const canSave = () => !!dl || !inClaude;
  if (canSave()) document.querySelectorAll('#cz-saveZip, #cz-saveBits').forEach(b => b.classList.remove('hidden'));
  (async () => {
    if (!inClaude) return;
    try { dl = await window.claude.use('downloads'); } catch (e) { dl = null; }
    if (canSave()) {
      document.querySelectorAll('#cz-saveZip, #cz-saveBits').forEach(b => b.classList.remove('hidden'));
      if (decoded) $('cz-saveText').classList.remove('hidden');
    }
  })();
  async function save(filename, data, noteEl) {
    noteEl.textContent = '';
    if (dl) {
      try { await dl.save({ filename, data }); noteEl.textContent = 'Saved.'; }
      catch (e) { noteEl.textContent = e && e.code === 'declined' ? 'Not saved.' : 'Saving is not available here. Use Copy instead.'; }
      return;
    }
    const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function copy(text, noteEl) {
    try { await navigator.clipboard.writeText(text); noteEl.textContent = 'Copied.'; }
    catch (e) { noteEl.textContent = 'Copying is blocked here. Select the text and copy it by hand.'; }
  }

  // ---------- zip (stored, no compression) ----------
  function crc32(b) { return CM.crc32(b); }
  function makeZip(name, data) {
    const nb = new TextEncoder().encode(name);
    const crc = crc32(data);
    const loc = new Uint8Array(30 + nb.length), cen = new Uint8Array(46 + nb.length), end = new Uint8Array(22);
    const L = new DataView(loc.buffer), C = new DataView(cen.buffer), E = new DataView(end.buffer);
    L.setUint32(0, 0x04034b50, true); L.setUint16(4, 20, true); L.setUint16(6, 0x0800, true); L.setUint16(8, 0, true);
    L.setUint16(10, 0, true); L.setUint16(12, 0x21, true); L.setUint32(14, crc, true); L.setUint32(18, data.length, true); L.setUint32(22, data.length, true);
    L.setUint16(26, nb.length, true); L.setUint16(28, 0, true); loc.set(nb, 30);
    C.setUint32(0, 0x02014b50, true); C.setUint16(4, 20, true); C.setUint16(6, 20, true); C.setUint16(8, 0x0800, true); C.setUint16(10, 0, true);
    C.setUint16(12, 0, true); C.setUint16(14, 0x21, true); C.setUint32(16, crc, true); C.setUint32(20, data.length, true); C.setUint32(24, data.length, true);
    C.setUint16(28, nb.length, true); C.setUint32(42, 0, true); cen.set(nb, 46);
    E.setUint32(0, 0x06054b50, true); E.setUint16(8, 1, true); E.setUint16(10, 1, true); E.setUint32(12, cen.length, true); E.setUint32(16, loc.length + data.length, true);
    return new Blob([loc, data, cen, end], { type: 'application/zip' });
  }
  function readZip(buf) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let off = 0;
    while (off + 30 <= buf.length && dv.getUint32(off, true) === 0x04034b50) {
      const method = dv.getUint16(off + 8, true), size = dv.getUint32(off + 18, true);
      const nl = dv.getUint16(off + 26, true), xl = dv.getUint16(off + 28, true);
      const name = new TextDecoder().decode(buf.slice(off + 30, off + 30 + nl));
      const start = off + 30 + nl + xl;
      const data = buf.slice(start, start + size);
      if (data.length >= 4 && data[0] === 66 && data[1] === 82 && data[2] === 68 && data[3] === 49) {
        if (method !== 0) throw new Error('The .zip was re-compressed by another program. Use the original .zip from the encoder, or unzip it and drop the .bard file.');
        return data;
      }
      if (/\.bard$/i.test(name) && method !== 0) throw new Error('The .zip was re-compressed by another program. Unzip it and drop the .bard file instead.');
      off = start + size;
    }
    throw new Error('No Bard file inside this .zip.');
  }
  const bitsToBytes = (bits) => { const n = Math.ceil(bits.length / 8), out = new Uint8Array(n); for (let i = 0; i < bits.length; i++) if (bits.charCodeAt(i) === 49) out[i >> 3] |= 128 >> (i & 7); return out; };
  const bytesToBits = (b) => { let s = ''; const parts = []; for (let i = 0; i < b.length; i++) { parts.push(b[i].toString(2).padStart(8, '0')); } return parts.join(' '); };

  // ---------- encoder ----------
  let enc = null; // { file, name, input, perByte, headerBytes, gzip }
  const encJob = {};
  const encDrop = $('cz-encDrop'), encFile = $('cz-encFile');
  function wireDrop(drop, input, handler) {
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) handler(f); });
    input.addEventListener('change', () => { const f = input.files[0]; if (f) handler(f); input.value = ''; });
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
  }
  wireDrop(encDrop, encFile, async (f) => {
    if (f.size > MAX) { setEnc(`That file is ${human(f.size)}. Bard learns at about 60 KB a second, so this page stops at 10 MB.`, true); return; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    compress(bytes, f.name);
  });
  $('cz-usePost').addEventListener('click', () => {
    const lab = document.querySelector('.cz-lab');
    const root = (lab && lab.closest('article, .post, .post-content, .article-entry, main')) || document.body;
    const parts = Array.from(root.querySelectorAll('h1, h2, h3, p, li'))
      .filter(el => !el.closest('.cz-lab, .cz-figure, .cz-three, script, style, nav, footer'))
      .map(el => el.innerText.trim()).filter(Boolean);
    compress(new TextEncoder().encode(parts.join('\n\n')), 'compression-blog-post.txt');
  });
  $('cz-encCancel').addEventListener('click', () => encJob.cancel && encJob.cancel());
  function setEnc(msg, err) { $('cz-encStatus').textContent = msg; $('cz-encStatus').classList.toggle('err', !!err); }

  async function gzipSize(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
      return (await new Response(s).arrayBuffer()).byteLength;
    } catch (e) { return null; }
  }

  async function compress(bytes, name) {
    if (!workerUrl) { setEnc('This browser blocked the background worker the compressor needs.', true); return; }
    const n = bytes.length;
    const input = bytes.slice();
    const t0 = performance.now();
    $('cz-encProg').classList.remove('hidden'); $('cz-encProg').firstElementChild.style.width = '0%';
    $('cz-encCancel').classList.remove('hidden'); $('cz-usePost').disabled = true;
    setEnc(`Reading ${name} (${human(n)}) and learning as it goes…`);
    const gz = gzipSize(input);
    try {
      const r = await runJob({ type: 'compress', bytes, name }, [bytes.buffer], (k) => {
        const pct = 100 * k / n, el = (performance.now() - t0) / 1000;
        $('cz-encProg').firstElementChild.style.width = pct.toFixed(1) + '%';
        const left = el / (k / n) - el;
        setEnc(`Learning ${name}: ${Math.round(pct)}% · about ${Math.max(1, Math.round(left))} s left`);
      }, encJob);
      const secs = (performance.now() - t0) / 1000;
      enc = { file: r.file, name, input, perByte: r.perByte, headerBytes: r.headerBytes, gzip: await gz };
      setEnc(`Done in ${fmt(secs, 1)} s.`);
      renderEnc();
    } catch (e) {
      setEnc(e.message === 'cancelled' ? 'Cancelled.' : 'Something went wrong: ' + e.message, e.message !== 'cancelled');
    } finally {
      $('cz-encProg').classList.add('hidden'); $('cz-encCancel').classList.add('hidden'); $('cz-usePost').disabled = false;
    }
  }

  function renderEnc() {
    $('cz-encResult').classList.remove('hidden');
    const n = enc.input.length, c = enc.file.length;
    $('cz-tOrig').textContent = human(n); $('cz-tOrigS').textContent = enc.name;
    $('cz-tComp').textContent = human(c); $('cz-tCompS').textContent = `${fmtInt(c)} bytes, header included`;
    $('cz-tBpb').textContent = n ? fmt(8 * c / n) : '–';
    $('cz-tRatio').textContent = n && c < n ? fmt(n / c, 1) + '×' : n ? 'not at all' : '–';
    $('cz-tRatioS').textContent = n && c < n ? `${fmt(100 * (1 - c / n), 1)}% saved` : 'too small or too random';
    const rows = [['Original', n, false], ['gzip', enc.gzip, false], ['Bard', c, true]];
    const max = Math.max(...rows.map(r => r[1] || 0), 1);
    $('cz-bars').innerHTML = rows.filter(r => r[1] != null).map(([k, v, me]) =>
      `<div class="bar${me ? ' me' : ''}"><span>${k}</span><span class="track"><span class="fill" style="width:${(100 * v / max).toFixed(2)}%"></span></span><span class="num">${fmtInt(v)} B</span></div>`).join('');
    renderCurve(); renderHeat(); renderHex();
  }

  // learning curve: bits per byte in buckets along the file
  let curvePts = [];
  function renderCurve() {
    const svg = $('cz-curve'), pb = enc.perByte, n = pb.length;
    svg.innerHTML = '';
    if (n < 64) { $('cz-curveNote').textContent = 'The file is too short to show a learning curve.'; curvePts = []; return; }
    const B = Math.min(120, Math.max(12, Math.floor(n / 64)));
    curvePts = [];
    for (let b = 0; b < B; b++) {
      const lo = Math.floor(b * n / B), hi = Math.floor((b + 1) * n / B);
      let s = 0; for (let i = lo; i < hi; i++) s += pb[i];
      curvePts.push({ lo, hi, bpb: s / Math.max(1, hi - lo) });
    }
    const W = svg.clientWidth || 460, H = 240, ml = 34, mr = 8, mt = 12, mb = 28;
    const ymax = Math.max(8, Math.ceil(Math.max(...curvePts.map(p => p.bpb))));
    const x = (i) => ml + (W - ml - mr) * (i + 0.5) / B, y = (v) => mt + (H - mt - mb) * (1 - v / ymax);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let g = '';
    for (let v = 0; v <= ymax; v += 2) g += `<line x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--cz-line)" stroke-width="1"/><text x="${ml - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    g += `<text x="${ml}" y="${H - 6}">start of file</text><text x="${W - mr}" y="${H - 6}" text-anchor="end">end · ${human(n)}</text>`;
    g += `<line x1="${ml}" x2="${W - mr}" y1="${y(8)}" y2="${y(8)}" stroke="var(--cz-muted)" stroke-dasharray="3 4" stroke-width="1"/><text x="${W - mr}" y="${y(8) - 5}" text-anchor="end">8 bits: raw</text>`;
    const d = curvePts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.bpb).toFixed(1)}`).join(' ');
    g += `<path d="${d}" fill="none" stroke="var(--cz-accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    g += `<line id="cz-cx" x1="0" x2="0" y1="${mt}" y2="${H - mb}" stroke="var(--cz-muted)" stroke-width="1" opacity="0"/><circle id="cz-cd" r="4.5" fill="var(--cz-accent)" stroke="var(--cz-surface)" stroke-width="2" opacity="0"/>`;
    g += `<rect id="cz-hit" x="${ml}" y="${mt}" width="${W - ml - mr}" height="${H - mt - mb}" fill="transparent"/>`;
    svg.innerHTML = g;
    const first = curvePts[0].bpb, last = curvePts[curvePts.length - 1].bpb;
    $('cz-curveNote').textContent = `Bits per byte in ${B} slices of the file. The first slice cost ${fmt(first)} bits per byte, the last ${fmt(last)}: that drop is the model learning your text.`;
    const hit = svg.querySelector('#cz-hit'), tip = $('cz-curveTip');
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = (ev.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(B - 1, Math.round((px - ml) / ((W - ml - mr) / B) - 0.5)));
      const p = curvePts[i];
      svg.querySelector('#cz-cx').setAttribute('x1', x(i)); svg.querySelector('#cz-cx').setAttribute('x2', x(i)); svg.querySelector('#cz-cx').setAttribute('opacity', 1);
      const cd = svg.querySelector('#cz-cd'); cd.setAttribute('cx', x(i)); cd.setAttribute('cy', y(p.bpb)); cd.setAttribute('opacity', 1);
      tip.innerHTML = `${fmt(p.bpb)} bits per byte<br><span style="opacity:.75">bytes ${fmtInt(p.lo + 1)}–${fmtInt(p.hi)}</span>`;
      tip.style.left = (x(i) * r.width / W) + 'px'; tip.style.top = (y(p.bpb) * r.height / H) + 'px'; tip.classList.add('on');
    };
    hit.addEventListener('pointermove', move); hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { tip.classList.remove('on'); svg.querySelector('#cz-cx').setAttribute('opacity', 0); svg.querySelector('#cz-cd').setAttribute('opacity', 0); });
  }

  function heatColor(bits) { return `rgba(${css('--cz-heat')}, ${(Math.min(1, bits / 8) * 0.62).toFixed(3)})`; }
  function paintRamp() { $('cz-ramp').style.background = `linear-gradient(90deg, rgba(${css('--cz-heat')},0), rgba(${css('--cz-heat')},.62))`; }
  function renderHeat() {
    paintRamp();
    const el = $('cz-heat'), b = enc.input, pb = enc.perByte;
    const LIMIT = 3000;
    const frag = document.createDocumentFragment();
    const dec = new TextDecoder('utf-8', { fatal: true });
    let i = 0, shown = 0;
    while (i < b.length && shown < LIMIT) {
      const c = b[i];
      let len = c < 0x80 ? 1 : (c >> 5) === 6 ? 2 : (c >> 4) === 14 ? 3 : (c >> 3) === 30 ? 4 : 1;
      if (i + len > b.length) len = 1;
      let ch;
      try { ch = dec.decode(b.subarray(i, i + len)); } catch (e) { ch = '·'; len = 1; }
      if (len === 1 && (c < 32 && c !== 10 && c !== 9)) ch = '·';
      let cost = 0; for (let j = i; j < i + len; j++) cost += pb[j];
      const s = document.createElement('span');
      s.textContent = ch;
      if (ch === '\n') s.className = 'nl';
      s.style.background = heatColor(cost);
      s.title = `${ch === '\n' ? '↵' : ch === ' ' ? 'space' : ch}: ${fmt(cost)} bits`;
      frag.appendChild(s);
      i += len; shown++;
    }
    el.replaceChildren(frag);
    $('cz-heatNote').textContent = i < b.length ? `· first ${fmtInt(shown)} characters` : '';
  }

  function renderHex() {
    const f = enc.file, hb = enc.headerBytes, LIM = 384;
    const parts = [];
    for (let i = 0; i < Math.min(f.length, LIM); i++) {
      const h = f[i].toString(16).padStart(2, '0');
      parts.push(i < hb ? `<span class="h">${h}</span>` : h);
    }
    $('cz-hex').innerHTML = parts.join(' ') + (f.length > LIM ? ` <span class="more">… ${fmtInt(f.length - LIM)} more bytes</span>` : '');
  }

  const bardName = () => (enc.name.replace(/\.[^.]*$/, '') || 'message') + '.bard';
  $('cz-saveZip').addEventListener('click', () => { if (enc) save(bardName().replace(/\.bard$/, '.bard.zip'), makeZip(bardName(), enc.file), $('cz-saveNote')); });
  $('cz-saveBits').addEventListener('click', () => { if (enc) save(bardName().replace(/\.bard$/, '.bits.txt'), bytesToBits(enc.file).replace(/((?:[01]{8} ){8})/g, '$1\n'), $('cz-saveNote')); });
  $('cz-copyBits').addEventListener('click', () => { if (enc) copy(bytesToBits(enc.file), $('cz-saveNote')); });
  $('cz-toDecoder').addEventListener('click', () => {
    if (!enc) return;
    loadDecoder(enc.file.slice(), 'from the encoder');
    $('cz-dec-h').scrollIntoView({ behavior: 'smooth', block: 'center' });
    decode();
  });

  // ---------- decoder ----------
  const decJob = {};
  function setDec(msg, err) { $('cz-decStatus').textContent = msg; $('cz-decStatus').classList.toggle('err', !!err); }
  const MAX_BITS_SHOWN = 200000;
  function loadDecoder(buf, from) {
    decFileBuf = buf;
    const bits = bytesToBits(buf);
    $('cz-bitsIn').value = bits.length > MAX_BITS_SHOWN ? '' : bits;
    $('cz-bitsIn').placeholder = bits.length > MAX_BITS_SHOWN ? `${fmtInt(buf.length * 8)} bits loaded ${from} (too many to show here).` : '01000010 01010010 01000100 00110001 …';
    $('cz-bitsIn').dataset.loaded = bits.length > MAX_BITS_SHOWN ? '1' : '';
    setDec(`${fmtInt(buf.length * 8)} bits loaded ${from}.`);
    $('cz-verdict').textContent = '';
  }
  $('cz-bitsIn').addEventListener('input', () => { decFileBuf = null; $('cz-bitsIn').dataset.loaded = ''; $('cz-bitsIn').placeholder = '01000010 01010010 01000100 00110001 …'; });
  wireDrop($('cz-decDrop'), $('cz-decFile'), async (f) => {
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      let file;
      if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4) file = readZip(buf);
      else if (buf.length >= 4 && buf[0] === 66 && buf[1] === 82 && buf[2] === 68 && buf[3] === 49) file = buf;
      else {
        const text = new TextDecoder().decode(buf);
        const bits = text.replace(/\s+/g, '');
        if (!/^[01]+$/.test(bits)) throw new Error('This file is neither a Bard file nor a file of 0s and 1s.');
        file = bitsToBytes(bits);
      }
      loadDecoder(file, `from ${f.name}`);
      decode();
    } catch (e) { setDec(e.message, true); }
  });
  function currentFile() {
    if (decFileBuf) return decFileBuf;
    const bits = $('cz-bitsIn').value.replace(/\s+/g, '');
    if (!bits) throw new Error('Nothing to decode yet. Drop a file or paste some bits.');
    if (!/^[01]+$/.test(bits)) throw new Error('The pasted text should contain only 0s and 1s.');
    return bitsToBytes(bits);
  }
  async function decode(flipNote) {
    let file;
    try { file = currentFile(); } catch (e) { setDec(e.message, true); return; }
    let n = 0;
    try { n = CM.unpack(file).length; } catch (e) { setDec(e.message, true); $('cz-decOut').textContent = ''; $('cz-verdict').textContent = ''; return; }
    if (n > 64 * 1024 * 1024) { setDec('The header says the original is over 64 MB, which is more than this page decodes. A flipped bit in the header can do that.', true); return; }
    const t0 = performance.now();
    $('cz-decProg').classList.remove('hidden'); $('cz-decProg').firstElementChild.style.width = '0%';
    $('cz-decCancel').classList.remove('hidden'); $('cz-decodeBtn').disabled = $('cz-flipBtn').disabled = true;
    $('cz-verdict').textContent = ''; $('cz-verdict').className = 'verdict';
    setDec((flipNote ? flipNote + ' ' : '') + `Decoding ${fmtInt(n)} bytes…`);
    try {
      const r = await runJob({ type: 'decompress', file: file.slice() }, [], (k) => {
        $('cz-decProg').firstElementChild.style.width = (100 * k / n).toFixed(1) + '%';
      }, decJob);
      decoded = r;
      showDecoded(r, (performance.now() - t0) / 1000, flipNote);
    } catch (e) {
      setDec(e.message === 'cancelled' ? 'Cancelled.' : 'Something went wrong: ' + e.message, e.message !== 'cancelled');
    } finally {
      $('cz-decProg').classList.add('hidden'); $('cz-decCancel').classList.add('hidden'); $('cz-decodeBtn').disabled = $('cz-flipBtn').disabled = false;
    }
  }
  function showDecoded(r, secs, flipNote) {
    const SHOW = 40000;
    const text = new TextDecoder().decode(r.bytes.subarray(0, Math.min(r.bytes.length, SHOW * 4)));
    const shown = text.length > SHOW ? text.slice(0, SHOW) : text;
    const out = $('cz-decOut'); out.replaceChildren();
    let firstDiff = -1;
    if (enc && !r.ok) {
      const a = enc.input, b = r.bytes;
      for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) { firstDiff = i; break; }
    }
    if (firstDiff >= 0) {
      const pre = new TextDecoder().decode(r.bytes.subarray(0, firstDiff));
      const preShown = pre.slice(0, SHOW);
      out.append(document.createTextNode(preShown));
      if (preShown.length < SHOW) { const s = document.createElement('span'); s.className = 'diff'; s.textContent = new TextDecoder().decode(r.bytes.subarray(firstDiff)).slice(0, SHOW - preShown.length); out.append(s); }
    } else out.textContent = shown;
    if (text.length > SHOW) out.append(document.createTextNode(`\n\n… ${fmtInt(r.bytes.length)} bytes in all.`));
    const v = $('cz-verdict');
    if (r.ok) { v.textContent = `Checksum matches: ${fmtInt(r.bytes.length)} bytes, exactly as sent.`; v.className = 'verdict ok'; }
    else { v.textContent = firstDiff >= 0 ? `Checksum fails. Correct up to byte ${fmtInt(firstDiff)}, noise after it.` : 'Checksum fails: this is not the original.'; v.className = 'verdict bad'; }
    setDec(`${flipNote ? flipNote + ' ' : ''}Decoded ${r.name || 'the message'} in ${fmt(secs, 1)} s.`);
    if (canSave()) $('cz-saveText').classList.remove('hidden');
    $('cz-copyText').classList.remove('hidden');
  }
  $('cz-decodeBtn').addEventListener('click', () => decode());
  $('cz-decCancel').addEventListener('click', () => decJob.cancel && decJob.cancel());
  $('cz-flipBtn').addEventListener('click', () => {
    let file;
    try { file = currentFile().slice(); CM.unpack(file); } catch (e) { setDec(e.message, true); return; }
    const hb = CM.unpack(file).headerBytes;
    const payloadBits = (file.length - hb) * 8;
    if (payloadBits <= 0) { setDec('There is no payload to flip: the message is empty.', true); return; }
    const k = Math.floor(Math.random() * payloadBits);
    const bit = hb * 8 + k;
    file[bit >> 3] ^= 128 >> (bit & 7);
    loadDecoder(file, 'with one bit flipped');
    decode(`Flipped payload bit ${fmtInt(k + 1)} of ${fmtInt(payloadBits)} (the header is left alone).`);
  });
  $('cz-saveText').addEventListener('click', () => { if (decoded) save(decoded.name || 'decoded.txt', new Blob([decoded.bytes]), $('cz-saveNote2')); });
  $('cz-copyText').addEventListener('click', () => { if (decoded) copy(new TextDecoder().decode(decoded.bytes), $('cz-saveNote2')); });

  // re-theme
  const retheme = () => { if (enc) { paintRamp(); renderHeat(); } };
  if (window.matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', retheme); }
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  let rt = null; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (enc) renderCurve(); }, 150); });
})();
