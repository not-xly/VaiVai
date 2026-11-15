'use strict';
// Vai Vai — diccionario español ⇄ italiano, verbos y ejercicios. Todo se guarda en el móvil.

const STORE_KEY = 'vaivai-v1';            // único: todas las apps de not-xly.github.io comparten localStorage
const $ = (id) => document.getElementById(id);
const LANG = { es: { name: 'Español', flag: '🇪🇸', bcp: 'es-ES' }, it: { name: 'Italiano', flag: '🇮🇹', bcp: 'it-IT' } };
const other = (l) => (l === 'es' ? 'it' : 'es');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- estado guardado ----------
function defaults() {
  return {
    from: 'es',
    favs: [],              // {id, from, text, tr, alts, t, ok, ko}
    hist: [],              // {from, text, tr}
    cache: {},             // traducciones online: "es|hola" -> texto
    fvSort: 'new',
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
    return { ...d, ...s, ex: { ...d.ex, ...(s.ex || {}) } };
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
const bare = (s) => fold(s).replace(ARTICLES, '').replace(/^(to |a )/, '').trim();

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
const index = {};   // por idioma: {fold: Map(fold -> clave), sorted: [claves plegadas]}
function idx(lang) {
  if (index[lang]) return index[lang];
  const m = new Map();
  for (const k of Object.keys(DICT[lang])) {
    const f = fold(k);
    if (!m.has(f) || k === k.toLowerCase()) m.set(f, k);
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
  let key = n in D ? n : (text.trim() in D ? text.trim() : idx(lang).m.get(fold(text)));
  if (key) return { key, tr: D[key] };
  if (lang === 'it') {
    const ref = (window.DICT_REF || {})[n];
    if (ref && D[ref]) return { key: n, tr: D[ref], lemma: ref, formDesc: 'forma' };
    const vf = verbForms().get(n);
    if (vf) return { key: n, tr: D[vf.inf], lemma: vf.inf, formDesc: vf.desc };
  }
  // sin artículo: "il libro" -> "libro"
  const b = n.replace(ARTICLES, '');
  if (b !== n && b in D) return { key: b, tr: D[b] };
  return null;
}

function suggestions(text, lang, max = 6) {
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
async function onlineTranslate(text, from, to) {
  const key = from + '|' + text.trim().toLowerCase();
  if (state.cache[key]) return { text: state.cache[key], src: 'guardada' };
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
      if (detected === to) return { detected };   // el texto ya estaba en el otro idioma
      if (v && v.trim()) {
        state.cache[key] = v.trim();
        save();
        return { text: v.trim(), src: 'Google' };
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
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;
// Escucha una frase; onText(texto, final). Devuelve false si el navegador no puede.
function listen(lang, onText, onEnd) {
  if (!SR) return false;
  stopListening();
  try {
    recog = new SR();
    recog.lang = LANG[lang].bcp;
    recog.interimResults = true;
    recog.maxAlternatives = 3;
    recog.continuous = false;
    let finalText = '';
    recog.onresult = (e) => {
      let txt = '';
      for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
      const fin = e.results[e.results.length - 1].isFinal;
      if (fin) finalText = txt;
      onText(txt, fin, e.results[e.results.length - 1]);
    };
    recog.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Permite el micrófono o usa el dictado del teclado 🎤');
      else if (e.error === 'no-speech') toast('No te he oído. Prueba otra vez.');
    };
    recog.onend = () => { recog = null; onEnd && onEnd(finalText); };
    recog.start();
    return true;
  } catch (err) {
    recog = null;
    return false;
  }
}
function stopListening() { if (recog) { try { recog.stop(); } catch (e) { /* ya parado */ } } }

// ---------- pestañas ----------
let currentTab = 'tr';
function showTab(name) {
  currentTab = name;
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

function updateNet() { $('netState').hidden = navigator.onLine; }
window.addEventListener('online', updateNet);
window.addEventListener('offline', updateNet);

// ================= TRADUCIR =================
const trInput = $('trInput');
let current = null;      // resultado mostrado {from, text, tr, alts, ...}
let liveTimer = 0, reqId = 0;

function renderLangbar() {
  const f = state.from, t = other(f);
  $('langFrom').textContent = `${LANG[f].flag} ${LANG[f].name}`;
  $('langTo').textContent = `${LANG[t].flag} ${LANG[t].name}`;
  trInput.lang = f;
  trInput.placeholder = f === 'es' ? 'Escribe una palabra o una frase…' : 'Scrivi una parola o una frase…';
}
$('swap').addEventListener('click', () => {
  $('swap').classList.toggle('spin');
  const resultText = current && current.tr;
  state.from = other(state.from);
  save();
  renderLangbar();
  // Como en los traductores: la traducción pasa a ser el texto de entrada
  if (resultText && norm(trInput.value) === norm(current.text)) trInput.value = resultText;
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
$('trGo').addEventListener('click', submit);
$('trClear').addEventListener('click', () => { trInput.value = ''; autoSize(); renderSuggest(); hideResult(); trInput.focus(); });
$('trSpeakSrc').addEventListener('click', () => speak(trInput.value, state.from));
$('trMic').addEventListener('click', () => {
  if (recog) { stopListening(); return; }
  const ok = listen(state.from, (txt) => { trInput.value = txt; autoSize(); }, (fin) => {
    $('trMic').classList.remove('live');
    if (fin) submit();
  });
  if (ok) $('trMic').classList.add('live');
  else { toast('Usa el micrófono del teclado para dictar 🎤'); trInput.focus(); }
});

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
  const list = suggestions(v, state.from).filter((k) => fold(k) !== fold(v)).slice(0, 5);
  ul.innerHTML = list.map((k) => `<li data-k="${esc(k)}"><b>${esc(k)}</b><span>${esc(DICT[state.from][k].slice(0, 3).join(', '))}</span></li>`).join('');
}
$('suggest').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  trInput.value = li.dataset.k;
  autoSize();
  submit();
});

function hideResult() { $('trResult').hidden = true; current = null; }

// final = el usuario lo ha pedido (Enter/botón): se guarda en recientes
async function translate(final, autoNote) {
  const text = trInput.value.trim();
  if (!text) return;
  const id = ++reqId;
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
  const res = { from, text, tr: '', alts: [], note, lemma: hit && hit.lemma, formDesc: hit && hit.formDesc, src: '' };
  if (hit) {
    res.tr = hit.tr[0];
    res.alts = hit.tr.slice(1);
    res.src = 'Diccionario';
    if (hit.lemma) res.note = (note ? note + ' · ' : '') + `«${text}» es ${hit.formDesc === 'forma' ? 'una forma' : hit.formDesc} de «${hit.lemma}»`;
  }
  showResult(res, !hit);
  let on = await onlineTranslate(text, from, to);
  if (id !== reqId) return;
  if (on && on.detected && !autoNote) {
    // Frase escrita en el otro idioma: se cambia el sentido y se traduce otra vez
    state.from = to; save(); renderLangbar();
    return translate(final, `Detectado: ${LANG[to].name.toLowerCase()}`);
  }
  if (on) {
    const t = on.text;
    if (!hit) { res.tr = t; res.src = on.src === 'guardada' ? 'Traducción guardada' : 'Traducción online (Google)'; }
    else if (words > 1 || fold(t) !== fold(res.tr)) {
      // la online suele acertar el sentido más común; el diccionario aporta las demás
      const all = [res.tr, ...res.alts].filter((x) => fold(x) !== fold(t));
      res.alts = all;
      res.tr = t;
      res.src = 'Online + diccionario';
    }
  } else if (!hit) {
    res.tr = '';
    res.src = 'No hay conexión (o el servicio no responde). Sin internet funcionan las palabras del diccionario y las frases ya traducidas antes.';
  }
  showResult(res, false);
  if (final && res.tr) addHistory(res);
}

function showResult(res, loading) {
  current = res;
  $('trResult').hidden = false;
  const to = other(res.from);
  $('resMain').innerHTML = `<span class="lbl">${LANG[to].flag} ${LANG[to].name}</span>${loading ? '<span class="muted">Traduciendo…</span>' : esc(res.tr || '—')}`;
  $('resNote').textContent = res.note || '';
  $('resAlts').innerHTML = res.alts.slice(0, 8).map((a) => `<button>${esc(a)}</button>`).join('');
  $('resSource').textContent = loading ? '' : res.src;
  // WordReference no deja consultarse desde otra web: se abre su página en Safari
  const wr = $('resWR');
  wr.hidden = loading || norm(res.text).split(' ').length > 3;
  wr.href = `https://www.wordreference.com/${res.from === 'es' ? 'esit' : 'ites'}/${encodeURIComponent(norm(res.text))}`;
  $('resStar').hidden = !res.tr;
  $('resSpeak').hidden = !res.tr;
  $('resStar').classList.toggle('on', !!findFav(res.from, res.text));
  $('resStar').textContent = findFav(res.from, res.text) ? '★' : '☆';
  // ¿Hay un verbo italiano que conjugar?
  const verb = italianVerbOf(res);
  $('resVerb').hidden = !verb;
  if (verb) { $('resVerb').textContent = `Ver conjugación de «${verb}» →`; $('resVerb').dataset.v = verb; }
}
function italianVerbOf(res) {
  const cands = res.from === 'it' ? [res.lemma, norm(res.text)] : [norm(res.tr), ...res.alts.map(norm)];
  return cands.find((c) => c && /(are|ere|ire|rre|rsi)$/.test(c) && (c in VERBS || c.replace(/rsi$/, 're') in VERBS)) || null;
}
$('resSpeak').addEventListener('click', () => current && speak(current.tr, other(current.from)));
$('resAlts').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) speak(b.textContent, other(current.from));
});
$('resVerb').addEventListener('click', () => { showTab('vb'); showVerb($('resVerb').dataset.v); });
$('resStar').addEventListener('click', () => {
  if (!current || !current.tr) return;
  const f = findFav(current.from, current.text);
  if (f) {
    state.favs = state.favs.filter((x) => x !== f);
    toast('Quitado de favoritos');
  } else {
    state.favs.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), from: current.from, text: current.text.trim(), tr: current.tr, alts: current.alts.slice(0, 6), t: Date.now(), ok: 0, ko: 0 });
    toast('★ Guardado en favoritos');
    addHistory(current);
  }
  save();
  showResult(current, false);
  renderHistory();
});

