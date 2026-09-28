/* ---------------------------------------------------------------------- */
/* Konstanten                                                              */
/* ---------------------------------------------------------------------- */

const TRADES_KEY = 'journal:trades';
const SETTINGS_KEY = 'journal:settings';
const PLAN_KEY = 'journal:plan';
const MINDSET_KEY = 'journal:mindset';
const ACCOUNTS_KEY = 'journal:accounts';

const DEFAULT_SETTINGS = { startingBalance: 10000, currency: '$', accentHue: 38, activeAccount: 'all', privacy: false, animatedBg: true, theme: 'dark', fx: {} };

const ACCOUNT_HUES = [38, 200, 150, 280, 340, 20, 100, 240];

const STRATEGY_SUGGESTIONS = ['Breakout', 'Pullback', 'Trend-Following', 'Scalping', 'Reversal', 'Range'];
const MARKET_OPTIONS = ['Aktien', 'Forex', 'Krypto', 'Optionen', 'Futures', 'Indizes'];

const PRE_MOODS = [
  { key: 'stressed', emoji: '😰', label: 'Gestresst' },
  { key: 'worried', emoji: '😟', label: 'Besorgt' },
  { key: 'neutral', emoji: '😐', label: 'Neutral' },
  { key: 'calm', emoji: '😌', label: 'Ruhig' },
  { key: 'sharp', emoji: '😎', label: 'Fokussiert' }
];

/* Emotion beim Einstieg (pro Trade) */
const TRADE_EMOTIONS = [
  { key: 'confident', emoji: '💪', label: 'Selbstsicher' },
  { key: 'calm', emoji: '😌', label: 'Ruhig' },
  { key: 'fomo', emoji: '🤑', label: 'FOMO' },
  { key: 'fear', emoji: '😨', label: 'Angst' },
  { key: 'revenge', emoji: '😤', label: 'Rache' },
  { key: 'bored', emoji: '🥱', label: 'Gelangweilt' }
];
const EMOTION_BY_KEY = Object.fromEntries(TRADE_EMOTIONS.map(e => [e.key, e]));

const PRE_CHECKLIST = [
  'Gestrige Trades überprüfen',
  'Vormarkt-News checken',
  'Watchlist-Level prüfen',
  'Tagesverlust-Limit festlegen',
  'Emotionalen Zustand klären'
];

const DAY_RATINGS = [
  { key: 'good', label: 'Guter Tag', icon: 'Sun' },
  { key: 'mixed', label: 'Gemischt', icon: 'CloudDrizzle' },
  { key: 'tough', label: 'Schwieriger Tag', icon: 'CloudRain' }
];

const WORKED_OPTIONS = ['Am Plan geblieben', 'Gute Positionsgröße', 'Geduldige Einstiege', 'Verluste schnell begrenzt', 'Gewinne laufen lassen', 'Gutes Risiko/Reward'];
const IMPROVE_OPTIONS = ['Übertradet', 'Einstiege gejagt', 'Zu lange gehalten', 'Zu groß positioniert', 'Rache-Trades', 'Stop ignoriert', 'FOMO'];

const RESULT_OPTIONS = [
  { key: 'followed', label: 'Plan befolgt' },
  { key: 'improvised', label: 'Improvisiert' },
  { key: 'lucky', label: 'Glück gehabt' },
  { key: 'mistake', label: 'Fehler' }
];
const RESULT_LABELS = Object.fromEntries(RESULT_OPTIONS.map(r => [r.key, r.label]));
const RESULT_TONE = { followed: 'profit', improvised: 'neutral', lucky: 'neutral', mistake: 'loss' };

function defaultMindsetEntry() {
  return {
    pre: { mood: null, checklist: PRE_CHECKLIST.map(() => false), note: '', done: false },
    post: { rating: null, worked: [], improve: [], takeaway: '', done: false }
  };
}

const DEFAULT_PLAN = {
  monthlyTarget: 1000,
  weeklyTarget: 250,
  goalRules: [
    'Fokus auf 50 USD Gewinn pro Handelstag',
    'Diszipliniert und geduldig für profitable Trades bleiben'
  ],
  minRiskReward: '1:2',
  maxDailyDrawdown: 100,
  maxTradesPerDay: 5,
  riskPerTrade: 1,
  riskRules: [
    'Stop-Loss-Orders zur Risikokontrolle nutzen',
    'Portfolio zur Risikostreuung diversifizieren'
  ],
  tradeDuration: 'Minuten bis 1 Tag',
  markets: ['Aktien'],
  hoursStart: '09:30',
  hoursEnd: '16:00',
  setupTools: 'Support & Widerstand, Candlestick-Formationen',
  strategyTags: ['Bull Flag', 'Breakout', 'Mean Reversion', 'Momentum', 'Gap Fill', 'VWAP Bounce'],
  psychologyRules: [
    'Emotionalen Zustand vor jedem Trade prüfen',
    'Keine Rache-Trades nach einem Verlust – 15 Minuten Pause',
    'Stimmung zu jedem Trade festhalten'
  ],
  goldenRules: [],
  hardLock: true
};

const uid = (prefix = 't') => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

/* ---------------------------------------------------------------------- */
/* Formatierung (inkl. Privatsphäre-Modus)                                 */
/* ---------------------------------------------------------------------- */

let PRIVACY = false;
function setPrivacy(on) { PRIVACY = !!on; }

