// src/services/turnTaking.js
// Psychological Turn-Taking Model (Formula 3) driven by a deterministic rule-based text parser and local keyword matching.
// Ported directly from app/services/group_reply_order.py.

function escapeRegex(string) {
  return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function getKeywordRelevance(msgText, bioText) {
  if (!msgText || !msgText.trim() || !bioText || !bioText.trim()) {
    return 0.5; // Neutral default
  }

  // Fallback to simple keyword overlap count
  const cleanMsg = msgText.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(t => t.length >= 3);
  const bioLower = bioText.toLowerCase();
  let overlap = 0;
  const seen = new Set();
  for (const token of cleanMsg) {
    if (token && bioLower.includes(token) && !seen.has(token)) {
      overlap++;
      seen.add(token);
    }
  }
  // Map overlap count to a score in [0.5, 1.0]
  return Math.max(0.5, Math.min(1.0, 0.5 + (overlap * 0.15)));
}

function calculateOceanTraits(bioLower) {
  // 1. Extraversion weights
  const extraversionWeights = {
    "shy": -0.4, "timid": -0.4, "quiet": -0.4, "reserved": -0.4,
    "withdrawn": -0.4, "introverted": -0.4, "loner": -0.6,
    "keeps to themself": -0.6, "reclusive": -0.6, "talkative": 0.4,
    "chatty": 0.4, "outgoing": 0.4, "sociable": 0.4, "gregarious": 0.4,
    "life of the party": 0.5, "loud": 0.5, "boisterous": 0.5,
    "extroverted": 0.5, "speaks rarely": -0.3, "only talks when necessary": -0.3,
    "friendly and approachable": 0.2
  };
  let extSum = 0.5;
  for (const [kw, w] of Object.entries(extraversionWeights)) {
    if (bioLower.includes(kw)) extSum += w;
  }
  const extraversion = Math.max(0.0, Math.min(1.0, extSum));

  // 2. Assertiveness weights
  const assertivenessWeights = {
    "meek": -0.4, "submissive": -0.4, "pushover": -0.4, "will not speak up": -0.4,
    "aggressive": 0.4, "dominant": 0.4, "commands attention": 0.4, "bossy": 0.4,
    "assertive": 0.3, "confident": 0.3, "speaks their mind": 0.3, "bold": 0.3,
    "hesitant": -0.2, "indecisive": -0.2, "waits for others": -0.2,
    "natural leader": 0.5, "takes charge": 0.5
  };
  let asSum = 0.5;
  if (bioLower.includes("shy")) asSum -= 0.2;
  for (const [kw, w] of Object.entries(assertivenessWeights)) {
    if (bioLower.includes(kw)) asSum += w;
  }
  const assertiveness = Math.max(0.0, Math.min(1.0, asSum));

  // 3. Agreeableness weights
  const agreeablenessWeights = {
    "kind": 0.3, "warm": 0.3, "compassionate": 0.3, "gentle": 0.3, "caring": 0.3,
    "cooperative": 0.2, "good listener": 0.2, "polite": 0.2,
    "cold": -0.3, "harsh": -0.3, "rude": -0.3, "blunt": -0.3, "competitive": -0.3,
    "argumentative": -0.2, "hostile": -0.2, "mean": -0.2, "sarcastic": -0.2,
    "sweet": 0.2, "soft-spoken": 0.2
  };
  let agrSum = 0.5;
  for (const [kw, w] of Object.entries(agreeablenessWeights)) {
    if (bioLower.includes(kw)) agrSum += w;
  }
  const agreeableness = Math.max(0.0, Math.min(1.0, agrSum));

  // 4. Neuroticism weights
  const neuroticismWeights = {
    "anxious": 0.4, "nervous": 0.4, "worried": 0.4, "insecure": 0.4, "self-conscious": 0.4,
    "calm": -0.3, "laid-back": -0.3, "unflappable": -0.3, "relaxed": -0.3,
    "moody": 0.3, "temperamental": 0.3, "volatile": 0.3, "dramatic": 0.3,
    "easily stressed": 0.4, "panics": 0.4,
    "stoic": -0.2, "emotionless": -0.2
  };
  let neuSum = 0.5;
  for (const [kw, w] of Object.entries(neuroticismWeights)) {
    if (bioLower.includes(kw)) neuSum += w;
  }
  const neuroticism = Math.max(0.0, Math.min(1.0, neuSum));

  // 5. Openness weights
  const opennessWeights = {
    "curious": 0.4, "imaginative": 0.4, "creative": 0.4, "unconventional": 0.4,
    "adventurous": 0.3, "open-minded": 0.3, "philosophical": 0.3,
    "traditional": -0.3, "conservative": -0.3, "set in their ways": -0.3, "stubborn": -0.3,
    "loves new ideas": 0.5, "explorer": 0.5,
    "practical": -0.2, "down-to-earth": -0.2
  };
  let opeSum = 0.5;
  for (const [kw, w] of Object.entries(opennessWeights)) {
    if (bioLower.includes(kw)) opeSum += w;
  }
  const openness = Math.max(0.0, Math.min(1.0, opeSum));

  return { extraversion, assertiveness, agreeableness, neuroticism, openness };
}

function parseCharacterStatus(bioLower) {
  const statusDict = {
    "king": 10, "queen": 10, "emperor": 10, "god": 10, "ruler": 10,
    "lord": 9, "duke": 9, "general": 9, "high priest": 9,
    "captain": 8, "chief": 8, "master": 8,
    "knight": 7, "officer": 7, "elder": 7,
    "average citizen": 5, "villager": 5, "merchant": 5,
    "servant": 3, "butler": 3, "assistant": 3,
    "slave": 1, "prisoner": 1, "outcast": 1
  };

  const tagsMatch = bioLower.match(/\[tags:\s*([^\]]*)\]/);
  const traitsMatch = bioLower.match(/\[personality:\s*([^\]]*)\]/);

  const metadataTokens = new Set();
  if (tagsMatch && tagsMatch[1]) {
    tagsMatch[1].split(",").forEach(t => {
      const clean = t.trim();
      if (clean) metadataTokens.add(clean);
    });
  }
  if (traitsMatch && traitsMatch[1]) {
    traitsMatch[1].split(",").forEach(t => {
      const clean = t.trim();
      if (clean) metadataTokens.add(clean);
    });
  }

  // 1. Check explicit metadata tokens for status roles
  for (const [kw, val] of Object.entries(statusDict)) {
    if (metadataTokens.has(kw)) {
      return val;
    }
  }

  // 2. Fallback to full narrative text search
  for (const [kw, val] of Object.entries(statusDict)) {
    if (bioLower.includes(kw)) {
      return val;
    }
  }

  return 5;
}

