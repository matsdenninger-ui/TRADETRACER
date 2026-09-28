/* ---------------------------------------------------------------------- */
/* Screenshots im Sync: je Bild ein eigenes geheimes Gist.                 */
/* So bleibt die Hauptdatei klein und Bilder werden nur bei Bedarf         */
/* heruntergeladen.                                                        */
/* ---------------------------------------------------------------------- */

const IMG_GIST_DESC = 'TradeTracer Screenshot (Sync – nicht löschen)';

async function uploadImageGist(token, imgId, dataUrl, key) {
  const content = key ? JSON.stringify(await encryptText(key, dataUrl)) : dataUrl;
  const g = await ghApi('/gists', token, {
    method: 'POST',
    body: { description: `${IMG_GIST_DESC} ${imgId}`, public: false, files: { [`${imgId}.txt`]: { content } } }
  });
  return { gist: g.id, enc: !!key };
}

async function downloadImageGist(token, entry, imgId, key) {
  const g = await ghApi(`/gists/${entry.gist}`, token);
  const file = g.files && (g.files[`${imgId}.txt`] || Object.values(g.files)[0]);
  const content = await gistFileContent(file);
  if (!content) return null;
  if (content.startsWith('data:')) return content;
  if (!key) throw new Error('Screenshot ist verschlüsselt – Sync-Passwort fehlt.');
  return decryptText(key, JSON.parse(content));
}

async function deleteImageGist(token, gistId) {
  try { await ghApi(`/gists/${gistId}`, token, { method: 'DELETE' }); }
  catch (e) { if (!/nicht gefunden/.test(e.message)) throw e; }
}

/* Vereinigt zwei { id: {…, _u} }-Maps; der neueste Eintrag gewinnt */
function mergeStampedMaps(a = {}, b = {}) {
  const out = { ...b };
  Object.entries(a || {}).forEach(([k, v]) => { out[k] = mergeByStamp(out[k], v); });
  return out;
}

/* Stabile JSON-Darstellung (sortierte Schlüssel, Datensätze nach id) –
   damit der Sync nur schreibt, wenn sich wirklich etwas geändert hat. */
function canonicalJSON(v) {
  if (Array.isArray(v)) {
    const byId = v.length && v.every(x => x && typeof x === 'object' && 'id' in x);
    const arr = byId ? [...v].sort((a, b) => String(a.id).localeCompare(String(b.id))) : v;
    return '[' + arr.map(canonicalJSON).join(',') + ']';
  }
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}
