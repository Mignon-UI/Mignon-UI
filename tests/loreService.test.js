import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { createTestDb } from './testDbHelper';

let testDb;

mock.module('../src/services/db', () => ({
  getDb: async () => testDb
}));

import { importWorldInfo, updateWorld, deleteWorld, fetchWorlds } from '../src/services/loreService';
import * as crud from '../src/services/crud';
import * as rag from '../src/services/rag';

describe('loreService Tests (Genuine SQLite & RAG Integration)', () => {
  beforeEach(() => {
    testDb = createTestDb({ seed: true });
    spyOn(rag, 'saveEmbedding').mockResolvedValue();
    spyOn(rag, 'clearEmbeddings').mockResolvedValue();
    spyOn(rag, 'deleteEmbedding').mockResolvedValue();
  });

  afterEach(() => {
    mock.restore();
  });

  describe('importWorldInfo', () => {
    it('should create world in SQLite and populate lore entries with RAG vector indexing', async () => {
      const mockJson = {
        entries: {
          "0": {
            uid: 0,
            key: ["world", "setting"],
            comment: "Core World Law",
            content: "This is a test world content.",
            order: 1000
          },
          "1": {
            uid: 1,
            key: ["child"],
            content: "Another content.",
            order: 850
          }
        }
      };

      const world = await importWorldInfo('TestWorld.json', mockJson);
      
      expect(world).toBeDefined();
      expect(world.name).toBe('TestWorld');
      expect(world.description).toBe('Imported from TestWorld.json');

      // Verify the world actually exists in SQLite
      const worlds = await fetchWorlds();
      expect(worlds.some(w => w.id === world.id)).toBe(true);

      // Verify lore entries were created in SQLite
      const lores = await crud.getLore();
      const worldLores = lores.filter(l => l.world_id === world.id);
      expect(worldLores.length).toBe(2);

      const law = worldLores.find(l => l.title === 'Core World Law');
      expect(law).toBeDefined();
      expect(law.keys).toBe('world, setting');
      expect(law.content).toBe('This is a test world content.');
      expect(law.weight).toBe(1000);
      expect(law.is_active).toBe(true);

      // Verify RAG vector embeddings were queued for indexing
      expect(rag.saveEmbedding).toHaveBeenCalledTimes(2);
      expect(rag.saveEmbedding).toHaveBeenCalledWith(
        `lore_${law.id}`,
        'lore',
        String(world.id),
        'Core World Law',
        '[LORE: Core World Law]\nTrigger keywords: world, setting\n\nThis is a test world content.'
      );
    });

    it('should handle empty or null entries without errors', async () => {
      const world = await importWorldInfo('EmptyWorld.json', null);
      expect(world.name).toBe('EmptyWorld');
      expect(rag.saveEmbedding).not.toHaveBeenCalled();

      const worlds = await fetchWorlds();
      expect(worlds.some(w => w.id === world.id)).toBe(true);
    });
  });

  describe('updateWorld & deleteWorld', () => {
    it('should update world details in SQLite', async () => {
      const world = await crud.createWorld({ name: 'Initial World', description: 'Desc 1' });
      const updated = await updateWorld(world.id, { name: 'Renamed World', description: 'Desc 2' });

      expect(updated.name).toBe('Renamed World');
      expect(updated.description).toBe('Desc 2');

      const worlds = await fetchWorlds();
      const match = worlds.find(w => w.id === world.id);
      expect(match.name).toBe('Renamed World');
    });

    it('should delete world and clear its RAG vector embeddings', async () => {
      const world = await crud.createWorld({ name: 'Disposable World' });
      await deleteWorld(world.id);

      expect(rag.clearEmbeddings).toHaveBeenCalledWith('lore', String(world.id));

      const worlds = await fetchWorlds();
      expect(worlds.some(w => w.id === world.id)).toBe(false);
    });
  });
});
