import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const pages = [
  ['home', 'https://1901151458-prog.github.io/'],
  ['english', 'https://1901151458-prog.github.io/english-materials/'],
  ['sishu', 'https://1901151458-prog.github.io/sishu/'],
  ['vocab', 'https://1901151458-prog.github.io/english-vocab-test/'],
  ['cefr', 'https://1901151458-prog.github.io/cefr-vocab-test/'],
  ['udhr', 'https://1901151458-prog.github.io/UDHR/udhr/'],
  ['english-search', 'https://1901151458-prog.github.io/english-materials/search.html'],
  ['sdg-goal', 'https://1901151458-prog.github.io/english-materials/sdgs/reading/goal-1.html'],
  ['sishu-jinsilu', 'https://1901151458-prog.github.io/sishu/jinsilu/'],
  ['sishu-chuanxilu', 'https://1901151458-prog.github.io/sishu/chuanxilu/full.html'],
  ['udhr-full', 'https://1901151458-prog.github.io/UDHR/udhr/full.html'],
  ['vocab-print', 'https://1901151458-prog.github.io/english-vocab-test/print.html'],
  ['cefr-print', 'https://1901151458-prog.github.io/cefr-vocab-test/print.html'],
  ['object-clauses', 'https://1901151458-prog.github.io/english-materials/object-clauses-g9/'],
  ['it-pattern', 'https://1901151458-prog.github.io/english-materials/it-pattern-g9/'],
  ['g9-hub', 'https://1901151458-prog.github.io/english-materials/g9/'],
  ['g9-unit1', 'https://1901151458-prog.github.io/english-materials/g9/unit1-reading/'],
  ['g9-unit2', 'https://1901151458-prog.github.io/english-materials/g9/unit2-reading/'],
  ['g9-unit3', 'https://1901151458-prog.github.io/english-materials/g9/unit3-reading/'],
  ['g9-unit4', 'https://1901151458-prog.github.io/english-materials/g9/unit4-reading/'],
  ['g9-unit5', 'https://1901151458-prog.github.io/english-materials/g9/unit5-reading/'],
  ['g9-unit6', 'https://1901151458-prog.github.io/english-materials/g9/unit6-reading/'],
  ['g9-unit7', 'https://1901151458-prog.github.io/english-materials/g9/unit7-reading/'],
  ['g9-unit8', 'https://1901151458-prog.github.io/english-materials/g9/unit8-reading/'],
  ['g8b-hub', 'https://1901151458-prog.github.io/english-materials/g8b/'],
  ['g8b-unit1', 'https://1901151458-prog.github.io/english-materials/g8b/unit1-reading/'],
  ['g8b-unit2', 'https://1901151458-prog.github.io/english-materials/g8b/unit2-reading/'],
  ['g8b-unit3', 'https://1901151458-prog.github.io/english-materials/g8b/unit3-reading/'],
  ['g8b-unit4', 'https://1901151458-prog.github.io/english-materials/g8b/unit4-reading/'],
  ['g8b-unit5', 'https://1901151458-prog.github.io/english-materials/g8b/unit5-reading/'],
  ['g8b-unit6', 'https://1901151458-prog.github.io/english-materials/g8b/unit6-reading/'],
  ['g8b-unit7', 'https://1901151458-prog.github.io/english-materials/g8b/unit7-reading/'],
  ['g8b-unit8', 'https://1901151458-prog.github.io/english-materials/g8b/unit8-reading/']
];

async function gotoWithRetry(page, url, errors) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    errors.length = 0;
    try {
      const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
      if (res && res.status() < 500) {
        if (res.status() !== 200) throw new Error('HTTP ' + res.status());
        return res;
      }
      last = new Error('HTTP ' + (res ? res.status() : 'no response'));
    } catch (e) {
      last = e;
    }
    await page.waitForTimeout(1200 * (attempt + 1));
  }
  throw last;
}

fs.mkdirSync('artifacts/screens', { recursive: true });
const browser = await chromium.launch();
const failures = [];

for (const [name, url] of pages) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  try {
    await gotoWithRetry(page, url, errors);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/screens/${name}.png`, fullPage: false });

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (serious.length) {
      failures.push(`${name}: ${serious.length} serious/critical axe violations`);
      for (const v of serious) {
        console.log(`[axe:${name}] ${v.id} ${v.help} (${v.nodes.length})`);
        for (const n of v.nodes.slice(0, 8)) console.log(`  target: ${n.target.join(' ')}`);
      }
      fs.writeFileSync(`artifacts/axe-${name}.json`, JSON.stringify(axe, null, 2));
    }
    if (errors.length) {
      failures.push(`${name}: ${errors.length} console/page errors`);
      for (const e of errors.slice(0, 8)) console.log(`[js:${name}] ${e}`);
    }
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
  } finally {
    await page.close();
    await context.close();
  }
}

await browser.close();
if (failures.length) {
  console.log('[quality] FAIL');
  for (const f of failures) console.log(' - ' + f);
  process.exit(1);
}
console.log('[quality] OK');
