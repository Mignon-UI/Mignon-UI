import { describe, it, expect } from 'bun:test';
import { formatRoleplayText, getBotAccent, getBotAvatarUrl } from '../src/utils/textFormatter';

describe('Text Formatter & Roleplay Sanitization', () => {
  describe('formatRoleplayText & HTML Sanitization', () => {
    it('should strictly escape raw HTML characters to prevent XSS injection', () => {
      const malicious = '<script>alert("hacked")</script>&<img src="x" onerror="steal()"/>';
      const formatted = formatRoleplayText(malicious);

      expect(formatted).not.toContain('<script>');
      expect(formatted).not.toContain('<img');
      expect(formatted).toContain('&lt;script&gt;');
      expect(formatted).toContain('&lt;img');
      expect(formatted).toContain('&amp;');
      expect(formatted).toContain('&quot;');
    });

    it('should format roleplay actions wrapped in asterisks with action-text span', () => {
      const input = '*draws sword slowly* Stand back.';
      const output = formatRoleplayText(input);

      expect(output).toContain('<span class="action-text">*draws sword slowly*</span>');
      expect(output).toContain('Stand back.');
    });

    it('should handle multiple actions on a single line and convert newlines to <br>', () => {
      const input = '*sighs deeply*\nI told you this would happen.\n*turns away*';
      const output = formatRoleplayText(input);

      expect(output).toContain('<span class="action-text">*sighs deeply*</span>');
      expect(output).toContain('<span class="action-text">*turns away*</span>');
      expect(output).toContain('<br>');
    });

    it('should return empty string for null, undefined, or empty text', () => {
      expect(formatRoleplayText('')).toBe('');
      expect(formatRoleplayText(null)).toBe('');
      expect(formatRoleplayText(undefined)).toBe('');
    });
  });

  describe('getBotAccent & getBotAvatarUrl', () => {
    it('should return deterministic accent colors for consistent bot IDs', () => {
      const accentA1 = getBotAccent(1);
      const accentA2 = getBotAccent(1);
      expect(accentA1).toBe(accentA2);

      const accentB = getBotAccent(2);
      expect(['cyan', 'magenta', 'purple', 'amber', 'emerald']).toContain(accentB);
    });

    it('should default to purple accent when botId is null or undefined', () => {
      expect(getBotAccent(null)).toBe('purple');
      expect(getBotAccent(undefined)).toBe('purple');
    });

    it('should safely resolve bot avatar URL from active room roster', () => {
      const bots = [
        { id: 10, name: 'Lyra', avatar: 'data:image/png;base64,lyra_avatar' },
        { id: 20, name: 'Kaelen', avatar: 'data:image/png;base64,kaelen_avatar' }
      ];

      expect(getBotAvatarUrl(10, bots)).toBe('data:image/png;base64,lyra_avatar');
      expect(getBotAvatarUrl(20, bots)).toBe('data:image/png;base64,kaelen_avatar');
      expect(getBotAvatarUrl(999, bots)).toBeNull();
    });
  });
});
