/* ---------------------------------------------------------------------- */
/* Kontraktgröße (Multiplikator)                                           */
/* Optionen, Futures und Forex haben einen Punktwert – ohne ihn wären      */
/* Gewinn, Risiko und R-Multiple falsch.                                   */
/* ---------------------------------------------------------------------- */

const MULTIPLIER_PRESETS = [
  { label: 'Aktien, ETFs, Krypto', value: 1 },
  { label: 'US-Optionen (100)', value: 100 },
  { label: 'ES – S&P 500 E-mini (50)', value: 50 },
  { label: 'MES – Micro S&P (5)', value: 5 },
  { label: 'NQ – Nasdaq E-mini (20)', value: 20 },
  { label: 'MNQ – Micro Nasdaq (2)', value: 2 },
  { label: 'YM – Dow E-mini (5)', value: 5 },
  { label: 'FDAX – DAX-Future (25)', value: 25 },
  { label: 'FDXM – Mini-DAX (5)', value: 5 },
  { label: 'FDXS – Micro-DAX (1)', value: 1 },
  { label: 'CL – Rohöl (1.000)', value: 1000 },
  { label: 'GC – Gold (100)', value: 100 },
  { label: 'Forex Standard-Lot (100.000)', value: 100000 },
  { label: 'Forex Mini-Lot (10.000)', value: 10000 }
];

function tradeMultiplier(t) {
  const m = Number(t && t.multiplier);
  return m > 0 ? m : 1;
}

/* ---------------------------------------------------------------------- */
/* Offene Positionen, Teilverkäufe und Nachkäufe                           */
/* Ein Trade kann aus mehreren Ausführungen ("legs") bestehen:             */
/*   { side: 'in' | 'out', price, qty, date, time }                         */
/* Einstieg/Ausstieg/Menge werden daraus als Durchschnitt berechnet.       */
/* ---------------------------------------------------------------------- */

function legTs(l) { return `${l.date || ''} ${l.time || ''}`; }

function aggregateLegs(legs) {
  const clean = (legs || [])
    .map(l => ({ ...l, price: Number(l.price), qty: Math.abs(Number(l.qty)) }))
    .filter(l => l.price > 0 && l.qty > 0)
    .sort((a, b) => legTs(a).localeCompare(legTs(b)));
  const ins = clean.filter(l => l.side !== 'out');
  const outs = clean.filter(l => l.side === 'out');
  const qIn = ins.reduce((s, l) => s + l.qty, 0);
  const qOut = outs.reduce((s, l) => s + l.qty, 0);
  const avg = (list, q) => q > 0 ? list.reduce((s, l) => s + l.price * l.qty, 0) / q : null;
  const firstIn = ins[0] || {};
  const lastOut = outs[outs.length - 1] || {};
  return {
    entryPrice: avg(ins, qIn),
    quantity: qIn,
    exitPrice: avg(outs, qOut),
    exitQuantity: Math.min(qOut, qIn),
    date: firstIn.date || '',
    time: firstIn.time || '',
    exitDate: lastOut.date || '',
    exitTime: lastOut.time || ''
  };
}

/* Übernimmt die Durchschnittswerte aus den Ausführungen in den Trade */
function applyLegs(t) {
  if (!Array.isArray(t.legs) || t.legs.length === 0) return t;
  const a = aggregateLegs(t.legs);
  return {
    ...t,
    entryPrice: a.entryPrice ?? t.entryPrice,
    quantity: a.quantity || t.quantity,
    exitPrice: a.exitPrice,
    exitQuantity: a.exitQuantity,
    date: a.date || t.date,
    time: a.time || t.time || '',
    exitDate: a.exitDate && a.exitDate !== (a.date || t.date) ? a.exitDate : '',
    exitTime: a.exitTime || ''
  };
}

function hasExit(t) {
  return t.exitPrice !== null && t.exitPrice !== undefined && t.exitPrice !== '' && Number.isFinite(Number(t.exitPrice));
}

function closedQty(t) {
  if (!hasExit(t)) return 0;
  const q = Number(t.quantity) || 0;
  if (t.exitQuantity === null || t.exitQuantity === undefined || t.exitQuantity === '') return q;
  return Math.max(0, Math.min(q, Number(t.exitQuantity) || 0));
}

function openQty(t) { return Math.max(0, (Number(t.quantity) || 0) - closedQty(t)); }
function isOpen(t) { return openQty(t) > 1e-9; }
function isRealized(t) { return closedQty(t) > 1e-9; }

/* Offenes Risiko einer Position bis zum Stop (in Kontowährung) */
function openRisk(t) {
  if (!t.stopLoss) return null;
  const per = t.direction === 'long' ? t.entryPrice - t.stopLoss : t.stopLoss - t.entryPrice;
  return Math.max(0, per) * openQty(t) * tradeMultiplier(t);
}

/* ---------------------------------------------------------------------- */
/* Ausführungen (Kauf/Verkauf je Zeile) → Trades per FIFO                  */
/* ---------------------------------------------------------------------- */

