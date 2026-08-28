# Gigaverse Predictor 0.1.1

## Security fix: public exports

The withdrawn 0.1.0 beta exposed legacy diagnostic export controls. **Export JSON** and **Export CSV** included local `actionToken` fields; **Export Full** included private internal state.

0.1.1 removes these popup controls:

- Export JSON
- Export CSV
- Export Full
- Export fishing diagnostics

The background worker also rejects the legacy `EXPORT_JSON`, `EXPORT_CSV`, `EXPORT_FULL`, and `EXPORT_FISHING` messages with `private_export_disabled`. This prevents stale UI or extension-internal calls from returning private payloads.

**Export community** is now the only shareable export. It converts moves to the reduced community schema, removes sensitive keys, and refuses to return a file if its final JSONL still matches known secret patterns.

## Community data

The release bundles the initial sanitized combat history:

- 2,169 unique exchanges
- 145 runs
- 502 fights
- 13 enemy IDs
- 0 schema errors and 0 detected secret patterns

The original raw JSON is not bundled or published.

## Verification

- Full automated suite
- Regression checks that private export buttons are absent
- Regression checks that legacy export messages can only return `private_export_disabled`
- ZIP content and secret-pattern scan before release
