// src/services/tagGenerator.js
// Client-side semantic and keyword tag extractor using RAG embeddings.

import * as rag from './rag';

const TAG_RULES = {
  fantasy: ["magic", "fantasy", "spell", "wizard", "witch", "mythical", "quest", "elf", "elves", "dwarf", "orc", "goblin", "dragon"],
  "sci-fi": ["sci-fi", "science fiction", "space", "starship", "spaceship", "planet", "futuristic", "alien", "cyborg", "android"],
  cyberpunk: ["cyberpunk", "neon", "hacker", "implants", "megacorp", "nanotech"],
  steampunk: ["steampunk", "steam-powered", "gears", "victorian", "brass", "goggles", "airship"],
  apocalypse: ["apocalypse", "post-apocalyptic", "wasteland", "zombie", "fallout", "ruins", "survivor"],
  horror: ["ghost", "spooky", "horror", "haunted", "creepy", "macabre", "monster", "beast", "creature", "blood", "kill", "death"],
  supernatural: ["magic", "supernatural", "powers", "telekinesis", "psionic", "spirit", "deity", "god", "angel", "demon", "curse", "vampire", "werewolf", "witch"],
  historical: ["history", "historical", "victorian", "renaissance", "ancient", "medieval", "empire", "shogun", "samurai", "feudal"],
  romance: ["romance", "love", "crush", "date", "affectionate", "jealous", "flirt", "heartbeat", "kiss", "lover", "sweetheart"],
  school: ["school", "highschool", "student", "teacher", "classroom", "academy", "classmate", "homework"],
  college: ["college", "university", "dorm", "campus", "professor"],
  maid: ["maid", "apron", "serve", "master", "housework", "cleaning", "maidservant"],
  butler: ["butler", "manservant", "serve", "master", "suit"],
  knight: ["knight", "paladin", "armor", "sword", "shield", "kingdom", "lord", "guard"],
  royalty: ["king", "queen", "prince", "princess", "emperor", "empress", "royalty", "royal", "crown", "throne", "lord", "lady"],
  stubborn: ["tsundere", "stubborn", "blush", "baka", "cold but", "haughty", "secretly soft", "hard to please", "defensive", "denies"],
  obsessive: ["yandere", "obsessive", "possessive", "stalker", "mine alone", "kill for", "unhinged", "crazy for you"],
  silent: ["kuudere", "emotionless", "stoic", "quiet", "expressionless", "silent", "blunt", "indifferent"],
  shy: ["dandere", "shy", "timid", "nervous", "blushes", "stammer", "quiet", "introvert"],
  sassy: ["sassy", "snarky", "sarcastic", "witty", "attitude", "cheeky", "smug"],
  dominant: ["dominant", "demanding", "bossy", "in control", "commanding", "leader", "alpha", "subjugate"],
  submissive: ["submissive", "obedient", "compliant", "meek", "yield", "servitude"],
  gaming: ["gamer", "gaming", "video game", "console", "streamer", "virtual"],
  ninja: ["ninja", "shinobi", "kunai", "stealth", "shadow"],
  assassin: ["assassin", "hitman", "poison", "contract", "stealth", "target"],
  doctor: ["doctor", "physician", "surgeon", "hospital", "clinic", "medical"],
  nurse: ["nurse", "medical", "clinic", "hospital", "bandage"],
  detective: ["detective", "investigator", "mystery", "case", "clue", "sleuth", "police"],
  police: ["police", "cop", "officer", "sheriff", "law", "arrest"],
  soldier: ["soldier", "military", "army", "marine", "combat", "warfare", "weapon"],
  gentle: ["gentle", "kind", "caring", "sweet", "soft-hearted", "compassionate"],
  cold: ["cold", "distant", "aloof", "frigid", "unfriendly", "chilly"],
  flirty: ["flirty", "teasing", "seductive", "playful", "suggestive", "coquettish"]
};

const TAG_TEMPLATES = {
  fantasy: "This character is in a fantasy, magic, medieval, or mythical world.",
  "sci-fi": "This character is in a futuristic, space, sci-fi, or planetary setting.",
  cyberpunk: "This character is in a cyberpunk or hacker megacorp setting.",
  steampunk: "This character is in a steampunk, Victorian, or gear-based setting.",
  apocalypse: "This character is in a post-apocalyptic, wasteland, or zombie survival setting.",
  horror: "This character is in a horror, haunted, scary, or creepy setting.",
  supernatural: "This character has supernatural powers, magic, or divine origins.",
  historical: "This character is in a historical, ancient, or medieval setting.",
  romance: "This character has a romantic storyline, crush, or love interest.",
  school: "This character is a student or teacher in a school or academy.",
  college: "This character is a student or professor in a college or university.",
  maid: "This character is a maid or maidservant.",
  butler: "This character is a butler or manservant.",
  knight: "This character is a knight, paladin, or armored guard.",
  royalty: "This character is a king, queen, prince, princess, or noble royalty.",
  stubborn: "This character is stubborn, hot-headed, defensive, or tsundere.",
  obsessive: "This character is obsessive, possessive, or yandere.",
  silent: "This character is silent, quiet, stoic, or kuudere.",
  shy: "This character is shy, timid, nervous, or dandere.",
  sassy: "This character is sassy, snarky, sarcastic, or witty.",
  dominant: "This character is dominant, commanding, bossy, or in control.",
  submissive: "This character is submissive, obedient, or compliant.",
  gaming: "This character is a gamer or video game character.",
  ninja: "This character is a ninja or shinobi.",
  assassin: "This character is an assassin or stealth killer.",
  doctor: "This character is a doctor, surgeon, or physician.",
  nurse: "This character is a nurse or medical staff.",
  detective: "This character is a detective or investigator.",
  police: "This character is a police officer or cop.",
  soldier: "This character is a soldier or military combatant.",
  gentle: "This character is gentle, kind, sweet, caring, and loving.",
  cold: "This character is cold, distant, aloof, or unfriendly.",
  flirty: "This character is flirty, teasing, playful, or seductive."
};

