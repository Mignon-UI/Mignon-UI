import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { APP_NAME } from '../config';

const THEME_BAR_COLORS = {
  'bubblegum-light': { color: '#ffb7ce', darkIcons: true },
  'bubblegum-dark': { color: '#0d0714', darkIcons: false },
  'cyberpunk-light': { color: '#f0f4f9', darkIcons: true },
  'cyberpunk-dark': { color: '#06050b', darkIcons: false },
  'dollhouse-light': { color: '#fff0f5', darkIcons: true },
  'dollhouse-dark': { color: '#210035', darkIcons: false },
  'builder-light': { color: '#f5c400', darkIcons: true },
  'builder-dark': { color: '#1b1b1b', darkIcons: false },
  'classic-light': { color: '#f1f5f9', darkIcons: true },
  'classic-dark': { color: '#090d16', darkIcons: false },
  'darkyellow-light': { color: '#c8c5be', darkIcons: true },
  'darkyellow-dark': { color: '#080808', darkIcons: false },
  'sketchbook-light': { color: '#fcfaf2', darkIcons: true },
  'sketchbook-dark': { color: '#151518', darkIcons: false }
};

const UIContext = createContext(null);

const THEMES = [
  { id: 'bubblegum', name: 'Bubblegum Pop' },
  { id: 'cyberpunk', name: 'Neo-Cyber' },
  { id: 'dollhouse', name: 'Dollhouse' },
  { id: 'builder', name: 'Builder' },
  { id: 'classic', name: `${APP_NAME} Classic` },
  { id: 'darkyellow', name: 'Dark Yellow' },
  { id: 'sketchbook', name: 'Sketch Book' }
];

function checkIsMobile() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('device') === 'mobile' || window.location.hash === '#mobile') {
    return true;
  }
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const hasTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  return isMobileUA || (hasTouch && window.innerWidth <= 1024);
}

export function UIProvider({ children }) {
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('rp_active_tab') || 'chars');
  const [activeModal, setActiveModal] = useState(null);
  const [activeWorldDetail, setActiveWorldDetail] = useState(() => localStorage.getItem('rp_active_world_detail') === 'true');
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved || 'system';
  });
  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (theme !== 'system') return theme;
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [themeDesign, setThemeDesign] = useState(() => localStorage.getItem('theme_design') || 'bubblegum');
  const [isMobileDevice, setIsMobileDevice] = useState(checkIsMobile);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return localStorage.getItem('rp_onboarding_completed') !== 'true';
  });

  const completeOnboarding = useCallback(() => {
    localStorage.setItem('rp_onboarding_completed', 'true');
    setShowOnboarding(false);
  }, []);

  const startOnboarding = useCallback(() => {
    localStorage.removeItem('rp_onboarding_completed');
    setShowOnboarding(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setIsMobileDevice(checkIsMobile());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Global Escape key listener to close active modal
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, []);

  // Listen to system preferences changes when theme === 'system'
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (theme !== 'system') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResolvedTheme(theme);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      setResolvedTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    updateTheme();
    mediaQuery.addEventListener('change', updateTheme);
    return () => mediaQuery.removeEventListener('change', updateTheme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('rp_active_tab', activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem('rp_active_world_detail', activeWorldDetail); }, [activeWorldDetail]);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    localStorage.setItem('theme_design', themeDesign);
    
    const root = document.documentElement;
    
    // Remove all possible theme classes
    const themeIds = ['bubblegum', 'cyberpunk', 'dollhouse', 'builder', 'classic', 'darkyellow', 'sketchbook'];
    themeIds.forEach(id => {
      root.classList.remove(`theme-${id}-light`);
      root.classList.remove(`theme-${id}-dark`);
    });
    
    // Add current theme class
    root.classList.add(`theme-${themeDesign}-${resolvedTheme}`);

    if (resolvedTheme === 'dark') {
      root.classList.add('dark-theme');
    } else {
      root.classList.remove('dark-theme');
    }

    const key = `${themeDesign}-${resolvedTheme}`;
    const barConfig = THEME_BAR_COLORS[key] || { color: '#ffb7ce', darkIcons: true };

    if (window.__TAURI_INTERNALS__) {
      invoke('set_system_bars_color', {
        colorHex: barConfig.color,
        darkIcons: barConfig.darkIcons
      }).catch(err => {
        console.error('Failed to set status/navigation bar colors:', err);
      });
    }
  }, [theme, resolvedTheme, themeDesign]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      if (prev === 'system') {
        const isSystemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        return isSystemDark ? 'light' : 'dark';
      }
      return prev === 'dark' ? 'light' : 'dark';
    });
  }, []);

  const value = useMemo(() => ({
    activeTab, setActiveTab,
    activeModal, setActiveModal,
    activeWorldDetail, setActiveWorldDetail,
    theme, toggleTheme, setTheme, resolvedTheme,
    themeDesign, setThemeDesign, THEMES, isMobileDevice,
    showOnboarding, setShowOnboarding, completeOnboarding, startOnboarding
  }), [
    activeTab, activeModal,
    activeWorldDetail, theme, toggleTheme, resolvedTheme,
    themeDesign, isMobileDevice,
    showOnboarding, completeOnboarding, startOnboarding
  ]);

  return (
    <UIContext.Provider value={value}>
      {children}
    </UIContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUIContext() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUIContext must be used within UIProvider');
  return ctx;
}
