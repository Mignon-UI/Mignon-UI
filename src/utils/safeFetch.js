import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export const isTauri = typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__);

export const safeFetch = (url, options) => {
  let targetUrl = url;
  if (!isTauri && typeof url === 'string') {
    targetUrl = url.replace(/^https?:\/\/(127\.0\.0\.1|localhost):11434/, '/api-proxy');
  }
  return isTauri ? tauriFetch(targetUrl, options) : window.fetch(targetUrl, options);
};