const STRICT_TAGS = new Set([
  "ninja", "assassin", "maid", "butler", "doctor", "nurse", "police", "soldier",
  "gaming", "royalty", "cyberpunk", "steampunk", "apocalypse", "school", "college",
  "detective", "knight", "fantasy", "sci-fi", "horror", "supernatural", "historical"
]);

let cachedTagNames = null;
let cachedTagVectors = null;

async function getTagEmbeddings() {
  if (cachedTagNames === null) {
    cachedTagNames = Object.keys(TAG_TEMPLATES);
    const tagTexts = cachedTagNames.map(tag => TAG_TEMPLATES[tag]);
    const vecs = await rag.embedTexts(tagTexts);

    // Normalize tag vectors for cosine similarity
    cachedTagVectors = vecs.map(v => {
      const sumSq = v.reduce((sum, val) => sum + val * val, 0);
      const norm = Math.sqrt(sumSq);
      return norm === 0 ? v : v.map(val => val / norm);
    });
    console.log(`[Tags] Cached ${cachedTagVectors.length} semantic tag embeddings successfully.`);
  }
  return { names: cachedTagNames, vectors: cachedTagVectors };
}

function keywordFallbackTags(combinedText) {
  const matched = [];
  for (const [tag, keywords] of Object.entries(TAG_RULES)) {
    const hasMatch = keywords.some(kw => {
      const reg = new RegExp(`\\b${escapeRegexForTags(kw)}\\b`, 'i');
      return reg.test(combinedText);
    });
    
    if (hasMatch) {
      matched.push(tag);
    }
  }
  return matched.slice(0, 5);
}

function escapeRegexForTags(string) {
  return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export async function generateCharacterTags(name, personality, scenario) {
  const charDesc = `${name || ""}. ${personality || ""}. ${scenario || ""}.`.trim();
  if (!charDesc || charDesc.replace(/\./g, "").trim() === "") {
    return { tags: [] };
  }

  const combinedText = charDesc.toLowerCase();

  try {
    const { names: tagNames, vectors: tagVecs } = await getTagEmbeddings();

    // Embed character description and normalize it
    const embeds = await rag.embedTexts([charDesc]);
    const rawCharVec = embeds[0];
    
    const sumSq = rawCharVec.reduce((sum, val) => sum + val * val, 0);
    const charNorm = Math.sqrt(sumSq);
    const charVec = charNorm === 0 ? rawCharVec : rawCharVec.map(v => v / charNorm);

    // Compute cosine similarity and apply scoring rules
    const results = [];
    for (let i = 0; i < tagNames.length; i++) {
      const tag = tagNames[i];
      const tagVec = tagVecs[i];

      const score = tagVec.reduce((sum, val, idx) => sum + val * charVec[idx], 0);

      // Check keyword presence
      const keywords = TAG_RULES[tag] || [];
      const hasKw = keywords.some(kw => {
        const reg = new RegExp(`\\b${escapeRegexForTags(kw)}\\b`, 'i');
        return reg.test(combinedText);
      });

      // Strict tags require keyword presence
      if (STRICT_TAGS.has(tag) && !hasKw) continue;

      // Unmatched tags require a high similarity score
      if (!hasKw && score < 0.80) continue;

      results.push({ tag, score: score + (hasKw ? 0.08 : 0) });
    }

    // Sort tags by similarity score in descending order
    results.sort((a, b) => b.score - a.score);

    if (results.length === 0) {
      return { tags: [] };
    }

    // Dynamic thresholding: Select tags close to the top match, but must be >= 0.70
    const topScore = results[0].score;
    const threshold = Math.max(0.70, topScore - 0.05);

    let matched = results.filter(r => r.score >= threshold).map(r => r.tag);

    // Ensure we return at least the single best tag if it's decent
    if (matched.length === 0 && topScore >= 0.65) {
      matched = [results[0].tag];
    }

    return { tags: matched.slice(0, 5) };

  } catch (e) {
    console.warn("[Tags] Semantic tag generation failed. Falling back to keyword search...", e);
    const matched = keywordFallbackTags(combinedText);
    return { tags: matched };
  }
}
