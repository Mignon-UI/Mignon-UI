// src/services/turnTaking.js
// Psychological Turn-Taking Model (Formula 3) driven by a deterministic rule-based text parser and local keyword matching.
// Ported directly from app/services/group_reply_order.py.

function escapeRegex(string) {
  return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

function getKeywordRelevance(msgText, bioText) {
  if (!msgText?.trim() || !bioText?.trim()) return 0.5;

  const bio = bioText.toLowerCase();
  const cleanText = msgText.toLowerCase().replace(/[^\w\s]/g, ' ');
  const words = cleanText.split(/\s+/).filter(t => t.length >= 3);
  const uniqueWords = new Set(words);

  const overlap = [...uniqueWords].filter(t => bio.includes(t)).length;
  return Math.max(0.5, Math.min(1.0, 0.5 + overlap * 0.15));
}

function calculateOceanTraits(bioLower) {
  const compute = (weights, initial = 0.5) => {
    let sum = initial;
    for (const kw in weights) {
      if (bioLower.includes(kw)) sum += weights[kw];
    }
    return Math.max(0, Math.min(1, sum));
  };

  return {
    extraversion: compute({
      shy: -0.4, timid: -0.4, quiet: -0.4, reserved: -0.4, withdrawn: -0.4, introverted: -0.4, loner: -0.6,
      "keeps to themself": -0.6, reclusive: -0.6, talkative: 0.4, chatty: 0.4, outgoing: 0.4, sociable: 0.4,
      gregarious: 0.4, "life of the party": 0.5, loud: 0.5, boisterous: 0.5, extroverted: 0.5,
      "speaks rarely": -0.3, "only talks when necessary": -0.3, "friendly and approachable": 0.2
    }),
    assertiveness: compute({
      meek: -0.4, submissive: -0.4, pushover: -0.4, "will not speak up": -0.4, aggressive: 0.4, dominant: 0.4,
      "commands attention": 0.4, bossy: 0.4, assertive: 0.3, confident: 0.3, "speaks their mind": 0.3, bold: 0.3,
      hesitant: -0.2, indecisive: -0.2, "waits for others": -0.2, "natural leader": 0.5, "takes charge": 0.5
    }, bioLower.includes("shy") ? 0.3 : 0.5),
    agreeableness: compute({
      kind: 0.3, warm: 0.3, compassionate: 0.3, gentle: 0.3, caring: 0.3, cooperative: 0.2, "good listener": 0.2,
      polite: 0.2, cold: -0.3, harsh: -0.3, rude: -0.3, blunt: -0.3, competitive: -0.3, argumentative: -0.2,
      hostile: -0.2, mean: -0.2, sarcastic: -0.2, sweet: 0.2, "soft-spoken": 0.2
    }),
    neuroticism: compute({
      anxious: 0.4, nervous: 0.4, worried: 0.4, insecure: 0.4, "self-conscious": 0.4, calm: -0.3, "laid-back": -0.3,
      unflappable: -0.3, relaxed: -0.3, moody: 0.3, temperamental: 0.3, volatile: 0.3, dramatic: 0.3,
      "easily stressed": 0.4, panics: 0.4, stoic: -0.2, emotionless: -0.2
    }),
    openness: compute({
      curious: 0.4, imaginative: 0.4, creative: 0.4, unconventional: 0.4, adventurous: 0.3, "open-minded": 0.3,
      philosophical: 0.3, traditional: -0.3, conservative: -0.3, "set in their ways": -0.3, stubborn: -0.3,
      "loves new ideas": 0.5, explorer: 0.5, practical: -0.2, "down-to-earth": -0.2
    })
  };
}

function parseCharacterStatus(bioLower) {
  const statusDict = {
    king: 10, queen: 10, emperor: 10, god: 10, ruler: 10, lord: 9, duke: 9, general: 9, "high priest": 9,
    captain: 8, chief: 8, master: 8, knight: 7, officer: 7, elder: 7, "average citizen": 5,
    villager: 5, merchant: 5, servant: 3, butler: 3, assistant: 3, slave: 1, prisoner: 1, outcast: 1
  };

  const bracketMatches = bioLower.match(/\[(?:tags|personality):\s*([^\]]*)\]/g) || [];
  const tokens = bracketMatches.flatMap(m => {
    return m.replace(/\[(?:tags|personality):\s*|\]/g, '')
      .split(',')
      .map(t => t.trim());
  });

  const keys = Object.keys(statusDict);
  const match = keys.find(kw => tokens.includes(kw)) || keys.find(kw => bioLower.includes(kw));

  return match ? statusDict[match] : 5;
}

