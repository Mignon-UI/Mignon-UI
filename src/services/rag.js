// src/services/rag.js
// Client-side RAG vector engine — feature-parity with rag_indexer.py + rag_store.py.
//
// Embedding priority (matches rag_store.py):
//   1. Cloud  → OpenRouter  (openai/text-embedding-3-small, 1536d)
//   2. Local  → Ollama / Kobold API offload              (dynamic dim)
//   3. WASM   → Jina-v2-small-en via @huggingface/transformers (512d)
//
// Index sync (matches rag_indexer.py):
//   • SHA-256 content hashing as stable document ID → skip unchanged entries
//   • Parent-child paragraph chunking with contextual prefix injection
//   • Character card text builder ([CHARACTER: Name] block)
//   • Episodic chat-summary memories ([PAST EVENT EPISODE]: prefix)
//   • Stale-document deletion (existing_ids − current_ids)
//   • Dimension-mismatch detection → clears embeddings table and forces rebuild

import { pipeline } from '@huggingface/transformers';
import { safeFetch } from '../utils/safeFetch';
import { getDb } from './db';
import { getSettings } from './crud';
import { decryptKey } from './llmClient';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeVector(v) {
  const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  return norm === 0 ? v : v.map(val => val / norm);
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

function floatArrayToBytes(floatArray) {
  const f32 = new Float32Array(floatArray);
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Local WASM extractor singleton
// ─────────────────────────────────────────────────────────────────────────────

let extractorInstance = null;

async function getLocalExtractor() {
  if (!extractorInstance) {
    console.log('[RAG] Initializing local Jina Embeddings v2 WASM model...');
    extractorInstance = await pipeline('feature-extraction', 'Xenova/jina-embeddings-v2-small-en');
  }
  return extractorInstance;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Embedding dimension resolver  (matches get_embedding_dimension())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Statically resolve expected embedding dimension for the current provider and model.
 * Mirrors rag_store.py::get_embedding_dimension().
 */
export async function getEmbeddingDimension() {
  const settings = await getSettings();
  const provider  = settings?.provider   || 'ollama';
  const modelName = settings?.selected_model || 'default';

  if (provider === 'openrouter' || modelName.includes('text-embedding-3-small')) {
    return 1536; // OpenAI text-embedding-3-small
  }
  if (modelName.toLowerCase().includes('minilm')) {
    return 384;  // all-MiniLM-L6-v2 family
  }
  // Jina-v2-small-en (WASM fallback), Ollama default, Kobold
  return 512;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Embedding generation  (matches rag_store.py::embed())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate embeddings for a list of strings.
 * Falls back through: Cloud → Local API → WASM.
 */
export async function embedTexts(texts) {
  if (!texts || texts.length === 0) return [];

  const settings    = await getSettings();
  const provider    = settings?.provider       || 'ollama';
  const apiEndpoint = settings?.local_endpoint || 'http://127.0.0.1:11434/v1';
  const modelName   = settings?.selected_model || 'default';

  // Truncate to safe maximum (matches rag_store.py 8 000-char limit)
  const cleanTexts = texts.map(t => (typeof t === 'string' ? t.slice(0, 8000) : ''));

  // ── 1. Cloud OpenRouter ───────────────────────────────────────────────────
  if (provider === 'openrouter') {
    try {
      const apiKey = await decryptKey(settings?.openrouter_key || '');
      const res = await safeFetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model: 'openai/text-embedding-3-small', input: cleanTexts })
      });
      if (res.ok) {
        const data = await res.json();
        return data.data.map(item => item.embedding);
      }
      throw new Error(`Cloud embeddings status ${res.status}`);
    } catch (e) {
      console.warn('[RAG] Cloud embedding failed, falling back to local WASM Jina...', e);
    }
  }

  // ── 2. Local API offload (Ollama / Kobold) ────────────────────────────────
  if ((provider === 'ollama' || provider === 'kobold') && apiEndpoint) {
    try {
      let endpoint = apiEndpoint.replace(/\/$/, '');
      if (!endpoint.includes('/v1') && endpoint.includes('11434')) {
        endpoint = `${endpoint}/v1/embeddings`;
      } else {
        endpoint = endpoint.endsWith('/embeddings') ? endpoint : `${endpoint}/embeddings`;
      }

      const res = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, input: cleanTexts })
      });
      if (res.ok) {
        const data = await res.json();
        return data.data.map(item => item.embedding);
      }
      throw new Error(`Local API embeddings status ${res.status}`);
    } catch (e) {
      console.warn('[RAG] Local API embedding offload failed, falling back to local WASM Jina...', e);
    }
  }

  // ── 3. WASM fallback (jinaai/jina-embeddings-v2-small-en) ────────────────
  try {
    const extractor = await getLocalExtractor();
    return Promise.all(cleanTexts.map(async text => {
      const output = await extractor(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    }));
  } catch (e) {
    console.error('[RAG] Critical: Local Jina WASM extraction failed:', e);
    const dim = await getEmbeddingDimension();
    return cleanTexts.map(() => new Array(dim).fill(0.0));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SHA-256 content hashing  (matches rag_indexer.py::_content_hash())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SHA-256 of text → stable 32-char hex ID.
 */
async function contentHash(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Parent-child lore chunking  (matches rag_indexer.py::_split_into_children())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Split a lore entry's content by double-newline paragraphs.
 */
function splitIntoChildren(entry) {
  const content    = entry.content || '';
  const paragraphs = content.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const chunks     = paragraphs.length ? paragraphs : [content];

  return chunks.map(p =>
    `[LORE: ${entry.title}]\nTrigger keywords: ${entry.keys}\n\n${p}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Character text builder  (matches rag_indexer.py::_build_character_text())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a compact character summary.
 */
function buildCharacterText(char) {
  const parts = [`[CHARACTER: ${char.name}]`];
  if (char.personality)       parts.push(char.personality);
  if (char.scenario)          parts.push(`Scenario: ${char.scenario}`);
  if (char.example_dialogue)  parts.push(`Example dialogue:\n${char.example_dialogue}`);
  return parts.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Dimension-mismatch detection  (matches rag_store.py::_get_table())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether stored vectors are dimensionally compatible with the current model.
 */
export async function checkAndRebuildEmbeddingsIfNeeded() {
  const db            = await getDb();
  const expectedDim   = await getEmbeddingDimension();

  const sampleRows = await db.select(
    "SELECT vector FROM embeddings LIMIT 1"
  );

  if (sampleRows.length === 0) return false;

  try {
    const rawVector = sampleRows[0].vector;
    let stored;
    if (typeof rawVector === 'string') {
      console.warn('[RAG] Legacy string-based vectors detected. Clearing embeddings table for full binary rebuild...');
      await db.execute('DELETE FROM embeddings');
      return true;
    } else if (rawVector) {
      const floatVec = bytesToFloatArray(rawVector);
      stored = floatVec ? Array.from(floatVec) : null;
    }

    const storedDim = Array.isArray(stored) ? stored.length : 0;

    if (storedDim !== 0 && storedDim !== expectedDim) {
      console.warn(
        `[RAG] Dimension mismatch detected (stored: ${storedDim}, model: ${expectedDim}).` +
        ' Clearing embeddings table for full rebuild...'
      );
      await db.execute('DELETE FROM embeddings');
      console.log('[RAG] Embeddings table cleared. A full sync is required.');
      return true;
    }
  } catch (e) {
    console.warn('[RAG] Could not inspect stored vector dimensions:', e);
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Incremental full sync  (matches rag_indexer.py::sync_rag_index())
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Incrementally sync all active lore entries, characters and chat summaries.
 */
export async function syncRagIndex(options = {}) {
  const db = await getDb();

  // ── 0. Dimension mismatch check ──────────────────────────────────────────
  await checkAndRebuildEmbeddingsIfNeeded();

  // ── 1. Fetch existing IDs ────────────────────────────────────────────────
  let existingIds = new Set();
  try {
    const existingRows = await db.select('SELECT id FROM embeddings');
    existingIds = new Set(existingRows.map(r => r.id));
  } catch (e) {
    console.warn('[RAG] Could not fetch existing embedding IDs, treating as empty:', e);
  }

  const rowsToAdd  = [];
  const currentIds = new Set();

  // ── 2. Lore entries (parent-child chunking) ───────────────────────────────
  let loreQuery = 'SELECT * FROM lore_entries WHERE is_active = 1';
  const loreParams = [];
  if (options.worldId != null) {
    loreQuery += ' AND world_id = ?';
    loreParams.push(options.worldId);
  }
  const loreEntries = await db.select(loreQuery, loreParams);

  for (const entry of loreEntries) {
    const childTexts = splitIntoChildren(entry);
    for (let i = 0; i < childTexts.length; i++) {
      const childText = childTexts[i];
      const docId = await contentHash(`lore_${entry.id}_${i}_${childText}`);
      currentIds.add(docId);

      if (!existingIds.has(docId)) {
        rowsToAdd.push({ id: docId, type: 'lore', source_id: String(entry.id), title: entry.title, text: childText });
      }
    }
  }

  // ── 3. Characters ─────────────────────────────────────────────────────────
  const characters = await db.select('SELECT * FROM characters');
  for (const char of characters) {
    const text  = buildCharacterText(char);
    const docId = await contentHash(text);
    currentIds.add(docId);

    if (!existingIds.has(docId)) {
      rowsToAdd.push({ id: docId, type: 'character', source_id: String(char.id), title: char.name, text });
    }
  }

  // ── 4. Chat summaries / episodic memories ─────────────────────────────────
  const summaries = await db.select('SELECT * FROM chat_summaries');
  for (const summary of summaries) {
    const docId = `mem_${summary.id}`;
    currentIds.add(docId);

    if (!existingIds.has(docId)) {
      const text = `[PAST EVENT EPISODE]: ${summary.summary_text}`;
      rowsToAdd.push({
        id: docId,
        type: 'memory',
        source_id: String(summary.room_id),
        title: `Room Memory Episode ${summary.id}`,
        text
      });
    }
  }

  // ── 5. Batch embed and insert new docs ────────────────────────────────────
  let added = 0;
  if (rowsToAdd.length > 0) {
    const texts    = rowsToAdd.map(r => r.text);
    const vectors  = await embedTexts(texts);

    for (let i = 0; i < rowsToAdd.length; i++) {
      const row = rowsToAdd[i];
      const bytes = floatArrayToBytes(vectors[i]);

      await db.execute(
        `INSERT INTO embeddings (id, type, source_id, title, text, vector)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title  = excluded.title,
           text   = excluded.text,
           vector = excluded.vector`,
        [row.id, row.type, row.source_id, row.title, row.text, bytes]
      );
    }

    added = rowsToAdd.length;
    console.log(`[RAG] Added ${added} new document(s) to embeddings table.`);
  }

  const skipped = currentIds.size - added;
  console.log(`[RAG] Skipped ${skipped} unchanged document(s).`);

  // ── 6. Remove stale docs ──────────────────────────────────────────────────
  const staleIds = [...existingIds].filter(id => !currentIds.has(id));
  let deleted = 0;
  if (staleIds.length > 0) {
    const placeholders = staleIds.map(() => '?').join(', ');
    // fallow-ignore-next-line security-sink
    await db.execute(`DELETE FROM embeddings WHERE id IN (${placeholders})`, staleIds);
    deleted = staleIds.length;
    console.log(`[RAG] Removed ${deleted} stale document(s) from embeddings table.`);
  }

  return { added, skipped, deleted };
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Cosine similarity
// ─────────────────────────────────────────────────────────────────────────────

export function cosineSimilarity(a, b) {
  let dot = 0.0, normA = 0.0, normB = 0.0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0.0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Semantic retrieval  (matches rag_store.py::retrieve())
// ─────────────────────────────────────────────────────────────────────────────

export async function retrieveEmbeddings(query, topK = 5, filter = {}) {
  if (!query) return [];

  const db = await getDb();

  // 1. Generate query embedding
  let queryVec;
  if (Array.isArray(query)) {
    queryVec = query;
  } else {
    if (typeof query !== 'string' || !query.trim()) return [];
    const queryEmbeddings = await embedTexts([query]);
    queryVec = queryEmbeddings[0];
  }

  if (!queryVec) return [];

  // 2. Build optional WHERE clause
  let sql    = 'SELECT id, type, source_id, title, text, vector FROM embeddings';
  const params = [];
  const clauses = [];

  if (filter.type)     { clauses.push('type = ?');      params.push(filter.type); }
  if (filter.sourceId) { clauses.push('source_id = ?'); params.push(filter.sourceId); }

  if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ');

  // 3. Fetch candidates from SQLite
  const rows = await db.select(sql, params);

  // 4. Compute cosine similarity in JS
  const scoredResults = [];
  for (const row of rows) {
    try {
      let rowVec;
      if (typeof row.vector === 'string') {
        rowVec = JSON.parse(row.vector);
      } else if (row.vector) {
        rowVec = bytesToFloatArray(row.vector);
      } else {
        continue;
      }
      
      const sim  = cosineSimilarity(queryVec, rowVec);
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
    } catch (e) {
      console.warn(`[RAG] Failed to parse vector for row ${row.id}:`, e);
    }
  }

  // 5. Sort by relevance
  scoredResults.sort((a, b) => a._distance - b._distance);

  // 6. Return topK
  return scoredResults.slice(0, topK);
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Single-document CRUD helpers
// ─────────────────────────────────────────────────────────────────────────────

export async function saveEmbedding(id, type, sourceId, title, text) {
  const db = await getDb();

  const stableId  = id || await contentHash(text);
  const embeddings = await embedTexts([text]);
  const bytes = floatArrayToBytes(embeddings[0]);

  await db.execute(
    `INSERT INTO embeddings (id, type, source_id, title, text, vector)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title  = excluded.title,
       text   = excluded.text,
       vector = excluded.vector`,
    [stableId, type, sourceId, title, text, bytes]
  );

  return stableId;
}

export async function deleteEmbedding(id) {
  const db = await getDb();
  await db.execute('DELETE FROM embeddings WHERE id = ?', [id]);
  return true;
}

export async function clearEmbeddings(type, sourceId) {
  const db = await getDb();
  await db.execute('DELETE FROM embeddings WHERE type = ? AND source_id = ?', [type, sourceId]);
  return true;
}
