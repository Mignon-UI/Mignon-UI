/* eslint-disable react-hooks/set-state-in-effect */
import React from 'react';
import { useChatContext } from '../../context/ChatContext';
import { useUIContext } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { useCharacterContext } from '../../context/CharacterContext';
import { useSettingsContext } from '../../context/SettingsContext';
import { Trash2, User as UserIcon, Send, Scroll, Square, Plus, Ban, Check, ChevronUp, ChevronDown, X, ArrowLeft, MoreVertical, Palette } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { getBotAccent } from '../../utils/textFormatter';
import * as api from '../../services/api';
import ChatThemeModal from '../Modals/ChatThemeModal';
import { getWallpaperById } from '../../utils/chatWallpapers';
import { LOCAL_STORAGE_PREFIX } from '../../config';

function ChatHeader({ activeRoom, activeRoomBots, isMenuOpen, setIsMenuOpen, ui, chat, showConfirm }) {
  return (
    <header className="chat-header">
      <div className="chat-info">
        <button
          className="mobile-back-btn"
          title="Back to List"
          onClick={() => chat.setCurrentRoomId(null)}
          style={{ display: 'none' }}
        >
          <ArrowLeft size={16} />
        </button>
        <div id="chat-room-avatars" className="avatar-stack">
          {activeRoomBots.map((b, idx) => (
            <div key={idx} className={`avatar-stack-item accent-${getBotAccent(b.id)}`}>
              {b.avatar ? <img src={b.avatar} alt={b.name} loading="lazy" /> : <UserIcon style={{ width: '16px', height: '16px' }} />}
            </div>
          ))}
        </div>
        <div className="chat-titles">
          <h2 id="chat-room-name">{activeRoom.name}</h2>
          {activeRoom.is_group && (
            <span id="chat-room-subtitle">
              {activeRoomBots.length} Bots active
            </span>
          )}
        </div>
      </div>
      <div className="header-actions">
        <button
          id="btn-view-memories"
          className="icon-btn"
          title="View Chronicle Book (Memories)"
          onClick={() => ui.setActiveModal('memories')}
        >
          <Scroll size={16} />
        </button>

        {/* 3-Dot Options Dropdown */}
        <div className="chat-menu-wrapper" style={{ position: 'relative' }}>
          <button
            id="btn-chat-options"
            className={`icon-btn ${isMenuOpen ? 'active' : ''}`}
            title="Chat Options"
            onClick={(e) => {
              e.stopPropagation();
              setIsMenuOpen(!isMenuOpen);
            }}
          >
            <MoreVertical size={16} />
          </button>

          {isMenuOpen && (
            <div className="chat-actions-dropdown">
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setIsMenuOpen(false);
                  ui.setActiveModal('chat-theme');
                }}
              >
                <Palette size={14} style={{ color: 'var(--pink)' }} /> Wallpaper Settings
              </button>
              <hr className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item danger"
                onClick={() => {
                  setIsMenuOpen(false);
                  chat.handleDeleteActiveRoom(showConfirm);
                }}
              >
                <Trash2 size={14} /> Delete Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function ChatSandboxOpener({ activeRoom, activeRoomBots, selectedTriggerBotId, chat, toast }) {
  return (
    <div className="text-center mt-20 group-opener-card" style={{
      color: 'var(--text-sec)',
      padding: '28px',
      background: 'var(--bg-window)',
      border: '2px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow: 'var(--shadow-md)',
      maxWidth: '480px',
      margin: '40px auto'
    }}>
      <h3 style={{ fontFamily: 'var(--font-head)', marginBottom: '8px', fontSize: '1.2rem', color: 'var(--text)' }}>
        ✦ Group Sandbox Active ✦
      </h3>
      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
        No static greetings are loaded. Start the roleplay with a fully dynamic, custom-generated opening scene where your characters react to the scenario in real-time.
      </p>
      {activeRoom.description && (
        <div style={{
          background: 'var(--bg-input)',
          padding: '12px',
          borderRadius: 'var(--r-sm)',
          border: '1px dashed var(--border)',
          fontSize: '0.85rem',
          textAlign: 'left',
          marginBottom: '20px',
          lineHeight: '1.4',
          color: 'var(--text-sec)'
        }}>
          <strong>Active Scenario:</strong> {activeRoom.description}
        </div>
      )}
      <button
        className="format-btn primary"
        style={{
          margin: '0 auto',
          background: 'var(--pink)',
          color: 'var(--text)',
          border: '2px solid var(--border)',
          boxShadow: '2px 2px 0px var(--shadow-color)',
          fontWeight: 'bold',
          padding: '10px 20px',
          cursor: 'pointer'
        }}
        onClick={async () => {
          const triggerId = selectedTriggerBotId || 'auto';
          if (triggerId === 'auto' || triggerId === 'cognitive' || triggerId === 'efficient') {
            chat.changeChainingState(true);
            const mutedIdsStr = Array.from(chat.mutedCharacterIds).join(',');
            const firstSpeaker = await api.fetchNextSpeaker(chat.currentRoomId, "", mutedIdsStr, triggerId);
            if (firstSpeaker?.next_speaker_id) {
              chat.triggerBotResponse(firstSpeaker.next_speaker_id, toast);
            } else if (activeRoomBots.length > 0) {
              chat.triggerBotResponse(activeRoomBots[0].id, toast);
            } else {
              chat.changeChainingState(false);
            }
          } else {
            const firstBotId = triggerId || (activeRoomBots.length > 0 ? activeRoomBots[0].id : null);
            if (firstBotId) chat.triggerBotResponse(firstBotId, toast);
          }
        }}
      >
        ⚡ Generate First Message
      </button>
    </div>
  );
}

function ReplyOrderOption({ modeId, activeModeId, title, subtitle, icon, onClick }) {
  const isActive = activeModeId === modeId;
  return (
    <button
      className="dropup-char-item"
      onClick={onClick}
      style={isActive ? { background: 'var(--bg-input)', color: 'var(--primary)' } : {}}
    >
      <div className="char-avatar-placeholder" style={isActive ? { borderColor: 'var(--primary)' } : {}}>
        {icon}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <span>{title}</span>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{subtitle}</span>
      </div>
    </button>
  );
}

export default function ChatView() {
  const chat = useChatContext();
  const { chatHistoryRef, chatTextareaRef } = chat;
  const ui = useUIContext();
  const { characters } = useCharacterContext();
  const { toast, showConfirm } = useToast();
  const settings = useSettingsContext();

  const [isAddPickerOpen, setIsAddPickerOpen] = React.useState(false);
  const [isOrderMenuOpen, setIsOrderMenuOpen] = React.useState(false);
  const [addPickerPos, setAddPickerPos] = React.useState({ bottom: 0, right: 0 });
  const [orderMenuPos, setOrderMenuPos] = React.useState({ bottom: 0, right: 0 });
  const addBtnRef = React.useRef(null);
  const orderBtnRef = React.useRef(null);

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [showScrollBtn, setShowScrollBtn] = React.useState(false);

  React.useEffect(() => {
    const el = chatHistoryRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distanceToBottom > 150);
    };

    el.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();

    return () => el.removeEventListener('scroll', handleScroll);
  }, [chatHistoryRef, chat.currentRoomId, chat.roomMessages]);
  const [themeConfig, setThemeConfig] = React.useState({
    themeId: 'theme-default',
    useStaticColor: false,
    bgColor: '',
    strokeColor: '',
    opacity: 10,
    useCustomBgImage: false,
    bgImage: null,
    bgImageOriginal: null,
    bgImageOpacity: 100,
    bgImageFill: 'cover',
    vignette: 40
  });

  React.useEffect(() => {
    if (chat.activeRoom?.id) {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}_theme_${chat.activeRoom.id}`);
      if (saved) {
        try {
          setThemeConfig(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to parse theme config:", e);
        }
      } else {
        setThemeConfig({
          themeId: 'theme-default',
          useStaticColor: false,
          bgColor: '',
          strokeColor: '',
          opacity: 10,
          useCustomBgImage: false,
          bgImage: null,
          bgImageOriginal: null,
          bgImageOpacity: 100,
          bgImageFill: 'cover',
          vignette: 40
        });
      }
    }
  }, [chat.activeRoom?.id]);

  const handleThemeChange = (newConfig) => {
    setThemeConfig(newConfig);
    if (chat.activeRoom?.id) {
      try {
        localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_theme_${chat.activeRoom.id}`, JSON.stringify(newConfig));
      } catch (e) {
        console.warn("Failed to save theme config to localStorage:", e);
      }
    }
  };

  const getChatBackgroundStyle = () => {
    const styles = {};
    if (!chat.activeRoom) return styles;

    // 1. Background Image & Opacity & Fill Method
    if (themeConfig.useCustomBgImage && themeConfig.bgImage) {
      styles.backgroundImage = `url("${themeConfig.bgImage}")`;

      const opacityVal = themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity / 100 : 1;
      styles.opacity = opacityVal.toString();

      const fill = themeConfig.bgImageFill || 'cover';
      if (fill === 'tile') {
        styles.backgroundSize = 'auto';
        styles.backgroundRepeat = 'repeat';
        styles.backgroundPosition = 'top left';
      } else if (fill === 'stretch') {
        styles.backgroundSize = '100% 100%';
        styles.backgroundRepeat = 'no-repeat';
        styles.backgroundPosition = 'center';
      } else if (fill === 'contain') {
        styles.backgroundSize = 'contain';
        styles.backgroundRepeat = 'no-repeat';
        styles.backgroundPosition = 'center';
      } else {
        styles.backgroundSize = 'cover';
        styles.backgroundRepeat = 'no-repeat';
        styles.backgroundPosition = 'center';
      }
    } else if (themeConfig.themeId === 'none') {
      styles.backgroundImage = 'none';
      styles.opacity = '1';
    } else if (themeConfig.themeId && themeConfig.themeId !== 'theme-default') {
      const selectedWallpaper = getWallpaperById(themeConfig.themeId);
      if (selectedWallpaper) {
        const strokeColor = themeConfig.strokeColor || selectedWallpaper.defaultColor;
        const strokeOpacity = (themeConfig.opacity !== undefined ? themeConfig.opacity : 10) / 100;
        const svgContent = selectedWallpaper.svg(strokeColor, strokeOpacity);

        styles.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`;
        styles.opacity = '1';
        styles.backgroundRepeat = 'repeat';
        styles.backgroundSize = '160px 160px';
        styles.backgroundPosition = '0 0';
      }
    } else {
      // theme-default override using current UI theme Design Doodles
      const currentUiTheme = ui.themeDesign;
      const activeWallpaper = getWallpaperById(currentUiTheme);
      if (activeWallpaper) {
        const strokeColor = themeConfig.strokeColor || activeWallpaper.defaultColor;
        const strokeOpacity = (themeConfig.opacity !== undefined ? themeConfig.opacity : 10) / 100;
        const svgContent = activeWallpaper.svg(strokeColor, strokeOpacity);

        styles.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`;
        styles.opacity = '1';
        styles.backgroundRepeat = 'repeat';
        styles.backgroundSize = '160px 160px';
        styles.backgroundPosition = '0 0';
      }
    }

    // 2. Vignette box shadow
    const vignetteStrength = themeConfig.vignette !== undefined ? themeConfig.vignette : 40;
    styles.boxShadow = `inset 0 0 ${vignetteStrength}px rgba(0, 0, 0, 0.45)`;

    return styles;
  };

  // Close menus when clicking outside
  React.useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.companion-picker-wrapper') && !e.target.closest('.order-picker-wrapper') && !e.target.closest('.dropup-fixed') && !e.target.closest('.chat-menu-wrapper')) {
        setIsAddPickerOpen(false);
        setIsOrderMenuOpen(false);
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  const openAddPicker = (e) => {
    e.stopPropagation();
    if (!isAddPickerOpen && addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setAddPickerPos({
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsAddPickerOpen(!isAddPickerOpen);
    setIsOrderMenuOpen(false);
  };

  const openOrderMenu = (e) => {
    e.stopPropagation();
    if (!isOrderMenuOpen && orderBtnRef.current) {
      const rect = orderBtnRef.current.getBoundingClientRect();
      setOrderMenuPos({
        bottom: window.innerHeight - rect.top + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setIsOrderMenuOpen(!isOrderMenuOpen);
    setIsAddPickerOpen(false);
  };

  if (!chat.activeRoom) return null;

  const personaCharId = settings.settingsForm.persona_character_id;
  const eligibleToJoin = characters.filter(
    c => c.id !== personaCharId && !chat.activeRoomBots.some(b => b.id === c.id)
  );

  return (
    <div className="chat-view" id="chat-view" style={{ display: 'flex' }}>
      <ChatHeader
        activeRoom={chat.activeRoom}
        activeRoomBots={chat.activeRoomBots}
        isMenuOpen={isMenuOpen}
        setIsMenuOpen={setIsMenuOpen}
        ui={ui}
        chat={chat}
        showConfirm={showConfirm}
      />



      <div
        className="chat-history-container"
        style={themeConfig.useStaticColor && themeConfig.bgColor ? { background: themeConfig.bgColor } : {}}
      >
        <div className="chat-history-bg-overlay" style={getChatBackgroundStyle()} />
        <div ref={chatHistoryRef} id="chat-history" className="chat-history scrollbar-custom">
          {chat.roomMessages.length === 0 ? (
            chat.activeRoom.is_group ? (
              <ChatSandboxOpener
                activeRoom={chat.activeRoom}
                activeRoomBots={chat.activeRoomBots}
                selectedTriggerBotId={chat.selectedTriggerBotId}
                chat={chat}
                toast={toast}
              />
            ) : (
              <div className="text-center mt-20" style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
                Sandbox started. Type a prompt to generate the opening reaction!
              </div>
            )
          ) : (
            chat.roomMessages.map((m, msgIdx) => (
              <MessageBubble
                key={m.id || msgIdx}
                m={m}
                msgIdx={msgIdx}
                activeRoomBots={chat.activeRoomBots}
                isGenerating={chat.isGenerating}
                isLast={msgIdx === chat.roomMessages.length - 1}
                swipeRegenMsgId={chat.swipeRegenMsgId}
                onSwipeMessage={chat.handleSwipeMessage}
                onRegenerate={chat.triggerResponseRegeneration}
                onDeleteMessage={chat.handleDeleteMessage}
                onEditMessage={chat.handleEditMessage}
                onTruncateMessages={chat.handleTruncateMessages}
                onBranchRoom={chat.handleBranchRoom}
                setCurrentRoomId={chat.setCurrentRoomId}
                loadRoomMessages={chat.loadRoomMessages}
                showConfirm={showConfirm}
                toast={toast}
              />
            ))
          )}

          {/* Typing Indicator */}
          {chat.typingBot && (
            <div id="typing-indicator-wrapper" className="msg-bubble-wrapper bot animate-fade-in">
              <div className={`char-avatar accent-${getBotAccent(chat.typingBot.id)}`} style={{ width: '40px', height: '40px' }}>
                {chat.typingBot.avatar ? <img src={chat.typingBot.avatar} alt={chat.typingBot.name} loading="lazy" /> : <UserIcon />}
              </div>
              <div className={`msg-bubble accent-${getBotAccent(chat.typingBot.id)}`}>
                <div className="msg-sender-name" style={{ color: 'var(--text-muted)' }}>
                  {chat.typingBot.name} is thinking...
                </div>
                <div className="typing-indicator" style={{ border: 'none', background: 'transparent', padding: '8px 0 0 0', boxShadow: 'none' }}>
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scroll-to-Bottom Floating Button */}
        {showScrollBtn && (
          <button
            type="button"
            className="scroll-to-bottom-btn"
            title="Scroll to bottom"
            onClick={() => {
              chatHistoryRef.current?.scrollTo({
                top: chatHistoryRef.current.scrollHeight,
                behavior: 'smooth'
              });
            }}
          >
            <ChevronDown size={18} />
          </button>
        )}

        <div className="bottom-panel">

          <div className="bot-trigger-bar">
            {/* Left/Center: Circular Roster Avatars */}
            <div id="trigger-avatars-list" className="roster-avatar-list" style={{ flex: '0 1 auto' }}>
              {chat.activeRoomBots.map(b => {
                const isMuted = chat.mutedCharacterIds.has(b.id);
                return (
                  <div
                    key={b.id}
                    id={`trigger-bot-btn-${b.id}`}
                    className={`roster-avatar-circle-wrapper ${isMuted ? 'is-muted' : ''}`}
                    onClick={() => {
                      chat.triggerBotResponse(b.id, toast);
                    }}
                  >
                    <div className={`roster-avatar-circle accent-${getBotAccent(b.id)}`}>
                      {b.avatar ? (
                        <img src={b.avatar} alt={b.name} loading="lazy" />
                      ) : (
                        <UserIcon style={{ width: '20px', height: '20px' }} />
                      )}
                    </div>

                    {/* Tooltip */}
                    <span className="avatar-tooltip">Trigger {b.name}</span>

                    {/* Block/Enable Overlay Icon */}
                    <button
                      className={`avatar-mute-overlay ${isMuted ? 'muted' : 'active'}`}
                      title={isMuted ? `Enable ${b.name}` : `Disable/Block ${b.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        chat.toggleMuteCharacter(b.id);
                      }}
                    >
                      {isMuted ? <Ban size={10} /> : <Check size={10} />}
                    </button>

                    {/* Remove Companion Overlay Icon */}
                    <button
                      className="avatar-remove-overlay"
                      title={`Remove ${b.name} from Chat`}
                      onClick={(e) => {
                        e.stopPropagation();
                        chat.handleRemoveCompanion(b.id);
                      }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Right Side of Roster: Add Character (+) Button */}
            <div className="companion-picker-wrapper" style={{ flexShrink: 0 }}>
              <button
                ref={addBtnRef}
                id="btn-add-companion"
                className="roster-add-btn"
                title="Add character to chat"
                onClick={openAddPicker}
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Add Character Dropup — fixed position to escape overflow:hidden */}
            {isAddPickerOpen && (
              <div
                className="companion-picker-dropup dropup-fixed animate-pop-up"
                style={{
                  position: 'fixed',
                  bottom: addPickerPos.bottom,
                  right: addPickerPos.right,
                  zIndex: 9999,
                }}
              >
                <div className="dropup-header">Add Character</div>
                <div className="dropup-list scrollbar-custom">
                  {eligibleToJoin.length === 0 ? (
                    <div className="dropup-empty">No characters available</div>
                  ) : (
                    eligibleToJoin.map(c => (
                      <button
                        key={c.id}
                        className="dropup-char-item"
                        onClick={() => {
                          chat.handleAddCompanion(c.id);
                          setIsAddPickerOpen(false);
                        }}
                      >
                        {c.avatar ? (
                          <img src={c.avatar} alt={c.name} loading="lazy" />
                        ) : (
                          <div className="char-avatar-placeholder">
                            <UserIcon size={14} />
                          </div>
                        )}
                        <span>{c.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Spacer to push controls to the right */}
            <div style={{ flex: 1 }} />

            {/* Next Speaker Mode (Group Reply Order) Selector Button (Up Arrow) */}
            {chat.activeRoom.is_group && (
              <div className="order-picker-wrapper" style={{ flexShrink: 0, marginLeft: '8px' }}>
                <button
                  ref={orderBtnRef}
                  id="btn-reply-order"
                  className="order-selector-btn"
                  title={`Reply Order Mode: ${chat.selectedTriggerBotId === 'auto' ? 'Auto (Hybrid)' : chat.selectedTriggerBotId === 'cognitive' ? 'Intelligence' : chat.selectedTriggerBotId === 'efficient' ? 'Efficient' : 'Manual'}`}
                  onClick={openOrderMenu}
                >
                  <ChevronUp size={16} />
                </button>
              </div>
            )}

            {/* Order Dropup — fixed position to escape overflow:hidden */}
            {chat.activeRoom.is_group && isOrderMenuOpen && (
              <div
                className="companion-picker-dropup dropup-fixed animate-pop-up reply-order-dropup"
                style={{
                  position: 'fixed',
                  bottom: orderMenuPos.bottom,
                  right: orderMenuPos.right,
                  width: '240px',
                  zIndex: 9999,
                }}
              >
                <div className="dropup-header">Next Speaker Mode</div>
                <div className="dropup-list">
                  <ReplyOrderOption
                    modeId="auto"
                    activeModeId={chat.selectedTriggerBotId}
                    title="Auto (Hybrid Mode)"
                    subtitle="Proximity boosts & constraints"
                    icon={<ChevronUp size={14} />}
                    onClick={() => {
                      chat.setSelectedTriggerBotId('auto');
                      setIsOrderMenuOpen(false);
                    }}
                  />
                  <ReplyOrderOption
                    modeId="cognitive"
                    activeModeId={chat.selectedTriggerBotId}
                    title="Intelligence (Cognitive)"
                    subtitle="Single-call LLM mind auction"
                    icon={<ChevronUp size={14} style={{ transform: 'rotate(90deg)' }} />}
                    onClick={() => {
                      chat.setSelectedTriggerBotId('cognitive');
                      setIsOrderMenuOpen(false);
                    }}
                  />
                  <ReplyOrderOption
                    modeId="efficient"
                    activeModeId={chat.selectedTriggerBotId}
                    title="Efficient (Math Model)"
                    subtitle="Fast sacks model, zero overhead"
                    icon={<ChevronUp size={14} style={{ transform: 'rotate(180deg)' }} />}
                    onClick={() => {
                      chat.setSelectedTriggerBotId('efficient');
                      setIsOrderMenuOpen(false);
                    }}
                  />
                  <ReplyOrderOption
                    modeId={null}
                    activeModeId={chat.selectedTriggerBotId}
                    title="Manual (Click Roster)"
                    subtitle="Choose speaker manually"
                    icon={<UserIcon size={14} />}
                    onClick={() => {
                      chat.setSelectedTriggerBotId(null);
                      setIsOrderMenuOpen(false);
                    }}
                  />
                </div>
              </div>
            )}

          </div>{/* end bot-trigger-bar */}

          <div className="chat-input-container">

            <div className="formatting-helper-bar">
              <span className="spacer" />
            </div>
            <div className="input-row">
              <div className="textarea-wrapper" id="chat-textarea-wrapper">
                <textarea
                  ref={chatTextareaRef}
                  id="chat-textarea"
                  rows="1"
                  placeholder="Type a message"
                  className="scrollbar-custom"
                  value={chat.chatMessage}
                  onChange={(e) => {
                    chat.setChatMessage(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  onKeyDown={(e) => chat.handleTextareaKeyDown(e, toast)}
                />
              </div>
              <div className="input-actions">
                <button
                  id="btn-send-msg"
                  className={`circle-btn primary ${chat.isGenerating || chat.isChainingActive ? 'stop-active' : ''}`}
                  title={chat.isGenerating || chat.isChainingActive ? 'Stop Chaining & Generation' : 'Send Message'}
                  onClick={() => {
                    if (chat.isGenerating || chat.isChainingActive) {
                      chat.handleStopResponseGeneration();
                      chat.changeChainingState(false);
                    } else {
                      chat.handleSendMessage(toast);
                    }
                  }}
                  disabled={!(chat.chatMessage.trim() || chat.isGenerating || chat.isChainingActive)}
                >
                  {chat.isGenerating || chat.isChainingActive ? (
                    <Square size={16} style={{ fill: 'currentColor' }} />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </div>
            </div>
          </div>{/* end chat-input-container */}
        </div>{/* end bottom-panel */}
      </div>{/* end chat-history-container */}

      {/* Wallpaper & Theme Customization Modal */}
      <ChatThemeModal
        isOpen={ui.activeModal === 'chat-theme'}
        onClose={() => ui.setActiveModal(null)}
        themeConfig={themeConfig}
        onChange={handleThemeChange}
      />

    </div>
  );
}
