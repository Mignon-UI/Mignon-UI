# 🧱 System Architecture & Database Blueprints

Mignon UI relies on a serverless, cross-platform architecture powered by **Tauri v2**. The application runs inside the native operating system's Webview container (compiled from Vite/React static assets), communicating directly with native OS plugins for relational database transactions, HTTP client proxying, file access, and desktop dialogs.

---

## 🗺️ Unified System Data Flow

The diagram below maps how the frontend React views communicate with the local JS service layer, Tauri native APIs, SQLite, and external inference engines:

```mermaid
graph TB
26:      %% Core Client Interface
27:      subgraph Client Layer [Vite React Client Shell]
28:          UI[React Viewport Components] -->|Action Dispatch| Contexts[React Context Providers]
29:          Contexts -->|State Management| UI
30:      end
31:  
32:      %% Local JS Service Core
33:      subgraph Service Core [Local Service Layer]
34:          Contexts -->|Unified Calls| API[services/api.js]
35:          API -->|Init/Query SQL| DB[services/db.js]
36:          API -->|WASM / API Embeddings| RAG[services/rag.js]
37:          API -->|Coordinate Turn Auction| TES[services/turnTaking.js]
38:          API -->|Compile Prompt Frames| Compiler[services/promptCompiler.js]
39:          API -->|Tavern Card Parsing| Parser[services/tavernParser.js]
40:          API -->|CORS-Free HTTP Clients| LLM[services/llmClient.js]
41:      end
42:  
43:      %% Tauri IPC & Native Bridge
44:      subgraph Tauri Bridge [Tauri v2 IPC Core]
45:          DB -->|@tauri-apps/plugin-sql| SQLPlugin[Native SQLite Plugin]
46:          LLM -->|@tauri-apps/plugin-http| HTTPPlugin[Native HTTP Client]
47:          LLM -->|Tauri Custom Invoke| RustCrypto[Rust Cryptographic Module]
48:      end
49:  
50:      %% Storage Grid
51:      subgraph Storage Grid [Offline Storage]
52:          SQLPlugin -->|Read/Write WAL| SQLite[(SQLite: darf.db)]
53:          RAG -->|Store Float Vectors| SQLite
54:          RustCrypto -->|Key Storage| SecretFile[(AppData: secret.key)]
55:      end
56:  
57:      %% Inference Grid
58:      subgraph Inference Grid [Execution Kernels]
59:          HTTPPlugin -->|Bypass CORS| ExternalLLM[Ollama / OpenRouter / Custom Endpoint]
60:      end
```

---

## 💾 Relational Database Schema (SQLite: darf.db)

All relational models, settings, and histories are saved in a local SQLite database file (`darf.db`) located in the application's secure AppData directory. The database WAL mode is managed by the `@tauri-apps/plugin-sql` driver. The schema contains the following tables:

### 1. `settings`
Global configurations tracking LLM connectivity parameters and the default user persona.
* `id` (*Integer, Primary Key*): Fixed single row (ID = 1).
* `provider` (*Text, default='ollama'*): The LLM target provider (`'ollama' | 'openrouter' | 'custom'`).
* `openrouter_key` (*Text, Nullable*): Secure hex-encrypted OpenRouter API token.
* `custom_key` (*Text, Nullable*): Secure hex-encrypted custom endpoint authorization token.
* `local_endpoint` (*Text, default='http://127.0.0.1:11434/v1'*): Base connection URL.
* `selected_model` (*Text, Nullable*): Active LLM model identifier tag.
* `temperature` (*Real, default=0.9*): Generation creativity bounds.
* `max_tokens` (*Integer, default=2048*): Maximum generated response length.
* `system_template` (*Text*): The core system prompt frame outlining roleplay behavior rules.
* `cloud_rate_limit` (*Integer, default=15*): Requests ceiling limit when querying cloud providers.
* `current_profile_id` (*Integer, Nullable*): Soft foreign key linking to connection profiles.
* `persona_name` (*Text, default='User'*): The default display name of the player.
* `persona_avatar` (*Text, Nullable*): Base64-encoded image representing the player's profile avatar.
* `persona_description` (*Text, Nullable*): Custom backstory and physical traits of the player's persona.
* `persona_character_id` (*Integer, Nullable*): Soft foreign key to play as an existing character card.

