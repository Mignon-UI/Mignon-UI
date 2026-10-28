import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { createTestDb } from './testDbHelper';

let testDb;

// Wire getDb to return our real in-memory SQLite database
mock.module('../src/services/db', () => ({
  getDb: async () => testDb
}));

// Mock key security to prefix with enc:: for deterministic verification
mock.module('../src/utils/keySecurity', () => ({
  encryptKey: async (key) => `enc::aes256gcm::${key}`,
  decryptKey: async (key) => key.replace('enc::aes256gcm::', '')
}));

import * as crud from '../src/services/crud';

describe('Database CRUD Operations (Genuine SQLite Engine)', () => {
  beforeEach(() => {
    testDb = createTestDb({ seed: true });
  });

  describe('Settings CRUD', () => {
    it('should retrieve seeded settings row 1 with correct default values', async () => {
      const settings = await crud.getSettings();
      expect(settings).not.toBeNull();
      expect(settings.id).toBe(1);
      expect(settings.provider).toBe('ollama');
      expect(settings.temperature).toBe(0.85);
      expect(settings.max_tokens).toBe(350);
      expect(settings.context_limit).toBe(14);
      expect(settings.rag_top_k).toBe(4);
    });

    it('should update settings, encrypt new plaintext keys, and preserve placeholders', async () => {
      // Step 1: Save initial settings with a new plaintext key
      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: 'sk-or-real-token-1234',
        custom_key: 'custom-secret-key-5678',
        local_endpoint: 'http://localhost:11434/v1',
        temperature: 0.7,
        max_tokens: 500
      });

      let updated = await crud.getSettings();
      expect(updated.provider).toBe('openrouter');
      expect(updated.openrouter_key).toBe('enc::aes256gcm::sk-or-real-token-1234');
      expect(updated.custom_key).toBe('enc::aes256gcm::custom-secret-key-5678');
      expect(updated.temperature).toBe(0.7);
      expect(updated.max_tokens).toBe(500);

      // Step 2: Save settings when user submits placeholder '••••••••••••••••'
      await crud.saveSettings({
        provider: 'openrouter',
        openrouter_key: '••••••••••••••••', // should preserve existing key
        custom_key: 'new-unmasked-custom-key',
        temperature: 0.75
      });

      updated = await crud.getSettings();
      expect(updated.openrouter_key).toBe('enc::aes256gcm::sk-or-real-token-1234');
      expect(updated.custom_key).toBe('enc::aes256gcm::new-unmasked-custom-key');
      expect(updated.temperature).toBe(0.75);
    });
  });

  describe('Connection Profiles CRUD', () => {
    it('should create profile snapshotting current settings, list alphabetically, and update', async () => {
      await crud.saveSettings({
        provider: 'ollama',
        selected_model: 'llama3:8b',
        temperature: 0.9,
        openrouter_key: 'sk-key-profile'
      });

      const profileA = await crud.createProfile('Beta Profile');
      const profileB = await crud.createProfile('Alpha Profile');

      expect(profileA.name).toBe('Beta Profile');
      expect(profileA.provider).toBe('ollama');
      expect(profileA.selected_model).toBe('llama3:8b');

      const profiles = await crud.getProfiles();
      expect(profiles.length).toBe(2);
      expect(profiles[0].name).toBe('Alpha Profile'); // alphabetical ordering
      expect(profiles[1].name).toBe('Beta Profile');

      // Update profile
      const updated = await crud.updateProfile(profileA.id, 'Zeta Profile');
      expect(updated.name).toBe('Zeta Profile');

      // Delete profile
      await crud.deleteProfile(profileB.id);
      const remaining = await crud.getProfiles();
      expect(remaining.length).toBe(1);
      expect(remaining[0].id).toBe(profileA.id);
    });

    it('should enforce SQLite UNIQUE constraint on duplicate profile names', async () => {
      await crud.createProfile('Unique Name');
      await expect(crud.createProfile('Unique Name')).rejects.toThrow();
    });
  });

  describe('Characters CRUD', () => {
    it('should retrieve seeded characters and properly parse alternate_greetings', async () => {
      const characters = await crud.getCharacters();
      expect(characters.length).toBeGreaterThanOrEqual(2);

      const lyra = characters.find(c => c.name === 'Lyra Valerius');
      expect(lyra).toBeDefined();
      expect(Array.isArray(lyra.alternate_greetings)).toBe(true);
      expect(Boolean(lyra.is_active)).toBe(true);
    });

    it('should create and retrieve a new character with all fields', async () => {
      const newChar = await crud.createCharacter({
        name: 'Elira Nightshade',
        avatar: 'data:image/png;base64,mock',
        greeting: 'Greetings traveler.',
        personality: 'Quiet and calculating.',
        scenario: 'Tavern late night.',
        example_dialogue: '<START>\nUser: Hi\nElira: ...',
        alternate_greetings: ['Hello there.', 'Quiet night, isn\'t it?'],
        system_prompt: 'Stay in character as Elira.',
        is_active: true
      });

      expect(newChar.id).toBeDefined();
      expect(newChar.name).toBe('Elira Nightshade');
      expect(newChar.alternate_greetings).toEqual(['Hello there.', 'Quiet night, isn\'t it?']);

      const characters = await crud.getCharacters();
      const retrieved = characters.find(c => c.id === newChar.id);
      expect(retrieved.name).toBe('Elira Nightshade');
      expect(retrieved.alternate_greetings).toEqual(['Hello there.', 'Quiet night, isn\'t it?']);
    });

    it('should safely handle corrupted JSON in alternate_greetings without throwing', async () => {
      // Directly corrupt the row in SQLite
      await testDb.execute(
        "INSERT INTO characters (name, alternate_greetings) VALUES ('CorruptBot', '{invalid json}')"
      );

      const characters = await crud.getCharacters();
      const corrupt = characters.find(c => c.name === 'CorruptBot');
      expect(corrupt).toBeDefined();
      expect(corrupt.alternate_greetings).toEqual([]);
    });

    it('should delete character and remove references cleanly', async () => {
      const char = await crud.createCharacter({ name: 'Disposable' });
      await crud.deleteCharacter(char.id);
      const characters = await crud.getCharacters();
      const retrieved = characters.find(c => c.id === char.id);
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Rooms, Messages, and SQLite Foreign Key Cascades', () => {
    it('should create a room, add members, and calculate is_group correctly', async () => {
      const chars = await crud.getCharacters();
      const bot1 = chars[0];
      const bot2 = chars[1];

      // 1-on-1 room with 1 bot
      const room = await crud.createRoom({
        name: '1-on-1 Chat',
        is_group: false,
        character_ids: [bot1.id]
      });

      expect(room.id).toBeDefined();
      expect(room.is_group).toBe(false);

      // Add second bot -> triggers dynamic is_group recalculation
      await crud.addRoomMember(room.id, bot2.id);
      const rooms = await crud.getRooms();
      const updatedRoom = rooms.find(r => r.id === room.id);
      expect(updatedRoom.members.length).toBe(2);
      expect(updatedRoom.is_group).toBe(true);
    });

    it('should create messages with swipe arrays and retrieve them in chronological order', async () => {
      const room = await crud.createRoom({ name: 'Message Test Room' });

      const msg1 = await crud.createMessage({
        room_id: room.id,
        sender_type: 'user',
        character_id: null,
        sender_name: 'User',
        content: 'Hello bot!',
        swipes: ['Hello bot!']
      });

      const msg2 = await crud.createMessage({
        room_id: room.id,
        sender_type: 'character',
        character_id: 1,
        sender_name: 'Lyra',
        content: 'Hmph, what do you want?',
        swipes: ['Hmph, what do you want?', 'State your business.']
      });

      expect(msg1.id).toBeDefined();
      expect(msg2.id).toBeDefined();
      expect(msg2.swipes).toEqual(['Hmph, what do you want?', 'State your business.']);

      const messages = await crud.getRoomMessages(room.id);
      expect(messages.length).toBe(2);
      expect(messages[0].id).toBe(msg1.id);
      expect(messages[1].id).toBe(msg2.id);
      expect(messages[1].swipes).toEqual(['Hmph, what do you want?', 'State your business.']);
    });

    it('should cascade delete room messages and room members when room is deleted', async () => {
      const chars = await crud.getCharacters();
      const room = await crud.createRoom({
        name: 'Cascade Test Room',
        character_ids: [chars[0].id]
      });

      await crud.createMessage({
        room_id: room.id,
        sender_type: 'user',
        character_id: null,
        sender_name: 'User',
        content: 'This will be deleted'
      });

      // Verify records exist in SQLite (initial bot greeting + user message = 2 messages)
      const msgsBefore = await testDb.select('SELECT count(*) as count FROM messages WHERE room_id = ?', [room.id]);
      const membersBefore = await testDb.select('SELECT count(*) as count FROM room_members WHERE room_id = ?', [room.id]);
      expect(msgsBefore[0].count).toBe(2);
      expect(membersBefore[0].count).toBe(1);

      // Delete room via CRUD
      await crud.deleteRoom(room.id);

      // Verify SQLite ON DELETE CASCADE removed child messages and members
      const msgsAfter = await testDb.select('SELECT count(*) as count FROM messages WHERE room_id = ?', [room.id]);
      const membersAfter = await testDb.select('SELECT count(*) as count FROM room_members WHERE room_id = ?', [room.id]);
      expect(msgsAfter[0].count).toBe(0);
      expect(membersAfter[0].count).toBe(0);
    });

    it('should branch a room and clone messages up to branch point', async () => {
      const chars = await crud.getCharacters();
      const origRoom = await crud.createRoom({
        name: 'Story Chapter',
        character_ids: [chars[0].id]
      });

      await crud.createMessage({
        room_id: origRoom.id,
        sender_type: 'user',
        character_id: null,
        sender_name: 'User',
        content: 'Branch point 1'
      });

      const m2 = await crud.createMessage({
        room_id: origRoom.id,
        sender_type: 'character',
        character_id: chars[0].id,
        sender_name: 'Lyra',
        content: 'Branch point 2'
      });

      await crud.createMessage({
        room_id: origRoom.id,
        sender_type: 'user',
        character_id: null,
        sender_name: 'User',
        content: 'Post-branch message 3 (should not be cloned)'
      });

      // Branch from message 2
      const branchResult = await crud.branchRoom(origRoom.id, m2.id);
      expect(branchResult).toBeDefined();
      expect(branchResult.room.name).toBe('Story Chapter (Branched)');

      const branchMessages = await crud.getRoomMessages(branchResult.room.id);
      // Branch should contain initial bot greeting, m1, and m2 (3 total), not m3
      expect(branchMessages.length).toBe(3);
      expect(branchMessages[1].content).toBe('Branch point 1');
      expect(branchMessages[2].content).toBe('Branch point 2');
    });
  });

  describe('Worlds & Lore CRUD', () => {
    it('should create world, create lore entries, and cascade delete on world deletion', async () => {
      const world = await crud.createWorld({
        name: 'Arcadia',
        description: 'A fantasy realm.'
      });

      expect(world.id).toBeDefined();
      expect(world.name).toBe('Arcadia');

      const lore = await crud.createLore({
        world_id: world.id,
        title: 'The Great Spire',
        keys: 'spire, magic, tower',
        content: 'A soaring crystalline tower.',
        weight: 500,
        is_active: true
      });

      expect(lore.id).toBeDefined();
      expect(lore.world_id).toBe(world.id);

      const allLores = await crud.getLore();
      const worldLore = allLores.find(l => l.id === lore.id);
      expect(worldLore).toBeDefined();
      expect(worldLore.title).toBe('The Great Spire');

      // Delete world -> cascades lore entries
      await crud.deleteWorld(world.id);
      const loresAfter = await testDb.select('SELECT count(*) as count FROM lore_entries WHERE world_id = ?', [world.id]);
      expect(loresAfter[0].count).toBe(0);
    });
  });

  describe('Negative & Constraint Boundary Testing (Foreign Keys & Not-Null)', () => {
    it('should reject message creation with non-existent room_id due to SQLite foreign key constraint', async () => {
      await expect(
        crud.createMessage({
          room_id: 'non-existent-room-uuid',
          sender_type: 'user',
          sender_name: 'Arthur',
          content: 'This should fail.'
        })
      ).rejects.toThrow();
    });

    it('should reject message creation with non-existent character_id due to foreign key constraint', async () => {
      const room = await crud.createRoom({ name: 'FK Room' });
      await expect(
        crud.createMessage({
          room_id: room.id,
          sender_type: 'character',
          character_id: 999999, // non-existent character ID
          sender_name: 'Ghost Bot',
          content: 'This should fail.'
        })
      ).rejects.toThrow();
    });

    it('should throw "Room not found" when attempting to branch a non-existent room', async () => {
      await expect(crud.branchRoom('non-existent-room-id', 1)).rejects.toThrow('Room not found');
    });

    it('should throw "Message not found" when attempting to update a non-existent message', async () => {
      await expect(crud.updateMessage(999999, 'updated content')).rejects.toThrow('Message not found');
    });

    it('should enforce NOT NULL constraint on character name', async () => {
      await expect(
        testDb.execute("INSERT INTO characters (name) VALUES (NULL)")
      ).rejects.toThrow();
    });

    it('should reject room member junction insert with non-existent character_id', async () => {
      const room = await crud.createRoom({ name: 'Member FK Test Room' });
      await expect(
        testDb.execute(
          "INSERT INTO room_members (room_id, character_id) VALUES (?, ?)",
          [room.id, 999999]
        )
      ).rejects.toThrow();
    });

    it('should handle duplicate room members idempotently without throwing via addRoomMember', async () => {
      const chars = await crud.getCharacters();
      const room = await crud.createRoom({ name: 'Idempotency Room' });
      await crud.addRoomMember(room.id, chars[0].id);
      // Adding duplicate member should be handled idempotently by INSERT OR IGNORE
      await crud.addRoomMember(room.id, chars[0].id);
      const members = await testDb.select("SELECT * FROM room_members WHERE room_id = ?", [room.id]);
      expect(members.length).toBe(1);
    });
  });
});

