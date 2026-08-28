# Gigaverse Predictor 1.6.0

## Combat EV rework (breaking overlay scale)

Root cause of million-scale EV: legacy `scoreOutcome` used `DEATH = 1e6`, so UI showed ≈ `−1e6 × pDeath` (and worse when `EV /= mass` under hard constraints). Not a display bug.

**New utility** U ∈ [−1, 1] (Balanced weights 55% square-HP survival / 35% damage / 10% kill bonus):

- Death alone → −1; mutual → 0
- Else `0.55·hpR² + 0.35·enR + 0.10·killBonus − 0.03` last-charge lock
- Unknown HP uses 0.7 prior (not invented 100 HP)

Unchanged: `resolveRound`, hard constraints, certain-kill + `DEATH_VETO`, Phase 2 prediction (Dirichlet / backoff / cid pooling).

Overlay: `EV +0.42` / `EV -0.60` (`toFixed(2)` with sign).

## Docs / audit

- `scripts/backtest/EV-REWORK.md` — Phase 1 dump + formula + backtest notes
- `scripts/backtest/combat-audit.mjs` — survival / counterfactual U metrics

## Update

1. `chrome://extensions` → **Reload** (one unpacked copy)
2. Hard refresh `gigaverse.io/play`
3. Confirm combat overlay EV is in ~[−1, +1], not hundreds of thousands
