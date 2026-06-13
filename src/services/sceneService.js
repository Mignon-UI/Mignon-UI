// src/services/sceneService.js
// Intelligence Mode (LLM-driven Collective Mind Bidding Auction) and programmatic situational consciousness helpers.
// Ported directly from app/services/scene_service.py.

import { getDb } from './db';
import { runEfficientSelector } from './turnTaking';

export async function runCognitiveAuction(roomId, messageContent, eligibleBots, messages) {
  if (!eligibleBots || eligibleBots.length === 0) {
    return null;
  }
  if (eligibleBots.length === 1) {
    return eligibleBots[0].id;
  }

  const db = await getDb();
  
  // 1. Read scene_state to check for next_speaker_id
  let nextSpeakerId = null;
  const rooms = await db.select("SELECT scene_state FROM chat_sessions WHERE id = ?", [roomId]);
  let stateDict = {};
  if (rooms.length > 0 && rooms[0].scene_state) {
    try {
      stateDict = JSON.parse(rooms[0].scene_state);
      nextSpeakerId = stateDict.next_speaker_id;
      
      // Delete next_speaker_id immediately so it is consumed only once
      if (nextSpeakerId !== undefined) {
        delete stateDict.next_speaker_id;
        await db.execute("UPDATE chat_sessions SET scene_state = ? WHERE id = ?", [JSON.stringify(stateDict), roomId]);
      }
    } catch (e) {
      console.warn("[Cognitive] Error reading scene_state for next speaker:", e);
    }
  }

  if (nextSpeakerId === "user") {
    console.log("[Cognitive] LLM indicated user should speak next. Halting chain.");
    return null;
  }

  if (nextSpeakerId !== null && nextSpeakerId !== undefined) {
    const nextId = parseInt(nextSpeakerId, 10);
    const candidate = eligibleBots.find(b => b.id === nextId);
    if (candidate) {
      console.log(`[Cognitive] Turn Hinting awarded floor to: ${candidate.name} (ID: ${nextId})`);
      
      // Update active motivation in scene state
      stateDict["active_motivation"] = `Selected by LLM turn hinting to speak next.`;
      await db.execute("UPDATE chat_sessions SET scene_state = ? WHERE id = ?", [JSON.stringify(stateDict), roomId]);
      
      return nextId;
    }
  }

  // 2. Fallback: Run local efficient selector (no LLM call)
  console.log("[Cognitive] No valid next_speaker tag. Running robust local efficient fallback.");
  const fallbackWinnerId = await runEfficientSelector(messageContent, eligibleBots, messages, stateDict);
  if (fallbackWinnerId !== null) {
    const winnerBot = eligibleBots.find(b => b.id === fallbackWinnerId);
    const wName = winnerBot ? winnerBot.name : "Unknown";
    console.log(`[Cognitive] Fallback awarded floor to: ${wName} (ID: ${fallbackWinnerId})`);
    
    stateDict["active_motivation"] = "Participating in active conversation turns (Fallback).";
    await db.execute("UPDATE chat_sessions SET scene_state = ? WHERE id = ?", [JSON.stringify(stateDict), roomId]);
  }
  return fallbackWinnerId;
}

export function cleanLlmJson(text) {
  if (!text) return "";

  // 1. XML tag extraction
  const tagMatch = text.match(/<bids_json>\s*([\s\S]*?)\s*<\/bids_json>/i);
  if (tagMatch) {
    const content = tagMatch[1].trim();
    const mdMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (mdMatch) {
      return mdMatch[1].trim();
    }
    return content;
  }

  // 2. Markdown wrapper
  const mdMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (mdMatch) {
    return mdMatch[1].trim();
  }

  // 3. Curly braces
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1) {
    return text.slice(start, end + 1).trim();
  }

  return text.trim();
}

export function extractPhysicalAction(replyContent) {
  if (!replyContent) return "";
  
  // Match single asterisks
  const matches = replyContent.match(/\*(.*?)\*/g);
  if (!matches) return "";
  
  const cleanedActions = [];
  for (const match of matches) {
    const cleaned = match.replace(/\*/g, "").trim();
    if (cleaned) {
      cleanedActions.push(cleaned);
    }
  }
  return cleanedActions.join(", ");
}