function calculateComfortLevels(bioLower, otherNames, assertiveness, neuroticism) {
  const rules = [
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

  const comfort = {};
  for (const other of otherNames) {
    comfort[other] = 0.45;
    const esc = escapeRegex(other.toLowerCase());
    const targetPattern = `(?:the\\s+|a\\s+|an\\s+)?${esc}`;

    const matched = rules.find(([pattern]) => {
      const replacedSource = pattern.source.replace("X", targetPattern);
      return new RegExp(replacedSource, 'i').test(bioLower);
    });

    if (matched) {
      const val = matched[1];
      comfort[other] = val === 0.30 && assertiveness < 0.3 ? 0.1 : val;
    }
  }
  return comfort;
}

function parseCharacterBio(bio, otherNames) {
  const bioLower = (bio || "").toLowerCase();
  const traits = calculateOceanTraits(bioLower);
  return {
    ...traits,
    impulsivity: (traits.extraversion + 1 - traits.agreeableness) / 2,
    silenceDiscomfort: 0.7 * traits.extraversion + 0.3 * traits.neuroticism,
    slc: traits.neuroticism,
    status: parseCharacterStatus(bioLower),
    comfort: calculateComfortLevels(bioLower, otherNames, traits.assertiveness, traits.neuroticism)
  };
}

function softmax(scores, temperature = 0.5) {
  const t = Math.max(0.05, temperature);
  const maxS = scores.length ? Math.max(...scores) : 0;
  const exps = scores.map(s => Math.exp((s - maxS) / t));
  const sum = exps.reduce((a, b) => a + b, 0);
  return sum ? exps.map(e => e / sum) : new Array(scores.length).fill(1 / scores.length);
}

function checkDirectAddress(userText, lastMsg, bots) {
  const check = (text, logPrefix, targetBots = bots) => {
    if (!text) return null;
    for (const bot of targetBots) {
      const names = [bot.name, ...bot.name.split(/\s+/).filter(p => p.length >= 3)];
      for (const name of names) {
        if (new RegExp(`\\b${escapeRegex(name)}\\b`, 'i').test(text)) {
          console.log(`[Efficient] ${logPrefix} triggered for bot: ${bot.name} via name token: ${name}`);
          return bot.id;
        }
      }
    }
    return null;
  };

  const addressWinner = check(userText, "Direct Address");
  if (addressWinner !== null) return addressWinner;

  if (lastMsg?.content?.trim()) {
    const eligibleBots = bots.filter(b => b.name !== lastMsg.sender_name);
    return check(lastMsg.content, "Direct Address from last turn", eligibleBots);
  }

  return null;
}

function filterIncapacitatedBots(bots, sceneState) {
  const terms = ["unconscious", "fainted", "asleep", "sleeping", "knocked out"];

  return bots.filter(bot => {
    const state = sceneState?.[bot.id];
    if (!state) return true;

    const action = (state.action || "").toLowerCase();
    const mood = (state.mood || "").toLowerCase();
    const isIncapacitated = terms.some(term => action.includes(term) || mood.includes(term));

    if (isIncapacitated) {
      console.log(`[Efficient] Bot: ${bot.name} is physically incapacitated. Skipping.`);
    }
    return !isIncapacitated;
  });
}

async function calculateCandidateScore(bot, otherNames, lastMsg, userText, tau, statusS, sceneState) {
  const traits = parseCharacterBio(bot.personality, otherNames);
  const others = otherNames.filter(n => n.toLowerCase() !== bot.name.toLowerCase());
  const comfortVals = others.map(n => traits.comfort[n] ?? 0.45);

  const minC = comfortVals.length ? Math.min(...comfortVals) : 0.45;
  const sumC = comfortVals.reduce((sum, val) => sum + val, 0);
  const avgC = comfortVals.length ? sumC / comfortVals.length : 0.45;

  const comfortPenalty = traits.slc * (1 - minC) + (1 - traits.slc) * (1 - avgC);
  const comfortMultiplier = Math.max(0.1, 1 - comfortPenalty);

  const willingness = traits.extraversion * traits.assertiveness * comfortMultiplier;
  const engagement = Math.max(getKeywordRelevance(userText || lastMsg?.content || "", bot.personality || ""), 0.5);
  const silenceBoost = tau >= 1.5 ? 1 + traits.silenceDiscomfort * (tau - 1.5) * 0.5 : 1;
  const isSelected = (lastMsg?.sender_name?.toLowerCase() === bot.name.toLowerCase()) ? 100 : 1;
  const statusDiff = Math.max(0, Math.min(1, (statusS - traits.status) / 10));
  const deferencePenalty = Math.max(0, Math.min(0.9, traits.agreeableness * (1 - traits.assertiveness) * statusDiff));

  let score = willingness * engagement * silenceBoost * isSelected * (1 - deferencePenalty);

  let proximityBoost = 0;
  const botLocation = sceneState?.[bot.id]?.location?.toLowerCase();
  if (botLocation && botLocation !== "main room") {
    const searchIn = `${userText} ${lastMsg?.content || ""}`.toLowerCase();
    if (searchIn.includes(botLocation)) {
      console.log(`[Efficient] Spatial match for ${bot.name} at location '${botLocation}'. Boosting.`);
      proximityBoost = 1.5;
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
  const scores = scoredCandidates.map(c => c.score);
  const probs = softmax(scores, 0.5);

  console.log("[Efficient] Selection probabilities:");
  scoredCandidates.forEach((c, i) => {
    const pct = (probs[i] * 100).toFixed(1);
    console.log(`  - ${c.name}: ${pct}% (Score: ${c.score.toFixed(4)})`);
  });

  const rand = Math.random();
  let cumulativeSum = 0;
  for (let i = 0; i < scoredCandidates.length; i++) {
    cumulativeSum += probs[i];
    if (rand <= cumulativeSum) {
      return scoredCandidates[i].id;
    }
  }
  return scoredCandidates[scoredCandidates.length - 1].id;
}

// Selects next speaker (character ID) using the local Keyword-Matrix Efficient model
export async function runEfficientSelector(messageContent, bots, messages, sceneState = null) {
  if (!bots || bots.length === 0) return null;
  if (bots.length === 1) return bots[0].id;

  const userText = (messageContent || "").trim();
  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  // 1. Direct Address Check (highest priority rule)
  const directAddressWinner = checkDirectAddress(userText, lastMsg, bots);
  if (directAddressWinner !== null) return directAddressWinner;

  // 2. Resolve Participant Names
  const participantNames = new Set(bots.map(b => b.name));
  if (messages) messages.forEach(m => participantNames.add(m.sender_name));
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
  let tau = 0;
  if (lastMsg?.created_at) {
    const delta = Date.now() - new Date(lastMsg.created_at).getTime();
    if (!isNaN(delta)) tau = Math.max(0, delta / 1000);
  }

  // 5. Physical incapacitation filter
  const activeCandidates = filterIncapacitatedBots(bots, sceneState);
  if (activeCandidates.length === 0) return null;

  // 6. Calculate scores
  const scoredCandidates = (await Promise.all(
    activeCandidates.map(bot => calculateCandidateScore(bot, otherNames, lastMsg, userText, tau, statusS, sceneState))
  )).sort((a, b) => b.score - a.score);

  // Silence/Lapse Threshold check (0.05 baseline)
  if (scoredCandidates[0].score < 0.05) {
    console.log(`[Efficient] Max score ${scoredCandidates[0].score.toFixed(4)} is below Silence Threshold (0.05). Conversation lapse.`);
    return null;
  }

  // 7. Choose winner using softmax
  const winnerId = chooseWeightedWinner(scoredCandidates);
  console.log(`[Efficient] Winner chosen: ${scoredCandidates.find(c => c.id === winnerId).name} (ID: ${winnerId})`);

  return winnerId;
}
