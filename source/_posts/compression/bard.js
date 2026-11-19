// Bard: a small context-mixing compressor that starts empty and learns as it reads.
// Bit-level prediction from order-0..8 context models, word models, a line/column model,
// a match model for long repeats, and a tiny online neural model with learned embeddings.
// Two gated logistic mixers learn whom to trust; two SSE stages calibrate; a binary
// arithmetic coder turns each probability into bits. Sender and receiver run the exact
// same updates, so no model is ever transmitted.
var CM = (typeof CM !== 'undefined' && CM) || (() => {
  const stretch = (p) => Math.log(p / (1 - p));
  const squash = (x) => x > 40 ? 1 - 1e-12 : x < -40 ? 1e-12 : 1 / (1 + Math.exp(-x));
  const clampP = (p) => Math.min(Math.max(p, 1e-6), 1 - 1e-6);
  const H = (a, b) => (Math.imul((a ^ Math.imul(b, 0x9E3779B1)) >>> 0, 0x85EBCA6B) ^ (b >>> 13)) >>> 0;
  const isLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 39 || c >= 128;
  const lower = (c) => (c >= 65 && c <= 90) ? c + 32 : c;

  const DEFAULTS = { tableBits: 20, orders: [1, 2, 3, 4, 5, 6, 8], nnDim: 32, nnBits: 14, limit: 60 };

  function create(opts = {}) {
    const o = Object.assign({}, DEFAULTS, opts);
    const TB = o.tableBits, MASK = (1 << TB) - 1;

    // Undo log: while a checkpoint is active, every write to model memory is recorded
    // so rollback() can return the model to exactly the checkpointed state.
    let logging = false;
    const LOG = [];
    const set = (arr, i, v) => { if (logging) LOG.push(arr, i, arr[i]); arr[i] = v; };

    let hist = new Uint8Array(1 << 16), hlen = 0;
    const push = (c) => { if (hlen === hist.length) { const h2 = new Uint8Array(hist.length * 2); h2.set(hist); hist = h2; } hist[hlen++] = c; };
    const S = { wordHash: 0, prevWord: 0, prevWord2: 0, col: 0, lineStart: 0,
      mptr: -1, mlen: 0, mbyte: -1, c0: 1, bitPos: 0, nBytes: 0, lrMix: 0.02 };

    // context models: hashed tables of bit probabilities and confidence counts
    const ctxFns = [() => 0];
    for (const k of o.orders) ctxFns.push(() => {
      let h = k * 0x1000193;
      for (let j = 1; j <= k; j++) h = H(h, hlen - j >= 0 ? hist[hlen - j] : 10);
      return h;
    });
    ctxFns.push(() => H(H(S.wordHash, S.prevWord), 0xA1));
    ctxFns.push(() => H(S.wordHash, 0xA2));
    ctxFns.push(() => H(H(H(S.wordHash, S.prevWord), S.prevWord2), 0xA3));
    ctxFns.push(() => {
      const first = S.lineStart < hlen ? hist[S.lineStart] : 0;
      return H(H(H(0xC1, Math.min(S.col, 24)), first), hlen ? hist[hlen - 1] : 0);
    });
    const NM = ctxFns.length;
    const P = [], N = [];
    for (let i = 0; i < NM; i++) { P.push(new Uint16Array(1 << TB).fill(32768)); N.push(new Uint8Array(1 << TB)); }
    const base = new Uint32Array(NM), idx = new Uint32Array(NM);

    // match model: find the last time the recent text appeared and predict what followed
    const MINLEN = 7, MH = 20, mtab = new Int32Array(1 << MH).fill(-1);
    const mP = new Uint16Array(128).fill(32768), mN = new Uint8Array(128);
    let mslot = -1, mexp = 0;

    // tiny neural model with learned embeddings for recent words and bytes
    const D = o.nnDim, EB = o.nnBits, EMASK = (1 << EB) - 1, NSLOT = 6;
    const E = new Float32Array(NSLOT * (1 << EB) * D);
    { let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296 - 0.5; };
      for (let i = 0; i < E.length; i++) E[i] = rnd() * 0.2; }
    const WO = new Float32Array(256 * (D + 1));
    const hvec = new Float32Array(D), gh = new Float32Array(D), eRow = new Int32Array(NSLOT);
    let pnn = 0.5;
    function nnByte() {
      const ids = [S.prevWord, S.prevWord2, S.wordHash, hlen > 0 ? hist[hlen - 1] : 10, hlen > 1 ? hist[hlen - 2] : 10, hlen > 2 ? hist[hlen - 3] : 10];
      hvec.fill(0);
      for (let s = 0; s < NSLOT; s++) {
        const r = ((s << EB) + ((s < 3 ? H(ids[s], s + 7) : ids[s]) & EMASK)) * D;
        eRow[s] = r;
        for (let j = 0; j < D; j++) hvec[j] += E[r + j];
      }
      for (let j = 0; j < D; j++) hvec[j] = Math.tanh(hvec[j]);
      gh.fill(0);
    }
    function nnUpdateByte() {
      for (let j = 0; j < D; j++) gh[j] *= (1 - hvec[j] * hvec[j]) * 0.02;
      for (let s = 0; s < NSLOT; s++) { const r = eRow[s]; for (let j = 0; j < D; j++) set(E, r + j, E[r + j] + gh[j]); }
    }

    // mixers
    const NIN = NM * 2 + 5;
    const inputs = new Float64Array(NIN);
    const W1 = new Float32Array(256 * NIN).fill(0.15), W2 = new Float32Array(12 * 256 * NIN).fill(0.15);
    const W3 = new Float32Array([0.5, 0.5]);
    let s1 = 0, s2 = 0, pm1 = 0.5, pm2 = 0.5, pmix = 0.5, x3a = 0, x3b = 0;

    // SSE (secondary estimation): calibrates the mixed probability in two small contexts
    const APMN = 33;
    const apm1 = new Float32Array(65536 * APMN), apm2 = new Float32Array(65536 * APMN);
    for (let j = 0; j < APMN; j++) { const v = squash((j - 16) / 2); for (let c = 0; c < 65536; c++) { apm1[c * APMN + j] = v; apm2[c * APMN + j] = v; } }
    let a1lo = 0, a1w = 0, a2lo = 0;

    function newByte() {
      for (let i = 0; i < NM; i++) base[i] = ctxFns[i]();
      if (hlen >= MINLEN) {
        let h = 0;
        for (let j = hlen - MINLEN; j < hlen; j++) h = H(h, hist[j]);
        h &= (1 << MH) - 1;
        if (S.mlen === 0) {
          const cand = mtab[h];
          if (cand >= 0) {
            let L = 0;
            while (L < 400 && cand - 1 - L >= 0 && hist[cand - 1 - L] === hist[hlen - 1 - L]) L++;
            if (L >= MINLEN) { S.mptr = cand; S.mlen = L; }
          }
        }
        set(mtab, h, hlen);
      }
      S.mbyte = (S.mlen > 0 && S.mptr < hlen) ? hist[S.mptr] : -1;
      nnByte();
    }

    function predict() {
      const c0 = S.c0;
      let k = 0;
      const c0h = Math.imul(c0, 0x2F0B4C27) >>> 0;
      for (let i = 0; i < NM; i++) {
        const s = (H(base[i], c0h) ^ (i * 0x632BE5AB)) & MASK;
        idx[i] = s;
        const n = N[i][s];
        if (n === 0) { inputs[k++] = 0; inputs[k++] = 0; }
        else { const st = stretch(P[i][s] / 65536); inputs[k++] = st; inputs[k++] = st * (n > 30 ? 1 : n / 30); }
      }
      if (S.mbyte >= 0 && ((S.mbyte + 256) >> (8 - S.bitPos)) === c0) {
        mexp = (S.mbyte >> (7 - S.bitPos)) & 1;
        mslot = Math.min(S.mlen, 63) * 2 + mexp;
        inputs[k++] = stretch(mP[mslot] / 65536);
        inputs[k++] = (mexp ? 1 : -1) * Math.min(S.mlen, 32) / 16;
      } else { mslot = -1; inputs[k++] = 0; inputs[k++] = 0; }
      {
        const r = c0 * (D + 1);
        let z = WO[r + D];
        for (let j = 0; j < D; j++) z += WO[r + j] * hvec[j];
        pnn = squash(z);
        const st = Math.max(-8, Math.min(8, z));
        inputs[k++] = st; inputs[k++] = st * Math.abs(pnn - 0.5) * 2;
      }
      inputs[k++] = 0.3;

      s1 = c0 * NIN;
      const mlb = mslot < 0 ? 0 : S.mlen < 16 ? 1 : S.mlen < 32 ? 2 : 3;
      const lastc = hlen ? hist[hlen - 1] : 0;
      const cls = isLetter(lastc) ? 0 : lastc === 32 ? 1 : 2;
      s2 = ((mlb * 3 + cls) * 256 + c0) * NIN;
      let d1 = 0, d2 = 0;
      for (let j = 0; j < NIN; j++) { d1 += W1[s1 + j] * inputs[j]; d2 += W2[s2 + j] * inputs[j]; }
      pm1 = squash(d1); pm2 = squash(d2);
      x3a = stretch(clampP(pm1)); x3b = stretch(clampP(pm2));
      pmix = squash(W3[0] * x3a + W3[1] * x3b);
      const st = Math.max(-7.999, Math.min(7.999, stretch(clampP(pmix))));
      const pos = (st + 8) * 2, lo = Math.floor(pos), w = pos - lo;
      a1lo = ((lastc & 255) * 256 + c0) * APMN + lo; a1w = w;
      a2lo = (H(base[2], c0) & 0xFFFF) * APMN + lo;
      const pa1 = apm1[a1lo] * (1 - w) + apm1[a1lo + 1] * w;
      const pa2 = apm2[a2lo] * (1 - w) + apm2[a2lo + 1] * w;
      const p = 0.5 * pmix + 0.25 * pa1 + 0.25 * pa2;
      return Math.min(Math.max(p, 1 / 65536), 1 - 1 / 65536);
    }

    function update(y) {
      for (let i = 0; i < NM; i++) {
        const s = idx[i], n = N[i][s], p = P[i][s];
        set(P[i], s, Math.max(32, Math.min(65503, Math.round(p + ((y ? 65535 : 0) - p) / (n + 1.6)))));
        if (n < o.limit) set(N[i], s, n + 1);
      }
      if (mslot >= 0) {
        const n = mN[mslot], p = mP[mslot];
        set(mP, mslot, Math.max(32, Math.min(65503, Math.round(p + ((y ? 65535 : 0) - p) / (n + 1.6)))));
        if (n < 255) set(mN, mslot, n + 1);
        if (y !== mexp) { S.mlen = 0; S.mbyte = -1; }
      }
      const e1 = (y - pm1) * S.lrMix, e2 = (y - pm2) * S.lrMix;
      for (let j = 0; j < NIN; j++) { set(W1, s1 + j, W1[s1 + j] + e1 * inputs[j]); set(W2, s2 + j, W2[s2 + j] + e2 * inputs[j]); }
      const e3 = (y - pmix) * 0.002;
      set(W3, 0, W3[0] + e3 * x3a); set(W3, 1, W3[1] + e3 * x3b);
      const r = 0.02, w = a1w;
      set(apm1, a1lo, apm1[a1lo] + (y - apm1[a1lo]) * r * (1 - w)); set(apm1, a1lo + 1, apm1[a1lo + 1] + (y - apm1[a1lo + 1]) * r * w);
      set(apm2, a2lo, apm2[a2lo] + (y - apm2[a2lo]) * r * (1 - w)); set(apm2, a2lo + 1, apm2[a2lo + 1] + (y - apm2[a2lo + 1]) * r * w);
      {
        const rr = S.c0 * (D + 1), err = y - pnn, lr = 0.03;
        for (let j = 0; j < D; j++) { gh[j] += err * WO[rr + j]; set(WO, rr + j, WO[rr + j] + lr * err * hvec[j]); }
        set(WO, rr + D, WO[rr + D] + lr * err);
      }
      S.c0 = (S.c0 << 1) | y; S.bitPos++;
      if (S.bitPos === 8) {
        const c = S.c0 & 255;
        push(c);
        if (S.mlen > 0) { S.mptr++; S.mlen++; }
        if (isLetter(c)) S.wordHash = H(S.wordHash, lower(c));
        else if (S.wordHash !== 0) { S.prevWord2 = S.prevWord; S.prevWord = S.wordHash; S.wordHash = 0; }
        if (c === 10) { S.col = 0; S.lineStart = hlen; } else S.col++;
        nnUpdateByte();
        S.c0 = 1; S.bitPos = 0; S.nBytes++;
        S.lrMix = Math.max(0.002, 0.02 / Math.sqrt(1 + S.nBytes / 2000));
        newByte();
      }
    }

    // Checkpoint: remember the small state and start logging writes; rollback undoes everything since.
    let saved = null;
    function checkpoint() {
      saved = { S: Object.assign({}, S), hlen, W3: Array.from(W3), base: base.slice(), hvec: hvec.slice(), eRow: eRow.slice(), gh: gh.slice() };
      LOG.length = 0; logging = true;
    }
    function rollback() {
      for (let i = LOG.length - 3; i >= 0; i -= 3) LOG[i][LOG[i + 1]] = LOG[i + 2];
      LOG.length = 0; logging = false;
      Object.assign(S, saved.S); hlen = saved.hlen;
      W3[0] = saved.W3[0]; W3[1] = saved.W3[1];
      base.set(saved.base); hvec.set(saved.hvec); eRow.set(saved.eRow); gh.set(saved.gh);
    }

    newByte();
    return { predict, update, checkpoint, rollback };
  }

  // Binary arithmetic coder, 32-bit, carry-less. 12-bit probabilities.
  // Returns packed bytes; the decoder reads zeros past the end, so the tail is
  // only as long as needed to land inside the final interval.
  function encode(m, bytes, onProgress) {
    let x1 = 0, x2 = 0xFFFFFFFF;
    let out = new Uint8Array(Math.max(64, bytes.length + 16)), olen = 0;
    const put = (b) => { if (olen === out.length) { const o2 = new Uint8Array(out.length * 2); o2.set(out); out = o2; } out[olen++] = b; };
    const perByte = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      let cb = 0;
      for (let b = 7; b >= 0; b--) {
        const y = (c >> b) & 1;
        const p12 = Math.max(1, Math.min(4095, Math.round(m.predict() * 4096)));
        const xmid = x1 + Math.floor((x2 - x1) / 4096) * p12;
        if (y) x2 = xmid; else x1 = xmid + 1;
        cb -= Math.log2(y ? p12 / 4096 : 1 - p12 / 4096);
        m.update(y);
        while (((x1 ^ x2) & 0xFF000000) === 0) {
          put(x2 >>> 24);
          x1 = (x1 * 256) % 4294967296;
          x2 = (x2 * 256) % 4294967296 + 255;
        }
      }
      perByte[i] = cb;
      if (onProgress && (i & 0x3FFF) === 0x3FFF) onProgress(i + 1);
    }
    // flush: shortest value v with x1 <= v <= x2 whose low bits are zero
    let tailBits = 0, tail = 0;
    for (let j = 0; j <= 32; j++) {
      const unit = 2 ** (32 - j);
      const v = Math.ceil(x1 / unit) * unit;
      if (v <= x2) { tailBits = j; tail = j ? Math.floor(v / unit) : 0; break; }
    }
    // append tailBits bits of tail, padding the final byte with zeros
    const nb = Math.ceil(tailBits / 8);
    const aligned = tailBits ? tail * 2 ** (nb * 8 - tailBits) : 0;
    for (let k = nb - 1; k >= 0; k--) put(Math.floor(aligned / 2 ** (8 * k)) & 255);
    // trailing zero bytes are implied by the decoder, so drop them
    while (olen > 0 && out[olen - 1] === 0) olen--;
    return { payload: out.slice(0, olen), perByte, payloadBits: (olen - nb) * 8 + tailBits };
  }

  function decode(m, payload, n, onProgress) {
    let x1 = 0, x2 = 0xFFFFFFFF, x = 0, pos = 0;
    const nextByte = () => pos < payload.length ? payload[pos++] : (pos++, 0);
    for (let i = 0; i < 4; i++) x = x * 256 + nextByte();
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let b = 0; b < 8; b++) {
        const p12 = Math.max(1, Math.min(4095, Math.round(m.predict() * 4096)));
        const xmid = x1 + Math.floor((x2 - x1) / 4096) * p12;
        const y = x <= xmid ? 1 : 0;
        if (y) x2 = xmid; else x1 = xmid + 1;
        m.update(y);
        c = (c << 1) | y;
        while (((x1 ^ x2) & 0xFF000000) === 0) {
          x1 = (x1 * 256) % 4294967296;
          x2 = (x2 * 256) % 4294967296 + 255;
          x = (x * 256) % 4294967296 + nextByte();
        }
      }
      out[i] = c;
      if (onProgress && (i & 0x3FFF) === 0x3FFF) onProgress(i + 1);
    }
    return out;
  }

  // Read bytes and learn from them, returning what coding them would have cost (in bits).
  function learn(m, bytes, onProgress) {
    let bits = 0;
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i];
      for (let b = 7; b >= 0; b--) {
        const y = (c >> b) & 1;
        const p12 = Math.max(1, Math.min(4095, Math.round(m.predict() * 4096)));
        bits -= Math.log2(y ? p12 / 4096 : 1 - p12 / 4096);
        m.update(y);
      }
      if (onProgress && (i & 0x3FFF) === 0x3FFF) onProgress(i + 1, bits);
    }
    return bits;
  }

  // ---------- container ----------
  // "BRD1" | tableBits (1) | length (4, big-endian) | crc32 of original (4) | name length (1) | name (UTF-8) | payload
  const MAGIC = [66, 82, 68, 49];
  const CRC_T = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  function crc32(bytes) { let c = -1; for (let i = 0; i < bytes.length; i++) c = CRC_T[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
  function tableBitsFor(n) { return n <= 64 * 1024 ? 18 : n <= 512 * 1024 ? 20 : 21; }

  function pack({ tableBits, length, crc, name, payload }) {
    let nameBytes = new TextEncoder().encode(name || '');
    if (nameBytes.length > 255) nameBytes = nameBytes.slice(0, 255);
    const head = 4 + 1 + 4 + 4 + 1 + nameBytes.length;
    const buf = new Uint8Array(head + payload.length);
    buf.set(MAGIC, 0);
    buf[4] = tableBits;
    new DataView(buf.buffer).setUint32(5, length);
    new DataView(buf.buffer).setUint32(9, crc);
    buf[13] = nameBytes.length;
    buf.set(nameBytes, 14);
    buf.set(payload, head);
    return { file: buf, headerBytes: head };
  }
  function unpack(buf) {
    if (buf.length < 14 || MAGIC.some((v, i) => buf[i] !== v)) throw new Error('This is not a Bard file: it should start with the letters BRD1.');
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const tableBits = buf[4], length = dv.getUint32(5), crc = dv.getUint32(9), nl = buf[13];
    if (tableBits < 16 || tableBits > 22) throw new Error('The header is damaged (table size ' + tableBits + ').');
    if (buf.length < 14 + nl) throw new Error('The header is cut short.');
    let name = '';
    try { name = new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(14, 14 + nl)); } catch (e) {}
    return { tableBits, length, crc, name, payload: buf.slice(14 + nl), headerBytes: 14 + nl };
  }

  function compress(bytes, name, onProgress) {
    const tableBits = tableBitsFor(bytes.length);
    const m = create({ tableBits });
    const r = encode(m, bytes, onProgress);
    const { file, headerBytes } = pack({ tableBits, length: bytes.length, crc: crc32(bytes), name, payload: r.payload });
    return { file, headerBytes, perByte: r.perByte, payloadBits: r.payloadBits, tableBits };
  }
  function decompress(file, onProgress) {
    const h = unpack(file);
    const m = create({ tableBits: h.tableBits });
    const out = decode(m, h.payload, h.length, onProgress);
    return { bytes: out, name: h.name, ok: crc32(out) === h.crc, header: h };
  }

  return { create, encode, decode, learn, compress, decompress, pack, unpack, crc32, tableBitsFor };
})();
if (typeof module !== 'undefined') module.exports = CM;

