// Independent cross-check of the Apriori miner and rule generator on the REAL
// 17,080 baskets: a brute-force counter (direct basket scans, no bitsets, no
// Apriori pruning) must produce exactly the same frequent itemsets and counts.
const { load } = require('./harness');
const c = load(require('path').join(__dirname, '..', 'week4')); const g = c.__get;
const T = g('TRANSACTIONS'); const N = T.length;
let pass = 0, fail = 0; const ok = (cond, msg) => { cond ? pass++ : fail++; console.log(cond ? '  PASS' : '  FAIL', msg); };
console.log('float check: 0.07 * 100 =', 0.07 * 100, '-> ceil', Math.ceil(0.07 * 100), '| miner keeps 7 of 100:', g('findFrequentItemsets')(Array.from({length:100},(_,i)=>i<7?['x','y']:['x']),0.07).some(x=>x.items.join()==='x,y'));

// Brute force: count k-itemsets by enumerating each basket's subsets directly
// (plain Sets/Maps, no bitsets, no level-wise join). Only items that are
// frequent on their own are enumerated, and for k >= 3 an item is added only if
// every pair it forms is frequent: both are necessary conditions (downward
// closure), so no frequent itemset can be missed.
function brute(minSupport, maxK = 4) {
  const sets = T.map(b => [...new Set(b.map(x => x.stock))].sort());
  const c1 = new Map(); for (const b of sets) for (const s of b) c1.set(s, (c1.get(s) || 0) + 1);
  const ok1 = new Set([...c1].filter(([, v]) => v / N >= minSupport).map(([k]) => k));
  const out = new Map([...c1].filter(([k]) => ok1.has(k)));
  let okPairs = null;
  for (let k = 2; k <= maxK; k++) {
    const cnt = new Map();
    for (const b0 of sets) {
      const b = b0.filter(s => ok1.has(s)); if (b.length < k) continue;
      const rec = (start, chosen) => {
        if (chosen.length === k) { const key = chosen.join('|'); cnt.set(key, (cnt.get(key) || 0) + 1); return; }
        for (let i = start; i < b.length; i++) {
          if (okPairs && !chosen.every(x => okPairs.has(x + '|' + b[i]))) continue;
          chosen.push(b[i]); rec(i + 1, chosen); chosen.pop();
        }
      };
      rec(0, []);
    }
    const level = [...cnt].filter(([, v]) => v / N >= minSupport);
    if (!level.length) break;
    for (const [key, v] of level) out.set(key, v);
    if (k === 2) okPairs = new Set(level.map(([key]) => key));
  }
  return out;
}
for (const s of [0.03, 0.02, 0.015, 0.01]) {
  let t = performance.now(); const fi = g('findFrequentItemsets')(T, s); const ms = performance.now() - t;
  const mine = new Map(fi.map(x => [[...x.items].sort().join('|'), x.count]));
  const ref = brute(s);
  const same = mine.size === ref.size && [...ref].every(([k, v]) => mine.get(k) === v);
  const bySize = {}; for (const x of fi) bySize[x.items.length] = (bySize[x.items.length] || 0) + 1;
  ok(same, `support ${(s * 100).toFixed(1)}%: ${fi.length} itemsets ${JSON.stringify(bySize)} identical to brute force (${ref.size}); Apriori ${ms.toFixed(0)} ms`);
  ok(fi.every(x => x.support >= s && Math.abs(x.support - x.count / N) < 1e-15), `  every itemset has support >= threshold and support = count / N`);
}
// Rules: metrics must match countItemset recomputation via the inverted index, both directions present.
const fi = g('findFrequentItemsets')(T, 0.01); const rules = g('generateRules')(fi, 0.3);
const idx = g('DATASET_INDEX') || g('buildIndex')(T); const cnt = s => g('countItemset')(idx, s);
let bad = 0; for (const r of rules) {
  const j = cnt([...r.antecedent, ...r.consequent]), a = cnt(r.antecedent), b = cnt(r.consequent);
  if (j !== r.jointCount || a !== r.antecedentCount || b !== r.consequentCount ||
      Math.abs(r.support - j / N) > 1e-12 || Math.abs(r.confidence - j / a) > 1e-12 || Math.abs(r.lift - (j / a) / (b / N)) > 1e-9) bad++;
}
ok(bad === 0, `1% / 30%: all ${rules.length} rules match counts recomputed with countItemset and the §5 formulas`);
ok(rules.every(r => r.confidence >= 0.3), '  every rule has confidence >= 30%');
// Exhaustive: every possible split of every frequent itemset with confidence >= 30% is present (nothing missed).
let expected = 0; const key = s => [...s].sort().join('|'); const cmap = new Map(fi.map(x => [key(x.items), x.count]));
for (const x of fi) { const it = x.items, k = it.length; if (k < 2) continue; for (let m = 1; m < (1 << k) - 1; m++) { const A = it.filter((_, i) => m & (1 << i)); if (x.count / cmap.get(key(A)) >= 0.3) expected++; } }
ok(expected === rules.length, `  rule count equals an exhaustive enumeration of all splits (${expected})`);
// Symmetry facts on real data
const pairRules = rules.filter(r => r.antecedent.length === 1 && r.consequent.length === 1);
const byKey = new Map(rules.map(r => [r.antecedent.join('+') + '>' + r.consequent.join('+'), r]));
let both = 0, liftSym = 0, confDiff = 0;
for (const r of pairRules) { const rev = byKey.get(r.consequent.join('+') + '>' + r.antecedent.join('+')); if (rev) { both++; if (Math.abs(rev.lift - r.lift) < 1e-12) liftSym++; if (Math.abs(rev.confidence - r.confidence) > 1e-9) confDiff++; } }
ok(both > 0 && liftSym === both, `  ${both} pair rules present in both directions: lift identical in all, confidence differs in ${confDiff}`);
// Provided reverseRule (its starter comment claimed support changes with direction):
{ let bad = 0; for (const r of rules) { const rev = g('reverseRule')(r, idx); if (Math.abs(rev.support - r.support) > 1e-15 || Math.abs(rev.lift - r.lift) > 1e-9 || rev.jointCount !== r.jointCount) bad++; }
  ok(bad === 0, `reverseRule on all ${rules.length} rules: support, lift and count(A∪B) unchanged`); }
