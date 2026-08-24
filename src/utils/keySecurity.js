// src/utils/keySecurity.js
// Secure encryption and decryption helpers calling Tauri Rust commands.

import { invoke } from '@tauri-apps/api/core';

const isTauri = () => typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__);

export async function encryptKey(plaintext) {
  if (!isTauri()) return plaintext;
  try {
    return await invoke('encrypt_key', { plaintext });
  } catch (e) {
    console.error("[KeySecurity] Encryption failed:", e);
    return plaintext;
  }
}

export async function decryptKey(encryptedStr) {
  if (!encryptedStr) return "";
  if (!encryptedStr.startsWith("enc::")) return encryptedStr;

  if (!isTauri()) {
    console.warn("[KeySecurity] Cannot decrypt key starting with 'enc::' in browser mode. Please re-enter your API key in Settings.");
    return "";
  }
  try {
    return await invoke('decrypt_key', { ciphertext: encryptedStr });
  } catch (e) {
    console.error("[KeySecurity] Decryption failed:", e);
    return "";
  }
}
