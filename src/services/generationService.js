// src/services/generationService.js
// Client-side LLM response generation, swipe regeneration, and rate limiting.

import { getDb } from './db';
import { getSettings, getRooms, getCharacters, getRoomMessages, createMessage } from './crud';
import { runEfficientSelector } from './turnTaking';
import { compileSystemPrompt, formatChatHistory, compileJointMultiAgentPrompt } from './promptCompiler';
import { runCognitiveAuction, updateHybridSceneState } from './sceneService';
import * as llm from './llmClient';
import { checkAndGenerateSummary } from './memorySummarizer';

const cloudRateLimits = {};
const LIMIT_WINDOW = 60.0; // seconds

export async function checkCloudRateLimit(roomId) {
  const settings = await getSettings();
  if (!settings) return;

  let isCloudCustom = false;
  if (settings.provider === "custom" && settings.custom_key) {
    const ep = (settings.local_endpoint || "").toLowerCase();
    if (ep && !ep.includes("localhost") && !ep.includes("127.0.0.1") && !ep.includes("::1")) {
      isCloudCustom = true;
    }
  }

  if (settings.provider === "openrouter" || isCloudCustom) {
    const limit = settings.cloud_rate_limit !== null && settings.cloud_rate_limit !== undefined ? settings.cloud_rate_limit : 15;
    if (limit <= 0) return; // Unlimited!

    const now = Date.now() / 1000;
    if (!cloudRateLimits[roomId]) {
      cloudRateLimits[roomId] = [];
    }

    const timestamps = cloudRateLimits[roomId];
    while (timestamps.length > 0 && now - timestamps[0] > LIMIT_WINDOW) {
      timestamps.shift();
    }

    if (timestamps.length >= limit) {
      const waitTime = Math.ceil(LIMIT_WINDOW - (now - timestamps[0]));
      throw new Error(`Rate limit exceeded for cloud API. Please wait ${waitTime}s to avoid token burn and bill shock.`);
    }

    timestamps.push(now);
  }
}

