# Changelog

All notable changes to **Mignon UI** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [v1.1.0-beta] - 2026-11-20

### 🎮 Added
* **Game-Style Performance Presets**: Introduced video-game-style performance tiers in Settings to eliminate configuration confusion:
  * **Low (Speed / Low-Spec)**: Optimized for CPU inference, budget laptops, or 4GB VRAM. Fast, concise replies that conserve API credits.
  * **Medium (Balanced)**: The default standard for 6GB–8GB GPUs. Optimal balance between narrative depth and generation speed.
  * **High (Rich Quality)**: Deep multi-paragraph narratives with expanded memory recall, designed for 12GB+ GPUs and cloud models.
  * **Ultra (Cinematic Immersion)**: Maximum context limits (30 turns) and 8 RAG lore chunks for high-spec dedicated rigs.
  * **Auto-Detect**: Automatically selects the best preset based on detected system hardware and provider.
  * **Custom**: Seamlessly activates whenever manual slider adjustments are made.
* **Theme & Background Presets**:
  * One-click color and gradient preset rows in the Theme Customizer.
  * Ability to save custom background colors, gradients, and custom background image slots to a persistent personal presets bar.
* **Smart GPU & Hardware Detection**: Native hardware inspector across Windows (`Win32_VideoController`), macOS (`system_profiler`), and Linux (`lspci`) to automatically detect dedicated NVIDIA RTX/GTX, AMD Radeon, or Apple Silicon chips.
* **In-App Update Notification Banner**: Real-time `UpdateBanner` notifications powered by a dual-channel update engine (native Tauri updater with automatic GitHub Releases REST fallback).
* **Dynamic AI Model Discovery**: Dynamic dropdown in Settings that queries and displays installed/available models directly from Ollama, OpenRouter, and custom endpoints.
* **Database Backup & Restoration**: Export entire chat histories, character libraries, and worlds to a single backup file with SQLite magic header verification (`export_database_backup` and `restore_database_backup`).

### ⚡ Performance & Engine Improvements
* **Overhauled Story Memory (RAG)**: Replaced browser-side WASM embeddings with native Rust `fastembed` generation and SIMD-accelerated cosine similarity search, reducing memory retrieval latency to near-zero.
* **Direct Pre-Serialized IPC Streaming**: Optimized LLM token streaming pipeline in `llm_stream.rs` for ultra-low latency text rendering.
* **Mobile & Touch Polish**: Added gesture and multi-touch pinch-zoom cancellation handlers to optimize Android and touch-display navigation.

### 🔒 Security & Quality
* **AES-256-GCM Key Encryption**: Replaced legacy RC4 cryptography with hardware-grade AES-256-GCM symmetric encryption for all stored API tokens.
---

## [v1.0.0-beta] - 2026-07-05

### 🚀 Initial Public Beta Release

The inaugural release of **Mignon UI** — an offline-first, highly customizable AI roleplay frontend client designed for immersion, multi-character dynamics, and stunning aesthetics.

#### 👥 Dynamic Multi-Bot Lobbies
* **Autonomous Turn-Taking Engine**: Chat with multiple AI characters simultaneously in a single room without manually prompting each one.
* **Psychological Personality Modeling**: Character turn arbitration driven by OCEAN personality traits (Extraversion, Neuroticism, Agreeableness, Assertiveness).
* **Contextual Arbitration**: Turn-taking responds naturally to direct name addressing, social hierarchy rankings, conversational proximity, and silence discomfort.
* **Persona Swapping**: Switch active personas on the fly or roleplay as any character card in your library.

#### 📖 Character & World Lore Management
* **Tavern Card V2 Import & Export**: Instant drag-and-drop import for standard Character Card V2 PNGs (extracting embedded character metadata chunks) and JSON formats.
* **Interactive Lorebooks**: Link modular world lorebooks to characters or rooms with automated regex and keyword activation.
* **Milestone Chapter Memory**: Automatic summarization of long roleplay histories into episodic chapters to prevent memory drift.

#### 🔌 Universal AI Engine Connectivity
* **Local Offline Backends**: Built-in 1-click presets for **Ollama** (`localhost:11434`) and low-spec optimized **Kobold.cpp** (`localhost:5001`) with ContextShift and KV cache support.
* **Cloud AI Providers**: Integrated support for **OpenRouter** and any OpenAI-compatible API endpoint (LM Studio, Groq, DeepSeek, Gemini).
* **Real-time Token Streaming**: Low-latency token generation with in-flight abort support.

#### 🎨 Aesthetic Design System & Customization
* **7 Hand-Crafted Themes**: Instant switching between distinctive aesthetic styles, each with full Light and Dark mode support:
  * *Bubblegum Pop* (Playful pastel Y2K aesthetic)
  * *Neo-Cyber* (High-contrast neon cyberpunk terminal)
  * *Dollhouse* (Soft, elegant vintage styling)
  * *Builder* (Clean, modular technical design)
  * *Mignon UI Classic* (Balanced dark-mode roleplay layout)
  * *Dark Yellow* (Muted industrial contrast)
  * *Sketch Book* (Whimsical hand-drawn notebook styling)
* **Interactive UI Sticker Canvas**: Personalize chatrooms by placing, resizing, and layering draggable aesthetic stickers across the workspace.

#### 🛡️ Privacy & Desktop Architecture
* **100% Private & Offline-First**: All conversations, character cards, and lorebooks are stored locally in an embedded SQLite database using Write-Ahead Logging (WAL). Zero telemetry.
* **Cross-Platform Desktop Builds**: Built on **Tauri v2** for Windows (NSIS installer + standalone portable ZIP), macOS (Universal Apple Silicon & Intel DMG), and Linux (DEB + AppImage).
