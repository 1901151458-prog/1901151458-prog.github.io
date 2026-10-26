import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const BASE = 'https://1901151458-prog.github.io';
const pages = [
  ['home', '/'],
  ['english', '/english-materials/'],
  ['sishu', '/sishu/'],
  ['vocab', '/english-vocab-test/'],
  ['cefr', '/cefr-vocab-test/'],
  ['udhr', '/UDHR/udhr/']
];
const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};
const baselineDir = 'visual-baseline';
const outDir = 'artifacts/visual';
fs.mkdirSync(baselineDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const failures = [];
let created = 0, compared = 0;

for (const [name, urlPath] of pages) {
  for (const [vpName, viewport] of Object.entries(viewports)) {
    const shot = `${name}-${vpName}.png`;
    const baseline = path.join(baselineDir, shot);
    const current = path.join(outDir, shot);
    const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
    try {
      await page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' +
          'canvas,#bg,.particle-stage{display:none!important}' +
          '#daysNum,#timer,#stageTimer,#outTimer2{visibility:hidden!important}' +
          'html{scroll-behavior:auto!important}'
      });
      await page.waitForTimeout(1400);
      await page.screenshot({ path: current, fullPage: false });
      if (!fs.existsSync(baseline)) {
        fs.copyFileSync(current, baseline);
        created++;
        continue;
      }
      const a = PNG.sync.read(fs.readFileSync(baseline));
      const b = PNG.sync.read(fs.readFileSync(current));
      if (a.width !== b.width || a.height !== b.height) {
        failures.push(`${shot}: size ${a.width}x${a.height} -> ${b.width}x${b.height}`);
        continue;
      }
      const diff = new PNG({ width: a.width, height: a.height });
      const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.12 });
      const ratio = changed / (a.width * a.height);
      fs.writeFileSync(path.join(outDir, `${name}-${vpName}.diff.png`), PNG.sync.write(diff));
      compared++;
      if (ratio > 0.005) {
        failures.push(`${shot}: ${(ratio * 100).toFixed(2)}% pixels differ`);
      }
    } catch (e) {
      failures.push(`${shot}: ${e.message}`);
    } finally {
      await page.close();
    }
  }
}
await browser.close();
console.log(`[visual] created=${created} compared=${compared} failed=${failures.length}`);
for (const f of failures) console.log(' - ' + f);
if (failures.length) process.exit(1);
