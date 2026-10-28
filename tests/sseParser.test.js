import { describe, it, expect } from 'bun:test';
import { parseSseStream } from '../src/utils/sseParser';

/**
 * Creates a mock Response object with a ReadableStream from an array of chunk strings.
 */
function createMockStreamResponse(chunks) {
  const encoder = new TextEncoder();
  let index = 0;

  const stream = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    }
  });

  return {
    body: stream
  };
}

describe('SSE Stream Parser (parseSseStream)', () => {
  it('should parse standard single-line data events', async () => {
    const chunks = [
      'data: {"token": "Hello"}\n\n',
      'data: {"token": " world"}\n\n'
    ];

    const received = [];
    await parseSseStream(createMockStreamResponse(chunks), (data) => {
      received.push(data);
    });

    expect(received).toEqual([
      '{"token": "Hello"}',
      '{"token": " world"}'
    ]);
  });

  it('should correctly buffer and assemble fragmented chunks across network boundaries', async () => {
    // A single data line split across 3 separate network packets
    const chunks = [
      'data: {"id": 1, "mes',
      'sage": "frag',
      'mented content"}\n\n'
    ];

    const received = [];
    await parseSseStream(createMockStreamResponse(chunks), (data) => {
      received.push(data);
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toBe('{"id": 1, "message": "fragmented content"}');
  });

  it('should ignore SSE comments (: ping), empty lines, and non-data headers', async () => {
    const chunks = [
      ': ping\n\n',
      'event: message\nid: 101\ndata: valid-event-1\n\n',
      '\n\n',
      ': keep-alive\n\n',
      'data: valid-event-2\n\n'
    ];

    const received = [];
    await parseSseStream(createMockStreamResponse(chunks), (data) => {
      received.push(data);
    });

    expect(received).toEqual([
      'valid-event-1',
      'valid-event-2'
    ]);
  });

  it('should handle terminal [DONE] event signal commonly used by OpenAI/OpenRouter', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
      'data: [DONE]\n\n'
    ];

    const received = [];
    await parseSseStream(createMockStreamResponse(chunks), (data) => {
      received.push(data);
    });

    expect(received).toHaveLength(2);
    expect(received[0]).toContain('"content":"Hi"');
    expect(received[1]).toBe('[DONE]');
  });

  it('should gracefully handle empty streams without invoking callback or throwing', async () => {
    const received = [];
    await parseSseStream(createMockStreamResponse([]), (data) => {
      received.push(data);
    });

    expect(received).toHaveLength(0);
  });
});
