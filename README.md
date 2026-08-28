# Gigaverse Predictor 0.1 Beta

Passive Chrome MV3 combat and fishing advisor for [Gigaverse](https://gigaverse.io/). This is the first public beta and is distributed through GitHub, not the Chrome Web Store.

- Combat: Sword / Shield / Spell probabilities plus bounded survival EV and depth-2 continuation advice.
- Fishing: Pier 3×3 and Dendren 4×4 advisor.
- Data: local history with optional, user-initiated sanitized community import/export.
- No autoplay and no extension-generated game actions.

The extension source is kept directly in this repository. The downloadable artifact is attached to the [v0.1.0 GitHub release](https://github.com/Never1uky/gigaverse-predictor/releases/tag/v0.1.0).

## Install the public beta

1. Download `gigaverse-predictor-v0.1.0.zip` and `gigaverse-predictor-v0.1.0.zip.sha256` from the GitHub release.
2. Verify the ZIP in PowerShell:

   ```powershell
   (Get-FileHash .\gigaverse-predictor-v0.1.0.zip -Algorithm SHA256).Hash.ToLower()
   ```

3. Compare the output with the value in the `.sha256` file.
4. Extract the ZIP into a permanent directory.
5. Open `chrome://extensions`, enable **Developer mode**, and select **Load unpacked**.
6. Select the extracted directory containing `manifest.json`.
7. Open or refresh `https://gigaverse.io/play`.

Chrome may warn about developer-mode extensions because this beta is not installed from the Chrome Web Store. Verify the checksum and review the source before installing.

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

Community import/export is user initiated. **Export community** is sanitized. **Export Full** may contain local action tokens and must not be shared. The optional community Pull performs a read-only GET from a user-configured HTTPS URL with credentials omitted.

## Testing and feedback

Please use the [public beta feedback issue](https://github.com/Never1uky/gigaverse-predictor/issues) for bugs and results.

Suggested checks:

- Combat overlay appears in a dungeon and recommends an available move.
- Fishing overlay appears only during fishing.
- Both overlays disappear on the hub.
- Popup status and local counters update.
- Export community requires confirmation and saves locally.

Do not attach a seed phrase, private key, JWT, cookies, action tokens, or a Full Export. Share only a privacy-safe/sanitized export when it is needed for diagnosis.

## Evidence and limits

The release passed 105 automated tests. The continuation audit used 1,764 historical moves; on 1,297 scoreable rows, expected HP after the advised move increased from 14.69 to 14.94 while estimated death probability remained 7.8%.

This does not yet prove greater end-to-end dungeon depth. Historical run-end reasons are incomplete, and oracle replay can overstate live performance. Public beta feedback is intended to measure that gap.

## Development

No dependencies are required for the extension runtime. Run the test suite with:

```powershell
npm test
```
