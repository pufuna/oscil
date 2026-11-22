'use strict';
(() => {
const $ = id => document.getElementById(id);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TDIV = [10e-9,20e-9,50e-9,100e-9,200e-9,500e-9,1e-6,2e-6,5e-6,10e-6,20e-6,50e-6,100e-6,200e-6,500e-6,1e-3,2e-3,5e-3,10e-3,20e-3,50e-3,100e-3,200e-3,500e-3,1,2,5,10,20];
const VDIV = [10e-3,20e-3,50e-3,100e-3,200e-3,500e-3,1,2,5,10,20,50,100];
const N = 301, PXDIV = 25;
const KEY_NAMES = ['CH1','CH2','MOVE','SELECT','TRIGGER','PRM','AUTO','SAVE','MENU','↑','↓','←','→','OK','POWER'];
const KEY_HELP = { '↑':'стрелка вверх', '↓':'стрелка вниз', '←':'стрелка влево', '→':'стрелка вправо', OK:'центральная кнопка OK', POWER:'питание (короткое нажатие; можно пропустить)', SELECT:'SELECT / CURSOR' };

function si(x, unit, digits = 4) {
  if (x == null || !isFinite(x)) return '—'; const a = Math.abs(x); if (a === 0) return '0 ' + unit;
  const P = [[1e9,'Г'],[1e6,'М'],[1e3,'к'],[1,''],[1e-3,'м'],[1e-6,'мк'],[1e-9,'н'],[1e-12,'п']];
  const trim = t => (t.includes('.') && !t.includes('e')) ? t.replace(/0+$/, '').replace(/\.$/, '') : t;
  for (const [f, p] of P) if (a >= f * 0.9995 || f === 1e-12) return trim((x / f).toPrecision(Math.max(3, digits))).replace('.', ',') + ' ' + p + unit;
}
const fmtT = x => si(x, 'с', 3), fmtV = x => si(x, 'В', 3);
const tdivName = t => si(t, 'с', 3) + '/дел', vdivName = v => si(v, 'В', 3) + '/дел';
const UN = c => (S.sens && S.sens[c] && S.sens[c].unit) || 'В';
const KS = c => { const k = S.sens && S.sens[c] && +S.sens[c].k; return k && isFinite(k) ? k : 1; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const chName = c => 'CH' + (c + 1) + (S.sens && S.sens[c] && S.sens[c].name ? ' · ' + esc(S.sens[c].name) : '');
const fmtC = (c, x, d = 3) => si(x, UN(c), d), vdivNameC = (c, v) => si(v, UN(c), 3) + '/дел';

let toastT;
function toast(msg, action) {
  const t = $('toast'); t.innerHTML = ''; t.append(document.createTextNode(msg));
  if (action) { const a = document.createElement('a'); a.textContent = action[0]; a.onclick = action[1]; t.append(a); }
  t.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => t.style.display = 'none', 4500);
}
const api = (p, o = {}) => fetch(p, Object.assign({}, o, { headers: Object.assign({ 'X-PUF': '1' }, o.headers) })).then(r => { if (!r.ok) throw new Error(r.statusText); return r; });
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function saveOut(name, u8) {
  try {
    const r = await (await api('/api/save', { method: 'POST', body: JSON.stringify({ name, data: b64(u8) }) })).json();
    toast('Сохранено: ' + r.path, ['Открыть папку', () => api('/api/opendir')]);
  } catch (e) { toast('Не удалось сохранить: ' + e.message); }
}
const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const utf8 = s => new TextEncoder().encode(s);
const num = (x, d = 6) => x == null || !isFinite(x) ? '' : (+x.toPrecision(d)).toString().replace('.', ',');

// ---------------- settings ----------------
const S = { theme: 'light', keys: {}, holdShort: 6, holdLong: 90, tbDir: 1, st: { on: true, src: 'a', edge: 1, lvl: 'auto', level: 128, pos: 150 }, avg: 4, smooth: 0, zeroDev: true, sens: [{ k: 1, unit: 'В', name: '', preset: 'v1' }, { k: 1, unit: 'В', name: '', preset: 'v1' }],
  sync: { tolF: 0.1, tolPhi: 10, tolU: 5, offset: 0, fc: 0 }, power: { inv: false, mult: 1 }, start: { ch: 1, thr: 0, nom: 0, pre: 3, auto: true },
  fps: 33, yLabels: true, pwm: { ch: 0 }, rpm: { ch: 1, ppr: 1, poles: 2, fsrc: 'ch', fman: 50 }, fill: true, persist: false, show: [1, 1], zero: [0, 0] };
let saveT;
function saveSettings() { clearTimeout(saveT); saveT = setTimeout(() => api('/api/settings', { method: 'POST', body: JSON.stringify(S) }).catch(() => {}), 400); }
async function loadSettings() {
  try { const s = await (await api('/api/settings')).json(); for (const k in s) S[k] = (typeof S[k] === 'object' && !Array.isArray(S[k]) && S[k]) ? Object.assign(S[k], s[k]) : s[k]; } catch (e) {}
}

// ---------------- theme / mode / nav ----------------
function applyTheme() { document.documentElement.dataset.theme = S.theme; cssCache.clear(); }
$('bTheme').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; applyTheme(); saveSettings(); redrawAll(); };
let mode = 'live', view = 'scope';
const lastView = { live: 'scope', files: 'files' };
function setMode(m) {
  mode = m; $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  $$('.navgrp').forEach(g => g.hidden = g.dataset.for !== m);
  setView(lastView[m]);
  if (m === 'files') refreshRecordings();
}
function setView(v) {
  view = v; if (v !== 'about') lastView[mode] = v;
  $$('.side button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  requestAnimationFrame(redrawAll);
}
$$('#modeSeg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
$$('.side button').forEach(b => b.onclick = () => setView(b.dataset.view));
$$('[data-goto]').forEach(b => b.onclick = () => setView(b.dataset.goto));
function segInit(id, cb, multi) {
  const el = $(id);
  el.querySelectorAll('button').forEach(b => b.onclick = () => {
    if (multi) b.classList.toggle('on'); else el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    cb(b.dataset.v, b, el);
  });
}
function segSet(id, v) { $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(v))); }

// ---------------- link / events ----------------
let link = { state: 'idle' }, frames = 0, fpsN = 0, fpsT = performance.now(), fps = 0, lastSeq = -1, lost = 0, bad = 0, lastFrameAt = 0;
let cur = null, lastTraceChange = 0;           // last parsed frame
function setConn() {
  const d = $('conn').querySelector('.dot'), t = $('connText');
  const age = performance.now() - lastFrameAt;
  if (link.state === 'connected' && age < 1500) { d.className = 'dot ok'; t.textContent = `${link.port} · ${fps.toFixed(0)} кадр/с` + (cur && cur.ver < 2 ? ' · прошивка без управления' : ''); }
  else if (link.state === 'connected') { d.className = 'dot wait'; t.textContent = `${link.port} открыт · ` + (link.msg || 'ожидание данных…'); }
  else if (link.state === 'error') { d.className = 'dot err'; t.textContent = link.msg || 'ошибка'; }
  else if (link.state === 'idle') { d.className = 'dot'; t.textContent = 'отключено'; }
  else { d.className = 'dot wait'; t.textContent = link.msg || 'поиск прибора…'; }
  const online = !!cur && age < 2000;
  document.body.classList.toggle('offline', !online);
  const le = $('liveEmpty'), stale = !!cur && age >= 3000;
  le.style.display = cur && age < 3000 ? 'none' : 'flex'; le.classList.toggle('stale', stale);
  $('liveEmptyTitle').textContent = stale ? 'Связь с прибором потеряна' : 'Нет данных от прибора';
  $('liveEmptyHint').textContent = stale ? 'Под затемнением — последний полученный кадр. Лента сохранена. Связь восстановится сама, когда прибор снова будет в режиме осциллографа.'
    : link.state === 'connected' ? 'Порт открыт. Включите на приборе режим осциллографа — данные пойдут сами.' : 'Подключите 2C53T кабелем USB (прошивка RU_USB4) и включите режим осциллографа.';
  if (!online) $('ctlInfo').textContent = 'Прибор не подключён — управление недоступно.'; else if ($('ctlInfo').dataset.off !== '0') { $('ctlInfo').dataset.off = '0'; refreshKeyState(); }
  if (!online) $('ctlInfo').dataset.off = '1';
}
setInterval(setConn, 500);
function startEvents() {
  const es = new EventSource('/api/events');
  es.addEventListener('status', e => { link = JSON.parse(e.data); setConn(); renderLinkKv(); });
  es.addEventListener('hello', e => { const h = JSON.parse(e.data); $('ver').textContent = 'v' + h.version; $('ver2').textContent = 'v' + h.version; });
  es.addEventListener('frame', e => onFrame(unb64(e.data)));
  es.addEventListener('mem', e => onMem(unb64(e.data)));
  es.onerror = () => { link = { state: 'error', msg: 'нет связи с программой' }; setConn(); };
}
async function send(bytes) { try { await api('/api/send', { method: 'POST', body: b64(new Uint8Array(bytes)) }); } catch (e) { toast('Команда не отправлена'); } }

// ---------------- frames ----------------
function parseFrame(f) {
  const ver = f[4], seq = f[5], len = f[6] | (f[7] << 8);
  const g = f.subarray(8, 136), tr = f.subarray(136, 136 + 602);
  const fr = { ver, seq, g: g.slice(), t: Date.now(), tIdx: g[0x2d], tdiv: TDIV[g[0x2d]] ?? null, vIdx: [g[6] * 3 + g[2], g[7] * 3 + g[3]], mask: g[0x14], raw: [tr.slice(0, N), tr.slice(N, 2 * N)] };
  fr.vdivRaw = fr.vIdx.map(i => VDIV[i] ?? null);
  fr.vdiv = fr.vdivRaw.map((v, c) => v == null ? null : v * KS(c));
  if (ver >= 2 && len >= 8 + 128 + 602 + 16 + 8 + 2) {
    const o = 8 + 128 + 602; fr.sys = f.slice(o, o + 16);
    fr.keyLatch = f[o + 16] | (f[o + 17] << 8); fr.keyPhys = f[o + 18] | (f[o + 19] << 8);
    fr.scan = f[o + 20]; fr.qlen = f[o + 21] & 15; fr.injecting = !!(f[o + 21] & 16); fr.injKey = f[o + 22];
  }
  return fr;
}
const prevG = new Uint8Array(128), chgG = new Float64Array(128), prevS = new Uint8Array(16), chgS = new Float64Array(16);
let scanRate = null, scanRef = null;
// frame period for the firmware 'P' command (ms, ≥10); re-sent after every reconnect, the device forgets it on power-off
let fpsApplied = false;
function sendFps() { const ms = Math.max(10, Math.min(250, Math.round(+S.fps || 33))); send([0xA5, 0x50, ms, 0]); }
function onFrame(f) {
  const fr = parseFrame(f), now = performance.now();
  if (now - lastFrameAt > 2000) fpsApplied = false;
  if (!fpsApplied && fr.ver >= 4) { fpsApplied = true; sendFps(); }
  if (lastSeq >= 0 && ((lastSeq + 1) & 255) !== fr.seq) lost += (fr.seq - lastSeq - 1 + 256) & 255;
  lastSeq = fr.seq; frames++; fpsN++; lastFrameAt = now;
  if (now - fpsT > 1000) { fps = fpsN * 1000 / (now - fpsT); fpsN = 0; fpsT = now; }
  for (let i = 0; i < 128; i++) { if (frames > 1 && fr.g[i] !== prevG[i]) chgG[i] = now; prevG[i] = fr.g[i]; }
  if (fr.sys) for (let i = 0; i < 16; i++) { if (frames > 1 && fr.sys[i] !== prevS[i]) chgS[i] = now; prevS[i] = fr.sys[i]; }
  if (fr.scan != null) {
    if (!scanRef) scanRef = { t: now, n: 0, last: fr.scan };
    scanRef.n += (fr.scan - scanRef.last + 256) & 255; scanRef.last = fr.scan;
    if (now - scanRef.t > 2000) { scanRate = scanRef.n * 1000 / (now - scanRef.t); scanRef = { t: now, n: 0, last: fr.scan }; }
    if (fr.keyLatch) onPhysKeys(fr.keyLatch);
  }
  if (cur && (cur.tIdx !== fr.tIdx || cur.vIdx[0] !== fr.vIdx[0] || cur.vIdx[1] !== fr.vIdx[1])) resetProc();
  const prev = cur; cur = fr;
  if (!prev || fr.raw[0].some((v, i) => v !== prev.raw[0][i]) || fr.raw[1].some((v, i) => v !== prev.raw[1][i])) lastTraceChange = now;
  if (prev && prev.tIdx !== fr.tIdx) onTbChange(prev.tIdx, fr.tIdx);
  if (recording) { recording.push(fr); $('bRec').lastChild.textContent = `Стоп (${recording.length})`; }
  TAPE.push(fr, [zeroRaw(0), zeroRaw(1)], Date.now() / 1000, (+S.fps || 33) / 1000);
  if (!frozen) process(fr);
  if (lastTraceChange === now) recFeed(fr, now);   // event recorder: every distinct acquisition, also while paused
  trendPush();   // start-up trend: driven by frames, not by a timer (timers slow down in a background window)
  needDraw = true;
}

// ---------------- software trigger / averaging ----------------
let trigSrc = 0, frozen = false, proc = null, avgBuf = [[], []], persistBuf = [], stInfo = { ok: null, text: '' };
function resetProc() { avgBuf = [[], []]; persistBuf = []; }
const s8 = v => v > 127 ? v - 256 : v, s16 = (lo, hi) => { const v = lo | (hi << 8); return v > 32767 ? v - 65536 : v; };
function zeroRaw(c) { return S.zeroDev && cur ? 128 + s8(cur.g[4 + c]) : 128 + S.zero[c] * PXDIV; }
function zeroDiv(c) { return (zeroRaw(c) - 128) / PXDIV; }
function devTrigX() { if (!cur) return 150; return Math.max(0, Math.min(N - 1, 150 + s16(cur.g[0x1a], cur.g[0x1b]))); }
function boxcar(a, w) { const o = new Float32Array(a.length), h = w >> 1; let s = 0, n = 0; for (let i = -h; i < a.length; i++) { const add = i + h, rem = i - h - 1; if (add < a.length) { s += a[add]; n++; } if (rem >= 0) { s -= a[rem]; n--; } if (i >= 0) o[i] = s / n; } return o; }
function smooth3(a) { const o = new Float32Array(a.length); o[0] = a[0]; o[a.length - 1] = a[a.length - 1]; for (let i = 1; i < a.length - 1; i++) o[i] = (a[i - 1] + 2 * a[i] + a[i + 1]) / 4; return o; }
function findTrigger(v, edge, level, pos) {
  let mn = Infinity, mx = -Infinity; for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x; }
  const pp = mx - mn; if (pp < 4) return { err: 'сигнал слишком мал для синхронизации' };
  const L = level == null ? (mx + mn) / 2 : level;
  if (L <= mn || L >= mx) return { err: 'уровень вне сигнала', L };
  const h = Math.max(1.2, pp * 0.08), s = edge > 0 ? 1 : -1;
  let armed = false, best = null, bd = Infinity, count = 0; const xs = [];
  for (let i = 1; i < v.length; i++) {
    const a = s * (v[i - 1] - L), b = s * (v[i] - L);
    if (s * (v[i] - L) < -h) armed = true;
    if (armed && a < 0 && b >= 0) {
      const x = i - 1 + a / (a - b); count++; armed = false; xs.push(x);
      const d = Math.abs(x - pos); if (d < bd) { bd = d; best = x; }
    }
  }
  if (best == null) return { err: 'нет фронта на экране', L };
  const period = xs.length >= 2 ? (xs[xs.length - 1] - xs[0]) / (xs.length - 1) : null;
  return { x: best, L, count, period };
}
function process(fr) {
  const stOn = S.st.on && fr.tdiv != null && fr.tdiv < 0.1;
  const ch = [0, 1].map(c => { let a = Float32Array.from(fr.raw[c]); const sm = +S.smooth || 0; if (sm === 1) a = smooth3(a); else if (sm > 1) a = boxcar(a, sm === 2 ? 9 : 25); return a; });
  let shift = 0, trig = null;
  if (stOn) {
    let srcs = [S.st.src];
    if (S.st.src === 'a') {
      const pp = c => { if (!(fr.mask & (1 << c))) return -1; let a = Infinity, b = -Infinity; for (const x of ch[c]) { if (x < a) a = x; if (x > b) b = x; } return b - a; };
      const p0 = pp(0), p1 = pp(1);   // stick to the current channel unless the other is clearly bigger (2 phases ≈ equal)
      const pick = trigSrc === 1 ? (p0 > p1 * 1.5 ? 0 : 1) : (p1 > p0 * 1.5 ? 1 : 0);
      srcs = pick ? [1, 0] : [0, 1];
    }
    let r = null, src = srcs[0];
    for (const c of srcs) { const q = findTrigger(ch[c], S.st.edge, S.st.lvl === 'auto' ? null : S.st.level, S.st.pos); if (!r) { r = q; src = c; } if (q.x != null) { r = q; src = c; break; } }
    trigSrc = src;
    if (r.x != null) { shift = S.st.pos - r.x; trig = r; stInfo = { ok: true, text: `синхронизация по CH${src + 1}${S.st.src === 'a' ? ' (авто)' : ''}, уровень ${lvlText(r.L, src)}` + (r.count > 1 ? `, фронтов на экране: ${r.count}` : '') + '. Оба канала сдвигаются вместе.' }; }
    else stInfo = { ok: false, text: 'не синхронизировано: ' + r.err };
    if (r.L != null) trig = Object.assign(trig || {}, { L: r.L });
  } else stInfo = { ok: null, text: S.st.on && fr.tdiv >= 0.1 ? 'медленная развёртка (≥100 мс/дел) — стабилизация не нужна' : 'стабилизация выключена' };
  const out = ch.map(a => {
    if (!shift) return a;
    const o = new Float32Array(N);
    for (let j = 0; j < N; j++) { const x = j - shift, i = Math.floor(x); o[j] = i < 0 || i >= N - 1 ? (Math.abs(x - (N - 1)) < 1e-6 ? a[N - 1] : NaN) : a[i] + (a[i + 1] - a[i]) * (x - i); }
    return o;
  });
  const fill = [null, null];
  if (shift && S.fill && trig && trig.period && trig.period > 8) {
    const P = trig.period;
    out.forEach((a, c) => {
      const src = Float32Array.from(a), m = new Uint8Array(N); let any = false;
      for (let j = 0; j < N; j++) {
        if (!isNaN(src[j])) continue;
        for (const k of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6]) {
          const x = j + k * P, i = Math.floor(x);
          if (i < 0 || i >= N - 1 || isNaN(src[i]) || isNaN(src[i + 1])) continue;
          a[j] = src[i] + (src[i + 1] - src[i]) * (x - i); m[j] = 1; any = true; break;
        }
      }
      if (any) fill[c] = m;
    });
  }
  const n = +S.avg || 1;
  const avg = out.map((a, c) => {
    const B = avgBuf[c]; B.push(a); while (B.length > n) B.shift();
    if (B.length === 1) return a;
    const o = new Float32Array(N);
    for (let j = 0; j < N; j++) { let s = 0, k = 0; for (const b of B) if (!isNaN(b[j])) { s += b[j]; k++; } o[j] = k * 2 >= B.length ? s / k : NaN; }
    return o;
  });
  proc = { fr, y: avg, fill, trig, stOn: stOn && trig && trig.x != null };
  if (S.persist) { persistBuf.push(avg); while (persistBuf.length > 24) persistBuf.shift(); } else persistBuf = [];
}
function lvlText(rawL, c) { const vd = cur && cur.vdiv[c]; const v = (rawL - zeroRaw(c)) / PXDIV; return vd ? fmtC(c, v * vd) : v.toFixed(2) + ' дел'; }

// ---------------- plot renderer ----------------
// data: { n, y:[Float32Array raw-scale values], v0:[raw zero], on:[bool], vdiv:[], tdiv, trigX (samples), trigL (raw|null), title }
const views = {};   // per canvas: zoom & cursors
function getView(id) { return views[id] || (views[id] = { t0: 0, t1: 12, cur: 'off', ta: 3, tb: 9, va: 1.5, vb: -1.5, drag: null }); }
// theme colours are read once per theme: getComputedStyle on every grid line was a noticeable part of a frame
const cssCache = new Map();
function cssVar(n) { let v = cssCache.get(n); if (v == null) { v = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); cssCache.set(n, v); } return v; }
function geom(cv, compact) {
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return null;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const ml = compact ? 6 : 30, mr = compact ? 6 : 12, mt = compact ? 6 : 16, mb = compact ? 6 : 24;
  const pw = W - ml - mr, ph = H - mt - mb;
  return { dpr, W, H, ml, mt, pw, ph };
}
function drawScope(cv, data, opts = {}) {
  const g = geom(cv, opts.compact); if (!g) return null;
  const ctx = cv.getContext('2d'), v = getView(cv.id);
  ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.fillStyle = cssVar('--scr'); ctx.fillRect(0, 0, g.W, g.H);
  const span = v.t1 - v.t0;
  const X = d => g.ml + (d - v.t0) / span * g.pw;           // d in divisions (0..12)
  const Y = d => g.mt + (4 - d) / 8 * g.ph;                 // d in divisions (-4..4)
  g.X = X; g.Y = Y; g.v = v; g.toDiv = px => v.t0 + (px - g.ml) / g.pw * span; g.toDivY = py => 4 - (py - g.mt) / g.ph * 8;
  // grid
  ctx.lineWidth = 1;
  const step = span > 14 ? nice125(span / 12) : span > 6 ? 1 : span > 2 ? 0.5 : 0.2;   // long records (CSV, film strip): ~12 grid lines
  for (let d = Math.ceil(v.t0 / step) * step; d <= v.t1 + 1e-9; d += step) {
    const major = Math.abs(d - Math.round(d)) < 1e-6;
    ctx.strokeStyle = major ? cssVar('--grid2') : cssVar('--grid');
    ctx.setLineDash(major ? [] : [2, 3]); ctx.beginPath(); ctx.moveTo(Math.round(X(d)) + .5, g.mt); ctx.lineTo(Math.round(X(d)) + .5, g.mt + g.ph); ctx.stroke();
  }
  ctx.setLineDash([]);
  for (let d = -4; d <= 4; d++) { ctx.strokeStyle = cssVar('--grid2'); ctx.beginPath(); ctx.moveTo(g.ml, Math.round(Y(d)) + .5); ctx.lineTo(g.ml + g.pw, Math.round(Y(d)) + .5); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(160,210,220,.45)'; ctx.beginPath();
  ctx.moveTo(g.ml, Math.round(Y(0)) + .5); ctx.lineTo(g.ml + g.pw, Math.round(Y(0)) + .5); if (!data || !data.seps) { ctx.moveTo(Math.round(X(6)) + .5, g.mt); ctx.lineTo(Math.round(X(6)) + .5, g.mt + g.ph); } ctx.stroke();
  if (!data) return g;
  if (data.hl) { ctx.fillStyle = 'rgba(243,95,39,.09)'; const a = Math.max(g.ml, X(data.hl[0])), b = Math.min(g.ml + g.pw, X(data.hl[1])); if (b > a) ctx.fillRect(a, g.mt, b - a, g.ph); }   // highlighted span (current frame in the film strip)
  if (data.seps && !(data.seps.length > 1 && X(data.seps[1]) - X(data.seps[0]) < 10)) { ctx.strokeStyle = 'rgba(243,95,39,.45)'; ctx.setLineDash([3, 4]); for (const d of data.seps) { if (d < v.t0 || d > v.t1) continue; const x = Math.round(X(d)) + .5; ctx.beginPath(); ctx.moveTo(x, g.mt); ctx.lineTo(x, g.mt + g.ph); ctx.stroke(); } ctx.setLineDash([]); }
  const colors = [cssVar('--ch1'), cssVar('--ch2')];
  ctx.save(); ctx.beginPath(); ctx.rect(g.ml, g.mt, g.pw, g.ph); ctx.clip();
  const trace = (y, c, alpha, lw, mask, want) => {
    ctx.strokeStyle = colors[c]; ctx.globalAlpha = alpha; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.beginPath();
    let pen = false;
    if (data.xs && !mask) {     // long records: draw a min/max envelope per pixel column
      const xs = data.xs[c], u0 = v.t0 * PXDIV, u1 = v.t1 * PXDIV;
      const find = u => { let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < u) lo = m; else hi = m; } return lo; };
      const i0 = find(u0), i1 = Math.min(xs.length - 1, find(u1) + 1);
      if (i1 - i0 > 3 * g.pw) {
        const upp = (u1 - u0) / g.pw; ctx.globalAlpha = alpha * 0.7;   // envelopes of both channels stay visible
        for (let col = 0, i = i0; col < g.pw; col++) {
          const ue = u0 + (col + 1) * upp; let mn = Infinity, mx = -Infinity, first = NaN, last = NaN;
          for (; i <= i1 && xs[i] < ue; i++) { const val = y[i]; if (isNaN(val)) continue; if (isNaN(first)) first = val; last = val; if (val < mn) mn = val; if (val > mx) mx = val; }
          if (isNaN(first)) { pen = false; continue; }
          const px = g.ml + col + .5, Yv = q => Y((q - 128) / PXDIV);
          if (!pen) { ctx.moveTo(px, Yv(first)); pen = true; } else ctx.lineTo(px, Yv(first));
          ctx.lineTo(px, Yv(mn)); ctx.lineTo(px, Yv(mx)); ctx.lineTo(px, Yv(last));
        }
        ctx.stroke(); ctx.globalAlpha = 1; return;
      }
    }
    for (let i = 0; i < y.length; i++) {
      const val = y[i];
      const inSet = !mask || (want ? (mask[i] || (i > 0 && mask[i - 1]) || (i < y.length - 1 && mask[i + 1])) : !mask[i]);
      if (isNaN(val) || !inSet) { pen = false; continue; }
      const px = X((data.xs ? data.xs[c][i] : i) / PXDIV), py = Y((val - 128) / PXDIV);
      if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
    }
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  for (const c of [1, 0]) {
    if (!data.on[c]) continue;
    if (data.persist) data.persist.forEach((y, k) => trace(y[c], c, 0.05 + 0.25 * k / data.persist.length, 1));
    const fm = data.fill && data.fill[c];
    trace(data.y[c], c, 1, opts.compact ? 1.4 : 1.8, fm, false);
    if (fm) trace(data.y[c], c, 0.42, opts.compact ? 1.2 : 1.6, fm, true);
  }
  ctx.restore();
  const orange = cssVar('--orange');
  // trigger marker (position) & level
  if (data.trigX != null && !opts.compact) {
    const tx = X(data.trigX / PXDIV);
    ctx.fillStyle = orange; ctx.beginPath(); ctx.moveTo(tx - 6, 2); ctx.lineTo(tx + 6, 2); ctx.lineTo(tx, 12); ctx.fill();
    if (data.trigL != null && data.trigC != null) {
      const ty = Y((data.trigL - 128) / PXDIV);
      ctx.strokeStyle = orange; ctx.globalAlpha = data.trigManual ? .9 : .45; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(g.ml, ty); ctx.lineTo(g.ml + g.pw, ty); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(g.ml + g.pw + 10, ty - 6); ctx.lineTo(g.ml + g.pw + 10, ty + 6); ctx.lineTo(g.ml + g.pw + 2, ty); ctx.fill();
    }
  }
  // zero markers
  if (!opts.compact) for (const c of [0, 1]) {
    if (!data.on[c]) continue;
    const zy = Math.max(g.mt, Math.min(g.mt + g.ph, Y((data.v0[c] - 128) / PXDIV)));
    ctx.fillStyle = colors[c]; ctx.beginPath(); ctx.moveTo(4, zy - 8); ctx.lineTo(18, zy - 8); ctx.lineTo(25, zy); ctx.lineTo(18, zy + 8); ctx.lineTo(4, zy + 8); ctx.fill();
    ctx.fillStyle = '#0D1A20'; ctx.font = '600 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c + 1), 13, zy + .5);
  }
  if (!opts.compact) yAxisLabels(ctx, g, Y, [0, 1].filter(c => data.on[c]).map(c => ({ c, z: (data.v0[c] - 128) / PXDIV, vd: data.vdiv[c] })), colors, !!data.badge);
  // time axis labels
  if (!opts.compact) {
    ctx.fillStyle = '#86A9B3'; ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'top';
    const lstep = span > 14 ? nice125(span / 7) : span > 6 ? 2 : span > 3 ? 1 : 0.5;
    for (let d = Math.ceil(v.t0 / lstep) * lstep; d <= v.t1 + 1e-9; d += lstep) {
      const px = X(d); ctx.textAlign = px < g.ml + 20 ? 'left' : px > g.ml + g.pw - 20 ? 'right' : 'center';
      const ref = data.trigX != null ? data.trigX / PXDIV : 6;
      ctx.fillText(data.xfmt ? data.xfmt(d) : data.tdiv ? si((d - ref) * data.tdiv, 'с', 3) : (d - ref).toFixed(1), px, g.mt + g.ph + 6);
    }
  }
  // cursors
  if (v.cur !== 'off' && !opts.compact) {
    ctx.strokeStyle = '#E8F3F6'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.fillStyle = '#E8F3F6'; ctx.font = '600 11px Inter, sans-serif';
    if (v.cur === 't') for (const [k, d] of [['A', v.ta], ['B', v.tb]]) { const px = X(d); ctx.beginPath(); ctx.moveTo(px, g.mt); ctx.lineTo(px, g.mt + g.ph); ctx.stroke(); ctx.textAlign = 'left'; ctx.fillText(k, px + 4, g.mt + 4); }
    if (v.cur === 'v') for (const [k, d] of [['A', v.va], ['B', v.vb]]) { const py = Y(d); ctx.beginPath(); ctx.moveTo(g.ml, py); ctx.lineTo(g.ml + g.pw, py); ctx.stroke(); ctx.textAlign = 'right'; ctx.fillText(k, g.ml + g.pw - 4, py - 13); }
    ctx.setLineDash([]);
  }
  if (data.badge) { ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillStyle = data.badge[1]; ctx.fillText(data.badge[0], g.ml + g.pw - 8, g.mt + 8); }
  const hv = cv._hover;
  if (hv && !opts.compact && hv.x >= g.ml && hv.x <= g.ml + g.pw && hv.y >= g.mt && hv.y <= g.mt + g.ph) {
    const fi = g.toDiv(hv.x) * PXDIV;
    const idxOf = c => { if (!data.xs) return Math.max(0, Math.min(data.n - 1, Math.round(fi))); const xs = data.xs[c]; let lo = 0, hi = xs.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] < fi) lo = m; else hi = m; } return Math.abs(xs[lo] - fi) < Math.abs(xs[hi] - fi) ? lo : hi; };
    const posOf = (c, i) => data.xs ? data.xs[c][i] : i;
    let i = idxOf(0);
    const ref = data.trigX != null ? data.trigX : (data.n === N ? 150 : data.n / 2);
    const lines = [{ t: data.xfmt ? data.xfmt(fi / PXDIV, true) : 't = ' + (data.tdiv ? si((fi - ref) * data.tdiv / PXDIV, 'с', 4) : (fi - ref).toFixed(1)), c: '#E8F3F6' }];
    const dots = [];
    for (const c of [0, 1]) {
      if (!data.on[c]) continue; i = idxOf(c); const val = data.y[c][i];
      if (isNaN(val)) { lines.push({ t: `CH${c + 1}: —`, c: colors[c] }); continue; }
      const volts = (val - data.v0[c]) / PXDIV * (data.vdiv[c] || 1);
      lines.push({ t: `CH${c + 1}: ` + (data.vdiv[c] ? si(volts, UN(c), 4) : volts.toFixed(2) + ' дел'), c: colors[c] });
      dots.push([X(posOf(c, i) / PXDIV), Y((val - 128) / PXDIV), colors[c]]);
    }
    hoverBox(ctx, g, X(data.xs ? fi / PXDIV : i / PXDIV), hv, lines, dots);
  }
  return g;
}


