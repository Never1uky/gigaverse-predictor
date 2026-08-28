# Gigaverse Predictor 0.1 Beta

This is the first public beta release outside the Chrome Web Store. The earlier 1.5.x–1.6.x entries in the repository document internal development and audit milestones; public versioning starts at 0.1.0.

## Included

- Passive combat overlay using Phase 2 enemy probabilities and bounded survival EV.
- Depth-2 continuation lookahead focused on preserving HP for later rooms.
- Pier 3×3 and Dendren 4×4 fishing advisor.
- Local combat/fishing history and optional, user-initiated community import/export.
- Privacy-safe advisor snapshots and fight/room sequence capture for future audits.

## Security model

- No wallet integration; never enter a seed phrase or private key.
- No transaction signing and no automated game actions.
- No automatic upload of logs or history.
- Sanitized **Export community** is intended for sharing.
- **Export Full** may contain local action tokens and must remain private.
- Website access is declared only for Gigaverse domains. See `Security and permissions` in the root README for each manifest permission.

## Evidence and limits

- Automated suite: 105 tests at release preparation.
- EV continuation audit: 1,764 historical moves; 1,297 rows had enough state to score.
- Expected HP after the advised move increased from 14.69 (one-step) to 14.94 (lookahead), while estimated death probability remained 7.8%.
- This is a beta result, not proof of increased end-to-end dungeon depth. The historical dataset lacks reliable end-of-run reasons, and oracle replay can overstate live policy performance.

## Install

1. Download the ZIP and `.sha256` file from the GitHub release.
2. Verify SHA-256 using the command in the root README.
3. Extract the ZIP.
4. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
5. Select the extracted directory containing `manifest.json`.

Please report beta results in the public feedback issue linked from the GitHub release. Never post seed phrases, private keys, cookies, JWTs, action tokens, or a Full Export.
