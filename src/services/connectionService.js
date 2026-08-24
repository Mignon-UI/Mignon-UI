// src/services/connectionService.js
// Client-side connection manager. Validates connectivity to Ollama, Kobold, OpenRouter, and Custom APIs.

import { getDb } from './db';
import { safeFetch } from '../utils/safeFetch';
import { decryptKey } from '../utils/keySecurity';

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
      const apiKey = await decryptKey(settings.openrouter_key);
      const headers = { "Authorization": `Bearer ${apiKey}` };
      const res = await safeFetch(url, { headers, method: "GET" });
      if (res.ok) {
        return { status: "success", message: "OpenRouter Online" };
      }
      return { status: "disconnected", message: `OpenRouter status ${res.status}` };
    }
    
    if (provider === "custom" && settings?.custom_key) {
      const apiKey = await decryptKey(settings.custom_key);
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

    // Local Ollama / Kobold / Custom Local
    let connectionSuccess = false;

    // 1. Try standard OpenAI-compat /v1/models endpoint to verify connectivity
    try {
      const modelsUrl = `${base}/v1/models`;
      const res = await safeFetch(modelsUrl, { method: "GET" });
      if (res.ok) {
        connectionSuccess = true;
      }
    } catch {
      // ignore
    }

    // 2. Fallback: Check the root URL
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

    return {
      status: "success",
      message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} Online`
    };
  } catch (e) {
    console.error("[API] testConnection failed:", e);
    return { status: "disconnected", message: e.message || "Engine Offline" };
  }
}
