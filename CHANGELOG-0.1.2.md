# Gigaverse Predictor 0.1.2

Public beta follow-up after 0.1.1. Still **passive**: no wallet access, no game POSTs, no autoplay, no automatic uploads.

## Combat EV

- Component expected utility from the COMBAT-4000 EV optimization audit (validation-selected weights).
- Hard death penalty (`−1`), linear HP survival, relative self-damage cost, gated kill bonus, critical-zone penalty.
- Utility stays **bounded in [−1, 1]** — no million-scale EV values.
- Keeps **certain-kill veto** and `DEATH_VETO=0.35`.
- Default lookahead depth **1** (matches the optimized one-step EU; depth 2 still available via opts).
- Prediction model unchanged (phase2: global + enemyCid + Markov).

## Combat UI

- Cleaner popup and in-page overlay layout:
  - Enemy / N
  - Move probabilities
  - EV table
  - ▶ PLAY callout
  - Survival bar
  - Confidence pill
- Structured reasons derived from the same EV components used to pick Play.

## Research export (local only)

- New **Research → Export EV research** button.
- Writes `giga-ev-YYYY-MM-DD.jsonl` with ATK/DEF/shield, pre/post HP, previous moves, advisor snapshot, and outcome flags.
- Same secret scanner as community export (`actionToken`, JWT, cookies, wallet patterns).
- Does **not** restore Export JSON / CSV / Full.
- Community export remains the thin shareable schema (no ATK).

## Privacy

- Legacy private exports remain disabled (`private_export_disabled`).
- EV research export requires two-step confirm and refuses output if secrets are detected.
- No login, JWT, cookies, or `actionToken` in either community or EV research files.

## Known limitations

- Single ATK-rich dump guided the utility port; a second OOS dump is still desirable.
- With death veto kept, Shield share can rise vs the research-only (no-veto) policy — safer, more defensive.
- Community JSONL still cannot train EV alone (no ATK); use **Export EV research** for local audits.

## Verification

- Full automated suite (`npm test`) including EV utility + EV export regression tests.
- ZIP content and secret-pattern scan before release.
- VirusTotal scan of the release ZIP (link to be added after upload).