// Mimics a backend POST `/api/rooms/:id/generate` return response
export async function generateBotResponse(roomId, botId, autoChain, mutedIds, mode = "auto", signal) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function pushEvent(event, data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ [event]: data })}\n\n`));
      }

      try {
        const settings = await getSettings();
        const rooms = await getRooms();
        const room = rooms.find(r => r.id === roomId);

        if (!room) {
          throw new Error("Room not found");
        }

        // Force auto-chaining off for non-group rooms
        let finalAutoChain = room.is_group ? autoChain : false;

        const maxChainLength = 10;
        let chainCount = 0;
        let currentCharId = botId;

        // Resolve active room members excluding persona and muted characters
        const dbInst = await getDb();
        const members = await dbInst.select("SELECT character_id FROM room_members WHERE room_id = ?", [roomId]);
        const charIds = members.map(m => m.character_id);

        const personaId = settings?.persona_character_id || null;
        const mutedSet = new Set(String(mutedIds || "").split(",").map(id => parseInt(id, 10)).filter(Boolean));

        const allBots = await getCharacters();
        const candidates = allBots.filter(b => charIds.includes(b.id) && b.id !== personaId && !mutedSet.has(b.id));

        while (currentCharId !== null && currentCharId !== undefined) {
          // Check consecutive replies to yield floor to user if bots spoke >= 3 times consecutively
          const messages = await getRoomMessages(roomId);
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
            pushEvent("chain_done", true);
            break;
          }

          // Enforce cloud rate limiting
          await checkCloudRateLimit(roomId);

          let targetBot = allBots.find(b => b.id === currentCharId);
          if (!targetBot && mode !== "cognitive") {
            throw new Error(`Target character ${currentCharId} not found in database.`);
          }

          const isJointMode = (mode === "cognitive" && candidates.length > 1);

          let systemPrompt = "";
          let historyStr = "";

          if (isJointMode) {
            console.log(`[Generation] Compiling Joint Multi-Agent Prompt for ${candidates.length} candidates...`);
            systemPrompt = await compileJointMultiAgentPrompt(roomId, candidates, settings);
            const placeholderBot = targetBot || candidates[0];
            historyStr = await formatChatHistory(roomId, placeholderBot, settings);
          } else {
            pushEvent("bot_start", { character_id: targetBot.id, name: targetBot.name, avatar: targetBot.avatar });
            systemPrompt = await compileSystemPrompt(roomId, targetBot, settings);
            historyStr = await formatChatHistory(roomId, targetBot, settings);
          }

          let fullResponseText = "";
          let isSpeakerResolved = !isJointMode;
          let selectedCharId = currentCharId;
          let tagBuffer = "";
          const tagRegex = /<selected_speaker\s+id="(\d+)">([\s\S]*?)<\/selected_speaker>/i;

          let predictedNextSpeakerId = null;
          let nextSpeakerBuffer = "";

          await llm.streamLlmResponse(settings, systemPrompt, historyStr, (token) => {
            if (!isSpeakerResolved) {
              tagBuffer += token;
              const match = tagBuffer.match(tagRegex);
              if (match) {
                selectedCharId = parseInt(match[1], 10);
                console.log(`[Dynamic Selection] LLM chose speaker ID: ${selectedCharId}`);

                targetBot = allBots.find(b => b.id === selectedCharId);
                if (!targetBot) {
                  targetBot = allBots.find(b => b.id === currentCharId) || candidates[0];
                  selectedCharId = targetBot.id;
                }

                pushEvent("bot_start", { character_id: targetBot.id, name: targetBot.name, avatar: targetBot.avatar });
                isSpeakerResolved = true;

                // Extract dialogue trailing the XML tag
                const parts = tagBuffer.split(tagRegex);
                const remainingToken = parts[parts.length - 1] || "";
                if (remainingToken) {
                  fullResponseText += remainingToken;
                  pushEvent("token", remainingToken);
                }
                tagBuffer = "";
              } else {
                // Fallback if LLM streams 90+ characters without tag, run local efficient fallback
                if (tagBuffer.length >= 90) {
                  console.log("[Dynamic Selection] Warning: Selection tag missing. Triggering robust local efficient fallback.");
                  runEfficientSelector("", candidates, messages, null).then((fallbackId) => {
                    if (fallbackId !== null) {
                      selectedCharId = fallbackId;
                    } else {
                      selectedCharId = currentCharId || candidates[0].id;
                    }

                    targetBot = allBots.find(b => b.id === selectedCharId);
                    pushEvent("bot_start", { character_id: targetBot.id, name: targetBot.name, avatar: targetBot.avatar });
                    isSpeakerResolved = true;

                    // Strip tag leftovers
                    const cleanToken = tagBuffer.replace(/<selected_speaker.*?>.*?<\/selected_speaker>|<selected_speaker.*/gi, "");
                    if (cleanToken) {
                      fullResponseText += cleanToken;
                      pushEvent("token", cleanToken);
                    }
                    tagBuffer = "";
                  });
                }
              }
            } else {
              fullResponseText += token;
              
              nextSpeakerBuffer += token;
              const lessThanIndex = nextSpeakerBuffer.indexOf("<");
              if (lessThanIndex === -1) {
                pushEvent("token", nextSpeakerBuffer);
                nextSpeakerBuffer = "";
              } else {
                if (lessThanIndex > 0) {
                  pushEvent("token", nextSpeakerBuffer.substring(0, lessThanIndex));
                  nextSpeakerBuffer = nextSpeakerBuffer.substring(lessThanIndex);
                }
                const lowerBuf = nextSpeakerBuffer.toLowerCase();
                const isPrefix = "<next_speaker".startsWith(lowerBuf.substring(0, Math.min(lowerBuf.length, 13)));
                if (!isPrefix) {
                  pushEvent("token", nextSpeakerBuffer);
                  nextSpeakerBuffer = "";
                } else {
                  const tagMatch = nextSpeakerBuffer.match(/<next_speaker\s+id="([^"]+)">/i);
                  if (tagMatch) {
                    predictedNextSpeakerId = tagMatch[1];
                    console.log(`[Dynamic Selection] Parsed next speaker tag: ${predictedNextSpeakerId}`);
                    nextSpeakerBuffer = "";
                  }
                }
              }
            }
          }, signal);

          // Flush nextSpeakerBuffer if any remaining
          if (nextSpeakerBuffer) {
            const tagMatch = nextSpeakerBuffer.match(/<next_speaker\s+id="([^"]+)">/i);
            if (tagMatch) {
              predictedNextSpeakerId = tagMatch[1];
              console.log(`[Dynamic Selection] Parsed next speaker tag at stream end: ${predictedNextSpeakerId}`);
            } else {
              pushEvent("token", nextSpeakerBuffer);
            }
            nextSpeakerBuffer = "";
          }

          // Ensure speaker got resolved on empty streams/fails
          if (!isSpeakerResolved) {
            targetBot = allBots.find(b => b.id === currentCharId) || candidates[0];
            pushEvent("bot_start", { character_id: targetBot.id, name: targetBot.name, avatar: targetBot.avatar });
            selectedCharId = targetBot.id;
          }

          // Strip any trailing next_speaker tags from final response text before saving
          const cleanResponse = fullResponseText.replace(/<next_speaker\s+id="[^"]+">/gi, "").trim();
          if (!cleanResponse) {
            throw new Error(`AI for ${targetBot.name} generated an empty response.`);
          }

          // Save generated message to SQLite
          const createdMsg = await createMessage({
            room_id: roomId,
            sender_type: "character",
            character_id: targetBot.id,
            sender_name: targetBot.name,
            content: cleanResponse,
            swipes: [cleanResponse],
            active_swipe_index: 0
          });

          // Update hybrid scene state
          try {
            await updateHybridSceneState(roomId, targetBot.id, targetBot.name, cleanResponse, predictedNextSpeakerId);
          } catch (exScene) {
            console.warn("[Generation] Action state update warning:", exScene);
          }

          // Trigger episodic memory summarizer
          setTimeout(async () => {
            try {
              await checkAndGenerateSummary(roomId, settings);
            } catch (me) {
              console.error("[Memory] Background summarizer error:", me);
            }
          }, 150);

          pushEvent("done", { message_id: createdMsg.id });

          if (finalAutoChain) {
            chainCount++;
            if (chainCount >= maxChainLength) {
              console.log(`[Generation] Safety limit hit: Cap of ${maxChainLength} replies reached.`);
              pushEvent("chain_done", true);
              break;
            }

            // Resolve next speaker
            let nextCharId = null;
            try {
              if (mode === "cognitive") {
                const freshMessages = await getRoomMessages(roomId);
                nextCharId = await runCognitiveAuction(roomId, "", candidates, freshMessages);
              } else {
                const freshMessages = await getRoomMessages(roomId);
                const sceneState = room.scene_state ? JSON.parse(room.scene_state) : null;
                nextCharId = await runEfficientSelector("", candidates, freshMessages, mode === "efficient" ? null : sceneState);
              }
            } catch (e) {
              console.error("[Generation] Failed to get next speaker:", e);
            }

            if (nextCharId !== null && nextCharId !== undefined) {
              console.log(`[Generation] Chaining next speaker ${nextCharId} in 1.5s...`);
              await new Promise(resolve => setTimeout(resolve, 1500));
              currentCharId = nextCharId;
            } else {
              console.log("[Generation] Silence threshold hit or no speaker. Halting chain.");
              pushEvent("chain_done", true);
              break;
            }
          } else {
            break;
          }
        }

      } catch (err) {
        if (err.name === "AbortError") {
          console.log("[LocalGen] Stream cancelled by user abort.");
        } else {
          console.error("[LocalGen] Generation error:", err);
          pushEvent("error", err.message);
        }
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream" }
  });
}

// Port of regenerateSwipe from api.js but executing completely locally
export async function regenerateSwipe(roomId, msgId, onToken, signal) {
  await checkCloudRateLimit(roomId);
  const settings = await getSettings();
  const dbInst = await getDb();

  // Load target message details
  const msgRows = await dbInst.select("SELECT * FROM messages WHERE id = ?", [msgId]);
  if (msgRows.length === 0) throw new Error("Message not found");
  const msg = msgRows[0];

  const bots = await getCharacters();
  const targetBot = bots.find(b => b.id === msg.character_id);
  if (!targetBot) throw new Error("Character not found");

  // Compile prompts excluding this message and subsequent ones
  const systemPrompt = await compileSystemPrompt(roomId, targetBot, settings);
  const historyStr = await formatChatHistory(roomId, targetBot, settings, msgId);

  let fullResponse = "";
  await llm.streamLlmResponse(settings, systemPrompt, historyStr, (token) => {
    fullResponse += token;
    onToken(token);
  }, signal);

  const cleanResponse = fullResponse.trim();
  if (!cleanResponse) {
    throw new Error("LLM returned an empty response for swipe.");
  }

  // Update swipes array in SQLite
  const swipes = JSON.parse(msg.swipes || '[]');
  swipes.push(cleanResponse);
  const newIndex = swipes.length - 1;

  await dbInst.execute(
    "UPDATE messages SET content = ?, swipes = ?, active_swipe_index = ? WHERE id = ?",
    [cleanResponse, JSON.stringify(swipes), newIndex, msgId]
  );

  // Update hybrid scene state
  try {
    await updateHybridSceneState(roomId, targetBot.id, targetBot.name, cleanResponse);
  } catch (exScene) {
    console.warn("[SwipeRegen] Action state update warning:", exScene);
  }

  return {
    done: true,
    message_id: msgId,
    content: cleanResponse,
    active_swipe_index: newIndex
  };
}
