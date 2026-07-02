import { getDb } from './db';
import { encryptKey } from './llmClient';

// Settings
export async function getSettings() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM settings WHERE id = 1");
  return rows[0] || null;
}

export async function saveSettings(settings) {
  const db = await getDb();
  const existing = await getSettings();

  let encryptedOpenRouter = settings.openrouter_key;
  if (settings.openrouter_key === "••••••••••••••••") {
    encryptedOpenRouter = existing ? existing.openrouter_key : null;
  } else if (settings.openrouter_key && !settings.openrouter_key.startsWith("enc::")) {
    encryptedOpenRouter = await encryptKey(settings.openrouter_key);
  }

  let encryptedCustom = settings.custom_key;
  if (settings.custom_key === "••••••••••••••••") {
    encryptedCustom = existing ? existing.custom_key : null;
  } else if (settings.custom_key && !settings.custom_key.startsWith("enc::")) {
    encryptedCustom = await encryptKey(settings.custom_key);
  }

  await db.execute(
    `UPDATE settings SET 
      provider = ?, openrouter_key = ?, custom_key = ?, local_endpoint = ?, selected_model = ?, 
      temperature = ?, max_tokens = ?, system_template = ?, cloud_rate_limit = ?, current_profile_id = ?,
      persona_name = ?, persona_avatar = ?, persona_description = ?, persona_character_id = ?
     WHERE id = 1`,
    [
      settings.provider,
      encryptedOpenRouter,
      encryptedCustom,
      settings.local_endpoint,
      settings.selected_model,
      settings.temperature,
      settings.max_tokens,
      settings.system_template,
      settings.cloud_rate_limit,
      settings.current_profile_id,
      settings.persona_name,
      settings.persona_avatar,
      settings.persona_description,
      settings.persona_character_id
    ]
  );
  return getSettings();
}

// Connection Profiles
export async function getProfiles() {
  const db = await getDb();
  return db.select("SELECT * FROM connection_profiles ORDER BY name ASC");
}

