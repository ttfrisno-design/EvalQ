import {
  classById,
  studentsOf,
  studentById,
  sortedCompetences,
  evalsFor,
  compAverage,
  critAverage,
  globalAverage,
  classCompAverage,
  evalScore,
  rangeById,
  previousRange,
  levelOf,
  isNum,
  fmt,
  fullName,
  LEVELS,
} from './store.js';
import { compBarsConfig, renderToImage } from './charts.js';
import { shareOrDownload } from './util.js';

// Les polices standard de jsPDF ne gèrent que le Latin-1 : on normalise.
const clean = (s) =>
  String(s ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/…/g, '...')
    .replace(/[–—]/g, '-')
    .replace(/œ/g, 'oe')
    .replace(/Œ/g, 'OE')
    .replace(/[^\x00-\xFF]/g, '');

const LEVEL_RGB = { l4: [187, 247, 208], l3: [220, 252, 231], l2: [254, 240, 138], l1: [254, 202, 202] };
const ORANGE = [234, 88, 12];
const BLUE = [37, 99, 235];
const ORANGE_BG = [255, 237, 213];
const BLUE_BG = [219, 234, 254];

const dateFR = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '');

function colorCell(data, value) {
  const l = levelOf(value);
  if (l) data.cell.styles.fillColor = LEVEL_RGB[l.key];
}

function header(doc, title, sub) {
  const w = doc.internal.pageSize.getWidth();
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, w, 16, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(clean(title), 10, 10.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(clean(sub), w - 10, 10.5, { align: 'right' });
  doc.setTextColor(20);
}

function legend(doc, y) {
  let x = 10;
  doc.setFontSize(8);
  for (const l of LEVELS) {
    doc.setFillColor(...LEVEL_RGB[l.key]);
    doc.rect(x, y - 3, 4, 4, 'F');
    const txt = clean(`${l.label} (${l.min === 0 ? '< 4' : '>= ' + l.min})`);
    doc.text(txt, x + 5.5, y);
    x += doc.getTextWidth(txt) + 12;
  }
  doc.setFillColor(...ORANGE_BG);
  doc.rect(x, y - 3, 4, 4, 'F');
  doc.setTextColor(...ORANGE);
  doc.text('[E] = évaluation en entreprise', x + 5.5, y);
  doc.setTextColor(20);
}

function footers(doc) {
  const n = doc.getNumberOfPages();
  const stamp = new Date().toLocaleDateString('fr-FR');
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`EvalQ - édité le ${stamp}`, 10, h - 5);
    doc.text(`${i} / ${n}`, w - 10, h - 5, { align: 'right' });
  }
}

/**
 * Génère le bilan PDF d'une classe (ou d'élèves choisis) pour une plage (période, semestre, année).
 */
