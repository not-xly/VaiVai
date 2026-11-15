// Motor de conjugación italiana: reglas regulares + excepciones (verbs.js, sacadas de Wiktionary)
(function (root) {
  const TENSES = ['pres', 'imp', 'rem', 'fut', 'cond', 'cpres', 'cimp'];
  const hard = s => /[cg]$/.test(s) ? s + 'h' : s;  // cerc -> cerch (cerchi)

  function regular(inf, isc) {
    const end = inf.slice(-3), st = inf.slice(0, -3);
    const t = {};
    if (end === 'are') {
      // mangi+i -> mangi, cerc+i -> cerchi; futuro: mangi -> mangerò, cerc -> cercherò
      const iSt = /i$/.test(st) ? st.slice(0, -1) : hard(st);
      const fSt = /[cg]i$/.test(st) ? st.slice(0, -1) : (/[cg]$/.test(st) ? st + 'h' : st);
      t.pres = [st + 'o', iSt + 'i', st + 'a', iSt + 'iamo', st + 'ate', st + 'ano'];
      t.imp = ['avo', 'avi', 'ava', 'avamo', 'avate', 'avano'].map(e => st + e);
      t.rem = ['ai', 'asti', 'ò', 'ammo', 'aste', 'arono'].map(e => st + e);
      t.fut = ['erò', 'erai', 'erà', 'eremo', 'erete', 'eranno'].map(e => fSt + e);
      t.cond = ['erei', 'eresti', 'erebbe', 'eremmo', 'ereste', 'erebbero'].map(e => fSt + e);
      t.cpres = [iSt + 'i', iSt + 'i', iSt + 'i', iSt + 'iamo', iSt + 'iate', iSt + 'ino'];
      t.cimp = ['assi', 'assi', 'asse', 'assimo', 'aste', 'assero'].map(e => st + e);
      t.part = st + 'ato'; t.ger = st + 'ando';
    } else if (end === 'ere') {
      const iSt = /i$/.test(st) ? st.slice(0, -1) : st;
      t.pres = [st + 'o', iSt + 'i', st + 'e', iSt + 'iamo', st + 'ete', st + 'ono'];
      t.imp = ['evo', 'evi', 'eva', 'evamo', 'evate', 'evano'].map(e => st + e);
      t.rem = ['ei', 'esti', 'é', 'emmo', 'este', 'erono'].map(e => st + e);
      t.fut = ['erò', 'erai', 'erà', 'eremo', 'erete', 'eranno'].map(e => st + e);
      t.cond = ['erei', 'eresti', 'erebbe', 'eremmo', 'ereste', 'erebbero'].map(e => st + e);
      t.cpres = [st + 'a', st + 'a', st + 'a', iSt + 'iamo', iSt + 'iate', st + 'ano'];
      t.cimp = ['essi', 'essi', 'esse', 'essimo', 'este', 'essero'].map(e => st + e);
      t.part = st + 'uto'; t.ger = st + 'endo';
    } else if (end === 'ire') {
      const iSt = /i$/.test(st) ? st.slice(0, -1) : st;
      const x = isc ? 'isc' : '';
      t.pres = [st + x + 'o', st + x + 'i', st + x + 'e', iSt + 'iamo', st + 'ite', st + x + 'ono'];
      t.imp = ['ivo', 'ivi', 'iva', 'ivamo', 'ivate', 'ivano'].map(e => st + e);
      t.rem = ['ii', 'isti', 'ì', 'immo', 'iste', 'irono'].map(e => st + e);
      t.fut = ['irò', 'irai', 'irà', 'iremo', 'irete', 'iranno'].map(e => st + e);
      t.cond = ['irei', 'iresti', 'irebbe', 'iremmo', 'ireste', 'irebbero'].map(e => st + e);
      t.cpres = [st + x + 'a', st + x + 'a', st + x + 'a', iSt + 'iamo', iSt + 'iate', st + x + 'ano'];
      t.cimp = ['issi', 'issi', 'isse', 'issimo', 'iste', 'issero'].map(e => st + e);
      t.part = st + 'ito'; t.ger = st + 'endo';
    } else return null;
    return t;
  }

  // info: {a:'e'|'ae'|'ea', i:1 (isc), o:{tense:[...6 o null], part, ger}}
  function conjugate(inf, info) {
    info = info || {};
    let t = regular(inf, info.i);
    if (!t) {
      if (!info.o || !TENSES.every(k => info.o[k])) return null;
      t = { part: '', ger: '' };
    }
    const o = info.o || {};
    for (const k of TENSES) {
      if (!o[k]) continue;
      const base = t[k] || [];
      const ov = o[k], res = [];
      for (let n = 0; n < 6; n++) res.push(ov[n] == null || ov[n] === '' ? base[n] : ov[n]);  // huecos = forma regular
      t[k] = res;
    }
    if (o.part) t.part = o.part;
    if (o.ger) t.ger = o.ger;
    const a = info.a || 'a';
    t.aux = a[0] === 'e' ? 'essere' : 'avere';
    t.aux2 = a.length > 1 ? (a[1] === 'e' ? 'essere' : 'avere') : '';
    return t;
  }
  const PREFIXES = ['contrad', 'contra', 'contro', 'sopra', 'sotto', 'ri', 're', 'dis', 'pre', 'pro', 'con', 'com', 'tra', 'tras', 'sop', 'sot', 'sor', 'so', 'ab', 'ad', 'ap', 'as', 'at', 'av', 'de', 'di', 'e', 'in', 'im', 'mal', 'ben', 'per', 'sup', 's'];
  const ACC = { a: 'à', e: 'é', i: 'ì', o: 'ò', u: 'ù' };
  const accentMono = f => { const g = f.match(/[aeiou]+/g) || []; return g.length === 1 && g[0].length === 1 && /[aeiou]$/.test(f) ? f.slice(0, -1) + ACC[f.slice(-1)] : f; };

  // Busca el verbo en VERBS (con reflexivos y prefijos). Devuelve {inf, refl, known, t}
  function lookup(input, VERBS) {
    let inf = input.trim().toLowerCase().replace(/’/g, "'");
    let refl = false;
    if (/rsi$/.test(inf)) {
      refl = true;
      const a = inf.slice(0, -2) + 'e', b = inf.slice(0, -3) + 'rre';
      inf = (b in VERBS && !(a in VERBS)) ? b : a;
    }
    const get = v => {
      let info = VERBS[v];
      if (info === undefined) return null;
      if (typeof info === 'string') {          // "aux:base" -> prefijo + formas del verbo base
        const [aux, base] = info.split(':');
        const bi = get(base);
        if (!bi) return null;
        if (!bi.pres) return null;
        return withPrefix(v.slice(0, -base.length), bi, aux);
      }
      return conjugate(v, info || {});
    };
    let t = get(inf), known = !!t;
    if (!t) {
      for (const p of PREFIXES) {
        if (!inf.startsWith(p)) continue;
        const base = inf.slice(p.length);
        const bt = base.length > 3 && VERBS[base] && (VERBS[base].o || typeof VERBS[base] === 'string') ? get(base) : null;
        if (bt) { t = withPrefix(p, bt); known = true; break; }
      }
    }
    if (!t) t = conjugate(inf, inf.endsWith('ire') ? { i: 1 } : {});
    if (t && refl) t.aux = 'essere', t.aux2 = '';
    return t ? { inf, refl, known, t } : null;
  }
  function withPrefix(p, b, aux) {
    const t = {};
    for (const k of TENSES) t[k] = b[k].map(f => {
      const plain = f.replace(/[àèéìòù]$/, c => c.normalize('NFD')[0]);
      return f !== plain && (f === 'dà' || f === 'può') ? p + f : accentMono(plain) !== plain ? p + accentMono(plain) : p + f;
    });
    t.part = p + b.part; t.ger = p + b.ger;
    t.aux = aux ? (aux[0] === 'e' ? 'essere' : 'avere') : b.aux;
    t.aux2 = aux ? (aux.length > 1 ? (aux[1] === 'e' ? 'essere' : 'avere') : '') : b.aux2;
    return t;
  }
  root.ItConj = { regular, conjugate, lookup, TENSES };
})(typeof window !== 'undefined' ? window : globalThis);
