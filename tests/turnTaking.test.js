import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runEfficientSelector } from '../src/services/turnTaking';
import { runCognitiveAuction } from '../src/services/sceneService';
import { getDb } from '../src/services/db';

// Mock the db module
vi.mock('../src/services/db', () => {
  const mockDbInstance = {
    select: vi.fn(),
    execute: vi.fn()
  };
  return {
    getDb: vi.fn().mockResolvedValue(mockDbInstance)
  };
});

// Mock the RAG module to run tests offline and fast without loading transformers
vi.mock('../src/services/rag', () => {
  return {
    embedTexts: vi.fn().mockImplementation(async (texts) => {
      return texts.map(() => [0.1, 0.2, 0.3, 0.4, 0.5]);
    }),
    cosineSimilarity: vi.fn().mockReturnValue(0.85),
  };
});

describe('runEfficientSelector', () => {
  const mockBots = [
    { id: 1, name: 'Lyra Valerius', personality: 'A proud, noble tsundere knight.' },
    { id: 2, name: 'Kaelen Vane', personality: 'A stealthy, quiet kuudere assassin.' },
  ];

  it('should return null if no bots are provided', async () => {
    const result = await runEfficientSelector('Hello', [], []);
    expect(result).toBeNull();
  });

  it('should return the only bot ID if bots length is 1', async () => {
    const result = await runEfficientSelector('Hello', [mockBots[0]], []);
    expect(result).toBe(1);
  });

  it('should prioritize direct address by name', async () => {
    // Message directly addresses Kaelen
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

describe('runCognitiveAuction (Turn Hinting)', () => {
  const mockBots = [
    { id: 1, name: 'Lyra Valerius', personality: 'A proud, noble tsundere knight.' },
    { id: 2, name: 'Kaelen Vane', personality: 'A stealthy, quiet kuudere assassin.' },
  ];
  let mockDb;

  beforeEach(async () => {
    mockDb = await getDb();
    vi.clearAllMocks();
  });

  it('should return the only bot ID if bots length is 1', async () => {
    const result = await runCognitiveAuction(1, 'Hello', [mockBots[0]], []);
    expect(result).toBe(1);
  });

  it('should select next speaker from scene_state when next_speaker_id is set to a valid bot', async () => {
    mockDb.select.mockResolvedValue([
      { scene_state: JSON.stringify({ next_speaker_id: "2" }) }
    ]);

    const result = await runCognitiveAuction(1, 'Hello', mockBots, []);
    expect(result).toBe(2);
    
    // Verify that next_speaker_id was deleted/consumed and database was updated
    expect(mockDb.execute).toHaveBeenCalled();
    const executeArgs = mockDb.execute.mock.calls[0][0];
    const params = mockDb.execute.mock.calls[0][1];
    expect(executeArgs).toContain('UPDATE chat_sessions SET scene_state = ?');
    
    const updatedState = JSON.parse(params[0]);
    expect(updatedState.next_speaker_id).toBeUndefined();
  });

  it('should return null when next_speaker_id is set to user', async () => {
    mockDb.select.mockResolvedValue([
      { scene_state: JSON.stringify({ next_speaker_id: "user" }) }
    ]);

    const result = await runCognitiveAuction(1, 'Hello', mockBots, []);
    expect(result).toBeNull();
    
    // Verify that next_speaker_id was deleted/consumed and database was updated
    expect(mockDb.execute).toHaveBeenCalled();
    const executeArgs = mockDb.execute.mock.calls[0][0];
    const params = mockDb.execute.mock.calls[0][1];
    expect(executeArgs).toContain('UPDATE chat_sessions SET scene_state = ?');
    
    const updatedState = JSON.parse(params[0]);
    expect(updatedState.next_speaker_id).toBeUndefined();
  });

  it('should fallback to the Efficient selector when next_speaker_id is missing or invalid', async () => {
    mockDb.select.mockResolvedValue([
      { scene_state: JSON.stringify({}) }
    ]);

    // This should trigger the Efficient fallback and pick one of the active bots
    const result = await runCognitiveAuction(1, 'What is our next move?', mockBots, []);
    expect([1, 2]).toContain(result);
  });
});