function calculateComfortLevels(bioLower, otherNames, assertiveness, neuroticism) {
  const comfort = {};
  for (const name of otherNames) {
    comfort[name] = 0.45; // Default comfort value
  }

  const relationshipRules = [
    [/\bbest\s+friend(?:s)?\s+(?:with|of)\s+X\b/i, 0.95],
    [/\bclosest\s+to\s+X\b/i, 0.95],
    [/\bchildhood\s+friend\s+(?:with|of)?\s*X\b/i, 0.85],
    [/\bdating\s+X\b/i, 0.90],
    [/\bin\s+a\s+relationship\s+with\s+X\b/i, 0.90],
    [/\bfriend(?:s)?\s+(?:with|of)\s+X\b/i, 0.80],
    [/\blikes\s+X\b/i, 0.80],
    [/\bterrified\s+of\s+X\b/i, 0.15],
    [/\bafraid\s+of\s+X\b/i, 0.15],
    [/\bfears\s+X\b/i, 0.15],
    [/\benemy\s+(?:with|of)\s+X\b/i, 0.10],
    [/\bhates\s+X\b/i, 0.10],
    [/\brival(?:s)?\s+(?:with|of)\s+X\b/i, 0.20],
    [/\bcompetitive\s+with\s+X\b/i, 0.20],
    [/\blooks\s+up\s+to\s+X\b/i, 0.50],
    [/\badmires\s+X\b/i, 0.50],
    [/\bboss\s+of\s+X\b/i, 0.30],
    [/\bX\s+is\s+the\s+leader\b/i, 0.30],
    [/\bacquaintance(?:s)?\s+(?:with|of)\s+X\b/i, 0.60],
    [/\bdoes\s+not\s+know\s+X\b/i, 0.45],
    [/\bstranger\s+to\s+X\b/i, 0.45]
  ];

  for (const other of otherNames) {
    const otherEscaped = escapeRegex(other.toLowerCase());
    for (const [regexPattern, val] of relationshipRules) {
      const patternStr = regexPattern.source.replace("X", `(?:the\\s+|a\\s+|an\\s+)?${otherEscaped}`);
      const reg = new RegExp(patternStr, 'i');
      if (reg.test(bioLower)) {
        comfort[other] = val;
        
        // Neuroticism / Assertiveness adaptations
        if (val === 0.35 && neuroticism > 0.6) {
          comfort[other] = Math.max(0.1, comfort[other] - 0.2);
        }
        if (val === 0.30 && assertiveness < 0.3) {
          comfort[other] = Math.max(0.1, comfort[other] - 0.2);
        }
        break; // matched first rule, stop
      }
    }
  }

  return comfort;
}

