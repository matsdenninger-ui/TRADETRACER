/* ---------------------------------------------------------------------- */
/* KI-Coach: bereitet deine Daten als Text für Claude auf                  */
/* ---------------------------------------------------------------------- */

const AI_MODEL = 'claude-opus-5-5';
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

/* ---------------------------------------------------------------------- */
/* Screenshot-Import: Claude liest Trades aus Screenshots der MT5-Historie */
/* (Handy-App oder PC). Ergebnis wird wie ein MT5-Bericht behandelt.       */
/* ---------------------------------------------------------------------- */

const SHOT_IMPORT_PROMPT = `Die Bilder sind Screenshots aus der Trade-Historie von MetaTrader 5 (Handy-App oder PC), Ansicht "Positionen".
Lies jede vollständig sichtbare geschlossene Position aus. Eine Position sieht z.B. so aus:
"XAUUSD buy 0.05" / "4184.58 → 4183.08" / rechts "-6.60" und "2026.09.30 14:06:17".
Dabei ist der erste Kurs der Einstieg, der zweite der Ausstieg, die Zahl rechts oben der Gewinn in Kontowährung und die Zeit die Schließzeit.
Regeln:
- Nur Positionen aufnehmen, deren Symbol, Richtung, Volumen, beide Kurse, Gewinn und Zeit vollständig und sicher lesbar sind. Teilweise verdeckte oder abgeschnittene Zeilen (z.B. hinter Menüleisten oder am Bildrand) weglassen.
- Zahlen genau so übernehmen, wie sie dastehen (Leerzeichen als Tausendertrenner entfernen, Punkt ist das Dezimalzeichen, Minus beachten).
- Kommt dieselbe Position auf mehreren Screenshots vor, nur einmal aufnehmen.
- Summenzeilen (Einzahlung, Kredit, Profit, Kontostand …), Orders und Deals ignorieren.
- Felder, die nicht zu sehen sind (Eröffnungszeit, Positionsnummer, S/L, T/P, Swap, Kommission), auf null setzen.`;

const SHOT_IMPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['trades'],
  properties: {
    trades: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'side', 'volume', 'open_price', 'close_price', 'profit', 'close_time', 'open_time', 'position', 'sl', 'tp', 'swap', 'commission'],
        properties: {
          symbol: { type: 'string' },
          side: { type: 'string', enum: ['buy', 'sell'] },
          volume: { type: 'number' },
          open_price: { type: 'number' },
          close_price: { type: 'number' },
          profit: { type: 'number' },
          close_time: { type: 'string', description: 'YYYY.MM.DD HH:MM:SS' },
          open_time: { type: ['string', 'null'] },
          position: { type: ['string', 'null'] },
          sl: { type: ['number', 'null'] },
          tp: { type: ['number', 'null'] },
          swap: { type: ['number', 'null'] },
          commission: { type: ['number', 'null'] }
        }
      }
    }
  }
};

/* Fingerabdruck eines geschlossenen Trades – erkennt Dubletten zwischen Bericht, Screenshot und Liste */
function tradeFingerprint(t) {
  if (!hasExit(t)) return null;
  const n = (v) => Number(v).toFixed(5).replace(/\.?0+$/, '');
  return [String(t.symbol || '').toUpperCase(), t.exitDate || t.date, (t.exitTime || '').slice(0, 5), n(t.quantity), n(t.exitPrice)].join('|');
}

/* Macht aus den ausgelesenen Zeilen dasselbe Format wie parseMt5Report */
function reportFromShotRows(rows) {
  const aoa = [
    ['Positionen'],
    ['Zeit', 'Position', 'Symbol', 'Typ', 'Volumen', 'Preis', 'S / L', 'T / P', 'Zeit', 'Preis', 'Kommission', 'Swap', 'Gewinn']
  ];
  const seen = new Set(), synthPos = new Set(), noOpenPos = new Set();
  rows.forEach(r => {
    const key = [r.symbol, r.side, r.volume, r.open_price, r.close_price, r.close_time].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    // ohne Positionsnummer: stabile Ersatz-Nummer aus Schließzeit + Kursen, damit ein erneuter Import nichts verdoppelt
    let pos = r.position && /^\d+$/.test(String(r.position)) ? String(r.position) : null;
    if (!pos) { pos = String(Math.abs([...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7))); synthPos.add(pos); }
    if (!r.open_time) noOpenPos.add(pos);
    aoa.push([r.open_time || r.close_time, pos, r.symbol, r.side, r.volume, r.open_price, r.sl ?? '', r.tp ?? '', r.close_time, r.close_price, r.commission ?? 0, r.swap ?? 0, r.profit]);
  });
  const rep = parseMt5Report(aoa);
  if (!rep) return null;
  // Ohne Eröffnungszeit: Datum = Schließtag, Einstiegszeit bleibt leer (zum Nachtragen)
  rep.trades = rep.trades.map(t => ({
    ...t,
    ...(noOpenPos.has(t.brokerRef) ? { time: '' } : {}),
    ...(synthPos.has(t.brokerRef) ? { id: `shot_${t.brokerRef}`, brokerRef: null } : {})
  }));
  rep.source = 'screenshot';
  return rep;
}
