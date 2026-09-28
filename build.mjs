// Baut index.html (eine Datei, offline-fähig) + Service Worker + Vendor-Dateien.
// Aufruf: npm run build
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(p, 'utf8');
const list = (dir) => readdirSync(join(root, dir)).filter(f => /\.(js|jsx)$/.test(f)).sort().map(f => join(root, dir, f));

// 1) App-Quellcode: Logik + Oberfläche → ein minifiziertes Skript
const source = [...list('src/logic'), ...list('src/ui')].map(f => `/* ${f.slice(root.length + 1)} */\n${read(f)}`).join('\n\n');
const app = await esbuild.transform(source, {
  loader: 'jsx', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment',
  format: 'iife', minify: true, target: 'es2019', charset: 'utf8', legalComments: 'none'
});

// 2) React inline (App startet ohne Netz – auch als lokale Datei)
const inline = (code) => `<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`;
const react = read(join(root, 'node_modules/react/umd/react.production.min.js'));
const reactDom = read(join(root, 'node_modules/react-dom/umd/react-dom.production.min.js'));

let html = read(join(root, 'src/template.html'))
  .replace('<!--VENDOR-->', () => inline(react) + '\n' + inline(reactDom))
  .replace('<!--APP-->', () => inline(app.code));

const version = createHash('sha256').update(html).digest('hex').slice(0, 10);
html = html.replace('__BUILD_VERSION__', version);
writeFileSync(join(root, 'index.html'), html);

// 3) Selten gebrauchte Bibliotheken als eigene Dateien (werden bei Bedarf geladen)
mkdirSync(join(root, 'vendor'), { recursive: true });
copyFileSync(join(root, 'node_modules/xlsx/dist/xlsx.full.min.js'), join(root, 'vendor/xlsx.full.min.js'));
await esbuild.build({
  stdin: { contents: "import Anthropic from '@anthropic-ai/sdk';\nwindow.AnthropicSDK = { Anthropic };", resolveDir: root, loader: 'js' },
  bundle: true, format: 'iife', platform: 'browser', minify: true, target: 'es2020',
  outfile: join(root, 'vendor/anthropic-sdk.js'), legalComments: 'none', logLevel: 'warning'
});

// 4) Service Worker mit Versions-Stempel
writeFileSync(join(root, 'sw.js'), read(join(root, 'src/sw.template.js')).replace('__BUILD_VERSION__', version));

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`index.html ${kb(Buffer.byteLength(html))} · Version ${version}`);