function parseCharacterBio(bio, otherNames) {
  const bioLower = (bio || "").toLowerCase();
  const traits = calculateOceanTraits(bioLower);
  const status = parseCharacterStatus(bioLower);
  const comfort = calculateComfortLevels(bioLower, otherNames, traits.assertiveness, traits.neuroticism);

  const impulsivity = (traits.extraversion + (1.0 - traits.agreeableness)) / 2.0;
  const silenceDiscomfort = 0.7 * traits.extraversion + 0.3 * traits.neuroticism;
  const slc = traits.neuroticism;

  return {
    ...traits,
    impulsivity,
    silenceDiscomfort,
    slc,
    status,
    comfort
  };
}

function softmax(scores, temperature = 0.5) {
  const t = Math.max(0.05, temperature);
  const maxS = scores.length > 0 ? Math.max(...scores) : 0.0;
  const shifted = scores.map(s => s - maxS);
  const scaled = shifted.map(s => s / t);
  const exps = scaled.map(s => {
    try {
      return Math.exp(s);
    } catch {
      return 0.0;
    }
  });

  const sumExps = exps.reduce((sum, curr) => sum + curr, 0);
  if (sumExps === 0) {
    return new Array(scores.length).fill(1.0 / scores.length);
  }
  return exps.map(e => e / sumExps);
}

function checkDirectAddress(userText, lastMsg, bots) {
  const checkText = (text) => {
    if (!text) return null;
    for (const bot of bots) {
      const fullName = bot.name.toLowerCase();
      const parts = fullName.split(/\s+/).filter(p => p.length >= 3);
      const namesToCheck = [fullName, ...parts];
      for (const name of namesToCheck) {
        const reg = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
        if (reg.test(text)) {
          console.log(`[Efficient] Direct Address triggered for bot: ${bot.name} via name token: ${name}`);
          return bot.id;
        }
      }
    }
    return null;
  };

  if (userText) {
    const winner = checkText(userText);
    if (winner !== null) return winner;
  }

  if (lastMsg) {
    const lastContent = lastMsg.content || "";
    if (lastContent.trim()) {
      for (const bot of bots) {
        if (lastMsg.sender_name !== bot.name) {
          const fullName = bot.name.toLowerCase();
          const parts = fullName.split(/\s+/).filter(p => p.length >= 3);
          const namesToCheck = [fullName, ...parts];
          for (const name of namesToCheck) {
            const reg = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
            if (reg.test(lastContent)) {
              console.log(`[Efficient] Direct Address from last turn triggered for bot: ${bot.name} via name token: ${name}`);
              return bot.id;
            }
          }
        }
      }
    }
  }

  return null;
}

