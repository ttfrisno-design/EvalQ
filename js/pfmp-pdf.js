// PDF « Fiche d'évaluation de l'apprenant en entreprise » + « Attestation de PFMP ».
import { studentById, fullName } from './store.js';
import { GROUPS, LEVELS, ATTITUDES, companyAddress } from './pfmp-ref.js';
import { etab, weeks, className } from './pfmp.js';
import { getMedia } from './media.js';

const clean = (s) =>
  String(s ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[^\x00-\xFF]/g, '');

const dateFR = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '');
const ORANGE = [247, 203, 172];
const ORANGE_LIGHT = [252, 228, 214];
const RED = [200, 16, 46];
const DARK = [30, 41, 59];

function imgSize(url) {
  return new Promise((resolve) => {
    const i = new Image();
    i.onload = () => resolve({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => resolve(null);
    i.src = url;
  });
}

/** Place une image dans un cadre en conservant ses proportions. */
async function drawImage(doc, url, x, y, w, h) {
  if (!url) return;
  const s = await imgSize(url);
  if (!s) return;
  const r = Math.min(w / s.w, h / s.h);
  const iw = s.w * r;
  const ih = s.h * r;
  doc.addImage(url, url.startsWith('data:image/png') ? 'PNG' : 'JPEG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

export async function pfmpPDF(p) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const s = studentById(p.studentId);
  const e = etab();
  const c = p.company || {};
  const [stampUrl, tutorUrl, teacherUrl] = await Promise.all([getMedia(p.stamp), getMedia(p.signatures.tutor), getMedia(p.signatures.teacher)]);
  const period = `Du ${dateFR(p.start)} au ${dateFR(p.end)}`;

  // ---------- Page 1 : couverture ----------
  doc.setDrawColor(150);
  doc.roundedRect(30, 12, 150, 22, 2, 2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...RED);
  doc.text(clean(e.schoolName), W / 2, 22, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60);
  doc.text(clean(e.schoolAddress), W / 2, 28, { align: 'center' });

  doc.setFillColor(...ORANGE_LIGHT);
  doc.setDrawColor(120);
  doc.rect(25, 44, 160, 40, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...RED);
  doc.text('B A C   P R O   M E L E C', W / 2, 60, { align: 'center' });
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(13);
  doc.setTextColor(20);
  doc.text(clean('Métiers de l’Électricité et de ses Environnements Connectés'), W / 2, 72, { align: 'center' });

  doc.setLineDashPattern([2, 1.5], 0);
  doc.setFillColor(...ORANGE_LIGHT);
  doc.rect(25, 92, 160, 78, 'FD');
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('EPREUVE E3', W / 2, 106, { align: 'center' });
  doc.line(W / 2 - 22, 107.5, W / 2 + 22, 107.5);
  doc.setFontSize(13);
  doc.text(clean('FICHE D’ÉVALUATION DE L’APPRENANT EN'), W / 2, 120, { align: 'center' });
  doc.text('ENTREPRISE', W / 2, 127, { align: 'center' });
  doc.setFontSize(14);
  doc.text(clean(`N° : ${p.numero || ''}`), W / 2, 139, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(clean('Date de la période de formation'), W / 2, 150, { align: 'center' });
  doc.setFontSize(14);
  doc.text(clean(period), W / 2, 160, { align: 'center' });

  doc.autoTable({
    startY: 180,
    margin: { left: 45, right: 45 },
    head: [[{ content: 'CANDIDAT', colSpan: 2, styles: { halign: 'center' } }]],
    body: [
      ['Nom :', s?.nom || ''],
      ['Prénom :', s?.prenom || ''],
      ['Classe :', className(p)],
      ['Session :', p.session || ''],
    ].map((r) => r.map(clean)),
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 2 },
    headStyles: { fillColor: ORANGE_LIGHT, textColor: 20 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 } },
  });
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    margin: { left: 45, right: 45 },
    head: [[{ content: 'ENTREPRISE D’ACCUEIL', colSpan: 2, styles: { halign: 'center' } }].map((h) => ({ ...h, content: clean(h.content) }))],
    body: [
      ['Entreprise :', c.name || ''],
      ['Adresse :', companyAddress(c)],
      ['Tuteur :', [c.tutorName, c.tutorFunction].filter(Boolean).join(' - ')],
      ['Contact :', [c.tutorPhone, c.tutorEmail].filter(Boolean).join(' - ')],
    ].map((r) => r.map(clean)),
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 1.8 },
    headStyles: { fillColor: ORANGE_LIGHT, textColor: 20 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 } },
  });

  // ---------- Pages 2-3 : évaluation des compétences ----------
  doc.addPage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20);
  doc.text(clean('Évaluation des compétences acquises en P.F.M.P.'), W / 2, 14, { align: 'center' });
  doc.line(W / 2 - 58, 15.5, W / 2 + 58, 15.5);

  const body = [];
  const kinds = [];
  for (const g of GROUPS) {
    const tasks = g.tasks.map(([id, label]) => `${p.eval.tasks[id] ? '[X]' : '[  ]'} ${label}`).join('\n');
    body.push([{ content: clean(`${g.label}\n${tasks}`), colSpan: 5 }]);
    kinds.push({ t: 'group' });
    for (const pc of g.comps) {
      body.push([{ content: clean(pc.label), colSpan: 5 }]);
      kinds.push({ t: 'comp' });
      for (const k of pc.criteres) {
        const l = p.eval.levels[k.id];
        body.push([clean(k.label), ...LEVELS.map((_, i) => (l === i ? 'X' : ''))]);
        kinds.push({ t: 'crit' });
      }
    }
  }
  doc.autoTable({
    startY: 20,
    head: [[clean('CRITÈRES D’ÉVALUATION'), '-', '+', '++', '+++']],
    body,
    theme: 'grid',
    margin: { left: 12, right: 12, top: 14, bottom: 14 },
    styles: { fontSize: 7.6, cellPadding: 1.1, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: 20 },
    headStyles: { fillColor: [255, 255, 255], textColor: 20, fontStyle: 'bold', halign: 'center' },
    columnStyles: { 1: { cellWidth: 9, halign: 'center' }, 2: { cellWidth: 9, halign: 'center' }, 3: { cellWidth: 9, halign: 'center' }, 4: { cellWidth: 10, halign: 'center' } },
    didParseCell(d) {
      if (d.section !== 'body') return;
      const k = kinds[d.row.index];
      if (k.t === 'group') {
        d.cell.styles.fillColor = [241, 245, 249];
        d.cell.styles.fontSize = 7;
      }
      if (k.t === 'comp') {
        d.cell.styles.fillColor = ORANGE;
        d.cell.styles.fontStyle = 'bold';
      }
      if (k.t === 'crit' && d.column.index > 0 && d.cell.raw === 'X') d.cell.styles.fontStyle = 'bold';
    },
  });

  let y = doc.lastAutoTable.finalY + 4;
  const need = (h) => {
    if (y + h > H - 12) {
      doc.addPage();
      y = 14;
    }
  };
  need(10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(clean('-  : Pas de réussite ou non fait        + : Réussite partielle        ++ : Réussite totale avec aide        +++ : Réussite totale en autonomie'), 12, y);
  y += 6;

  need(50);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(clean('Évaluation des attitudes professionnelles'), 12, y + 2);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(clean('(une seule case par aptitude évaluée)'), W - 12, y + 2, { align: 'right' });
  doc.autoTable({
    startY: y + 4,
    body: ATTITUDES.map((a) => [`${a.id}\n${a.label}`, ...a.options.map((o, i) => `${p.eval.attitudes[a.id] === i ? '[X] ' : ''}${o}`)].map(clean)),
    theme: 'grid',
    margin: { left: 12, right: 12 },
    styles: { fontSize: 7, cellPadding: 1.2, lineColor: [90, 90, 90], lineWidth: 0.15, textColor: 20, valign: 'middle' },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30, fillColor: ORANGE_LIGHT } },
    didParseCell(d) {
      const a = ATTITUDES[d.row.index];
      if (d.column.index > 0 && p.eval.attitudes[a.id] === d.column.index - 1) {
        d.cell.styles.fillColor = ORANGE;
        d.cell.styles.fontStyle = 'bold';
      }
    },
  });
  y = doc.lastAutoTable.finalY + 5;

  // Synthèse
  const synth = doc.splitTextToSize(clean(p.eval.synthese || ''), W - 30);
  const synthH = Math.max(22, synth.length * 3.8 + 10);
  need(synthH + 52);
  doc.setLineDashPattern([1.5, 1], 0);
  doc.rect(12, y, W - 24, synthH);
  doc.setLineDashPattern([], 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(clean('Synthèse :'), 15, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(synth, 15, y + 10);
  y += synthH + 5;

  // Signatures
  const bw = (W - 30) / 2;
  doc.roundedRect(12, y, bw, 46, 3, 3);
  doc.roundedRect(18 + bw, y, bw, 46, 3, 3);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text(clean('Date de la visite et signature professeur'), 12 + bw / 2, y + 5, { align: 'center' });
  doc.text(clean('Cachet de l’entreprise et signature tuteur'), 18 + bw + bw / 2, y + 5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.text(clean(`${p.eval.visitDate ? 'Visite du ' + dateFR(p.eval.visitDate) : ''}${e.teacherName ? ' - ' + e.teacherName : ''}`), 12 + bw / 2, y + 10, { align: 'center' });
  await drawImage(doc, teacherUrl, 16, y + 12, bw - 8, 32);
  await drawImage(doc, stampUrl, 20 + bw, y + 8, bw / 2 - 2, 36);
  await drawImage(doc, tutorUrl, 18 + bw + bw / 2, y + 12, bw / 2 - 4, 30);
  doc.setFontSize(7.5);
  doc.text(clean(c.tutorName || ''), 18 + bw + bw * 0.75, y + 44, { align: 'center' });

  // ---------- Page 4 : attestation ----------
  doc.addPage();
  doc.setFillColor(...ORANGE);
  doc.setDrawColor(120);
  doc.rect(20, 12, W - 40, 12, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(clean(`ATTESTATION DE SUIVI DE PFMP - N°${p.numero || ''}`), W / 2, 20, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(20);
  doc.text('ATTESTATION DE PFMP', W / 2, 40, { align: 'center' });
  doc.setFontSize(8.5);
  doc.setTextColor(70);
  doc.text(
    doc.splitTextToSize(
      clean(
        "Conformément à l'article D. 124-9 du code de l'éducation, une attestation de stage est délivrée par l'organisme d'accueil à tout élève. " +
          "Ce document doit être complété et signé le dernier jour de la période de formation en milieu professionnel par une personne habilitée de l'organisme d'accueil et remis au stagiaire.",
      ),
      W - 50,
    ),
    25,
    48,
  );
  doc.setTextColor(20);
  let ay = 66;
  const line = (label, value, x = 32, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(10.5);
    doc.text(clean(label), x, ay);
    doc.setFont('helvetica', 'normal');
    if (value) doc.text(clean(value), x + doc.getTextWidth(clean(label)) + 2, ay);
  };
  const title = (t) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(clean(t), 20, ay);
    ay += 8;
  };
  title('L’entreprise :');
  line('Nom :', c.name);
  ay += 7;
  line('Adresse :', companyAddress(c));
  ay += 7;
  line('Représenté(e) par :', c.repName);
  ay += 7;
  line('Fonction :', c.repFunction);
  ay += 9;
  title('Atteste que l’élève désigné ci-dessous :');
  line('Nom :', s?.nom, 32, true);
  line('Prénom :', s?.prenom, 110, true);
  ay += 8;
  line('Né(e) le :', dateFR(p.student?.birthDate));
  line('Classe :', className(p), 110);
  ay += 10;
  title('Scolarisé dans l’établissement ci-après :');
  line('Nom :', e.schoolName);
  ay += 7;
  line('Adresse :', e.schoolAddress);
  ay += 7;
  doc.setFontSize(10.5);
  doc.text(
    doc.splitTextToSize(
      clean(`Représenté par : ${e.headName} en qualité de ${e.headTitle}, a effectué une période de formation en milieu professionnel dans notre entreprise ou organisme :`),
      W - 52,
    ),
    32,
    ay,
  );
  ay += 16;
  doc.setFontSize(18);
  doc.text(clean(period), W / 2, ay, { align: 'center' });
  ay += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(clean(`Soit ${weeks(p) ?? '...'} semaine(s)`), 20, ay);
  ay += 9;
  doc.setFontSize(13);
  doc.text(clean(`Soit une durée effective totale de : ${p.days ?? '......'} jour(s)`), 20, ay);
  ay += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.text(clean(`Date : ${dateFR(p.attestDate || p.end)}`), 32, ay);
  ay += 8;
  doc.text('Signature', 32, ay);
  doc.text(clean("Cachet de l'entreprise"), W - 32, ay, { align: 'right' });
  await drawImage(doc, tutorUrl, 26, ay + 3, 70, 34);
  await drawImage(doc, stampUrl, W - 100, ay + 3, 72, 40);

  // Pied de page
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(130);
    doc.text(clean(`${fullName(s)} - PFMP ${p.numero || ''} - ${period}`), 12, H - 6);
    doc.text(`${i} / ${n}`, W - 12, H - 6, { align: 'right' });
    doc.setTextColor(20);
  }

  const filename = `PFMP_${p.numero || ''}_${s?.nom || ''}_${s?.prenom || ''}.pdf`.replace(/[^\w\-.]+/g, '_');
  return { blob: doc.output('blob'), filename };
}
