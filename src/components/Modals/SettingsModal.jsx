import { useState, useEffect, useRef } from 'react';
import { useUIContext } from '../../context/UIContext';
import { useSettingsContext } from '../../context/SettingsContext';
import { useConnectionProfiles } from '../../hooks/useConnectionProfiles';
import { useToast } from '../../context/ToastContext';
import { checkForUpdates } from '../../services/updateService';
import { APP_VERSION } from '../../config';
import { 
  Settings as SettingsIcon, X, Smile, Plus, User as UserIcon, 
  Sparkles, Sun, Moon, Monitor, Save, Pencil, Trash2, RefreshCw, 
  Info, FilePlus, ArrowDownToLine, Check, AlertTriangle, Activity, Loader2,
  Eye, EyeOff
} from 'lucide-react';
import { getThemeSwatches } from '../../utils/themeHelper';

export default function SettingsModal({ isOpen, isInline }) {
  const ui = useUIContext();
  const settings = useSettingsContext();
  const { toast } = useToast();
  const {
    profiles,
    saveNewProfile,
    saveActiveProfile,
    renameActiveProfile,
    deleteActiveProfile,
    activateProfile
  } = useConnectionProfiles();
  const [isEditingStickers, setIsEditingStickers] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
  const [showCustomKey, setShowCustomKey] = useState(false);
  const personaAvatarInputRef = useRef(null);
  const mouseDownTargetRef = useRef(null);

  // Connection Profile Inline Editing
  const [editingProfileType, setEditingProfileType] = useState(null); // 'new', 'rename', or null
  const [editProfileName, setEditProfileName] = useState('');

  const handleSaveProfile = async () => {
    const trimmed = editProfileName.trim();
    if (!trimmed) return;
    if (editingProfileType === 'new') {
      try {
        await saveNewProfile(trimmed);
        toast.success("Profile created and activated!");
        setEditingProfileType(null);
      } catch (err) {
        toast.error(err.message || "Failed to create profile.");
      }
    } else if (editingProfileType === 'rename') {
      try {
        await renameActiveProfile(trimmed);
        toast.success("Profile renamed successfully!");
        setEditingProfileType(null);
      } catch (err) {
        toast.error(err.message || "Failed to rename profile.");
      }
    }
  };

  // Software Update States
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState(null);
  const [manualCheckError, setManualCheckError] = useState(null);
  const [updateChannel, setUpdateChannel] = useState(() => {
    return localStorage.getItem('mignon_update_channel') || 'stable';
  });

  const handleManualCheck = async () => {
    setUpdateChecking(true);
    setUpdateResult(null);
    setManualCheckError(null);
    try {
      const result = await checkForUpdates(true); // Bypass cache and ping
      setUpdateResult(result);
      if (result.error) {
        setManualCheckError(result.error);
      }
    } catch (err) {
      setManualCheckError(err.toString());
    } finally {
      setUpdateChecking(false);
    }
  };

  useEffect(() => {
    if (isInline) {
      if (ui.activeTab !== 'settings') return;
    } else {
      if (!isOpen) return;
    }
    const handleStateChange = (e) => {
      setIsEditingStickers(e.detail.isEditingMode);
    };
    window.addEventListener('sticker-state-changed', handleStateChange);
    window.dispatchEvent(new CustomEvent('sticker-request-state'));
    return () => {
      window.removeEventListener('sticker-state-changed', handleStateChange);
    };
  }, [isOpen, isInline, ui.activeTab]);

  const handlePersonaAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      settings.setSettingsForm(prev => ({ ...prev, persona_avatar: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleClose = () => {
    if (isSaving) return;
    settings.resetForm();
    ui.setActiveModal(null);
  };

  const renderForm = () => (
    <form id="settings-form" onSubmit={async (e) => {
      e.preventDefault();
      if (isSaving) return;
      setIsSaving(true);
      try {
        await settings.handleSettingsSubmit(settings.settingsForm);
        toast.success('Settings updated successfully!');
        if (!isInline) {
          ui.setActiveModal(null);
        }
      } catch {
        toast.error('Error sending settings update.');
      } finally {
        setIsSaving(false);
      }
    }}>
      <fieldset disabled={isSaving} style={{ border: 'none', padding: 0, margin: 0, minWidth: 0 }}>

        {/* ── CONNECTION PROFILES ── */}
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              Connection Profile
              <span title="Save and switch between different AI providers or keys" style={{ cursor: 'help', color: 'var(--text-sec)', display: 'inline-flex', alignItems: 'center' }}>
                <Info size={14} />
              </span>
            </label>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {editingProfileType ? (
              <>
                <input
                  type="text"
                  className="rename-input"
                  style={{ flex: 1, height: '36px' }}
                  placeholder={editingProfileType === 'new' ? "Enter profile name..." : "Enter new name..."}
                  value={editProfileName}
                  onChange={(e) => setEditProfileName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      await handleSaveProfile();
                    } else if (e.key === 'Escape') {
                      setEditingProfileType(null);
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: '8px', minWidth: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Save Name"
                  onClick={handleSaveProfile}
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: '8px', minWidth: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Cancel"
                  onClick={() => setEditingProfileType(null)}
                >
                  <X size={16} />
                </button>
              </>
            ) : (
              <>
                <select
                  id="setting-profile-select"
                  style={{ flex: 1, margin: 0 }}
                  value={settings.settingsForm.current_profile_id || ''}
                  onChange={async (e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    try {
                      await activateProfile(val);
                      toast.success(val ? "Profile activated!" : "Profile cleared.");
                    } catch {
                      toast.error("Failed to change profile.");
                    }
                  }}
                >
                  <option value="">&lt;None&gt;</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {/* New Profile */}
                  <button
                    type="button"
                    className="secondary-btn"
                    style={{ padding: '8px', minWidth: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="New Profile"
                    onClick={() => {
                      setEditingProfileType('new');
                      setEditProfileName('');
                    }}
                  >
                    <FilePlus size={16} />
                  </button>

                  {/* Save Profile */}
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!settings.settingsForm.current_profile_id}
                    style={{ padding: '8px', minWidth: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: settings.settingsForm.current_profile_id ? 1 : 0.5 }}
                    title="Save Current Settings to Profile"
                    onClick={async () => {
                      if (!settings.settingsForm.current_profile_id) return;
                      try {
                        await saveActiveProfile();
                        toast.success("Profile overwritten successfully!");
                      } catch {
                        toast.error("Failed to save profile.");
                      }
                    }}
                  >
                    <Save size={16} />
                  </button>

                  {/* Rename Profile */}
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!settings.settingsForm.current_profile_id}
                    style={{ padding: '8px', minWidth: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: settings.settingsForm.current_profile_id ? 1 : 0.5 }}
                    title="Rename Profile"
                    onClick={() => {
                      const activeId = settings.settingsForm.current_profile_id;
                      if (!activeId) return;
                      const currProf = profiles.find(p => p.id === activeId);
                      setEditingProfileType('rename');
                      setEditProfileName(currProf ? currProf.name : '');
                    }}
                  >
                    <Pencil size={16} />
                  </button>

                  {/* Refresh (Test Connection) */}
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={isTestingConnection}
                    style={{ padding: '8px', minWidth: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Test Connection"
                    onClick={async () => {
                      setIsTestingConnection(true);
                      try {
                        const res = await settings.checkEngineConnection();
                        if (res && res.status === 'success') {
                          toast.success("Connection successful!");
                        } else {
                          toast.error(res?.message || "Failed to connect. Please check endpoint and credentials.");
                        }
                      } catch {
                        toast.error("Failed to connect. Please check endpoint and credentials.");
                      } finally {
                        setIsTestingConnection(false);
                      }
                    }}
                  >
                    {isTestingConnection ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Activity size={16} />
                    )}
                  </button>

                  {/* Delete Profile */}
                  <button
                    type="button"
                    className="secondary-btn"
                    disabled={!settings.settingsForm.current_profile_id}
                    style={{ padding: '8px', minWidth: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: settings.settingsForm.current_profile_id ? 1 : 0.5 }}
                    title="Delete Profile"
                    onClick={async () => {
                      if (!confirm("Are you sure you want to delete this profile? Current settings values will be preserved in your form, but the profile will be removed.")) return;
                      try {
                        await deleteActiveProfile();
                        toast.success("Profile deleted.");
                      } catch {
                        toast.error("Failed to delete profile.");
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── LLM PROVIDER ── */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label style={{ marginBottom: 0 }}>AI LLM Provider</label>
            <span className={`status-badge ${settings.engineOnline ? 'online' : 'offline'}`} style={{
              fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px',
              padding: '3px 8px', borderRadius: 'var(--r-sm)', border: 'var(--border-width) solid var(--border)',
              background: settings.engineOnline ? 'var(--blue)' : 'var(--pink)', color: '#000', fontWeight: 'bold',
              boxShadow: '2px 2px 0px rgba(0,0,0,1)'
            }}>
              <span style={{
                background: settings.engineOnline ? '#00ffcc' : '#ff4a7d',
                width: '7px', height: '7px', borderRadius: '50%', display: 'inline-block',
                boxShadow: settings.engineOnline ? '0 0 8px #00ffcc' : 'none'
              }}></span>
              {settings.engineOnline ? 'ONLINE' : 'OFFLINE'}
            </span>
          </div>
          <select
            id="setting-provider"
            value={settings.settingsForm.provider}
            onChange={(e) => settings.handleSettingsProviderChange(e.target.value)}
          >
            <option value="ollama">Local Ollama</option>
            <option value="kobold">Local Kobold.cpp</option>
            <option value="custom">Custom (OpenAI compatible)</option>
            <option value="openrouter">Cloud OpenRouter</option>
          </select>
        </div>

        {settings.settingsForm.provider === "openrouter" && (
          <div className="form-group" id="group-openrouter-key">
            <label>OpenRouter API Key</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showOpenrouterKey ? 'text' : 'password'}
                id="setting-openrouter-key"
                placeholder="sk-or-v1-..."
                value={settings.settingsForm.openrouter_key}
                onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, openrouter_key: e.target.value }))}
                style={{ paddingRight: '40px', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowOpenrouterKey(v => !v)}
                title={showOpenrouterKey ? 'Hide key' : 'Show key'}
                style={{
                  position: 'absolute', right: '10px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '0', display: 'flex', alignItems: 'center'
                }}
              >
                {showOpenrouterKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <small className="help-text">Your key is stored locally in SQLite only.</small>
          </div>
        )}

        {settings.settingsForm.provider === "custom" && (
          <div className="form-group" id="group-custom-key">
            <label>Custom API Key (Optional)</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showCustomKey ? 'text' : 'password'}
                id="setting-custom-key"
                placeholder="Enter API key..."
                value={settings.settingsForm.custom_key || ''}
                onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, custom_key: e.target.value }))}
                style={{ paddingRight: '40px', width: '100%' }}
              />
              <button
                type="button"
                onClick={() => setShowCustomKey(v => !v)}
                title={showCustomKey ? 'Hide key' : 'Show key'}
                style={{
                  position: 'absolute', right: '10px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '0', display: 'flex', alignItems: 'center'
                }}
              >
                {showCustomKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <small className="help-text">Securely stored for OpenAI, Gemini, DeepSeek, Anthropic, etc.</small>
          </div>
        )}

        {(settings.settingsForm.provider === "openrouter" || settings.settingsForm.provider === "custom") && (
          <div className="form-group" id="group-cloud-rate-limit">
            <label>Cloud Generation Rate Limit</label>
            <select
              id="setting-cloud-rate-limit"
              value={settings.settingsForm.cloud_rate_limit ?? 15}
              onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, cloud_rate_limit: parseInt(e.target.value) }))}
            >
              <option value="5">5 requests/min (Very Safe)</option>
              <option value="10">10 requests/min (Safe)</option>
              <option value="15">15 requests/min (Normal)</option>
              <option value="30">30 requests/min (Fast)</option>
              <option value="0">Unlimited (Warning: Bill Shock risk)</option>
            </select>
            <small className="help-text">Prevents runaway auto-chaining loops from draining your cloud credits.</small>
          </div>
        )}

        {settings.settingsForm.provider !== "openrouter" && (
          <div className="form-group" id="group-local-endpoint">
            <label>{settings.settingsForm.provider === "custom" ? "Endpoint URL" : "Local Endpoint URL"}</label>
            <input
              type="text"
              id="setting-local-endpoint"
              placeholder={settings.settingsForm.provider === "custom" ? "https://api.openai.com/v1" : "http://127.0.0.1:11434/v1"}
              value={settings.settingsForm.local_endpoint}
              onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, local_endpoint: e.target.value }))}
            />
            <small className="help-text" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
              {settings.settingsForm.provider === "custom" ? (
                <>
                  <span>Groq: <code>https://api.groq.com/openai/v1</code></span>
                  <span>OpenAI: <code>https://api.openai.com/v1</code></span>
                  <span>Gemini: <code>https://generativelanguage.googleapis.com/v1beta/openai</code></span>
                  <span>DeepSeek: <code>https://api.deepseek.com/v1</code></span>
                  <span>Anthropic: <code>https://api.anthropic.com/v1</code></span>
                </>
              ) : (
                <>
                  <span>Ollama: <code>http://127.0.0.1:11434/v1</code></span>
                  <span>Kobold.cpp: <code>http://127.0.0.1:5001/v1</code></span>
                  <span>LM Studio: <code>http://localhost:1234/v1</code></span>
                </>
              )}
            </small>
          </div>
        )}

        <div className="form-group">
          <label>Selected Model Name</label>
          <input
            type="text"
            id="setting-selected-model"
            placeholder="Enter model name..."
            value={settings.settingsForm.selected_model}
            onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, selected_model: e.target.value }))}
          />
        </div>



        <div className="form-row">
          <div className="form-group half">
            <label>Temperature (<span>{settings.settingsForm.temperature}</span>)</label>
            <input
              type="range"
              id="setting-temperature"
              min="0.1" max="1.5" step="0.05"
              value={settings.settingsForm.temperature}
              onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
            />
          </div>
          <div className="form-group half">
            <label>Max Tokens (<span>{settings.settingsForm.max_tokens}</span>)</label>
            <input
              type="range"
              id="setting-max-tokens"
              min="128" max="8192" step="128"
              value={settings.settingsForm.max_tokens}
              onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, max_tokens: parseInt(e.target.value) }))}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Global System Prompt Template</label>
          <textarea
            id="setting-system-template"
            rows="5"
            value={settings.settingsForm.system_template}
            onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, system_template: e.target.value }))}
          />
          <small className="help-text">Master instructions loaded into model context to define tone, format, and compliance.</small>
        </div>

        {/* ── YOUR PERSONA ── */}
        <div className="form-group" style={{ marginTop: '24px', borderTop: 'var(--border-width) solid var(--border)', paddingTop: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-head)', fontWeight: 'bold', fontSize: '1rem', textTransform: 'uppercase' }}>
            <Sparkles size={18} /> Your Persona
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-sec)', marginTop: '6px', marginBottom: '14px', lineHeight: '1.4' }}>
            Define who <em>you</em> are in the roleplay. Bots will address you by this name and react to your backstory.
          </p>

          <div>
            <div className="form-row align-center" style={{ gap: '16px', marginBottom: '16px' }}>
              <div
                id="persona-avatar-upload"
                className="avatar-upload-box"
                style={{
                  width: '72px',
                  height: '72px',
                  flexShrink: 0,
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.6 : 1,
                  pointerEvents: isSaving ? 'none' : 'auto'
                }}
                onClick={() => personaAvatarInputRef.current?.click()}
                title={isSaving ? "Saving..." : "Click to upload avatar"}
              >
                {settings.settingsForm.persona_avatar
                  ? <img src={settings.settingsForm.persona_avatar} alt="Persona avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <UserIcon className="placeholder-icon" size={28} />}
                <input
                  ref={personaAvatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handlePersonaAvatarChange}
                />
              </div>
              <div className="form-group flex-fill" style={{ marginBottom: 0 }}>
                <label>Your Name</label>
                <input
                  type="text"
                  id="persona-name"
                  placeholder="e.g. Aria, Commander, Kira..."
                  value={settings.settingsForm.persona_name}
                  onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, persona_name: e.target.value }))}
                />
              </div>
            </div>
            <div className="form-group">
              <label>Backstory / Personality</label>
              <textarea
                id="persona-description"
                rows="4"
                placeholder="Describe your character's personality, history, quirks..."
                value={settings.settingsForm.persona_description}
                onChange={(e) => settings.setSettingsForm(prev => ({ ...prev, persona_description: e.target.value }))}
              />
              <small className="help-text">Injected into every system prompt so bots know who they're talking to.</small>
            </div>
          </div>
        </div>

        {/* ── UI STICKERS ── */}
        <div className="form-group" style={{ marginTop: '24px', borderTop: 'var(--border-width) solid var(--border)', paddingTop: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-head)', fontWeight: 'bold', fontSize: '1rem', textTransform: 'uppercase' }}>
            <Smile size={18} /> UI Stickers
            <span style={{
              fontSize: '0.62rem',
              padding: '2px 6px',
              borderRadius: 'var(--r-sm)',
              background: 'var(--pink)',
              color: '#000000',
              fontWeight: '800',
              border: '1px solid var(--border)',
              boxShadow: '1px 1px 0px rgba(0,0,0,1)',
              marginLeft: '6px',
              letterSpacing: '0.5px',
              display: 'inline-block'
            }}>
              EXPERIMENTAL
            </span>
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-sec)', marginTop: '6px', marginBottom: '14px', lineHeight: '1.4' }}>
            Place transparent anime chibis, borders, badges, or custom decorations anywhere on your workspace!
          </p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              type="button"
              className="secondary-btn"
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              onClick={() => window.dispatchEvent(new CustomEvent('sticker-trigger-upload'))}
            >
              <Plus size={14} /> Add Sticker
            </button>
            <button
              type="button"
              className="primary-btn"
              style={{
                flex: 1, padding: '8px 12px', fontSize: '0.8rem',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: isEditingStickers ? 'var(--pink)' : 'var(--blue)'
              }}
              onClick={() => window.dispatchEvent(new CustomEvent('sticker-toggle-editing'))}
            >
              {isEditingStickers ? "Lock Positions" : "Reposition Stickers"}
            </button>
          </div>
        </div>

        {/* ── THEME & APPEARANCE ── */}
        <div className="form-group" style={{ marginTop: '24px', borderTop: 'var(--border-width) solid var(--border)', paddingTop: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-head)', fontWeight: 'bold', fontSize: '1rem', textTransform: 'uppercase' }}>
            <Sparkles size={18} /> Theme &amp; Appearance
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-sec)', marginTop: '6px', marginBottom: '14px', lineHeight: '1.4' }}>
            Customize your workspace design style and color palette.
          </p>

          {/* Mode Selection */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <button
              type="button"
              className={`secondary-btn flex-fill`}
              style={{
                padding: '8px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: ui.theme === 'system' ? 'var(--blue)' : 'var(--bg-input)',
                color: ui.theme === 'system' ? '#000000' : 'var(--text)',
                border: 'var(--border-width) solid var(--border)',
                boxShadow: ui.theme === 'system' ? '2px 2px 0px var(--border)' : 'none',
                fontWeight: ui.theme === 'system' ? 'bold' : 'normal',
              }}
              onClick={() => ui.setTheme('system')}
            >
              <Monitor size={15} /> System
            </button>
            <button
              type="button"
              className={`secondary-btn flex-fill`}
              style={{
                padding: '8px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: ui.theme === 'light' ? 'var(--blue)' : 'var(--bg-input)',
                color: ui.theme === 'light' ? '#000000' : 'var(--text)',
                border: 'var(--border-width) solid var(--border)',
                boxShadow: ui.theme === 'light' ? '2px 2px 0px var(--border)' : 'none',
                fontWeight: ui.theme === 'light' ? 'bold' : 'normal',
              }}
              onClick={() => ui.setTheme('light')}
            >
              <Sun size={15} /> Light
            </button>
            <button
              type="button"
              className={`secondary-btn flex-fill`}
              style={{
                padding: '8px 12px',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: ui.theme === 'dark' ? 'var(--pink)' : 'var(--bg-input)',
                color: ui.theme === 'dark' ? '#000000' : 'var(--text)',
                border: 'var(--border-width) solid var(--border)',
                boxShadow: ui.theme === 'dark' ? '2px 2px 0px var(--border)' : 'none',
                fontWeight: ui.theme === 'dark' ? 'bold' : 'normal',
              }}
              onClick={() => ui.setTheme('dark')}
            >
              <Moon size={15} /> Dark
            </button>
          </div>

          {/* Design Family Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', padding: '2px' }}>
            {ui.THEMES.map((t) => {
              const isActive = ui.themeDesign === t.id;
              const isDark = ui.resolvedTheme === 'dark';
              const swatches = getThemeSwatches(t.id, isDark);

              return (
                <div
                  key={t.id}
                  onClick={() => ui.setThemeDesign(t.id)}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--r-md)',
                    border: 'var(--border-width) solid var(--border)',
                    background: isActive ? 'var(--bg-card-active)' : 'var(--bg-window)',
                    cursor: 'pointer',
                    boxShadow: isActive ? '3px 3px 0px var(--border)' : '1px 1px 0px var(--border)',
                    transform: isActive ? 'translate(-2px, -2px)' : 'none',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                  className="theme-card-option"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text)' }}>
                      {t.name}
                    </span>
                    {isActive && (
                      <span style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        display: 'block'
                      }} />
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {swatches.map((c, i) => (
                      <span
                        key={i}
                        style={{
                          width: '18px',
                          height: '18px',
                          borderRadius: '50%',
                          background: c,
                          border: '1px solid rgba(0,0,0,0.15)',
                          boxShadow: '1px 1px 2px rgba(0,0,0,0.1)'
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SOFTWARE UPDATES ── */}
        <div className="form-group" style={{ marginTop: '24px', borderTop: 'var(--border-width) solid var(--border)', paddingTop: '20px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-head)', fontWeight: 'bold', fontSize: '1rem', textTransform: 'uppercase' }}>
            <RefreshCw size={16} className={updateChecking ? 'mignon-animate-spin' : ''} /> Software Updates
          </label>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-sec)', marginTop: '6px', marginBottom: '14px', lineHeight: '1.4' }}>
            Check for updates and view system version info.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(0,0,0,0.15)', padding: '14px', borderRadius: 'var(--r-md)', border: '1px solid var(--border)', boxShadow: '2px 2px 0px rgba(0,0,0,1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--text-sec)' }}>Current Version:</span>
              <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>v{APP_VERSION}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', padding: '4px 0' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
                Opt-in to Beta Releases channel
              </span>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={updateChannel === 'beta'}
                  onChange={(e) => {
                    const val = e.target.checked ? 'beta' : 'stable';
                    setUpdateChannel(val);
                    localStorage.setItem('mignon_update_channel', val);
                  }}
                />
                <span className="slider"></span>
              </label>
            </div>

            {updateResult && (
              <div style={{ marginTop: '4px', padding: '10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: updateResult.updateAvailable ? 'rgba(0, 150, 80, 0.1)' : 'rgba(255,255,255,0.03)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 'bold', color: updateResult.updateAvailable ? '#00ffaa' : 'var(--text)' }}>
                  {updateResult.updateAvailable ? <ArrowDownToLine size={16} /> : <Check size={16} />}
                  {updateResult.updateAvailable 
                    ? `New version ${updateResult.latestVersion} available!` 
                    : 'You are running the latest version!'}
                </div>
                
                {updateResult.updateAvailable && (
                  <>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-sec)', lineHeight: '1.3' }}>
                      {updateResult.name || 'Includes performance improvements and fixes.'}
                    </span>
                    <button
                      type="button"
                      className="primary-btn"
                      style={{ marginTop: '6px', fontSize: '0.8rem', padding: '6px 12px', width: 'fit-content' }}
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('mignon-show-update-banner', { detail: updateResult }));
                        if (!isInline) {
                          ui.setActiveModal(null); // Close settings to show banner
                        }
                      }}
                    >
                      Install Update
                    </button>
                  </>
                )}
              </div>
            )}

            {manualCheckError && (
              <div style={{ marginTop: '4px', padding: '10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'rgba(255, 74, 125, 0.1)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#ff4a7d' }}>
                <AlertTriangle size={16} />
                <span>Error: {manualCheckError}</span>
              </div>
            )}

            <button
              type="button"
              className="secondary-btn"
              disabled={updateChecking}
              style={{ padding: '8px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: 'fit-content', marginTop: '4px' }}
              onClick={handleManualCheck}
            >
              <RefreshCw size={14} className={updateChecking ? 'mignon-animate-spin' : ''} />
              {updateChecking ? 'Checking...' : 'Check for Updates'}
            </button>
          </div>
        </div>

        <button
          type="submit"
          className="primary-btn full-width mt-10"
          disabled={isSaving}
          style={{
            opacity: isSaving ? 0.7 : 1,
            cursor: isSaving ? 'not-allowed' : 'pointer'
          }}
        >
          {isSaving ? "Saving..." : "Save Settings"}
        </button>
      </fieldset>
    </form>
  );

  if (isInline) {
    return (
      <div id="content-settings" className={`tab-content ${ui.activeTab === 'settings' ? 'active' : ''}`}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontFamily: 'var(--font-head)', fontSize: '1.2rem', textTransform: 'uppercase', color: 'var(--text)', flexShrink: 0 }}>
          <SettingsIcon size={20} className="text-primary" /> System Settings
        </h2>
        <div className="settings-inline-body scrollbar-custom" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px' }}>
          {renderForm()}
        </div>
      </div>
    );
  }

  if (!isOpen || ui.isMobileDevice) return null;

  return (
    <div
      className="modal-backdrop active"
      id="modal-settings"
      onMouseDown={(e) => {
        mouseDownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        if (e.target.id === 'modal-settings' && mouseDownTargetRef.current?.id === 'modal-settings') {
          handleClose();
        }
      }}
    >
      <div className="modal-box glassmorphism scale-in">
        <div className="modal-header">
          <h2><SettingsIcon size={18} /> System Settings</h2>
          <button className="modal-close-btn" onClick={handleClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body scrollbar-custom">
          {renderForm()}
        </div>
      </div>
    </div>
  );
}