function fmtMoney(n, currency = '$') {
  if (PRIVACY) return `${currency}•••••`;
  const sign = n < 0 ? '-' : '';
  const val = Math.abs(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}${currency}${val}`;
}
function fmtMoneySigned(n, currency = '$') {
  if (PRIVACY) return `${currency}•••••`;
  return `${n > 0 ? '+' : ''}${fmtMoney(n, currency)}`;
}
function fmtMoneyShort(n, currency = '$') {
  if (PRIVACY) return '•••';
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1e6) return `${sign}${currency}${(a / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })}M`;
  if (a >= 1e4) return `${sign}${currency}${(a / 1e3).toLocaleString('de-DE', { maximumFractionDigits: 1 })}k`;
  return `${sign}${currency}${a.toLocaleString('de-DE', { maximumFractionDigits: 0 })}`;
}
function fmtNum(n, digits = 2) {
  if (n == null || !Number.isFinite(n)) return n === Infinity ? '∞' : '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtPct(n, digits = 1) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}
function fmtR(r) {
  if (r == null || !Number.isFinite(r)) return '—';
  return `${r >= 0 ? '+' : ''}${r.toFixed(2)}R`;
}
function fmtDuration(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  if (min < 1) return '< 1 Min';
  if (min < 60) return `${Math.round(min)} Min`;
  if (min < 60 * 24) { const h = Math.floor(min / 60); const m = Math.round(min % 60); return m ? `${h} Std ${m} Min` : `${h} Std`; }
  const d = Math.floor(min / 1440); const h = Math.round((min % 1440) / 60);
  return h ? `${d} T ${h} Std` : `${d} Tage`;
}
function fmtDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function fmtDateLong(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}
function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function todayISO() { return localISO(new Date()); }
function addDaysISO(iso, days) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days); return localISO(d); }
function weekStartISO(iso) { const d = new Date(iso + 'T00:00:00'); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return localISO(d); }

const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAY_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function weekdayOf(dateISO) {
  const d = new Date(dateISO + 'T00:00:00');
  return WEEKDAY_FULL[(d.getDay() + 6) % 7];
}

const HOUR_BUCKETS = [
  { label: 'Nacht (0–6 Uhr)', test: h => h >= 0 && h < 6 },
  { label: 'Vormittag (6–12 Uhr)', test: h => h >= 6 && h < 12 },
  { label: 'Mittag (12–15 Uhr)', test: h => h >= 12 && h < 15 },
  { label: 'Nachmittag (15–18 Uhr)', test: h => h >= 15 && h < 18 },
  { label: 'Abend (18–24 Uhr)', test: h => h >= 18 && h < 24 }
];
function hourBucketOf(time) {
  const h = parseInt(time.split(':')[0], 10);
  const b = HOUR_BUCKETS.find(b => b.test(h));
  return b ? b.label : 'Unbekannt';
}

const HOLD_BUCKETS = [
  { label: '< 5 Min', max: 5 },
  { label: '5–30 Min', max: 30 },
  { label: '30 Min – 2 Std', max: 120 },
  { label: '2 Std – 1 Tag', max: 1440 },
  { label: '1–5 Tage', max: 7200 },
  { label: '> 5 Tage', max: Infinity }
];

/* ---------------------------------------------------------------------- */
/* Trade-Berechnungen                                                      */
/* ---------------------------------------------------------------------- */

/* Realisierter Gewinn: nur der bereits geschlossene Teil, × Kontraktgröße, − Gebühren */
function calcPnL(t) {
  const q = closedQty(t);
  if (q <= 0) return 0;
  const gross = t.direction === 'long'
    ? (t.exitPrice - t.entryPrice) * q
    : (t.entryPrice - t.exitPrice) * q;
  return gross * tradeMultiplier(t) - (Number(t.fees) || 0);
}

/* Risiko bis zum Stop für den geschlossenen Teil (Basis für das R-Multiple) */
function calcRisk(t) {
  if (!t.stopLoss) return null;
  const riskPerUnit = t.direction === 'long' ? (t.entryPrice - t.stopLoss) : (t.stopLoss - t.entryPrice);
  if (riskPerUnit <= 0) return null;
  const q = closedQty(t) || Number(t.quantity) || 0;
  return riskPerUnit * q * tradeMultiplier(t);
}

function calcRMultiple(t) {
  const risk = calcRisk(t);
  return risk ? calcPnL(t) / risk : null;
}

function calcPlannedRR(t) {
  if (!t.stopLoss || !t.takeProfit) return null;
  const risk = t.direction === 'long' ? t.entryPrice - t.stopLoss : t.stopLoss - t.entryPrice;
  const reward = t.direction === 'long' ? t.takeProfit - t.entryPrice : t.entryPrice - t.takeProfit;
  return risk > 0 ? reward / risk : null;
}

function holdingMinutes(t) {
  if (!t.time || !t.exitTime) return null;
  const start = new Date(`${t.date}T${t.time}:00`);
  const end = new Date(`${t.exitDate || t.date}T${t.exitTime}:00`);
  const diff = (end - start) / 60000;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function parseMinRiskReward(str) {
  const m = /^\s*1\s*:\s*([\d.,]+)/.exec(str || '');
  return m ? Number(m[1].replace(',', '.')) : null;
}

function sum(list) { return list.reduce((a, b) => a + b, 0); }
function mean(list) { return list.length ? sum(list) / list.length : 0; }
function stdev(list) {
  if (list.length < 2) return 0;
  const m = mean(list);
  return Math.sqrt(sum(list.map(v => (v - m) ** 2)) / (list.length - 1));
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function groupBy(list, keyFn) {
  return list.reduce((acc, item) => {
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

function rowStats(name, list) {
  const pnls = list.map(calcPnL);
  const pnl = sum(pnls);
  const wins = pnls.filter(p => p > 0).length;
  return { name, pnl, count: list.length, winRate: (wins / list.length) * 100, avg: pnl / list.length };
}

function sortTrades(trades) {
  return [...trades].sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '') || a.createdAt - b.createdAt);
}

/* Zentrale Kennzahlen – wird von Dashboard, Analyse, Coach und Report genutzt */
const MIN_DAYS_FOR_RATIOS = 20;
const MIN_TRADES_FOR_SQN = 10;
const MIN_TRADES_FOR_KELLY = 20;

function computeStats(trades, startingBalance) {
  const sorted = sortTrades(trades.filter(isRealized));
  const pnls = sorted.map(calcPnL);
  const wins = pnls.filter(p => p > 0);
  const losses = pnls.filter(p => p < 0);
  const totalPnL = sum(pnls);
  const avgWin = mean(wins);
  const avgLoss = mean(losses);
  const grossWin = sum(wins);
  const grossLoss = Math.abs(sum(losses));
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? Infinity : 0) : grossWin / grossLoss;
  const winRate = sorted.length ? (wins.length / sorted.length) * 100 : 0;
  const expectancy = sorted.length ? totalPnL / sorted.length : 0;
  const payoff = avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : (avgWin > 0 ? Infinity : 0);
  const totalFees = sum(sorted.map(t => Number(t.fees) || 0));

  let streak = 0;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = pnls[i];
    if (p === 0) break;
    if (streak === 0) streak = p > 0 ? 1 : -1;
    else if (p > 0 && streak > 0) streak++;
    else if (p < 0 && streak < 0) streak--;
    else break;
  }
  let maxWinStreak = 0, maxLossStreak = 0, cw = 0, cl = 0;
  pnls.forEach(p => {
    if (p > 0) { cw++; cl = 0; } else if (p < 0) { cl++; cw = 0; } else { cw = 0; cl = 0; }
    maxWinStreak = Math.max(maxWinStreak, cw); maxLossStreak = Math.max(maxLossStreak, cl);
  });

  let running = startingBalance;
  const equityCurve = [{ date: sorted[0]?.date || todayISO(), balance: startingBalance, label: 'Start' }];
  sorted.forEach((t, i) => { running += pnls[i]; equityCurve.push({ date: t.date, balance: running, label: t.symbol }); });

  let peak = startingBalance;
  let maxDrawdownPct = 0;
  const drawdownCurve = equityCurve.map(pt => {
    peak = Math.max(peak, pt.balance);
    const dd = pt.balance - peak;
    if (peak > 0) maxDrawdownPct = Math.min(maxDrawdownPct, (dd / peak) * 100);
    return { date: pt.date, drawdown: dd, label: pt.label };
  });
  const maxDrawdown = Math.min(0, ...drawdownCurve.map(d => d.drawdown));

  const rMultiples = sorted.map(calcRMultiple).filter(r => r != null);
  const avgRMultiple = rMultiples.length ? mean(rMultiples) : null;
  const slUsage = sorted.length ? (sorted.filter(t => calcRisk(t) != null).length / sorted.length) * 100 : 0;

  // Tagesrenditen für Sharpe/Sortino
  const dayMap = {};
  sorted.forEach((t, i) => { dayMap[t.date] = (dayMap[t.date] || 0) + pnls[i]; });
  const days = Object.keys(dayMap).sort();
  let bal = startingBalance;
  const dailyReturns = days.map(d => { const r = bal > 0 ? dayMap[d] / bal : 0; bal += dayMap[d]; return r; });
  const dailyPnls = days.map(d => dayMap[d]);
  const sd = stdev(dailyReturns);
  const downside = Math.sqrt(mean(dailyReturns.map(r => Math.min(0, r) ** 2)));
  const enoughDays = dailyReturns.length >= MIN_DAYS_FOR_RATIOS;
  const sharpe = enoughDays && sd > 0 ? (mean(dailyReturns) / sd) * Math.sqrt(252) : null;
  const sortino = enoughDays && downside > 0 ? (mean(dailyReturns) / downside) * Math.sqrt(252) : null;
  const greenDays = dailyPnls.filter(p => p > 0).length;

  const sqnBase = rMultiples.length >= MIN_TRADES_FOR_SQN ? rMultiples : null;
  const sqn = sqnBase && stdev(sqnBase) > 0 ? Math.sqrt(Math.min(sqnBase.length, 100)) * mean(sqnBase) / stdev(sqnBase) : null;
  const kelly = sorted.length >= MIN_TRADES_FOR_KELLY && Number.isFinite(payoff) && payoff > 0 ? (winRate / 100 - (1 - winRate / 100) / payoff) * 100 : null;
  const recoveryFactor = maxDrawdown < 0 ? totalPnL / Math.abs(maxDrawdown) : null;

  const holds = sorted.map(holdingMinutes);
  const winHolds = sorted.map((t, i) => pnls[i] > 0 ? holds[i] : null).filter(h => h != null);
  const lossHolds = sorted.map((t, i) => pnls[i] < 0 ? holds[i] : null).filter(h => h != null);
  const allHolds = holds.filter(h => h != null);

  return {
    sorted, pnls,
    totalTrades: sorted.length,
    wins: wins.length,
    losses: losses.length,
    winRate, totalPnL, avgWin, avgLoss, grossWin, grossLoss, profitFactor, payoff, totalFees,
    bestTrade: pnls.length ? Math.max(...pnls) : 0,
    worstTrade: pnls.length ? Math.min(...pnls) : 0,
    streak, maxWinStreak, maxLossStreak, expectancy,
    equityCurve, drawdownCurve, maxDrawdown, maxDrawdownPct,
    rMultiples, avgRMultiple, slUsage,
    sharpe, sortino, sqn, kelly, recoveryFactor, enoughDays,
    tradingDays: days.length, greenDays, dayPnls: dayMap,
    bestDay: dailyPnls.length ? Math.max(...dailyPnls) : 0,
    worstDay: dailyPnls.length ? Math.min(...dailyPnls) : 0,
    avgHold: allHolds.length ? mean(allHolds) : null,
    avgWinHold: winHolds.length ? mean(winHolds) : null,
    avgLossHold: lossHolds.length ? mean(lossHolds) : null,
    currentBalance: startingBalance + totalPnL,
    returnPct: startingBalance > 0 ? (totalPnL / startingBalance) * 100 : 0,
    recent: [...sorted].reverse().slice(0, 7).map(t => ({ ...t, pnl: calcPnL(t) }))
  };
}

/* ---------------------------------------------------------------------- */
/* Excel-/CSV-Import                                                       */
/* ---------------------------------------------------------------------- */

const IMPORT_FIELDS = [
  { key: 'date', label: 'Datum', required: true },
  { key: 'symbol', label: 'Symbol', required: true },
  { key: 'direction', label: 'Richtung (Long/Short)', required: true },
  { key: 'entryPrice', label: 'Einstiegspreis', required: true },
  { key: 'exitPrice', label: 'Ausstiegspreis', required: true },
  { key: 'quantity', label: 'Menge', required: true },
  { key: 'fees', label: 'Gebühren', required: false },
  { key: 'multiplier', label: 'Multiplikator / Punktwert', required: false },
  { key: 'stopLoss', label: 'Stop-Loss', required: false },
  { key: 'takeProfit', label: 'Take-Profit', required: false },
  { key: 'strategy', label: 'Strategie', required: false },
  { key: 'time', label: 'Uhrzeit (Einstieg)', required: false },
  { key: 'exitTime', label: 'Uhrzeit (Ausstieg)', required: false },
  { key: 'notes', label: 'Notizen', required: false }
];

const FIELD_KEYWORDS = {
  multiplier: ['multiplikator', 'multiplier', 'punktwert', 'kontraktgröße', 'contract size'],
  date: ['datum', 'date', 'day', 'tag'],
  symbol: ['symbol', 'ticker', 'asset', 'instrument', 'wertpapier'],
  direction: ['richtung', 'direction', 'side', 'typ', 'type', 'long', 'short'],
  entryPrice: ['einstieg', 'entry', 'kaufkurs', 'open', 'buy'],
  exitPrice: ['ausstieg', 'exit', 'verkaufskurs', 'close', 'sell'],
  quantity: ['menge', 'quantity', 'qty', 'size', 'stück', 'shares', 'lots'],
  fees: ['gebühr', 'gebuehr', 'fee', 'commission', 'kosten', 'spesen'],
  stopLoss: ['stop-loss', 'stoploss', 'stop loss', 'stop', 'sl'],
  takeProfit: ['take-profit', 'takeprofit', 'take profit', 'tp', 'ziel', 'target'],
  strategy: ['strategie', 'strategy', 'setup'],
  time: ['einstiegszeit', 'entry time', 'uhrzeit', 'zeit', 'time'],
  exitTime: ['ausstiegszeit', 'exit time', 'close time'],
  notes: ['notiz', 'note', 'comment', 'kommentar', 'bemerkung']
};

function guessImportMapping(headers) {
  const mapping = {};
  const used = new Set();
  const lower = headers.map(h => String(h || '').toLowerCase());
  // Spezifische Felder zuerst, damit z.B. "Ausstiegszeit" nicht als "Ausstieg" erkannt wird
  const order = ['multiplier', 'exitTime', 'takeProfit', 'stopLoss', 'time', ...IMPORT_FIELDS.map(f => f.key)];
  [...new Set(order)].forEach(key => {
    const keywords = FIELD_KEYWORDS[key] || [];
    const idx = lower.findIndex((h, i) => !used.has(i) && keywords.some(k => h.includes(k)));
    mapping[key] = idx;
    if (idx >= 0) used.add(idx);
  });
  return mapping;
}

function parseImportNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim().replace(/[^\d,.\-]/g, '');
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseImportDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return localISO(v);
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const d = new Date(s);
  return isNaN(d) ? null : localISO(d);
}

function parseImportTime(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date && !isNaN(v)) return `${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`;
  if (typeof v === 'number') {
    const totalMin = Math.round((v % 1) * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  const m = /(\d{1,2}):(\d{2})/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

function normalizeImportDirection(v) {
  const s = String(v || '').trim().toLowerCase();
  return ['short', 's', 'sell', 'verkauf', 'leerverkauf', 'sk'].includes(s) ? 'short' : 'long';
}

function buildTradesFromImportRows(rows, mapping, accountId) {
  const trades = [];
  const errors = [];
  rows.forEach((row, i) => {
    const get = (field) => {
      const idx = mapping[field];
      return idx != null && idx >= 0 ? row[idx] : undefined;
    };
    const symbol = get('symbol');
    const entry = parseImportNumber(get('entryPrice'));
    const exit = parseImportNumber(get('exitPrice'));
    const qty = parseImportNumber(get('quantity'));
    const date = parseImportDate(get('date'));
    if (!symbol || entry == null || exit == null || qty == null || !date) {
      errors.push(`Zeile ${i + 2}: unvollständige oder unlesbare Angaben – übersprungen.`);
      return;
    }
    trades.push(normalizeTrade({
      id: uid(),
      accountId,
      date,
      time: parseImportTime(get('time')),
      exitTime: parseImportTime(get('exitTime')),
      symbol: String(symbol).trim().toUpperCase(),
      direction: normalizeImportDirection(get('direction')),
      entryPrice: entry,
      exitPrice: exit,
      stopLoss: parseImportNumber(get('stopLoss')),
      takeProfit: parseImportNumber(get('takeProfit')),
      quantity: qty,
      fees: parseImportNumber(get('fees')) || 0,
      multiplier: parseImportNumber(get('multiplier')) || 1,
      strategy: get('strategy') ? String(get('strategy')).trim() : '',
      notes: get('notes') ? String(get('notes')).trim() : '',
      createdAt: Date.now() + i
    }));
  });
  return { trades, errors };
}

/* Stellt sicher, dass alte Trades (aus der Vorversion) alle neuen Felder besitzen */
function normalizeTrade(t, fallbackAccountId = 'acc_main') {
  return {
    onPlan: true, setups: [], result: null, stopLoss: null, takeProfit: null,
    time: '', exitDate: '', exitTime: '', emotion: null, rating: 0, tags: [], screenshots: [],
    fees: 0, strategy: '', notes: '', createdAt: Date.now(), multiplier: 1, exitQuantity: null, legs: null,
    ...t,
    accountId: t.accountId || fallbackAccountId
  };
}

/* ---------------------------------------------------------------------- */
/* Geräte-Sync über ein geheimes GitHub Gist                               */
/* Jedes Gerät führt seinen Stand mit dem Gist zusammen (pro Eintrag nach  */
/* Zeitstempel, Löschungen über "Grabsteine") – so geht nichts verloren.   */
/* ---------------------------------------------------------------------- */

const SYNC_CFG_KEY = 'tradetracer:sync'; // bleibt auf dem Gerät, wird nie hochgeladen
const TOMB_KEY = 'journal:tombstones';
const GIST_FILE = 'tradetracer-data.json';
const IMG_PREFIX = 'img_';

function loadSyncCfg() {
  try { return JSON.parse(localStorage.getItem(SYNC_CFG_KEY)) || null; } catch (e) { return null; }
}
function saveSyncCfg(cfg) {
  try { if (cfg) localStorage.setItem(SYNC_CFG_KEY, JSON.stringify(cfg)); else localStorage.removeItem(SYNC_CFG_KEY); } catch (e) { /* ignorieren */ }
}

async function ghApi(path, token, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`https://api.github.com${path}`, {
      method, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) { throw new Error('Keine Verbindung zu GitHub.'); }
  if (!res.ok) {
    if (res.status === 401) throw new Error('Token ungültig oder abgelaufen.');
    if (res.status === 403) throw new Error('Zugriff verweigert – der Token braucht die Berechtigung „gist“.');
    if (res.status === 404) throw new Error('Gist nicht gefunden – oder dem Token fehlt die Berechtigung „gist“.');
    throw new Error(`GitHub-Fehler ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

async function gistFileContent(file) {
  if (!file) return null;
  if (!file.truncated && file.content != null) return file.content;
  const r = await fetch(file.raw_url, { cache: 'no-store' });
  if (!r.ok) throw new Error('Gist-Datei konnte nicht geladen werden.');
  return r.text();
}

/* Sucht das TradeTracer-Gist des Kontos – so findet ein zweites Gerät die Daten nur mit dem Token */
async function findOrCreateGist(token) {
  for (let page = 1; page <= 5; page++) {
    const list = await ghApi(`/gists?per_page=100&page=${page}`, token);
    const hit = list.find(g => g.files && g.files[GIST_FILE]);
    if (hit) return { id: hit.id, created: false };
    if (list.length < 100) break;
  }
  const g = await ghApi('/gists', token, {
    method: 'POST',
    body: { description: 'TradeTracer – Geräte-Sync (bitte nicht löschen)', public: false, files: { [GIST_FILE]: { content: JSON.stringify({ app: 'TradeTracer', version: 2, trades: [] }) } } }
  });
  return { id: g.id, created: true };
}

function mergeRecords(localList = [], remoteList = [], localTomb = {}, remoteTomb = {}) {
  const tomb = { ...remoteTomb };
  Object.entries(localTomb || {}).forEach(([k, v]) => { tomb[k] = Math.max(tomb[k] || 0, v); });
  const map = new Map();
  [...(remoteList || []), ...(localList || [])].forEach(x => {
    const cur = map.get(x.id);
    if (!cur || (x.updatedAt || 0) > (cur.updatedAt || 0)) map.set(x.id, x);
  });
  const list = [...map.values()].filter(x => !(tomb[x.id] && tomb[x.id] >= (x.updatedAt || 0)));
  return { list, tomb };
}

function mergeByStamp(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (b._u || 0) > (a._u || 0) ? b : a;
}

function mergeSnapshots(local, remote) {
  const t = mergeRecords(local.trades, remote.trades, local.tombstones?.trades, remote.tombstones?.trades);
  const a = mergeRecords(local.accounts, remote.accounts, local.tombstones?.accounts, remote.tombstones?.accounts);
  const mindset = { ...(remote.mindset || {}) };
  Object.entries(local.mindset || {}).forEach(([d, e]) => { mindset[d] = mergeByStamp(mindset[d], e); });
  return {
    trades: t.list,
    accounts: a.list.length ? a.list : (local.accounts || []),
    mindset,
    plan: mergeByStamp(local.plan, remote.plan),
    prefs: mergeByStamp(local.prefs, remote.prefs),
    reviews: mergeStampedMaps(local.reviews, remote.reviews),
    images: mergeStampedMaps(local.images, remote.images),
    tombstones: { trades: t.tomb, accounts: a.tomb }
  };
}

function fmtAgo(ts) {
  if (!ts) return 'noch nie';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 10) return 'gerade eben';
  if (s < 60) return `vor ${s} Sek.`;
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  return new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ---------------------------------------------------------------------- */
/* Smart-Coach: regelbasierte Auswertung deiner Daten                      */
/* ---------------------------------------------------------------------- */

const INSIGHT_MIN_TRADES = 10;

function computeInsights(trades, stats, mindset, plan, currency) {
  if (trades.length < INSIGHT_MIN_TRADES) return [];
  const out = [];
  const overallAvg = stats.expectancy;
  const push = (tone, icon, title, text, metric, weight) => out.push({ tone, icon, title, text, metric, weight: Math.abs(weight || 0) });

  // 1) Wochentag
  const wd = Object.entries(groupBy(trades, t => weekdayOf(t.date))).map(([n, l]) => rowStats(n, l)).filter(r => r.count >= 3);
  if (wd.length >= 2) {
    const best = [...wd].sort((a, b) => b.avg - a.avg)[0];
    const worst = [...wd].sort((a, b) => a.avg - b.avg)[0];
    if (best.avg > 0) push('good', 'Calendar', `${best.name} ist dein stärkster Tag`, `Ø ${fmtMoney(best.avg, currency)} pro Trade bei ${fmtPct(best.winRate, 0)} Trefferquote (${best.count} Trades).`, fmtMoneySigned(best.pnl, currency), best.pnl);
    if (worst.avg < 0 && worst.name !== best.name) push('bad', 'Calendar', `${worst.name} kostet dich Geld`, `Ø ${fmtMoney(worst.avg, currency)} pro Trade. Überlege, an diesem Tag kleiner oder gar nicht zu handeln.`, fmtMoneySigned(worst.pnl, currency), worst.pnl);
  }

  // 2) Tageszeit
  const timed = trades.filter(t => t.time);
  const hb = Object.entries(groupBy(timed, t => hourBucketOf(t.time))).map(([n, l]) => rowStats(n, l)).filter(r => r.count >= 3);
  if (hb.length >= 2) {
    const best = [...hb].sort((a, b) => b.avg - a.avg)[0];
    const worst = [...hb].sort((a, b) => a.avg - b.avg)[0];
    if (best.avg > 0) push('good', 'Clock', `Deine beste Zeit: ${best.name.split(' (')[0]}`, `${best.name}: Ø ${fmtMoney(best.avg, currency)} pro Trade, ${fmtPct(best.winRate, 0)} Treffer.`, fmtMoneySigned(best.pnl, currency), best.pnl * 0.9);
    if (worst.avg < 0 && worst.name !== best.name) push('bad', 'Clock', `Schwache Phase: ${worst.name.split(' (')[0]}`, `${worst.name} bringt dir Ø ${fmtMoney(worst.avg, currency)} pro Trade.`, fmtMoneySigned(worst.pnl, currency), worst.pnl * 0.9);
  }

  // 3) Strategien
  const st = Object.entries(groupBy(trades.filter(t => t.strategy), t => t.strategy)).map(([n, l]) => rowStats(n, l)).filter(r => r.count >= 3);
  if (st.length >= 1) {
    const best = [...st].sort((a, b) => b.pnl - a.pnl)[0];
    const worst = [...st].sort((a, b) => a.pnl - b.pnl)[0];
    if (best.pnl > 0) push('good', 'Zap', `Dein Edge: ${best.name}`, `${best.count} Trades, ${fmtPct(best.winRate, 0)} Trefferquote. Diese Strategie trägt dein Konto – mehr davon.`, fmtMoneySigned(best.pnl, currency), best.pnl * 1.1);
    if (worst.pnl < 0 && worst.name !== best.name) push('bad', 'Zap', `${worst.name} funktioniert (noch) nicht`, `${worst.count} Trades mit ${fmtPct(worst.winRate, 0)} Trefferquote. Setup überarbeiten oder pausieren.`, fmtMoneySigned(worst.pnl, currency), worst.pnl * 1.1);
  }

  // 4) Long vs. Short
  const longs = trades.filter(t => t.direction === 'long'), shorts = trades.filter(t => t.direction === 'short');
  if (longs.length >= 3 && shorts.length >= 3) {
    const L = rowStats('Long', longs), S = rowStats('Short', shorts);
    const better = L.avg >= S.avg ? L : S, worse = L.avg >= S.avg ? S : L;
    if (worse.pnl < 0 || better.avg > worse.avg * 2) push(worse.pnl < 0 ? 'bad' : 'info', 'ArrowLeftRight', `Du bist ein besserer ${better.name}-Trader`, `${better.name}: Ø ${fmtMoney(better.avg, currency)} · ${worse.name}: Ø ${fmtMoney(worse.avg, currency)} pro Trade.`, `${fmtPct(better.winRate, 0)} vs. ${fmtPct(worse.winRate, 0)}`, Math.abs(better.pnl - worse.pnl) * 0.5);
  }

  // 5) Planabweichungen
  const off = trades.filter(t => t.onPlan === false);
  if (off.length >= 2) {
    const offPnl = sum(off.map(calcPnL));
    const onAvg = mean(trades.filter(t => t.onPlan !== false).map(calcPnL));
    if (offPnl < 0) push('bad', 'Compass', 'Trades außerhalb deines Plans kosten dich', `${off.length} Trades ohne Plan brachten ${fmtMoney(offPnl, currency)}. Trades im Plan: Ø ${fmtMoney(onAvg, currency)}.`, fmtMoneySigned(offPnl, currency), offPnl * 1.3);
    else push('info', 'Compass', 'Improvisation lief bisher gut – Vorsicht', `${off.length} Trades außerhalb des Plans waren zusammen positiv. Prüfe, ob das Glück oder ein neues Setup ist.`, fmtMoneySigned(offPnl, currency), offPnl * 0.3);
  }

  // 6) Stop-Loss-Nutzung
  if (stats.slUsage < 60) push('bad', 'Shield', 'Zu wenige Trades mit Stop-Loss', `Nur ${fmtPct(stats.slUsage, 0)} deiner Trades haben einen Stop. Ohne Stop kein R-Multiple und kein kontrolliertes Risiko.`, fmtPct(stats.slUsage, 0), Math.abs(stats.avgLoss) * 3);
  else if (stats.slUsage >= 90) push('good', 'Shield', 'Starkes Risikomanagement', `${fmtPct(stats.slUsage, 0)} deiner Trades sind mit Stop-Loss abgesichert.`, fmtPct(stats.slUsage, 0), stats.avgWin);

  // 7) Rache-Trades (Trade direkt nach einem Verlust am selben Tag)
  const sorted = stats.sorted;
  const afterLoss = [];
  for (let i = 1; i < sorted.length; i++) if (sorted[i].date === sorted[i - 1].date && stats.pnls[i - 1] < 0) afterLoss.push(stats.pnls[i]);
  if (afterLoss.length >= 3) {
    const avgAfter = mean(afterLoss);
    if (avgAfter < overallAvg && avgAfter < 0) push('bad', 'Flame', 'Nach Verlusten tradest du schlechter', `Trades direkt nach einem Verlust am selben Tag: Ø ${fmtMoney(avgAfter, currency)} (sonst Ø ${fmtMoney(overallAvg, currency)}). Nach einem Verlust: Pause.`, fmtMoneySigned(sum(afterLoss), currency), sum(afterLoss));
  }

  // 8) Overtrading
  if (plan.maxTradesPerDay) {
    const perDay = groupBy(trades, t => t.date);
    const overDays = Object.values(perDay).filter(l => l.length > plan.maxTradesPerDay);
    if (overDays.length >= 1) {
      const pnl = sum(overDays.flat().map(calcPnL));
      push(pnl < 0 ? 'bad' : 'info', 'Repeat', `Tageslimit ${overDays.length}× überschritten`, `An Tagen mit mehr als ${plan.maxTradesPerDay} Trades lag dein Ergebnis bei ${fmtMoney(pnl, currency)}.`, fmtMoneySigned(pnl, currency), pnl);
    }
  }

  // 9) Haltedauer
  if (stats.avgWinHold != null && stats.avgLossHold != null && stats.avgWinHold > 0) {
    const ratio = stats.avgLossHold / stats.avgWinHold;
    if (ratio > 1.3) push('bad', 'Clock', `Du hältst Verlierer ${fmtNum(ratio, 1)}× länger`, `Gewinner: Ø ${fmtDuration(stats.avgWinHold)} · Verlierer: Ø ${fmtDuration(stats.avgLossHold)}. Klassisches "Hoffen" – schneller raus.`, `${fmtNum(ratio, 1)}×`, Math.abs(stats.avgLoss) * 2);
    else if (ratio < 0.8) push('good', 'Clock', 'Du schneidest Verluste schnell ab', `Verlierer hältst du Ø ${fmtDuration(stats.avgLossHold)}, Gewinner Ø ${fmtDuration(stats.avgWinHold)}. Genau so.`, `${fmtNum(ratio, 1)}×`, stats.avgWin);
  }

  // 10) Payoff vs. Trefferquote
  if (stats.wins && stats.losses && Number.isFinite(stats.payoff)) {
    const breakeven = 100 / (1 + stats.payoff);
    const edge = stats.winRate - breakeven;
    push(edge >= 0 ? 'good' : 'bad', 'Target', edge >= 0 ? 'Deine Mathematik stimmt' : 'Deine Mathematik stimmt noch nicht',
      `Gewinn/Verlust-Verhältnis ${fmtNum(stats.payoff, 2)} → Break-even ab ${fmtPct(breakeven, 0)} Trefferquote. Du liegst bei ${fmtPct(stats.winRate, 0)}.`,
      `${edge >= 0 ? '+' : ''}${fmtNum(edge, 1)} Pp.`, Math.abs(stats.totalPnL) * 0.8);
  }

  // 11) Emotion beim Einstieg
  const em = Object.entries(groupBy(trades.filter(t => t.emotion), t => t.emotion)).map(([k, l]) => ({ key: k, ...rowStats(k, l) })).filter(r => r.count >= 2);
  if (em.length) {
    const worst = [...em].sort((a, b) => a.pnl - b.pnl)[0];
    const best = [...em].sort((a, b) => b.pnl - a.pnl)[0];
    if (worst.pnl < 0) { const e = EMOTION_BY_KEY[worst.key]; push('bad', 'Smile', `${e?.emoji || ''} ${e?.label || worst.key} ist teuer`, `Trades mit dieser Emotion: ${worst.count} Stück, ${fmtMoney(worst.pnl, currency)} gesamt. Erkenne das Gefühl – und bleib draußen.`, fmtMoneySigned(worst.pnl, currency), worst.pnl * 1.2); }
    if (best.pnl > 0 && best.key !== worst.key) { const e = EMOTION_BY_KEY[best.key]; push('good', 'Smile', `${e?.emoji || ''} ${e?.label || best.key} bringt dir Geld`, `${best.count} Trades mit ${fmtPct(best.winRate, 0)} Trefferquote. Das ist dein idealer Zustand.`, fmtMoneySigned(best.pnl, currency), best.pnl); }
  }

  // 12) Fehler-Trades
  const mistakes = trades.filter(t => t.result === 'mistake');
  if (mistakes.length >= 2) {
    const pnl = sum(mistakes.map(calcPnL));
    if (pnl < 0) push('bad', 'AlertTriangle', 'Vermeidbare Fehler', `${mistakes.length} als Fehler markierte Trades kosteten ${fmtMoney(pnl, currency)} – ohne sie läge dein Ergebnis bei ${fmtMoney(stats.totalPnL - pnl, currency)}.`, fmtMoneySigned(pnl, currency), pnl * 1.2);
  }

  // 13) Gebühren
  if (stats.grossWin > 0 && stats.totalFees / stats.grossWin > 0.12) push('bad', 'Percent', 'Gebühren fressen deinen Gewinn', `${fmtPct((stats.totalFees / stats.grossWin) * 100, 0)} deiner Bruttogewinne gehen an Gebühren (${fmtMoney(stats.totalFees, currency)}).`, fmtMoney(-stats.totalFees, currency), stats.totalFees);

  // 14) Verlustserie
  if (stats.maxLossStreak >= 4) push('info', 'TrendingDown', `Längste Verlustserie: ${stats.maxLossStreak} Trades`, 'Plane eine feste Regel: nach 3 Verlusten in Folge ist der Tag beendet.', `${stats.maxLossStreak}×`, Math.abs(stats.avgLoss) * stats.maxLossStreak * 0.5);

  // 15) Symbole
  const sy = Object.entries(groupBy(trades, t => t.symbol)).map(([n, l]) => rowStats(n, l)).filter(r => r.count >= 3);
  if (sy.length >= 2) {
    const worst = [...sy].sort((a, b) => a.pnl - b.pnl)[0];
    if (worst.pnl < 0) push('bad', 'Crosshair', `${worst.name} liegt dir nicht`, `${worst.count} Trades, ${fmtPct(worst.winRate, 0)} Trefferquote. Streiche es von der Watchlist oder handle es kleiner.`, fmtMoneySigned(worst.pnl, currency), worst.pnl * 0.8);
  }

  // 16) Stimmung vor der Session
  const dayTotals = stats.dayPnls;
  const moodGroups = {};
  Object.entries(dayTotals).forEach(([date, pnl]) => { const m = mindset?.[date]?.pre; if (m?.done && m.mood) (moodGroups[m.mood] = moodGroups[m.mood] || []).push(pnl); });
  const moodRows = Object.entries(moodGroups).filter(([, l]) => l.length >= 2).map(([k, l]) => ({ k, avg: mean(l), n: l.length }));
  if (moodRows.length >= 2) {
    const worst = [...moodRows].sort((a, b) => a.avg - b.avg)[0];
    const mood = PRE_MOODS.find(m => m.key === worst.k);
    if (worst.avg < 0) push('bad', 'Brain', `An "${mood?.label}"-Tagen verlierst du`, `${mood?.emoji} ${worst.n} Tage mit Ø ${fmtMoney(worst.avg, currency)}. Wenn du dich so fühlst: nur halbe Positionsgröße.`, fmtMoneySigned(worst.avg * worst.n, currency), worst.avg * worst.n);
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/* Trader-Score: 6 Dimensionen, je 0–100 */
function computeTraderScore(trades, stats) {
  if (!trades.length) return null;
  const onPlanPct = (trades.filter(t => t.onPlan !== false).length / trades.length) * 100;
  const pf = stats.profitFactor === Infinity ? 3 : stats.profitFactor;
  const greenDayPct = stats.tradingDays ? (stats.greenDays / stats.tradingDays) * 100 : 0;
  const recovery = stats.recoveryFactor == null ? (stats.totalPnL > 0 ? 3 : 0) : stats.recoveryFactor;
  const ddPenalty = clamp(Math.abs(stats.maxDrawdownPct) * 3, 0, 60);
  const axes = [
    { key: 'win', label: 'Trefferquote', value: clamp((stats.winRate / 65) * 100, 0, 100) },
    { key: 'pf', label: 'Profitfaktor', value: clamp((pf / 2.5) * 100, 0, 100) },
    { key: 'risk', label: 'Risikomanagement', short: 'Risiko', value: clamp(stats.slUsage * 0.7 + (60 - ddPenalty) * 0.5, 0, 100) },
    { key: 'disc', label: 'Disziplin', value: clamp(onPlanPct, 0, 100) },
    { key: 'cons', label: 'Konstanz', value: clamp((greenDayPct / 70) * 100, 0, 100) },
    { key: 'rec', label: 'Erholung', value: clamp((recovery / 3) * 100, 0, 100) }
  ];
  const total = Math.round(mean(axes.map(a => a.value)));
  const grade = total >= 85 ? 'Elite' : total >= 70 ? 'Profi' : total >= 55 ? 'Fortgeschritten' : total >= 40 ? 'Auf dem Weg' : 'Einsteiger';
  return { axes, total, grade };
}

function journalStreak(mindset) {
  let streak = 0;
  let d = todayISO();
  const done = (iso) => mindset?.[iso]?.pre?.done || mindset?.[iso]?.post?.done;
  if (!done(d)) d = addDaysISO(d, -1);
  while (done(d)) { streak++; d = addDaysISO(d, -1); }
  return streak;
}