function findFav(from, text) { const f = fold(text); return state.favs.find((x) => x.from === from && fold(x.text) === f); }

function addHistory(res) {
  state.hist = state.hist.filter((h) => !(h.from === res.from && fold(h.text) === fold(res.text)));
  state.hist.unshift({ from: res.from, text: res.text, tr: res.tr, alts: res.alts.slice(0, 6) });
  state.hist = state.hist.slice(0, 25);
  save();
  renderHistory();
}
function renderHistory() {
  const ul = $('histList');
  $('histTitle').hidden = !state.hist.length;
  ul.innerHTML = state.hist.map((h, i) => {
    const fav = findFav(h.from, h.text);
    return `<li data-i="${i}"><span>${LANG[h.from].flag}</span><div class="t"><b>${esc(h.text)}</b><div>${esc(h.tr)}</div></div><button class="mini-star ${fav ? 'on' : ''}" data-star="${i}">${fav ? '★' : '☆'}</button></li>`;
  }).join('');
}
$('histList').addEventListener('click', (e) => {
  const star = e.target.closest('[data-star]');
  const li = e.target.closest('li');
  if (!li) return;
  const h = state.hist[+li.dataset.i];
  if (star) {
    const f = findFav(h.from, h.text);
    if (f) state.favs = state.favs.filter((x) => x !== f);
    else state.favs.push({ id: Date.now().toString(36), from: h.from, text: h.text, tr: h.tr, alts: h.alts || [], t: Date.now(), ok: 0, ko: 0 });
    save(); renderHistory();
    if (current) showResult(current, false);
    return;
  }
  openInTranslator(h.from, h.text);
});
$('histClear').addEventListener('click', () => { state.hist = []; save(); renderHistory(); });

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
  ['pres', 'Presente', 'Presente de indicativo'],
  ['rem', 'Passato remoto', 'Pretérito perfecto simple (hablé)'],
  ['fut', 'Futuro semplice', 'Futuro simple'],
  ['cond', 'Condizionale presente', 'Condicional simple'],
  ['cpres', 'Congiuntivo presente', 'Presente de subjuntivo'],
  ['cimp', 'Congiuntivo imperfetto', 'Pretérito imperfecto de subjuntivo'],
];
const TENSE_MORE = [
  ['pp', 'Passato prossimo', 'Pretérito perfecto compuesto (he hablado) — el pasado más usado al hablar'],
  ['imp', 'Imperfetto', 'Pretérito imperfecto de indicativo (hablaba)'],
];
const AUX_PRES = { avere: ['ho', 'hai', 'ha', 'abbiamo', 'avete', 'hanno'], essere: ['sono', 'sei', 'è', 'siamo', 'siete', 'sono'] };
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
  // verbo español -> italiano
  const es = DICT.es[norm(vbInput.value)];
  const esV = es ? es.filter((x) => x in VERBS).slice(0, 2) : [];
  ul.innerHTML = esV.map((x) => `<li data-k="${esc(x)}"><b>${esc(x)}</b><span>= ${esc(norm(vbInput.value))}</span></li>`).join('') +
    out.filter((x) => !esV.includes(x)).map((x) => `<li data-k="${esc(x)}"><b>${esc(x)}</b><span>${esc((DICT.it[x] || []).slice(0, 3).join(', '))}</span></li>`).join('');
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
  if (!/(are|ere|ire|rre|rsi)$/.test(v)) return { error: `«${input.trim()}» no parece un verbo italiano (deben acabar en -are, -ere, -ire o -rre).` };
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
  const es = DICT.it[name] || DICT.it[r.inf] || [];
  const fav = findFav('it', name);
  const rp = (n) => (refl ? REFL[n] + ' ' : '');   // reflexivo: mi lavo, mi sono lavato
  const part = t.part;
  const agree = (n) => (t.aux === 'essere' ? (n < 3 ? part.replace(/o$/, 'o/a') : part.replace(/o$/, 'i/e')) : part);
  const cell = (k, n, f) => {
    const irr = reg && reg[k] && reg[k][n] !== f && known;
    return `<td class="p">${PRON[n]}</td><td class="f${irr ? ' irr' : ''}">${rp(n)}${esc(f)}</td>`;
  };
  const table = (k, label, sub) => {
    let rows = '';
    for (let n = 0; n < 6; n++) {
      if (k === 'pp') rows += `<tr><td class="p">${PRON[n]}</td><td class="f">${rp(n)}${AUX_PRES[t.aux][n]} ${esc(agree(n))}</td></tr>`;
      else rows += `<tr>${cell(k, n, t[k][n])}</tr>`;
    }
    return `<div class="card tense" data-k="${k}"><h3>${label}<small>${sub}</small></h3><table>${rows}</table></div>`;
  };
  out.innerHTML =
    `<div class="card"><div class="vb-head"><div class="grow"><h2>${esc(name)}</h2><div class="es">${esc(es.slice(0, 4).join(', ') || '')}</div></div>` +
    `<button class="icon-btn" id="vbSpeak">🔊</button><button class="star ${fav ? 'on' : ''}" id="vbStar">${fav ? '★' : '☆'}</button></div>` +
    (r.note ? `<div class="note">${esc(r.note)}</div>` : '') +
    `<dl class="vb-meta"><dt>Participio</dt><dd class="${reg && reg.part !== part && known ? 'irr' : ''}">${esc(part)}</dd>` +
    `<dt>Gerundio</dt><dd>${esc(t.ger)}</dd><dt>Auxiliar</dt><dd>${t.aux}${t.aux2 ? ` <span class="muted">(también ${t.aux2})</span>` : ''}</dd></dl>` +
    `<a class="wr" target="_blank" rel="noopener" href="https://www.wordreference.com/conj/itverbs.aspx?v=${encodeURIComponent(r.inf)}">Conjugación en WordReference ↗</a>` +
    (known ? '' : `<div class="vb-warn">No está en mi lista de verbos: conjugación regular estimada, compruébala.</div>`) +
    `</div>` +
    TENSE_INFO.map(([k, a, b]) => table(k, a, b)).join('') +
    `<div class="more-title">Más tiempos útiles</div>` +
    TENSE_MORE.map(([k, a, b]) => table(k, a, b)).join('');
  $('vbSpeak').addEventListener('click', () => speak(name, 'it'));
  $('vbStar').addEventListener('click', () => {
    const f = findFav('it', name);
    if (f) state.favs = state.favs.filter((x) => x !== f);
    else state.favs.push({ id: Date.now().toString(36), from: 'it', text: name, tr: es[0] || '', alts: es.slice(1, 6), t: Date.now(), ok: 0, ko: 0 });
    if (!f && !es[0]) toast('Sin traducción: añádelo desde Traducir');
    save();
    showVerb(name);
  });
  out.querySelectorAll('td.f').forEach((td) => td.addEventListener('click', () => speak(td.textContent.replace('/a', '').replace('/e', ''), 'it')));
  window.scrollTo(0, 0);
}