export async function bilanPDF({ classId, rangeId, studentIds, detail = true, charts = true, summary = true }) {
  const { jsPDF } = window.jspdf;
  const r = rangeById(rangeId);
  const prev = previousRange(r);
  const cls = classById(classId);
  const comps = sortedCompetences();
  const all = evalsFor({ classId, start: r.start, end: r.end });
  const ec = all.filter((e) => e.type === 'ecole');
  const en = all.filter((e) => e.type === 'entreprise');
  const prevAll = prev ? evalsFor({ classId, start: prev.start, end: prev.end }) : [];
  const students = studentIds ? studentIds.map(studentById).filter(Boolean) : studentsOf(classId);
  const sub = `${r.name} : du ${dateFR(r.start)} au ${dateFR(r.end)}`;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  let first = true;

  // ---------- Synthèse de classe ----------
  if (summary) {
    first = false;
    header(doc, `Bilan des compétences - Classe ${cls?.name ?? classId}`, sub);
    doc.setFontSize(9);
    doc.text(
      clean(
        `${all.length} évaluation(s) : ${ec.length} à l'école, ${en.length} en entreprise. ` +
          'Notes /10 ; chaque compétence = moyenne des critères évalués.',
      ),
      10,
      22,
    );
    legend(doc, 28);
    const body = students.map((s) => [
      fullName(s),
      ...comps.map((c) => fmt(compAverage(s.id, c.id, all))),
      fmt(globalAverage(s.id, all)),
      fmt(globalAverage(s.id, en)),
    ]);
    body.push([
      'Moyenne de la classe',
      ...comps.map((c) => fmt(classCompAverage(classId, c.id, all))),
      fmt(mean2(students.map((s) => globalAverage(s.id, all)))),
      fmt(mean2(students.map((s) => globalAverage(s.id, en)))),
    ]);
    doc.autoTable({
      startY: 32,
      head: [['Élève', ...comps.map((c) => c.id), 'Moy.', 'Entr. [E]']],
      body: body.map((row) => row.map(clean)),
      theme: 'grid',
      styles: { fontSize: 8, halign: 'center', cellPadding: 1.5 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 0: { halign: 'left', cellWidth: 48 } },
      didParseCell(d) {
        if (d.section === 'head' && d.column.index === comps.length + 2) d.cell.styles.fillColor = ORANGE;
        if (d.section !== 'body' || d.column.index === 0) return;
        const v = parseFloat(String(d.cell.raw).replace(',', '.'));
        colorCell(d, isNaN(v) ? null : v);
        if (d.row.index === body.length - 1) d.cell.styles.fontStyle = 'bold';
        if (d.column.index === comps.length + 1) d.cell.styles.fontStyle = 'bold';
      },
    });
    let y = doc.lastAutoTable.finalY + 4;
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    const labels = comps.map((c) => `${c.id} ${c.label}`).join('   ');
    const lines = doc.splitTextToSize(clean(labels), doc.internal.pageSize.getWidth() - 20);
    doc.text(lines, 10, y + 2);
    y += lines.length * 3.2 + 4;
    doc.setTextColor(20);
    if (charts) {
      const img = renderToImage(
        compBarsConfig(
          comps.map((c) => c.id),
          comps.map((c) => classCompAverage(classId, c.id, ec)),
          comps.map((c) => classCompAverage(classId, c.id, en)),
          { animation: false },
        ),
        1100,
        330,
      );
      const h = doc.internal.pageSize.getHeight();
      const imgH = 70;
      if (y + imgH > h - 10) {
        doc.addPage('a4', 'landscape');
        header(doc, `Bilan des compétences - Classe ${cls?.name ?? classId}`, sub);
        y = 22;
      }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Moyennes de la classe par compétence', 10, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.addImage(img, 'PNG', 10, y + 4, 233, imgH);
    }
  }

  // ---------- Fiches élèves ----------
  for (const s of students) {
    if (!first) doc.addPage('a4', 'portrait');
    else if (doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight()) {
      // Premier document sans synthèse : on repart en portrait.
      doc.addPage('a4', 'portrait');
      doc.deletePage(1);
    }
    first = false;
    studentPage(doc, s, { r, prev, comps, all, ec, en, prevAll, sub, detail, charts, cls });
  }

  footers(doc);
  const name = studentIds?.length === 1
    ? `Bilan_${fullName(students[0])}_${r.name}`
    : `Bilan_${cls?.name ?? classId}_${r.name}`;
  const blob = doc.output('blob');
  await shareOrDownload(blob, `${name.replace(/[^\w\-]+/g, '_')}.pdf`, 'application/pdf');
}

