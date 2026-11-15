'use strict';
// Vai Vai — diccionario español ⇄ italiano, verbos y ejercicios. Todo se guarda en el móvil.

const STORE_KEY = 'vaivai-v1';            // único: todas las apps de not-xly.github.io comparten localStorage
const $ = (id) => document.getElementById(id);
const LANG = { es: { name: 'Español', bcp: 'es-ES' }, it: { name: 'Italiano', bcp: 'it-IT' } };
const other = (l) => (l === 'es' ? 'it' : 'es');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ICON = (id) => `<svg><use href="#i-${id}"/></svg>`;
// Todo en minúscula inicial (salvo siglas: "UE", "USA")
const lc = (s) => { s = String(s || '').trim(); return /^[¡¿]?\p{Lu}{2}/u.test(s) ? s : s.replace(/^([¡¿"«]?)(\p{Lu})/u, (m, p, c) => p + c.toLowerCase()); };

// ---------- estado guardado ----------
function defaults() {
  return {
    from: 'es',
    favs: [],              // {id, from, text, tr, alts, t, ok, ko}
    hist: [],              // {from, text, tr, alts}
    cache: {},             // traducciones online: "es|hola" -> texto
    mine: {},              // traducciones corregidas a mano: "es|hola" -> texto (mandan siempre)
    fvSort: 'new',
    fvDir: 'es',
    ex: { n: 10, order: 'new', dir: 'es', mode: 'write' },
    last: null,            // última serie {ok, n, t}
  };
}
function load() {
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return defaults();
  try {
    const s = JSON.parse(raw);
    const d = defaults();
    const st = { ...d, ...s, ex: { ...d.ex, ...(s.ex || {}) } };
    // minúscula inicial también en lo guardado antes
    for (const f of st.favs) {
      f.text = lc(f.text); f.tr = lc(f.tr); f.alts = (f.alts || []).map(lc);
      if (f.miss === undefined) f.miss = (f.ko || 0) > (f.ok || 0);   // antes no se marcaban
    }
    for (const h of st.hist) { h.text = lc(h.text); h.tr = lc(h.tr); h.alts = (h.alts || []).map(lc); }
    return st;
  } catch (err) {
    // No machacar los datos: se guarda una copia del texto dañado antes de empezar de cero
    localStorage.setItem(STORE_KEY + '-corrupt-' + Date.now(), raw);
    alert('No se pudieron leer los datos guardados. Se ha guardado una copia.');
    return defaults();
  }
}
let state = load();
function save() {
  const keys = Object.keys(state.cache);
  if (keys.length > 800) for (const k of keys.slice(0, keys.length - 800)) delete state.cache[k];
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (err) { toast('No se pudo guardar (memoria llena)'); }
}

// ---------- utilidades de texto ----------
const norm = (s) => String(s || '').toLowerCase().replace(/[’`´]/g, "'").replace(/[¡!¿?.,;:"«»()]/g, ' ').replace(/\s+/g, ' ').trim();
const fold = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const ARTICLES = /^(il|lo|la|l'|i|gli|le|un|uno|una|un'|el|los|las|unos|unas)\s*/;
const bare = (s) => fold(s).replace(ARTICLES, '').trim();

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

let toastTimer = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
}

// ---------- diccionario offline ----------
const DICT = { es: window.DICT_ES || {}, it: window.DICT_IT || {} };
const VERBS = window.VERBS || {};
const index = {};   // por idioma: {m: Map(plegada -> clave), sorted: [plegadas]}
function idx(lang) {
  if (index[lang]) return index[lang];
  const m = new Map();
  for (const k of Object.keys(DICT[lang])) {
    const f = fold(k);
    if (!m.has(f) || k === k.toLowerCase()) m.set(f, k);   // "stella" antes que "Stella"
  }
  return (index[lang] = { m, sorted: [...m.keys()].sort() });
}

const PERS = ['1ª sing.', '2ª sing.', '3ª sing.', '1ª pl.', '2ª pl.', '3ª pl.'];
const TENSE_ES = { pres: 'presente', imp: 'imperfecto', rem: 'passato remoto', fut: 'futuro', cond: 'condicional', cpres: 'subj. presente', cimp: 'subj. imperfecto' };
let formIndex = null;   // forma conjugada italiana -> {inf, desc}
function verbForms() {
  if (formIndex) return formIndex;
  formIndex = new Map();
  for (const inf of Object.keys(VERBS)) {
    if (!(inf in DICT.it)) continue;
    const r = ItConj.lookup(inf, VERBS);
    if (!r) continue;
    const t = r.t;
    for (const k of ItConj.TENSES) t[k].forEach((f, n) => { if (f && !formIndex.has(f)) formIndex.set(f, { inf, desc: `${PERS[n]} ${TENSE_ES[k]}` }); });
    if (t.part && !formIndex.has(t.part)) formIndex.set(t.part, { inf, desc: 'participio' });
    if (t.ger && !formIndex.has(t.ger)) formIndex.set(t.ger, { inf, desc: 'gerundio' });
  }
  return formIndex;
}

// Busca en el diccionario; devuelve {key, tr, lemma, formDesc} o null
function dictLookup(text, lang) {
  const n = norm(text);
  if (!n) return null;
  const D = DICT[lang];
  const key = n in D ? n : idx(lang).m.get(fold(text));
  if (key) return { key, tr: uniq(D[key].map(lc)) };
  if (lang === 'it') {
    const ref = (window.DICT_REF || {})[n];
    if (ref && D[ref]) return { key: n, tr: uniq(D[ref].map(lc)), lemma: ref, formDesc: 'forma' };
    const vf = verbForms().get(n);
    if (vf) return { key: n, tr: uniq(D[vf.inf].map(lc)), lemma: vf.inf, formDesc: vf.desc };
  }
  const b = n.replace(ARTICLES, '');            // "il libro" -> "libro"
  if (b !== n && b in D) return { key: b, tr: uniq(D[b].map(lc)) };
  return null;
}
function uniq(a) { const seen = new Set(); return a.filter((x) => { const f = fold(x); if (seen.has(f)) return false; seen.add(f); return true; }); }

function suggestions(text, lang, max = 5) {
  const f = fold(text);
  if (f.length < 2) return [];
  const { sorted, m } = idx(lang);
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < f) lo = mid + 1; else hi = mid; }
  const out = [];
  for (let i = lo; i < sorted.length && out.length < 300 && sorted[i].startsWith(f); i++) out.push(m.get(sorted[i]));
  return out.sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).slice(0, max);
}

// ---------- traducción online (frases y palabras que no están en el diccionario) ----------
async function fetchJSON(url, ms = 6000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
// Devuelve {text} o {detected} si el texto ya estaba en el idioma de destino, o null
async function onlineTranslate(text, from, to) {
  const key = from + '|' + text.trim().toLowerCase();
  if (state.cache[key]) return { text: lc(state.cache[key]) };
  if (!navigator.onLine) return null;
  const q = encodeURIComponent(text.trim());
  let detected = null;
  const tries = [
    async () => {
      // sl=auto: Google dice en qué idioma estaba el texto ([[traducción, idioma]])
      const j = await fetchJSON(`https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${to}&q=${q}`);
      if (Array.isArray(j) && Array.isArray(j[0])) { detected = j[0][1]; return j[0][0]; }
      const v = Array.isArray(j) ? j[0] : null;
      return typeof v === 'string' ? v : null;
    },
    async () => {
      const j = await fetchJSON(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${q}`);
      return j && j[0] ? j[0].map((p) => p[0]).join('') : null;
    },
    async () => {
      const j = await fetchJSON(`https://api.mymemory.translated.net/get?q=${q}&langpair=${from}|${to}`);
      return j && j.responseStatus === 200 ? j.responseData.translatedText : null;
    },
  ];
  for (const t of tries) {
    try {
      const v = await t();
      if (detected === to) return { detected };
      if (v && v.trim()) {
        state.cache[key] = v.trim();
        save();
        return { text: lc(v) };
      }
    } catch (err) { /* probar el siguiente servicio */ }
  }
  return null;
}

// ---------- voz ----------
function speak(text, lang) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = LANG[lang].bcp;
  const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.replace('_', '-').startsWith(lang));
  if (v) u.voice = v;
  u.rate = 0.92;
  speechSynthesis.speak(u);
}

