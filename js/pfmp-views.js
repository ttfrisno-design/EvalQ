// Écrans PFMP : liste, création, fiche (évaluation, attestation, signatures), mode élève, import.
import { state, save, studentById, studentsOf, fullName, classById, todayISO, isNum, fmt, checkCode, levelOf } from './store.js';
import { esc, $, $$, dateFR, toast, shareOrDownload, ICONS } from './util.js';
import { GROUPS, LEVELS, ATTITUDES, encodePayload, parseReply, companyAddress } from './pfmp-ref.js';
import { formHTML, collect, missing } from './pfmp-form.js';
import {
  pfmpById,
  pfmpsOf,
  newPfmp,
  savePfmp,
  deletePfmp,
  steps,
  STEP_LABELS,
  weeks,
  etab,
  pfmpCompScore,
  findCompany,
  rememberCompany,
  tutorSignatureFor,
  className,
} from './pfmp.js';
import { putMedia, getMedia, resizeImage } from './media.js';
import { openSignaturePad } from './sigpad.js';
import { openPin } from './lock.js';

const appBase = () => location.href.split('#')[0].replace(/index\.html$/, '');
const pill = (v) => `<span class="pill lv-${levelOf(v)?.key || 'none'}">${fmt(v)}</span>`;

function stepsHTML(p, compact = false) {
  const st = steps(p);
  return `<div class="steps ${compact ? 'compact' : ''}">${Object.entries(STEP_LABELS)
    .map(([k, l]) => `<span class="step ${st[k] ? 'done' : ''}" title="${esc(l)}"><span class="dot"></span>${compact ? '' : esc(l)}</span>`)
    .join('')}</div>`;
}

/** Affiche les images (signatures, cachets) dont la référence est dans data-media. */
async function fillImages(root) {
  for (const img of $$('img[data-media]', root)) {
    const url = await getMedia(JSON.parse(img.dataset.media));
    if (url) img.src = url;
    else img.replaceWith(Object.assign(document.createElement('span'), { className: 'muted small', textContent: 'Image en cours de synchronisation…' }));
  }
}
const imgTag = (ref, alt) => (ref ? `<img data-media='${esc(JSON.stringify(ref))}' alt="${esc(alt)}">` : '');

export function studentLink(p) {
  const s = studentById(p.studentId);
  return `${appBase()}eleve.html#${encodePayload({
    k: 'evalq-pfmp-req',
    p: p.id,
    n: fullName(s),
    c: className(p),
    num: p.numero,
    s: p.start,
    e: p.end,
    t: etab().teacherEmail || '',
  })}`;
}

async function shareStudentLink(p) {
  const s = studentById(p.studentId);
  const link = studentLink(p);
  const text = `Bonjour ${s.prenom},\nAvant ta PFMP, complète tes informations et celles de ton entreprise avec ce lien, puis renvoie-moi la fiche :\n${link}`;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: `Fiche PFMP – ${fullName(s)}`, text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Message et lien copiés : collez-les dans un message à l’élève (ENT, mail…)');
  } catch {
    prompt('Copiez ce lien et envoyez-le à l’élève :', link);
  }
}

// ======================================================================
// Liste
// ======================================================================