function filterIncapacitatedBots(bots, sceneState) {
  const activeCandidates = [];
  for (const bot of bots) {
    let incapacitated = false;
    if (sceneState) {
      const botState = sceneState[String(bot.id)];
      if (botState) {
        const action = (botState.action || "").toLowerCase();
        const mood = (botState.mood || "").toLowerCase();
        if (
          action.includes("unconscious") || action.includes("fainted") || action.includes("asleep") || action.includes("sleeping") || action.includes("knocked out") ||
          mood.includes("unconscious") || mood.includes("fainted") || mood.includes("asleep") || mood.includes("sleeping") || mood.includes("knocked out")
        ) {
          console.log(`[Efficient] Bot: ${bot.name} is physically incapacitated. Skipping.`);
          incapacitated = true;
        }
      }
    }
    if (!incapacitated) {
      activeCandidates.push(bot);
    }
  }
  return activeCandidates;
}

async function calculateCandidateScore(bot, otherNames, lastMsg, userText, tau, statusS, sceneState) {
  // A. Parse Bio
  const traits = parseCharacterBio(bot.personality, otherNames);
  const extraversion = traits.extraversion;
  const assertiveness = traits.assertiveness;
  const agreeableness = traits.agreeableness;
  const silenceDiscomfort = traits.silenceDiscomfort;
  const slc = traits.slc;
  const statusI = traits.status;
  const comfortMap = traits.comfort;

  // B. Comfort multiplier (C_i)
  const othersPresent = otherNames.filter(name => name.toLowerCase() !== bot.name.toLowerCase());
  let minComfort = 0.45;
  let avgComfort = 0.45;
  if (othersPresent.length > 0) {
    const comfortValues = othersPresent.map(name => comfortMap[name] !== undefined ? comfortMap[name] : 0.45);
    minComfort = Math.min(...comfortValues);
    avgComfort = comfortValues.reduce((sum, v) => sum + v, 0) / comfortValues.length;
  }

  let comfortMultiplier = 1.0 - (slc * (1.0 - minComfort) + (1.0 - slc) * (1.0 - avgComfort));
  comfortMultiplier = Math.max(0.1, comfortMultiplier);

  // C. Willingness (W_i)
  const moodFactor = 1.0;
  const willingness = (extraversion * assertiveness) * comfortMultiplier * moodFactor;

  // D. Topic Engagement (E_i)
  let lastMessageText = lastMsg ? (lastMsg.content || "") : "";
  if (userText) {
    lastMessageText = userText;
  }
  const topicRelevance = getKeywordRelevance(lastMessageText, bot.personality || "");
  const engagement = Math.max(topicRelevance, 0.5);

  // E. Silence-breaking Boost (B_i)
  const tSil = 1.5;
  const kSil = 0.5;
  const silenceBoost = tau >= tSil ? 1.0 + silenceDiscomfort * (tau - tSil) * kSil : 1.0;

  // F. Speaker Deference Boost (prevent duplicate speaker turns)
  const lastSpeakerName = lastMsg ? lastMsg.sender_name : null;
  const isSelected = (lastSpeakerName && lastSpeakerName.toLowerCase() === bot.name.toLowerCase()) ? 100.0 : 1.0;

  // G. Deference Penalty (D_i)
  const statusDiff = Math.max(0.0, Math.min(1.0, (statusS - statusI) / 10.0));
  let deferencePenalty = agreeableness * (1.0 - assertiveness) * statusDiff;
  deferencePenalty = Math.max(0.0, Math.min(0.9, deferencePenalty));

  // H. Final Multiplicative Score (S_i)
  let score = willingness * engagement * silenceBoost * isSelected * (1.0 - deferencePenalty);

  // Proximity Boost
  let proximityBoost = 0.0;
  if (sceneState) {
    const botState = sceneState[String(bot.id)];
    if (botState) {
      const botLocation = (botState.location || "").toLowerCase();
      if (botLocation && botLocation !== "main room") {
        let lastText = userText.toLowerCase();
        if (lastMsg) lastText += " " + (lastMsg.content || "").toLowerCase();
        if (lastText.includes(botLocation)) {
          console.log(`[Efficient] Spatial match for ${bot.name} at location '${botLocation}'. Boosting.`);
          proximityBoost = 1.5;
        }
      }
    }
  }
  score += proximityBoost;

  console.log(
    `[Efficient] Bot: ${bot.name} | Will: ${willingness.toFixed(2)} | ` +
    `Engage: ${engagement.toFixed(2)} | SilenceBoost: ${silenceBoost.toFixed(2)} | ` +
    `Defer: ${deferencePenalty.toFixed(2)} | Proximity: ${proximityBoost.toFixed(1)} | Score: ${score.toFixed(4)}`
  );

  return { id: bot.id, name: bot.name, score };
}