function normalizeSide(v, qty) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['sell', 's', 'sld', 'verkauf', 'v', 'short', 'sale', 'sell to open', 'sell to close', 'ask'].includes(s)) return 'sell';
  if (['buy', 'b', 'bot', 'kauf', 'k', 'long', 'buy to open', 'buy to close', 'bid'].includes(s)) return 'buy';
  if (s.includes('verkauf') || s.includes('sell')) return 'sell';
  if (s.includes('kauf') || s.includes('buy')) return 'buy';
  return Number(qty) < 0 ? 'sell' : 'buy';
}

function buildTradesFromExecutions(execs, { accountId, multiplier = 1 } = {}) {
  const sorted = execs
    .map((e, i) => ({ ...e, _i: i }))
    .filter(e => e.symbol && e.price > 0 && Math.abs(e.qty) > 0 && e.date)
    .sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`) || a._i - b._i);
  const positions = {};
  const trades = [];
  let seq = 0;
  const finalize = (p) => {
    trades.push(applyLegs(normalizeTrade({
      id: uid(), accountId, symbol: p.symbol, direction: p.direction, legs: p.legs, fees: Math.round(p.fees * 100) / 100,
      multiplier, createdAt: Date.now() + (seq++), entryPrice: p.legs[0].price, quantity: p.qty, exitPrice: null
    }, accountId)));
  };
  sorted.forEach(e => {
    const sym = String(e.symbol).trim().toUpperCase();
    const side = e.side || normalizeSide(null, e.qty);
    let qty = Math.abs(e.qty);
    const fee = Math.abs(Number(e.fee) || 0);
    let p = positions[sym];
    if (!p) {
      positions[sym] = { symbol: sym, direction: side === 'buy' ? 'long' : 'short', legs: [{ side: 'in', price: e.price, qty, date: e.date, time: e.time || '' }], qty, fees: fee };
      return;
    }
    const adds = (p.direction === 'long' && side === 'buy') || (p.direction === 'short' && side === 'sell');
    if (adds) {
      p.legs.push({ side: 'in', price: e.price, qty, date: e.date, time: e.time || '' });
      p.qty += qty; p.fees += fee;
      return;
    }
    const closeQty = Math.min(qty, p.qty);
    p.legs.push({ side: 'out', price: e.price, qty: closeQty, date: e.date, time: e.time || '' });
    p.qty -= closeQty;
    p.fees += fee * (closeQty / qty);
    qty -= closeQty;
    if (p.qty <= 1e-9) {
      p.qty = p.legs.filter(l => l.side === 'in').reduce((s, l) => s + l.qty, 0);
      finalize(p);
      delete positions[sym];
      if (qty > 1e-9) positions[sym] = { symbol: sym, direction: side === 'buy' ? 'long' : 'short', legs: [{ side: 'in', price: e.price, qty, date: e.date, time: e.time || '' }], qty, fees: fee * (qty / Math.abs(e.qty)) };
    }
  });
  // übrig gebliebene = offene (ggf. teilweise geschlossene) Positionen
  Object.values(positions).forEach(p => {
    p.qty = p.legs.filter(l => l.side === 'in').reduce((s, l) => s + l.qty, 0);
    finalize(p);
  });
  return trades;
}

/* Vorlagen für Broker-Exporte (Ausführungen). Spaltennamen werden         */
/* anhand der Kopfzeile erkannt – die Zuordnung ist danach editierbar.    */
const EXEC_FIELDS = [
  { key: 'date', label: 'Datum', required: true },
  { key: 'time', label: 'Uhrzeit', required: false },
  { key: 'symbol', label: 'Symbol / Wertpapier', required: true },
  { key: 'side', label: 'Kauf/Verkauf', required: false },
  { key: 'qty', label: 'Menge (± erlaubt)', required: true },
  { key: 'price', label: 'Kurs', required: true },
  { key: 'fee', label: 'Gebühren', required: false }
];

const BROKER_PRESETS = [
  {
    id: 'ibkr', name: 'Interactive Brokers (Activity/Flex – Trades)', detect: ['t. price', 'comm/fee', 'date/time'],
    map: { date: ['date/time', 'tradedate', 'date'], time: ['date/time'], symbol: ['symbol'], side: ['buy/sell'], qty: ['quantity'], price: ['t. price', 'tradeprice', 'price'], fee: ['comm/fee', 'ibcommission', 'commission'] }
  },
  {
    id: 'binance', name: 'Binance (Spot-Tradeverlauf)', detect: ['date(utc)', 'pair', 'executed'],
    map: { date: ['date(utc)'], time: ['date(utc)'], symbol: ['pair', 'market'], side: ['side', 'type'], qty: ['executed', 'amount'], price: ['price'], fee: ['fee'] }
  },
  {
    id: 'scalable', name: 'Scalable Capital (CSV-Export)', detect: ['isin', 'shares', 'assettype'],
    map: { date: ['date'], time: ['time'], symbol: ['description', 'isin'], side: ['type'], qty: ['shares'], price: ['price'], fee: ['fee'] }
  },
  {
    id: 'traderepublic', name: 'Trade Republic / deutsche Depotauszüge', detect: ['wertpapier', 'stück'],
    map: { date: ['datum'], time: ['uhrzeit', 'zeit'], symbol: ['wertpapier', 'name', 'isin'], side: ['typ', 'transaktion', 'art'], qty: ['stück', 'anzahl', 'menge'], price: ['kurs', 'preis'], fee: ['gebühr', 'gebuehr', 'fremdkosten'] }
  },
  {
    id: 'generic', name: 'Allgemein (Kauf/Verkauf-Liste)', detect: [],
    map: { date: ['datum', 'date'], time: ['uhrzeit', 'zeit', 'time'], symbol: ['symbol', 'ticker', 'wertpapier', 'instrument', 'pair'], side: ['richtung', 'side', 'typ', 'type', 'kauf/verkauf', 'buy/sell'], qty: ['menge', 'stück', 'quantity', 'qty', 'shares', 'amount', 'anzahl'], price: ['kurs', 'price', 'preis'], fee: ['gebühr', 'fee', 'commission', 'kosten'] }
  }
];

function detectBrokerPreset(headers) {
  const lower = headers.map(h => String(h || '').toLowerCase());
  const scored = BROKER_PRESETS.filter(p => p.detect.length).map(p => ({ p, score: p.detect.filter(d => lower.some(h => h.includes(d))).length }));
  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 2 ? best.p : BROKER_PRESETS.find(p => p.id === 'generic');
}

function mapExecHeaders(headers, preset) {
  const lower = headers.map(h => String(h || '').toLowerCase().trim());
  const mapping = {};
  EXEC_FIELDS.forEach(({ key }) => {
    const keys = preset.map[key] || [];
    let idx = -1;
    for (const k of keys) { idx = lower.findIndex(h => h === k); if (idx >= 0) break; }
    if (idx < 0) for (const k of keys) { idx = lower.findIndex(h => h.includes(k)); if (idx >= 0) break; }
    mapping[key] = idx;
  });
  return mapping;
}

function buildExecsFromRows(rows, mapping) {
  const execs = [], errors = [];
  rows.forEach((row, i) => {
    const get = (f) => { const idx = mapping[f]; return idx != null && idx >= 0 ? row[idx] : undefined; };
    const rawQty = parseImportNumber(get('qty'));
    const price = parseImportNumber(get('price'));
    const date = parseImportDate(get('date'));
    const symbol = get('symbol');
    if (!symbol || !date || rawQty == null || price == null || rawQty === 0) {
      errors.push(`Zeile ${i + 2}: unvollständig oder keine Ausführung – übersprungen.`);
      return;
    }
    const side = mapping.side >= 0 ? normalizeSide(get('side'), rawQty) : (rawQty < 0 ? 'sell' : 'buy');
    execs.push({ date, time: parseImportTime(get('time') ?? get('date')), symbol: String(symbol).trim(), side, qty: Math.abs(rawQty), price, fee: parseImportNumber(get('fee')) || 0 });
  });
  return { execs, errors };
}

/* ---------------------------------------------------------------------- */
/* Kontowährungen                                                          */
/* fx: { '$': 0.92 } heißt: 1 $ = 0,92 Einheiten der Basiswährung          */
/* ---------------------------------------------------------------------- */

function accountCurrency(acc, base) { return (acc && acc.currency) || base; }

function fxRate(currency, base, fx) {
  if (!currency || currency === base) return 1;
  const r = Number(fx && fx[currency]);
  return r > 0 ? r : 1;
}

/* Rechnet Trades in die Basiswährung um. Preise bleiben gleich (R-Multiple  */
/* ändert sich nicht) – nur Multiplikator und Gebühren werden skaliert.      */
function convertTradesToBase(trades, accountsById, base, fx) {
  return trades.map(t => {
    const rate = fxRate(accountCurrency(accountsById[t.accountId], base), base, fx);
    if (rate === 1) return t;
    return { ...t, multiplier: tradeMultiplier(t) * rate, fees: (Number(t.fees) || 0) * rate };
  });
}

function hasMixedCurrencies(accounts, base) {
  return accounts.some(a => accountCurrency(a, base) !== base);
}

/* ---------------------------------------------------------------------- */
/* Tageslimits (Verlust / Anzahl Trades)                                   */
/* ---------------------------------------------------------------------- */

function dailyLimitStatus(trades, plan, dateISO, accountId) {
  const list = trades.filter(t => t.date === dateISO && (!accountId || t.accountId === accountId));
  const loss = Math.abs(list.filter(isRealized).reduce((s, t) => s + Math.min(0, calcPnL(t)), 0));
  const lossHit = plan.maxDailyDrawdown > 0 && loss >= plan.maxDailyDrawdown;
  const countHit = plan.maxTradesPerDay > 0 && list.length >= plan.maxTradesPerDay;
  return { loss, count: list.length, lossHit, countHit, locked: !!plan.hardLock && (lossHit || countHit) };
}