// Threshold boundary: an itemset with support exactly at the threshold must be kept.
const exact = g('findFrequentItemsets')([['a', 'b'], ['a', 'b'], ['a'], ['c', 'd'], ['c']], 0.4);
ok(exact.some(x => x.items.join() === 'a,b' && x.count === 2), 'boundary: support exactly 0.4 (2 of 5) is kept');
const ex2 = g('generateRules')(g('findFrequentItemsets')([['a','b'],['a','b'],['a'],['a'],['b']], 0.2), 0.5);
ok(ex2.some(r => r.antecedent.join() === 'a' && Math.abs(r.confidence - 0.5) < 1e-12), 'boundary: confidence exactly 0.5 (a->b, 2/4) is kept');
// Simulated slider boundary on real data: at 2.5% an itemset in exactly 427 baskets would be kept.
ok(g('findFrequentItemsets')(Array.from({length:100},(_,i)=>i<7?['x','y']:['x']),0.07).some(x=>x.items.join()==='x,y'), 'float edge: 7 of 100 baskets at minSupport 0.07 is kept (naive ceil(0.07*100) = 8 would drop it)');
// Anchor fact from the readme
ok(cnt(['85123A']) === 1959 && Math.abs(1959 / N - 0.1147) < 5e-5, `anchor: 85123A in ${cnt(['85123A'])} of ${N} baskets (${(cnt(['85123A']) / N * 100).toFixed(2)}%)`);
// Timing of the full slider range for "Run rules"
for (const [s, cf] of [[0.005, 0.1], [0.01, 0.3], [0.03, 0.6]]) { const t = performance.now(); const f = g('findFrequentItemsets')(T, s); const r = g('generateRules')(f, cf); console.log(`  timing ${s * 100}% / ${cf * 100}%: ${f.length} itemsets, ${r.length} rules, ${(performance.now() - t).toFixed(0)} ms`); }
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
