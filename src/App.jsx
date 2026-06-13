import React from 'react';
import { APP_NAME } from './config';

// Context import
import { RoleplayProvider } from './context/RoleplayContext';
import { useChatContext } from './context/ChatContext';
import { useUIContext } from './context/UIContext';

// Subcomponents import
import Sidebar from './components/Layout/Sidebar';
import ChatView from './components/Chat/ChatView';
import WorldDetail from './components/Worlds/WorldDetail';
import LandingView from './components/Layout/LandingView';
import UpdateBanner from './components/Layout/UpdateBanner';

// Modals import (Lazy loaded)
import SettingsModal from './components/Modals/SettingsModal';
import OnboardingModal from './components/Modals/OnboardingModal';
const CharacterModal = React.lazy(() => import('./components/Modals/CharacterModal'));
const RoomModal = React.lazy(() => import('./components/Modals/RoomModal'));
const LoreModal = React.lazy(() => import('./components/Modals/LoreModal'));
const MemoryModal = React.lazy(() => import('./components/Modals/MemoryModal'));
const WorldModal = React.lazy(() => import('./components/Modals/WorldModal'));
const PersonaPickerModal = React.lazy(() => import('./components/Modals/PersonaPickerModal'));
import UIStickerCanvas from './components/UIStickers/UIStickerCanvas';

function MainLayout() {
  const chat = useChatContext();
  const ui = useUIContext();

  React.useEffect(() => {
    if (!ui.isMobileDevice) return;

    const preventPinchZoom = (e) => {
      // If multitouch, prevent zooming
      if (e.touches && e.touches.length > 1) {
        e.preventDefault();
      }
    };

    const preventGesture = (e) => {
      e.preventDefault();
    };

    // Add passive: false to allow e.preventDefault()
    document.addEventListener('touchmove', preventPinchZoom, { passive: false });
    document.addEventListener('gesturestart', preventGesture, { passive: false });
    document.addEventListener('gesturechange', preventGesture, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventPinchZoom);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
    };
  }, [ui.isMobileDevice]);

  return (
    <div className={`app-container ${ui.isMobileDevice ? 'device-mobile' : ''}`}>

      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Workspace Area */}
      <main className="chat-workspace" id="main-workspace">

        {/* Update Banner */}
        <UpdateBanner />

        {/* World Detail Panel */}
        {ui.activeWorldDetail && <WorldDetail />}

        {/* Landing Hub */}
        <LandingView show={!chat.activeRoom && !ui.activeWorldDetail} />

        {/* Active Chat Conversation Panel */}
        {!ui.activeWorldDetail && <ChatView />}
      </main>

      {/* Forms Overlay Modals */}
      <React.Suspense fallback={null}>
        <SettingsModal isOpen={ui.activeModal === 'settings'} />
        <CharacterModal isOpen={ui.activeModal === 'character'} />
        <RoomModal isOpen={ui.activeModal === 'room'} />
        <LoreModal isOpen={ui.activeModal === 'lore'} />
        <MemoryModal isOpen={ui.activeModal === 'memories'} />
        <WorldModal isOpen={ui.activeModal === 'world'} />
        <PersonaPickerModal isOpen={ui.activeModal === 'persona-picker'} />
      </React.Suspense>
      <OnboardingModal />
      <UIStickerCanvas />

    </div>
  );
}

export default function App() {
  React.useEffect(() => {
    document.title = `${APP_NAME} - Desktop`;
  }, []);

  return (
    <RoleplayProvider>
      <MainLayout />
    </RoleplayProvider>
  );
}
