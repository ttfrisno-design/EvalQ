import { DEFAULT_COMPETENCES, DEFAULT_EPREUVES, BEHAVIOR_COMP, BEHAVIOR_EPREUVE, BEHAVIOR_ID } from './referentiel.js';
import { ITER, newSalt, deriveKey, encryptJSON, decryptJSON } from './crypto.js';

const LEGACY_KEY = 'evalq.v1'; // ancien stockage en clair (migré puis supprimé)
const SECURE_KEY = 'evalq.secure'; // stockage chiffré avec le code

/** Collections synchronisées élément par élément (fusion par identifiant). */
export const COLLECTIONS = ['classes', 'students', 'epreuves', 'competences', 'periods', 'semesters', 'evaluations'];
/** Champs propres à chaque appareil, jamais écrasés par la synchronisation. */
const LOCAL_FIELDS = ['currentClass', 'lastBackup'];

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
    version: 2,
    classes: [
      { id: '1P2', name: '1P2' },
      { id: 'TP2', name: 'TP2' },
    ],
    students: [],
    epreuves: [structuredClone(BEHAVIOR_EPREUVE), ...structuredClone(DEFAULT_EPREUVES)],
    competences: [...structuredClone(DEFAULT_COMPETENCES), structuredClone(BEHAVIOR_COMP)],
    periods: defaultPeriods(),
    semesters: defaultSemesters(),
    evaluations: [],
    meta: { stamps: {}, deleted: {} },
    currentClass: '1P2',
    lastBackup: null,
  };
}

function migrate(s) {
  const d = defaultState();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.meta.stamps ||= {};
  s.meta.deleted ||= {};
  // Ajout du « Comportement face au travail » (sauf s'il a été supprimé volontairement).
  if (!s.epreuves.some((e) => e.id === BEHAVIOR_ID) && !s.meta.deleted[`epreuves:${BEHAVIOR_ID}`]) {
    s.epreuves.unshift(structuredClone(BEHAVIOR_EPREUVE));
  }
  if (!s.competences.some((c) => c.id === BEHAVIOR_ID) && !s.meta.deleted[`competences:${BEHAVIOR_ID}`]) {
    s.competences.push(structuredClone(BEHAVIOR_COMP));
  }
  s.version = 2;
  return s;
}

// ---------- État, clé de chiffrement et suivi des modifications ----------

export let state = null;
let key = null;
let salt = null;
let iter = ITER;
let snap = new Map(); // "collection:id" -> JSON du dernier état connu
const saveListeners = new Set();
export const onSave = (fn) => saveListeners.add(fn);

function resetSnap() {
  snap = new Map();
  for (const c of COLLECTIONS) for (const e of state[c]) snap.set(`${c}:${e.id}`, JSON.stringify(e));
}

/** Horodate les éléments créés / modifiés et note les suppressions (pour la fusion entre appareils). */
function stamp() {
  const now = Date.now();
  const seen = new Set();
  for (const c of COLLECTIONS) {
    for (const e of state[c]) {
      const k = `${c}:${e.id}`;
      seen.add(k);
      const j = JSON.stringify(e);
      if (snap.get(k) !== j) {
        state.meta.stamps[k] = now;
        delete state.meta.deleted[k];
        snap.set(k, j);
      }
    }
  }
  for (const k of [...snap.keys()]) {
    if (!seen.has(k)) {
      state.meta.deleted[k] = now;
      snap.delete(k);
    }
  }
}

function initState(s) {
  state = migrate(s);
  resetSnap();
}

export const isSetUp = () => !!localStorage.getItem(SECURE_KEY);
export const isUnlocked = () => !!key && !!state;

/** Premier lancement : création du code (reprend les données de l'ancienne version si présentes). */
export async function setupCode(code) {
  salt = newSalt();
  iter = ITER;
  key = await deriveKey(code, salt, iter);
  let legacy = null;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
  } catch {
    /* ignoré */
  }
  initState(legacy || defaultState());
  await persistNow();
  localStorage.removeItem(LEGACY_KEY);
}

/** Déverrouillage : lève une exception si le code est faux. */
export async function unlock(code) {
  const blob = JSON.parse(localStorage.getItem(SECURE_KEY));
  const k = await deriveKey(code, blob.salt, blob.iter);
  const data = await decryptJSON(k, blob);
  key = k;
  salt = blob.salt;
  iter = blob.iter;
  initState(data);
}

export async function checkCode(code) {
  try {
    await decryptJSON(await deriveKey(code, salt, iter), JSON.parse(localStorage.getItem(SECURE_KEY)));
    return true;
  } catch {
    return false;
  }
}

export async function changeCode(newCode) {
  salt = newSalt();
  iter = ITER;
  key = await deriveKey(newCode, salt, iter);
  await persistNow();
}

/** Efface toutes les données de cet appareil (code oublié). */
export function wipeDevice() {
  localStorage.removeItem(SECURE_KEY);
  localStorage.removeItem(LEGACY_KEY);
  localStorage.removeItem('evalq.sync');
  sessionStorage.clear();
}

// ---------- Enregistrement chiffré ----------

let persistTimer = null;
let persistChain = Promise.resolve();

export function persistNow() {
  clearTimeout(persistTimer);
  persistTimer = null;
  const snapshot = JSON.parse(JSON.stringify(state));
  const k = key;
  const s = salt;
  const it = iter;
  persistChain = persistChain.then(async () => {
    const blob = await encryptJSON(k, snapshot);
    try {
      localStorage.setItem(SECURE_KEY, JSON.stringify({ v: 1, salt: s, iter: it, ...blob, updatedAt: Date.now() }));
    } catch (e) {
      alert('Impossible d’enregistrer les données : ' + e.message);
    }
  });
  return persistChain;
}