const mean2 = (vals) => {
  const v = vals.filter(isNum);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

function studentPage(doc, s, { r, prev, comps, all, ec, en, prevAll, sub, detail, charts, cls }) {
  const mine = (list) => list.filter((e) => e.students.includes(s.id));
  header(doc, `${fullName(s)} - ${cls?.name ?? ''}`, sub);
  const g = globalAverage(s.id, all);
  const gp = prev ? globalAverage(s.id, prevAll) : null;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(clean(`Moyenne générale : ${fmt(g)} / 10`), 10, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const evo = isNum(g) && isNum(gp) ? ` (${prev.name} : ${fmt(gp)} ; évolution ${sign(g - gp)})` : '';
  doc.text(
    clean(`École : ${fmt(globalAverage(s.id, ec))}   Entreprise [E] : ${fmt(globalAverage(s.id, en))}${evo}`),
    10,
    29,
  );

  const rows = comps.map((c) => {
    const a = compAverage(s.id, c.id, all);
    const p = prev ? compAverage(s.id, c.id, prevAll) : null;
    return [
      `${c.id} - ${c.label}`,
      fmt(compAverage(s.id, c.id, ec)),
      fmt(compAverage(s.id, c.id, en)),
      fmt(a),
      ...(prev ? [fmt(p), isNum(a) && isNum(p) ? sign(a - p) : ''] : []),
      levelOf(a)?.label ?? '',
    ];
  });
  const levelCol = prev ? 6 : 4;
  doc.autoTable({
    startY: 33,
    head: [['Compétence', 'École', 'Entreprise [E]', 'Moyenne', ...(prev ? [prev.name, 'Évol.'] : []), 'Niveau']].map((r) => r.map(clean)),
    body: rows.map((row) => row.map(clean)),
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.4, halign: 'center' },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: { 0: { halign: 'left', cellWidth: 82 }, [levelCol]: { cellWidth: 28 } },
    didParseCell(d) {
      if (d.section === 'head') {
        if (d.column.index === 1) d.cell.styles.fillColor = BLUE;
        if (d.column.index === 2) d.cell.styles.fillColor = ORANGE;
        return;
      }
      if (d.column.index === 2) d.cell.styles.fillColor = ORANGE_BG;
      if (d.column.index === 1) d.cell.styles.fillColor = BLUE_BG;
      if (d.column.index === 3 || d.column.index === levelCol) {
        colorCell(d, compAverage(s.id, comps[d.row.index].id, all));
        d.cell.styles.fontStyle = 'bold';
      }
      if (prev && d.column.index === 5) {
        const t = String(d.cell.raw);
        if (t.startsWith('+')) d.cell.styles.textColor = [22, 163, 74];
        if (t.startsWith('-')) d.cell.styles.textColor = [220, 38, 38];
      }
    },
  });
  let y = doc.lastAutoTable.finalY + 4;
  const pageH = doc.internal.pageSize.getHeight();
  const ensure = (need) => {
    if (y + need > pageH - 12) {
      doc.addPage('a4', 'portrait');
      header(doc, `${fullName(s)} - ${cls?.name ?? ''} (suite)`, sub);
      y = 22;
    }
  };

  if (charts) {
    const img = renderToImage(
      compBarsConfig(
        comps.map((c) => c.id),
        comps.map((c) => compAverage(s.id, c.id, ec)),
        comps.map((c) => compAverage(s.id, c.id, en)),
        { animation: false },
      ),
      1000,
      360,
    );
    ensure(66);
    doc.addImage(img, 'PNG', 10, y, 190, 64);
    y += 67;
  }

  if (detail) {
    const body = [];
    const kinds = [];
    for (const c of comps) {
      const crits = c.criteres
        .map((k) => ({ k, e: critAverage(s.id, k.id, ec), x: critAverage(s.id, k.id, en) }))
        .filter((o) => isNum(o.e) || isNum(o.x));
      if (!crits.length) continue;
      body.push([`${c.id} - ${c.label}`, '', '']);
      kinds.push('comp');
      for (const o of crits) {
        body.push([`   ${o.k.label}`, fmt(o.e), fmt(o.x)]);
        kinds.push('crit');
      }
    }
    if (body.length) {
      ensure(20);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Détail par critère', 10, y + 2);
      doc.setFont('helvetica', 'normal');
      doc.autoTable({
        startY: y + 4,
        head: [['Critère', 'École', 'Entreprise [E]']],
        body: body.map((row) => row.map(clean)),
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 1, halign: 'center' },
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: { 0: { halign: 'left' }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 } },
        margin: { top: 22 },
        didParseCell(d) {
          if (d.section === 'head') {
            if (d.column.index === 1) d.cell.styles.fillColor = BLUE;
            if (d.column.index === 2) d.cell.styles.fillColor = ORANGE;
            return;
          }
          if (kinds[d.row.index] === 'comp') {
            d.cell.styles.fontStyle = 'bold';
            d.cell.styles.fillColor = [241, 245, 249];
          } else if (d.column.index > 0) {
            const v = parseFloat(String(d.cell.raw).replace(',', '.'));
            colorCell(d, isNaN(v) ? null : v);
          }
        },
      });
      y = doc.lastAutoTable.finalY + 4;
    }
  }

  const evs = mine(all);
  if (evs.length) {
    ensure(20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Évaluations de la période', 10, y + 2);
    doc.setFont('helvetica', 'normal');
    doc.autoTable({
      startY: y + 4,
      head: [['Date', 'Évaluation', 'Lieu', 'Note', 'Commentaire']],
      body: evs.map((e) =>
        [
          dateFR(e.date),
          e.title,
          e.type === 'entreprise' ? `[E] ${e.companies?.[s.id] || e.place || 'Entreprise'}` : 'École',
          e.absent?.[s.id] ? 'Absent' : fmt(evalScore(e, s.id)),
          e.comments?.[s.id] || '',
        ].map(clean),
      ),
      theme: 'grid',
      styles: { fontSize: 7.5, cellPadding: 1.2 },
      headStyles: { fillColor: [30, 41, 59] },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 45 }, 2: { cellWidth: 35 }, 3: { cellWidth: 12, halign: 'center' } },
      margin: { top: 22 },
      didParseCell(d) {
        if (d.section === 'body' && evs[d.row.index].type === 'entreprise') {
          d.cell.styles.fillColor = ORANGE_BG;
          if (d.column.index === 2) d.cell.styles.textColor = ORANGE;
        }
      },
    });
    y = doc.lastAutoTable.finalY + 4;
  }

  // Appréciation manuscrite
  ensure(28);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Appréciation', 10, y + 2);
  doc.setFont('helvetica', 'normal');
  doc.setDrawColor(180);
  doc.rect(10, y + 4, 190, 20);
}

const sign = (v) => (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1).replace('.', ',');

