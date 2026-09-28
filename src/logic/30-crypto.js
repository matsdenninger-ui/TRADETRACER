/* ---------------------------------------------------------------------- */
/* Ende-zu-Ende-Verschlüsselung für den Sync                               */
/* AES-GCM 256 mit einem Schlüssel aus deinem Sync-Passwort (PBKDF2).      */
/* Das Passwort selbst verlässt das Gerät nie; im Gist liegt nur Chiffrat.  */
/* ---------------------------------------------------------------------- */

const CRYPTO_ITERATIONS = 310000;

function b64encode(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function b64decode(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function newSalt() {
  return b64encode(crypto.getRandomValues(new Uint8Array(16)));
}

async function deriveSyncKey(passphrase, saltB64, iterations = CRYPTO_ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64decode(saltB64), iterations, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
  );
}

async function exportSyncKey(key) {
  return b64encode(new Uint8Array(await crypto.subtle.exportKey('raw', key)));
}

async function importSyncKey(b64) {
  return crypto.subtle.importKey('raw', b64decode(b64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptText(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: b64encode(iv), ct: b64encode(new Uint8Array(ct)) };
}

async function decryptText(key, box) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64decode(box.iv) }, key, b64decode(box.ct));
    return new TextDecoder().decode(pt);
  } catch (e) {
    throw new Error('Entschlüsselung fehlgeschlagen – falsches Sync-Passwort?');
  }
}

/* Hülle für die Sync-Datei: verschlüsselt, wenn ein Schlüssel vorhanden ist */
async function sealPayload(obj, key, salt) {
  if (!key) return JSON.stringify(obj);
  const box = await encryptText(key, JSON.stringify(obj));
  return JSON.stringify({ app: 'TradeTracer', enc: { v: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: CRYPTO_ITERATIONS, salt }, ...box });
}

function isSealed(raw) {
  try { const o = JSON.parse(raw); return !!(o && o.enc && o.ct); } catch (e) { return false; }
}

async function openPayload(raw, key) {
  if (!raw) return {};
  let o;
  try { o = JSON.parse(raw); } catch (e) { throw new Error('Die Sync-Datei im Gist ist beschädigt.'); }
  if (!o.enc) return o;
  if (!key) { const err = new Error('Die Sync-Daten sind verschlüsselt – bitte Sync-Passwort eingeben.'); err.code = 'LOCKED'; throw err; }
  return JSON.parse(await decryptText(key, o));
}
