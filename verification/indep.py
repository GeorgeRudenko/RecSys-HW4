# Independent recount straight from the raw transactions.js payload (no app code).
import json, re, sys, math
src = open(sys.argv[1], encoding='utf-8').read()
payload = json.loads(re.search(r'window\.HW4 = (\{.*\});', src, re.S).group(1))
stocks, baskets = payload['stocks'], payload['baskets']
idx = {s: i for i, s in enumerate(stocks)}
N = len(baskets)
def count(codes, bs=baskets):
    want = {idx[c] for c in codes}
    return sum(1 for b in bs if want <= set(b))
for A, B in [('22698', '22697'), ('22727', '85123A'), ('22916', '22917')]:
    ab, a, b = count([A, B]), count([A]), count([B])
    print(f"{A} -> {B}: N={N} count(A∪B)={ab} count(A)={a} count(B)={b} "
          f"support={ab/N:.6f} confidence={ab/a:.6f} lift={(ab/a)/(b/N):.6f}  [exact lift = {ab*N}/{a*b}]")
# Robustness: same rules on baskets with < 100 distinct items vs >= 100 (wholesale-like)
small = [b for b in baskets if len(b) < 100]; big = [b for b in baskets if len(b) >= 100]
for name, bs in [('baskets < 100 items', small), ('baskets >= 100 items', big)]:
    n = len(bs)
    for A, B in [('22698', '22697'), ('22727', '85123A')]:
        ab, a, b = count([A, B], bs), count([A], bs), count([B], bs)
        print(f"  {name:22s} n={n:5d} {A}->{B}: AB={ab} A={a} B={b} conf={ab/a if a else float('nan'):.4f} lift={(ab/a)/(b/n) if a and b else float('nan'):.3f}")
# Simple two-proportion sample size (alpha=0.05 two-sided, power=0.8)
def n_per_arm(p1, d):
    p2 = p1 + d; z = 1.959964 + 0.841621
    return math.ceil(z * z * (p1 * (1 - p1) + p2 * (1 - p2)) / d / d)
p_rev = count(['22697', '22698']) / count(['22697'])
print(f"baseline attach GREEN->PINK = {p_rev:.4f}; n per arm for +5pp: {n_per_arm(p_rev, .05)}, +10pp: {n_per_arm(p_rev, .10)}")