export function detectLocationChange(action) {
  if (!action) return null;
  const actionClean = action.trim();

  const patterns = [
    /\b(?:walk(?:s|ing)?|mov(?:e|es|ing)?|go(?:es|ing)?|head(?:s|ing)?|run(?:s|ning)?|step(?:s|ping)?|leav(?:e|es|ing)?|return(?:s|ing)?|sneak(?:s|ing)?|slip(?:s|ing)?|lead(?:s|ing)?|guid(?:e|es|ing)?|follow(?:s|ing)?|pull(?:s|ing)?|drag(?:s|ged|ging)?)(?:\s+(?!to|into|for|at|inside|toward|towards)[a-zA-Z]+){0,2}\s+(?:to|into|for|at|inside|toward|towards)\s+(?:the\s+)?([A-Za-z0-9\s'_-]{2,30})/i,
    /\b(?:enter|reach)(?:s|es|ed|ing)?(?!\s+out\b)\s+(?:the\s+)?([A-Za-z0-9\s'_-]{2,30})/i
  ];

  for (const pat of patterns) {
    const match = actionClean.match(pat);
    if (match) {
      let dest = match[1].trim();
      const stopTriggers = [
        /\b(?:and|but|with|as|to|while|where|then|so|for|at|by|from|in|of|on|through|under|over)\b/i,
        /\b(?:slowly|quickly|cautiously|quietly|stealthily|hesitantly|gently|silently|nervously|calmly|hurriedly|eagerly|sadly|happily|angrily|wearily|tiredly|scaredly|timidly|boldly)\b/i,
        /[,.;!?]/
      ];
      for (const trigger of stopTriggers) {
        dest = dest.split(trigger)[0].trim();
      }
      dest = dest.replace(/['"*]/g, "").trim();

      if (dest.length >= 2 && dest.length <= 30) {
        return dest.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }
  }
  return null;
}

export function detectMoodChange(text) {
  if (!text) return null;
  const textLower = text.toLowerCase();

  const moodTriggers = {
    aroused: ["aroused", "arousal", "pant", "heavy breath", "lustful", "moan", "orgasm", "breeding", "wet", "dripping"],
    flustered: ["blush", "blushing", "flustered", "pink cheeks", "red cheeks", "embarrassed", "timidly", "shyly", "fidget", "giggle nervously", "goes red"],
    teasing: ["teas", "smirk", "wink", "playful", "mischievous", "chuckle", "mocking", "tongue out", "jest"],
    proud: ["proud", "pride", "smug", "triumphant", "boast", "arrogant", "gloat", "haught"],
    jealous: ["jealous", "envy", "envious", "pout", "possessiv", "covet"],
    surprised: ["surprise", "shock", "gasp", "startle", "wide-eyed", "wide eyes", "widen", "astound", "astonish", "bewilder"],
    sleepy: ["yawn", "sleepy", "tired", "exhausted", "drowsy", "rub eyes", "rubbing eyes", "nod off", "nodding off", "heavy eyelids", "fatigue"],
    happy: ["smile", "giggle", "laugh", "grin", "cheerful", "happy", "contented", "delighted", "gently stroke"],
    angry: ["scowl", "glare", "frown", "angry", "annoyed", "irritated", "growl", "hiss", "grumble"],
    sad: ["sigh", "cry", "whimper", "sad", "tear", "gloomy", "depressed", "weep", "sniffle"]
  };

  for (const [mood, triggers] of Object.entries(moodTriggers)) {
    if (triggers.some(t => textLower.includes(t))) {
      return mood;
    }
  }
  return null;
}

export async function updateHybridSceneState(roomId, characterId, characterName, replyContent, nextSpeakerId = null) {
  const db = await getDb();
  const rooms = await db.select("SELECT scene_state FROM chat_sessions WHERE id = ?", [roomId]);
  if (rooms.length === 0) return;

  const action = extractPhysicalAction(replyContent);
  let stateDict = {};
  try {
    stateDict = rooms[0].scene_state ? JSON.parse(rooms[0].scene_state) : {};
  } catch {
    // ignore
  }

  const charKey = String(characterId);
  if (!stateDict[charKey]) {
    stateDict[charKey] = {
      name: characterName,
      location: "Main Room",
      action: "",
      mood: "neutral"
    };
  }

  if (action) {
    stateDict[charKey].action = action;
    const newLoc = detectLocationChange(action);
    if (newLoc) {
      const actionLower = action.toLowerCase();
      const isCollective = ["let's", "lets", "we ", "we'll", "everyone", "all "].some(term => actionLower.includes(term));
      if (isCollective) {
        console.log(`[Scene State] Collective movement detected! Moving everyone in room to: ${newLoc}`);
        for (const k of Object.keys(stateDict)) {
          if (k !== "environment" && k !== "next_speaker_id") {
            stateDict[k].location = newLoc;
          }
        }
      } else {
        console.log(`[Scene State] Character '${characterName}' automatically moved to: ${newLoc}`);
        stateDict[charKey].location = newLoc;
      }
    }
  }

  const newMood = detectMoodChange(replyContent);
  if (newMood) {
    console.log(`[Scene State] Character '${characterName}' mood automatically updated to: ${newMood}`);
    stateDict[charKey].mood = newMood;
  }

  if (nextSpeakerId !== undefined) {
    stateDict.next_speaker_id = nextSpeakerId;
  }

  await db.execute("UPDATE chat_sessions SET scene_state = ? WHERE id = ?", [JSON.stringify(stateDict), roomId]);
}
