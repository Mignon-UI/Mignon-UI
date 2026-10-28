import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';

// Mock Worker in tests so it doesn't try to load heavy ONNX models in background worker
class MockWorker {
  constructor() {
    this.onmessage = null;
    this.onerror = null;
  }
  postMessage(data) {
    queueMicrotask(() => {
      if (this.onmessage) {
        if (data.type === 'EMBED_TEXTS') {
          const texts = data.payload?.texts || data.texts || [];
          this.onmessage({
            data: {
              id: data.id,
              type: 'SUCCESS',
              result: texts.map(() => Array.from({ length: 512 }, () => 0.01))
            }
          });
        } else if (data.type === 'COMPUTE_SIMILARITIES') {
          const candidates = data.payload?.candidates || [];
          this.onmessage({
            data: {
              id: data.id,
              type: 'SUCCESS',
              result: candidates.map(c => ({
                id: c.id,
                type: c.type,
                source_id: c.source_id,
                title: c.title,
                text: c.text,
                similarity: 0.95
              }))
            }
          });
        }
      }
    });
  }
  terminate() {}
}

globalThis.Worker = MockWorker;

import { createTestDb } from './testDbHelper';

let testDb;

mock.module('../src/services/db', () => ({
  getDb: async () => testDb
}));

import * as rag from '../src/services/rag';
import * as crud from '../src/services/crud';
import * as safeFetchModule from '../src/utils/safeFetch';

