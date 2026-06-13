# 🚀 Setup, Launch, & Package Blueprints (Tauri v2)

This guide covers system requirements, installation workflows, local development execution, standalone desktop/mobile compiling, and troubleshooting protocols for the serverless **Tauri v2** version of **Mignon UI**.

---

## 📋 Prerequisite Grid

Ensure your local development machine matches these environmental guidelines before initializing the launch sequence:

| Dependency | Minimum Version | Target Version | Purpose |
| :--- | :--- | :--- | :--- |
| **Node.js** | v18.0.0 | v20.11.0 (LTS) | Powers the Vite dev server, frontend dependencies, and Tauri dev commands. |
| **Rust / Cargo** | v1.75.0 | v1.78.0+ | Native compiler engine and package manager building the native wrapper. |
| **OS Build Tools** | - | Latest | Compiler packages (MSVC Build Tools on Windows, Xcode on macOS, build-essential on Linux). |
| **Ollama** *(Optional)* | v0.1.30 | Latest | For local offline LLM inference and hosting. |
| **Kobold.cpp** *(Optional)* | v1.50 | Latest | Recommended for offline laptops (supporting ContextShift & KV cache compression). |

---

## 🛠️ Step-by-Step Installation

### 🔷 Step 1: Install OS System Dependencies

#### Windows:
1. Download and run the [Visual Studio Community Installer](https://visualstudio.microsoft.com/downloads/) or [Build Tools for Visual Studio](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
2. Select the **Desktop development with C++** workload.
3. Click Install and wait for it to complete.

#### macOS:
1. Install Xcode Command Line Tools:
   ```bash
   xcode-select --install
   ```

#### Linux (Debian/Ubuntu):
1. Install development and Webview packages:
   ```bash
   sudo apt-get update
   sudo apt-get install -y build-essential curl wget file libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
   # For Tauri v2:
   sudo apt-get install -y webkit2gtk-4.1
   ```

---

### 🔷 Step 2: Install Rustup (The Rust Toolchain)
1. **Windows**: Download and run [rustup-init.exe](https://rustup.rs/). Choose option `1` (default).
2. **macOS / Linux**: Run the installer in your terminal:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```
3. Restart your terminal or IDE after installation to update your system's `PATH`.

---

### 🔷 Step 3: Install Frontend Dependencies
Open a terminal in the root workspace folder and sync node modules:
```bash
npm install
```

---

## ⚡ Launching the Application

Mignon UI uses Vite for high-speed hot reloading during development and Tauri to coordinate the native bridge.

### Running in Development Mode
To start the Vite server and launch the desktop window container simultaneously:
```bash
npm run tauri:dev
```
*Behind the scenes, Tauri launches `npm run dev` to host the React application on `http://127.0.0.1:5173` and binds the native Webview frame directly to it.*

---

## 📦 Standalone Native Packaging

Mignon UI packages cleanly into self-contained, standalone binaries for desktop and mobile platforms.

### 🔷 Desktop Compilers (Windows, macOS, Linux)
To compile and bundle optimized installer executables:
```bash
npm run tauri:build
```
* **Windows**: Compiles to a standalone `.msi` and `.exe` installer.
* **macOS**: Compiles to a `.app` container and `.dmg` disk image.
* **Linux**: Compiles to a `.deb` package and standard `.AppImage`.

### 🔷 Mobile Targets (Android & iOS)
Tauri v2 supports compiling for mobile screens out of the box.

#### Android Setup:
1. Ensure the **Android SDK**, **Android NDK**, and **Java JDK** are configured.
2. Initialize mobile capabilities:
   ```bash
   npx tauri android init
   ```
3. Launch development mode on a connected device or emulator:
   ```bash
   npm run tauri android dev
   ```
4. Build a release APK or AAB:
   ```bash
   npm run tauri android build
   ```

#### iOS Setup:
1. Requires a macOS machine with **Xcode** and **CocoaPods** installed.
2. Initialize iOS capabilities:
   ```bash
   npx tauri ios init
   ```
3. Launch development mode on iOS simulator or device:
   ```bash
   npm run tauri ios dev
   ```

---

## 🔧 Troubleshooting

### 1. "cargo metadata... program not found"
* **Root Cause**: The Rust toolchain is either not installed or your terminal has not loaded the updated environmental path settings.
* **Resolution**: Install Rust from [rustup.rs](https://rustup.rs/) and close/re-open your terminal or IDE window to reload the system variables.

### 2. Local LLM Connection Refused (CORS Blocking)
* **Root Cause**: The local Ollama/Kobold instance blocks cross-origin requests.
* **Resolution**: Since Tauri v2 uses `@tauri-apps/plugin-http` for LLM routing, calls bypass browser CORS boundaries entirely. Ensure your local LLM engine is running at the configured endpoint (e.g. `http://127.0.0.1:11434/v1` for Ollama).

### 3. SQLite Database Locks or Access Errors
* **Root Cause**: Multiple window threads attempting to write concurrently, or permissions issues.
* **Resolution**: The database file `darf.db` is stored inside the secure OS AppData directory. You can locate it at:
  * **Windows**: `%APPDATA%\com.tauri.dev\darf.db`
  * **macOS**: `~/Library/Application Support/com.tauri.dev/darf.db`
  * **Linux**: `~/.config/com.tauri.dev/darf.db`
  If the schema becomes corrupt, you can safely delete this file; the app will recreate and seed it on the next launch.
