import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadLogic } from './load-logic.mjs';

const L = loadLogic();
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const T = (o) => L.normalizeTrade({ id: o.id || 'x', date: '2026-09-01', symbol: 'AAPL', direction: 'long', entryPrice: 100, exitPrice: 110, quantity: 10, fees: 0, ...o });

test('PnL long/short inkl. Gebühren', () => {
  near(L.calcPnL(T({})), 100);
  near(L.calcPnL(T({ direction: 'short', entryPrice: 110, exitPrice: 100, fees: 5 })), 95);
  near(L.calcPnL(T({ exitPrice: 95 })), -50);
});

test('Multiplikator: Optionen und Futures', () => {
  near(L.calcPnL(T({ entryPrice: 2.5, exitPrice: 3.1, quantity: 2, multiplier: 100 })), 120);
  // ES-Future: 4 Punkte × 50 $ × 1 Kontrakt
  const es = T({ symbol: 'ES', entryPrice: 5000, exitPrice: 5004, quantity: 1, multiplier: 50, stopLoss: 4998 });
  near(L.calcPnL(es), 200);
  near(L.calcRisk(es), 100);
  near(L.calcRMultiple(es), 2);
  assert.equal(L.tradeMultiplier({}), 1);
});

test('R-Multiple und Risiko', () => {
  const t = T({ stopLoss: 95 });
  near(L.calcRisk(t), 50);
  near(L.calcRMultiple(t), 2);
  assert.equal(L.calcRMultiple(T({ stopLoss: 105 })), null); // Stop auf falscher Seite
});

test('Teilverkäufe: Durchschnittspreise und realisierter Gewinn', () => {
  const t = L.applyLegs(T({ legs: [
    { side: 'in', price: 100, qty: 10, date: '2026-09-01', time: '09:30' },
    { side: 'in', price: 110, qty: 10, date: '2026-09-01', time: '10:00' },
    { side: 'out', price: 120, qty: 5, date: '2026-09-02', time: '11:00' }
  ] }));
  near(t.entryPrice, 105);
  assert.equal(t.quantity, 20);
  assert.equal(L.closedQty(t), 5);
  assert.equal(L.openQty(t), 15);
  assert.ok(L.isOpen(t) && L.isRealized(t));
  near(L.calcPnL(t), 75); // (120-105) × 5
  assert.equal(t.exitDate, '2026-09-02');
});

test('Offene Position ohne Ausstieg zählt nicht in die Statistik', () => {
  const open = T({ id: 'o', exitPrice: null });
  assert.ok(L.isOpen(open));
  assert.ok(!L.isRealized(open));
  near(L.calcPnL(open), 0);
  const s = L.computeStats([T({ id: 'a' }), open], 1000);
  assert.equal(s.totalTrades, 1);
  near(s.totalPnL, 100);
});

test('Ausführungen per FIFO zu Trades zusammenfassen', () => {
  const trades = L.buildTradesFromExecutions([
    { date: '2026-09-01', time: '09:30', symbol: 'aapl', side: 'buy', qty: 10, price: 100, fee: 1 },
    { date: '2026-09-01', time: '10:00', symbol: 'AAPL', side: 'buy', qty: 10, price: 102, fee: 1 },
    { date: '2026-09-01', time: '11:00', symbol: 'AAPL', side: 'sell', qty: 20, price: 105, fee: 2 },
    { date: '2026-09-02', time: '09:00', symbol: 'TSLA', side: 'sell', qty: 5, price: 200, fee: 0 },
    { date: '2026-09-02', time: '12:00', symbol: 'TSLA', side: 'buy', qty: 5, price: 190, fee: 0 },
    { date: '2026-09-03', time: '09:00', symbol: 'NVDA', side: 'buy', qty: 3, price: 50, fee: 0 }
  ], { accountId: 'acc' });
  assert.equal(trades.length, 3);
  const aapl = trades.find(t => t.symbol === 'AAPL');
  near(aapl.entryPrice, 101);
  near(aapl.exitPrice, 105);
  near(L.calcPnL(aapl), 80 - 4);
  const tsla = trades.find(t => t.symbol === 'TSLA');
  assert.equal(tsla.direction, 'short');
  near(L.calcPnL(tsla), 50);
  const nvda = trades.find(t => t.symbol === 'NVDA');
  assert.ok(L.isOpen(nvda) && !L.isRealized(nvda));
});

