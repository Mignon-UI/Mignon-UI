// src/utils/sseParser.js
// Standard helper to parse Server-Sent Events (SSE) from ReadableStream bodies.

export async function parseSseStream(response, onEvent) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep last incomplete line

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine || !cleanLine.startsWith('data:')) continue;

      const dataContent = cleanLine.substring(cleanLine.indexOf(':') + 1).trim();
      onEvent(dataContent);
    }
  }
}
