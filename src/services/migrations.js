import { getDb } from './db';
import { DEFAULT_SETTINGS, DEFAULT_CHARACTERS } from './seedData';

async function migrateTableColumns(db, tableName, expectedCols) {
  try {
    const info = await db.select(`PRAGMA table_info(${tableName})`);
    const existing = info.map(c => c.name.toLowerCase());
    const columnsToAdd = [];
    for (const [colName, colDef] of Object.entries(expectedCols)) {
      if (!existing.includes(colName.toLowerCase())) {
        columnsToAdd.push({ name: colName, def: colDef });
      }
    }

    if (columnsToAdd.length > 0) {
      // ponytail: alter table operations are rolled back atomically on error
      await db.execute("BEGIN TRANSACTION;");
      try {
        for (const col of columnsToAdd) {
          console.log(`[DB Migration] Adding column ${col.name} to table ${tableName}...`);
          // fallow-ignore-next-line security-sink
          await db.execute(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.def}`);
        }
        await db.execute("COMMIT;");
      } catch (e) {
        await db.execute("ROLLBACK;");
        throw e;
      }
    }
  } catch (e) {
    console.error(`[DB Migration] Failed to migrate table ${tableName}:`, e);
    throw e;
  }
}

let initDatabasePromise = null;

export async function initDatabase() {
  if (!initDatabasePromise) {
    initDatabasePromise = _initDatabaseInternal().catch((err) => {
      initDatabasePromise = null;
      throw err;
    });
  }
  return initDatabasePromise;
}

async function _initDatabaseInternal() {
  const db = await getDb();
  await db.execute("PRAGMA foreign_keys = OFF;");

  // 1. Settings Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      provider TEXT DEFAULT 'ollama',
      openrouter_key TEXT,
      custom_key TEXT,
      local_endpoint TEXT DEFAULT 'http://127.0.0.1:11434/v1',
      selected_model TEXT,
      temperature REAL DEFAULT 0.9,
      max_tokens INTEGER DEFAULT 2048,
      system_template TEXT,
      cloud_rate_limit INTEGER DEFAULT 15,
      current_profile_id INTEGER,
      persona_name TEXT DEFAULT 'User',
      persona_avatar TEXT,
      persona_description TEXT,
      persona_character_id INTEGER
    )
  `);

  // 2. Connection Profiles Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS connection_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      provider TEXT DEFAULT 'ollama',
      openrouter_key TEXT,
      custom_key TEXT,
      local_endpoint TEXT,
      selected_model TEXT,
      temperature REAL DEFAULT 0.9,
      max_tokens INTEGER DEFAULT 2048,
      system_template TEXT,
      cloud_rate_limit INTEGER DEFAULT 15
    )
  `);

  // 3. Worlds Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS worlds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 4. Characters Table
  await db.execute(`
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
    )
  `);

  // 5. Chat Sessions Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      is_group INTEGER DEFAULT 0,
      description TEXT,
      scene_state TEXT DEFAULT '{}',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Room Members Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS room_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
      character_id INTEGER REFERENCES characters(id) ON DELETE CASCADE,
      UNIQUE(room_id, character_id)
    )
  `);

  // 7. Messages Table
  await db.execute(`
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
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS ix_messages_room_id_id ON messages(room_id, id)`);

  // 8. Lore Entries Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS lore_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      world_id INTEGER REFERENCES worlds(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      keys TEXT NOT NULL,
      content TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      weight INTEGER DEFAULT 100,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute(`CREATE INDEX IF NOT EXISTS ix_lore_entries_world_id_active ON lore_entries(world_id, is_active)`);

  // 9. Chat Summaries Table
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id TEXT REFERENCES chat_sessions(id) ON DELETE CASCADE,
      summary_text TEXT NOT NULL,
      start_message_id INTEGER NOT NULL,
      end_message_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 10. UI Stickers Table
  await db.execute(`
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
    )
  `);

  // 11. Embeddings Table (Lightweight RAG vector storage)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      title TEXT NOT NULL,
      text TEXT NOT NULL,
      vector BLOB NOT NULL
    )
  `);

  // Run schema migrations for existing installations
  await migrateTableColumns(db, 'settings', {
    provider: "TEXT DEFAULT 'ollama'",
    openrouter_key: "TEXT",
    custom_key: "TEXT",
    local_endpoint: "TEXT DEFAULT 'http://127.0.0.1:11434/v1'",
    selected_model: "TEXT",
    temperature: "REAL DEFAULT 0.9",
    max_tokens: "INTEGER DEFAULT 2048",
    system_template: "TEXT",
    cloud_rate_limit: "INTEGER DEFAULT 15",
    current_profile_id: "INTEGER",
    persona_name: "TEXT DEFAULT 'User'",
    persona_avatar: "TEXT",
    persona_description: "TEXT",
    persona_character_id: "INTEGER"
  });

  await migrateTableColumns(db, 'characters', {
    world_id: "INTEGER REFERENCES worlds(id) ON DELETE SET NULL",
    name: "TEXT",
    avatar: "TEXT",
    greeting: "TEXT",
    personality: "TEXT",
    scenario: "TEXT",
    example_dialogue: "TEXT",
    alternate_greetings: "TEXT DEFAULT '[]'",
    system_prompt: "TEXT",
    post_history_instructions: "TEXT",
    creator: "TEXT",
    character_version: "TEXT",
    creator_notes: "TEXT",
    is_active: "INTEGER DEFAULT 1"
  });

  await migrateTableColumns(db, 'chat_sessions', {
    is_group: "INTEGER DEFAULT 0",
    description: "TEXT",
    scene_state: "TEXT DEFAULT '{}'"
  });

  await migrateTableColumns(db, 'messages', {
    swipes: "TEXT DEFAULT '[]'",
    active_swipe_index: "INTEGER DEFAULT 0"
  });

  await migrateTableColumns(db, 'lore_entries', {
    is_active: "INTEGER DEFAULT 1",
    weight: "INTEGER DEFAULT 100"
  });

  // Seed default settings row if empty
  const settingsRows = await db.select("SELECT * FROM settings WHERE id = 1");
  if (settingsRows.length === 0) {
    const keys = Object.keys(DEFAULT_SETTINGS);
    await db.execute(
      `INSERT INTO settings (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      keys.map(k => DEFAULT_SETTINGS[k])
    );
    console.log("[DB] Seeded default settings.");
  }

  // Clean up legacy explicit system template if it's set to the old safe default
  const currentSettings = await db.select("SELECT system_template FROM settings WHERE id = 1");
  if (currentSettings.length > 0 && currentSettings[0].system_template && currentSettings[0].system_template.includes("adapt your responses to the unfolding narrative")) {
    await db.execute(
      "UPDATE settings SET system_template = ? WHERE id = 1",
      [DEFAULT_SETTINGS.system_template]
    );
    console.log("[DB] Restored default system template.");
  }

  // Seed default characters individually if they do not exist

  for (const char of DEFAULT_CHARACTERS) {
    const existing = await db.select("SELECT id FROM characters WHERE name = ?", [char.name]);
    if (existing.length === 0) {
      await db.execute(
        `INSERT INTO characters (
          name, avatar, greeting, personality, scenario, example_dialogue, alternate_greetings, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          char.name,
          char.avatar,
          char.greeting,
          char.personality,
          char.scenario,
          char.example_dialogue,
          JSON.stringify(char.alternate_greetings || []),
          char.is_active ? 1 : 0
        ]
      );
      console.log(`[DB] Seeded default character: ${char.name}`);
    }
  }
  await db.execute("PRAGMA foreign_keys = ON;");
}
