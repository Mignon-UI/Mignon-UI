import { describe, it, expect, beforeEach, mock } from 'bun:test';

const mockDbInstance = {
  select: mock(),
  execute: mock()
};

mock.module('../src/services/db', () => ({
  getDb: mock().mockResolvedValue(mockDbInstance)
}));

mock.module('../src/utils/keySecurity', () => ({
  encryptKey: mock(async (key) => `enc::aes256gcm::mocked_${key}`),
  decryptKey: mock(async (key) => key.replace('enc::aes256gcm::mocked_', ''))
}));

import { getDb } from '../src/services/db';
import * as api from '../src/services/api';
import * as crud from '../src/services/crud';

describe('Security & Hashing Audit Tests', () => {
  let mockDb;

  beforeEach(async () => {
    mockDb = await getDb();
    mockDb.select.mockReset();
    mockDb.execute.mockReset();
  });

  describe('API Broker Key Masking', () => {
    it('should mask keys starting with enc:: but preserve other settings', async () => {
      const mockSettings = {
        provider: 'openrouter',
        openrouter_key: 'enc::aes256gcm::12345:67890',
        custom_key: '',
        temperature: 0.7
      };
      mockDb.select.mockResolvedValue([mockSettings]);

      const result = await api.fetchSettings();
      expect(result.openrouter_key).toBe('••••••••••••••••');
      expect(result.provider).toBe('openrouter');
      expect(result.custom_key).toBe('');
      expect(result.temperature).toBe(0.7);
    });

    it('should mask keys in connection profiles list', async () => {
      const mockProfiles = [
        { id: 1, name: 'Profile 1', openrouter_key: 'enc::aes256gcm::123', custom_key: 'enc::aes256gcm::456' },
        { id: 2, name: 'Profile 2', openrouter_key: '', custom_key: 'some_plaintext_key' }
      ];
      mockDb.select.mockResolvedValue(mockProfiles);

      const result = await api.fetchConnectionProfiles();
      expect(result[0].openrouter_key).toBe('••••••••••••••••');
      expect(result[0].custom_key).toBe('••••••••••••••••');
      expect(result[1].openrouter_key).toBe('');
      // custom_key does not start with enc:: in DB (e.g. unencrypted legacy or error state), so it is not masked
      expect(result[1].custom_key).toBe('some_plaintext_key');
    });
  });

  describe('Settings Save Hardening', () => {
    it('should preserve existing keys in database when placeholder is submitted', async () => {
      const mockExisting = {
        id: 1,
        provider: 'openrouter',
        openrouter_key: 'enc::aes256gcm::existing_openrouter_secret',
        custom_key: 'enc::aes256gcm::existing_custom_secret'
      };

      // Mock database returning existing settings when getSettings() is called inside saveSettings
      mockDb.select.mockResolvedValueOnce([mockExisting]); // for getSettings inside saveSettings
      mockDb.select.mockResolvedValueOnce([mockExisting]); // for getSettings final return

      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: '••••••••••••••••',
        custom_key: '••••••••••••••••'
      });

      // Verify database execute was called with existing encrypted keys
      expect(mockDb.execute).toHaveBeenCalled();
      const executeArgs = mockDb.execute.mock.calls[0][1];
      
      // Expected params order: settings.provider, encryptedOpenRouter, encryptedCustom...
      expect(executeArgs[0]).toBe('openrouter');
      expect(executeArgs[1]).toBe('enc::aes256gcm::existing_openrouter_secret');
      expect(executeArgs[2]).toBe('enc::aes256gcm::existing_custom_secret');
    });

    it('should encrypt and save new keys when a plaintext key is submitted', async () => {
      const mockExisting = {
        id: 1,
        provider: 'openrouter',
        openrouter_key: 'enc::aes256gcm::existing_openrouter_secret',
        custom_key: null
      };

      mockDb.select.mockResolvedValueOnce([mockExisting]); // for getSettings inside saveSettings
      mockDb.select.mockResolvedValueOnce([mockExisting]); // for getSettings final return

      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: 'new-plain-text-key-123',
        custom_key: ''
      });

      // Verify database execute was called with newly encrypted openrouter key
      expect(mockDb.execute).toHaveBeenCalled();
      const executeArgs = mockDb.execute.mock.calls[0][1];
      expect(executeArgs[1]).toBe('enc::aes256gcm::mocked_new-plain-text-key-123');
      expect(executeArgs[2]).toBe('');
    });
  });

  describe('Connection Profile Update Hardening', () => {
    it('should synchronize all settings properties into connection_profiles', async () => {
      const mockSettings = {
        provider: 'custom',
        openrouter_key: 'enc::aes256gcm::or_key',
        custom_key: 'enc::aes256gcm::custom_key',
        local_endpoint: 'https://api.openai.com/v1',
        selected_model: 'gpt-4o',
        temperature: 0.85,
        max_tokens: 1024,
        context_limit: 14,
        rag_top_k: 4,
        performance_preset: 'auto',
        system_template: 'System instructions...',
        cloud_rate_limit: 10
      };

      mockDb.select.mockResolvedValueOnce([mockSettings]); // for getSettings inside updateProfile
      mockDb.select.mockResolvedValueOnce([{ id: 42, name: 'My New Name' }]); // for return row

      await crud.updateProfile(42, 'My New Name');

      expect(mockDb.execute).toHaveBeenCalled();
      const sqlQuery = mockDb.execute.mock.calls[0][0];
      const params = mockDb.execute.mock.calls[0][1];

      expect(sqlQuery).toContain('UPDATE connection_profiles SET');
      expect(sqlQuery).toContain('provider = ?');
      expect(sqlQuery).toContain('openrouter_key = ?');
      
      expect(params[0]).toBe('My New Name');
      expect(params[1]).toBe('custom');
      expect(params[2]).toBe('enc::aes256gcm::or_key');
      expect(params[3]).toBe('enc::aes256gcm::custom_key');
      expect(params[4]).toBe('https://api.openai.com/v1');
      expect(params[5]).toBe('gpt-4o');
      expect(params[6]).toBe(0.85);
      expect(params[7]).toBe(1024);
      expect(params[8]).toBe(14);
      expect(params[9]).toBe(4);
      expect(params[10]).toBe('auto');
      expect(params[11]).toBe('System instructions...');
      expect(params[12]).toBe(10);
      expect(params[13]).toBe(42);
    });
  });
});
