/* ---------------------------------------------------------------------- */
/* KI-Coach: Wochenrückblick von Claude                                    */
/* Der API-Schlüssel bleibt auf diesem Gerät; gesendet werden nur die      */
/* Trade-Daten des gewählten Zeitraums (keine Screenshots).               */
/* ---------------------------------------------------------------------- */

function loadAiKey() { try { return localStorage.getItem(AI_KEY_STORAGE) || ''; } catch (e) { return ''; } }
function saveAiKey(k) { try { if (k) localStorage.setItem(AI_KEY_STORAGE, k); else localStorage.removeItem(AI_KEY_STORAGE); } catch (e) { /* ignorieren */ } }

/* Sehr kleiner Markdown-Renderer für die Antwort (Überschriften, Listen, fett) */
function MiniMarkdown({ text }) {
  const inline = (str) => str.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part);
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, i) => {
    const line = raw.trimEnd();
    const li = /^\s*(?:[-*•]|\d+\.)\s+(.*)$/.exec(line);
    if (li) { (list = list || []).push(<li key={i}>{inline(li[1])}</li>); return; }
    if (list) { blocks.push(<ul key={`l${i}`}>{list}</ul>); list = null; }
    if (!line.trim()) return;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) blocks.push(<h4 key={i}>{inline(h[2])}</h4>);
    else blocks.push(<p key={i}>{inline(line)}</p>);
  });
  if (list) blocks.push(<ul key="lend">{list}</ul>);
  return <div className="md">{blocks}</div>;
}

function AiCoachPanel({ trades, mindset, plan, currency, accountName, reviews, onSaveReview, onDeleteReview }) {
  const [apiKey, setApiKey] = useState(loadAiKey);
  const [keyDraft, setKeyDraft] = useState('');
  const [period, setPeriod] = useState('week');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const abortRef = useRef(null);

  const list = Object.entries(reviews || {}).map(([id, r]) => ({ id, ...r })).filter(r => !r.deleted).sort((a, b) => b.createdAt - a.createdAt);
  const prompt = useMemo(() => buildReviewPrompt({ trades, mindset, plan, currency, period, accountName }), [trades, mindset, plan, currency, period, accountName]);

  const run = async () => {
    setBusy(true); setError(''); setLive('');
    try {
      const { Anthropic } = await ensureAnthropic();
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      const stream = client.beta.messages.stream({
        model: AI_MODEL,
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `Hier ist mein Trading-Journal für ${prompt.label}. Bitte schreib mir den Rückblick.\n\n${prompt.text}` }]
      });
      abortRef.current = stream;
      let text = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          text += event.delta.text;
          setLive(text);
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') throw new Error('Claude hat diese Anfrage abgelehnt. Versuche es mit einem anderen Zeitraum.');
      const out = final.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || text;
      if (!out) throw new Error('Keine Antwort erhalten.');
      const id = uid('rev');
      onSaveReview(id, { createdAt: Date.now(), period: prompt.label, trades: prompt.count, account: accountName, text: out, model: final.model });
      setOpenId(id);
      setLive('');
    } catch (e) {
      const status = e && e.status;
      setError(status === 401 ? 'API-Schlüssel ungültig.' : status === 429 ? 'Zu viele Anfragen – bitte kurz warten.' : status === 529 || status >= 500 ? 'Claude ist gerade überlastet – bitte später erneut versuchen.' : (e.message || String(e)));
    }
    abortRef.current = null;
    setBusy(false);
  };

  const cancel = () => { try { abortRef.current?.abort(); } catch (e) { /* ignorieren */ } };
  const shown = openId ? list.find(r => r.id === openId) : list[0];

  return (
    <div className="panel pad ai-panel">
      <div className="tool-head">
        <span className="tool-icon"><Icon name="Sparkles" size={19} /></span>
        <div style={{ flex: 1 }}>
          <h3>KI-Coach <span className="pro-badge">Claude</span></h3>
          <p>Liest deine Trades, Notizen und dein Mindset-Journal und schreibt dir einen ehrlichen Rückblick mit konkreten Regeln.</p>
        </div>
      </div>

      {!apiKey ? (
        <div className="sync-enc">
          <p className="shot-hint">Dafür brauchst du einen eigenen Anthropic-API-Schlüssel (<a className="txt-accent" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com</a>). Er wird nur auf diesem Gerät gespeichert. Ein Rückblick kostet je nach Anzahl der Trades meist nur wenige Cent.</p>
          <div className="chip-add">
            <input type="password" autoComplete="off" placeholder="sk-ant-…" value={keyDraft} onChange={e => setKeyDraft(e.target.value)} aria-label="Anthropic-API-Schlüssel" />
            <button className="btn-primary" disabled={!keyDraft.trim().startsWith('sk-')} onClick={() => { saveAiKey(keyDraft.trim()); setApiKey(keyDraft.trim()); setKeyDraft(''); }}>Speichern</button>
          </div>
        </div>
      ) : (
        <>
          <div className="ai-controls">
            <div className="seg-control mini" role="group" aria-label="Zeitraum">
              {[['week', '7 Tage'], ['month', '30 Tage'], ['last', 'Letzte 60 Trades']].map(([k, l]) => (
                <button key={k} aria-pressed={period === k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>{l}</button>
              ))}
            </div>
            <span className="shot-hint">{prompt.count} Trades werden an Claude gesendet</span>
            {busy
              ? <button className="btn-ghost" onClick={cancel}><Icon name="X" size={14} /> Abbrechen</button>
              : <button className="btn-primary" disabled={prompt.count === 0} onClick={run}><Icon name="Sparkles" size={14} /> Rückblick erstellen</button>}
          </div>
          {error && <div className="form-error" role="alert"><Icon name="AlertTriangle" size={14} /> {error}</div>}
          {busy && (
            <div className="ai-output" aria-live="polite">
              {live ? <MiniMarkdown text={live} /> : <div className="ai-thinking"><div className="loader" /> Claude denkt über deine Trades nach …</div>}
            </div>
          )}
          {!busy && shown && (
            <div className="ai-output">
              <div className="ai-meta">
                <span>{new Date(shown.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })} · {shown.period} · {shown.trades} Trades{shown.account ? ` · ${shown.account}` : ''}</span>
                <button className="icon-btn sm danger" aria-label="Rückblick löschen" onClick={() => { onDeleteReview(shown.id); setOpenId(null); }}><Icon name="Trash2" size={13} /></button>
              </div>
              <MiniMarkdown text={shown.text} />
            </div>
          )}
          {list.length > 1 && (
            <div className="chip-row">
              {list.slice(0, 8).map(r => (
                <button key={r.id} className={`chip toggle ${shown?.id === r.id ? 'active' : ''}`} onClick={() => setOpenId(r.id)}>
                  {new Date(r.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })} · {r.period}
                </button>
              ))}
            </div>
          )}
          <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => { saveAiKey(''); setApiKey(''); }}>API-Schlüssel auf diesem Gerät entfernen</button>
        </>
      )}
    </div>
  );
}