export async function createProfile(name) {
  const db = await getDb();
  const settings = await getSettings();
  await db.execute(
    `INSERT INTO connection_profiles (
      name, provider, openrouter_key, custom_key, local_endpoint, selected_model, temperature, max_tokens, system_template, cloud_rate_limit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name,
      settings.provider,
      settings.openrouter_key,
      settings.custom_key,
      settings.local_endpoint,
      settings.selected_model,
      settings.temperature,
      settings.max_tokens,
      settings.system_template,
      settings.cloud_rate_limit
    ]
  );
  const rows = await db.select("SELECT * FROM connection_profiles WHERE name = ?", [name]);
  return rows[0];
}

export async function updateProfile(id, name) {
  const db = await getDb();
  const settings = await getSettings();
  await db.execute(
    `UPDATE connection_profiles SET 
      name = ?, provider = ?, openrouter_key = ?, custom_key = ?, local_endpoint = ?, 
      selected_model = ?, temperature = ?, max_tokens = ?, system_template = ?, cloud_rate_limit = ?
     WHERE id = ?`,
    [
      name,
      settings.provider,
      settings.openrouter_key,
      settings.custom_key,
      settings.local_endpoint,
      settings.selected_model,
      settings.temperature,
      settings.max_tokens,
      settings.system_template,
      settings.cloud_rate_limit,
      id
    ]
  );
  const rows = await db.select("SELECT * FROM connection_profiles WHERE id = ?", [id]);
  return rows[0];
}

export async function deleteProfile(id) {
  const db = await getDb();
  await db.execute("DELETE FROM connection_profiles WHERE id = ?", [id]);
  return true;
}

export async function activateProfile(id) {
  const db = await getDb();
  const profileRows = await db.select("SELECT * FROM connection_profiles WHERE id = ?", [id]);
  if (profileRows.length === 0) throw new Error("Profile not found");
  const p = profileRows[0];
  await db.execute(
    `UPDATE settings SET 
      provider = ?, openrouter_key = ?, custom_key = ?, local_endpoint = ?, selected_model = ?, 
      temperature = ?, max_tokens = ?, system_template = ?, cloud_rate_limit = ?, current_profile_id = ?
     WHERE id = 1`,
    [p.provider, p.openrouter_key, p.custom_key, p.local_endpoint, p.selected_model, p.temperature, p.max_tokens, p.system_template, p.cloud_rate_limit, id]
  );
  return getSettings();
}

// Characters
function serializeCharacterParams(char) {
  return [
    char.world_id || null,
    char.name,
    char.avatar || null,
    char.greeting || null,
    char.personality || null,
    char.scenario || null,
    char.example_dialogue || null,
    JSON.stringify(char.alternate_greetings || []),
    char.system_prompt || null,
    char.post_history_instructions || null,
    char.creator || null,
    char.character_version || null,
    char.creator_notes || null
  ];
}

function deserializeCharacter(c) {
  if (!c) return null;
  let altGreetings = [];
  try {
    altGreetings = typeof c.alternate_greetings === 'string'
      ? JSON.parse(c.alternate_greetings || '[]')
      : (c.alternate_greetings || []);
  } catch (e) {
    console.error(`[DB] Failed to parse alternate greetings for character ${c.name || c.id}:`, e);
  }
  return {
    ...c,
    alternate_greetings: Array.isArray(altGreetings) ? altGreetings : [],
    nsfw_inject: c.nsfw_inject === 1
  };
}

export async function getCharacters() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM characters ORDER BY created_at DESC");
  return rows.map(deserializeCharacter);
}

export async function createCharacter(char) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO characters (
      world_id, name, avatar, greeting, personality, scenario, example_dialogue, alternate_greetings, system_prompt, post_history_instructions, creator, character_version, creator_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    serializeCharacterParams(char)
  );
  const rows = await db.select("SELECT * FROM characters ORDER BY id DESC LIMIT 1");
  return deserializeCharacter(rows[0]);
}

export async function updateCharacter(id, char) {
  const db = await getDb();
  await db.execute(
    `UPDATE characters SET 
      world_id = ?, name = ?, avatar = ?, greeting = ?, personality = ?, scenario = ?, example_dialogue = ?, alternate_greetings = ?, system_prompt = ?, post_history_instructions = ?, creator = ?, character_version = ?, creator_notes = ?
     WHERE id = ?`,
    [...serializeCharacterParams(char), id]
  );
  const rows = await db.select("SELECT * FROM characters WHERE id = ?", [id]);
  return deserializeCharacter(rows[0]);
}

export async function deleteCharacter(id) {
  const db = await getDb();
  await db.execute("DELETE FROM characters WHERE id = ?", [id]);
  return true;
}

// Rooms / Chat Sessions
export async function getRooms() {
  const db = await getDb();
  const sessions = await db.select(
    `SELECT s.*, 
            COALESCE((SELECT MAX(id) FROM messages WHERE room_id = s.id), 0) as last_msg_id,
            m.sender_name as last_msg_sender,
            m.content as last_msg_content
     FROM chat_sessions s 
     LEFT JOIN messages m ON m.id = (SELECT MAX(id) FROM messages WHERE room_id = s.id)
     ORDER BY last_msg_id DESC, s.created_at DESC`
  );
  return Promise.all(sessions.map(async s => {
    const members = await db.select(
      `SELECT c.* FROM characters c 
       JOIN room_members rm ON c.id = rm.character_id 
       WHERE rm.room_id = ?`,
      [s.id]
    );
    return {
      ...s,
      is_group: s.is_group === 1,
      members: members.map(deserializeCharacter),
      last_message: s.last_msg_id > 0 ? {
        sender_name: s.last_msg_sender,
        content: s.last_msg_content
      } : null
    };
  }));
}

export async function createRoom(room) {
  const db = await getDb();
  const id = room.id || crypto.randomUUID();
  await db.execute(
    `INSERT INTO chat_sessions (id, name, is_group, description, scene_state) VALUES (?, ?, ?, ?, ?)`,
    [id, room.name, room.is_group ? 1 : 0, room.description || null, room.scene_state || '{}']
  );

  if (room.character_ids && Array.isArray(room.character_ids)) {
    await Promise.all(room.character_ids.map(cid =>
      db.execute(`INSERT OR IGNORE INTO room_members (room_id, character_id) VALUES (?, ?)`, [id, cid])
    ));
  }

  // Seed character greetings in 1-on-1 chats
  if (!room.is_group && room.character_ids && room.character_ids.length > 0) {
    for (const cid of room.character_ids) {
      const charRows = await db.select("SELECT * FROM characters WHERE id = ?", [cid]);
      if (charRows.length > 0) {
        const bot = charRows[0];
        let altGreetings = [];
        try {
          altGreetings = typeof bot.alternate_greetings === 'string'
            ? JSON.parse(bot.alternate_greetings || '[]')
            : (bot.alternate_greetings || []);
        } catch { }

        const greetings = [...new Set([bot.greeting, ...altGreetings])].map(g => g?.trim()).filter(Boolean);
        if (greetings.length > 0) {
          await db.execute(
            `INSERT INTO messages (room_id, sender_type, character_id, sender_name, content, swipes, active_swipe_index)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id, "character", bot.id, bot.name, greetings[0], JSON.stringify(greetings), 0]
          );
        }
      }
    }
  }

  const rooms = await getRooms();
  return rooms.find(r => r.id === id);
}

