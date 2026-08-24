import { useState, useEffect, useRef } from 'react';
import { useUIContext } from '../../context/UIContext';
import { useSettingsContext } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import * as api from '../../services/api';
import { 
  Sun, Moon, Monitor, User as UserIcon, Check, 
  ArrowRight, ArrowLeft, Info, Cpu, Activity, Loader2
} from 'lucide-react';
import Logo from '../UI/Logo';
import { getThemeSwatches } from '../../utils/themeHelper';

export default function OnboardingModal() {
  const ui = useUIContext();
  const settings = useSettingsContext();
  const { toast } = useToast();
  
  const [step, setStep] = useState(1);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [form, setForm] = useState({
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

  const avatarInputRef = useRef(null);

  // Sync state from settings when modal is opened or settings loaded
  useEffect(() => {
    if (settings.settings) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm(prev => ({
        ...prev,
        provider: settings.settings.provider || 'ollama',
        openrouter_key: settings.settings.openrouter_key || '',
        custom_key: settings.settings.custom_key || '',
        local_endpoint: settings.settings.local_endpoint || 'http://127.0.0.1:11434/v1',
        selected_model: settings.settings.selected_model || '',
        temperature: settings.settings.temperature !== undefined ? settings.settings.temperature : 0.85,
        max_tokens: settings.settings.max_tokens !== undefined ? settings.settings.max_tokens : 350,
        context_limit: settings.settings.context_limit !== undefined ? settings.settings.context_limit : 14,
        rag_top_k: settings.settings.rag_top_k !== undefined ? settings.settings.rag_top_k : 4,
        performance_preset: settings.settings.performance_preset || 'auto',
        system_template: settings.settings.system_template || '',
        persona_name: settings.settings.persona_name || 'User',
        persona_avatar: settings.settings.persona_avatar || null,
        persona_description: settings.settings.persona_description || '',
        persona_character_id: settings.settings.persona_character_id || null,
        cloud_rate_limit: settings.settings.cloud_rate_limit !== undefined ? settings.settings.cloud_rate_limit : 15,
        current_profile_id: settings.settings.current_profile_id !== undefined ? settings.settings.current_profile_id : null,
      }));
    }
  }, [settings.settings]);

  if (!ui.showOnboarding) return null;

  const handleProviderChange = (providerVal) => {
    let endpoint = 'http://127.0.0.1:11434/v1';
    let model = '';
    
    if (providerVal === 'kobold') {
      endpoint = 'http://127.0.0.1:5001/v1';
    } else if (providerVal === 'openrouter') {
      endpoint = 'https://openrouter.ai/api/v1';
      model = 'meta-llama/llama-3.1-8b-instruct:free';
    } else if (providerVal === 'custom') {
      endpoint = 'https://api.openai.com/v1';
    }

    setForm(prev => ({
      ...prev,
      provider: providerVal,
      local_endpoint: endpoint,
      selected_model: model
    }));
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    try {
      // First save to the database to ensure testConnection uses the input values
      const data = await api.saveSettings(form);
      settings.setSettings(data);
      // Wait a moment for write completion, then test connection
      await settings.checkEngineConnection();
      
      // We read the actual updated state of connection from settings context
      setTimeout(() => {
        if (settings.engineOnline) {
          toast.success("Connection successful!");
        } else {
          toast.error("Failed to connect. Please check endpoint and credentials.");
        }
        setIsTestingConnection(false);
      }, 800);
    } catch {
      toast.error("Error updating connection configuration.");
      setIsTestingConnection(false);
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm(prev => ({ ...prev, persona_avatar: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const saveStepData = async () => {
    try {
      // Direct save to SQLite without triggering blocking checkEngineConnection
      const data = await api.saveSettings(form);
      settings.setSettings(data);
    } catch (err) {
      console.error("Failed to save step configuration:", err);
    }
  };

  const handleNext = async () => {
    if (step === 3) {
      // Save API credentials instantly
      await saveStepData();
    } else if (step === 4) {
      // Save Persona profile details instantly
      if (!form.persona_name || !form.persona_name.trim()) {
        toast.warning("Please enter your persona name.");
        return;
      }
      await saveStepData();
    }
    
    setStep(prev => prev + 1);
  };

  const handleBack = () => {
    setStep(prev => prev - 1);
  };

  const handleFinish = async () => {
    await saveStepData();
    // Non-blocking connection check on finish
    settings.checkEngineConnection();
    ui.completeOnboarding();
    toast.success("Welcome aboard!");
  };

  const progressPercent = ((step - 1) / 4) * 100;

  return (
    <div className="onboarding-backdrop">
      <div className="onboarding-container">
        
        {/* Progress Bar */}
        <div className="onboarding-progress">
          <div className="onboarding-progress-fill" style={{ width: `${progressPercent}%` }}></div>
        </div>

        {/* Header */}
        <div className="onboarding-header">
          <div className="onboarding-title-area">
            <span className="onboarding-eyebrow">
              {step === 1 && "✦ Welcome to Mignon ✦"}
              {step === 2 && "✦ Interface Aesthetics ✦"}
              {step === 3 && "✦ Language Core ✦"}
              {step === 4 && "✦ Roleplay Profile ✦"}
              {step === 5 && "✦ Setup Finished ✦"}
            </span>
            <h2 className="onboarding-header-title">
              {step === 1 && "Just You and the Bots"}
              {step === 2 && "Choose UI Theme"}
              {step === 3 && "Connect LLM Provider"}
              {step === 4 && "Define Your Persona"}
              {step === 5 && "Workspace Ready!"}
            </h2>
          </div>
          <span className="onboarding-step-counter">Step {step} of 5</span>
        </div>

        {/* Scrollable Body */}
        <div className="onboarding-body scrollbar-custom">
          
          {/* STEP 1: WELCOME */}
          {step === 1 && (
            <div className="onboarding-step-content">
              <div className="onboarding-welcome-hero">
                <div className="onboarding-mascot-wrapper">
                  <div className="onboarding-mascot-glow"></div>
                  <Logo size={null} svgClassName="y2k-mascot-svg" />
                </div>
                <h1 className="onboarding-welcome-title">Mignon <span>UI</span></h1>
                <p className="onboarding-welcome-desc">
                  Welcome to Mignon, a premium front-end for immersive local and cloud roleplay. 
                  Let's configure your workspace in just a few quick steps.
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: CHOOSE UI THEME */}
          {step === 2 && (
            <div className="onboarding-step-content">
              <div className="onboarding-theme-section">
                <p style={{ fontSize: '0.9rem', color: 'var(--text-sec)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                  Choose your visual design theme and light/dark preference. The wizard will update instantly!
                </p>

                {/* Light/Dark Toggle */}
                <div className="onboarding-theme-mode-toggle">
                  <div 
                    className={`onboarding-theme-mode-btn ${ui.theme === 'system' ? 'active light' : ''}`}
                    onClick={() => ui.setTheme('system')}
                  >
                    <Monitor size={16} /> System Default
                  </div>
                  <div 
                    className={`onboarding-theme-mode-btn ${ui.theme === 'light' ? 'active light' : ''}`}
                    onClick={() => ui.setTheme('light')}
                  >
                    <Sun size={16} /> Light Mode
                  </div>
                  <div 
                    className={`onboarding-theme-mode-btn ${ui.theme === 'dark' ? 'active dark' : ''}`}
                    onClick={() => ui.setTheme('dark')}
                  >
                    <Moon size={16} /> Dark Mode
                  </div>
                </div>

                {/* Theme Cards Grid */}
                <div className="onboarding-theme-grid">
                  {ui.THEMES.map((t) => {
                    const isActive = ui.themeDesign === t.id;
                    const isDark = ui.resolvedTheme === 'dark';
                    const swatches = getThemeSwatches(t.id, isDark);

                    return (
                      <div 
                        key={t.id}
                        className={`onboarding-theme-item ${isActive ? 'active' : ''}`}
                        onClick={() => ui.setThemeDesign(t.id)}
                      >
                        <div className="onboarding-theme-item-header">
                          <span className="onboarding-theme-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {t.name}
                            {isActive && <Check size={16} style={{ color: 'var(--pink)' }} />}
                          </span>
                          <div className="onboarding-theme-swatches">
                            {swatches.map((c, i) => (
                              <span 
                                key={i} 
                                className="onboarding-theme-swatch"
                                style={{ background: c }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CONNECT AI ENGINE */}
          {step === 3 && (
            <div className="onboarding-step-content">
              <div className="onboarding-connection-section">
                <p style={{ fontSize: '0.9rem', color: 'var(--text-sec)', margin: 0, lineHeight: 1.45 }}>
                  Choose your Large Language Model source. We support local engines for total privacy, and cloud providers for quick startup.
                </p>

                {/* Connection Status Panel */}
                <div className="onboarding-status-container">
                  <div className="onboarding-status-indicator">
                    <span className={`onboarding-status-dot ${settings.engineOnline ? 'online' : 'offline'}`}></span>
                    <span>{settings.engineStatus}</span>
                  </div>
                  <button
                    type="button"
                    className="secondary-btn onboarding-test-btn"
                    disabled={isTestingConnection}
                    onClick={handleTestConnection}
                  >
                    {isTestingConnection ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Activity size={14} />
                    )}
                    Test Connection
                  </button>
                </div>

                {/* Provider Select */}
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={15} /> AI LLM Provider
                  </label>
                  <select
                    value={form.provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                  >
                    <option value="ollama">Ollama</option>
                    <option value="kobold">Kobold.cpp</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="custom">Custom (OpenAI Compatible)</option>
                  </select>
                </div>

                {/* Local & Custom Endpoints */}
                {form.provider !== 'openrouter' && (
                  <div className="form-group">
                    <label>{form.provider === 'custom' ? "API Endpoint URL" : "Local Endpoint URL"}</label>
                    <input
                      type="text"
                      placeholder={form.provider === 'custom' ? 'https://api.openai.com/v1' : 'http://127.0.0.1:11434/v1'}
                      value={form.local_endpoint}
                      onChange={(e) => setForm(prev => ({ ...prev, local_endpoint: e.target.value }))}
                    />
                    <small className="help-text">
                      {form.provider === 'ollama' && "Ollama default: http://127.0.0.1:11434/v1"}
                      {form.provider === 'kobold' && "Kobold.cpp default: http://127.0.0.1:5001/v1"}
                      {form.provider === 'custom' && "Groq, Gemini, DeepSeek, or custom host address"}
                    </small>
                  </div>
                )}

                {/* OpenRouter API Key */}
                {form.provider === 'openrouter' && (
                  <div className="form-group">
                    <label>OpenRouter API Key</label>
                    <input
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={form.openrouter_key}
                      onChange={(e) => setForm(prev => ({ ...prev, openrouter_key: e.target.value }))}
                    />
                    <small className="help-text">Keys are stored securely on your local disk only.</small>
                  </div>
                )}

                {/* Custom API Key */}
                {form.provider === 'custom' && (
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      placeholder="Enter API key..."
                      value={form.custom_key}
                      onChange={(e) => setForm(prev => ({ ...prev, custom_key: e.target.value }))}
                    />
                  </div>
                )}

                {/* Model Name */}
                <div className="form-group">
                  <label>Model Name / ID</label>
                  <input
                    type="text"
                    placeholder="e.g. llama3, deepseek-coder..."
                    value={form.selected_model}
                    onChange={(e) => setForm(prev => ({ ...prev, selected_model: e.target.value }))}
                  />
                  <small className="help-text">Leave blank to let the system auto-detect the active running model.</small>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: PROFILE CREATION */}
          {step === 4 && (
            <div className="onboarding-step-content">
              <div className="onboarding-connection-section">
                <p style={{ fontSize: '0.9rem', color: 'var(--text-sec)', margin: 0, lineHeight: 1.45 }}>
                  Define your persona. Bots will respond to you using this name and refer to this backstory.
                </p>

                {/* Avatar and Name row */}
                <div className="onboarding-profile-avatar-row">
                  <div 
                    className="onboarding-avatar-box"
                    onClick={() => avatarInputRef.current?.click()}
                    title="Upload Avatar"
                  >
                    {form.persona_avatar ? (
                      <img src={form.persona_avatar} alt="Persona avatar" />
                    ) : (
                      <div className="onboarding-avatar-placeholder">
                        <UserIcon size={24} />
                        <span>Upload</span>
                      </div>
                    )}
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleAvatarChange}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <label>Your Persona Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Commander, Aria, Detective..."
                      value={form.persona_name}
                      onChange={(e) => setForm(prev => ({ ...prev, persona_name: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Bio / Backstory */}
                <div className="form-group">
                  <label>Backstory / Character Description</label>
                  <textarea
                    rows="4"
                    placeholder="Describe your character's personality, background, or quirks..."
                    value={form.persona_description}
                    onChange={(e) => setForm(prev => ({ ...prev, persona_description: e.target.value }))}
                  />
                  <small className="help-text">This will be injected dynamically into character system prompts.</small>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: ALL SET */}
          {step === 5 && (
            <div className="onboarding-step-content">
              <div className="onboarding-celebration">
                <div className="onboarding-success-icon-wrapper">
                  <Check size={40} />
                </div>
                <h2 className="onboarding-success-title">All Configured!</h2>
                <p className="onboarding-success-desc">
                  Your workspace is ready. You've chosen the <strong>{ui.themeDesign} ({ui.theme})</strong> theme, 
                  configured <strong>{form.provider.toUpperCase()}</strong>, and set up your profile as <strong>{form.persona_name}</strong>.
                </p>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'var(--bg-chat)',
                  padding: '10px 16px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  fontSize: '0.8rem',
                  color: 'var(--text-sec)',
                  marginTop: '10px'
                }}>
                  <Info size={14} style={{ color: 'var(--pink)' }} />
                  <span>You can always adjust settings from the Settings menu.</span>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="onboarding-footer">
          {step > 1 ? (
            <button 
              type="button" 
              className="secondary-btn" 
              onClick={handleBack}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ArrowLeft size={16} /> Back
            </button>
          ) : (
            <div /> // Spacer
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: 'auto' }}>
            {step < 5 && (
              <button 
                type="button" 
                onClick={ui.completeOnboarding}
                style={{ 
                  background: 'none', 
                  border: 'none', 
                  boxShadow: 'none', 
                  color: 'var(--text-sec)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  padding: '8px 4px',
                  opacity: 0.7,
                  transition: 'opacity 0.2s ease',
                }}
                onMouseEnter={(e) => { e.target.style.opacity = '1'; }}
                onMouseLeave={(e) => { e.target.style.opacity = '0.7'; }}
              >
                Skip Setup
              </button>
            )}

            {step < 5 ? (
              <button 
                type="button" 
                className="primary-btn" 
                onClick={handleNext}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Next <ArrowRight size={16} />
              </button>
            ) : (
              <button 
                type="button" 
                className="primary-btn" 
                onClick={handleFinish}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  background: 'var(--pink)',
                  color: '#000',
                  fontWeight: 'bold'
                }}
              >
                Launch App <Check size={16} />
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