// When this file is started as a Web Worker, it compresses and decompresses off the page's main thread.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => {
    const d = e.data;
    const prog = (n) => postMessage({ type: 'progress', n });
    try {
      if (d.type === 'warm-init') {
        // Bard after reading: learn the whole corpus once, then code each message from that state.
        self.warm = CM.create({ tableBits: 21, nnBits: 15 });
        const bits = CM.learn(self.warm, d.corpus, (n, b) => postMessage({ type: 'progress', n, bits: b }));
        postMessage({ type: 'warm-ready', bits, n: d.corpus.length });
      } else if (d.type === 'warm-encode') {
        const m = self.warm;
        m.checkpoint();
        try {
          const r = CM.encode(m, d.bytes);
          postMessage({ type: 'warm-encoded', id: d.id, payload: r.payload, perByte: r.perByte });
        } finally { m.rollback(); }
      } else if (d.type === 'compress') {
        const r = CM.compress(d.bytes, d.name, prog);
        postMessage({ type: 'compressed', file: r.file, headerBytes: r.headerBytes, perByte: r.perByte, tableBits: r.tableBits }, [r.file.buffer, r.perByte.buffer]);
      } else if (d.type === 'decompress') {
        const r = CM.decompress(d.file, prog);
        postMessage({ type: 'decompressed', bytes: r.bytes, ok: r.ok, name: r.name }, [r.bytes.buffer]);
      }
    } catch (err) { postMessage({ type: 'error', message: err.message || String(err) }); }
  };
}