export async function updateRoom(id, updates) {
  const db = await getDb();
  if (updates.name !== undefined) {
    await db.execute("UPDATE chat_sessions SET name = ? WHERE id = ?", [updates.name, id]);
  }
  const rooms = await getRooms();
  return rooms.find(r => r.id === id);
}

export async function deleteRoom(id) {
  const db = await getDb();
  await db.execute("DELETE FROM chat_sessions WHERE id = ?", [id]);
  return true;
}

// Room Members Junction Helpers
async function updateRoomGroupStatus(db, roomId) {
  const settings = await getSettings();
  const personaId = settings?.persona_character_id || null;
  const members = await db.select("SELECT character_id FROM room_members WHERE room_id = ?", [roomId]);
  const activeBots = members.filter(m => m.character_id !== personaId);
  const shouldBeGroup = activeBots.length > 1 ? 1 : 0;
  await db.execute("UPDATE chat_sessions SET is_group = ? WHERE id = ?", [shouldBeGroup, roomId]);
}

export async function addRoomMember(roomId, characterId) {
  const db = await getDb();
  await db.execute(`INSERT OR IGNORE INTO room_members (room_id, character_id) VALUES (?, ?)`, [roomId, characterId]);
  await updateRoomGroupStatus(db, roomId);
  const rooms = await getRooms();
  return rooms.find(r => r.id === roomId);
}

export async function removeRoomMember(roomId, characterId) {
  const db = await getDb();
  await db.execute(`DELETE FROM room_members WHERE room_id = ? AND character_id = ?`, [roomId, characterId]);
  await updateRoomGroupStatus(db, roomId);
  const rooms = await getRooms();
  return rooms.find(r => r.id === roomId);
}

// Messages
function deserializeMessage(m) {
  if (!m) return null;
  let swipes = [];
  try {
    swipes = typeof m.swipes === 'string'
      ? JSON.parse(m.swipes || '[]')
      : (m.swipes || []);
  } catch (e) {
    console.error(`[DB] Failed to parse swipes for message ${m.id}:`, e);
  }
  return {
    ...m,
    swipes: Array.isArray(swipes) ? swipes : []
  };
}

export async function getRoomMessages(roomId) {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM messages WHERE room_id = ? ORDER BY id ASC", [roomId]);
  return rows.map(deserializeMessage);
}

export async function createMessage(msg) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO messages (room_id, sender_type, character_id, sender_name, content, swipes, active_swipe_index)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      msg.room_id,
      msg.sender_type,
      msg.character_id || null,
      msg.sender_name,
      msg.content,
      JSON.stringify(msg.swipes || []),
      msg.active_swipe_index || 0
    ]
  );
  const rows = await db.select("SELECT * FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT 1", [msg.room_id]);
  return deserializeMessage(rows[0]);
}

export async function updateMessage(id, content) {
  const db = await getDb();
  const msgRows = await db.select("SELECT * FROM messages WHERE id = ?", [id]);
  if (msgRows.length === 0) throw new Error("Message not found");
  const m = deserializeMessage(msgRows[0]);

  const swipes = m.swipes;
  const idx = m.active_swipe_index || 0;
  if (swipes.length > 0 && idx < swipes.length) {
    swipes[idx] = content;
  } else {
    swipes[0] = content;
  }
  await db.execute("UPDATE messages SET content = ?, swipes = ? WHERE id = ?", [content, JSON.stringify(swipes), id]);
  return {
    ...m,
    content,
    swipes
  };
}

