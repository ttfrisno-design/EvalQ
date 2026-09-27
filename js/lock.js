// Écran de saisie du code à 6 chiffres (clavier tactile + clavier physique).
import { esc } from './util.js';

const LEN = 6;

/**
 * Affiche le pavé numérique. `onSubmit(code)` renvoie true (accepté) ou un message d'erreur.
 * Résout avec le code accepté, ou null si l'utilisateur annule.
 */
export function openPin({ title, subtitle = '', onSubmit, cancelLabel = null, links = [] }) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="lock-box">
        <img src="icons/icon-192.png" alt="" width="64" height="64" class="lock-logo">
        <h1 class="lock-title">${esc(title)}</h1>
        <p class="lock-sub">${esc(subtitle)}</p>
        <div class="lock-dots" aria-live="polite">${'<span></span>'.repeat(LEN)}</div>
        <p class="lock-msg" role="alert"></p>
        <div class="lock-pad">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" data-d="${n}">${n}</button>`).join('')}
          <button type="button" class="lock-aux" data-act="cancel" ${cancelLabel ? '' : 'style="visibility:hidden"'}>${esc(cancelLabel || '')}</button>
          <button type="button" data-d="0">0</button>
          <button type="button" class="lock-aux" data-act="back" aria-label="Effacer">⌫</button>
        </div>
        <div class="lock-links">${links.map((l, i) => `<button type="button" class="lock-link" data-link="${i}">${esc(l.label)}</button>`).join('')}</div>
      </div>`;
    document.body.appendChild(el);
    document.body.classList.add('locked');

    let code = '';
    let busy = false;
    const dots = [...el.querySelectorAll('.lock-dots span')];
    const msg = el.querySelector('.lock-msg');
    const paint = () => dots.forEach((d, i) => d.classList.toggle('on', i < code.length));

    const close = (val) => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      if (!document.querySelector('.lock')) document.body.classList.remove('locked');
      resolve(val);
    };

    const submit = async () => {
      busy = true;
      el.classList.add('busy');
      msg.textContent = 'Vérification…';
      await new Promise((r) => setTimeout(r, 30));
      let res;
      try {
        res = await onSubmit(code);
      } catch (e) {
        res = e.message || 'Erreur';
      }
      el.classList.remove('busy');
      busy = false;
      if (res === true) return close(code);
      msg.textContent = typeof res === 'string' ? res : 'Code incorrect';
      el.querySelector('.lock-dots').classList.add('shake');
      setTimeout(() => el.querySelector('.lock-dots')?.classList.remove('shake'), 500);
      code = '';
      paint();
    };

    const press = (d) => {
      if (busy) return;
      if (d === 'back') code = code.slice(0, -1);
      else if (code.length < LEN) code += d;
      if (code.length) msg.textContent = '';
      paint();
      if (code.length === LEN) submit();
    };

    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
      else if (e.key === 'Escape' && cancelLabel) close(null);
    };
    document.addEventListener('keydown', onKey);

    el.onclick = (e) => {
      const d = e.target.closest('[data-d]');
      if (d) return press(d.dataset.d);
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'back') return press('back');
      if (act === 'cancel') return close(null);
      const l = e.target.closest('[data-link]');
      if (l) links[+l.dataset.link].onClick(close);
    };
  });
}

/** Création d'un code : saisie puis confirmation. */
export async function createPin({ title = 'Créez votre code', subtitle, onCreate }) {
  for (;;) {
    let first = null;
    await openPin({ title, subtitle, onSubmit: async (c) => ((first = c), true) });
    const ok = await openPin({
      title: 'Confirmez le code',
      subtitle: 'Saisissez à nouveau les 6 chiffres.',
      cancelLabel: 'Retour',
      onSubmit: async (c) => {
        if (c !== first) return 'Les deux codes sont différents';
        await onCreate(c);
        return true;
      },
    });
    if (ok) return ok;
  }
}
