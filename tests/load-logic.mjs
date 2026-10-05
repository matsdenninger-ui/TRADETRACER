// Lädt die reine App-Logik (src/logic/*.js) für Tests in einen isolierten Kontext.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../src/logic');
const source = readdirSync(dir).filter(f => f.endsWith('.js')).sort().map(f => readFileSync(join(dir, f), 'utf8')).join('\n');

const EXPORTS = [
  'calcPnL', 'calcRisk', 'calcRMultiple', 'computeStats', 'normalizeTrade', 'holdingMinutes',
  'tradeMultiplier', 'aggregateLegs', 'applyLegs', 'closedQty', 'openQty', 'isOpen', 'isRealized',
  'buildTradesFromExecutions', 'normalizeSide', 'detectBrokerPreset', 'mapExecHeaders', 'buildExecsFromRows',
  'convertTradesToBase', 'fxRate', 'dailyLimitStatus',
  'mergeSnapshots', 'mergeRecords', 'mergeStampedMaps',
  'deriveSyncKey', 'exportSyncKey', 'importSyncKey', 'encryptText', 'decryptText', 'sealPayload', 'openPayload', 'newSalt', 'isSealed',
  'parseImportNumber', 'parseImportDate', 'parseImportTime', 'guessImportMapping', 'buildTradesFromImportRows',
  'parseMt5Report', 'reportFromShotRows', 'tradeFingerprint', 'suggestMultiplier', 'sameInstrument', 'multiplierFromResult', 'computeInsights', 'computeTraderScore', 'buildReviewPrompt', 'setPrivacy', 'fmtMoney'
];

export function loadLogic() {
  const store = new Map();
  const ctx = vm.createContext({
    console, crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa, atob, Date, Math, JSON,
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    fetch: () => { throw new Error('fetch in Tests nicht verfügbar'); }
  });
  vm.runInContext(`${source}\n;globalThis.__exports = { ${EXPORTS.join(', ')} };`, ctx, { filename: 'logic.js' });
  return ctx.__exports;
}