export async function deleteMessage(id) {
  const db = await getDb();
  await db.execute("DELETE FROM messages WHERE id = ?", [id]);
  return true;
}

export async function swipeMessage(roomId, msgId, newIndex) {
  const db = await getDb();
  await db.execute("UPDATE messages SET active_swipe_index = ? WHERE id = ? AND room_id = ?", [newIndex, msgId, roomId]);
  return true;
}

export async function truncateMessages(roomId, messageId) {
  const db = await getDb();

  const orphanedSummaries = await db.select(
    "SELECT id FROM chat_summaries WHERE room_id = ? AND end_message_id > ?",
    [roomId, messageId]
  );
  const orphanedIds = orphanedSummaries.map(s => s.id);

  if (orphanedIds.length > 0) {
    const placeholders = orphanedIds.map(() => '?').join(',');
    // fallow-ignore-next-line security-sink
    await db.execute(`DELETE FROM chat_summaries WHERE id IN (${placeholders})`, orphanedIds);
  }

  await db.execute("DELETE FROM messages WHERE room_id = ? AND id > ?", [roomId, messageId]);
  const messages = await getRoomMessages(roomId);
  return { messages, orphanedIds };
}

export async function branchRoom(roomId, messageId) {
  const db = await getDb();
  const roomRows = await db.select("SELECT * FROM chat_sessions WHERE id = ?", [roomId]);
  if (roomRows.length === 0) throw new Error("Room not found");
  const originalRoom = roomRows[0];

  const members = await db.select("SELECT character_id FROM room_members WHERE room_id = ?", [roomId]);
  const charIds = members.map(m => m.character_id);

  const newRoomId = crypto.randomUUID();
  const branchedRoomName = `${originalRoom.name} (Branched)`;

  await db.execute(
    `INSERT INTO chat_sessions (id, name, is_group, description, scene_state) VALUES (?, ?, ?, ?, ?)`,
    [newRoomId, branchedRoomName, originalRoom.is_group, originalRoom.description, originalRoom.scene_state]
  );

  await Promise.all(charIds.map(cid =>
    db.execute(`INSERT INTO room_members (room_id, character_id) VALUES (?, ?)`, [newRoomId, cid])
  ));

  const messagesToCopy = await db.select(
    "SELECT * FROM messages WHERE room_id = ? AND id <= ? ORDER BY id ASC",
    [roomId, messageId]
  );

  const msgIdMap = {};
  for (const m of messagesToCopy) {
    const safeSwipes = typeof m.swipes === 'string' ? m.swipes : JSON.stringify(m.swipes || []);
    await db.execute(
      `INSERT INTO messages (room_id, sender_type, character_id, sender_name, content, swipes, active_swipe_index, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [newRoomId, m.sender_type, m.character_id, m.sender_name, m.content, safeSwipes, m.active_swipe_index, m.created_at]
    );
    const lastInserted = await db.select("SELECT id FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT 1", [newRoomId]);
    if (lastInserted.length > 0) {
      msgIdMap[m.id] = lastInserted[0].id;
    }
  }

  const origSummaries = await db.select(
    "SELECT * FROM chat_summaries WHERE room_id = ? AND end_message_id <= ? ORDER BY id ASC",
    [roomId, messageId]
  );

  const clonedSummaries = [];
  for (const summ of origSummaries) {
    const newStartId = msgIdMap[summ.start_message_id] || 0;
    const newEndId = msgIdMap[summ.end_message_id] || 0;
    await db.execute(
      `INSERT INTO chat_summaries (room_id, summary_text, start_message_id, end_message_id) VALUES (?, ?, ?, ?)`,
      [newRoomId, summ.summary_text, newStartId, newEndId]
    );
    const lastSumm = await db.select("SELECT * FROM chat_summaries WHERE room_id = ? ORDER BY id DESC LIMIT 1", [newRoomId]);
    if (lastSumm.length > 0) {
      clonedSummaries.push(lastSumm[0]);
    }
  }

  const rooms = await getRooms();
  const room = rooms.find(r => r.id === newRoomId);
  return { room, clonedSummaries };
}

// Worlds
export async function getWorlds() {
  const db = await getDb();
  return db.select("SELECT * FROM worlds ORDER BY id DESC");
}

export async function createWorld(world) {
  const db = await getDb();
  await db.execute("INSERT INTO worlds (name, description) VALUES (?, ?)", [world.name, world.description || null]);
  const rows = await db.select("SELECT * FROM worlds WHERE name = ?", [world.name]);
  return rows[0];
}

export async function deleteWorld(id) {
  const db = await getDb();
  await db.execute("DELETE FROM worlds WHERE id = ?", [id]);
  return true;
}

export async function updateWorld(id, world) {
  const db = await getDb();
  await db.execute(
    "UPDATE worlds SET name = ?, description = ? WHERE id = ?",
    [world.name, world.description || null, id]
  );
  const rows = await db.select("SELECT * FROM worlds WHERE id = ?", [id]);
  return rows[0];
}

// Lore Entries
export async function getLore() {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM lore_entries ORDER BY id DESC");
  return rows.map(r => ({
    ...r,
    is_active: r.is_active === 1
  }));
}

export async function createLore(lore) {
  const db = await getDb();
  await db.execute(
    `INSERT INTO lore_entries (world_id, title, keys, content, is_active, weight) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      lore.world_id || null,
      lore.title,
      lore.keys,
      lore.content,
      lore.is_active !== false ? 1 : 0,
      lore.weight || 100
    ]
  );
  const rows = await db.select("SELECT * FROM lore_entries ORDER BY id DESC LIMIT 1");
  const l = rows[0];
  return {
    ...l,
    is_active: l.is_active === 1
  };
}

