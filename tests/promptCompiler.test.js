import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { getDb } from '../src/services/db';
import * as rag from '../src/services/rag';
import {
  compileSystemPrompt,
  compileJointMultiAgentPrompt,
  formatChatHistory
} from '../src/services/promptCompiler';

describe('Prompt Compiler Service Tests', () => {
  let mockDb;

  beforeEach(async () => {
    mockDb = await getDb();
    mockDb.select.mockReset();
    mockDb.execute.mockReset();
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

      // Mock DB calls in compileSystemPrompt:
      // 1. Room members
      // 2. Load characters in room
      // 3. Room details (description, scene_state)
      // 4. Messages for RAG context
      // 5. Keyword lore queries
      mockDb.select.mockImplementation(async (sql) => {
        if (sql.includes('FROM room_members')) {
          return [{ character_id: 1 }, { character_id: 2 }];
        }
        if (sql.includes('FROM characters WHERE id IN')) {
          return [
            { id: 1, name: 'Lyra', personality: 'A proud tsundere knight.' },
            { id: 2, name: 'Kaelen', personality: 'A quiet assassin.' }
          ];
        }
        if (sql.includes('FROM chat_sessions WHERE id = ?')) {
          return [
            {
              description: 'The ancient stone garrison.',
              scene_state: JSON.stringify({
                environment: { location: 'Gatehouse', atmosphere: 'Thunderous rain' },
                '1': { name: 'Lyra', location: 'Gatehouse', action: 'Polishing armor', mood: 'stern' },
                '2': { name: 'Kaelen', location: 'Rafters', action: 'Observing silently', mood: 'focused' },
                active_motivation: 'Secure the gate before sundown'
              })
            }
          ];
        }
        if (sql.includes('FROM messages WHERE room_id = ?')) {
          return [
            { id: 1, content: 'Is the perimeter secure?', swipes: null, active_swipe_index: 0 }
          ];
        }
        if (sql.includes('FROM lore_entries WHERE is_active = 1')) {
          return [];
        }
        return [];
      });

      const prompt = await compileSystemPrompt(100, targetBot, settings);

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Roleplay strictly as Lyra.');
      expect(prompt).toContain('<character_profile>');
      expect(prompt).toContain('<name>Lyra</name>');
      expect(prompt).toContain('A proud tsundere knight');
      expect(prompt).toContain('<global_room_scenario>');
      expect(prompt).toContain('The ancient stone garrison.');
      expect(prompt).toContain('<group_chat_members>');
      expect(prompt).toContain('<name>Kaelen</name>');
      expect(prompt).toContain('<player_persona>');
      expect(prompt).toContain('<name>Arthur</name>');
      expect(prompt).toContain('A novice squire trying his best.');
      expect(prompt).toContain('<active_scene_board>');
      expect(prompt).toContain('<location>Gatehouse</location>');
      expect(prompt).toContain('<atmosphere>Thunderous rain</atmosphere>');
      expect(prompt).toContain('Secure the gate before sundown');
      expect(prompt).toContain('<directive>You are now roleplaying strictly and only as [Lyra].');
      expect(prompt).toContain('Do not write dialogue, actions, or reactions for other characters: Kaelen.');
      expect(prompt).toContain('Do not write dialogue, actions, thoughts, or decisions for the User (Arthur).');
    });
  });

  describe('compileJointMultiAgentPrompt', () => {
    it('should assemble candidate roster and multi-agent coordinator directives', async () => {
      const candidates = [
        { id: 1, name: 'Lyra', personality: 'Knight', scenario: 'Gatehouse', system_prompt: 'Coordinator prompt' },
        { id: 2, name: 'Kaelen', personality: 'Assassin', scenario: 'Rafters' }
      ];

      const settings = {
        persona_name: 'Commander',
        context_limit: 10,
        rag_top_k: 2
      };

      mockDb.select.mockImplementation(async (sql) => {
        if (sql.includes('FROM chat_sessions WHERE id = ?')) {
          return [{ description: 'Command Tent', scene_state: null }];
        }
        if (sql.includes('FROM messages WHERE room_id = ?')) {
          return [];
        }
        return [];
      });

      const prompt = await compileJointMultiAgentPrompt(200, candidates, settings);

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
    it('should correctly format chat messages, resolving user persona name and active swipe index', async () => {
      const targetBot = { id: 1, name: 'Lyra', post_history_instructions: 'Keep responses under 3 sentences.' };
      const settings = { persona_name: 'Arthur', context_limit: 10 };

      mockDb.select.mockImplementation(async (sql) => {
        if (sql.includes('FROM messages WHERE room_id = ?')) {
          return [
            {
              id: 1,
              sender_type: 'user',
              sender_name: 'User',
              content: 'Hello Lyra.',
              swipes: null,
              active_swipe_index: 0
            },
            {
              id: 2,
              sender_type: 'character',
              character_id: 1,
              sender_name: 'Lyra',
              content: 'Default greeting.',
              swipes: JSON.stringify(['Default greeting.', '*nods curtly* What do you need, Arthur?']),
              active_swipe_index: 1
            },
            {
              id: 3,
              sender_type: 'user',
              sender_name: 'User',
              content: 'Can you teach me swordplay?',
              swipes: null,
              active_swipe_index: 0
            }
          ];
        }
        if (sql.includes('FROM room_members WHERE room_id = ?')) {
          return [{ character_id: 1 }];
        }
        if (sql.includes('FROM characters WHERE id IN')) {
          return [{ id: 1, name: 'Lyra' }];
        }
        return [];
      });

      const history = await formatChatHistory(300, targetBot, settings);

      expect(history).toContain('Arthur: Hello Lyra.');
      expect(history).toContain('Lyra: *nods curtly* What do you need, Arthur?');
      expect(history).toContain('Arthur: Can you teach me swordplay?');
      expect(history).toContain('(Lyra is now responding to Arthur...)');
      expect(history).toContain('Keep responses under 3 sentences.');
    });
  });
});