// ================= FAVORITOS =================
let openRow = null;
onSeg($('fvSort'), (v) => { state.fvSort = v; save(); renderFavs(); });
$('fvSearch').addEventListener('input', renderFavs);

function sortedFavs(order) {
  const a = state.favs.slice();
  if (order === 'old') a.sort((x, y) => x.t - y.t);
  else if (order === 'az') a.sort((x, y) => fold(x.text).localeCompare(fold(y.text), 'es'));
  else a.sort((x, y) => y.t - x.t);
  return a;
}
function renderFavs() {
  setSeg($('fvSort'), state.fvSort);
  const q = fold($('fvSearch').value);
  const list = sortedFavs(state.fvSort).filter((f) => !q || fold(f.text).includes(q) || fold(f.tr).includes(q));
  openRow = null;
  $('fvList').innerHTML = list.map((f) => {
    const tot = f.ok + f.ko;
    return `<li class="fv-row" data-id="${f.id}"><div class="swipe-delete"><span>Eliminar</span></div>` +
      `<div class="fv-front"><span class="flag">${LANG[f.from].flag}</span><div class="t"><b>${esc(f.text)}</b><div>${esc(f.tr)}</div></div>` +
      `<div class="stat">${tot ? `${f.ok}/${tot} ✓` : ''}<br>${new Date(f.t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div></div></li>`;
  }).join('');
  $('fvCount').textContent = state.favs.length ? `${state.favs.length} ${state.favs.length === 1 ? 'favorito' : 'favoritos'}` + (q ? ` · ${list.length} encontrados` : '') : '';
  $('fvEmpty').hidden = state.favs.length > 0;
  $('fvHint').hidden = state.favs.length === 0;
}