// values of the horizontal grid lines, in each channel's own scale (V/div × sensor factor, zero offset):
// CH1 along the left edge, CH2 along the right edge, inside the grid
function yAxisLabels(ctx, g, Y, chans, colors, skipTopRight) {
  if (S.yLabels === false) return;
  ctx.font = '10px Inter, sans-serif';
  for (const { c, z, vd } of chans) {
    if (!vd) continue;
    const left = c === 0, x = left ? g.ml + 3 : g.ml + g.pw - 3; ctx.textAlign = left ? 'left' : 'right';
    for (let d = -4; d <= 4; d++) {
      if (!left && d === 4 && skipTopRight) continue;
      let v = (d - z) * vd; if (Math.abs(v) < vd * 1e-6) v = 0;
      const txt = si(v, UN(c), 3), w = ctx.measureText(txt).width, bottom = d === -4, y = Y(d) + (bottom ? -2 : 2);
      ctx.fillStyle = 'rgba(10,22,28,.6)'; ctx.fillRect(left ? x - 2 : x - w - 2, bottom ? y - 12 : y, w + 4, 12);
      ctx.textBaseline = bottom ? 'bottom' : 'top'; ctx.fillStyle = colors[c]; ctx.fillText(txt, x, y);
    }
  }
}
function hoverBox(ctx, g, x, hv, lines, dots) {
  ctx.strokeStyle = 'rgba(232,243,246,.55)'; ctx.lineWidth = 1; ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, g.mt); ctx.lineTo(Math.round(x) + .5, g.mt + g.ph); ctx.stroke();
  for (const [dx, dy, col] of dots || []) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(dx, dy, 4, 0, 7); ctx.fill(); ctx.strokeStyle = '#0D1A20'; ctx.lineWidth = 1.5; ctx.stroke(); }
  ctx.font = '600 12px Inter, sans-serif';
  const w = Math.max(...lines.map(l => ctx.measureText(l.t).width)) + 20, h = lines.length * 18 + 10;
  let bx = x + 14, by = Math.max(g.mt + 4, Math.min(g.mt + g.ph - h - 4, hv.y - h / 2));
  if (bx + w > g.ml + g.pw) bx = x - 14 - w;
  ctx.fillStyle = 'rgba(10,22,28,.93)'; ctx.strokeStyle = 'rgba(127,208,224,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bx, by, w, h, 7); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((l, k) => { ctx.fillStyle = l.c; ctx.fillText(l.t, bx + 10, by + 6 + k * 18); });
}
function hoverable(cv, redraw) {
  cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); cv._hover = { x: e.clientX - r.left, y: e.clientY - r.top }; redraw(); });
  cv.addEventListener('mouseleave', () => { cv._hover = null; redraw(); });
}

function cursorText(v, data) {
  if (!data || v.cur === 'off') return '';
  const cell = (k, val) => `<div><span>${k}</span><b>${val}</b></div>`;
  if (v.cur === 't') {
    const dt = (v.tb - v.ta) * (data.tdiv || 0);
    return cell('ΔT', data.tdiv ? fmtT(Math.abs(dt)) : (Math.abs(v.tb - v.ta)).toFixed(2) + ' дел') + cell('1/ΔT', data.tdiv && dt ? si(1 / Math.abs(dt), 'Гц', 4) : '—');
  }
  const ch = data.on[0] ? 0 : 1, vd = data.vdiv[ch], z = (data.v0[ch] - 128) / PXDIV;
  const va = (v.va - z) * (vd || 1), vb = (v.vb - z) * (vd || 1), u = vd ? (x => fmtC(ch, x)) : x => x.toFixed(2) + ' дел';
  return cell(`A (CH${ch + 1})`, u(va)) + cell('B', u(vb)) + cell('ΔV', u(Math.abs(va - vb))) + cell('', '');
}

