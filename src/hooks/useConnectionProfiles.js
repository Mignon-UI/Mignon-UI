import { useState, useEffect, useCallback } from 'react';
import { useSettingsContext } from '../context/SettingsContext';
import * as api from '../services/api';

export function useConnectionProfiles() {
  const [profiles, setProfiles] = useState([]);
  const {
    settings,
    setSettings,
    settingsForm,
    fetchSettings,
    checkEngineConnection,
    applySettingsToForm
  } = useSettingsContext();

  const fetchProfiles = useCallback(async () => {
    try {
      const data = await api.fetchConnectionProfiles();
      setProfiles(data);
    } catch (e) {
      console.error('Failed to load profiles:', e);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfiles();
  }, [fetchProfiles]);

  const saveNewProfile = useCallback(async (name) => {
    try {
      const newProfile = await api.createConnectionProfile(name);
      setProfiles(prev => [...prev, newProfile]);
      await fetchSettings();
      return newProfile;
    } catch (e) {
      console.error('Failed to save profile:', e);
      throw e;
    }
  }, [fetchSettings]);

  const saveActiveProfile = useCallback(async () => {
    const activeId = settings.current_profile_id;
    if (!activeId) return;
    const activeProfile = profiles.find(p => p.id === activeId);
    if (!activeProfile) return;
    try {
      await api.saveSettings(settingsForm);
      const updated = await api.updateConnectionProfile(activeId, activeProfile.name);
      setProfiles(prev => prev.map(p => p.id === activeId ? updated : p));
      await fetchSettings();
    } catch (e) {
      console.error('Failed to overwrite profile settings:', e);
      throw e;
    }
  }, [settings, profiles, settingsForm, fetchSettings]);

  const renameActiveProfile = useCallback(async (newName) => {
    const activeId = settings.current_profile_id;
    if (!activeId) return;
    try {
      const updated = await api.renameConnectionProfile(activeId, newName);
      setProfiles(prev => prev.map(p => p.id === activeId ? updated : p));
      await fetchSettings();
      return updated;
    } catch (e) {
      console.error('Failed to rename profile:', e);
      throw e;
    }
  }, [settings, fetchSettings]);

  const deleteActiveProfile = useCallback(async () => {
    const activeId = settings.current_profile_id;
    if (!activeId) return;
    try {
      await api.deleteConnectionProfile(activeId);
      setProfiles(prev => prev.filter(p => p.id !== activeId));
      await fetchSettings();
    } catch (e) {
      console.error('Failed to delete profile:', e);
      throw e;
    }
  }, [settings, fetchSettings]);

  const activateProfile = useCallback(async (id) => {
    try {
      let data;
      if (!id) {
        data = await api.saveSettings({ ...settingsForm, current_profile_id: null });
      } else {
        data = await api.activateConnectionProfile(id);
      }
      setSettings(data);
      applySettingsToForm(data);
      await checkEngineConnection();
      return data;
    } catch (e) {
      console.error('Failed to activate profile:', e);
      throw e;
    }
  }, [settingsForm, applySettingsToForm, checkEngineConnection, setSettings]);

  return {
    profiles,
    fetchProfiles,
    saveNewProfile,
    saveActiveProfile,
    renameActiveProfile,
    deleteActiveProfile,
    activateProfile
  };
}