describe('RAG Service Tests', () => {
  beforeEach(async () => {
    testDb = createTestDb({ seed: true });
    spyOn(crud, 'getSettings').mockResolvedValue({ provider: 'ollama' });
    spyOn(safeFetchModule, 'safeFetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: Array.from({ length: 1536 }, () => 0.02) }]
      })
    });
  });

  afterEach(() => {
    mock.restore();
  });

  describe('getEmbeddingDimension', () => {
    it('should resolve correct dimension size based on provider/model configurations', async () => {
      crud.getSettings.mockResolvedValueOnce({ provider: 'openrouter' });
      expect(await rag.getEmbeddingDimension()).toBe(1536);

      crud.getSettings.mockResolvedValueOnce({ provider: 'ollama', selected_model: 'text-embedding-3-small' });
      expect(await rag.getEmbeddingDimension()).toBe(1536);

      crud.getSettings.mockResolvedValueOnce({ provider: 'ollama', selected_model: 'all-minilm-l6-v2' });
      expect(await rag.getEmbeddingDimension()).toBe(384);

      crud.getSettings.mockResolvedValueOnce({ provider: 'ollama', selected_model: 'jina-v2-small-en' });
      expect(await rag.getEmbeddingDimension()).toBe(512);
    });
  });

  describe('cosineSimilarity', () => {
    it('should compute exact cosine similarity', () => {
      const a = [1.0, 0.0, 0.0];
      const b = [1.0, 0.0, 0.0];
      expect(rag.cosineSimilarity(a, b)).toBeCloseTo(1.0);

      const c = [0.0, 1.0, 0.0];
      expect(rag.cosineSimilarity(a, c)).toBeCloseTo(0.0);
    });

    it('should return 0.0 for zero-norm vectors without throwing', () => {
      const zero = [0, 0, 0];
      const normal = [1, 2, 3];
      expect(rag.cosineSimilarity(zero, normal)).toBe(0.0);
    });
  });

  describe('embedTexts', () => {
    it('should return early on empty text arrays', async () => {
      const result = await rag.embedTexts([]);
      expect(result).toEqual([]);
    });

    it('should fetch embeddings using OpenRouter API when provider is openrouter', async () => {
      crud.getSettings.mockResolvedValue({ provider: 'openrouter', openrouter_key: 'test' });
      const result = await rag.embedTexts(['Hello world']);
      expect(result.length).toBe(1);
      expect(result[0].length).toBe(1536);
    });

    it('should fallback to WASM Jina embeddings on API failure', async () => {
      // Force API failure to trigger local WASM fallback
      safeFetchModule.safeFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      crud.getSettings.mockResolvedValue({ provider: 'ollama', local_endpoint: 'http://invalid' });
      const result = await rag.embedTexts(['Hello local']);
      expect(result.length).toBe(1);
      // Fallback WASM Jina returns 512 dimensions
      expect(result[0].length).toBe(512);
    });
  });

  describe('syncRagIndex', () => {
    it('should increment index correctly adding and deleting stale documents using real SQLite', async () => {
      safeFetchModule.safeFetch.mockResolvedValue({ ok: false, status: 500 });
      crud.getSettings.mockResolvedValue({ provider: 'ollama', selected_model: 'jina-v2-small-en' });

      // Insert an active world and lore entry into real SQLite
      await testDb.execute("INSERT INTO worlds (id, name, description) VALUES (1, 'Arcadia', 'Realm')");
      await testDb.execute(`INSERT INTO lore_entries (world_id, title, keys, content, is_active, weight)
        VALUES (1, 'Ancient Citadel', 'citadel, fortress', 'The sky citadel.', 1, 100)`);

      // Insert an existing stale embedding into real SQLite
      const dummyVec = new Uint8Array(new Float32Array(512).fill(0.01).buffer);
      await testDb.execute(
        `INSERT INTO embeddings (id, type, source_id, title, text, vector)
         VALUES ('stale_doc_id', 'lore', '999', 'Old Doc', 'Old text', ?)`,
        [dummyVec]
      );

      // Verify stale doc exists in SQLite before sync
      const staleBefore = await testDb.select("SELECT * FROM embeddings WHERE id = 'stale_doc_id'");
      expect(staleBefore.length).toBe(1);

      // Run syncRagIndex
      const result = await rag.syncRagIndex();

      expect(result.added).toBeGreaterThan(0);
      expect(result.deleted).toBe(1);

      // Verify directly from real SQLite table that stale doc was deleted
      const staleAfter = await testDb.select("SELECT * FROM embeddings WHERE id = 'stale_doc_id'");
      expect(staleAfter.length).toBe(0);

      // Verify new lore entry was indexed into embeddings table
      const allEmbeddings = await testDb.select("SELECT id, type, title FROM embeddings");
      expect(allEmbeddings.some(e => e.title === 'Ancient Citadel')).toBe(true);
    });
  });

  describe('checkAndRebuildEmbeddingsIfNeeded', () => {
    it('should detect and handle unaligned Float32Array offsets safely in real SQLite', async () => {
      crud.getSettings.mockResolvedValue({ provider: 'ollama', selected_model: 'jina-v2-small-en' });
      // Create an unaligned 512-dim vector buffer
      const buffer = new ArrayBuffer(512 * 4 + 4);
      const unalignedBytes = new Uint8Array(buffer, 2, 512 * 4); // Offset 2 is not 4-byte aligned
      for (let i = 0; i < unalignedBytes.length; i++) unalignedBytes[i] = 1;

      await testDb.execute(
        `INSERT INTO embeddings (id, type, source_id, title, text, vector)
         VALUES ('unaligned_test', 'test', '1', 'Unaligned', 'Text', ?)`,
        [unalignedBytes]
      );

      const result = await rag.checkAndRebuildEmbeddingsIfNeeded();
      // Should not throw and should detect same dimension
      expect(result).toBe(false);
    });

    it('should clear embeddings and return true on dimension mismatch in real SQLite', async () => {
      // Stored vector has 4 dimensions (16 bytes), but model expects 512
      const bytes = new Uint8Array(new Float32Array([1.0, 2.0, 3.0, 4.0]).buffer);
      await testDb.execute(
        `INSERT INTO embeddings (id, type, source_id, title, text, vector)
         VALUES ('mismatched_test', 'test', '1', 'Mismatch', 'Text', ?)`,
        [bytes]
      );

      crud.getSettings.mockResolvedValue({ provider: 'ollama', selected_model: 'jina-v2-small-en' });

      const result = await rag.checkAndRebuildEmbeddingsIfNeeded();
      expect(result).toBe(true);

      // Verify in real SQLite that embeddings table was cleared
      const remaining = await testDb.select('SELECT count(*) as count FROM embeddings');
      expect(remaining[0].count).toBe(0);
    });
  });

  describe('retrieveEmbeddings', () => {
    it('should perform semantic search and apply SQL WHERE filter in real SQLite', async () => {
      safeFetchModule.safeFetch.mockResolvedValue({ ok: false, status: 500 });
      crud.getSettings.mockResolvedValue({ provider: 'ollama', selected_model: 'jina-v2-small-en' });

      const floatVec = new Float32Array(512).fill(0.01);
      const bytes = new Uint8Array(floatVec.buffer);

      // Insert real candidate rows into SQLite
      await testDb.execute(
        `INSERT INTO embeddings (id, type, source_id, title, text, vector)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['lore_target', 'lore', '10', 'The Great Archive', 'Repository of lore', bytes]
      );
      await testDb.execute(
        `INSERT INTO embeddings (id, type, source_id, title, text, vector)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ['char_other', 'character', '20', 'Captain Drake', 'Pirate captain', bytes]
      );

      // Filter by type: 'lore'
      const loreResults = await rag.retrieveEmbeddings('archive lore', 5, { type: 'lore' });
      expect(loreResults.length).toBe(1);
      expect(loreResults[0].title).toBe('The Great Archive');
      expect(loreResults[0].type).toBe('lore');

      // Filter by type: 'character'
      const charResults = await rag.retrieveEmbeddings('captain', 5, { type: 'character' });
      expect(charResults.length).toBe(1);
      expect(charResults[0].title).toBe('Captain Drake');
      expect(charResults[0].type).toBe('character');

      // Filter by non-existent type
      const emptyResults = await rag.retrieveEmbeddings('anything', 5, { type: 'memory' });
      expect(emptyResults).toHaveLength(0);
    });
  });
});
