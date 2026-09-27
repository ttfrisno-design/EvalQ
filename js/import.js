/* global XLSX */
import { state, save, uid } from './store.js';

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const cleanName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Lit un classeur Excel / CSV. Chaque onglet = une classe (nom de l'onglet).
 * Seules les deux premières colonnes (NOM, Prénom) sont importées :
 * aucune autre information personnelle n'est conservée.
 */
export async function parseStudentFile(file, fallbackClassId) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const result = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false, defval: '' });
    if (!rows.length) continue;
    // Ligne d'en-tête : contient "nom" ou "élève" en première colonne.
    let startRow = 0;
    const h = norm(rows[0][0]);
    if (h === 'nom' || h.startsWith('eleve') || h === 'noms') startRow = 1;
    const students = [];
    for (const r of rows.slice(startRow)) {
      const nom = cleanName(r[0]).toUpperCase();
      const prenom = cleanName(r[1]);
      if (!nom || !prenom) continue;
      students.push({ nom, prenom });
    }
    if (!students.length) continue;
    const isCsv = /\.csv$/i.test(file.name);
    const classId = isCsv ? fallbackClassId : cleanName(sheetName);
    result.push({ classId, students });
  }
  return result;
}

export function applyImport(groups) {
  let added = 0;
  let skipped = 0;
  for (const g of groups) {
    if (!state.classes.some((c) => c.id === g.classId)) {
      state.classes.push({ id: g.classId, name: g.classId });
    }
    for (const s of g.students) {
      const exists = state.students.some(
        (x) => x.classId === g.classId && norm(x.nom) === norm(s.nom) && norm(x.prenom) === norm(s.prenom),
      );
      if (exists) {
        skipped++;
        continue;
      }
      state.students.push({ id: uid(), classId: g.classId, nom: s.nom, prenom: s.prenom });
      added++;
    }
  }
  save();
  return { added, skipped };
}