function attachPlotMouse(cv, getData, onChange) {
  const pick = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('wheel', e => {
    const g = cv._g; if (!g) return; e.preventDefault();
    const v = getView(cv.id), p = pick(e), d = g.toDiv(p.x), k = e.deltaY > 0 ? 1.25 : 0.8;
    const dd = getData(), lo = dd && dd.range ? dd.range[0] : 0, hi = dd && dd.range ? dd.range[1] : 12;
    let t0 = d - (d - v.t0) * k, t1 = d + (v.t1 - d) * k;
    if (t1 - t0 >= hi - lo) { t0 = lo; t1 = hi; } if (t1 - t0 < 0.5) return;
    if (t0 < lo) { t1 += lo - t0; t0 = lo; } if (t1 > hi) { t0 -= t1 - hi; t1 = hi; }
    v.t0 = t0; v.t1 = t1; onChange();
  }, { passive: false });
  cv.addEventListener('dblclick', () => { const v = getView(cv.id), dd = getData(); v.t0 = dd && dd.range ? dd.range[0] : 0; v.t1 = dd && dd.range ? dd.range[1] : 12; onChange(); });
  cv.addEventListener('mousedown', e => {
    const g = cv._g, data = getData(); if (!g || !data) return;
    const v = getView(cv.id), p = pick(e);
    let best = null, bd = 10;
    const consider = (kind, dist) => { if (dist < bd) { bd = dist; best = kind; } };
    if (p.x < g.ml) for (const c of [0, 1]) if (data.on[c]) consider('z' + c, Math.abs(p.y - g.Y((data.v0[c] - 128) / PXDIV)));
    if (v.cur === 't') { consider('ta', Math.abs(p.x - g.X(v.ta))); consider('tb', Math.abs(p.x - g.X(v.tb))); }
    if (v.cur === 'v') { consider('va', Math.abs(p.y - g.Y(v.va))); consider('vb', Math.abs(p.y - g.Y(v.vb))); }
    if (data.trigX != null && data.draggableTrig) { if (p.y < g.mt + 4) consider('tp', Math.abs(p.x - g.X(data.trigX / PXDIV))); if (data.trigManual && data.trigL != null) consider('tl', Math.abs(p.y - g.Y((data.trigL - 128) / PXDIV)) + (p.x > g.ml + g.pw - 30 ? -3 : 2)); }
    if (!best) {
      if (!data.pannable) return;
      e.preventDefault(); const x0 = p.x, a0 = v.t0, b0 = v.t1, k = (b0 - a0) / g.pw, lo = data.range ? data.range[0] : 0, hi = data.range ? data.range[1] : 12; let moved = false;
      cv.style.cursor = 'grabbing';
      const mv = ev => { const dx = pick(ev).x - x0; if (Math.abs(dx) > 3) moved = true; let a = a0 - dx * k, b = b0 - dx * k; if (a < lo) { b += lo - a; a = lo; } if (b > hi) { a -= b - hi; b = hi; } v.t0 = a; v.t1 = b; onChange(); };
      const up = ev => { cv.style.cursor = ''; removeEventListener('mousemove', mv); removeEventListener('mouseup', up); if (!moved && data.onClickDiv) data.onClickDiv(g.toDiv(pick(ev).x)); onChange(true); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up); return;
    }
    v.drag = best; e.preventDefault();
    const mv = ev => {
      const q = pick(ev), dx = Math.max(data.range ? data.range[0] : 0, Math.min(data.range ? data.range[1] : 12, g.toDiv(q.x))), dy = Math.max(-4, Math.min(4, g.toDivY(q.y)));
      if (best === 'ta') v.ta = dx; else if (best === 'tb') v.tb = dx; else if (best === 'va') v.va = dy; else if (best === 'vb') v.vb = dy;
      else if (best[0] === 'z') data.onZero && data.onZero(+best[1], Math.round(dy * 4) / 4);
      else if (best === 'tp') data.onTrigPos && data.onTrigPos(Math.round(dx * PXDIV));
      else if (best === 'tl') data.onTrigLevel && data.onTrigLevel(128 + dy * PXDIV);
      onChange();
    };
    const up = () => { v.drag = null; removeEventListener('mousemove', mv); removeEventListener('mouseup', up); onChange(true); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
}

// ---------------- measurements ----------------
function measureY(y, v0, vdiv, tdiv, xs) {
  const vs = [], ts = [], clip = [];
  for (let i = 0; i < y.length; i++) if (!isNaN(y[i])) { const u = xs ? xs[i] : i; vs.push((y[i] - v0) / PXDIV * (vdiv || 1)); ts.push(tdiv ? u * tdiv / PXDIV : u); clip.push(y[i] <= 28.5 || y[i] >= 227.5 ? 1 : 0); }
  if (vs.length < 10) return null;
  const m = SCOPE.measure(ts, vs, clip);
  // frequency/period from the low-passed signal, so PWM carrier spikes don't turn 50 Hz into kHz
  const T = Float64Array.from(ts), fm = SCOPE.measure(ts, Array.from(lpf(T, Float64Array.from(vs))), clip);
  if (fm.freq) { m.freq = fm.freq; m.period = fm.period; } else if (m.freq && fm.pp > 0) { m.freq = null; m.period = null; }
  return m;
}
function risingX(y) {
  let mn = Infinity, mx = -Infinity; for (const v of y) if (!isNaN(v)) { if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!(mx - mn > 4)) return [];
  const L = (mx + mn) / 2, h = (mx - mn) * 0.1, xs = []; let armed = false;
  for (let i = 1; i < y.length; i++) { const a = y[i - 1], b = y[i]; if (isNaN(a) || isNaN(b)) { armed = false; continue; } if (b < L - h) armed = true; if (armed && a < L && b >= L) { xs.push(i - 1 + (L - a) / (b - a)); armed = false; } }
  return xs;
}
function phaseShift(data) {
  if (!data || !data.on[0] || !data.on[1]) return null;
  const map = (c, arr) => data.xs ? arr.map(x => { const xs = data.xs[c], i = Math.min(xs.length - 2, Math.floor(x)); return xs[i] + (xs[i + 1] - xs[i]) * (x - i); }) : arr;
  const a = map(0, risingX(data.y[0])), b = map(1, risingX(data.y[1]));
  if (a.length < 2 || !b.length) return null;
  const P = (a[a.length - 1] - a[0]) / (a.length - 1);
  let best = null; for (const x of a) for (const y of b) { const d = y - x; if (best == null || Math.abs(d) < Math.abs(best)) best = d; }
  let deg = best / P * 360; deg = ((deg % 360) + 540) % 360 - 180;
  return { deg, dt: data.tdiv ? deg / 360 * P * data.tdiv / PXDIV : null };
}
function measHTML(data) {
  const ph = phaseShift(data);
  return [0, 1].map(c => {
    const on = data && data.on[c];
    const m = on ? measureY(data.y[c], data.v0[c], data.vdiv[c], data.tdiv, data.xs && data.xs[c]) : null;
    const vd = data && data.vdiv[c], V = x => vd ? fmtC(c, x) : (x == null ? '—' : x.toFixed(2) + ' дел');
    const cell = (k, val) => `<div class="m"><span>${k}</span><b>${val}</b></div>`;
    const head = `<div class="mh"><i class="sq c${c + 1}"></i>${chName(c)}${data && vd ? ' · ' + vdivNameC(c, vd) : ''}${m && m.clipped ? ' · <span style="color:var(--warn)">выход за экран</span>' : ''}${on ? '' : ' · выкл'}</div>`;
    // the set of cells is fixed (values become «—» when they can't be computed): a jittery signal must not make the block jump
    const D = '—', q = m || {};
    const phase = c === 1 ? cell('Сдвиг к CH1', ph ? (ph.deg >= 0 ? '+' : '−') + Math.abs(ph.deg).toFixed(1).replace('.', ',') + '°' : D) + cell('', ph ? (ph.deg >= 0 ? 'отстаёт' : 'опережает') : '') + cell('Задержка', ph && ph.dt != null ? si(Math.abs(ph.dt), 'с', 3) : D) : '';
    return `<div class="mcol">${head}${cell('Размах', m ? V(q.pp) : D)}${cell('Частота', q.freq ? si(q.freq, 'Гц', 4) : D)}${cell('Среднее', m ? V(q.avg) : D)}${cell('СКЗ', m ? V(q.rms) : D)}${cell('Макс', m ? V(q.max) : D)}${cell('Мин', m ? V(q.min) : D)}${cell('Период', q.period ? fmtT(q.period) : D)}${cell('Скважн.', q.duty ? q.duty.toFixed(1).replace('.', ',') + ' %' : D)}${phase}</div>`;
  }).join('');
}

// ---------------- LIVE view ----------------
let needDraw = true;
function liveData() {
  if (!proc) return null;
  const fr = proc.fr;
  const on = [0, 1].map(c => !!(fr.mask & (1 << c)) && !!S.show[c]);
  return {
    n: N, y: proc.y, fill: proc.fill, persist: S.persist ? persistBuf : null, on, v0: [zeroRaw(0), zeroRaw(1)], vdiv: fr.vdiv, tdiv: fr.tdiv,
    trigX: proc.stOn ? S.st.pos : devTrigX(), trigL: proc.stOn && proc.trig ? proc.trig.L : null, trigC: trigSrc, trigManual: S.st.lvl === 'man', draggableTrig: !!proc.stOn,
    badge: frozen ? ['ПАУЗА', cssVar('--orange')] : (S.st.on && proc.fr.tdiv < 0.1 ? (proc.stOn ? ['● СТАБ', '#3FCB8E'] : ['○ НЕТ СИНХР.', '#E3A33B']) : null),
    onZero: (c, d) => { S.zero[c] = d; if (S.zeroDev) { S.zeroDev = false; segSet('zeroMode', 'man'); toast('Нуль переключён на ручной'); } resetProc(); if (cur && !frozen) process(cur); saveSettings(); },
    onTrigPos: x => { S.st.pos = Math.max(10, Math.min(290, x)); $('stPos').value = S.st.pos; resetProc(); if (cur && !frozen) process(cur); saveSettings(); },
    onTrigLevel: l => { S.st.level = Math.max(28, Math.min(228, l)); resetProc(); if (cur && !frozen) process(cur); saveSettings(); },
  };
}
function drawLive() {
  const data = liveData();
  if (view === 'scope' && liveKind === 'tape') { drawTapeView(); }
  else if (view === 'scope' && liveKind === 'spec') { drawSpecView(); }
  else if (view === 'scope' && liveKind === 'deep') { drawDeepView(); }
  else if (view === 'scope') {
    const cv = $('livePlot'); cv._g = drawScope(cv, data);
    const fr = cur;
    $('liveChips').innerHTML = fr ? [
      `<span class="chip">Развёртка <b>${fr.tdiv ? tdivName(fr.tdiv) : '?'}</b></span>`,
      fr.mask & 1 ? `<span class="chip c1">CH1 <b>${fr.vdiv[0] ? vdivNameC(0, fr.vdiv[0]) : '?'}</b></span>` : '',
      fr.mask & 2 ? `<span class="chip c2">CH2 <b>${fr.vdiv[1] ? vdivNameC(1, fr.vdiv[1]) : '?'}</b></span>` : '',
      frozen ? '<span class="chip st">пауза</span>' : '',
      !frozen && performance.now() - lastTraceChange > 1500 && performance.now() - lastFrameAt < 1500 ? '<span class="chip st" title="Прибор присылает кадры, но картинка не меняется — скорее всего на приборе нажат STOP или идёт ожидание запуска">STOP / ждёт запуска</span>' : '',
    ].join('') : '';
    $('liveMeas').innerHTML = measHTML(data);
    $('stInfo').textContent = stInfo.text || '—'; $('stInfo').className = 'stinfo' + (stInfo.ok === true ? ' ok' : stInfo.ok === false ? ' warn' : '');
    $('curOut').innerHTML = cursorText(getView('livePlot'), data);
    if (fr && document.activeElement !== $('tbSel')) $('tbSel').value = fr.tIdx;
  }
  if (view === 'pad') {
    const cv = $('padPlot'); drawScope(cv, data, { compact: true });
    $('padInfo').textContent = cur ? `${cur.tdiv ? tdivName(cur.tdiv) : ''}   CH1 ${cur.vdiv[0] ? vdivNameC(0, cur.vdiv[0]) : ''}   CH2 ${cur.vdiv[1] ? vdivNameC(1, cur.vdiv[1]) : ''}` : 'нет данных';
    $('scanInfo').textContent = 'частота опроса кнопок: ' + (scanRate ? Math.round(scanRate) + ' раз/с — короткое ≈ ' + Math.round(S.holdShort / scanRate * 1000) + ' мс, длинное ≈ ' + (S.holdLong / scanRate).toFixed(1).replace('.', ',') + ' с' : '—');
  }
  if (view === 'diag') renderDiag();
  if (view === 'sync') drawSync(); else if (view === 'power') drawPower(); else if (view === 'start') drawStart(); else if (view === 'pwm') drawPwm(); else if (view === 'rpm') drawRpm(); else if (view === 'rec') drawRec(); else if (view === 'an') drawAn();
}
attachPlotMouse($('livePlot'), liveData, () => { needDraw = true; });
['livePlot', 'tapePlot', 'specPlot', 'deepPlot'].forEach(id => hoverable($(id), () => { needDraw = true; }));
attachPlotMouse($('deepPlot'), deepData, () => { const v = getView('deepPlot'), r = deep.lastRange; deep.full = !r || v.t1 - v.t0 >= r[1] - r[0] - 0.05; needDraw = true; });
function loop() { if (needDraw && mode === 'live') { needDraw = false; drawLive(); } requestAnimationFrame(loop); }
setInterval(() => { if (mode === 'live') needDraw = true; }, 250);

// live controls
$('stOn').onchange = e => { S.st.on = e.target.checked; resetProc(); saveSettings(); if (cur && !frozen) process(cur); needDraw = true; };
segInit('stSrc', v => { S.st.src = v === 'a' ? 'a' : +v; resetProc(); saveSettings(); });
segInit('stEdge', v => { S.st.edge = +v; resetProc(); saveSettings(); });
segInit('stLvl', v => { S.st.lvl = v; if (v === 'man' && proc && proc.trig && proc.trig.L != null) S.st.level = proc.trig.L; resetProc(); saveSettings(); toast(v === 'man' ? 'Уровень перетаскивается оранжевой линией на графике' : 'Уровень — середина размаха сигнала'); });
$('stPos').oninput = e => { S.st.pos = +e.target.value; resetProc(); saveSettings(); };
$('avgN').onchange = e => { S.avg = +e.target.value; resetProc(); saveSettings(); };
$('fill').onchange = e => { S.fill = e.target.checked; resetProc(); saveSettings(); };
$('smooth').onchange = e => { S.smooth = +e.target.value; resetProc(); saveSettings(); };
$('persist').onchange = e => { S.persist = e.target.checked; resetProc(); saveSettings(); };
segInit('chShow', (v, b) => { S.show[+v] = b.classList.contains('on') ? 1 : 0; saveSettings(); needDraw = true; }, true);
segInit('zeroMode', v => { S.zeroDev = v === 'dev'; resetProc(); TAPE.T.prev = null; saveSettings(); needDraw = true; });
segInit('curMode', v => { getView('livePlot').cur = v; needDraw = true; });
function toggleFreeze() {
  if (liveKind === 'tape') { const L = TAPE.T.len; tv.end = tv.end == null ? Math.max(Math.min(tv.span, L), L) : null; needDraw = true; return; } frozen = !frozen; $('bFreeze').classList.toggle('on', frozen); $('bFreeze').lastChild.textContent = frozen ? 'Продолжить' : 'Пауза'; if (!frozen) resetProc(); needDraw = true; }
$('bFreeze').onclick = toggleFreeze;
addEventListener('keydown', e => { if (e.code === 'Space' && mode === 'live' && view === 'scope' && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); toggleFreeze(); } });
function canvasPNG(cv) { const d = atob(cv.toDataURL('image/png').split(',')[1]); const u = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) u[i] = d.charCodeAt(i); return u; }
$('bShot').onclick = () => { if (liveKind === 'deep') { if (!deep.buf[0] && !deep.buf[1]) return toast('Нет полной записи'); return saveOut(`PUF_full_${stamp()}.png`, canvasPNG($('deepPlot'))); } if (liveKind === 'spec') return saveOut(`PUF_spectrum_${stamp()}.png`, canvasPNG($('specPlot'))); if (liveKind === 'tape') return saveOut(`PUF_tape_${stamp()}.png`, canvasPNG($('tapePlot'))); if (!proc) return toast('Нет данных'); saveOut(`PUF_${stamp()}.png`, canvasPNG($('livePlot'))); };
function csvFrames(list, processed) {
  const lines = [`﻿кадр;время, с;CH1, ${UN(0)};CH2, ${UN(1)};развёртка, с/дел;CH1 ${UN(0)}/дел;CH2 ${UN(1)}/дел;от начала, с`];
  list.forEach((fr, k) => {
    const y = processed || fr.raw;
    for (let i = 0; i < N; i++) {
      const t = fr.tdiv ? (i - (processed && proc && proc.stOn ? S.st.pos : 150)) * fr.tdiv / PXDIV : i;
      const v = c => (fr.mask & (1 << c)) && !isNaN(y[c][i]) ? num((y[c][i] - zeroRaw(c)) / PXDIV * (fr.vdiv[c] || 1)) : '';
      lines.push([k, num(t), v(0), v(1), i ? '' : num(fr.tdiv), i ? '' : num(fr.vdiv[0]), i ? '' : num(fr.vdiv[1]), i ? '' : num((fr.t - list[0].t) / 1000, 6)].join(';'));
    }
  });
  return utf8(lines.join('\r\n'));
}
$('bCsv').onclick = () => {
  if (liveKind === 'spec') { const sp = specCache; if (!sp) return toast('Нет спектра'); const L = ['\ufeffчастота, Гц;СКЗ, В']; for (let k = 1; k <= sp.K; k++) L.push(num(k * sp.df) + ';' + num(sp.amp[k])); L.push('', 'гармоника;частота, Гц;СКЗ, В;% от 1-й'); sp.h.forEach(q => L.push([q.n, num(q.f), num(q.a), num(q.a / sp.h[0].a * 100, 4)].join(';'))); return saveOut(`PUF_spectrum_${stamp()}.csv`, utf8(L.join('\r\n'))); }
  if (liveKind === 'tape') { if (!TAPE.T.len) return toast('Лента пуста'); return saveOut(`PUF_tape_${stamp()}.csv`, tapeCSV()); }
  if (liveKind === 'deep') { const u = deepCSV(); if (!u) return toast('Нет полной записи'); return saveOut(`PUF_full_${stamp()}.csv`, u); }
  if (!proc) return toast('Нет данных'); saveOut(`PUF_${stamp()}.csv`, csvFrames([proc.fr], proc.y)); };
let recording = null;
$('bRec').onclick = () => {
  if (!recording) { if (!cur) return toast('Нет данных'); recording = []; $('bRec').classList.add('on'); $('bRec').lastChild.textContent = 'Стоп (0)'; return; }
  const list = recording; recording = null; $('bRec').classList.remove('on'); $('bRec').lastChild.textContent = 'Запись';
  if (list.length) saveOut(`PUF_rec_${stamp()}.csv`, csvFrames(list));
};


// ---------------- LIVE: tape (long history) ----------------
let liveKind = 'screen';
const tv = { span: 3 * N, end: null, drag: null };      // end: null = follow "now"
TAPE.onDrop = d => { if (tv.end != null) tv.end = Math.max(Math.min(tv.span, TAPE.T.len), tv.end - d); };
segInit('liveKind', v => {
  liveKind = v; const tape = v === 'tape', spec = v === 'spec';
  $('livePlot').style.visibility = v === 'screen' ? 'visible' : 'hidden'; $('deepPlot').style.visibility = v === 'deep' ? 'visible' : 'hidden'; $('tapePlot').style.visibility = tape ? 'visible' : 'hidden'; $('specPlot').style.visibility = spec ? 'visible' : 'hidden';
  $('bNow').hidden = $('bTapeClr').hidden = !tape; $('bRec').hidden = v !== 'screen'; $('specCh').hidden = $('specScale').hidden = !spec; $('liveChips').hidden = spec;
  $('bCsv').title = tape ? 'Сохранить видимую часть ленты в CSV' : 'Сохранить текущий кадр CSV';
  needDraw = true;
});
$('bNow').onclick = () => { tv.end = null; needDraw = true; };
$('bTapeClr').onclick = () => { TAPE.clear(); tv.end = null; tv.span = 3 * N; needDraw = true; };
function tapeRange() {
  const L = TAPE.T.len; const span = Math.max(50, Math.min(tv.span, Math.max(L, 50)));
  const b = tv.end == null ? L : Math.max(Math.min(span, L), Math.min(tv.end, L));
  return { a: b - span, b, span, L };
}
const durText = s => s >= 3600 ? Math.floor(s / 3600) + ' ч ' + Math.floor(s % 3600 / 60) + ' мин' : s >= 60 ? Math.floor(s / 60) + ' мин ' + Math.floor(s % 60) + ' с' : si(s, 'с', 3);
function drawTapeView() {
  const cv = $('tapePlot'), g = geom(cv); if (!g) return;
  const ctx = cv.getContext('2d'), T = TAPE.T; ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.fillStyle = cssVar('--scr'); ctx.fillRect(0, 0, g.W, g.H);
  const R = tapeRange(), spp = R.span / g.pw;
  const X = i => g.ml + (i - R.a) / R.span * g.pw, Y = d => g.mt + (4 - d) / 8 * g.ph;
  cv._tg = { g, R, X };
  // grid: 12 vertical divisions over the window
  ctx.lineWidth = 1;
  for (let k = 0; k <= 12; k++) { const x = Math.round(g.ml + k / 12 * g.pw) + .5; ctx.strokeStyle = k === 12 ? 'rgba(243,95,39,.55)' : cssVar('--grid2'); ctx.beginPath(); ctx.moveTo(x, g.mt); ctx.lineTo(x, g.mt + g.ph); ctx.stroke(); }
  for (let d = -4; d <= 4; d++) { ctx.strokeStyle = d ? cssVar('--grid2') : 'rgba(160,210,220,.45)'; ctx.beginPath(); ctx.moveTo(g.ml, Math.round(Y(d)) + .5); ctx.lineTo(g.ml + g.pw, Math.round(Y(d)) + .5); ctx.stroke(); }
  const colors = [cssVar('--ch1'), cssVar('--ch2')];
  const lo = Math.max(0, Math.floor(R.a)), hi = Math.min(T.len, Math.ceil(R.b));
  // gap separators (only if they are not too dense)
  let gaps = 0; for (let i = lo; i < hi; i++) if (T.gap[i]) gaps++;
  if (gaps && g.pw / gaps >= 10) {
    ctx.strokeStyle = 'rgba(243,95,39,.35)'; ctx.setLineDash([3, 4]);
    for (let i = lo; i < hi; i++) if (T.gap[i] && i > 0) { const x = Math.round(X(i)) + .5; ctx.beginPath(); ctx.moveTo(x, g.mt); ctx.lineTo(x, g.mt + g.ph); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(g.ml, g.mt, g.pw, g.ph); ctx.clip();
  for (const c of [1, 0]) {
    if (!S.show[c]) continue;
    const vd = (cur && cur.vdiv[c]) || 1, z = zeroDiv(c), V = T.v[c];
    const yd = v => Y(v / vd + z);
    ctx.strokeStyle = colors[c]; ctx.lineWidth = spp > 2 ? 1.2 : 1.7; ctx.lineJoin = 'round'; ctx.beginPath();
    let pen = false;
    if (spp <= 2) {
      for (let i = lo; i < hi; i++) { const v = V[i]; if (isNaN(v) || (T.gap[i] && spp < 1)) { pen = false; if (isNaN(v)) continue; } const x = X(i), y = yd(v); if (!pen) { ctx.moveTo(x, y); pen = true; } else ctx.lineTo(x, y); }
    } else {
      for (let col = 0; col < g.pw; col++) {
        const i0 = Math.max(lo, Math.floor(R.a + col * spp)), i1 = Math.min(hi, Math.floor(R.a + (col + 1) * spp));
        let mn = Infinity, mx = -Infinity, first = NaN, last = NaN;
        for (let i = i0; i < i1; i++) { const v = V[i]; if (isNaN(v)) continue; if (isNaN(first)) first = v; last = v; if (v < mn) mn = v; if (v > mx) mx = v; }
        if (isNaN(first)) { pen = false; continue; }
        const x = g.ml + col + .5;
        if (!pen) { ctx.moveTo(x, yd(first)); pen = true; } else ctx.lineTo(x, yd(first));
        ctx.lineTo(x, yd(mn)); ctx.lineTo(x, yd(mx)); ctx.lineTo(x, yd(last));
      }
    }
    ctx.stroke();
  }
  ctx.restore();
  // zero markers
  for (const c of [0, 1]) { if (!S.show[c]) continue; const zy = Math.max(g.mt, Math.min(g.mt + g.ph, Y(zeroDiv(c)))); ctx.fillStyle = colors[c]; ctx.beginPath(); ctx.moveTo(4, zy - 8); ctx.lineTo(18, zy - 8); ctx.lineTo(25, zy); ctx.lineTo(18, zy + 8); ctx.lineTo(4, zy + 8); ctx.fill(); ctx.fillStyle = '#0D1A20'; ctx.font = '600 10px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c + 1), 13, zy + .5); }
  yAxisLabels(ctx, g, Y, [0, 1].filter(c => S.show[c] && cur && cur.vdiv[c]).map(c => ({ c, z: zeroDiv(c), vd: cur.vdiv[c] })), colors, true);
  // time labels relative to the newest sample
  const tNow = T.len ? T.t[T.len - 1] : 0;
  ctx.fillStyle = '#86A9B3'; ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'top';
  for (let k = 0; k <= 12; k += 2) {
    const i = Math.min(T.len - 1, Math.round(R.a + k / 12 * R.span)); const x = g.ml + k / 12 * g.pw;
    ctx.textAlign = k === 0 ? 'left' : k === 12 ? 'right' : 'center';
    const txt = i >= 0 && i < T.len ? (Math.abs(T.t[i] - tNow) < 1e-9 ? '0' : '−' + si(tNow - T.t[i], 'с', 3)) : '';
    ctx.fillText(txt, x, g.mt + g.ph + 6);
  }
  ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
  if (!T.len) { ctx.fillStyle = '#8FB4BF'; ctx.textAlign = 'center'; ctx.fillText('лента пуста — данные начнут копиться, как только придут кадры', g.ml + g.pw / 2, g.mt + g.ph / 2 - 8); }
  else if (tv.end != null) { ctx.fillStyle = cssVar('--orange'); ctx.fillText('ИСТОРИЯ  ▸ «Сейчас» — вернуться', g.ml + g.pw - 8, g.mt + 8); }
  else { ctx.fillStyle = '#3FCB8E'; ctx.fillText('● ЗАПИСЬ', g.ml + g.pw - 8, g.mt + 8); }
  const hv = cv._hover;
  if (hv && T.len && hv.x >= g.ml && hv.x <= g.ml + g.pw && hv.y >= g.mt && hv.y <= g.mt + g.ph) {
    const i = Math.max(0, Math.min(T.len - 1, Math.round(R.a + (hv.x - g.ml) / g.pw * R.span)));
    const lines = [{ t: (Math.abs(T.t[i] - tNow) < 1e-9 ? 'сейчас' : '−' + si(tNow - T.t[i], 'с', 4)) + '  ·  ' + new Date(T.t[i] * 1000).toLocaleTimeString('ru-RU'), c: '#E8F3F6' }], dots = [];
    for (const c of [0, 1]) { if (!S.show[c]) continue; const v = T.v[c][i]; if (isNaN(v)) continue; const vd = (cur && cur.vdiv[c]) || 1; lines.push({ t: `CH${c + 1}: ` + (cur && cur.vdiv[c] ? si(v, UN(c), 4) : v.toFixed(2) + ' дел'), c: colors[c] }); dots.push([X(i), Y(v / vd + zeroDiv(c)), colors[c]]); }
    hoverBox(ctx, g, X(i), hv, lines, dots);
  }
  // chips
  const dur = T.len ? T.t[T.len - 1] - T.t[0] : 0, wdur = hi > lo ? T.t[hi - 1] - T.t[lo] : 0;
  const roll = TAPE.T.lastMode === 'roll';
  $('liveChips').innerHTML = [
    `<span class="chip" title="${T.len.toLocaleString('ru-RU')} точек в памяти">Окно <b>${wdur > 0 ? durText(wdur) : '—'}</b> из ${durText(dur)}</span>`,
    `<span class="chip ${roll ? 'ok' : ''}" title="${roll ? 'кадры сшиты в непрерывную запись' : 'на быстрой развёртке кадры не стыкуются — между ними пропуски (оранжевые пунктиры)'}">${roll ? 'самописец' : 'кадры'}</span>`,
  ].join('');
  // measurements over the visible window
  $('liveMeas').innerHTML = [0, 1].map(c => {
    const cell = (k, val) => `<div class="m"><span>${k}</span><b>${val}</b></div>`;
    const head = `<div class="mh"><i class="sq c${c + 1}"></i>CH${c + 1} · видимая часть</div>`;
    let mn = Infinity, mx = -Infinity, sum = 0, s2 = 0, n = 0, gap = false;
    for (let i = lo; i < hi; i++) { const v = T.v[c][i]; if (T.gap[i] && i > lo) gap = true; if (isNaN(v)) continue; n++; sum += v; s2 += v * v; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (!n) return `<div class="mcol">${head}${['Размах','Частота','Среднее','СКЗ'].map(k => cell(k, '—')).join('')}</div>`;
    let freq = null;
    if (!gap && n >= 20 && n <= 200000) { const vs = [], ts = [], cl = []; for (let i = lo; i < hi; i++) if (!isNaN(T.v[c][i])) { vs.push(T.v[c][i]); ts.push(T.t[i]); cl.push(0); } freq = SCOPE.measure(ts, vs, cl).freq; }
    const V = x => cur && cur.vdiv[c] ? fmtC(c, x) : x.toFixed(2) + ' дел';
    return `<div class="mcol">${head}${cell('Размах', V(mx - mn))}${cell('Частота', freq ? si(freq, 'Гц', 4) : '—')}${cell('Среднее', V(sum / n))}${cell('СКЗ', V(Math.sqrt(s2 / n)))}${cell('Макс', V(mx))}${cell('Мин', V(mn))}${cell('Точек', n.toLocaleString('ru-RU'))}${cell('Длительность', wdur > 0 ? durText(wdur) : '—')}</div>`;
  }).join('');
}
(() => {
  const cv = $('tapePlot');
  const pos = e => { const r = cv.getBoundingClientRect(); return e.clientX - r.left; };
  cv.addEventListener('wheel', e => {
    const tg = cv._tg; if (!tg) return; e.preventDefault();
    const { g, R } = tg, L = TAPE.T.len, k = e.deltaY > 0 ? 1.3 : 1 / 1.3;
    const ns = Math.max(50, Math.min(Math.max(L, 3 * N), R.span * k));
    if (tv.end == null) { tv.span = ns; }                        // following: the right edge stays at "now"
    else { const m = R.a + (pos(e) - g.ml) / g.pw * R.span, f = (m - R.a) / R.span; let a = m - f * ns, b = a + ns; if (b >= L) { tv.end = null; } else tv.end = Math.max(ns, b); tv.span = ns; }
    needDraw = true;
  }, { passive: false });
  cv.addEventListener('mousedown', e => {
    const tg = cv._tg; if (!tg) return; e.preventDefault();
    const x0 = pos(e), b0 = tg.R.b, spx = tg.R.span / tg.g.pw;
    cv.style.cursor = 'grabbing';
    const mv = ev => { const L = TAPE.T.len; let b = b0 - (pos(ev) - x0) * spx; if (b >= L) tv.end = null; else tv.end = Math.max(Math.min(tv.span, L), b); needDraw = true; };
    const up = () => { cv.style.cursor = ''; removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  cv.addEventListener('dblclick', () => { tv.end = null; tv.span = 3 * N; needDraw = true; });
  cv.style.cursor = 'grab';
})();
// full capture memory (1024 points) → CSV; CH2 is resampled onto the CH1 time grid if their strides differ
function deepCSV() {
  const d = deepData(); if (!d || d.empty) return null;
  const ref = d.on[0] ? 0 : 1, xs = d.xs[ref], tr = d.trigX;
  const at = (c, u) => { const x = d.xs[c], y = d.y[c]; if (!(u >= x[1] && u <= x[DEEP_N - 1])) return NaN; let lo = 1, hi = DEEP_N - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] < u) lo = m; else hi = m; } const f = (u - x[lo]) / ((x[hi] - x[lo]) || 1); return y[lo] + (y[hi] - y[lo]) * f; };
  const L = [`\ufeffвремя, с;CH1, ${UN(0)};CH2, ${UN(1)}`];
  for (let i = 1; i < DEEP_N; i++) {
    const u = xs[i], t = d.tdiv ? (u - tr) * d.tdiv / PXDIV : u;
    const v = c => { if (!d.on[c]) return ''; const r = c === ref ? d.y[c][i] : at(c, u); return isNaN(r) ? '' : num((r - d.v0[c]) / PXDIV * (d.vdiv[c] || 1)); };
    L.push([num(t, 9), v(0), v(1)].join(';'));
  }
  return utf8(L.join('\r\n'));
}
function tapeCSV() {
  const T = TAPE.T, R = tapeRange(), lo = Math.max(0, Math.floor(R.a)), hi = Math.min(T.len, Math.ceil(R.b));
  const lines = [`﻿время от начала, с;CH1, ${UN(0)};CH2, ${UN(1)};разрыв`];
  const t0 = T.t[lo];
  for (let i = lo; i < hi; i++) lines.push([num(T.t[i] - t0, 9), num(T.v[0][i]), num(T.v[1][i]), T.gap[i] ? '1' : ''].join(';'));
  return utf8(lines.join('\r\n'));
}



// ---------------- LIVE: full capture memory (firmware v3+) ----------------
const DEEP_A = 0x200006A8, DEEP_B = 0x20000AA8, DEEP_N = 1024;
const deep = { buf: [null, null], cal: [null, null], t: 0, waiting: 0, next: 0, view: null };
function deepWanted() { return mode === 'live' && ((view === 'scope' && (liveKind === 'deep' || liveKind === 'spec')) || ['sync', 'power', 'pwm', 'rpm', 'an'].includes(view)) && cur && cur.ver >= 3 && performance.now() - lastFrameAt < 2000; }
let memQueued = null, memSent = 0;   // manual reads (diagnostics) share the single firmware read slot with the deep reader
function deepTick() {
  const now = performance.now();
  if (memQueued && !(deep.waiting && now - deep.waiting < 600)) { const c = memQueued; memQueued = null; memSent = now; send(c); return; }
  if (!deepWanted() || (frozen && view === 'scope')) return;   // «Пауза» also stops the full record and the spectrum
  if (deep.waiting && now - deep.waiting < 600) return;
  if (memSent && now - memSent < 600) return;
  if (now < deep.next) return;
  deep.waiting = now;
  const a = cur.ver >= 4 ? DEEP_A : (deep.ask === DEEP_A ? DEEP_B : DEEP_A), n = cur.ver >= 4 ? 2 * DEEP_N : DEEP_N;
  deep.ask = a;
  send([0xA5, 0x4D, a & 255, (a >>> 8) & 255, (a >>> 16) & 255, (a >>> 24) & 255, n & 255, n >> 8]);
}
setInterval(deepTick, 40); window._deep = deep;
function onDeepMem(a, data) {
  deep.waiting = 0; deep.next = performance.now() + 60;
  if (a === DEEP_A && data.length >= 2 * DEEP_N) { deep.buf[0] = data.slice(0, DEEP_N); deep.buf[1] = data.slice(DEEP_N, 2 * DEEP_N); deepCal(0); deepCal(1); }
  else if (a === DEEP_A) { deep.buf[0] = data.slice(0, DEEP_N); deepCal(0); }
  else { deep.buf[1] = data.slice(0, DEEP_N); deepCal(1); }
  deep.t = performance.now(); needDraw = true;
}
// find how the 301-point screen trace sits inside the 1024-point buffer: screen[i] ≈ a*buf[o + s*i] + b
function deepMatch(buf, scr, sList, oHint) {
  const n = scr.length; let sm = 0, s2 = 0; for (const v of scr) { sm += v; s2 += v * v; }
  const my = sm / n, vy = s2 - n * my * my; if (vy < n * 4) return null;      // flat screen — nothing to match
  let best = null;
  const at = (x) => { const i = Math.floor(x), f = x - i; return i >= DEEP_N - 1 ? buf[DEEP_N - 1] : buf[i] + (buf[i + 1] - buf[i]) * f; };
  for (const s of sList) {
    const span = (n - 1) * s; if (span > DEEP_N - 2) continue;
    let o0 = 1, o1 = Math.floor(DEEP_N - 1 - span);
    if (oHint != null) { o0 = Math.max(1, Math.floor(oHint - 24)); o1 = Math.min(o1, Math.ceil(oHint + 24)); }
    for (let o = o0; o <= o1; o++) {
      let sx = 0, sxx = 0, sxy = 0;
      for (let i = 0; i < n; i++) { const x = at(o + i * s); sx += x; sxx += x * x; sxy += x * scr[i]; }
      const vx = sxx - sx * sx / n; if (vx <= 1e-9) continue;
      const cov = sxy - sx * sm / n, r = cov / Math.sqrt(vx * vy);
      if (!best || r > best.r) { const a = cov / vx; best = { s, o, r, a, b: (sm - a * sx) / n }; }
    }
  }
  return best;
}
const DEEP_S = [1, 2, 2.5, 3, 1024 / 301, 1.5, 1.25, 0.5, 0.4, 0.25, 0.2, 0.1];
function deepCal(c) {
  const buf = deep.buf[c]; if (!buf || !cur) return;
  const prev = deep.cal[c], scr = cur.raw[c];
  let m = null;
  if (prev && prev.tIdx === cur.tIdx) m = deepMatch(buf, scr, [prev.s], null);
  if (!m || m.r < 0.9) {
    const full = deepMatch(buf, scr, DEEP_S, null);
    if (full && full.r > 0.9) {   // refine the stride
      const ss = []; for (let k = -12; k <= 12; k++) ss.push(full.s * (1 + k * 0.005));
      m = deepMatch(buf, scr, ss, full.o) || full;
    } else if (!m || (full && full.r > m.r)) m = full;
  }
  if (m && m.r >= 0.85) {   // the real ratio is almost certainly a "round" one — snap to it when close
    const NICE = [0.1, 0.2, 0.25, 0.4, 0.5, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 1024 / 301];
    const nn = NICE.find(q => Math.abs(m.s / q - 1) < 0.012);
    if (nn && nn !== m.s) { const m2 = deepMatch(buf, scr, [nn], m.o); if (m2 && m2.r >= m.r - 0.002) m = m2; }
    deep.cal[c] = Object.assign(m, { tIdx: cur.tIdx, at: performance.now() });
  }
  else if (prev && prev.tIdx !== cur.tIdx) deep.cal[c] = null;
  deep.matchR = deep.matchR || [null, null]; deep.matchR[c] = m ? m.r : null;
}
function deepData() {
  const fr = cur; if (!fr) return null;
  const on = [0, 1].map(c => !!(fr.mask & (1 << c)) && !!S.show[c] && !!deep.buf[c] && !!deep.cal[c]);
  if (!on[0] && !on[1]) return { empty: true };
  const y = [0, 1].map(c => { const cal = deep.cal[c], b = deep.buf[c]; const o = new Float32Array(DEEP_N).fill(NaN); if (!cal || !b) return o; for (let i = 1; i < DEEP_N; i++) o[i] = cal.a * b[i] + cal.b; o[0] = o[1]; const sm = +S.smooth || 0; return sm === 1 ? smooth3(o) : sm > 1 ? boxcar(o, sm === 2 ? 9 : 25) : o; });
  // stabilisation on the long record, in screen-sample units u
  const srcC = S.st.src === 'a' ? (on[trigSrc] ? trigSrc : (on[0] ? 0 : 1)) : (on[S.st.src] ? S.st.src : (on[0] ? 0 : 1));
  const cs = deep.cal[srcC];
  let shiftU = 0, stOn = false;
  if (S.st.on && fr.tdiv < 0.1 && cs) {
    const u = new Float32Array(DEEP_N); for (let i = 0; i < DEEP_N; i++) u[i] = y[srcC][i];
    const pos = cs.o + S.st.pos * cs.s;
    const r = findTrigger(u.subarray(1), S.st.edge, S.st.lvl === 'auto' ? null : S.st.level, pos - 1);
    if (r.x != null) { shiftU = S.st.pos - (r.x + 1 - cs.o) / cs.s; stOn = true; }
  }
  const xs = [0, 1].map(c => { const cal = deep.cal[c] || cs; const a = new Float32Array(DEEP_N); if (!cal) return a; for (let i = 0; i < DEEP_N; i++) a[i] = (i - cal.o) / cal.s + shiftU; return a; });
  let lo = Infinity, hi = -Infinity; for (const c of [0, 1]) if (on[c]) { lo = Math.min(lo, xs[c][1]); hi = Math.max(hi, xs[c][DEEP_N - 1]); }
  const v = getView('deepPlot');
  const range = [lo / PXDIV, hi / PXDIV];
  if (!deep.view || deep.view.tIdx !== fr.tIdx) { deep.full = true; deep.view = { tIdx: fr.tIdx }; }
  deep.lastRange = range;
  if (deep.full) { v.t0 = range[0]; v.t1 = range[1]; }
  return { n: DEEP_N, y, xs, on, range, v0: [zeroRaw(0), zeroRaw(1)], vdiv: fr.vdiv, tdiv: fr.tdiv, trigX: stOn ? S.st.pos : devTrigX(), trigL: null, trigC: srcC, draggableTrig: false,
    badge: stOn ? ['● СТАБ', '#3FCB8E'] : null, onZero: (c, d) => { S.zero[c] = d; S.zeroDev = false; segSet('zeroMode', 'man'); saveSettings(); }, screenWin: [0, (N - 1)], stOn };
}
function drawDeepView() {
  const cv = $('deepPlot'), data = deepData();
  if (!data || data.empty) {
    cv._g = drawScope(cv, null);
    const g = cv._g; if (g) { const x = cv.getContext('2d'); x.fillStyle = '#8FB4BF'; x.font = '600 13px Inter, sans-serif'; x.textAlign = 'center'; x.fillText(!cur ? 'нет данных' : cur.ver < 3 ? 'нужна прошивка RU_USB4' : deep.buf[0] || deep.buf[1] ? 'запись не совпадает с экраном — подайте сигнал покрупнее (не плоскую линию)' : 'читаю память прибора…', g.ml + g.pw / 2, g.mt + g.ph / 2); }
    $('liveMeas').innerHTML = ''; $('liveChips').innerHTML = ''; return;
  }
  cv._g = drawScope(cv, data);
  // mark where the device screen is
  const g = cv._g; if (g) { const x = cv.getContext('2d'); const a = g.X(0), b = g.X(12); x.fillStyle = 'rgba(243,95,39,.07)'; x.fillRect(a, g.mt, b - a, g.ph); x.strokeStyle = 'rgba(243,95,39,.5)'; x.setLineDash([4, 4]); x.beginPath(); x.moveTo(a, g.mt); x.lineTo(a, g.mt + g.ph); x.moveTo(b, g.mt); x.lineTo(b, g.mt + g.ph); x.stroke(); x.setLineDash([]); x.fillStyle = 'rgba(243,95,39,.8)'; x.font = '600 11px Inter, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText('экран прибора', a + 4, g.mt + 4); }
  const cal = deep.cal[0] || deep.cal[1], fr = cur;
  const len = cal && fr.tdiv ? (DEEP_N - 1) / cal.s * fr.tdiv / PXDIV : null;
  $('liveChips').innerHTML = [
    `<span class="chip">Развёртка <b>${fr.tdiv ? tdivName(fr.tdiv) : '?'}</b></span>`,
    `<span class="chip ok" title="совпадение с экраном: ${deep.matchR ? deep.matchR.map(r => r == null ? '—' : r.toFixed(3)).join(' / ') : ''}">запись <b>${len ? fmtT(len) : '?'}</b> · ×${cal ? ((DEEP_N - 1) / cal.s / (N - 1)).toFixed(1).replace('.', ',') : '?'} экрана</span>`,
  ].join('');
  $('liveMeas').innerHTML = measHTML(data);
}

// ---------------- LIVE: spectrum / harmonics ----------------
const SP = { ch: 0, scale: 'lin' };
segInit('specCh', v => { SP.ch = +v; needDraw = true; });
segInit('specScale', v => { SP.scale = v; needDraw = true; });
const DFT_M = 4096; let dftTab = null;
function spectrumOf(y, v0, vdiv, dt) {
  // longest NaN-free run
  let bs = 0, bl = 0, st = -1;
  for (let i = 0; i <= y.length; i++) { const ok = i < y.length && !isNaN(y[i]); if (ok && st < 0) st = i; if (!ok && st >= 0) { if (i - st > bl) { bl = i - st; bs = st; } st = -1; } }
  if (bl < 32) return null;
  const n = bl, x = new Float64Array(n); let mean = 0, wsum = 0;
  for (let i = 0; i < n; i++) { x[i] = (y[bs + i] - v0) / PXDIV * (vdiv || 1); mean += x[i]; }
  mean /= n;
  for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); x[i] = (x[i] - mean) * w; wsum += w; }
  // zero-padded radix-2 FFT: same bins as the former direct DFT, ~40× less work per redraw
  const K = DFT_M / 2, amp = new Float64Array(K + 1), re = new Float64Array(DFT_M), im = new Float64Array(DFT_M);
  re.set(n > DFT_M ? x.subarray(0, DFT_M) : x); fft(re, im);
  for (let k = 1; k <= K; k++) amp[k] = 2 * Math.hypot(re[k], im[k]) / wsum / Math.SQRT2;
  const fs = 1 / dt, df = fs / DFT_M, natBin = DFT_M / n;   // padded bins per native bin
  // fundamental: biggest peak above ~1.5 native bins
  let k1 = 0; for (let k = Math.ceil(1.5 * natBin); k <= K; k++) if (amp[k] > amp[k1]) k1 = k;
  const res = { amp, df, K, n, mean, fs, f1: null, h: [] };
  if (!k1 || amp[k1] <= 0) return res;
  const a = amp[k1 - 1] || 0, b = amp[k1], c = amp[k1 + 1] || 0, d = (a - c) / (2 * (a - 2 * b + c) || 1);
  res.f1 = (k1 + (isFinite(d) ? d : 0)) * df;
  for (let h = 1; h <= 15; h++) {
    const kc = res.f1 * h / df; if (kc > K - 2) break;
    let km = Math.round(kc); const span = Math.max(2, Math.round(natBin * 0.6));
    for (let k = Math.max(1, Math.round(kc) - span); k <= Math.min(K, Math.round(kc) + span); k++) if (amp[k] > amp[km]) km = k;
    res.h.push({ n: h, f: km * df, a: amp[km] });
  }
  const h1 = res.h[0].a; let s2 = 0; for (const q of res.h.slice(1, 10)) s2 += q.a * q.a;
  res.thd = h1 > 0 ? Math.sqrt(s2) / h1 * 100 : null;
  res.periods = res.f1 * n * dt;
  return res;
}
function fft(re, im) {   // in place, length = DFT_M
  const M = re.length;
  if (!dftTab) { dftTab = { c: new Float64Array(M / 2), s: new Float64Array(M / 2) }; for (let k = 0; k < M / 2; k++) { dftTab.c[k] = Math.cos(2 * Math.PI * k / M); dftTab.s[k] = Math.sin(2 * Math.PI * k / M); } }
  for (let i = 1, j = 0; i < M; i++) { let b = M >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= M; len <<= 1) {
    const h = len >> 1, step = M / len;
    for (let i = 0; i < M; i += len) for (let k = 0; k < h; k++) {
      const c = dftTab.c[k * step], s = dftTab.s[k * step], a = i + k, b = a + h;
      const tr = re[b] * c + im[b] * s, ti = im[b] * c - re[b] * s;   // × e^{-j2πk/len}
      re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
    }
  }
}
let specCache = null;
function drawSpecView() {
  const cv = $('specPlot'), g = geom(cv); if (!g) return;
  const ctx = cv.getContext('2d'); ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
  ctx.fillStyle = cssVar('--scr'); ctx.fillRect(0, 0, g.W, g.H);
  const fr = proc && proc.fr, c = SP.ch, col = [cssVar('--ch1'), cssVar('--ch2')][c];
  let sp = null;
  let deepUsed = false;
  if (fr && fr.tdiv && (fr.mask & (1 << c))) {
    const cal = deep.cal[c], b = deep.buf[c];
    if (cal && b && (frozen || performance.now() - deep.t < 1500) && cal.tIdx === fr.tIdx) { const y = new Float32Array(DEEP_N - 1); for (let i = 1; i < DEEP_N; i++) y[i - 1] = cal.a * b[i] + cal.b; sp = spectrumOf(y, zeroRaw(c), fr.vdiv[c], fr.tdiv / PXDIV / cal.s); deepUsed = true; }
    else sp = spectrumOf(+S.smooth ? Float32Array.from(fr.raw[c]) : proc.y[c], zeroRaw(c), fr.vdiv[c], fr.tdiv / PXDIV);   // the filter would eat harmonics
    let clip = 0; for (const v of fr.raw[c]) if (v <= 28 || v >= 228) clip++; if (sp) sp.clip = clip;
  }
  specCache = sp;
  const fmax = sp ? (sp.f1 ? Math.min(sp.K * sp.df, sp.f1 * 10.5) : sp.K * sp.df) : 1;
  const amax = sp ? Math.max(1e-12, ...sp.h.map(q => q.a), sp.f1 ? 0 : Math.max(...sp.amp)) : 1;
  const db = SP.scale === 'db';
  const X = f => g.ml + f / fmax * g.pw;
  const Y = a => db ? g.mt + Math.min(1, Math.max(0, -20 * Math.log10(Math.max(a, 1e-15) / amax) / 80)) * g.ph : g.mt + g.ph - Math.min(1, a / (amax * 1.1)) * g.ph;
  // grid
  ctx.lineWidth = 1;
  for (let k = 0; k <= 10; k++) { const x = Math.round(g.ml + k / 10 * g.pw) + .5; ctx.strokeStyle = cssVar('--grid2'); ctx.beginPath(); ctx.moveTo(x, g.mt); ctx.lineTo(x, g.mt + g.ph); ctx.stroke(); }
  for (let k = 0; k <= 8; k++) { const y = Math.round(g.mt + k / 8 * g.ph) + .5; ctx.strokeStyle = cssVar('--grid2'); ctx.beginPath(); ctx.moveTo(g.ml, y); ctx.lineTo(g.ml + g.pw, y); ctx.stroke(); }
  ctx.fillStyle = '#86A9B3'; ctx.font = '11px Inter, sans-serif'; ctx.textBaseline = 'top';
  for (let k = 0; k <= 10; k += 2) { ctx.textAlign = k === 0 ? 'left' : k === 10 ? 'right' : 'center'; ctx.fillText(sp ? si(k / 10 * fmax, 'Гц', 3) : '', g.ml + k / 10 * g.pw, g.mt + g.ph + 6); }
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let k = 0; k <= 8; k += 2) { const lbl = db ? (-k * 10) + ' дБ' : si(amax * 1.1 * (1 - k / 8), UN(c), 2); ctx.fillText(lbl, g.ml + 4, g.mt + k / 8 * g.ph + (k === 0 ? 8 : k === 8 ? -8 : 0)); }
  if (!sp) {
    ctx.fillStyle = '#8FB4BF'; ctx.font = '600 13px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fr ? `CH${c + 1} выключен или нет данных` : 'нет данных', g.ml + g.pw / 2, g.mt + g.ph / 2);
    $('liveMeas').innerHTML = ''; return;
  }
  // spectrum line
  ctx.save(); ctx.beginPath(); ctx.rect(g.ml, g.mt, g.pw, g.ph); ctx.clip();
  ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath();
  const kmax = Math.min(sp.K, Math.ceil(fmax / sp.df));
  for (let k = 1; k <= kmax; k++) { const x = X(k * sp.df), y = Y(sp.amp[k]); k === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke();
  ctx.globalAlpha = .12; ctx.fillStyle = col; ctx.lineTo(X(kmax * sp.df), g.mt + g.ph); ctx.lineTo(X(sp.df), g.mt + g.ph); ctx.fill(); ctx.globalAlpha = 1;
  ctx.restore();
  // harmonic markers
  ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  for (const q of sp.h.slice(0, 10)) { const x = X(q.f), y = Y(q.a); ctx.fillStyle = q.n === 1 ? cssVar('--orange') : '#E8F3F6'; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); ctx.fillText(String(q.n), x, y - 6); }
  ctx.fillStyle = deepUsed ? '#3FCB8E' : '#86A9B3'; ctx.font = '600 11px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(deepUsed ? '● по полной записи (1024 точки)' : '○ по экрану (301 точка)', g.ml + 70, g.mt + 8);
  if (sp.clip > 2) { ctx.fillStyle = '#E36A5C'; ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('сигнал обрезан краем экрана — гармоники завышены, уменьшите В/дел', g.ml + g.pw - 8, g.mt + 26); }
  if (sp.periods != null && sp.periods < 4) { ctx.fillStyle = '#E3A33B'; ctx.font = '600 12px Inter, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(`на экране ${sp.periods.toFixed(1).replace('.', ',')} периода — для точных гармоник нужно 5+ (уменьшите скорость развёртки)`, g.ml + g.pw - 8, g.mt + 8); }
  // hover
  const hv = cv._hover;
  if (hv && hv.x >= g.ml && hv.x <= g.ml + g.pw) {
    const k = Math.max(1, Math.min(kmax, Math.round((hv.x - g.ml) / g.pw * fmax / sp.df)));
    const f = k * sp.df, a = sp.amp[k], h1 = sp.h[0] ? sp.h[0].a : 0;
    const lines = [{ t: 'f = ' + si(f, 'Гц', 4), c: '#E8F3F6' }, { t: si(a, UN(c), 3) + ' СКЗ' + (h1 ? ' · ' + (a / h1 * 100).toFixed(1).replace('.', ',') + ' % от 1-й' : ''), c: col }];
    if (sp.f1) lines.push({ t: '≈ ' + (f / sp.f1).toFixed(2).replace('.', ',') + ' × основной', c: '#86A9B3' });
    hoverBox(ctx, g, X(f), hv, lines, [[X(f), Y(a), col]]);
  }
  // table
  const cell = (k, v, cls = '') => `<div class="m ${cls}"><span>${k}</span><b>${v}</b></div>`;
  const h1 = sp.h[0];
  $('liveMeas').innerHTML = `<div class="harmhead">${cell('Основная частота', sp.f1 ? si(sp.f1, 'Гц', 4) : '—')}${cell('1-я гармоника (СКЗ)', h1 ? si(h1.a, UN(c), 3) : '—')}${cell('КНИ (THD, 2…10)', sp.thd != null ? sp.thd.toFixed(1).replace('.', ',') + ' %' : '—')}${cell('Пост. составляющая', si(sp.mean, UN(c), 3))}${cell('Разрешение', si(sp.fs / sp.n, 'Гц', 3))}</div>
  <div class="harm">${sp.h.slice(0, 10).map(q => cell(`${q.n}-я · ${si(q.f, 'Гц', 3)}`, q.n === 1 ? si(q.a, UN(c), 3) : (q.a / h1.a * 100).toFixed(1).replace('.', ',') + ' %', q.n === 1 ? 'f1' : '')).join('')}</div>`;
}

// ---------------- remote keys ----------------
const nameToBit = () => { const m = {}; for (const b in S.keys) m[S.keys[b]] = +b; return m; };
let pressMode = 'short';
segInit('pressMode', v => pressMode = v);
function fwOK() { if (!cur || performance.now() - lastFrameAt > 2000) { toast('Нет связи с прибором'); return false; } if (cur.ver < 2) { toast('Нужна прошивка RU_USB4 — в текущей нет управления'); return false; } return true; }
function pressBit(bit, long, quiet) {
  if (!fwOK()) return false;
  const hold = long ? S.holdLong : S.holdShort;
  send([0xA5, 0x4B, bit, Math.max(1, Math.min(250, hold))]);
  const nm = S.keys[bit] || 'K' + bit;
  if (!quiet) padLog(`${long ? 'длинное' : 'нажатие'}: ${nm}`);
  $$(`.k[data-bit="${bit}"]`).forEach(k => { k.classList.add('fire'); setTimeout(() => k.classList.remove('fire'), 180); });
  return true;
}
function pressName(name, long) {
  const b = nameToBit()[name];
  if (b == null) { toast(`Кнопка «${name}» ещё не обучена — откройте «Пульт прибора» → «Обучение»`); return false; }
  if (name === 'POWER' && !confirm('Нажать кнопку питания прибора? Прибор может выключиться.')) return false;
  return pressBit(b, long);
}
function padLog(s) { const l = $('padLog'); const d = new Date(); l.insertAdjacentHTML('afterbegin', `<div>${d.toLocaleTimeString()} — ${s}</div>`); while (l.children.length > 40) l.lastChild.remove(); }
function keyBtn(name, cls = '') {
  const b = document.createElement('button'); b.className = 'k ' + cls + (name === 'POWER' ? ' pwr' : ''); b.textContent = name === 'POWER' ? '⏻' : name; b.dataset.name = name; b.title = name === 'POWER' ? 'Питание' : name;
  b.onclick = () => pressName(name, pressMode === 'long');
  b.oncontextmenu = e => { e.preventDefault(); pressName(name, true); };
  return b;
}
function buildPads() {
  const big = $('bigPad'); big.innerHTML = '';
  ['CH1', 'CH2', 'MOVE', 'TRIGGER', 'PRM', 'SELECT'].forEach(n => big.append(keyBtn(n)));
  const dp = document.createElement('div'); dp.className = 'dpad';
  [null, '↑', null, '←', 'OK', '→', null, '↓', null].forEach(n => { if (!n) dp.append(document.createElement('span')); else dp.append(keyBtn(n, n === 'OK' ? 'ok' : '')); });
  big.append(dp);
  ['AUTO', 'SAVE', 'MENU'].forEach(n => big.append(keyBtn(n)));
  const pw = keyBtn('POWER'); pw.style.gridColumn = '2'; big.append(pw);
  const mini = $('miniPad'); mini.innerHTML = '';
  ['CH1', 'CH2', 'MOVE', 'TRIGGER', 'PRM', 'SELECT', 'AUTO', 'SAVE', 'MENU'].forEach(n => mini.append(keyBtn(n)));
  const md = document.createElement('div'); md.className = 'mdpad';
  [null, '↑', null, '←', 'OK', '→', null, '↓', null].forEach(n => md.append(n ? keyBtn(n, n === 'OK' ? 'ok' : '') : document.createElement('span')));
  mini.append(md);
  const raw = $('rawKeys'); raw.innerHTML = '';
  for (let i = 0; i < 15; i++) { const b = document.createElement('button'); b.className = 'k'; b.dataset.bit = i; b.textContent = 'K' + i; b.title = S.keys[i] || 'не обучена'; b.onclick = () => pressBit(i, false); b.oncontextmenu = e => { e.preventDefault(); pressBit(i, true); }; raw.append(b); }
  refreshKeyState();
}
function refreshKeyState() {
  const m = nameToBit();
  $$('.k[data-name]').forEach(k => { const b = m[k.dataset.name]; k.classList.toggle('dis', b == null); if (b != null) k.dataset.bit = b; else delete k.dataset.bit; });
  const learned = Object.keys(S.keys).length;
  $('ctlInfo').textContent = learned ? `Обучено кнопок: ${learned} из 15. Правая кнопка мыши — длинное нажатие.` : 'Кнопки заработают после обучения на странице «Пульт прибора».';
  const t = $('keyTable'); t.innerHTML = '';
  for (let i = 0; i < 15; i++) {
    const tr = document.createElement('tr'); tr.dataset.bit = i;
    const opts = ['<option value="">—</option>'].concat(KEY_NAMES.map(n => `<option ${S.keys[i] === n ? 'selected' : ''}>${n}</option>`)).join('');
    tr.innerHTML = `<td>K${i}</td><td><select>${opts}</select></td>`;
    tr.querySelector('select').onchange = e => { const v = e.target.value; for (const b in S.keys) if (S.keys[b] === v) delete S.keys[b]; if (v) S.keys[i] = v; else delete S.keys[i]; saveSettings(); refreshKeyState(); };
    t.append(tr);
  }
  $$('#rawKeys .k').forEach(b => b.title = S.keys[b.dataset.bit] || 'не обучена');
}
// physical key presses reported by the device
let learn = null;
function onPhysKeys(mask) {
  for (let i = 0; i < 15; i++) if (mask & (1 << i)) {
    $$(`.k[data-bit="${i}"], #keyTable tr[data-bit="${i}"]`).forEach(k => { k.classList.add('lit'); setTimeout(() => k.classList.remove('lit'), 400); });
  }
  if (learn && performance.now() > learn.ignoreUntil) {
    let bit = -1; for (let i = 0; i < 15; i++) if (mask & (1 << i)) { bit = i; break; }
    if (bit < 0) return;
    const name = KEY_NAMES[learn.i];
    for (const b in S.keys) if (S.keys[b] === name) delete S.keys[b];
    const prevName = S.keys[bit]; S.keys[bit] = name;
    learn.done.push(`${name} → K${bit}` + (prevName && prevName !== name ? ` (раньше было ${prevName})` : ''));
    saveSettings(); refreshKeyState(); learnNext(1);
  }
}
function learnNext(step) {
  learn.i += step; learn.ignoreUntil = performance.now() + 350;
  if (learn.i >= KEY_NAMES.length) return learnStop(true);
  const n = KEY_NAMES[learn.i];
  $('lPrompt').className = 'lprompt active';
  $('lPrompt').innerHTML = `Нажмите на приборе: ${n}<small>${KEY_HELP[n] || ''} · шаг ${learn.i + 1} из ${KEY_NAMES.length}${learn.done.length ? ' · последнее: ' + learn.done[learn.done.length - 1] : ''}</small>`;
}
function learnStop(finished) {
  const n = learn ? learn.done.length : 0; learn = null;
  $('lPrompt').className = 'lprompt'; $('lPrompt').innerHTML = (finished ? 'Обучение завершено' : 'Обучение остановлено') + `<small>запомнено кнопок: ${Object.keys(S.keys).length} из 15${n ? '' : ''}. Верните прибор на экран осциллографа (MENU / выход).</small>`;
  $('lStart').hidden = false; $('lSkip').hidden = $('lStop').hidden = true;
}
$('lStart').onclick = () => {
  if (!cur) return toast('Нет данных от прибора — подключите его');
  if (cur.ver < 2) return toast('Нужна прошивка RU_USB4 — текущая не сообщает о кнопках');
  learn = { i: -1, done: [], ignoreUntil: 0 }; $('lStart').hidden = true; $('lSkip').hidden = $('lStop').hidden = false; learnNext(1);
  toast('Прибор будет реагировать на нажатия — это нормально');
};
$('lSkip').onclick = () => learn && learnNext(1);
$('lStop').onclick = () => learnStop(false);
$('holdShort').onchange = e => { S.holdShort = Math.max(2, Math.min(60, +e.target.value || 6)); e.target.value = S.holdShort; saveSettings(); };
$('holdLong').onchange = e => { S.holdLong = Math.max(72, Math.min(250, +e.target.value || 90)); e.target.value = S.holdLong; saveSettings(); };

// timebase control: arrows ←/→ change the time base on the scope screen
let tbSeek = null, tbPending = null;
function tbKey(dirIdx) { return (dirIdx > 0) === (S.tbDir > 0) ? '→' : '←'; }
function tbStep(dirIdx) {
  if (!cur || !fwOK()) return;
  const name = tbKey(dirIdx);
  if (nameToBit()[name] == null) return toast('Сначала обучите кнопки ← и → (страница «Пульт прибора»)');
  tbPending = { name, from: cur.tIdx, dirIdx, at: performance.now() };
  pressName(name, false);
}
function onTbChange(from, to) {
  if (tbPending && performance.now() - tbPending.at < 1500) {
    const d = Math.sign(to - from);
    if (d && d !== tbPending.dirIdx) { S.tbDir = -S.tbDir; saveSettings(); }  // learn which arrow is "slower"
    tbPending = null;
  }
  if (tbSeek) setTimeout(tbSeekStep, 120);
}
function tbSeekStep() {
  if (!tbSeek || !cur) return;
  if (cur.tIdx === tbSeek.target) { tbSeek = null; return; }
  if (++tbSeek.steps > 40) { tbSeek = null; send([0xA5, 0x58, 0, 0]); return toast('Не удалось выставить развёртку'); }
  tbStep(Math.sign(tbSeek.target - cur.tIdx));
  clearTimeout(tbSeek.to); tbSeek.to = setTimeout(() => { if (tbSeek) { if (++tbSeek.miss >= 2) { tbSeek = null; send([0xA5, 0x58, 0, 0]); toast('Прибор не меняет развёртку стрелками. Выйдите из меню (MENU), выберите режим, где стрелки ←/→ меняют время/дел.'); } else tbSeekStep(); } }, 1200);
}
$('tbSel').innerHTML = TDIV.map((t, i) => `<option value="${i}">${tdivName(t)}</option>`).join('');
$('tbSel').onchange = e => { if (!cur || !fwOK()) return; tbSeek = { target: +e.target.value, steps: 0, miss: 0 }; tbSeekStep(); };
$('tbDn').onclick = () => tbStep(-1); $('tbUp').onclick = () => tbStep(1);

// ---------------- diagnostics ----------------
function hexGrid(el, bytes, chg, base, rows) {
  const now = performance.now();
  if (!el.children.length) {
    let h = '<div class="hh"></div>' + Array.from({ length: 16 }, (_, i) => `<div class="hh">${i.toString(16).toUpperCase()}</div>`).join('');
    for (let r = 0; r < rows; r++) { h += `<div class="hh">+${(base + r * 16).toString(16).toUpperCase().padStart(3, '0')}</div>`; for (let i = 0; i < 16; i++) h += `<div class="hb" title="+0x${(base + r * 16 + i).toString(16).toUpperCase()}"></div>`; }
    el.innerHTML = h;
  }
  const cells = el.querySelectorAll('.hb');
  cells.forEach((c, i) => { const v = bytes ? bytes[i] : null; c.textContent = v == null ? '··' : v.toString(16).toUpperCase().padStart(2, '0'); c.classList.toggle('chg', now - chg[i] < 3000); });
}
function renderDiag() {
  hexGrid($('hexG'), cur && cur.g, chgG, 0, 8);
  hexGrid($('hexS'), cur && cur.sys, chgS, 0xF60, 1);
  renderLinkKv();
}
function renderLinkKv() {
  const kv = [['Порт', link.port || '—'], ['Состояние', link.state], ['Кадров принято', frames], ['Кадр/с', fps.toFixed(1)], ['Пропущено', lost], ['Ошибок CRC', link.bad || 0], ['Версия формата', cur ? cur.ver : '—'], ['Опрос кнопок', scanRate ? Math.round(scanRate) + ' /с' : '—'], ['Очередь нажатий', cur && cur.qlen != null ? cur.qlen + (cur.injecting ? ' (нажата K' + cur.injKey + ')' : '') : '—']];
  $('linkKv').innerHTML = kv.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
}


// ---------------- memory reader (firmware v3) ----------------
let memLast = null, memTimer = null;
$('memPreset').onchange = e => { const v = e.target.value; if (!v) return $('memAddr').focus(); const [a, n] = v.split(':'); $('memAddr').value = a; $('memLen').value = n; memRequest(); };
function memRequest() {
  if (!cur || cur.ver < 3) { $('memInfo').textContent = 'нужна прошивка RU_USB4'; return; }
  const a = parseInt($('memAddr').value.replace(/^0x/i, ''), 16) >>> 0, n = Math.max(1, Math.min(1024, +$('memLen').value || 0));
  if (!isFinite(a)) return toast('Неверный адрес');
  const cmd = [0xA5, 0x4D, a & 255, (a >>> 8) & 255, (a >>> 16) & 255, (a >>> 24) & 255, n & 255, n >> 8];
  if (deep.waiting && performance.now() - deep.waiting < 600) { memQueued = cmd; return; }   // the device would drop a second pending read
  memSent = performance.now(); send(cmd);
}
$('memRead').onclick = memRequest;
$('memAuto').onchange = e => { clearInterval(memTimer); if (e.target.checked) memTimer = setInterval(() => { if (view === 'diag') memRequest(); }, 200); };
function onMem(f) {
  const a = (f[8] | (f[9] << 8) | (f[10] << 16) | (f[11] << 24)) >>> 0, data = f.slice(12, f.length - 2);
  if (deep.waiting && (a === DEEP_A || a === DEEP_B) && a === deep.ask) { onDeepMem(a, data); if (!(view === 'diag' && $('memAuto').checked)) return; }
  memSent = 0;
  const prev = memLast && memLast.a === a ? memLast.data : null;
  memLast = { a, data, prev, t: Date.now() };
  $('memInfo').textContent = `0x${a.toString(16).toUpperCase()} · ${data.length} байт · ${new Date().toLocaleTimeString('ru-RU')}`;
  let txt = '';
  for (let i = 0; i < data.length; i += 16) {
    const row = data.subarray(i, i + 16);
    txt += (a + i).toString(16).toUpperCase().padStart(8, '0') + '  ' + [...row].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(48) + '  ' + [...row].map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '·').join('') + '\n';
  }
  $('memHex').textContent = txt;
  drawMem();
}
function drawMem() {
  const cv = $('memPlot'), dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !memLast) return;
  cv.width = W * dpr; cv.height = H * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.fillStyle = cssVar('--scr'); x.fillRect(0, 0, W, H);
  x.strokeStyle = cssVar('--grid2'); for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(0, Math.round(k / 4 * (H - 1)) + .5); x.lineTo(W, Math.round(k / 4 * (H - 1)) + .5); x.stroke(); }
  const d = memLast.data, n = d.length; if (n < 2) return;
  const line = (arr, col, a) => { x.strokeStyle = col; x.globalAlpha = a; x.lineWidth = 1.3; x.beginPath(); for (let i = 0; i < n; i++) { const px = i / (n - 1) * W, py = (1 - arr[i] / 255) * (H - 4) + 2; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); x.globalAlpha = 1; };
  if (memLast.prev && memLast.prev.length === n) line(memLast.prev, '#86A9B3', .35);
  line(d, cssVar('--ch1'), 1);
  x.fillStyle = '#86A9B3'; x.font = '11px Inter, sans-serif'; x.fillText('0', 4, H - 6); x.textAlign = 'right'; x.fillText(String(n - 1), W - 4, H - 6);
}

// ---------------- port modal ----------------
$('bPort').onclick = async () => {
  $('portModal').hidden = false; const l = $('pList'); l.innerHTML = '<div class="hint">поиск…</div>';
  try {
    const ps = await (await api('/api/ports')).json();
    l.innerHTML = ps.length ? '' : '<div class="hint">COM-порты не найдены</div>';
    ps.forEach(p => { const b = document.createElement('button'); b.innerHTML = `<span>${esc(p.name)}</span>${p.device ? '<em>2C53T</em>' : ''}`; b.onclick = () => { api('/api/connect?port=' + encodeURIComponent(p.name)); $('portModal').hidden = true; }; l.append(b); });
  } catch (e) { l.innerHTML = '<div class="hint">ошибка</div>'; }
};
$('pAuto').onclick = () => { api('/api/connect'); $('portModal').hidden = true; };
$('pOff').onclick = () => { api('/api/disconnect'); $('portModal').hidden = true; };
$$('[data-close]').forEach(b => b.onclick = () => b.closest('.modal').hidden = true);
$('portModal').onclick = e => { if (e.target.id === 'portModal') e.target.hidden = true; };
$('bOpenOut').onclick = () => api('/api/opendir');

// ---------------- FILES ----------------
let recSources = [], localFiles = [], sel = null, fileData = null, fOver = {};
$('fTdiv').innerHTML = '<option value="">авто</option>' + TDIV.map(t => `<option value="${t}">${tdivName(t)}</option>`).join('');
['fV0', 'fV1'].forEach(id => $(id).innerHTML = '<option value="">авто</option>' + VDIV.map(v => `<option value="${v}">${vdivName(v)}</option>`).join(''));
async function refreshRecordings() {
  try { recSources = await (await api('/api/recordings')).json(); } catch (e) { recSources = []; }
  renderFileList();
}
$('fRefresh').onclick = refreshRecordings;
function renderFileList() {
  const l = $('fList'); l.innerHTML = '';
  const group = (title, items, src) => {
    l.insertAdjacentHTML('beforeend', `<div class="fgrp">${title}</div>`);
    if (!items.length) { l.insertAdjacentHTML('beforeend', '<div class="fempty">нет файлов</div>'); return; }
    items.forEach(it => {
      const d = document.createElement('div'); d.className = 'fi' + (sel && sel.key === it.key ? ' on' : '');
      const th = document.createElement('img'); th.className = 'th'; d.append(th);
      if (it.csv) th.src = 'icons/csv.svg';
      d.insertAdjacentHTML('beforeend', `<div class="fn"><b>${esc(it.csv ? it.name : '№ ' + it.name)}</b><span>${[it.bin ? 'данные' : '', it.bmp ? 'снимок' : '', it.csv ? 'CSV' + (it.size ? ' · ' + Math.max(1, Math.round(it.size / 1024)) + ' КБ' : '') : ''].filter(Boolean).join(' + ')}${it.mtime ? ' · ' + new Date(it.mtime * 1000).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span></div>`);
      d.onclick = () => openRec(it);
      l.append(d);
      if (it.bmp) thumb(it).then(u => { if (u) th.src = u; });
    });
  };
  const devs = recSources.filter(s => s.label !== 'saved'), saved = recSources.find(s => s.label === 'saved');
  devs.forEach(s => group('Прибор ' + s.label, s.files.map(f => ({ ...f, key: f.bin || f.bmp, src: 'dev' }))));
  if (!devs.length) l.insertAdjacentHTML('beforeend', '<div class="fgrp">Прибор</div><div class="fempty">Диск прибора не найден. Включите на приборе «USB Sharing» и нажмите ⟳.</div>');
  if (localFiles.length) group('Открытые файлы', localFiles);
  if (saved) group('Сохранённые программой', saved.files.map(f => ({ ...f, key: f.csv, src: 'dev' })));
}
const thumbs = new Map();
async function readItem(it, kind) {
  if (it.src === 'dev') { const p = it[kind]; if (!p) return null; return await (await api('/api/file?path=' + encodeURIComponent(p))).arrayBuffer(); }
  const f = it[kind + 'File']; return f ? await f.arrayBuffer() : null;
}
async function thumb(it) {
  if (thumbs.has(it.key)) return thumbs.get(it.key);
  const p = (async () => { try { const b = await readItem(it, 'bmp'); return b ? bmpURL(SCOPE.decodeBMP(b)) : null; } catch (e) { return null; } })();
  thumbs.set(it.key, p); return p;
}
function bmpURL(img) {
  const c = document.createElement('canvas'); c.width = img.w; c.height = img.h; const x = c.getContext('2d'), id = x.createImageData(img.w, img.h);
  for (let i = 0; i < img.w * img.h; i++) { id.data[i * 4] = img.R[i]; id.data[i * 4 + 1] = img.G[i]; id.data[i * 4 + 2] = img.B[i]; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0); return c.toDataURL();
}
function addLocal(files) {
  const m = new Map(localFiles.map(f => [f.name.toLowerCase(), f]));
  for (const f of files) {
    const ext = f.name.split('.').pop().toLowerCase(); if (ext !== 'bin' && ext !== 'bmp' && ext !== 'csv') continue;
    const base = f.name.replace(/\.[^.]+$/, ''); const k = base.toLowerCase();
    const it = m.get(k) || { name: base, key: 'local:' + k + ':' + Date.now(), src: 'local' };
    it[ext] = f.name; it[ext + 'File'] = f; if (!it.mtime) it.mtime = Math.floor(f.lastModified / 1000); m.set(k, it);
  }
  localFiles = [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  renderFileList();
  const last = localFiles.find(f => [...files].some(x => x === f.binFile || x === f.bmpFile || x === f.csvFile)); if (last) openRec(last);
}
$('fOpen').onchange = e => { addLocal(e.target.files); e.target.value = ''; };
const drop = $('fDrop');
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (mode === 'files') { e.preventDefault(); drop.classList.add('over'); } }));
['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
document.addEventListener('drop', e => { if (mode === 'files' && e.dataTransfer.files.length) addLocal(e.dataTransfer.files); });

// ---- CSV (files saved by this program, or any "time;CH1;CH2" table) ----
function parseCSV(text) {
  text = text.replace(/^\ufeff/, '');
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 3) throw new Error('в файле нет данных');
  const delim = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const head = lines[0].split(delim).map(h => h.trim().toLowerCase());
  const col = re => head.findIndex(h => re.test(h));
  if (col(/частота|freq/) === 0 && col(/скз|rms|ампл/) >= 0) throw new Error('это CSV спектра — откройте его в Excel');
  let ct = col(/врем|time|^t\b|^t,/), c1 = col(/ch1|кан.*1|канал 1|^u1|^v1/), c2 = col(/ch2|кан.*2|канал 2|^u2|^v2/), cf = col(/кадр|frame/), cg = col(/разрыв|gap/);
  const cft = col(/от триггера|от начала/), ctd = col(/развёртка/), cv1 = col(/ch1.*\/дел/), cv2 = col(/ch2.*\/дел/);   // per-frame time and the device scales (first row of a frame)
  if (ct < 0) ct = 0; if (c1 < 0 && c2 < 0) { c1 = ct === 0 ? 1 : 0; c2 = head.length > 2 ? (ct === 0 ? 2 : 1) : -1; }
  const num = v => { if (v == null) return NaN; v = v.trim(); if (!v) return NaN; if (delim !== ',') v = v.replace(',', '.'); return parseFloat(v); };
  const frames = []; let cur = null, lastF = null;
  for (let k = 1; k < lines.length; k++) {
    const p = lines[k].split(delim), t = num(p[ct]); if (!isFinite(t)) continue;
    const f = cf >= 0 ? p[cf].trim() : '0';
    if (!cur || f !== lastF) { cur = { t: [], v: [[], []], gap: [], ft: null, tdivF: null, vdivF: [null, null] }; frames.push(cur); lastF = f; }
    const first = (ci, set) => { if (ci >= 0) { const x = num(p[ci]); if (isFinite(x) && x > -1e12) set(x); } };
    if (cur.ft == null) first(cft, x => cur.ft = x); if (cur.tdivF == null) first(ctd, x => { if (x > 0) cur.tdivF = x; }); if (cur.vdivF[0] == null) first(cv1, x => { if (x > 0) cur.vdivF[0] = x; }); if (cur.vdivF[1] == null) first(cv2, x => { if (x > 0) cur.vdivF[1] = x; });
    cur.t.push(t); cur.v[0].push(c1 >= 0 ? num(p[c1]) : NaN); cur.v[1].push(c2 >= 0 ? num(p[c2]) : NaN); cur.gap.push(cg >= 0 && p[cg] && p[cg].trim() === '1' ? 1 : 0);
  }
  if (!frames.length) throw new Error('не нашёл столбцов с числами');
  for (const fr of frames) { fr.t = Float64Array.from(fr.t); fr.v = fr.v.map(a => Float32Array.from(a)); fr.on = fr.v.map(a => a.some(x => isFinite(x))); }
  return { frames, ftKind: cft >= 0 ? (/триггер/.test(head[cft]) ? 'trig' : 'start') : null, cols: { t: head[ct], c1: c1 >= 0 ? head[c1] : null, c2: c2 >= 0 ? head[c2] : null } };
}
const nice125 = x => { if (!(x > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(x))), m = x / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
// ---- multi-frame recordings: one scale for the whole record, frame / film strip / overlay views, player ----
function csvPrep(C) {
  C.stats = C.frames.map(fr => [0, 1].map(c => { let a = Infinity, b = -Infinity, s2 = 0, n = 0; for (const x of fr.v[c]) if (isFinite(x)) { if (x < a) a = x; if (x > b) b = x; s2 += x * x; n++; } return n ? { min: a, max: b, rms: Math.sqrt(s2 / n) } : null; }));
  C.vauto = [0, 1].map(c => { let m = 0; for (const s of C.stats) if (s[c]) m = Math.max(m, Math.abs(s[c].min), Math.abs(s[c].max)); return nice125(m / 3.6 || 1); });
  const f0 = C.frames[0]; C.tauto = nice125(((f0.t[f0.t.length - 1] - f0.t[0]) || 1e-3) / 12);
  C.hasT = C.frames.length > 1 && C.frames.every(f => f.ft != null);
  C.ftime = C.frames.map((f, k) => C.hasT ? f.ft : k / 30);   // without timestamps assume ~30 frames/s
}
const fPos = () => fileData && fileData.csv ? Math.min(fileData.csv.frames.length - 1, Math.max(0, fOver.frame || 0)) : 0;
let fMode = 'frame';
function csvScales(fr) {
  const C = fileData.csv;
  return { tdiv: fOver.tdiv || fr.tdivF || C.tauto, vdiv: [0, 1].map(c => fOver['vdiv' + c] || fr.vdivF[c] || C.vauto[c]), z: [0, 1].map(c => fOver['zdiv' + c] || 0) };
}
const relT = (C, k) => { const t = C.ftime[k]; return C.hasT ? (t > 1e-9 ? '+' : t < -1e-9 ? '−' : '') + si(Math.abs(t), 'с', 3).replace(/^0 с$/, '0 с') : ''; };
function csvView() {
  if (fMode === 'strip' && fileData.csv.frames.length > 1) return csvStrip();
  const d = csvFrameData(fPos());
  if (fMode === 'over' && fileData.csv.frames.length > 1) d.persist = csvOverlay(d);
  return d;
}
function csvOverlay(d) {   // every frame (≤150, evenly) in the same scale and time grid as the current one
  const C = fileData.csv, sc = csvScales(C.frames[fPos()]), key = [sc.tdiv, sc.vdiv, sc.z, d.n].join('|');
  if (C.over && C.over.key === key) return C.over.list;
  const step = Math.max(1, Math.ceil(C.frames.length / 150)), list = [];
  for (let k = 0; k < C.frames.length; k += step) {
    const fr = C.frames[k]; if (fr.t.length !== d.n) continue;
    list.push([0, 1].map(c => { const a = new Float32Array(d.n); for (let i = 0; i < d.n; i++) a[i] = isFinite(fr.v[c][i]) ? 128 + (fr.v[c][i] / sc.vdiv[c] + sc.z[c]) * PXDIV : NaN; return a; }));
  }
  C.over = { key, list }; return list;
}
function csvStrip() {   // all frames side by side, like a film strip
  const C = fileData.csv, F = C.frames, k0 = fPos(), sc = csvScales(F[k0]), key = [sc.tdiv, sc.vdiv, sc.z].join('|');
  if (!C.strip || C.strip.key !== key) {
    const w = F.map(fr => Math.max(0.5, (fr.t[fr.t.length - 1] - fr.t[0]) / sc.tdiv)), pitch = Math.max(...w) + 0.8;
    let total = 0; for (const fr of F) total += fr.t.length + 1;
    const xs = new Float32Array(total), y = [new Float32Array(total), new Float32Array(total)], seps = []; let j = 0;
    F.forEach((fr, k) => {
      const off = k * pitch; if (k) seps.push(off - 0.4);
      for (let i = 0; i < fr.t.length; i++, j++) { xs[j] = off + (fr.t[i] - fr.t[0]) / sc.tdiv; /* divisions */ for (const c of [0, 1]) y[c][j] = isFinite(fr.v[c][i]) ? 128 + (fr.v[c][i] / sc.vdiv[c] + sc.z[c]) * PXDIV : NaN; }
      xs[j] = off + w[k] + 0.4; y[0][j] = y[1][j] = NaN; j++;   // break the line between frames
    });
    for (let i = 0; i < total; i++) xs[i] *= PXDIV;   // drawScope expects xs in screen samples (25 per division)
    C.strip = { key, xs, y, seps, pitch, w };
  }
  const S_ = C.strip, range = [0, F.length * S_.pitch], v = getView('filePlot'); v.range0 = range[1];
  if (fileData.stripFresh) { v.t0 = Math.max(0, k0 * S_.pitch - S_.pitch); v.t1 = Math.min(range[1], v.t0 + 3 * S_.pitch); fileData.stripFresh = false; }
  const kOf = d => Math.max(0, Math.min(F.length - 1, Math.floor(d / S_.pitch)));
  const fd = csvFrameData(k0, true);
  return { n: S_.xs.length, y: S_.y, xs: [S_.xs, S_.xs], range, on: [0, 1].map(c => F.some(f => f.on[c])), v0: fd.v0, vdiv: sc.vdiv, tdiv: sc.tdiv, trigX: null, trigL: null, draggableTrig: false,
    seps: S_.seps, hl: [k0 * S_.pitch - 0.2, k0 * S_.pitch + S_.w[k0] + 0.2], pannable: true, onClickDiv: d => setFrame(kOf(d)),
    xfmt: (d, long) => { const k = kOf(d); return long ? `кадр ${k + 1}` + (C.hasT ? ' · ' + relT(C, k) : '') + ' · t = ' + si((d - k * S_.pitch) * sc.tdiv, 'с', 3) + ' в кадре' : `к.${k + 1}` + (C.hasT ? ' ' + relT(C, k) : ''); },
    onZero: fd.onZero, _b: fd._b, csvFrame: fd.csvFrame, measData: fd };
}
function csvFrameData(k, noView) {
  const C = fileData.csv, fr = C.frames[k], n = fr.t.length;
  let t0 = Infinity, t1 = -Infinity; for (const t of fr.t) { if (t < t0) t0 = t; if (t > t1) t1 = t; }
  const span = t1 - t0 || 1e-3;
  const { tdiv, vdiv, z } = csvScales(fr);
  const dtS = tdiv / PXDIV;
  const y = [0, 1].map(c => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = isFinite(fr.v[c][i]) ? 128 + (fr.v[c][i] / vdiv[c] + z[c]) * PXDIV : NaN; return a; });
  const xs = [0, 1].map(() => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = (fr.t[i] - t0) / dtS; return a; });
  const range = [0, Math.max(0.5, span / tdiv)];
  const v = getView('filePlot');
  if (!noView) {   // the film strip computes the current frame only for its measurements — its zoom must stay
    if (fileData.csvFresh || v.range0 !== range[1]) { v.t0 = 0; v.t1 = range[1]; v.range0 = range[1]; fileData.csvFresh = false; }
    v.t0 = Math.max(0, Math.min(v.t0, range[1] - 0.5)); v.t1 = Math.min(range[1], Math.max(v.t1, v.t0 + 0.5));
  }
  const b = { n, t: fr.t, chans: [0, 1].map(c => ({ on: fr.on[c], volts: fr.v[c] })) };
  return { n, y, xs, range, on: fr.on, v0: [128 + z[0] * PXDIV, 128 + z[1] * PXDIV], vdiv, tdiv, trigX: t0 <= 0 && t1 >= 0 ? -t0 / dtS : 0, trigL: null, draggableTrig: false,
    onZero: (c, d) => { fOver['zdiv' + c] = d; }, _b: b, csvFrame: fr };
}
async function openRec(it) {
  sel = it; fOver = {}; ['fTdiv', 'fV0', 'fV1'].forEach(id => $(id).value = '');
  renderFileList(); plStop();
  $('fPlayer').hidden = $('fOverWrap').hidden = true;
  if (it.csv) {
    try {
      const buf = await readItem(it, 'csv');
      showCsv(it, parseCSV(new TextDecoder('utf-8').decode(buf)));
    } catch (e) { toast('CSV не открылся: ' + e.message); }
    return;
  }
  try {
    const [bb, mb] = await Promise.all([readItem(it, 'bin'), readItem(it, 'bmp')]);
    let shot = null, warn = [];
    if (mb) { try { shot = SCOPE.readScreenshot(mb); warn = shot.warn; } catch (e) { warn.push('снимок не прочитан: ' + e.message); } }
    if (!shot) shot = { tdiv: null, trigIndex: 150, ch: [{}, {}], img: null };
    if (!bb) warn.push('нет файла данных .bin — показан только снимок');
    if (!mb) warn.push('нет снимка .bmp — масштабы задайте вручную');
    const bin = bb ? SCOPE.readBin(bb) : null;
    fileData = { it, bin, shot, warn, shotURL: shot.img ? bmpURL(shot.img) : null };
    $('fileShot').src = fileData.shotURL || '';
    if (!bin && fileData.shotURL) segClick('fView', 'shot');
    drawFile();
  } catch (e) { toast('Не удалось открыть: ' + e.message); }
}
function showCsv(it, csv) {
  csvPrep(csv);
  fileData = { it, csv, csvFresh: true, stripFresh: true, warn: [], shot: { ch: [{}, {}] }, shotURL: null };
  if (csv.frames.length > 1) {
    $('fPlayer').hidden = $('fOverWrap').hidden = false;
    if (csv.ftKind === 'trig') { const k = csv.ftime.findIndex(t => t >= 0); fOver.frame = k > 0 ? k : 0; }   // event: start at the trigger
    fMode = 'frame'; segSet('pMode', 'frame');
  }
  segClick('fView', 'plot'); drawFile();
}
function segClick(id, v) { const b = $(id).querySelector(`[data-v="${v}"]`); b && b.click(); }
function fileView() {
  if (fileData && fileData.csv) return csvView();
  if (!fileData || !fileData.bin) return null;
  const { bin, shot } = fileData;
  const b = SCOPE.build(bin, shot, { tdiv: fOver.tdiv, vdiv0: fOver.vdiv0, vdiv1: fOver.vdiv1, zero0: fOver.zero0, zero1: fOver.zero1 });
  const y = [0, 1].map(c => { const a = new Float32Array(N).fill(NaN); for (let i = 0; i < bin.n; i++) a[i] = bin.ch[c][i]; return a; });
  return {
    n: bin.n, y, on: b.chans.map(c => c.on), v0: b.chans.map(c => c.v0), vdiv: b.chans.map((c, k) => c.vdiv == null ? null : c.vdiv * KS(k)), tdiv: b.tdiv, trigX: b.trig, trigL: null, draggableTrig: false,
    badge: shot.state === 'STOP' ? ['STOP', '#E36A5C'] : null,
    onZero: (c, d) => { fOver['zero' + c] = 248 - (128 + d * PXDIV); },
    _b: b,
  };
}
let fShow = 'plot';
segInit('fView', v => { fShow = v; drawFile(); });
segInit('fCur', v => { getView('filePlot').cur = v; drawFile(); });
$('fTdiv').onchange = e => { fOver.tdiv = e.target.value ? +e.target.value : undefined; drawFile(); };
$('fV0').onchange = e => { fOver.vdiv0 = e.target.value ? +e.target.value : undefined; drawFile(); };
$('fV1').onchange = e => { fOver.vdiv1 = e.target.value ? +e.target.value : undefined; drawFile(); };
function drawFile() {
  const data = fileView(), cv = $('filePlot');
  $('fileEmpty').style.display = fileData ? 'none' : 'flex';
  $('fileShot').hidden = fShow !== 'shot' || !fileData || !fileData.shotURL;
  cv.style.visibility = fShow === 'shot' && fileData && fileData.shotURL ? 'hidden' : 'visible';
  cv._g = drawScope(cv, data);
  const sh = fileData && fileData.shot;
  $('fileChips').innerHTML = fileData && fileData.csv ? [
    `<span class="chip"><b>${esc(fileData.it.name)}</b></span>`,
    (d => `<span class="chip">${d.n.toLocaleString('ru-RU')} точек · ${fmtT(d.csvFrame.t[d.n - 1] - d.csvFrame.t[0])}</span>`)(data.measData || data),
    data.on[0] ? `<span class="chip c1">CH1 <b>${vdivNameC(0, data.vdiv[0])}</b></span>` : '',
    data.on[1] ? `<span class="chip c2">CH2 <b>${vdivNameC(1, data.vdiv[1])}</b></span>` : '',
  ].join('') : fileData ? [
    `<span class="chip">№ <b>${esc(fileData.it.name)}</b></span>`,
    `<span class="chip">Развёртка <b>${data && data.tdiv ? tdivName(data.tdiv) : '?'}</b></span>`,
    data && data.on[0] ? `<span class="chip c1">CH1 <b>${data.vdiv[0] ? vdivNameC(0, data.vdiv[0]) : '?'}</b>${sh.ch[0].coupling ? ' · ' + sh.ch[0].coupling : ''}${sh.ch[0].probe ? ' · ' + sh.ch[0].probe : ''}</span>` : '',
    data && data.on[1] ? `<span class="chip c2">CH2 <b>${data.vdiv[1] ? vdivNameC(1, data.vdiv[1]) : '?'}</b>${sh.ch[1].coupling ? ' · ' + sh.ch[1].coupling : ''}${sh.ch[1].probe ? ' · ' + sh.ch[1].probe : ''}</span>` : '',
  ].join('') : '';
  $('fileMeas').innerHTML = data ? measHTML(data.measData || data) : '';
  if (fileData && fileData.csv && fileData.csv.frames.length > 1) { drawOverview(); playerText(); }
  $('fWarn').textContent = fileData ? fileData.warn.join(' · ') : '';
  $('fCurOut').innerHTML = cursorText(getView('filePlot'), data);
}
function playerText() {
  const C = fileData.csv, k = fPos(), n = C.frames.length;
  const rel = C.hasT ? relT(C, k) + (C.ftKind === 'trig' ? ' от срабатывания' : '') : '';
  const dur = C.hasT ? ' · из ' + durText(C.ftime[n - 1] - C.ftime[0]) : '';
  $('pTxt').textContent = `кадр ${k + 1} / ${n}` + (rel ? ' · ' + rel : '') + dur;
  $('pTxt').title = $('pTxt').textContent;
  $('pPlay').textContent = PL.on ? '⏸' : '▶'; $('pPlay').classList.toggle('on', PL.on);
}
function setFrame(k, fromPlayer) {
  const C = fileData && fileData.csv; if (!C) return;
  if (!fromPlayer) plStop();
  fOver.frame = Math.max(0, Math.min(C.frames.length - 1, Math.round(k)));
  if (fMode === 'strip' && C.strip) {   // keep the current frame in view
    const v = getView('filePlot'), a = fOver.frame * C.strip.pitch, b = a + C.strip.w[fOver.frame], span = v.t1 - v.t0;
    if (a < v.t0 || b > v.t1) { let t0 = (a + b) / 2 - span / 2; t0 = Math.max(0, Math.min(C.frames.length * C.strip.pitch - span, t0)); v.t0 = t0; v.t1 = t0 + span; }
  }
  drawFileSoon();
}
// player: frames follow their recorded timestamps (a long pause is shortened to 1 s)
const PL = { on: false, last: 0, acc: 0 };
function plStop() { if (PL.on) { PL.on = false; if (fileData && fileData.csv) playerText(); } }
function plStart() {
  const C = fileData && fileData.csv; if (!C || C.frames.length < 2) return;
  if (fPos() >= C.frames.length - 1) fOver.frame = 0;
  PL.on = true; PL.last = performance.now(); PL.acc = 0; playerText(); requestAnimationFrame(plTick);
}
function plTick(ts) {
  if (!PL.on || !fileData || !fileData.csv) return;
  const C = fileData.csv, n = C.frames.length, sp = +$('pSpeed').value || 1;
  PL.acc += Math.max(0, ts - PL.last) / 1000 * sp; PL.last = ts;
  let k = fPos();
  while (k < n - 1) { const d = Math.min(1, Math.max(0.001, C.ftime[k + 1] - C.ftime[k])); if (PL.acc < d) break; PL.acc -= d; k++; }
  if (k !== fPos()) setFrame(k, true);
  if (k >= n - 1) { PL.on = false; playerText(); return; }
  requestAnimationFrame(plTick);
}
$('pPlay').onclick = () => PL.on ? plStop() : plStart();
$('pPrev').onclick = () => setFrame(fPos() - 1); $('pNext').onclick = () => setFrame(fPos() + 1);
$('pFirst').onclick = () => setFrame(0); $('pLast').onclick = () => setFrame(1e9);
segInit('pMode', v => { fMode = v; if (fileData) { fileData.stripFresh = true; fileData.csvFresh = true; } drawFile(); });
addEventListener('keydown', e => {
  if (mode !== 'files' || !fileData || !fileData.csv || fileData.csv.frames.length < 2 || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const k = fPos(), step = e.shiftKey ? 10 : 1;
  if (e.code === 'ArrowRight') { e.preventDefault(); setFrame(k + step); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); setFrame(k - step); }
  else if (e.code === 'Space') { e.preventDefault(); PL.on ? plStop() : plStart(); }
  else if (e.code === 'Home') { e.preventDefault(); setFrame(0); }
  else if (e.code === 'End') { e.preventDefault(); setFrame(1e9); }
});
// overview: the whole record — envelope of every frame per channel, the current frame, the trigger (t = 0)
function ovGeom() { const cv = $('fOverview'), W = cv.clientWidth; return { ml: 8, mr: 8, W }; }
function ovX(C, k, G) { const t0 = C.ftime[0], t1 = C.ftime[C.frames.length - 1] || 1; return G.ml + (C.ftime[k] - t0) / ((t1 - t0) || 1) * (G.W - G.ml - G.mr); }
function ovFrameAt(C, px) {
  const G = ovGeom(), t0 = C.ftime[0], t1 = C.ftime[C.frames.length - 1], t = t0 + (px - G.ml) / ((G.W - G.ml - G.mr) || 1) * (t1 - t0);
  let lo = 0, hi = C.frames.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (C.ftime[m] < t) lo = m; else hi = m; }
  return Math.abs(C.ftime[lo] - t) <= Math.abs(C.ftime[hi] - t) ? lo : hi;
}
function drawOverview() {
  const C = fileData.csv, c = canvasCtx($('fOverview')); if (!c) return;
  const { x, W, H } = c, G = ovGeom(), n = C.frames.length, col = [cssVar('--ch1'), cssVar('--ch2')], top = 6, bot = H - 16;
  x.fillStyle = cssVar('--scr'); x.fillRect(0, 0, W, H);
  for (const ch of [1, 0]) {
    let lo = Infinity, hi = -Infinity; for (const s of C.stats) if (s[ch]) { lo = Math.min(lo, s[ch].min); hi = Math.max(hi, s[ch].max); }
    if (!(hi > lo)) continue;
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
    x.strokeStyle = col[ch]; x.globalAlpha = .75; x.lineWidth = Math.max(1, Math.min(4, (W - G.ml - G.mr) / n * 0.8)); x.beginPath();
    C.stats.forEach((s, k) => { if (!s[ch]) return; const px = Math.round(ovX(C, k, G)) + .5; x.moveTo(px, Y(s[ch].min)); x.lineTo(px, Y(s[ch].max) - 0.5); });
    x.stroke(); x.globalAlpha = 1;
  }
  if (C.hasT && C.ftime[0] < 0 && C.ftime[n - 1] > 0) {   // trigger moment
    const t0 = C.ftime[0], t1 = C.ftime[n - 1], px = G.ml - t0 / (t1 - t0) * (W - G.ml - G.mr);
    x.strokeStyle = cssVar('--orange'); x.setLineDash([3, 3]); x.beginPath(); x.moveTo(px, 2); x.lineTo(px, bot); x.stroke(); x.setLineDash([]);
  }
  const px = ovX(C, fPos(), G); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(px - 4, 0, 8, bot + 2); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(px, 0); x.lineTo(px, bot + 2); x.stroke();
  x.fillStyle = '#86A9B3'; x.font = '10.5px Inter, sans-serif'; x.textBaseline = 'bottom';
  const lab = k => C.hasT ? relT(C, k) : 'кадр ' + (k + 1);
  x.textAlign = 'left'; x.fillText(lab(0), G.ml, H - 2); x.textAlign = 'right'; x.fillText(lab(n - 1), W - G.mr, H - 2);
  if (C.hasT && C.ftime[0] < 0 && C.ftime[n - 1] > 0) { x.textAlign = 'center'; x.fillStyle = cssVar('--orange'); x.fillText('срабатывание', G.ml - C.ftime[0] / (C.ftime[n - 1] - C.ftime[0]) * (W - G.ml - G.mr), H - 2); }
}
(() => {
  const cv = $('fOverview'), at = e => e.clientX - cv.getBoundingClientRect().left;
  cv.addEventListener('mousedown', e => {
    const C = fileData && fileData.csv; if (!C) return; e.preventDefault(); setFrame(ovFrameAt(C, at(e)));
    const mv = ev => setFrame(ovFrameAt(C, at(ev))), up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
  cv.addEventListener('wheel', e => { if (!fileData || !fileData.csv) return; e.preventDefault(); setFrame(fPos() + (e.deltaY > 0 ? 1 : -1) * (e.shiftKey ? 10 : 1)); }, { passive: false });
})();
let fileRaf = 0; const drawFileSoon = () => { if (!fileRaf) fileRaf = requestAnimationFrame(() => { fileRaf = 0; drawFile(); }); };   // mousemove over a long CSV used to recompute everything per event
attachPlotMouse($('filePlot'), fileView, drawFileSoon);
hoverable($('filePlot'), drawFileSoon);
$('fPng').onclick = () => { if (!fileData) return; saveOut(`PUF_${fileData.it.name}.png`, canvasPNG($('filePlot'))); };
$('fCsv').onclick = () => {
  const d = fileView(); if (!d) return toast('Нет данных .bin');
  if (fileData.ev) return recSave(fileData.ev);
  if (fileData.csv) return toast('Это уже CSV-файл');
  const b = d._b, lines = [`﻿время, с;CH1, ${UN(0)};CH2, ${UN(1)}`];
  for (let i = 0; i < b.n; i++) lines.push([num(b.t[i]), b.chans[0].on ? num(b.chans[0].volts[i] * KS(0)) : '', b.chans[1].on ? num(b.chans[1].volts[i] * KS(1)) : ''].join(';'));
  saveOut(`PUF_${fileData.it.name}.csv`, utf8(lines.join('\r\n')));
};

// ======================= ELECTRIC DRIVE TOOLS =======================
// ---- sensors (scale factors / units) ----
const SENS_PRESETS = [
  ['v1', 'Напряжение напрямую', 1, 'В'], ['pt6', 'ТН 6000/100 В', 60, 'В'], ['pt63', 'ТН 6300/100 В', 63, 'В'], ['pt10', 'ТН 10000/100 В', 100, 'В'],
  ['pt04', 'ТН 380/100 В', 3.8, 'В'], ['cl1', 'Токовые клещи 1 мВ/А', 1000, 'А'], ['cl10', 'Токовые клещи 10 мВ/А', 100, 'А'], ['cl100', 'Токовые клещи 100 мВ/А', 10, 'А'],
  ['sh', 'Шунт 1 мОм (1 мВ = 1 А)', 1000, 'А'], ['custom', 'Свой коэффициент', null, null]];
function buildSensors() {
  $$('.sens').forEach(card => {
    const c = +card.dataset.ch, s = S.sens[c];
    card.innerHTML = `<div class="ch"><i class="sq c${c + 1}"></i><b>Канал ${c + 1}</b></div>
      <div class="row"><span>Название</span><input type="text" class="sName" placeholder="например, Uab сети или Ia двигателя" maxlength="24"></div>
      <div class="row"><span>Датчик</span><select class="sPre">${SENS_PRESETS.map(p => `<option value="${p[0]}">${p[1]}</option>`).join('')}</select></div>
      <div class="row"><span>Коэффициент</span><input type="number" class="sK" step="any"><span class="u">× к напряжению на входе</span></div>
      <div class="row"><span>Единица</span><div class="seg sm sUnit"><button data-v="В">В (напряжение)</button><button data-v="А">А (ток)</button></div></div>
      <div class="res"></div>`;
    const q = sel => card.querySelector(sel);
    const upd = () => {
      q('.sName').value = s.name || ''; q('.sPre').value = s.preset || 'custom'; q('.sK').value = s.k;
      card.querySelectorAll('.sUnit button').forEach(b => b.classList.toggle('on', b.dataset.v === s.unit));
      q('.res').textContent = `1 В на входе прибора = ${si(s.k, s.unit, 4)} · 100 мВ = ${si(0.1 * s.k, s.unit, 4)}`;
    };
    const changed = () => { upd(); saveSettings(); resetProc(); TAPE.T.prev = null; needDraw = true; };
    q('.sName').oninput = e => { s.name = e.target.value.trim(); saveSettings(); };
    q('.sPre').onchange = e => { const p = SENS_PRESETS.find(x => x[0] === e.target.value); s.preset = p[0]; if (p[2] != null) { s.k = p[2]; s.unit = p[3]; } changed(); };
    q('.sK').onchange = e => { const k = parseFloat(String(e.target.value).replace(',', '.')); if (k && isFinite(k) && k > 0) { s.k = k; s.preset = 'custom'; } changed(); };
    card.querySelectorAll('.sUnit button').forEach(b => b.onclick = () => { s.unit = b.dataset.v; changed(); });
    upd();
  });
}

// ---- signals for analysis: unsmoothed, in real units; prefers the full capture memory ----
function sigs() {
  const fr = cur; if (!fr || !fr.tdiv || performance.now() - lastFrameAt > 2000) return null;
  const dtS = fr.tdiv / PXDIV;
  const on = [0, 1].map(c => !!(fr.mask & (1 << c)));
  const deepOk = c => deep.buf[c] && deep.cal[c] && deep.cal[c].tIdx === fr.tIdx && performance.now() - deep.t < 1500;
  const useDeep = (on[0] || on[1]) && [0, 1].every(c => !on[c] || deepOk(c));
  const ch = [0, 1].map(c => {
    if (!on[c]) return { on: false };
    const vd = fr.vdiv[c] || 1, z = zeroRaw(c);
    let t, v, clip = 0;
    if (useDeep) {
      const cal = deep.cal[c], b = deep.buf[c], n = DEEP_N - 1; t = new Float64Array(n); v = new Float64Array(n);
      for (let i = 1; i < DEEP_N; i++) { const r = cal.a * b[i] + cal.b; t[i - 1] = (i - cal.o) / cal.s * dtS; v[i - 1] = (r - z) / PXDIV * vd; if (r <= 28.5 || r >= 227.5) clip++; }
    } else {
      t = new Float64Array(N); v = new Float64Array(N);
      for (let i = 0; i < N; i++) { const r = fr.raw[c][i]; t[i] = i * dtS; v[i] = (r - z) / PXDIV * vd; if (r <= 28 || r >= 228) clip++; }
    }
    return { on: true, t, v, clip, dt: t[1] - t[0] };
  });
  return { fr, deep: useDeep, ch, key: useDeep ? 'd' + deep.t : 's' + fr.seq + ':' + lastTraceChange, span: (useDeep ? (DEEP_N - 1) / deep.cal[on[0] ? 0 : 1].s : N) * dtS };
}
function boxcarF(v, w) { if (w < 2) return v; const o = new Float64Array(v.length), h = w >> 1; let s = 0, n = 0; for (let i = -h; i < v.length; i++) { const a = i + h, r = i - h - 1; if (a < v.length) { s += v[a]; n++; } if (r >= 0) { s -= v[r]; n--; } if (i >= 0) o[i] = s / n; } return o; }
function risingT(t, v, frac = 0.5, hyst = 0.1) {
  let mn = Infinity, mx = -Infinity; for (const x of v) { if (x < mn) mn = x; if (x > mx) mx = x; }
  const pp = mx - mn; if (!(pp > 0)) return { cr: [], idx: [], mn, mx };
  const L = mn + frac * pp, h = pp * hyst, cr = [], idx = []; let armed = false;
  for (let i = 1; i < v.length; i++) {
    if (v[i] < L - h) armed = true;
    if (armed && v[i - 1] < L && v[i] >= L) { const f = (L - v[i - 1]) / (v[i] - v[i - 1]); cr.push(t[i - 1] + (t[i] - t[i - 1]) * f); idx.push(i); armed = false; }
  }
  return { cr, idx, mn, mx, L };
}
// low-pass for the fundamental: centred (zero-phase) triangle filter ~0.8 ms — removes the kHz PWM carrier, keeps 50 Hz phase
// with a known PWM carrier the window is exactly one carrier period: a boxcar of length 1/fc nulls the carrier and all its
// harmonics (two passes for the sidebands); 0 = default 0.8 ms (good for carriers ≥ ~1.5 kHz, weak at 800 Hz)
const lpfTau = () => +S.sync.fc > 0 ? 1 / +S.sync.fc : 0.0008;
function lpf(t, v, tau = lpfTau()) { const dt = t[1] - t[0]; const w = Math.max(3, Math.min(Math.floor(v.length / 12), Math.round(tau / dt))); return boxcarF(boxcarF(v, w), w); }
const freqOf = cr => cr.length >= 2 ? (cr.length - 1) / (cr[cr.length - 1] - cr[0]) : null;
function winStats(t, v, cr) {   // over whole periods when possible
  let a = 0, b = v.length;
  if (cr.length >= 2) { a = lowerIdx(t, cr[0]); b = lowerIdx(t, cr[cr.length - 1]); }
  let s = 0, s2 = 0, n = 0; for (let i = a; i < b; i++) { s += v[i]; s2 += v[i] * v[i]; n++; }
  return n ? { mean: s / n, rms: Math.sqrt(s2 / n), a, b, whole: cr.length >= 2 } : null;
}
function lowerIdx(t, x) { let lo = 0, hi = t.length - 1; if (x <= t[0]) return 0; if (x >= t[hi]) return hi; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m] < x) lo = m; else hi = m; } return hi; }
function interpAt(t, v, x) { const i = lowerIdx(t, x); if (i <= 0) return v[0]; const f = (x - t[i - 1]) / (t[i] - t[i - 1] || 1); return v[i - 1] + (v[i] - v[i - 1]) * f; }
function phaseBA(crA, crB, P) {   // + = B lags A, degrees
  if (!crA.length || !crB.length || !P) return null;
  let sx = 0, sy = 0, n = 0;
  for (const a of crA) { let best = null; for (const b of crB) { const d = b - a; if (best == null || Math.abs(d) < Math.abs(best)) best = d; } const ang = best / P * 2 * Math.PI; sx += Math.cos(ang); sy += Math.sin(ang); n++; }
  return n ? Math.atan2(sy, sx) * 180 / Math.PI : null;
}
const wrap180 = d => ((d % 360) + 540) % 360 - 180;
function harmonicsOf(t, v, f1, a, b, kmax) {   // rectangular window over whole periods → exact for steady signals
  const out = []; const n = b - a; if (n < 8 || !f1) return out;
  for (let k = 1; k <= kmax; k++) { let re = 0, im = 0; const w = 2 * Math.PI * k * f1; for (let i = a; i < b; i++) { re += v[i] * Math.cos(w * t[i]); im -= v[i] * Math.sin(w * t[i]); } out.push({ k, rms: 2 * Math.hypot(re, im) / n / Math.SQRT2, ph: Math.atan2(im, re) }); }
  return out;
}
const tile = (label, val, sub = '', cls = '') => `<div class="tile ${cls}"><span>${label}</span><b>${val}</b>${sub ? `<small title="${esc(String(sub).replace(/<[^>]*>/g, ''))}">${sub}</small>` : ''}</div>`;
const pct = (x, d = 1) => x == null || !isFinite(x) ? '—' : x.toFixed(d).replace('.', ',') + ' %';
const deg = (x, d = 1) => x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d).replace('.', ',') + '°';
const fHz = x => x == null || !isFinite(x) ? '—' : si(x, 'Гц', 5);
function srcNote(sg) { return sg ? (sg.deep ? 'по полной записи прибора' : 'по экрану (301 точка)') + ' · ' + fmtT(sg.span) : ''; }
function miniScope(id) { const cv = $(id); drawScope(cv, liveData(), { compact: true }); }
function canvasCtx(cv) { const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W || !H) return null; if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); } const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return { x, W, H }; }

