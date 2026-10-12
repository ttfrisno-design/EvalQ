// Images (signatures, cachets) : stockées chiffrées dans IndexedDB, chacune avec sa propre clé.
// La référence { id, k } (identifiant + clé) est conservée dans les données principales, elles-mêmes chiffrées.
import { toB64, fromB64 } from './crypto.js';

const DB = 'evalq-media';
const STORE = 'media';
let dbp = null;
const cache = new Map();

function db() {
  dbp ||= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

function tx(mode, fn) {
  return db().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req?.result);
        t.onerror = () => reject(t.error);
      }),
  );
}

export const getRaw = (id) => tx('readonly', (s) => s.get(id));
export const putRaw = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
export const hasRaw = async (id) => !!(await getRaw(id));
export const clearAll = () => tx('readwrite', (s) => s.clear());

const keyFrom = (k) => crypto.subtle.importKey('raw', fromB64(k), 'AES-GCM', false, ['encrypt', 'decrypt']);

/** Enregistre une image (data URL) et renvoie sa référence { id, k }. */
export async function putMedia(dataURL) {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  const k = toB64(raw);
  const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(k), new TextEncoder().encode(dataURL));
  await putRaw(id, { v: 1, iv: toB64(iv), ct: toB64(ct) });
  cache.set(id, dataURL);
  return { id, k };
}

/** Renvoie la data URL d'une image, ou null si elle n'est pas (encore) sur cet appareil. */
export async function getMedia(ref) {
  if (!ref?.id) return null;
  if (cache.has(ref.id)) return cache.get(ref.id);
  const blob = await getRaw(ref.id);
  if (!blob) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(blob.iv) }, await keyFrom(ref.k), fromB64(blob.ct));
    const url = new TextDecoder().decode(pt);
    cache.set(ref.id, url);
    return url;
  } catch {
    return null;
  }
}

/** Réduit une photo (cachet) pour limiter la taille : JPEG, 700 px maximum. */
export function resizeImage(file, max = 700, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = url;
  });
}
