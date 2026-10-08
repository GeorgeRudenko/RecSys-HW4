/**
 * week4/script.js — Association-rule mining starter (HW4).
 *
 * This is a plain (classic) script, NOT an ES module. `week4/transactions.js`
 * (loaded first, in a regular <script> tag) assigns the dictionary-encoded UCI
 * Online Retail baskets to `window.HW4`. This file reads that global, decodes
 * the integer-index baskets back into `{ stock, description }` items, renders a
 * dataset summary, and wires two slider controls ("minimum support" and
 * "minimum confidence") plus a "Run rules" button. Because nothing is fetched,
 * the page works from a `file://` URL with no server.
 *
 * WHAT YOU MUST IMPLEMENT (`TODO(hw4)` — each stub throws until you write it):
 *   1. `dedupeBasket`         — unique stock codes in a basket, first-appearance order.
 *   2. `countItemset`         — baskets containing every requested stock (`0` if any is absent).
 *   3. `computeSupport`       — support = count(A union B) / N, guarded when N = 0.
 *   4. `computeConfidence`    — confidence = count(A union B) / count(A), guarded when count(A) = 0.
 *   5. `computeLift`          — lift = confidence / (count(B) / N), guarded.
 *   6. `findFrequentItemsets` — mine frequent itemsets (Apriori or equivalent).
 *   7. `generateRules`        — turn frequent itemsets into both-direction rules.
 *
 * PROVIDED for you (scaffolding): dataset loading/decoding from `window.HW4`, the
 * inverted-index builder (`buildIndex` / `asIndex` / `indexCache`), the thin
 * counting wrappers `countItem` / `countPair` (they call your `countItemset` and
 * therefore also throw until it is implemented), threshold validation and slider
 * readout, the DOM wiring, all formatting and rendering helpers, and the test
 * harness. Leave the provided code as-is and implement only the stubs above.
 *
 * Metrics (see week4/readme.md for definitions):
 *   support(A -> B)    = count(A union B) / N
 *   confidence(A -> B) = count(A union B) / count(A)
 *   lift(A -> B)       = confidence(A -> B) / (count(B) / N)
 *
 * @module week4/script
 */

// Defensive guard: `transactions.js` must run before this file. If `window.HW4`
// is missing (for example because `transactions.js` was not copied next to
// `index.html`), fail loudly and visibly instead of throwing an opaque error.
if (typeof window === "undefined" || typeof window.HW4 === "undefined") {
  if (typeof document !== "undefined") {
    document.body.innerHTML =
      '<p style="padding:2rem;font-family:sans-serif">' +
      "Failed to load `transactions.js`. Make sure it sits next to `index.html` " +
      "and is loaded before `script.js`.</p>";
  }
  throw new Error(
    "window.HW4 is not defined — load transactions.js before script.js.",
  );
}

/** The raw dataset global assigned by `week4/transactions.js`. */
const data = window.HW4;

/**
 * Baskets decoded from the dictionary-encoded arrays in `window.HW4`. Each
 * basket is an array of `{ stock, description }` items, matching the fixture
 * shape used by the tests.
 *
 * @type {Array<Array<Item>>}
 */
const TRANSACTIONS = data.baskets.map((basket) =>
  basket.map((stockIndex) => ({
    stock: data.stocks[stockIndex],
    description: data.descriptions[stockIndex],
  })),
);

/**
 * Dataset-wide inverted index, built once at startup. `null` until `init()` has
 * run, so the UI can tell "still loading" from "loaded".
 *
 * @type {BasketIndex|null}
 */
let DATASET_INDEX = null;

/** Number of baskets (the `N` used by support and lift). */
let N = data.N_BASKETS;

/**
 * @typedef {Object} Item
 * @property {string} stock       Stock code (the item identity).
 * @property {string} description Human-readable product description.
 */

/**
 * @typedef {Object} Rule
 * @property {string[]} antecedent    Item identities on the left-hand side (A).
 * @property {string[]} consequent    Item identities on the right-hand side (B).
 * @property {number} jointCount      count(A union B).
 * @property {number} antecedentCount count(A).
 * @property {number} consequentCount count(B).
 * @property {number} support         jointCount / N.
 * @property {number} confidence      jointCount / antecedentCount.
 * @property {number} lift            confidence / (consequentCount / N).
 */

/**
 * @typedef {Object} BasketIndex
 * @property {number} n                              Number of baskets.
 * @property {Map<string, Set<number>>} byStock      Stock code -> basket ids.
 */

// ---------------------------------------------------------------------------
// Provided helpers and student stubs
//
// Functions carrying a `TODO(hw4)` marker are stubs you must implement; every
// other function in this file is scaffolding and should be left as-is.
// ---------------------------------------------------------------------------

/**
 * Read the item identity out of a basket entry. Accepts either a plain string or
 * an object with a `stock` property so the helpers work with both the real
 * dataset and the small fixtures used by the tests.
 *
 * @param {Item|string} item
 * @returns {string}
 */
function stockOf(item) {
  return typeof item === "string" ? item : item.stock;
}

/**
 * Build an inverted index from basket id to the set of baskets containing each
 * stock code. Counting a candidate itemset then becomes a set intersection.
 *
 * @param {Array<Array<Item|string>>} baskets
 * @returns {BasketIndex}
 */
function buildIndex(baskets) {
  /** @type {Map<string, Set<number>>} */
  const byStock = new Map();
  baskets.forEach((basket, basketId) => {
    for (const item of basket) {
      const stock = stockOf(item);
      let posting = byStock.get(stock);
      if (!posting) {
        posting = new Set();
        byStock.set(stock, posting);
      }
      posting.add(basketId);
    }
  });
  return { n: baskets.length, byStock };
}

/** Cache of lazily built indexes, keyed by the baskets array. */
const indexCache = new WeakMap();

/**
 * Accept either a ready-made index or a raw basket array and return an index.
 *
 * @param {BasketIndex|Array<Array<Item|string>>} basketsOrIndex
 * @returns {BasketIndex}
 */
