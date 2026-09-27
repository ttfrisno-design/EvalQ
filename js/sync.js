/* global google */
// Synchronisation avec un fichier unique dans le Google Drive de l'utilisateur.
// Le fichier est chiffré avec le code à 6 chiffres ; Google ne voit pas les données en clair.
import { GOOGLE_CLIENT_ID } from './config.js';
import {
  state,
  hasContent,
  encryptForRemote,
  decryptRemote,
  mergeStates,
  adoptRemote,
  applyMerged,
  dataSig,
  persistNow,
} from './store.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'EvalQ-donnees.json';
const INFO_KEY = 'evalq.sync';
const TOKEN_KEY = 'evalq.token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

class AuthError extends Error {}

let info = readJSON(localStorage, INFO_KEY) || {};
let tok = readJSON(sessionStorage, TOKEN_KEY) || {};
let status = 'off';
let lastError = '';
let running = null;
let again = false;
let hooks = { askCode: async () => null, chooseFirst: async () => 'drive', onChanged: () => {} };
const listeners = new Set();

function readJSON(store, k) {
  try {
    return JSON.parse(store.getItem(k) || 'null');
  } catch {
    return null;
  }
}
const saveInfo = () => localStorage.setItem(INFO_KEY, JSON.stringify(info));

export const configure = (h) => Object.assign(hooks, h);
export const onStatus = (fn) => listeners.add(fn);
function setStatus(s, err = '') {
  status = s;
  lastError = err;
  listeners.forEach((fn) => fn());
}

export const clientId = () => (info.clientId || GOOGLE_CLIENT_ID || '').trim();
export function setClientId(v) {
  info.clientId = v.trim();
  saveInfo();
}
export const isEnabled = () => !!info.enabled;
const hasToken = () => !!tok.access && Date.now() < tok.exp;

export function getStatus() {
  let s = status;
  if (!isEnabled()) s = 'off';
  else if (s !== 'syncing' && !hasToken()) s = 'reconnect';
  return { status: s, error: lastError, lastSync: info.lastSync || null, email: info.email || '' };
}

// ---------- Connexion Google ----------

let gisPromise = null;
export function loadGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      gisPromise = null;
      reject(new Error('Impossible de joindre Google (connexion Internet ?)'));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

/** Ouvre la fenêtre de connexion Google (doit être appelé suite à un appui de l'utilisateur). */
export async function connect() {
  if (!clientId()) throw new Error('Identifiant client Google non configuré (Réglages → Synchronisation).');
  await loadGIS();
  await new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      hint: info.email || undefined,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        tok = { access: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000 };
        sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tok));
        resolve();
      },
      error_callback: (e) =>
        reject(new Error(e?.type === 'popup_closed' ? 'Fenêtre Google fermée' : e?.message || 'Connexion Google impossible')),
    });
    client.requestAccessToken({ prompt: info.email ? '' : 'consent' });
  });
  info.enabled = true;
  saveInfo();
  try {
    const r = await api(`${API}/about?fields=user(emailAddress)`);
    info.email = (await r.json()).user?.emailAddress || info.email;
    saveInfo();
  } catch {
    /* facultatif */
  }
  setStatus('idle');
  return sync();
}

export function disconnect() {
  try {
    if (tok.access) google?.accounts?.oauth2?.revoke(tok.access);
  } catch {
    /* ignoré */
  }
  tok = {};
  sessionStorage.removeItem(TOKEN_KEY);
  info = { clientId: info.clientId };
  saveInfo();
  setStatus('off');
}

// ---------- API Drive ----------

async function api(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: { Authorization: `Bearer ${tok.access}`, ...(opts.headers || {}) } });
  if (r.status === 401 || r.status === 403) {
    if (r.status === 401) {
      tok = {};
      sessionStorage.removeItem(TOKEN_KEY);
      throw new AuthError('Session Google expirée');
    }
    throw new Error('Accès Google Drive refusé (403)');
  }
  if (!r.ok) {
    const e = new Error(`Google Drive : erreur ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return r;
}

async function findFile() {
  if (info.fileId) {
    try {
      const f = await (await api(`${API}/files/${info.fileId}?fields=id,trashed`)).json();
      if (!f.trashed) return f.id;
    } catch (e) {
      if (e instanceof AuthError) throw e;
    }
  }
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const r = await api(`${API}/files?q=${q}&spaces=drive&orderBy=modifiedTime desc&fields=files(id,modifiedTime)`);
  return (await r.json()).files?.[0]?.id || null;
}

const download = async (id) => (await api(`${API}/files/${id}?alt=media`)).json();

async function create(blob) {
  const b = 'evalq' + Math.random().toString(36).slice(2);
  const meta = { name: FILE_NAME, mimeType: 'application/json', description: 'Données EvalQ (chiffrées avec votre code)' };
  const body =
    `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${b}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(blob)}\r\n--${b}--`;
  const r = await api(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${b}` },
    body,
  });
  return (await r.json()).id;
}

const update = (id, blob) =>
  api(`${UPLOAD}/files/${id}?uploadType=media`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(blob),
  });

// ---------- Synchronisation ----------

/** Lance une synchronisation (sans effet si non connecté). Les appels simultanés sont regroupés. */
export function sync() {
  if (!isEnabled() || !state) return Promise.resolve();
  if (!hasToken()) {
    setStatus('reconnect');
    return Promise.resolve();
  }
  if (!navigator.onLine) {
    setStatus('error', 'Hors connexion : synchronisation au retour du réseau');
    return Promise.resolve();
  }
  if (running) {
    again = true;
    return running;
  }
  running = run()
    .catch((e) => {
      console.warn('Synchronisation', e);
      if (e instanceof AuthError) setStatus('reconnect');
      else setStatus('error', e.message);
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        sync();
      }
    });
  return running;
}

async function run() {
  setStatus('syncing');
  const id = await findFile();
  if (!id) {
    info.fileId = await create(await encryptForRemote());
    info.linked = true;
    return done();
  }
  const blob = await download(id);
  const { data: remote, rekeyed } = await decryptRemote(blob, hooks.askCode);
  const before = dataSig(state);
  let merged;
  if (info.linked) merged = mergeStates(state, remote);
  else if (hasContent(state) && hasContent(remote)) {
    merged = (await hooks.chooseFirst(remote)) === 'merge' ? mergeStates(state, remote) : adoptRemote(remote);
  } else merged = hasContent(state) ? mergeStates(state, remote) : adoptRemote(remote);
  await applyMerged(merged);
  if (rekeyed) await persistNow();
  if (dataSig(merged) !== before) hooks.onChanged();
  if (dataSig(merged) !== dataSig(remote)) await update(id, await encryptForRemote());
  info.fileId = id;
  info.linked = true;
  done();
}

function done() {
  info.lastSync = Date.now();
  saveInfo();
  setStatus('ok');
}