test('Positionsumkehr: Verkauf größer als Bestand eröffnet Short', () => {
  const trades = L.buildTradesFromExecutions([
    { date: '2026-09-01', symbol: 'X', side: 'buy', qty: 5, price: 10 },
    { date: '2026-09-01', time: '10:00', symbol: 'X', side: 'sell', qty: 8, price: 12 }
  ], { accountId: 'a' });
  assert.equal(trades.length, 2);
  near(L.calcPnL(trades.find(t => t.direction === 'long')), 10);
  const short = trades.find(t => t.direction === 'short');
  assert.equal(short.quantity, 3);
  assert.ok(L.isOpen(short));
});

test('Broker-Erkennung und Ausführungs-Import (IBKR-Format)', () => {
  const headers = ['Symbol', 'Date/Time', 'Quantity', 'T. Price', 'Comm/Fee'];
  const preset = L.detectBrokerPreset(headers);
  assert.equal(preset.id, 'ibkr');
  const map = L.mapExecHeaders(headers, preset);
  const { execs } = L.buildExecsFromRows([['AAPL', '2026-09-01, 09:35:10', '10', '100', '-1'], ['AAPL', '2026-09-01, 10:00:00', '-10', '103', '-1']], map);
  assert.equal(execs[0].side, 'buy');
  assert.equal(execs[1].side, 'sell');
  assert.equal(execs[1].time, '10:00');
  const [t] = L.buildTradesFromExecutions(execs, { accountId: 'a' });
  near(L.calcPnL(t), 28);
});

test('Zahlen aus deutschen und englischen Formaten', () => {
  assert.equal(L.parseImportNumber('1.234,56'), 1234.56);
  assert.equal(L.parseImportNumber('1,234.56'), 1234.56);
  assert.equal(L.parseImportNumber('12,5'), 12.5);
  assert.equal(L.parseImportNumber('$ -3.10'), -3.1);
  assert.equal(L.parseImportDate('21.07.2026'), '2026-07-21');
  assert.equal(L.parseImportTime('2026-09-01, 09:35:10'), '09:35');
});

test('Währungsumrechnung verändert Gewinn, aber nicht R', () => {
  const t = T({ accountId: 'usd', stopLoss: 95, fees: 2 });
  const [c] = L.convertTradesToBase([t], { usd: { id: 'usd', currency: '$' } }, '€', { '$': 0.9 });
  near(L.calcPnL(c), (100 - 2) * 0.9);
  near(L.calcRMultiple(c), L.calcRMultiple(t));
  assert.equal(L.fxRate('€', '€', {}), 1);
});

test('Kennzahlen: Sharpe erst ab 20 Handelstagen', () => {
  const few = Array.from({ length: 5 }, (_, i) => T({ id: 'f' + i, date: `2026-09-0${i + 1}`, exitPrice: i % 2 ? 90 : 115 }));
  assert.equal(L.computeStats(few, 10000).sharpe, null);
  const many = Array.from({ length: 25 }, (_, i) => T({ id: 'm' + i, date: `2026-08-${String(i + 1).padStart(2, '0')}`, exitPrice: i % 3 ? 112 : 94 }));
  const s = L.computeStats(many, 10000);
  assert.ok(Number.isFinite(s.sharpe));
  assert.equal(s.tradingDays, 25);
});

test('Drawdown und Serien', () => {
  const s = L.computeStats([
    T({ id: 'a', exitPrice: 120 }), T({ id: 'b', exitPrice: 90, date: '2026-09-02' }),
    T({ id: 'c', exitPrice: 95, date: '2026-09-03' }), T({ id: 'd', exitPrice: 130, date: '2026-09-04' })
  ], 1000);
  near(s.maxDrawdown, -150);
  assert.equal(s.maxLossStreak, 2);
  assert.equal(s.streak, 1);
});

