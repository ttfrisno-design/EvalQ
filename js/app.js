import {
  state,
  save,
  uid,
  isNum,
  mean,
  todayISO,
  replaceState,
  resetState,
  classById,
  studentById,
  evalById,
  compById,
  studentsOf,
  fullName,
  sortedCompetences,
  compScore,
  evalScore,
  evalsFor,
  compAverage,
  critAverage,
  globalAverage,
  classCompAverage,
  evalCompletion,
  periodOf,
  ranges,
  rangeById,
  currentRangeId,
  previousRange,
  levelOf,
  LEVELS,
  fmt,
  requestPersistence,
  techCompetences,
  behaviorComp,
  behaviorAverage,
  evalTechScore,
  isSetUp,
  setupCode,
  unlock,
  checkCode,
  changeCode,
  wipeDevice,
  flush,
  onSave,
} from './store.js';
import { openPin, createPin } from './lock.js';
import * as sync from './sync.js';
import { esc, $, $$, dateFR, toast, pickFile, shareOrDownload, ICONS, typeBadge } from './util.js';
import * as charts from './charts.js';
import { parseStudentFile, applyImport } from './import.js';

const view = $('#view');

// État d'interface (non persistant, sauf quelques préférences)
const ui = {
  evalFilter: 'all',
  rangeId: null,
  chartScope: 'YEAR',
  chartComp: 'ALL',
  classChartComp: 'ALL',
  bilanType: 'all',
  saisieMode: localStorage.getItem('evalq.mode') || 'eleve',
  saisieIdx: {},
  settingsClass: null,
};

const lv = (v) => `lv-${levelOf(v)?.key || 'none'}`;
const pill = (v, extra = '') => `<span class="pill ${lv(v)} ${extra}">${fmt(v)}</span>`;
const byType = (list, t) => (t === 'all' ? list : list.filter((e) => e.type === t));

// ======================================================================
// Routeur
// ======================================================================

