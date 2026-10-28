import { describe, it, expect } from 'bun:test';
import {
  runMainThreadEfficientSelector,
  checkDirectAddress,
  calculateOceanTraits,
  parseCharacterStatus,
  calculateComfortLevels,
  filterIncapacitatedBots,
  getKeywordRelevance
} from '../src/utils/turnTakingMath';

describe('Psychological Turn-Taking Engine (Formula 3 Math)', () => {
  const mockBots = [
    {
      id: 1,
      name: 'Lyra Valerius',
      personality: 'A proud, noble knight who serves the king. Loyal, assertive, confident.'
    },
    {
      id: 2,
      name: 'Kaelen Vane',
      personality: 'A quiet, timid servant who keeps to themself. Shy, fearful, introverted.'
    }
  ];

  describe('Direct Address Resolution (checkDirectAddress)', () => {
    it('should identify direct address by name with commas or exclamation marks', () => {
      const winner1 = checkDirectAddress('Lyra, what is the perimeter status?', null, mockBots);
      expect(winner1).toBe(1);

      const winner2 = checkDirectAddress('Be careful, Kaelen!', null, mockBots);
      expect(winner2).toBe(2);
    });

    it('should respect word boundaries and not match partial substring occurrences', () => {
      // "Kaelenite" contains "Kaelen" but is not the character's name
      const winner = checkDirectAddress('We discovered a strange Kaelenite crystal.', null, mockBots);
      expect(winner).toBeNull();
    });

    it('should be case-insensitive', () => {
      const winner = checkDirectAddress('hey lyra valerius look out', null, mockBots);
      expect(winner).toBe(1);
    });
  });

  describe('OCEAN Personality Traits (calculateOceanTraits)', () => {
    it('should assign high assertiveness and extraversion to confident leader bios', () => {
      const traits = calculateOceanTraits('loud, outgoing, assertive, natural leader, confident');
      expect(traits.extraversion).toBeGreaterThanOrEqual(0.8);
      expect(traits.assertiveness).toBeGreaterThanOrEqual(0.8);
    });

    it('should assign low extraversion to timid and reclusive bios', () => {
      const traits = calculateOceanTraits('shy, timid, quiet, loner, keeps to themself');
      expect(traits.extraversion).toBeLessThanOrEqual(0.2);
    });

    it('should strictly clamp all OCEAN trait scores between 0.0 and 1.0', () => {
      const extremePositive = calculateOceanTraits('loud talkative outgoing sociable gregarious life of the party friendly');
      const extremeNegative = calculateOceanTraits('shy timid quiet reserved withdrawn introverted loner reclusive');

      for (const val of Object.values(extremePositive)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
      for (const val of Object.values(extremeNegative)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Status Hierarchy Parsing (parseCharacterStatus)', () => {
    it('should parse high status for royalty, lords, and commanders', () => {
      expect(parseCharacterStatus('the king of the realm')).toBe(10);
      expect(parseCharacterStatus('grand general of the imperial army')).toBe(9);
      expect(parseCharacterStatus('captain of the guard')).toBe(8);
      expect(parseCharacterStatus('noble knight sworn to duty')).toBe(7);
    });

    it('should parse low status for servants, assistants, and prisoners', () => {
      expect(parseCharacterStatus('humble servant in the castle')).toBe(3);
      expect(parseCharacterStatus('escaped prisoner on the run')).toBe(1);
    });

    it('should parse status from [tags: ...] or [personality: ...] metadata blocks', () => {
      expect(parseCharacterStatus('[tags: emperor, ruthless]')).toBe(10);
      expect(parseCharacterStatus('[personality: butler, loyal]')).toBe(3);
    });

    it('should default to status 5 (average citizen) when unspecified', () => {
      expect(parseCharacterStatus('a wandering traveler who studies plants')).toBe(5);
    });
  });

  describe('Relationship Comfort Levels (calculateComfortLevels)', () => {
    it('should assign high comfort for close friends or romantic partners', () => {
      const comfort = calculateComfortLevels('best friend of Lyra Valerius', ['Lyra Valerius'], 0.5);
      expect(comfort['Lyra Valerius']).toBeGreaterThanOrEqual(0.9);
    });

    it('should assign low comfort for enemies or feared characters', () => {
      const comfort = calculateComfortLevels('terrified of Kaelen Vane and hates Kaelen Vane', ['Kaelen Vane'], 0.5);
      expect(comfort['Kaelen Vane']).toBeLessThanOrEqual(0.2);
    });
  });

  describe('Incapacitation Filter (filterIncapacitatedBots)', () => {
    it('should filter out bots that are unconscious, asleep, or stunned in scene_state', () => {
      const sceneState = {
        '1': { status: 'unconscious' },
        '2': { status: 'active' }
      };

      const active = filterIncapacitatedBots(mockBots, sceneState);
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe(2);
    });

    it('should keep all bots if no incapacitation statuses are present', () => {
      const active = filterIncapacitatedBots(mockBots, null);
      expect(active).toHaveLength(2);
    });
  });

  describe('Keyword Relevance (getKeywordRelevance)', () => {
    it('should return baseline 0.5 when message or bio is empty', () => {
      expect(getKeywordRelevance('', 'knight armor sword')).toBe(0.5);
      expect(getKeywordRelevance('hello', '')).toBe(0.5);
    });

    it('should increase relevance when keywords overlap between message and bio', () => {
      const rel = getKeywordRelevance('Tell me about your sword and shield in battle.', 'noble knight sword shield armor');
      expect(rel).toBeGreaterThan(0.5);
      expect(rel).toBeLessThanOrEqual(1.0);
    });
  });

  describe('Full Main Thread Selector (runMainThreadEfficientSelector)', () => {
    it('should return null when no bots are provided', async () => {
      const result = await runMainThreadEfficientSelector('Hello', [], []);
      expect(result).toBeNull();
    });

    it('should return the sole bot ID immediately when bots count is 1', async () => {
      const result = await runMainThreadEfficientSelector('Hello', [mockBots[0]], []);
      expect(result).toBe(1);
    });

    it('should pick speaker via direct address over general statistical score', async () => {
      const result = await runMainThreadEfficientSelector(
        'Kaelen, did you hear that noise?',
        mockBots,
        []
      );
      expect(result).toBe(2);
    });

    it('should select an active candidate validly among multiple bots without throwing', async () => {
      const messages = [
        { sender_name: 'User', sender_type: 'user', content: 'What is our plan of action?' }
      ];
      const result = await runMainThreadEfficientSelector(
        'What is our plan of action?',
        mockBots,
        messages
      );
      expect([1, 2]).toContain(result);
    });
  });
});
