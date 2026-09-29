/* ---------------------------------------------------------------------- */
/* Konto-Umschalter                                                        */
/* ---------------------------------------------------------------------- */

function AccountSwitcher({ accounts, active, onChange, trades, currency, currencyFor, fx }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const balanceOf = (acc) => acc.startingBalance + sum(trades.filter(t => t.accountId === acc.id).map(calcPnL));
  const totalBalance = sum(accounts.map(a => balanceOf(a) * fxRate(currencyFor(a.id), currency, fx)));
  const current = accounts.find(a => a.id === active);
  const Dot = ({ acc }) => acc
    ? <span className="account-dot" style={{ background: `linear-gradient(135deg, hsl(${acc.hue} 80% 70%), hsl(${acc.hue} 70% 45%))` }}>{acc.name.slice(0, 1).toUpperCase()}</span>
    : <span className="account-dot" style={{ background: 'linear-gradient(135deg, #fff, #8C93A1)' }}><Icon name="Layers" size={12} strokeWidth={2.4} /></span>;

  return (
    <div className="account-switch" ref={ref}>
      <button className="account-btn" onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}>
        <Dot acc={current} />
        <span className="acc-name">{current ? current.name : 'Alle Konten'}</span>
        <Icon name="ChevronDown" size={14} />
      </button>
      {open && (
        <div className="account-menu glass-strong" role="listbox">
          <button className={`account-item ${active === 'all' ? 'active' : ''}`} onClick={() => { onChange('all'); setOpen(false); }}>
            <Dot acc={null} /> Alle Konten <span className="acc-meta">{fmtMoneyShort(totalBalance, currency)}</span>
          </button>
          <div className="account-menu-sep" />
          {accounts.map(a => (
            <button key={a.id} className={`account-item ${active === a.id ? 'active' : ''}`} onClick={() => { onChange(a.id); setOpen(false); }}>
              <Dot acc={a} /> {a.name} <span className="acc-meta">{fmtMoneyShort(balanceOf(a), currencyFor(a.id))}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Hauptanwendung                                                          */
/* ---------------------------------------------------------------------- */

const TABS = [
  { id: 'dashboard', label: 'Übersicht', icon: 'Wallet' },
  { id: 'trades', label: 'Trades', icon: 'List' },
  { id: 'calendar', label: 'Kalender', icon: 'Calendar' },
  { id: 'analytics', label: 'Analyse', icon: 'BarChart3', pro: true },
  { id: 'coach', label: 'Coach', icon: 'Sparkles', pro: true },
  { id: 'tools', label: 'Tools', icon: 'Calculator', pro: true },
  { id: 'plan', label: 'Plan', icon: 'Compass' }
];

const REVIEWS_KEY = 'journal:reviews';
const IMAGES_INDEX_KEY = 'journal:images-index';

function useResolvedTheme(pref) {
  const query = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const [sysLight, setSysLight] = useState(query);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setSysLight(mq.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, []);
  return pref === 'light' || (pref === 'system' && sysLight) ? 'light' : 'dark';
}

function App() {
  const [trades, setTrades] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [plan, setPlan] = useState(DEFAULT_PLAN);
  const [mindset, setMindset] = useState({});
  const [reviews, setReviews] = useState({});
  const [mindsetDate, setMindsetDate] = useState(null);
  const [updateReady, setUpdateReady] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [modalTrade, setModalTrade] = useState(undefined); // undefined=zu, null=neu, Objekt=bearbeiten
  const [detailId, setDetailId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const undoRef = useRef(null);

  setPrivacy(settings.privacy);
  const theme = useResolvedTheme(settings.theme);

  useEffect(() => {
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F4F5F8' : '#07090E');
    document.documentElement.style.background = theme === 'light' ? '#F4F5F8' : '#07090E';
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  // Neue App-Version verfügbar (Service Worker)
  useEffect(() => {
    const on = (e) => setUpdateReady(() => e.detail);
    window.addEventListener('tt-update', on);
    return () => window.removeEventListener('tt-update', on);
  }, []);

  useEffect(() => {
    (async () => {
      let loadedSettings = DEFAULT_SETTINGS;
      try {
        const s = await window.storage.get(SETTINGS_KEY);
        if (s?.value) loadedSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(s.value) };
      } catch (e) { /* Standardwerte */ }
      let accs = null;
      try {
        const a = await window.storage.get(ACCOUNTS_KEY);
        if (a?.value) accs = JSON.parse(a.value);
      } catch (e) { /* keine Konten */ }
      if (!Array.isArray(accs) || accs.length === 0) {
        // Migration aus der Vorversion: ein Hauptkonto mit dem bisherigen Startkapital
        accs = [{ id: 'acc_main', name: 'Hauptkonto', startingBalance: loadedSettings.startingBalance ?? 10000, hue: 38 }];
      }
      try {
        const t = await window.storage.get(TRADES_KEY);
        if (t?.value) setTrades(JSON.parse(t.value).map(tr => normalizeTrade(tr, accs[0].id)));
      } catch (e) { /* keine Daten */ }
      try {
        const p = await window.storage.get(PLAN_KEY);
        if (p?.value) setPlan({ ...DEFAULT_PLAN, ...JSON.parse(p.value) });
      } catch (e) { /* Standard-Plan */ }
      try {
        const m = await window.storage.get(MINDSET_KEY);
        if (m?.value) setMindset(JSON.parse(m.value));
      } catch (e) { /* keine Mindset-Daten */ }
      try {
        const r = await window.storage.get(REVIEWS_KEY);
        if (r?.value) { const v = JSON.parse(r.value); reviewsRef.current = v; setReviews(v); }
      } catch (e) { /* keine Rückblicke */ }
      try {
        const ix = await window.storage.get(IMAGES_INDEX_KEY);
        if (ix?.value) imagesRef.current = JSON.parse(ix.value);
      } catch (e) { /* kein Bild-Index */ }
      try {
        const tb = await window.storage.get(TOMB_KEY);
        if (tb?.value) tombRef.current = { trades: {}, accounts: {}, ...JSON.parse(tb.value) };
      } catch (e) { /* keine Grabsteine */ }
      if (loadedSettings.activeAccount !== 'all' && !accs.some(a => a.id === loadedSettings.activeAccount)) loadedSettings.activeAccount = 'all';
      setAccounts(accs);
      setSettings(loadedSettings);
      setLoading(false);
    })();
  }, []);

  const save = useCallback(async (key, value) => {
    try { await window.storage.set(key, JSON.stringify(value)); }
    catch (e) {
      console.error('Speichern fehlgeschlagen', e);
      showToast({ text: 'Speichern fehlgeschlagen – ist der Browser-Speicher voll?' });
    }
  }, []);

  /* ------------------------------------------------------------------ */
  /* Aktueller Stand als Refs – der Sync arbeitet asynchron darauf       */
  /* ------------------------------------------------------------------ */
  const tradesRef = useRef(trades); tradesRef.current = trades;
  const accountsRef = useRef(accounts); accountsRef.current = accounts;
  const mindsetRef = useRef(mindset); mindsetRef.current = mindset;
  const planRef = useRef(plan); planRef.current = plan;
  const settingsRef = useRef(settings); settingsRef.current = settings;
  const reviewsRef = useRef(reviews); reviewsRef.current = reviews;
  const imagesRef = useRef({});
  const tombRef = useRef({ trades: {}, accounts: {} });
  const [syncCfg, setSyncCfg] = useState(() => loadSyncCfg());
  const syncCfgRef = useRef(syncCfg); syncCfgRef.current = syncCfg;
  const [syncState, setSyncState] = useState({ state: syncCfg?.enabled ? 'idle' : 'off', at: syncCfg?.lastSync || null, error: null });
  const syncTimerRef = useRef(null);
  const syncBusyRef = useRef(false);
  const syncAgainRef = useRef(false);
  const runSyncRef = useRef(null);

  const scheduleSync = useCallback((delay = 1500) => {
    if (!syncCfgRef.current?.enabled) return;
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => runSyncRef.current && runSyncRef.current(), delay);
  }, []);

  const saveTombs = useCallback((next) => { tombRef.current = next; save(TOMB_KEY, next); }, [save]);

  /* Vergleicht alten und neuen Stand: geänderte Einträge bekommen einen Zeitstempel,
     entfernte einen "Grabstein" – so weiß der Sync, was auf anderen Geräten zu tun ist. */
  const stampList = (prev, next, kind) => {
    const now = Date.now();
    const prevById = new Map(prev.map(x => [x.id, x]));
    const nextIds = new Set(next.map(x => x.id));
    const tomb = { ...tombRef.current[kind] };
    let tombChanged = false;
    prev.forEach(x => { if (!nextIds.has(x.id)) { tomb[x.id] = now; tombChanged = true; } });
    const stamped = next.map(x => {
      if (prevById.get(x.id) === x) return x;
      if (tomb[x.id]) { delete tomb[x.id]; tombChanged = true; }
      return { ...x, updatedAt: now };
    });
    if (tombChanged) saveTombs({ ...tombRef.current, [kind]: tomb });
    return stamped;
  };

  const persistTrades = useCallback((next) => {
    const stamped = stampList(tradesRef.current, next, 'trades');
    tradesRef.current = stamped; setTrades(stamped); save(TRADES_KEY, stamped); scheduleSync();
  }, [save, scheduleSync]);
  const persistAccounts = useCallback((next) => {
    const stamped = stampList(accountsRef.current, next, 'accounts');
    accountsRef.current = stamped; setAccounts(stamped); save(ACCOUNTS_KEY, stamped); scheduleSync();
  }, [save, scheduleSync]);
  const persistSettings = useCallback((next) => {
    const prev = settingsRef.current;
    const synced = next.currency !== prev.currency || next.accentHue !== prev.accentHue || JSON.stringify(next.fx || {}) !== JSON.stringify(prev.fx || {});
    const out = synced ? { ...next, _prefsU: Date.now() } : next;
    settingsRef.current = out; setSettings(out); save(SETTINGS_KEY, out);
    if (synced) scheduleSync();
  }, [save, scheduleSync]);
  const persistPlan = useCallback((next) => {
    const out = { ...next, _u: Date.now() };
    planRef.current = out; setPlan(out); save(PLAN_KEY, out); scheduleSync();
  }, [save, scheduleSync]);
  const persistReviews = useCallback((next) => {
    reviewsRef.current = next; setReviews(next); save(REVIEWS_KEY, next); scheduleSync();
  }, [save, scheduleSync]);
  const persistMindset = useCallback((next) => {
    const prev = mindsetRef.current;
    const now = Date.now();
    const out = {};
    Object.entries(next).forEach(([d, e]) => { out[d] = prev[d] === e ? e : { ...e, _u: now }; });
    mindsetRef.current = out; setMindset(out); save(MINDSET_KEY, out); scheduleSync();
  }, [save, scheduleSync]);

  /* ------------------------------------------------------------------ */
  /* Geräte-Sync (GitHub Gist, optional Ende-zu-Ende-verschlüsselt)      */
  /* ------------------------------------------------------------------ */
  const keyRef = useRef(null); // CryptoKey aus dem Sync-Passwort

  const getKey = async () => {
    const cfg = syncCfgRef.current;
    if (!cfg?.keyB64) return null;
    if (!keyRef.current) keyRef.current = await importSyncKey(cfg.keyB64);
    return keyRef.current;
  };

  const updateCfg = (patch) => {
    const nc = { ...syncCfgRef.current, ...patch };
    syncCfgRef.current = nc; setSyncCfg(nc); saveSyncCfg(nc);
  };

  const localSnapshot = () => ({
    trades: tradesRef.current, accounts: accountsRef.current, mindset: mindsetRef.current,
    plan: planRef.current, tombstones: tombRef.current, reviews: reviewsRef.current, images: imagesRef.current,
    prefs: { currency: settingsRef.current.currency, accentHue: settingsRef.current.accentHue, fx: settingsRef.current.fx || {}, _u: settingsRef.current._prefsU || 0 }
  });

  const applySnapshot = (m) => {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const accs = m.accounts.length ? m.accounts : accountsRef.current;
    const trades = m.trades.map(t => normalizeTrade(t, accs[0].id));
    if (!same(trades, tradesRef.current)) { tradesRef.current = trades; setTrades(trades); save(TRADES_KEY, trades); }
    if (!same(accs, accountsRef.current)) { accountsRef.current = accs; setAccounts(accs); save(ACCOUNTS_KEY, accs); }
    if (!same(m.mindset, mindsetRef.current)) { mindsetRef.current = m.mindset; setMindset(m.mindset); save(MINDSET_KEY, m.mindset); }
    if (m.plan && !same(m.plan, planRef.current)) { const p = { ...DEFAULT_PLAN, ...m.plan }; planRef.current = p; setPlan(p); save(PLAN_KEY, p); }
    if (!same(m.reviews, reviewsRef.current)) { reviewsRef.current = m.reviews; setReviews(m.reviews); save(REVIEWS_KEY, m.reviews); }
    if (!same(m.tombstones, tombRef.current)) saveTombs(m.tombstones);
    if (!same(m.images || {}, imagesRef.current)) { imagesRef.current = m.images || {}; save(IMAGES_INDEX_KEY, imagesRef.current); }
    const cur = settingsRef.current;
    let ns = cur;
    if (m.prefs && (m.prefs._u || 0) > (cur._prefsU || 0)) {
      ns = { ...cur, currency: m.prefs.currency ?? cur.currency, accentHue: m.prefs.accentHue ?? cur.accentHue, fx: m.prefs.fx ?? cur.fx, _prefsU: m.prefs._u };
    }
    if (ns.activeAccount !== 'all' && !accs.some(a => a.id === ns.activeAccount)) ns = { ...ns, activeAccount: 'all' };
    if (ns !== cur) { settingsRef.current = ns; setSettings(ns); save(SETTINGS_KEY, ns); }
  };

  const runSync = async () => {
    const cfg = syncCfgRef.current;
    if (!cfg?.enabled || !cfg.token) return false;
    if (syncBusyRef.current) { syncAgainRef.current = true; return false; }
    if (!navigator.onLine) { setSyncState(s => ({ ...s, state: 'offline' })); return false; }
    syncBusyRef.current = true;
    setSyncState(s => ({ ...s, state: 'syncing', error: null }));
    try {
      let gistId = cfg.gistId;
      if (!gistId) { gistId = (await findOrCreateGist(cfg.token)).id; updateCfg({ gistId }); }
      const key = await getKey();
      const gist = await ghApi(`/gists/${gistId}`, cfg.token);
      const rawRemote = await gistFileContent(gist.files?.[GIST_FILE]);
      if (isSealed(rawRemote) && !cfg.encrypted) updateCfg({ encrypted: true });
      if (key && cfg.salt && isSealed(rawRemote) && JSON.parse(rawRemote).enc.salt !== cfg.salt) {
        const err = new Error('Das Sync-Passwort wurde auf einem anderen Gerät geändert – bitte gib das neue Passwort ein.');
        err.code = 'LOCKED';
        throw err;
      }
      const remote = await openPayload(rawRemote, key); // wirft LOCKED, wenn verschlüsselt und kein Passwort

      // Zusammenführen – danach nochmals mit dem allerneuesten lokalen Stand,
      // falls während des Downloads etwas geändert wurde.
      let merged = mergeSnapshots(localSnapshot(), remote);
      merged = mergeSnapshots(localSnapshot(), merged);

      // Altes Format: Screenshots lagen als img_*-Dateien im Haupt-Gist → in eigene Gists umziehen
      const legacy = Object.keys(gist.files || {}).filter(f => f.startsWith('img_') && f.endsWith('.txt'));
      const images = { ...(merged.images || {}) };
      for (const f of legacy) {
        const id = f.slice(4, -4);
        if (images[id]) continue;
        let v = await window.imageStore.get(id);
        if (!v) { v = await gistFileContent(gist.files[f]); if (v) await window.imageStore.set(id, v); }
        if (v) images[id] = { ...(await uploadImageGist(cfg.token, id, v, key)), ...(key ? { salt: cfg.salt } : {}), _u: Date.now() };
      }

      // Screenshots: neue hochladen, unverschlüsselte neu verschlüsseln, verwaiste löschen
      const referenced = new Set(merged.trades.flatMap(t => t.screenshots || []));
      for (const id of referenced) {
        const entry = images[id];
        // überspringen, wenn schon mit dem aktuellen Schlüssel hochgeladen
        if (entry && !entry.deleted && (!key || (entry.enc && (entry.salt || cfg.salt) === cfg.salt))) continue;
        const v = await window.imageStore.get(id);
        if (!v) continue; // liegt nur auf einem anderen Gerät – wird dort hochgeladen
        const up = await uploadImageGist(cfg.token, id, v, key);
        if (entry?.gist && !entry.deleted) await deleteImageGist(cfg.token, entry.gist);
        images[id] = { ...up, ...(key ? { salt: cfg.salt } : {}), _u: Date.now() };
      }
      for (const [id, entry] of Object.entries(images)) {
        if (referenced.has(id) || entry.deleted) continue;
        await deleteImageGist(cfg.token, entry.gist);
        images[id] = { deleted: true, _u: Date.now() }; // Grabstein, damit andere Geräte es nicht erneut hochladen
      }
      merged = { ...merged, images };
      applySnapshot(merged);

      const body = { app: 'TradeTracer', version: 3, ...merged };
      const changed = canonicalJSON(merged) !== canonicalJSON(mergeSnapshots(remote, remote));
      const needsWrite = changed || !rawRemote || legacy.length > 0 || (!!key && !isSealed(rawRemote));
      if (needsWrite) {
        const files = { [GIST_FILE]: { content: await sealPayload({ ...body, syncedAt: new Date().toISOString() }, key, cfg.salt) } };
        legacy.forEach(f => { files[f] = null; });
        await ghApi(`/gists/${gistId}`, cfg.token, { method: 'PATCH', body: { files } });
      }
      const at = Date.now();
      updateCfg({ lastSync: at, encrypted: !!key || !!cfg.encrypted });
      setSyncState({ state: 'ok', at, error: null });
      return true;
    } catch (e) {
      console.error('Sync fehlgeschlagen', e);
      setSyncState(s => ({ ...s, state: e.code === 'LOCKED' ? 'locked' : 'error', error: e.message || String(e) }));
      if (e.code === 'LOCKED') updateCfg({ encrypted: true });
      return false;
    } finally {
      syncBusyRef.current = false;
      if (syncAgainRef.current) { syncAgainRef.current = false; scheduleSync(500); }
    }
  };
  runSyncRef.current = runSync;

  /* Fehlende Screenshots bei Bedarf aus dem Sync nachladen */
  useEffect(() => {
    REMOTE_IMAGE_LOADER = syncCfg?.enabled ? async (id) => {
      const entry = imagesRef.current[id];
      if (!entry || entry.deleted || !syncCfgRef.current?.token) return null;
      return downloadImageGist(syncCfgRef.current.token, entry, id, await getKey());
    } : null;
    return () => { REMOTE_IMAGE_LOADER = null; };
  }, [syncCfg?.enabled]);

  /* Liest den Gist-Kopf, um Salt/Verschlüsselung zu erfahren */
  const readRemoteEnvelope = async (token, gistId) => {
    const gist = await ghApi(`/gists/${gistId}`, token);
    const raw = await gistFileContent(gist.files?.[GIST_FILE]);
    let env = null;
    try { env = raw ? JSON.parse(raw) : null; } catch (e) { /* ignorieren */ }
    return { raw, env };
  };

  /* Prüft das Passwort gegen vorhandene Daten bzw. legt neue Verschlüsselung an */
  const keyFromPassphrase = async (token, gistId, pass) => {
    const { raw, env } = await readRemoteEnvelope(token, gistId);
    if (env && env.enc) {
      const key = await deriveSyncKey(pass, env.enc.salt, env.enc.iter);
      await openPayload(raw, key); // wirft bei falschem Passwort
      return { key, salt: env.enc.salt };
    }
    const salt = newSalt();
    return { key: await deriveSyncKey(pass, salt), salt };
  };

  const connectSync = async (token, pass) => {
    const t = token.trim();
    if (!t) throw new Error('Bitte einen Token eingeben.');
    const { id, created } = await findOrCreateGist(t);
    let keyB64 = null, salt = null, encrypted = false;
    if (pass) {
      const r = await keyFromPassphrase(t, id, pass);
      keyB64 = await exportSyncKey(r.key); salt = r.salt; encrypted = true;
      keyRef.current = null;
    } else {
      const { env } = await readRemoteEnvelope(t, id);
      encrypted = !!(env && env.enc);
    }
    const cfg = { token: t, gistId: id, enabled: true, lastSync: null, keyB64, salt, encrypted };
    syncCfgRef.current = cfg; setSyncCfg(cfg); saveSyncCfg(cfg);
    setSyncState({ state: encrypted && !keyB64 ? 'locked' : 'idle', at: null, error: null });
    if (!(encrypted && !keyB64)) await runSyncRef.current();
    return { created };
  };

  /* Neuer GitHub-Token für ein bereits verbundenes Gerät – Schlüssel und Gist bleiben,
     deshalb ist kein Sync-Passwort nötig. */
  const replaceToken = async (token) => {
    const t = token.trim();
    const cfg = syncCfgRef.current;
    if (!t) throw new Error('Bitte einen Token eingeben.');
    if (cfg.gistId) {
      try { await ghApi(`/gists/${cfg.gistId}`, t); }
      catch (e) {
        if (/nicht gefunden/.test(e.message)) throw new Error('Mit diesem Token ist dein bisheriger Sync nicht erreichbar. Der Token muss zum selben GitHub-Konto gehören und die Berechtigung „gist“ haben – oder das alte Sync-Gist wurde gelöscht.');
        throw e;
      }
    } else {
      await ghApi('/gists?per_page=1', t);
    }
    updateCfg({ token: t });
    setSyncState(s => ({ ...s, state: 'idle', error: null }));
    await runSyncRef.current();
  };

  /* Neues Sync-Passwort: auf einem Gerät, das den Schlüssel noch hat. Alle Daten und
     Screenshots werden mit dem neuen Schlüssel neu verschlüsselt; andere Geräte melden
     danach "gesperrt" und brauchen einmal das neue Passwort. */
  const changeSyncPassword = async (pass) => {
    if (!syncCfgRef.current?.enabled || !syncCfgRef.current.keyB64) throw new Error('Dieses Gerät ist nicht verschlüsselt verbunden.');
    while (syncBusyRef.current) await new Promise(r => setTimeout(r, 200));
    if (!(await runSyncRef.current())) throw new Error('Der Sync läuft gerade nicht – bitte zuerst den angezeigten Fehler beheben (z.B. neuen Token eintragen).');
    syncBusyRef.current = true;
    try {
      const cfg = syncCfgRef.current;
      const oldKey = await getKey();
      // Screenshots, die nur auf anderen Geräten liegen, vorher herunterladen – sonst wären sie danach unlesbar
      const idx = { ...imagesRef.current };
      let missing = 0;
      for (const [id, entry] of Object.entries(idx)) {
        if (entry.deleted) continue;
        if (!(await window.imageStore.get(id))) {
          try { const v = await downloadImageGist(cfg.token, entry, id, oldKey); if (v) { await window.imageStore.set(id, v); imageCache.set(id, v); } }
          catch (e) { missing++; }
        }
        idx[id] = { ...entry, salt: entry.salt || cfg.salt };
      }
      imagesRef.current = idx; save(IMAGES_INDEX_KEY, idx);
      const salt = newSalt();
      const key = await deriveSyncKey(pass, salt);
      const snap = localSnapshot();
      const body = { app: 'TradeTracer', version: 3, ...mergeSnapshots(snap, snap), syncedAt: new Date().toISOString() };
      await ghApi(`/gists/${cfg.gistId}`, cfg.token, { method: 'PATCH', body: { files: { [GIST_FILE]: { content: await sealPayload(body, key, salt) } } } });
      keyRef.current = null;
      updateCfg({ keyB64: await exportSyncKey(key), salt, encrypted: true });
      if (missing) console.warn(`${missing} Screenshots konnten nicht übernommen werden`);
    } finally {
      syncBusyRef.current = false;
    }
    await runSyncRef.current(); // Screenshots mit dem neuen Schlüssel neu hochladen
  };

  const unlockSync = async (pass) => {
    const cfg = syncCfgRef.current;
    const r = await keyFromPassphrase(cfg.token, cfg.gistId, pass);
    keyRef.current = null;
    updateCfg({ keyB64: await exportSyncKey(r.key), salt: r.salt, encrypted: true });
    setSyncState(s => ({ ...s, state: 'idle', error: null }));
    await runSyncRef.current();
  };

  const disconnectSync = () => {
    keyRef.current = null;
    syncCfgRef.current = null; setSyncCfg(null); saveSyncCfg(null);
    setSyncState({ state: 'off', at: null, error: null });
  };

  // Automatisch syncen: beim Start, bei Rückkehr in die App, wieder online und jede Minute
  useEffect(() => {
    if (loading || !syncCfg?.enabled) return;
    scheduleSync(300);
    const onFocus = () => { if (!document.hidden) scheduleSync(200); };
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onFocus);
    const iv = setInterval(() => { if (!document.hidden) scheduleSync(0); }, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onFocus);
      clearInterval(iv);
    };
  }, [loading, syncCfg?.enabled, scheduleSync]);

  function showToast(t, ms = 6000) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(t);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      if (undoRef.current) { undoRef.current.finalize?.(); undoRef.current = null; }
    }, ms);
  }

  const active = settings.activeAccount || 'all';
  const base = settings.currency;
  const fx = settings.fx || {};
  const accountsById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);
  const currencyFor = useCallback((accId) => accountCurrency(accountsById[accId], base), [accountsById, base]);
  // Anzeigewährung: Kontowährung bzw. bei "Alle Konten" die Basiswährung (mit Umrechnung)
  const viewCurrency = active === 'all' ? base : currencyFor(active);
  const visibleTrades = useMemo(() => {
    if (active !== 'all') return trades.filter(t => t.accountId === active);
    return hasMixedCurrencies(accounts, base) ? convertTradesToBase(trades, accountsById, base, fx) : trades;
  }, [trades, active, accounts, accountsById, base, fx]);
  const realizedTrades = useMemo(() => visibleTrades.filter(isRealized), [visibleTrades]);
  const openTrades = useMemo(() => (active === 'all' ? trades : visibleTrades).filter(isOpen), [trades, visibleTrades, active]);
  const startingBalance = active === 'all'
    ? sum(accounts.map(a => (Number(a.startingBalance) || 0) * fxRate(accountCurrency(a, base), base, fx)))
    : (Number(accountsById[active]?.startingBalance) || 0);
  const defaultAccountId = active === 'all' ? accounts[0]?.id : active;
  const stats = useMemo(() => computeStats(realizedTrades, startingBalance), [realizedTrades, startingBalance]);
  const insights = useMemo(() => computeInsights(realizedTrades, stats, mindset, plan, viewCurrency), [realizedTrades, stats, mindset, plan, viewCurrency, settings.privacy]);
  const limitStatus = useMemo(() => dailyLimitStatus(trades, plan, todayISO(), active === 'all' ? null : active), [trades, plan, active]);
  const mixedWithoutFx = active === 'all' && accounts.some(a => accountCurrency(a, base) !== base && !(Number(fx[accountCurrency(a, base)]) > 0));
  const streak = useMemo(() => journalStreak(mindset), [mindset]);
  const knownTags = useMemo(() => [...new Set(trades.flatMap(t => t.tags || []))], [trades]);
  const detailTrade = detailId ? trades.find(t => t.id === detailId) : null;

  // Tastenkürzel
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (modalTrade !== undefined || showSettings || showImport || showReport || mindsetDate || detailId) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setModalTrade(null); }
      else if (e.key === 'p' || e.key === 'P') persistSettings({ ...settings, privacy: !settings.privacy });
      else if (/^[1-7]$/.test(e.key)) { setTab(TABS[Number(e.key) - 1].id); setDetailId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalTrade, showSettings, showImport, showReport, mindsetDate, detailId, settings, persistSettings]);

  const handleMindsetChange = (dayEntry, date = todayISO()) => persistMindset({ ...mindsetRef.current, [date]: dayEntry });

  const handleSaveTrade = (trade) => {
    const exists = trades.some(t => t.id === trade.id);
    const next = exists ? trades.map(t => t.id === trade.id ? trade : t) : [...trades, trade];
    persistTrades(next);
    setModalTrade(undefined);
    if (!exists) {
      const pnl = calcPnL(trade);
      showToast({ text: isRealized(trade)
        ? <>Trade <strong>{trade.symbol}</strong> gespeichert · <span className={pnl >= 0 ? 'txt-profit' : 'txt-loss'}>{fmtMoneySigned(pnl, currencyFor(trade.accountId))}</span></>
        : <>Offene Position <strong>{trade.symbol}</strong> gespeichert.</> }, 3500);
    }
  };

  const handleDelete = (id) => {
    const removed = trades.find(t => t.id === id);
    if (!removed) return;
    if (undoRef.current) { undoRef.current.finalize?.(); undoRef.current = null; }
    persistTrades(trades.filter(t => t.id !== id));
    setDetailId(null);
    undoRef.current = {
      trade: removed,
      // Screenshots erst endgültig löschen, wenn das Rückgängig-Fenster abgelaufen ist
      finalize: () => (removed.screenshots || []).forEach(sid => { window.imageStore.delete(sid); imageCache.delete(sid); })
    };
    showToast({ text: <>Trade <strong>{removed.symbol}</strong> gelöscht.</>, undo: true });
  };

  const handleUndoDelete = () => {
    const u = undoRef.current;
    if (!u) return;
    undoRef.current = null;
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    persistTrades([...tradesRef.current, u.trade]);
    setToast(null);
  };

  const handleDuplicate = (t) => {
    setDetailId(null);
    setModalTrade({ ...t, id: undefined, createdAt: undefined, updatedAt: undefined, date: todayISO(), exitDate: '', screenshots: [], notes: '', legs: null });
  };

  const handleExportBackup = async () => {
    const images = {};
    for (const t of trades) for (const id of t.screenshots || []) {
      const v = await window.imageStore.get(id);
      if (v) images[id] = v;
    }
    const payload = { app: 'TradeTracer', version: 3, exportedAt: new Date().toISOString(), trades, accounts, settings, plan, mindset, reviews, images };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tradetracer-backup-${todayISO()}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (data) => {
    let accs = accounts;
    if (Array.isArray(data.accounts) && data.accounts.length) { accs = data.accounts; persistAccounts(accs); }
    else if (data.settings?.startingBalance != null && !data.accounts) {
      accs = [{ ...accounts[0], startingBalance: data.settings.startingBalance }, ...accounts.slice(1)];
      persistAccounts(accs);
    }
    if (Array.isArray(data.trades)) persistTrades(data.trades.map(t => normalizeTrade(t, accs[0].id)));
    if (data.settings) persistSettings({ ...DEFAULT_SETTINGS, ...data.settings, activeAccount: 'all' });
    if (data.plan) persistPlan({ ...DEFAULT_PLAN, ...data.plan });
    if (data.mindset) persistMindset(data.mindset);
    if (data.reviews) persistReviews(data.reviews);
    if (data.images) for (const [id, v] of Object.entries(data.images)) { await window.imageStore.set(id, v); imageCache.set(id, v); }
  };

  const handleImportTrades = (newTrades) => persistTrades([...trades, ...newTrades]);

  const handleReset = async () => {
    persistTrades([]);
    await window.imageStore.clear();
    imageCache.clear();
    setShowSettings(false);
  };

  const handleSaveSettings = (s, accs) => {
    const ids = new Set(accs.map(a => a.id));
    const removedTrades = trades.filter(t => !ids.has(t.accountId));
    if (removedTrades.length) {
      removedTrades.forEach(t => (t.screenshots || []).forEach(sid => window.imageStore.delete(sid)));
      persistTrades(trades.filter(t => ids.has(t.accountId)));
    }
    persistAccounts(accs.map(a => ({ ...a, name: a.name.trim() || 'Konto', startingBalance: Number(a.startingBalance) || 0, currency: (a.currency || '').trim() && a.currency.trim() !== s.currency ? a.currency.trim() : '' })));
    persistSettings({ ...s, activeAccount: ids.has(s.activeAccount) ? s.activeAccount : 'all' });
    setShowSettings(false);
  };

  if (loading) {
    return <div className="app-shell loading-shell" data-theme={theme} style={{ '--accent-h': settings.accentHue }}><div className="loader" /></div>;
  }

  const currency = viewCurrency;
  const accountName = active === 'all' ? 'Alle Konten' : accountsById[active]?.name;
  const openTrade = (t) => setDetailId(t.id);
  const goto = (id) => { setTab(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className={`app-shell ${settings.privacy ? 'privacy' : ''}`} data-theme={theme} style={{ '--accent-h': settings.accentHue }}>
      <ShaderBackground hue={settings.accentHue} animated={settings.animatedBg} light={theme === 'light'} />
      <a href="#main" className="skip-link">Zum Inhalt springen</a>

      <div className="app-content">
        <header className="top-header glass-strong">
          <div className="brand">
            <LiquidLogo hue={settings.accentHue} />
            <div style={{ minWidth: 0 }}>
              <div className="brand-name">TradeTracer <span className="pro-badge">PRO</span></div>
              <div className="brand-sub">Dein Trading-Journal · {accountName}</div>
            </div>
          </div>
          <div className="header-actions">
            <AccountSwitcher accounts={accounts} active={active} trades={trades} currency={base} currencyFor={currencyFor} fx={fx}
              onChange={(id) => persistSettings({ ...settings, activeAccount: id })} />
            <button className={`icon-btn hide-sm ${settings.privacy ? 'active' : ''}`} title="Privatsphäre-Modus (P)" aria-label="Privatsphäre-Modus"
              onClick={() => persistSettings({ ...settings, privacy: !settings.privacy })}>
              <Icon name={settings.privacy ? 'EyeOff' : 'Eye'} size={16} />
            </button>
            <button className="icon-btn hide-sm" title="Report" aria-label="Report" onClick={() => setShowReport(true)}><Icon name="FileText" size={16} /></button>
            <button className={`icon-btn sync-btn s-${syncState.state}`} aria-label="Geräte-Sync"
              title={syncState.state === 'off' ? 'Geräte-Sync einrichten' : syncState.state === 'locked' ? 'Sync gesperrt – Passwort eingeben' : syncState.state === 'error' ? `Sync-Fehler: ${syncState.error}` : `Sync: ${fmtAgo(syncState.at)}`}
              onClick={() => ['off', 'error', 'locked'].includes(syncState.state) ? setShowSettings(true) : runSyncRef.current()}>
              <Icon name={syncState.state === 'off' ? 'CloudOff' : syncState.state === 'syncing' ? 'RefreshCw' : 'Cloud'} size={16} className={syncState.state === 'syncing' ? 'spin' : ''} />
              {syncState.state !== 'off' && <span className={`sync-dot s-${syncState.state}`} />}
            </button>
            <button className="icon-btn" title="Einstellungen" aria-label="Einstellungen" onClick={() => setShowSettings(true)}><Icon name="Settings" size={16} /></button>
            <button className="btn-primary hide-sm" onClick={() => setModalTrade(null)}><Icon name="Plus" size={15} /> Trade erfassen</button>
          </div>
        </header>

        <TabNav tabs={TABS} active={tab} onChange={goto} />

        {mixedWithoutFx && (
          <div className="limit-banner" role="status">
            <span className="plan-icon tone-accent"><Icon name="Percent" size={16} /></span>
            <div><strong>Umrechnungskurs fehlt</strong><p>Konten in anderen Währungen werden 1:1 gezählt. Trage in den Einstellungen unter „Konten“ einen Kurs ein.</p></div>
            <button className="btn-ghost" onClick={() => setShowSettings(true)}>Einstellungen</button>
          </div>
        )}

        <main key={`${tab}-${active}`} id="main" tabIndex={-1}>
          {tab === 'dashboard' && (
            <Dashboard trades={realizedTrades} openTrades={openTrades} currencyFor={currencyFor} limitStatus={limitStatus} stats={stats} currency={currency} plan={plan} insights={insights} streak={streak}
              startingBalance={startingBalance}
              onAdd={() => setModalTrade(null)} onImport={() => setShowImport(true)}
              mindsetEntry={mindset[todayISO()] || defaultMindsetEntry()} onMindsetChange={(e) => handleMindsetChange(e)}
              onOpenTrade={openTrade} onGoto={goto} />
          )}
          {tab === 'trades' && (
            <TradesView trades={visibleTrades} currency={currency} onOpen={openTrade} onEdit={setModalTrade} onDelete={handleDelete}
              onAdd={() => setModalTrade(null)} onImport={() => setShowImport(true)}
              showAccount={active === 'all' && accounts.length > 1} accountsById={accountsById} />
          )}
          {tab === 'calendar' && <CalendarView trades={realizedTrades} currency={currency} mindset={mindset} onOpenTrade={openTrade} onEditMindset={setMindsetDate} />}
          {tab === 'analytics' && <AnalyticsView trades={realizedTrades} stats={stats} currency={currency} mindset={mindset} onReport={() => setShowReport(true)} />}
          {tab === 'coach' && (
            <CoachView trades={realizedTrades} stats={stats} insights={insights} mindset={mindset} currency={currency} onAdd={() => setModalTrade(null)}
              ai={{ plan, accountName, reviews, onSaveReview: (id, r) => persistReviews({ ...reviewsRef.current, [id]: { ...r, _u: Date.now() } }),
                onDeleteReview: (id) => persistReviews({ ...reviewsRef.current, [id]: { deleted: true, _u: Date.now() } }) }} />
          )}
          {tab === 'tools' && <ToolsView stats={stats} currency={currency} plan={plan} />}
          {tab === 'plan' && <PlanView plan={plan} onChange={persistPlan} trades={realizedTrades} currency={currency} onReset={() => persistPlan(DEFAULT_PLAN)} />}
        </main>
      </div>

      <button className="btn-primary mobile-fab" onClick={() => setModalTrade(null)} aria-label="Trade erfassen"><Icon name="Plus" size={24} strokeWidth={2.4} /></button>

      {detailTrade && (
        <TradeDetail trade={detailTrade} account={accounts.length > 1 ? accountsById[detailTrade.accountId] : null} currency={currencyFor(detailTrade.accountId)}
          onClose={() => setDetailId(null)} onEdit={(t) => { setDetailId(null); setModalTrade(t); }}
          onDelete={handleDelete} onDuplicate={handleDuplicate} />
      )}

      {modalTrade !== undefined && (
        <TradeForm key={modalTrade?.id || 'new'}
          initial={modalTrade && modalTrade.id ? modalTrade : null}
          template={modalTrade && !modalTrade.id ? modalTrade : null}
          currencyFor={currencyFor} strategyTags={plan.strategyTags} plan={plan} trades={trades}
          accounts={accounts} defaultAccountId={defaultAccountId} knownTags={knownTags}
          onSave={handleSaveTrade} onClose={() => setModalTrade(undefined)} />
      )}

      {showImport && <ImportModal onClose={() => setShowImport(false)} onImport={handleImportTrades} accounts={accounts} defaultAccountId={defaultAccountId} />}

      {showReport && (
        <ReportModal onClose={() => setShowReport(false)} trades={realizedTrades} mindset={mindset} plan={plan} currency={currency}
          startingBalance={startingBalance} accountName={accountName} />
      )}

      {showSettings && (
        <SettingsModal settings={settings} accounts={accounts} trades={trades}
          onSave={handleSaveSettings} onClose={() => setShowSettings(false)} onReset={handleReset}
          onExport={handleExportBackup} onImport={handleImportBackup}
          sync={{ cfg: syncCfg, state: syncState, onConnect: connectSync, onDisconnect: disconnectSync, onUnlock: unlockSync, onReplaceToken: replaceToken, onChangePassword: changeSyncPassword, onSyncNow: () => runSyncRef.current() }} />
      )}

      {mindsetDate && (
        <MindsetModal date={mindsetDate} entry={mindset[mindsetDate] || defaultMindsetEntry()}
          onChange={(e) => handleMindsetChange(e, mindsetDate)} onClose={() => setMindsetDate(null)} />
      )}

      {updateReady && !toast && (
        <div className="toast glass-strong" role="status">
          <span><Icon name="Sparkles" size={14} /> Neue Version verfügbar.</span>
          <button className="btn-primary" onClick={() => updateReady()}>Neu laden</button>
        </div>
      )}

      {toast && (
        <div className="toast glass-strong" role="status">
          <span>{toast.text}</span>
          {toast.undo && <button className="btn-ghost" onClick={handleUndoDelete}><Icon name="RotateCcw" size={14} /> Rückgängig</button>}
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
window.__appBooted = true;