// Reconocimiento de voz. En iPhone, Safari a veces no avisa de que la escucha ha
// terminado (onend), y la siguiente ya no arrancaba. Ahora: se cancela siempre la
// anterior, la respuesta se da por buena al llegar el resultado final o tras 1,4 s de
// silencio, y cada botón sabe si está escuchando por su propio estado.
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
function listen(lang, onText, onDone) {
  if (!SR) return false;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (recog) { const old = recog; old.onresult = old.onend = old.onerror = null; try { old.abort(); } catch (e) { /* ya parado */ } recog = null; }
  const r = new SR();
  recog = r;
  r.lang = LANG[lang].bcp;
  r.interimResults = true;
  r.maxAlternatives = 3;
  r.continuous = false;
  let last = '', alts = [], done = false, silence = 0;
  const finish = () => {
    if (done) return;
    done = true;
    clearTimeout(silence); clearTimeout(maxT);
    if (recog === r) { recog = null; try { r.abort(); } catch (e) { /* ya parado */ } }
    onDone(last.trim(), alts);
  };
  const maxT = setTimeout(finish, 12000);
  r.onresult = (e) => {
    let txt = '';
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    const res = e.results[e.results.length - 1];
    last = txt;
    alts = Array.from(res).map((x) => x.transcript);
    onText(txt);
    clearTimeout(silence);
    if (res.isFinal) finish(); else silence = setTimeout(finish, 1400);
  };
  r.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Permite el micrófono o usa el dictado del teclado');
    else if (e.error === 'no-speech') toast('No te he oído. Prueba otra vez.');
    finish();
  };
  r.onend = finish;
  try { r.start(); }
  catch (err) { setTimeout(() => { try { r.start(); } catch (e2) { finish(); } }, 350); }
  return true;
}
function stopListening() { if (recog) { try { recog.stop(); } catch (e) { /* ya parado */ } } }

// ---------- pestañas ----------
function showTab(name) {
  document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-' + name));
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
  stopListening();
  if (name === 'fv') renderFavs();
  if (name === 'ex' && !run) renderExSetup();
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

function setSeg(el, value) { el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(value))); }
function onSeg(el, fn) { el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { setSeg(el, b.dataset.v); fn(b.dataset.v); } }); }
function setStar(btn, on) { btn.classList.toggle('on', on); btn.innerHTML = ICON(on ? 'star-fill' : 'star'); }

// ================= TRADUCIR =================
const trInput = $('trInput');
let current = null;      // resultado mostrado {from, text, tr, alts, ...}
let liveTimer = 0, histTimer = 0, reqId = 0;

function renderLangbar() {
  const f = state.from, t = other(f);
  $('langFrom').textContent = LANG[f].name;
  $('langTo').textContent = LANG[t].name;
  trInput.lang = f;
  trInput.placeholder = f === 'es' ? 'Escribe una palabra o una frase' : 'Scrivi una parola o una frase';
}
$('swap').addEventListener('click', () => {
  $('swap').classList.toggle('spin');
  const resultText = current && current.tr;
  const same = current && norm(trInput.value) === norm(current.text);
  state.from = other(state.from);
  save();
  renderLangbar();
  // Como en los traductores: la traducción pasa a ser el texto de entrada
  if (resultText && same) trInput.value = resultText;
  autoSize();
  if (trInput.value.trim()) translate(true); else hideResult();
});

