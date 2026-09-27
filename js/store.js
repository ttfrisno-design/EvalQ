import { DEFAULT_COMPETENCES, DEFAULT_EPREUVES } from './referentiel.js';

const KEY = 'evalq.v1';

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);
export const mean = (vals) => {
  const v = vals.filter(isNum);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function defaultPeriods() {
  // Découpage indicatif 2026-2027 (≈ 6 à 7 semaines) — modifiable dans Réglages.
  return [
    { id: 'P1', name: 'Période 1', start: '2026-09-01', end: '2026-10-16' },
    { id: 'P2', name: 'Période 2', start: '2026-10-17', end: '2026-12-18' },
    { id: 'P3', name: 'Période 3', start: '2026-12-19', end: '2027-02-19' },
    { id: 'P4', name: 'Période 4', start: '2027-02-20', end: '2027-04-16' },
    { id: 'P5', name: 'Période 5', start: '2027-04-17', end: '2027-07-04' },
  ];
}

function defaultSemesters() {
  return [
    { id: 'S1', name: 'Semestre 1', start: '2026-09-01', end: '2027-01-31' },
    { id: 'S2', name: 'Semestre 2', start: '2027-02-01', end: '2027-07-04' },
  ];
}

function defaultState() {
  return {
    version: 1,
    classes: [
      { id: '1P2', name: '1P2' },
      { id: 'TP2', name: 'TP2' },
    ],
    students: [],
    epreuves: structuredClone(DEFAULT_EPREUVES),
    competences: structuredClone(DEFAULT_COMPETENCES),
    periods: defaultPeriods(),
    semesters: defaultSemesters(),
    evaluations: [],
    currentClass: '1P2',
    lastBackup: null,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('Lecture impossible', e);
    return null;
  }
}

function migrate(s) {
  const d = defaultState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  return s;
}

export let state = load() || defaultState();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    alert('Impossible d’enregistrer les données : ' + e.message);
  }
}

export function replaceState(next) {
  state = migrate(next);
  save();
}

export function resetState() {
  state = defaultState();
  save();
}

// ---------- Accès ----------

export const classById = (id) => state.classes.find((c) => c.id === id);
export const studentById = (id) => state.students.find((s) => s.id === id);
export const evalById = (id) => state.evaluations.find((e) => e.id === id);
export const compById = (id) => state.competences.find((c) => c.id === id);

export function studentsOf(classId) {
  return state.students
    .filter((s) => s.classId === classId && !s.archived)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.prenom.localeCompare(b.prenom, 'fr'));
}

export const fullName = (s) => (s ? `${s.nom} ${s.prenom}` : '?');

export function sortedCompetences() {
  const n = (id) => parseInt(String(id).replace(/\D/g, ''), 10) || 999;
  return [...state.competences].sort((a, b) => n(a.id) - n(b.id) || a.id.localeCompare(b.id));
}

// ---------- Calculs ----------

/** Note d'une compétence pour un élève dans une évaluation = moyenne des critères notés. */
export function compScore(ev, sid, compId) {
  if (ev.absent?.[sid]) return null;
  const ids = ev.selection[compId] || [];
  const notes = ev.notes[sid] || {};
  return mean(ids.map((i) => notes[i]));
}

/** Moyenne d'une évaluation pour un élève (moyenne des compétences évaluées). */
export function evalScore(ev, sid) {
  return mean(Object.keys(ev.selection).map((c) => compScore(ev, sid, c)));
}

export function evalsFor({ classId, start, end, type = 'all', sid } = {}) {
  return state.evaluations
    .filter(
      (e) =>
        (!classId || e.classId === classId) &&
        (!start || e.date >= start) &&
        (!end || e.date <= end) &&
        (type === 'all' || e.type === type) &&
        (!sid || e.students.includes(sid)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Moyenne d'une compétence sur plusieurs évaluations (chaque évaluation compte une fois). */
export function compAverage(sid, compId, evals) {
  return mean(evals.filter((e) => e.students.includes(sid)).map((e) => compScore(e, sid, compId)));
}

export function critAverage(sid, critId, evals) {
  return mean(
    evals
      .filter((e) => e.students.includes(sid) && !e.absent?.[sid])
      .map((e) => e.notes[sid]?.[critId]),
  );
}

/** Moyenne générale = moyenne des moyennes de compétences. */
export function globalAverage(sid, evals) {
  return mean(state.competences.map((c) => compAverage(sid, c.id, evals)));
}

export function classCompAverage(classId, compId, evals) {
  return mean(studentsOf(classId).map((s) => compAverage(s.id, compId, evals)));
}

export function evalCompletion(ev) {
  let total = 0;
  let done = 0;
  for (const sid of ev.students) {
    if (ev.absent?.[sid]) continue;
    for (const ids of Object.values(ev.selection)) {
      for (const cid of ids) {
        total++;
        if (isNum(ev.notes[sid]?.[cid])) done++;
      }
    }
  }
  return total ? done / total : 0;
}

// ---------- Périodes ----------

export function periodOf(date) {
  return state.periods.find((p) => date >= p.start && date <= p.end) || null;
}

export function yearRange() {
  const all = [...state.periods, ...state.semesters];
  if (!all.length) return { start: '', end: '' };
  return {
    start: all.map((p) => p.start).sort()[0],
    end: all.map((p) => p.end).sort().at(-1),
  };
}

/** Liste des plages sélectionnables : périodes, semestres, année. */
export function ranges() {
  const y = yearRange();
  return [
    ...state.periods.map((p) => ({ ...p, kind: 'period' })),
    ...state.semesters.map((p) => ({ ...p, kind: 'semester' })),
    { id: 'YEAR', name: 'Année complète', start: y.start, end: y.end, kind: 'year' },
  ];
}

export function rangeById(id) {
  return ranges().find((r) => r.id === id) || null;
}

export function currentRangeId() {
  const p = periodOf(todayISO());
  return p ? p.id : 'YEAR';
}

/** Plage précédente de même nature (pour comparer l'évolution). */
export function previousRange(r) {
  if (!r || r.kind === 'year') return null;
  const list = r.kind === 'period' ? state.periods : state.semesters;
  const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
  const i = sorted.findIndex((p) => p.id === r.id);
  return i > 0 ? { ...sorted[i - 1], kind: r.kind } : null;
}

// ---------- Niveaux ----------

export const LEVELS = [
  { min: 8, key: 'l4', label: 'Maîtrisé' },
  { min: 6, key: 'l3', label: 'Acquis' },
  { min: 4, key: 'l2', label: 'En cours d’acquisition' },
  { min: 0, key: 'l1', label: 'Non acquis' },
];

export const levelOf = (v) => (isNum(v) ? LEVELS.find((l) => v >= l.min) : null);

export const fmt = (v, d = 1) => (isNum(v) ? v.toFixed(d).replace('.', ',') : '–');

// ---------- Persistance ----------

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    /* ignoré */
  }
}