function asIndex(basketsOrIndex) {
  if (basketsOrIndex && !Array.isArray(basketsOrIndex) && basketsOrIndex.byStock) {
    return basketsOrIndex;
  }
  let index = indexCache.get(basketsOrIndex);
  if (!index) {
    index = buildIndex(basketsOrIndex);
    indexCache.set(basketsOrIndex, index);
  }
  return index;
}

/**
 * Count the baskets that contain every stock code in `stocks`.
 *
 * TODO(hw4): build (or reuse) a basket -> stock inverted index, intersect the
 * posting lists of the requested stocks, and return the size of the
 * intersection.
 *
 * Contract:
 *  - Accept either a ready-made index or a raw basket array. The provided
 *    `asIndex` helper returns an index for either input.
 *  - Return `0` when `stocks` is empty, and also when any requested stock is
 *    absent from the dataset (never throw for an unknown stock).
 *  - A stock repeated within one basket must be counted at most once. Dedupe the
 *    request before intersecting.
 *
 * @param {BasketIndex|Array<Array<Item|string>>} basketsOrIndex
 * @param {Array<string|Item>} stocks
 * @returns {number} count(A) for a single-element `stocks`, count(A union B) for two.
 */
function countItemset(basketsOrIndex, stocks) {
  // Dedupe the request first: count(["A", "A"]) must equal count(["A"]).
  const wanted = dedupeBasket(stocks || []);
  if (wanted.length === 0) return 0;

  const index = asIndex(basketsOrIndex);
  const postings = [];
  for (const stock of wanted) {
    const posting = index.byStock.get(stock);
    if (!posting || posting.size === 0) return 0; // unknown stock: never throw
    postings.push(posting);
  }

  // Walk the shortest posting list and probe the others (each probe is O(1)).
  postings.sort((a, b) => a.size - b.size);
  if (postings.length === 1) return postings[0].size;
  let count = 0;
  outer: for (const basketId of postings[0]) {
    for (let k = 1; k < postings.length; k++) {
      if (!postings[k].has(basketId)) continue outer;
    }
    count++;
  }
  return count;
}

/**
 * Count the baskets containing a single stock code.
 *
 * @param {BasketIndex|Array<Array<Item|string>>} basketsOrIndex
 * @param {string|Item} stock
 * @returns {number}
 */
function countItem(basketsOrIndex, stock) {
  return countItemset(basketsOrIndex, [stock]);
}

/**
 * Count the baskets containing both `stockA` and `stockB`.
 *
 * @param {BasketIndex|Array<Array<Item|string>>} basketsOrIndex
 * @param {string|Item} stockA
 * @param {string|Item} stockB
 * @returns {number}
 */
function countPair(basketsOrIndex, stockA, stockB) {
  return countItemset(basketsOrIndex, [stockA, stockB]);
}

/**
 * Remove repeated item identities from a raw basket, keeping first-appearance
 * order. A basket is a set of items, so duplicates must not be counted twice.
 *
 * TODO(hw4): walk the input once, map each entry to its stock code with the
 * provided `stockOf` helper, and return each distinct code the first time it
 * appears.
 *
 * Contract:
 *  - An empty input returns `[]`.
 *  - The input may mix plain strings and `{ stock, description }` objects.
 *  - Only the stock code is returned; the description is dropped.
 *
 * @param {Array<string|Item>} rawItems
 * @returns {Array<string>} unique stock codes, in first-appearance order.
 */
function dedupeBasket(rawItems) {
  const seen = new Set();
  const unique = [];
  for (const item of rawItems || []) {
    const stock = stockOf(item);
    if (!seen.has(stock)) {
      seen.add(stock);
      unique.push(stock);
    }
  }
  return unique;
}

/**
 * Compute support as `jointCount / n`.
 *
 * TODO(hw4): return the fraction and flag the `n === 0` case.
 *
 * Contract:
 *  - `defined: true` with `value = jointCount / n` when `n > 0`.
 *  - `defined: false` with `value = 0` when `n === 0` (never divide by zero).
 *
 * @param {number} jointCount count(A union B)
 * @param {number} n          number of baskets
 * @returns {{value: number, defined: boolean}} `defined` is false when `n === 0`.
 */
function computeSupport(jointCount, n) {
  if (!(n > 0)) return { value: 0, defined: false };
  return { value: jointCount / n, defined: true };
}

/**
 * Compute confidence as `jointCount / antecedentCount`.
 *
 * TODO(hw4): return the fraction and flag the `antecedentCount === 0` case.
 *
 * Contract:
 *  - `defined: true` with `value = jointCount / antecedentCount` when count(A) > 0.
 *  - `defined: false` with `value = 0` when count(A) === 0: a rule whose
 *    left-hand side never occurs has no confidence.
 *
 * @param {number} jointCount      count(A union B)
 * @param {number} antecedentCount count(A)
 * @returns {{value: number, defined: boolean}}
 */
function computeConfidence(jointCount, antecedentCount) {
  if (!(antecedentCount > 0)) return { value: 0, defined: false };
  return { value: jointCount / antecedentCount, defined: true };
}

/**
 * Compute lift as `confidence / (consequentCount / n)`.
 *
 * TODO(hw4): divide the incoming confidence by the consequent's baseline rate.
 *
 * Contract:
 *  - `defined: true` with `value = confidence.value / (consequentCount / n)`
 *    when every input is usable.
 *  - `defined: false` with `value = 0` when the incoming confidence is missing or
 *    undefined, when `n === 0`, or when the baseline `consequentCount / n` is 0
 *    (the consequent never occurs).
 *
 * @param {{value: number, defined: boolean}} confidence confidence(A -> B)
 * @param {number} consequentCount count(B)
 * @param {number} n               number of baskets
 * @returns {{value: number, defined: boolean}}
 */
function computeLift(confidence, consequentCount, n) {
  if (!confidence || confidence.defined !== true || !Number.isFinite(confidence.value)) {
    return { value: 0, defined: false };
  }
  if (!(n > 0) || !(consequentCount > 0)) return { value: 0, defined: false };
  const baseline = consequentCount / n; // P(B): how often B occurs anyway
  return { value: confidence.value / baseline, defined: true };
}