export function viewPfmpList(ctx) {
  const cid = state.currentClass;
  const list = pfmpsOf(cid);
  const groups = new Map();
  for (const p of list) {
    const k = `${p.numero}|${p.start}|${p.end}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  ctx.view.innerHTML = `
    <div class="page-head">
      <h1>PFMP · ${esc(classById(cid)?.name)}</h1>
      <a class="btn primary" href="#/pfmp/new">${ICONS.plus}Nouvelle PFMP</a>
    </div>
    <div class="row gap-s wrap">
      <button class="btn" data-act="paste">Importer la fiche d’un élève</button>
    </div>
    ${
      list.length
        ? [...groups.values()]
            .map((ps) => {
              const p0 = ps[0];
              return `<section class="stack">
              <div class="row between wrap gap-s"><h3 class="group-title">PFMP n° ${esc(p0.numero)} · du ${dateFR(p0.start)} au ${dateFR(p0.end)}</h3>
                <button class="btn small" data-links="${esc(ps.map((x) => x.id).join(','))}">Copier les liens élèves</button></div>
              <div class="list">${ps
                .sort((a, b) => studentById(a.studentId).nom.localeCompare(studentById(b.studentId).nom, 'fr'))
                .map((p) => {
                  const s = studentById(p.studentId);
                  return `<a class="card pfmp-card" href="#/pfmp/${p.id}">
                    <div class="grow"><div class="stu-name">${esc(s.nom)} ${esc(s.prenom)}</div>
                      <div class="muted small">${ICONS.entreprise} ${esc(p.company?.name || 'Entreprise non renseignée')}${p.company?.tutorName ? ' · ' + esc(p.company.tutorName) : ''}</div></div>
                    ${stepsHTML(p, true)}</a>`;
                })
                .join('')}</div></section>`;
            })
            .join('')
        : `<div class="card empty"><p>Aucune PFMP pour cette classe.</p><a class="btn primary" href="#/pfmp/new">${ICONS.plus}Créer une PFMP</a></div>`
    }
    <p class="muted small">Étapes : ${Object.values(STEP_LABELS).map(esc).join(' → ')}</p>`;

  ctx.view.onclick = async (e) => {
    if (e.target.closest('[data-act="paste"]')) return pasteReply(ctx);
    const l = e.target.closest('[data-links]');
    if (l) {
      const text = l.dataset.links
        .split(',')
        .map(pfmpById)
        .map((p) => `${fullName(studentById(p.studentId))} : ${studentLink(p)}`)
        .join('\n\n');
      try {
        await navigator.clipboard.writeText(text);
        toast('Liens copiés (un par élève)');
      } catch {
        prompt('Liens des élèves :', text);
      }
    }
  };
}

async function pasteReply(ctx) {
  const txt = prompt('Collez le lien ou le code reçu de l’élève :');
  if (!txt) return;
  try {
    importReply(ctx, parseReply(txt));
  } catch (e) {
    alert(e.message);
  }
}

/** Applique la réponse d'un élève (lien reçu par mail ou code collé). */
export function importReply(ctx, data) {
  const p = pfmpById(data.p);
  if (!p) {
    alert('Cette fiche ne correspond à aucune PFMP de cet appareil. Synchronisez vos données puis rouvrez le lien.');
    return ctx.go('#/pfmp');
  }
  const s = studentById(p.studentId);
  if (!confirm(`Importer la fiche de ${fullName(s)} ?\nEntreprise : ${data.company?.name || '?'}\nTuteur : ${data.company?.tutorName || '?'}`)) return ctx.go('#/pfmp/' + p.id);
  p.student = { ...p.student, ...(data.student || {}) };
  p.company = { ...p.company, ...(data.company || {}) };
  p.studentFilledAt = data.at || new Date().toISOString();
  savePfmp(p);
  toast('Fiche de l’élève importée');
  state.currentClass = p.classId;
  ctx.go('#/pfmp/' + p.id);
}

export function viewPfmpImport(ctx, code) {
  try {
    importReply(ctx, parseReply('pfmp-import/' + code));
  } catch (e) {
    alert(e.message);
    ctx.go('#/pfmp');
  }
}

// ======================================================================
// Création (une fiche par élève sélectionné)
// ======================================================================

export function viewPfmpNew(ctx) {
  const cid = state.currentClass;
  const students = studentsOf(cid);
  const last = pfmpsOf(cid)[0];
  ctx.view.innerHTML = `
    <div class="page-head"><a class="btn ghost icon" href="#/pfmp" aria-label="Retour">${ICONS.back}</a><h1>Nouvelle PFMP · ${esc(classById(cid)?.name)}</h1></div>
    <form id="f" class="stack">
      <section class="card stack">
        <div class="grid2">
          <label class="field"><span>N° de la PFMP (ex. 5/6)</span><input name="numero" required value="${esc(last ? '' : '')}" placeholder="5/6"></label>
          <label class="field"><span>Session de l’examen</span><input name="session" required value="${esc(last?.session || '')}" placeholder="2027"></label>
          <label class="field"><span>Début</span><input type="date" name="start" required></label>
          <label class="field"><span>Fin</span><input type="date" name="end" required></label>
        </div>
      </section>
      <section class="card stack">
        <div class="row between wrap gap-s"><h2>Élèves concernés</h2>
          <div class="row gap-s"><button type="button" class="btn small" data-all="1">Tous</button><button type="button" class="btn small" data-all="0">Aucun</button></div></div>
        <div class="student-picks">${students
          .map((s) => `<label class="check pick"><input type="checkbox" data-student="${s.id}" checked><span>${esc(fullName(s))}</span></label>`)
          .join('')}</div>
      </section>
      <div class="actions sticky-actions"><span class="spacer"></span><a class="btn" href="#/pfmp">Annuler</a><button class="btn primary">Créer les fiches</button></div>
    </form>`;
  ctx.view.onclick = (e) => {
    const a = e.target.closest('[data-all]');
    if (a) $$('[data-student]').forEach((i) => (i.checked = a.dataset.all === '1'));
  };
  $('#f').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.end.value < f.start.value) return alert('La date de fin est avant la date de début.');
    const ids = $$('[data-student]:checked').map((i) => i.dataset.student);
    if (!ids.length) return alert('Choisissez au moins un élève.');
    for (const sid of ids) {
      newPfmp({ classId: cid, studentId: sid, numero: f.numero.value.trim(), session: f.session.value.trim(), start: f.start.value, end: f.end.value });
    }
    save();
    toast(`${ids.length} fiche(s) PFMP créée(s)`);
    ctx.go('#/pfmp');
  };
}

// ======================================================================
// Fiche PFMP d'un élève
// ======================================================================

export function viewPfmp(ctx, p) {
  if (!p) return ctx.go('#/pfmp');
  const s = studentById(p.studentId);
  const c = p.company || {};
  const e = etab();
  const known = findCompany(c);
  const knownTutorSig = tutorSignatureFor(p);
  const lv = p.eval.levels;

  ctx.view.innerHTML = `
    <div class="page-head">
      <a class="btn ghost icon" href="#/pfmp" aria-label="Retour">${ICONS.back}</a>
      <div class="grow"><h1>${esc(fullName(s))}</h1>
        <div class="muted small">${esc(className(p))} · PFMP n° ${esc(p.numero)} · du ${dateFR(p.start)} au ${dateFR(p.end)} · session ${esc(p.session)}</div></div>
      <button class="btn ghost icon danger" data-act="delete" aria-label="Supprimer">${ICONS.trash}</button>
    </div>
    ${stepsHTML(p)}

    <section class="card stack">
      <h2>1. Informations élève et entreprise</h2>
      <p class="small ${p.studentFilledAt ? '' : 'muted'}">${
        p.studentFilledAt ? `✔ Complétée par l’élève le ${new Date(p.studentFilledAt).toLocaleDateString('fr-FR')}.` : 'À compléter par l’élève avant la PFMP.'
      }</p>
      <div class="row gap-s wrap">
        <button class="btn" data-act="link">Envoyer le lien à l’élève</button>
        <button class="btn" data-act="kiosk">Mode élève sur cet appareil</button>
        <button class="btn ghost" data-act="paste">Importer sa réponse</button>
      </div>
      <details ${steps(p).infos ? '' : 'open'}><summary>Voir / modifier les informations</summary>
        <div id="infoForm" class="stack" style="margin-top:10px">${formHTML(p)}</div></details>
    </section>

    <section class="card stack">
      <h2>2. Évaluation (visite en entreprise)</h2>
      <p class="muted small">Évaluez avec le tuteur les compétences observées (pas forcément toutes). Toucher de nouveau un niveau l’efface.
        Conversion pour le suivi : - 0 · + 4 · ++ 7 · +++ 10.</p>
      <label class="field" style="max-width:240px"><span>Date de la visite</span><input type="date" data-f="visitDate" value="${esc(p.eval.visitDate)}"></label>
      ${GROUPS.map(
        (g) => `<div class="pf-group">
          <h3>${esc(g.label)}</h3>
          <div class="pf-tasks">${g.tasks
            .map(([id, label]) => `<label class="check small"><input type="checkbox" data-task="${id}" ${p.eval.tasks[id] ? 'checked' : ''}><span>${esc(label)}</span></label>`)
            .join('')}</div>
          ${g.comps
            .map((pc) => {
              const any = pc.criteres.some((k) => lv[k.id] != null);
              return `<details class="pf-comp" ${any ? 'open' : ''}>
                <summary><span class="grow">${esc(pc.label)}</span><span data-pcavg="${pc.id}">${pill(pfmpCompScore(p, pc))}</span></summary>
                ${pc.criteres
                  .map(
                    (k) => `<div class="pf-crit"><div class="pf-crit-label">${esc(k.label)}</div>
                    <div class="lv4" data-crit="${k.id}" data-pc="${pc.id}">${LEVELS.map(
                      (L, i) => `<button type="button" data-l="${i}" class="l${i} ${lv[k.id] === i ? 'on' : ''}" title="${esc(L.text)}">${esc(L.label)}</button>`,
                    ).join('')}</div></div>`,
                  )
                  .join('')}
              </details>`;
            })
            .join('')}
        </div>`,
      ).join('')}
      <div class="lv-legend small muted">${LEVELS.map((L) => `<b>${esc(L.label)}</b> ${esc(L.text)}`).join(' · ')}</div>

      <h3>Attitudes professionnelles</h3>
      ${ATTITUDES.map(
        (a) => `<div class="att"><div class="att-label"><b>${a.id}</b> ${esc(a.label)}</div>
          <div class="att-options" data-att="${a.id}">${a.options
            .map((o, i) => `<button type="button" data-o="${i}" class="${p.eval.attitudes[a.id] === i ? 'on' : ''}">${esc(o)}</button>`)
            .join('')}</div></div>`,
      ).join('')}
      <label class="field"><span>Synthèse</span><textarea data-f="synthese" rows="4" placeholder="Synthèse de la période en entreprise…">${esc(p.eval.synthese)}</textarea></label>
    </section>

    <section class="card stack">
      <h2>3. Attestation de PFMP</h2>
      <p class="small">Du ${dateFR(p.start)} au ${dateFR(p.end)}, soit ${weeks(p) ?? '?'} semaine(s).
        Entreprise : <b>${esc(c.name || '—')}</b>, représentée par ${esc(c.repName || '—')}${c.repFunction ? ' (' + esc(c.repFunction) + ')' : ''}.</p>
      <div class="grid2">
        <label class="field"><span>Nombre de jours effectivement travaillés (attesté par le tuteur)</span>
          <input type="number" inputmode="numeric" min="0" max="200" data-f="days" value="${isNum(p.days) ? p.days : ''}"></label>
        <label class="field"><span>Date de l’attestation</span><input type="date" data-f="attestDate" value="${esc(p.attestDate || p.end || '')}"></label>
      </div>
    </section>

    <section class="card stack">
      <h2>4. Signatures et cachet</h2>
      <p class="muted small">La signature du tuteur et le cachet servent à la fois pour la fiche d’évaluation et pour l’attestation.</p>
      <div class="sig-grid">
        <div class="sig-tile"><h3>Professeur</h3><div class="sig-img">${imgTag(p.signatures.teacher, 'Signature du professeur')}</div>
          <div class="row gap-s wrap">
            ${e.teacherSignature ? `<button class="btn small primary" data-act="teacherSaved">Apposer ma signature</button>` : ''}
            <button class="btn small" data-act="teacherSign">Signer</button>
            ${p.signatures.teacher ? `<button class="btn small ghost" data-clear="teacher">Effacer</button>` : ''}</div></div>
        <div class="sig-tile"><h3>Tuteur ${c.tutorName ? '· ' + esc(c.tutorName) : ''}</h3><div class="sig-img">${imgTag(p.signatures.tutor, 'Signature du tuteur')}</div>
          <div class="row gap-s wrap">
            <button class="btn small primary" data-act="tutorSign">Faire signer le tuteur</button>
            ${knownTutorSig && knownTutorSig.id !== p.signatures.tutor?.id ? `<button class="btn small" data-act="tutorReuse">Réutiliser sa signature</button>` : ''}
            ${p.signatures.tutor ? `<button class="btn small ghost" data-clear="tutor">Effacer</button>` : ''}</div></div>
        <div class="sig-tile"><h3>Cachet de l’entreprise</h3><div class="sig-img">${imgTag(p.stamp, 'Cachet')}</div>
          <div class="row gap-s wrap">
            <label class="btn small primary">Photographier le cachet<input type="file" accept="image/*" capture="environment" data-act="stamp" hidden></label>
            ${known?.stamp && known.stamp.id !== p.stamp?.id ? `<button class="btn small" data-act="stampReuse">Réutiliser le cachet de ${esc(known.name)}</button>` : ''}
            ${p.stamp ? `<button class="btn small ghost" data-clear="stamp">Effacer</button>` : ''}</div></div>
      </div>
    </section>

    <section class="card stack">
      <h2>5. Document PDF</h2>
      <p class="small">${p.sentAt ? `✔ Envoyé au service des PFMP le ${new Date(p.sentAt).toLocaleDateString('fr-FR')}.` : 'Fiche d’évaluation + attestation, à transmettre au service des PFMP.'}
        ${e.pfmpEmail ? `Destinataire : <b>${esc(e.pfmpEmail)}</b>` : '<br><span class="muted">Adresse du service des PFMP : à renseigner dans Réglages.</span>'}</p>
      <div class="row gap-s wrap">
        <button class="btn primary" data-act="send">${ICONS.pdf}Envoyer au service des PFMP</button>
        <button class="btn" data-act="pdf">${ICONS.pdf}Télécharger le PDF</button>
      </div>
    </section>`;

  fillImages(ctx.view);
  const form = $('#infoForm');

  const persist = () => savePfmp(p);

  ctx.view.oninput = (ev) => {
    if (form.contains(ev.target)) {
      const d = collect(form);
      p.student = d.student;
      p.company = d.company;
      persist();
      return;
    }
    const f = ev.target.dataset.f;
    if (!f) return;
    if (f === 'days') p.days = ev.target.value === '' ? null : Math.max(0, parseInt(ev.target.value, 10));
    else if (f === 'visitDate' || f === 'synthese') p.eval[f] = ev.target.value;
    else p[f] = ev.target.value;
    persist();
  };

  ctx.view.onchange = async (ev) => {
    const t = ev.target;
    if (t.dataset.task) {
      if (t.checked) p.eval.tasks[t.dataset.task] = true;
      else delete p.eval.tasks[t.dataset.task];
      persist();
    }
    if (t.dataset.act === 'stamp' && t.files[0]) {
      try {
        p.stamp = await putMedia(await resizeImage(t.files[0]));
        rememberCompany(p);
        persist();
        toast('Cachet enregistré');
      } catch (err) {
        alert(err.message);
      }
      ctx.render();
    }
  };

  ctx.view.onclick = async (ev) => {
    const lb = ev.target.closest('.lv4 [data-l]');
    if (lb) {
      const box = lb.parentElement;
      const id = box.dataset.crit;
      const l = +lb.dataset.l;
      if (p.eval.levels[id] === l) delete p.eval.levels[id];
      else p.eval.levels[id] = l;
      persist();
      $$('button', box).forEach((b) => b.classList.toggle('on', +b.dataset.l === p.eval.levels[id]));
      const pc = GROUPS.flatMap((g) => g.comps).find((x) => x.id === box.dataset.pc);
      $(`[data-pcavg="${pc.id}"]`).innerHTML = pill(pfmpCompScore(p, pc));
      return;
    }
    const ob = ev.target.closest('.att-options [data-o]');
    if (ob) {
      const id = ob.parentElement.dataset.att;
      const o = +ob.dataset.o;
      if (p.eval.attitudes[id] === o) delete p.eval.attitudes[id];
      else p.eval.attitudes[id] = o;
      persist();
      $$('button', ob.parentElement).forEach((b) => b.classList.toggle('on', +b.dataset.o === p.eval.attitudes[id]));
      return;
    }
    const clr = ev.target.closest('[data-clear]')?.dataset.clear;
    if (clr) {
      if (!confirm('Effacer ?')) return;
      if (clr === 'stamp') p.stamp = null;
      else p.signatures[clr] = null;
      persist();
      return ctx.render();
    }
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (!act || act === 'stamp') return;
    if (act === 'delete') {
      if (!confirm(`Supprimer la fiche PFMP de ${fullName(s)} ?`)) return;
      deletePfmp(p.id);
      return ctx.go('#/pfmp');
    }
    if (act === 'link') return shareStudentLink(p);
    if (act === 'paste') return pasteReply(ctx);
    if (act === 'kiosk') return kiosk(ctx, p);
    if (act === 'teacherSaved') {
      p.signatures.teacher = e.teacherSignature;
      if (!p.eval.visitDate) p.eval.visitDate = todayISO();
      persist();
      return ctx.render();
    }
    if (act === 'teacherSign') {
      const url = await openSignaturePad('Signature du professeur', e.teacherName || '');
      if (!url) return;
      p.signatures.teacher = await putMedia(url);
      if (!e.teacherSignature && confirm('Enregistrer cette signature pour la réutiliser sur les prochaines fiches ?')) {
        e.teacherSignature = p.signatures.teacher;
      }
      persist();
      return ctx.render();
    }
    if (act === 'tutorSign') {
      const url = await openSignaturePad('Signature du tuteur', [c.tutorName, c.name].filter(Boolean).join(' – '));
      if (!url) return;
      p.signatures.tutor = await putMedia(url);
      rememberCompany(p);
      persist();
      return ctx.render();
    }
    if (act === 'tutorReuse') {
      p.signatures.tutor = knownTutorSig;
      persist();
      return ctx.render();
    }
    if (act === 'stampReuse') {
      p.stamp = known.stamp;
      persist();
      return ctx.render();
    }
    if (act === 'pdf' || act === 'send') {
      const st = steps(p);
      const todo = ['infos', 'evaluation', 'attestation', 'signatures'].filter((k) => !st[k]).map((k) => STEP_LABELS[k]);
      if (todo.length && !confirm(`Incomplet : ${todo.join(', ')}.\nGénérer le PDF quand même ?`)) return;
      await ctx.withBusy(async () => {
        const { pfmpPDF } = await import('./pfmp-pdf.js');
        const { blob, filename } = await pfmpPDF(p);
        if (act === 'pdf') return shareOrDownload(blob, filename, 'application/pdf');
        if (await sendToService(p, blob, filename)) {
          p.sentAt = new Date().toISOString();
          persist();
          toast('Envoi enregistré');
        }
      });
      return ctx.render();
    }
  };
}

/** Envoi du PDF au service des PFMP : partage (pièce jointe) si possible, sinon téléchargement + e-mail. */
async function sendToService(p, blob, filename) {
  const s = studentById(p.studentId);
  const e = etab();
  const subject = `PFMP ${p.numero} – ${fullName(s)} – ${className(p)}`;
  const text =
    `Bonjour,\n\nVeuillez trouver ci-joint la fiche d’évaluation et l’attestation de PFMP de ${fullName(s)} (${className(p)}), ` +
    `effectuée chez ${p.company?.name || '…'} du ${dateFR(p.start)} au ${dateFR(p.end)}` +
    `${isNum(p.days) ? `, soit ${p.days} jour(s) effectif(s)` : ''}.\n\nCordialement,\n${e.teacherName || ''}`;
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: subject, text });
      return true;
    } catch (err) {
      if (err.name === 'AbortError') return false;
    }
  }
  await shareOrDownload(blob, filename, 'application/pdf');
  const mail = `mailto:${encodeURIComponent(e.pfmpEmail || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
    text + `\n\n(Joindre le fichier ${filename} qui vient d’être téléchargé.)`,
  )}`;
  window.location.href = mail;
  return confirm(`Le PDF a été téléchargé et un e-mail a été préparé.\nJoignez-y le fichier « ${filename} », puis envoyez-le.\n\nMarquer la fiche comme envoyée ?`);
}

// ======================================================================
// Mode élève sur l'appareil du professeur
// ======================================================================

function kiosk(ctx, p) {
  const s = studentById(p.studentId);
  const el = document.createElement('div');
  el.className = 'kiosk';
  document.body.appendChild(el);
  document.body.classList.add('kiosk-on');
  const exit = async () => {
    const ok = await openPin({
      title: 'Code du professeur',
      subtitle: 'Saisissez votre code pour revenir à l’application.',
      cancelLabel: 'Annuler',
      onSubmit: async (code) => ((await checkCode(code)) ? true : 'Code incorrect'),
    });
    if (!ok) return;
    el.remove();
    document.body.classList.remove('kiosk-on');
    ctx.render();
  };
  const showForm = () => {
    el.innerHTML = `<div class="container">
      <div class="card stack"><h1>${esc(fullName(s))}</h1>
        <p class="muted">PFMP n° ${esc(p.numero)} · du ${dateFR(p.start)} au ${dateFR(p.end)}</p>
        <p class="small">Complète tes informations et celles de l’entreprise qui t’accueille, puis valide.</p></div>
      <form id="kf" class="stack">${formHTML(p)}
        <div class="actions sticky-actions no-tabbar"><button type="button" class="btn ghost" data-k="exit">Professeur</button><span class="spacer"></span>
          <button class="btn primary">Valider ma fiche</button></div></form></div>`;
    const f = $('#kf', el);
    f.onsubmit = (ev) => {
      ev.preventDefault();
      const miss = missing(f);
      if (miss.length) return alert('À compléter : ' + miss.join(', '));
      const d = collect(f);
      p.student = { ...p.student, ...d.student };
      p.company = { ...p.company, ...d.company };
      p.studentFilledAt = new Date().toISOString();
      savePfmp(p);
      el.innerHTML = `<div class="container"><div class="card empty stack"><h1>Merci ${esc(s.prenom)} ✔</h1>
        <p>Ta fiche est enregistrée. Rends l’appareil à ton professeur.</p>
        <button class="btn" data-k="edit">Modifier ma fiche</button>
        <button class="btn primary" data-k="exit">Professeur : revenir à l’application</button></div></div>`;
    };
  };
  el.onclick = (ev) => {
    const k = ev.target.closest('[data-k]')?.dataset.k;
    if (k === 'exit') exit();
    if (k === 'edit') showForm();
  };
  showForm();
}

// ======================================================================
// Réglages : établissement, adresses, signature du professeur
// ======================================================================

export function etabSectionHTML() {
  const e = etab();
  const f = (k, label, type = 'text', ph = '') =>
    `<label class="field"><span>${esc(label)}</span><input data-etab="${k}" type="${type}" value="${esc(e[k] || '')}" placeholder="${esc(ph)}"></label>`;
  return `<section class="card stack" id="etabCard">
    <h2>${ICONS.entreprise} Établissement et PFMP</h2>
    <div class="grid2">
      ${f('schoolName', 'Nom de l’établissement')}
      ${f('schoolAddress', 'Adresse de l’établissement')}
      ${f('headName', 'Chef d’établissement')}
      ${f('headTitle', 'En qualité de')}
      ${f('teacherName', 'Votre nom (professeur)')}
      ${f('teacherEmail', 'Votre e-mail (réponses des élèves)', 'email')}
      ${f('pfmpEmail', 'E-mail du service des PFMP', 'email')}
    </div>
    <div class="sig-tile"><h3>Ma signature (réutilisée sur les fiches PFMP)</h3><div class="sig-img">${imgTag(e.teacherSignature, 'Ma signature')}</div>
      <div class="row gap-s"><button class="btn small" data-etabsig="1">${e.teacherSignature ? 'Refaire ma signature' : 'Enregistrer ma signature'}</button></div></div>
  </section>`;
}

export function wireEtabSection(ctx) {
  const card = $('#etabCard');
  if (!card) return;
  fillImages(card);
  card.oninput = (ev) => {
    const k = ev.target.dataset.etab;
    if (!k) return;
    etab()[k] = ev.target.value.trim();
    save();
  };
  card.onclick = async (ev) => {
    if (!ev.target.closest('[data-etabsig]')) return;
    const url = await openSignaturePad('Ma signature', etab().teacherName || '');
    if (!url) return;
    etab().teacherSignature = await putMedia(url);
    save();
    ctx.render();
  };
}

export { companyAddress };
