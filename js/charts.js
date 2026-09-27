/* global Chart */
export const COLORS = {
  ecole: '#2563eb',
  entreprise: '#ea580c',
  global: '#16a34a',
};

const registry = new Map();

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue('--text-2').trim() || '#555',
    grid: cs.getPropertyValue('--line').trim() || '#ddd',
    band: cs.getPropertyValue('--band').trim() || 'rgba(0,0,0,.04)',
  };
}

// Bandes de fond pour matérialiser les périodes sur les graphiques d'évolution.
const periodBands = {
  id: 'periodBands',
  beforeDatasetsDraw(chart, _args, opts) {
    const periods = opts?.periods;
    if (!periods?.length) return;
    const { ctx, chartArea: a, scales } = chart;
    const x = scales.x;
    ctx.save();
    periods.forEach((p, i) => {
      const x1 = Math.max(a.left, x.getPixelForValue(p.from));
      const x2 = Math.min(a.right, x.getPixelForValue(p.to));
      if (x2 <= x1) return;
      if (i % 2 === 0) {
        ctx.fillStyle = opts.color;
        ctx.fillRect(x1, a.top, x2 - x1, a.bottom - a.top);
      }
      ctx.fillStyle = opts.textColor;
      ctx.font = '11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const label = p.label;
      if (ctx.measureText(label).width < x2 - x1) ctx.fillText(label, (x1 + x2) / 2, a.top + 12);
    });
    ctx.restore();
  },
};

export function mount(canvas, config) {
  const key = canvas.id || canvas;
  registry.get(key)?.destroy();
  const chart = new Chart(canvas, config);
  registry.set(key, chart);
  return chart;
}

export function destroyAll() {
  registry.forEach((c) => c.destroy());
  registry.clear();
}

const ts = (iso) => new Date(iso + 'T12:00:00').getTime();
const dayFmt = (v) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

/**
 * Graphique d'évolution d'une compétence dans le temps.
 * points: [{date, value, type, title}] ; periods: [{name,start,end,avg}]
 */
export function evolutionConfig(points, periods, { animation = true } = {}) {
  const t = themeColors();
  const mk = (type) =>
    points
      .filter((p) => p.type === type)
      .map((p) => ({ x: ts(p.date), y: p.value, title: p.title }));
  const avgPoints = periods
    .filter((p) => p.avg != null)
    .flatMap((p) => [
      { x: ts(p.start), y: p.avg },
      { x: ts(p.end), y: p.avg },
      { x: ts(p.end) + 1, y: null },
    ]);
  const xs = points.map((p) => ts(p.date));
  const bounds = periods.length
    ? { min: ts(periods[0].start), max: ts(periods.at(-1).end) }
    : xs.length
      ? { min: Math.min(...xs) - 864e5 * 7, max: Math.max(...xs) + 864e5 * 7 }
      : {};
  return {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'Moyenne de la période',
          data: avgPoints,
          borderColor: COLORS.global,
          borderWidth: 3,
          pointRadius: 0,
          spanGaps: false,
          order: 3,
        },
        {
          label: 'École',
          data: mk('ecole'),
          borderColor: COLORS.ecole,
          backgroundColor: COLORS.ecole,
          pointStyle: 'circle',
          pointRadius: 5,
          tension: 0.25,
          order: 1,
        },
        {
          label: 'Entreprise',
          data: mk('entreprise'),
          borderColor: COLORS.entreprise,
          backgroundColor: COLORS.entreprise,
          pointStyle: 'rectRot',
          pointRadius: 7,
          borderDash: [6, 4],
          tension: 0.25,
          order: 2,
        },
      ],
    },
    options: {
      animation: animation ? undefined : false,
      responsive: animation,
      maintainAspectRatio: false,
      parsing: false,
      scales: {
        x: {
          type: 'linear',
          ...bounds,
          ticks: { callback: dayFmt, color: t.text, maxRotation: 0, autoSkipPadding: 12 },
          grid: { color: t.grid },
        },
        y: { min: 0, max: 10, ticks: { stepSize: 2, color: t.text }, grid: { color: t.grid } },
      },
      plugins: {
        legend: { labels: { color: t.text, usePointStyle: true } },
        periodBands: {
          periods: periods.map((p) => ({ from: ts(p.start), to: ts(p.end), label: p.name })),
          color: t.band,
          textColor: t.text,
        },
        tooltip: {
          callbacks: {
            title: (items) => dayFmt(items[0].parsed.x),
            label: (item) =>
              `${item.raw.title ? item.raw.title + ' : ' : item.dataset.label + ' : '}${item.parsed.y.toFixed(1)}/10`,
          },
        },
      },
    },
    plugins: [periodBands],
  };
}

