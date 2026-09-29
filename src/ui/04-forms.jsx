/* ---------------------------------------------------------------------- */
/* Trade-Formular (Hinzufügen / Bearbeiten)                                */
/* ---------------------------------------------------------------------- */

function LegsEditor({ legs, onChange, direction, defaultDate }) {
  const update = (i, patch) => onChange(legs.map((l, j) => j === i ? { ...l, ...patch } : l));
  const remove = (i) => onChange(legs.filter((_, j) => j !== i));
  const add = (side) => {
    const last = legs[legs.length - 1];
    onChange([...legs, { side, price: '', qty: side === 'out' ? '' : (last?.qty || ''), date: last?.date || defaultDate, time: '' }]);
  };
  const inLabel = direction === 'long' ? 'Kauf' : 'Leerverkauf';
  const outLabel = direction === 'long' ? 'Verkauf' : 'Rückkauf';
  return (
    <div className="legs">
      <div className="legs-head" aria-hidden="true"><span>Art</span><span>Kurs</span><span>Menge</span><span>Datum</span><span>Zeit</span><span /></div>
      {legs.map((l, i) => (
        <div key={i} className="legs-row">
          <select value={l.side} onChange={e => update(i, { side: e.target.value })} aria-label="Art der Ausführung">
            <option value="in">{inLabel}</option>
            <option value="out">{outLabel}</option>
          </select>
          <input type="number" step="any" inputMode="decimal" placeholder="Kurs" value={l.price} onChange={e => update(i, { price: e.target.value })} aria-label="Kurs" />
          <input type="number" step="any" inputMode="decimal" placeholder="Menge" value={l.qty} onChange={e => update(i, { qty: e.target.value })} aria-label="Menge" />
          <input type="date" value={l.date} onChange={e => update(i, { date: e.target.value })} aria-label="Datum" />
          <input type="time" value={l.time} onChange={e => update(i, { time: e.target.value })} aria-label="Uhrzeit" />
          <button type="button" className="icon-btn sm danger" onClick={() => remove(i)} aria-label="Ausführung entfernen" disabled={legs.length <= 1}><Icon name="X" size={13} /></button>
        </div>
      ))}
      <div className="backup-actions">
        <button type="button" className="btn-ghost" onClick={() => add('in')}><Icon name="Plus" size={13} /> {direction === 'long' ? 'Nachkauf' : 'Aufstocken'}</button>
        <button type="button" className="btn-ghost" onClick={() => add('out')}><Icon name="Plus" size={13} /> {direction === 'long' ? 'Teilverkauf' : 'Teil-Rückkauf'}</button>
      </div>
    </div>
  );
}