// ---- 2. synchroscope ----
const syncHist = []; let syncKey = '';
function syncCompute(sg) {
  if (!sg || !sg.ch[0].on || !sg.ch[1].on) return null;
  const A = sg.ch[0], B = sg.ch[1];
  const fa = lpf(A.t, A.v), fb = lpf(B.t, B.v);
  const ra = risingT(A.t, fa, 0.5, 0.2), rb = risingT(B.t, fb, 0.5, 0.2);
  const f1 = freqOf(ra.cr), f2 = freqOf(rb.cr);
  if (!f1 || !rb.cr.length) return { err: 'на экране меньше двух периодов — сделайте развёртку медленнее (5–10 мс/дел)' };
  const phi = phaseBA(ra.cr, rb.cr, 1 / f1);
  const sa = winStats(A.t, fa, ra.cr), sb = winStats(B.t, fb, rb.cr);   // RMS of the fundamental-ish signal, not of PWM spikes
  const lead = wrap180(-phi - (+S.sync.offset || 0));    // + = CH2 (drive) ahead of CH1 (grid)
  return { f1, f2, lead, u1: sa.rms, u2: sb.rms };
}
function drawSync() {
  const sg = sigs(); const now = performance.now();
  let r = null;
  if (sg && sg.key !== syncKey) {
    syncKey = sg.key; r = syncCompute(sg);
    if (r && !r.err) {
      if (syncHist.length && syncHist[syncHist.length - 1].tIdx !== sg.fr.tIdx) syncHist.length = 0;
      const last = syncHist[syncHist.length - 1]; let un = r.lead;
      if (last) { while (un - last.un > 180) un -= 360; while (un - last.un < -180) un += 360; }
      syncHist.push({ t: now / 1000, un, tIdx: sg.fr.tIdx, ...r }); while (syncHist.length && now / 1000 - syncHist[0].t > 8) syncHist.shift();
    } else if (r && r.err) syncHist.length = 0;
    drawSync.lastErr = r && r.err;
  }
  const h = syncHist.filter(p => now / 1000 - p.t < 3), last = syncHist[syncHist.length - 1];
  const fresh = last && now / 1000 - last.t < 1.5;
  let df = null;
  if (h.length >= 4) { const n = h.length, mt = h.reduce((s, p) => s + p.t, 0) / n, mu = h.reduce((s, p) => s + p.un, 0) / n; let num = 0, den = 0; for (const p of h) { num += (p.t - mt) * (p.un - mu); den += (p.t - mt) ** 2; } if (den > 0) df = num / den / 360; }
  if (df == null && last) df = last.f2 - last.f1;
  const dU = last ? (last.u2 - last.u1) / last.u1 * 100 : null;
  const T = S.sync, okF = df != null && Math.abs(df) <= T.tolF, okP = last && Math.abs(last.lead) <= T.tolPhi, okU = dU != null && Math.abs(dU) <= T.tolU;
  // dial
  const c = canvasCtx($('syncDial'));
  if (c) {
    const { x, W, H } = c, R = Math.min(W, H) / 2 - 34, cx = W / 2, cy = H / 2 - 12;
    x.clearRect(0, 0, W, H);
    x.fillStyle = cssVar('--scr'); x.beginPath(); x.arc(cx, cy, R + 12, 0, 7); x.fill();
    const a2 = d => (d - 90) * Math.PI / 180;
    x.fillStyle = 'rgba(63,203,142,.22)'; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a2(-T.tolPhi), a2(T.tolPhi)); x.fill();
    x.strokeStyle = 'rgba(160,210,220,.5)'; x.lineWidth = 2; x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke();
    x.font = '600 12px Inter, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let d = -150; d <= 180; d += 30) { const a = a2(d); x.strokeStyle = 'rgba(160,210,220,.6)'; x.lineWidth = d % 90 === 0 ? 2.5 : 1.2; x.beginPath(); x.moveTo(cx + Math.cos(a) * (R - (d % 90 === 0 ? 14 : 8)), cy + Math.sin(a) * (R - (d % 90 === 0 ? 14 : 8))); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke(); if (d % 90 === 0) { x.fillStyle = '#86A9B3'; x.fillText((d === 180 ? '180' : d > 0 ? '+' + d : d) + '°', cx + Math.cos(a) * (R - 30), cy + Math.sin(a) * (R - 30)); } }
    x.fillStyle = '#86A9B3'; x.font = '12.5px Inter, sans-serif'; x.textBaseline = 'bottom'; x.textAlign = 'left'; x.fillText('↺ ЧП медленнее', 6, H - 4); x.textAlign = 'right'; x.fillText('ЧП быстрее ↻', W - 6, H - 4); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (fresh) {
      const a = a2(last.lead), ok = okF && okP && okU, col = ok ? '#3FCB8E' : cssVar('--orange');
      x.strokeStyle = col; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - Math.cos(a) * 16, cy - Math.sin(a) * 16); x.lineTo(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6)); x.stroke();
      x.fillStyle = col; x.beginPath(); x.arc(cx, cy, 9, 0, 7); x.fill();
      x.fillStyle = '#E8F3F6'; x.font = '700 26px Inter, sans-serif'; x.fillText(deg(last.lead, 1), cx, cy + R * 0.42);
      x.font = '13px Inter, sans-serif'; x.fillStyle = '#86A9B3'; x.fillText(df != null ? 'Δf ' + (df >= 0 ? '+' : '−') + Math.abs(df).toFixed(3).replace('.', ',') + ' Гц' : '', cx, cy + R * 0.42 + 26);
    } else { x.fillStyle = '#86A9B3'; x.font = '600 14px Inter, sans-serif'; x.fillText(drawSync.lastErr || 'нет данных', cx, cy + R * 0.42); }
  }
  // state & tiles
  const st = $('syncState');
  if (!fresh) { st.className = 'bigstate'; st.innerHTML = drawSync.lastErr ? 'Недостаточно данных<small>' + drawSync.lastErr + '</small>' : 'Нет данных<small>нужны оба канала: CH1 — сеть, CH2 — частотник</small>'; }
  else if (okF && okP && okU) { st.className = 'bigstate ok'; st.innerHTML = 'СИНХРОННО ✓<small>частота, угол и напряжение в допуске</small>'; }
  else {
    const why = [!okF ? 'Δf' : '', !okP ? 'угол' : '', !okU ? 'напряжение' : ''].filter(Boolean).join(', ');
    let eta = '';
    if (df != null && Math.abs(df) > 0.002 && Math.abs(df) <= 2) { const m = ((last.lead % 360) + 360) % 360, rem = df > 0 ? (360 - m) % 360 : m; eta = ` · совпадение фаз через ${(rem / 360 / Math.abs(df)).toFixed(1).replace('.', ',')} с`; }
    st.className = 'bigstate bad'; st.innerHTML = 'НЕ СИНХРОННО<small>вне допуска: ' + why + eta + '</small>';
  }
  if (fresh) drawSync.tiles = [
    tile('Частота сети (CH1)', fHz(last.f1)), tile('Частота ЧП (CH2)', fHz(last.f2)),
    tile('Разность частот Δf', df == null ? '—' : (df >= 0 ? '+' : '−') + Math.abs(df).toFixed(3).replace('.', ',') + ' Гц', df > 0 ? 'ЧП быстрее' : df < 0 ? 'ЧП медленнее' : '', okF ? 'ok' : 'bad'),
    tile('Угол Δφ', deg(last.lead), last.lead > 0 ? 'ЧП опережает' : 'ЧП отстаёт', okP ? 'ok' : 'bad'),
    tile('U сети (CH1)', fmtC(0, last.u1, 4)), tile('U ЧП (CH2)', fmtC(1, last.u2, 4)),
    tile('Разность ΔU', (dU >= 0 ? '+' : '') + pct(dU), '', okU ? 'ok' : 'bad'),
  ].join('');
  $('syncTiles').innerHTML = drawSync.tiles || ''; $('syncTiles').classList.toggle('stale', !fresh);
  $('syncNote').textContent = sg ? srcNote(sg) + (+S.sync.fc > 0 ? ` · фильтр ШИМ под несущую ${S.sync.fc} Гц` : ' · фильтр ШИМ (для несущей от ~1,5 кГц; ниже — задайте несущую)') + ': частота и угол по основной гармонике' + (UN(0) !== UN(1) ? ' · внимание: у каналов разные единицы' : '') : 'нет данных от прибора';
  miniScope('syncScope');
}

