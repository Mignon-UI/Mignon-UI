// src/services/llmClient.js
// Client-side LLM connection manager. Communicates with LLMs (Ollama, Kobold, OpenRouter, Anthropic) 
// using CORS-free Tauri HTTP fetch. Handles SSE token streams.
import { invoke } from '@tauri-apps/api/core';
import { safeFetch } from '../utils/safeFetch';
import { runInWorker } from './rag';

import { APP_NAME } from '../config';

const isTauri = () => typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__);

// Secure key helpers calling Tauri Rust commands
export async function encryptKey(plaintext) {
  if (!isTauri()) return plaintext;
  try {
    return await invoke('encrypt_key', { plaintext });
  } catch (e) {
    console.error("[LLM Client] Encryption failed:", e);
    return plaintext;
  }
}

export async function decryptKey(encryptedStr) {
  if (!encryptedStr) return "";
  if (!encryptedStr.startsWith("enc::")) return encryptedStr;

  if (!isTauri()) {
    console.warn("[LLM Client] Cannot decrypt key starting with 'enc::' in browser mode. Please re-enter your API key in Settings.");
    return "";
  }

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
    headers["Authorization"] = `Bearer ${await decryptKey(settings.openrouter_key)}`;
    headers["HTTP-Referer"] = `https://github.com/Deep-Hex/Mignon-UI`;
    headers["X-Title"] = APP_NAME;
  } else if (settings?.provider === "custom" && settings?.custom_key) {
    const apiKey = await decryptKey(settings.custom_key);
    modelName = settings.selected_model || "custom-model";
    if (url.includes("api.anthropic.com")) {
      if (!url.endsWith("/v1/messages") && !url.endsWith("/messages")) {
        url = `${url.replace(/\/v1$/, "").replace(/\/$/, "")}/v1/messages`;
      }
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  }

  // Suffix standard OpenAI endpoints
  if (!url.includes("api.anthropic.com") && (url.endsWith("/v1") || url.endsWith("/v1/"))) {
    url = `${url.replace(/\/$/, "")}/chat/completions`;
  }

  return { url, modelName, headers };
}

function buildPayload(model, system, user, temp, maxTokens, stream, isAnthropic) {
  return {
    model,
    temperature: temp,
    max_tokens: maxTokens,
    stream,
    ...(isAnthropic 
      ? { system, messages: [{ role: "user", content: user }] }
      : { messages: [{ role: "system", content: system }, { role: "user", content: user }] })
  };
}

// Stream LLM chat completions via Server-Sent Events (SSE)
export async function streamLlmResponse(settings, systemPrompt, userPrompt, onToken, signal) {
  const { url, modelName, headers } = await resolveLlmEndpoint(settings);
  const isAnthropic = url.includes("api.anthropic.com");

  const payload = buildPayload(
    modelName, 
    systemPrompt, 
    userPrompt, 
    settings?.temperature || 0.9, 
    settings?.max_tokens || 2048, 
    true, 
    isAnthropic
  );

  headers["Content-Type"] = "application/json";

  const taskId = `stream-${Math.random().toString(36).substring(2, 11)}`;

  // 1. Offload streaming to Tauri Rust backend if running inside desktop/mobile build
  if (isTauri()) {
    const { listen } = await import('@tauri-apps/api/event');
    
    let unlistenToken = null;
    let unlistenDone = null;
    let unlistenError = null;
    let finished = false;

    const cleanup = () => {
      finished = true;
      if (unlistenToken) unlistenToken();
      if (unlistenDone) unlistenDone();
      if (unlistenError) unlistenError();
    };

    try {
      unlistenToken = await listen(`llm-token-${taskId}`, (event) => {
        if (!finished) onToken(event.payload);
      });

      const donePromise = new Promise((resolve, reject) => {
        listen(`llm-done-${taskId}`, () => {
          cleanup();
          resolve();
        }).then(un => { unlistenDone = un; });

        listen(`llm-error-${taskId}`, (event) => {
          cleanup();
          reject(new Error(event.payload));
        }).then(un => { unlistenError = un; });
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          cleanup();
          invoke('abort_llm_stream_rust', { taskId }).catch(e => {
            console.error('[LLM Client] Abort request failed:', e);
          });
        }, { once: true });
      }

      await invoke('stream_llm_response_rust', {
        url,
        headers,
        payload,
        taskId
      });

      await donePromise;
      return;
    } catch (err) {
      cleanup();
      if (signal?.aborted) {
        console.log("[LLM Client] Stream aborted by caller.");
      } else {
        console.error("[LLM Client] Rust stream error:", err);
        throw err;
      }
      return;
    }
  }

  // 2. Offload streaming to Web Worker if running in browser (web demo)
  try {
    if (signal) {
      signal.addEventListener('abort', () => {
        runInWorker('ABORT_LLM_STREAM', { taskId }).catch(e => {
          console.error('[LLM Client] Worker abort failed:', e);
        });
      }, { once: true });
    }

    await runInWorker('START_LLM_STREAM', {
      url,
      payload,
      headers,
      taskId
    }, onToken);

    return;
  } catch (err) {
    if (signal?.aborted) {
      console.log("[LLM Client] Stream aborted by caller.");
    } else {
      console.error("[LLM Client] Worker streaming connection error:", err);
      throw err;
    }
  }
}

// Query LLM synchronously (non-streaming)
export async function queryLlmNonStream(settings, systemPrompt, userPrompt, temperature = null, maxTokens = null) {
  const { url, modelName, headers } = await resolveLlmEndpoint(settings);
  const isAnthropic = url.includes("api.anthropic.com");

  const payload = buildPayload(
    modelName, 
    systemPrompt, 
    userPrompt, 
    temperature !== null ? temperature : (settings?.temperature || 0.9), 
    maxTokens !== null ? maxTokens : (settings?.max_tokens || 2048), 
    false, 
    isAnthropic
  );

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
