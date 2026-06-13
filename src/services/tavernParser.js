// src/services/tavernParser.js
// Parses Tavern Character Card PNGs and extracts character metadata in JavaScript.
// Ported from app/services/tavern_parser.py.

function parseTextChunk(chunkData) {
  const nullIdx = chunkData.indexOf(0);
  if (nullIdx === -1) return null;
  const keyword = new TextDecoder().decode(chunkData.subarray(0, nullIdx)).toLowerCase();
  if (keyword === "ccv3" || keyword === "chara") {
    return new TextDecoder().decode(chunkData.subarray(nullIdx + 1));
  }
  return null;
}

function parseITextChunk(chunkData) {
  const nullIdx1 = chunkData.indexOf(0);
  if (nullIdx1 === -1) return null;
  const keyword = new TextDecoder().decode(chunkData.subarray(0, nullIdx1)).toLowerCase();
  if (keyword !== "ccv3" && keyword !== "chara") return null;

  const compressionFlag = chunkData[nullIdx1 + 1];
  // Find the third null byte (end of translated keyword)
  let nullCount = 1;
  let textStart = -1;
  for (let i = nullIdx1 + 3; i < chunkData.length; i++) {
    if (chunkData[i] === 0) {
      nullCount++;
      if (nullCount === 3) {
        textStart = i + 1;
        break;
      }
    }
  }
  if (textStart === -1) return null;

  const rawText = chunkData.subarray(textStart);
  if (compressionFlag === 0) {
    return new TextDecoder().decode(rawText);
  } else {
    console.warn("[TavernParser] Compressed iTXt chunks are not supported locally.");
    return null;
  }
}

function extractCharaData(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);

  // Verify PNG Signature
  if (bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71 ||
      bytes[4] !== 13 || bytes[5] !== 10 || bytes[6] !== 26 || bytes[7] !== 10) {
    console.error("[TavernParser] Invalid PNG signature.");
    return null;
  }

  let offset = 8; // Start after signature

  while (offset < view.byteLength) {
    if (offset + 8 > view.byteLength) break;
    
    const length = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);

    if (type === "IEND") break;

    if (type === "tEXt" || type === "iTXt" || type === "zTXt") {
      const chunkData = bytes.subarray(offset + 8, offset + 8 + length);
      
      if (type === "tEXt") {
        const textVal = parseTextChunk(chunkData);
        if (textVal) return textVal;
      } else if (type === "iTXt") {
        const textVal = parseITextChunk(chunkData);
        if (textVal) return textVal;
      }
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
      console.error("[TavernParser] Failed to parse metadata as JSON or Base64 JSON:", err);
      return null;
    }
  }
}

function mapCharaJsonToSchema(decodedJson) {
  if (!decodedJson) return null;
  const data = decodedJson.data || decodedJson;

  // Extract tags
  const rawTags = data.tags || [];
  let tagsStr = "";
  if (Array.isArray(rawTags) && rawTags.length > 0) {
    const cleanTags = rawTags.map(t => String(t).trim()).filter(Boolean);
    if (cleanTags.length > 0) {
      tagsStr = `[Tags: ${cleanTags.join(", ")}]\n`;
    }
  }

  // Extract description and personality traits
  let description = (data.description || "").trim();
  let traits = (data.personality || "").trim();

  if (!description && traits) {
    description = traits;
    traits = "";
  }

  let traitsStr = "";
  if (traits) {
    traitsStr = `[Personality: ${traits}]\n`;
  }

  const prefixBlocks = (tagsStr || traitsStr) ? `${tagsStr}${traitsStr}\n` : "";
  const personalityWithMetadata = `${prefixBlocks}${description}`.trim();

  // Extract character book entries
  const charBook = data.character_book || decodedJson.character_book;
  const bookEntries = [];
  if (charBook && Array.isArray(charBook.entries)) {
    charBook.entries.forEach(entry => {
      if (entry.enabled !== false) {
        let keysStr;
        if (Array.isArray(entry.keys)) {
          keysStr = entry.keys.map(k => String(k).trim()).filter(Boolean).join(", ");
        } else {
          keysStr = String(entry.keys || "").trim();
        }

        const contentVal = String(entry.content || "").trim();
        if (keysStr && contentVal) {
          bookEntries.push({
            title: entry.comment || entry.name || "Lore Entry",
            keys: keysStr,
            content: contentVal,
            weight: entry.insertion_order !== undefined ? entry.insertion_order : 100
          });
        }
      }
    });
  }

  // Extract alternate greetings
  const altGreetings = (data.alternate_greetings || data.alternate_first_mes || [])
    .map(g => String(g).trim())
    .filter(Boolean);

  return {
    name: data.name || "Unnamed Bot",
    greeting: data.first_mes || data.greeting || "",
    personality: personalityWithMetadata,
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
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return `data:image/png;base64,${base64}`;
  } catch (err) {
    console.error("[TavernParser] Error extracting avatar image:", err);
    return null;
  }
}
