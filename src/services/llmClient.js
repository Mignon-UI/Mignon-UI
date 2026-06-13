// src/services/llmClient.js
// Client-side LLM connection manager. Communicates with LLMs (Ollama, Kobold, OpenRouter, Anthropic) 
// using CORS-free Tauri HTTP fetch. Handles SSE token streams.
import { invoke } from '@tauri-apps/api/core';
import { parseSseStream } from '../utils/sseParser';
import { safeFetch } from '../utils/safeFetch';
import { APP_NAME } from '../config';

// Secure key helpers calling Tauri Rust commands
export async function encryptKey(plaintext) {
  try {
    return await invoke('encrypt_key', { plaintext });
  } catch (e) {
    console.error("[LLM Client] Encryption failed:", e);
    return plaintext;
  }
}

export async function decryptKey(encryptedStr) {
  try {
    return await invoke('decrypt_key', { encryptedStr });
  } catch (e) {
    console.error("[LLM Client] Decryption failed:", e);
    return "";
  }
}

// Resolve the endpoint, model, and headers based on active settings
async function resolveLlmEndpoint(settings) {
  const headers = {};
  let url = settings?.local_endpoint || "http://127.0.0.1:11434/v1";
  let modelName = settings?.selected_model || "default";

  if (settings?.provider === "openrouter") {
    url = "https://openrouter.ai/api/v1/chat/completions";
    const apiKey = await decryptKey(settings.openrouter_key);
    headers["Authorization"] = `Bearer ${apiKey}`;
    headers["HTTP-Referer"] = `https://github.com/Deep-Hex/${APP_NAME.replace(/\s+/g, '-')}`;
    headers["X-Title"] = APP_NAME;
  } else if (settings?.provider === "custom" && settings?.custom_key) {
    const apiKey = await decryptKey(settings.custom_key);
    modelName = settings.selected_model || "custom-model";
    if (url.includes("api.anthropic.com")) {
      if (url.endsWith("/v1") || url.endsWith("/v1/")) {
        url = `${url.replace(/\/$/, "")}/messages`;
      } else if (!url.endsWith("/v1/messages") && !url.endsWith("/messages")) {
        url = `${url.replace(/\/$/, "")}/v1/messages`;
      }
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      if (url.endsWith("/v1") || url.endsWith("/v1/")) {
        url = `${url.replace(/\/$/, "")}/chat/completions`;
      }
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  } else {
    // Local Ollama / Kobold
    if (url.endsWith("/v1") || url.endsWith("/v1/")) {
      url = `${url.replace(/\/$/, "")}/chat/completions`;
    }
  }

  return { url, modelName, headers };
}

// Stream LLM chat completions via Server-Sent Events (SSE)
export async function streamLlmResponse(settings, systemPrompt, userPrompt, onToken, signal) {
  const { url, modelName, headers } = await resolveLlmEndpoint(settings);
  const isAnthropic = url.includes("api.anthropic.com");

  let payload;
  if (isAnthropic) {
    payload = {
      model: modelName,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ],
      temperature: settings?.temperature || 0.9,
      max_tokens: settings?.max_tokens || 2048,
      stream: true
    };
  } else {
    payload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: settings?.temperature || 0.9,
      max_tokens: settings?.max_tokens || 2048,
      stream: true
    };
  }

  headers["Content-Type"] = "application/json";

  try {
    const response = await safeFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`LLM API returned status ${response.status}: ${errBody}`);
    }

    await parseSseStream(response, (dataContent) => {
      if (dataContent === "[DONE]") return;

      try {
        const parsed = JSON.parse(dataContent);
        let token = null;

        if (isAnthropic) {
          if (parsed.type === "content_block_delta") {
            token = parsed.delta?.text;
          }
        } else {
          // Standard OpenAI / Kobold
          if (parsed.choices && parsed.choices.length > 0) {
            token = parsed.choices[0].delta?.content;
          } else {
            // Ollama native
            token = parsed.message?.content;
          }
        }

        if (token) {
          onToken(token);
        }
      } catch {
        // Ignore JSON parse errors for incomplete streaming lines
      }
    });
  } catch (err) {
    if (err.name === "AbortError") {
      console.log("[LLM Client] Stream aborted by caller.");
    } else {
      console.error("[LLM Client] Streaming connection error:", err);
      throw err;
    }
  }
}

// Query LLM synchronously (non-streaming)
export async function queryLlmNonStream(settings, systemPrompt, userPrompt, temperature = null, maxTokens = null) {
  const { url, modelName, headers } = await resolveLlmEndpoint(settings);
  const isAnthropic = url.includes("api.anthropic.com");

  const resolvedTemp = temperature !== null ? temperature : (settings?.temperature || 0.9);
  const resolvedTokens = maxTokens !== null ? maxTokens : (settings?.max_tokens || 2048);

  let payload;
  if (isAnthropic) {
    payload = {
      model: modelName,
      system: systemPrompt,
      messages: [
        { role: "user", content: userPrompt }
      ],
      temperature: resolvedTemp,
      max_tokens: resolvedTokens,
      stream: false
    };
  } else {
    payload = {
      model: modelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: resolvedTemp,
      max_tokens: resolvedTokens,
      stream: false
    };
  }

  headers["Content-Type"] = "application/json";

  try {
    const res = await safeFetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (res.status === 200) {
      const parsed = await res.json();
      if (isAnthropic) {
        if (parsed.content && Array.isArray(parsed.content)) {
          return parsed.content[0]?.text || "";
        }
      } else {
        if (parsed.choices && parsed.choices.length > 0) {
          return parsed.choices[0].message?.content || "";
        }
      }
    }
  } catch (exc) {
    console.error("[LLM Client] Non-stream query failed:", exc);
  }
  return "";
}
