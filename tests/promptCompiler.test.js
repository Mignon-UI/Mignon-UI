import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { createTestDb } from './testDbHelper';

let testDb;

mock.module('../src/services/db', () => ({
  getDb: async () => testDb
}));

import * as rag from '../src/services/rag';
import {
  compileSystemPrompt,
  compileJointMultiAgentPrompt,
  formatChatHistory
} from '../src/services/promptCompiler';

describe('Prompt Compiler Service Tests (Genuine SQLite & Prompt Assembly)', () => {
  beforeEach(() => {
    testDb = createTestDb({ seed: true });

    spyOn(rag, 'retrieveEmbeddings').mockResolvedValue([
      {
        id: 'lore_1',
        type: 'lore',
        source_id: '1',
        title: 'Ancient Citadel',
        text: '[LORE: Ancient Citadel]\nTrigger keywords: citadel, fortress\n\nA skybound stone fortress.',
        _distance: 0.15
      }
    ]);
    spyOn(rag, 'embedTexts').mockResolvedValue([[0.1, 0.2, 0.3]]);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('compileSystemPrompt', () => {
    it('should assemble a complete system prompt with bot profile, scenario, persona, and system directives', async () => {
      const roomId = 'room-sys-100';

      // Insert real chat session with scene_state in SQLite
      await testDb.execute(
        `INSERT INTO chat_sessions (id, name, description, scene_state) VALUES (?, ?, ?, ?)`,
        [
          roomId,
          'Garrison Gate',
          'The ancient stone garrison.',
          JSON.stringify({
            environment: { location: 'Gatehouse', atmosphere: 'Thunderous rain' },
            '1': { name: 'Lyra', location: 'Gatehouse', action: 'Polishing armor', mood: 'stern' },
            '2': { name: 'Kaelen', location: 'Rafters', action: 'Observing silently', mood: 'focused' },
            active_motivation: 'Secure the gate before sundown'
          })
        ]
      );

      // Link members (Lyra = 1, Kaelen = 2 from seeded characters)
      await testDb.execute(`INSERT INTO room_members (room_id, character_id) VALUES (?, ?)`, [roomId, 1]);
      await testDb.execute(`INSERT INTO room_members (room_id, character_id) VALUES (?, ?)`, [roomId, 2]);

      // Insert message for context
      await testDb.execute(
        `INSERT INTO messages (room_id, sender_type, character_id, sender_name, content) VALUES (?, ?, ?, ?, ?)`,
        [roomId, 'user', null, 'User', 'Is the perimeter secure?']
      );

      const targetBot = {
        id: 1,
        name: 'Lyra',
        personality: 'A proud tsundere knight who wields a broadsword.',
        scenario: 'Guarding the north gate in heavy rain.',
        system_prompt: 'Roleplay strictly as Lyra.',
        world_id: 10
      };

      const settings = {
        persona_name: 'Arthur',
        persona_description: 'A novice squire trying his best.',
        context_limit: 10,
        rag_top_k: 3
      };

      const prompt = await compileSystemPrompt(roomId, targetBot, settings);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Roleplay strictly as Lyra.');
      expect(prompt).toContain('<character_profile>');
      expect(prompt).toContain('<name>Lyra</name>');
      expect(prompt).toContain('A proud tsundere knight');
      expect(prompt).toContain('<global_room_scenario>');
      expect(prompt).toContain('The ancient stone garrison.');
      expect(prompt).toContain('<group_chat_members>');
      expect(prompt).toContain('<name>Kaelen Vane</name>');
      expect(prompt).toContain('<player_persona>');
      expect(prompt).toContain('<name>Arthur</name>');
      expect(prompt).toContain('A novice squire trying his best.');
      expect(prompt).toContain('<active_scene_board>');
      expect(prompt).toContain('<location>Gatehouse</location>');
      expect(prompt).toContain('<atmosphere>Thunderous rain</atmosphere>');
      expect(prompt).toContain('Secure the gate before sundown');
      expect(prompt).toContain('<directive>You are now roleplaying strictly and only as [Lyra].');
      expect(prompt).toContain('Do not write dialogue, actions, or reactions for other characters: Kaelen Vane.');
      expect(prompt).toContain('Do not write dialogue, actions, thoughts, or decisions for the User (Arthur).');
    });
  });

  describe('compileJointMultiAgentPrompt', () => {
    it('should assemble candidate roster and multi-agent coordinator directives from real database', async () => {
      const roomId = 'room-joint-200';
      await testDb.execute(
        `INSERT INTO chat_sessions (id, name, description) VALUES (?, ?, ?)`,
        [roomId, 'Command Post', 'Command Tent']
      );

      const candidates = [
        { id: 1, name: 'Lyra', personality: 'Knight', scenario: 'Gatehouse', system_prompt: 'Coordinator prompt' },
        { id: 2, name: 'Kaelen', personality: 'Assassin', scenario: 'Rafters' }
      ];

      const settings = {
        persona_name: 'Commander',
        context_limit: 10,
        rag_top_k: 2
      };

      const prompt = await compileJointMultiAgentPrompt(roomId, candidates, settings);

      expect(prompt).toContain('<candidate_roster>');
      expect(prompt).toContain('<character id="1">');
      expect(prompt).toContain('<name>Lyra</name>');
      expect(prompt).toContain('<character id="2">');
      expect(prompt).toContain('<name>Kaelen</name>');
      expect(prompt).toContain('<directive>You are the Collective Mind Coordinator');
      expect(prompt).toContain('<selected_speaker id="CHOSEN_CHARACTER_ID">');
      expect(prompt).toContain('<next_speaker id="NEXT_CHARACTER_ID">');
    });
  });

  describe('formatChatHistory', () => {
    it('should format real SQLite chat messages, resolving persona name and active swipe index', async () => {
      const roomId = 'room-hist-300';
      await testDb.execute(`INSERT INTO chat_sessions (id, name) VALUES (?, ?)`, [roomId, 'History Room']);
      await testDb.execute(`INSERT INTO room_members (room_id, character_id) VALUES (?, ?)`, [roomId, 1]);

      // Message 1: User
      await testDb.execute(
        `INSERT INTO messages (room_id, sender_type, character_id, sender_name, content, swipes, active_swipe_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [roomId, 'user', null, 'User', 'Hello Lyra.', null, 0]
      );

      // Message 2: Bot with swipes (active index = 1)
      await testDb.execute(
        `INSERT INTO messages (room_id, sender_type, character_id, sender_name, content, swipes, active_swipe_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          roomId,
          'character',
          1,
          'Lyra Valerius',
          'Default greeting.',
          JSON.stringify(['Default greeting.', '*nods curtly* What do you need, Arthur?']),
          1
        ]
      );

      // Message 3: User
      await testDb.execute(
        `INSERT INTO messages (room_id, sender_type, character_id, sender_name, content, swipes, active_swipe_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [roomId, 'user', null, 'User', 'Can you teach me swordplay?', null, 0]
      );

      const targetBot = { id: 1, name: 'Lyra Valerius', post_history_instructions: 'Keep responses under 3 sentences.' };
      const settings = { persona_name: 'Arthur', context_limit: 10 };

      const history = await formatChatHistory(roomId, targetBot, settings);

      expect(history).toContain('Arthur: Hello Lyra.');
      expect(history).toContain('Lyra Valerius: *nods curtly* What do you need, Arthur?');
      expect(history).toContain('Arthur: Can you teach me swordplay?');
      expect(history).toContain('(Lyra Valerius is now responding to Arthur...)');
      expect(history).toContain('Keep responses under 3 sentences.');
    });
  });
});
