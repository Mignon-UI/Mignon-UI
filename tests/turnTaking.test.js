import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createTestDb } from './testDbHelper';

let testDb;

mock.module('../src/services/db', () => ({
  getDb: async () => testDb
}));

import { runEfficientSelector } from '../src/services/turnTaking';
import { runCognitiveAuction } from '../src/services/sceneService';
import { runMainThreadEfficientSelector } from '../src/utils/turnTakingMath';
import * as rag from '../src/services/rag';

describe('Turn Taking & Cognitive Auction Tests (Genuine SQLite & Model Engine)', () => {
  beforeEach(() => {
    testDb = createTestDb({ seed: true });

    spyOn(rag, 'embedTexts').mockImplementation(async (texts) => texts.map(() => [0.1, 0.2, 0.3, 0.4, 0.5]));
    spyOn(rag, 'cosineSimilarity').mockReturnValue(0.85);

    // Mock worker to genuinely delegate to main thread math selector without throwing synthetic errors
    spyOn(rag, 'runInWorker').mockImplementation(async (type, payload) => {
      if (type === 'RUN_EFFICIENT_SELECTOR') {
        return runMainThreadEfficientSelector(payload.messageContent, payload.bots, payload.messages, payload.sceneState);
      }
      return null;
    });
  });

  afterEach(() => {
    mock.restore();
  });

  const mockBots = [
    { id: 1, name: 'Lyra Valerius', personality: 'A proud, noble tsundere knight.' },
    { id: 2, name: 'Kaelen Vane', personality: 'A stealthy, quiet kuudere assassin.' },
  ];

  describe('runEfficientSelector', () => {
    it('should return null if no bots are provided', async () => {
      const result = await runEfficientSelector('Hello', [], []);
      expect(result).toBeNull();
    });

    it('should return the only bot ID if bots length is 1', async () => {
      const result = await runEfficientSelector('Hello', [mockBots[0]], []);
      expect(result).toBe(1);
    });

    it('should prioritize direct address by name', async () => {
      const result = await runEfficientSelector('Hey Kaelen, what is your plan?', mockBots, []);
      expect(result).toBe(2);
    });

    it('should run the Efficient selector and choose a speaker when there are multiple options', async () => {
      const messages = [
        { id: 101, sender_type: 'user', sender_name: 'User', content: 'What is our next move?' }
      ];
      const result = await runEfficientSelector('What is our next move?', mockBots, messages);
      expect([1, 2]).toContain(result);
    });
  });

  describe('runCognitiveAuction (Turn Hinting with Real SQLite Scene State)', () => {
    it('should return the only bot ID if bots length is 1', async () => {
      const result = await runCognitiveAuction('single-bot-room', 'Hello', [mockBots[0]], []);
      expect(result).toBe(1);
    });

    it('should select next speaker from scene_state and clear next_speaker_id in SQLite', async () => {
      const roomId = 'hint-room-1';
      await testDb.execute(
        'INSERT INTO chat_sessions (id, name, scene_state) VALUES (?, ?, ?)',
        [roomId, 'Hint Room', JSON.stringify({ next_speaker_id: '2', weather: 'rainy' })]
      );

      const result = await runCognitiveAuction(roomId, 'Hello', mockBots, []);
      expect(result).toBe(2);

      // Verify in SQLite that next_speaker_id was cleanly consumed while preserving other state
      const rows = await testDb.select('SELECT scene_state FROM chat_sessions WHERE id = ?', [roomId]);
      const updatedState = JSON.parse(rows[0].scene_state);
      expect(updatedState.next_speaker_id).toBeUndefined();
      expect(updatedState.weather).toBe('rainy');
    });

    it('should return null when next_speaker_id is set to user and clear tag in SQLite', async () => {
      const roomId = 'user-turn-room';
      await testDb.execute(
        'INSERT INTO chat_sessions (id, name, scene_state) VALUES (?, ?, ?)',
        [roomId, 'User Turn Room', JSON.stringify({ next_speaker_id: 'user' })]
      );

      const result = await runCognitiveAuction(roomId, 'Hello', mockBots, []);
      expect(result).toBeNull();

      const rows = await testDb.select('SELECT scene_state FROM chat_sessions WHERE id = ?', [roomId]);
      const updatedState = JSON.parse(rows[0].scene_state);
      expect(updatedState.next_speaker_id).toBeUndefined();
    });

    it('should fallback to the Efficient selector when next_speaker_id is missing or invalid', async () => {
      const roomId = 'fallback-room';
      await testDb.execute(
        'INSERT INTO chat_sessions (id, name, scene_state) VALUES (?, ?, ?)',
        [roomId, 'Fallback Room', JSON.stringify({ location: 'castle hall' })]
      );

      const result = await runCognitiveAuction(roomId, 'What is our next move?', mockBots, []);
      expect([1, 2]).toContain(result);
    });
  });
});