const routes = [
  [/^#?\/?$/, () => viewEvals()],
  [/^#\/evals$/, () => viewEvals()],
  [/^#\/eval\/new$/, () => viewEvalForm(null)],
  [/^#\/eval\/([\w-]+)\/edit$/, (m) => viewEvalForm(evalById(m[1]))],
  [/^#\/eval\/([\w-]+)$/, (m) => viewSaisie(evalById(m[1]))],
  [/^#\/eleves$/, () => viewStudents()],
  [/^#\/eleve\/([\w-]+)$/, (m) => viewStudent(studentById(m[1]))],
  [/^#\/bilans$/, () => viewBilans()],
  [/^#\/reglages$/, () => viewSettings()],
];

function render() {
  charts.destroyAll();
  view.onclick = view.onchange = view.oninput = null;
  const hash = location.hash.split('?')[0];
  const tab = hash.startsWith('#/eleve') ? 'eleves' : hash.startsWith('#/bilans') ? 'bilans' : hash.startsWith('#/reglages') ? 'reglages' : 'evals';
  $$('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  renderClassSwitch();
  for (const [re, fn] of routes) {
    const m = hash.match(re);
    if (m) {
      fn(m);
      renderSyncBadge();
      return;
    }
  }
  location.hash = '#/evals';
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function renderClassSwitch() {
  const el = $('#classSwitch');
  el.innerHTML = state.classes
    .map(
      (c) =>
        `<button class="${c.id === state.currentClass ? 'on' : ''}" data-class="${esc(c.id)}">${esc(c.name)}</button>`,
    )
    .join('');
  el.onclick = (e) => {
    const b = e.target.closest('[data-class]');
    if (!b) return;
    state.currentClass = b.dataset.class;
    save();
    // Sur une page liée à une autre classe, revenir à la liste.
    if (/^#\/(eval\/|eleve\/)/.test(location.hash)) go('#/evals');
    else render();
  };
}

function rangeSelect(id, value, { withYear = true } = {}) {
  const opt = (p) => `<option value="${esc(p.id)}" ${p.id === value ? 'selected' : ''}>${esc(p.name)}</option>`;
  return `<select id="${id}" class="select">
    <optgroup label="Périodes">${state.periods.map(opt).join('')}</optgroup>
    <optgroup label="Semestres">${state.semesters.map(opt).join('')}</optgroup>
    ${withYear ? `<option value="YEAR" ${value === 'YEAR' ? 'selected' : ''}>Année complète</option>` : ''}
  </select>`;
}

function getRangeId() {
  if (!ui.rangeId || !rangeById(ui.rangeId)) ui.rangeId = currentRangeId();
  return ui.rangeId;
}

function emptyStudents() {
  return `<div class="card empty">
    <h2>Aucun élève dans la classe ${esc(classById(state.currentClass)?.name)}</h2>
    <p>Importez votre fichier Excel (un onglet par classe : NOM, Prénom), ou ajoutez les élèves à la main.</p>
    <div class="row gap">
      <button class="btn primary" data-act="import">Importer un fichier Excel</button>
      <a class="btn" href="#/reglages">Ajouter à la main</a>
    </div></div>`;
}

async function importStudents(fallbackClassId) {
  const file = await pickFile('.xlsx,.xls,.ods,.csv');
  if (!file) return;
  try {
    const groups = await parseStudentFile(file, fallbackClassId || state.currentClass);
    if (!groups.length) return alert('Aucun élève trouvé dans ce fichier.');
    const summary = groups.map((g) => `• ${g.classId} : ${g.students.length} élève(s)`).join('\n');
    if (!confirm(`Importer ?\n${summary}\n\n(Seuls les NOM et Prénom sont conservés.)`)) return;
    const { added, skipped } = applyImport(groups);
    toast(`${added} élève(s) ajouté(s)${skipped ? `, ${skipped} déjà présent(s)` : ''}`);
    render();
  } catch (e) {
    console.error(e);
    alert('Lecture du fichier impossible : ' + e.message);
  }
}

// ======================================================================
// Évaluations : liste
// ======================================================================

function viewEvals() {
  const cid = state.currentClass;
  const students = studentsOf(cid);
  const all = byType(evalsFor({ classId: cid }), ui.evalFilter).reverse();
  const groups = new Map();
  for (const e of all) {
    const p = periodOf(e.date);
    const k = p ? p.name : 'Hors période';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  }
  const chips = [
    ['all', 'Toutes'],
    ['ecole', 'École'],
    ['entreprise', 'Entreprise'],
  ]
    .map(([k, l]) => `<button class="chip ${ui.evalFilter === k ? 'on' : ''} ${k}" data-filter="${k}">${k !== 'all' ? ICONS[k] : ''}${l}</button>`)
    .join('');

  view.innerHTML = `
    <div class="page-head">
      <h1>Évaluations</h1>
      <a class="btn primary" href="#/eval/new">${ICONS.plus}Nouvelle évaluation</a>
    </div>
    ${students.length ? '' : emptyStudents()}
    <div class="chips">${chips}</div>
    ${
      all.length
        ? [...groups]
            .map(
              ([name, list]) => `<h3 class="group-title">${esc(name)}</h3>
          <div class="list">${list.map(evalCard).join('')}</div>`,
            )
            .join('')
        : `<div class="card empty"><p>Aucune évaluation${ui.evalFilter !== 'all' ? ' de ce type' : ''} pour cette classe.</p>
            <a class="btn primary" href="#/eval/new">${ICONS.plus}Créer une évaluation</a></div>`
    }`;

  view.onclick = (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) {
      ui.evalFilter = f.dataset.filter;
      render();
    }
    if (e.target.closest('[data-act="import"]')) importStudents();
  };
}

function evalCard(e) {
  const comps = Object.keys(e.selection).filter((c) => e.selection[c].length);
  const nCrit = comps.reduce((n, c) => n + e.selection[c].length, 0);
  const pct = Math.round(evalCompletion(e) * 100);
  const avg = mean(e.students.map((s) => evalScore(e, s)));
  return `<a class="card eval-card type-${e.type}" href="#/eval/${e.id}">
    <div class="eval-main">
      <div class="eval-title">${esc(e.title)}</div>
      <div class="muted small">${dateFR(e.date, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        · ${e.students.length} élève(s) · ${nCrit} critère(s)</div>
      <div class="row gap-s wrap">${typeBadge(e.type, e.place)}${comps
        .sort((a, b) => (parseInt(a.slice(1)) || 999) - (parseInt(b.slice(1)) || 999))
        .map((c) =>
          compById(c)?.behavior
            ? `<span class="tag behavior">${ICONS.behavior}Comportement</span>`
            : `<span class="tag">${esc(c)}</span>`,
        )
        .join('')}</div>
      <div class="progress"><span style="width:${pct}%"></span></div>
    </div>
    <div class="eval-side">${pill(avg, 'big')}<div class="muted small">${pct}% saisi</div></div>
  </a>`;
}

// ======================================================================
// Évaluations : création / modification
// ======================================================================

function viewEvalForm(ev) {
  const editing = !!ev;
  const d = editing
    ? structuredClone(ev)
    : {
        id: uid(),
        title: '',
        date: todayISO(),
        classId: state.currentClass,
        type: 'ecole',
        place: '',
        selection: {},
        students: studentsOf(state.currentClass).map((s) => s.id),
        notes: {},
        absent: {},
        comments: {},
        companies: {},
      };
  const students = studentsOf(d.classId);
  const epreuves = state.epreuves;
  const comps = sortedCompetences();
  const other = comps.filter((c) => !epreuves.some((e) => e.id === c.epreuve));

  const compBlock = (c) => {
    const sel = d.selection[c.id] || [];
    const all = c.criteres.length && sel.length === c.criteres.length;
    return `<div class="comp-pick" data-comp="${esc(c.id)}">
      <div class="comp-pick-head">
        <label class="check"><input type="checkbox" data-compcheck="${esc(c.id)}" ${all ? 'checked' : ''}>
          <span><b>${esc(c.id)}</b> ${esc(c.label)}</span></label>
        <button type="button" class="btn small ghost" data-toggle="${esc(c.id)}">
          <span data-count="${esc(c.id)}">${sel.length}/${c.criteres.length}</span> critères ▾</button>
      </div>
      <div class="crit-list ${sel.length && !all ? 'open' : ''}" id="crits-${esc(c.id)}">
        ${c.criteres
          .map(
            (k) => `<label class="check"><input type="checkbox" data-crit="${esc(k.id)}" data-of="${esc(c.id)}" ${
              sel.includes(k.id) ? 'checked' : ''
            }><span>${esc(k.label)}</span></label>`,
          )
          .join('')}
      </div></div>`;
  };

  view.innerHTML = `
    <div class="page-head">
      <a class="btn ghost icon" href="${editing ? '#/eval/' + d.id : '#/evals'}" aria-label="Retour">${ICONS.back}</a>
      <h1>${editing ? 'Modifier l’évaluation' : 'Nouvelle évaluation'}</h1>
    </div>
    <form id="evalForm" class="stack">
      <section class="card stack">
        <h2>1. Informations</h2>
        <label class="field"><span>Intitulé</span>
          <input name="title" required placeholder="ex. TP câblage démarrage étoile-triangle" value="${esc(d.title)}"></label>
        <div class="grid2">
          <label class="field"><span>Date</span><input type="date" name="date" required value="${esc(d.date)}"></label>
          <div class="field"><span>Lieu de l’évaluation</span>
            <div class="segmented" id="typeSeg">
              <button type="button" data-type="ecole" class="ecole ${d.type === 'ecole' ? 'on' : ''}">${ICONS.ecole}École</button>
              <button type="button" data-type="entreprise" class="entreprise ${d.type === 'entreprise' ? 'on' : ''}">${ICONS.entreprise}Entreprise</button>
            </div></div>
        </div>
        <label class="field ${d.type === 'entreprise' ? '' : 'hidden'}" id="placeField"><span>PFMP / entreprise (facultatif – l’entreprise de chaque élève se saisit ensuite)</span>
          <input name="place" placeholder="ex. PFMP 1" value="${esc(d.place)}"></label>
        <p class="muted small" id="periodInfo"></p>
      </section>

      <section class="card stack">
        <div class="row between wrap gap-s"><h2>2. Compétences et critères</h2>
          <span class="muted small" id="critTotal"></span></div>
        <p class="muted small">Cochez une compétence pour évaluer tous ses critères, ou ouvrez-la pour choisir les critères.</p>
        ${epreuves
          .map((ep) => {
            const list = comps.filter((c) => c.epreuve === ep.id);
            if (!list.length) return '';
            const beh = list.some((c) => c.behavior);
            return `<div class="epreuve ${beh ? 'behavior' : ''}"><h3>${beh ? ICONS.behavior + ' ' : ''}${esc(ep.label)}</h3>${list.map(compBlock).join('')}</div>`;
          })
          .join('')}
        ${other.length ? `<div class="epreuve"><h3>Autres compétences</h3>${other.map(compBlock).join('')}</div>` : ''}
      </section>

      <section class="card stack">
        <div class="row between wrap gap-s"><h2>3. Élèves évalués</h2>
          <div class="row gap-s"><button type="button" class="btn small" data-all="1">Tous</button>
          <button type="button" class="btn small" data-all="0">Aucun</button></div></div>
        ${
          students.length
            ? `<div class="student-picks">${students
                .map(
                  (s) => `<label class="check pick"><input type="checkbox" data-student="${s.id}" ${
                    d.students.includes(s.id) ? 'checked' : ''
                  }><span>${esc(s.nom)} ${esc(s.prenom)}</span></label>`,
                )
                .join('')}</div>`
            : emptyStudents()
        }
      </section>

      <div class="actions sticky-actions">
        ${editing ? `<button type="button" class="btn danger" data-act="delete">${ICONS.trash}Supprimer</button>` : ''}
        <span class="spacer"></span>
        <a class="btn" href="${editing ? '#/eval/' + d.id : '#/evals'}">Annuler</a>
        <button class="btn primary" type="submit">${editing ? 'Enregistrer' : 'Créer et saisir les notes'}</button>
      </div>
    </form>`;

  const form = $('#evalForm');
  const updateCounts = () => {
    let total = 0;
    for (const c of comps) {
      const sel = $$(`[data-of="${CSS.escape(c.id)}"]:checked`).map((i) => i.dataset.crit);
      total += sel.length;
      const cc = $(`[data-compcheck="${CSS.escape(c.id)}"]`);
      cc.checked = sel.length === c.criteres.length && sel.length > 0;
      cc.indeterminate = sel.length > 0 && sel.length < c.criteres.length;
      $(`[data-count="${CSS.escape(c.id)}"]`).textContent = `${sel.length}/${c.criteres.length}`;
    }
    const nS = $$('[data-student]:checked').length;
    $('#critTotal').textContent = `${total} critère(s) · ${nS} élève(s)`;
    const p = periodOf(form.date.value);
    $('#periodInfo').textContent = p ? `Comptera dans : ${p.name}` : 'Attention : date hors des périodes définies.';
  };
  updateCounts();

  view.onclick = (e) => {
    const t = e.target.closest('[data-type]');
    if (t) {
      d.type = t.dataset.type;
      $$('#typeSeg button').forEach((b) => b.classList.toggle('on', b === t));
      $('#placeField').classList.toggle('hidden', d.type !== 'entreprise');
    }
    const tg = e.target.closest('[data-toggle]');
    if (tg) $(`#crits-${CSS.escape(tg.dataset.toggle)}`).classList.toggle('open');
    const all = e.target.closest('[data-all]');
    if (all) {
      $$('[data-student]').forEach((i) => (i.checked = all.dataset.all === '1'));
      updateCounts();
    }
    if (e.target.closest('[data-act="delete"]')) deleteEval(d.id);
    if (e.target.closest('[data-act="import"]')) importStudents();
  };
  view.onchange = (e) => {
    const cc = e.target.closest('[data-compcheck]');
    if (cc) $$(`[data-of="${CSS.escape(cc.dataset.compcheck)}"]`).forEach((i) => (i.checked = cc.checked));
    updateCounts();
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    d.title = form.title.value.trim();
    d.date = form.date.value;
    d.place = d.type === 'entreprise' ? form.place.value.trim() : '';
    d.selection = {};
    for (const i of $$('[data-crit]:checked')) (d.selection[i.dataset.of] ||= []).push(i.dataset.crit);
    d.students = $$('[data-student]:checked').map((i) => i.dataset.student);
    if (!Object.keys(d.selection).length) return alert('Choisissez au moins un critère d’évaluation.');
    if (!d.students.length) return alert('Choisissez au moins un élève.');
    for (const sid of Object.keys(d.notes)) if (!d.students.includes(sid)) delete d.notes[sid];
    const i = state.evaluations.findIndex((x) => x.id === d.id);
    if (i >= 0) state.evaluations[i] = d;
    else state.evaluations.push(d);
    save();
    toast(editing ? 'Évaluation modifiée' : 'Évaluation créée');
    go('#/eval/' + d.id);
  };
}

function deleteEval(id) {
  const ev = evalById(id);
  if (!ev || !confirm(`Supprimer l’évaluation « ${ev.title} » et toutes ses notes ?`)) return;
  state.evaluations = state.evaluations.filter((e) => e.id !== id);
  save();
  toast('Évaluation supprimée');
  go('#/evals');
}

// ======================================================================
// Saisie des notes
// ======================================================================

function viewSaisie(ev) {
  if (!ev) return go('#/evals');
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const students = ev.students.map(studentById).filter(Boolean).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  if (params.get('s')) {
    const i = students.findIndex((s) => s.id === params.get('s'));
    if (i >= 0) ui.saisieIdx[ev.id] = i;
  }
  const comps = sortedCompetences().filter((c) => ev.selection[c.id]?.length);
  const mode = ui.saisieMode;

  view.innerHTML = `
    <div class="page-head">
      <a class="btn ghost icon" href="#/evals" aria-label="Retour">${ICONS.back}</a>
      <div class="grow">
        <h1 class="h-eval">${esc(ev.title)}</h1>
        <div class="row gap-s wrap muted small">${typeBadge(ev.type, ev.place)} ${dateFR(ev.date)} · ${esc(classById(ev.classId)?.name)}</div>
      </div>
      <a class="btn ghost icon" href="#/eval/${ev.id}/edit" aria-label="Modifier">${ICONS.edit}</a>
    </div>
    <div class="segmented mode-seg">
      <button data-mode="eleve" class="${mode === 'eleve' ? 'on' : ''}">${ICONS.user}Par élève</button>
      <button data-mode="grid" class="${mode === 'grid' ? 'on' : ''}">${ICONS.grid}Tableau</button>
    </div>
    <div id="saisie"></div>`;

  const root = $('#saisie');
  if (mode === 'grid') saisieGrid(root, ev, students, comps);
  else saisieEleve(root, ev, students, comps);

  $$('.mode-seg [data-mode]').forEach(
    (b) =>
      (b.onclick = () => {
        ui.saisieMode = b.dataset.mode;
        localStorage.setItem('evalq.mode', ui.saisieMode);
        render();
      }),
  );
}

function studentState(ev, sid) {
  if (ev.absent?.[sid]) return 'absent';
  const n = ev.notes[sid] || {};
  const ids = Object.values(ev.selection).flat();
  const done = ids.filter((i) => isNum(n[i])).length;
  return done === 0 ? 'todo' : done === ids.length ? 'done' : 'partial';
}

function saisieEleve(root, ev, students, comps) {
  if (!students.length) {
    root.innerHTML = '<div class="card empty">Aucun élève dans cette évaluation.</div>';
    return;
  }
  let idx = Math.min(ui.saisieIdx[ev.id] || 0, students.length - 1);
  const draw = () => {
    ui.saisieIdx[ev.id] = idx;
    const s = students[idx];
    const notes = ev.notes[s.id] || {};
    const absent = !!ev.absent?.[s.id];
    root.innerHTML = `
      <div class="student-strip" id="strip">${students
        .map(
          (x, i) => `<button class="stu ${i === idx ? 'on' : ''} st-${studentState(ev, x.id)}" data-idx="${i}">
            <span class="dot"></span>${esc(x.prenom)} ${esc(x.nom.charAt(0))}.</button>`,
        )
        .join('')}</div>
      <div class="card stack student-card ${absent ? 'is-absent' : ''}">
        <div class="row between wrap gap-s">
          <div><div class="muted small">${idx + 1} / ${students.length}</div>
            <h2 class="stu-name">${esc(s.nom)} ${esc(s.prenom)}</h2></div>
          <div class="row gap-s">
            <label class="check toggle"><input type="checkbox" data-absent ${absent ? 'checked' : ''}><span>Absent</span></label>
            <div class="stack-center"><span class="muted small">Moyenne</span><span id="evAvg">${pill(evalScore(ev, s.id), 'big')}</span></div>
          </div>
        </div>
        ${
          ev.type === 'entreprise'
            ? `<label class="field entreprise-field"><span>${ICONS.entreprise} Entreprise / tuteur</span>
            <input data-company value="${esc(ev.companies?.[s.id] || lastCompany(s.id, ev.id) || '')}" placeholder="Nom de l’entreprise, tuteur…"></label>`
            : ''
        }
        <div class="comp-blocks">
        ${comps
          .map((c) => {
            const crits = c.criteres.filter((k) => ev.selection[c.id].includes(k.id));
            return `<div class="comp-block ${c.behavior ? 'behavior' : ''}">
              <div class="comp-block-head"><div>${c.behavior ? ICONS.behavior + ' ' : `<b>${esc(c.id)}</b> `}${esc(c.label)}</div>
                <span data-compavg="${esc(c.id)}">${pill(compScore(ev, s.id, c.id))}</span></div>
              ${crits
                .map((k) => {
                  const v = notes[k.id];
                  return `<div class="crit-row">
                  <div class="crit-label">${esc(k.label)} <span class="crit-val" data-val="${esc(k.id)}">${isNum(v) ? fmt(v, v % 1 ? 1 : 0) + '/10' : ''}</span></div>
                  <div class="notes" data-crit="${esc(k.id)}" data-comp="${esc(c.id)}">${Array.from({ length: 11 }, (_, n) =>
                    `<button type="button" data-n="${n}" class="n${n} ${v === n ? 'on' : ''}">${n}</button>`,
                  ).join('')}</div></div>`;
                })
                .join('')}
            </div>`;
          })
          .join('')}
        </div>
        <label class="field"><span>Commentaire</span>
          <textarea data-comment rows="2" placeholder="Observation, conseil…">${esc(ev.comments?.[s.id] || '')}</textarea></label>
      </div>
      <div class="actions sticky-actions">
        <button class="btn" data-nav="-1" ${idx === 0 ? 'disabled' : ''}>${ICONS.back}Précédent</button>
        <span class="spacer"></span>
        <button class="btn primary" data-nav="1" ${idx === students.length - 1 ? 'disabled' : ''}>Suivant${ICONS.next}</button>
      </div>`;
    $('#strip .stu.on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
    wire(s);
  };

  const refresh = (s, compId) => {
    if (compId) $(`[data-compavg="${CSS.escape(compId)}"]`).innerHTML = pill(compScore(ev, s.id, compId));
    $('#evAvg').innerHTML = pill(evalScore(ev, s.id), 'big');
    const chip = $(`#strip [data-idx="${idx}"]`);
    chip.className = `stu on st-${studentState(ev, s.id)}`;
  };

  const wire = (s) => {
    root.onclick = (e) => {
      const nb = e.target.closest('.notes [data-n]');
      if (nb) {
        const box = nb.parentElement;
        const crit = box.dataset.crit;
        const n = +nb.dataset.n;
        ev.notes[s.id] ||= {};
        if (ev.notes[s.id][crit] === n) delete ev.notes[s.id][crit];
        else ev.notes[s.id][crit] = n;
        save();
        const v = ev.notes[s.id][crit];
        $$('button', box).forEach((b) => b.classList.toggle('on', +b.dataset.n === v));
        $(`[data-val="${CSS.escape(crit)}"]`).textContent = isNum(v) ? `${v}/10` : '';
        refresh(s, box.dataset.comp);
        return;
      }
      const st = e.target.closest('[data-idx]');
      if (st) {
        idx = +st.dataset.idx;
        draw();
        window.scrollTo({ top: 0 });
        return;
      }
      const nav = e.target.closest('[data-nav]');
      if (nav) {
        idx = Math.max(0, Math.min(students.length - 1, idx + +nav.dataset.nav));
        draw();
        window.scrollTo({ top: 0 });
      }
    };
    root.onchange = (e) => {
      if (e.target.matches('[data-absent]')) {
        ev.absent ||= {};
        if (e.target.checked) ev.absent[s.id] = true;
        else delete ev.absent[s.id];
        save();
        $('.student-card').classList.toggle('is-absent', e.target.checked);
        comps.forEach((c) => refresh(s, c.id));
      }
      if (e.target.matches('[data-company]')) {
        ev.companies ||= {};
        ev.companies[s.id] = e.target.value.trim();
        save();
      }
    };
    root.oninput = (e) => {
      if (e.target.matches('[data-comment]')) {
        ev.comments ||= {};
        ev.comments[s.id] = e.target.value;
        save();
      }
    };
  };
  draw();
}

function lastCompany(sid, exceptId) {
  const list = state.evaluations
    .filter((e) => e.id !== exceptId && e.type === 'entreprise' && e.companies?.[sid])
    .sort((a, b) => b.date.localeCompare(a.date));
  return list[0]?.companies[sid] || '';
}

function saisieGrid(root, ev, students, comps) {
  const cols = comps.map((c) => ({ c, crits: c.criteres.filter((k) => ev.selection[c.id].includes(k.id)) }));
  root.innerHTML = `
    <p class="muted small">Saisissez les notes sur 10 (décimales acceptées). La moyenne de chaque compétence se calcule sur les critères notés.</p>
    <div class="table-wrap"><table class="grid-table">
      <thead>
        <tr><th rowspan="2" class="sticky-col">Élève</th><th rowspan="2" title="Absent">Abs.</th>
          ${cols.map(({ c, crits }) => `<th colspan="${crits.length + 1}" class="comp-th ${c.behavior ? 'th-behavior' : ''}" title="${esc(c.label)}">${c.behavior ? 'Comport.' : esc(c.id)}</th>`).join('')}
          <th rowspan="2">Moy.</th></tr>
        <tr>${cols
          .map(
            ({ crits }) =>
              crits.map((k, i) => `<th class="crit-th" title="${esc(k.label)}">${i + 1}</th>`).join('') + '<th class="avg-th">moy</th>',
          )
          .join('')}</tr>
      </thead>
      <tbody>${students
        .map((s) => {
          const n = ev.notes[s.id] || {};
          const abs = !!ev.absent?.[s.id];
          return `<tr data-sid="${s.id}" class="${abs ? 'is-absent' : ''}">
            <th class="sticky-col"><a href="#/eval/${ev.id}?s=${s.id}" data-goeleve>${esc(s.nom)} ${esc(s.prenom)}</a></th>
            <td><input type="checkbox" data-absent ${abs ? 'checked' : ''}></td>
            ${cols
              .map(
                ({ c, crits }) =>
                  crits
                    .map(
                      (k) => `<td><input class="cell" type="number" inputmode="decimal" min="0" max="10" step="0.5"
                    data-crit="${esc(k.id)}" data-comp="${esc(c.id)}" value="${isNum(n[k.id]) ? n[k.id] : ''}" ${abs ? 'disabled' : ''}></td>`,
                    )
                    .join('') + `<td class="avg-cell" data-avg="${esc(c.id)}">${pill(compScore(ev, s.id, c.id))}</td>`,
              )
              .join('')}
            <td class="avg-cell" data-evavg>${pill(evalScore(ev, s.id))}</td>
          </tr>`;
        })
        .join('')}</tbody>
    </table></div>
    <details class="card legend-crit"><summary>Légende des critères</summary>
      ${cols
        .map(
          ({ c, crits }) =>
            `<p><b>${esc(c.id)} ${esc(c.label)}</b><br>${crits.map((k, i) => `${i + 1}. ${esc(k.label)}`).join('<br>')}</p>`,
        )
        .join('')}
    </details>`;

  const refreshRow = (tr, sid) => {
    for (const { c } of cols) $(`[data-avg="${CSS.escape(c.id)}"]`, tr).innerHTML = pill(compScore(ev, sid, c.id));
    $('[data-evavg]', tr).innerHTML = pill(evalScore(ev, sid));
  };

  root.onclick = (e) => {
    if (e.target.closest('[data-goeleve]')) {
      ui.saisieMode = 'eleve';
      localStorage.setItem('evalq.mode', 'eleve');
    }
  };
  root.onchange = (e) => {
    const tr = e.target.closest('tr[data-sid]');
    if (!tr) return;
    const sid = tr.dataset.sid;
    if (e.target.matches('[data-absent]')) {
      ev.absent ||= {};
      if (e.target.checked) ev.absent[sid] = true;
      else delete ev.absent[sid];
      tr.classList.toggle('is-absent', e.target.checked);
      $$('input.cell', tr).forEach((i) => (i.disabled = e.target.checked));
    }
    if (e.target.matches('input.cell')) {
      const raw = e.target.value.replace(',', '.').trim();
      ev.notes[sid] ||= {};
      if (raw === '') delete ev.notes[sid][e.target.dataset.crit];
      else {
        const v = Math.max(0, Math.min(10, parseFloat(raw)));
        if (Number.isNaN(v)) return;
        ev.notes[sid][e.target.dataset.crit] = v;
        e.target.value = v;
      }
    }
    save();
    refreshRow(tr, sid);
  };
  // Entrée => cellule suivante (pratique au clavier / tablette)
  root.onkeydown = (e) => {
    if (e.key !== 'Enter' || !e.target.matches('input.cell')) return;
    e.preventDefault();
    const cells = $$('input.cell:not(:disabled)', root);
    const i = cells.indexOf(e.target);
    e.target.dispatchEvent(new Event('change', { bubbles: true }));
    cells[i + 1]?.focus();
  };
}

// ======================================================================
// Élèves
// ======================================================================

function viewStudents() {
  const cid = state.currentClass;
  const rid = getRangeId();
  const r = rangeById(rid);
  const all = evalsFor({ classId: cid, start: r.start, end: r.end });
  const ec = byType(all, 'ecole');
  const en = byType(all, 'entreprise');
  const students = studentsOf(cid);

  view.innerHTML = `
    <div class="page-head"><h1>Élèves · ${esc(classById(cid)?.name)}</h1></div>
    ${students.length ? '' : emptyStudents()}
    <div class="row gap-s wrap toolbar"><span class="muted">Période :</span>${rangeSelect('rangeSel', rid)}</div>
    <div class="legend-row">${legendHTML()}</div>
    <div class="list">
      ${students
        .map((s) => {
          const n = all.filter((e) => e.students.includes(s.id)).length;
          return `<a class="card student-row" href="#/eleve/${s.id}">
            <div class="grow"><div class="stu-name">${esc(s.nom)} ${esc(s.prenom)}</div>
              <div class="muted small">${n} évaluation(s)</div></div>
            <div class="row gap-s">
              <span class="mini ecole" title="École">${ICONS.ecole}${pill(globalAverage(s.id, ec))}</span>
              <span class="mini entreprise" title="Entreprise">${ICONS.entreprise}${pill(globalAverage(s.id, en))}</span>
              <span class="mini behavior" title="Comportement face au travail">${ICONS.behavior}${pill(behaviorAverage(s.id, all))}</span>
              ${pill(globalAverage(s.id, all), 'big')}
            </div></a>`;
        })
        .join('')}
    </div>`;
  view.onchange = (e) => {
    if (e.target.id === 'rangeSel') {
      ui.rangeId = e.target.value;
      render();
    }
  };
  view.onclick = (e) => {
    if (e.target.closest('[data-act="import"]')) importStudents();
  };
}

function legendHTML() {
  return (
    LEVELS.map((l) => `<span class="legend-item"><span class="pill lv-${l.key}">${l.min === 0 ? '<4' : '≥' + l.min}</span>${l.label}</span>`).join('') +
    `<span class="legend-item ecole">${ICONS.ecole}École</span><span class="legend-item entreprise">${ICONS.entreprise}Entreprise</span>` +
    `<span class="legend-item behavior">${ICONS.behavior}Comportement</span>`
  );
}

function viewStudent(s) {
  if (!s) return go('#/eleves');
  const rid = getRangeId();
  const r = rangeById(rid);
  const prev = previousRange(r);
  const mineAll = evalsFor({ sid: s.id });
  const all = evalsFor({ sid: s.id, start: r.start, end: r.end });
  const ec = byType(all, 'ecole');
  const en = byType(all, 'entreprise');
  const prevAll = prev ? evalsFor({ sid: s.id, start: prev.start, end: prev.end }) : [];
  const comps = techCompetences();
  const beh = behaviorComp();
  const g = globalAverage(s.id, all);
  const delta = (a, b) => {
    if (!isNum(a) || !isNum(b)) return '';
    const d = a - b;
    const cls = d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat';
    return `<span class="delta ${cls}">${d > 0.05 ? '▲' : d < -0.05 ? '▼' : '='} ${fmt(Math.abs(d))}</span>`;
  };

  const scopeOpts = [...state.semesters, { id: 'YEAR', name: 'Année' }]
    .map((p) => `<button class="chip ${ui.chartScope === p.id ? 'on' : ''}" data-scope="${p.id}">${esc(p.name)}</button>`)
    .join('');

  view.innerHTML = `
    <div class="page-head">
      <a class="btn ghost icon" href="#/eleves" aria-label="Retour">${ICONS.back}</a>
      <div class="grow"><h1>${esc(s.nom)} ${esc(s.prenom)}</h1><div class="muted small">${esc(classById(s.classId)?.name)}</div></div>
      <button class="btn" data-act="pdf">${ICONS.pdf}PDF</button>
    </div>
    <div class="row gap-s wrap toolbar"><span class="muted">Période :</span>${rangeSelect('rangeSel', rid)}</div>
    <div class="tiles">
      <div class="tile"><span class="muted small">Moyenne générale</span>${pill(g, 'xl')}${prev ? delta(g, globalAverage(s.id, prevAll)) : ''}</div>
      <div class="tile ecole"><span class="muted small">${ICONS.ecole} École</span>${pill(globalAverage(s.id, ec), 'xl')}<span class="muted small">${ec.length} éval.</span></div>
      <div class="tile entreprise"><span class="muted small">${ICONS.entreprise} Entreprise</span>${pill(globalAverage(s.id, en), 'xl')}<span class="muted small">${en.length} éval.</span></div>
      ${beh ? `<div class="tile behavior"><span class="muted small">${ICONS.behavior} Comportement</span>${pill(behaviorAverage(s.id, all), 'xl')}${prev ? delta(behaviorAverage(s.id, all), behaviorAverage(s.id, prevAll)) : ''}</div>` : ''}
    </div>

    <section class="card">
      <h2>Compétences – ${esc(r.name)}</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Compétence</th><th class="th-ecole">${ICONS.ecole}École</th><th class="th-entreprise">${ICONS.entreprise}Entr.</th><th>Moyenne</th>${prev ? `<th>vs ${esc(prev.name)}</th>` : ''}</tr></thead>
        <tbody>${comps
          .map((c) => {
            const a = compAverage(s.id, c.id, all);
            return `<tr data-chartcomp="${esc(c.id)}" class="clickable"><td><b>${esc(c.id)}</b> <span class="small">${esc(c.label)}</span></td>
              <td class="c">${pill(compAverage(s.id, c.id, ec))}</td>
              <td class="c">${pill(compAverage(s.id, c.id, en))}</td>
              <td class="c">${pill(a, 'big')}</td>
              ${prev ? `<td class="c">${delta(a, compAverage(s.id, c.id, prevAll))}</td>` : ''}</tr>`;
          })
          .join('')}</tbody>
      </table></div>
    </section>

    ${
      beh
        ? `<section class="card">
      <h2 class="th-behavior">${ICONS.behavior} ${esc(beh.label)} – ${esc(r.name)}</h2>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Critère</th><th class="th-ecole">${ICONS.ecole}École</th><th class="th-entreprise">${ICONS.entreprise}Entr.</th><th>Moyenne</th>${prev ? `<th>vs ${esc(prev.name)}</th>` : ''}</tr></thead>
        <tbody>${beh.criteres
          .map((k) => {
            const a = critAverage(s.id, k.id, all);
            return `<tr data-chartcomp="${esc(beh.id)}" class="clickable"><td>${esc(k.label)}</td>
              <td class="c">${pill(critAverage(s.id, k.id, ec))}</td>
              <td class="c">${pill(critAverage(s.id, k.id, en))}</td>
              <td class="c">${pill(a, 'big')}</td>
              ${prev ? `<td class="c">${delta(a, critAverage(s.id, k.id, prevAll))}</td>` : ''}</tr>`;
          })
          .join('')}
          <tr class="total clickable" data-chartcomp="${esc(beh.id)}"><td>Moyenne comportement</td>
            <td class="c">${pill(behaviorAverage(s.id, ec))}</td><td class="c">${pill(behaviorAverage(s.id, en))}</td>
            <td class="c">${pill(behaviorAverage(s.id, all), 'big')}</td>${prev ? `<td class="c">${delta(behaviorAverage(s.id, all), behaviorAverage(s.id, prevAll))}</td>` : ''}</tr>
        </tbody></table></div>
    </section>`
        : ''
    }

    <section class="card stack">
      <div class="row between wrap gap-s"><h2>Évolution</h2><div class="chips">${scopeOpts}</div></div>
      <select id="compSel" class="select">
        <option value="ALL">Moyenne des compétences techniques</option>
        ${beh ? `<option value="${esc(beh.id)}">${esc(beh.label)}</option>` : ''}
        ${comps.map((c) => `<option value="${esc(c.id)}" ${ui.chartComp === c.id ? 'selected' : ''}>${esc(c.id)} – ${esc(c.label)}</option>`).join('')}
      </select>
      <div class="chart-box"><canvas id="evoChart"></canvas></div>
      <p class="muted small">● École (bleu) · ◆ Entreprise (orange, pointillés) · trait vert : moyenne de chaque période.</p>
    </section>

    <section class="card">
      <h2>Profil de compétences – ${esc(r.name)}</h2>
      <div class="chart-box radar"><canvas id="radarChart"></canvas></div>
    </section>

    <section class="card">
      <h2>Évaluations (${mineAll.length})</h2>
      <div class="list">${[...mineAll]
        .reverse()
        .map(
          (e) => `<a class="eval-line type-${e.type}" href="#/eval/${e.id}?s=${s.id}">
            <span class="muted small">${dateFR(e.date)}</span>
            <span class="grow">${esc(e.title)}${e.type === 'entreprise' ? ` <span class="badge badge-entreprise">${ICONS.entreprise}${esc(e.companies?.[s.id] || 'Entreprise')}</span>` : ''}
            ${e.comments?.[s.id] ? `<br><span class="muted small">« ${esc(e.comments[s.id])} »</span>` : ''}</span>
            ${e.absent?.[s.id] ? '<span class="muted small">Absent</span>' : pill(evalScore(e, s.id))}</a>`,
        )
        .join('') || '<p class="muted">Aucune évaluation.</p>'}</div>
    </section>`;

  if (ui.chartComp !== 'ALL' && !compById(ui.chartComp)) ui.chartComp = 'ALL';
  $('#compSel').value = ui.chartComp;
  drawStudentEvolution(s);
  charts.mount(
    $('#radarChart'),
    charts.compBarsConfig(
      comps.map((c) => c.id),
      comps.map((c) => compAverage(s.id, c.id, ec)),
      comps.map((c) => compAverage(s.id, c.id, en)),
      { type: 'radar' },
    ),
  );

  view.onchange = (e) => {
    if (e.target.id === 'rangeSel') {
      ui.rangeId = e.target.value;
      render();
    }
    if (e.target.id === 'compSel') {
      ui.chartComp = e.target.value;
      drawStudentEvolution(s);
    }
  };
  view.onclick = async (e) => {
    const sc = e.target.closest('[data-scope]');
    if (sc) {
      ui.chartScope = sc.dataset.scope;
      $$('[data-scope]').forEach((b) => b.classList.toggle('on', b === sc));
      drawStudentEvolution(s);
    }
    const cc = e.target.closest('[data-chartcomp]');
    if (cc) {
      ui.chartComp = cc.dataset.chartcomp;
      $('#compSel').value = ui.chartComp;
      drawStudentEvolution(s);
      $('#evoChart').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (e.target.closest('[data-act="pdf"]')) {
      await withBusy(() => import('./pdf.js').then((m) => m.bilanPDF({ classId: s.classId, rangeId: rid, studentIds: [s.id], summary: false })));
    }
  };
}

function drawStudentEvolution(s) {
  const scope = rangeById(ui.chartScope) || rangeById('YEAR');
  const evs = evalsFor({ sid: s.id, start: scope.start, end: scope.end });
  const comp = ui.chartComp;
  const score = (e) => (comp === 'ALL' ? evalTechScore(e, s.id) : compScore(e, s.id, comp));
  const points = evs
    .map((e) => ({ date: e.date, value: score(e), type: e.type, title: e.title }))
    .filter((p) => isNum(p.value));
  const periods = state.periods
    .filter((p) => p.end >= scope.start && p.start <= scope.end)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((p) => {
      const pe = evalsFor({ sid: s.id, start: p.start, end: p.end });
      return { ...p, avg: comp === 'ALL' ? globalAverage(s.id, pe) : compAverage(s.id, comp, pe) };
    });
  charts.mount($('#evoChart'), charts.evolutionConfig(points, periods));
}

async function withBusy(fn) {
  document.body.classList.add('busy');
  try {
    await new Promise((r) => setTimeout(r, 30));
    await fn();
  } catch (e) {
    console.error(e);
    alert('Erreur lors de la génération : ' + e.message);
  } finally {
    document.body.classList.remove('busy');
  }
}

// ======================================================================
// Bilans
// ======================================================================

function viewBilans() {
  const cid = state.currentClass;
  const rid = getRangeId();
  const r = rangeById(rid);
  const all = evalsFor({ classId: cid, start: r.start, end: r.end });
  const list = byType(all, ui.bilanType);
  const students = studentsOf(cid);
  const comps = techCompetences();
  const beh = behaviorComp();
  const nE = all.filter((e) => e.type === 'ecole').length;
  const nX = all.length - nE;

  const typeChips = [
    ['all', 'École + entreprise'],
    ['ecole', 'École'],
    ['entreprise', 'Entreprise'],
  ]
    .map(([k, l]) => `<button class="chip ${k} ${ui.bilanType === k ? 'on' : ''}" data-btype="${k}">${k !== 'all' ? ICONS[k] : ''}${l}</button>`)
    .join('');

  view.innerHTML = `
    <div class="page-head"><h1>Bilans · ${esc(classById(cid)?.name)}</h1></div>
    <div class="row gap-s wrap toolbar"><span class="muted">Période :</span>${rangeSelect('rangeSel', rid)}
      <span class="muted small">du ${dateFR(r.start)} au ${dateFR(r.end)} · ${nE} éval. école, ${nX} entreprise</span></div>

    <section class="card stack">
      <h2>${ICONS.pdf} Exporter le bilan en PDF</h2>
      <div class="row gap wrap">
        <label class="check"><input type="checkbox" id="optSummary" checked><span>Synthèse de classe</span></label>
        <label class="check"><input type="checkbox" id="optStudents" checked><span>Une fiche par élève</span></label>
        <label class="check"><input type="checkbox" id="optDetail" checked><span>Détail par critère</span></label>
        <label class="check"><input type="checkbox" id="optCharts" checked><span>Graphiques</span></label>
      </div>
      <details><summary class="muted">Choisir les élèves (${students.length})</summary>
        <div class="student-picks">${students
          .map((s) => `<label class="check pick"><input type="checkbox" data-pdfstudent="${s.id}" checked><span>${esc(fullName(s))}</span></label>`)
          .join('')}</div></details>
      <div><button class="btn primary" data-act="pdf">${ICONS.pdf}Générer le PDF – ${esc(r.name)}</button></div>
    </section>

    <div class="chips">${typeChips}</div>
    <div class="legend-row">${legendHTML()}</div>
    <section class="card">
      <div class="table-wrap"><table class="table matrix">
        <thead><tr><th class="sticky-col">Élève</th>${comps.map((c) => `<th title="${esc(c.label)}">${esc(c.id)}</th>`).join('')}<th>Moy.</th>${beh ? `<th class="th-behavior" title="${esc(beh.label)}">${ICONS.behavior}Comport.</th>` : ''}</tr></thead>
        <tbody>
          ${students
            .map(
              (s) => `<tr><th class="sticky-col"><a href="#/eleve/${s.id}">${esc(s.nom)} ${esc(s.prenom)}</a></th>
              ${comps.map((c) => `<td class="c">${pill(compAverage(s.id, c.id, list))}</td>`).join('')}
              <td class="c">${pill(globalAverage(s.id, list), 'big')}</td>
              ${beh ? `<td class="c">${pill(behaviorAverage(s.id, list))}</td>` : ''}</tr>`,
            )
            .join('')}
          <tr class="total"><th class="sticky-col">Moyenne classe</th>
            ${comps.map((c) => `<td class="c">${pill(classCompAverage(cid, c.id, list))}</td>`).join('')}
            <td class="c">${pill(mean(students.map((s) => globalAverage(s.id, list))), 'big')}</td>
            ${beh ? `<td class="c">${pill(classCompAverage(cid, beh.id, list))}</td>` : ''}</tr>
        </tbody></table></div>
      <p class="muted small">${comps.map((c) => `<b>${esc(c.id)}</b> ${esc(c.label)}`).join(' · ')}</p>
    </section>

    <section class="card stack">
      <h2>Évolution de la classe par période</h2>
      <select id="classCompSel" class="select">
        <option value="ALL">Moyenne des compétences techniques</option>
        ${beh ? `<option value="${esc(beh.id)}" ${ui.classChartComp === beh.id ? 'selected' : ''}>${esc(beh.label)}</option>` : ''}
        ${comps.map((c) => `<option value="${esc(c.id)}" ${ui.classChartComp === c.id ? 'selected' : ''}>${esc(c.id)} – ${esc(c.label)}</option>`).join('')}
      </select>
      <div class="chart-box"><canvas id="classChart"></canvas></div>
    </section>`;

  drawClassEvolution(cid);

  view.onchange = (e) => {
    if (e.target.id === 'rangeSel') {
      ui.rangeId = e.target.value;
      render();
    }
    if (e.target.id === 'classCompSel') {
      ui.classChartComp = e.target.value;
      drawClassEvolution(cid);
    }
  };
  view.onclick = async (e) => {
    const bt = e.target.closest('[data-btype]');
    if (bt) {
      ui.bilanType = bt.dataset.btype;
      render();
    }
    if (e.target.closest('[data-act="pdf"]')) {
      const ids = $$('[data-pdfstudent]:checked').map((i) => i.dataset.pdfstudent);
      const summary = $('#optSummary').checked;
      const withStudents = $('#optStudents').checked;
      if (!summary && (!withStudents || !ids.length)) return alert('Rien à exporter : cochez la synthèse ou au moins un élève.');
      await withBusy(() =>
        import('./pdf.js').then((m) =>
          m.bilanPDF({
            classId: cid,
            rangeId: rid,
            studentIds: withStudents ? ids : [],
            summary,
            detail: $('#optDetail').checked,
            charts: $('#optCharts').checked,
          }),
        ),
      );
    }
  };
}

function drawClassEvolution(cid) {
  const periods = [...state.periods].sort((a, b) => a.start.localeCompare(b.start));
  const comp = ui.classChartComp;
  const students = studentsOf(cid);
  const calc = (evs) =>
    comp === 'ALL' ? mean(students.map((s) => globalAverage(s.id, evs))) : classCompAverage(cid, comp, evs);
  const series = { ecole: [], entreprise: [], all: [] };
  for (const p of periods) {
    const evs = evalsFor({ classId: cid, start: p.start, end: p.end });
    series.all.push(calc(evs));
    series.ecole.push(calc(byType(evs, 'ecole')));
    series.entreprise.push(calc(byType(evs, 'entreprise')));
  }
  charts.mount($('#classChart'), charts.classEvolutionConfig(periods.map((p) => p.name), series));
}

// ======================================================================
// Réglages
// ======================================================================

function syncSectionHTML() {
  const st = sync.getStatus();
  const cid = sync.clientId();
  const origin = location.origin;
  const last = st.lastSync ? new Date(st.lastSync).toLocaleString('fr-FR') : 'jamais';
  return `<section class="card stack sync-card" id="syncCard">
    <h2>${ICONS.cloud} Synchronisation Google Drive</h2>
    <p class="muted small">Toutes les données sont enregistrées dans un fichier unique <b>EvalQ-donnees.json</b> de votre Google Drive,
      chiffré avec votre code. Connectez chaque appareil (PC, tablette, téléphone) avec le même compte Google :
      les modifications sont synchronisées automatiquement ; hors connexion, elles sont envoyées au retour du réseau.</p>
    ${
      !cid
        ? `<p><b>Étape unique :</b> saisissez l’identifiant client Google (voir le guide ci-dessous).</p>`
        : sync.isEnabled()
          ? `<p class="status-line">${esc(st.email || 'Compte Google connecté')} · <span id="syncStatus"></span></p>
             <p class="muted small">Dernière synchronisation : ${esc(last)}</p>
             ${sync.placementNote() ? `<p class="small">${esc(sync.placementNote())}</p>` : ''}
             <div class="row gap-s wrap">
               ${st.status === 'reconnect' ? `<button class="btn primary" data-act="connect">Se reconnecter</button>` : `<button class="btn primary" data-act="syncNow">Synchroniser maintenant</button>`}
               <button class="btn ghost danger" data-act="disconnect">Déconnecter</button>
             </div>`
          : `<div><button class="btn primary" data-act="connect">${ICONS.cloud}Connecter Google Drive</button></div>`
    }
    <details class="guide" ${cid ? '' : 'open'}><summary>Identifiant client Google ${cid ? '(configuré)' : ''}</summary>
      ${
        sync.clientIdBuiltIn()
          ? `<p class="small muted" style="margin:8px 0">Intégré à l’application : <code>${esc(cid)}</code></p>`
          : `<div class="row gap-s wrap" style="margin:8px 0">
        <input id="clientId" class="grow" placeholder="xxxxxxxx.apps.googleusercontent.com" value="${esc(cid)}">
        <button class="btn" data-act="saveClientId">Enregistrer</button>
      </div>`
      }
      <label class="field"><span>Dossier Google Drive (identifiant ou adresse du dossier, facultatif)</span>
        <div class="row gap-s wrap"><input id="folderId" class="grow" value="${esc(sync.folderId())}" placeholder="ex. 1epo5m15lHIEy…">
        <button class="btn" data-act="saveFolderId">Enregistrer</button></div></label>
      <p class="small"><b>Créer l’identifiant (une seule fois, gratuit) :</b></p>
      <ol class="small">
        <li>Ouvrir <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> et créer un projet « EvalQ ».</li>
        <li>Menu <i>API et services → Bibliothèque</i> : activer <b>Google Drive API</b>.</li>
        <li><i>Écran de consentement OAuth</i> (Google Auth Platform) : type <b>Externe</b>, nom « EvalQ », votre e-mail ;
          dans <i>Audience</i>, ajouter votre adresse Gmail comme <b>utilisateur test</b>.</li>
        <li><i>Clients → Créer un client</i> : type <b>Application Web</b> ; dans <i>Origines JavaScript autorisées</i>, ajouter
          <code>${esc(origin)}</code>.</li>
        <li>Copier l’<b>ID client</b> (se termine par <code>.apps.googleusercontent.com</code>) et le coller ci-dessus, sur chaque appareil
          (ou le faire intégrer à l’application pour ne plus avoir à le saisir).</li>
      </ol>
    </details>
  </section>`;
}

function viewSettings() {
  if (!ui.settingsClass || !classById(ui.settingsClass)) ui.settingsClass = state.currentClass;
  const cid = ui.settingsClass;
  const students = studentsOf(cid);
  const comps = sortedCompetences();
  const periodRows = (list, kind) =>
    list
      .map(
        (p, i) => `<div class="period-row" data-kind="${kind}" data-i="${i}">
        <input data-f="name" value="${esc(p.name)}" aria-label="Nom">
        <input type="date" data-f="start" value="${esc(p.start)}" aria-label="Début">
        <input type="date" data-f="end" value="${esc(p.end)}" aria-label="Fin">
        <button class="btn ghost icon" data-delperiod aria-label="Supprimer">${ICONS.trash}</button></div>`,
      )
      .join('');

  view.innerHTML = `
    <div class="page-head"><h1>Réglages</h1></div>

    ${syncSectionHTML()}

    <section class="card stack">
      <h2>${ICONS.lock} Code d’accès</h2>
      <p class="muted small">Le code à 6 chiffres est demandé à chaque ouverture (et après 5 minutes en arrière-plan).
        Il chiffre les données sur l’appareil et sur Google Drive : utilisez le même code sur tous vos appareils.
        Un code modifié ici sera demandé une fois sur vos autres appareils.</p>
      <div class="row gap-s wrap">
        <button class="btn" data-act="changeCode">Changer le code</button>
        <button class="btn ghost" data-act="lock">${ICONS.lock}Verrouiller maintenant</button>
      </div>
    </section>

    <section class="card stack">
      <h2>Classes et élèves</h2>
      <div class="row gap-s wrap">
        <div class="chips">${state.classes
          .map((c) => `<button class="chip ${c.id === cid ? 'on' : ''}" data-sclass="${esc(c.id)}">${esc(c.name)} (${studentsOf(c.id).length})</button>`)
          .join('')}</div>
        <button class="btn small" data-act="addClass">${ICONS.plus}Classe</button>
        <button class="btn small ghost" data-act="renameClass">${ICONS.edit}Renommer</button>
        <button class="btn small ghost danger" data-act="delClass">${ICONS.trash}Supprimer la classe</button>
      </div>
      <div class="row gap-s wrap">
        <button class="btn primary" data-act="import">Importer un fichier Excel / CSV</button>
        <span class="muted small">Un onglet par classe (nom de l’onglet = classe), colonnes NOM et Prénom. Seuls le nom et le prénom sont conservés, uniquement sur cet appareil.</span>
      </div>
      <form class="row gap-s wrap" id="addStudent">
        <input name="nom" placeholder="NOM" required class="grow">
        <input name="prenom" placeholder="Prénom" required class="grow">
        <button class="btn">${ICONS.plus}Ajouter</button>
      </form>
      <div class="list compact">${students
        .map(
          (s) => `<div class="list-row"><span class="grow">${esc(s.nom)} ${esc(s.prenom)}</span>
          <button class="btn ghost icon" data-editstudent="${s.id}" aria-label="Modifier">${ICONS.edit}</button>
          <button class="btn ghost icon" data-delstudent="${s.id}" aria-label="Supprimer">${ICONS.trash}</button></div>`,
        )
        .join('') || '<p class="muted">Aucun élève.</p>'}</div>
    </section>

    <section class="card stack">
      <h2>Périodes d’évaluation (6 à 7 semaines)</h2>
      <p class="muted small">Chaque évaluation est rattachée à la période qui contient sa date.</p>
      <div class="periods">${periodRows(state.periods, 'periods')}</div>
      <div><button class="btn small" data-addperiod="periods">${ICONS.plus}Période</button></div>
      <h3>Semestres</h3>
      <div class="periods">${periodRows(state.semesters, 'semesters')}</div>
      <div><button class="btn small" data-addperiod="semesters">${ICONS.plus}Semestre</button></div>
    </section>

    <section class="card stack">
      <h2>Référentiel de compétences</h2>
      <p class="muted small">Chaque critère est noté sur 10 ; la note d’une compétence est la moyenne des critères évalués.</p>
      ${comps
        .map(
          (c) => `<details class="ref-comp"><summary><b>${esc(c.id)}</b> ${esc(c.label)} <span class="muted small">(${c.criteres.length} critères · ${esc(c.epreuve)})</span></summary>
          <div class="list compact">${c.criteres
            .map(
              (k) => `<div class="list-row"><span class="grow">${esc(k.label)}</span>
              <button class="btn ghost icon" data-editcrit="${esc(c.id)}|${esc(k.id)}" aria-label="Modifier">${ICONS.edit}</button>
              <button class="btn ghost icon" data-delcrit="${esc(c.id)}|${esc(k.id)}" aria-label="Supprimer">${ICONS.trash}</button></div>`,
            )
            .join('')}</div>
          <div class="row gap-s"><button class="btn small" data-addcrit="${esc(c.id)}">${ICONS.plus}Critère</button>
            <button class="btn small ghost" data-editcomp="${esc(c.id)}">${ICONS.edit}Renommer la compétence</button></div>
        </details>`,
        )
        .join('')}
      <div><button class="btn small" data-act="addComp">${ICONS.plus}Compétence</button></div>
    </section>

    <section class="card stack">
      <h2>Sauvegarde</h2>
      <p class="muted small">Les données sont enregistrées (chiffrées) sur cet appareil et, si la synchronisation est activée, sur votre Google Drive.
        Une sauvegarde manuelle (fichier .json <b>non chiffré</b>, à conserver en lieu sûr) reste utile en cas de problème.
        ${state.lastBackup ? `<br>Dernière sauvegarde : ${dateFR(state.lastBackup)}.` : '<br><b>Aucune sauvegarde effectuée.</b>'}</p>
      <div class="row gap-s wrap">
        <button class="btn primary" data-act="export">Exporter une sauvegarde</button>
        <button class="btn" data-act="restore">Restaurer une sauvegarde</button>
        <button class="btn danger ghost" data-act="reset">Tout effacer</button>
      </div>
    </section>

    <section class="card stack">
      <h2>Installer l’application</h2>
      <ul class="small">
        <li><b>iPad / iPhone (Safari)</b> : bouton Partager → « Sur l’écran d’accueil ».</li>
        <li><b>Android (Chrome)</b> : menu ⋮ → « Installer l’application ».</li>
        <li><b>Ordinateur (Chrome / Edge)</b> : icône d’installation dans la barre d’adresse.</li>
      </ul>
      <p class="muted small">Une fois installée, l’application fonctionne hors connexion.</p>
    </section>`;

  if (location.hash.includes('?sync')) $('#syncCard')?.scrollIntoView();
  const findComp = (id) => state.competences.find((c) => c.id === id);
  view.onclick = async (e) => {
    const t = e.target;
    const sc = t.closest('[data-sclass]');
    if (sc) {
      ui.settingsClass = sc.dataset.sclass;
      return render();
    }
    const act = t.closest('[data-act]')?.dataset.act;
    if (act === 'import') return importStudents(cid);
    if (act === 'lock') return lockNow();
    if (act === 'changeCode') {
      const cur = await openPin({
        title: 'Code actuel',
        subtitle: 'Saisissez votre code actuel.',
        cancelLabel: 'Annuler',
        onSubmit: async (c) => ((await checkCode(c)) ? true : 'Code incorrect'),
      });
      if (!cur) return;
      let first = null;
      const a = await openPin({ title: 'Nouveau code', subtitle: '6 chiffres', cancelLabel: 'Annuler', onSubmit: async (c) => ((first = c), true) });
      if (!a) return;
      const b = await openPin({
        title: 'Confirmez le nouveau code',
        cancelLabel: 'Annuler',
        onSubmit: async (c) => {
          if (c !== first) return 'Les deux codes sont différents';
          await changeCode(c);
          return true;
        },
      });
      if (!b) return;
      toast('Code modifié');
      sync.sync();
      return;
    }
    if (act === 'saveClientId') {
      sync.setClientId($('#clientId').value);
      toast('Identifiant enregistré');
      sync.loadGIS().catch(() => {});
      return render();
    }
    if (act === 'saveFolderId') {
      sync.setFolderId($('#folderId').value);
      toast('Dossier enregistré (utilisé à la création du fichier)');
      return render();
    }
    if (act === 'connect') {
      try {
        await sync.connect();
        toast('Google Drive connecté');
      } catch (err) {
        alert(err.message);
      }
      return render();
    }
    if (act === 'syncNow') {
      await sync.sync();
      return render();
    }
    if (act === 'disconnect') {
      if (!confirm('Déconnecter Google Drive sur cet appareil ? (le fichier reste sur votre Drive)')) return;
      sync.disconnect();
      return render();
    }
    if (act === 'addClass') {
      const name = prompt('Nom de la nouvelle classe :')?.trim();
      if (!name) return;
      if (classById(name)) return alert('Cette classe existe déjà.');
      state.classes.push({ id: name, name });
      ui.settingsClass = name;
      save();
      return render();
    }
    if (act === 'renameClass') {
      const c = classById(cid);
      const name = prompt('Nouveau nom de la classe :', c.name)?.trim();
      if (!name) return;
      c.name = name;
      save();
      return render();
    }
    if (act === 'delClass') {
      const c = classById(cid);
      if (!confirm(`Supprimer la classe ${c.name}, ses élèves et ses évaluations ?`)) return;
      state.classes = state.classes.filter((x) => x.id !== cid);
      state.students = state.students.filter((s) => s.classId !== cid);
      state.evaluations = state.evaluations.filter((ev) => ev.classId !== cid);
      if (!state.classes.length) state.classes.push({ id: '1P2', name: '1P2' });
      if (state.currentClass === cid) state.currentClass = state.classes[0].id;
      ui.settingsClass = state.classes[0].id;
      save();
      return render();
    }
    const es = t.closest('[data-editstudent]');
    if (es) {
      const s = studentById(es.dataset.editstudent);
      const nom = prompt('NOM :', s.nom)?.trim();
      if (!nom) return;
      const prenom = prompt('Prénom :', s.prenom)?.trim();
      if (!prenom) return;
      s.nom = nom.toUpperCase();
      s.prenom = prenom;
      save();
      return render();
    }
    const ds = t.closest('[data-delstudent]');
    if (ds) {
      const s = studentById(ds.dataset.delstudent);
      if (!confirm(`Supprimer ${fullName(s)} et toutes ses notes ?`)) return;
      state.students = state.students.filter((x) => x.id !== s.id);
      for (const ev of state.evaluations) {
        ev.students = ev.students.filter((x) => x !== s.id);
        delete ev.notes[s.id];
      }
      save();
      return render();
    }
    const ap = t.closest('[data-addperiod]');
    if (ap) {
      const list = state[ap.dataset.addperiod];
      const last = [...list].sort((a, b) => a.end.localeCompare(b.end)).at(-1);
      const start = last ? addDays(last.end, 1) : todayISO();
      list.push({
        id: uid(),
        name: `${ap.dataset.addperiod === 'periods' ? 'Période' : 'Semestre'} ${list.length + 1}`,
        start,
        end: addDays(start, ap.dataset.addperiod === 'periods' ? 48 : 150),
      });
      save();
      return render();
    }
    const dp = t.closest('[data-delperiod]');
    if (dp) {
      const row = dp.closest('.period-row');
      const list = state[row.dataset.kind];
      if (!confirm(`Supprimer « ${list[row.dataset.i].name} » ? (les évaluations sont conservées)`)) return;
      list.splice(+row.dataset.i, 1);
      save();
      return render();
    }
    const ac = t.closest('[data-addcrit]');
    if (ac) {
      const c = findComp(ac.dataset.addcrit);
      const label = prompt(`Nouveau critère pour ${c.id} :`)?.trim();
      if (!label) return;
      c.criteres.push({ id: `${c.id}-${uid()}`, label });
      save();
      return render();
    }
    const ec = t.closest('[data-editcrit]');
    if (ec) {
      const [cId, kId] = ec.dataset.editcrit.split('|');
      const k = findComp(cId).criteres.find((x) => x.id === kId);
      const label = prompt('Intitulé du critère :', k.label)?.trim();
      if (!label) return;
      k.label = label;
      save();
      return render();
    }
    const dc = t.closest('[data-delcrit]');
    if (dc) {
      const [cId, kId] = dc.dataset.delcrit.split('|');
      const c = findComp(cId);
      const used = state.evaluations.some((ev) => ev.selection[cId]?.includes(kId));
      if (!confirm(used ? 'Ce critère a déjà été évalué : ses notes ne seront plus prises en compte. Supprimer ?' : 'Supprimer ce critère ?')) return;
      c.criteres = c.criteres.filter((x) => x.id !== kId);
      for (const ev of state.evaluations) {
        if (!ev.selection[cId]) continue;
        ev.selection[cId] = ev.selection[cId].filter((x) => x !== kId);
        if (!ev.selection[cId].length) delete ev.selection[cId];
      }
      save();
      return render();
    }
    const ecp = t.closest('[data-editcomp]');
    if (ecp) {
      const c = findComp(ecp.dataset.editcomp);
      const label = prompt(`Intitulé de ${c.id} :`, c.label)?.trim();
      if (!label) return;
      c.label = label;
      save();
      return render();
    }
    if (act === 'addComp') {
      const id = prompt('Code de la compétence (ex. C14) :')?.trim().toUpperCase();
      if (!id) return;
      if (findComp(id)) return alert('Ce code existe déjà.');
      const label = prompt('Intitulé :')?.trim();
      if (!label) return;
      const ep = prompt(`Épreuve (${state.epreuves.map((x) => x.id).join(', ')}) :`, state.epreuves[0]?.id)?.trim();
      state.competences.push({ id, label, epreuve: ep || '', criteres: [] });
      save();
      return render();
    }
    if (act === 'export') {
      state.lastBackup = todayISO();
      save();
      const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
      await shareOrDownload(blob, `EvalQ_sauvegarde_${todayISO()}.json`, 'application/json');
      return render();
    }
    if (act === 'restore') {
      const f = await pickFile('.json,application/json');
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.evaluations) || !Array.isArray(data.students)) throw new Error('fichier non reconnu');
        if (!confirm(`Remplacer toutes les données actuelles par cette sauvegarde (${data.students.length} élèves, ${data.evaluations.length} évaluations) ?`)) return;
        replaceState(data);
        toast('Sauvegarde restaurée');
        return render();
      } catch (err) {
        return alert('Restauration impossible : ' + err.message);
      }
    }
    if (act === 'reset') {
      if (!confirm('Effacer TOUTES les données (élèves, évaluations, réglages) ?')) return;
      if (!confirm('Confirmer l’effacement définitif ?')) return;
      resetState();
      return render();
    }
  };
  view.onchange = (e) => {
    const row = e.target.closest('.period-row');
    if (row) {
      const p = state[row.dataset.kind][+row.dataset.i];
      p[e.target.dataset.f] = e.target.value;
      if (p.start && p.end && p.start > p.end) toast('Attention : la fin est avant le début');
      save();
    }
  };
  $('#addStudent').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    state.students.push({ id: uid(), classId: cid, nom: f.nom.value.trim().toUpperCase(), prenom: f.prenom.value.trim() });
    save();
    render();
    $('#addStudent input[name=nom]')?.focus();
  };
}

const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ======================================================================
// Démarrage
// ======================================================================

// ======================================================================
// Démarrage, code d'accès et synchronisation
// ======================================================================

const LOCK_AFTER_MS = 5 * 60 * 1000;
const ATTEMPTS_KEY = 'evalq.attempts';

async function unlockFlow() {
  if (!isSetUp()) {
    await createPin({
      title: 'Créez votre code',
      subtitle: 'Code à 6 chiffres demandé à chaque ouverture. Utilisez le même code sur tous vos appareils.',
      onCreate: (c) => setupCode(c),
    });
    return;
  }
  await openPin({
    title: 'EvalQ',
    subtitle: 'Saisissez votre code',
    onSubmit: async (c) => {
      const a = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{"n":0,"until":0}');
      if (Date.now() < a.until) return `Trop d’essais. Réessayez dans ${Math.ceil((a.until - Date.now()) / 1000)} s.`;
      try {
        await unlock(c);
        localStorage.removeItem(ATTEMPTS_KEY);
        return true;
      } catch {
        a.n++;
        if (a.n >= 5) a.until = Date.now() + 30000 * 2 ** Math.min(a.n - 5, 6);
        localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a));
        return a.n >= 5 ? 'Code incorrect. Patientez avant de réessayer.' : 'Code incorrect';
      }
    },
    links: [
      {
        label: 'Code oublié ?',
        onClick: () => {
          if (
            confirm(
              'Sans le code, les données ne peuvent pas être déchiffrées.\n\n' +
                'Effacer les données de CET appareil et recommencer ?\n' +
                '(Le fichier Google Drive, lui aussi protégé par ce code, ne sera plus lisible.)',
            ) &&
            confirm('Confirmer l’effacement de cet appareil ?')
          ) {
            wipeDevice();
            location.reload();
          }
        },
      },
    ],
  });
}

function lockNow() {
  flush().then(() => location.reload());
}

let syncTimer = null;
const scheduleSync = (ms = 4000) => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => sync.sync(), ms);
};

function renderSyncBadge() {
  const b = $('#syncBtn');
  if (!b) return;
  const { status, lastSync, error } = sync.getStatus();
  const label = {
    off: 'Synchronisation Google Drive non activée',
    idle: 'Google Drive connecté',
    syncing: 'Synchronisation…',
    ok: `Synchronisé${lastSync ? ' à ' + new Date(lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}`,
    reconnect: 'Toucher pour se reconnecter à Google Drive',
    error: error || 'Erreur de synchronisation',
  }[status];
  b.className = `sync-btn st-${status}`;
  b.title = label;
  b.setAttribute('aria-label', label);
  const s = $('#syncStatus');
  if (s) s.textContent = label;
}

async function syncButton() {
  const { status } = sync.getStatus();
  if (status === 'off') return go('#/reglages?sync');
  try {
    if (status === 'reconnect') await sync.connect();
    else await sync.sync();
  } catch (e) {
    alert(e.message);
  }
}

function setupSync() {
  sync.configure({
    askCode: (check) =>
      openPin({
        title: 'Code du fichier Drive',
        subtitle: 'Le fichier Google Drive utilise un autre code (modifié sur un autre appareil). Saisissez ce code : il deviendra celui de cet appareil.',
        cancelLabel: 'Annuler',
        onSubmit: async (c) => ((await check(c)) ? true : 'Code incorrect'),
      }),
    chooseFirst: (remote) =>
      choose(
        'Un fichier EvalQ existe déjà sur votre Google Drive',
        `Drive : ${remote.students.length} élève(s), ${remote.evaluations.length} évaluation(s). ` +
          `Cet appareil : ${state.students.length} élève(s), ${state.evaluations.length} évaluation(s).`,
        [
          ['drive', 'Utiliser les données du Drive (recommandé)', 'primary'],
          ['merge', 'Fusionner les deux'],
        ],
      ),
    onChanged: () => {
      const a = document.activeElement;
      if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && view.contains(a)) {
        a.addEventListener('blur', () => render(), { once: true });
      } else render();
      toast('Données mises à jour depuis Google Drive');
    },
  });
  sync.onStatus(renderSyncBadge);
  onSave(() => scheduleSync());
  window.addEventListener('online', () => sync.sync());
  setInterval(() => document.visibilityState === 'visible' && sync.sync(), 120000);
  if (sync.clientId() && navigator.onLine) sync.loadGIS().catch(() => {});
  renderSyncBadge();
  sync.sync();
}

function choose(title, text, buttons) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = `<div class="modal-box card stack"><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="stack">${buttons.map(([v, l, cls]) => `<button class="btn ${cls || ''}" data-v="${v}">${esc(l)}</button>`).join('')}</div></div>`;
    document.body.appendChild(el);
    el.onclick = (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      el.remove();
      resolve(b.dataset.v);
    };
  });
}

async function init() {
  $$('.tabbar a').forEach((a) => a.insertAdjacentHTML('afterbegin', ICONS[a.dataset.icon]));
  $('#lockBtn').innerHTML = ICONS.lock;
  $('#syncBtn').innerHTML = ICONS.cloud;
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
  if (!window.crypto?.subtle) {
    document.body.innerHTML = '<p style="padding:24px">Cette application doit être ouverte en https.</p>';
    return;
  }
  await unlockFlow();
  document.body.classList.add('ready');
  window.addEventListener('hashchange', render);
  $('#lockBtn').onclick = lockNow;
  $('#syncBtn').onclick = syncButton;
  render();
  requestPersistence();
  setupSync();

  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      flush();
      if (sync.isEnabled()) sync.sync();
    } else if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS) {
      lockNow();
    } else {
      sync.sync();
    }
  });
}

init();
