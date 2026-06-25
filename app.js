'use strict';
/* ============================================================
   Révision Certification AMF — application 100% front, hors-ligne
   ============================================================ */

/* ---------- Service worker ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* ---------- Etat persistant ---------- */
const SKEY = 'amf_rev_v1';
let S = loadState();
function loadState() {
  try { return Object.assign(blank(), JSON.parse(localStorage.getItem(SKEY) || '{}')); }
  catch (e) { return blank(); }
}
function blank() { return { read: {}, pos: {}, q: {}, wrong: {}, flashKnown: {} }; }
function save() { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} }
function resetAll() {
  if (!confirm('Réinitialiser toute ta progression (cours lu, scores, erreurs) ?')) return;
  S = blank(); save(); location.hash = '#/accueil'; render();
}

/* ---------- Contenu ---------- */
let C = null;            // content.json
let QBYID = {};          // qid -> question
let QBYMOD = {};         // mid -> [questions]
let MOD = {};            // mid -> module
let FLASH = [];          // toutes les flashcards "à retenir"

function boot() {
  fetch('content.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error('content'); return r.json(); })
    .then(data => { C = data; indexContent(); start(); })
    .catch(() => {
      document.getElementById('view').innerHTML =
        '<div class="card"><b>Impossible de charger le contenu.</b><br>Vérifie que content.json est présent.</div>';
    });
}

function indexContent() {
  QBYID = {}; QBYMOD = {}; MOD = {}; FLASH = [];
  C.modules.forEach(m => {
    MOD[m.id] = m;
    QBYMOD[m.id] = [];
    (m.qcm || []).forEach((q, i) => {
      q.id = q.id || (m.id + '-q' + i);
      q.module = m.id;
      q.modnum = m.num;
      q.correct = (q.options || []).findIndex(o => o.correcte);
      QBYID[q.id] = q;
      QBYMOD[m.id].push(q);
    });
    (m.essentiel && m.essentiel.a_retenir || []).forEach((t, i) => {
      FLASH.push({ id: m.id + '-r' + i, mid: m.id, modnum: m.num, modnom: m.nom, text: t });
    });
  });
}

/* ---------- Utils ---------- */
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function pct(n, d) { return d > 0 ? Math.round(100 * n / d) : 0; }
function letters(i) { return ['A', 'B', 'C', 'D'][i]; }
const $ = sel => document.querySelector(sel);

/* ---------- Progression ---------- */
function pctRead(mid) {
  const m = MOD[mid]; if (!m || !m.sections.length) return 0;
  let n = 0; m.sections.forEach(s => { if (S.read[s.id]) n++; });
  return pct(n, m.sections.length);
}
function moduleScore(mid) {
  const qs = QBYMOD[mid] || [];
  let att = 0, good = 0;
  qs.forEach(q => { const st = S.q[q.id]; if (st) { att += st.ok + st.ko; good += st.ok; } });
  return { vues: countSeen(mid), total: qs.length, taux: pct(good, att), att };
}
function countSeen(mid) { let n = 0; (QBYMOD[mid] || []).forEach(q => { const st = S.q[q.id]; if (st && (st.ok + st.ko) > 0) n++; }); return n; }
function catEstimate(cat) {
  let att = 0, ok = 0;
  Object.keys(S.q).forEach(qid => {
    const q = QBYID[qid]; if (!q || q.cat !== cat) return;
    const st = S.q[qid]; att += st.ok + st.ko; ok += st.ok;
  });
  return { att, taux: pct(ok, att) };
}
function recordAnswer(qid, correct) {
  const st = S.q[qid] || { ok: 0, ko: 0, streak: 0 };
  if (correct) { st.ok++; st.streak = (st.streak || 0) + 1; }
  else { st.ko++; st.streak = 0; }
  S.q[qid] = st;
  if (!correct) { S.wrong[qid] = 1; }
  else if (st.streak >= 2 && S.wrong[qid]) { delete S.wrong[qid]; } // 2 bonnes de suite -> sort de la file
  save();
}
function toggleMark(qid) { if (S.wrong[qid]) delete S.wrong[qid]; else S.wrong[qid] = 1; save(); }

/* ============================================================
   ROUTER
   ============================================================ */
function start() { window.addEventListener('hashchange', render); render(); bindChrome(); }
function bindChrome() {
  $('#btn-reset').onclick = resetAll;
  $('#btn-search').onclick = () => { location.hash = '#/recherche'; };
}
function parseHash() {
  const h = (location.hash || '#/accueil').replace(/^#\//, '');
  return h.split('/').filter(x => x !== '');
}
function setTab(name) {
  document.querySelectorAll('nav.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === name));
}
function go(h) { location.hash = h; }
window.go = go;

let sess = null; // session QCM en cours

function render() {
  if (!C) return;
  const p = parseHash();
  const v = $('#view'); window.scrollTo(0, 0);
  const screen = p[0] || 'accueil';
  if (screen === 'accueil') { setTab('accueil'); v.innerHTML = vAccueil(); bindAccueil(); }
  else if (screen === 'cours' && !p[1]) { setTab('cours'); v.innerHTML = vCoursList(); }
  else if (screen === 'module') { setTab('cours'); v.innerHTML = vModule(p[1], p[2] || 'essentiel'); bindModule(p[1], p[2] || 'essentiel'); }
  else if (screen === 'lire') { setTab('cours'); v.innerHTML = vModule(p[1], 'complet'); bindModule(p[1], 'complet', p[2]); }
  else if (screen === 'entrainement') { setTab('entrainement'); v.innerHTML = vEntrainement(); }
  else if (screen === 'drill') { setTab('entrainement'); startSession('drill', p[1]); }
  else if (screen === 'examen') { setTab('entrainement'); v.innerHTML = vExamenIntro(); }
  else if (screen === 'examen-run') { setTab('entrainement'); renderSession(); }
  else if (screen === 'erreurs') { setTab('entrainement'); startSession('erreurs'); }
  else if (screen === 'flash') { setTab('entrainement'); startFlash(); }
  else if (screen === 'resultat') { setTab('entrainement'); v.innerHTML = vResultat(); }
  else if (screen === 'recherche') { v.innerHTML = vRecherche(); bindRecherche(); }
  else { v.innerHTML = vAccueil(); bindAccueil(); }
}

/* ============================================================
   ACCUEIL / TABLEAU DE BORD
   ============================================================ */
function gauge(label, taux, att, withSeuil) {
  const cls = att === 0 ? '' : (taux >= 80 ? 'ok' : (taux < 60 ? 'ko' : ''));
  return `<div class="gauge"><div class="lab"><span>${esc(label)}</span><span>${att ? taux + '%' : '—'}</span></div>
    <div class="bar"><div class="fill ${cls}" style="width:${att ? taux : 0}%"></div>${withSeuil ? '<div class="seuil" style="left:80%"></div>' : ''}</div></div>`;
}
function vAccueil() {
  const A = catEstimate('A'), Cc = catEstimate('C');
  const admis = A.att && Cc.att && A.taux >= 80 && Cc.taux >= 80;
  const enoughCov = A.att >= 20 && Cc.att >= 40;
  let html = `<h2 class="page">Tableau de bord</h2>`;
  html += `<div class="card"><div class="serif" style="font-size:1.1rem;margin-bottom:6px">Prêt à passer&nbsp;?</div>`;
  html += `<div class="dual">
      <div>${gauge('Catégorie A', A.taux, A.att, true)}<div class="small muted center">indispensables · seuil 27/33</div></div>
      <div>${gauge('Catégorie C', Cc.taux, Cc.att, true)}<div class="small muted center">culture fin. · seuil 70/87</div></div>
    </div>`;
  if (!enoughCov) html += `<div class="verdict ko">Continue de t'entraîner pour estimer ta réussite</div>`;
  else html += `<div class="verdict ${admis ? 'ok' : 'ko'}">${admis ? '✅ Sur cette base, tu serais ADMIS' : '⏳ Pas encore : il faut ≥ 80 % en A ET en C'}</div>`;
  html += `<div class="small muted center" style="margin-top:6px">Réussite = 80 % en A <b>et</b> 80 % en C, sans compensation.</div></div>`;

  const nbWrong = Object.keys(S.wrong).length;
  html += `<div class="btn-row">
    <button class="btn" onclick="go('#/examen')">🧪 Examen blanc</button>
    <button class="btn sec" onclick="go('#/erreurs')">🔁 Réviser mes erreurs${nbWrong ? ' (' + nbWrong + ')' : ''}</button>
  </div><div class="sp"></div>`;

  html += `<h3 class="sec">Progression par module</h3>`;
  C.modules.forEach(m => {
    const r = pctRead(m.id), sc = moduleScore(m.id);
    const isEsg = m.num === 8;
    html += `<a class="mod card ${isEsg ? 'esg' : ''}" onclick="go('#/module/${m.id}')">
      <div class="row"><div class="num">${m.num}</div>
        <div class="nom">${esc(m.nom)}${isEsg ? ' <span class="tag esg">ESG · priorité</span>' : ''}</div></div>
      <div class="mini">
        <div class="g"><div class="lab"><span>📖 Cours lu</span><span>${r}%</span></div><div class="bar"><i style="width:${r}%"></i></div></div>
        <div class="g"><div class="lab"><span>🎯 Réussite</span><span>${sc.att ? sc.taux + '%' : '—'}</span></div><div class="bar"><i style="width:${sc.att ? sc.taux : 0}%"></i></div></div>
      </div></a>`;
  });
  return html;
}
function bindAccueil() {}

/* ============================================================
   ESPACE COURS
   ============================================================ */
function vCoursList() {
  let html = `<h2 class="page">Cours</h2><div class="note">Lis le cours par module, puis entraîne-toi. Chaque module a une couche « Essentiel » (à retenir) et une couche « Cours complet ».</div><div class="sp"></div>`;
  C.modules.forEach(m => {
    const r = pctRead(m.id);
    html += `<a class="mod card ${m.num === 8 ? 'esg' : ''}" onclick="go('#/module/${m.id}')">
      <div class="row"><div class="num">${m.num}</div>
      <div class="nom">${esc(m.nom)}</div>
      <div class="small muted">${m.sections.length} sect.</div></div>
      <div class="mini"><div class="g"><div class="lab"><span>Cours lu</span><span>${r}%</span></div><div class="bar"><i style="width:${r}%"></i></div></div></div>
    </a>`;
  });
  return html;
}

function vModule(mid, tab) {
  const m = MOD[mid]; if (!m) return `<div class="card">Module introuvable.</div>`;
  let html = `<div class="qhead"><a onclick="go('#/cours')" style="cursor:pointer">‹ Cours</a><span>Module ${m.num}</span></div>`;
  html += `<h2 class="page">${esc(m.nom)}</h2>`;
  html += `<div class="subtabs">
    <button data-st="essentiel" class="${tab === 'essentiel' ? 'on' : ''}">📌 Essentiel</button>
    <button data-st="complet" class="${tab === 'complet' ? 'on' : ''}">📚 Cours complet</button></div>`;
  if (tab === 'essentiel') html += vEssentiel(m);
  else html += vComplet(m);
  html += `<div class="sp"></div><button class="btn" onclick="go('#/drill/${m.id}')">🎯 S'entraîner sur ce module (${(QBYMOD[m.id] || []).length} QCM)</button>`;
  return html;
}

function vEssentiel(m) {
  const e = m.essentiel || {};
  let html = '';
  if ((e.a_retenir || []).length) {
    html += `<h3 class="sec">À retenir absolument</h3>`;
    e.a_retenir.forEach((t) => {
      html += `<div class="flash recto" data-cue="${esc(cue(t))}" data-full="${esc(t)}" onclick="this.classList.toggle('open');var c=this.querySelector('.ct');c.textContent=this.classList.contains('open')?this.dataset.full:this.dataset.cue;this.querySelector('.side').textContent=this.classList.contains('open')?'à retenir':'à retenir · clique pour tout voir'">
        <span class="side">à retenir · clique pour tout voir</span><div class="ct">${esc(cue(t))}</div></div>`;
    });
  }
  if ((e.chiffres || []).length) {
    html += `<div class="bloc chiffres"><div class="h">🔢 Chiffres-clés</div><ul>${e.chiffres.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
  }
  if ((e.pieges || []).length) {
    html += `<div class="bloc pieges"><div class="h">⚠️ Pièges fréquents</div><ul>${e.pieges.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
  }
  if (!html) html = `<div class="note">Pas d'essentiel pour ce module — voir le cours complet.</div>`;
  return html;
}
function cue(t) { const s = String(t); return s.length > 70 ? s.slice(0, 68).replace(/\s+\S*$/, '') + ' …' : s; }

function vComplet(m) {
  let html = `<div class="lecture">`;
  const pos = S.pos[m.id];
  if (pos && MOD[m.id].sections.some(s => s.id === pos)) {
    html += `<button class="btn ghost sm" style="margin-bottom:10px" onclick="document.getElementById('${pos}').scrollIntoView({behavior:'smooth'})">↩︎ Reprendre où je m'étais arrêté</button>`;
  }
  html += `<div class="toc"><b>Sommaire du module</b>${m.sections.map(s => `<a onclick="document.getElementById('${s.id}').scrollIntoView({behavior:'smooth'})">${esc(s.titre)}</a>`).join('')}</div>`;
  m.sections.forEach(s => {
    html += `<section id="${s.id}" data-sid="${s.id}">`;
    html += `<h3>${esc(s.titre)} ${S.read[s.id] ? '<span class="readmark">✓ lu</span>' : ''}</h3>`;
    (s.points || []).forEach(p => { html += `<p>${esc(p)}</p>`; });
    if ((s.chiffres || []).length) html += `<div class="bloc chiffres"><div class="h">🔢 Chiffres-clés</div><ul>${s.chiffres.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
    if ((s.pieges || []).length) html += `<div class="bloc pieges"><div class="h">⚠️ Pièges</div><ul>${s.pieges.map(c => '<li>' + esc(c) + '</li>').join('')}</ul></div>`;
    html += `</section>`;
  });
  html += `</div>`;
  return html;
}

function bindModule(mid, tab, anchor) {
  document.querySelectorAll('.subtabs button').forEach(b => {
    b.onclick = () => go('#/module/' + mid + '/' + b.dataset.st);
  });
  if (tab === 'complet') {
    // marquer lu + position via IntersectionObserver
    const m = MOD[mid];
    const io = new IntersectionObserver((ents) => {
      ents.forEach(en => {
        if (en.isIntersecting) {
          const sid = en.target.dataset.sid;
          if (sid) { if (!S.read[sid]) { S.read[sid] = 1; } S.pos[mid] = sid; save(); }
        }
      });
    }, { threshold: 0.5 });
    document.querySelectorAll('section[data-sid]').forEach(s => io.observe(s));
    if (anchor) { const el = document.getElementById(anchor); if (el) setTimeout(() => el.scrollIntoView(), 60); }
  }
}

/* ============================================================
   ESPACE ENTRAÎNEMENT (menu)
   ============================================================ */
function vEntrainement() {
  const nbWrong = Object.keys(S.wrong).length;
  const totalQ = Object.values(QBYMOD).reduce((s, a) => s + a.length, 0);
  let html = `<h2 class="page">Entraînement</h2>`;
  html += `<div class="card"><div class="serif" style="font-size:1.05rem">🧪 Examen blanc</div>
    <p class="small muted">120 questions tirées selon la pondération officielle, chronométré 2 h. Correction et verdict A/C à la fin.</p>
    <button class="btn" onclick="go('#/examen')">Démarrer l'examen blanc</button></div>`;
  html += `<div class="card"><div class="serif" style="font-size:1.05rem">🎯 Drill par module</div>
    <p class="small muted">Questions d'un module, correction immédiate avec explication.</p>`;
  C.modules.forEach(m => {
    html += `<button class="btn ghost sm" style="margin:3px 4px 3px 0;width:auto" onclick="go('#/drill/${m.id}')">${m.num}. ${esc(shortNom(m.nom))} (${(QBYMOD[m.id] || []).length})</button>`;
  });
  html += `</div>`;
  html += `<div class="btn-row">
    <button class="btn sec" onclick="go('#/erreurs')">🔁 Réviser mes erreurs${nbWrong ? ' (' + nbWrong + ')' : ''}</button>
    <button class="btn sec" onclick="go('#/flash')">🃏 Flashcards</button></div>`;
  html += `<div class="note" style="margin-top:10px">Banque : <b>${totalQ}</b> questions. L'examen réel pioche dans 2 000+ questions renouvelées : entraîne ta COMPRÉHENSION, pas le par-cœur.</div>`;
  return html;
}
function shortNom(n) { return n.length > 26 ? n.slice(0, 25) + '…' : n; }

/* ============================================================
   MOTEUR DE SESSION QCM
   ============================================================ */
function startSession(mode, mid) {
  let queue = [];
  if (mode === 'drill') {
    queue = shuffle((QBYMOD[mid] || []).map(q => q.id));
    if (!queue.length) { $('#view').innerHTML = `<div class="card">Aucune question pour ce module.</div>`; return; }
    sess = { mode, mid, queue, i: 0, answered: {}, results: [] };
  } else if (mode === 'erreurs') {
    queue = shuffle(Object.keys(S.wrong).filter(id => QBYID[id]));
    if (!queue.length) { $('#view').innerHTML = `<div class="card"><h2 class="page">Révision des erreurs</h2><div class="note">Aucune erreur à revoir. Fais des QCM, les questions ratées arriveront ici.</div><button class="btn" onclick="go('#/entrainement')">Retour</button></div>`; return; }
    sess = { mode, queue, i: 0, answered: {}, results: [] };
  }
  renderSession();
}

function renderSession() {
  if (!sess) { go('#/entrainement'); return; }
  const v = $('#view');
  if (sess.i >= sess.queue.length) { v.innerHTML = vSessionEnd(); return; }
  const q = QBYID[sess.queue[sess.i]];
  const answered = sess.answered[q.id] != null;
  const total = sess.queue.length;
  const titre = sess.mode === 'drill' ? ('Module ' + MOD[sess.mid].num) : (sess.mode === 'erreurs' ? 'Révision des erreurs' : 'Examen blanc');
  let html = `<div class="qhead"><a onclick="quitSession()" style="cursor:pointer">‹ Quitter</a><span>${esc(titre)}</span><span>${sess.i + 1}/${total}</span></div>`;
  html += `<div class="qprog"><i style="width:${pct(sess.i + (answered ? 1 : 0), total)}%"></i></div>`;
  html += renderQuestion(q, sess.answered[q.id], sess.mode !== 'exam');
  v.innerHTML = html;
  bindQuestion(q);
}

function renderQuestion(q, chosen, immediate) {
  const answered = chosen != null;
  let html = `<div class="enonce">${esc(q.enonce)}</div>`;
  q.options.forEach((o, idx) => {
    let cls = 'opt';
    if (answered && immediate) {
      if (idx === q.correct) cls += ' good';
      else if (idx === chosen) cls += ' bad';
    } else if (answered && idx === chosen) cls += ' sel';
    html += `<button class="${cls}" data-idx="${idx}" ${answered ? 'disabled' : ''}>
      <span class="let">${letters(idx)}</span>${esc(o.texte)}</button>`;
  });
  if (answered && immediate) {
    const ok = chosen === q.correct;
    html += `<div class="expl"><div class="v ${ok ? 'ok' : 'ko'}">${ok ? '✅ Bonne réponse' : '✗ Mauvaise réponse'}</div>`;
    html += `<ul>`;
    q.options.forEach((o, idx) => {
      html += `<li class="${idx === q.correct ? 'good' : 'bad'}"><span class="l">${letters(idx)} ${idx === q.correct ? '(juste)' : '(faux)'} :</span> ${esc(o.justif)}</li>`;
    });
    html += `</ul>`;
    if (q.a_verifier) html += `<div class="averif">⚠︎ Réponse à vérifier dans ton cours officiel.</div>`;
    html += `<div class="btn-row" style="margin-top:8px">
      <button class="btn sec sm" onclick="go('#/lire/${q.ancre.split('-')[0]}/${q.ancre}')">📖 Revoir dans le cours</button>
      <button class="btn ghost sm" onclick="toggleMarkUI('${q.id}')">${S.wrong[q.id] ? '★ Marquée' : '☆ Marquer'}</button>
    </div></div>`;
    html += `<button class="btn" onclick="nextQ()">${sess.i + 1 >= sess.queue.length ? 'Terminer' : 'Question suivante ›'}</button>`;
  } else if (answered && !immediate) {
    html += `<button class="btn" onclick="nextQ()">${sess.i + 1 >= sess.queue.length ? 'Terminer l’examen' : 'Suivant ›'}</button>`;
  }
  return html;
}

function bindQuestion(q) {
  document.querySelectorAll('.opt').forEach(btn => {
    btn.onclick = () => {
      if (sess.answered[q.id] != null) return;
      const idx = +btn.dataset.idx;
      sess.answered[q.id] = idx;
      const correct = idx === q.correct;
      sess.results.push({ id: q.id, correct });
      if (sess.mode !== 'exam') recordAnswer(q.id, correct);
      else recordAnswer(q.id, correct); // l'examen compte aussi dans les stats
      // répétition espacée : en mode erreurs, si raté on réinsère plus loin
      if (sess.mode === 'erreurs' && !correct) {
        const insertAt = Math.min(sess.queue.length, sess.i + 3);
        sess.queue.splice(insertAt, 0, q.id);
      }
      renderSession();
    };
  });
}
window.nextQ = function () { sess.i++; renderSession(); };
window.quitSession = function () { if (sess && sess.mode === 'exam' && sess.i < sess.queue.length && !confirm('Quitter l\'examen en cours ?')) return; stopTimer(); sess = null; go('#/entrainement'); };
window.toggleMarkUI = function (qid) { toggleMark(qid); renderSession(); };

function vSessionEnd() {
  const r = sess.results; const ok = r.filter(x => x.correct).length;
  const mode = sess.mode;
  let html = `<h2 class="page">Terminé</h2><div class="card center">
    <div class="serif" style="font-size:2rem">${pct(ok, r.length)}%</div>
    <div class="muted">${ok} / ${r.length} bonnes réponses</div></div>`;
  if (mode === 'drill') {
    html += `<div class="btn-row"><button class="btn" onclick="go('#/drill/${sess.mid}')">↻ Recommencer</button>
      <button class="btn sec" onclick="go('#/module/${sess.mid}/complet')">📖 Revoir le cours</button></div>`;
  } else {
    html += `<button class="btn" onclick="go('#/entrainement')">Retour à l'entraînement</button>`;
  }
  sess = null;
  return html;
}

/* ============================================================
   EXAMEN BLANC
   ============================================================ */
function vExamenIntro() {
  const ready = examReady();
  let html = `<div class="qhead"><a onclick="go('#/entrainement')" style="cursor:pointer">‹ Entraînement</a><span>Examen blanc</span></div>`;
  html += `<h2 class="page">🧪 Examen blanc</h2>`;
  html += `<div class="card"><ul class="small">
    <li><b>120 questions</b> à choix unique, tirées selon la pondération officielle des 12 modules.</li>
    <li><b>Chrono 2 h</b> · pas de points négatifs · aucune correction avant la fin.</li>
    <li>Résultat <b>séparé</b> : catégorie A et catégorie C. Admis seulement si <b>≥ 80 % dans chacune</b>.</li>
  </ul>`;
  if (!ready.ok) html += `<div class="bloc pieges"><div class="h">⚠️ Banque incomplète</div><div class="small">${esc(ready.msg)}</div></div>`;
  html += `<button class="btn" onclick="startExam()">Démarrer (2 h)</button></div>`;
  return html;
}
function examReady() {
  let miss = [];
  C.modules.forEach(m => {
    const bank = QBYMOD[m.id] || [];
    const nA = bank.filter(q => q.cat === 'A').length, nC = bank.filter(q => q.cat === 'C').length;
    if (nA < m.catA) miss.push(`M${m.num}: ${nA}/${m.catA} A`);
    if (nC < m.catC) miss.push(`M${m.num}: ${nC}/${m.catC} C`);
  });
  return { ok: miss.length === 0, msg: 'Manque : ' + miss.join(', ') + '. L\'examen sera ajusté.' };
}
function examDraw() {
  const picked = [];
  C.modules.forEach(m => {
    const bank = QBYMOD[m.id] || [];
    const A = shuffle(bank.filter(q => q.cat === 'A'));
    const Cc = shuffle(bank.filter(q => q.cat === 'C'));
    take(A, m.catA, picked, bank);
    take(Cc, m.catC, picked, bank);
  });
  return shuffle(picked).map(q => q.id);
}
function take(arr, n, out, fallback) {
  for (let i = 0; i < n; i++) {
    if (arr.length) out.push(arr.shift());
    else { const f = (fallback || []).filter(q => out.indexOf(q) < 0); if (f.length) out.push(shuffle(f)[0]); }
  }
}
window.startExam = function () {
  const queue = examDraw();
  sess = { mode: 'exam', queue, i: 0, answered: {}, results: [], startTs: Date.now(), durationMs: 120 * 60000 };
  startTimer();
  go('#/examen-run');
  if (location.hash !== '#/examen-run') renderSession();
};
let timerId = null;
function startTimer() { stopTimer(); timerId = setInterval(tick, 1000); }
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function tick() {
  if (!sess || sess.mode !== 'exam') { stopTimer(); return; }
  const left = sess.durationMs - (Date.now() - sess.startTs);
  const el = document.getElementById('chrono');
  if (left <= 0) { stopTimer(); finishExam(); return; }
  if (el) {
    const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
    el.textContent = mm + ':' + String(ss).padStart(2, '0');
    el.classList.toggle('warn', left < 5 * 60000);
  }
}
// surcharge renderSession header pour l'examen (chrono + terminer)
const _renderSession = renderSession;
renderSession = function () {
  if (sess && sess.mode === 'exam') {
    const v = $('#view');
    if (sess.i >= sess.queue.length) { finishExam(); return; }
    const q = QBYID[sess.queue[sess.i]];
    const answered = sess.answered[q.id] != null;
    let html = `<div class="qhead"><a onclick="quitSession()" style="cursor:pointer">‹ Quitter</a><span class="chrono" id="chrono">…</span><span>${sess.i + 1}/120</span></div>`;
    html += `<div class="qprog"><i style="width:${pct(sess.i, 120)}%"></i></div>`;
    html += renderQuestion(q, sess.answered[q.id], false);
    html += `<div class="sp"></div><button class="btn ghost sm" onclick="finishExam()">Terminer l'examen maintenant</button>`;
    v.innerHTML = html; bindQuestion(q); tick();
  } else { _renderSession(); }
};
function finishExam() {
  stopTimer();
  if (!sess) return;
  // calcul scores A/C
  let aT = 0, aOk = 0, cT = 0, cOk = 0; const perMod = {};
  sess.queue.forEach(qid => {
    const q = QBYID[qid]; const ch = sess.answered[qid]; const ok = ch === q.correct;
    if (q.cat === 'A') { aT++; if (ok) aOk++; } else { cT++; if (ok) cOk++; }
    const pm = perMod[q.module] || { t: 0, ok: 0, num: q.modnum, nom: MOD[q.module].nom }; pm.t++; if (ok) pm.ok++; perMod[q.module] = pm;
  });
  lastExam = {
    aT, aOk, cT, cOk, pctA: pct(aOk, aT), pctC: pct(cOk, cT),
    admis: pct(aOk, aT) >= 80 && pct(cOk, cT) >= 80,
    perMod, total: sess.queue.length, ok: aOk + cOk
  };
  sess = null;
  go('#/resultat');
}
let lastExam = null;
function vResultat() {
  if (!lastExam) return `<div class="card">Aucun résultat. <button class="btn" onclick="go('#/examen')">Faire un examen</button></div>`;
  const r = lastExam;
  let html = `<h2 class="page">Résultat de l'examen</h2>`;
  html += `<div class="card center"><div class="serif" style="font-size:1.9rem">${pct(r.ok, r.total)}%</div><div class="muted">${r.ok}/${r.total} au total</div></div>`;
  html += `<div class="card"><div class="dual">
    <div>${gauge('Catégorie A', r.pctA, 1, true)}<div class="small muted center">${r.aOk}/${r.aT} · seuil 80 %</div></div>
    <div>${gauge('Catégorie C', r.pctC, 1, true)}<div class="small muted center">${r.cOk}/${r.cT} · seuil 80 %</div></div>
  </div><div class="verdict ${r.admis ? 'ok' : 'ko'}">${r.admis ? '✅ ADMIS — ≥ 80 % en A et en C' : '✗ RECALÉ — il faut ≥ 80 % dans CHAQUE catégorie'}</div></div>`;
  // top 3 modules faibles
  const arr = Object.keys(r.perMod).map(mid => ({ mid, ...r.perMod[mid], taux: pct(r.perMod[mid].ok, r.perMod[mid].t) })).sort((a, b) => a.taux - b.taux).slice(0, 3);
  html += `<h3 class="sec">À retravailler en priorité</h3>`;
  arr.forEach(m => {
    html += `<div class="card"><div class="row" style="display:flex;justify-content:space-between;align-items:center">
      <div><b>M${m.num}. ${esc(shortNom(m.nom))}</b><div class="small muted">${m.ok}/${m.t} · ${m.taux}%</div></div></div>
      <div class="btn-row" style="margin-top:8px"><button class="btn sec sm" onclick="go('#/module/${m.mid}/complet')">📖 Cours</button>
      <button class="btn sm" onclick="go('#/drill/${m.mid}')">🎯 Drill</button></div></div>`;
  });
  html += `<button class="btn" onclick="go('#/examen')">↻ Nouvel examen blanc</button>`;
  return html;
}

/* ============================================================
   FLASHCARDS
   ============================================================ */
let fsess = null;
function startFlash() {
  if (!FLASH.length) { $('#view').innerHTML = `<div class="card">Pas de flashcards.</div>`; return; }
  fsess = { queue: shuffle(FLASH.map((_, i) => i)), i: 0, known: 0 };
  renderFlash();
}
function renderFlash() {
  const v = $('#view');
  if (fsess.i >= fsess.queue.length) {
    v.innerHTML = `<h2 class="page">Flashcards terminées</h2><div class="card center"><div class="serif" style="font-size:1.6rem">${fsess.known}/${fsess.queue.length}</div><div class="muted">cartes sues</div></div><button class="btn" onclick="go('#/flash')">↻ Recommencer</button> <div class="sp"></div><button class="btn sec" onclick="go('#/entrainement')">Retour</button>`;
    return;
  }
  const f = FLASH[fsess.queue[fsess.i]];
  let html = `<div class="qhead"><a onclick="go('#/entrainement')" style="cursor:pointer">‹ Quitter</a><span>Flashcards</span><span>${fsess.i + 1}/${fsess.queue.length}</span></div>`;
  html += `<div class="flash recto" id="fcard"><span class="side">Module ${f.modnum} · clique pour révéler</span><div class="ct serif">${esc(cue(f.text))}</div></div>`;
  html += `<div class="btn-row" style="margin-top:12px"><button class="btn sec" onclick="flashRate(false)">Je ne savais pas</button><button class="btn" onclick="flashRate(true)">Je savais ✓</button></div>`;
  v.innerHTML = html;
  $('#fcard').onclick = function () { this.classList.add('verso'); this.querySelector('.ct').textContent = f.text; this.querySelector('.side').textContent = 'Module ' + f.modnum; };
}
window.flashRate = function (known) {
  const f = FLASH[fsess.queue[fsess.i]];
  if (known) { fsess.known++; S.flashKnown[f.id] = 1; } else { delete S.flashKnown[f.id]; }
  save(); fsess.i++; renderFlash();
};

/* ============================================================
   RECHERCHE PLEIN TEXTE
   ============================================================ */
function vRecherche() {
  return `<h2 class="page">Recherche</h2><div class="search card"><input id="q" placeholder="Chercher dans le cours et les questions…" autocomplete="off"></div><div id="results"></div>`;
}
function bindRecherche() {
  const inp = $('#q'); inp.focus();
  inp.oninput = () => doSearch(inp.value.trim());
}
function doSearch(term) {
  const box = $('#results'); if (term.length < 2) { box.innerHTML = ''; return; }
  const t = term.toLowerCase(); const hits = []; const rx = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  C.modules.forEach(m => {
    m.sections.forEach(s => {
      const hay = [s.titre].concat(s.points || [], s.chiffres || [], s.pieges || []).join(' · ');
      if (hay.toLowerCase().includes(t)) {
        const i = hay.toLowerCase().indexOf(t); const ctx = hay.slice(Math.max(0, i - 40), i + 80);
        hits.push({ type: 'cours', link: `#/lire/${m.id}/${s.id}`, titre: `M${m.num} · ${s.titre}`, ctx });
      }
    });
    (QBYMOD[m.id] || []).forEach(q => {
      if (q.enonce.toLowerCase().includes(t)) hits.push({ type: 'qcm', link: `#/drill/${m.id}`, titre: `M${m.num} · Question`, ctx: q.enonce });
    });
  });
  if (!hits.length) { box.innerHTML = `<div class="note">Aucun résultat pour « ${esc(term)} ».</div>`; return; }
  box.innerHTML = hits.slice(0, 40).map(h =>
    `<div class="hit"><a onclick="go('${h.link}')">${h.type === 'cours' ? '📖' : '🎯'} ${esc(h.titre)}</a><div class="ctx">${esc(h.ctx).replace(rx, '<mark>$1</mark>')}</div></div>`
  ).join('');
}

/* ---------- go ---------- */
boot();