function autoSize() {
  trInput.style.height = 'auto';
  trInput.style.height = Math.min(trInput.scrollHeight, window.innerHeight * 0.4) + 'px';
  $('trClear').hidden = !trInput.value;
}
trInput.addEventListener('input', () => {
  autoSize();
  renderSuggest();
  clearTimeout(liveTimer);
  if (!trInput.value.trim()) { hideResult(); return; }
  liveTimer = setTimeout(() => translate(false), 700);
});
trInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
});
$('trMic').addEventListener('click', () => {
  const mic = $('trMic');
  if (mic.classList.contains('live')) { stopListening(); return; }
  const ok = listen(state.from, (txt) => { trInput.value = txt; autoSize(); }, (heard) => {
    mic.classList.remove('live');
    if (heard) { trInput.value = heard; autoSize(); submit(); }
  });
  if (ok) mic.classList.add('live');
  else { toast('Usa el micrófono del teclado para dictar'); trInput.focus(); }
});
$('trClear').addEventListener('click', () => { trInput.value = ''; autoSize(); renderSuggest(); hideResult(); trInput.focus(); });

function submit() {
  clearTimeout(liveTimer);
  $('suggest').innerHTML = '';
  if (!trInput.value.trim()) return;
  trInput.blur();
  translate(true);
}

function renderSuggest() {
  const ul = $('suggest');
  const v = trInput.value;
  if (/\s\S+\s/.test(v.trim()) || document.activeElement !== trInput) { ul.innerHTML = ''; return; }
  const list = suggestions(v, state.from).filter((k) => fold(k) !== fold(v));
  ul.innerHTML = list.map((k) => `<li data-k="${esc(k)}"><span style="color:inherit">${esc(lc(k))}</span><span>${esc(uniq(DICT[state.from][k].map(lc)).slice(0, 3).join(', '))}</span></li>`).join('');
}
$('suggest').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  trInput.value = lc(li.dataset.k);
  autoSize();
  submit();
});

function hideResult() { $('trResult').hidden = true; current = null; }

// final = el usuario lo ha pedido (tecla Ir o sugerencia): se guarda en recientes al momento
async function translate(final, autoNote) {
  const text = trInput.value.trim();
  if (!text) return;
  const id = ++reqId;
  clearTimeout(histTimer);
  let from = state.from;
  let hit = dictLookup(text, from);
  let note = autoNote || '';
  const words = norm(text).split(' ').length;
  // Si no está en el idioma elegido pero sí en el otro, se cambia solo
  if (!hit && words <= 3) {
    const o = dictLookup(text, other(from));
    if (o) {
      from = other(from);
      hit = o;
      state.from = from; save(); renderLangbar();
      note = `Detectado: ${LANG[from].name.toLowerCase()}`;
    }
  }
  const to = other(from);
  const res = { from, text: lc(text), tr: '', alts: [], note, lemma: hit && hit.lemma, error: '' };
  const mine = state.mine[from + '|' + fold(text)];
  if (mine) {                                    // la que escribiste tú manda
    res.tr = mine;
    res.alts = hit ? hit.tr.filter((x) => fold(x) !== fold(mine)) : [];
    res.mine = true;
    showResult(res, false);
    if (final) addHistory(res); else histTimer = setTimeout(() => { if (current === res) addHistory(res); }, 2500);
    return;
  }
  if (hit) {
    res.tr = hit.tr[0];
    res.alts = hit.tr.slice(1);
    if (hit.lemma) res.note = (note ? note + ' · ' : '') + `«${lc(text)}» es ${hit.formDesc === 'forma' ? 'una forma' : hit.formDesc} de «${hit.lemma}»`;
  }
  showResult(res, !hit);
  const on = await onlineTranslate(text, from, to);
  if (id !== reqId) return;
  if (on && on.detected && !hit && !autoNote) {
    // Frase escrita en el otro idioma: se cambia el sentido y se traduce otra vez
    state.from = to; save(); renderLangbar();
    return translate(final, `Detectado: ${LANG[to].name.toLowerCase()}`);
  }
  if (on && on.text) {
    if (!hit) res.tr = on.text;
    else if (words >= 3) { res.alts = uniq([res.tr, ...res.alts]).filter((x) => fold(x) !== fold(on.text)); res.tr = on.text; }
    else {
      // Palabra suelta: manda el diccionario (Google a veces la toma por un nombre propio:
      // "Stella" -> "Estela"). Si Google coincide con una de sus acepciones, esa va primero.
      const all = [res.tr, ...res.alts];
      const i = all.findIndex((x) => fold(x) === fold(on.text));
      if (i > 0) { all.unshift(all.splice(i, 1)[0]); res.tr = all[0]; res.alts = all.slice(1); }
    }
  } else if (!hit) {
    res.error = navigator.onLine ? 'No se ha podido traducir. Inténtalo de nuevo.' : 'Sin conexión. Sin internet solo se traducen palabras del diccionario y frases ya traducidas antes.';
  }
  showResult(res, false);
  if (res.tr) {
    if (final) addHistory(res);
    else histTimer = setTimeout(() => { if (current === res) addHistory(res); }, 2500);
  }
}