// Deslizar a la izquierda para eliminar (como en iPhone): corto muestra el botón, largo borra
const SWIPE_REVEAL = 92, SWIPE_DELETE_RATIO = 0.55;
let sw = null, suppressClick = false;
const fvList = $('fvList');
function setOffset(row, x) {
  const full = x < -row.offsetWidth * SWIPE_DELETE_RATIO;
  row.querySelector('.fv-front').style.transform = x ? `translate3d(${x}px,0,0)` : '';
  const btn = row.querySelector('.swipe-delete');
  btn.style.width = `${-x}px`;
  btn.firstChild.style.transform = full ? `translate3d(${x + SWIPE_REVEAL}px,0,0)` : '';
}
function closeRow(row = openRow) { if (row) setOffset(row, 0); if (row === openRow) openRow = null; }
function removeRow(row) {
  const id = row.dataset.id;
  row.classList.remove('swiping');
  setOffset(row, -row.offsetWidth);
  row.style.height = row.offsetHeight + 'px';
  requestAnimationFrame(() => { row.classList.add('removing'); row.style.height = '0px'; });
  state.favs = state.favs.filter((f) => f.id !== id);
  save();
  openRow = null;
  setTimeout(renderFavs, 230);
}
fvList.addEventListener('touchstart', (e) => {
  suppressClick = false;
  const row = e.target.closest('.fv-row');
  if (openRow && row !== openRow) { closeRow(); suppressClick = true; sw = null; return; }
  if (!row || e.touches.length !== 1) { sw = null; return; }
  const t = e.touches[0];
  sw = { row, x0: t.clientX, y0: t.clientY, base: row === openRow ? -SWIPE_REVEAL : 0, x: 0, on: false };
}, { passive: true });
fvList.addEventListener('touchmove', (e) => {
  if (!sw) return;
  const t = e.touches[0];
  const dx = t.clientX - sw.x0, dy = t.clientY - sw.y0;
  if (!sw.on) {
    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
    if (Math.abs(dx) > Math.abs(dy) && (dx < 0 || sw.base)) { sw.on = true; sw.x0 = t.clientX; sw.row.classList.add('swiping'); suppressClick = true; }
    else { sw = null; return; }
  }
  if (e.cancelable) e.preventDefault();
  sw.x = Math.max(-sw.row.offsetWidth, Math.min(0, sw.base + t.clientX - sw.x0));
  setOffset(sw.row, sw.x);
}, { passive: false });
function endSwipe() {
  if (!sw || !sw.on) { sw = null; return; }
  const { row, x } = sw;
  row.classList.remove('swiping');
  if (x < -row.offsetWidth * SWIPE_DELETE_RATIO) removeRow(row);
  else if (x < -SWIPE_REVEAL / 2) { setOffset(row, -SWIPE_REVEAL); openRow = row; }
  else closeRow(row);
  sw = null;
}
fvList.addEventListener('touchend', endSwipe);
fvList.addEventListener('touchcancel', endSwipe);
document.addEventListener('touchstart', (e) => { if (openRow && !fvList.contains(e.target)) closeRow(); }, { passive: true });
fvList.addEventListener('click', (e) => {
  if (suppressClick) { suppressClick = false; return; }
  const row = e.target.closest('.fv-row');
  if (!row) return;
  if (e.target.closest('.swipe-delete')) { removeRow(row); return; }
  if (openRow) { closeRow(); return; }
  const f = state.favs.find((x) => x.id === row.dataset.id);
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
      state.favs.push({ ok: 0, ko: 0, alts: [], t: Date.now(), ...f, id: f.id || Date.now().toString(36) + added });
      added++;
    }
    save(); renderFavs();
    toast(`${added} favoritos importados`);
  } catch (err) { toast('Ese archivo no es una copia de Vai Vai'); }
});