// ---- 3. power ----
function drawPower() {
  const sg = sigs(); miniScope('pwScope');
  $('pwSrc').textContent = srcNote(sg);
  if (!sg || !sg.ch[0].on || !sg.ch[1].on) { $('pwTiles').innerHTML = tile('Нужны оба канала', '—', 'CH1 — напряжение, CH2 — ток'); $('pwHarm').innerHTML = ''; $('pwThd').textContent = ''; $('pwNote').textContent = 'включите оба канала'; return; }
  const U = sg.ch[0], I = sg.ch[1], inv = S.power.inv ? -1 : 1, mult = +S.power.mult || 1;
  const iv = new Float64Array(U.t.length); for (let k = 0; k < iv.length; k++) iv[k] = inv * interpAt(I.t, I.v, U.t[k]);
  const ru = risingT(U.t, lpf(U.t, U.v), 0.5, 0.2), ri = risingT(U.t, lpf(U.t, iv), 0.5, 0.2);
  const f = freqOf(ru.cr);
  const w = winStats(U.t, U.v, ru.cr); if (!w) return;
  let p = 0, i2 = 0, u2 = 0, n = 0; for (let k = w.a; k < w.b; k++) { p += U.v[k] * iv[k]; u2 += U.v[k] ** 2; i2 += iv[k] ** 2; n++; }
  p /= n; const Ur = Math.sqrt(u2 / n), Ir = Math.sqrt(i2 / n), Sva = Ur * Ir;
  const phiX = f ? phaseBA(ru.cr, ri.cr, 1 / f) : null;   // + = current lags (inductive), by zero crossings
  const kmax = f ? Math.max(1, Math.min(25, Math.floor(1 / (2 * U.dt) / f) - 1)) : 0;
  const hu = w.whole ? harmonicsOf(U.t, U.v, f, w.a, w.b, kmax) : [], hi = w.whole ? harmonicsOf(U.t, iv, f, w.a, w.b, kmax) : [];
  // fundamental: φ1 from the phases of the 1st harmonics, Q1 = U1·I1·sin φ1; the rest of S is distortion power D
  // (√(S²−P²) alone also counts the PWM/rectifier harmonics as "reactive")
  const fund = hu.length && hi.length && hu[0].rms > 0 && hi[0].rms > 0;
  const phi = fund ? wrap180((hu[0].ph - hi[0].ph) * 180 / Math.PI) : phiX;
  const Q = fund ? hu[0].rms * hi[0].rms * Math.sin(phi * Math.PI / 180) : Math.sign(phi || 0) * Math.sqrt(Math.max(0, Sva * Sva - p * p));
  const D = fund ? Math.sqrt(Math.max(0, Sva * Sva - p * p - Q * Q)) : null, pf = Sva ? p / Sva : null;
  const thd = h => h.length > 1 && h[0].rms > 0 ? Math.sqrt(h.slice(1).reduce((s, q) => s + q.rms ** 2, 0)) / h[0].rms * 100 : null;
  const pu = UN(0), pi = UN(1), punit = pu === 'В' && pi === 'А' ? ['Вт', 'вар', 'В·А'] : ['ед.', 'ед.', 'ед.'];
  $('pwTiles').innerHTML = [
    tile('Напряжение U', fmtC(0, Ur, 4), 'СКЗ'), tile('Ток I', fmtC(1, Ir, 4), 'СКЗ'),
    tile('Активная P', si(p * mult, punit[0], 4), mult > 1 ? '×3 фазы' : ''), tile(fund ? 'Реактивная Q₁' : 'Реактивная Q', si(Q * mult, punit[1], 4), (phi > 0 ? 'индуктивная' : phi < 0 ? 'ёмкостная' : '') + (fund ? ' · по 1-й гармонике' : '')),
    tile('Мощность искажений D', D == null ? '—' : si(D * mult, punit[2], 4), 'гармоники и шум'),
    tile('Полная S', si(Sva * mult, punit[2], 4)), tile('Коэф. мощности λ', pf == null ? '—' : pf.toFixed(3).replace('.', ',')),
    tile(fund ? 'Угол φ₁ (U→I)' : 'Угол φ (U→I)', deg(phi), phi > 0 ? 'ток отстаёт' : phi < 0 ? 'ток опережает' : ''), tile(fund ? 'cos φ₁' : 'cos φ', phi == null ? '—' : Math.cos(phi * Math.PI / 180).toFixed(3).replace('.', ',')),
    tile('Частота', fHz(f)), tile('КНИ U', pct(thd(hu))), tile('КНИ I', pct(thd(hi))),
  ].join('');
  $('pwThd').textContent = hi.length ? `до ${hi.length}-й гармоники · окно ${ru.cr.length - 1} периодов` : 'нужно хотя бы 2 периода';
  $('pwHarm').innerHTML = hi.slice(0, 15).map(q => `<div class="m ${q.k === 1 ? 'f1' : ''}"><span>${q.k}-я${f ? ' · ' + si(q.k * f, 'Гц', 3) : ''}</span><b>${q.k === 1 ? fmtC(1, q.rms) : pct(q.rms / hi[0].rms * 100)}</b></div>`).join('');
  const notes = []; if (pu !== 'В' || pi !== 'А') notes.push('для мощности в ваттах задайте на «Датчиках»: CH1 — В, CH2 — А');
  if (U.clip > 2 || I.clip > 2) notes.push('сигнал обрезан краем экрана — результат неверен');
  if (!w.whole) notes.push('меньше двух периодов на экране — развёртку медленнее');
  notes.push('λ = P/S учитывает и сдвиг, и гармоники; cos φ₁ — только сдвиг основной гармоники; S² = P² + Q₁² + D²');
  $('pwNote').textContent = notes.join(' · ');
}

