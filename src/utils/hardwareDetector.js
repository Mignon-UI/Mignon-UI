// src/utils/hardwareDetector.js
// Game-Style Performance Presets and Auto-Hardware / Provider Detection

export const PERFORMANCE_PRESETS = {
  low: {
    key: 'low',
    label: 'Low',
    tag: 'Low',
    title: 'Speed / Low-Spec',
    desc: 'Optimized for budget laptops, CPUs, and 4GB VRAM. Fastest reply times.',
    cloud_desc: 'Fast & minimal token consumption. Best for saving API credits with concise replies.',
    max_tokens: 250,
    context_limit: 8,
    rag_top_k: 2,
    temperature: 0.70
  },
  medium: {
    key: 'medium',
    label: 'Medium',
    tag: 'Medium',
    title: 'Balanced (Standard)',
    desc: 'Optimal balance of speed and roleplay quality. Recommended for 6GB–8GB GPUs.',
    cloud_desc: 'Balanced story depth and token usage. Recommended default for daily roleplay.',
    max_tokens: 350,
    context_limit: 14,
    rag_top_k: 4,
    temperature: 0.85
  },
  high: {
    key: 'high',
    label: 'High',
    tag: 'High',
    title: 'Quality / Rich Detail',
    desc: 'Deep multi-paragraph narratives and world detail. Recommended for 12GB+ GPUs.',
    cloud_desc: 'Rich multi-paragraph narratives with expanded memory and deep lore context.',
    max_tokens: 600,
    context_limit: 20,
    rag_top_k: 6,
    temperature: 0.90
  },
  ultra: {
    key: 'ultra',
    label: 'Ultra',
    tag: 'Ultra',
    title: 'Immersive / Maximum',
    desc: 'Maximum memory depth and lore retrieval for high-spec dedicated hardware.',
    cloud_desc: 'Maximum context window and cinematic long-form generation (Highest token cost).',
    max_tokens: 1200,
    context_limit: 30,
    rag_top_k: 8,
    temperature: 0.95
  },
  custom: {
    key: 'custom',
    label: 'Custom',
    tag: 'Custom',
    title: 'Custom Tuned',
    desc: 'Manual slider values adjusted by you.',
    cloud_desc: 'Manual slider values adjusted by you.'
  }
};

let cachedGpuInfo = null;

// Automatically probe native system GPU on desktop
if (typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__)) {
  import('@tauri-apps/api/core').then(({ invoke }) => {
    invoke('get_system_gpu_info').then(name => {
      if (name && typeof name === 'string' && name.trim()) {
        cachedGpuInfo = name.trim();
      }
    }).catch(() => {});
  }).catch(() => {});
}

/**
 * Detects GPU renderer string via high-performance WebGL / WebGPU contexts
 */
function getGpuRenderer() {
  if (cachedGpuInfo) return cachedGpuInfo;
  if (typeof window === 'undefined') return '';

  try {
    const canvas = document.createElement('canvas');
    const glOptions = { powerPreference: 'high-performance', failIfMajorPerformanceCaveat: false };
    const gl = canvas.getContext('webgl2', glOptions) || 
               canvas.getContext('webgl', glOptions) || 
               canvas.getContext('experimental-webgl', glOptions);

    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const unmaskedRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '';
      const unmaskedVendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : '';
      const standardRenderer = gl.getParameter(gl.RENDERER) || '';
      const standardVendor = gl.getParameter(gl.VENDOR) || '';

      const combined = `${unmaskedVendor} ${unmaskedRenderer} ${standardVendor} ${standardRenderer}`.trim();
      if (combined) {
        cachedGpuInfo = combined;
        return combined;
      }
    }
  } catch {
    // Canvas context error fallback
  }

  // WebGPU async probe registration if available
  if (typeof navigator !== 'undefined' && navigator.gpu && !cachedGpuInfo) {
    try {
      navigator.gpu.requestAdapter({ powerPreference: 'high-performance' }).then(adapter => {
        if (adapter?.info) {
          const info = `${adapter.info.vendor || ''} ${adapter.info.architecture || ''} ${adapter.info.device || ''} ${adapter.info.description || ''}`.trim();
          if (info) cachedGpuInfo = info;
        }
      }).catch(() => {});
    } catch {
      // Ignore WebGPU init errors
    }
  }

  return cachedGpuInfo || '';
}

/**
 * Cleans up browser ANGLE / Google WebGL wrapper prefixes to show human-readable GPU names
 */