function showResult(res, loading) {
  current = res;
  $('trResult').hidden = false;
  const main = $('resMain');
  if (document.activeElement !== main) {
    main.value = loading ? '' : res.tr;
    main.placeholder = loading ? 'Traduciendo…' : (res.error ? res.error + ' Puedes escribir tú la traducción.' : 'Escribe la traducción');
    sizeRes();
  }
  $('resAlts').textContent = loading ? '' : res.alts.slice(0, 6).join(', ');
  if (res.mine) res.note = 'Tu traducción';
  $('resNote').textContent = res.note || '';
  const has = !loading && !!res.tr;
  $('resStar').hidden = !has;
  $('resSpeak').hidden = !has;
  setStar($('resStar'), !!findFav(res.from, res.text));
  const verb = has && italianVerbOf(res);
  $('resVerb').hidden = !verb;
  if (verb) { $('resVerb').textContent = `Conjugar «${verb}»`; $('resVerb').dataset.v = verb; }
  // WordReference no deja consultarse desde otra web: se abre su página
  const wr = $('resWR');
  wr.hidden = loading || words(res.text) > 3;
  wr.href = `https://www.wordreference.com/${res.from === 'es' ? 'esit' : 'ites'}/${encodeURIComponent(norm(res.text))}`;
  $('resVerb').parentElement.classList.toggle('none', wr.hidden && !verb);
}
const words = (s) => norm(s).split(' ').length;
function italianVerbOf(res) {
  const cands = res.from === 'it' ? [res.lemma, norm(res.text)] : [norm(res.tr), ...res.alts.map(norm)];
  return cands.find((c) => c && /(are|ere|ire|rre|rsi)$/.test(c) && (c in VERBS || c.replace(/rsi$/, 're') in VERBS)) || null;
}
// La traducción se puede corregir a mano (p. ej. tras mirarla en WordReference):
// se guarda como "tuya", manda en próximas búsquedas y actualiza el favorito si lo es.
const resMain = $('resMain');
function sizeRes() { resMain.style.height = 'auto'; resMain.style.height = resMain.scrollHeight + 'px'; }
resMain.addEventListener('input', () => {
  sizeRes();
  if (!current) return;
  current.tr = resMain.value.trim();
  $('resStar').hidden = $('resSpeak').hidden = !current.tr;
});
resMain.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); resMain.blur(); } });
resMain.addEventListener('change', () => {
  if (!current) return;
  const tr = lc(resMain.value);
  const key = current.from + '|' + fold(current.text);
  if (!tr) { delete state.mine[key]; save(); return; }
  current.tr = tr; current.mine = true; current.error = '';
  state.mine[key] = tr;
  const f = findFav(current.from, current.text);
  if (f) { f.tr = tr; f.alts = (f.alts || []).filter((x) => fold(x) !== fold(tr)); }
  for (const h of state.hist) if (h.from === current.from && fold(h.text) === fold(current.text)) h.tr = tr;
  save();
  renderHistory();
  showResult(current, false);
  toast(f ? 'Traducción corregida en favoritos' : 'Traducción guardada');
});
$('resSpeak').addEventListener('click', () => current && speak(current.tr, other(current.from)));
$('resVerb').addEventListener('click', () => { showTab('vb'); showVerb($('resVerb').dataset.v); });
$('resStar').addEventListener('click', () => {
  if (!current || !current.tr) return;
  const f = findFav(current.from, current.text);
  if (f) state.favs = state.favs.filter((x) => x !== f);
  else { addFav(current.from, current.text, current.tr, current.alts); addHistory(current); toast('Guardado en favoritos'); }
  save();
  showResult(current, false);
  renderHistory();
});

function findFav(from, text) { const f = fold(text); return state.favs.find((x) => x.from === from && fold(x.text) === f); }
function addFav(from, text, tr, alts) {
  state.favs.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from, text: lc(text), tr: lc(tr), alts: (alts || []).slice(0, 6).map(lc), t: Date.now(), ok: 0, ko: 0 });
}

function addHistory(res) {
  state.hist = state.hist.filter((h) => !(h.from === res.from && fold(h.text) === fold(res.text)));
  state.hist.unshift({ from: res.from, text: res.text, tr: res.tr, alts: res.alts.slice(0, 6) });
  state.hist = state.hist.slice(0, 25);
  save();
  renderHistory();
}
function renderHistory() {
  $('histTitle').hidden = !state.hist.length;
  $('histList').innerHTML = state.hist.map((h, i) => {
    const fav = !!findFav(h.from, h.text);
    return `<li data-i="${i}"><div class="row"><span class="a">${esc(h.text)}</span><span class="b">${esc(h.tr)}</span>` +
      `<button class="icon${fav ? ' on' : ''}" data-star aria-label="Favorito">${ICON(fav ? 'star-fill' : 'star')}</button></div></li>`;
  }).join('');
}
$('histList').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const h = state.hist[+li.dataset.i];
  if (e.target.closest('[data-star]')) {
    const f = findFav(h.from, h.text);
    if (f) state.favs = state.favs.filter((x) => x !== f); else addFav(h.from, h.text, h.tr, h.alts);
    save(); renderHistory();
    if (current) showResult(current, false);
    return;
  }
  if (toggleExpand(li)) return;
  openInTranslator(h.from, h.text);
});
$('histClear').addEventListener('click', () => { state.hist = []; save(); renderHistory(); });

// Fila cortada con "…": el primer toque la despliega entera y el siguiente la recoge.
// Si cabe entera, el toque la abre en Traducir como siempre.
function toggleExpand(li) {
  const row = li.querySelector('.row');
  if (row.classList.contains('open')) { row.classList.remove('open'); return true; }
  const cut = [...row.querySelectorAll('.a, .b')].some((e) => e.scrollWidth > e.clientWidth + 1);
  if (!cut) return false;
  row.classList.add('open');
  return true;
}

function openInTranslator(from, text) {
  showTab('tr');
  state.from = from; save(); renderLangbar();
  trInput.value = text; autoSize();
  translate(false);
}

// ================= VERBOS =================
const vbInput = $('vbInput');
const PRON = ['io', 'tu', 'lui/lei', 'noi', 'voi', 'loro'];
const REFL = ['mi', 'ti', 'si', 'ci', 'vi', 'si'];
const TENSE_INFO = [
  ['pres', 'Presente', 'presente'],
  ['imp', 'Imperfetto', 'pretérito imperfecto'],
  ['fut', 'Futuro semplice', 'futuro simple'],
  ['cond', 'Condizionale', 'condicional simple'],
  ['cpres', 'Congiuntivo presente', 'presente de subjuntivo'],
  ['cimp', 'Congiuntivo imperfetto', 'imperfecto de subjuntivo'],
];
const VERB_LIST = Object.keys(VERBS).sort();