// ---- 4. start-up recorder ----
const TR = { t: [], r: [[], []], f: [[], []], key: '' };
const ST = { mode: 'trend', trig: null, i0: 0, i1: null, res: null };
function trendPush() {
  const fr = cur; if (!fr || !fr.tdiv || performance.now() - lastFrameAt > 1500) return;
  const key = lastTraceChange; if (key === TR.key || lastTraceChange < performance.now() - 1200) return; TR.key = key;
  const dtS = fr.tdiv / PXDIV, t = new Float64Array(N); for (let i = 0; i < N; i++) t[i] = i * dtS;
  const now = Date.now() / 1000;
  TR.t.push(now);
  for (const c of [0, 1]) {
    if (!(fr.mask & (1 << c))) { TR.r[c].push(NaN); TR.f[c].push(NaN); continue; }
    const vd = fr.vdiv[c] || 1, z = zeroRaw(c), v = new Float64Array(N); for (let i = 0; i < N; i++) v[i] = (fr.raw[c][i] - z) / PXDIV * vd;
    const r = risingT(t, lpf(t, v), 0.5, 0.2), w = winStats(t, v, r.cr);
    TR.r[c].push(w ? w.rms : NaN); TR.f[c].push(freqOf(r.cr) ?? NaN);
  }
  const MAX = 30000; if (TR.t.length > MAX) { const d = TR.t.length - MAX; TR.t.splice(0, d); for (const c of [0, 1]) { TR.r[c].splice(0, d); TR.f[c].splice(0, d); } ST.i0 = Math.max(0, ST.i0 - d); if (ST.i1 != null) ST.i1 = Math.max(0, ST.i1 - d); }
  // trigger logic
  const c = +S.start.ch, last = TR.r[c][TR.r[c].length - 1];
  if (ST.mode === 'armed' && S.start.thr > 0 && last > S.start.thr) { ST.mode = 'rec'; ST.trig = now; let i = TR.t.length - 1; while (i > 0 && TR.t[i - 1] >= now - (+S.start.pre || 0)) i--; ST.i0 = i; ST.i1 = null; startUI(); }
  if (ST.mode === 'rec') {
    const el = now - ST.trig;
    if (el > 300) stopStart();
    else if (S.start.auto && el > 3) { const i3 = TR.t.findIndex(x => x >= now - 3); const seg = TR.r[c].slice(i3).filter(isFinite); if (seg.length > 8) { const m = seg.reduce((a, b) => a + b, 0) / seg.length; if (m > 0 && seg.every(v => Math.abs(v - m) <= 0.05 * m)) stopStart(); } }
  }
}
function stopStart() { if (ST.mode === 'rec') { ST.mode = 'done'; ST.i1 = TR.t.length - 1; ST.res = startResults(); } else if (ST.mode === 'armed') ST.mode = 'trend'; startUI(); }
function startResults() {
  const c = +S.start.ch, i0 = ST.i0, i1 = ST.i1 ?? TR.t.length - 1, r = TR.r[c];
  let pk = -Infinity, ipk = i0; for (let i = i0; i <= i1; i++) if (r[i] > pk) { pk = r[i]; ipk = i; }
  const tEnd = TR.t[i1]; const tail = []; for (let i = i1; i >= i0 && TR.t[i] >= tEnd - 2; i--) if (isFinite(r[i])) tail.push(r[i]);
  const steady = tail.length ? tail.reduce((a, b) => a + b, 0) / tail.length : null;
  let iset = null; if (steady) { for (let i = i1; i >= ipk; i--) if (Math.abs(r[i] - steady) > 0.1 * steady) { iset = i + 1; break; } if (iset == null) iset = ipk; }
  const fr = [0, 1].map(k => { const a = TR.f[k].slice(i0, i1 + 1).filter(isFinite); return a.length ? [Math.min(...a), Math.max(...a), a[a.length - 1]] : null; });
  return { pk, tpk: TR.t[ipk] - ST.trig, steady, tset: iset != null && ST.trig ? TR.t[Math.min(iset, i1)] - ST.trig : null, fr, dur: tEnd - TR.t[i0] };
}
function startUI() {
  $('stArm').classList.toggle('on', ST.mode === 'armed'); $('stArm').lastChild.textContent = ST.mode === 'armed' ? 'Жду пуск…' : 'Ждать пуск';
  $('stState').textContent = { trend: 'тренд (последние 60 с)', armed: 'ожидание превышения порога', rec: '● запись пуска', done: 'пуск записан' }[ST.mode];
  $('stState').className = 'chip ' + (ST.mode === 'rec' ? 'st' : ST.mode === 'done' ? 'ok' : '');
  needDraw = true;
}
$('stArm').onclick = () => { if (!(S.start.thr > 0)) return toast('Задайте порог срабатывания (СКЗ)'); ST.mode = ST.mode === 'armed' ? 'trend' : 'armed'; ST.res = null; startUI(); };
$('stStop').onclick = () => { if (ST.mode === 'done') { ST.mode = 'trend'; ST.res = null; startUI(); } else stopStart(); };
$('stCsv').onclick = () => {
  const a = ST.mode === 'done' || ST.mode === 'rec' ? ST.i0 : Math.max(0, TR.t.length - 1800), b = ST.mode === 'done' ? ST.i1 : TR.t.length - 1;
  if (b <= a) return toast('Нет данных');
  const L = [`﻿время, с;CH1 СКЗ, ${UN(0)};CH2 СКЗ, ${UN(1)};CH1 f, Гц;CH2 f, Гц`]; const t0 = ST.trig || TR.t[a];
  for (let i = a; i <= b; i++) L.push([num(TR.t[i] - t0, 6), num(TR.r[0][i]), num(TR.r[1][i]), num(TR.f[0][i]), num(TR.f[1][i])].join(';'));
  saveOut(`PUF_start_${stamp()}.csv`, utf8(L.join('\r\n')));
};
function drawTrendChart(cv, t, panes, opts = {}) {
  const c = canvasCtx(cv); if (!c) return; const { x, W, H } = c;
  x.fillStyle = cssVar('--scr'); x.fillRect(0, 0, W, H);
  if (t.length < 2) { x.fillStyle = '#8FB4BF'; x.font = '600 13px Inter, sans-serif'; x.textAlign = 'center'; x.fillText(opts.empty || 'нет данных', W / 2, H / 2); return; }
  const t0 = opts.t0 ?? t[0], t1 = opts.t1 ?? t[t.length - 1], ml = 58, mr = 58, gap = 18;
  const ph = (H - 24 - gap * (panes.length - 1) - 8) / panes.length;
  const X = v => ml + (v - t0) / ((t1 - t0) || 1) * (W - ml - mr);
  panes.forEach((p, k) => {
    const top = 8 + k * (ph + gap);
    x.strokeStyle = cssVar('--grid2'); x.lineWidth = 1;
    for (let j = 0; j <= 4; j++) { const y = Math.round(top + j / 4 * ph) + .5; x.beginPath(); x.moveTo(ml, y); x.lineTo(W - mr, y); x.stroke(); }
    // p.shared: one scale for all series of the pane (to compare CH1 and CH2 directly); p.range: fixed scale
    let shLo = Infinity, shHi = -Infinity;
    if (p.shared) { const all = []; for (const s of p.series) for (const x of s.v) if (isFinite(x)) all.push(x); all.sort((a, b) => a - b); if (all.length) { shLo = all[Math.floor(all.length * 0.01)]; shHi = all[Math.ceil(all.length * 0.99) - 1]; } }   // 1…99 %: a single bad frame must not flatten the plot
    p.series.forEach((s, si_) => {
      let lo = Infinity, hi = -Infinity; for (const x of s.v) if (isFinite(x)) { if (x < lo) lo = x; if (x > hi) hi = x; }
      if (!(hi >= lo)) return;
      if (p.shared) { lo = shLo; hi = shHi; } if (p.zero) lo = Math.min(0, lo); if (hi - lo < 1e-12) { hi += Math.abs(hi) * 0.05 + 1e-6; lo -= Math.abs(lo) * 0.05 + 1e-6; } hi += (hi - lo) * 0.08;
      if (p.range) [lo, hi] = p.range;
      const Y = v => top + ph - (v - lo) / (hi - lo) * ph;
      x.save(); x.beginPath(); x.rect(ml, top - 1, W - ml - mr, ph + 2); x.clip();   // out-of-scale values stay inside their pane
      x.strokeStyle = s.color; x.lineWidth = 1.6; x.beginPath(); let pen = false;
      for (let i = 0; i < t.length; i++) { if (t[i] < t0 || t[i] > t1 || !isFinite(s.v[i])) { pen = false; continue; } const px = X(t[i]), py = Y(s.v[i]); if (!pen) { x.moveTo(px, py); pen = true; } else x.lineTo(px, py); }
      x.stroke(); x.restore();
      x.fillStyle = s.color; x.font = '11px Inter, sans-serif'; x.textBaseline = 'middle'; x.textAlign = si_ === 0 ? 'right' : 'left';
      for (let j = 0; j <= 4; j += 2) { const v = hi - j / 4 * (hi - lo); x.fillText(s.unit === '' ? Math.round(v).toLocaleString('ru-RU') : si(v, s.unit, 3), si_ === 0 ? ml - 6 : W - mr + 6, top + j / 4 * ph); }
      if (s.mark != null) { x.strokeStyle = s.color; x.setLineDash([5, 4]); x.globalAlpha = .6; x.beginPath(); x.moveTo(ml, Y(s.mark)); x.lineTo(W - mr, Y(s.mark)); x.stroke(); x.setLineDash([]); x.globalAlpha = 1; }
    });
    x.fillStyle = '#86A9B3'; x.font = '600 11px Inter, sans-serif'; x.textAlign = 'left'; x.textBaseline = 'top'; x.fillText(p.title, ml + 6, top + 4);
  });
  if (opts.vline != null && opts.vline >= t0 && opts.vline <= t1) { x.strokeStyle = cssVar('--orange'); x.setLineDash([4, 4]); x.beginPath(); x.moveTo(X(opts.vline), 8); x.lineTo(X(opts.vline), H - 24); x.stroke(); x.setLineDash([]); }
  x.fillStyle = '#86A9B3'; x.font = '11px Inter, sans-serif'; x.textBaseline = 'top';
  const ref = opts.ref ?? t1;
  for (let j = 0; j <= 6; j++) { const tv = t0 + j / 6 * (t1 - t0); x.textAlign = j === 0 ? 'left' : j === 6 ? 'right' : 'center'; const d = tv - ref; x.fillText((d < -1e-9 ? '−' : d > 1e-9 ? '+' : '') + si(Math.abs(d), 'с', 3).replace(/^0 с$/, '0'), X(tv), H - 18); }
}
function drawStart() {
  $('stThrU').textContent = UN(+S.start.ch) + ' СКЗ'; $('stNomU').textContent = UN(+S.start.ch) + ' (для кратности)';
  const c = +S.start.ch, col = [cssVar('--ch1'), cssVar('--ch2')];
  let t0, t1, ref;
  if (ST.mode === 'rec' || ST.mode === 'done') { t0 = TR.t[ST.i0]; t1 = ST.mode === 'done' ? TR.t[ST.i1] : TR.t[TR.t.length - 1]; ref = ST.trig; }
  else { t1 = TR.t[TR.t.length - 1]; t0 = t1 - 60; ref = t1; }
  drawTrendChart($('stChart'), TR.t, [
    { title: 'СКЗ', zero: true, series: [{ v: TR.r[c], color: col[c], unit: UN(c), mark: S.start.thr > 0 ? +S.start.thr : null }, { v: TR.r[1 - c], color: col[1 - c], unit: UN(1 - c) }] },
    { title: 'Частота', series: [{ v: TR.f[c], color: col[c], unit: 'Гц' }, { v: TR.f[1 - c], color: col[1 - c], unit: 'Гц' }] },
  ], { t0, t1, ref, vline: ST.trig && ST.mode !== 'trend' ? ST.trig : null, empty: 'жду кадры от прибора…' });
  const R = ST.mode === 'done' ? ST.res : ST.mode === 'rec' ? startResults() : null, U = UN(c), nom = +S.start.nom;
  const lastR = TR.r[c][TR.r[c].length - 1], lastF = TR.f[c][TR.f[c].length - 1];
  $('stTiles').innerHTML = R ? [
    tile('Пиковый СКЗ', fmtC(c, R.pk, 4), 'через ' + fmtT(Math.max(0, R.tpk)) + ' после старта'), tile('Кратность', nom > 0 ? (R.pk / nom).toFixed(2).replace('.', ',') + ' × Iном' : '—', nom > 0 ? '' : 'задайте номинал'),
    tile('Установившийся', R.steady ? fmtC(c, R.steady, 4) : '—', 'последние 2 с'), tile('Время пуска', R.tset != null ? fmtT(Math.max(0, R.tset)) : '—', 'до входа в ±10 % от установившегося'),
    tile('Частота CH' + (c + 1), R.fr[c] ? fHz(R.fr[c][2]) : '—', R.fr[c] ? 'от ' + si(R.fr[c][0], 'Гц', 3) + ' до ' + si(R.fr[c][1], 'Гц', 3) : ''),
    tile('Частота CH' + (2 - c), R.fr[1 - c] ? fHz(R.fr[1 - c][2]) : '—', R.fr[1 - c] ? 'от ' + si(R.fr[1 - c][0], 'Гц', 3) + ' до ' + si(R.fr[1 - c][1], 'Гц', 3) : ''),
    tile('Длительность записи', fmtT(R.dur)),
  ].join('') : [tile('Сейчас, СКЗ CH' + (c + 1), isFinite(lastR) ? fmtC(c, lastR, 4) : '—'), tile('Частота CH' + (c + 1), isFinite(lastF) ? fHz(lastF) : '—'), tile('Точек тренда', TR.t.length.toLocaleString('ru-RU'))].join('');
}

