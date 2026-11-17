/* global google */
// Synchronisation avec un fichier unique dans le Google Drive de l'utilisateur.
// Le fichier est chiffré avec le code à 6 chiffres ; Google ne voit pas les données en clair.
import { GOOGLE_CLIENT_ID, GOOGLE_FOLDER_ID } from './config.js';
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
import { mediaRefs } from './pfmp.js';
import * as media from './media.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FILE_NAME = 'EvalQ-donnees.json';
const INFO_KEY = 'evalq.sync';
const TOKEN_KEY = 'evalq.token';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

class AuthError extends Error {}

let info = readJSON(localStorage, INFO_KEY) || {};
let tok = readJSON(localStorage, TOKEN_KEY) || {};
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

// L'identifiant intégré à l'application est prioritaire sur une saisie manuelle.
export const clientId = () => (GOOGLE_CLIENT_ID || info.clientId || '').trim();
export const clientIdBuiltIn = () => !!GOOGLE_CLIENT_ID;
export function setClientId(v) {
  info.clientId = v.trim();
  saveInfo();
}
export const folderId = () => (info.folderId ?? GOOGLE_FOLDER_ID ?? '').trim();
export function setFolderId(v) {
  info.folderId = parseFolderId(v);
  saveInfo();
}
/** Accepte l'identifiant seul ou l'adresse complète du dossier (…/folders/<id>). */
const parseFolderId = (v) => (String(v).match(/folders\/([\w-]+)/)?.[1] || String(v)).trim();
/** Message d'information sur l'emplacement du fichier (ou ''). */
export const placementNote = () => info.placementNote || '';
export const isEnabled = () => !!info.enabled;
/** Lien vers le fichier de données dans Google Drive (une fois créé). */
export const fileUrl = () => (info.fileId ? `https://drive.google.com/file/d/${info.fileId}/view` : '');
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
        if (r.error) return reject(new Error(oauthMessage(r.error, r.error_description)));
        if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) {
          return reject(
            new Error('Google n’a pas donné l’accès à Drive : recommencez et cochez la case autorisant EvalQ à gérer ses fichiers Google Drive.'),
          );
        }
        tok = { access: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000 };
        localStorage.setItem(TOKEN_KEY, JSON.stringify(tok));
        resolve();
      },
      error_callback: (e) => reject(new Error(oauthMessage(e?.type, e?.message))),
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
  await sync();
  // Une erreur de synchronisation ne doit pas passer inaperçue juste après la connexion.
  if (status === 'error') throw new Error('Connexion Google réussie, mais la synchronisation a échoué : ' + lastError);
}

/** Messages compréhensibles pour les erreurs de connexion Google. */
function oauthMessage(code, detail) {
  const m = {
    popup_closed: 'La fenêtre Google a été fermée avant la fin de la connexion.',
    popup_failed_to_open:
      'La fenêtre de connexion Google n’a pas pu s’ouvrir. Autorisez les fenêtres surgissantes, ou sur iPad/iPhone ouvrez EvalQ dans Safari pour vous connecter.',
    access_denied:
      'Google a refusé l’accès. Vérifiez dans Google Cloud (Audience) que votre adresse Gmail est bien « utilisateur test », puis réessayez.',
    invalid_client: 'Identifiant client Google invalide (projet Google Cloud supprimé ou mal recopié).',
    unauthorized_client: 'Ce client Google n’autorise pas cette adresse : vérifiez les « Origines JavaScript autorisées ».',
  };
  return m[code] || `Connexion Google impossible (${code || 'erreur inconnue'}${detail ? ' : ' + detail : ''}).`;
}

