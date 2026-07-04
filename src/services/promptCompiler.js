// src/services/promptCompiler.js
// Assembles the full system prompt and formatted chat history string for LLM generation requests.
// Ported directly from app/services/prompt_compiler.py.

import { getDb } from './db';
import { retrieveEmbeddings, embedTexts } from './rag';

const RAG_TOP_K = 5;
const RAG_DISTANCE_CUTOFF = 0.70;

function getMessageContent(m) {
  let swipes = [];
  try {
    swipes = typeof m?.swipes === 'string' ? JSON.parse(m.swipes) : (m?.swipes || []);
  } catch {
    // Ignore JSON parse errors for message swipes fallback
  }
  return swipes[m?.active_swipe_index || 0] ?? (m?.content || "");
}

function cleanRoleplayQuery(text) {
  if (!text) return "";
  const cleaned = text.replace(/\*+.*?\*+/g, ' ').replace(/\s+/g, ' ').trim();
  return cleaned || text;
}

async function expandQueryTopics(rawText, rawContext, worldId) {
  if (!rawText || worldId == null) return rawText;

  const contextLower = rawContext.toLowerCase();
  const expansions = new Set();

  try {
    const db = await getDb();
    const entries = await db.select(
      "SELECT title, keys FROM lore_entries WHERE world_id = ? AND is_active = 1",
      [worldId]
    );
    for (const entry of entries) {
      const keys = entry.keys?.split(",").map(k => k.trim().toLowerCase()).filter(Boolean) || [];
      if (keys.some(k => contextLower.includes(k))) {
        expansions.add(`${entry.title} ${entry.keys.replace(/,/g, ' ')}`);
      }
    }
  } catch (e) {
    console.warn(`[RAG Dynamic] Error loading LoreEntry expansions for world ${worldId}:`, e);
  }

  return expansions.size ? `${rawText} ${[...expansions].join(" ")}` : rawText;
}

async function buildRagQuery(messages, worldId) {
  const recentMsgs = messages.slice(-3);
  const contents = recentMsgs.map(getMessageContent);
  const baseQuery = contents.map(cleanRoleplayQuery).join(" ");
  const rawContext = contents.join(" ");
  return expandQueryTopics(baseQuery, rawContext, worldId);
}

async function retrieveKeywordLore(query) {
  const tokens = query?.toLowerCase().match(/\b\w+\b/g);
  if (!tokens) return [];

  const tokenSet = new Set(tokens);
  const db = await getDb();
  const entries = await db.select("SELECT id, world_id, title, keys, content FROM lore_entries WHERE is_active = 1");
  
  const matchedEntries = entries.filter(entry => {
    const keys = entry.keys?.split(",").map(k => k.trim().toLowerCase()).filter(Boolean) || [];
    return keys.some(key => key.includes(" ") ? query.toLowerCase().includes(key) : tokenSet.has(key));
  });

  return matchedEntries.map(entry => ({
    id: `lore_${entry.id}`,
    type: "lore",
    source_id: String(entry.id),
    title: entry.title,
    text: `[LORE: ${entry.title}]\nTrigger keywords: ${entry.keys}\n\n${entry.content}`,
    _distance: 0.0
  }));
}

