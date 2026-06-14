<img src="resources/mascot/mascot_dark_classic.svg" align="left" width="140" style="margin-right: 20px; margin-bottom: 10px;" alt="Mignon UI Mascot" />

### Mignon UI

**The Local AI Roleplay Frontend Client.**<br/>
*Immerse yourself in stories and scenarios with multiple AI characters in a single room. Customize your space with interactive snapping stickers, and choose from stunning aesthetic themes.*

<br clear="left"/>

---

## ✨ Key Features

* **👥 Dynamic Multi-Bot Lobbies**: Chat with multiple AI characters at the same time. Characters take turns naturally, talking to you and each other, based on their personality, context, and proximity without you having to manually prompt each one.
* **🧠 Infinite Story Memory ("Chronicle Memory")**: Keeps long roleplays going without the bots forgetting who they are or what happened. Summarizes key events into milestone chapters and uses smart local memory retrieval.
* **🖼️ Snapping Decals Canvas**: Express yourself by customizing your chat workspace. Drag, rotate, scale, and place decals/stickers anywhere on the screen—they snap neatly to panels and chat bubbles.
* **🎨 Aesthetic Themes**: Instantly switch between beautiful custom styles like *Bubblegum*, *Cyberpunk*, *Cozy Slate*, *Parchment*, *Amber Matrix*, and *Hand-Drawn Sketch Book*, with full support for light and dark modes.
* **🔒 100% Private & Offline**: Your chats, characters, and API keys are stored in a secure local database directly on your device. Zero telemetry, zero cloud dependencies.

---

## 🚀 Getting Started

### 📦 Installation

To install Mignon UI on your device:

1. Go to the **Releases** page of this repository and download the installer package:
   * **Windows**: Download the `.msi` or `.exe` installer, run it, and follow the setup wizard.
   *(Note: Precompiled installers for macOS, Linux, and mobile are currently in development. If you are on these platforms, you can compile and run Mignon UI from source by following the Developer Setup below).*
2. Launch the application to begin.

### 🔷 Onboarding Setup

When you launch Mignon UI for the first time, our **Onboarding Wizard** will walk you through the setup in under a minute:

1. **Aesthetics**: Pick your favorite theme design and light/dark mode preference.
2. **AI Connection**: Choose your language model source (local or cloud).
3. **Persona Profile**: Define your name, avatar, and background story so the bots know who they are speaking to.

---

## 🔌 Connecting Your AI Engine

Mignon UI is a frontend client that connects to your choice of local or cloud AI backends. Here is how to configure them:

### 🟢 Local Ollama (Recommended for Beginners)
1. Download and run [Ollama](https://ollama.com/).
2. Run your preferred model in your terminal (e.g., `ollama run llama3`).
3. In Mignon UI, select **Local Ollama** as your provider. The default address is `http://127.0.0.1:11434/v1`.

### 🟡 Local Kobold.cpp (Recommended for Low-Spec Gaming Laptops)
Kobold.cpp is highly optimized for systems with limited VRAM (e.g., 6GB VRAM GPUs).
1. Download and run [Kobold.cpp](https://github.com/LostRuins/koboldcpp).
2. For optimal performance, enable **ContextShift** and **SmartCache**, and use **KV Cache Quantization (`q4_0`)** to save up to 1.6GB of VRAM (see our [6GB Laptop Tuning Guide](docs/optimization.md) for step-by-step instructions).
3. In Mignon UI, select **Local Kobold.cpp** as your provider. The default address is `http://127.0.0.1:5001/v1`.

### 🔵 Cloud OpenRouter
1. Get an API key from [OpenRouter](https://openrouter.ai/).
2. In Mignon UI, select **Cloud OpenRouter** as your provider, paste your API key, and choose your model (e.g., `meta-llama/llama-3.1-8b-instruct:free`).

### 🟣 Custom (OpenAI-Compatible)
Connect to any OpenAI-compatible server (like LM Studio, Groq, DeepSeek, or Gemini). Simply enter your endpoint URL and optional API key.

---

## 🛠️ Developer Setup & Compiling from Source

If you want to run the project in development mode or compile your own installers:

### 📋 Prerequisites
Ensure you have the following installed:
* **Node.js** (v18.0.0 or higher)
* **Rust / Cargo** (v1.75 or higher)
* **OS Build Tools**:
  * **Windows**: Visual Studio Community Build Tools (with the **Desktop development with C++** workload enabled).
  * **macOS**: Xcode Command Line Tools (`xcode-select --install`).
  * **Linux**: `webkit2gtk-4.1` and build packages (e.g., `build-essential`, `libssl-dev`, `libgtk-3-dev`).

### 🔷 Quick Start (Development Mode)
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```
2. Launch the developer sandbox:
   ```bash
   npm run tauri:dev
   ```

---

## 📄 License & Links

* **License**: This project is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for complete details.
* **Documentation**: Detailed technical blueprints can be found in our [Documentation Directory](docs/index.md).