// ---- 5. PWM ----
function drawPwm() {
  const sg = sigs(); miniScope('pmScope'); $('pmSrc').textContent = srcNote(sg);
  const c = +S.pwm.ch, ch = sg && sg.ch[c];
  if (!ch || !ch.on) { $('pmTiles').innerHTML = tile('Канал выключен', '—'); $('pmNote').textContent = 'нет данных'; return; }
  const { t, v, dt } = ch, n = v.length;
  const sorted = Float64Array.from(v).sort(), P = q => sorted[Math.min(n - 1, Math.max(0, Math.round(q * (n - 1))))];
  const lo = P(0.05), hi = P(0.95), A = hi - lo; let mx = -Infinity; for (const x of v) mx = Math.max(mx, x);
  const r = risingT(t, v, 0.5, 0.2);
  const rate = freqOf(r.cr);
  const trs = [];
  for (const i of r.idx) {
    const l10 = lo + 0.1 * A, l90 = lo + 0.9 * A; let a = i, b = i;
    while (a > 1 && v[a - 1] > l10 && i - a < 60) a--; while (b < n - 1 && v[b] < l90 && b - i < 60) b++;
    if (a <= 0 || b >= n - 1) continue;
    const ta = t[a - 1] + (l10 - v[a - 1]) / ((v[a] - v[a - 1]) || 1) * dt, tb = t[b - 1] + (l90 - v[b - 1]) / ((v[b] - v[b - 1]) || 1) * dt;
    if (tb > ta) trs.push(tb - ta);
  }
  // 2C53T: 50 MHz bandwidth → its own rise time ≈ 0.35/50 MHz ≈ 7 ns; 250 MS/s → 4 ns per real sample (faster time bases are interpolated)
  const TR_DEV = 7e-9, DT_ADC = 4e-9;
  trs.sort((a, b) => a - b); const tr = trs.length ? trs[trs.length >> 1] : null, limited = tr != null && (tr < 1.5 * Math.max(dt, DT_ADC) || tr < 1.5 * TR_DEV);
  const dvdt = tr ? 0.8 * A / tr : null;
  let hiCnt = 0, nearLvl = 0; for (const x of v) { if (x > lo + A / 2) hiCnt++; if (x < lo + 0.15 * A || x > hi - 0.15 * A) nearLvl++; }
  const pulses = nearLvl / n > 0.7;
  // fundamental: filter out the carrier
  let f1 = null, u1 = null;
  if (rate) { const w = Math.max(3, Math.round(2 / rate / dt)); const fv = boxcarF(v, w); const rf = risingT(t, fv, 0.5, 0.15); f1 = freqOf(rf.cr); if (f1 && f1 < rate / 4) { const ws = winStats(t, fv, rf.cr); u1 = ws && ws.whole ? Math.sqrt(Math.max(0, ws.rms ** 2 - ws.mean ** 2)) : null; } else f1 = null; }
  const U = UN(c);
  $('pmTiles').innerHTML = [
    tile('Амплитуда импульсов', fmtC(c, A, 4), 'уровни ' + fmtC(c, lo, 3) + ' … ' + fmtC(c, hi, 3)),
    tile('Частота импульсов', rate ? si(rate, 'Гц', 4) : '—', rate ? 'фронтов в секунду' : 'мало фронтов в записи'),
    tile('Длительность фронта', tr && pulses ? (limited ? '≤ ' : '') + fmtT(tr) : '—', '10–90 %'),
    tile('dV/dt', dvdt && pulses ? (limited ? '≥ ' : '') + si(dvdt * 1e-6, U + '/мкс', 3) : '—', limited ? 'фронт быстрее разрешения' : ''),
    tile('Выброс', A > 0 ? pct((mx - hi) / A * 100) : '—', 'над уровнем импульса', A > 0 && (mx - hi) / A > 0.2 ? 'bad' : ''),
    tile('Заполнение', pct(hiCnt / n * 100), 'доля времени «вверху»'),
    tile('Основная частота', f1 ? fHz(f1) : '—', f1 ? 'после фильтра' : 'нужно 2+ периода основной'),
    tile('Основная гармоника', u1 ? fmtC(c, u1, 4) : '—', 'СКЗ после фильтра (оценка)'),
  ].join('');
  const notes = [];
  if (!pulses) notes.push('сигнал не похож на импульсы ШИМ (много промежуточных значений) — фронты и dV/dt не показательны');
  if (limited) notes.push(tr < 1.5 * TR_DEV || dt <= DT_ADC ? 'фронт на пределе 2C53T (полоса 50 МГц ≈ 7 нс, шаг АЦП 4 нс) — реальный фронт может быть ещё короче' : 'фронт короче 1,5 точки — ускорьте развёртку, тогда dV/dt будет точным');
  if (!trs.length && rate) notes.push('фронты не разрешаются — ускорьте развёртку');
  if (ch.clip > 2) notes.push('сигнал обрезан краем экрана');
  notes.push('шаг точек ' + fmtT(dt));
  $('pmNote').textContent = notes.join(' · ');
}

// ---- 6. RPM ----
const RPM = { t: [], v: [], key: '' };
function drawRpm() {
  const sg = sigs(); $('rpSrc').textContent = srcNote(sg);
  const c = +S.rpm.ch, ch = sg && sg.ch[c];
  let rpm = null, fp = null, fs = null, slip = null, ns = null;
  if (ch && ch.on) {
    const r = risingT(ch.t, ch.v, 0.5, 0.2); fp = freqOf(r.cr);
    if (fp) rpm = fp * 60 / Math.max(1, +S.rpm.ppr || 1);
    if (S.rpm.fsrc === 'man') fs = +S.rpm.fman || null;
    else { const o = sg.ch[1 - c]; if (o && o.on) { const ro = risingT(o.t, boxcarF(o.v, Math.max(3, Math.round(o.v.length / 60))), 0.5, 0.15); fs = freqOf(ro.cr); } }
    if (fs) { ns = 60 * fs / Math.max(1, +S.rpm.poles || 1); if (rpm) slip = (ns - rpm) / ns * 100; }
    if (rpm && sg.key !== RPM.key) { RPM.key = sg.key; RPM.t.push(Date.now() / 1000); RPM.v.push(rpm); while (RPM.t.length && RPM.t[RPM.t.length - 1] - RPM.t[0] > 120) { RPM.t.shift(); RPM.v.shift(); } }
  }
  $('rpVal').textContent = rpm ? Math.round(rpm).toLocaleString('ru-RU') : '—';
  $('rpTiles').innerHTML = [
    tile('Частота импульсов', fp ? si(fp, 'Гц', 4) : '—', ch && ch.on && !fp ? 'меньше 2 импульсов в записи' : ''),
    tile('Частота питания', fs ? fHz(fs) : '—', S.rpm.fsrc === 'man' ? 'задана вручную' : 'с CH' + (2 - c)),
    tile('Синхронные обороты', ns ? Math.round(ns).toLocaleString('ru-RU') + ' об/мин' : '—', (+S.rpm.poles || 1) + ' пар полюсов'),
    tile('Скольжение', slip != null ? pct(slip, 2) : '—', '', slip != null && (slip < -0.5 || slip > 15) ? 'bad' : ''),
  ].join('');
  drawTrendChart($('rpChart'), RPM.t, [{ title: 'об/мин', series: [{ v: RPM.v, color: cssVar('--teal2'), unit: '' }] }], { t0: RPM.t.length ? RPM.t[RPM.t.length - 1] - 60 : 0, empty: 'обороты появятся, когда в записи будет 2+ импульса' });
}

// ---- 7. event recorder: triggers + pre-history ----
// Every new device frame (a distinct acquisition) goes into a ring buffer together with its metrics
// (RMS, frequency, CH2→CH1 angle). A trigger turns the buffer into an event that keeps growing for «post» seconds.
const REC_TRIG = [
  { id: 'syncStart', name: 'Начало синхронизации', hint: 'частота CH2 подошла к частоте CH1 ближе порога (ПЧ начал подгонку)', p: [['df', '|Δf| меньше', 'Гц', 1]] },
  { id: 'syncOk', name: 'Синхронизм достигнут', hint: 'Δf, Δφ и ΔU вошли в допуски синхроскопа (страница «Синхроскоп»)', p: [] },
  { id: 'powerOn', name: 'Подача напряжения', hint: 'СКЗ канала выросло выше порога после того, как было ниже половины порога. 0 — авто: 1 деление экрана', ch: true, p: [['thr', 'порог СКЗ', 'unit', 0]] },
  { id: 'dip', name: 'Провал / пропадание', hint: 'СКЗ упало ниже заданного % от среднего за предыдущие 2 с', ch: true, p: [['pct', 'ниже', '%', 70]] },
  { id: 'surge', name: 'Бросок', hint: 'СКЗ выросло выше заданного % от среднего за предыдущие 2 с — например, бросок тока при переключении с ПЧ на сеть', ch: true, p: [['pct', 'выше', '%', 150]] },
  { id: 'freq', name: 'Уход частоты', hint: 'частота канала вышла за номинал ± допуск', ch: true, p: [['nom', 'номинал', 'Гц', 50], ['df', 'допуск ±', 'Гц', 0.5]] },
  { id: 'phase', name: 'Угол Δφ', hint: 'угол CH2 относительно CH1 вошёл в окно ± (с учётом поправки угла синхроскопа)', p: [['deg', '|Δφ| меньше', '°', 10]] },
];
const REC_DEF = { pre: 5, post: 20, extend: true, autosave: true, rearm: false, trig: { syncStart: { on: true, df: 1 }, syncOk: { on: false }, powerOn: { on: true, ch: 0, thr: 0 }, dip: { on: false, ch: 0, pct: 70 }, surge: { on: false, ch: 1, pct: 150 }, freq: { on: false, ch: 0, nom: 50, df: 0.5 }, phase: { on: false, deg: 10 } } };
function recDefaults() {   // settings from an older version may miss new fields
  const r = S.rec = Object.assign({}, REC_DEF, S.rec || {}); r.trig = Object.assign({}, r.trig || {});
  for (const k in REC_DEF.trig) r.trig[k] = Object.assign({}, REC_DEF.trig[k], r.trig[k] || {});
}
const REC = { buf: [], armed: false, ev: null, events: [], sel: null, pos: null, follow: true, prev: {}, fired: {}, low: [false, false], primed: false, seq: 0 };
const REC_MAX = 20000;   // frames per event (memory guard)
function recZero(fr, c) { return S.zeroDev ? 128 + s8(fr.g[4 + c]) : 128 + S.zero[c] * PXDIV; }
function frameMetrics(fr) {
  const m = { rms: [NaN, NaN], f: [NaN, NaN], dphi: NaN, z: [recZero(fr, 0), recZero(fr, 1)] };
  if (!fr.tdiv) return m;
  const dtS = fr.tdiv / PXDIV, t = new Float64Array(N); for (let i = 0; i < N; i++) t[i] = i * dtS;
  const cr = [null, null];
  for (const c of [0, 1]) {
    if (!(fr.mask & (1 << c))) continue;
    const vd = fr.vdiv[c] || 1, v = new Float64Array(N); for (let i = 0; i < N; i++) v[i] = (fr.raw[c][i] - m.z[c]) / PXDIV * vd;
    const r = risingT(t, lpf(t, v), 0.5, 0.2), w = winStats(t, v, r.cr);
    m.rms[c] = w ? w.rms : NaN; const f = freqOf(r.cr);
    // a real periodic signal has equal periods; noise crossings don't — reject the frequency if periods spread > 15 %
    let regular = r.cr.length >= 3; if (regular) { let a = Infinity, b = 0; for (let k = 1; k < r.cr.length; k++) { const d = r.cr[k] - r.cr[k - 1]; if (d < a) a = d; if (d > b) b = d; } regular = (b - a) / ((r.cr[r.cr.length - 1] - r.cr[0]) / (r.cr.length - 1)) < (r.cr.length >= 4 ? 0.15 : 0.05); }
    if (f && regular && m.rms[c] > 0.1 * vd) { m.f[c] = f; cr[c] = r.cr; }
  }
  if (cr[0] && cr[1]) { const phi = phaseBA(cr[0], cr[1], 1 / m.f[0]); if (phi != null) m.dphi = wrap180(-phi - (+S.sync.offset || 0)); }
  return m;
}
function recRef(c, t) {   // mean RMS over [t-2.5 s, t-0.3 s]
  let s = 0, n = 0; for (let i = REC.buf.length - 1; i >= 0; i--) { const q = REC.buf[i]; if (q.t < t - 2.5) break; if (q.t <= t - 0.3 && isFinite(q.m.rms[c])) { s += q.m.rms[c]; n++; } }
  return n >= 4 ? s / n : null;
}
function recConds(q) {   // current truth value of every trigger condition (edges are taken in recFeed)
  // hysteresis: a condition that is already true stays true on a looser threshold, so noise near the limit doesn't chatter
  const T = S.rec.trig, m = q.m, fr = q.fr, out = {}, P = REC.prev;
  const pres = c => isFinite(m.rms[c]) && isFinite(m.f[c]) && m.rms[c] > 0.3 * (fr.vdiv[c] || 1);
  const both = pres(0) && pres(1), df = m.f[1] - m.f[0];
  out.syncStart = both && Math.abs(df) < +T.syncStart.df * (P.syncStart ? 1.3 : 1);
  const dU = both ? (m.rms[1] - m.rms[0]) / m.rms[0] * 100 : NaN;
  const hy = P.syncOk ? 1.3 : 1;
  out.syncOk = both && Math.abs(df) <= +S.sync.tolF * hy && Math.abs(m.dphi) <= +S.sync.tolPhi * hy && Math.abs(dU) <= +S.sync.tolU * hy;
  out.phase = both && Math.abs(m.dphi) < +T.phase.deg * (P.phase ? 1.5 : 1);
  { const c = +T.powerOn.ch, thr = +T.powerOn.thr > 0 ? +T.powerOn.thr : (fr.vdiv[c] || 1), r = m.rms[c];
    if (isFinite(r) && r < 0.5 * thr) REC.low[c] = true;
    out.powerOn = REC.low[c] && isFinite(r) && r > thr; }
  { const c = +T.dip.ch, ref = recRef(c, q.t); out.dip = ref != null && ref > 0.1 * (fr.vdiv[c] || 1) && m.rms[c] < (+T.dip.pct + (P.dip ? 5 : 0)) / 100 * ref; }
  { const c = +T.surge.ch, ref = recRef(c, q.t); out.surge = ref != null && ref > 0.1 * (fr.vdiv[c] || 1) && m.rms[c] > (+T.surge.pct - (P.surge ? 5 : 0)) / 100 * ref; }
  { const c = +T.freq.ch; out.freq = pres(c) && Math.abs(m.f[c] - +T.freq.nom) > +T.freq.df * (P.freq ? 0.8 : 1); }
  return out;
}
const recName = id => id === 'manual' ? 'вручную' : (REC_TRIG.find(x => x.id === id) || {}).name || id;
function recFeed(fr, nowMs) {
  const q = { fr, m: frameMetrics(fr), t: nowMs / 1000, wall: Date.now() };
  REC.buf.push(q);
  const keep = Math.max(3, +S.rec.pre || 0) + 0.5; while (REC.buf.length && REC.buf[0].t < q.t - keep) REC.buf.shift();
  const ev = REC.ev;
  if (ev) { if (ev.frames.length < REC_MAX) ev.frames.push(q); else ev.cut = true; }
  // triggers: fire on false→true; the first frame after arming only records the state
  const c = recConds(q), hits = [];
  // fire on false→true, at most once per 2 s per trigger
  for (const k in c) { if (c[k] && !REC.prev[k] && REC.primed && S.rec.trig[k] && S.rec.trig[k].on && !(q.t - (REC.fired[k] || -1e9) < 2)) { hits.push(k); REC.fired[k] = q.t; } REC.prev[k] = c[k]; }
  if (c.powerOn) REC.low[+S.rec.trig.powerOn.ch] = false;
  REC.primed = true;
  if (!hits.length) return;
  if (ev) { for (const h of hits) ev.marks.push({ t: q.t, id: h }); if (S.rec.extend) ev.end = Math.min(ev.tTrig + 600, Math.max(ev.end, q.t + (+S.rec.post || 20))); }
  else if (REC.armed) recStart(hits[0], q.t, hits);
}
function recStart(id, t, hits = [id]) {
  const pre = +S.rec.pre || 0;
  const ev = REC.ev = { n: ++REC.seq, id, tTrig: t, wall: Date.now(), end: t + (+S.rec.post || 20), frames: REC.buf.filter(q => q.t >= t - pre), marks: hits.map(h => ({ t, id: h })), done: false };
  REC.events.unshift(ev); while (REC.events.length > 6) REC.events.pop();   // older events: save them, memory is limited
  REC.sel = ev; REC.follow = true; recUI(); needDraw = true;
}
function recFinish() {
  const ev = REC.ev; if (!ev) return; REC.ev = null; ev.done = true;
  if (S.rec.autosave) recSave(ev);
  if (!S.rec.rearm) REC.armed = false; else { REC.primed = false; REC.prev = {}; }
  REC.follow = false; REC.pos = null; recUI(); needDraw = true;
}
setInterval(() => { const ev = REC.ev; if (ev && performance.now() / 1000 > ev.end) recFinish(); }, 200);
function recFileBase(ev) { const d = new Date(ev.wall), p = n => String(n).padStart(2, '0'); return `PUF_event_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}_${ev.id}`; }
function recSave(ev) {
  if (!ev || !ev.frames.length) return toast('Нет данных события');
  // frames: same layout as «Запись» on the scope page — opens in «Записи» with the frame slider
  const fr0 = ev.frames, step = Math.max(1, Math.ceil(fr0.length / 6000));
  const L = [`﻿кадр;время, с;CH1, ${UN(0)};CH2, ${UN(1)};развёртка, с/дел;CH1 ${UN(0)}/дел;CH2 ${UN(1)}/дел;от триггера, с`];
  for (let k = 0; k < fr0.length; k += step) {
    const { fr, m, t } = fr0[k];
    for (let i = 0; i < N; i++) {
      const v = c => (fr.mask & (1 << c)) ? num((fr.raw[c][i] - m.z[c]) / PXDIV * (fr.vdiv[c] || 1)) : '';
      L.push([k, num(fr.tdiv ? (i - 150) * fr.tdiv / PXDIV : i), v(0), v(1), i ? '' : num(fr.tdiv), i ? '' : num(fr.vdiv[0]), i ? '' : num(fr.vdiv[1]), i ? '' : num(t - ev.tTrig, 6)].join(';'));
    }
  }
  const T = [`﻿время от триггера, с;CH1 СКЗ, ${UN(0)};CH2 СКЗ, ${UN(1)};CH1 f, Гц;CH2 f, Гц;Δf, Гц;Δφ, °;отметка`];
  let mi = 0; const marks = ev.marks.slice().sort((a, b) => a.t - b.t);
  for (const { m, t } of fr0) {
    let mk = ''; while (mi < marks.length && marks[mi].t <= t + 1e-6) { mk += (mk ? ', ' : '') + recName(marks[mi].id); mi++; }
    T.push([num(t - ev.tTrig, 6), num(m.rms[0]), num(m.rms[1]), num(m.f[0]), num(m.f[1]), num(m.f[1] - m.f[0]), num(m.dphi, 4), mk].join(';'));
  }
  const base = recFileBase(ev);
  saveOut(base + '.csv', utf8(L.join('\r\n'))).then(() => saveOut(base + '_trend.csv', utf8(T.join('\r\n'))));
  if (step > 1) toast(`Событие длинное: в CSV кадров записан каждый ${step}-й, тренд — полностью`);
}
function recUI() {
  const ev = REC.ev;
  const st = ev ? `● запись: ${recName(ev.id)}` : REC.armed ? 'жду событие' : 'выключен';
  $('rcState').textContent = st; $('rcState').className = 'chip ' + (ev ? 'st' : REC.armed ? 'ok' : '');
  $('rcArm').classList.toggle('on', REC.armed); $('rcArm').textContent = REC.armed ? 'Жду событие…' : 'Ждать событие';
  $('rcNow').classList.toggle('on', !!ev);
  const l = $('rcList');
  l.innerHTML = REC.events.length ? '' : '<div class="fempty">Событий пока нет. Отметьте триггеры справа и нажмите «Ждать событие» — или «Записать сейчас».</div>';
  for (const e of REC.events) {
    const d = document.createElement('div'); d.className = 'ev' + (e === REC.sel ? ' on' : '');
    const dur = e.frames.length ? e.frames[e.frames.length - 1].t - e.frames[0].t : 0;
    d.innerHTML = `<b>№${e.n}</b><span>${new Date(e.wall).toLocaleTimeString('ru-RU')}</span><b>${esc(recName(e.id))}</b>${e.marks.length > 1 ? `<span>+${e.marks.length - 1} сраб.</span>` : ''}<i class="sp"></i>${e.done ? '' : '<i class="live">идёт запись</i>'}<span>${durText(dur)} · ${e.frames.length.toLocaleString('ru-RU')} кадр.${e.cut ? ' (обрезано)' : ''}</span>`;
    if (e.done && e.frames.length > 1) { const b = document.createElement('button'); b.className = 'tbtn'; b.textContent = '▶ Смотреть'; b.title = 'Открыть событие в плеере («Записи»): воспроизведение, лента кадров, наложение'; b.onclick = ev => { ev.stopPropagation(); recOpenInFiles(e); }; d.append(b); }
    d.onclick = () => { REC.sel = e; REC.pos = null; REC.follow = !e.done; recUI(); needDraw = true; };
    l.append(d);
  }
}
function recOpenInFiles(ev) {   // the event as a multi-frame record, without saving a file
  const frames = ev.frames.map(({ fr, m, t }) => {
    const tt = new Float64Array(N); for (let i = 0; i < N; i++) tt[i] = fr.tdiv ? (i - 150) * fr.tdiv / PXDIV : i;
    const v = [0, 1].map(c => { const a = new Float32Array(N); for (let i = 0; i < N; i++) a[i] = fr.mask & (1 << c) ? (fr.raw[c][i] - m.z[c]) / PXDIV * (fr.vdiv[c] || 1) : NaN; return a; });
    return { t: tt, v, gap: [], on: [0, 1].map(c => !!(fr.mask & (1 << c))), ft: t - ev.tTrig, tdivF: fr.tdiv, vdivF: [fr.vdiv[0], fr.vdiv[1]] };
  });
  setMode('files'); sel = null; fOver = {}; plStop(); renderFileList();
  showCsv({ name: `Событие №${ev.n} · ${recName(ev.id)}`, key: 'event:' + ev.n }, { frames, ftKind: 'trig', cols: {} });
  fileData.ev = ev;   // «CSV» saves the event itself
}
function buildRecTriggers() {
  const box = $('rcTrig'); box.innerHTML = '';
  for (const d of REC_TRIG) {
    const cfg = S.rec.trig[d.id], w = document.createElement('div'); w.className = 'trig' + (cfg.on ? '' : ' off');
    w.innerHTML = `<div class="th"><b>${d.name}</b><label class="sw"><input type="checkbox"${cfg.on ? ' checked' : ''}><i></i></label></div><p>${d.hint}</p>`
      + (d.ch ? `<div class="row"><span>Канал</span><div class="seg sm"><button data-v="0" class="c1${+cfg.ch === 0 ? ' on' : ''}">CH1</button><button data-v="1" class="c2${+cfg.ch === 1 ? ' on' : ''}">CH2</button></div></div>` : '')
      + d.p.map(([k, lbl, u]) => `<div class="row"><span>${lbl}</span><input type="number" step="any" data-k="${k}" value="${cfg[k]}"><span class="u" data-u="${u}">${u === 'unit' ? UN(+cfg.ch || 0) : u}</span></div>`).join('');
    w.querySelector('.th input').onchange = e => { cfg.on = e.target.checked; w.classList.toggle('off', !cfg.on); REC.prev[d.id] = true; saveSettings(); };
    w.querySelectorAll('.seg button').forEach(b => b.onclick = () => { cfg.ch = +b.dataset.v; w.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b)); w.querySelectorAll('[data-u="unit"]').forEach(x => x.textContent = UN(cfg.ch)); REC.low = [false, false]; saveSettings(); });
    w.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = () => { const v = parseFloat(String(inp.value).replace(',', '.')); if (isFinite(v) && v >= 0) cfg[inp.dataset.k] = v; inp.value = cfg[inp.dataset.k]; saveSettings(); });
    box.append(w);
  }
}
function drawRec() {
  const ev = REC.sel, list = ev ? ev.frames : REC.buf, col = [cssVar('--ch1'), cssVar('--ch2')];
  const t = list.map(q => q.t), ser = k => list.map(q => q.m[k[0]][k[1]]);
  let idx = list.length - 1;
  if (ev && !REC.follow && REC.pos != null) idx = Math.min(list.length - 1, REC.pos);
  else if (ev && ev.done && REC.pos == null) { idx = Math.max(0, list.findIndex(q => q.t >= ev.tTrig)); REC.pos = idx; }
  const sl = $('rcPos'); sl.max = Math.max(0, list.length - 1); if (document.activeElement !== sl) sl.value = idx;
  const ref = ev ? ev.tTrig : (t.length ? t[t.length - 1] : 0);
  drawTrendChart($('rcChart'), t, [
    { title: 'СКЗ', zero: true, shared: UN(0) === UN(1), series: [{ v: ser(['rms', 0]), color: col[0], unit: UN(0) }, { v: ser(['rms', 1]), color: col[1], unit: UN(1) }] },
    { title: 'Частота', shared: true, series: [{ v: ser(['f', 0]), color: col[0], unit: 'Гц' }, { v: ser(['f', 1]), color: col[1], unit: 'Гц' }] },
    { title: 'Угол CH2 к CH1, °', range: [-180, 180], series: [{ v: list.map(q => q.m.dphi), color: cssVar('--orange'), unit: '' }] },
  ], { t0: t[0], t1: t[t.length - 1], ref, vline: idx >= 0 ? t[idx] : null, empty: ev ? 'нет кадров' : 'жду кадры от прибора…' });
  const q = list[idx];
  if (q) {
    const fr = q.fr, on = [0, 1].map(c => !!(fr.mask & (1 << c)));
    drawScope($('rcScope'), { n: N, y: [Float32Array.from(fr.raw[0]), Float32Array.from(fr.raw[1])], on, v0: q.m.z, vdiv: fr.vdiv, tdiv: fr.tdiv, trigX: null }, { compact: true });
    $('rcPosTxt').textContent = `${idx + 1} из ${list.length} · ` + (ev ? (q.t - ev.tTrig >= 0 ? '+' : '−') + fmtT(Math.abs(q.t - ev.tTrig)) + ' от срабатывания' : 'сейчас (без записи)');
    const m = q.m, df = m.f[1] - m.f[0];
    const mk = ev ? ev.marks.filter(x => Math.abs(x.t - q.t) < 0.05).map(x => recName(x.id)).join(', ') : '';
    $('rcTiles').innerHTML = [tile('U CH1 (СКЗ)', fmtC(0, m.rms[0], 4)), tile('U CH2 (СКЗ)', fmtC(1, m.rms[1], 4)), tile('f CH1', fHz(m.f[0])), tile('f CH2', fHz(m.f[1])),
      tile('Δf', isFinite(df) ? (df >= 0 ? '+' : '−') + Math.abs(df).toFixed(3).replace('.', ',') + ' Гц' : '—'), tile('Угол Δφ', deg(m.dphi), 'CH2 к CH1, с поправкой'),
      tile('Развёртка', fr.tdiv ? tdivName(fr.tdiv) : '?', mk ? 'сработал: ' + mk : '')].join('');
  } else { drawScope($('rcScope'), null, { compact: true }); $('rcPosTxt').textContent = '—'; $('rcTiles').innerHTML = ''; }
}
function recInit() {
  recDefaults(); buildRecTriggers();
  const bind = (id, k, cast = Number) => { const el = $(id); if (el.type === 'checkbox') { el.checked = !!S.rec[k]; el.onchange = () => { S.rec[k] = el.checked; saveSettings(); }; } else { el.value = S.rec[k]; el.onchange = () => { const v = cast(String(el.value).replace(',', '.')); if (isFinite(v) && v >= 0) S.rec[k] = Math.min(+el.max || Infinity, v); el.value = S.rec[k]; saveSettings(); }; } };
  bind('rcPre', 'pre'); bind('rcPost', 'post'); bind('rcExtend', 'extend'); bind('rcAuto', 'autosave'); bind('rcRearm', 'rearm');
  $('rcArm').onclick = () => {
    if (!REC_TRIG.some(d => S.rec.trig[d.id].on)) return toast('Отметьте хотя бы один триггер');
    REC.armed = !REC.armed; REC.primed = false; REC.prev = {}; REC.low = [false, false]; recUI();
    if (REC.armed && (!cur || performance.now() - lastFrameAt > 2000)) toast('Нет кадров от прибора — триггеры начнут проверяться, когда пойдут данные');
  };
  $('rcNow').onclick = () => { if (REC.ev) return toast('Запись уже идёт'); if (!REC.buf.length) return toast('Нет данных от прибора'); recStart('manual', REC.buf[REC.buf.length - 1].t); };
  $('rcStop').onclick = () => { if (REC.ev) recFinish(); else { REC.armed = false; recUI(); } };
  $('rcSave').onclick = () => recSave(REC.sel);
  $('rcPos').oninput = e => { REC.pos = +e.target.value; REC.follow = false; needDraw = true; };
  (() => {   // click or drag on the trend chooses the frame (same x mapping as drawTrendChart: 58 px margins)
    const cv = $('rcChart');
    const pick = e => { const ev = REC.sel; if (!ev || !ev.frames.length) return; const r = cv.getBoundingClientRect(), L = ev.frames, t0 = L[0].t, t1 = L[L.length - 1].t, t = t0 + (e.clientX - r.left - 58) / ((r.width - 116) || 1) * (t1 - t0); let k = 0; while (k < L.length - 1 && L[k + 1].t <= t) k++; if (k < L.length - 1 && t - L[k].t > L[k + 1].t - t) k++; REC.pos = k; REC.follow = false; needDraw = true; };
    cv.style.cursor = 'pointer';
    cv.addEventListener('mousedown', e => { pick(e); const mv = ev => pick(ev), up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); }; addEventListener('mousemove', mv); addEventListener('mouseup', up); });
  })();
  recUI();
}

