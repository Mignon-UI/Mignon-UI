// src/services/worldService.js
// Client-side World and Lore service. Manages worlds/settings, lore keys, and lore RAG index.

import * as crud from './crud';
import * as rag from './rag';

export async function fetchWorlds() {
  return crud.getWorlds();
}

export async function createWorld(worldData) {
  return crud.createWorld(worldData);
}

export async function deleteWorld(id) {
  await rag.clearEmbeddings("lore", String(id));
  return crud.deleteWorld(id);
}

export async function fetchLore() {
  return crud.getLore();
}

async function createLore(loreForm) {
  const lore = await crud.createLore(loreForm);
  
  // Index in RAG vector store
  if (lore.world_id) {
    const textToEmbed = `[LORE: ${lore.title}]\nTrigger keywords: ${lore.keys}\n\n${lore.content}`;
    await rag.saveEmbedding(`lore_${lore.id}`, "lore", String(lore.world_id), lore.title, textToEmbed);
  }
  
  return lore;
}

async function updateLore(id, loreForm) {
  const lore = await crud.updateLore(id, loreForm);
  
  // Update in RAG vector store
  if (lore.world_id) {
    const textToEmbed = `[LORE: ${lore.title}]\nTrigger keywords: ${lore.keys}\n\n${lore.content}`;
    await rag.saveEmbedding(`lore_${lore.id}`, "lore", String(lore.world_id), lore.title, textToEmbed);
  } else {
    // Delete if world removed
    await rag.deleteEmbedding(`lore_${id}`);
  }
  
  return lore;
}

export async function saveLore(loreForm) {
  if (loreForm.id) {
    return updateLore(loreForm.id, loreForm);
  }
  return createLore(loreForm);
}

export async function deleteLore(id) {
  await rag.deleteEmbedding(`lore_${id}`);
  return crud.deleteLore(id);
}
