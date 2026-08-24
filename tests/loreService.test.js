import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { importWorldInfo, updateWorld } from '../src/services/loreService';
import * as crud from '../src/services/crud';
import * as rag from '../src/services/rag';

describe('loreService Tests', () => {
  beforeEach(() => {
    spyOn(crud, 'createWorld').mockImplementation(async (w) => ({ id: 42, name: w.name, description: w.description }));
    spyOn(crud, 'createLore').mockImplementation(async (l) => ({ id: 100, ...l }));
    spyOn(crud, 'updateWorld').mockImplementation(async (id, w) => ({ id, name: w.name, description: w.description }));
    spyOn(rag, 'saveEmbedding').mockResolvedValue();
    crud.createWorld.mockClear();
    crud.createLore.mockClear();
    crud.updateWorld.mockClear();
    rag.saveEmbedding.mockClear();
  });

  afterEach(() => {
    mock.restore();
  });

  describe('importWorldInfo', () => {
    it('should successfully create a world and populate lore entries with RAG embeddings', async () => {
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

      const result = await importWorldInfo('TestWorld.json', mockJson);
      
      // Verify world creation
      expect(crud.createWorld).toHaveBeenCalledWith({
        name: 'TestWorld',
        description: 'Imported from TestWorld.json'
      });
      expect(result).toEqual({ id: 42, name: 'TestWorld', description: 'Imported from TestWorld.json' });

      // Verify lore entries creation
      expect(crud.createLore).toHaveBeenCalledTimes(2);
      expect(crud.createLore).toHaveBeenNthCalledWith(1, {
        world_id: 42,
        title: 'Core World Law',
        keys: 'world, setting',
        content: 'This is a test world content.',
        weight: 1000,
        is_active: true
      });

      // Verify RAG embeddings save
      expect(rag.saveEmbedding).toHaveBeenCalledTimes(2);
    });

    it('should handle empty/missing entries gracefully', async () => {
      const result = await importWorldInfo('EmptyWorld.json', null);
      expect(crud.createWorld).toHaveBeenCalledWith({
        name: 'EmptyWorld',
        description: 'Imported from EmptyWorld.json'
      });
      expect(crud.createLore).not.toHaveBeenCalled();
      expect(rag.saveEmbedding).not.toHaveBeenCalled();
      expect(result.name).toBe('EmptyWorld');
    });
  });

  describe('updateWorld', () => {
    it('should call crud.updateWorld with correct arguments', async () => {
      const result = await updateWorld(42, { name: 'NewName', description: 'NewDesc' });
      expect(crud.updateWorld).toHaveBeenCalledWith(42, { name: 'NewName', description: 'NewDesc' });
      expect(result).toEqual({ id: 42, name: 'NewName', description: 'NewDesc' });
    });
  });
});
