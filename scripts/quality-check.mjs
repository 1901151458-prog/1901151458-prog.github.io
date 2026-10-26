import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const pages = [
  ['home', 'https://1901151458-prog.github.io/'],
  ['english', 'https://1901151458-prog.github.io/english-materials/'],
  ['sishu', 'https://1901151458-prog.github.io/sishu/'],
  ['vocab', 'https://1901151458-prog.github.io/english-vocab-test/'],
  ['cefr', 'https://1901151458-prog.github.io/cefr-vocab-test/'],
  ['udhr', 'https://1901151458-prog.github.io/UDHR/udhr/']
];

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
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/screens/${name}.png`, fullPage: false });

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    if (serious.length) {
      failures.push(`${name}: ${serious.length} serious/critical axe violations`);
      for (const v of serious) console.log(`[axe:${name}] ${v.id} ${v.help} (${v.nodes.length})`);
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
