// Numbers for the report (§4.2), produced by the page's own functions.
const { load } = require('./harness'); const fs = require('fs');
const c = load(require('path').join(__dirname, '..', 'week4')); const g = c.__get;
const T = g('TRANSACTIONS'); const N = T.length; const idx = g('buildIndex')(T);
const D = new Map(); const H = c.window.HW4; H.stocks.forEach((s, i) => D.set(s, H.descriptions[i]));
const name = a => a.map(s => `${s} ${D.get(s)}`).join(' + ');
const out = {};
// Threshold grid
out.grid = [];
for (const s of [0.005, 0.01, 0.02, 0.03, 0.05]) {
  const t = Date.now(); const fi = g('findFrequentItemsets')(T, s); const ms = Date.now() - t; const bySize = {};
  for (const x of fi) bySize[x.items.length] = (bySize[x.items.length] || 0) + 1;
  for (const cf of [0.1, 0.3, 0.6]) { const r = g('generateRules')(fi, cf);
    out.grid.push({ support: s, confidence: cf, itemsets: fi.length, bySize, rules: r.length, liftAbove1: r.filter(x => x.lift > 1).length, liftAtMost1: r.filter(x => x.lift <= 1).length, minLift: Math.min(...r.map(x => x.lift)), ms }); }
}
console.table(out.grid.map(x => ({ sup: x.support, conf: x.confidence, itemsets: x.itemsets, sizes: JSON.stringify(x.bySize), rules: x.rules, lift1: x.liftAbove1, le1: x.liftAtMost1, minLift: x.minLift.toFixed(3) })));
// Final table 1% / 30%
const fi = g('findFrequentItemsets')(T, 0.01); const R = g('generateRules')(fi, 0.3);
const show = (r) => `${name(r.antecedent)} -> ${name(r.consequent)} | AB=${r.jointCount} A=${r.antecedentCount} B=${r.consequentCount} sup=${(r.support*100).toFixed(2)}% conf=${(r.confidence*100).toFixed(2)}% lift=${r.lift.toFixed(3)}`;
console.log('\nTop 8 by lift:'); R.slice(0, 8).forEach(r => console.log(' ', show(r)));
console.log('\nUseful candidates: pair rules, count(A) >= 500, sorted by lift:');
R.filter(r => r.antecedent.length === 1 && r.consequent.length === 1 && r.antecedentCount >= 500).sort((a, b) => b.lift - a.lift).slice(0, 12).forEach(r => console.log(' ', show(r)));
console.log('\nLowest-lift rules at 1%/30%:'); [...R].sort((a, b) => a.lift - b.lift).slice(0, 8).forEach(r => console.log(' ', show(r)));
console.log('\nRules with consequent 85123A at 1%/30%:'); R.filter(r => r.consequent.join() === '85123A').slice(0, 8).forEach(r => console.log(' ', show(r)));
console.log('\nHighest-confidence rules at 1%/30%:'); [...R].sort((a, b) => b.confidence - a.confidence).slice(0, 6).forEach(r => console.log(' ', show(r)));
// Low-lift, high-confidence across a looser setting
const fi05 = g('findFrequentItemsets')(T, 0.005); const R05 = g('generateRules')(fi05, 0.1);
console.log('\n0.5%/10%: rules with lift <= 1.2:', R05.filter(r => r.lift <= 1.2).length);
[...R05].sort((a, b) => a.lift - b.lift).slice(0, 8).forEach(r => console.log(' ', show(r)));
console.log('\n0.5%/10%: highest confidence among lift < 2:'); R05.filter(r => r.lift < 2).sort((a, b) => b.confidence - a.confidence).slice(0, 6).forEach(r => console.log(' ', show(r)));
// basket length stats
const L = T.map(b => b.length).sort((a, b) => a - b); const q = p => L[Math.floor(p * (L.length - 1))];
console.log('\nbasket length: min', L[0], 'median', q(0.5), 'p90', q(0.9), 'p99', q(0.99), 'max', L[L.length - 1], 'mean', (L.reduce((a, b) => a + b, 0) / L.length).toFixed(1));
const big = T.map(b => b.length); console.log('baskets with >= 100 items:', big.filter(x => x >= 100).length, ' share of all item rows in them:', (big.filter(x => x >= 100).reduce((a, b) => a + b, 0) / big.reduce((a, b) => a + b, 0) * 100).toFixed(1) + '%');

