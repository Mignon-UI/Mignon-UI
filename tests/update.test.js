import { describe, it, expect } from 'vitest';
import { isNewerVersion } from '../src/services/updateService';

describe('isNewerVersion', () => {
  it('identifies newer versions correctly', () => {
    expect(isNewerVersion('0.1.0', 'v0.2.0')).toBe(true);
    expect(isNewerVersion('0.1.0', '0.1.1')).toBe(true);
    expect(isNewerVersion('1.0.0', '2.0.0')).toBe(true);
  });

  it('handles matching versions', () => {
    expect(isNewerVersion('0.1.0', 'v0.1.0')).toBe(false);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
  });

  it('handles older versions', () => {
    expect(isNewerVersion('0.2.0', 'v0.1.0')).toBe(false);
    expect(isNewerVersion('1.1.0', '1.0.9')).toBe(false);
  });

  it('handles pre-release tags', () => {
    expect(isNewerVersion('1.0.0-beta', '1.0.0')).toBe(true);
    expect(isNewerVersion('1.0.0-beta.1', '1.0.0-beta.2')).toBe(true);
    expect(isNewerVersion('1.0.0', '1.0.0-alpha')).toBe(false);
  });
});