vbInput.addEventListener('input', renderVbSuggest);
vbInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); vbInput.blur(); showVerb(vbInput.value); } });
vbInput.addEventListener('search', () => { if (!vbInput.value) { $('vbOut').innerHTML = ''; $('vbEmpty').hidden = false; } });
function renderVbSuggest() {
  const v = fold(vbInput.value);
  const ul = $('vbSuggest');
  if (v.length < 2) { ul.innerHTML = ''; return; }
  let lo = 0, hi = VERB_LIST.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (VERB_LIST[mid] < v) lo = mid + 1; else hi = mid; }
  const all = [];
  for (let i = lo; i < VERB_LIST.length && all.length < 400 && VERB_LIST[i].startsWith(v); i++) all.push(VERB_LIST[i]);
  // primero los del diccionario y los más cortos (suelen ser los más comunes)
  const out = all.sort((a, b) => (b in DICT.it) - (a in DICT.it) || a.length - b.length || (a < b ? -1 : 1)).slice(0, 6);
  const es = DICT.es[norm(vbInput.value)];                     // verbo español -> italiano
  const esV = es ? es.filter((x) => x in VERBS).slice(0, 2) : [];
  ul.innerHTML = esV.map((x) => `<li data-k="${esc(x)}"><span style="color:inherit">${esc(x)}</span><span>${esc(norm(vbInput.value))}</span></li>`).join('') +
    out.filter((x) => !esV.includes(x)).map((x) => `<li data-k="${esc(x)}"><span style="color:inherit">${esc(x)}</span><span>${esc(uniq((DICT.it[x] || []).map(lc)).slice(0, 3).join(', '))}</span></li>`).join('');
}
$('vbSuggest').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (li) { vbInput.blur(); showVerb(li.dataset.k); }
});
$('vbExamples').innerHTML = ['parlare', 'essere', 'avere', 'andare', 'fare', 'finire', 'venire', 'potere'].map((v) => `<button>${v}</button>`).join('');
$('vbExamples').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showVerb(b.textContent); });

// Convierte lo escrito en un infinitivo italiano: parlare / hablar / parlo / lavarsi
function resolveVerb(input) {
  let v = norm(input);
  if (!v) return null;
  let note = '';
  const isVerbName = (x) => x in VERBS || (/rsi$/.test(x) && (x.slice(0, -2) + 'e' in VERBS || x.slice(0, -3) + 'rre' in VERBS));
  if (!isVerbName(v)) {
    const es = DICT.es[v] && DICT.es[v].find((x) => isVerbName(norm(x)));
    const form = verbForms().get(v);
    if (es && /(ar|er|ir|arse|erse|irse)$/.test(v)) { note = `«${v}» en italiano es «${es}»`; v = norm(es); }
    else if (form) { note = `«${v}» es ${form.desc} de «${form.inf}»`; v = form.inf; }
    else if (es) { note = `«${v}» en italiano es «${es}»`; v = norm(es); }
  }
  if (!/(are|ere|ire|rre|rsi)$/.test(v)) return { error: `«${input.trim()}» no parece un verbo italiano (acaban en -are, -ere, -ire o -rre).` };
  const r = ItConj.lookup(v, VERBS);
  if (!r) return { error: `No sé conjugar «${v}».` };
  return { ...r, input: v, note };
}

function showVerb(input) {
  const r = resolveVerb(input);
  vbInput.value = r && !r.error ? r.input : input;
  $('vbSuggest').innerHTML = '';
  $('vbEmpty').hidden = true;
  const out = $('vbOut');
  if (!r || r.error) { out.innerHTML = `<div class="card vb-warn">${esc(r ? r.error : 'Escribe un verbo.')}</div>`; return; }
  const { t, refl, known, input: name } = r;
  const reg = ItConj.regular(r.inf, t.pres[0].endsWith('isco'));
  const es = uniq((DICT.it[name] || DICT.it[r.inf] || []).map(lc));
  const fav = !!findFav('it', name);
  const rp = (n) => (refl ? REFL[n] + ' ' : '');   // reflexivo: mi lavo
  const table = (k, label, sub) => {
    let rows = '';
    for (let n = 0; n < 6; n++) {
      const f = t[k][n];
      const irr = known && reg && reg[k] && reg[k][n] !== f;
      rows += `<tr><td class="p">${PRON[n]}</td><td class="f${irr ? ' irr' : ''}">${rp(n)}${esc(f)}</td></tr>`;
    }
    return `<div class="card tense"><h3>${label}<small>${sub}</small></h3><table>${rows}</table></div>`;
  };
  out.innerHTML =
    `<div class="card"><div class="vb-head"><div class="grow"><h2>${esc(name)}</h2><div class="es">${esc(es.slice(0, 4).join(', '))}</div></div>` +
    `<button class="icon" id="vbSpeak" aria-label="Escuchar">${ICON('speaker')}</button><button class="icon star${fav ? ' on' : ''}" id="vbStar" aria-label="Favorito">${ICON(fav ? 'star-fill' : 'star')}</button></div>` +
    (r.note ? `<div class="note">${esc(r.note)}</div>` : '') +
    `<div class="vb-meta"><div><span>Participio</span><b class="${known && reg && reg.part !== t.part ? 'irr' : ''}">${esc(t.part)}</b></div>` +
    `<div><span>Gerundio</span>${esc(t.ger)}</div><div><span>Auxiliar</span>${t.aux}${t.aux2 ? ` / ${t.aux2}` : ''}</div></div>` +
    (known ? '' : `<div class="vb-warn">No está en mi lista de verbos: conjugación regular estimada.</div>`) +
    `<a class="link vb-link" target="_blank" rel="noopener" href="https://www.wordreference.com/conj/itverbs.aspx?v=${encodeURIComponent(r.inf)}">Conjugación en WordReference</a>` +
    `</div>` +
    `<div class="vb-grid">${TENSE_INFO.map(([k, a, b]) => table(k, a, b)).join('')}</div>`;
  $('vbSpeak').addEventListener('click', () => speak(name, 'it'));
  $('vbStar').addEventListener('click', () => {
    const f = findFav('it', name);
    if (f) state.favs = state.favs.filter((x) => x !== f);
    else if (es[0]) addFav('it', name, es[0], es.slice(1));
    else { toast('Sin traducción: añádelo desde Traducir'); return; }
    save();
    showVerb(name);
  });
  out.querySelectorAll('td.f').forEach((td) => td.addEventListener('click', () => speak(td.textContent, 'it')));
  window.scrollTo(0, 0);
}