/** Termine les écritures en attente (avant verrouillage / mise en arrière-plan). */
export function flush() {
  return persistTimer ? persistNow() : persistChain;
}

export function save() {
  if (!state) return;
  stamp();
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persistNow, 250);
  saveListeners.forEach((fn) => fn());
}

/** Remplacement volontaire (restauration d'une sauvegarde) : l'emporte sur les autres appareils. */
export function replaceState(next) {
  const local = Object.fromEntries(LOCAL_FIELDS.map((f) => [f, state[f]]));
  const oldMeta = state.meta;
  state = migrate({ ...next, meta: { stamps: { ...oldMeta.stamps }, deleted: { ...oldMeta.deleted } } });
  Object.assign(state, local);
  save();
}

export function resetState() {
  replaceState(defaultState());
}

// ---------- Synchronisation : chiffrement et fusion ----------

export async function encryptForRemote() {
  return { v: 1, salt, iter, ...(await encryptJSON(key, state)), updatedAt: Date.now() };
}

/**
 * Déchiffre le fichier distant. Si son code diffère (changé sur un autre appareil),
 * `askCode(check)` demande le code ; cet appareil adopte alors ce code.
 */
export async function decryptRemote(blob, askCode) {
  if (blob.salt === salt && blob.iter === iter) return { data: await decryptJSON(key, blob), rekeyed: false };
  let found = null;
  const code = await askCode(async (c) => {
    try {
      const k = await deriveKey(c, blob.salt, blob.iter);
      found = { k, data: await decryptJSON(k, blob) };
      return true;
    } catch {
      return false;
    }
  });
  if (!code || !found) throw new Error('Code du fichier Google Drive requis');
  key = found.k;
  salt = blob.salt;
  iter = blob.iter;
  return { data: found.data, rekeyed: true };
}

/** Signature des données partagées (pour savoir si un envoi est nécessaire). */
export const dataSig = (s) => JSON.stringify([COLLECTIONS.map((c) => s[c]), s.meta]);

export const hasContent = (s) => s.students.length > 0 || s.evaluations.length > 0;

/** Fusion élément par élément : la version modifiée le plus récemment l'emporte ; suppressions propagées. */
export function mergeStates(local, remote) {
  remote = migrate(structuredClone(remote));
  const L = local.meta;
  const R = remote.meta;
  const out = structuredClone(local);
  out.meta = { stamps: { ...R.stamps }, deleted: { ...R.deleted } };
  for (const [k, v] of Object.entries(L.stamps)) out.meta.stamps[k] = Math.max(out.meta.stamps[k] || 0, v);
  for (const [k, v] of Object.entries(L.deleted)) out.meta.deleted[k] = Math.max(out.meta.deleted[k] || 0, v);
  for (const c of COLLECTIONS) {
    const lm = new Map(local[c].map((e) => [e.id, e]));
    const rm = new Map(remote[c].map((e) => [e.id, e]));
    const ids = [...rm.keys(), ...[...lm.keys()].filter((id) => !rm.has(id))];
    out[c] = [];
    for (const id of ids) {
      const k = `${c}:${id}`;
      const l = lm.get(id);
      const r = rm.get(id);
      const ls = L.stamps[k] || 0;
      const rs = R.stamps[k] || 0;
      const pick = !r ? l : !l ? r : ls >= rs ? l : r;
      const ps = !r ? ls : !l ? rs : Math.max(ls, rs);
      const del = out.meta.deleted[k] || 0;
      if (del && del >= ps) continue;
      delete out.meta.deleted[k];
      out[c].push(structuredClone(pick));
    }
  }
  for (const f of LOCAL_FIELDS) out[f] = local[f];
  return out;
}

/** Données du fichier distant prises telles quelles (en gardant les réglages propres à l'appareil). */
export function adoptRemote(remote) {
  const out = migrate(structuredClone(remote));
  for (const f of LOCAL_FIELDS) out[f] = state[f];
  return out;
}

/** Applique un état fusionné (sans le considérer comme une modification locale). */
export function applyMerged(next) {
  initState(next);
  return persistNow();
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

/** Compétences techniques (hors comportement). */
export const techCompetences = () => sortedCompetences().filter((c) => !c.behavior);
/** Compétence « Comportement face au travail » (ou null si supprimée). */
export const behaviorComp = () => state.competences.find((c) => c.behavior) || null;
const isBehaviorId = (id) => !!compById(id)?.behavior;

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
  const tech = evalTechScore(ev, sid);
  if (tech !== null || Object.keys(ev.selection).some((c) => !isBehaviorId(c))) return tech;
  return mean(Object.keys(ev.selection).map((c) => compScore(ev, sid, c)));
}

/** Moyenne des seules compétences techniques d'une évaluation (null si aucune). */
export function evalTechScore(ev, sid) {
  return mean(
    Object.keys(ev.selection)
      .filter((c) => !isBehaviorId(c))
      .map((c) => compScore(ev, sid, c)),
  );
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

/** Moyenne générale = moyenne des moyennes de compétences techniques (comportement exclu). */
export function globalAverage(sid, evals) {
  return mean(state.competences.filter((c) => !c.behavior).map((c) => compAverage(sid, c.id, evals)));
}

/** Moyenne « Comportement face au travail ». */
export function behaviorAverage(sid, evals) {
  const b = behaviorComp();
  return b ? compAverage(sid, b.id, evals) : null;
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
