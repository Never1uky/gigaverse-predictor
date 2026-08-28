# Gigaverse Predictor 1.6.1

## Compact popup

User-facing popup is short:

- Combat: enemy, N, move %, EV (±0.xx), PLAY, reason, confidence
- Fishing: compact active view only (no idle API/keys dump)
- Stats: one line (`moves · enemies · runs`)

Developer diagnostics (API paths, JSON keys, fish grid, enemy transition tables, accuracy dump) live under **Developer diagnostics** (`<details>`, closed by default). Debug button still toggles logging and opens that panel.

## Audit (no production model change)

- Dataset export audited: `scripts/backtest/combat-audit-1500.mjs`
- Report: `scripts/backtest/COMBAT-PREDICTOR-1500-AUDIT.md`
- Recommendation: **keep phase2 predictor** + **keep EV 1.6.0 utility** (no OOS win for challengers)

## Update

1. Reload unpacked extension from `dist/`
2. Confirm popup is compact; expand Developer diagnostics only when needed
