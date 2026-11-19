// Lookup model: a character n-gram over a suffix array of the Shakespeare corpus.
// For each next character it mixes every context length from 0 up to `order`,
// with absolute-discount smoothing. Probabilities are rounded to integers out of 2^20
// so sender and receiver compute identical intervals, and the coder uses exact
// BigInt fractions: the infinite-precision arithmetic coder from the video.
var LM = (typeof LM !== 'undefined' && LM) || (() => {
  const ALPHA = ['\n'];
  for (let c = 32; c <= 126; c++) ALPHA.push(String.fromCharCode(c));
  const V = ALPHA.length;
  const IDX = new Map(ALPHA.map((ch, i) => [ch, i]));
  const PREFIX = '\n\n';
  const PREC_BITS = 20;
  const TOTAL = 1 << PREC_BITS;

  function clean(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-').replace(/…/g, '...')
      .replace(/\t/g, ' ')
      .split('').filter(ch => IDX.has(ch)).join('');
  }

  // Prefix-doubling suffix array with radix sort.
  function buildSA(codes) {
    const n = codes.length;
    let sa = new Int32Array(n), rank = new Int32Array(n), tmp = new Int32Array(n);
    const sa2 = new Int32Array(n);
    let m = V;
    const cnt = new Int32Array(Math.max(m, n) + 1);
    for (let i = 0; i < n; i++) { rank[i] = codes[i]; cnt[rank[i]]++; }
    for (let i = 1; i < m; i++) cnt[i] += cnt[i - 1];
    for (let i = n - 1; i >= 0; i--) sa[--cnt[rank[i]]] = i;
    for (let k = 1; ; k <<= 1) {
      let p = 0;
      for (let i = n - k; i < n; i++) sa2[p++] = i;
      for (let i = 0; i < n; i++) if (sa[i] >= k) sa2[p++] = sa[i] - k;
      cnt.fill(0, 0, m + 1);
      for (let i = 0; i < n; i++) cnt[rank[i]]++;
      for (let i = 1; i < m; i++) cnt[i] += cnt[i - 1];
      for (let i = n - 1; i >= 0; i--) sa[--cnt[rank[sa2[i]]]] = sa2[i];
      tmp[sa[0]] = 0; p = 1;
      for (let i = 1; i < n; i++) {
        const a = sa[i - 1], b = sa[i];
        const ra = a + k < n ? rank[a + k] : -1, rb = b + k < n ? rank[b + k] : -1;
        tmp[b] = (rank[a] === rank[b] && ra === rb) ? p - 1 : p++;
      }
      [rank, tmp] = [tmp, rank];
      m = p;
      if (p >= n) break;
    }
    return sa;
  }

  class Corpus {
    constructor(text) {
      const n = text.length;
      this.codes = new Uint8Array(n);
      for (let i = 0; i < n; i++) this.codes[i] = IDX.get(text[i]);
      this.n = n;
      this.sa = buildSA(this.codes);
    }
    at(pos) { return pos < this.n ? this.codes[pos] : -1; }
    // range [l, r) of suffixes that start with ctx (array of symbol indices)
    range(ctx) {
      const { sa, n } = this; const k = ctx.length;
      const cmp = (pos) => {
        for (let j = 0; j < k; j++) {
          const c = this.at(pos + j);
          if (c !== ctx[j]) return c < ctx[j] ? -1 : 1;
        }
        return 0;
      };
      let lo = 0, hi = n;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cmp(sa[mid]) < 0) lo = mid + 1; else hi = mid; }
      const l = lo; hi = n;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cmp(sa[mid]) <= 0) lo = mid + 1; else hi = mid; }
      return [l, lo];
    }
    // how often each symbol follows ctx in the corpus
    followers(ctx) {
      const [l, r] = this.range(ctx);
      const k = ctx.length, sa = this.sa;
      const list = []; let t = 0;
      let i = l;
      while (i < r) {
        const c = this.at(sa[i] + k);
        let lo = i + 1, hi = r;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (this.at(sa[mid] + k) <= c) lo = mid + 1; else hi = mid; }
        if (c >= 0) { list.push([c, lo - i]); t += lo - i; }
        i = lo;
      }
      return { t, list };
    }
  }

  // Counts learned from the message itself while coding (sender and receiver do the same).
  class Online {
    constructor(K) { this.K = K; this.tabs = []; for (let k = 0; k <= K; k++) this.tabs.push(new Map()); }
    get(k, key) { return this.tabs[k].get(key); }
    add(ctxStr, sym) {
      for (let k = 0; k <= this.K && k <= ctxStr.length; k++) {
        const key = ctxStr.slice(ctxStr.length - k);
        let node = this.tabs[k].get(key);
        if (!node) { node = new Map(); this.tabs[k].set(key, node); }
        node.set(sym, (node.get(sym) || 0) + 1);
      }
    }
  }

  const SMOOTH = { d: 0.8, b: 1 };

  function dist(corpus, online, ctxStr, order) {
    const p = new Float64Array(V).fill(1 / V);
    const ctxCodes = [];
    for (let i = 0; i < ctxStr.length; i++) ctxCodes.push(IDX.get(ctxStr[i]));
    const used = [];
    for (let k = 0; k <= order; k++) {
      if (ctxStr.length < k) break;
      const counts = new Map();
      const fc = corpus.followers(ctxCodes.slice(ctxCodes.length - k));
      for (const [s, c] of fc.list) counts.set(s, c);
      let t = fc.t;
      if (online) {
        const node = online.get(k, ctxStr.slice(ctxStr.length - k));
        if (node) for (const [s, c] of node) { counts.set(s, (counts.get(s) || 0) + c); t += c; }
      }
      if (t === 0) break;
      const u = counts.size;
      const den = t + SMOOTH.b;
      const lam = (SMOOTH.d * u + SMOOTH.b) / den;
      for (let i = 0; i < V; i++) p[i] *= lam;
      for (const [s, c] of counts) p[s] += (c - SMOOTH.d) / den;
      used.push(t);
    }
    return { p, depth: used.length - 1, seen: used[used.length - 1] || 0 };
  }

  function quantize(p) {
    const f = new Uint32Array(V);
    const avail = TOTAL - V;
    let sum = 0, best = 0;
    for (let i = 0; i < V; i++) {
      f[i] = 1 + Math.floor(p[i] * avail);
      sum += f[i];
      if (p[i] > p[best]) best = i;
    }
    f[best] += TOTAL - sum;
    const cum = new Uint32Array(V + 1);
    for (let i = 0; i < V; i++) cum[i + 1] = cum[i] + f[i];
    return { f, cum };
  }

  function analyse(corpus, text, order, adaptive) {
    const s = PREFIX + text;
    const online = adaptive ? new Online(order) : null;
    const steps = [];
    for (let i = PREFIX.length; i < s.length; i++) {
      const ctx = s.slice(Math.max(0, i - order), i);
      const d = dist(corpus, online, ctx, order);
      const q = quantize(d.p);
      const sym = IDX.get(s[i]);
      steps.push({ ch: s[i], sym, f: q.f, cum: q.cum, depth: d.depth, seen: d.seen });
      if (online) online.add(ctx, sym);
    }
    return steps;
  }

  // Exact interval [A/2^D, (A+W)/2^D); send the shortest binary fraction inside it.
  function encode(steps) {
    let A = 0n, W = 1n;
    const P = BigInt(PREC_BITS);
    let ideal = 0;
    for (const st of steps) {
      A = (A << P) + W * BigInt(st.cum[st.sym]);
      W = W * BigInt(st.f[st.sym]);
      ideal += -Math.log2(st.f[st.sym] / TOTAL);
    }
    const D = steps.length * PREC_BITS;
    if (steps.length === 0) return { bits: '', ideal: 0 };
    const B = A + W;
    for (let k = Math.max(0, Math.floor(ideal) - 2); k <= D; k++) {
      const shift = BigInt(D - k);
      const m = (A + (1n << shift) - 1n) >> shift;
      if ((m << shift) < B) return { bits: k === 0 ? '' : m.toString(2).padStart(k, '0'), ideal };
    }
    return { bits: A.toString(2).padStart(D, '0'), ideal };
  }

  function decode(corpus, bits, n, order, adaptive) {
    const k = bits.length;
    const X = k ? BigInt('0b' + bits) : 0n;
    const P = BigInt(PREC_BITS);
    let A = 0n, W = 1n, Dprev = 0;
    let out = PREFIX;
    const online = adaptive ? new Online(order) : null;
    for (let i = 0; i < n; i++) {
      const ctx = out.slice(Math.max(0, out.length - order));
      const q = quantize(dist(corpus, online, ctx, order).p);
      const E = Math.max(k, Dprev);
      const Xe = X << BigInt(E - k);
      const Ae = A << BigInt(E - Dprev);
      const We = W << BigInt(E - Dprev);
      let t = Number(((Xe - Ae) << P) / We);
      if (t < 0) t = 0; if (t >= TOTAL) t = TOTAL - 1;
      let lo = 0, hi = V - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (q.cum[mid] <= t) lo = mid; else hi = mid - 1; }
      A = (A << P) + W * BigInt(q.cum[lo]);
      W = W * BigInt(q.f[lo]);
      Dprev += PREC_BITS;
      if (online) online.add(ctx, lo);
      out += ALPHA[lo];
    }
    return out.slice(PREFIX.length);
  }

  function huffmanLengths(corpus) {
    const fc = corpus.followers([]);
    const w = new Map(fc.list);
    const items = [];
    for (let i = 0; i < V; i++) items.push({ w: w.get(i) || 0.5, syms: [i] });
    const len = new Uint8Array(V);
    while (items.length > 1) {
      items.sort((a, b) => a.w - b.w);
      const a = items.shift(), b = items.shift();
      for (const s of a.syms) len[s]++;
      for (const s of b.syms) len[s]++;
      items.push({ w: a.w + b.w, syms: a.syms.concat(b.syms) });
    }
    return len;
  }

  return { ALPHA, V, IDX, PREFIX, PREC_BITS, TOTAL, clean, Corpus, dist, quantize, analyse, encode, decode, huffmanLengths };
})();
if (typeof module !== 'undefined') module.exports = LM;
