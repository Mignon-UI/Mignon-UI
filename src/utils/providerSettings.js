export function getProviderDefaultSettings(providerVal, currentModel, currentEndpoint) {
  let model = currentModel;
  let endpoint = currentEndpoint;
  if (providerVal === 'openrouter') {
    if (!model || ['dolphin-llama3', 'kobold-model'].includes(model)) {
      model = 'nousresearch/hermes-3-llama-3-8b';
    }
  } else if (providerVal === 'kobold') {
    if (!endpoint || endpoint === 'http://127.0.0.1:11434/v1' || endpoint === 'http://localhost:1234/v1') endpoint = 'http://127.0.0.1:5001/v1';
    if (!model || model === 'nousresearch/hermes-3-llama-3-8b') model = 'kobold-model';
  } else if (providerVal === 'custom') {
    if (!endpoint || endpoint === 'http://127.0.0.1:11434/v1' || endpoint === 'http://127.0.0.1:5001/v1') endpoint = 'http://localhost:1234/v1';
    if (!model || ['dolphin-llama3', 'kobold-model', 'nousresearch/hermes-3-llama-3-8b'].includes(model)) {
      model = 'custom-model';
    }
  } else {
    // ollama
    if (!endpoint || endpoint === 'http://127.0.0.1:5001/v1' || endpoint === 'http://localhost:1234/v1') endpoint = 'http://127.0.0.1:11434/v1';
    if (!model || model === 'nousresearch/hermes-3-llama-3-8b' || model === 'kobold-model') model = 'dolphin-llama3';
  }
  return { model, endpoint };
}
