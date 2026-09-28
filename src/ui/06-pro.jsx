/* ---------------------------------------------------------------------- */
/* Coach (Trader-Score, Stärken, Baustellen)                               */
/* ---------------------------------------------------------------------- */

function CoachView({ trades, stats, insights, mindset, currency, onAdd, ai }) {
  const score = useMemo(() => computeTraderScore(trades, stats), [trades, stats]);
  const streak = journalStreak(mindset);
  const last30 = addDaysISO(todayISO(), -29);
  const journaledDays = Object.entries(mindset || {}).filter(([d, e]) => d >= last30 && (e?.pre?.done || e?.post?.done)).length;
  const onPlanPct = trades.length ? (trades.filter(t => t.onPlan !== false).length / trades.length) * 100 : 0;

  if (trades.length < INSIGHT_MIN_TRADES) {
    return (
      <div className="coach-view view-anim">
        <div className="panel locked-card">
          <div className="empty-icon"><Icon name="Sparkles" size={26} /></div>
          <h3 style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", fontSize: 20 }}>Dein persönlicher Trading-Coach</h3>
          <p className="txt-muted" style={{ margin: 0, maxWidth: 440, fontSize: 13.5, lineHeight: 1.6 }}>
            Der Coach durchsucht deine Trades nach Mustern – beste Tageszeit, teuerste Emotion, Rache-Trades, Haltedauer-Fehler – und berechnet deinen Trader-Score. Der erste Insight erscheint nach {INSIGHT_MIN_TRADES} Trades.
          </p>
          <div className="progress-line"><div style={{ width: `${(trades.length / INSIGHT_MIN_TRADES) * 100}%` }} /></div>
          <span className="mono txt-muted" style={{ fontSize: 12.5 }}>{trades.length} / {INSIGHT_MIN_TRADES} Trades</span>
          <button className="btn-primary" onClick={onAdd}><Icon name="Plus" size={15} /> Trade erfassen</button>
        </div>
      </div>
    );
  }

  const good = insights.filter(i => i.tone === 'good');
  const bad = insights.filter(i => i.tone !== 'good');
  const focus = insights.find(i => i.tone === 'bad');
  const scoreColor = score.total >= 70 ? 'var(--profit)' : score.total >= 45 ? 'var(--accent)' : 'var(--loss)';

  return (
    <div className="coach-view view-anim">
      <div className="panel score-hero">
        <div style={{ textAlign: 'center' }}>
          <span className="eyebrow">Trader-Score</span>
          <div className="score-num" style={{ color: scoreColor, marginTop: 8 }}>{score.total}</div>
          <div className="score-grade">Level: <strong style={{ color: 'var(--text)' }}>{score.grade}</strong></div>
        </div>
        <div className="score-bars">
          {score.axes.map(a => (
            <div key={a.key} className="score-bar-row">
              <span>{a.label}</span>
              <div className="score-track"><div className="score-fill" style={{ width: `${a.value}%` }} /></div>
              <b>{Math.round(a.value)}</b>
            </div>
          ))}
        </div>
        <div className="radar-wrap"><RadarChart axes={score.axes} size={270} /></div>
      </div>

      {focus && (
        <div className="panel focus-card">
          <span className="plan-icon tone-accent" style={{ width: 44, height: 44 }}><Icon name="Target" size={20} /></span>
          <div>
            <span className="eyebrow">Fokus der Woche</span>
            <h3 style={{ marginTop: 4 }}>{focus.title}</h3>
            <p>{focus.text}</p>
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="panel pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="title"><span className="plan-icon tone-profit" style={{ width: 28, height: 28 }}><Icon name="TrendingUp" size={14} /></span> Stärken</h3>
          {good.length ? <div className="insight-list">{good.map((ins, i) => <InsightCard key={i} ins={ins} />)}</div> : <p className="txt-muted" style={{ fontSize: 13 }}>Noch keine klaren Stärken erkennbar – sammle weiter Daten.</p>}
        </div>
        <div className="panel pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 className="title"><span className="plan-icon tone-loss" style={{ width: 28, height: 28 }}><Icon name="AlertTriangle" size={14} /></span> Baustellen</h3>
          {bad.length ? <div className="insight-list">{bad.map((ins, i) => <InsightCard key={i} ins={ins} />)}</div> : <p className="txt-muted" style={{ fontSize: 13 }}>Keine auffälligen Schwächen gefunden. Stark!</p>}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3><Icon name="Flame" size={15} /> Gewohnheiten</h3></div>
        <div className="habit-row">
          <Metric label="Journal-Serie" value={`${streak} ${streak === 1 ? 'Tag' : 'Tage'}`} sub="Mindset-Check-ins in Folge" />
          <Metric label="Journal letzte 30 Tage" value={`${journaledDays} / 30`} sub="Tage mit Check-in" />
          <Metric label="Plan-Treue" value={fmtPct(onPlanPct, 0)} sub="Trades im Plan" valueClass={onPlanPct >= 80 ? 'txt-profit' : onPlanPct < 60 ? 'txt-loss' : ''} />
        </div>
      </div>
      <AiCoachPanel trades={trades} mindset={mindset} currency={currency} {...ai} />
      <p className="shot-hint" style={{ textAlign: 'center' }}>Trader-Score und Insights werden lokal aus deinen Daten berechnet. Nur der KI-Coach sendet – auf deinen Klick – die Trades des gewählten Zeitraums an Claude.</p>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Tools: Positionsgröße, Zinseszins, Monte-Carlo                          */
/* ---------------------------------------------------------------------- */

function SliderField({ label, value, display, min, max, step, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="slider-field">
      <div className="slider-head"><span>{label}</span><b>{display}</b></div>
      <input type="range" className="range" min={min} max={max} step={step} value={value} style={{ '--pct': `${pct}%` }} onChange={e => onChange(Number(e.target.value))} />
    </div>
  );
}

function PositionSizeCalculator({ balance, currency, defaultRisk, minRR }) {
  const [acct, setAcct] = useState(Math.round(balance * 100) / 100);
  const [riskPct, setRiskPct] = useState(defaultRisk || 1);
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const [tp, setTp] = useState('');
  const [lot, setLot] = useState(1);

  const e = Number(entry), s = Number(stop), t = Number(tp);
  const valid = e > 0 && s > 0 && e !== s;
  const dir = valid ? (s < e ? 'long' : 'short') : null;
  const riskAmt = acct * riskPct / 100;
  const perUnit = valid ? Math.abs(e - s) : 0;
  const rawUnits = valid ? riskAmt / perUnit : 0;
  const units = lot > 0 ? Math.floor(rawUnits / lot) * lot : rawUnits;
  const posValue = units * e;
  const realRisk = units * perUnit;
  const rr = valid && t > 0 ? (dir === 'long' ? (t - e) : (e - t)) / perUnit : null;
  const targets = valid ? [1, 2, 3, 5].map(r => ({ r, price: dir === 'long' ? e + perUnit * r : e - perUnit * r, gain: realRisk * r })) : [];

  return (
    <div className="panel tool-card">
      <div className="tool-head">
        <span className="tool-icon"><Icon name="Calculator" size={19} /></span>
        <div><h3>Positionsgrößen-Rechner</h3><p>Wie viele Stück darf ich kaufen, ohne mehr als X % zu riskieren?</p></div>
      </div>
      <div className="form-row">
        <label>Kontostand<input type="number" value={acct} onChange={ev => setAcct(Number(ev.target.value))} /></label>
        <label>Lot-/Stückgröße<input type="number" step="any" value={lot} onChange={ev => setLot(Number(ev.target.value))} /></label>
      </div>
      <SliderField label="Risiko pro Trade" value={riskPct} display={`${fmtNum(riskPct, 2)} % · ${fmtMoney(riskAmt, currency)}`} min={0.1} max={5} step={0.05} onChange={setRiskPct} />
      <div className="form-row three">
        <label>Einstieg<input type="number" step="any" inputMode="decimal" placeholder="0.00" value={entry} onChange={ev => setEntry(ev.target.value)} /></label>
        <label>Stop-Loss<input type="number" step="any" inputMode="decimal" placeholder="0.00" value={stop} onChange={ev => setStop(ev.target.value)} /></label>
        <label>Ziel<input type="number" step="any" inputMode="decimal" placeholder="optional" value={tp} onChange={ev => setTp(ev.target.value)} /></label>
      </div>
      <div className="result-big">
        <div>
          <span>Positionsgröße {dir && <Pill tone={dir === 'long' ? 'profit' : 'loss'}>{dir === 'long' ? '▲ Long' : '▼ Short'}</Pill>}</span>
          <div><strong>{valid ? units.toLocaleString('de-DE', { maximumFractionDigits: 4 }) : '—'}</strong> <span>Stück</span></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span>Positionswert</span>
          <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{valid ? fmtMoney(posValue, currency) : '—'}</div>
          {valid && acct > 0 && <span>{fmtPct((posValue / acct) * 100, 1)} vom Konto{posValue > acct ? ' · Hebel nötig' : ''}</span>}
        </div>
      </div>
      <div className="result-grid">
        <Metric label="Echtes Risiko" value={valid ? fmtMoney(realRisk, currency) : '—'} valueClass="txt-loss" />
        <Metric label="Abstand zum Stop" value={valid ? `${fmtNum(perUnit, 4)}` : '—'} sub={valid ? fmtPct((perUnit / e) * 100, 2) : ''} />
        <Metric label="Risiko : Reward" value={rr != null ? `1:${fmtNum(rr, 2)}` : '—'} valueClass={rr == null ? '' : minRR != null && rr < minRR ? 'txt-loss' : 'txt-profit'} sub={minRR != null ? `Plan: min. 1:${minRR}` : ''} />
      </div>
      {valid && (
        <table className="target-table">
          <tbody>
            {targets.map(x => (
              <tr key={x.r}><td>Ziel {x.r}R</td><td className="r">{fmtNum(x.price, x.price < 10 ? 4 : 2)}</td><td className="r txt-profit">{fmtMoneySigned(x.gain, currency)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CompoundCalculator({ balance, currency, stats }) {
  const hist = stats.tradingDays > 0 && balance > 0 ? (stats.totalPnL / (balance - stats.totalPnL || 1)) * 100 : 0;
  const [start, setStart] = useState(Math.round(balance));
  const [monthly, setMonthly] = useState(3);
  const [months, setMonths] = useState(24);
  const [deposit, setDeposit] = useState(0);
  const series = useMemo(() => {
    const out = [{ date: todayISO(), balance: start, label: 'Heute' }];
    let b = start;
    for (let i = 1; i <= months; i++) {
      b = b * (1 + monthly / 100) + deposit;
      const d = new Date(); d.setMonth(d.getMonth() + i);
      out.push({ date: localISO(d), balance: b, label: `Monat ${i}` });
    }
    return out;
  }, [start, monthly, months, deposit]);
  const final = series[series.length - 1].balance;
  const invested = start + deposit * months;

  return (
    <div className="panel tool-card">
      <div className="tool-head">
        <span className="tool-icon"><Icon name="TrendingUp" size={19} /></span>
        <div><h3>Zinseszins-Projektion</h3><p>Wohin führt deine monatliche Rendite?</p></div>
      </div>
      <div className="form-row">
        <label>Startkapital<input type="number" value={start} onChange={e => setStart(Number(e.target.value))} /></label>
        <label>Monatliche Einzahlung<input type="number" value={deposit} onChange={e => setDeposit(Number(e.target.value))} /></label>
      </div>
      <SliderField label="Rendite pro Monat" value={monthly} display={fmtPct(monthly, 1)} min={-5} max={20} step={0.5} onChange={setMonthly} />
      <SliderField label="Zeitraum" value={months} display={`${months} Monate`} min={1} max={120} step={1} onChange={setMonths} />
      <div className="result-big">
        <div><span>Endkapital</span><div><strong className={final >= invested ? 'txt-profit' : 'txt-loss'}>{fmtMoney(final, currency)}</strong></div></div>
        <div style={{ textAlign: 'right' }}><span>Gewinn</span><div className="mono" style={{ fontWeight: 600 }}>{fmtMoneySigned(final - invested, currency)}</div><span>×{fmtNum(final / (invested || 1), 2)}</span></div>
      </div>
      <AreaChart data={series} valueKey="balance" color={final >= invested ? '#3FCF8E' : '#F0616D'} height={120} currency={currency} />
      {stats.totalTrades > 0 && <p className="shot-hint">Deine bisherige Gesamtrendite im aktiven Konto: {fmtPct(hist, 2)}.</p>}
    </div>
  );
}

/* Deterministischer Zufallsgenerator, damit die Simulation stabil bleibt */
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function MonteCarlo({ stats, currency, balance }) {
  const hasData = stats.totalTrades >= 5 && stats.wins > 0 && stats.losses > 0;
  const [winRate, setWinRate] = useState(hasData ? Math.round(stats.winRate) : 50);
  const [payoff, setPayoff] = useState(hasData && Number.isFinite(stats.payoff) ? Math.round(stats.payoff * 10) / 10 : 1.5);
  const [risk, setRisk] = useState(1);
  const [nTrades, setNTrades] = useState(100);
  const [seed, setSeed] = useState(7);
  const RUNS = 300, SHOW = 40, RUIN = 30;

  const sim = useMemo(() => {
    const rnd = mulberry32(seed);
    const paths = [], finals = [];
    let ruined = 0;
    const dds = [];
    for (let r = 0; r < RUNS; r++) {
      let b = 100, peak = 100, maxDd = 0;
      const path = [b];
      for (let i = 0; i < nTrades; i++) {
        const stake = b * risk / 100;
        b += rnd() < winRate / 100 ? stake * payoff : -stake;
        peak = Math.max(peak, b);
        maxDd = Math.max(maxDd, (peak - b) / peak * 100);
        path.push(b);
      }
      if (maxDd >= RUIN) ruined++;
      dds.push(maxDd);
      finals.push(b);
      if (r < SHOW) paths.push(path);
    }
    finals.sort((a, b) => a - b);
    dds.sort((a, b) => a - b);
    const pick = (arr, q) => arr[Math.floor(q * (arr.length - 1))];
    return { paths, median: pick(finals, 0.5), p5: pick(finals, 0.05), p95: pick(finals, 0.95), ruinPct: (ruined / RUNS) * 100, medDd: pick(dds, 0.5), worstDd: pick(dds, 0.95) };
  }, [winRate, payoff, risk, nTrades, seed]);

  const W = 600, H = 200;
  const all = sim.paths.flat();
  const lo = Math.min(...all), hi = Math.max(...all);
  const y = v => H - ((v - lo) / (hi - lo || 1)) * H;
  const x = i => (i / nTrades) * W;
  const edge = (winRate / 100) * payoff - (1 - winRate / 100);

  return (
    <div className="panel tool-card span-2">
      <div className="tool-head">
        <span className="tool-icon"><Icon name="Dices" size={19} /></span>
        <div style={{ flex: 1 }}><h3>Monte-Carlo-Simulation <span className="pro-badge">PRO</span></h3><p>{RUNS} zufällige Verläufe deines Systems – wie wahrscheinlich ist ein tiefer Drawdown?</p></div>
        <button className="btn-ghost" onClick={() => setSeed(s => s + 1)}><Icon name="RotateCcw" size={14} /> Neu würfeln</button>
      </div>
      <div className="two-col" style={{ gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SliderField label="Trefferquote" value={winRate} display={fmtPct(winRate, 0)} min={10} max={90} step={1} onChange={setWinRate} />
          <SliderField label="Gewinn/Verlust-Verhältnis" value={payoff} display={fmtNum(payoff, 1)} min={0.3} max={5} step={0.1} onChange={setPayoff} />
          <SliderField label="Risiko pro Trade" value={risk} display={fmtPct(risk, 1)} min={0.25} max={10} step={0.25} onChange={setRisk} />
          <SliderField label="Anzahl Trades" value={nTrades} display={nTrades} min={20} max={500} step={10} onChange={setNTrades} />
          {hasData && <p className="shot-hint">Startwerte stammen aus deinen echten Trades.</p>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 200, display: 'block' }}>
            <line x1="0" x2={W} y1={y(100)} y2={y(100)} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            {sim.paths.map((p, i) => {
              const d = p.map((v, j) => `${j ? 'L' : 'M'}${x(j).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
              const up = p[p.length - 1] >= 100;
              return <path key={i} d={d} fill="none" stroke={up ? 'rgba(63,207,142,0.35)' : 'rgba(240,97,109,0.35)'} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          <div className="mc-legend"><span><i style={{ background: 'var(--profit)' }} />endet im Plus</span><span><i style={{ background: 'var(--loss)' }} />endet im Minus</span><span>Gestrichelt = Start</span></div>
          <div className="result-grid">
            <Metric label="Median-Ergebnis" value={fmtPct(sim.median - 100, 1)} valueClass={sim.median >= 100 ? 'txt-profit' : 'txt-loss'} sub={fmtMoneySigned(balance * (sim.median - 100) / 100, currency)} />
            <Metric label="Schlechteste 5 %" value={fmtPct(sim.p5 - 100, 1)} valueClass={sim.p5 >= 100 ? 'txt-profit' : 'txt-loss'} sub={`Beste 5 %: ${fmtPct(sim.p95 - 100, 0)}`} />
            <Metric label={`Risiko ≥ ${RUIN} % Drawdown`} value={fmtPct(sim.ruinPct, 1)} valueClass={sim.ruinPct > 10 ? 'txt-loss' : 'txt-profit'} sub={`Typischer DD: ${fmtPct(sim.medDd, 0)}`} />
          </div>
          <p className="shot-hint">Erwartungswert: <span className={edge >= 0 ? 'txt-profit' : 'txt-loss'}>{fmtR(edge)}</span> pro Trade.</p>
        </div>
      </div>
    </div>
  );
}

function ToolsView({ stats, currency, plan }) {
  return (
    <div className="tools-view view-anim">
      <PositionSizeCalculator balance={stats.currentBalance} currency={currency} defaultRisk={plan.riskPerTrade} minRR={parseMinRiskReward(plan.minRiskReward)} />
      <CompoundCalculator balance={stats.currentBalance} currency={currency} stats={stats} />
      <MonteCarlo stats={stats} currency={currency} balance={stats.currentBalance} />
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Report (druckbar / als PDF speicherbar)                                 */
/* ---------------------------------------------------------------------- */

function reportRange(period) {
  const t = todayISO();
  if (period === 'week') return { from: weekStartISO(t), to: t, label: `Woche ab ${fmtDateShort(weekStartISO(t))}` };
  if (period === 'lastweek') { const s = addDaysISO(weekStartISO(t), -7); return { from: s, to: addDaysISO(s, 6), label: `Woche ${fmtDateShort(s)} – ${fmtDateShort(addDaysISO(s, 6))}` }; }
  if (period === 'month') return { from: t.slice(0, 8) + '01', to: t, label: `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}` };
  if (period === 'year') return { from: `${t.slice(0, 4)}-01-01`, to: t, label: `Jahr ${t.slice(0, 4)}` };
  return { from: '0000-00-00', to: '9999-12-31', label: 'Gesamter Zeitraum' };
}

function ReportDoc({ trades, mindset, plan, currency, startingBalance, period, accountName }) {
  const { from, to, label } = reportRange(period);
  const list = trades.filter(t => t.date >= from && t.date <= to);
  const before = sum(trades.filter(t => t.date < from).map(calcPnL));
  const stats = computeStats(list, startingBalance + before);
  const insights = computeInsights(list, stats, mindset, plan, currency);
  const strat = Object.entries(groupBy(list, t => t.strategy || 'Ohne Strategie')).map(([n, l]) => rowStats(n, l)).sort((a, b) => b.pnl - a.pnl);
  const best = [...stats.sorted].sort((a, b) => calcPnL(b) - calcPnL(a)).slice(0, 3);
  const worst = [...stats.sorted].sort((a, b) => calcPnL(a) - calcPnL(b)).slice(0, 3).filter(t => calcPnL(t) < 0);
  const takeaways = Object.entries(mindset || {}).filter(([d, e]) => d >= from && d <= to && e?.post?.takeaway).map(([d, e]) => ({ d, text: e.post.takeaway }));

  return (
    <div className="report-doc">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><h1>Trading-Report</h1><span className="pro-badge">PRO</span></div>
        <div className="report-meta">{label} · {accountName} · erstellt am {fmtDateLong(todayISO())}</div>
      </div>
      {list.length === 0 ? <p className="txt-muted">Keine Trades in diesem Zeitraum.</p> : (
        <>
          <div className="report-kpis">
            <Metric label="Netto-Ergebnis" value={fmtMoneySigned(stats.totalPnL, currency)} valueClass={stats.totalPnL >= 0 ? 'txt-profit' : 'txt-loss'} />
            <Metric label="Trades" value={stats.totalTrades} sub={`${stats.tradingDays} Handelstage`} />
            <Metric label="Trefferquote" value={fmtPct(stats.winRate)} sub={`${stats.wins}G / ${stats.losses}V`} />
            <Metric label="Profitfaktor" value={fmtNum(stats.profitFactor, 2)} />
            <Metric label="Erwartungswert" value={fmtMoney(stats.expectancy, currency)} />
            <Metric label="Ø R-Multiple" value={fmtR(stats.avgRMultiple)} />
            <Metric label="Max. Drawdown" value={fmtMoney(stats.maxDrawdown, currency)} valueClass="txt-loss" />
            <Metric label="Gebühren" value={fmtMoney(stats.totalFees, currency)} />
          </div>
          <div className="report-section panel" style={{ padding: 14 }}>
            <h4>Equity-Verlauf</h4>
            <AreaChart data={stats.equityCurve} valueKey="balance" color={stats.totalPnL >= 0 ? '#3FCF8E' : '#F0616D'} height={110} currency={currency} showTip={false} />
          </div>
          <div className="two-col">
            <div className="report-section">
              <h4>Strategien</h4>
              <ul className="report-list">{strat.map(s => <li key={s.name}>{s.name}: <b className={s.pnl >= 0 ? 'txt-profit' : 'txt-loss'}>{fmtMoneySigned(s.pnl, currency)}</b> ({s.count} Trades, {s.winRate.toFixed(0)} %)</li>)}</ul>
            </div>
            <div className="report-section">
              <h4>Beste & schlechteste Trades</h4>
              <ul className="report-list">
                {best.map(t => <li key={t.id}>{fmtDateShort(t.date)} {t.symbol}: <b className="txt-profit">{fmtMoneySigned(calcPnL(t), currency)}</b></li>)}
                {worst.map(t => <li key={t.id}>{fmtDateShort(t.date)} {t.symbol}: <b className="txt-loss">{fmtMoneySigned(calcPnL(t), currency)}</b></li>)}
              </ul>
            </div>
          </div>
          {insights.length > 0 && (
            <div className="report-section">
              <h4>Coach-Insights</h4>
              <ul className="report-list">{insights.slice(0, 6).map((i, k) => <li key={k}><b style={{ color: 'var(--text)' }}>{i.title}.</b> {i.text}</li>)}</ul>
            </div>
          )}
          {takeaways.length > 0 && (
            <div className="report-section">
              <h4>Deine Erkenntnisse</h4>
              <ul className="report-list">{takeaways.map(t => <li key={t.d}>{fmtDateShort(t.d)}: „{t.text}"</li>)}</ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ReportModal({ onClose, ...props }) {
  const [period, setPeriod] = useState('month');
  const dialogRef = useDialog(onClose);
  const printRoot = document.getElementById('print-root');
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal wide glass-strong" ref={dialogRef} data-dialog tabIndex={-1} role="dialog" aria-modal="true" aria-label="Performance-Report" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2><Icon name="FileText" size={17} /> Performance-Report</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen"><Icon name="X" size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="seg-control mini" style={{ flexWrap: 'wrap' }}>
            {[['week', 'Diese Woche'], ['lastweek', 'Letzte Woche'], ['month', 'Monat'], ['year', 'Jahr'], ['all', 'Gesamt']].map(([k, l]) => (
              <button key={k} className={period === k ? 'active' : ''} onClick={() => setPeriod(k)}>{l}</button>
            ))}
          </div>
          <ReportDoc {...props} period={period} />
        </div>
        <div className="modal-foot">
          <button className="btn-ghost" onClick={onClose}>Schließen</button>
          <button className="btn-primary" onClick={() => window.print()}><Icon name="Printer" size={14} /> Drucken / als PDF speichern</button>
        </div>
      </div>
      {printRoot && ReactDOM.createPortal(<div className="app-shell" style={{ '--accent-h': 38, minHeight: 0 }}><ReportDoc {...props} period={period} /></div>, printRoot)}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Trading-Plan                                                           */
/* ---------------------------------------------------------------------- */

function PlanView({ plan, onChange, trades, currency, onReset }) {
  const [confirmPlanReset, setConfirmPlanReset] = useState(false);
  const set = (k, v) => onChange({ ...plan, [k]: v });

  const todaysTrades = trades.filter(t => t.date === todayISO());
  const totalToday = todaysTrades.length;
  const onPlanToday = todaysTrades.filter(t => t.onPlan !== false).length;
  const adherencePct = totalToday === 0 ? 0 : Math.round((onPlanToday / totalToday) * 100);
  const lossToday = Math.abs(todaysTrades.reduce((s, t) => s + Math.min(0, calcPnL(t)), 0));
  const ringColor = totalToday === 0 ? 'var(--text-muted)' : adherencePct >= 70 ? 'var(--profit)' : adherencePct > 0 ? 'var(--accent)' : 'var(--loss)';

  return (
    <div className="plan-view view-anim">
      <div className="plan-header">
        <h2>Mein Trading-Plan</h2>
        <span className="plan-active-pill">Aktiv</span>
      </div>

      <div className="panel plan-adherence">
        <CircularProgress percent={adherencePct} color={ringColor} />
        <div className="adherence-info">
          <h3>Plan-Einhaltung heute</h3>
          <p>{onPlanToday} von {totalToday} Trades im Plan</p>
          <div className="adherence-chips">
            <span className="mini-stat">{totalToday}/{plan.maxTradesPerDay} Trades</span>
            <span className="mini-stat">Verlust: {fmtMoney(lossToday, currency)} / {fmtMoney(plan.maxDailyDrawdown, currency)}</span>
          </div>
        </div>
      </div>

      <PlanSection icon="Target" tone="profit" title="Mein Ziel">
        <div className="form-row">
          <label>Monatliches Ziel<input type="number" value={plan.monthlyTarget} onChange={e => set('monthlyTarget', Number(e.target.value))} /></label>
          <label>Wöchentliches Ziel<input type="number" value={plan.weeklyTarget} onChange={e => set('weeklyTarget', Number(e.target.value))} /></label>
        </div>
        <RuleList rules={plan.goalRules} onChange={r => set('goalRules', r)} />
      </PlanSection>

      <PlanSection icon="Flame" tone="loss" title="Risikomanagement">
        <div className="form-row">
          <label>Min. Risiko:Reward<input type="text" placeholder="z.B. 1:2" value={plan.minRiskReward} onChange={e => set('minRiskReward', e.target.value)} /></label>
          <label>Max. Tagesverlust<input type="number" value={plan.maxDailyDrawdown} onChange={e => set('maxDailyDrawdown', Number(e.target.value))} /></label>
        </div>
        <div className="form-row">
          <label>Max. Trades pro Tag<input type="number" value={plan.maxTradesPerDay} onChange={e => set('maxTradesPerDay', Number(e.target.value))} /></label>
          <label>Risiko pro Trade (%)<input type="number" step="0.1" value={plan.riskPerTrade} onChange={e => set('riskPerTrade', Number(e.target.value))} /></label>
        </div>
        <RuleList rules={plan.riskRules} onChange={r => set('riskRules', r)} />
      </PlanSection>

      <PlanSection icon="Compass" tone="neutral" title="Handelsstil">
        <label>Angestrebte Trade-Dauer<input type="text" placeholder="z.B. Minuten bis 1 Tag" value={plan.tradeDuration} onChange={e => set('tradeDuration', e.target.value)} /></label>
        <label>Märkte<MarketToggle options={MARKET_OPTIONS} selected={plan.markets} onChange={m => set('markets', m)} /></label>
        <div className="form-row">
          <label>Handelszeit von<input type="time" value={plan.hoursStart} onChange={e => set('hoursStart', e.target.value)} /></label>
          <label>bis<input type="time" value={plan.hoursEnd} onChange={e => set('hoursEnd', e.target.value)} /></label>
        </div>
      </PlanSection>

      <PlanSection icon="ArrowLeftRight" tone="accent" title="Einstiegs- & Ausstiegsregeln">
        <label>Setup-Tools<input type="text" placeholder="z.B. Support & Widerstand" value={plan.setupTools} onChange={e => set('setupTools', e.target.value)} /></label>
        <label>Strategien / Setups<ChipEditor tags={plan.strategyTags} onChange={t => set('strategyTags', t)} placeholder="Strategie hinzufügen" /></label>
      </PlanSection>

      <PlanSection icon="Brain" tone="pink" title="Psychologie-Regeln">
        <RuleList rules={plan.psychologyRules} onChange={r => set('psychologyRules', r)} />
      </PlanSection>

      <PlanSection icon="Star" tone="gold" title="Meine goldenen Regeln">
        <RuleList rules={plan.goldenRules} onChange={r => set('goldenRules', r)} placeholder="Goldene Regel hinzufügen" />
      </PlanSection>

      {!confirmPlanReset ? (
        <button className="btn-danger plan-reset" onClick={() => setConfirmPlanReset(true)}><Icon name="RotateCcw" size={14} /> Plan zurücksetzen</button>
      ) : (
        <div className="plan-reset-confirm">
          <span>Plan wirklich auf die Standardwerte zurücksetzen? Alle eigenen Regeln und Einstellungen gehen verloren.</span>
          <div className="plan-reset-confirm-actions">
            <button className="btn-ghost" onClick={() => setConfirmPlanReset(false)}>Abbrechen</button>
            <button className="btn-danger" onClick={() => { onReset(); setConfirmPlanReset(false); }}><Icon name="RotateCcw" size={14} /> Ja, zurücksetzen</button>
          </div>
        </div>
      )}
    </div>
  );
}