async function retrieveRelevantContext(query, worldId, queryVec = null) {
  if (!query || !query.trim()) return [];

  const keywordResults = await retrieveKeywordLore(query);
  let semanticResults = [];
  try {
    const rawSemantic = await retrieveEmbeddings(queryVec || query, RAG_TOP_K, { type: "lore", sourceId: String(worldId || "") });
    semanticResults = rawSemantic.filter(r => r._distance <= RAG_DISTANCE_CUTOFF);
  } catch (e) {
    console.error("[RAG] Error fetching semantic search results:", e);
  }

  const allResults = [...keywordResults, ...semanticResults];
  const uniqueParentIds = [...new Set(allResults.map(r => parseInt(r.source_id, 10)))].slice(0, RAG_TOP_K);

  if (uniqueParentIds.length === 0) return [];

  const db = await getDb();
  const placeholders = uniqueParentIds.map(() => '?').join(',');
  const parents = await db.select(
    `SELECT id, title, keys, content FROM lore_entries WHERE id IN (${placeholders})`,
    uniqueParentIds
  );

  const parentMap = Object.fromEntries(parents.map(p => [p.id, p]));
  return uniqueParentIds
    .map(pid => parentMap[pid])
    .filter(Boolean)
    .map(entry => ({
      id: `lore_${entry.id}`,
      type: "lore",
      source_id: String(entry.id),
      title: entry.title,
      text: `[LORE: ${entry.title}]\nTrigger keywords: ${entry.keys}\n\n${entry.content}`,
      _distance: 0.0
    }));
}

async function retrieveRelevantMemories(query, roomId, queryVec = null) {
  if (!query || !query.trim()) return [];
  try {
    const results = await retrieveEmbeddings(queryVec || query, 3, { type: "memory", sourceId: roomId });
    return results.filter(r => r._distance <= RAG_DISTANCE_CUTOFF);
  } catch (e) {
    console.error("[RAG] Error fetching episodic memories:", e);
    return [];
  }
}

async function resolvePersona(settings) {
  const db = await getDb();
  if (settings?.persona_character_id) {
    const charRows = await db.select("SELECT name, personality FROM characters WHERE id = ?", [settings.persona_character_id]);
    if (charRows.length > 0) {
      return [charRows[0].name, charRows[0].personality];
    }
  }

  const name = settings?.persona_name || "User";
  const desc = settings?.persona_description || null;
  return [name, desc];
}

async function compilePlayerPersona(settings) {
  const [pName, pDesc] = await resolvePersona(settings);
  return `<player_persona>
  <name>${pName}</name>${pDesc ? `\n  <persona_backstory>${pDesc}</persona_backstory>` : ''}
</player_persona>\n\n`;
}

async function getRecentMessages(roomId, limit = 20) {
  const db = await getDb();
  const messages = await db.select(
    "SELECT id, content, swipes, active_swipe_index FROM messages WHERE room_id = ? ORDER BY id DESC LIMIT ?",
    [roomId, limit]
  );
  messages.reverse();
  return messages;
}

async function compileRagContext(messages, worldId, roomId) {
  if (!messages.length) return "";

  const ragQuery = await buildRagQuery(messages, worldId);
  let queryVec = null;
  try {
    const queryEmbeddings = await embedTexts([ragQuery]);
    queryVec = queryEmbeddings?.[0] || null;
  } catch (e) {
    console.warn("[RAG] Failed to precompute query embedding:", e);
  }

  const [relevantChunks, relevantMemories] = await Promise.all([
    retrieveRelevantContext(ragQuery, worldId, queryVec),
    retrieveRelevantMemories(ragQuery, roomId, queryVec)
  ]);

  let xml = "";
  if (relevantChunks.length) {
    xml += `<retrieved_world_lore>\n${relevantChunks.map(chunk => 
      `  <lore_entry title="${chunk.title}">\n    ${chunk.text.trim()}\n  </lore_entry>`
    ).join("\n")}\n</retrieved_world_lore>\n\n`;
  }

  if (relevantMemories.length) {
    xml += `<retrieved_episodic_memories>\n${relevantMemories.map(mem => 
      `  <past_event>${mem.text.replace("[PAST EVENT EPISODE]: ", "").trim()}</past_event>`
    ).join("\n")}\n</retrieved_episodic_memories>\n\n`;
  }
  return xml;
}

function compileCharacterProfile(bot) {
  return `<character_profile>
  <name>${bot.name}</name>${bot.personality ? `\n  <personality_description>${bot.personality}</personality_description>` : ''}${bot.scenario ? `\n  <scenario_situation>${bot.scenario}</scenario_situation>` : ''}
</character_profile>\n\n`;
}

