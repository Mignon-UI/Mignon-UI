import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createTestDb } from './testDbHelper';
import { parseSseStream } from '../src/utils/sseParser';

let testDb;

mock.module('../src/services/db', () => ({
  getDb: async () => testDb
}));

mock.module('../src/utils/keySecurity', () => ({
  encryptKey: async (key) => `enc::${key}`,
  decryptKey: async (key) => key.replace('enc::', '')
}));

import * as crud from '../src/services/crud';
import * as llm from '../src/services/llmClient';
import * as rag from '../src/services/rag';
import * as memorySummarizer from '../src/services/memorySummarizer';
import { generateBotResponse, regenerateSwipe } from '../src/services/generationService';

describe('Generation Service (Streaming Orchestration, Rate Limiting & Swipes)', () => {
  beforeEach(() => {
    testDb = createTestDb({ seed: true });
    spyOn(rag, 'retrieveEmbeddings').mockResolvedValue([]);
    spyOn(rag, 'embedTexts').mockResolvedValue([[0.1, 0.2, 0.3]]);
    spyOn(memorySummarizer, 'checkAndGenerateSummary').mockResolvedValue(null);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('Cloud API Rate Limiting', () => {
    it('should throw rate limit error when requests exceed cloud_rate_limit in rate window', async () => {
      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: 'sk-test',
        cloud_rate_limit: 2
      });

      const room = await crud.createRoom({ name: 'Rate Limited Room' });

      spyOn(llm, 'streamLlmResponse').mockImplementation(async (settings, sys, user, onToken) => {
        onToken('response chunk');
      });

      // Request 1: OK
      const res1 = await generateBotResponse(room.id, 1, false, null, 'auto');
      await parseSseStream(res1, () => {});

      // Request 2: OK
      const res2 = await generateBotResponse(room.id, 1, false, null, 'auto');
      await parseSseStream(res2, () => {});

      // Request 3: Should trigger rate limit error in SSE stream
      const res3 = await generateBotResponse(room.id, 1, false, null, 'auto');
      const events = [];
      await parseSseStream(res3, (data) => {
        events.push(JSON.parse(data));
      });

      const errorEvent = events.find(e => e.error);
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain('Rate limit exceeded for cloud API');
    });

    it('should allow unlimited requests when cloud_rate_limit is set to 0', async () => {
      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: 'sk-test',
        cloud_rate_limit: 0 // Unlimited
      });

      const room = await crud.createRoom({ name: 'Unlimited Room' });

      spyOn(llm, 'streamLlmResponse').mockImplementation(async (settings, sys, user, onToken) => {
        onToken('content');
      });

      // Execute 3 requests without being rate-limited
      for (let i = 0; i < 3; i++) {
        const res = await generateBotResponse(room.id, 1, false, null, 'auto');
        const events = [];
        await parseSseStream(res, (data) => events.push(JSON.parse(data)));
        expect(events.some(e => e.error)).toBe(false);
      }
    });
  });

  describe('generateBotResponse Stream Assembly & SQLite Persistence', () => {
    it('should stream bot_start, token, and done events and persist message to SQLite', async () => {
      const chars = await crud.getCharacters();
      const bot = chars[0];

      const room = await crud.createRoom({
        name: 'Streaming Test Room',
        character_ids: [bot.id]
      });

      // Add user message to provide conversational context
      await crud.createMessage({
        room_id: room.id,
        sender_type: 'user',
        character_id: null,
        sender_name: 'Arthur',
        content: 'Greetings, knight.'
      });

      spyOn(llm, 'streamLlmResponse').mockImplementation(async (settings, sys, user, onToken) => {
        onToken('*draws sword* ');
        onToken('State your name, traveler.');
      });

      const response = await generateBotResponse(room.id, bot.id, false, null, 'auto');
      expect(response).toBeDefined();
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');

      const parsedEvents = [];
      await parseSseStream(response, (raw) => {
        parsedEvents.push(JSON.parse(raw));
      });

      // Verify SSE events sequence
      const botStart = parsedEvents.find(e => e.bot_start);
      expect(botStart).toBeDefined();
      expect(botStart.bot_start.character_id).toBe(bot.id);
      expect(botStart.bot_start.name).toBe(bot.name);

      const tokens = parsedEvents.filter(e => e.token).map(e => e.token);
      expect(tokens.join('')).toBe('*draws sword* State your name, traveler.');

      const doneEvent = parsedEvents.find(e => e.done);
      expect(doneEvent).toBeDefined();
      expect(doneEvent.done.message_id).toBeDefined();

      // Verify genuine persistence in SQLite
      const messages = await crud.getRoomMessages(room.id);
      const generatedMsg = messages.find(m => m.id === doneEvent.done.message_id);

      expect(generatedMsg).toBeDefined();
      expect(generatedMsg.sender_name).toBe(bot.name);
      expect(generatedMsg.content).toBe('*draws sword* State your name, traveler.');
      expect(generatedMsg.swipes).toEqual(['*draws sword* State your name, traveler.']);
      expect(generatedMsg.active_swipe_index).toBe(0);
    });

    it('should halt chain and yield floor to user if bots spoke >= 3 times consecutively', async () => {
      const chars = await crud.getCharacters();
      const bot = chars[0];

      const room = await crud.createRoom({
        name: 'Floor Yield Room',
        is_group: true,
        character_ids: [bot.id]
      });

      // Insert 3 consecutive character messages with no user message in between
      for (let i = 1; i <= 3; i++) {
        await crud.createMessage({
          room_id: room.id,
          sender_type: 'character',
          character_id: bot.id,
          sender_name: bot.name,
          content: `Consecutive bot statement ${i}`
        });
      }

      const response = await generateBotResponse(room.id, bot.id, true, null, 'auto');
      const parsedEvents = [];
      await parseSseStream(response, (raw) => parsedEvents.push(JSON.parse(raw)));

      // Should immediately emit chain_done and not generate new message
      const chainDone = parsedEvents.find(e => e.chain_done);
      expect(chainDone).toBeDefined();
      expect(chainDone.chain_done).toBe(true);

      const tokens = parsedEvents.filter(e => e.token);
      expect(tokens).toHaveLength(0);
    });

    it('should emit error event for non-existent room ID', async () => {
      const response = await generateBotResponse('non-existent-room-id', 1, false, null, 'auto');
      const events = [];
      await parseSseStream(response, (raw) => events.push(JSON.parse(raw)));

      const errorEvent = events.find(e => e.error);
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toBe('Room not found');
    });
  });

  describe('regenerateSwipe', () => {
    it('should append new swipe to existing message in SQLite and update active_swipe_index', async () => {
      const chars = await crud.getCharacters();
      const bot = chars[0];

      const room = await crud.createRoom({
        name: 'Swipe Test Room',
        character_ids: [bot.id]
      });

      const initialMsg = await crud.createMessage({
        room_id: room.id,
        sender_type: 'character',
        character_id: bot.id,
        sender_name: bot.name,
        content: 'Original greeting swipe.',
        swipes: ['Original greeting swipe.'],
        active_swipe_index: 0
      });

      spyOn(llm, 'streamLlmResponse').mockImplementation(async (settings, sys, user, onToken) => {
        onToken('Alternative ');
        onToken('regenerated swipe.');
      });

      const streamedTokens = [];
      const result = await regenerateSwipe(
        room.id,
        initialMsg.id,
        (token) => streamedTokens.push(token)
      );

      expect(result.done).toBe(true);
      expect(result.message_id).toBe(initialMsg.id);
      expect(result.content).toBe('Alternative regenerated swipe.');
      expect(result.active_swipe_index).toBe(1);
      expect(streamedTokens.join('')).toBe('Alternative regenerated swipe.');

      // Verify in SQLite that swipes array has both options and active index is 1
      const updatedMessages = await crud.getRoomMessages(room.id);
      const updated = updatedMessages.find(m => m.id === initialMsg.id);

      expect(updated.swipes).toEqual([
        'Original greeting swipe.',
        'Alternative regenerated swipe.'
      ]);
      expect(updated.active_swipe_index).toBe(1);
      expect(updated.content).toBe('Alternative regenerated swipe.');
    });

    it('should throw error when message ID does not exist', async () => {
      await expect(
        regenerateSwipe('some-room', 999999, () => {})
      ).rejects.toThrow('Message not found');
    });
  });
});
