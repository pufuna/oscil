'use strict';
// ===== "Лента": long history built from consecutive frames =====
// Slow time bases (roll mode): frames overlap, they are stitched into one continuous record.
// Fast time bases: every new acquisition is appended as its own segment (gap marked).
const TAPE = (() => {
  const MAX = 600000, N = 301;
  const T = { v: [new Float32Array(MAX), new Float32Array(MAX)], t: new Float64Array(MAX), gap: new Uint8Array(MAX), len: 0, prev: null, contig: 0, segs: 0, lastMode: '' };
  function clear() { T.len = 0; T.prev = null; T.contig = 0; T.segs = 0; }
  function room(k) {
    if (T.len + k <= MAX) return;
    const drop = Math.max(k, MAX >> 2);
    for (const a of [T.v[0], T.v[1], T.t, T.gap]) a.copyWithin(0, drop, T.len);
    T.len -= drop; T.gap[0] = 1;
    if (TAPE.onDrop) TAPE.onDrop(drop);
  }
  const same = (a, b) => { for (let i = 0; i < N; i++) if (a[i] !== b[i]) return false; return true; };
  function fits(p, n, chans, s) {   // mean abs error per point if prev[s..] ≈ new[0..N-s), else -1
    const L = N - s, lim = 0.8 * L * chans.length, badLim = Math.max(2, L * chans.length * 0.03); let e = 0, bad = 0;
    for (const c of chans) { const a = p[c], b = n[c]; for (let i = 0; i < L && bad <= badLim && e <= lim; i++) { const d = Math.abs(a[s + i] - b[i]); if (d > 4) bad++; else e += d; } }
    return bad <= badLim && e <= lim ? e / (L * chans.length) : -1;
  }
  // exp: expected shift in samples from the elapsed frame time. A periodic signal also "fits" at
  // shift ± period, so the smallest fitting shift could squeeze time; prefer the fit nearest to exp.
  function matchShift(p, n, chans, exp) {
    if (exp > 0) {
      const hi = Math.min(N - 40, Math.ceil(exp * 1.5) + 8), ok = [];
      for (let s = 1; s <= hi; s++) { const c = fits(p, n, chans, s); if (c >= 0) ok.push([s, c]); }
      if (ok.length) {
        const best = Math.min(...ok.map(q => q[1])); let pick = 0;
        for (const [s, c] of ok) if (c <= best * 1.5 + 0.05 && (!pick || Math.abs(s - exp) < Math.abs(pick - exp))) pick = s;
        return pick;
      }
    }
    for (let s = 1; s <= N - 40; s++) if (fits(p, n, chans, s) >= 0) return s;   // no timing hint: smallest fit, as before
    return 0;
  }
  // zero: raw value of 0 V for each channel; period: seconds between device frames (firmware 'P' setting)
  function push(fr, zero, now, period) {
    const raw = fr.raw, p = T.prev;
    if (p && same(p.raw[0], raw[0]) && same(p.raw[1], raw[1])) return;   // the device has not redrawn yet
    const on = [0, 1].map(c => !!(fr.mask & (1 << c)));
    const chans = on[0] || on[1] ? [0, 1].filter(c => on[c]) : [0];
    const dt = fr.tdiv ? fr.tdiv / 25 : 0.001;
    let s = 0;
    const sameScale = p && p.tIdx === fr.tIdx && p.vIdx[0] === fr.vIdx[0] && p.vIdx[1] === fr.vIdx[1] && p.mask === fr.mask && p.z0 === zero[0] && p.z1 === zero[1];
    const exp = p && period && fr.seq != null && p.seq != null ? (((fr.seq - p.seq) & 255) || 256) * period / dt : 0;
    if (sameScale && fr.tdiv >= 0.05) s = matchShift(p.raw, raw, chans, exp);
    const val = (c, r) => on[c] ? (r - zero[c]) / 25 * (fr.vdiv[c] || 1) : NaN;
    if (s) {
      room(s);
      let t = T.len ? T.t[T.len - 1] : now - s * dt;
      if (now - t > 5 * s * dt + 1) t = now - s * dt;      // re-anchor after a stall
      for (let i = N - s; i < N; i++) { const k = T.len++; t += dt; T.t[k] = t; T.gap[k] = 0; T.v[0][k] = val(0, raw[0][i]); T.v[1][k] = val(1, raw[1][i]); }
      T.contig++; T.lastMode = 'roll';
    } else {
      room(N);
      for (let i = 0; i < N; i++) { const k = T.len++; T.t[k] = now + (i - (N - 1)) * dt; T.gap[k] = i === 0 ? 1 : 0; T.v[0][k] = val(0, raw[0][i]); T.v[1][k] = val(1, raw[1][i]); }
      T.segs++; T.lastMode = sameScale && fr.tdiv >= 0.05 ? 'roll?' : 'frames';
    }
    T.prev = { seq: fr.seq, raw: [raw[0].slice(), raw[1].slice()], tIdx: fr.tIdx, vIdx: fr.vIdx.slice(), mask: fr.mask, z0: zero[0], z1: zero[1] };
  }
  return { T, push, clear, MAX, onDrop: null };
})();