function formatCleanGpuName(rawGpu, cores = 4) {
  if (!rawGpu) return `${cores} CPU Cores / CUDA Engine`;

  // 1. Dedicated NVIDIA GPUs
  const nvidiaMatch = rawGpu.match(/(NVIDIA\s+GeForce\s+[A-Za-z0-9\s]+|NVIDIA\s+[A-Za-z0-9\s]+|RTX\s+[0-9A-Za-z\s]+|GTX\s+[0-9A-Za-z\s]+)/i);
  if (nvidiaMatch) {
    return nvidiaMatch[1].replace(/Direct3D.*/i, '').trim().slice(0, 35);
  }

  // 2. AMD Radeon GPUs
  const amdMatch = rawGpu.match(/(AMD\s+Radeon\s+[A-Za-z0-9\s]+|Radeon\s+RX\s+[0-9A-Za-z\s]+|Radeon\s+[0-9A-Za-z\s]+)/i);
  if (amdMatch) {
    return amdMatch[1].replace(/Direct3D.*/i, '').trim().slice(0, 35);
  }

  // 3. Apple Silicon GPUs
  const appleMatch = rawGpu.match(/(Apple\s+M[0-9]\s*(?:Pro|Max|Ultra)?)/i);
  if (appleMatch) {
    return appleMatch[1].trim();
  }

  // 4. Intel Arc & Integrated Graphics
  const intelMatch = rawGpu.match(/(Intel\s*(?:\(R\))?\s*(?:Iris(?:\s+Xe)?|UHD|HD|Arc)\s*Graphics(?:\s+[0-9A-Za-z]+)?|Intel\s+Arc\s+[A-Za-z0-9]+)/i);
  if (intelMatch) {
    return intelMatch[1].replace(/\(R\)/g, '').replace(/\s+/g, ' ').trim().slice(0, 35);
  }

  // 5. General fallback: strip "Google Inc." and "ANGLE (" wrappers
  const cleaned = rawGpu
    .replace(/Google\s+Inc\.\s*/gi, '')
    .replace(/ANGLE\s*\(/gi, '')
    .replace(/WebKit\s+WebGL/gi, '')
    .replace(/Direct3D[0-9A-Za-z_\s]*/gi, '')
    .replace(/[(),]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 35) || `${cores} CPU Cores`;
}

const isTauri = () => typeof window !== 'undefined' && (!!window.__TAURI_IPC__ || !!window.__TAURI_INTERNALS__);

/**
 * Evaluates hardware and active provider to determine optimal preset.
 */
export function detectRecommendedPreset(provider = 'ollama', customUrl = '') {
  // 1. Cloud providers: Balanced High Quality mode to optimize token costs
  if (provider === 'openrouter') {
    return {
      presetKey: 'high',
      reason: 'Cloud OpenRouter active → High Quality mode enabled with cost-efficient token limits.'
    };
  }

  if (provider === 'custom' && !customUrl.includes('127.0.0.1') && !customUrl.includes('localhost')) {
    return {
      presetKey: 'high',
      reason: 'Remote / Cloud API active → High Quality mode enabled with cost-efficient token limits.'
    };
  }

  // 2. Desktop Mode (Tauri): Accurate native OS hardware detection
  if (isTauri()) {
    const gpu = getGpuRenderer();
    const cleanGpuName = formatCleanGpuName(gpu);

    const highEndGpuRegex = /RTX\s*(3070|3080|3090|4070|4080|4090|A[1-9]\d{2,3}|H100)|Apple\s*M\d+\s*(Pro|Max|Ultra)/i;
    if (highEndGpuRegex.test(gpu)) {
      return {
        presetKey: 'high',
        reason: `High-End Hardware (${cleanGpuName}) → High Quality mode enabled.`
      };
    }

    return {
      presetKey: 'medium',
      reason: `Hardware Detected (${cleanGpuName}) → Balanced ~5s response mode enabled.`
    };
  }

  // 3. Web Browser Mode: Provide clean, reliable defaults without misleading canvas guesses
  return {
    presetKey: 'medium',
    reason: 'Local Engine active → Balanced ~5s response mode enabled.'
  };
}

/**
 * Checks if current form settings match any predefined preset.
 */
export function matchCurrentPreset(form) {
  for (const [key, preset] of Object.entries(PERFORMANCE_PRESETS)) {
    if (key === 'custom') continue;
    if (
      form.max_tokens === preset.max_tokens &&
      form.context_limit === preset.context_limit &&
      form.rag_top_k === preset.rag_top_k &&
      Math.abs(form.temperature - preset.temperature) < 0.01
    ) {
      return key;
    }
  }
  return 'custom';
}

