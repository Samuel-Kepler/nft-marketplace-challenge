// Calcula medianas das medições Lighthouse (docs/lighthouse/<perfil>/*.report.json).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const rows = []; let env = '';
for (const profile of ['mobile', 'desktop']) {
  const dir = new URL(`./${profile}/`, import.meta.url);
  const byPage = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.report.json'))) {
    const r = JSON.parse(readFileSync(new URL(f, dir)));
    const page = new URL(r.finalDisplayedUrl).pathname;
    (byPage[page] ??= []).push(r);
    env = `Lighthouse ${r.lighthouseVersion}; ${r.environment.hostUserAgent}; ${r.configSettings.throttlingMethod} throttling`;
  }
  for (const [page, rs] of Object.entries(byPage)) {
    const c = (k) => Math.round(med(rs.map((r) => r.categories[k].score)) * 100);
    const a = (k) => med(rs.map((r) => r.audits[k].numericValue));
    rows.push(`| ${profile} | ${page} | ${rs.length} | ${c('performance')} | ${c('accessibility')} | ${c('best-practices')} | ${c('seo')} | ${(a('largest-contentful-paint')/1000).toFixed(2)}s | ${a('cumulative-layout-shift').toFixed(3)} | ${Math.round(a('total-blocking-time'))}ms |`);
  }
}
const out = `| Perfil | Página | Runs | Perf | A11y | BP | SEO | LCP | CLS | TBT |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|\n${rows.join('\n')}\n\n${env}\n`;
writeFileSync(new URL('./SUMMARY.md', import.meta.url), out); console.log(out);
