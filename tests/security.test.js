import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createTestDb } from './testDbHelper';

let testDb;

mock.module('../src/services/db', () => ({
  getDb: async () => testDb
}));

mock.module('../src/utils/keySecurity', () => ({
  encryptKey: async (key) => `enc::aes256gcm::${key}`,
  decryptKey: async (key) => key.replace('enc::aes256gcm::', '')
}));

import * as api from '../src/services/api';
import * as crud from '../src/services/crud';

describe('Security & Hashing Audit Tests (Genuine SQLite & Masking Verification)', () => {
  beforeEach(() => {
    testDb = createTestDb({ seed: true });
  });

  describe('API Broker Key Masking', () => {
    it('should mask keys starting with enc:: but preserve other settings', async () => {
      await testDb.execute(
        `UPDATE settings SET provider = ?, openrouter_key = ?, custom_key = ?, temperature = ? WHERE id = 1`,
        ['openrouter', 'enc::aes256gcm::12345:67890', '', 0.7]
      );

      const result = await api.fetchSettings();
      expect(result.openrouter_key).toBe('••••••••••••••••');
      expect(result.provider).toBe('openrouter');
      expect(result.custom_key).toBe('');
      expect(result.temperature).toBe(0.7);
    });

    it('should mask keys in connection profiles list', async () => {
      await testDb.execute(
        `INSERT INTO connection_profiles (name, provider, openrouter_key, custom_key)
         VALUES ('Profile 1', 'openrouter', 'enc::aes256gcm::123', 'enc::aes256gcm::456')`
      );
      await testDb.execute(
        `INSERT INTO connection_profiles (name, provider, openrouter_key, custom_key)
         VALUES ('Profile 2', 'custom', '', 'some_plaintext_key')`
      );

      const profiles = await api.fetchConnectionProfiles();
      const p1 = profiles.find(p => p.name === 'Profile 1');
      const p2 = profiles.find(p => p.name === 'Profile 2');

      expect(p1.openrouter_key).toBe('••••••••••••••••');
      expect(p1.custom_key).toBe('••••••••••••••••');
      expect(p2.openrouter_key).toBe('');
      // custom_key does not start with enc:: in DB (e.g. unencrypted legacy or error state), so it is not masked
      expect(p2.custom_key).toBe('some_plaintext_key');
    });
  });

  describe('Settings Save Hardening', () => {
    it('should preserve existing keys in database when placeholder is submitted', async () => {
      await testDb.execute(
        `UPDATE settings SET provider = ?, openrouter_key = ?, custom_key = ? WHERE id = 1`,
        ['openrouter', 'enc::aes256gcm::existing_openrouter_secret', 'enc::aes256gcm::existing_custom_secret']
      );

      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: '••••••••••••••••',
        custom_key: '••••••••••••••••'
      });

      // Verify directly from SQLite
      const rows = await testDb.select('SELECT openrouter_key, custom_key FROM settings WHERE id = 1');
      expect(rows[0].openrouter_key).toBe('enc::aes256gcm::existing_openrouter_secret');
      expect(rows[0].custom_key).toBe('enc::aes256gcm::existing_custom_secret');
    });

    it('should encrypt and save new keys when a plaintext key is submitted', async () => {
      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: 'new-plain-text-key-123',
        custom_key: ''
      });

      // Verify directly from SQLite that key was encrypted with prefix
      const rows = await testDb.select('SELECT openrouter_key, custom_key FROM settings WHERE id = 1');
      expect(rows[0].openrouter_key).toBe('enc::aes256gcm::new-plain-text-key-123');
      expect(rows[0].custom_key).toBe('');
    });
  });

  describe('Connection Profile Update Hardening', () => {
    it('should synchronize all settings properties into connection_profiles in SQLite', async () => {
      await crud.saveSettings({
        provider: 'custom',
        openrouter_key: 'or_plain_key',
        custom_key: 'custom_plain_key',
        local_endpoint: 'https://api.openai.com/v1',
        selected_model: 'gpt-4o',
        temperature: 0.85,
        max_tokens: 1024,
        context_limit: 14,
        rag_top_k: 4,
        performance_preset: 'auto',
        system_template: 'System instructions...',
        cloud_rate_limit: 10
      });

      const profile = await crud.createProfile('Initial Profile');

      // Update profile with a new name and verify synchronization
      await crud.updateProfile(profile.id, 'My Synchronized Profile');

      const rows = await testDb.select('SELECT * FROM connection_profiles WHERE id = ?', [profile.id]);
      const p = rows[0];

      expect(p.name).toBe('My Synchronized Profile');
      expect(p.provider).toBe('custom');
      expect(p.openrouter_key).toBe('enc::aes256gcm::or_plain_key');
      expect(p.custom_key).toBe('enc::aes256gcm::custom_plain_key');
      expect(p.local_endpoint).toBe('https://api.openai.com/v1');
      expect(p.selected_model).toBe('gpt-4o');
      expect(p.temperature).toBe(0.85);
      expect(p.max_tokens).toBe(1024);
      expect(p.cloud_rate_limit).toBe(10);
    });
  });
});
