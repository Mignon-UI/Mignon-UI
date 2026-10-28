import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';

mock.module('../src/utils/keySecurity', () => ({
  decryptKey: async (key) => (key ? key.replace('enc::', '') : '')
}));

import * as safeFetchModule from '../src/utils/safeFetch';
import * as rag from '../src/services/rag';
import { queryLlmNonStream, streamLlmResponse } from '../src/services/llmClient';

describe('LLM Client Service (Endpoint Resolution, Headers & Payload Construction)', () => {
  let fetchSpy;
  let workerSpy;

  beforeEach(() => {
    fetchSpy = spyOn(safeFetchModule, 'safeFetch').mockResolvedValue({
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Default response' } }]
      })
    });

    workerSpy = spyOn(rag, 'runInWorker').mockResolvedValue(null);
  });

  afterEach(() => {
    mock.restore();
  });

  describe('resolveLlmEndpoint & Header Resolution', () => {
    it('should format OpenRouter URL and attach Authorization, Referer, and Title headers', async () => {
      const settings = {
        provider: 'openrouter',
        openrouter_key: 'enc::sk-or-real-key-1234',
        selected_model: 'meta-llama/llama-3-8b'
      };

      await queryLlmNonStream(settings, 'Sys prompt', 'User prompt');

      expect(fetchSpy).toHaveBeenCalled();
      const [url, options] = fetchSpy.mock.calls[0];

      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(options.headers['Authorization']).toBe('Bearer sk-or-real-key-1234');
      expect(options.headers['HTTP-Referer']).toBe('https://github.com/Deep-Hex/Mignon-UI');
      expect(options.headers['X-Title']).toBe('Mignon UI');
      expect(options.headers['Content-Type']).toBe('application/json');
    });

    it('should format Anthropic custom endpoint, attach x-api-key and anthropic-version', async () => {
      const settings = {
        provider: 'custom',
        custom_key: 'enc::sk-ant-api03-secret',
        local_endpoint: 'https://api.anthropic.com/v1',
        selected_model: 'claude-3-5-sonnet-20241022'
      };

      fetchSpy.mockResolvedValueOnce({
        status: 200,
        json: async () => ({
          content: [{ text: 'Hello from Claude' }]
        })
      });

      const response = await queryLlmNonStream(settings, 'Sys prompt', 'User prompt');

      expect(response).toBe('Hello from Claude');
      const [url, options] = fetchSpy.mock.calls[0];

      expect(url).toBe('https://api.anthropic.com/v1/messages');
      expect(options.headers['x-api-key']).toBe('sk-ant-api03-secret');
      expect(options.headers['anthropic-version']).toBe('2023-06-01');
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('should append /chat/completions to standard OpenAI-compatible endpoints ending in /v1', async () => {
      const settings = {
        provider: 'custom',
        custom_key: 'enc::sk-openai-key',
        local_endpoint: 'https://api.openai.com/v1',
        selected_model: 'gpt-4o'
      };

      await queryLlmNonStream(settings, 'Sys', 'User');

      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe('https://api.openai.com/v1/chat/completions');
      expect(options.headers['Authorization']).toBe('Bearer sk-openai-key');
    });

    it('should default to local Ollama /chat/completions endpoint for local provider', async () => {
      const settings = {
        provider: 'ollama',
        local_endpoint: 'http://127.0.0.1:11434/v1',
        selected_model: 'mistral:7b'
      };

      await queryLlmNonStream(settings, 'Sys', 'User');

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    });
  });

  describe('buildPayload Schema Differences', () => {
    it('should build Anthropic-compatible payload structure (system at root, single user message)', async () => {
      const settings = {
        provider: 'custom',
        custom_key: 'sk-ant',
        local_endpoint: 'https://api.anthropic.com',
        selected_model: 'claude-3-haiku',
        temperature: 0.7,
        max_tokens: 500
      };

      await queryLlmNonStream(settings, 'You are an archivist.', 'Summarize chapter 1.');

      const [, options] = fetchSpy.mock.calls[0];
      const payload = JSON.parse(options.body);

      expect(payload.model).toBe('claude-3-haiku');
      expect(payload.temperature).toBe(0.7);
      expect(payload.max_tokens).toBe(500);
      expect(payload.stream).toBe(false);
      expect(payload.system).toBe('You are an archivist.');
      expect(payload.messages).toEqual([{ role: 'user', content: 'Summarize chapter 1.' }]);
    });

    it('should build OpenAI/Ollama payload structure (system as message role)', async () => {
      const settings = {
        provider: 'ollama',
        selected_model: 'llama3:8b',
        temperature: 0.85,
        max_tokens: 350
      };

      await queryLlmNonStream(settings, 'System directives', 'User inquiry');

      const [, options] = fetchSpy.mock.calls[0];
      const payload = JSON.parse(options.body);

      expect(payload.model).toBe('llama3:8b');
      expect(payload.system).toBeUndefined();
      expect(payload.messages).toEqual([
        { role: 'system', content: 'System directives' },
        { role: 'user', content: 'User inquiry' }
      ]);
      expect(payload.options.num_predict).toBe(350);
      expect(payload.options.temperature).toBe(0.85);
    });
  });

  describe('queryLlmNonStream Error Resilience', () => {
    it('should return empty string when API returns HTTP 500 status', async () => {
      fetchSpy.mockResolvedValueOnce({
        status: 500,
        json: async () => ({ error: 'Internal Server Error' })
      });

      const result = await queryLlmNonStream({ provider: 'ollama' }, 'Sys', 'User');
      expect(result).toBe('');
    });

    it('should return empty string on network fetch exception without throwing', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await queryLlmNonStream({ provider: 'ollama' }, 'Sys', 'User');
      expect(result).toBe('');
    });
  });

  describe('streamLlmResponse Worker Dispatch & Abort Handling', () => {
    it('should dispatch START_LLM_STREAM to Web Worker with generated taskId, payload, and headers', async () => {
      const settings = {
        provider: 'openrouter',
        openrouter_key: 'sk-or-test',
        selected_model: 'google/gemini-flash'
      };

      const tokens = [];
      const onToken = (t) => tokens.push(t);

      await streamLlmResponse(settings, 'Sys prompt', 'User prompt', onToken);

      expect(workerSpy).toHaveBeenCalled();
      const [type, payload, callback] = workerSpy.mock.calls[0];

      expect(type).toBe('START_LLM_STREAM');
      expect(payload.url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(payload.payload.stream).toBe(true);
      expect(payload.headers['Authorization']).toBe('Bearer sk-or-test');
      expect(payload.taskId.startsWith('stream-')).toBe(true);
      expect(callback).toBe(onToken);
    });

    it('should dispatch ABORT_LLM_STREAM to Web Worker when AbortController triggers signal abort', async () => {
      const abortController = new AbortController();

      let capturedResolve;
      workerSpy.mockImplementation((type) => {
        if (type === 'START_LLM_STREAM') {
          return new Promise((resolve) => {
            capturedResolve = resolve;
          });
        }
        if (type === 'ABORT_LLM_STREAM') {
          return Promise.resolve();
        }
        return Promise.resolve();
      });

      const streamPromise = streamLlmResponse(
        { provider: 'ollama' },
        'Sys',
        'User',
        () => {},
        abortController.signal
      );

      // Allow async setup (resolveLlmEndpoint) to complete and attach abort listener
      await new Promise(resolve => setTimeout(resolve, 10));

      // Trigger abort while stream is pending
      abortController.abort();

      const abortCalls = workerSpy.mock.calls.filter(call => call[0] === 'ABORT_LLM_STREAM');
      expect(abortCalls.length).toBe(1);
      expect(abortCalls[0][1].taskId.startsWith('stream-')).toBe(true);

      capturedResolve();
      await streamPromise;
    });
  });
});
