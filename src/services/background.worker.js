// src/services/background.worker.js
// Web Worker for client-side embedding generation, similarity calculations, turn-taking evaluations, and streaming parsing.

import { pipeline } from '@huggingface/transformers';
import { runMainThreadEfficientSelector } from '../utils/turnTakingMath';

const activeStreams = new Set();
let extractorInstance = null;

async function getLocalExtractor() {
  if (!extractorInstance) {
    console.log('[RAG Worker] Initializing local Jina Embeddings v2 WASM model...');
    extractorInstance = await pipeline('feature-extraction', 'Xenova/jina-embeddings-v2-small-en');
  }
  return extractorInstance;
}

function cosineSimilarity(a, b) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0.0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function bytesToFloatArray(rawBytes) {
  if (!rawBytes) return null;
  const bytes = new Uint8Array(rawBytes);
  let buffer = bytes.buffer;
  let byteOffset = bytes.byteOffset;
  if (byteOffset % 4 !== 0) {
    const aligned = new Uint8Array(bytes.byteLength);
    aligned.set(bytes);
    buffer = aligned.buffer;
    byteOffset = 0;
  }
  return new Float32Array(buffer, byteOffset, bytes.byteLength / 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Listener
// ─────────────────────────────────────────────────────────────────────────────

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'EMBED_TEXTS') {
      const { texts } = payload;
      const extractor = await getLocalExtractor();
      const vectors = await Promise.all(texts.map(async text => {
        const output = await extractor(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
      }));

      self.postMessage({ id, type: 'SUCCESS', result: vectors });
    } 
    
    else if (type === 'COMPUTE_SIMILARITIES') {
      const { queryVector, candidates, topK } = payload;
      const scoredResults = [];

      for (const row of candidates) {
        let rowVec;
        if (typeof row.vector === 'string') {
          rowVec = JSON.parse(row.vector);
        } else if (row.vector) {
          rowVec = bytesToFloatArray(row.vector);
        } else {
          continue;
        }

        if (!rowVec) continue;

        const sim = cosineSimilarity(queryVector, rowVec);
        const dist = 1.0 - sim;

        if (dist <= 0.70) {
          scoredResults.push({
            id:          row.id,
            type:        row.type,
            source_id:   row.source_id,
            title:       row.title,
            text:        row.text,
            _distance:   dist,
            _similarity: sim
          });
        }
      }

      scoredResults.sort((a, b) => a._distance - b._distance);
      const topKResults = scoredResults.slice(0, topK);

      self.postMessage({ id, type: 'SUCCESS', result: topKResults });
    }

    else if (type === 'RUN_EFFICIENT_SELECTOR') {
      const { messageContent, bots, messages, sceneState } = payload;
      const winnerId = await runMainThreadEfficientSelector(messageContent, bots, messages, sceneState);
      self.postMessage({ id, type: 'SUCCESS', result: winnerId });
    }

    else if (type === 'START_LLM_STREAM') {
      const { url, payload: bodyPayload, headers, taskId } = payload;
      activeStreams.add(taskId);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(bodyPayload)
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`LLM API returned status ${response.status}: ${errBody}`);
        }

        const isAnthropic = url.includes("api.anthropic.com");
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          if (!activeStreams.has(taskId)) {
            console.log(`[RAG Worker] Stream ${taskId} aborted by user.`);
            break;
          }

          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine || !cleanLine.startsWith('data:')) continue;

            const dataContent = cleanLine.substring(cleanLine.indexOf(':') + 1).trim();
            if (dataContent === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataContent);
              let token = null;

              if (isAnthropic) {
                if (parsed.type === "content_block_delta") {
                  token = parsed.delta?.text;
                }
              } else {
                if (parsed.choices && parsed.choices.length > 0) {
                  token = parsed.choices[0].delta?.content;
                } else {
                  token = parsed.message?.content;
                }
              }

              if (token) {
                self.postMessage({ id, type: 'STREAM_TOKEN', result: { taskId, token } });
              }
            } catch {
              // Ignore partial JSON parse errors
            }
          }
        }
        self.postMessage({ id, type: 'SUCCESS', result: { taskId } });
      } finally {
        activeStreams.delete(taskId);
      }
    }

    else if (type === 'ABORT_LLM_STREAM') {
      const { taskId } = payload;
      activeStreams.delete(taskId);
      self.postMessage({ id, type: 'SUCCESS', result: { taskId } });
    }
  } catch (err) {
    self.postMessage({ id, type: 'ERROR', error: err.message || String(err) });
  }
};