/** Messages compréhensibles pour les erreurs de l'API Drive. */
async function driveMessage(r) {
  let reason = '';
  let msg = '';
  try {
    const j = await r.json();
    reason = j.error?.errors?.[0]?.reason || j.error?.details?.[0]?.reason || j.error?.status || '';
    msg = j.error?.message || '';
  } catch {
    /* corps illisible */
  }
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason + msg))
    return 'L’API Google Drive n’est pas activée dans votre projet Google Cloud (API et services → Bibliothèque → Google Drive API → Activer).';
  if (/insufficient|SCOPE/i.test(reason))
    return 'Autorisation Drive insuffisante : déconnectez puis reconnectez Google Drive en cochant l’accès aux fichiers.';
  if (/rateLimit|userRateLimit|quota/i.test(reason)) return 'Google Drive est momentanément saturé : réessayez dans une minute.';
  return `Google Drive : erreur ${r.status}${msg ? ' – ' + msg : ''}`;
}

export function disconnect() {
  try {
    if (tok.access) google?.accounts?.oauth2?.revoke(tok.access);
  } catch {
    /* ignoré */
  }
  tok = {};
  localStorage.removeItem(TOKEN_KEY);
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
      localStorage.removeItem(TOKEN_KEY);
      throw new AuthError('Session Google expirée');
    }
    const e = new Error(await driveMessage(r));
    e.status = 403;
    throw e;
  }
  if (!r.ok) {
    const e = new Error(await driveMessage(r));
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
  const folder = folderId();
  if (folder) {
    try {
      const id = await createIn(blob, [folder]);
      info.placementNote = '';
      return id;
    } catch (e) {
      if (e instanceof AuthError || !(e.status === 404 || e.status === 403 || /403/.test(e.message))) throw e;
      info.placementNote =
        'Google n’a pas autorisé l’accès au dossier choisi : le fichier EvalQ-donnees.json a été créé à la racine de votre Drive. ' +
        'Vous pouvez le déplacer dans votre dossier, la synchronisation continuera.';
    }
  }
  return createIn(blob, null);
}

async function createIn(blob, parents, name = FILE_NAME, description = 'Données EvalQ (chiffrées avec votre code)') {
  const b = 'evalq' + Math.random().toString(36).slice(2);
  const meta = { name, mimeType: 'application/json', description };
  if (parents) meta.parents = parents;
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
    await syncMedia();
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
  await syncMedia();
  done();
}

// ---------- Images (signatures, cachets) : un fichier chiffré par image ----------

const mediaName = (id) => `EvalQ-image-${id}.json`;

async function findByName(name, mimeType) {
  const q = encodeURIComponent(`name='${name}' and trashed=false${mimeType ? ` and mimeType='${mimeType}'` : ''}`);
  const r = await api(`${API}/files?q=${q}&spaces=drive&fields=files(id)`);
  return (await r.json()).files?.[0]?.id || null;
}

/** Dossier « EvalQ-images » (créé par l'application, dans le dossier choisi si possible). */
async function mediaFolder() {
  if (info.mediaFolderId) return info.mediaFolderId;
  const FOLDER = 'application/vnd.google-apps.folder';
  let id = await findByName('EvalQ-images', FOLDER);
  if (!id) {
    const body = (parents) => JSON.stringify({ name: 'EvalQ-images', mimeType: FOLDER, ...(parents ? { parents } : {}) });
    const mk = (parents) =>
      api(`${API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body(parents) }).then((r) => r.json());
    try {
      id = (await mk(folderId() ? [folderId()] : null)).id;
    } catch (e) {
      if (e instanceof AuthError) throw e;
      id = (await mk(null)).id;
    }
  }
  info.mediaFolderId = id;
  saveInfo();
  return id;
}

async function syncMedia() {
  info.mediaUp ||= {};
  let received = false;
  for (const ref of mediaRefs()) {
    const local = await media.getRaw(ref.id);
    if (local) {
      if (info.mediaUp[ref.id]) continue;
      if (!(await findByName(mediaName(ref.id)))) {
        await createIn(local, [await mediaFolder()], mediaName(ref.id), 'Image EvalQ (chiffrée)');
      }
    } else {
      const fid = await findByName(mediaName(ref.id));
      if (!fid) continue;
      await media.putRaw(ref.id, await download(fid));
      received = true;
    }
    info.mediaUp[ref.id] = true;
    saveInfo();
  }
  if (received) hooks.onChanged();
}

function done() {
  info.lastSync = Date.now();
  saveInfo();
  setStatus('ok');
}