// ---- 8. power quality analyzer: harmonics + quality indices ----
// GOST 32144-2013, voltage harmonics in % of the fundamental (95 % of time), network classes 0.38 / 6–25 / 35 / 110–220 kV
const GOST = {
  odd: { 5: [6, 4, 3, 1.5], 7: [5, 3, 2.5, 1], 11: [3.5, 2, 2, 1], 13: [3, 2, 1.5, 0.7], 17: [2, 1.5, 1, 0.5], 19: [1.5, 1, 1, 0.4], 23: [1.5, 1, 1, 0.4], 25: [1.5, 1, 1, 0.4] },
  tri: { 3: [5, 3, 3, 1.5], 9: [1.5, 1, 1, 0.4], 15: [0.3, 0.3, 0.3, 0.2], 21: [0.2, 0.2, 0.2, 0.2] },
  even: { 2: [2, 1.5, 1, 0.5], 4: [1, 0.7, 0.5, 0.3], 6: [0.5, 0.3, 0.3, 0.2], 8: [0.5, 0.3, 0.3, 0.2], 10: [0.5, 0.3, 0.3, 0.2], 12: [0.2, 0.2, 0.2, 0.2] },
  thd: [8, 5, 4, 2.5], thd100: [12, 8, 6, 3.75],
};
function gostLimit(n, cls) {
  if (n < 2) return null;
  if (n % 2 === 0) return (GOST.even[n] || [0.2, 0.2, 0.2, 0.2])[cls];
  if (n % 3 === 0) return (GOST.tri[n] || [0.2, 0.2, 0.2, 0.2])[cls];
  return GOST.odd[n] ? GOST.odd[n][cls] : 0.2 + [1.3, 0.8, 0.6, 0.2][cls] * 25 / n;
}
const AN_DEF = { ch: 0, cls: 0, unom: 0, inom: 0, fnom: 50, avg: 3, kmax: 40 };
const AN = { key: '', hist: [], max: [null, null], last: null };
function anOne(c, ch) {   // one record of one channel → harmonics and indices
  if (!ch || !ch.on) return null;
  const { t, v, dt } = ch, fv = lpf(t, v), r = risingT(t, fv, 0.5, 0.2), f1 = freqOf(r.cr);
  if (!f1 || r.cr.length < 3) return { err: 'нужно хотя бы 2 периода в записи — сделайте развёртку медленнее (5–10 мс/дел)' };
  const w = winStats(t, v, r.cr); if (!w || !w.whole) return { err: 'нет целых периодов' };
  const kmax = Math.max(2, Math.min(+S.an.kmax || 40, Math.floor(1 / (2 * dt) / f1) - 1));
  const h = harmonicsOf(t, v, f1, w.a, w.b, kmax);
  let pk = 0, sa = 0; for (let i = w.a; i < w.b; i++) { const x = Math.abs(v[i]); if (x > pk) pk = x; sa += x; }
  return { f1, h, kmax, dc: w.mean, rms: w.rms, peak: pk, meanAbs: sa / (w.b - w.a), periods: r.cr.length - 1, clip: ch.clip, dt };
}
function anIndices(a, c) {   // derived values (from instantaneous or averaged harmonics)
  const h = a.h, h1 = h[0] ? h[0].rms : 0; let s2 = 0, so = 0, se = 0, kn = 0, kd = 0;
  for (const q of h) { kd += q.rms ** 2; kn += (q.k * q.rms) ** 2; if (q.k < 2) continue; s2 += q.rms ** 2; if (q.k % 2) so += q.rms ** 2; else se += q.rms ** 2; }
  const ac = Math.sqrt(Math.max(0, a.rms ** 2 - a.dc ** 2));
  return { h1, thd: h1 > 0 ? Math.sqrt(s2) / h1 * 100 : null, thdR: kd > 0 ? Math.sqrt(s2 / kd) * 100 : null, thdOdd: h1 > 0 ? Math.sqrt(so) / h1 * 100 : null, thdEven: h1 > 0 ? Math.sqrt(se) / h1 * 100 : null,
    kf: kd > 0 ? kn / kd : null, crest: ac > 0 ? a.peak / a.rms : null, form: a.meanAbs > 0 ? a.rms / a.meanAbs : null, tdd: +S.an.inom > 0 ? Math.sqrt(s2) / +S.an.inom * 100 : null };
}
function anUpdate(sg) {
  if (!sg || sg.key === AN.key) return;
  AN.key = sg.key; const now = performance.now() / 1000;
  const res = [0, 1].map(c => anOne(c, sg.ch[c]));
  const inv = S.power.inv ? -1 : 1;
  AN.hist.push({ t: now, res, deep: sg.deep, span: sg.span });
  while (AN.hist.length && now - AN.hist[0].t > Math.max(0.01, +S.an.avg || 0)) AN.hist.shift();
  res.forEach((r, c) => { if (r && !r.err) { const x = anIndices(r, c); if (x.thd != null && (AN.max[c] == null || x.thd > AN.max[c])) AN.max[c] = x.thd; } });
  // average over the window: RMS-average of every harmonic, arithmetic mean of frequency / DC, max of peak
  const agg = [0, 1].map(c => {
    const L = AN.hist.map(e => e.res[c]).filter(r => r && !r.err); if (!L.length) { const e = res[c]; return e && e.err ? e : null; }
    const last = L[L.length - 1], km = Math.min(...L.map(r => r.kmax)), h = [];
    for (let k = 1; k <= km; k++) { let s = 0, sx = 0, sy = 0; for (const r of L) { const q = r.h[k - 1]; s += q.rms ** 2; sx += Math.cos(q.ph - k * r.h[0].ph); sy += Math.sin(q.ph - k * r.h[0].ph); } h.push({ k, rms: Math.sqrt(s / L.length), rel: Math.atan2(sy, sx) }); }
    const m = f => L.reduce((s, r) => s + f(r), 0) / L.length;
    return { f1: m(r => r.f1), h, kmax: km, dc: m(r => r.dc), rms: Math.sqrt(m(r => r.rms ** 2)), peak: Math.max(...L.map(r => r.peak)), meanAbs: m(r => r.meanAbs), periods: last.periods, clip: last.clip, dt: last.dt, n: L.length };
  });
  // harmonic active power per order (CH1 voltage, CH2 current, same record → same time base)
  let pw = null;
  if (UN(0) === 'В' && UN(1) === 'А') {
    const L = AN.hist.filter(e => e.res[0] && !e.res[0].err && e.res[1] && !e.res[1].err);
    if (L.length) { const km = Math.min(...L.map(e => Math.min(e.res[0].kmax, e.res[1].kmax))); pw = []; for (let k = 1; k <= km; k++) { let p = 0; for (const e of L) { const u = e.res[0].h[k - 1], i = e.res[1].h[k - 1]; p += inv * u.rms * i.rms * Math.cos(u.ph - i.ph); } pw.push({ k, p: p / L.length, u: agg[0] && agg[0].h[k - 1] ? agg[0].h[k - 1].rms : null, i: agg[1] && agg[1].h[k - 1] ? agg[1].h[k - 1].rms : null }); } }
  }
  AN.last = { agg, pw, deep: sg.deep, span: sg.span };
}
function drawAn() {
  const sg = sigs(); anUpdate(sg);
  const c = +S.an.ch, A = AN.last && AN.last.agg[c], col = [cssVar('--ch1'), cssVar('--ch2')][c], U = UN(c), isU = U === 'В', cls = +S.an.cls;
  $('anSrc').textContent = sg ? srcNote(sg) + (AN.last && +S.an.avg ? ` · усреднение ${S.an.avg} с` : '') : 'нет данных от прибора';
  const cv = canvasCtx($('anChart'));
  if (!A || A.err) {
    $('anTiles').innerHTML = tile(sg && sg.ch[c] && sg.ch[c].on ? 'Нет расчёта' : `CH${c + 1} выключен`, '—', A && A.err ? A.err : '');
    $('anTable').innerHTML = ''; $('anPwBox').hidden = true; $('anNote').textContent = A && A.err ? A.err : 'нет данных';
    if (cv) { cv.x.fillStyle = cssVar('--scr'); cv.x.fillRect(0, 0, cv.W, cv.H); }
    return;
  }
  const X = anIndices(A, c), fnom = +S.an.fnom || 50, df = A.f1 - fnom, unom = +S.an.unom, dU = isU && unom > 0 ? (X.h1 / unom - 1) * 100 : null;
  const st = (ok, warn) => ok ? 'ok' : warn ? '' : 'bad';
  const thdLim = isU ? GOST.thd[cls] : null;
  $('anTiles').innerHTML = [
    tile('СКЗ (полное)', fmtC(c, A.rms, 4)), tile('1-я гармоника', fmtC(c, X.h1, 4), 'СКЗ основной'),
    tile('Частота', fHz(A.f1), 'отклонение ' + (df >= 0 ? '+' : '−') + Math.abs(df).toFixed(3).replace('.', ',') + ' Гц · норма ±0,2', st(Math.abs(df) <= 0.2, Math.abs(df) <= 0.4)),
    dU != null ? tile('Отклонение U', (dU >= 0 ? '+' : '') + pct(dU), 'по 1-й гармонике · норма ±10 %', st(Math.abs(dU) <= 10)) : '',
    tile('КНИ (THD)', pct(X.thd, 2), isU ? `норма ≤ ${String(thdLim).replace('.', ',')} % (${NET_CLASS[cls]})` : 'от основной', isU ? st(X.thd <= thdLim, X.thd <= GOST.thd100[cls]) : ''),
    tile('КНИ макс.', pct(AN.max[c], 2), 'с последнего сброса'),
    tile('THD нечётн. / чётн.', pct(X.thdOdd, 1) + ' / ' + pct(X.thdEven, 1)),
    tile('Пост. составляющая', fmtC(c, A.dc, 3), X.h1 ? pct(Math.abs(A.dc) / X.h1 * 100) + ' от основной' : ''),
    tile('Коэф. амплитуды', X.crest ? X.crest.toFixed(3).replace('.', ',') : '—', 'пик/СКЗ · синус 1,414'),
    tile('Коэф. формы', X.form ? X.form.toFixed(3).replace('.', ',') : '—', 'СКЗ/ср.выпр. · синус 1,111'),
    !isU ? tile('K-фактор', X.kf ? X.kf.toFixed(2).replace('.', ',') : '—', 'нагрев трансформатора, синус = 1') : '',
    !isU && X.tdd != null ? tile('TDD', pct(X.tdd, 2), 'гармоники к Iном') : '',
  ].join('');
  // chart: harmonics 2…kmax in % of the fundamental, with the GOST limit for voltage
  if (cv) {
    const { x, W, H } = cv, ml = 46, mr = 12, mt = 12, mb = 26, pw = W - ml - mr, ph = H - mt - mb;
    x.fillStyle = cssVar('--scr'); x.fillRect(0, 0, W, H);
    const hs = A.h.slice(1), vals = hs.map(q => X.h1 > 0 ? q.rms / X.h1 * 100 : 0), lims = hs.map(q => isU ? gostLimit(q.k, cls) : null);
    const ymax = Math.max(1, ...vals, ...lims.filter(v => v != null)) * 1.15, bw = pw / Math.max(1, hs.length);
    const Y = v => mt + ph - Math.min(1, v / ymax) * ph;
    x.strokeStyle = cssVar('--grid2'); x.lineWidth = 1; x.fillStyle = '#86A9B3'; x.font = '11px Inter, sans-serif'; x.textAlign = 'right'; x.textBaseline = 'middle';
    for (let j = 0; j <= 4; j++) { const v = ymax * j / 4, y = Math.round(Y(v)) + .5; x.beginPath(); x.moveTo(ml, y); x.lineTo(W - mr, y); x.stroke(); x.fillText(v.toFixed(ymax < 4 ? 1 : 0).replace('.', ',') + ' %', ml - 6, y); }
    x.textAlign = 'center'; x.textBaseline = 'top';
    hs.forEach((q, i) => {
      const x0 = ml + i * bw, over = lims[i] != null && vals[i] > lims[i];
      x.fillStyle = over ? '#E36A5C' : col; x.globalAlpha = .9; x.fillRect(x0 + bw * 0.15, Y(vals[i]), bw * 0.7, mt + ph - Y(vals[i])); x.globalAlpha = 1;
      if (lims[i] != null) { x.strokeStyle = cssVar('--orange'); x.lineWidth = 2; x.beginPath(); x.moveTo(x0 + bw * 0.05, Y(lims[i])); x.lineTo(x0 + bw * 0.95, Y(lims[i])); x.stroke(); x.lineWidth = 1; }
      if (bw > 14 || q.k % 5 === 0 || q.k === 2) { x.fillStyle = '#86A9B3'; x.fillText(String(q.k), x0 + bw / 2, mt + ph + 6); }
    });
    if (isU) { x.fillStyle = cssVar('--orange'); x.textAlign = 'right'; x.font = '600 11px Inter, sans-serif'; x.fillText('— норма ГОСТ 32144', W - mr - 4, mt + 2); }
    const hv = $('anChart')._hover;
    if (hv && hv.x >= ml && hv.x <= W - mr && hs.length) {
      const i = Math.max(0, Math.min(hs.length - 1, Math.floor((hv.x - ml) / bw))), q = hs[i];
      const lines = [{ t: `${q.k}-я · ${si(q.k * A.f1, 'Гц', 4)}`, c: '#E8F3F6' }, { t: pct(vals[i], 2) + ' · ' + fmtC(c, q.rms, 3), c: col }];
      if (lims[i] != null) lines.push({ t: 'норма ≤ ' + pct(lims[i], 1), c: cssVar('--orange') });
      hoverBox(x, { ml, mt, pw, ph }, ml + (i + 0.5) * bw, hv, lines, []);
    }
  }
  // table
  const rows = A.h.map((q, i) => {
    const rel = X.h1 > 0 ? q.rms / X.h1 * 100 : null, lim = isU ? gostLimit(q.k, cls) : null, over = lim != null && rel > lim;
    return `<tr class="${q.k === 1 ? 'f1' : over ? 'bad' : ''}"><td>${q.k}</td><td>${si(q.k * A.f1, 'Гц', 4)}</td><td>${fmtC(c, q.rms, 3)}</td><td>${q.k === 1 ? '100 %' : pct(rel, 2)}</td><td>${q.k === 1 ? '0°' : deg(wrap180(q.rel * 180 / Math.PI), 0)}</td><td>${lim != null ? '≤ ' + pct(lim, 1) : '—'}</td><td>${q.k === 1 ? '' : lim == null ? '' : over ? 'превышение' : 'норма'}</td></tr>`;
  }).join('');
  $('anTable').innerHTML = `<table><thead><tr><th>n</th><th>частота</th><th>СКЗ, ${U}</th><th>% от 1-й</th><th>фаза к 1-й</th><th>норма</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
  // harmonic power direction
  const P = AN.last.pw;
  $('anPwBox').hidden = !P;
  if (P) $('anPower').innerHTML = `<table><thead><tr><th>n</th><th>U, В</th><th>I, А</th><th>P<sub>n</sub>, Вт</th><th>направление</th></tr></thead><tbody>${P.filter(q => q.k <= 25).map(q => {
    const small = Math.abs(q.p) < 0.002 * Math.abs(P[0].p);
    return `<tr class="${q.k === 1 ? 'f1' : !small && q.p < 0 ? 'bad' : ''}"><td>${q.k}</td><td>${q.u != null ? si(q.u, '', 3) : '—'}</td><td>${q.i != null ? si(q.i, '', 3) : '—'}</td><td>${si(q.p, '', 3)}</td><td>${small ? '≈ 0' : q.p >= 0 ? 'сеть → нагрузка' : 'нагрузка → сеть'}</td></tr>`; }).join('')}</tbody></table>`;
  const notes = [`окно ${A.periods} периодов`, `шаг ${fmtT(A.dt)}, гармоники до ${A.kmax}-й`];
  if (A.n > 1) notes.push(`усреднено ${A.n} записей`);
  if (A.kmax < (+S.an.kmax || 40)) notes.push(`выше ${A.kmax}-й не видно: мало точек на период — ускорьте развёртку`);
  if (A.clip > 2) notes.push('сигнал обрезан краем экрана — гармоники завышены, увеличьте В/дел');
  const vdC = sg && sg.fr.vdiv[c]; if (vdC && A.peak / vdC < 1.5) notes.push('сигнал мелкий на экране — растяните до 6–7 делений');
  if (!isU) notes.push('нормы ГОСТ — только для напряжения (единица канала «В»)');
  $('anNote').textContent = notes.join(' · ');
}
const NET_CLASS = ['0,38 кВ', '6–25 кВ', '35 кВ', '110–220 кВ'];
function anCSV() {
  const A = AN.last && AN.last.agg[+S.an.ch], c = +S.an.ch; if (!A || A.err) return toast('Нет расчёта');
  const X = anIndices(A, c), U = UN(c), isU = U === 'В', cls = +S.an.cls;
  const L = [`﻿гармоника;частота, Гц;СКЗ, ${U};% от 1-й;фаза к 1-й, °;норма ГОСТ 32144, %`];
  for (const q of A.h) L.push([q.k, num(q.k * A.f1), num(q.rms), num(X.h1 ? q.rms / X.h1 * 100 : null, 4), q.k === 1 ? '0' : num(wrap180(q.rel * 180 / Math.PI), 4), isU && q.k > 1 ? num(gostLimit(q.k, cls), 3) : ''].join(';'));
  L.push('', `канал;CH${c + 1}`, `частота, Гц;${num(A.f1)}`, `СКЗ, ${U};${num(A.rms)}`, `1-я гармоника, ${U};${num(X.h1)}`, `КНИ, %;${num(X.thd, 4)}`, `КНИ макс., %;${num(AN.max[c], 4)}`, `пост. составляющая, ${U};${num(A.dc)}`, `коэф. амплитуды;${num(X.crest, 4)}`, `коэф. формы;${num(X.form, 4)}`, `K-фактор;${num(X.kf, 4)}`);
  if (isU) L.push(`класс сети;${NET_CLASS[cls]}`);
  saveOut(`PUF_harm_CH${c + 1}_${stamp()}.csv`, utf8(L.join('\r\n')));
}
function anInit() {
  S.an = Object.assign({}, AN_DEF, S.an || {});
  segSet('anCh', S.an.ch); segInit('anCh', v => { S.an.ch = +v; saveSettings(); needDraw = true; });
  const sel = (id, k) => { const el = $(id); el.value = String(S.an[k]); el.onchange = () => { S.an[k] = +el.value; AN.hist = []; AN.key = ''; saveSettings(); needDraw = true; }; };
  sel('anCls', 'cls'); sel('anFnom', 'fnom'); sel('anAvg', 'avg'); sel('anKmax', 'kmax');
  const numIn = (id, k) => { const el = $(id); el.value = S.an[k]; el.onchange = () => { const v = parseFloat(String(el.value).replace(',', '.')); S.an[k] = isFinite(v) && v >= 0 ? v : 0; el.value = S.an[k]; saveSettings(); needDraw = true; }; };
  numIn('anUnom', 'unom'); numIn('anInom', 'inom');
  $('anReset').onclick = () => { AN.hist = []; AN.max = [null, null]; AN.key = ''; needDraw = true; };
  $('anCsv').onclick = anCSV;
  $('anPng').onclick = () => saveOut(`PUF_harm_CH${+S.an.ch + 1}_${stamp()}.png`, canvasPNG($('anChart')));
  hoverable($('anChart'), () => { needDraw = true; });
}

// ---- self-update ----
let updInfo = null;
async function updCheck(quiet) {
  $('updState').textContent = 'проверяю…'; $('updState').className = 'chip';
  try {
    const r = updInfo = await (await api('/api/update/check')).json();
    $('updApply').hidden = !r.available;
    if (r.error) { $('updState').textContent = 'ошибка'; $('updText').textContent = r.error; if (!quiet) toast(r.error); }
    else if (r.available) { $('updState').textContent = 'есть v' + r.latest; $('updState').className = 'chip st'; $('updApply').textContent = `Обновить до v${r.latest}`; $('updText').textContent = `Установлена v${r.current}, доступна v${r.latest}` + (r.size ? ` (${(r.size / 1048576).toFixed(1).replace('.', ',')} МБ)` : '') + (r.notes ? '. ' + r.notes : ''); for (const id of ['ver', 'ver2']) { $(id).classList.add('new'); $(id).title = 'Доступно обновление — нажмите'; } }
    else { $('updState').textContent = 'актуальна'; $('updState').className = 'chip ok'; $('updText').textContent = `Установлена последняя версия v${r.current}.`; }
    $('updTok').placeholder = r.token ? 'ключ задан (введите новый или оставьте пустым и сохраните, чтобы удалить)' : 'github_pat_…';
  } catch (e) { $('updState').textContent = 'ошибка'; $('updText').textContent = 'Не удалось проверить: ' + e.message; }
}
async function updApply() {
  if (!updInfo || !updInfo.available) return;
  if (!confirm(`Обновить PUFService до v${updInfo.latest}? Программа скачает новую версию и перезапустится (окно обновится само).`)) return;
  $('updApply').disabled = true; $('updState').textContent = 'скачиваю…'; $('updText').textContent = 'Скачиваю и проверяю новую версию…';
  try {
    const r = await fetch('/api/update/apply', { method: 'POST', headers: { 'X-PUF': '1' } }), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || r.statusText);
    $('updState').textContent = 'перезапуск…'; $('updText').textContent = `Установлена v${j.version}. Программа перезапускается — окно обновится само через несколько секунд.`;
    const t0 = Date.now(), want = j.version;
    const poll = async () => {   // the new instance takes over the same address; reload once it answers with the new version
      try { const p = await (await fetch('/api/ping', { cache: 'no-store' })).json(); if (p.version === want) return location.reload(); } catch (e) {}
      if (Date.now() - t0 < 60000) setTimeout(poll, 700); else $('updText').textContent = 'Новая версия не ответила за минуту. Закройте окно и запустите PUFService заново.';
    };
    setTimeout(poll, 1200);
  } catch (e) { $('updApply').disabled = false; $('updState').textContent = 'ошибка'; $('updText').textContent = 'Обновление не выполнено: ' + e.message; }
}
function updInit() {
  $('updCheck').onclick = () => updCheck(false);
  $('updApply').onclick = updApply;
  $('updTokSave').onclick = async () => { try { await api('/api/update/token', { method: 'POST', body: JSON.stringify({ token: $('updTok').value }) }); $('updTok').value = ''; toast('Ключ сохранён'); updCheck(true); } catch (e) { toast('Не сохранилось: ' + e.message); } };
  for (const id of ['ver', 'ver2']) $(id).onclick = () => { if ($(id).classList.contains('new')) { if (mode !== 'live') setMode('live'); setView('about'); } };
  setTimeout(() => updCheck(true), 4000);   // quiet check after start
}

// ---- wiring ----
function initDrive() {
  buildSensors();
  const bindNum = (id, obj, key, after) => { const el = $(id); el.value = obj[key]; el.onchange = () => { const v = parseFloat(String(el.value).replace(',', '.')); if (isFinite(v)) { obj[key] = v; saveSettings(); after && after(); needDraw = true; } }; };
  bindNum('syTolF', S.sync, 'tolF'); bindNum('syTolPhi', S.sync, 'tolPhi'); bindNum('syTolU', S.sync, 'tolU'); bindNum('syOff', S.sync, 'offset', () => { syncHist.length = 0; });
  bindNum('syFc', S.sync, 'fc', () => { if (!(S.sync.fc >= 0)) S.sync.fc = 0; if (S.sync.fc > 0 && S.sync.fc < 200) { S.sync.fc = 0; toast('Несущая ниже 200 Гц не поддерживается — фильтр по умолчанию'); } $('syFc').value = S.sync.fc; syncHist.length = 0; });
  $('pwMult').value = String(S.power.mult); $('pwMult').onchange = e => { S.power.mult = +e.target.value; saveSettings(); needDraw = true; };
  $('pwInv').checked = !!S.power.inv; $('pwInv').onchange = e => { S.power.inv = e.target.checked; saveSettings(); needDraw = true; };
  segSet('stCh', S.start.ch); segInit('stCh', v => { S.start.ch = +v; saveSettings(); needDraw = true; });
  bindNum('stThr', S.start, 'thr'); bindNum('stNom', S.start, 'nom'); bindNum('stPre', S.start, 'pre');
  $('stAuto').checked = !!S.start.auto; $('stAuto').onchange = e => { S.start.auto = e.target.checked; saveSettings(); };
  segSet('pmCh', S.pwm.ch); segInit('pmCh', v => { S.pwm.ch = +v; saveSettings(); needDraw = true; });
  segSet('rpCh', S.rpm.ch); segInit('rpCh', v => { S.rpm.ch = +v; RPM.t.length = RPM.v.length = 0; saveSettings(); needDraw = true; });
  bindNum('rpPpr', S.rpm, 'ppr'); bindNum('rpPoles', S.rpm, 'poles'); bindNum('rpFman', S.rpm, 'fman');
  $('rpFsrc').value = S.rpm.fsrc; $('rpFsrc').onchange = e => { S.rpm.fsrc = e.target.value; saveSettings(); needDraw = true; };
  startUI(); recInit(); anInit(); updInit();
}

// ---------------- init ----------------
function redrawAll() { needDraw = true; if (mode === 'live') drawLive(); else drawFile(); }
addEventListener('resize', redrawAll);
document.addEventListener('contextmenu', e => { if (!e.target.closest('input,textarea')) e.preventDefault(); });
(async () => {
  await loadSettings();
  applyTheme();
  $('stOn').checked = S.st.on; segSet('stSrc', S.st.src); segSet('stEdge', S.st.edge); segSet('stLvl', S.st.lvl); $('stPos').value = S.st.pos;
  $('avgN').value = S.avg; $('smooth').value = String(S.smooth === true ? 1 : +S.smooth || 0); segSet('zeroMode', S.zeroDev ? 'dev' : 'man'); $('fill').checked = S.fill; $('persist').checked = S.persist;
  $$('#chShow button').forEach(b => b.classList.toggle('on', !!S.show[+b.dataset.v]));
  $('holdShort').value = S.holdShort; $('holdLong').value = S.holdLong;
  $('yLab').checked = S.yLabels !== false; $('yLab').onchange = e => { S.yLabels = e.target.checked; saveSettings(); redrawAll(); };
  $('fpsSel').value = String(S.fps); if (!$('fpsSel').value) $('fpsSel').value = '33';
  $('fpsSel').onchange = e => { S.fps = +e.target.value; saveSettings(); if (cur && cur.ver >= 4 && performance.now() - lastFrameAt < 2000) sendFps(); };
  buildPads(); initDrive(); startEvents(); loop(); drawFile();
})();
})();
