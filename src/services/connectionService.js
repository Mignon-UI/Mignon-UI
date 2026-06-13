// src/services/connectionService.js
// Client-side connection manager. Validates connectivity to Ollama, Kobold, OpenRouter, and Custom APIs.

import { getDb } from './db';
import { safeFetch } from '../utils/safeFetch';
import * as llm from './llmClient';

function extractActiveModel(json, currentModel) {
  if (!json) return null;

  const isEmbeddingModel = (name) => {
    if (!name) return false;
    const lower = name.toLowerCase();
    return (
      lower.includes('embed') ||
      lower.includes('bge') ||
      lower.includes('nomic') ||
      lower.includes('mxbai') ||
      lower.includes('colbert') ||
      lower.includes('minilm')
    );
  };

  if (json.data && Array.isArray(json.data) && json.data.length > 0) {
    const modelIds = json.data.map(m => m.id);
    if (currentModel && modelIds.includes(currentModel) && !isEmbeddingModel(currentModel)) {
      return currentModel;
    }
    const nonEmbedModel = modelIds.find(id => !isEmbeddingModel(id));
    return nonEmbedModel || json.data[0].id;
  }
  if (json.models && Array.isArray(json.models) && json.models.length > 0) {
    const modelIds = json.models.map(m => m.name || m.id);
    if (currentModel && modelIds.includes(currentModel) && !isEmbeddingModel(currentModel)) {
      return currentModel;
    }
    const nonEmbedModel = modelIds.find(id => !isEmbeddingModel(id));
    return nonEmbedModel || (json.models[0].name || json.models[0].id);
  }
  return null;
}

export async function testConnection() {
  try {
    const dbInst = await getDb();
    const settingsRows = await dbInst.select("SELECT * FROM settings WHERE id = 1");
    const settings = settingsRows[0] || null;
    const endpoint = settings?.local_endpoint || "http://127.0.0.1:11434/v1";
    const provider = settings?.provider || "ollama";
    
    let base = endpoint.split("/v1")[0].replace("/chat/completions", "").replace(/\/$/, "");
    
    if (provider === "openrouter") {
      const url = "https://openrouter.ai/api/v1/models";
      const apiKey = await llm.decryptKey(settings.openrouter_key);
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const res = await safeFetch(url, { headers, method: "GET" });
      if (res.ok) {
        return { status: "success", message: "OpenRouter Online" };
      }
      return { status: "disconnected", message: `OpenRouter status ${res.status}` };
    }
    
    if (provider === "custom" && settings?.custom_key) {
      const apiKey = await llm.decryptKey(settings.custom_key);
      if (base.includes("anthropic.com")) {
        const url = base.endsWith("/v1") ? `${base}/messages` : `${base}/v1/messages`;
        const headers = {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        };
        const payload = {
          model: settings.selected_model || "claude-3-5-sonnet-latest",
          messages: [{ role: "user", content: "Ping" }],
          max_tokens: 1
        };
        const res = await safeFetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });
        if (res.ok || res.status === 400) {
          return { status: "success", message: "Custom API Online" };
        }
        return { status: "disconnected", message: `Custom API Status ${res.status}` };
      } else {
        const url = base.endsWith("/v1") ? `${base}/models` : `${base}/v1/models`;
        const headers = { "Authorization": `Bearer ${apiKey}` };
        const res = await safeFetch(url, { headers, method: "GET" });
        if (res.ok) {
          return { status: "success", message: "Custom API Online" };
        }
        return { status: "disconnected", message: `Custom API status ${res.status}` };
      }
    }

    // Local Ollama / Kobold
    let activeModel = null;
    let connectionSuccess = false;

    // 1. Try standard OpenAI-compat /v1/models endpoint
    try {
      const modelsUrl = `${base}/v1/models`;
      const res = await safeFetch(modelsUrl, { method: "GET" });
      if (res.ok) {
        connectionSuccess = true;
        const json = await res.json();
        activeModel = extractActiveModel(json, settings?.selected_model);
      }
    } catch {
      // ignore
    }

    // 2. Try native endpoints for model detection
    if (!activeModel) {
      try {
        if (provider === "kobold") {
          const resNative = await safeFetch(`${base}/api/v1/model`, { method: "GET" });
          if (resNative.ok) {
            connectionSuccess = true;
            const data = await resNative.json();
            activeModel = data.result;
          }
        } else if (provider === "ollama") {
          const resPs = await safeFetch(`${base}/api/ps`, { method: "GET" });
          if (resPs.ok) {
            connectionSuccess = true;
            const data = await resPs.json();
            const runningModels = data.models || [];
            const embedKeywords = ["embed", "bge", "minilm", "e5-", "nomic", "gte-"];
            const runningChatModels = runningModels.filter(m => 
              !embedKeywords.some(kw => (m.name || "").toLowerCase().includes(kw))
            );
            if (runningChatModels.length > 0) {
              activeModel = runningChatModels[0].name;
            }
          }

          if (!activeModel) {
            const resTags = await safeFetch(`${base}/api/tags`, { method: "GET" });
            if (resTags.ok) {
              connectionSuccess = true;
              const data = await resTags.json();
              const installed = data.models || [];
              const embedKeywords = ["embed", "bge", "minilm", "e5-", "nomic", "gte-"];
              const chatModels = installed.filter(m => 
                !embedKeywords.some(kw => (m.name || "").toLowerCase().includes(kw))
              );
              if (chatModels.length > 0) {
                activeModel = chatModels[0].name;
              } else if (installed.length > 0) {
                activeModel = installed[0].name;
              }
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Fallback: root check
    if (!connectionSuccess) {
      try {
        const resRoot = await safeFetch(base, { method: "GET" });
        if (resRoot.ok) {
          connectionSuccess = true;
        } else {
          const body = await resRoot.text();
          if (body.includes("Ollama") || body.includes("Kobold") || body.includes("lite")) {
            connectionSuccess = true;
          }
        }
      } catch {
        // ignore
      }
    }

    if (!connectionSuccess) {
      return { status: "disconnected", message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} unreachable` };
    }

    // Auto-update selected_model if detected and changed
    if (activeModel && settings?.selected_model !== activeModel) {
      await dbInst.execute("UPDATE settings SET selected_model = ? WHERE id = 1", [activeModel]);
    }

    return {
      status: "success",
      message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Online`,
      active_model: activeModel || settings?.selected_model
    };
  } catch (e) {
    console.error("[API] testConnection failed:", e);
    return { status: "disconnected", message: e.message || "Engine Offline" };
  }
}