test('Tageslimit-Sperre', () => {
  const plan = { maxDailyDrawdown: 100, maxTradesPerDay: 5, hardLock: true };
  const st = L.dailyLimitStatus([T({ id: 'a', exitPrice: 85 })], plan, '2026-09-01');
  assert.ok(st.lossHit && st.locked);
  assert.ok(!L.dailyLimitStatus([T({ id: 'a', exitPrice: 85 })], { ...plan, hardLock: false }, '2026-09-01').locked);
});

test('Sync-Merge: neuester Stand gewinnt, Löschungen setzen sich durch', () => {
  const local = { trades: [{ id: 'a', v: 1, updatedAt: 10 }, { id: 'b', updatedAt: 5 }], accounts: [{ id: 'acc' }], mindset: {}, tombstones: { trades: { c: 20 } } };
  const remote = { trades: [{ id: 'a', v: 2, updatedAt: 30 }, { id: 'c', updatedAt: 15 }, { id: 'd', updatedAt: 1 }], accounts: [], mindset: {}, tombstones: { trades: { b: 8 } } };
  const m = L.mergeSnapshots(local, remote);
  const ids = m.trades.map(t => t.id).sort();
  assert.equal(ids.join(','), 'a,d');
  assert.equal(m.trades.find(t => t.id === 'a').v, 2);
  // Nach dem Löschen erneut bearbeitet → Trade kommt zurück
  const m2 = L.mergeSnapshots({ trades: [{ id: 'b', updatedAt: 50 }], tombstones: { trades: {} } }, remote);
  assert.ok(m2.trades.some(t => t.id === 'b'));
});

test('Sync-Merge: Bilder- und Review-Maps', () => {
  const m = L.mergeStampedMaps({ x: { gist: 'g1', _u: 5 } }, { x: { gist: 'g2', _u: 9 }, y: { gist: 'g3', _u: 1 } });
  assert.equal(m.x.gist, 'g2');
  assert.ok(m.y);
});

test('Verschlüsselung: Rundreise und falsches Passwort', async () => {
  const salt = L.newSalt();
  const key = await L.deriveSyncKey('richtig', salt, 1000);
  const sealed = await L.sealPayload({ trades: [{ id: 'a' }] }, key, salt);
  assert.ok(L.isSealed(sealed));
  assert.ok(!sealed.includes('"trades"'));
  assert.deepEqual((await L.openPayload(sealed, key)).trades, [{ id: 'a' }]);
  const wrong = await L.deriveSyncKey('falsch', salt, 1000);
  await assert.rejects(() => L.openPayload(sealed, wrong), /falsches Sync-Passwort/);
  await assert.rejects(() => L.openPayload(sealed, null), /verschlüsselt/);
  const reKey = await L.importSyncKey(await L.exportSyncKey(key));
  assert.equal((await L.openPayload(sealed, reKey)).trades.length, 1);
  assert.deepEqual(await L.openPayload('{"trades":[]}', null), { trades: [] });
});

test('Privatsphäre-Modus blendet Beträge aus', () => {
  L.setPrivacy(true);
  assert.equal(L.fmtMoney(123, '€'), '€•••••');
  L.setPrivacy(false);
  assert.equal(L.fmtMoney(-1234.5, '€'), '-€1.234,50');
});

test('KI-Prompt enthält Trades, aber keine offenen Positionen', () => {
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const { text, count } = L.buildReviewPrompt({
    trades: [T({ id: 'a', date: iso, notes: 'Zu früh rein' }), T({ id: 'b', date: iso, symbol: 'OPEN', exitPrice: null })],
    mindset: {}, plan: { maxDailyDrawdown: 100, maxTradesPerDay: 5, minRiskReward: '1:2', riskPerTrade: 1, riskRules: [], psychologyRules: [], goldenRules: [] },
    currency: '€', period: 'week', accountName: 'Test'
  });
  assert.equal(count, 1);
  assert.ok(text.includes('Zu früh rein'));
  assert.ok(!text.includes('OPEN'));
});

