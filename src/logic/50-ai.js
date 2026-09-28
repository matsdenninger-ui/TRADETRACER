/* ---------------------------------------------------------------------- */
/* KI-Coach: bereitet deine Daten als Text für Claude auf                  */
/* ---------------------------------------------------------------------- */

const AI_MODEL = 'claude-opus-5';
const AI_KEY_STORAGE = 'tradetracer:anthropic-key'; // bleibt auf dem Gerät

const AI_SYSTEM_PROMPT = `Du bist ein erfahrener, ehrlicher Trading-Coach. Du bekommst das Trading-Journal eines privaten Traders als Daten.
Schreibe einen Rückblick auf Deutsch, direkt an den Trader gerichtet (du-Form).
Stütze jede Aussage auf die Daten – nenne konkrete Trades, Zahlen und Notizen. Erfinde nichts, und sag offen, wenn die Datenbasis für eine Aussage zu dünn ist.
Gib keine Kauf- oder Verkaufsempfehlungen für einzelne Wertpapiere; es geht um Prozess, Disziplin, Risiko und Psychologie.
Gliedere mit Markdown-Überschriften (##) in: Kurzfazit · Was gut lief · Muster & Fehler · Psychologie · Konkrete Regeln für die nächste Woche (maximal 3, messbar).
Halte dich kurz: höchstens etwa 450 Wörter.`;

function aiPeriodRange(period) {
  const t = todayISO();
  if (period === 'week') return { from: addDaysISO(t, -6), to: t, label: 'die letzten 7 Tage' };
  if (period === 'month') return { from: addDaysISO(t, -29), to: t, label: 'die letzten 30 Tage' };
  return { from: '0000-00-00', to: '9999-12-31', label: 'die letzten 60 Trades' };
}

function buildReviewPrompt({ trades, mindset, plan, currency, period, accountName }) {
  const { from, to, label } = aiPeriodRange(period);
  let list = sortTrades(trades.filter(t => t.date >= from && t.date <= to && isRealized(t)));
  if (period === 'last') list = list.slice(-60);
  const stats = computeStats(list, 0);
  const num = (n, d = 2) => (n == null || !Number.isFinite(n) ? 'n/a' : n.toFixed(d));
  const lines = [];
  lines.push(`Zeitraum: ${label} (${list.length} abgeschlossene Trades), Konto: ${accountName}, Währung: ${currency}`);
  lines.push('');
  lines.push('## Kennzahlen');
  lines.push(`Netto: ${num(stats.totalPnL)} · Trefferquote: ${num(stats.winRate, 1)} % · Profitfaktor: ${num(stats.profitFactor)} · Erwartungswert/Trade: ${num(stats.expectancy)} · Ø R: ${num(stats.avgRMultiple)} · Stop-Loss-Quote: ${num(stats.slUsage, 0)} % · Max. Drawdown: ${num(stats.maxDrawdown)}`);
  lines.push('');
  lines.push('## Trading-Plan');
  lines.push(`Max. Tagesverlust: ${plan.maxDailyDrawdown} · Max. Trades/Tag: ${plan.maxTradesPerDay} · Min. R:R: ${plan.minRiskReward} · Risiko/Trade: ${plan.riskPerTrade} %`);
  [...(plan.riskRules || []), ...(plan.psychologyRules || []), ...(plan.goldenRules || [])].forEach(r => lines.push(`- ${r}`));
  lines.push('');
  lines.push('## Trades (Datum | Zeit | Symbol | Richtung | PnL | R | Strategie | Emotion | Ergebnis | Im Plan | Sterne | Notiz)');
  list.forEach(t => {
    const r = calcRMultiple(t);
    const note = (t.notes || '').replace(/\s+/g, ' ').slice(0, 280);
    lines.push([t.date, t.time || '-', t.symbol, t.direction, num(calcPnL(t)), r == null ? '-' : num(r), t.strategy || '-',
      EMOTION_BY_KEY[t.emotion]?.label || '-', t.result ? RESULT_LABELS[t.result] : '-', t.onPlan === false ? 'nein' : 'ja', t.rating || '-', note || '-'].join(' | '));
  });
  const days = Object.entries(mindset || {}).filter(([d]) => d >= from && d <= to).sort(([a], [b]) => a.localeCompare(b));
  if (days.length) {
    lines.push('');
    lines.push('## Mindset-Journal');
    days.forEach(([d, e]) => {
      const mood = PRE_MOODS.find(m => m.key === e?.pre?.mood)?.label;
      const rating = DAY_RATINGS.find(r => r.key === e?.post?.rating)?.label;
      const parts = [mood && `Stimmung vorher: ${mood}`, rating && `Tag: ${rating}`,
        e?.post?.improve?.length && `Verbessern: ${e.post.improve.join(', ')}`,
        e?.post?.takeaway && `Erkenntnis: "${e.post.takeaway}"`, e?.pre?.note && `Marktnotiz: "${e.pre.note}"`].filter(Boolean);
      if (parts.length) lines.push(`${d}: ${parts.join(' · ')}`);
    });
  }
  return { text: lines.join('\n'), count: list.length, label };
}
