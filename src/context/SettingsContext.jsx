/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import * as api from '../services/api';
import { getProviderDefaultSettings } from '../utils/providerSettings';
import { PERFORMANCE_PRESETS, detectRecommendedPreset } from '../utils/hardwareDetector';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState({});
  const [engineStatus, setEngineStatus] = useState('Checking Engine...');
  const [engineOnline, setEngineOnline] = useState(false);

  const [settingsForm, setSettingsForm] = useState({
    provider: 'ollama',
    openrouter_key: '',
    custom_key: '',
    local_endpoint: 'http://127.0.0.1:11434/v1',
    selected_model: '',
    temperature: 0.85,
    max_tokens: 350,
    context_limit: 14,
    rag_top_k: 4,
    performance_preset: 'auto',
    system_template: '',
    persona_name: 'User',
    persona_avatar: null,
    persona_description: '',
    persona_character_id: null,
    cloud_rate_limit: 15,
    current_profile_id: null,
  });

  const applySettingsToForm = useCallback((data) => {
    setSettingsForm({
      provider: data.provider || 'ollama',
      openrouter_key: data.openrouter_key || '',
      custom_key: data.custom_key || '',
      local_endpoint: data.local_endpoint || 'http://127.0.0.1:11434/v1',
      selected_model: data.selected_model || '',
      temperature: data.temperature !== undefined ? data.temperature : 0.85,
      max_tokens: data.max_tokens !== undefined ? data.max_tokens : 350,
      context_limit: data.context_limit !== undefined ? data.context_limit : 14,
      rag_top_k: data.rag_top_k !== undefined ? data.rag_top_k : 4,
      performance_preset: data.performance_preset || 'auto',
      system_template: data.system_template || '',
      persona_name: data.persona_name || 'User',
      persona_avatar: data.persona_avatar || null,
      persona_description: data.persona_description || '',
      persona_character_id: data.persona_character_id || null,
      cloud_rate_limit: data.cloud_rate_limit !== undefined ? data.cloud_rate_limit : 15,
      current_profile_id: data.current_profile_id !== undefined ? data.current_profile_id : null,
    });
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      await api.initializeApp(); // Initialize SQLite tables and seed defaults
      const data = await api.fetchSettings();
      setSettings(data);
      applySettingsToForm(data);
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }, [applySettingsToForm]);

  const checkEngineConnection = useCallback(async () => {
    try {
      const data = await api.testConnection();
      if (data.status === 'success') {
        setEngineOnline(true);
        setEngineStatus(data.message);
        if (data.active_model) {
          setSettings(prev => {
            const modelChanged = prev.selected_model !== data.active_model;
            if (modelChanged) {
              setSettingsForm(form => {
                // Only update form if the user hasn't actively modified it from current settings.selected_model
                if (form.selected_model === prev.selected_model) {
                  return { ...form, selected_model: data.active_model };
                }
                return form;
              });
            }
            return { ...prev, selected_model: data.active_model };
          });
        }
        return data;
      } else {
        setEngineOnline(false);
        setEngineStatus(data.message || 'Engine Offline');
        return data;
      }
    } catch (e) {
      setEngineOnline(false);
      setEngineStatus('Engine Offline');
      return { status: 'disconnected', message: e?.message || 'Engine Offline' };
    }
  }, []);

  const handleSettingsSubmit = useCallback(async (form) => {
    const data = await api.saveSettings(form);
    setSettings(data);
    await checkEngineConnection();
    return data;
  }, [checkEngineConnection]);

  const applyPerformancePreset = useCallback((presetKey) => {
    if (presetKey === 'custom') {
      setSettingsForm(prev => ({ ...prev, performance_preset: 'custom' }));
      return;
    }

    if (presetKey === 'auto') {
      setSettingsForm(prev => {
        const detected = detectRecommendedPreset(prev.provider, prev.local_endpoint);
        const targetPreset = PERFORMANCE_PRESETS[detected.presetKey] || PERFORMANCE_PRESETS.medium;
        return {
          ...prev,
          performance_preset: 'auto',
          temperature: targetPreset.temperature,
          max_tokens: targetPreset.max_tokens,
          context_limit: targetPreset.context_limit,
          rag_top_k: targetPreset.rag_top_k,
        };
      });
      return;
    }

    const targetPreset = PERFORMANCE_PRESETS[presetKey];
    if (targetPreset) {
      setSettingsForm(prev => ({
        ...prev,
        performance_preset: presetKey,
        temperature: targetPreset.temperature,
        max_tokens: targetPreset.max_tokens,
        context_limit: targetPreset.context_limit,
        rag_top_k: targetPreset.rag_top_k,
      }));
    }
  }, []);

  const handleSettingsProviderChange = useCallback((providerVal) => {
    setSettingsForm(prev => {
      const { model, endpoint } = getProviderDefaultSettings(providerVal, prev.selected_model, prev.local_endpoint);
      let updatedPresetValues = {};
      if (prev.performance_preset === 'auto') {
        const detected = detectRecommendedPreset(providerVal, endpoint);
        const target = PERFORMANCE_PRESETS[detected.presetKey] || PERFORMANCE_PRESETS.medium;
        updatedPresetValues = {
          temperature: target.temperature,
          max_tokens: target.max_tokens,
          context_limit: target.context_limit,
          rag_top_k: target.rag_top_k
        };
      }
      return { 
        ...prev, 
        provider: providerVal, 
        selected_model: model, 
        local_endpoint: endpoint,
        ...updatedPresetValues
      };
    });
  }, []);

  const resetForm = useCallback(() => {
    applySettingsToForm(settings);
  }, [applySettingsToForm, settings]);

  // Boot sync
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkEngineConnection();
    const interval = setInterval(checkEngineConnection, 15000);
    return () => clearInterval(interval);
  }, [checkEngineConnection]);

  const value = useMemo(() => ({
    settings, setSettings,
    settingsForm, setSettingsForm,
    engineStatus, engineOnline,
    fetchSettings, checkEngineConnection,
    handleSettingsSubmit, handleSettingsProviderChange,
    applyPerformancePreset,
    resetForm, applySettingsToForm,
  }), [
    settings,
    settingsForm,
    engineStatus, engineOnline,
    fetchSettings, checkEngineConnection,
    handleSettingsSubmit, handleSettingsProviderChange,
    applyPerformancePreset,
    resetForm, applySettingsToForm,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettingsContext must be used within SettingsProvider');
  return ctx;
}
