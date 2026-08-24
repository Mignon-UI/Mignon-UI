import { describe, it, expect } from 'bun:test';
import { PERFORMANCE_PRESETS, detectRecommendedPreset, matchCurrentPreset } from '../src/utils/hardwareDetector';

describe('Hardware Detector & Performance Presets', () => {
  it('should define all 5 core presets with valid parameters', () => {
    expect(PERFORMANCE_PRESETS.low).toBeDefined();
    expect(PERFORMANCE_PRESETS.medium).toBeDefined();
    expect(PERFORMANCE_PRESETS.high).toBeDefined();
    expect(PERFORMANCE_PRESETS.ultra).toBeDefined();
    expect(PERFORMANCE_PRESETS.custom).toBeDefined();

    expect(PERFORMANCE_PRESETS.low.max_tokens).toBe(250);
    expect(PERFORMANCE_PRESETS.medium.max_tokens).toBe(350);
    expect(PERFORMANCE_PRESETS.high.max_tokens).toBe(600);
    expect(PERFORMANCE_PRESETS.ultra.max_tokens).toBe(1200);
  });

  it('should recommend balanced High preset for cloud providers to optimize token cost', () => {
    const openrouterResult = detectRecommendedPreset('openrouter');
    expect(openrouterResult.presetKey).toBe('high');
    expect(openrouterResult.reason).toContain('Cloud OpenRouter');

    const customCloudResult = detectRecommendedPreset('custom', 'https://api.openai.com/v1');
    expect(customCloudResult.presetKey).toBe('high');
  });

  it('should recommend a valid preset for local engines', () => {
    const localResult = detectRecommendedPreset('ollama', 'http://127.0.0.1:11434/v1');
    expect(['low', 'medium', 'high']).toContain(localResult.presetKey);
  });

  it('should accurately match form values to presets or return custom', () => {
    const mediumForm = {
      max_tokens: 350,
      context_limit: 14,
      rag_top_k: 4,
      temperature: 0.85
    };
    expect(matchCurrentPreset(mediumForm)).toBe('medium');

    const customForm = {
      max_tokens: 412,
      context_limit: 14,
      rag_top_k: 4,
      temperature: 0.85
    };
    expect(matchCurrentPreset(customForm)).toBe('custom');
  });
});