function compileOtherGroupMembers(roomBots, targetBotId) {
  const others = roomBots.filter(b => b.id !== targetBotId);
  if (!others.length) return "";

  return `<group_chat_members>\n${others.map(bot => `  <member_character>
    <name>${bot.name}</name>${bot.personality ? `\n    <persona>${bot.personality.slice(0, 300)}...</persona>` : ''}
  </member_character>`).join("\n")}
</group_chat_members>\n\n`;
}

function compileActiveSceneBoard(sceneState, targetBotId = null) {
  if (!sceneState) return "";
  try {
    const stateDict = typeof sceneState === 'string' ? JSON.parse(sceneState) : sceneState;
    if (!stateDict || Object.keys(stateDict).length === 0) return "";
    
    const env = stateDict.environment || {};
    let xml = `<active_scene_board>
  <location>${env.location || 'Main Room'}</location>${env.atmosphere ? `\n  <atmosphere>${env.atmosphere}</atmosphere>` : ''}
  <character_statuses>\n`;

    for (const [charIdStr, status] of Object.entries(stateDict)) {
      if (charIdStr === "environment" || charIdStr === "active_motivation" || !status || typeof status !== 'object') continue;
      
      const namePrefix = (targetBotId !== null && charIdStr === String(targetBotId)) ? "You" : (status.name || "Unknown");
      xml += `    <character_status name="${namePrefix}">
      <location>${status.location || "Main Room"}</location>
      <current_action>${status.action || "Idle / Standing by"}</current_action>
      <mood>${status.mood || "neutral"}</mood>
    </character_status>\n`;
    }
    
    xml += "  </character_statuses>\n</active_scene_board>\n\n";
    return xml;
  } catch (e) {
    console.warn("[Prompt Compiler] Failed to parse scene_state:", e);
    return "";
  }
}

function compileMotivationDirective(sceneState) {
  try {
    const sState = typeof sceneState === 'string' ? JSON.parse(sceneState) : (sceneState || {});
    if (sState.active_motivation) {
      return `  <immediate_private_motivation>Your immediate private motivation for speaking right now: "${sState.active_motivation}". Let this naturally guide the direction of your next dialogue turn.</immediate_private_motivation>\n`;
    }
  } catch {
    // Ignore JSON parse errors for active motivation scene state
  }
  return "";
}

export async function compileSystemPrompt(roomId, targetBot, settings) {
  const db = await getDb();
  const [pName] = await resolvePersona(settings);

  // 1. Resolve room members
  const members = await db.select("SELECT character_id FROM room_members WHERE room_id = ?", [roomId]);
  const charIds = members.map(m => m.character_id);
  const personaId = settings?.persona_character_id || null;

  // Load characters
  let roomBots = [];
  if (charIds.length > 0) {
    const placeholders = charIds.map(() => '?').join(',');
    const loaded = await db.select(`SELECT * FROM characters WHERE id IN (${placeholders})`, charIds);
    roomBots = loaded.filter(c => c.id !== personaId);
  }

  // ── Static Prompt Prefix ──
  const sysTpl = targetBot.system_prompt ? targetBot.system_prompt : (settings?.system_template || "");
  let systemPrompt = `${sysTpl}\n\n`;
  systemPrompt += compileCharacterProfile(targetBot);

  // 2. Global room scenario
  const roomRows = await db.select("SELECT description, scene_state FROM chat_sessions WHERE id = ?", [roomId]);
  const room = roomRows[0] || null;
  if (room?.description) {
    systemPrompt += `<global_room_scenario>\n  ${room.description}\n</global_room_scenario>\n\n`;
  }

  // 3. Other group-chat members
  systemPrompt += compileOtherGroupMembers(roomBots, targetBot.id);

  // 4. Player persona
  systemPrompt += await compilePlayerPersona(settings);

  // ── Semi-Static Prompt Middle (RAG Lookup) ──
  const messages = await getRecentMessages(roomId, 20);
  systemPrompt += await compileRagContext(messages, targetBot.world_id, roomId);

  // ── Dynamic Prompt Suffix ──
  if (room) {
    systemPrompt += compileActiveSceneBoard(room.scene_state, targetBot.id);
  }

  // Motivation directive
  const motivationStr = room ? compileMotivationDirective(room.scene_state) : "";

  const others = roomBots.filter(b => b.id !== targetBot.id).map(b => b.name).join(", ");

  systemPrompt += "<system_instructions>\n";
  systemPrompt += `  <directive>You are now roleplaying strictly and only as [${targetBot.name}]. Stay in character fully.</directive>\n`;
  if (others) {
    systemPrompt += `  <directive>Do not write dialogue, actions, or reactions for other characters: ${others}.</directive>\n`;
  }
  systemPrompt += `  <directive>Do not write dialogue, actions, thoughts, or decisions for the User (${pName}). You must only describe the actions, dialogue, and thoughts of [${targetBot.name}]. Wait for the User (${pName}) to reply on their own turn.</directive>\n`;
  systemPrompt += `  <directive>Do not add system tags, roleplay metadata, or prefix your response with '${targetBot.name}:'. Simply begin writing your response immediately.</directive>\n`;
  systemPrompt += `  <directive>React to the user (${pName}) and other characters naturally, keeping conversational pacing and immersive physical action description (using asterisks *action*).</directive>\n`;

  if (motivationStr) {
    systemPrompt += motivationStr;
  }
  systemPrompt += "</system_instructions>";

  return systemPrompt;
}