// ================= EJERCICIOS =================
let run = null;   // {items:[{fav, from, prompt, answers}], i, ok, results:[]}
onSeg($('exN'), (v) => { state.ex.n = +v; save(); renderExSetup(); });
onSeg($('exOrder'), (v) => { state.ex.order = v; save(); });
onSeg($('exDir'), (v) => { state.ex.dir = v; save(); });
onSeg($('exMode'), (v) => { state.ex.mode = v; save(); renderExSetup(); });

function renderExSetup() {
  $('exSetup').hidden = false; $('exRun').hidden = true; $('exEnd').hidden = true;
  setSeg($('exN'), state.ex.n); setSeg($('exOrder'), state.ex.order); setSeg($('exDir'), state.ex.dir); setSeg($('exMode'), state.ex.mode);
  const n = state.favs.length;
  $('exStart').disabled = n === 0;
  $('exInfo').textContent = n === 0 ? 'Primero guarda palabras en favoritos (☆).' :
    n < state.ex.n ? `Tienes ${n} favoritos: la serie tendrá ${n}.` : `${n} favoritos disponibles.`;
  if (state.ex.mode === 'speak' && !SR) $('exInfo').textContent += ' Para hablar se usará el dictado del teclado 🎤.';
  $('exLast').textContent = state.last ? `Última serie: ${state.last.ok}/${state.last.n} (${Math.round(state.last.ok / state.last.n * 100)} %)` : '';
}

