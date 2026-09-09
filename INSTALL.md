# Install Gigaverse Predictor 0.1.2 Beta

Preferred path: GitHub Release ZIP → verify SHA-256 → Load unpacked.

## From the GitHub release

1. Download `gigaverse-predictor-v0.1.2.zip` and `gigaverse-predictor-v0.1.2.zip.sha256`
2. Verify:

   ```powershell
   (Get-FileHash .\gigaverse-predictor-v0.1.2.zip -Algorithm SHA256).Hash.ToLower()
   ```

   Expected: `402478765be585e895cf1486ea37885447bf63c1df986e7c1101f9d994637006`
3. Extract to a permanent folder
4. `chrome://extensions` → Developer mode → Load unpacked → that folder
5. Open https://gigaverse.io/play and refresh

VirusTotal: https://www.virustotal.com/gui/file/402478765be585e895cf1486ea37885447bf63c1df986e7c1101f9d994637006?nocache=1

## After install

1. Popup → optional **Community → Bundled**
2. Play normally; advice stays local
3. To share prediction history: **Community → Export** only
4. For local EV audits: **Research → Export EV research** (do not post publicly unless intentional)
5. Never share seed phrases, JWT, cookies, or action tokens
