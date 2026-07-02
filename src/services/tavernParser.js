// src/services/tavernParser.js
// Parses Tavern Character Card PNGs and extracts character metadata in JavaScript.
// Ported from app/services/tavern_parser.py.

function parseTextChunk(chunkData) {
  const nullIdx = chunkData.indexOf(0);
  if (nullIdx === -1) return null;

  const decoder = new TextDecoder();
  const keyword = decoder.decode(chunkData.subarray(0, nullIdx)).toLowerCase();
  
  if (keyword === "ccv3" || keyword === "chara") {
    return decoder.decode(chunkData.subarray(nullIdx + 1));
  }
  return null;
}

function parseITextChunk(chunkData) {
  const nullIdx1 = chunkData.indexOf(0);
  if (nullIdx1 === -1) return null;

  const decoder = new TextDecoder();
  const keyword = decoder.decode(chunkData.subarray(0, nullIdx1)).toLowerCase();
  if (keyword !== "ccv3" && keyword !== "chara") return null;

  const compressionFlag = chunkData[nullIdx1 + 1];

  // Find second and third null bytes: compression flag is at +1, method is at +2
  const nullIdx2 = chunkData.indexOf(0, nullIdx1 + 3);
  if (nullIdx2 === -1) return null;

  const nullIdx3 = chunkData.indexOf(0, nullIdx2 + 1);
  if (nullIdx3 === -1) return null;

  if (compressionFlag !== 0) {
    console.warn("[TavernParser] Compressed iTXt chunks are not supported locally.");
    return null;
  }

  return decoder.decode(chunkData.subarray(nullIdx3 + 1));
}

function extractCharaData(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Verify PNG Signature
  const pngSig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!pngSig.every((b, i) => bytes[i] === b)) {
    console.error("[TavernParser] Invalid PNG signature.");
    return null;
  }

  let offset = 8; // Start after signature

  while (offset < view.byteLength) {
    if (offset + 8 > view.byteLength) break;

    const length = view.getUint32(offset);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);

    if (type === "IEND") break;

    if (type === "tEXt" || type === "iTXt") {
      const chunkData = bytes.subarray(offset + 8, offset + 8 + length);
      const textVal = type === "tEXt" ? parseTextChunk(chunkData) : parseITextChunk(chunkData);
      if (textVal) return textVal;
    }

    offset += 12 + length; // 4 bytes length + 4 bytes type + length + 4 bytes CRC
  }

  console.warn("[TavernParser] No 'ccv3' or 'chara' metadata chunk found in PNG.");
  return null;
}

function decodeCharaJson(charaData) {
  if (!charaData) return null;
  try {
    return JSON.parse(charaData);
  } catch {
    try {
      const decodedBytes = atob(charaData);
      return JSON.parse(decodedBytes);
    } catch (err) {
      console.error("[TavernParser] Failed to parse JSON:", err);
      return null;
    }
  }
}

function mapCharaJsonToSchema(decodedJson) {
  if (!decodedJson) return null;
  const data = decodedJson.data || decodedJson;

  // Extract tags
  const rawTags = data.tags || [];
  const cleanTags = rawTags.map(t => String(t).trim()).filter(Boolean);
  const tagsStr = cleanTags.length ? `[Tags: ${cleanTags.join(", ")}]\n` : "";

  // Extract description and personality traits
  let description = (data.description || "").trim();
  let traits = (data.personality || "").trim();

  if (!description && traits) {
    description = traits;
    traits = "";
  }

  const traitsStr = traits ? `[Personality: ${traits}]\n` : "";
  const prefix = (tagsStr || traitsStr) ? `${tagsStr}${traitsStr}\n` : "";
  const personality = `${prefix}${description}`.trim();

  // Extract character book entries
  const charBook = data.character_book || decodedJson.character_book;
  const bookEntries = (charBook?.entries || [])
    .filter(entry => entry.enabled !== false)
    .map(entry => {
      const rawKeys = Array.isArray(entry.keys) ? entry.keys : [entry.keys];
      const keysStr = rawKeys.map(k => String(k || "").trim()).filter(Boolean).join(", ");
      const content = String(entry.content || "").trim();

      return {
        title: entry.comment || entry.name || "Lore Entry",
        keys: keysStr,
        content,
        weight: entry.insertion_order ?? 100
      };
    })
    .filter(entry => entry.keys && entry.content);

  // Extract alternate greetings
  const altGreetings = (data.alternate_greetings || data.alternate_first_mes || [])
    .map(g => String(g).trim())
    .filter(Boolean);

  return {
    name: data.name || "Unnamed Bot",
    greeting: data.first_mes || data.greeting || "",
    personality,
    scenario: data.scenario || "",
    example_dialogue: data.mes_example || data.example_dialogue || "",
    lore_entries: bookEntries,
    alternate_greetings: altGreetings,
    system_prompt: (data.system_prompt || "").trim(),
    post_history_instructions: (data.post_history_instructions || "").trim(),
    creator: (data.creator || "").trim(),
    character_version: String(data.character_version || data.version || "").trim(),
    creator_notes: (data.creator_notes || "").trim()
  };
}

export function parseTavernPng(arrayBuffer) {
  try {
    const charaData = extractCharaData(arrayBuffer);
    const decodedJson = decodeCharaJson(charaData);
    return mapCharaJsonToSchema(decodedJson);
  } catch (err) {
    console.error("[TavernParser] Error parsing Tavern PNG:", err);
    return null;
  }
}

// Converts binary PNG bytes to a base64 Data URL so it can be saved directly in the SQLite DB
export function extractAvatarUrlFromPngBytes(arrayBuffer) {
  try {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return `data:image/png;base64,${btoa(binary)}`;
  } catch (err) {
    console.error("[TavernParser] Error extracting avatar image:", err);
    return null;
  }
}

// Parses a raw Tavern card JSON object (v1/v2/v3) into the internal character schema.
// Used for .json file imports where there is no PNG container to read.
export function parseTavernJson(rawJson) {
  try {
    return mapCharaJsonToSchema(rawJson);
  } catch (err) {
    console.error("[TavernParser] Error parsing JSON card:", err);
    return null;
  }
}