// Respuestas válidas para una ficha en una dirección
function answersFor(fav, from) {
  if (fav.from === from) return { prompt: fav.text, answers: [fav.tr, ...(fav.alts || [])].filter(Boolean) };
  // al revés: se pregunta la traducción y vale la palabra original o lo que diga el diccionario
  const rev = (dictLookup(fav.tr, other(fav.from)) || {}).tr || [];
  return { prompt: fav.tr, answers: [fav.text, ...rev] };
}
function buildItems(favs) {
  return favs.map((fav) => {
    const from = state.ex.dir === 'mix' ? (Math.random() < 0.5 ? 'es' : 'it') : state.ex.dir;
    const { prompt, answers } = answersFor(fav, from);
    return { id: fav.id, from, prompt, answers };
  });
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

$('exStart').addEventListener('click', () => {
  const favs = state.favs.filter((f) => f.tr);
  if (!favs.length) return;
  let pick;
  if (state.ex.order === 'rnd') pick = shuffle(favs.slice()).slice(0, state.ex.n);
  else pick = sortedFavs(state.ex.order).filter((f) => f.tr).slice(0, state.ex.n);
  startRun(buildItems(pick));
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
  $('exProg').textContent = `${run.i + 1} / ${run.items.length}`;
  $('exScore').textContent = `✓ ${run.ok}`;
  $('exBar').style.width = `${(run.i / run.items.length) * 100}%`;
  $('exAsk').textContent = `${LANG[it.from].flag} ${LANG[it.from].name}`;
  $('exWord').textContent = it.prompt;
  $('exTarget').textContent = `Tradúcelo al ${LANG[to].name.toLowerCase()} ${LANG[to].flag}`;
  const a = $('exAnswer');
  a.value = ''; a.className = 'ex-answer'; a.disabled = false; a.lang = to;
  a.placeholder = to === 'it' ? 'Scrivi in italiano' : 'Escribe en español';
  $('exFeedback').hidden = true;
  $('exCheck').hidden = false; $('exSkip').hidden = false; $('exNext').hidden = true;
  const speakMode = state.ex.mode === 'speak';
  $('exMic').hidden = !speakMode;
  $('exMic').classList.remove('live');
  $('exMicLabel').textContent = SR ? 'Toca y habla' : 'Usa el 🎤 del teclado';
  if (!speakMode) setTimeout(() => a.focus(), 50);
  if (it.from === 'it') speak(it.prompt, 'it');
}
$('exSpeak').addEventListener('click', () => { const it = run && run.items[run.i]; if (it) speak(it.prompt, it.from); });
$('exAnswer').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (!$('exNext').hidden) nextQuestion(); else checkAnswer(); } });
$('exCheck').addEventListener('click', () => checkAnswer());
$('exSkip').addEventListener('click', () => checkAnswer(true));
$('exNext').addEventListener('click', nextQuestion);
$('exMic').addEventListener('click', () => {
  if (!run || !$('exNext').hidden) return;
  if (recog) { stopListening(); return; }
  const it = run.items[run.i];
  const ok = listen(other(it.from), (txt, fin, alts) => {
    $('exAnswer').value = txt;
    if (fin && alts) run.altHeard = Array.from(alts).map((x) => x.transcript);
  }, (fin) => {
    $('exMic').classList.remove('live');
    $('exMicLabel').textContent = 'Toca y habla';
    if (fin && run && $('exNext').hidden) checkAnswer();
  });
  if (ok) { $('exMic').classList.add('live'); $('exMicLabel').textContent = 'Escuchando…'; }
  else { $('exAnswer').focus(); toast('Toca el 🎤 del teclado y habla'); }
});