function MultiplierField({ value, onChange }) {
  const preset = MULTIPLIER_PRESETS.find(p => p.value === Number(value));
  const [custom, setCustom] = useState(!preset);
  return (
    <label>Multiplikator / Punktwert
      <div className="chip-add">
        <select value={custom ? 'custom' : String(value)} onChange={e => {
          if (e.target.value === 'custom') { setCustom(true); return; }
          setCustom(false); onChange(Number(e.target.value));
        }}>
          {MULTIPLIER_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
          <option value="custom">Eigener Wert …</option>
        </select>
        {custom && <input type="number" step="any" min="0" value={value} onChange={e => onChange(e.target.value)} style={{ maxWidth: 110 }} aria-label="Eigener Multiplikator" />}
      </div>
    </label>
  );
}

function TradeForm({ initial, template, onSave, onClose, currencyFor, strategyTags = STRATEGY_SUGGESTIONS, plan, trades = [], accounts, defaultAccountId, knownTags = [] }) {
  const base = initial || template;
  const [form, setForm] = useState(() => {
    if (base) {
      const t = normalizeTrade(base, defaultAccountId);
      return {
        ...t,
        stopLoss: t.stopLoss ?? '', takeProfit: t.takeProfit ?? '', exitPrice: t.exitPrice ?? '',
        fees: t.fees || '', time: t.time || '', exitDate: t.exitDate || '', exitTime: t.exitTime || '',
        multiplier: tradeMultiplier(t), status: hasExit(t) ? 'closed' : 'open',
        legs: t.legs?.length ? t.legs.map(l => ({ ...l, price: String(l.price), qty: String(l.qty) })) : null
      };
    }
    return {
      accountId: defaultAccountId, date: todayISO(), symbol: '', direction: 'long', entryPrice: '', exitPrice: '',
      quantity: '', fees: '', strategy: '', notes: '', onPlan: true, setups: [], result: null, multiplier: 1, status: 'closed',
      stopLoss: '', takeProfit: '', time: '', exitDate: '', exitTime: '', emotion: null, rating: 0, tags: [], screenshots: [], legs: null
    };
  });
  const [shots, setShots] = useState(() => (initial?.screenshots || []).map(id => ({ id, isNew: false })));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [override, setOverride] = useState(false);
  const [ack, setAck] = useState(false);
  const multTouched = useRef(!!initial);
  const fileRef = useRef(null);
  const symbolRef = useRef(null);
  const currency = currencyFor(form.accountId);

  const dialogRef = useDialog(onClose);
  useEffect(() => { if (!initial) setTimeout(() => symbolRef.current?.focus(), 40); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const legsMode = Array.isArray(form.legs);

  // Multiplikator vom letzten Trade desselben Symbols übernehmen
  const onSymbol = (v) => {
    set('symbol', v);
    if (multTouched.current) return;
    const sym = v.trim().toUpperCase();
    const prev = [...trades].reverse().find(t => t.symbol === sym && tradeMultiplier(t) !== 1);
    set('multiplier', prev ? tradeMultiplier(prev) : 1);
  };

  const toggleLegs = () => {
    if (legsMode) {
      const a = aggregateLegs(form.legs);
      setForm(f => ({ ...f, legs: null, entryPrice: a.entryPrice ?? '', quantity: a.quantity || '', exitPrice: a.exitPrice ?? '', status: a.exitQuantity >= a.quantity && a.quantity > 0 ? 'closed' : 'open' }));
    } else {
      const legs = [{ side: 'in', price: form.entryPrice, qty: form.quantity, date: form.date, time: form.time }];
      if (form.status === 'closed' && form.exitPrice !== '') legs.push({ side: 'out', price: form.exitPrice, qty: form.quantity, date: form.exitDate || form.date, time: form.exitTime });
      setForm(f => ({ ...f, legs }));
    }
  };

  const draft = useMemo(() => {
    const d = {
      direction: form.direction, entryPrice: num(form.entryPrice), exitPrice: form.status === 'open' ? null : num(form.exitPrice), quantity: num(form.quantity),
      fees: num(form.fees) || 0, stopLoss: num(form.stopLoss), takeProfit: num(form.takeProfit), multiplier: Number(form.multiplier) || 1,
      date: form.date, time: form.time, exitDate: form.exitDate, exitTime: form.exitTime, exitQuantity: null, legs: null
    };
    return legsMode ? applyLegs({ ...d, legs: form.legs }) : d;
  }, [form, legsMode]);
  const realized = isRealized(draft);
  const preview = draft.entryPrice && draft.quantity && realized ? calcPnL(draft) : null;
  const rMultiple = preview != null ? calcRMultiple(draft) : null;
  const plannedRR = draft.entryPrice ? calcPlannedRR(draft) : null;
  const hold = holdingMinutes(draft);
  const stillOpen = draft.quantity > 0 && isOpen(draft);

  const lock = useMemo(() => initial ? null : dailyLimitStatus(trades, plan, draft.date || form.date, form.accountId), [initial, trades, plan, draft.date, form.date, form.accountId]);
  const locked = !!(lock && lock.locked && !override);

  const warnings = useMemo(() => {
    const list = [];
    if (!plan) return list;
    const e = draft.entryPrice, sl = draft.stopLoss;
    const target = draft.takeProfit || draft.exitPrice;
    if (e && target && sl) {
      const risk = form.direction === 'long' ? e - sl : sl - e;
      const reward = form.direction === 'long' ? target - e : e - target;
      const minRR = parseMinRiskReward(plan.minRiskReward);
      if (risk <= 0) list.push('Der Stop-Loss liegt auf der falschen Seite deines Einstiegs.');
      else if (minRR != null && reward / risk < minRR) list.push(`Risiko:Reward liegt bei 1:${(reward / risk).toFixed(2)} – unter deinem Plan-Minimum von 1:${minRR}.`);
    }
    const sameDayTrades = trades.filter(t => t.date === draft.date && t.id !== initial?.id && t.accountId === form.accountId);
    if (plan.maxTradesPerDay && sameDayTrades.length + 1 > plan.maxTradesPerDay) {
      list.push(`Das wäre Trade Nr. ${sameDayTrades.length + 1} am ${fmtDateShort(draft.date)} – dein Tageslimit liegt bei ${plan.maxTradesPerDay}.`);
    }
    const lossSoFar = Math.abs(sameDayTrades.reduce((s, t) => s + Math.min(0, calcPnL(t)), 0));
    if (plan.maxDailyDrawdown && lossSoFar >= plan.maxDailyDrawdown) {
      list.push(`Dein Tagesverlust-Limit von ${fmtMoney(plan.maxDailyDrawdown, currency)} ist an diesem Tag bereits erreicht.`);
    }
    if (['revenge', 'fomo'].includes(form.emotion)) list.push(`Emotion "${EMOTION_BY_KEY[form.emotion].label}" – laut deinen Psychologie-Regeln ein Warnsignal.`);
    return list;
  }, [form, draft, plan, trades, initial, currency]);

  const addFiles = async (files) => {
    const images = [...files].filter(f => f.type.startsWith('image/'));
    for (const f of images) {
      try {
        const dataUrl = await compressImage(f);
        const id = uid('img');
        imageCache.set(id, dataUrl);
        setShots(s => [...s, { id, isNew: true, dataUrl }]);
      } catch (e) { setError('Ein Bild konnte nicht verarbeitet werden.'); }
    }
  };

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); addFiles(files); }
  };

  const submit = async () => {
    if (locked) return;
    if (!form.symbol.trim()) return setError('Bitte ein Symbol angeben.');
    if (legsMode) {
      if (!draft.entryPrice || !draft.quantity) return setError('Mindestens ein Einstieg mit Kurs und Menge ist nötig.');
      const outQty = form.legs.filter(l => l.side === 'out').reduce((s, l) => s + (Number(l.qty) || 0), 0);
      if (outQty > draft.quantity + 1e-9) return setError('Es wurde mehr verkauft als gekauft – bitte Mengen prüfen.');
    } else {
      if (!form.entryPrice || !form.quantity) return setError('Einstieg und Menge sind erforderlich.');
      if (form.status === 'closed' && form.exitPrice === '') return setError('Bitte einen Ausstiegskurs angeben – oder „Position offen“ wählen.');
    }
    if (!(Number(form.multiplier) > 0)) return setError('Der Multiplikator muss größer als 0 sein.');
    setError('');
    setSaving(true);
    try {
      for (const s of shots) if (s.isNew) await window.imageStore.set(s.id, s.dataUrl);
      const kept = new Set(shots.map(s => s.id));
      for (const id of initial?.screenshots || []) if (!kept.has(id)) { await window.imageStore.delete(id); imageCache.delete(id); }
    } catch (e) { console.error(e); }
    const brokeLock = !!(lock && lock.locked && override);
    const tags = brokeLock && !form.tags.includes('Regelbruch') ? [...form.tags, 'Regelbruch'] : form.tags;
    const legs = legsMode ? form.legs.map(l => ({ side: l.side, price: Number(l.price), qty: Number(l.qty), date: l.date || form.date, time: l.time || '' })).filter(l => l.price > 0 && l.qty > 0) : null;
    const trade = {
      id: initial?.id || uid(),
      accountId: form.accountId,
      date: form.date,
      time: form.time || '',
      exitDate: form.status === 'open' ? '' : (form.exitDate && form.exitDate !== form.date ? form.exitDate : ''),
      exitTime: form.status === 'open' ? '' : (form.exitTime || ''),
      symbol: form.symbol.trim().toUpperCase(),
      direction: form.direction,
      entryPrice: Number(form.entryPrice),
      exitPrice: form.status === 'open' ? null : Number(form.exitPrice),
      exitQuantity: null,
      stopLoss: form.stopLoss !== '' ? Number(form.stopLoss) : null,
      takeProfit: form.takeProfit !== '' ? Number(form.takeProfit) : null,
      quantity: Number(form.quantity),
      multiplier: Number(form.multiplier) || 1,
      fees: Number(form.fees) || 0,
      strategy: form.strategy.trim(),
      notes: form.notes.trim(),
      onPlan: brokeLock ? false : !!form.onPlan,
      setups: form.setups,
      result: form.result,
      emotion: form.emotion,
      rating: form.rating,
      tags,
      legs,
      screenshots: shots.map(s => s.id),
      createdAt: initial?.createdAt || Date.now()
    };
    onSave(legs ? applyLegs(trade) : trade);
  };

  const onKeyDown = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); };
  const title = initial ? 'Trade bearbeiten' : 'Neuer Trade';

  if (locked) {
    return (
      <div className="modal-overlay" onMouseDown={onClose}>
        <div className="modal small glass-strong" ref={dialogRef} data-dialog tabIndex={-1} onMouseDown={e => e.stopPropagation()} role="alertdialog" aria-modal="true" aria-label="Handelstag beendet">
          <div className="modal-head">
            <h2><Icon name="Lock" size={17} /> Handelstag beendet</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="X" size={18} /></button>
          </div>
          <div className="modal-body">
            <div className="lock-hero">
              <div className="lock-icon"><Icon name="Shield" size={30} /></div>
              <p><strong>{lock.lossHit ? <>Dein Tagesverlust-Limit von <span className="nowrap">{fmtMoney(plan.maxDailyDrawdown, currency)}</span> ist erreicht – heute <span className="nowrap">{fmtMoney(-lock.loss, currency)}</span>.</> : `Du hast heute bereits ${lock.count} von ${plan.maxTradesPerDay} Trades gemacht.`}</strong></p>
              <p className="txt-muted">Dein Plan sagt: Für heute ist Schluss. Die besten Trader erkennen, wann der Tag vorbei ist.</p>
            </div>
            <label className="ack-row">
              <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} />
              <span>Ich will trotzdem einen Trade dokumentieren. Er wird als <b>Regelbruch</b> (außerhalb des Plans) markiert.</span>
            </label>
          </div>
          <div className="modal-foot">
            <button className="btn-ghost" disabled={!ack} onClick={() => { setOverride(true); set('onPlan', false); }}>Trotzdem erfassen</button>
            <button className="btn-primary" onClick={onClose}>Verstanden – Feierabend</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal glass-strong" ref={dialogRef} data-dialog tabIndex={-1} onMouseDown={e => e.stopPropagation()} onPaste={onPaste} onKeyDown={onKeyDown} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2><Icon name={initial ? 'Pencil' : 'Plus'} size={17} /> {title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="X" size={18} /></button>
        </div>

        <div className="modal-body">
          {override && <div className="form-error"><Icon name="AlertTriangle" size={14} /> Tageslimit überschritten – dieser Trade wird als Regelbruch gespeichert.</div>}
          <div className="form-row">
            <label>Symbol
              <input ref={symbolRef} type="text" placeholder="z.B. AAPL, ES, EURUSD" value={form.symbol} onChange={e => onSymbol(e.target.value)} autoCapitalize="characters" />
            </label>
            {accounts.length > 1 ? (
              <label>Konto
                <select value={form.accountId} onChange={e => set('accountId', e.target.value)}>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.currency ? ` (${a.currency})` : ''}</option>)}
                </select>
              </label>
            ) : (
              <label>Strategie
                <input list="strategy-list" type="text" placeholder="optional" value={form.strategy} onChange={e => set('strategy', e.target.value)} />
              </label>
            )}
          </div>
          {accounts.length > 1 && (
            <label>Strategie
              <input list="strategy-list" type="text" placeholder="optional" value={form.strategy} onChange={e => set('strategy', e.target.value)} />
            </label>
          )}
          <datalist id="strategy-list">{strategyTags.map(s => <option key={s} value={s} />)}</datalist>

          <div className="form-row">
            <label>Richtung
              <div className="seg-control" role="group" aria-label="Richtung">
                <button type="button" aria-pressed={form.direction === 'long'} className={form.direction === 'long' ? 'active long' : ''} onClick={() => set('direction', 'long')}>▲ Long</button>
                <button type="button" aria-pressed={form.direction === 'short'} className={form.direction === 'short' ? 'active short' : ''} onClick={() => set('direction', 'short')}>▼ Short</button>
              </div>
            </label>
            <label>Im Plan?
              <div className="seg-control" role="group" aria-label="Im Plan">
                <button type="button" aria-pressed={form.onPlan} className={form.onPlan ? 'active long' : ''} onClick={() => set('onPlan', true)}>Ja</button>
                <button type="button" aria-pressed={!form.onPlan} className={!form.onPlan ? 'active short' : ''} onClick={() => set('onPlan', false)}>Nein</button>
              </div>
            </label>
          </div>

          <div className="form-section-title">
            Preise
            <button type="button" className="link-btn" onClick={toggleLegs}>{legsMode ? 'Einfache Eingabe' : 'Mehrere Käufe / Teilverkäufe'}</button>
          </div>

          {legsMode ? (
            <LegsEditor legs={form.legs} onChange={v => set('legs', v)} direction={form.direction} defaultDate={form.date} />
          ) : (
            <>
              <div className="seg-control" role="group" aria-label="Status">
                <button type="button" aria-pressed={form.status === 'closed'} className={form.status === 'closed' ? 'active' : ''} onClick={() => set('status', 'closed')}>Abgeschlossen</button>
                <button type="button" aria-pressed={form.status === 'open'} className={form.status === 'open' ? 'active' : ''} onClick={() => set('status', 'open')}>Position offen</button>
              </div>
              <div className="form-row three">
                <label>Einstieg
                  <input type="number" step="any" inputMode="decimal" placeholder="0.00" value={form.entryPrice} onChange={e => set('entryPrice', e.target.value)} />
                </label>
                <label>Ausstieg
                  <input type="number" step="any" inputMode="decimal" placeholder={form.status === 'open' ? 'noch offen' : '0.00'} disabled={form.status === 'open'} value={form.status === 'open' ? '' : form.exitPrice} onChange={e => set('exitPrice', e.target.value)} />
                </label>
                <label>Menge
                  <input type="number" step="any" inputMode="decimal" placeholder="0" value={form.quantity} onChange={e => set('quantity', e.target.value)} />
                </label>
              </div>
            </>
          )}
          <div className="form-row three">
            <label>Stop-Loss
              <input type="number" step="any" inputMode="decimal" placeholder="optional" value={form.stopLoss} onChange={e => set('stopLoss', e.target.value)} />
            </label>
            <label>Take-Profit
              <input type="number" step="any" inputMode="decimal" placeholder="optional" value={form.takeProfit} onChange={e => set('takeProfit', e.target.value)} />
            </label>
            <label>Gebühren ({currency})
              <input type="number" step="any" inputMode="decimal" placeholder="0.00" value={form.fees} onChange={e => set('fees', e.target.value)} />
            </label>
          </div>
          <MultiplierField value={form.multiplier} onChange={v => { multTouched.current = true; set('multiplier', v); }} />

          <div className="pnl-preview">
            <div><span>{stillOpen && realized ? 'Realisiert' : 'Ergebnis'}</span><strong className={preview == null ? '' : preview >= 0 ? 'txt-profit' : 'txt-loss'}>{preview == null ? (stillOpen ? 'offen' : '—') : fmtMoneySigned(preview, currency)}</strong></div>
            <div><span>R-Multiple</span><strong className={rMultiple == null ? '' : rMultiple >= 0 ? 'txt-profit' : 'txt-loss'}>{fmtR(rMultiple)}</strong></div>
            <div><span>Geplantes R:R</span><strong>{plannedRR == null ? '—' : `1:${fmtNum(plannedRR, 2)}`}</strong></div>
          </div>
          {legsMode && draft.quantity > 0 && (
            <p className="shot-hint">Ø Einstieg {fmtNum(draft.entryPrice, 4)} · {fmtNum(draft.quantity, 4)} Stück{draft.exitPrice != null ? ` · Ø Ausstieg ${fmtNum(draft.exitPrice, 4)} · ${fmtNum(closedQty(draft), 4)} geschlossen` : ''}{stillOpen ? ` · ${fmtNum(openQty(draft), 4)} noch offen` : ''}</p>
          )}

          {!legsMode && (
            <>
              <div className="form-section-title">Zeit</div>
              <div className="form-row four">
                <label>Einstieg (Datum)
                  <input type="date" value={form.date} onChange={e => set('date', e.target.value)} />
                </label>
                <label>Uhrzeit
                  <input type="time" value={form.time} onChange={e => set('time', e.target.value)} />
                </label>
                <label>Ausstieg (Datum)
                  <input type="date" value={form.exitDate || form.date} min={form.date} disabled={form.status === 'open'} onChange={e => set('exitDate', e.target.value)} />
                </label>
                <label>Uhrzeit
                  <input type="time" value={form.exitTime} disabled={form.status === 'open'} onChange={e => set('exitTime', e.target.value)} />
                </label>
              </div>
            </>
          )}
          {hold != null && !stillOpen && <span className="shot-hint"><Icon name="Clock" size={12} /> Haltedauer: {fmtDuration(hold)}</span>}

          {warnings.length > 0 && (
            <div className="form-warning-box" role="status">
              {warnings.map((w, i) => <div key={i} className="form-warning-item"><Icon name="AlertTriangle" size={13} /> {w}</div>)}
            </div>
          )}

          <div className="form-section-title">Reflexion</div>
          <div className="reflect-section">
            <span className="mindset-label">Emotion beim Einstieg</span>
            <div className="mood-row">
              {TRADE_EMOTIONS.map(m => (
                <button key={m.key} type="button" aria-pressed={form.emotion === m.key} className={`mood-btn sm ${form.emotion === m.key ? 'active' : ''}`} onClick={() => set('emotion', form.emotion === m.key ? null : m.key)}>
                  <span className="mood-emoji" aria-hidden="true">{m.emoji}</span><span>{m.label}</span>
                </button>
              ))}
            </div>
            <span className="mindset-label">Setup</span>
            <MarketToggle options={strategyTags} selected={form.setups} onChange={v => set('setups', v)} />
            <span className="mindset-label">Ergebnis</span>
            <SingleChipSelect options={RESULT_OPTIONS} selected={form.result} onChange={v => set('result', v)} />
            <span className="mindset-label">Ausführungsqualität</span>
            <StarRating value={form.rating} onChange={v => set('rating', v)} />
          </div>

          <label>Eigene Tags
            <ChipEditor tags={form.tags} onChange={v => set('tags', v)} placeholder={knownTags.length ? `z.B. ${knownTags.slice(0, 3).join(', ')}` : 'z.B. News, Earnings, A+ Setup'} />
          </label>

          <label>Notizen
            <textarea rows={3} placeholder="Setup, Emotionen, Lessons Learned…" value={form.notes} onChange={e => set('notes', e.target.value)} />
          </label>

          <div>
            <span className="mindset-label">Chart-Screenshots</span>
            <div className="shot-grid">
              {shots.map(s => (
                <ScreenshotThumb key={s.id} id={s.id} onOpen={setLightbox} onRemove={() => setShots(list => list.filter(x => x.id !== s.id))} />
              ))}
              <button type="button" className="shot-add" onClick={() => fileRef.current?.click()}>
                <Icon name="Image" size={20} /> Bild hinzufügen
              </button>
            </div>
            <p className="shot-hint" style={{ marginTop: 8 }}>Tipp: Screenshot kopieren und hier mit <span className="kbd">Strg/⌘ + V</span> einfügen.</p>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {error && <div className="form-error" role="alert"><Icon name="AlertTriangle" size={14} /> {error}</div>}
        </div>

        <div className="modal-foot">
          <span className="shot-hint left hide-sm"><span className="kbd">⌘/Strg + Enter</span> speichert</span>
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{initial ? 'Speichern' : 'Trade hinzufügen'}</button>
        </div>
      </div>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Trade-Detail (Seitenleiste)                                             */