// ================= FAVORITOS =================
let openRow = null;
onSeg($('fvSort'), (v) => { state.fvSort = v; save(); renderFavs(); });
onSeg($('fvDir'), (v) => { state.fvDir = v; save(); renderFavs(); });
$('fvSearch').addEventListener('input', renderFavs);

// Pareja [palabra, traducción] según la dirección elegida (ES → IT pone primero el español)
function pair(f, dir) {
  if (dir === 'mix' || dir === f.from) return [f.text, f.tr];
  return [f.tr, f.text];
}
function sortedFavs(order, dir = 'mix') {
  const a = state.favs.slice();
  if (order === 'old') a.sort((x, y) => x.t - y.t);
  else if (order === 'az') a.sort((x, y) => fold(pair(x, dir)[0]).localeCompare(fold(pair(y, dir)[0]), 'es'));
  else a.sort((x, y) => y.t - x.t);
  return a;
}
function renderFavs() {
  setSeg($('fvSort'), state.fvSort);
  setSeg($('fvDir'), state.fvDir);
  const q = fold($('fvSearch').value);
  const list = sortedFavs(state.fvSort, state.fvDir).filter((f) => !q || fold(f.text).includes(q) || fold(f.tr).includes(q));
  openRow = null;
  $('fvList').innerHTML = list.map((f) => {
    const [a, b] = pair(f, state.fvDir);
    return `<li data-id="${f.id}"><div class="swipe-delete"><span>Eliminar</span></div><div class="row">${f.miss ? '<span class="dot" title="Fallada"></span>' : ''}<span class="a">${esc(a)}</span><span class="b">${esc(b)}</span></div></li>`;
  }).join('');
  $('fvCount').textContent = state.favs.length ? `${state.favs.length} ${state.favs.length === 1 ? 'favorito' : 'favoritos'}` + (q ? ` · ${list.length} encontrados` : '') : '';
  $('fvEmpty').hidden = state.favs.length > 0;
}

// Deslizar a la izquierda para eliminar (como en iPhone): corto muestra el botón, largo borra
const SWIPE_REVEAL = 92, SWIPE_DELETE_RATIO = 0.55;
let sw = null, suppressClick = false;
const fvList = $('fvList');
function setOffset(li, x) {
  const full = x < -li.offsetWidth * SWIPE_DELETE_RATIO;
  li.querySelector('.row').style.transform = x ? `translate3d(${x}px,0,0)` : '';
  const btn = li.querySelector('.swipe-delete');
  btn.style.width = `${-x}px`;
  btn.firstChild.style.transform = full ? `translate3d(${x + SWIPE_REVEAL}px,0,0)` : '';
}
function closeRow(li = openRow) { if (li) setOffset(li, 0); if (li === openRow) openRow = null; }
function removeRow(li) {
  const id = li.dataset.id;
  li.classList.remove('swiping');
  setOffset(li, -li.offsetWidth);
  li.style.height = li.offsetHeight + 'px';
  requestAnimationFrame(() => { li.classList.add('removing'); li.style.height = '0px'; });
  state.favs = state.favs.filter((f) => f.id !== id);
  save();
  openRow = null;
  setTimeout(renderFavs, 230);
}
fvList.addEventListener('touchstart', (e) => {
  suppressClick = false;
  const li = e.target.closest('li');
  if (openRow && li !== openRow) { closeRow(); suppressClick = true; sw = null; return; }
  if (!li || e.touches.length !== 1) { sw = null; return; }
  const t = e.touches[0];
  sw = { li, x0: t.clientX, y0: t.clientY, base: li === openRow ? -SWIPE_REVEAL : 0, x: 0, on: false };
}, { passive: true });
fvList.addEventListener('touchmove', (e) => {
  if (!sw) return;
  const t = e.touches[0];
  const dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
  if (!sw.on) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (Math.abs(dx) > Math.abs(dy) && (dx < 0 || sw.base)) { sw.on = true; sw.x0 = t.clientX; sw.li.classList.add('swiping'); suppressClick = true; }
    else { sw = null; return; }
  }
  if (e.cancelable) e.preventDefault();
  sw.x = Math.max(-sw.li.offsetWidth, Math.min(0, sw.base + t.clientX - sw.x0));
  setOffset(sw.li, sw.x);
}, { passive: false });
function endSwipe() {
  if (!sw || !sw.on) { sw = null; return; }
  const { li, x } = sw;
  li.classList.remove('swiping');
  if (x < -li.offsetWidth * SWIPE_DELETE_RATIO) removeRow(li);
  else if (x < -SWIPE_REVEAL / 2) { setOffset(li, -SWIPE_REVEAL); openRow = li; }
  else closeRow(li);
  sw = null;
}
fvList.addEventListener('touchend', endSwipe);
fvList.addEventListener('touchcancel', endSwipe);
document.addEventListener('touchstart', (e) => { if (openRow && !fvList.contains(e.target)) closeRow(); }, { passive: true });
fvList.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const li = e.target.closest('li');
  if (!li) return;
  if (e.target.closest('.swipe-delete')) { removeRow(li); return; }
  if (openRow) { closeRow(); return; }
  if (toggleExpand(li)) return;
  const f = state.favs.find((x) => x.id === li.dataset.id);
  if (f) openInTranslator(f.from, f.text);
});

