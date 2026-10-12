// Formulaire « informations élève et entreprise », partagé par la page élève (eleve.html),
// le mode élève sur la tablette du professeur et la fiche PFMP du professeur.
import { STUDENT_FIELDS, COMPANY_FIELDS } from './pfmp-ref.js';
import { esc } from './util.js';

const field = (group, [key, label, type, required], value) => `
  <label class="field"><span>${esc(label)}${required ? ' *' : ''}</span>
    <input data-g="${group}" data-k="${key}" type="${type}" ${required ? 'data-req="1"' : ''}
      ${type === 'tel' ? 'inputmode="tel" autocomplete="tel"' : ''} ${type === 'email' ? 'autocomplete="email"' : ''}
      value="${esc(value ?? '')}"></label>`;

export function formHTML({ student = {}, company = {} } = {}) {
  return `
    <section class="card stack">
      <h2>L’élève</h2>
      <div class="grid2">${STUDENT_FIELDS.map((f) => field('student', f, student[f[0]])).join('')}</div>
    </section>
    <section class="card stack">
      <h2>L’entreprise d’accueil</h2>
      <div class="grid2">${COMPANY_FIELDS.map((f) => field('company', f, company[f[0]])).join('')}</div>
      <p class="muted small">* champs obligatoires</p>
    </section>`;
}

/** Lit les champs. */
export function collect(root) {
  const out = { student: {}, company: {} };
  root.querySelectorAll('input[data-g]').forEach((i) => {
    const v = i.value.trim();
    if (v) out[i.dataset.g][i.dataset.k] = v;
  });
  return out;
}

/** Renvoie la liste des champs obligatoires manquants (et les signale). */
export function missing(root) {
  const list = [];
  root.querySelectorAll('input[data-req]').forEach((i) => {
    const bad = !i.value.trim();
    i.classList.toggle('invalid', bad);
    if (bad) list.push(i.closest('label').querySelector('span').textContent.replace(' *', ''));
  });
  return list;
}
