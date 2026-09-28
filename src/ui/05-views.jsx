/* ---------------------------------------------------------------------- */
/* Dashboard                                                              */
/* ---------------------------------------------------------------------- */

const RANGE_OPTIONS = [
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 31 },
  { key: '3M', label: '3M', days: 92 },
  { key: 'YTD', label: 'YTD' },
  { key: 'ALL', label: 'Alle' }
];

function periodPnl(trades, fromISO) {
  return sum(trades.filter(t => t.date >= fromISO).map(calcPnL));
}

function LimitBanner({ status, plan, currency }) {
  if (!status || !(status.lossHit || status.countHit)) return null;
  return (
    <div className={`limit-banner ${status.locked ? 'locked' : ''}`} role="alert">
      <span className="plan-icon tone-loss"><Icon name={status.locked ? 'Lock' : 'AlertTriangle'} size={17} /></span>
      <div>
        <strong>{status.lossHit ? 'Tagesverlust-Limit erreicht' : 'Maximale Anzahl Trades erreicht'}</strong>
        <p>{status.lossHit
          ? `Heute ${fmtMoney(-status.loss, currency)} bei einem Limit von ${fmtMoney(plan.maxDailyDrawdown, currency)}.`
          : `${status.count} von ${plan.maxTradesPerDay} Trades.`} {status.locked ? 'Dein Plan sperrt neue Trades für heute – Zeit für die Nachbereitung.' : 'Laut Plan ist für heute Schluss.'}</p>
      </div>
    </div>
  );
}