export async function updateLore(id, lore) {
  const db = await getDb();
  await db.execute(
    `UPDATE lore_entries SET world_id = ?, title = ?, keys = ?, content = ?, is_active = ?, weight = ? WHERE id = ?`,
    [
      lore.world_id || null,
      lore.title,
      lore.keys,
      lore.content,
      lore.is_active ? 1 : 0,
      lore.weight || 100,
      id
    ]
  );
  const rows = await db.select("SELECT * FROM lore_entries WHERE id = ?", [id]);
  const l = rows[0];
  return {
    ...l,
    is_active: l.is_active === 1
  };
}

export async function deleteLore(id) {
  const db = await getDb();
  await db.execute("DELETE FROM lore_entries WHERE id = ?", [id]);
  return true;
}

// UI Stickers
export async function getStickers() {
  const db = await getDb();
  return db.select("SELECT * FROM ui_stickers ORDER BY created_at ASC");
}

export async function createSticker(sticker) {
  const db = await getDb();
  const id = sticker.id || crypto.randomUUID();
  await db.execute(
    `INSERT INTO ui_stickers (id, image_data, x, y, scale, rotation, opacity, target_selectors)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      sticker.image_data,
      sticker.x || 100.0,
      sticker.y || 100.0,
      sticker.scale || 1.0,
      sticker.rotation || 0,
      sticker.opacity || 0.8,
      sticker.target_selectors || null
    ]
  );
  const rows = await db.select("SELECT * FROM ui_stickers WHERE id = ?", [id]);
  return rows[0];
}

export async function updateSticker(id, sticker) {
  const db = await getDb();
  await db.execute(
    `UPDATE ui_stickers SET x = ?, y = ?, scale = ?, rotation = ?, opacity = ?, target_selectors = ? WHERE id = ?`,
    [
      sticker.x,
      sticker.y,
      sticker.scale,
      sticker.rotation,
      sticker.opacity,
      sticker.target_selectors || null,
      id
    ]
  );
  const rows = await db.select("SELECT * FROM ui_stickers WHERE id = ?", [id]);
  return rows[0];
}

export async function deleteSticker(id) {
  const db = await getDb();
  await db.execute("DELETE FROM ui_stickers WHERE id = ?", [id]);
  return true;
}

// Chat Summaries CRUD
export async function createChatSummary(room_id, summary_text, start_message_id, end_message_id) {
  const db = await getDb();
  await db.execute(
    "INSERT INTO chat_summaries (room_id, summary_text, start_message_id, end_message_id) VALUES (?, ?, ?, ?)",
    [room_id, summary_text, start_message_id, end_message_id]
  );
  const rows = await db.select("SELECT * FROM chat_summaries WHERE room_id = ? ORDER BY id DESC LIMIT 1", [room_id]);
  return rows[0];
}

export async function getLatestChatSummary(room_id) {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM chat_summaries WHERE room_id = ? ORDER BY end_message_id DESC LIMIT 1", [room_id]);
  return rows[0] || null;
}
