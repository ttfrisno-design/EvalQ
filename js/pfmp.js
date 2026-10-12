// Données des PFMP : création, état d'avancement, lien avec le suivi des compétences.
import { state, save, uid, studentById, classById, mean, isNum } from './store.js';
import { ALL_COMPS, LEVELS, companyAddress } from './pfmp-ref.js';

export const pfmpById = (id) => state.pfmps.find((p) => p.id === id);
export const etab = () => state.prefs.find((p) => p.id === 'etab');

export function pfmpsOf(classId) {
  return state.pfmps
    .filter((p) => p.classId === classId && studentById(p.studentId))
    .sort((a, b) => b.start.localeCompare(a.start) || studentById(a.studentId).nom.localeCompare(studentById(b.studentId).nom, 'fr'));
}

export function newPfmp({ classId, studentId, numero, session, start, end }) {
  const p = {
    id: uid(),
    classId,
    studentId,
    numero,
    session,
    start,
    end,
    student: {},
    company: {},
    eval: { tasks: {}, levels: {}, attitudes: {}, synthese: '', visitDate: '' },
    days: null,
    attestDate: '',
    signatures: { teacher: null, tutor: null },
    stamp: null,
    studentFilledAt: null,
    sentAt: null,
  };
  // Reprise des informations de la PFMP précédente de l'élève (date de naissance, téléphone…)
  const prev = state.pfmps.filter((x) => x.studentId === studentId).sort((a, b) => b.start.localeCompare(a.start))[0];
  if (prev) p.student = { ...prev.student };
  state.pfmps.push(p);
  return p;
}

/** Nombre de semaines entre deux dates (arrondi). */
export function weeks(p) {
  if (!p.start || !p.end) return null;
  const d = (new Date(p.end) - new Date(p.start)) / 864e5 + 1;
  return Math.max(1, Math.round(d / 7));
}

/** Étapes : infos, évaluation, attestation, signatures, envoi. */
export function steps(p) {
  const c = p.company || {};
  return {
    infos: !!(c.name && c.tutorName && p.student?.birthDate),
    evaluation: Object.keys(p.eval.levels).length > 0 || Object.keys(p.eval.attitudes).length > 0,
    attestation: isNum(p.days),
    signatures: !!(p.signatures.teacher && p.signatures.tutor && p.stamp),
    sent: !!p.sentAt,
  };
}

export const STEP_LABELS = {
  infos: 'Infos élève / entreprise',
  evaluation: 'Évaluation',
  attestation: 'Attestation',
  signatures: 'Signatures & cachet',
  sent: 'Envoyé',
};

/** Note /10 d'une compétence de la fiche (moyenne des critères évalués). */
export function pfmpCompScore(p, pc) {
  return mean(pc.criteres.map((k) => p.eval.levels[k.id]).filter((l) => l != null).map((l) => LEVELS[l].value));
}

/**
 * Crée / met à jour l'évaluation « entreprise » correspondante dans le suivi des compétences
 * (critères notés : - 0 · + 4 · ++ 7 · +++ 10).
 */
export function syncPfmpEval(p) {
  const id = 'pfmp-' + p.id;
  const i = state.evaluations.findIndex((e) => e.id === id);
  const selection = {};
  const notes = {};
  for (const pc of ALL_COMPS) {
    for (const k of pc.criteres) {
      const l = p.eval.levels[k.id];
      if (l == null) continue;
      (selection[pc.comp] ||= []).push(k.id);
      notes[k.id] = LEVELS[l].value;
    }
  }
  if (!Object.keys(selection).length) {
    if (i >= 0) state.evaluations.splice(i, 1);
    return;
  }
  const ev = {
    id,
    source: 'pfmp',
    pfmpId: p.id,
    title: `PFMP ${p.numero || ''} – ${p.company?.name || 'entreprise'}`.replace('  ', ' '),
    date: p.eval.visitDate || p.end || p.start,
    classId: p.classId,
    type: 'entreprise',
    place: 'PFMP',
    selection,
    students: [p.studentId],
    notes: { [p.studentId]: notes },
    absent: {},
    comments: p.eval.synthese ? { [p.studentId]: p.eval.synthese } : {},
    companies: { [p.studentId]: p.company?.name || '' },
  };
  if (i >= 0) state.evaluations[i] = ev;
  else state.evaluations.push(ev);
}

export function savePfmp(p) {
  syncPfmpEval(p);
  save();
}

export function deletePfmp(id) {
  state.pfmps = state.pfmps.filter((p) => p.id !== id);
  state.evaluations = state.evaluations.filter((e) => e.id !== 'pfmp-' + id);
  save();
}

// ---------- Annuaire des entreprises (réutilisation du cachet) ----------

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\W+/g, '').toLowerCase();

export function findCompany(c) {
  if (!c?.name) return null;
  return (
    state.companies.find((x) => c.siret && x.siret && norm(x.siret) === norm(c.siret)) ||
    state.companies.find((x) => norm(x.name) === norm(c.name) && (!x.city || !c.city || norm(x.city) === norm(c.city))) ||
    null
  );
}

/** Enregistre / met à jour l'entreprise dans l'annuaire (avec son cachet et la signature du tuteur). */
export function rememberCompany(p) {
  const c = p.company;
  if (!c?.name) return;
  let x = findCompany(c);
  if (!x) {
    x = { id: uid() };
    state.companies.push(x);
  }
  Object.assign(x, { name: c.name, siret: c.siret || '', city: c.city || '', address: companyAddress(c) });
  if (p.stamp) x.stamp = p.stamp;
  if (p.signatures.tutor && c.tutorName) {
    x.tutors ||= {};
    x.tutors[norm(c.tutorName)] = p.signatures.tutor;
  }
}

/** Références d'images utilisées (pour la synchronisation). */
export function mediaRefs() {
  const refs = [];
  for (const p of state.pfmps) refs.push(p.stamp, p.signatures.teacher, p.signatures.tutor);
  for (const c of state.companies) refs.push(c.stamp, ...Object.values(c.tutors || {}));
  refs.push(etab()?.teacherSignature);
  const seen = new Set();
  return refs.filter((r) => r?.id && !seen.has(r.id) && seen.add(r.id));
}

export const tutorSignatureFor = (p) => {
  const x = findCompany(p.company);
  return x?.tutors?.[norm(p.company?.tutorName)] || null;
};

export const className = (p) => classById(p.classId)?.name || p.classId;
