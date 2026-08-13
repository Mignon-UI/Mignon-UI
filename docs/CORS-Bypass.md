# Mignon UI Connection Guide

Browsers enforce a security mechanism called **CORS (Cross-Origin Resource Sharing)**. By default, this blocks web pages (like the online demo hosted on GitHub Pages) from communicating with local servers running on your machine (like Ollama on `localhost:11434` or Kobold.cpp on `localhost:5001`).

To use your local hardware models with the web demo, you have two options:

---

## ⚡ Option A: Use a Browser Extension (Easiest — 5 Seconds)

The lowest-friction way to bypass browser blocks is to install a browser extension that temporarily adds the required CORS headers to your local API requests.

1. Install a trusted CORS bypass extension from your web store:
   * **Chrome / Brave / Edge**: [Allow CORS: Access-Control-Allow-Origin](https://chromewebstore.google.com/detail/allow-cors-access-control/lhobafceokcoocneaejonpfgheejoine)
   * **Firefox**: [CORS Everywhere](https://addons.mozilla.org/en-US/firefox/addon/cors-everywhere/)
2. Open the extension from your browser's toolbar and toggle it **ON** (the icon will light up or turn green).
3. Go back to Mignon UI Web Demo, open Settings, and click **Test Connection**.

---

## 🛠️ Option B: Configure Your Local LLM Engine

If you prefer not to install browser extensions, you can configure your local engine to explicitly allow incoming requests from the Mignon UI website.

### 1. For Ollama

You must set the `OLLAMA_ORIGINS` environment variable to permit connections from `https://mignon-ui.github.io` (or `http://localhost:3000` if previewing locally).

#### Windows
1. Close Ollama from the Windows system tray (right-click the taskbar tray icon and click **Quit**).
2. Open **PowerShell** and run:
   ```powershell
   [Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "https://mignon-ui.github.io", "User")
   ```
3. Restart Ollama from your Start menu.

#### macOS
1. Open Terminal.
2. Run:
   ```bash
   launchctl setenv OLLAMA_ORIGINS "https://mignon-ui.github.io"
   ```
3. Restart the Ollama application.

#### Linux
If running as a systemd service:
1. Open edit mode: `sudo systemctl edit ollama.service`
2. Add these lines under the `[Service]` block:
   ```ini
   [Service]
   Environment="OLLAMA_ORIGINS=https://mignon-ui.github.io"
   ```
3. Reload systemd and restart the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart ollama
   ```

### 2. For Kobold.cpp

Launch Kobold.cpp with the `--cors` flag:
```bash
koboldcpp.exe --cors https://mignon-ui.github.io
```
*(If using the launcher GUI, check the "CORS" box under the settings tab).*

---

## 📦 Option C: Use the Desktop Client (Recommended)

To completely avoid browser sandbox restrictions, download the native Mignon UI desktop client. The desktop client runs natively outside the web browser, allowing direct, 100% offline, and secure connections to local Ollama, Kobold.cpp, and LM Studio engines with zero setup.

* [Download Client for Windows / macOS / Linux](https://github.com/Mignon-UI/Mignon-UI/releases)
