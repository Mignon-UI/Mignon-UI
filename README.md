# ✦ Mignon UI ✦

```
✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦
  ███╗   ███╗██████╗  ██████╗ ███╗   ██╗ ██████╗ ███╗   ██╗     ██╗   ██╗██╗
  ████╗ ████║╚══██╔══╝██╔════╝ ████╗  ██║██╔═══██╗████╗  ██║     ██║   ██║██║
  ██╔████╔██║   ██║   ██║  ███╗██╔██╗ ██║██║   ██║██╔██╗ ██║     ██║   ██║██║
  ██║╚██╔╝██║   ██║   ██║   ██║██║╚██╗██║██║   ██║██║╚██╗██║     ██║   ██║██║
  ██║ ╚═╝ ██║███████╗╚██████╔╝██║ ╚████║╚██████╔╝██║ ╚████║     ╚██████╔╝██║
  ╚═╝     ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝      ╚═════╝ ╚═╝
✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦ ─── ✦
```

> **The Ultra-Premium, Offline-First Local AI Roleplay Sandbox & Cognitive Storytelling Engine.**
> Designed for completely private, uncensored, immersive storytelling, optimized to extract maximum performance out of standard consumer desktop and mobile environments using a serverless **Tauri v2** shell, SQLite local relational storage, and advanced local offloading strategies.

---

## 🎨 Core Pillars & Capabilities

| Pillar | Technical Solution | Developer Benefit |
| :--- | :--- | :--- |
| **Absolute Privacy** | 100% Serverless Tauri v2 Shell + SQLite database stored in secure AppData. | Zero cloud API dependencies, zero leaks, and completely offline execution. |
| **Episodic Horizon Memory** | Chronicle Memory Book (Milestone chapters) + local JS/SQLite vector RAG search. | Smart memory indexing that scales infinitely without bloating active GPU context. |
| **Cognitive Turn Allocation** | Sociolinguistic Turn-Taking (coordinate turn auction) & Spatial Proximity filters | Multiple AI characters interact dynamically with zero conversational monologues. |
| **Aesthetic UI** | Modular CSS Design Tokens system with HSL dynamic theme swappers | Ultra-premium, hardware-accelerated aesthetic layers with instant custom theme loaders. |
| **Drag & Snap Canvas** | Absolute React Viewport canvas with 2D transformations & 30px snapping | Gamified layout decals that snap to active sidebars or chat bubble borders. |

---

## 📦 Installation & Setup

Mignon UI is built on a serverless Tauri v2 stack, requiring no local Python runtime, no server configuration, and no local port collisions.

### 📋 Prerequisites
Ensure you have the following installed on your system:
* **Node.js** (v18.0.0 or higher)
* **Rust / Cargo** (v1.75 or higher)
* **OS Build Tools**:
  * **Windows**: Visual Studio Community Build Tools (with the **Desktop development with C++** workload enabled).
  * **macOS**: Xcode Command Line Tools (`xcode-select --install`).
  * **Linux**: `webkit2gtk-4.1` and build packages (e.g. `build-essential`, `libssl-dev`, `libgtk-3-dev`).

---

### 🔷 Quick Start (Development Mode)

1. Clone or extract the repository files.
2. Open a terminal in the project directory and install frontend dependencies:
   ```bash
   npm install
   ```
3. Boot the development sandbox:
   ```bash
   npm run tauri:dev
   ```
   *This starts the Vite React application on `http://127.0.0.1:5173` and binds the native Tauri window frame directly to it.*

---

### 🔷 Production Compiling

To bundle the application into fully standalone desktop/mobile packages:

```bash
# Compile native installers (.msi / .exe for Win, .dmg / .app for Mac, .deb / .AppImage for Linux)
npm run tauri:build

# Initialize mobile templates
npx tauri android init
npx tauri ios init

# Launch development mode on Android / iOS
npm run tauri android dev
npm run tauri ios dev
```

The compiled database `darf.db` and secure tokens are isolated inside standard, platform-native application storage folders (e.g., `%APPDATA%/com.tauri.dev` on Windows), keeping user configurations safe and persistent.

---

## 📄 License

This project is licensed under the **GNU Affero General Public License v3 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for complete details.
