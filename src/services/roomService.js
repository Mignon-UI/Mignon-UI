// src/services/roomService.js
// Client-side Room & Conversation manager. Exposes room controls, message routing,
// RAG side-effects, and turn election logic.

import { getDb } from './db';
import * as crud from './crud';
import * as rag from './rag';
import { runEfficientSelector } from './turnTaking';
import { runCognitiveAuction, updateHybridSceneState } from './sceneService';

export async function fetchRooms() {
  const rooms = await crud.getRooms();
  return rooms.map(r => ({
    id: r.id,
    name: r.name,
    is_group: r.is_group,
    description: r.description,
    scene_state: r.scene_state,
    bots: r.members || [],
    last_message: r.last_message
  }));
}

export async function createRoom(roomData) {
  const room = await crud.createRoom(roomData);
  return {
    id: room.id,
    name: room.name,
    is_group: room.is_group,
    description: room.description,
    scene_state: room.scene_state,
    bots: room.members || [],
    last_message: room.last_message
  };
}

export async function deleteRoom(id) {
  // Clear room episodic memories from RAG vector store
  await rag.clearEmbeddings("memory", id);
  return crud.deleteRoom(id);
}

export async function fetchRoomMemories(roomId) {
  const dbInst = await getDb();
  return dbInst.select("SELECT * FROM chat_summaries WHERE room_id = ? ORDER BY id ASC", [roomId]);
}

export async function fetchRoomMessages(roomId) {
  return crud.getRoomMessages(roomId);
}

export async function sendMessage(roomId, content, senderName = "User") {
  // Save message to SQLite
  await crud.createMessage({
    room_id: roomId,
    sender_type: "user",
    character_id: null,
    sender_name: senderName,
    content: content,
    swipes: [content],
    active_swipe_index: 0
  });

  // Programmatically update User's Scene Status Board (character_id = 0 represents the user)
  try {
    await updateHybridSceneState(roomId, 0, senderName, content);
  } catch (exScene) {
    console.warn("[RoomService] User scene state update warning:", exScene);
  }

  return true;
}

export async function sendBotGreeting(roomId, characterId, characterName, greeting) {
  await crud.createMessage({
    room_id: roomId,
    sender_type: "character",
    character_id: characterId,
    sender_name: characterName,
    content: greeting,
    swipes: [greeting],
    active_swipe_index: 0
  });
  return true;
}

export async function swipeMessage(roomId, msgId, newIndex) {
  return crud.swipeMessage(roomId, msgId, newIndex);
}

export async function deleteMessage(msgId) {
  return crud.deleteMessage(msgId);
}

export async function updateMessage(msgId, content) {
  return crud.updateMessage(msgId, content);
}

export async function truncateMessages(roomId, messageId) {
  const { messages, orphanedIds } = await crud.truncateMessages(roomId, messageId);
  if (orphanedIds && orphanedIds.length > 0) {
    for (const id of orphanedIds) {
      await rag.deleteEmbedding(`mem_${id}`);
    }
  }
  return messages;
}

export async function branchRoom(roomId, messageId) {
  const { room, clonedSummaries } = await crud.branchRoom(roomId, messageId);
  if (clonedSummaries && clonedSummaries.length > 0) {
    for (const summ of clonedSummaries) {
      const textToEmbed = `[PAST EVENT EPISODE]: ${summ.summary_text}`;
      await rag.saveEmbedding(`mem_${summ.id}`, "memory", room.id, `Room Memory Episode ${summ.id}`, textToEmbed);
    }
  }
  return {
    id: room.id,
    name: room.name,
    is_group: room.is_group,
    description: room.description,
    scene_state: room.scene_state,
    bots: room.members || [],
    last_message: room.last_message
  };
}

export async function addRoomMember(roomId, characterId) {
  const room = await crud.addRoomMember(roomId, characterId);
  return {
    id: room.id,
    name: room.name,
    is_group: room.is_group,
    description: room.description,
    scene_state: room.scene_state,
    bots: room.members || [],
    last_message: room.last_message
  };
}

export async function removeRoomMember(roomId, characterId) {
  const room = await crud.removeRoomMember(roomId, characterId);
  return {
    id: room.id,
    name: room.name,
    is_group: room.is_group,
    description: room.description,
    scene_state: room.scene_state,
    bots: room.members || [],
    last_message: room.last_message
  };
}

export async function fetchNextSpeaker(roomId, messageContent = "", mutedIds = "", mode = "efficient") {
  try {
    const dbInst = await getDb();
    
    // Load bots and messages
    const members = await dbInst.select("SELECT character_id FROM room_members WHERE room_id = ?", [roomId]);
    const charIds = members.map(m => m.character_id);
    
    if (charIds.length === 0) return { next_speaker_id: null };

    // Fetch settings and persona ID
    const settings = await crud.getSettings();
    const personaId = settings?.persona_character_id || null;

    // Apply mute filter and exclude persona character
    const mutedSet = new Set(mutedIds.split(",").map(id => parseInt(id)).filter(Boolean));
    const activeCharIds = charIds.filter(id => id !== personaId && !mutedSet.has(id));

    if (activeCharIds.length === 0) return { next_speaker_id: null };

    const placeholders = activeCharIds.map(() => '?').join(',');
    const bots = await dbInst.select(`SELECT * FROM characters WHERE id IN (${placeholders})`, activeCharIds);

    const messages = await crud.getRoomMessages(roomId);

    // User Floor Hunger Check:
    // If the bots have spoken 3 or more times consecutively without the user,
    // yield the floor to the user by returning null.
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_type === "user") {
        lastUserIdx = i;
        break;
      }
    }
    let botConsecutiveReplies = messages.length;
    if (lastUserIdx !== -1) {
      botConsecutiveReplies = (messages.length - 1) - lastUserIdx;
    }
    if (botConsecutiveReplies >= 3) {
      console.log(`[TurnTaking] Yielding floor to User (consecutive bot turns: ${botConsecutiveReplies}). Halting chain.`);
      return { next_speaker_id: null };
    }
    
    const roomRows = await dbInst.select("SELECT scene_state FROM chat_sessions WHERE id = ?", [roomId]);
    const sceneState = roomRows[0] && roomRows[0].scene_state ? JSON.parse(roomRows[0].scene_state) : null;

    let winnerId = null;
    if (mode === "cognitive") {
      winnerId = await runCognitiveAuction(roomId, messageContent, bots, messages);
    } else if (mode === "efficient") {
      winnerId = await runEfficientSelector(messageContent, bots, messages, null);
    } else {
      winnerId = await runEfficientSelector(messageContent, bots, messages, sceneState);
    }

    return { next_speaker_id: winnerId };
  } catch (e) {
    console.error("[RoomService] turn election failed:", e);
    return { next_speaker_id: null };
  }
}