/**
 * Validate the two slider values, expressed as fractions in `(0, 1]`.
 *
 * @param {number} minSupport    minimum support fraction
 * @param {number} minConfidence minimum confidence fraction
 * @returns {{ok: boolean, errors: string[]}}
 */
function validateThresholds(minSupport, minConfidence) {
  const errors = [];
  for (const [label, value] of [
    ["Minimum support", minSupport],
    ["Minimum confidence", minConfidence],
  ]) {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push(`${label} must be a number.`);
    } else if (value <= 0 || value > 1) {
      errors.push(`${label} must be greater than 0 and at most 1.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Mine all frequent itemsets whose support is at least `minSupport`.
 *
 * TODO(hw4): implement Apriori (level-wise candidate generation with a
 * downward-closure pruning step) or any equivalent frequent-itemset miner.
 *
 * Contract:
 *  - Return one entry per frequent itemset: `{ items, count, support }`, where
 *    `items` is the (deduplicated) set of stock codes, `count` is the number of
 *    baskets containing every item, and `support = count / N`.
 *  - Every returned itemset must satisfy `support >= minSupport`.
 *  - You may call `countItemset` while developing, but a per-candidate scan over
 *    17,080 baskets is slow — build your own occurrence/index structures.
 *  - `generateRules` consumes this exact shape, so keep the field names stable.
 *
 * @param {Array<Array<Item|string>>} transactions baskets
 * @param {number} minSupport minimum support fraction in `(0, 1]`
 * @returns {Array<{items: string[], count: number, support: number}>} frequent itemsets
 */
function findFrequentItemsets(transactions, minSupport) {
  // Apriori with bitset "tidsets": every frequent itemset keeps a bitset of the
  // baskets that contain it, so counting a candidate is one AND + popcount
  // instead of a scan over all baskets.
  const baskets = (transactions || []).map(dedupeBasket); // a basket is a set
  const n = baskets.length; // the N of THIS input (5 for the fixture, 17,080 live)
  if (n === 0) return [];

  // Smallest basket count whose support count / n reaches minSupport, derived
  // with the same division the support uses. (Math.ceil(minSupport * n) alone
  // is not always equivalent because of floating point: 0.07 * 100 evaluates
  // to 7.000000000000001, so ceil gives 8 and an itemset in exactly 7 of 100
  // baskets, support 0.07, would be dropped. For N = 17,080 no slider value
  // hits this, but the miner should not depend on that.)
  let minCount = Math.max(1, Math.ceil(minSupport * n));
  while (minCount > 1 && (minCount - 1) / n >= minSupport) minCount--;
  while (minCount <= n && minCount / n < minSupport) minCount++;
  if (minCount > n) return [];

  const words = (n + 31) >>> 5;

  // Level 1: one bitset per item, keep the frequent items in code order.
  const bitsByStock = new Map();
  baskets.forEach((basket, basketId) => {
    for (const stock of basket) {
      let bits = bitsByStock.get(stock);
      if (!bits) {
        bits = new Uint32Array(words);
        bitsByStock.set(stock, bits);
      }
      bits[basketId >>> 5] |= 1 << (basketId & 31);
    }
  });
  const frequentStocks = [];
  const itemBits = [];
  const itemCounts = [];
  const itemBaskets = []; // sparse twin of itemBits: the basket ids themselves
  for (const stock of [...bitsByStock.keys()].sort()) {
    const bits = bitsByStock.get(stock);
    const count = popcountBits(bits);
    if (count >= minCount) {
      frequentStocks.push(stock);
      itemBits.push(bits);
      itemCounts.push(count);
      itemBaskets.push(basketIdsOf(bits, count));
    }
  }

  const result = [];
  /** Current level: itemsets as ascending arrays of item positions. */
  let level = frequentStocks.map((_, i) => ({ ids: [i], bits: itemBits[i], count: itemCounts[i] }));
  for (const set of level) {
    result.push({ items: [frequentStocks[set.ids[0]]], count: set.count, support: set.count / n });
  }

  while (level.length > 1) {
    const known = new Set(level.map((set) => set.ids.join(",")));
    const next = [];
    for (let a = 0; a < level.length; a++) {
      const left = level[a];
      for (let b = a + 1; b < level.length; b++) {
        const right = level[b];
        // Join step: same (k-1)-prefix, different last item. `level` is sorted,
        // so once the prefixes differ no later `right` can match.
        if (!samePrefix(left.ids, right.ids)) break;
        const ids = [...left.ids, right.ids[right.ids.length - 1]];
        // Prune step (downward closure): every (k-1)-subset must be frequent.
        if (!allSubsetsKnown(ids, known)) continue;
        // Count first without allocating, by probing the new item's basket ids
        // in the parent's bitset; keep a bitset only for survivors.
        // (Allocating one bitset per candidate made the 0.5% setting take ~7 s.)
        const last = ids[ids.length - 1];
        const count = countInBits(left.bits, itemBaskets[last]);
        if (count >= minCount) next.push({ ids, bits: andBits(left.bits, itemBits[last]), count });
      }
    }
    for (const set of next) {
      result.push({
        items: set.ids.map((i) => frequentStocks[i]),
        count: set.count,
        support: set.count / n,
      });
    }
    level = next;
  }
  return result;
}

/** Number of set bits in a Uint32Array bitset. */
function popcountBits(bits) {
  let total = 0;
  for (let i = 0; i < bits.length; i++) {
    let x = bits[i];
    x -= (x >>> 1) & 0x55555555;
    x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
    total += (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
  }
  return total;
}

/** The basket ids whose bit is set, as an Int32Array of length `count`. */
function basketIdsOf(bits, count) {
  const ids = new Int32Array(count);
  let k = 0;
  for (let w = 0; w < bits.length; w++) {
    let x = bits[w];
    while (x !== 0) {
      const low = x & -x;
      ids[k++] = (w << 5) + (31 - Math.clz32(low));
      x ^= low;
    }
  }
  return ids;
}

/** How many of `basketIds` have their bit set in `bits`. */
function countInBits(bits, basketIds) {
  let total = 0;
  for (let i = 0; i < basketIds.length; i++) {
    const id = basketIds[i];
    if (bits[id >>> 5] & (1 << (id & 31))) total++;
  }
  return total;
}

/** Bitwise AND of two equally long bitsets. */
function andBits(a, b) {
  const out = new Uint32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] & b[i];
  return out;
}

/** True when two ascending id arrays share everything but the last id. */
function samePrefix(a, b) {
  for (let i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Apriori prune: every subset that drops one item must be a known frequent set. */
function allSubsetsKnown(ids, known) {
  if (ids.length <= 2) return true; // both 1-item subsets are frequent by construction
  for (let skip = 0; skip < ids.length - 2; skip++) {
    // The two subsets that drop one of the LAST two ids are the joined parents.
    const subset = ids.filter((_, i) => i !== skip).join(",");
    if (!known.has(subset)) return false;
  }
  return true;
}

/**
 * Turn frequent itemsets into association rules and keep the ones whose
 * confidence is at least `minConfidence`.
 *
 * TODO(hw4): for each frequent itemset, split it into a non-empty antecedent `A`
 * and a non-empty, disjoint consequent `B` in BOTH directions, compute the
 * confidence for each direction, and keep the rules that pass the threshold.
 *
 * Contract:
 *  - Each returned rule follows the `Rule` shape documented at the top of this
 *    module. At minimum it carries `antecedent` and `consequent`; the renderer
 *    fills in the counts and metrics with `enrichRule`, but returning them
 *    yourself is fine and faster.
 *  - Generate both `A -> B` and `B -> A`: they are separate rules with (usually)
 *    different confidence. Skip a direction whose consequent is empty.
 *  - Keep only rules with `confidence >= minConfidence`. `count(A)` is non-zero
 *    for every generated rule, so the confidence is always defined.
 *
 * @param {Array<{items: string[], count: number, support: number}>} frequentItemsets
 * @param {number} minConfidence minimum confidence fraction in `(0, 1]`
 * @returns {Rule[]}
 */
function generateRules(frequentItemsets, minConfidence) {
  const keyOf = (stocks) => [...stocks].sort().join("\u0001");
  const countByKey = new Map();
  for (const set of frequentItemsets || []) countByKey.set(keyOf(set.items), set.count);

  const rules = [];
  for (const set of frequentItemsets || []) {
    const items = [...set.items].sort();
    if (items.length < 2 || !(set.support > 0)) continue;
    // N is not passed in; recover it from the itemset itself (support = count / N).
    const n = Math.round(set.count / set.support);

    // Every split into a non-empty antecedent A and the non-empty rest B. Each
    // pair {A, B} is visited twice (as mask and as its complement), so both
    // directions A -> B and B -> A are generated.
    const full = (1 << items.length) - 1;
    for (let mask = 1; mask < full; mask++) {
      const antecedent = items.filter((_, i) => mask & (1 << i));
      const consequent = items.filter((_, i) => !(mask & (1 << i)));
      // Downward closure guarantees both parts are frequent, hence present.
      const antecedentCount = countByKey.get(keyOf(antecedent));
      const consequentCount = countByKey.get(keyOf(consequent));
      if (antecedentCount === undefined || consequentCount === undefined) continue;

      const confidence = computeConfidence(set.count, antecedentCount);
      if (!confidence.defined || confidence.value < minConfidence) continue;
      const support = computeSupport(set.count, n);
      const lift = computeLift(confidence, consequentCount, n);
      rules.push({
        antecedent,
        consequent,
        jointCount: set.count,
        antecedentCount,
        consequentCount,
        support: support.value,
        confidence: confidence.value,
        lift: lift.value,
      });
    }
  }

  // Strongest association first; ties broken deterministically.
  rules.sort(
    (a, b) =>
      b.lift - a.lift ||
      b.confidence - a.confidence ||
      b.jointCount - a.jointCount ||
      a.antecedent.join(",").localeCompare(b.antecedent.join(",")) ||
      a.consequent.join(",").localeCompare(b.consequent.join(",")),
  );
  return rules;
}

// ---------------------------------------------------------------------------
// Tiny worked example (used by the automated tests and the readout panel)
// ---------------------------------------------------------------------------

/**
 * A five-basket fixture with hand-computed support / confidence / lift values.
 *
 * The fixture is deliberately small enough to check with a pencil:
 *
 *   T1: bread, milk, jam, ham
 *   T2: bread, milk, jam
 *   T3: bread, milk
 *   T4: bread, jam, eggs
 *   T5: bread, eggs
 *
 * Item counts: bread = 5, milk = 3, jam = 3, eggs = 2, ham = 1 (N = 5).
 *
 * Because `bread` appears in every basket, every rule with `bread` on either
 * side has lift exactly 1 — that is the teaching point of the fixture.
 *
 * @returns {{n: number, baskets: string[][], itemCounts: Object<string, number>, rules: Array<Object>}}
 */
function tinyWorkedExample() {
  const baskets = [
    ["bread", "milk", "jam", "ham"],
    ["bread", "milk", "jam"],
    ["bread", "milk"],
    ["bread", "jam", "eggs"],
    ["bread", "eggs"],
  ];
  const n = baskets.length;
  return {
    n,
    baskets,
    itemCounts: { bread: 5, milk: 3, jam: 3, eggs: 2, ham: 1 },
    rules: [
      // lift == 1: bread is in every basket, so confidence equals support(B).
      {
        antecedent: ["bread"],
        consequent: ["milk"],
        jointCount: 3,
        antecedentCount: 5,
        consequentCount: 3,
        support: 3 / n,
        confidence: 3 / 5,
        lift: 1,
      },
      // lift > 1: milk and jam co-occur more than independence predicts.
      {
        antecedent: ["milk"],
        consequent: ["jam"],
        jointCount: 2,
        antecedentCount: 3,
        consequentCount: 3,
        support: 2 / n,
        confidence: 2 / 3,
        lift: (2 / 3) / (3 / 5),
      },
      // lift < 1 (and not degenerate): jam and eggs co-occur less than expected.
      {
        antecedent: ["jam"],
        consequent: ["eggs"],
        jointCount: 1,
        antecedentCount: 3,
        consequentCount: 2,
        support: 1 / n,
        confidence: 1 / 3,
        lift: (1 / 3) / (2 / 5),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Rule normalisation
// ---------------------------------------------------------------------------

/**
 * Fill in any missing counts / metrics on a rule using the dataset index, so the
 * table can render a rule even when the student returns only `antecedent` and
 * `consequent`.
 *
 * @param {Partial<Rule>} rule
 * @param {BasketIndex} index
 * @returns {Rule}
 */
function enrichRule(rule, index) {
  const antecedent = (rule.antecedent || []).map(stockOf);
  const consequent = (rule.consequent || []).map(stockOf);
  const n = index.n || N;
  const jointCount =
    typeof rule.jointCount === "number"
      ? rule.jointCount
      : countItemset(index, [...antecedent, ...consequent]);
  const antecedentCount =
    typeof rule.antecedentCount === "number"
      ? rule.antecedentCount
      : countItemset(index, antecedent);
  const consequentCount =
    typeof rule.consequentCount === "number"
      ? rule.consequentCount
      : countItemset(index, consequent);
  const support = computeSupport(jointCount, n);
  const confidence = computeConfidence(jointCount, antecedentCount);
  const lift = computeLift(confidence, consequentCount, n);
  return {
    antecedent,
    consequent,
    jointCount,
    antecedentCount,
    consequentCount,
    support: typeof rule.support === "number" ? rule.support : support.value,
    confidence:
      typeof rule.confidence === "number" ? rule.confidence : confidence.value,
    lift: typeof rule.lift === "number" ? rule.lift : lift.value,
    supportDefined: support.defined,
    confidenceDefined: confidence.defined,
    liftDefined: lift.defined,
  };
}

/**
 * Swap the antecedent and consequent of a rule and recompute the metrics.
 *
 * Confidence is not symmetric, so `B -> A` usually has a different confidence
 * from `A -> B`. Support and lift are unchanged: both directions share
 * count(A union B) and N, and lift = count(A union B) * N / (count(A) * count(B)).
 * (HW4 fix: the starter comment said support also changes with direction.)
 *
 * @param {Rule} rule
 * @param {BasketIndex} index
 * @returns {Rule}
 */
function reverseRule(rule, index) {
  return enrichRule(
    {
      antecedent: rule.consequent,
      consequent: rule.antecedent,
    },
    index,
  );
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/**
 * Format a fraction as a percentage with two decimals.
 *
 * @param {number} fraction
 * @returns {string}
 */
function formatPercent(fraction) {
  return `${(fraction * 100).toFixed(2)}%`;
}

/**
 * Format a number with four significant decimals for the results table.
 *
 * @param {number} value
 * @returns {string}
 */
function formatMetric(value) {
  if (!Number.isFinite(value)) return "n/a";
  return value.toFixed(4);
}

/**
 * Render a list of stock codes as readable text.
 *
 * @param {string[]} stocks
 * @param {BasketIndex} index
 * @returns {string}
 */
function formatItemset(stocks, index) {
  if (!stocks || stocks.length === 0) return "(empty)";
  return stocks.map((stock) => describe(stock, index)).join(", ");
}

/**
 * Lookup a stock code's canonical description, falling back to the code. Filled
 * by `primeDescriptions()` once `init()` runs.
 */
const descriptionByStock = new Map();

/**
 * Render `STOCK — human readable description` for one item.
 *
 * @param {string} stock
 * @param {BasketIndex} index
 * @returns {string}
 */
function describe(stock, index) {
  const description = descriptionByStock.get(stock);
  return description ? `${stock} — ${description}` : stock;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render the dataset summary at the top of the page: total baskets, distinct
 * items, and the top five items by basket count.
 *
 * @param {BasketIndex} index
 * @param {HTMLElement|null} container
 * @returns {void}
 */
function renderDatasetSummary(index, container) {
  const target = container || document.getElementById("dataset-summary-body");
  if (!target) return;

  const counts = [...index.byStock.entries()]
    .map(([stock, posting]) => ({ stock, count: posting.size }))
    .sort((a, b) => b.count - a.count || a.stock.localeCompare(b.stock));
  const topFive = counts.slice(0, 5);

  const rows = topFive
    .map(
      (entry, i) =>
        `<tr><td class="num">${i + 1}</td><td>${escapeHtml(
          describe(entry.stock, index),
        )}</td><td class="num">${entry.count}</td></tr>`,
    )
    .join("");

  target.innerHTML = `
    <p class="summary-line">
      <strong>${index.n.toLocaleString("en-US")}</strong> baskets ·
      <strong>${index.byStock.size.toLocaleString("en-US")}</strong> distinct items
    </p>
    <details class="top-items">
      <summary>Top 5 items by basket count</summary>
      <table class="data-table">
        <thead><tr><th scope="col">#</th><th scope="col">Item</th><th scope="col">Baskets</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </details>
    <p class="provenance">${escapeHtml(data.dataset_provenance)}</p>
  `;
}

/**
 * Render the rule list into a table. Each row is clickable and shows the rule in
 * the detail panel.
 *
 * @param {Rule[]} rules
 * @param {BasketIndex} [index]
 * @param {HTMLElement|null} [container]
 * @returns {void}
 */
function renderResults(rules, index, container) {
  const target = container || document.getElementById("results");
  if (!target) return;
  const activeIndex = index || DATASET_INDEX;

  if (!rules || rules.length === 0) {
    target.innerHTML =
      '<p class="empty-state">No rules passed the current thresholds. ' +
      "Lower the minimum support or confidence and run again.</p>";
    return;
  }

  const body = rules
    .map((rule, rowIndex) => {
      const enriched = enrichRule(rule, activeIndex);
      return `
        <tr tabindex="0" data-rule-index="${rowIndex}">
          <td>${escapeHtml(formatItemset(enriched.antecedent, activeIndex))}</td>
          <td>${escapeHtml(formatItemset(enriched.consequent, activeIndex))}</td>
          <td class="num">${enriched.jointCount}</td>
          <td class="num">${enriched.antecedentCount}</td>
          <td class="num">${enriched.consequentCount}</td>
          <td class="num">${formatPercent(enriched.support)}</td>
          <td class="num">${formatPercent(enriched.confidence)}</td>
          <td class="num">${formatMetric(enriched.lift)}</td>
        </tr>`;
    })
    .join("");

  target.innerHTML = `
    <p class="results-count">${rules.length} rule${rules.length === 1 ? "" : "s"}.</p>
    <table class="data-table rules-table">
      <thead>
        <tr>
          <th scope="col">Antecedent (A)</th>
          <th scope="col">Consequent (B)</th>
          <th scope="col">count(A∪B)</th>
          <th scope="col">count(A)</th>
          <th scope="col">count(B)</th>
          <th scope="col">support</th>
          <th scope="col">confidence</th>
          <th scope="col">lift</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>`;

  target.querySelectorAll("tr[data-rule-index]").forEach((row) => {
    const activate = () => {
      const rule = rules[Number(row.dataset.ruleIndex)];
      renderRuleDetail(rule, activeIndex);
    };
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    });
  });
}

/**
 * Render the detail panel for one selected rule, including a "Reverse direction"
 * button that swaps A and B and re-renders the panel.
 *
 * Shows an inline note when `count(A)` or `count(B)` is zero, because confidence
 * and lift are then undefined.
 *
 * @param {Rule} rule
 * @param {BasketIndex} [index]
 * @param {HTMLElement|null} [container]
 * @returns {void}
 */
function renderRuleDetail(rule, index, container) {
  const target = container || document.getElementById("rule-detail");
  if (!target) return;
  const activeIndex = index || DATASET_INDEX;
  const enriched = enrichRule(rule, activeIndex);
  const reversed = reverseRule(enriched, activeIndex);

  const zeroDenominatorNotes = [];
  if (enriched.antecedentCount === 0) {
    zeroDenominatorNotes.push(
      "count(A) = 0, so confidence(A → B) is undefined (division by zero).",
    );
  }
  if (enriched.consequentCount === 0) {
    zeroDenominatorNotes.push(
      "count(B) = 0, so lift(A → B) is undefined (division by zero).",
    );
  }
  const noteHtml = zeroDenominatorNotes.length
    ? `<p class="warning">${zeroDenominatorNotes.map(escapeHtml).join(" ")}</p>`
    : "";

  target.innerHTML = `
    <dl class="rule-metrics">
      <dt>Antecedent (A)</dt><dd>${escapeHtml(formatItemset(enriched.antecedent, activeIndex))}</dd>
      <dt>Consequent (B)</dt><dd>${escapeHtml(formatItemset(enriched.consequent, activeIndex))}</dd>
      <dt>count(A∪B)</dt><dd class="num">${enriched.jointCount}</dd>
      <dt>count(A)</dt><dd class="num">${enriched.antecedentCount}</dd>
      <dt>count(B)</dt><dd class="num">${enriched.consequentCount}</dd>
      <dt>support</dt><dd class="num">${formatPercent(enriched.support)}</dd>
      <dt>confidence</dt><dd class="num">${formatPercent(enriched.confidence)}</dd>
      <dt>lift</dt><dd class="num">${formatMetric(enriched.lift)}</dd>
    </dl>
    <p class="comparison">
      Reverse direction (B → A): confidence
      <strong>${formatPercent(reversed.confidence)}</strong>, lift
      <strong>${formatMetric(reversed.lift)}</strong>.
      Confidence changes with direction; lift does not.
    </p>
    ${noteHtml}
    <button type="button" id="reverse-rule">Reverse direction (B → A)</button>
  `;

  const button = target.querySelector("#reverse-rule");
  button.addEventListener("click", () => {
    renderRuleDetail(reversed, activeIndex, target);
  });
}

/**
 * Render the optional worked-example readout panel.
 *
 * @param {ReturnType<typeof tinyWorkedExample>} example
 * @param {HTMLElement|null} [container]
 * @returns {void}
 */
function renderWorkedExample(example, container) {
  const target = container || document.getElementById("worked-example");
  if (!target) return;
  const rows = example.rules
    .map(
      (rule) => `
      <tr>
        <td>${rule.antecedent.join(", ")}</td>
        <td>${rule.consequent.join(", ")}</td>
        <td class="num">${rule.jointCount}</td>
        <td class="num">${rule.antecedentCount}</td>
        <td class="num">${rule.consequentCount}</td>
        <td class="num">${formatPercent(rule.support)}</td>
        <td class="num">${formatPercent(rule.confidence)}</td>
        <td class="num">${formatMetric(rule.lift)}</td>
      </tr>`,
    )
    .join("");
  target.innerHTML = `
    <p class="worked-example-intro">
      Five hand-built baskets, N = ${example.n}. The top row has lift exactly 1
      because <code>bread</code> appears in every basket; the second has lift &gt; 1;
      the third has lift &lt; 1.
    </p>
    <table class="data-table">
      <thead>
        <tr>
          <th scope="col">A</th><th scope="col">B</th>
          <th scope="col">count(A∪B)</th><th scope="col">count(A)</th><th scope="col">count(B)</th>
          <th scope="col">support</th><th scope="col">confidence</th><th scope="col">lift</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Escape text before inserting it into HTML.
 *
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

/** Marker thrown by unimplemented `TODO(hw4)` stubs. */
const TODO_MARKER = "TODO(hw4)";

/**
 * Run the automated self-checks against the five-basket worked example and the
 * reference helpers. Unimplemented `TODO(hw4)` functions are reported as
 * `pending` rather than `fail`, so the harness is useful before and after the
 * assignment is implemented.
 *
 * @param {HTMLElement|null} [logElement] element that receives the text log
 * @returns {{passed: number, failed: number, pending: number, checks: Array<Object>}}
 */
function runTests(logElement) {
  const example = tinyWorkedExample();
  const checks = [];
  const basketObjects = example.baskets;

  const pass = (name, detail) => checks.push({ name, status: "PASS", detail });
  const fail = (name, detail) => checks.push({ name, status: "FAIL", detail });
  const pending = (name, detail) => checks.push({ name, status: "PENDING", detail });

  const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

  const check = (name, fn) => {
    try {
      const outcome = fn();
      if (outcome && outcome.pending) pending(name, outcome.pending);
      else pass(name, outcome === undefined ? "" : String(outcome));
    } catch (error) {
      if (String(error && error.message).includes(TODO_MARKER)) {
        pending(name, "TODO(hw4): not implemented yet.");
      } else {
        fail(name, String(error && error.message ? error.message : error));
      }
    }
  };

  // 1. Item counts on the fixture.
  check("fixture: item counts match the hand-computed values", () => {
    for (const [stock, expected] of Object.entries(example.itemCounts)) {
      const actual = countItem(basketObjects, stock);
      if (actual !== expected) {
        throw new Error(`countItem(${stock}) = ${actual}, expected ${expected}`);
      }
    }
    return "all five item counts correct";
  });

  // 2. lift == 1 case.
  check("fixture: bread -> milk has lift exactly 1", () => {
    const [breadMilk] = example.rules;
    const joint = countPair(basketObjects, "bread", "milk");
    const support = computeSupport(joint, example.n);
    const confidence = computeConfidence(joint, countItem(basketObjects, "bread"));
    const lift = computeLift(confidence, countItem(basketObjects, "milk"), example.n);
    if (!close(support.value, breadMilk.support)) throw new Error("support mismatch");
    if (!close(confidence.value, breadMilk.confidence)) throw new Error("confidence mismatch");
    if (!close(lift.value, breadMilk.lift)) throw new Error(`lift = ${lift.value}, expected 1`);
    return `support=${support.value.toFixed(4)} confidence=${confidence.value.toFixed(4)} lift=${lift.value.toFixed(4)}`;
  });

  // 3. lift > 1 case.
  check("fixture: milk -> jam has lift greater than 1", () => {
    const rule = example.rules[1];
    const joint = countPair(basketObjects, rule.antecedent[0], rule.consequent[0]);
    const confidence = computeConfidence(joint, countItem(basketObjects, rule.antecedent[0]));
    const lift = computeLift(confidence, countItem(basketObjects, rule.consequent[0]), example.n);
    if (!close(lift.value, rule.lift)) throw new Error(`lift = ${lift.value}, expected ${rule.lift}`);
    if (!(lift.value > 1)) throw new Error("expected lift > 1");
    return `lift=${lift.value.toFixed(4)} (> 1)`;
  });

  // 4. lift < 1 case.
  check("fixture: jam -> eggs has lift less than 1", () => {
    const rule = example.rules[2];
    const joint = countPair(basketObjects, rule.antecedent[0], rule.consequent[0]);
    const confidence = computeConfidence(joint, countItem(basketObjects, rule.antecedent[0]));
    const lift = computeLift(confidence, countItem(basketObjects, rule.consequent[0]), example.n);
    if (!close(lift.value, rule.lift)) throw new Error(`lift = ${lift.value}, expected ${rule.lift}`);
    if (!(lift.value < 1 && lift.value > 0)) throw new Error("expected 0 < lift < 1");
    return `lift=${lift.value.toFixed(4)} (0 < lift < 1)`;
  });

  // 5. Reversed confidence differs.
  check("fixture: reversed confidence differs (jam <-> eggs)", () => {
    const forwardJoint = countPair(basketObjects, "jam", "eggs");
    const forward = computeConfidence(forwardJoint, countItem(basketObjects, "jam"));
    const reversed = computeConfidence(forwardJoint, countItem(basketObjects, "eggs"));
    if (close(forward.value, reversed.value)) {
      throw new Error("confidence should differ between jam -> eggs and eggs -> jam");
    }
    if (!close(forward.value, 1 / 3) || !close(reversed.value, 1 / 2)) {
      throw new Error(`unexpected values: ${forward.value} vs ${reversed.value}`);
    }
    return `jam->eggs=${forward.value.toFixed(4)} vs eggs->jam=${reversed.value.toFixed(4)}`;
  });

  // 6. Duplicate items in a raw basket are counted once.
  check("duplicate items in a raw basket are counted once", () => {
    const deduped = dedupeBasket(["milk", "bread", "milk", "bread", "jam"]);
    if (deduped.length !== 3) throw new Error(`expected 3 unique items, got ${deduped.length}`);
    const duplicateBasket = [["milk", "bread", "milk", "bread"], ["milk"]];
    if (countItem(duplicateBasket, "milk") !== 2) {
      throw new Error("countItem must count each basket once, not each row");
    }
    if (countPair(duplicateBasket, "milk", "bread") !== 1) {
      throw new Error("countPair must count each basket once");
    }
    return "dedupeBasket removed repeats; counting is per basket";
  });

  // 7. Empty result set renders an empty-state note.
  check("empty rule set renders an empty-state note", () => {
    const scratch = document.createElement("div");
    renderResults([], DATASET_INDEX, scratch);
    if (!/no rules passed/i.test(scratch.textContent)) {
      throw new Error("expected an empty-state message");
    }
    return "empty state rendered";
  });

  // 8. Invalid thresholds are rejected.
  check("invalid thresholds are rejected", () => {
    if (validateThresholds(0.01, 0.3).ok !== true) throw new Error("valid thresholds rejected");
    if (validateThresholds(Number.NaN, 0.3).ok !== false) throw new Error("NaN support accepted");
    if (validateThresholds(0.01, 1.5).ok !== false) throw new Error("confidence > 1 accepted");
    if (validateThresholds(0, 0.3).ok !== false) throw new Error("zero support accepted");
    return "valid accepted, invalid rejected";
  });

  // 9. Zero-denominator guards.
  check("zero-denominator guards return undefined metrics", () => {
    if (computeConfidence(0, 0).defined !== false) throw new Error("count(A)=0 must be undefined");
    if (computeLift({ value: 0.5, defined: true }, 0, 5).defined !== false) {
      throw new Error("count(B)=0 must be undefined");
    }
    if (computeSupport(0, 0).defined !== false) throw new Error("N=0 must be undefined");
    return "zero denominators return defined=false";
  });

  // 10. Student function: frequent itemsets (pending until implemented).
  check("findFrequentItemsets reproduces the fixture's frequent itemsets", () => {
    const itemsets = findFrequentItemsets(basketObjects, 0.4);
    const pairs = itemsets.filter((set) => set.items.length === 2);
    if (pairs.length === 0) throw new Error("no frequent pairs found at support >= 0.4");
    return `${itemsets.length} itemsets`;
  });

  // 11. Student function: rules (pending until implemented).
  check("generateRules reproduces the fixture's rules", () => {
    const itemsets = findFrequentItemsets(basketObjects, 0.2);
    const rules = generateRules(itemsets, 0.5);
    if (rules.length === 0) throw new Error("no rules found at support >= 0.2, confidence >= 0.5");
    return `${rules.length} rules`;
  });

  const passed = checks.filter((c) => c.status === "PASS").length;
  const failed = checks.filter((c) => c.status === "FAIL").length;
  const pendingCount = checks.filter((c) => c.status === "PENDING").length;

  const lines = [
    `HW4 self-checks — pass ${passed}, fail ${failed}, pending ${pendingCount} (of ${checks.length})`,
    "",
    ...checks.map((c) => `${c.status.padEnd(7)} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`),
  ];
  const text = lines.join("\n");

  const target = logElement || document.getElementById("testLog");
  if (target) target.textContent = text;

  return { passed, failed, pending: pendingCount, checks };
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

/**
 * Populate the stock -> description lookup used by the renderers from the
 * dictionary-encoded tables embedded in `window.HW4`.
 *
 * @returns {void}
 */
function primeDescriptions() {
  data.stocks.forEach((stock, i) => {
    if (!descriptionByStock.has(stock)) {
      descriptionByStock.set(stock, data.descriptions[i]);
    }
  });
}

/**
 * Read the two sliders and return the thresholds as fractions in `(0, 1]`.
 *
 * @returns {{minSupport: number, minConfidence: number}}
 */
function readThresholds() {
  const supportInput = document.getElementById("min-support");
  const confidenceInput = document.getElementById("min-confidence");
  return {
    minSupport: Number(supportInput.value) / 100,
    minConfidence: Number(confidenceInput.value) / 100,
  };
}

/** Update the `<output>` readouts next to the two sliders. */
function syncThresholdLabels() {
  const supportInput = document.getElementById("min-support");
  const confidenceInput = document.getElementById("min-confidence");
  const supportOutput = document.getElementById("min-support-value");
  const confidenceOutput = document.getElementById("min-confidence-value");
  if (supportOutput) supportOutput.textContent = `${Number(supportInput.value).toFixed(1)}%`;
  if (confidenceOutput) confidenceOutput.textContent = `${Number(confidenceInput.value).toFixed(0)}%`;
}

/**
 * Read the thresholds, run the student pipeline, and render the results.
 *
 * @returns {void}
 */
function runPipeline() {
  const status = document.getElementById("status");
  if (!DATASET_INDEX) {
    if (status) {
      status.textContent = "Dataset not ready yet — reload the page.";
    }
    return;
  }
  const { minSupport, minConfidence } = readThresholds();
  const validation = validateThresholds(minSupport, minConfidence);
  if (!validation.ok) {
    if (status) status.textContent = validation.errors.join(" ");
    return;
  }
  try {
    if (status) status.textContent = "Mining frequent itemsets…";
    const itemsets = findFrequentItemsets(TRANSACTIONS, minSupport);
    const rules = generateRules(itemsets, minConfidence);
    renderResults(rules, DATASET_INDEX);
    if (status) status.textContent = `Done — ${rules.length} rule(s) at support \u2265 ${(minSupport * 100).toFixed(1)}% and confidence \u2265 ${(minConfidence * 100).toFixed(0)}%.`;
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    const resultsEl = document.getElementById("results");
    if (resultsEl) {
      resultsEl.innerHTML =
        '<p class="empty-state">Run failed &mdash; the rule miner did not complete. ' +
        "Implement the <code>TODO(hw4)</code> functions, then press &ldquo;Run rules&rdquo;. " +
        `Error: ${escapeHtml(message)}</p>`;
    }
    if (status) status.textContent = message;
  }
}

/**
 * Wire the controls once the DOM is ready, then build the dataset index from the
 * baskets already decoded from `window.HW4` and render the summary.
 *
 * The data is already in memory (embedded by `transactions.js`), so there is no
 * fetch and no error path beyond the `window.HW4` guard at the top of this file.
 *
 * @returns {void}
 */
function init() {
  renderWorkedExample(tinyWorkedExample());
  syncThresholdLabels();

  const supportInput = document.getElementById("min-support");
  const confidenceInput = document.getElementById("min-confidence");
  if (supportInput) supportInput.addEventListener("input", syncThresholdLabels);
  if (confidenceInput) confidenceInput.addEventListener("input", syncThresholdLabels);

  const runButton = document.getElementById("run-rules");
  if (runButton) runButton.addEventListener("click", runPipeline);

  const testButton = document.getElementById("run-tests");
  if (testButton) testButton.addEventListener("click", () => runTests());

  const status = document.getElementById("status");
  primeDescriptions();
  N = TRANSACTIONS.length;
  DATASET_INDEX = buildIndex(TRANSACTIONS);
  try {
    renderDatasetSummary(DATASET_INDEX);
  } catch (error) {
    // `renderDatasetSummary` is scaffolding, but guard it defensively so that an
    // unimplemented TODO(hw4) stub can never take the whole page down at load
    // time. The harness's "Run tests" button stays usable regardless.
    const summary = document.getElementById("dataset-summary-body");
    if (summary) {
      summary.innerHTML =
        '<p class="empty-state">Implement the TODO(hw4) functions to activate ' +
        "the dataset summary.</p>";
    }
  }
  if (status) {
    status.textContent = `Dataset ready: ${N.toLocaleString("en-US")} baskets, ${data.N_ITEMS.toLocaleString("en-US")} distinct items. Implement the TODO(hw4) functions, then press “Run rules”.`;
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
}
