// src/services/turnTaking.js
// Router for the Psychological Turn-Taking Model (Formula 3).
// Routes computation to Tauri Rust threads, Web Workers, or main-thread fallback depending on environment.

import { invoke } from '@tauri-apps/api/core';
import { runInWorker } from './rag';
import { runMainThreadEfficientSelector } from '../utils/turnTakingMath';

const isTauri = () => typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__);

// Selects next speaker (character ID) using the local Keyword-Matrix Efficient model (offloaded)
export async function runEfficientSelector(messageContent, bots, messages, sceneState = null) {
  if (!bots || bots.length === 0) return null;
  if (bots.length === 1) return bots[0].id;

  const lastMsg = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  let tau = 0;
  if (lastMsg?.created_at) {
    const delta = Date.now() - new Date(lastMsg.created_at).getTime();
    if (!isNaN(delta)) tau = Math.max(0, delta / 1000);
  }

  // 1. Offload to Tauri Rust backend if running inside desktop/mobile build
  if (isTauri()) {
    try {
      const sanitizedBots = bots.map(b => ({
        id: b.id,
        name: b.name,
        personality: b.personality || null,
        scenario: b.scenario || null
      }));
      const sanitizedMessages = messages.map(m => ({
        sender_name: m.sender_name,
        sender_type: m.sender_type,
        content: m.content || ""
      }));
      
      return await invoke('run_efficient_selector_rust', {
        messageContent: messageContent || "",
        bots: sanitizedBots,
        messages: sanitizedMessages,
        sceneState: sceneState || null,
        tau
      });
    } catch (e) {
      console.error('[TurnTaking] Rust selector offload failed, falling back:', e);
    }
  }

  // 2. Offload to Web Worker if running inside browser (web demo)
  if (typeof runInWorker === 'function') {
    try {
      return await runInWorker('RUN_EFFICIENT_SELECTOR', {
        messageContent,
        bots,
        messages,
        sceneState
      });
    } catch (e) {
      console.error('[TurnTaking] Worker selector offload failed, running on main thread fallback:', e);
    }
  }

  // 3. Fallback to main thread (Node.js tests, worker errors)
  return runMainThreadEfficientSelector(messageContent, bots, messages, sceneState);
}