test('MetaTrader-5-Kontobericht: Positionen mit exaktem Broker-Ergebnis', () => {
  const aoa = [
    ['Bericht der Kontohistorie'],
    ['Name:', '', '', 'MT5'],
    ['Konto:', '', '', '123456 (EUR, Broker-Live 1, real, Hedge)'],
    ['Firma:', '', '', 'Beispiel Markets (Pty) Ltd'],
    ['Positionen'],
    ['Zeit', 'Position', 'Symbol', 'Typ', 'Volumen', 'Preis', 'S / L', 'T / P', 'Zeit', 'Preis', 'Kommission', 'Swap', 'Gewinn'],
    ['2026.03.31 12:34:14', '1001', 'XAUUSD', 'buy', '0.01', '4 556.27', '4 548.00', '4 563.00', '2026.03.31 13:10:23', '4 559.94', '0.00', '0.00', ' 3.20'],
    ['2026.03.31 14:22:04', '1002', 'XAUUSD', 'sell', '0.05', '4 572.63', '4 583.80', '', '2026.04.01 01:01:00', '4 584.81', '- 0.50', '- 3.85', '- 53.07'],
    ['2026.03.31 15:00:00', '1003', 'XAUUSD', 'buy', '0.02', '4 570.00', '', '', '2026.03.31 15:01:00', '4 570.00', '0.00', '0.00', '- 0.40'],
    ['Orders'],
    ['Eröffnungszeit', 'Auftrag', 'Symbol', 'Typ', 'Volumen', 'Preis'],
    ['2026.03.31 12:34:14', '1001', 'XAUUSD', 'buy', '0.01 / 0.01', 'market'],
    ['Trades'],
    ['Zeit', 'Trade', 'Symbol', 'Typ', 'Richtung', 'Volumen', 'Preis', 'Auftrag', 'Kommission', 'Kosten', 'Swap', 'Gewinn', 'Kontostand', 'Kommentar'],
    ['2026.03.31 09:46:43', '5', '', 'balance', '', '', '', '', '0.00', '0.00', '0.00', '1 000.00', '1 000.00', 'Deposit']
  ];
  const r = L.parseMt5Report(aoa);
  assert.equal(r.trades.length, 3);
  assert.equal(r.meta.currency, '€');
  assert.equal(r.meta.accountNo, '123456');
  assert.equal(r.meta.netDeposits, 1000);
  assert.equal(r.summary.net, -54.62);
  const [a, b, c] = r.trades;
  assert.equal(a.id, 'mt5_1001');
  assert.equal(a.date, '2026-03-31');
  assert.equal(a.time, '12:34');
  assert.equal(b.direction, 'short');
  assert.equal(b.exitDate, '2026-04-01');
  assert.ok(Math.abs(L.calcPnL(a) - 3.2) < 0.001);
  assert.ok(Math.abs(L.calcPnL(b) - (-53.07 - 0.5 - 3.85)) < 0.001);
  assert.ok(Math.abs(L.calcPnL(c) - (-0.4)) < 0.001);
  assert.equal(L.parseMt5Report([['Datum', 'Symbol'], ['2026-01-01', 'AAPL']]), null);
});

test('Punktwert: Vorschlag aus bisherigen Trades und exakt aus dem Broker-Ergebnis', () => {
  const mk = (i, m, acc = 'v') => ({ id: 'x' + i, accountId: acc, symbol: 'XAUUSD', date: `2026-09-${String(10 + i).padStart(2, '0')}`, multiplier: m });
  const trades = [mk(1, 87.9), mk(2, 88.1), mk(3, 88.4), mk(4, 100, 'other')];
  assert.equal(L.suggestMultiplier(trades, 'xauusd', 'v').value, 88.1);
  assert.equal(L.suggestMultiplier(trades, 'XAUUSD', 'neu').value, 88.4); // kein eigenes Konto → alle Konten
  assert.equal(L.suggestMultiplier(trades, 'EURUSD', 'v'), null);
  // XAUUSD buy 0.05 4184.58 → 4183.08 = −6.60 € laut Vantage
  const t = { direction: 'long', entryPrice: 4184.58, exitPrice: 4183.08, quantity: 0.05, fees: 0 };
  const r = L.multiplierFromResult(t, -6.60);
  assert.ok(Math.abs(L.calcPnL({ ...t, multiplier: r.multiplier }) - -6.60) < 1e-6);
  assert.ok(L.multiplierFromResult(t, 6.60).error);
  assert.deepEqual({ ...L.multiplierFromResult({ ...t, exitPrice: 4184.58 }, -0.4) }, { multiplier: null, fees: 0.4 });
});
