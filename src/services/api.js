// src/services/api.js
// Client-side API broker. Exposes and routes all local operations to domain services.

import { initDatabase } from './migrations';
import * as crud from './crud';

export async function initializeApp() {
  await initDatabase();
  console.log("[API] Application initialized successfully.");
}

// Helper to mask encrypted API keys in settings/profiles before sending to frontend
function maskKeys(obj) {
  if (!obj) return obj;
  const copy = { ...obj };
  if (copy.openrouter_key && copy.openrouter_key.startsWith("enc::")) {
    copy.openrouter_key = "••••••••••••••••";
  }
  if (copy.custom_key && copy.custom_key.startsWith("enc::")) {
    copy.custom_key = "••••••••••••••••";
  }
  return copy;
}

// ── Connection Profiles ──
export async function fetchConnectionProfiles() {
  const profiles = await crud.getProfiles();
  return profiles.map(maskKeys);
}

export async function createConnectionProfile(name) {
  const p = await crud.createProfile(name);
  return maskKeys(p);
}

export async function updateConnectionProfile(id, name) {
  const p = await crud.updateProfile(id, name);
  return maskKeys(p);
}

export async function renameConnectionProfile(id, name) {
  const p = await crud.updateProfile(id, name);
  return maskKeys(p);
}

export async function deleteConnectionProfile(id) {
  return crud.deleteProfile(id);
}

export async function activateConnectionProfile(id) {
  const settings = await crud.activateProfile(id);
  return maskKeys(settings);
}

// ── Settings ──
export async function fetchSettings() {
  const settings = await crud.getSettings();
  return maskKeys(settings);
}

export async function saveSettings(settingsForm) {
  const settings = await crud.saveSettings(settingsForm);
  return maskKeys(settings);
}

// ── Connection Testing ──
export { testConnection } from './connectionService';

// ── Characters ──
export { fetchCharacters, saveCharacter, deleteCharacter, importTavernCard } from './characterService';
export { generateCharacterTags } from './tagGenerator';

// ── Rooms & Conversations ──
export {
  fetchRooms,
  createRoom,
  deleteRoom,
  fetchRoomMemories,
  fetchRoomMessages,
  sendMessage,
  sendBotGreeting,
  swipeMessage,
  deleteMessage,
  updateMessage,
  truncateMessages,
  branchRoom,
  addRoomMember,
  removeRoomMember,
  fetchNextSpeaker
} from './roomService';

// ── Worlds & Lore ──
export { fetchWorlds, createWorld, deleteWorld, fetchLore, saveLore, deleteLore } from './worldService';

// ── Stickers ──
export async function fetchStickers() {
  return crud.getStickers();
}

export async function createSticker(stickerData) {
  return crud.createSticker(stickerData);
}

export async function updateSticker(id, stickerData) {
  return crud.updateSticker(id, stickerData);
}

export async function deleteSticker(id) {
  return crud.deleteSticker(id);
}

// ── LLM Generation & Swipe Regeneration ──
export { generateBotResponse, regenerateSwipe, checkCloudRateLimit } from './generationService';