// Copia de seguridad
$('exportBtn').addEventListener('click', async () => {
  const data = JSON.stringify({ app: 'vaivai', v: 1, favs: state.favs, hist: state.hist }, null, 1);
  const name = `vaivai-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([data], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Copia de Vai Vai' }); return; } catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.favs)) throw new Error('formato');
    let added = 0;
    for (const f of d.favs) {
      if (!f || !f.text || !f.from || findFav(f.from, f.text)) continue;
      state.favs.push({ ok: 0, ko: 0, alts: [], t: Date.now(), ...f, text: lc(f.text), tr: lc(f.tr), id: f.id || Date.now().toString(36) + added });
      added++;
    }
    save(); renderFavs();
    toast(`${added} favoritos importados`);
  } catch (err) { toast('Ese archivo no es una copia de Vai Vai'); }
});

// ================= EJERCICIOS =================
let run = null;   // {items:[{id, from, prompt, answers}], i, ok, results:[]}
onSeg($('exN'), (v) => { state.ex.n = +v; save(); renderExSetup(); });
onSeg($('exOrder'), (v) => { state.ex.order = v; save(); renderExSetup(); });
onSeg($('exDir'), (v) => { state.ex.dir = v; save(); });
onSeg($('exMode'), (v) => { state.ex.mode = v; save(); renderExSetup(); });

function renderExSetup() {
  $('exSetup').hidden = false; $('exRun').hidden = true; $('exEnd').hidden = true;
  setSeg($('exN'), state.ex.n); setSeg($('exOrder'), state.ex.order); setSeg($('exDir'), state.ex.dir); setSeg($('exMode'), state.ex.mode);
  const n = state.favs.length;
  const miss = state.favs.filter((f) => f.miss).length;
  if (state.ex.order === 'miss') {
    $('exStart').disabled = miss === 0;
    $('exInfo').textContent = n === 0 ? 'Primero guarda palabras en favoritos.' : miss === 0 ? 'No tienes palabras falladas. Las que falles (o marques) aparecerán aquí.' :
      miss < state.ex.n ? `Tienes ${miss} ${miss === 1 ? 'fallada' : 'falladas'}: la serie tendrá ${miss}.` : `${miss} falladas disponibles.`;
  } else {
    $('exStart').disabled = n === 0;
    $('exInfo').textContent = n === 0 ? 'Primero guarda palabras en favoritos.' :
      n < state.ex.n ? `Tienes ${n} favoritos: la serie tendrá ${n}.` : `${n} favoritos disponibles.`;
  }
  if (state.ex.mode === 'speak' && !SR) $('exInfo').textContent += ' Para hablar usa el dictado del teclado.';
  $('exLast').textContent = state.last ? `Última serie: ${state.last.ok} de ${state.last.n} (${Math.round(state.last.ok / state.last.n * 100)} %)` : '';
}

// Respuestas válidas para una ficha en una dirección
function answersFor(fav, from) {
  if (fav.from === from) return { prompt: fav.text, answers: [fav.tr, ...(fav.alts || [])].filter(Boolean) };
  // al revés: se pregunta la traducción y vale la palabra original o lo que diga el diccionario
  const rev = (dictLookup(fav.tr, other(fav.from)) || {}).tr || [];
  return { prompt: fav.tr, answers: uniq([fav.text, ...rev]) };
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

$('exStart').addEventListener('click', () => {
  const favs = state.favs.filter((f) => f.tr);
  if (!favs.length) return;
  const order = state.ex.order;
  const pick = order === 'rnd' ? shuffle(favs.slice()).slice(0, state.ex.n)
    : order === 'miss' ? shuffle(favs.filter((f) => f.miss)).slice(0, state.ex.n)
    : sortedFavs(order).filter((f) => f.tr).slice(0, state.ex.n);
  if (!pick.length) return;
  startRun(pick.map((fav) => {
    const from = state.ex.dir === 'mix' ? (Math.random() < 0.5 ? 'es' : 'it') : state.ex.dir;
    return { id: fav.id, from, ...answersFor(fav, from) };
  }));
});
function startRun(items) {
  run = { items, i: 0, ok: 0, results: [] };
  $('exSetup').hidden = true; $('exEnd').hidden = true; $('exRun').hidden = false;
  showQuestion();
}
$('exQuit').addEventListener('click', () => { stopListening(); run = null; renderExSetup(); });

function showQuestion() {
  const it = run.items[run.i];
  const to = other(it.from);
  $('exProg').textContent = `${run.i + 1} de ${run.items.length}`;
  $('exScore').textContent = `${run.ok} ✓`;
  $('exBar').style.width = `${(run.i / run.items.length) * 100}%`;
  $('exDirLabel').textContent = state.ex.dir === 'mix' ? `${LANG[it.from].name} → ${LANG[to].name.toLowerCase()}` : '';
  $('exWord').textContent = it.prompt;
  const a = $('exAnswer');
  a.value = ''; a.className = 'box ex-answer'; a.disabled = false; a.lang = to;
  a.placeholder = to === 'it' ? 'In italiano' : 'En español';
  $('exFeedback').hidden = true;
  $('exCheck').hidden = false; $('exSkip').hidden = false; $('exNext').hidden = true;
  const speakMode = state.ex.mode === 'speak';
  $('exMic').hidden = !speakMode;
  $('exMic').classList.remove('live');
  $('exMicLabel').hidden = !speakMode;
  $('exMicLabel').textContent = SR ? 'Toca y habla' : 'Usa el micrófono del teclado';
  if (!speakMode) setTimeout(() => a.focus(), 50);
}
$('exSpeak').addEventListener('click', () => { const it = run && run.items[run.i]; if (it) speak(it.prompt, it.from); });
$('exSolSpeak').addEventListener('click', () => { const it = run && run.items[run.i]; if (it) speak(it.answers[0], other(it.from)); });
$('exVerdict').addEventListener('click', (e) => { if (e.target.closest('.icon')) $('exSolSpeak').click(); });
$('exAnswer').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!$('exNext').hidden) nextQuestion(); else checkAnswer(); } });
$('exCheck').addEventListener('click', () => checkAnswer());
$('exSkip').addEventListener('click', () => checkAnswer(true));
$('exNext').addEventListener('click', nextQuestion);
$('exMic').addEventListener('click', () => {
  if (!run || !$('exNext').hidden) return;
  if ($('exMic').classList.contains('live')) { stopListening(); return; }
  const it = run.items[run.i];
  const q = run.i;
  const ok = listen(other(it.from), (txt) => { $('exAnswer').value = txt; }, (heard, alts) => {
    $('exMic').classList.remove('live');
    $('exMicLabel').textContent = 'Toca y habla';
    if (!run || run.i !== q || !$('exNext').hidden) return;
    if (heard) { $('exAnswer').value = heard; run.altHeard = alts; checkAnswer(); }
  });
  if (ok) { $('exMic').classList.add('live'); $('exMicLabel').textContent = 'Escuchando…'; }
  else { $('exAnswer').focus(); toast('Toca el micrófono del teclado y habla'); }
});

// Compara la respuesta: exacta, sin acentos (vale, con aviso) o casi (1 letra: no vale)
function grade(given, answers, heard) {
  const g = norm(given);
  if (!g) return { ok: false };
  const tries = [g, ...(heard || []).map(norm)];
  const expand = answers.flatMap((a) => [a, ...a.split(/\s*[,/;]\s*|\s+o\s+/)]).filter(Boolean);
  for (const t of tries) for (const a of expand) {
    const n = norm(a);
    if (t === n || t.replace(ARTICLES, '') === n.replace(ARTICLES, '')) return { ok: true, match: a };
  }
  for (const t of tries) for (const a of expand) if (bare(t) === bare(a)) return { ok: true, match: a, accent: true };
  for (const a of expand) if (bare(a).length >= 4 && lev(bare(g), bare(a)) === 1) return { ok: false, close: a };
  return { ok: false };
}
function checkAnswer(skip) {
  if (!run || !$('exNext').hidden) return;
  stopListening();
  const it = run.items[run.i];
  const given = skip ? '' : $('exAnswer').value;
  if (!skip && !given.trim()) { toast(state.ex.mode === 'speak' ? 'Toca el micrófono y di la respuesta' : 'Escribe tu respuesta'); return; }
  const r = grade(given, it.answers, run.altHeard);
  run.altHeard = null;
  if (r.ok) run.ok++;
  run.results.push({ ...it, given, ok: r.ok });
  const fav = state.favs.find((f) => f.id === it.id);
  // Fallada = marcada para repasar; acertarla después la desmarca
  if (fav) { if (r.ok) fav.ok++; else fav.ko++; fav.miss = !r.ok; save(); }
  renderMark(fav, r.ok);
  const a = $('exAnswer');
  a.disabled = true;
  a.classList.add(r.ok ? 'ok' : 'ko');
  const main = it.answers[0];
  const v = $('exVerdict');
  v.className = 'verdict ' + (r.ok ? 'ok' : 'ko');
  if (r.ok) v.innerHTML = `Correcto${r.accent ? ` · ojo con el acento: ${esc(r.match)}` : ''}<button class="icon" aria-label="Escuchar">${ICON('speaker')}</button>`;
  else v.textContent = r.close ? 'Casi. La respuesta es:' : skip ? 'La respuesta es:' : 'Incorrecto. La respuesta es:';
  $('exSolution').hidden = r.ok;
  $('exSolText').textContent = main;
  const extra = it.answers.slice(1, 4).filter((x) => fold(x) !== fold(main) && (!r.ok || fold(x) !== fold(r.match)));
  $('exAlso').textContent = !r.ok && extra.length ? `También vale: ${extra.join(', ')}` : '';
  $('exFeedback').hidden = false;
  $('exScore').textContent = `${run.ok} ✓`;
  $('exCheck').hidden = true; $('exSkip').hidden = true; $('exNext').hidden = false;
  $('exNext').textContent = run.i + 1 < run.items.length ? 'Siguiente' : 'Ver resultado';
  $('exNext').focus();
}
function renderMark(fav, ok) {
  const b = $('exMark');
  b.hidden = !fav;
  if (!fav) return;
  b.classList.toggle('on', !!fav.miss);
  b.textContent = fav.miss ? (ok ? 'Marcada para repasar · quitar' : 'Marcada para repasar en «Falladas» · quitar') : 'Marcar para repasar';
}
$('exMark').addEventListener('click', () => {
  const it = run && run.items[run.i];
  const fav = it && state.favs.find((f) => f.id === it.id);
  if (!fav) return;
  fav.miss = !fav.miss;
  save();
  const res = run.results[run.results.length - 1];
  renderMark(fav, res && res.ok);
});
function nextQuestion() {
  run.i++;
  if (run.i < run.items.length) showQuestion(); else finishRun();
}
function finishRun() {
  const n = run.items.length, ok = run.ok, pct = Math.round((ok / n) * 100);
  state.last = { ok, n, t: Date.now() };
  save();
  $('exRun').hidden = true; $('exEnd').hidden = false;
  $('exRing').style.setProperty('--p', pct);
  $('exPct').textContent = pct + '%';
  $('exEndMsg').textContent = pct === 100 ? 'Perfetto!' : pct >= 80 ? 'Bravissimo!' : pct >= 50 ? 'Bene, continua così' : 'Dai, riprova!';
  $('exEndSub').textContent = `${ok} de ${n} aciertos`;
  $('exReview').innerHTML = run.results.map((r) =>
    `<li><div class="row"><span class="mk ${r.ok ? 'ok' : 'ko'}">${r.ok ? '✓' : '✗'}</span><span class="a">${esc(r.prompt)}</span>` +
    `<span class="b">${r.ok || !r.given ? '' : `<span class="yours">${esc(r.given)}</span>`}${esc(r.answers[0])}</span></div></li>`).join('');
  $('exRetry').hidden = ok === n;
  window.scrollTo(0, 0);
}
$('exRetry').addEventListener('click', () => {
  startRun(shuffle(run.results.filter((r) => !r.ok).map(({ id, from, prompt, answers }) => ({ id, from, prompt, answers }))));
});
$('exAgain').addEventListener('click', () => { run = null; renderExSetup(); });

// ---------- arranque ----------
renderLangbar();
renderHistory();
renderExSetup();
if ('speechSynthesis' in window) speechSynthesis.getVoices();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
