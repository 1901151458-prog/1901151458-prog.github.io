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
  ['udhr', '/UDHR/udhr/'],
  ['english-search', '/english-materials/search.html'],
  ['sdg-goal', '/english-materials/sdgs/reading/goal-1.html'],
  ['sishu-jinsilu', '/sishu/jinsilu/'],
  ['sishu-chuanxilu', '/sishu/chuanxilu/full.html'],
  ['udhr-full', '/UDHR/udhr/full.html'],
  ['vocab-print', '/english-vocab-test/print.html'],
  ['cefr-print', '/cefr-vocab-test/print.html'],
  ['object-clauses', '/english-materials/object-clauses-g9/'],
  ['it-pattern', '/english-materials/it-pattern-g9/'],
  ['g9-hub', '/english-materials/g9/'],
  ['g9-unit1', '/english-materials/g9/unit1-reading/'],
  ['g9-unit2', '/english-materials/g9/unit2-reading/'],
  ['g9-unit3', '/english-materials/g9/unit3-reading/'],
  ['g9-unit4', '/english-materials/g9/unit4-reading/'],
  ['g9-unit5', '/english-materials/g9/unit5-reading/'],
  ['g9-unit6', '/english-materials/g9/unit6-reading/'],
  ['g9-unit7', '/english-materials/g9/unit7-reading/'],
  ['g9-unit8', '/english-materials/g9/unit8-reading/'],
  ['g8b-hub', '/english-materials/g8b/'],
  ['g8b-unit1', '/english-materials/g8b/unit1-reading/'],
  ['g8b-unit2', '/english-materials/g8b/unit2-reading/'],
  ['g8b-unit3', '/english-materials/g8b/unit3-reading/'],
  ['g8b-unit4', '/english-materials/g8b/unit4-reading/'],
  ['g8b-unit5', '/english-materials/g8b/unit5-reading/'],
  ['g8b-unit6', '/english-materials/g8b/unit6-reading/'],
  ['g8b-unit7', '/english-materials/g8b/unit7-reading/'],
  ['g8b-unit8', '/english-materials/g8b/unit8-reading/'],
  ['g8a-hub', '/english-materials/g8a/'],
  ['g8a-unit1', '/english-materials/g8a/unit1-reading/'],
  ['g8a-unit2', '/english-materials/g8a/unit2-reading/'],
  ['g8a-unit3', '/english-materials/g8a/unit3-reading/'],
  ['g8a-unit4', '/english-materials/g8a/unit4-reading/'],
  ['g8a-unit5', '/english-materials/g8a/unit5-reading/'],
  ['g8a-unit6', '/english-materials/g8a/unit6-reading/'],
  ['g8a-unit7', '/english-materials/g8a/unit7-reading/'],
  ['g8a-unit8', '/english-materials/g8a/unit8-reading/']
];
const viewports = {
  desktop: { width: 1440, height: 1000 },
  mobile: { width: 390, height: 844 }
};
const baselineDir = 'visual-baseline';
const outDir = 'artifacts/visual';
fs.mkdirSync(baselineDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

async function gotoWithRetry(page, url) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
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
      await gotoWithRetry(page, BASE + urlPath);
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
