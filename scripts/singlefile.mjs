// Inlines the Vite build (JS + CSS) into one self-contained HTML file that runs
// by double-clicking it — no server, no install. Output: release/Windward.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const read = (href) => readFileSync(join(dist, href.replace(/^\.?\//, '')), 'utf8');

html = html.replace(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_, href) => `<style>${read(href)}</style>`);
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<script[^>]*type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_, src) =>
  `<script type="module">${read(src).replace(/<\/script/gi, '<\\/script')}</script>`);

if (/(src|href)="\.?\/assets\//.test(html)) throw new Error('some assets were not inlined');
mkdirSync('release', { recursive: true });
writeFileSync('release/Windward.html', html);
console.log(`release/Windward.html  ${(html.length / 1024).toFixed(0)} kB`);
