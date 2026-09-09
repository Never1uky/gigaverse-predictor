# Gigaverse Predictor 0.1.2 Beta

Passive Chrome MV3 combat and fishing advisor for [Gigaverse](https://gigaverse.io/). Distributed through GitHub, not the Chrome Web Store.

- Combat: Sword / Shield / Spell probabilities plus bounded survival-focused EV and a clearer PLAY / survival UI.
- Fishing: Pier 3×3 and Dendren 4×4 advisor.
- Data: local history with optional, user-initiated sanitized community import/export.
- Research: local **Export EV research** JSONL (ATK/DEF/shield) for offline analysis — no tokens, no upload.
- No autoplay and no extension-generated game actions.

The extension source is kept directly in this repository. The downloadable artifact is attached to the [v0.1.2 GitHub release](https://github.com/Never1uky/gigaverse-predictor/releases/tag/v0.1.2).

## Install the public beta

1. Download `gigaverse-predictor-v0.1.2.zip` and `gigaverse-predictor-v0.1.2.zip.sha256` from the GitHub release.
2. Verify the ZIP in PowerShell:

   ```powershell
   (Get-FileHash .\gigaverse-predictor-v0.1.2.zip -Algorithm SHA256).Hash.ToLower()
   ```

3. Compare the output with the value in the `.sha256` file (expected: `402478765be585e895cf1486ea37885447bf63c1df986e7c1101f9d994637006`).
4. Extract the ZIP into a permanent directory.
5. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
6. Select the extracted directory containing `manifest.json`.
7. Open or refresh `https://gigaverse.io/play`.

Chrome may warn about developer-mode extensions because this beta is not installed from the Chrome Web Store. Verify the checksum and review the source before installing.

## VirusTotal

[VirusTotal report for `gigaverse-predictor-v0.1.2.zip`](https://www.virustotal.com/gui/file/402478765be585e895cf1486ea37885447bf63c1df986e7c1101f9d994637006?nocache=1) — **0** security vendors flagged the file as malicious (0/63).

## Security and permissions

The extension has no wallet integration and does not ask for a seed phrase, private key, or transaction signature. Never provide those secrets to anyone claiming to offer support.

The page interceptor observes Gigaverse responses to calculate local advice. It does not replace or submit combat/fishing actions.

- `storage` stores settings, observed combat/fishing history, imported community records, and advisor snapshots in `chrome.storage.local`.
- `unlimitedStorage` prevents Chrome's normal extension-storage quota from truncating longer local histories. Data is not uploaded automatically.
- `activeTab` lets the popup connect to the selected Gigaverse tab after user interaction.
- `tabs` locates open Gigaverse tabs and sends overlay/state updates to them.
- `scripting` injects the passive interceptor when a Gigaverse navigation needs it.
- `webNavigation` detects Gigaverse navigations and frames so the interceptor can be restored after page transitions.
- Host access is declared only for `gigaverse.io` and its subdomains, including `builds.gigaverse.io`. Content scripts are not registered for unrelated websites.

Community import/export is user initiated. **Export community** is the thin shareable schema (no ATK). **Export EV research** is a local research file with ATK/DEF/shield for offline EV audits; it also strips secrets and refuses to save if secret patterns remain. Raw JSON, CSV, Full, and fishing diagnostic exports stay absent from the popup and rejected by the background worker.

## Share move history

The public repository dataset currently contains **2,169 sanitized exchanges** from **145 runs**, covering **502 fights** and **13 enemy IDs**:

- [`data/community/combat.jsonl`](data/community/combat.jsonl)
- [`data/community/fishing.jsonl`](data/community/fishing.jsonl) (empty until fishing submissions arrive)

The ZIP includes this dataset for **Load bundled dataset**. It can also be downloaded separately and loaded through **Community → Import**.

To contribute prediction history:

1. Play normally with the extension enabled.
2. Open the popup and select **Community → Export**.
3. Review the generated `giga-community-YYYY-MM-DD.jsonl` file in a text editor.
4. Attach it to the [community move history submissions issue](https://github.com/Never1uky/gigaverse-predictor/issues/2). If GitHub does not accept `.jsonl`, ZIP only that file first.

Only share **Export community** publicly. Do not post EV research files unless you intentionally want ATK/DEF stats shared with trusted reviewers. Never share seed phrases, JWT, cookies, or action tokens.

## Testing and feedback

Please use the [public beta feedback issue](https://github.com/Never1uky/gigaverse-predictor/issues/1) for bugs and results.

Suggested checks:

- Combat overlay shows probs, EV, PLAY, survival, and confidence.
- Fishing overlay appears only during fishing.
- Both overlays disappear on the hub.
- Export community requires confirmation and saves locally.
- Export EV research requires confirmation and contains no `actionToken`.

## Evidence and limits

The release passed 129 automated tests. Component EV weights come from a validation-selected utility search on an ATK-rich dump; death veto remains enabled for safety. This does not yet prove greater end-to-end dungeon clear rate. Public beta feedback is intended to measure that gap.

## Development

No dependencies are required for the extension runtime. Run the test suite with:

```powershell
npm test
```
