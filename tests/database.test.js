import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDb } from '../src/services/db';

// Mock getDb in src/services/db.js inside the hoisted vi.mock block
vi.mock('../src/services/db', () => {
  const mockDbInstance = {
    select: vi.fn(),
    execute: vi.fn()
  };
  return {
    getDb: vi.fn().mockResolvedValue(mockDbInstance)
  };
});

// Mock encryptKey/decryptKey in src/services/llmClient.js
vi.mock('../src/services/llmClient', () => {
  return {
    encryptKey: vi.fn().mockImplementation(async (key) => `enc::aes256gcm::mocked_${key}`),
    decryptKey: vi.fn().mockImplementation(async (key) => key.replace('enc::aes256gcm::mocked_', ''))
  };
});

import * as crud from '../src/services/crud';

describe('Database CRUD Operations Tests', () => {
  let mockDb;

  beforeEach(async () => {
    mockDb = await getDb();
    vi.clearAllMocks();
  });

  describe('Settings CRUD', () => {
    it('should retrieve settings row 1', async () => {
      const mockSettings = { id: 1, provider: 'ollama', temperature: 0.9 };
      mockDb.select.mockResolvedValue([mockSettings]);

      const result = await crud.getSettings();
      expect(mockDb.select).toHaveBeenCalledWith('SELECT * FROM settings WHERE id = 1');
      expect(result).toEqual(mockSettings);
    });

    it('should encrypt new keys on saveSettings', async () => {
      const mockExisting = { id: 1, openrouter_key: 'enc::old', custom_key: 'enc::custom' };
      mockDb.select.mockResolvedValue([mockExisting]);

      await crud.saveSettings({
        provider: 'ollama',
        openrouter_key: 'new-plain-key',
        custom_key: '••••••••••••••••'
      });

      expect(mockDb.execute).toHaveBeenCalled();
      const executeArgs = mockDb.execute.mock.calls[0][1];
      // Param 1 (openrouter_key) should be encrypted, Param 2 (custom_key) should remain old key
      expect(executeArgs[1]).toBe('enc::aes256gcm::mocked_new-plain-key');
      expect(executeArgs[2]).toBe('enc::custom');
    });
  });

  describe('Connection Profiles CRUD', () => {
    it('should fetch connection profiles ordered by name', async () => {
      const mockProfiles = [{ id: 1, name: 'Profile A' }];
      mockDb.select.mockResolvedValue(mockProfiles);

      const result = await crud.getProfiles();
      expect(mockDb.select).toHaveBeenCalledWith('SELECT * FROM connection_profiles ORDER BY name ASC');
      expect(result).toEqual(mockProfiles);
    });

    it('should duplicate current settings when creating profile', async () => {
      const mockSettings = { provider: 'openrouter', temperature: 0.8, openrouter_key: 'enc::key' };
      mockDb.select.mockResolvedValueOnce([mockSettings]); // for getSettings
      mockDb.select.mockResolvedValueOnce([{ id: 2, name: 'New Profile' }]); // for final return

      const result = await crud.createProfile('New Profile');
      expect(mockDb.execute).toHaveBeenCalled();
      const execArgs = mockDb.execute.mock.calls[0][1];
      expect(execArgs[0]).toBe('New Profile');
      expect(execArgs[1]).toBe('openrouter');
      expect(execArgs[2]).toBe('enc::key');
      expect(result.name).toBe('New Profile');
    });

    it('should update profile and delete profile', async () => {
      mockDb.select.mockResolvedValueOnce([{ id: 1 }]); // getSettings
      mockDb.select.mockResolvedValueOnce([{ id: 2, name: 'Updated' }]); // return profile
      
      const updated = await crud.updateProfile(2, 'Updated');
      expect(mockDb.execute).toHaveBeenCalled();
      expect(updated.name).toBe('Updated');

      await crud.deleteProfile(2);
      expect(mockDb.execute).toHaveBeenLastCalledWith('DELETE FROM connection_profiles WHERE id = ?', [2]);
    });
  });

  describe('Characters CRUD', () => {
    it('should retrieve and deserialize character rows', async () => {
      const mockChar = {
        id: 5,
        name: 'Aria',
        nsfw_inject: 1,
        alternate_greetings: '["Greeting A", "Greeting B"]'
      };
      mockDb.select.mockResolvedValue([mockChar]);

      const result = await crud.getCharacters();
      expect(result.length).toBe(1);
      expect(result[0].nsfw_inject).toBe(true);
      expect(result[0].alternate_greetings).toEqual(['Greeting A', 'Greeting B']);
    });

    it('should handle malformed JSON in alternate_greetings gracefully', async () => {
      const mockCorruptChar = {
        id: 6,
        name: 'Corrupt',
        nsfw_inject: 0,
        alternate_greetings: '{bad-json'
      };
      mockDb.select.mockResolvedValue([mockCorruptChar]);

      const result = await crud.getCharacters();
      expect(result.length).toBe(1);
      expect(result[0].alternate_greetings).toEqual([]);
      expect(result[0].nsfw_inject).toBe(false);
    });
  });

  describe('Rooms and Messages CRUD', () => {
    it('should calculate is_group dynamically based on bot member count', async () => {
      mockDb.select.mockResolvedValueOnce({ persona_character_id: 10 }); // getSettings
      mockDb.select.mockResolvedValueOnce([
        { character_id: 10 }, // persona user
        { character_id: 11 }, // bot 1
        { character_id: 12 }  // bot 2
      ]); // room members
      mockDb.select.mockResolvedValueOnce([]); // getRooms return list

      await crud.addRoomMember('room-abc', 12);
      
      // Since 2 bots exist (excluding persona 10), is_group should be updated to 1
      expect(mockDb.execute).toHaveBeenCalledWith(
        'UPDATE chat_sessions SET is_group = ? WHERE id = ?',
        [1, 'room-abc']
      );
    });

    it('should parse message swipes JSON safely', async () => {
      const mockMsg = {
        id: 20,
        room_id: 'room-1',
        swipes: '["Swipe 1", "Swipe 2"]'
      };
      mockDb.select.mockResolvedValue([mockMsg]);

      const messages = await crud.getRoomMessages('room-1');
      expect(messages[0].swipes).toEqual(['Swipe 1', 'Swipe 2']);
    });

    it('should handle corrupt/missing swipes JSON gracefully', async () => {
      const mockMsg = {
        id: 21,
        room_id: 'room-1',
        swipes: null
      };
      mockDb.select.mockResolvedValue([mockMsg]);

      const messages = await crud.getRoomMessages('room-1');
      expect(messages[0].swipes).toEqual([]);
    });

    it('should copy all messages and summaries in branchRoom', async () => {
      mockDb.select.mockResolvedValueOnce([{ id: 'room-1', name: 'Original', is_group: 0 }]); // room
      mockDb.select.mockResolvedValueOnce([{ character_id: 3 }]); // members
      mockDb.select.mockResolvedValueOnce([
        { id: 100, sender_type: 'user', content: 'Hi', swipes: '[]', created_at: '2026' }
      ]); // messages to copy
      mockDb.select.mockResolvedValueOnce([{ id: 10 }]); // last inserted msg ID
      mockDb.select.mockResolvedValueOnce([
        { id: 50, summary_text: 'Summary', start_message_id: 100, end_message_id: 100 }
      ]); // summaries
      mockDb.select.mockResolvedValueOnce([]); // final getRooms return

      const result = await crud.branchRoom('room-1', 100);
      expect(result).toHaveProperty('room');
      // Verify message copy query was run
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });
});