function chooseWeightedWinner(scoredCandidates) {
  const candidateIds = scoredCandidates.map(c => c.id);
  const candidateScores = scoredCandidates.map(c => c.score);
  const probabilities = softmax(candidateScores, 0.5);

  console.log("[Efficient] Selection probabilities:");
  scoredCandidates.forEach((c, idx) => {
    console.log(`  - ${c.name}: ${(probabilities[idx] * 100).toFixed(1)}% (Score: ${c.score.toFixed(4)})`);
  });

  const rand = Math.random();
  let cumulative = 0.0;
  let winnerId = candidateIds[candidateIds.length - 1]; // Fallback
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (rand <= cumulative) {
      winnerId = candidateIds[i];
      break;
    }
  }
  return winnerId;
}

// Selects next speaker (character ID) using the local Keyword-Matrix Efficient model
export async function runEfficientSelector(messageContent, bots, messages, sceneState = null) {
  if (!bots || bots.length === 0) return null;
  if (bots.length === 1) return bots[0].id;

  const userText = (messageContent || "").trim();
  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  // 1. Direct Address Check (highest priority rule)
  const directAddressWinner = checkDirectAddress(userText, lastMsg, bots);
  if (directAddressWinner !== null) {
    return directAddressWinner;
  }

  // 2. Resolve Participant Names
  const participantNames = new Set(bots.map(b => b.name));
  if (messages) {
    messages.forEach(m => participantNames.add(m.sender_name));
  }
  const otherNames = Array.from(participantNames);

  // 3. Resolve Last Speaker Status
  const lastSpeakerName = lastMsg ? lastMsg.sender_name : null;
  let statusS = 5;
  if (lastMsg && lastMsg.sender_type === "character" && lastSpeakerName) {
    const speakerBot = bots.find(b => b.name.toLowerCase() === lastSpeakerName.toLowerCase());
    if (speakerBot) {
      const traitsS = parseCharacterBio(speakerBot.personality, otherNames);
      statusS = traitsS.status;
    }
  }

  // 4. Calculate Silence Duration (tau) in seconds
  let tau = 0.0;
  if (lastMsg && lastMsg.created_at) {
    try {
      const createdDate = new Date(lastMsg.created_at);
      const deltaMs = Date.now() - createdDate.getTime();
      tau = Math.max(0.0, deltaMs / 1000.0);
    } catch (e) {
      console.warn(`[Efficient] Silence timer parse warning: ${e.message}`);
    }
  }

  // 5. Physical incapacitation filter
  const activeCandidates = filterIncapacitatedBots(bots, sceneState);
  if (activeCandidates.length === 0) return null;

  // 6. Calculate scores
  const scoredCandidates = [];
  for (const bot of activeCandidates) {
    const scored = await calculateCandidateScore(bot, otherNames, lastMsg, userText, tau, statusS, sceneState);
    scoredCandidates.push(scored);
  }

  // Sort candidates
  scoredCandidates.sort((a, b) => b.score - a.score);
  const bestCandidate = scoredCandidates[0];

  // Silence/Lapse Threshold check (0.05 baseline)
  if (bestCandidate.score < 0.05) {
    console.log(`[Efficient] Max score ${bestCandidate.score.toFixed(4)} is below Silence Threshold (0.05). Conversation lapse.`);
    return null;
  }

  // 7. Choose winner using softmax
  const winnerId = chooseWeightedWinner(scoredCandidates);
  const winnerName = scoredCandidates.find(c => c.id === winnerId).name;
  console.log(`[Efficient] Winner chosen: ${winnerName} (ID: ${winnerId})`);

  return winnerId;
}
