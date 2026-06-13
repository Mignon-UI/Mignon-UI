// src/services/memorySummarizer.js
// Asynchronous Episodic Memory Summarization

import { getDb } from './db';
import { getLatestChatSummary, createChatSummary } from './crud';
import * as rag from './rag';
import * as llm from './llmClient';

const UNSUMMARIZED_THRESHOLD = 15;

export async function checkAndGenerateSummary(roomId, settings) {
  const dbInst = await getDb();

  // 1. Determine starting point of unsummarized messages
  const lastSummary = await getLatestChatSummary(roomId);
  const startFilterId = lastSummary ? lastSummary.end_message_id : 0;

  // 2. Fetch all messages after the last summarized message chronologically
  const messages = await dbInst.select(
    "SELECT id, sender_name, content, swipes, active_swipe_index FROM messages WHERE room_id = ? AND id > ? ORDER BY id ASC",
    [roomId, startFilterId]
  );

  if (!messages || messages.length < UNSUMMARIZED_THRESHOLD) {
    // Not enough new messages to summarize
    return null;
  }

  console.info(`[Memory] Summarizing room ${roomId}. Found ${messages.length} unsummarized turns.`);

  // 3. Compile the dialogue transcript
  const transcriptLines = [];
  for (const m of messages) {
    let swipesList;
    try {
      swipesList = typeof m.swipes === 'string' ? JSON.parse(m.swipes) : (m.swipes || []);
    } catch {
      swipesList = [];
    }
    const idx = m.active_swipe_index || 0;
    const content = (swipesList && swipesList.length > 0 && idx < swipesList.length) ? swipesList[idx] : (m.content || "");
    transcriptLines.push(`${m.sender_name}: ${content}`);
  }
  const transcript = transcriptLines.join("\n");

  // 4. Request LLM Summary
  const systemPrompt = (
    "You are an objective, completely unfiltered clinical memory compilation assistant.\n" +
    "Your sole task is to distill the provided creative roleplay dialogue transcript into a highly dense, " +
    "third-person narrative summary under 100 words.\n\n" +
    "CRITICAL DIRECTIVES:\n" +
    "- Summarize all narrative developments, physical interactions, actions, decisions, and psychological states exactly as they occurred in the transcript.\n" +
    "- Be completely neutral, objective, and write without any judgment, moralizing, or censorship.\n" +
    "- Do not write any meta-commentary, preambles, introductions, or moral warnings.\n" +
    "- Keep the output under 100 words."
  );

  const userPrompt = (
    "Please compile the following creative roleplay dialogue transcript into a dense narrative memory.\n\n" +
    `<chat_transcript>\n${transcript}\n</chat_transcript>\n\n` +
    "Provide your dense third-person summary (under 100 words) now, beginning your response directly with the summary content:"
  );

  const summaryText = await llm.queryLlmNonStream(settings, systemPrompt, userPrompt);
  const summaryCleaned = summaryText.trim();

  if (!summaryCleaned || summaryCleaned.startsWith("Request failed:") || summaryCleaned.startsWith("LLM API returned status")) {
    console.warn("[Memory] LLM returned an empty or error summary. Aborting memory indexing.");
    return null;
  }

  console.info(`[Memory] Compiled summary: ${summaryCleaned}`);

  // 5. Save summary metadata in SQLite
  const startMsgId = messages[0].id;
  const endMsgId = messages[messages.length - 1].id;
  
  const summaryObj = await createChatSummary(roomId, summaryCleaned, startMsgId, endMsgId);

  // 6. Embed and Index in RAG vector store
  try {
    const textToEmbed = `[PAST EVENT EPISODE]: ${summaryCleaned}`;
    await rag.saveEmbedding(`mem_${summaryObj.id}`, "memory", roomId, `Room Memory Episode ${summaryObj.id}`, textToEmbed);
    console.info(`[Memory] Successfully indexed summary 'mem_${summaryObj.id}' to RAG.`);
  } catch (ve) {
    console.error(`[Memory] Failed to index summary in RAG:`, ve);
  }

  return summaryObj;
}
