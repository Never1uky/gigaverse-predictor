# Gigaverse Predictor 1.6.3

## Combat EV — lookahead continuation

Enemies near-uniform → Acc ceiling ~35%; invest in **expected dungeon depth / HP after**, not +1% Acc.

**Default Play** now uses lookahead depth=2:

- leaf ≈ `(1−γ)·U₁ + γ·bestOneStep(after)`, γ=0.65
- `opts.lookaheadDepth: 1` recovers classic one-step
- U∈[−1,1], Balanced 55/35/10, certain-kill + DEATH_VETO unchanged
- Unknown HP prior ≤0.7; no invent HP=100; no always-Shield; no DEATH=−1e6

Phase 2 prediction (Markov → enemyCid → global) **unchanged**.

### Dump gate (1764 moves, 1297 scored)

| | depth=1 | depth=2 |
|--|--------:|--------:|
| P(death\|Play) | 7.8% | 7.8% |
| E[HP after] | 14.69 | **14.94** |
| Shield share | 31.8% | 47.6% (&lt;55%) |

## Capture (privacy-safe)

- `fightRound` / `roomSeq` / `fightId` on new saves
- Local `advisorSnapshot`: recommendedMove, ranked[{move,ev,pDeath}], percents, n, confidence — no JWT / actionToken / cookies

## Docs / audit

- `scripts/backtest/EV-CONTINUATION.md`
- `scripts/backtest/ev-continuation-audit.mjs`

## Update

1. `chrome://extensions` → **Reload**
2. Hard refresh `gigaverse.io/play`
3. Overlay EV still ~[−1,+1]; Play may Shield more when continuation favors survive-to-next-room
