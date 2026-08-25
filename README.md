<img src="resources/mascot/mascot_dark_classic.svg" align="left" width="140" style="margin-right: 20px; margin-bottom: 10px;" alt="Mignon UI Mascot" />

### Mignon UI

**The Local AI Roleplay Frontend Client.**<br/>
*Immerse yourself in stories and scenarios with multiple AI characters in a single room, styled with stunning custom aesthetic themes.*

<p>
  <a href="https://mignon-ui.github.io/Mignon-UI/"><img src="https://img.shields.io/badge/Website-Live_Site-ff69b4?style=for-the-badge" alt="Website" /></a>
  <a href="https://mignon-ui.github.io/Mignon-UI/app/"><img src="https://img.shields.io/badge/Web_App-Try_Online-6b3649?style=for-the-badge" alt="Try Online" /></a>
  <a href="https://github.com/Mignon-UI/Mignon-UI/releases"><img src="https://img.shields.io/github/v/tag/Mignon-UI/Mignon-UI?style=for-the-badge&color=00f0ff&label=Release" alt="Latest Release" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0-a3defe?style=for-the-badge" alt="License" /></a>
</p>

<br clear="left"/>

---

## <img src="https://api.iconify.design/fluent-emoji-flat:sparkles.svg" width="22" height="22" /> Key Features

<dl>
  <dt><img src="https://api.iconify.design/fluent-emoji-flat:desktop-computer.svg" width="18" height="18" /> <b>Clean UI & Simple Setup</b></dt>
  <dd>Mignon UI is designed to be clean, distraction-free, and simple to navigate. We've pre-configured the heavy lifting behind the scenes (prompt formatting, model settings) so you can get straight to your stories without configuration fatigue.</dd>

  <dt><img src="https://api.iconify.design/fluent-emoji-flat:busts-in-silhouette.svg" width="18" height="18" /> <b>Dynamic Multi-Bot Lobbies</b></dt>
  <dd>Chat with multiple AI characters at the same time. Characters take turns naturally, talking to you and each other based on their personality, context, and proximity without you having to manually prompt each one. (You can also set any character card as your active persona to play <em>as</em> them!)</dd>

  <dt><img src="https://api.iconify.design/fluent-emoji-flat:card-index-dividers.svg" width="18" height="18" /> <b>Tavern Card Imports & Lorebooks</b></dt>
  <dd>Bring your favorite characters with you by importing standard character cards (.png V2 format) and JSON cards instantly. Link world lorebooks to characters or rooms to dynamically trigger world rules and locations.</dd>

  <dt><img src="https://api.iconify.design/fluent-emoji-flat:brain.svg" width="18" height="18" /> <b>Smart Story Memory</b></dt>
  <dd>Keeps long roleplays going without characters forgetting who they are or what happened. Summarizes key events into milestone chapters and uses smart local memory retrieval.</dd>

  <dt><img src="https://api.iconify.design/fluent-emoji-flat:locked-with-key.svg" width="18" height="18" /> <b>Private & Offline-First</b></dt>
  <dd>Your chats, characters, and API keys are stored in a secure local database directly on your device. Zero telemetry, and no cloud dependencies by default. Run completely offline via Ollama or Kobold.cpp, or connect your personal API keys.</dd>

  <dt><img src="https://api.iconify.design/fluent-emoji-flat:artist-palette.svg" width="18" height="18" /> <b>Aesthetic Themes</b></dt>
  <dd>Instantly switch between beautiful custom styles like <em>Bubblegum Pop</em>, <em>Neo-Cyber</em>, <em>Dollhouse</em>, <em>Builder</em>, <em>Mignon UI Classic</em>, <em>Dark Yellow</em>, and <em>Sketch Book</em>, with full support for light and dark modes.</dd>
</dl>

---

## <img src="https://api.iconify.design/fluent-emoji-flat:framed-picture.svg" width="22" height="22" /> Screenshots

<p align="center">
  <img src="docs/images/welcome.png" width="48%" alt="Mignon UI Welcome" />
  <img src="docs/images/chat_interface.png" width="48%" alt="Mignon UI Chat" />
</p>
<p align="center">
  <img src="docs/images/theme_settings.png" width="48%" alt="Mignon UI Themes" />
  <img src="docs/images/workspace_customizer.png" width="48%" alt="Mignon UI Customizer" />
</p>
<p align="center">
  <img src="docs/images/character_edit.png" width="48%" alt="Mignon UI Edit Character" />
</p>

---

## <img src="https://api.iconify.design/fluent-emoji-flat:rocket.svg" width="22" height="22" /> Getting Started

### <img src="https://api.iconify.design/fluent-emoji-flat:package.svg" width="20" height="20" /> Installation