### 2. `connection_profiles`
Custom connection configurations that can be swapped instantly.
* `id` (*Integer, Primary Key, Autoincrement*).
* `name` (*Text, Unique, Not Null*).
* `provider` (*Text, default='ollama'*).
* `openrouter_key` (*Text*).
* `custom_key` (*Text*).
* `local_endpoint` (*Text*).
* `selected_model` (*Text*).
* `temperature` (*Real*).
* `max_tokens` (*Integer*).
* `system_template` (*Text*).
* `cloud_rate_limit` (*Integer*).

### 3. `characters`
AI roleplay sheet profile cards importing Tavern formats and definitions.
* `id` (*Integer, Primary Key, Autoincrement*).
* `world_id` (*Integer, Nullable*): References `worlds(id)` on delete SET NULL.
* `name` (*Text, Not Null*): The character's name.
* `avatar` (*Text, Nullable*): Base64-encoded image string or relative avatar filename.
* `greeting` (*Text, Nullable*): The opening dialogue turn triggered on room entry.
* `personality` (*Text, Nullable*): Internal attributes, physical descriptions, and W++ traits.
* `scenario` (*Text, Nullable*): Scenario prompt framing defining active situations.
* `example_dialogue` (*Text, Nullable*): Dialogue templates illustrating speech and action styles.
* `nsfw_inject` (*Integer, default=0*): Flag to toggle NSFW/uncensored instructions.
* `alternate_greetings` (*Text, default='[]'*): SQLite-serialized JSON list of alternative card greetings.
* `system_prompt` (*Text, Nullable*): Specific system instructions overrides for this character.
* `post_history_instructions` (*Text, Nullable*): Directives appended to the bottom of prompt history.
* `creator` (*Text*), `character_version` (*Text*), `creator_notes` (*Text*).
* `is_active` (*Integer, default=1*): Boolean flag indicating active card state.
* `created_at` (*Timestamp*).

### 4. `chat_sessions`
Dynamic sandbox chat rooms containing single characters or active multi-bot group roster members.
* `id` (*Text, Primary Key*): UUID string.
* `name` (*Text, Not Null*): The display name of the room.
* `is_group` (*Integer, default=0*): Discriminator tag indicating multi-bot group scenes.
* `description` (*Text, Nullable*): Dynamic environment outline and special scene rules.
* `scene_state` (*Text, default='{}'*): SQLite-serialized JSON string tracking locations, active moods, and motivations.
* `created_at` (*Timestamp*).

### 5. `room_members`
Junction mapping binding characters into active rooms.
* `id` (*Integer, Primary Key, Autoincrement*).
* `room_id` (*Text*): References `chat_sessions(id)` on delete CASCADE.
* `character_id` (*Integer*): References `characters(id)` on delete CASCADE.
* *Constraints*: `UNIQUE(room_id, character_id)` to prevent duplicate character mappings.

### 6. `messages`
Chronological dialog entries written by the player or character entities inside rooms.
* `id` (*Integer, Primary Key, Autoincrement*).
* `room_id` (*Text*): References `chat_sessions(id)` on delete CASCADE.
* `sender_type` (*Text, Not Null*): Entity tags (`'user' | 'character'`).
* `character_id` (*Integer, Nullable*): References `characters(id)` on delete CASCADE.
* `sender_name` (*Text, Not Null*): Display name of the sender.
* `content` (*Text, Not Null*): The active display text.
* `swipes` (*Text, default='[]'*): SQLite-serialized JSON list of alternative swipe responses.
* `active_swipe_index` (*Integer, default=0*): Pointer identifying the active swipe.
* `created_at` (*Timestamp*).
* *Indexes*: Compound index `ix_messages_room_id_id` on `(room_id, id)` for rapid chronological loading.