/* ---------------------------------------------------------------------- */

function PriceLadder({ trade }) {
  const pts = [
    { key: 'sl', label: 'SL', v: trade.stopLoss, color: 'var(--loss)' },
    { key: 'entry', label: 'Einstieg', v: trade.entryPrice, color: 'var(--text-muted)' },
    { key: 'tp', label: 'TP', v: trade.takeProfit, color: 'var(--profit)' },
    { key: 'exit', label: 'Ausstieg', v: trade.exitPrice, color: 'var(--accent)' }
  ].filter(p => p.v != null && p.v !== '');
  if (pts.length < 2) return null;
  const vals = pts.map(p => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const pos = (v) => ((v - lo) / (hi - lo)) * 100;
  const flip = trade.direction === 'short';
  const x = (v) => flip ? 100 - pos(v) : pos(v);
  const e = trade.entryPrice;
  const segs = [];
  if (trade.stopLoss) segs.push({ from: x(trade.stopLoss), to: x(e), color: 'rgba(240,97,109,0.55)' });
  if (trade.takeProfit) segs.push({ from: x(e), to: x(trade.takeProfit), color: 'rgba(63,207,142,0.55)' });
  return (
    <div className="price-ladder">
      <div className="track" />
      {segs.map((s, i) => <div key={i} className="seg" style={{ left: `${Math.min(s.from, s.to)}%`, width: `${Math.abs(s.to - s.from)}%`, background: s.color }} />)}
      {pts.map((p, i) => (
        <div key={p.key} className="mark" style={{ left: `${x(p.v)}%`, color: p.color, top: i % 2 ? 12 : 12 }}>
          <i />
          <b>{p.label}</b>
        </div>
      ))}
    </div>
  );
}

function TradeDetail({ trade, account, currency, onClose, onEdit, onDelete, onDuplicate }) {
  const [lightbox, setLightbox] = useState(null);
  const dialogRef = useDialog(onClose);
  const pnl = calcPnL(trade);
  const r = calcRMultiple(trade);
  const risk = calcRisk(trade);
  const rr = calcPlannedRR(trade);
  const hold = holdingMinutes(trade);
  const emo = EMOTION_BY_KEY[trade.emotion];
  const cq = closedQty(trade);
  const retPct = cq > 0 ? (pnl / (trade.entryPrice * cq * tradeMultiplier(trade))) * 100 : null;
  const open = isOpen(trade);
  const mult = tradeMultiplier(trade);

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer glass-strong" ref={dialogRef} data-dialog tabIndex={-1} aria-modal="true" role="dialog" aria-label={`Trade ${trade.symbol}`}>
        <div className="drawer-hero">
          <div className="drawer-top">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <DirectionPill direction={trade.direction} />
              <ResultPill result={trade.result} />
              {open && <Pill tone="accent">{isRealized(trade) ? 'Teilweise offen' : 'Offen'}</Pill>}
              {trade.onPlan === false && <Pill tone="loss">Außerhalb Plan</Pill>}
              {account && <Pill tone="neutral">{account.name}</Pill>}
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="X" size={18} /></button>
          </div>
          <div className="drawer-symbol">{trade.symbol}{emo && <span title={emo.label} style={{ fontSize: 22 }}>{emo.emoji}</span>}</div>
          <div className="txt-muted" style={{ fontSize: 13 }}>{fmtDateLong(trade.date)}{trade.time && ` · ${trade.time} Uhr`}{trade.strategy && ` · ${trade.strategy}`}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            {isRealized(trade)
              ? <div className={`drawer-pnl ${pnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneySigned(pnl, currency)}{open && <span className="txt-muted" style={{ fontSize: 13 }}> realisiert</span>}</div>
              : <div className="drawer-pnl txt-accent">Position offen</div>}
            {retPct != null && <span className={`mono ${pnl >= 0 ? 'txt-profit' : 'txt-loss'}`} style={{ fontSize: 13 }}>{fmtPct(retPct, 2)}</span>}
            {r != null && <Pill tone={r >= 0 ? 'profit' : 'loss'}>{fmtR(r)}</Pill>}
          </div>
        </div>
        <div className="drawer-body">
          <PriceLadder trade={trade} />
          <div className="kv-grid">
            <div className="kv"><span>Einstieg</span><strong>{trade.entryPrice}</strong></div>
            <div className="kv"><span>Ausstieg</span><strong>{hasExit(trade) ? fmtNum(Number(trade.exitPrice), 4).replace(/,?0+$/, '') : 'offen'}</strong></div>
            <div className="kv"><span>Menge</span><strong>{trade.quantity}{open && isRealized(trade) ? ` (${fmtNum(openQty(trade), 2)} offen)` : ''}</strong></div>
            <div className="kv"><span>Stop-Loss</span><strong>{trade.stopLoss ?? '—'}</strong></div>
            <div className="kv"><span>Take-Profit</span><strong>{trade.takeProfit ?? '—'}</strong></div>
            <div className="kv"><span>Gebühren</span><strong>{fmtMoney(trade.fees || 0, currency)}</strong></div>
            <div className="kv"><span>Risiko</span><strong>{risk != null ? fmtMoney(risk, currency) : '—'}</strong></div>
            <div className="kv"><span>Geplantes R:R</span><strong>{rr != null ? `1:${fmtNum(rr, 2)}` : '—'}</strong></div>
            <div className="kv"><span>Haltedauer</span><strong>{open ? 'läuft' : fmtDuration(hold)}</strong></div>
            {mult !== 1 && <div className="kv"><span>Multiplikator</span><strong>×{mult.toLocaleString('de-DE')}</strong></div>}
            {open && openRisk(trade) != null && <div className="kv"><span>Offenes Risiko</span><strong className="txt-loss">{fmtMoney(openRisk(trade), currency)}</strong></div>}
          </div>

          {trade.legs?.length > 0 && (
            <div>
              <span className="mindset-label">Ausführungen</span>
              <table className="target-table">
                <tbody>
                  {trade.legs.map((l, i) => (
                    <tr key={i}>
                      <td>{l.side === 'out' ? (trade.direction === 'long' ? 'Verkauf' : 'Rückkauf') : (trade.direction === 'long' ? 'Kauf' : 'Leerverkauf')}</td>
                      <td>{fmtDateShort(l.date)}{l.time ? ` ${l.time}` : ''}</td>
                      <td className="r">{l.qty} × {l.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {trade.rating > 0 && (
            <div><span className="mindset-label">Ausführungsqualität</span><StarRating value={trade.rating} size={18} /></div>
          )}

          {(trade.setups?.length > 0 || trade.tags?.length > 0) && (
            <div>
              <span className="mindset-label">Setups & Tags</span>
              <div className="chip-row">
                {trade.setups.map(s => <span key={s} className="chip toggle active">{s}</span>)}
                {trade.tags.map(s => <span key={s} className="chip toggle"><Icon name="Tag" size={11} /> {s}</span>)}
              </div>
            </div>
          )}

          {trade.notes && (
            <div><span className="mindset-label">Notizen</span><p className="drawer-notes">{trade.notes}</p></div>
          )}

          {trade.screenshots?.length > 0 && (
            <div>
              <span className="mindset-label">Screenshots</span>
              <div className="shot-grid">{trade.screenshots.map(id => <ScreenshotThumb key={id} id={id} onOpen={setLightbox} />)}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={() => onEdit(trade)}><Icon name={open ? 'Check' : 'Pencil'} size={14} /> {open ? 'Schließen / bearbeiten' : 'Bearbeiten'}</button>
            <button className="btn-ghost" onClick={() => onDuplicate(trade)}><Icon name="Repeat" size={14} /> Duplizieren</button>
            <button className="btn-danger" onClick={() => onDelete(trade.id)} style={{ marginLeft: 'auto' }}><Icon name="Trash2" size={14} /> Löschen</button>
          </div>
        </div>
      </aside>
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Einstellungen (inkl. Konten-Verwaltung)                                 */
/* ---------------------------------------------------------------------- */

function SyncSection({ sync }) {
  const { cfg, state, onConnect, onDisconnect, onSyncNow, onUnlock, onReplaceToken } = sync;
  const [newToken, setNewToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [showEnc, setShowEnc] = useState(false);

  const run = async (fn) => {
    setBusy(true); setMsg(null);
    try { setMsg({ ok: true, text: await fn() }); }
    catch (e) { setMsg({ ok: false, text: e.message || String(e) }); }
    setBusy(false);
  };

  const connect = () => run(async () => {
    if (pass && pass !== pass2 && pass2 !== '') throw new Error('Die beiden Passwörter stimmen nicht überein.');
    const r = await onConnect(token, pass);
    setToken(''); setPass(''); setPass2('');
    return r.created ? 'Verbunden – Sync angelegt. Gib Token und Passwort auf deinen anderen Geräten ein.' : 'Verbunden – vorhandene Daten gefunden und zusammengeführt.';
  });

  const unlock = () => run(async () => {
    if (!cfg.encrypted && pass !== pass2) throw new Error('Die beiden Passwörter stimmen nicht überein.');
    if (!cfg.encrypted && pass.length < 10) throw new Error('Bitte mindestens 10 Zeichen – am besten ein Satz, den du dir merken kannst.');
    await onUnlock(pass);
    setPass(''); setPass2(''); setShowEnc(false);
    return cfg.encrypted ? 'Entsperrt.' : 'Verschlüsselung aktiv – Daten und Screenshots werden ab jetzt verschlüsselt hochgeladen.';
  });

  const replace = () => run(async () => {
    await onReplaceToken(newToken);
    setNewToken(''); setShowToken(false);
    return 'Neuer Token gespeichert – der Sync läuft wieder.';
  });

  const locked = state.state === 'locked';
  const tokenBroken = state.state === 'error' && /Token|Zugriff verweigert|nicht gefunden/.test(state.error || '');
  const statusText = {
    ok: `Synchronisiert ${fmtAgo(state.at)}`,
    syncing: 'Synchronisiere …',
    idle: 'Verbunden',
    offline: 'Offline – wird nachgeholt',
    locked: 'Gesperrt – Sync-Passwort nötig',
    error: `Fehler: ${state.error}`
  }[state.state];

  return (
    <div className="settings-section">
      <span className="mindset-label">Geräte-Sync</span>
      {cfg?.enabled ? (
        <>
          <div className="sync-status">
            <span className={`sync-dot s-${state.state}`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{statusText}</strong>
              <p>{cfg.keyB64 ? '🔒 Ende-zu-Ende-verschlüsselt. ' : '⚠︎ Unverschlüsselt. '}Alle Geräte mit diesem Token teilen denselben Stand.</p>
            </div>
            <button className="btn-ghost" onClick={onSyncNow} disabled={state.state === 'syncing' || locked}><Icon name="RefreshCw" size={14} className={state.state === 'syncing' ? 'spin' : ''} /> Jetzt</button>
          </div>

          {(tokenBroken || showToken) && (
            <div className="sync-enc">
              <p className="shot-hint">{tokenBroken
                ? 'GitHub akzeptiert den gespeicherten Token nicht mehr (gelöscht, abgelaufen oder ersetzt). Trag hier deinen neuen Token ein – dieses Gerät behält seinen Schlüssel, ein Sync-Passwort ist nicht nötig.'
                : 'Neuen GitHub-Token für dieses Gerät eintragen. Schlüssel und Daten bleiben erhalten.'}</p>
              <div className="chip-add">
                <input type="password" autoComplete="off" placeholder="Neuer GitHub-Token" value={newToken} onChange={e => setNewToken(e.target.value)} aria-label="Neuer GitHub-Token"
                  onKeyDown={e => { if (e.key === 'Enter' && newToken.trim()) replace(); }} />
                <button className="btn-primary" disabled={busy || !newToken.trim()} onClick={replace}>{busy ? 'Prüfe …' : 'Token speichern'}</button>
              </div>
            </div>
          )}
          {!tokenBroken && !showToken && (
            <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setShowToken(true)}>Neuen GitHub-Token eintragen</button>
          )}

          {(locked || (!cfg.keyB64 && showEnc)) && (
            <div className="sync-enc">
              <p className="shot-hint">{locked
                ? 'Deine Sync-Daten sind verschlüsselt. Gib das Sync-Passwort ein, das du auf deinem ersten Gerät festgelegt hast.'
                : 'Lege ein Sync-Passwort fest. Ohne dieses Passwort kann niemand deine Daten im Gist lesen – auch nicht mit dem Token. Wenn du es vergisst, sind die Daten im Gist verloren (die Daten auf deinen Geräten bleiben erhalten).'}</p>
              <input type="password" autoComplete={locked ? 'current-password' : 'new-password'} placeholder="Sync-Passwort" value={pass} onChange={e => setPass(e.target.value)} />
              {!locked && <input type="password" autoComplete="new-password" placeholder="Passwort wiederholen" value={pass2} onChange={e => setPass2(e.target.value)} />}
              <button className="btn-primary" style={{ alignSelf: 'flex-start' }} disabled={busy || !pass} onClick={unlock}>{busy ? 'Einen Moment …' : locked ? 'Entsperren' : 'Verschlüsselung aktivieren'}</button>
            </div>
          )}
          {!cfg.keyB64 && !locked && !showEnc && (
            <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowEnc(true)}><Icon name="Lock" size={14} /> Ende-zu-Ende-Verschlüsselung aktivieren (empfohlen)</button>
          )}

          {!confirmOff ? (
            <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirmOff(true)}><Icon name="CloudOff" size={14} /> Sync auf diesem Gerät trennen</button>
          ) : (
            <div className="danger-zone confirming">
              <div><strong>Sync trennen?</strong><p>Die Daten bleiben auf diesem Gerät und im Gist erhalten – nur der Abgleich stoppt; Token und Schlüssel werden hier gelöscht.</p></div>
              <div className="danger-confirm-actions">
                <button className="btn-ghost" onClick={() => setConfirmOff(false)}>Abbrechen</button>
                <button className="btn-danger" onClick={() => { onDisconnect(); setConfirmOff(false); }}>Trennen</button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="shot-hint">Nutze TradeTracer auf PC, Handy und Tablet mit demselben Stand. Die Daten liegen – verschlüsselt – in einem geheimen Gist in deinem GitHub-Konto. Kein fremder Server.</p>
          <input type="password" autoComplete="off" placeholder="GitHub-Token (ghp_… oder github_pat_…)" value={token} onChange={e => setToken(e.target.value)} aria-label="GitHub-Token" />
          <div className="form-row">
            <input type="password" autoComplete="new-password" placeholder="Sync-Passwort (empfohlen)" value={pass} onChange={e => setPass(e.target.value)} aria-label="Sync-Passwort" />
            <input type="password" autoComplete="new-password" placeholder="Passwort wiederholen" value={pass2} onChange={e => setPass2(e.target.value)} aria-label="Sync-Passwort wiederholen" />
          </div>
          <p className="shot-hint">Auf dem ersten Gerät legst du das Passwort fest, auf allen weiteren gibst du dasselbe ein (Wiederholung dort nicht nötig).</p>
          <button className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={connect} disabled={busy || !token.trim()}>{busy ? 'Verbinde …' : 'Verbinden'}</button>
          <button type="button" className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHelp(h => !h)} aria-expanded={showHelp}>
            <Icon name={showHelp ? 'ChevronUp' : 'ChevronDown'} size={14} /> So bekommst du einen Token
          </button>
          {showHelp && (
            <ol className="report-list" style={{ margin: 0 }}>
              <li>Öffne <a href="https://github.com/settings/tokens/new?scopes=gist&description=TradeTracer%20Sync" target="_blank" rel="noopener" className="txt-accent">github.com/settings/tokens/new</a> (Token classic).</li>
              <li>Nur das Häkchen <b>gist</b> setzen, Ablaufdatum nach Wunsch.</li>
              <li>„Generate token“ klicken, Token kopieren und hier einfügen.</li>
              <li>Auf jedem weiteren Gerät denselben Token und dasselbe Sync-Passwort eingeben.</li>
            </ol>
          )}
        </>
      )}
      {msg && <p className="backup-msg" role="status" style={msg.ok ? undefined : { color: 'var(--loss)' }}>{msg.text}</p>}
    </div>
  );
}

function SettingsModal({ settings, accounts, trades, onSave, onClose, onReset, onExport, onImport, sync }) {
  const [local, setLocal] = useState(settings);
  const [accs, setAccs] = useState(accounts);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importMsg, setImportMsg] = useState('');
  const fileInputRef = useRef(null);
  const dialogRef = useDialog(onClose);

  const countFor = (id) => trades.filter(t => t.accountId === id).length;
  const updateAcc = (id, patch) => setAccs(list => list.map(a => a.id === id ? { ...a, ...patch } : a));
  const addAcc = () => setAccs(list => [...list, { id: uid('acc'), name: `Konto ${list.length + 1}`, startingBalance: 10000, hue: ACCOUNT_HUES[list.length % ACCOUNT_HUES.length] }]);
  const removeAcc = (id) => { setAccs(list => list.filter(a => a.id !== id)); setConfirmDelete(null); };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result);
        await onImport(data);
        setImportMsg('Backup erfolgreich importiert.');
      } catch (err) {
        setImportMsg('Datei konnte nicht gelesen werden – bitte eine gültige Backup-Datei wählen.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal glass-strong" ref={dialogRef} data-dialog tabIndex={-1} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Einstellungen">
        <div className="modal-head">
          <h2><Icon name="Settings" size={17} /> Einstellungen</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="X" size={18} /></button>
        </div>
        <div className="modal-body">
          <SyncSection sync={sync} />

          <div className="settings-section">
            <span className="mindset-label">Konten & Portfolios</span>
            <div className="acc-row acc-head" aria-hidden="true"><span /><span>Name</span><span>Währung</span><span>Startkapital</span><span /></div>
            {accs.map(a => (
              <div key={a.id}>
                <div className="acc-row">
                  <button type="button" className="acc-color" style={{ background: `hsl(${a.hue} 70% 60%)` }} title="Farbe wechseln"
                    onClick={() => updateAcc(a.id, { hue: ACCOUNT_HUES[(ACCOUNT_HUES.indexOf(a.hue) + 1) % ACCOUNT_HUES.length] })} />
                  <input value={a.name} onChange={e => updateAcc(a.id, { name: e.target.value })} aria-label="Kontoname" />
                  <input type="text" maxLength={3} value={a.currency || local.currency} onChange={e => updateAcc(a.id, { currency: e.target.value })} aria-label="Kontowährung" title="Kontowährung" />
                  <input type="number" value={a.startingBalance} onChange={e => updateAcc(a.id, { startingBalance: Number(e.target.value) })} aria-label="Startkapital" title="Startkapital" />
                  <button className="icon-btn danger" disabled={accs.length <= 1} onClick={() => setConfirmDelete(a.id)} aria-label="Konto löschen" style={accs.length <= 1 ? { opacity: .35, cursor: 'not-allowed' } : undefined}><Icon name="Trash2" size={14} /></button>
                </div>
                {a.currency && a.currency !== local.currency && (
                  <label className="fx-row">1 {a.currency} = ? {local.currency}
                    <input type="number" step="any" min="0" placeholder="z.B. 0.92" value={local.fx?.[a.currency] ?? ''}
                      onChange={e => setLocal(s => ({ ...s, fx: { ...(s.fx || {}), [a.currency]: e.target.value === '' ? '' : Number(e.target.value) } }))} />
                    <span className="shot-hint">Wird für „Alle Konten“ zur Umrechnung genutzt. Kurs bei Bedarf aktualisieren.</span>
                  </label>
                )}
                {confirmDelete === a.id && (
                  <div className="danger-zone confirming" style={{ marginTop: 8 }}>
                    <div><strong>„{a.name}" löschen?</strong><p>{countFor(a.id)} zugehörige Trades werden beim Speichern ebenfalls gelöscht.</p></div>
                    <div className="danger-confirm-actions">
                      <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Abbrechen</button>
                      <button className="btn-danger" onClick={() => removeAcc(a.id)}>Konto entfernen</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            <button className="btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={addAcc}><Icon name="Plus" size={14} /> Konto hinzufügen</button>
          </div>

          <div className="settings-section">
            <span className="mindset-label">Darstellung</span>
            <div className="form-row">
              <label>Basiswährung
                <input type="text" maxLength={3} value={local.currency} onChange={e => setLocal(s => ({ ...s, currency: e.target.value }))} />
              </label>
              <label>Erscheinungsbild
                <select value={local.theme || 'dark'} onChange={e => setLocal(s => ({ ...s, theme: e.target.value }))}>
                  <option value="dark">Dunkel</option>
                  <option value="light">Hell</option>
                  <option value="system">Wie System</option>
                </select>
              </label>
            </div>
            <div className="hue-field">
              <div className="hue-field-head">
                <span>Akzentfarbe</span>
                <span className="hue-swatch" style={{ background: `hsl(${local.accentHue} 72% 60%)` }} />
              </div>
              <input type="range" min={0} max={360} value={local.accentHue} className="hue-slider"
                onChange={e => setLocal(s => ({ ...s, accentHue: Number(e.target.value) }))} />
              <div className="hue-presets">
                {[38, 0, 25, 150, 190, 220, 265, 320].map(h => (
                  <button key={h} type="button" className={`hue-preset ${local.accentHue === h ? 'active' : ''}`}
                    style={{ background: `hsl(${h} 72% 60%)` }} onClick={() => setLocal(s => ({ ...s, accentHue: h }))} aria-label={`Farbton ${h}`} />
                ))}
              </div>
            </div>
            <div className="settings-row">
              <div><strong>Animierter Hintergrund</strong><p>Shader-Gradient in Bewegung. Aus = spart Akku.</p></div>
              <Switch on={local.animatedBg} onChange={v => setLocal(s => ({ ...s, animatedBg: v }))} label="Animierter Hintergrund" />
            </div>
            <div className="settings-row">
              <div><strong>Privatsphäre-Modus</strong><p>Blendet alle Geldbeträge aus – ideal für Screenshots. Taste <span className="kbd">P</span></p></div>
              <Switch on={local.privacy} onChange={v => setLocal(s => ({ ...s, privacy: v }))} label="Privatsphäre-Modus" />
            </div>
          </div>

          <div className="settings-section">
            <span className="mindset-label">Backup</span>
            <p className="shot-hint">Sichert Trades, Konten, Plan, Mindset-Einträge und Screenshots in einer Datei.</p>
            <div className="backup-actions">
              <button className="btn-ghost" onClick={onExport}><Icon name="Download" size={14} /> Exportieren</button>
              <button className="btn-ghost" onClick={() => fileInputRef.current?.click()}><Icon name="Upload" size={14} /> Importieren</button>
              <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleFileChange} />
            </div>
            {importMsg && <p className="backup-msg">{importMsg}</p>}
          </div>

          <div className="settings-section">
            <span className="mindset-label">Tastenkürzel</span>
            <div className="chip-row" style={{ fontSize: 12.5, color: 'var(--text-muted)', gap: 14 }}>
              <span><span className="kbd">N</span> Neuer Trade</span>
              <span><span className="kbd">1–7</span> Tabs</span>
              <span><span className="kbd">P</span> Privatsphäre</span>
              <span><span className="kbd">Esc</span> Schließen</span>
            </div>
          </div>

          <div className={`danger-zone ${confirmReset ? 'confirming' : ''}`}>
            {!confirmReset ? (
              <>
                <div><strong>Alle Trades löschen</strong><p>Entfernt sämtliche Trades und Screenshots unwiderruflich.</p></div>
                <button className="btn-danger" onClick={() => setConfirmReset(true)}><Icon name="Trash2" size={14} /> Zurücksetzen</button>
              </>
            ) : (
              <>
                <div>
                  <strong>Wirklich alles löschen?</strong>
                  <p>{trades.length > 0 ? `${trades.length} Trade${trades.length === 1 ? '' : 's'} werden` : 'Alle Daten werden'} unwiderruflich entfernt. Das kann nicht rückgängig gemacht werden.</p>
                </div>
                <div className="danger-confirm-actions">
                  <button className="btn-ghost" onClick={() => setConfirmReset(false)}>Abbrechen</button>
                  <button className="btn-danger" onClick={onReset}><Icon name="Trash2" size={14} /> Endgültig löschen</button>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Abbrechen</button>
          <button className="btn-primary" onClick={() => onSave(local, accs)}>Speichern</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Mindset-Check-in (Pre-/Post-Session)                                    */
/* ---------------------------------------------------------------------- */

function MindsetCard({ entry, onChange, streak, date }) {
  const isPast = date && date < todayISO();
  const [session, setSession] = useState(() => isPast || new Date().getHours() >= 15 ? 'post' : 'pre');
  const e = entry || defaultMindsetEntry();

  const updatePre = (patch) => onChange({ ...e, pre: { ...e.pre, ...patch } });
  const updatePost = (patch) => onChange({ ...e, post: { ...e.post, ...patch } });
  const toggleChip = (list, value) => list.includes(value) ? list.filter(v => v !== value) : [...list, value];
  const toggleChecklist = (idx) => {
    const next = [...e.pre.checklist];
    next[idx] = !next[idx];
    updatePre({ checklist: next });
  };
  const checkedCount = e.pre.checklist.filter(Boolean).length;

  return (
    <div className="panel mindset-card">
      <div className="mindset-head">
        <div className="mindset-title">
          <span className="plan-icon tone-pink"><Icon name="Brain" size={16} /></span>
          <h3>{isPast ? `Mindset · ${fmtDateShort(date)}` : 'Mindset-Check-in'}</h3>
          {streak > 0 && <span className="streak-pill"><Icon name="Flame" size={12} /> {streak} {streak === 1 ? 'Tag' : 'Tage'}</span>}
        </div>
        <div className="seg-control mini">
          <button type="button" className={session === 'pre' ? 'active' : ''} onClick={() => setSession('pre')}>Vor der Session{e.pre.done ? ' ✓' : ''}</button>
          <button type="button" className={session === 'post' ? 'active' : ''} onClick={() => setSession('post')}>Danach{e.post.done ? ' ✓' : ''}</button>
        </div>
      </div>

      {session === 'pre' && (
        e.pre.done ? (
          <div className="mindset-summary">
            <span>{PRE_MOODS.find(m => m.key === e.pre.mood)?.emoji || '—'} {PRE_MOODS.find(m => m.key === e.pre.mood)?.label || 'Keine Angabe'}</span>
            <span className="dot">·</span>
            <span>{checkedCount}/{PRE_CHECKLIST.length} erledigt</span>
            <button className="btn-ghost" onClick={() => updatePre({ done: false })}><Icon name="Pencil" size={13} /> Bearbeiten</button>
          </div>
        ) : (
          <>
            <p className="mindset-question">Wie fühlst du dich heute?</p>
            <div className="mood-row">
              {PRE_MOODS.map(m => (
                <button key={m.key} type="button" className={`mood-btn ${e.pre.mood === m.key ? 'active' : ''}`} onClick={() => updatePre({ mood: m.key })}>
                  <span className="mood-emoji">{m.emoji}</span><span>{m.label}</span>
                </button>
              ))}
            </div>
            <div className="mindset-block">
              <span className="mindset-label">Pre-Market-Checkliste</span>
              <div className="mindset-checklist">
                {PRE_CHECKLIST.map((item, i) => (
                  <button key={i} type="button" className={`checklist-item ${e.pre.checklist[i] ? 'checked' : ''}`} onClick={() => toggleChecklist(i)}>
                    <span className="checklist-dot">{e.pre.checklist[i] && <Icon name="Check" size={11} strokeWidth={3} />}</span>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <textarea rows={2} placeholder="Wie schätzt du den heutigen Markt ein?" value={e.pre.note} onChange={ev => updatePre({ note: ev.target.value })} />
            <button className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => updatePre({ done: true })}><Icon name="Check" size={14} /> Fertig</button>
          </>
        )
      )}

      {session === 'post' && (
        e.post.done ? (
          <div className="mindset-summary">
            <span>{DAY_RATINGS.find(r => r.key === e.post.rating)?.label || 'Keine Bewertung'}</span>
            <span className="dot">·</span>
            <span>{e.post.worked.length} positiv · {e.post.improve.length} zu verbessern</span>
            <button className="btn-ghost" onClick={() => updatePost({ done: false })}><Icon name="Pencil" size={13} /> Bearbeiten</button>
          </div>
        ) : (
          <>
            <p className="mindset-question">Wie lief der Tag?</p>
            <div className="rating-row">
              {DAY_RATINGS.map(r => (
                <button key={r.key} type="button" className={`rating-btn tone-${r.key} ${e.post.rating === r.key ? 'active' : ''}`} onClick={() => updatePost({ rating: r.key })}>
                  <Icon name={r.icon} size={20} /><span>{r.label}</span>
                </button>
              ))}
            </div>
            <div className="mindset-block">
              <span className="mindset-label">Was hat funktioniert</span>
              <div className="chip-row">
                {WORKED_OPTIONS.map(o => (
                  <button key={o} type="button" className={`chip toggle good ${e.post.worked.includes(o) ? 'active' : ''}`} onClick={() => updatePost({ worked: toggleChip(e.post.worked, o) })}>{o}</button>
                ))}
              </div>
            </div>
            <div className="mindset-block">
              <span className="mindset-label">Was verbessert werden sollte</span>
              <div className="chip-row">
                {IMPROVE_OPTIONS.map(o => (
                  <button key={o} type="button" className={`chip toggle warn ${e.post.improve.includes(o) ? 'active' : ''}`} onClick={() => updatePost({ improve: toggleChip(e.post.improve, o) })}>{o}</button>
                ))}
              </div>
            </div>
            <textarea rows={2} placeholder="Was ist deine wichtigste Erkenntnis von heute?" value={e.post.takeaway} onChange={ev => updatePost({ takeaway: ev.target.value })} />
            <button className="btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => updatePost({ done: true })}><Icon name="Check" size={14} /> Fertig</button>
          </>
        )
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Excel-/CSV-Import-Dialog                                               */
/* Zwei Formate: Round-Trips (1 Zeile = 1 Trade) oder Ausführungen         */
/* (Kauf/Verkauf je Zeile, z.B. Broker-Export) → FIFO-Zusammenführung.     */
/* ---------------------------------------------------------------------- */

function ImportModal({ onClose, onImport, accounts, defaultAccountId }) {
  const [step, setStep] = useState('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mode, setMode] = useState('trades'); // trades | execs
  const [presetId, setPresetId] = useState('generic');
  const [mapping, setMapping] = useState({});
  const [multiplier, setMultiplier] = useState(1);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState(defaultAccountId);
  const fileInputRef = useRef(null);
  const dialogRef = useDialog(onClose);

  const downloadTemplate = async (kind) => {
    try {
      const XLSX = await ensureXLSX();
      const aoa = kind === 'execs'
        ? [['Datum', 'Uhrzeit', 'Symbol', 'Kauf/Verkauf', 'Menge', 'Kurs', 'Gebühren'],
          ['2026-07-21', '09:35', 'AAPL', 'Kauf', 10, 150, 1], ['2026-07-21', '10:05', 'AAPL', 'Kauf', 5, 151, 1], ['2026-07-21', '11:20', 'AAPL', 'Verkauf', 15, 154, 1]]
        : [['Datum', 'Symbol', 'Richtung', 'Einstieg', 'Ausstieg', 'Menge', 'Gebühren', 'Stop-Loss', 'Take-Profit', 'Multiplikator', 'Strategie', 'Einstiegszeit', 'Ausstiegszeit', 'Notizen'],
          ['2026-07-21', 'AAPL', 'long', 150, 155, 10, 1, 148, 156, 1, 'Breakout', '09:35', '10:20', 'Beispiel-Trade']];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Trades');
      XLSX.writeFile(wb, kind === 'execs' ? 'ausfuehrungen-vorlage.xlsx' : 'trade-import-vorlage.xlsx');
    } catch (e) { setParseError(e.message); }
  };

  const applyMode = (m, hdrs = headers, pid) => {
    setMode(m);
    if (m === 'trades') setMapping(guessImportMapping(hdrs));
    else {
      const preset = pid ? BROKER_PRESETS.find(p => p.id === pid) : detectBrokerPreset(hdrs);
      setPresetId(preset.id);
      setMapping(mapExecHeaders(hdrs, preset));
    }
  };

  const handleFile = async (file) => {
    setParseError('');
    setFileName(file.name);
    setBusy(true);
    try {
      const XLSX = await ensureXLSX();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
      // Kopfzeile = erste Zeile mit mindestens 3 ausgefüllten Zellen (Broker-Exporte haben oft Vorspann)
      const hIdx = Math.max(0, aoa.findIndex(r => r.filter(c => String(c ?? '').trim() !== '').length >= 3));
      const headerRow = (aoa[hIdx] || []).map(h => String(h ?? '').trim());
      const dataRows = aoa.slice(hIdx + 1).filter(r => r.some(c => c !== '' && c != null));
      if (!headerRow.length || dataRows.length === 0) { setParseError('Es wurden keine Datenzeilen gefunden.'); setBusy(false); return; }
      setHeaders(headerRow);
      setRows(dataRows);
      // Automatisch erkennen: Gibt es Ein- UND Ausstiegsspalten → Round-Trips, sonst Ausführungen
      const tm = guessImportMapping(headerRow);
      const looksLikeTrades = tm.entryPrice >= 0 && tm.exitPrice >= 0 && tm.entryPrice !== tm.exitPrice;
      applyMode(looksLikeTrades ? 'trades' : 'execs', headerRow);
      setStep('map');
    } catch (err) {
      setParseError(err.message && err.message.includes('Bibliothek') ? err.message : 'Die Datei konnte nicht gelesen werden. Bitte eine gültige Excel- (.xlsx) oder CSV-Datei wählen.');
    }
    setBusy(false);
  };

  const fields = mode === 'trades' ? IMPORT_FIELDS : EXEC_FIELDS;
  const requiredMissing = fields.filter(f => f.required && !(mapping[f.key] >= 0));

  const preview = useMemo(() => {
    if (step !== 'map' || mode !== 'execs' || requiredMissing.length) return null;
    const { execs } = buildExecsFromRows(rows, mapping);
    const trades = buildTradesFromExecutions(execs, { accountId, multiplier: Number(multiplier) || 1 });
    return { execs: execs.length, trades: trades.length, open: trades.filter(isOpen).length };
  }, [step, mode, rows, mapping, accountId, multiplier, requiredMissing.length]);

  const runImport = () => {
    let trades, errors;
    if (mode === 'trades') {
      ({ trades, errors } = buildTradesFromImportRows(rows, mapping, accountId));
    } else {
      const r = buildExecsFromRows(rows, mapping);
      errors = r.errors;
      trades = buildTradesFromExecutions(r.execs, { accountId, multiplier: Number(multiplier) || 1 });
    }
    if (trades.length > 0) onImport(trades);
    setResult({ imported: trades.length, open: trades.filter(isOpen).length, skipped: errors.length, errors: errors.slice(0, 8) });
    setStep('done');
  };

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal glass-strong" ref={dialogRef} data-dialog tabIndex={-1} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Trades importieren">
        <div className="modal-head">
          <h2><Icon name="FileSpreadsheet" size={17} /> Trades importieren</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="X" size={18} /></button>
        </div>

        <div className="modal-body">
          {step === 'upload' && (
            <>
              <div className="import-dropzone" role="button" tabIndex={0} onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}>
                {busy ? <div className="loader" /> : <Icon name="FileSpreadsheet" size={30} strokeWidth={1.4} />}
                <p><strong>Datei auswählen</strong> oder hierher ziehen</p>
                <span>.xlsx, .xls oder .csv – eigene Liste oder Broker-Export</span>
                <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              </div>
              {parseError && <div className="form-error"><Icon name="AlertTriangle" size={14} /> {parseError}</div>}
              <div className="import-help">
                <strong>Broker-Exporte</strong>
                <p>Interactive Brokers (Activity/Flex „Trades“), Binance (Spot-Tradeverlauf), Scalable Capital, Trade Republic und andere Kauf/Verkauf-Listen werden erkannt. Mehrere Käufe und Teilverkäufe werden automatisch zu Trades zusammengefasst (FIFO); was noch nicht verkauft ist, wird als offene Position angelegt.</p>
              </div>
              <div className="backup-actions">
                <button className="btn-ghost" onClick={() => downloadTemplate('trades')}><Icon name="Download" size={14} /> Vorlage: 1 Zeile = 1 Trade</button>
                <button className="btn-ghost" onClick={() => downloadTemplate('execs')}><Icon name="Download" size={14} /> Vorlage: Kauf/Verkauf-Liste</button>
              </div>
            </>
          )}

          {step === 'map' && (
            <>
              <p className="import-summary"><strong>{fileName}</strong> · {rows.length} Zeile{rows.length === 1 ? '' : 'n'} gefunden.</p>
              <div className="seg-control">
                <button type="button" className={mode === 'trades' ? 'active' : ''} onClick={() => applyMode('trades')}>1 Zeile = 1 Trade</button>
                <button type="button" className={mode === 'execs' ? 'active' : ''} onClick={() => applyMode('execs')}>Kauf/Verkauf-Liste</button>
              </div>
              <div className="form-row">
                {mode === 'execs' && (
                  <label>Format
                    <select value={presetId} onChange={e => applyMode('execs', headers, e.target.value)}>
                      {BROKER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </label>
                )}
                {accounts.length > 1 && (
                  <label>Importieren in Konto
                    <select value={accountId} onChange={e => setAccountId(e.target.value)}>
                      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                )}
                {mode === 'execs' && (
                  <label>Multiplikator für alle
                    <select value={multiplier} onChange={e => setMultiplier(Number(e.target.value))}>
                      {MULTIPLIER_PRESETS.map(p => <option key={p.label} value={p.value}>{p.label}</option>)}
                    </select>
                  </label>
                )}
              </div>
              <p className="shot-hint">Die Spalten wurden automatisch zugeordnet – bitte kurz prüfen. Broker ändern ihre Exporte gelegentlich.</p>
              <div className="import-mapping-grid">
                {fields.map(f => (
                  <label key={f.key}>
                    <span>{f.label}{f.required && <span className="label-optional"> *</span>}</span>
                    <select value={mapping[f.key] ?? -1} onChange={e => setMapping(m => ({ ...m, [f.key]: Number(e.target.value) }))}>
                      <option value={-1}>— nicht zuordnen —</option>
                      {headers.map((h, idx) => <option key={idx} value={idx}>{h || `Spalte ${idx + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {requiredMissing.length > 0 && (
                <div className="form-warning-box">
                  <div className="form-warning-item"><Icon name="AlertTriangle" size={13} /> Bitte noch zuordnen: {requiredMissing.map(f => f.label).join(', ')}</div>
                </div>
              )}
              {preview && (
                <div className="insight info">
                  <div className="insight-icon"><Icon name="Layers" size={16} /></div>
                  <div><p className="insight-title">{preview.execs} Ausführungen → {preview.trades} Trades</p>
                    <p className="insight-text">{preview.open > 0 ? `${preview.open} davon noch offen (nicht vollständig verkauft).` : 'Alle Positionen sind geschlossen.'}</p></div>
                </div>
              )}
              <div className="import-preview">
                <span className="mindset-label">Vorschau (erste {Math.min(5, rows.length)} Zeilen)</span>
                <div className="table-wrap">
                  <table className="trade-table compact">
                    <thead><tr>{fields.filter(f => mapping[f.key] >= 0).map(f => <th key={f.key}>{f.label}</th>)}</tr></thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, i) => (
                        <tr key={i}>{fields.filter(f => mapping[f.key] >= 0).map(f => <td key={f.key} className="muted">{String(row[mapping[f.key]] ?? '')}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {step === 'done' && result && (
            <div className="import-result" role="status">
              <div className="import-result-icon"><Icon name="Check" size={22} /></div>
              <h3>{result.imported} Trade{result.imported === 1 ? '' : 's'} importiert</h3>
              {result.open > 0 && <p>{result.open} offene Position{result.open === 1 ? '' : 'en'} – du findest sie auf der Übersicht.</p>}
              {result.skipped > 0 && <p>{result.skipped} Zeile{result.skipped === 1 ? '' : 'n'} übersprungen.</p>}
              {result.errors.length > 0 && (
                <div className="rule-list">
                  {result.errors.map((e, i) => <div key={i} className="rule-item"><span className="rule-dot" /><span className="rule-text">{e}</span></div>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-foot">
          {step === 'upload' && <button className="btn-ghost" onClick={onClose}>Abbrechen</button>}
          {step === 'map' && (
            <>
              <button className="btn-ghost" onClick={() => setStep('upload')}><Icon name="ArrowLeft" size={14} /> Zurück</button>
              <button className="btn-primary" disabled={requiredMissing.length > 0} onClick={runImport}>
                Importieren <Icon name="ArrowRight" size={14} />
              </button>
            </>
          )}
          {step === 'done' && <button className="btn-primary" onClick={onClose}>Fertig</button>}
        </div>
      </div>
    </div>
  );
}

/* Mindset-Eintrag für einen beliebigen Tag (aus dem Kalender) */
function MindsetModal({ date, entry, onChange, onClose }) {
  const dialogRef = useDialog(onClose);
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal glass-strong" ref={dialogRef} data-dialog tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Mindset ${fmtDateLong(date)}`} onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2><Icon name="Brain" size={17} /> {fmtDateLong(date)}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="X" size={18} /></button>
        </div>
        <div className="modal-body">
          <MindsetCard entry={entry} onChange={onChange} date={date} />
        </div>
      </div>
    </div>
  );
}
