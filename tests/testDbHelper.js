import { Database } from 'bun:sqlite';
import { DEFAULT_SETTINGS, DEFAULT_CHARACTERS } from '../src/services/seedData';

import { mock } from 'bun:test';

/**
 * Creates a genuine, fast in-memory SQLite database for testing.
 * Strictly adheres to foreign key constraints and real SQL execution.
 */
export function createTestDb({ seed = true } = {}) {
  const sqlite = new Database(':memory:');
  sqlite.run('PRAGMA foreign_keys = ON;');

  const db = {
    _sqlite: sqlite,
    select: mock(async (query, params = []) => {
      const stmt = sqlite.prepare(query);
      return stmt.all(...(params || []));
    }),
    execute: mock(async (query, params = []) => {
      const stmt = sqlite.prepare(query);
      const info = stmt.run(...(params || []));
      return { lastInsertId: Number(info.lastInsertRowid), rowsAffected: info.changes };
    }),
    close: () => {
      sqlite.close();
    }
  };

  // Create all schema tables
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      provider TEXT DEFAULT 'ollama',
      openrouter_key TEXT,
      custom_key TEXT,
      local_endpoint TEXT DEFAULT 'http://127.0.0.1:11434/v1',
      selected_model TEXT,
      temperature REAL DEFAULT 0.85,
      max_tokens INTEGER DEFAULT 350,
      context_limit INTEGER DEFAULT 14,
      rag_top_k INTEGER DEFAULT 4,
      performance_preset TEXT DEFAULT 'auto',
      system_template TEXT,
      cloud_rate_limit INTEGER DEFAULT 15,
      current_profile_id INTEGER,
      persona_name TEXT DEFAULT 'User',
      persona_avatar TEXT,
      persona_description TEXT,
      persona_character_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS connection_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      provider TEXT DEFAULT 'ollama',
      openrouter_key TEXT,
      custom_key TEXT,
      local_endpoint TEXT,
      selected_model TEXT,
      temperature REAL DEFAULT 0.85,
      max_tokens INTEGER DEFAULT 350,
      context_limit INTEGER DEFAULT 14,
      rag_top_k INTEGER DEFAULT 4,
      performance_preset TEXT DEFAULT 'auto',
      system_template TEXT,
      cloud_rate_limit INTEGER DEFAULT 15
    );

    CREATE TABLE IF NOT EXISTS worlds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id INTEGER REFERENCES worlds(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      greeting TEXT,
      personality TEXT,
      scenario TEXT,
      example_dialogue TEXT,
      alternate_greetings TEXT DEFAULT '[]',
      system_prompt TEXT,
      post_history_instructions TEXT,
      creator TEXT,
      character_version TEXT,
      creator_notes TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_group INTEGER DEFAULT 0,
      description TEXT,
      scene_state TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
      character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
      UNIQUE(room_id, character_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
      sender_type TEXT NOT NULL,
      character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      swipes TEXT DEFAULT '[]',
      active_swipe_index INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ix_messages_room_id_id ON messages(room_id, id);

    CREATE TABLE IF NOT EXISTS lore_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      keys TEXT NOT NULL,
      content TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      weight INTEGER DEFAULT 100,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS ix_lore_entries_world_id_active ON lore_entries(world_id, is_active);

    CREATE TABLE IF NOT EXISTS chat_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
      summary_text TEXT NOT NULL,
      start_message_id INTEGER NOT NULL,
      end_message_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ui_stickers (
      id TEXT PRIMARY KEY,
      image_data TEXT NOT NULL,
      x REAL DEFAULT 100.0,
      y REAL DEFAULT 100.0,
      scale REAL DEFAULT 1.0,
      rotation INTEGER DEFAULT 0,
      opacity REAL DEFAULT 0.8,
      target_selectors TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      vector BLOB NOT NULL
    );
  `);

  if (seed) {
    // Seed default settings
    const settingsKeys = Object.keys(DEFAULT_SETTINGS);
    const settingsPlaceholders = settingsKeys.map(() => '?').join(', ');
    const settingsStmt = sqlite.prepare(
      `INSERT INTO settings (${settingsKeys.join(', ')}) VALUES (${settingsPlaceholders})`
    );
    settingsStmt.run(...settingsKeys.map(k => DEFAULT_SETTINGS[k]));

    // Seed default characters
    const charStmt = sqlite.prepare(`
      INSERT INTO characters (
        name, avatar, greeting, personality, scenario, example_dialogue, alternate_greetings, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const char of DEFAULT_CHARACTERS) {
      charStmt.run(
        char.name,
        char.avatar,
        char.greeting,
        char.personality,
        char.scenario,
        char.example_dialogue,
        JSON.stringify(char.alternate_greetings || []),
        char.is_active ? 1 : 0
      );
    }
  }

  return db;
}