### 7. `worlds`
Organizational containers grouping lore codex systems and characters.
* `id` (*Integer, Primary Key, Autoincrement*).
* `name` (*Text, Unique, Not Null*).
* `description` (*Text, Nullable*).
* `created_at` (*Timestamp*).

### 8. `lore_entries`
Semantic codex components loaded contextually via raw keyword intersections and vector scores.
* `id` (*Integer, Primary Key, Autoincrement*).
* `world_id` (*Integer*): References `worlds(id)` on delete CASCADE.
* `title` (*Text, Not Null*): Header descriptor.
* `keys` (*Text, Not Null*): Comma-separated search keys (e.g. `magic, spells, arcane`).
* `content` (*Text, Not Null*): Codex text block injected into prompts on match triggers.
* `is_active` (*Integer, default=1*): Master active switch toggles.
* `weight` (*Integer, default=100*): Execution priority weights.
* `created_at` (*Timestamp*).
* *Indexes*: Compound index `ix_lore_entries_world_id_active` on `(world_id, is_active)`.

### 9. `chat_summaries`
Asynchronously compiled milestone summaries generated by background handlers.
* `id` (*Integer, Primary Key, Autoincrement*).
* `room_id` (*Text*): References `chat_sessions(id)` on delete CASCADE.
* `summary_text` (*Text, Not Null*): Narrative digest outlining physical milestones.
* `start_message_id` (*Integer, Not Null*): Start boundary of summarized messages.
* `end_message_id` (*Integer, Not Null*): End boundary of summarized messages.
* `created_at` (*Timestamp*).

### 10. `ui_stickers`
Absolute coordinates tracking customizable decal layers active on the application canvas.
* `id` (*Text, Primary Key*): Sticker asset UUID.
* `image_data` (*Text, Not Null*): Base64-encoded transparent PNG file.
* `x` (*Real, default=100.0*) / `y` (*Real, default=100.0*): Canvas viewport coordinates.
* `scale` (*Real, default=1.0*).
* `rotation` (*Integer, default=0*).
* `opacity` (*Real, default=0.8*).
* `target_selectors` (*Text, Nullable*): Comma-separated CSS element target queries to snap to.
* `created_at` (*Timestamp*).

---

## 🗄️ SQLite Vector Schema (Embeddings Table)

Rather than using LanceDB which requires native platforms dependencies, vector embeddings are stored in a regular SQLite table `embeddings`. This guarantees complete multi-platform reliability (Windows, Linux, macOS, iOS, Android). 

Similarity matching is computed client-side using a high-performance JS cosine similarity algorithm:

| Column Field | SQL Type | Description |
| :--- | :--- | :--- |
| **`id`** | `TEXT, PRIMARY KEY` | Unique node identifier (e.g. `mem_12`, `lore_4_chunk_1`). |
| **`type`** | `TEXT` | Discriminator tags (`'memory' \| 'lore'`). |
| **`source_id`** | `TEXT` | Isolation tags matching either Room UUID or World Lore ID. |
| **`title`** | `TEXT` | Header label mapping summaries or codex titles. |
| **`text`** | `TEXT` | The raw text chunk analyzed by the embedding engine. |
| **`vector`** | `TEXT` | JSON-serialized float array representing the high-dimensional vector. |

> [!TIP]
> **Semantic Isolation Layer**: To prevent private memory leaks between separate chat sessions, SQLite vector fetches restrict candidates via: `SELECT * FROM embeddings WHERE type = 'memory' AND source_id = '{room_id}'`. The resulting vectors are evaluated in memory, which runs in <1ms for active rooms (typically containing <200 vectors).
