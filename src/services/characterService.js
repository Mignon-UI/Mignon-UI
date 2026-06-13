// src/services/characterService.js
// Client-side character service. Handles CRUD, world lore cleanups, and Tavern imports.

import * as crud from './crud';
import * as rag from './rag';
import { parseTavernPng, extractAvatarUrlFromPngBytes } from './tavernParser';

export async function fetchCharacters() {
  return crud.getCharacters();
}

export async function saveCharacter(characterForm) {
  if (characterForm.id) {
    return crud.updateCharacter(characterForm.id, characterForm);
  }
  return crud.createCharacter(characterForm);
}

export async function deleteCharacter(id) {
  // Clear associated world lore embeddings if the character had a world
  const dbChar = (await crud.getCharacters()).find(c => c.id === id);
  if (dbChar && dbChar.world_id) {
    await rag.clearEmbeddings("lore", String(dbChar.world_id));
  }
  return crud.deleteCharacter(id);
}

export async function importTavernCard(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target.result;
        
        // 1. Parse Tavern character sheet png chunks
        const charData = parseTavernPng(arrayBuffer);
        if (!charData) {
          throw new Error("Failed to parse Tavern metadata from PNG.");
        }

        // 2. Extract avatar as Base64 Data URL
        const avatarUrl = extractAvatarUrlFromPngBytes(arrayBuffer);
        charData.avatar = avatarUrl;

        // 3. Save character in SQLite
        const savedChar = await crud.createCharacter(charData);

        // 4. Save character book lore entries into world RAG if present
        if (charData.lore_entries && charData.lore_entries.length > 0) {
          // If world_id is null, create a new world container named after the bot
          const newWorld = await crud.createWorld({
            name: `${charData.name} World Settings`,
            description: `Auto-generated world for Tavern Card character: ${charData.name}`
          });
          
          // Link bot to new world
          await crud.updateCharacter(savedChar.id, { ...savedChar, world_id: newWorld.id });
          
          for (const entry of charData.lore_entries) {
            // Save in SQLite lore table
            const savedLore = await crud.createLore({
              world_id: newWorld.id,
              title: entry.title,
              keys: entry.keys,
              content: entry.content,
              weight: entry.weight
            });

            // Index in RAG vector store
            const embeddingText = `[LORE: ${entry.title}]\nTrigger keywords: ${entry.keys}\n\n${entry.content}`;
            await rag.saveEmbedding(`lore_${savedLore.id}`, "lore", String(newWorld.id), entry.title, embeddingText);
          }
        }

        resolve(savedChar);
      } catch (e) {
        console.error("[API] Tavern import error:", e);
        reject(e);
      }
    };
    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsArrayBuffer(file);
  });
}