export async function compileJointMultiAgentPrompt(roomId, candidates, settings) {
  const db = await getDb();
  const [pName] = await resolvePersona(settings);

  // 1. Static Prompt Prefix
  const sysTpl = candidates[0]?.system_prompt || settings?.system_template || "";
  let systemPrompt = `${sysTpl}\n\n`;

  // 2. Roster profiles of candidates
  systemPrompt += `<candidate_roster>\n${candidates.map(bot => `  <character id="${bot.id}">
    <name>${bot.name}</name>${bot.personality ? `\n    <personality_description>${bot.personality.slice(0, 300)}...</personality_description>` : ''}${bot.scenario ? `\n    <scenario_situation>${bot.scenario.slice(0, 200)}...</scenario_situation>` : ''}
  </character>`).join("\n")}\n</candidate_roster>\n\n`;

  const roomRows = await db.select("SELECT description, scene_state FROM chat_sessions WHERE id = ?", [roomId]);
  const room = roomRows[0] || null;

  // 3. Global room scenario
  if (room?.description) {
    systemPrompt += `<global_room_scenario>\n  ${room.description}\n</global_room_scenario>\n\n`;
  }

  // 4. Player Persona
  systemPrompt += await compilePlayerPersona(settings);

  // ── Semi-Static Prompt Middle (RAG) ──
  const messages = await getRecentMessages(roomId, 20);
  const worldId = candidates[0]?.world_id || null;
  systemPrompt += await compileRagContext(messages, worldId, roomId);

  // ── Dynamic Prompt Suffix ──
  if (room?.scene_state) {
    systemPrompt += compileActiveSceneBoard(room.scene_state, null);
  }

  systemPrompt += "<system_instructions>\n";
  systemPrompt += "  <directive>You are the Collective Mind Coordinator for this multi-agent roleplay sandbox.</directive>\n";
  systemPrompt += "  <directive>Based on the conversation history, decide which character from the <candidate_roster> should respond next.</directive>\n";
  systemPrompt += "  <directive>You MUST begin your response by outputting the selection XML tag exactly as shown below:\n";
  systemPrompt += "  `<selected_speaker id=\"CHOSEN_CHARACTER_ID\">CHOSEN_CHARACTER_NAME</selected_speaker>`\n";
  systemPrompt += "  Replace CHOSEN_CHARACTER_ID with the exact numeric ID string from the roster, and CHOSEN_CHARACTER_NAME with their name.</directive>\n";
  systemPrompt += "  <directive>Immediately after the closing `</selected_speaker>` tag, begin writing the chosen character's response strictly in-character, using their defined personality, backstory, and style.</directive>\n";
  systemPrompt += "  <directive>Do not write dialogue, actions, or reactions for other characters.</directive>\n";
  systemPrompt += `  <directive>Do not write dialogue, actions, thoughts, or decisions for the User (${pName}). You must only describe the actions, dialogue, and thoughts of the selected speaker. Wait for the User (${pName}) to reply on their own turn.</directive>\n`;
  systemPrompt += "  <directive>Do not add system tags, roleplay metadata, or prefix the response with their name. Simply begin writing the selected character's response immediately after the </selected_speaker> tag.</directive>\n";
  systemPrompt += `  <directive>React to the user (${pName}) and other characters naturally, keeping conversational pacing and immersive physical action description (using asterisks *action*).</directive>\n`;
  systemPrompt += "  <directive>At the absolute end of the character's response, after all dialogue and actions, you MUST decide who should speak next in the room and output a next speaker XML tag exactly as shown below:\n";
  systemPrompt += "  `<next_speaker id=\"NEXT_CHARACTER_ID\">` or `<next_speaker id=\"user\">` if the conversation should pause for user input.\n";
  systemPrompt += "  Replace NEXT_CHARACTER_ID with the exact numeric ID string of the active character from the roster who should speak next. Do not write any dialogue or actions after this tag.</directive>\n";
  systemPrompt += "</system_instructions>";

  return systemPrompt;
}

