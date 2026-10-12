// Pavé de signature au doigt / stylet / souris. Renvoie une image PNG (data URL) recadrée, ou null.
import { esc } from './util.js';

export function openSignaturePad(title, subtitle = '') {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'modal sig-modal';
    el.innerHTML = `<div class="modal-box card stack sig-box">
      <h2>${esc(title)}</h2>
      ${subtitle ? `<p class="muted small">${esc(subtitle)}</p>` : ''}
      <div class="sig-wrap"><canvas class="sig-canvas"></canvas><span class="sig-hint">Signez ici</span></div>
      <div class="row gap-s wrap">
        <button class="btn ghost" data-a="clear">Effacer</button><span class="spacer"></span>
        <button class="btn" data-a="cancel">Annuler</button>
        <button class="btn primary" data-a="ok">Valider la signature</button>
      </div></div>`;
    document.body.appendChild(el);
    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    let drawn = false;
    let last = null;

    const fit = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.6;
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b1f5c';
      drawn = false;
      el.querySelector('.sig-hint').hidden = false;
    };
    requestAnimationFrame(fit);

    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      last = pos(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      drawn = true;
      el.querySelector('.sig-hint').hidden = true;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    });
    const up = () => (last = null);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    const close = (v) => {
      el.remove();
      resolve(v);
    };
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'clear') fit();
      if (a === 'cancel') close(null);
      if (a === 'ok') {
        if (!drawn) return alert('Aucune signature.');
        close(trim(canvas));
      }
    };
  });
}

/** Recadre la signature sur la zone dessinée (fond transparent). */
function trim(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const data = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  const pad = 8;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w, x1 + pad);
  y1 = Math.min(h, y1 + pad);
  // Réduction à 500 px de large au plus.
  const r = Math.min(1, 500 / (x1 - x0));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round((x1 - x0) * r));
  out.height = Math.max(1, Math.round((y1 - y0) * r));
  out.getContext('2d').drawImage(canvas, x0, y0, x1 - x0, y1 - y0, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