function OpenPositions({ trades, currencyFor, onOpenTrade }) {
  if (!trades.length) return null;
  const riskByCur = {};
  trades.forEach(t => { const r = openRisk(t); if (r != null) { const c = currencyFor(t.accountId); riskByCur[c] = (riskByCur[c] || 0) + r; } });
  const noStop = trades.filter(t => !t.stopLoss).length;
  return (
    <div className="panel">
      <div className="panel-head">
        <h3><Icon name="Layers" size={15} /> Offene Positionen <span className="pill pill-accent">{trades.length}</span></h3>
        <span className="panel-sub">
          {Object.entries(riskByCur).map(([c, r]) => `Risiko bis Stop: ${fmtMoney(r, c)}`).join(' · ')}
          {noStop > 0 && <span className="txt-loss"> · {noStop} ohne Stop-Loss</span>}
        </span>
      </div>
      <div className="table-wrap">
        <table className="trade-table compact">
          <thead><tr><th>Seit</th><th>Symbol</th><th>Richtung</th><th className="num">Offen</th><th className="num">Ø Einstieg</th><th className="num">Stop</th><th className="num">Risiko</th></tr></thead>
          <tbody>
            {trades.map(t => {
              const r = openRisk(t);
              return (
                <tr key={t.id} className="clickable" {...pressable(() => onOpenTrade(t), `Offene Position ${t.symbol} öffnen`)}>
                  <td className="muted">{fmtDateShort(t.date)}</td>
                  <td className="symbol">{t.symbol}{isRealized(t) && <span className="pill pill-neutral" style={{ marginLeft: 6 }}>teilw.</span>}</td>
                  <td><DirectionPill direction={t.direction} /></td>
                  <td className="num">{fmtNum(openQty(t), openQty(t) % 1 ? 2 : 0)}</td>
                  <td className="num">{fmtNum(t.entryPrice, t.entryPrice < 10 ? 4 : 2)}</td>
                  <td className="num">{t.stopLoss ?? '—'}</td>
                  <td className={`num ${r == null ? 'txt-loss' : ''}`}>{r == null ? 'kein Stop' : fmtMoney(r, currencyFor(t.accountId))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Dashboard({ trades, openTrades = [], currencyFor, limitStatus, stats, currency, onAdd, onImport, mindsetEntry, onMindsetChange, plan, insights, onOpenTrade, onGoto, streak, startingBalance }) {
  const [range, setRange] = useState('ALL');
  const isEmpty = trades.length === 0;
  const curveIsUp = stats.totalPnL >= 0;

  const curve = useMemo(() => {
    if (range === 'ALL') return stats.equityCurve;
    const opt = RANGE_OPTIONS.find(r => r.key === range);
    const from = range === 'YTD' ? `${new Date().getFullYear()}-01-01` : addDaysISO(todayISO(), -opt.days);
    const before = stats.equityCurve.filter(p => p.date < from);
    const within = stats.equityCurve.filter(p => p.date >= from && p.label !== 'Start');
    const startBal = before.length ? before[before.length - 1].balance : startingBalance;
    return [{ date: from, balance: startBal, label: 'Start' }, ...within];
  }, [range, stats.equityCurve, startingBalance]);
  const rangePnl = curve.length ? curve[curve.length - 1].balance - curve[0].balance : 0;

  const weekPnl = periodPnl(trades, weekStartISO(todayISO()));
  const monthPnl = periodPnl(trades, todayISO().slice(0, 8) + '01');
  const todayTrades = trades.filter(t => t.date === todayISO());
  const todayPnl = sum(todayTrades.map(calcPnL));
  const pctOf = (v, target) => target > 0 ? clamp((v / target) * 100, 0, 100) : 0;

  return (
    <div className="dash view-anim">
      <LimitBanner status={limitStatus} plan={plan} currency={currency} />
      <OpenPositions trades={openTrades} currencyFor={currencyFor} onOpenTrade={onOpenTrade} />
      {isEmpty ? (
        <>
          {openTrades.length === 0 && <EmptyState icon="Wallet" title="Willkommen bei TradeTracer PRO"
            text="Erfasse deinen ersten Trade oder importiere deinen Broker-Export. Danach bekommst du Equity-Kurve, Kalender, Profi-Metriken und nach 10 Trades deinen persönlichen Coach."
            actionLabel="Ersten Trade erfassen" onAction={onAdd} secondaryLabel="Excel/CSV importieren" onSecondaryAction={onImport} />}
          <MindsetCard entry={mindsetEntry} onChange={onMindsetChange} streak={streak} />
        </>
      ) : (
        <>
          <div className="dash-top">
            <div className="hero-panel">
              <div className="hero-top">
                <div>
                  <span className="eyebrow">Netto-Ergebnis</span>
                  <div className={`hero-value ${curveIsUp ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneySigned(stats.totalPnL, currency)}</div>
                  <div className="hero-sub">
                    Kontostand <strong>{fmtMoney(stats.currentBalance, currency)}</strong>
                    <span className="dot">·</span>
                    <span className={stats.returnPct >= 0 ? 'txt-profit' : 'txt-loss'}>{fmtPct(stats.returnPct, 2)}</span>
                    <span className="dot">·</span>
                    {stats.totalTrades} Trades
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                  <div className="range-tabs">
                    {RANGE_OPTIONS.map(r => <button key={r.key} className={range === r.key ? 'active' : ''} onClick={() => setRange(r.key)}>{r.label}</button>)}
                  </div>
                  {range !== 'ALL' && <span className={`mono ${rangePnl >= 0 ? 'txt-profit' : 'txt-loss'}`} style={{ fontSize: 12.5 }}>{fmtMoneySigned(rangePnl, currency)}</span>}
                </div>
              </div>
              <div className="hero-chart">
                <AreaChart data={curve} valueKey="balance" color={rangePnl >= 0 || (range === 'ALL' && curveIsUp) ? '#3FCF8E' : '#F0616D'} height={170} currency={currency} />
              </div>
            </div>

            <div className="goals-panel panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="title"><Icon name="Target" size={16} /> Ziele</h3>
                <span className={`mono ${todayPnl >= 0 ? 'txt-profit' : 'txt-loss'}`} style={{ fontSize: 12.5 }}>Heute {fmtMoneySigned(todayPnl, currency)}</span>
              </div>
              <div className="goals-row">
                <div className="goal-ring">
                  <CircularProgress percent={pctOf(weekPnl, plan.weeklyTarget)} size={92} stroke={8} color={weekPnl >= plan.weeklyTarget ? 'var(--profit)' : 'var(--accent)'} />
                  <span className="goal-label">Woche</span>
                  <span className={`goal-val ${weekPnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneyShort(weekPnl, currency)} / {fmtMoneyShort(plan.weeklyTarget, currency)}</span>
                </div>
                <div className="goal-ring">
                  <CircularProgress percent={pctOf(monthPnl, plan.monthlyTarget)} size={92} stroke={8} color={monthPnl >= plan.monthlyTarget ? 'var(--profit)' : 'var(--accent)'} />
                  <span className="goal-label">Monat</span>
                  <span className={`goal-val ${monthPnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneyShort(monthPnl, currency)} / {fmtMoneyShort(plan.monthlyTarget, currency)}</span>
                </div>
              </div>
              <div className="adherence-chips">
                <span className="mini-stat">{todayTrades.length}/{plan.maxTradesPerDay} Trades heute</span>
                <span className="mini-stat">Serie: {stats.streak === 0 ? '—' : `${Math.abs(stats.streak)}${stats.streak > 0 ? 'G' : 'V'}`}</span>
              </div>
            </div>
          </div>

          <div className="stat-grid">
            <StatCard icon="Target" label="Trefferquote" value={fmtPct(stats.winRate)} sub={`${stats.wins}G / ${stats.losses}V`} />
            <StatCard icon="BarChart3" label="Profitfaktor" value={fmtNum(stats.profitFactor, 2)} valueClass={stats.profitFactor >= 1 ? 'txt-profit' : 'txt-loss'} />
            <StatCard icon="List" label="Erwartungswert" value={fmtMoney(stats.expectancy, currency)} sub="je Trade" valueClass={stats.expectancy >= 0 ? 'txt-profit' : 'txt-loss'} />
            <StatCard icon="Crosshair" label="Ø R-Multiple" value={fmtR(stats.avgRMultiple)} valueClass={stats.avgRMultiple == null ? '' : stats.avgRMultiple >= 0 ? 'txt-profit' : 'txt-loss'} sub="mit Stop-Loss" />
            <StatCard icon="TrendingDown" label="Max. Drawdown" value={fmtMoney(stats.maxDrawdown, currency)} valueClass={stats.maxDrawdown < 0 ? 'txt-loss' : ''} sub={fmtPct(stats.maxDrawdownPct)} />
            <StatCard icon="TrendingUp" label="Ø Gewinn" value={fmtMoney(stats.avgWin, currency)} valueClass="txt-profit" />
            <StatCard icon="TrendingDown" label="Ø Verlust" value={fmtMoney(stats.avgLoss, currency)} valueClass="txt-loss" />
            <StatCard icon="Award" label="Bester Trade" value={fmtMoney(stats.bestTrade, currency)} valueClass="txt-profit" />
            <StatCard icon="AlertTriangle" label="Schlechtester Trade" value={fmtMoney(stats.worstTrade, currency)} valueClass="txt-loss" />
            <StatCard icon="Clock" label="Ø Haltedauer" value={fmtDuration(stats.avgHold)} sub="mit Ein- & Ausstiegszeit" />
          </div>

          <div className="two-col top">
            <MindsetCard entry={mindsetEntry} onChange={onMindsetChange} streak={streak} />
            <div className="panel pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <h3 className="title"><Icon name="Sparkles" size={16} /> Coach-Insights <span className="pro-badge">PRO</span></h3>
                <button className="btn-ghost" onClick={() => onGoto('coach')}>Alle <Icon name="ArrowRight" size={13} /></button>
              </div>
              {trades.length < INSIGHT_MIN_TRADES ? (
                <div className="insight info">
                  <div className="insight-icon"><Icon name="Lock" size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <p className="insight-title">Noch {INSIGHT_MIN_TRADES - trades.length} Trades bis zu deinem ersten Insight</p>
                    <div className="progress-line" style={{ marginTop: 8 }}><div style={{ width: `${(trades.length / INSIGHT_MIN_TRADES) * 100}%` }} /></div>
                  </div>
                </div>
              ) : (
                <div className="insight-list">
                  {insights.slice(0, 3).map((ins, i) => <InsightCard key={i} ins={ins} />)}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h3>Letzte Trades</h3>
              <button className="btn-ghost" onClick={() => onGoto('trades')}>Alle Trades <Icon name="ArrowRight" size={13} /></button>
            </div>
            <div className="table-wrap">
              <table className="trade-table compact">
                <tbody>
                  {stats.recent.map(t => (
                    <tr key={t.id} className="clickable" {...pressable(() => onOpenTrade(t), `Trade ${t.symbol} öffnen`)}>
                      <td className="muted">{fmtDateShort(t.date)}</td>
                      <td className="symbol"><span className="sym-cell">{t.symbol}{t.screenshots?.length > 0 && <span className="has-shot"><Icon name="Image" size={12} /></span>}</span></td>
                      <td><DirectionPill direction={t.direction} /></td>
                      <td className="muted">{t.strategy || '—'}</td>
                      <td><ResultPill result={t.result} /></td>
                      <td className={`num ${calcRMultiple(t) == null ? 'muted' : calcRMultiple(t) >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtR(calcRMultiple(t))}</td>
                      <td className={`num ${t.pnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneySigned(t.pnl, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function InsightCard({ ins }) {
  return (
    <div className={`insight ${ins.tone}`}>
      <div className="insight-icon"><Icon name={ins.icon} size={16} /></div>
      <div style={{ minWidth: 0 }}>
        <p className="insight-title">{ins.title}</p>
        <p className="insight-text">{ins.text}</p>
      </div>
      {ins.metric && <span className={`insight-metric ${ins.tone === 'good' ? 'txt-profit' : ins.tone === 'bad' ? 'txt-loss' : 'txt-accent'}`}>{ins.metric}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Trades-Tabelle                                                          */
/* ---------------------------------------------------------------------- */

function TradesView({ trades, currency, onOpen, onEdit, onDelete, onAdd, onImport, showAccount, accountsById }) {
  const [search, setSearch] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  const strategies = useMemo(() => ['all', ...new Set(trades.map(t => t.strategy).filter(Boolean))], [trades]);
  const tags = useMemo(() => ['all', ...new Set(trades.flatMap(t => [...(t.tags || []), ...(t.setups || [])]))], [trades]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'symbol' ? 'asc' : 'desc'); }
  };
  const sortIndicator = (key) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = trades.filter(t => {
      if (q && !t.symbol.toLowerCase().includes(q) && !(t.notes || '').toLowerCase().includes(q)) return false;
      if (directionFilter !== 'all' && t.direction !== directionFilter) return false;
      if (strategyFilter !== 'all' && t.strategy !== strategyFilter) return false;
      if (tagFilter !== 'all' && !(t.tags || []).includes(tagFilter) && !(t.setups || []).includes(tagFilter)) return false;
      if (outcomeFilter === 'win' && calcPnL(t) <= 0) return false;
      if (outcomeFilter === 'loss' && calcPnL(t) >= 0) return false;
      if (outcomeFilter === 'offplan' && t.onPlan !== false) return false;
      if (outcomeFilter === 'open' && !isOpen(t)) return false;
      if (fromDate && t.date < fromDate) return false;
      if (toDate && t.date > toDate) return false;
      return true;
    });
    const val = (t) => {
      switch (sortKey) {
        case 'symbol': return t.symbol;
        case 'pnl': return calcPnL(t);
        case 'r': return calcRMultiple(t) ?? -Infinity;
        case 'entryPrice': return t.entryPrice;
        case 'exitPrice': return t.exitPrice;
        case 'quantity': return t.quantity;
        default: return `${t.date} ${t.time || ''} ${t.createdAt}`;
      }
    };
    return [...list].sort((a, b) => {
      const av = val(a), bv = val(b);
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [trades, search, directionFilter, strategyFilter, tagFilter, outcomeFilter, fromDate, toDate, sortKey, sortDir]);

  const filteredPnl = sum(filtered.map(calcPnL));

  const exportCSV = () => {
    const header = ['Datum', 'Einstiegszeit', 'Ausstiegsdatum', 'Ausstiegszeit', 'Konto', 'Symbol', 'Richtung', 'Einstieg', 'Ausstieg', 'Stop-Loss', 'Take-Profit', 'Menge', 'Gebühren', 'Strategie', 'Emotion', 'Tags', 'PnL', 'R-Multiple', 'Notizen'];
    const rows = filtered.map(t => {
      const r = calcRMultiple(t);
      return [t.date, t.time, t.exitDate || t.date, t.exitTime, accountsById[t.accountId]?.name || '', t.symbol, t.direction, t.entryPrice, t.exitPrice, t.stopLoss ?? '', t.takeProfit ?? '', t.quantity, t.fees, t.strategy,
        EMOTION_BY_KEY[t.emotion]?.label || '', (t.tags || []).join(', '), calcPnL(t).toFixed(2), r != null ? r.toFixed(2) : '', (t.notes || '').replace(/\n/g, ' ')];
    });
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `trades-${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  if (trades.length === 0) {
    return <EmptyState icon="List" title="Keine Trades vorhanden" text="Erfasse deinen ersten Trade oder importiere eine Excel-/CSV-Liste."
      actionLabel="Trade hinzufügen" onAction={onAdd} secondaryLabel="Aus Excel importieren" onSecondaryAction={onImport} />;
  }

  return (
    <div className="trades-view view-anim">
      <div className="toolbar">
        <div className="search-box">
          <Icon name="Search" size={14} />
          <input placeholder="Symbol oder Notiz…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value)} aria-label="Richtung">
          <option value="all">Alle Richtungen</option>
          <option value="long">Long</option>
          <option value="short">Short</option>
        </select>
        <select value={outcomeFilter} onChange={e => setOutcomeFilter(e.target.value)} aria-label="Ergebnis">
          <option value="all">Alle Ergebnisse</option>
          <option value="win">Nur Gewinner</option>
          <option value="loss">Nur Verlierer</option>
          <option value="offplan">Außerhalb Plan</option>
          <option value="open">Offene Positionen</option>
        </select>
        <select value={strategyFilter} onChange={e => setStrategyFilter(e.target.value)} aria-label="Strategie">
          {strategies.map(s => <option key={s} value={s}>{s === 'all' ? 'Alle Strategien' : s}</option>)}
        </select>
        {tags.length > 1 && (
          <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} aria-label="Tag">
            {tags.map(s => <option key={s} value={s}>{s === 'all' ? 'Alle Tags' : s}</option>)}
          </select>
        )}
        <div className="date-range">
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} aria-label="Von" />
          <span>–</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} aria-label="Bis" />
        </div>
        <span className="spacer" />
        <button className="btn-ghost" onClick={exportCSV}><Icon name="Download" size={14} /> CSV</button>
        <button className="btn-ghost" onClick={onImport}><Icon name="Upload" size={14} /> Import</button>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="panel-sub">{filtered.length} von {trades.length} Trades</span>
          <span className={`mono ${filteredPnl >= 0 ? 'txt-profit' : 'txt-loss'}`} style={{ fontSize: 13 }}>{fmtMoneySigned(filteredPnl, currency)}</span>
        </div>
        <div className="table-wrap">
          <table className="trade-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('date')}>Datum{sortIndicator('date')}</th>
                <th className="sortable" onClick={() => toggleSort('symbol')}>Symbol{sortIndicator('symbol')}</th>
                {showAccount && <th>Konto</th>}
                <th>Richtung</th>
                <th className="num sortable" onClick={() => toggleSort('entryPrice')}>Einstieg{sortIndicator('entryPrice')}</th>
                <th className="num sortable" onClick={() => toggleSort('exitPrice')}>Ausstieg{sortIndicator('exitPrice')}</th>
                <th className="num sortable" onClick={() => toggleSort('quantity')}>Menge{sortIndicator('quantity')}</th>
                <th>Strategie</th>
                <th>Ergebnis</th>
                <th className="num sortable" onClick={() => toggleSort('r')}>R{sortIndicator('r')}</th>
                <th className="num sortable" onClick={() => toggleSort('pnl')}>PnL{sortIndicator('pnl')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const pnl = calcPnL(t);
                const r = calcRMultiple(t);
                const acc = accountsById[t.accountId];
                return (
                  <tr key={t.id} className="clickable" {...pressable(() => onOpen(t), `Trade ${t.symbol} vom ${fmtDateShort(t.date)} öffnen`)}>
                    <td className="muted">{fmtDateShort(t.date)}{t.time && <span style={{ opacity: .6 }}> {t.time}</span>}</td>
                    <td className="symbol"><span className="sym-cell">{t.symbol}
                      {EMOTION_BY_KEY[t.emotion] && <span title={EMOTION_BY_KEY[t.emotion].label}>{EMOTION_BY_KEY[t.emotion].emoji}</span>}
                      {t.screenshots?.length > 0 && <span className="has-shot" title="Screenshot vorhanden"><Icon name="Image" size={12} /></span>}
                    </span></td>
                    {showAccount && <td><span className="sym-cell"><span className="account-dot" style={{ width: 10, height: 10, borderRadius: 4, background: `hsl(${acc?.hue ?? 38} 70% 60%)` }} /><span className="muted">{acc?.name || '—'}</span></span></td>}
                    <td><DirectionPill direction={t.direction} /></td>
                    <td className="num">{t.entryPrice}</td>
                    <td className="num">{t.exitPrice}</td>
                    <td className="num">{t.quantity}</td>
                    <td className="muted">{t.strategy || '—'}</td>
                    <td>{isOpen(t) ? <Pill tone="accent">{isRealized(t) ? 'Teilw. offen' : 'Offen'}</Pill> : <ResultPill result={t.result} />}</td>
                    <td className={`num ${r == null ? 'muted' : r >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtR(r)}</td>
                    <td className={`num ${pnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneySigned(pnl, currency)}</td>
                    <td className="row-actions" onClick={e => e.stopPropagation()}>
                      <button className="icon-btn sm" onClick={() => onEdit(t)} aria-label="Bearbeiten"><Icon name="Pencil" size={13} /></button>
                      <button className="icon-btn sm danger" onClick={() => onDelete(t.id)} aria-label="Löschen"><Icon name="Trash2" size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div className="table-empty">Keine Treffer für diese Filter.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Kalender (P&L-Kalender mit Wochensummen)                                */
/* ---------------------------------------------------------------------- */

function CalendarView({ trades, currency, mindset, onOpenTrade, onEditMindset }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(null);

  const dayMap = useMemo(() => {
    const map = {};
    trades.forEach(t => {
      if (!map[t.date]) map[t.date] = { pnl: 0, count: 0, wins: 0 };
      const p = calcPnL(t);
      map[t.date].pnl += p; map[t.date].count += 1; if (p > 0) map[t.date].wins += 1;
    });
    return map;
  }, [trades]);

  const prefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const monthDays = Object.entries(dayMap).filter(([d]) => d.startsWith(prefix));
  const monthPnl = sum(monthDays.map(([, v]) => v.pnl));
  const monthTrades = sum(monthDays.map(([, v]) => v.count));
  const greenDays = monthDays.filter(([, v]) => v.pnl > 0).length;
  const maxAbs = Math.max(1, ...monthDays.map(([, v]) => Math.abs(v.pnl)));

  const firstOfMonth = new Date(cursor.y, cursor.m, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const move = (delta) => {
    let m = cursor.m + delta, y = cursor.y;
    if (m < 0) { m = 11; y -= 1; } else if (m > 11) { m = 0; y += 1; }
    setCursor({ y, m });
    setSelected(null);
  };
  const isoFor = (d) => `${prefix}-${String(d).padStart(2, '0')}`;
  const selectedTrades = selected ? sortTrades(trades.filter(t => t.date === selected)) : [];
  const selMind = selected ? mindset?.[selected] : null;
  const today = todayISO();

  return (
    <div className="calendar-view view-anim">
      <div className="cal-head">
        <button className="icon-btn" onClick={() => move(-1)} aria-label="Vorheriger Monat"><Icon name="ChevronLeft" size={18} /></button>
        <div className="cal-title">
          <h3>{MONTH_NAMES[cursor.m]} {cursor.y}</h3>
          <span className={monthPnl >= 0 ? 'txt-profit' : 'txt-loss'}>{fmtMoneySigned(monthPnl, currency)}</span>
        </div>
        <button className="icon-btn" onClick={() => move(1)} aria-label="Nächster Monat"><Icon name="ChevronRight" size={18} /></button>
      </div>

      <div className="cal-month-stats">
        <StatCard icon="Calendar" label="Handelstage" value={monthDays.length} />
        <StatCard icon="List" label="Trades" value={monthTrades} />
        <StatCard icon="Sun" label="Grüne Tage" value={monthDays.length ? fmtPct((greenDays / monthDays.length) * 100, 0) : '—'} sub={`${greenDays} von ${monthDays.length}`} />
        <StatCard icon="BarChart3" label="Ø pro Tag" value={monthDays.length ? fmtMoney(monthPnl / monthDays.length, currency) : '—'} valueClass={monthPnl >= 0 ? 'txt-profit' : 'txt-loss'} />
      </div>

      <div>
        <div className="cal-grid" style={{ marginBottom: 6 }}>
          {WEEKDAY_LABELS.map(w => <div key={w} className="weekday-label">{w}</div>)}
          <div className="weekday-label cal-week-head">Woche</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {weeks.map((week, wi) => {
            const weekIsos = week.filter(Boolean).map(isoFor);
            const wPnl = sum(weekIsos.map(d => dayMap[d]?.pnl || 0));
            const wCount = sum(weekIsos.map(d => dayMap[d]?.count || 0));
            return (
              <div key={wi} className="cal-grid">
                {week.map((d, i) => {
                  if (d === null) return <div key={i} className="cal-cell empty" />;
                  const iso = isoFor(d);
                  const info = dayMap[iso];
                  const intensity = info ? 0.08 + (Math.abs(info.pnl) / maxAbs) * 0.32 : 0;
                  const bg = !info ? undefined : info.pnl > 0 ? `rgba(63,207,142,${intensity})` : info.pnl < 0 ? `rgba(240,97,109,${intensity})` : undefined;
                  const bc = !info ? undefined : info.pnl > 0 ? 'rgba(63,207,142,0.4)' : info.pnl < 0 ? 'rgba(240,97,109,0.4)' : undefined;
                  const journaled = mindset?.[iso]?.pre?.done || mindset?.[iso]?.post?.done;
                  return (
                    <button key={i} className={`cal-cell ${selected === iso ? 'selected' : ''} ${iso === today ? 'today' : ''}`}
                      aria-label={`${fmtDateLong(iso)}${info ? `: ${info.count} Trades, ${fmtMoney(info.pnl, currency)}` : ': keine Trades'}${journaled ? ', Journal-Eintrag' : ''}`}
                      aria-pressed={selected === iso}
                      style={bg ? { background: bg, borderColor: bc } : undefined} onClick={() => setSelected(selected === iso ? null : iso)}>
                      <span className="cal-day-num">{d}</span>
                      {journaled && <span className="cal-journal-dot" title="Mindset-Eintrag" />}
                      {info && <span className={`cal-day-pnl ${info.pnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneyShort(info.pnl, currency)}</span>}
                      {info && <span className="cal-day-count">{info.count} Trade{info.count === 1 ? '' : 's'} · {Math.round((info.wins / info.count) * 100)}%</span>}
                    </button>
                  );
                })}
                <div className="cal-week">
                  <span>KW {wi + 1}</span>
                  <strong className={wPnl > 0 ? 'txt-profit' : wPnl < 0 ? 'txt-loss' : 'txt-muted'}>{wCount ? fmtMoneyShort(wPnl, currency) : '—'}</strong>
                  {wCount > 0 && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>{wCount} Trades</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="panel">
          <div className="panel-head">
            <h3>{fmtDateLong(selected)}</h3>
            <button className="btn-ghost" onClick={() => onEditMindset(selected)}><Icon name="Brain" size={14} /> {selMind?.pre?.done || selMind?.post?.done ? 'Mindset bearbeiten' : 'Mindset nachtragen'}</button>
            {dayMap[selected] && <span className={`mono ${dayMap[selected].pnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneySigned(dayMap[selected].pnl, currency)}</span>}
          </div>
          {(selMind?.pre?.done || selMind?.post?.done) && (
            <div style={{ padding: '0 20px 12px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selMind.pre?.mood && <Pill tone="accent">{PRE_MOODS.find(m => m.key === selMind.pre.mood)?.emoji} {PRE_MOODS.find(m => m.key === selMind.pre.mood)?.label}</Pill>}
              {selMind.post?.rating && <Pill tone={selMind.post.rating === 'good' ? 'profit' : selMind.post.rating === 'tough' ? 'loss' : 'neutral'}>{DAY_RATINGS.find(r => r.key === selMind.post.rating)?.label}</Pill>}
              {selMind.post?.takeaway && <span className="txt-muted" style={{ fontSize: 12.5 }}>„{selMind.post.takeaway}"</span>}
            </div>
          )}
          {selectedTrades.length === 0 ? (
            <div className="table-empty">Keine Trades an diesem Tag.</div>
          ) : (
            <div className="table-wrap">
              <table className="trade-table compact">
                <tbody>
                  {selectedTrades.map(t => (
                    <tr key={t.id} className="clickable" {...pressable(() => onOpenTrade(t), `Trade ${t.symbol} öffnen`)}>
                      <td className="muted">{t.time || '—'}</td>
                      <td className="symbol">{t.symbol}</td>
                      <td><DirectionPill direction={t.direction} /></td>
                      <td className="muted">{t.strategy || '—'}</td>
                      <td><ResultPill result={t.result} /></td>
                      <td className={`num ${calcPnL(t) >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneySigned(calcPnL(t), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Analyse (inkl. PRO-Metriken)                                            */
/* ---------------------------------------------------------------------- */

function BreakdownChart({ rows, currency }) {
  if (!rows.length) return null;
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.pnl)), 1);
  return (
    <div className="mini-bar-chart">
      {rows.map(r => {
        const pct = (Math.abs(r.pnl) / maxAbs) * 100;
        const positive = r.pnl >= 0;
        return (
          <div key={r.name} className="mini-bar-row">
            <span className="mini-bar-label" title={r.name}>{r.name}</span>
            <div className="mini-bar-track"><div className={`mini-bar-fill ${positive ? 'profit' : 'loss'}`} style={{ width: `${pct}%` }} /></div>
            <span className={`mini-bar-value ${positive ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneyShort(r.pnl, currency)}</span>
          </div>
        );
      })}
    </div>
  );
}

function BreakdownTable({ rows, currency }) {
  return (
    <div className="table-wrap">
      <table className="trade-table compact">
        <thead><tr><th></th><th className="num">Trades</th><th className="num">Treffer</th><th className="num">Ø</th><th className="num">PnL</th></tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num muted">{r.count}</td>
              <td className="num muted">{r.winRate.toFixed(0)}%</td>
              <td className={`num ${r.avg >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoney(r.avg, currency)}</td>
              <td className={`num ${r.pnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoney(r.pnl, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BreakdownPanel({ title, icon, rows, currency, emptyText }) {
  return (
    <div className="panel">
      <div className="panel-head"><h3>{icon && <Icon name={icon} size={15} />} {title}</h3></div>
      {rows.length === 0 ? <div className="table-empty">{emptyText || 'Noch keine Daten.'}</div> : (
        <>
          <BreakdownChart rows={rows} currency={currency} />
          <BreakdownTable rows={rows} currency={currency} />
        </>
      )}
    </div>
  );
}

const R_BUCKETS = [
  { label: '< -2R', test: r => r < -2 },
  { label: '-2 … -1R', test: r => r >= -2 && r < -1 },
  { label: '-1 … 0R', test: r => r >= -1 && r < 0 },
  { label: '0 … 1R', test: r => r >= 0 && r < 1 },
  { label: '1 … 2R', test: r => r >= 1 && r < 2 },
  { label: '2 … 3R', test: r => r >= 2 && r < 3 },
  { label: '> 3R', test: r => r >= 3 }
];

function RHistogram({ rMultiples }) {
  const counts = R_BUCKETS.map(b => rMultiples.filter(b.test).length);
  const max = Math.max(1, ...counts);
  return (
    <>
      <div className="histogram">
        {counts.map((c, i) => (
          <div key={i} className="histo-col">
            <span className="histo-count">{c}</span>
            <div className="histo-bar" style={{ height: `${(c / max) * 100}%`, background: i < 3 ? 'linear-gradient(180deg, var(--loss), rgba(240,97,109,0.3))' : 'linear-gradient(180deg, var(--profit), rgba(63,207,142,0.3))' }} />
          </div>
        ))}
      </div>
      <div className="histo-labels">{R_BUCKETS.map(b => <span key={b.label}>{b.label}</span>)}</div>
    </>
  );
}

function MonthlyHeatmap({ trades, currency }) {
  const byMonth = {};
  trades.forEach(t => { const k = t.date.slice(0, 7); byMonth[k] = (byMonth[k] || 0) + calcPnL(t); });
  const years = [...new Set(Object.keys(byMonth).map(k => k.slice(0, 4)))].sort().reverse();
  const maxAbs = Math.max(1, ...Object.values(byMonth).map(Math.abs));
  return (
    <div className="heatmap">
      <span />
      {MONTH_SHORT.map(m => <span key={m} className="hm-head">{m}</span>)}
      <span className="hm-head" style={{ textAlign: 'right' }}>Jahr</span>
      {years.map(y => {
        const total = sum(MONTH_SHORT.map((_, i) => byMonth[`${y}-${String(i + 1).padStart(2, '0')}`] || 0));
        return (
          <React.Fragment key={y}>
            <span className="hm-year">{y}</span>
            {MONTH_SHORT.map((_, i) => {
              const v = byMonth[`${y}-${String(i + 1).padStart(2, '0')}`];
              const a = v == null ? 0 : 0.1 + (Math.abs(v) / maxAbs) * 0.55;
              return (
                <span key={i} className="hm-cell" title={v != null ? fmtMoney(v, currency) : 'Keine Trades'}
                  style={v == null ? { opacity: .35 } : { background: v >= 0 ? `rgba(63,207,142,${a})` : `rgba(240,97,109,${a})`, borderColor: 'transparent', color: '#fff' }}>
                  {v != null ? fmtMoneyShort(v, '') : ''}
                </span>
              );
            })}
            <span className={`hm-total ${total >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoneyShort(total, currency)}</span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function LongShortCompare({ trades, currency }) {
  const side = (dir) => {
    const list = trades.filter(t => t.direction === dir);
    if (!list.length) return null;
    const s = rowStats(dir, list);
    const pnls = list.map(calcPnL);
    const w = pnls.filter(p => p > 0), l = pnls.filter(p => p < 0);
    return { ...s, avgWin: mean(w), avgLoss: mean(l), pf: sum(l) ? sum(w) / Math.abs(sum(l)) : (sum(w) > 0 ? Infinity : 0) };
  };
  const L = side('long'), S = side('short');
  const Card = ({ title, s, tone }) => (
    <div className="ls-card">
      <h4><Pill tone={tone}>{title}</Pill> {s && <span className={`mono ${s.pnl >= 0 ? 'txt-profit' : 'txt-loss'}`} style={{ marginLeft: 'auto' }}>{fmtMoneySigned(s.pnl, currency)}</span>}</h4>
      {!s ? <div className="txt-muted" style={{ fontSize: 12.5 }}>Keine Trades</div> : (
        <>
          <div className="ls-row">Trades <b>{s.count}</b></div>
          <div className="ls-row">Trefferquote <b>{fmtPct(s.winRate, 0)}</b></div>
          <div className="ls-row">Profitfaktor <b>{fmtNum(s.pf, 2)}</b></div>
          <div className="ls-row">Ø Gewinn / Verlust <b>{fmtMoneyShort(s.avgWin, currency)} / {fmtMoneyShort(s.avgLoss, currency)}</b></div>
        </>
      )}
    </div>
  );
  return <div className="ls-compare"><Card title="▲ Long" s={L} tone="profit" /><Card title="▼ Short" s={S} tone="loss" /></div>;
}

function AnalyticsView({ trades, stats, currency, mindset, onReport }) {
  const rows = (list, keyFn, order) => {
    const g = groupBy(list, keyFn);
    const r = Object.entries(g).map(([n, l]) => rowStats(n, l));
    return order ? order.map(n => r.find(x => x.name === n)).filter(Boolean) : r.sort((a, b) => b.pnl - a.pnl);
  };
  const strategyRows = useMemo(() => rows(trades, t => t.strategy || 'Ohne Strategie'), [trades]);
  const symbolRows = useMemo(() => rows(trades, t => t.symbol).slice(0, 10), [trades]);
  const weekdayRows = useMemo(() => rows(trades, t => weekdayOf(t.date), WEEKDAY_FULL), [trades]);
  const hourRows = useMemo(() => rows(trades.filter(t => t.time), t => hourBucketOf(t.time), HOUR_BUCKETS.map(b => b.label)), [trades]);
  const holdRows = useMemo(() => {
    const withHold = trades.map(t => ({ t, h: holdingMinutes(t) })).filter(x => x.h != null);
    return rows(withHold.map(x => ({ ...x.t, _b: HOLD_BUCKETS.find(b => x.h < b.max).label })), t => t._b, HOLD_BUCKETS.map(b => b.label));
  }, [trades]);
  const emotionRows = useMemo(() => rows(trades.filter(t => t.emotion), t => `${EMOTION_BY_KEY[t.emotion]?.emoji || ''} ${EMOTION_BY_KEY[t.emotion]?.label || t.emotion}`), [trades]);
  const resultRows = useMemo(() => rows(trades, t => t.result ? RESULT_LABELS[t.result] : 'Ohne Angabe'), [trades]);
  const tagRows = useMemo(() => {
    const exp = trades.flatMap(t => [...new Set([...(t.setups || []), ...(t.tags || [])])].map(tag => ({ ...t, _tag: tag })));
    return rows(exp, t => t._tag);
  }, [trades]);
  const ratingRows = useMemo(() => rows(trades.filter(t => t.rating > 0), t => '★'.repeat(t.rating), ['★★★★★', '★★★★', '★★★', '★★', '★']), [trades]);

  if (trades.length === 0) {
    return <EmptyState icon="BarChart3" title="Noch nichts zu analysieren" text="Sobald Trades erfasst sind, erscheinen hier Profi-Kennzahlen, R-Verteilung, Monats-Heatmap und Auswertungen nach Strategie, Zeit und Emotion." />;
  }

  const sharpeHelp = 'Rendite pro Einheit Schwankung (annualisiert, Basis: Tagesergebnisse). > 1 gut, > 2 sehr gut.';
  return (
    <div className="analytics-view view-anim">
      <div className="panel">
        <div className="panel-head">
          <h3><Icon name="Activity" size={15} /> Profi-Kennzahlen <span className="pro-badge">PRO</span></h3>
          <button className="btn-ghost" onClick={onReport}><Icon name="FileText" size={14} /> Report / PDF</button>
        </div>
        <div className="metric-grid">
          <Metric label="Sharpe Ratio" value={fmtNum(stats.sharpe, 2)} valueClass={stats.sharpe == null ? '' : stats.sharpe >= 1 ? 'txt-profit' : stats.sharpe < 0 ? 'txt-loss' : ''} help={sharpeHelp} sub={stats.enoughDays ? 'annualisiert' : `ab ${MIN_DAYS_FOR_RATIOS} Handelstagen (${stats.tradingDays})`} />
          <Metric label="Sortino Ratio" value={fmtNum(stats.sortino, 2)} help="Wie Sharpe, bestraft aber nur Abwärtsschwankung." sub={stats.enoughDays ? 'annualisiert' : `ab ${MIN_DAYS_FOR_RATIOS} Handelstagen`} />
          <Metric label="SQN" value={fmtNum(stats.sqn, 2)} help="System Quality Number nach Van Tharp (Basis: R-Multiples). 1,6–2 ok, 2–3 gut, > 3 exzellent." sub={stats.sqn == null ? `ab ${MIN_TRADES_FOR_SQN} Trades mit Stop-Loss` : stats.sqn >= 3 ? 'exzellent' : stats.sqn >= 2 ? 'gut' : stats.sqn >= 1.6 ? 'durchschnittlich' : 'schwach'} />
          <Metric label="Kelly-Kriterium" value={stats.kelly == null ? '—' : fmtPct(stats.kelly)} help="Theoretisch optimaler Kapitalanteil je Trade. In der Praxis maximal die Hälfte davon nutzen." sub={stats.kelly == null ? `ab ${MIN_TRADES_FOR_KELLY} Trades` : stats.kelly > 0 ? `½ Kelly: ${fmtPct(stats.kelly / 2)}` : 'kein Edge'} valueClass={stats.kelly == null ? '' : stats.kelly > 0 ? 'txt-profit' : 'txt-loss'} />
          <Metric label="Gewinn/Verlust-Verhältnis" value={fmtNum(stats.payoff, 2)} help="Ø Gewinn geteilt durch Ø Verlust." sub={Number.isFinite(stats.payoff) && stats.payoff > 0 ? `Break-even ab ${fmtPct(100 / (1 + stats.payoff), 0)} Treffer` : ''} />
          <Metric label="Recovery Factor" value={fmtNum(stats.recoveryFactor, 2)} help="Nettogewinn / maximaler Drawdown." />
          <Metric label="Max. Drawdown" value={fmtPct(stats.maxDrawdownPct)} valueClass="txt-loss" sub={fmtMoney(stats.maxDrawdown, currency)} />
          <Metric label="Grüne Tage" value={stats.tradingDays ? fmtPct((stats.greenDays / stats.tradingDays) * 100, 0) : '—'} sub={`${stats.greenDays} von ${stats.tradingDays} Tagen`} />
          <Metric label="Bester / schlechtester Tag" value={`${fmtMoneyShort(stats.bestDay, currency)} / ${fmtMoneyShort(stats.worstDay, currency)}`} />
          <Metric label="Längste Serien" value={`${stats.maxWinStreak}G / ${stats.maxLossStreak}V`} sub="in Folge" />
          <Metric label="Ø Haltedauer (G / V)" value={`${fmtDuration(stats.avgWinHold)} / ${fmtDuration(stats.avgLossHold)}`} />
          <Metric label="Gebühren gesamt" value={fmtMoney(stats.totalFees, currency)} sub={stats.grossWin > 0 ? `${fmtPct((stats.totalFees / stats.grossWin) * 100, 1)} der Bruttogewinne` : ''} />
        </div>
      </div>

      <div className="two-col">
        <div className="panel">
          <div className="panel-head"><h3><Icon name="TrendingDown" size={15} /> Drawdown</h3><span className="panel-sub">Abstand zum bisherigen Hoch</span></div>
          <div style={{ padding: '0 14px 14px' }}><AreaChart data={stats.drawdownCurve} valueKey="drawdown" color="#F0616D" height={150} currency={currency} /></div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3><Icon name="Crosshair" size={15} /> R-Verteilung</h3><span className="panel-sub">{stats.rMultiples.length} Trades mit Stop-Loss</span></div>
          {stats.rMultiples.length ? <RHistogram rMultiples={stats.rMultiples} /> : <div className="table-empty">Erfasse Stop-Loss-Werte, um deine R-Verteilung zu sehen.</div>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3><Icon name="Calendar" size={15} /> Monats-Performance</h3></div>
        <MonthlyHeatmap trades={trades} currency={currency} />
      </div>

      <div className="panel">
        <div className="panel-head"><h3><Icon name="ArrowLeftRight" size={15} /> Long vs. Short</h3></div>
        <LongShortCompare trades={trades} currency={currency} />
      </div>

      <div className="two-col">
        <BreakdownPanel title="Nach Strategie" icon="Zap" rows={strategyRows} currency={currency} />
        <BreakdownPanel title="Top Symbole" icon="Crosshair" rows={symbolRows} currency={currency} />
        <BreakdownPanel title="Nach Wochentag" icon="Calendar" rows={weekdayRows} currency={currency} />
        <BreakdownPanel title="Nach Tageszeit" icon="Clock" rows={hourRows} currency={currency} emptyText="Trage beim nächsten Trade die Uhrzeit ein, um diese Auswertung zu sehen." />
        <BreakdownPanel title="Nach Haltedauer" icon="Clock" rows={holdRows} currency={currency} emptyText="Trage Ein- und Ausstiegszeit ein, um die Haltedauer auszuwerten." />
        <BreakdownPanel title="Nach Emotion beim Einstieg" icon="Smile" rows={emotionRows} currency={currency} emptyText="Wähle im Trade-Formular deine Emotion beim Einstieg." />
        <BreakdownPanel title="Nach Setup & Tags" icon="Tag" rows={tagRows} currency={currency} emptyText="Markiere Setups oder eigene Tags im Trade-Formular." />
        <BreakdownPanel title="Nach Ausführungsqualität" icon="Star" rows={ratingRows} currency={currency} emptyText="Bewerte deine Ausführung mit Sternen im Trade-Formular." />
        <BreakdownPanel title="Nach Ergebnis-Kategorie" icon="Check" rows={resultRows} currency={currency} />
        <MindsetCorrelation stats={stats} mindset={mindset} currency={currency} />
      </div>
    </div>
  );
}

function MindsetCorrelation({ stats, mindset, currency }) {
  const byRating = {}, byMood = {};
  Object.entries(stats.dayPnls).forEach(([date, pnl]) => {
    const entry = mindset?.[date];
    if (entry?.post?.done && entry.post.rating) (byRating[entry.post.rating] = byRating[entry.post.rating] || []).push(pnl);
    if (entry?.pre?.done && entry.pre.mood) (byMood[entry.pre.mood] = byMood[entry.pre.mood] || []).push(pnl);
  });
  const toRow = (name, list) => ({ name, count: list.length, pnl: sum(list), avg: mean(list), winRate: (list.filter(p => p > 0).length / list.length) * 100 });
  const rows = [
    ...PRE_MOODS.filter(m => byMood[m.key]?.length).map(m => toRow(`${m.emoji} ${m.label}`, byMood[m.key])),
    ...DAY_RATINGS.filter(r => byRating[r.key]?.length).map(r => toRow(r.label, byRating[r.key]))
  ];
  return (
    <div className="panel">
      <div className="panel-head"><h3><Icon name="Brain" size={15} /> Mindset & Ergebnis</h3></div>
      {rows.length === 0 ? (
        <div className="table-empty">Fülle den Mindset-Check-in auf dem Dashboard aus, um den Zusammenhang zwischen Stimmung und Ergebnis zu sehen.</div>
      ) : (
        <div className="table-wrap">
          <table className="trade-table compact">
            <thead><tr><th></th><th className="num">Tage</th><th className="num">Ø PnL/Tag</th><th className="num">Summe</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num muted">{r.count}</td>
                  <td className={`num ${r.avg >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoney(r.avg, currency)}</td>
                  <td className={`num ${r.pnl >= 0 ? 'txt-profit' : 'txt-loss'}`}>{fmtMoney(r.pnl, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