// Compara la respuesta: exacta, sin acentos (vale, con aviso) o casi (1 letra: no vale)
function grade(given, answers, heard) {
  const g = norm(given);
  if (!g) return { ok: false };
  const tries = [g, ...(heard || []).map(norm)];
  const expand = answers.flatMap((a) => [a, ...a.split(/\s*[,/;]\s*|\s+o\s+/)]).filter(Boolean);
  for (const t of tries) {
    for (const a of expand) {
      const n = norm(a);
      if (t === n || t.replace(ARTICLES, '') === n.replace(ARTICLES, '')) return { ok: true, match: a };
    }
  }
  for (const t of tries) for (const a of expand) if (bare(t) === bare(a)) return { ok: true, match: a, accent: fold(t) === fold(a) && norm(t) !== norm(a) };
  for (const a of expand) if (bare(a).length >= 4 && lev(bare(g), bare(a)) === 1) return { ok: false, close: a };
  return { ok: false };
}
function checkAnswer(skip) {
  if (!run) return;
  stopListening();
  const it = run.items[run.i];
  const given = skip ? '' : $('exAnswer').value;
  if (!skip && !given.trim()) { toast(state.ex.mode === 'speak' ? 'Toca el micrófono y di la respuesta' : 'Escribe tu respuesta'); return; }
  const r = grade(given, it.answers, run.altHeard);
  run.altHeard = null;
  if (r.ok) run.ok++;
  run.results.push({ ...it, given, ok: r.ok });
  const fav = state.favs.find((f) => f.id === it.id);
  if (fav) { if (r.ok) fav.ok++; else fav.ko++; save(); }
  const a = $('exAnswer');
  a.disabled = true;
  a.classList.add(r.ok ? 'ok' : 'ko');
  const fb = $('exFeedback');
  fb.hidden = false;
  fb.className = 'feedback ' + (r.ok ? 'ok' : 'ko');
  const main = it.answers[0];
  const extra = it.answers.slice(1, 4).filter((x) => fold(x) !== fold(main));
  if (r.ok) fb.innerHTML = `✓ <b>¡Correcto!</b>${r.accent ? `<br>Ojo con el acento: <b>${esc(r.match)}</b>` : (fold(r.match) !== fold(main) ? `<br>También: ${esc(main)}` : '')}`;
  else fb.innerHTML = `${r.close ? '¡Casi! ' : skip ? '' : '✗ '}La respuesta es <b>${esc(main)}</b>${extra.length ? `<br><span class="muted">También: ${esc(extra.join(', '))}</span>` : ''}`;
  $('exScore').textContent = `✓ ${run.ok}`;
  $('exCheck').hidden = true; $('exSkip').hidden = true; $('exNext').hidden = false;
  $('exNext').textContent = run.i + 1 < run.items.length ? 'Siguiente →' : 'Ver resultado';
  $('exNext').focus();
  speak(main, other(it.from));
}
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
  $('exEndMsg').textContent = pct === 100 ? 'Perfetto! 🎉' : pct >= 80 ? 'Bravissimo! 👏' : pct >= 50 ? 'Bene, continua così 💪' : 'Dai, riprova! 🙂';
  $('exEndSub').textContent = `${ok} de ${n} aciertos`;
  $('exReview').innerHTML = run.results.map((r) =>
    `<li><span class="mk ${r.ok ? 'ok' : 'ko'}">${r.ok ? '✓' : '✗'}</span><div class="t"><b>${esc(r.prompt)}</b> → ${esc(r.answers[0])}` +
    (r.ok ? '' : `<div>${r.given ? `Tu respuesta: <span class="yours">${esc(r.given)}</span>` : 'Sin respuesta'}</div>`) + `</div></li>`).join('');
  $('exRetry').hidden = ok === n;
  window.scrollTo(0, 0);
}
$('exRetry').addEventListener('click', () => {
  const failed = run.results.filter((r) => !r.ok).map(({ id, from, prompt, answers }) => ({ id, from, prompt, answers }));
  startRun(shuffle(failed));
});
$('exAgain').addEventListener('click', () => { run = null; renderExSetup(); });

// ---------- arranque ----------
renderLangbar();
renderHistory();
updateNet();
renderExSetup();
if ('speechSynthesis' in window) speechSynthesis.getVoices();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
