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

import { getDb } from '../src/services/db';
import * as rag from '../src/services/rag';
import * as crud from '../src/services/crud';
import * as safeFetchModule from '../src/utils/safeFetch';

describe('RAG Service Tests', () => {
  let mockDb;

  beforeEach(async () => {
    mockDb = await getDb();
    mockDb.select.mockReset();
    mockDb.execute.mockReset();
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
    it('should increment index correctly adding and deleting stale documents', async () => {
      // Setup mocked database fetches for sync
      mockDb.select.mockImplementation(async (query) => {
        if (query.includes('FROM embeddings')) {
          // Existing IDs in DB
          return [{ id: 'stale_id_1' }, { id: 'skipped_id_2' }];
        }
        if (query.includes('FROM lore_entries')) {
          return [];
        }
        if (query.includes('FROM characters')) {
          // Single character
          return [{ id: 1, name: 'Lyra', personality: 'Hacker', alternate_greetings: '[]' }];
        }
        if (query.includes('FROM chat_summaries')) {
          return [];
        }
        return [];
      });

      crud.getSettings.mockResolvedValue({ provider: 'ollama' });

      // Run syncRagIndex
      const result = await rag.syncRagIndex();
      
      expect(result).toHaveProperty('added');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('deleted');
      
      // Verification
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('checkAndRebuildEmbeddingsIfNeeded', () => {
    it('should detect and handle unaligned Float32Array offsets safely', async () => {
      const buffer = new ArrayBuffer(12);
      const bytes = new Uint8Array(buffer, 2, 8); // Offset 2 is not 4-byte aligned!
      mockDb.select.mockResolvedValueOnce([{ vector: bytes }]);

      crud.getSettings.mockResolvedValue({ provider: 'ollama', selected_model: 'jina-v2-small-en' });
      
      // Should not throw start offset Alignment RangeError
      const result = await rag.checkAndRebuildEmbeddingsIfNeeded();
      expect(result).toBeDefined();
    });

    it('should clear embeddings and return true on dimension mismatch', async () => {
      // Stored vector has 4 dimensions (16 bytes)
      const bytes = new Uint8Array(new Float32Array([1.0, 2.0, 3.0, 4.0]).buffer);
      mockDb.select.mockResolvedValueOnce([{ vector: bytes }]);

      // Expected dimension is 512
      crud.getSettings.mockResolvedValue({ provider: 'ollama', selected_model: 'jina-v2-small-en' });

      const result = await rag.checkAndRebuildEmbeddingsIfNeeded();
      expect(result).toBe(true);
      expect(mockDb.execute).toHaveBeenCalledWith('DELETE FROM embeddings');
    });
  });

  describe('retrieveEmbeddings', () => {
    it('should perform semantic search and filter results', async () => {
      // Force API failure to trigger local Jina WASM fallback (512 dimensions)
      safeFetchModule.safeFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      // Stored vector of size 512
      const floatVec = new Float32Array(512).fill(0.01);
      const bytes = new Uint8Array(floatVec.buffer);
      
      mockDb.select.mockResolvedValueOnce([
        { id: '1', type: 'lore', source_id: '10', title: 'Lore', text: 'Lore text', vector: bytes }
      ]);
      crud.getSettings.mockResolvedValue({ provider: 'ollama', selected_model: 'jina-v2-small-en' });

      const results = await rag.retrieveEmbeddings('query text', 5, { type: 'lore' });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe('Lore');
    });
  });
});