/** Radar ou barres : moyennes par compétence école / entreprise. */
export function compBarsConfig(labels, ecole, entreprise, { type = 'bar', animation = true } = {}) {
  const t = themeColors();
  const ds = [
    { label: 'École', data: ecole, backgroundColor: COLORS.ecole + 'cc', borderColor: COLORS.ecole },
    {
      label: 'Entreprise',
      data: entreprise,
      backgroundColor: COLORS.entreprise + 'cc',
      borderColor: COLORS.entreprise,
      pointStyle: 'rectRot',
    },
  ];
  if (type === 'radar') {
    ds.forEach((d) => {
      d.backgroundColor = d.borderColor + '33';
      d.pointBackgroundColor = d.borderColor;
      d.spanGaps = true;
    });
  }
  return {
    type,
    data: { labels, datasets: ds },
    options: {
      animation: animation ? undefined : false,
      responsive: animation,
      maintainAspectRatio: false,
      scales:
        type === 'radar'
          ? {
              r: {
                min: 0,
                max: 10,
                ticks: { stepSize: 2, color: t.text, backdropColor: 'transparent' },
                grid: { color: t.grid },
                angleLines: { color: t.grid },
                pointLabels: { color: t.text },
              },
            }
          : {
              x: { ticks: { color: t.text }, grid: { display: false } },
              y: { min: 0, max: 10, ticks: { stepSize: 2, color: t.text }, grid: { color: t.grid } },
            },
      plugins: { legend: { labels: { color: t.text, usePointStyle: true } } },
    },
  };
}

/** Évolution de la moyenne de classe période par période. */
export function classEvolutionConfig(labels, series) {
  const t = themeColors();
  return {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'École', data: series.ecole, borderColor: COLORS.ecole, backgroundColor: COLORS.ecole, spanGaps: true },
        {
          label: 'Entreprise',
          data: series.entreprise,
          borderColor: COLORS.entreprise,
          backgroundColor: COLORS.entreprise,
          pointStyle: 'rectRot',
          pointRadius: 6,
          borderDash: [6, 4],
          spanGaps: true,
        },
        { label: 'Globale', data: series.all, borderColor: COLORS.global, backgroundColor: COLORS.global, borderWidth: 3, spanGaps: true },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { ticks: { color: t.text }, grid: { color: t.grid } },
        y: { min: 0, max: 10, ticks: { stepSize: 2, color: t.text }, grid: { color: t.grid } },
      },
      plugins: { legend: { labels: { color: t.text, usePointStyle: true } } },
    },
  };
}

/** Rendu hors écran d'un graphique en image (pour le PDF). */
export function renderToImage(config, w = 1000, h = 420) {
  const holder = document.createElement('div');
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${w}px;height:${h}px`;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  holder.appendChild(canvas);
  document.body.appendChild(holder);
  // Couleurs claires forcées pour l'impression.
  const fix = (o) => {
    for (const s of Object.values(o.options.scales || {})) {
      if (s.ticks) s.ticks.color = '#333';
      if (s.grid) s.grid.color = '#ddd';
      if (s.pointLabels) s.pointLabels.color = '#333';
      if (s.angleLines) s.angleLines.color = '#ddd';
    }
    if (o.options.plugins?.legend) o.options.plugins.legend.labels.color = '#333';
    if (o.options.plugins?.periodBands) {
      o.options.plugins.periodBands.color = 'rgba(0,0,0,.05)';
      o.options.plugins.periodBands.textColor = '#666';
    }
    o.options.devicePixelRatio = 1;
    o.options.plugins = { ...o.options.plugins, tooltip: { enabled: false } };
    // Fond blanc
    o.plugins = [
      ...(o.plugins || []),
      {
        id: 'white',
        beforeDraw(c) {
          c.ctx.save();
          c.ctx.fillStyle = '#fff';
          c.ctx.fillRect(0, 0, c.width, c.height);
          c.ctx.restore();
        },
      },
    ];
    return o;
  };
  const chart = new Chart(canvas, fix(config));
  const url = canvas.toDataURL('image/png');
  chart.destroy();
  holder.remove();
  return url;
}
