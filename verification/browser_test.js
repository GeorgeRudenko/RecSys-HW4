// Real-page check in headless Chromium, opened from file:// exactly as the readme says.
const { chromium } = require('playwright'); const path = require('path');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  PASS' : '  FAIL', m); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await p.goto('file://' + path.resolve(__dirname, '../week4/index.html'));
  await p.waitForFunction(() => /Dataset ready/.test(document.getElementById('status').textContent));
  ok((await p.textContent('#dataset-summary-body')).includes('17,080'), 'dataset summary shows 17,080 baskets');
  ok((await p.textContent('#dataset-summary-body')).includes('3,653'), 'and 3,653 distinct items');
  await p.click('#run-tests'); const log = await p.textContent('#testLog'); console.log('   ' + log.split('\n')[0]);
  ok(/pass 11, fail 0, pending 0/.test(log), 'Run tests: 11 passed in the browser');
  let t = Date.now(); await p.click('#run-rules'); await p.waitForFunction(() => /^Done/.test(document.getElementById('status').textContent));
  const status = await p.textContent('#status'); console.log('   ' + status, `(${Date.now() - t} ms incl. rendering)`);
  const nRows = await p.$$eval('.rules-table tbody tr', r => r.length); ok(nRows === 950, `default 1% / 30%: table has ${nRows} rows (= 950 from the code)`);
  const first = await p.$$eval('.rules-table tbody tr:first-child td', t => t.map(x => x.textContent.trim())); console.log('   top row:', first.join(' | '));
  await p.click('.rules-table tbody tr:first-child');
  const det = await p.textContent('#rule-detail'); ok(/Reverse direction \(B → A\): confidence/.test(det), 'clicking a row opens the detail panel');
  const fwd = await p.$$eval('#rule-detail dd', d => d.map(x => x.textContent.trim()));
  await p.click('#reverse-rule'); const rev = await p.$$eval('#rule-detail dd', d => d.map(x => x.textContent.trim()));
  ok(fwd[0] === rev[1] && fwd[1] === rev[0], 'Reverse swaps A and B');
  ok(fwd[6] !== rev[6] && fwd[7] === rev[7], `confidence changes (${fwd[6]} -> ${rev[6]}), lift does not (${fwd[7]} = ${rev[7]})`);
  ok(fwd[2] === rev[2] && fwd[5] === rev[5], `count(A∪B) and support are the same in both directions (${fwd[2]}, ${fwd[5]})`);
  await p.screenshot({ path: 'shot_page.png', fullPage: false });
  // extreme slider settings
  for (const [sup, conf, expect] of [['0.5', '10', 19058], ['3', '60', 5], ['10', '100', 0]]) {
    await p.$eval('#min-support', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, sup);
    await p.$eval('#min-confidence', (e, v) => { e.value = v; e.dispatchEvent(new Event('input')); }, conf);
    t = Date.now(); await p.click('#run-rules'); await p.waitForFunction(() => /^Done/.test(document.getElementById('status').textContent) && !/Mining/.test(document.getElementById('status').textContent));
    const n = expect === 0 ? (await p.textContent('#results')).includes('No rules passed') ? 0 : -1 : await p.$$eval('.rules-table tbody tr', r => r.length);
    ok(n === expect, `${sup}% / ${conf}%: ${n} rules shown (expected ${expect}), ${Date.now() - t} ms incl. rendering`);
  }
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join('; ') : ''));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})();
