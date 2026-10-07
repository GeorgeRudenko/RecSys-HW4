# HW4 verification scripts

Not part of the `week4/` deliverable. They re-run the checks cited in the report
against the unchanged page files. Node.js >= 18; `browser_test.js` also needs Playwright.

| Script | What it checks |
|---|---|
| `baseline.js [dir]` | runs the page's own self-check harness (`runTests`) in Node; pass `../RecSys-LLMs/week4` to see the starter's 2 / 0 / 9 |
| `verify.js` | Apriori vs an independent brute-force counter (1-3% support), rule metrics vs `countItemset` + the readme formulas, both directions, threshold edge cases, the anchor fact |
| `browser_test.js` | the real page in headless Chromium from `file://`: summary, Run tests, Run rules at four settings, row click, Reverse direction |
| `analysis.js` | the threshold grid and the candidate rules used in the report |
| `indep.py ../week4/transactions.js` | recounts the report's rules directly from the raw payload (no app code) |

`harness.js` loads `transactions.js` + `script.js` into a Node VM with a minimal fake DOM.