To install Mignon UI, visit the **[Releases](https://github.com/Mignon-UI/Mignon-UI/releases)** page of this repository and download the package for your platform:

#### <img src="https://api.iconify.design/logos:microsoft-windows.svg" width="18" height="18" /> Windows
* **Installer**: Download the `.exe` installer, run it, and follow the setup wizard.
* **Portable**: Download the `Mignon_UI_windows_portable.zip` archive, extract it, and run `Mignon UI.exe`.
* **Note**: Since the app is newly compiled and unsigned, Windows SmartScreen will show a warning (*"Windows protected your PC"*). Click **"More info"** and then **"Run anyway"** to proceed.

#### <img src="https://api.iconify.design/logos:apple.svg" width="18" height="18" /> macOS (Universal: Intel & Apple Silicon)
* **Installer**: Download the `.dmg` file, open it, and drag **Mignon UI** to your `Applications` folder.
* **Note (First Launch)**: Since the app is unsigned, macOS Gatekeeper will block it (*"Developer cannot be verified"*). 
  To open it, **right-click** (or hold `Control` and click) the **Mignon UI** icon in your `Applications` folder, select **Open** from the menu, and click **Open** again in the confirmation dialog. You only need to do this once.

#### <img src="https://api.iconify.design/logos:linux-tux.svg" width="18" height="18" /> Linux
* **Debian / Ubuntu**: Download the `.deb` package and install it via your package manager (`sudo dpkg -i mignon-ui*.deb`).
* **Universal AppImage**: Download the `.AppImage` file, make it executable (`chmod +x Mignon-UI*.AppImage`), and double-click to run.

### <img src="https://api.iconify.design/fluent-emoji-flat:magic-wand.svg" width="20" height="20" /> Onboarding Setup

When you launch Mignon UI for the first time, our **Onboarding Wizard** will walk you through the setup in under a minute:

1. **Aesthetics**: Pick your favorite theme design and light/dark mode preference.
2. **AI Connection**: Choose your language model source (local or cloud).
3. **Persona Profile**: Define your name, avatar, and background story so the bots know who they are speaking to.

---

## <img src="https://api.iconify.design/fluent-emoji-flat:electric-plug.svg" width="22" height="22" /> Connecting Your AI Engine

Mignon UI is a frontend client that connects to your choice of local or cloud AI backends. Here is how to configure them:

### <img src="https://api.iconify.design/simple-icons:ollama.svg?color=%2300b4d8" width="18" height="18" /> Local Ollama (Recommended for Beginners)
1. Download and run [Ollama](https://ollama.com/).
2. Run your preferred model in your terminal (e.g., `ollama run llama3`).
3. In Mignon UI, select **Local Ollama** as your provider. The default address is `http://127.0.0.1:11434/v1`.

### <img src="https://api.iconify.design/fluent-emoji-flat:high-voltage.svg" width="18" height="18" /> Local Kobold.cpp (Recommended for Low-Spec Gaming Laptops)
Kobold.cpp is highly optimized for systems with limited VRAM (e.g., 6GB VRAM GPUs).
1. Download and run [Kobold.cpp](https://github.com/LostRuins/koboldcpp).
2. For optimal performance, enable **ContextShift** and **SmartCache**, and use **KV Cache Quantization (`q4_0`)** to save up to 1.6GB of VRAM (see our [6GB Laptop Tuning Guide](docs/optimization.md) for step-by-step instructions).
3. In Mignon UI, select **Local Kobold.cpp** as your provider. The default address is `http://127.0.0.1:5001/v1`.

### <img src="https://api.iconify.design/fluent-emoji-flat:cloud.svg" width="18" height="18" /> Cloud OpenRouter
1. Get an API key from [OpenRouter](https://openrouter.ai/).
2. In Mignon UI, select **Cloud OpenRouter** as your provider, paste your API key, and choose your model (e.g., `meta-llama/llama-3.1-8b-instruct:free`).

### <img src="https://api.iconify.design/fluent-emoji-flat:control-knobs.svg" width="18" height="18" /> Custom (OpenAI-Compatible)
Connect to any OpenAI-compatible server (like LM Studio, Groq, DeepSeek, or Gemini). Simply enter your endpoint URL and optional API key.

---

## <img src="https://api.iconify.design/fluent-emoji-flat:hammer-and-wrench.svg" width="22" height="22" /> Developer Setup & Compiling from Source

If you want to run the project in development mode or compile your own installers:

### <img src="https://api.iconify.design/fluent-emoji-flat:clipboard.svg" width="18" height="18" /> Prerequisites
Ensure you have the following installed:
* **Bun** (v1.4.0 or higher) *(or Node.js v20+)*
* **Rust / Cargo** (v1.75 or higher)
* **OS Build Tools**:
  * **Windows**: Visual Studio Community Build Tools (with the **Desktop development with C++** workload enabled).
  * **macOS**: Xcode Command Line Tools (`xcode-select --install`).
  * **Linux**: `webkit2gtk-4.1` and build packages (e.g., `build-essential`, `libssl-dev`, `libgtk-3-dev`).

### <img src="https://api.iconify.design/fluent-emoji-flat:check-mark-button.svg" width="18" height="18" /> Quick Start (Development Mode)
1. Clone the repository and install dependencies:
   ```bash
   bun install
   ```
2. Launch the developer sandbox:
   ```bash
   bun run tauri:dev
   ```

---

## <img src="https://api.iconify.design/fluent-emoji-flat:page-facing-up.svg" width="22" height="22" /> License & Legal Notice

* **Software License**: This project is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for complete details.
* **Trademark & Brand Assets**: The source code is freely open under the AGPL-3.0 license. However, the name **"Mignon UI"**, the official mascot, logo, and associated visual brand assets are proprietary trademarks of the project. They may not be used to endorse, brand, or distribute commercial or derivative products without prior written permission.
* **Documentation**: Detailed technical blueprints can be found in our [Documentation Directory](docs/index.md).



