import { describe, it, expect } from 'bun:test';
import { parseTavernJson, parseTavernPng, extractAvatarUrlFromPngBytes } from '../src/services/tavernParser';

describe('Tavern Character Card Parser Tests', () => {
  describe('parseTavernJson', () => {
    it('should correctly parse standard Tavern Card V2 JSON format', () => {
      const v2Card = {
        spec: 'chara_card_v2',
        spec_version: '2.0',
        data: {
          name: 'Seraphina',
          first_mes: 'Greetings, traveler. How may I guide you?',
          description: 'A serene guardian of the ancient forest archives.',
          personality: 'Calm, observant, deeply knowledgeable.',
          scenario: 'Meeting at the Celestial Archive after a long journey.',
          mes_example: '<START>\n{{user}}: What is this place?\n{{char}}: *smiles gently* The repository of all forgotten histories.',
          tags: ['fantasy', 'guardian', 'lorekeeper'],
          alternate_greetings: [
            'Welcome back. Have you brought news from the frontier?',
            '*looks up from a tome* Ah, you have arrived.'
          ],
          system_prompt: 'Roleplay as Seraphina with poetic and archaic prose.',
          post_history_instructions: 'Keep responses concise and descriptive.',
          creator: 'Archivist',
          character_version: '1.2.0',
          creator_notes: 'Designed for deep roleplay.'
        }
      };

      const parsed = parseTavernJson(v2Card);

      expect(parsed).toBeDefined();
      expect(parsed.name).toBe('Seraphina');
      expect(parsed.greeting).toBe('Greetings, traveler. How may I guide you?');
      expect(parsed.personality).toContain('[Tags: fantasy, guardian, lorekeeper]');
      expect(parsed.personality).toContain('[Personality: Calm, observant, deeply knowledgeable.]');
      expect(parsed.personality).toContain('A serene guardian of the ancient forest archives.');
      expect(parsed.scenario).toBe('Meeting at the Celestial Archive after a long journey.');
      expect(parsed.example_dialogue).toContain('<START>');
      expect(parsed.alternate_greetings).toHaveLength(2);
      expect(parsed.system_prompt).toBe('Roleplay as Seraphina with poetic and archaic prose.');
      expect(parsed.creator).toBe('Archivist');
      expect(parsed.character_version).toBe('1.2.0');
    });

    it('should parse character_book entries embedded in Tavern card', () => {
      const cardWithLore = {
        name: 'Kaelen',
        first_mes: 'Stay sharp.',
        description: 'A shadow operative.',
        character_book: {
          name: 'Kaelen Lore',
          entries: [
            {
              keys: ['shadow syndicate', 'syndicate'],
              content: 'The Shadow Syndicate is an underground network of intelligence brokers.',
              comment: 'Faction Info',
              enabled: true,
              insertion_order: 10
            },
            {
              keys: ['disabled lore'],
              content: 'Should not appear',
              enabled: false
            }
          ]
        }
      };

      const parsed = parseTavernJson(cardWithLore);

      expect(parsed.lore_entries).toBeDefined();
      expect(parsed.lore_entries).toHaveLength(1);
      expect(parsed.lore_entries[0].title).toBe('Faction Info');
      expect(parsed.lore_entries[0].keys).toBe('shadow syndicate, syndicate');
      expect(parsed.lore_entries[0].content).toContain('The Shadow Syndicate');
      expect(parsed.lore_entries[0].weight).toBe(10);
    });

    it('should handle V1 card format with fallback fields', () => {
      const v1Card = {
        name: 'Old Guard',
        description: 'A battle-hardened veteran.',
        personality: '',
        greeting: 'State your business.',
        scenario: 'Guarding the gates.',
        mes_example: 'Halt!'
      };

      const parsed = parseTavernJson(v1Card);

      expect(parsed.name).toBe('Old Guard');
      expect(parsed.greeting).toBe('State your business.');
      expect(parsed.personality).toBe('A battle-hardened veteran.');
      expect(parsed.scenario).toBe('Guarding the gates.');
    });

    it('should safely return null on invalid JSON structures', () => {
      expect(parseTavernJson(null)).toBeNull();
      expect(parseTavernJson(undefined)).toBeNull();
    });
  });

  describe('extractAvatarUrlFromPngBytes', () => {
    it('should correctly convert Uint8Array binary PNG bytes to a data URL', () => {
      const dummyPngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
      const dataUrl = extractAvatarUrlFromPngBytes(dummyPngBytes.buffer);

      expect(dataUrl).toBeDefined();
      expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    });
  });

  describe('parseTavernPng', () => {
    function createSyntheticTavernPng(keyword, payloadString) {
      const pngSig = [137, 80, 78, 71, 13, 10, 26, 10];
      const encoder = new TextEncoder();

      // Chunk keyword + null byte + payload
      const keyBytes = encoder.encode(keyword);
      const textBytes = encoder.encode(payloadString);
      const chunkData = new Uint8Array(keyBytes.length + 1 + textBytes.length);
      chunkData.set(keyBytes, 0);
      chunkData[keyBytes.length] = 0; // null separator
      chunkData.set(textBytes, keyBytes.length + 1);

      // tEXt chunk header
      const chunkLen = chunkData.length;
      const typeBytes = encoder.encode("tEXt");
      const chunkTotal = 4 + 4 + chunkLen + 4; // length (4), type (4), data (chunkLen), CRC (4)

      // IEND chunk
      const iendBytes = new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);

      const fullBuffer = new Uint8Array(pngSig.length + chunkTotal + iendBytes.length);
      fullBuffer.set(pngSig, 0);

      let offset = pngSig.length;
      const view = new DataView(fullBuffer.buffer);
      view.setUint32(offset, chunkLen);
      fullBuffer.set(typeBytes, offset + 4);
      fullBuffer.set(chunkData, offset + 8);
      view.setUint32(offset + 8 + chunkLen, 0); // Mock CRC

      offset += chunkTotal;
      fullBuffer.set(iendBytes, offset);

      return fullBuffer.buffer;
    }

    it('should parse character card JSON from a synthetic PNG tEXt chunk with "chara" keyword', () => {
      const cardPayload = JSON.stringify({
        data: {
          name: 'Elysia',
          first_mes: 'Hello there!',
          description: 'A spirited sky dancer.',
          personality: 'Joyful and graceful.'
        }
      });
      const base64Payload = btoa(cardPayload);
      const pngBuffer = createSyntheticTavernPng('chara', base64Payload);

      const parsed = parseTavernPng(pngBuffer);
      expect(parsed).toBeDefined();
      expect(parsed.name).toBe('Elysia');
      expect(parsed.greeting).toBe('Hello there!');
      expect(parsed.personality).toContain('A spirited sky dancer.');
    });

    it('should return null if PNG signature is corrupted or missing', () => {
      const corruptedBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const parsed = parseTavernPng(corruptedBytes.buffer);
      expect(parsed).toBeNull();
    });
  });
});
