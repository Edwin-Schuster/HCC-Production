// Builds a single self-contained HTML file of the app in demo mode (data stored in the browser).
// Usage: node scripts/build-demo.mjs [outfile]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'dist', 'hcc-production-demo.html');
const read = (p) => fs.readFileSync(path.join(root, 'public', p), 'utf8');
const scripts = ['shared.js', 'js/core.js', 'js/views-sops.js', 'js/views-projects.js', 'js/views-other.js', 'js/main.js'].map(read).join('\n;\n');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
const dataUri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(root, 'public', 'brand', f)).toString('base64')}`;
const assets = { 'hcc-mark.png': dataUri('hcc-mark.png'), 'hcc-logo.png': dataUri('hcc-logo.png') };

const html = `<title>HCC Production</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400..600&family=JetBrains+Mono:wght@400&display=swap">
<style>
${read('app.css').replace(/url\("fonts\/[^"]+"\) format\("[^"]+"\), /g, '')}
</style>
<div id="app"><div class="empty"><p class="muted">Loading HCC Production…</p></div></div>
<div id="modals"></div>
<div id="toasts" aria-live="polite"></div>
<script>window.HCC_DEMO = true; window.HCC_ASSETS = ${JSON.stringify(assets)};</script>
<script>
${safe(scripts)}
</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`Wrote ${out} (${(html.length / 1024).toFixed(0)} KB)`);