export async function formatChatHistory(roomId, targetBot, settings = null, excludeFrom = null) {
  const db = await getDb();

  let queryStr = "SELECT id, sender_type, character_id, sender_name, content, swipes, active_swipe_index FROM messages WHERE room_id = ?";
  const params = [roomId];
  if (excludeFrom != null) {
    queryStr += " AND id < ?";
    params.push(excludeFrom);
  }
  queryStr += " ORDER BY id DESC LIMIT 20";

  const messages = await db.select(queryStr, params);
  messages.reverse();

  const [pName] = settings ? await resolvePersona(settings) : ["User", null];

  // Resolve room members
  const members = await db.select("SELECT character_id FROM room_members WHERE room_id = ?", [roomId]);
  const charIds = members.map(m => m.character_id);
  const roomBots = charIds.length
    ? await db.select(`SELECT * FROM characters WHERE id IN (${charIds.map(() => '?').join(',')})`, charIds)
    : [];

  const lastMsg = messages[messages.length - 1];
  const lastSpeakerName = lastMsg ? (lastMsg.sender_type === "user" ? pName : lastMsg.sender_name) : null;

  let historyStr = messages.map(m => {
    const sender = m.sender_type === "user" ? pName : m.sender_name;
    return `${sender}: ${getMessageContent(m)}`;
  }).join("\n\n") + "\n\n";

  if (lastSpeakerName && lastSpeakerName !== targetBot.name) {
    if (roomBots.length > 1) {
      const othersPresent = roomBots
        .filter(b => b.id !== targetBot.id && b.name !== lastSpeakerName)
        .map(b => b.name);
      if (lastSpeakerName !== pName) othersPresent.push(pName);
      
      historyStr += `(${targetBot.name} is now responding in the group setting, reacting particularly to ${lastSpeakerName}'s latest statement, while remaining fully aware of ${othersPresent.join(", ")} listening and present...)\n`;
    } else {
      historyStr += `(${targetBot.name} is now responding to ${pName}...)\n`;
    }
  } else {
    historyStr += `(${targetBot.name} is now continuing their response, adding more actions or dialogue as [${targetBot.name}]...)\n`;
  }

  if (targetBot.post_history_instructions) {
    historyStr += `\n${targetBot.post_history_instructions.trim()}\n`;
  }

  return historyStr;
}
