/* eslint-disable react-hooks/set-state-in-effect */
import React from 'react';
import { useChatContext } from '../../context/ChatContext';
import { useUIContext } from '../../context/UIContext';
import { useToast } from '../../context/ToastContext';
import { useCharacterContext } from '../../context/CharacterContext';
import { useSettingsContext } from '../../context/SettingsContext';
import { Trash2, User as UserIcon, Send, Scroll, Square, Plus, Ban, Check, ChevronUp, X, ArrowLeft, MoreVertical, Palette, MessageSquarePlus, Sparkles } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { getBotAccent } from '../../utils/textFormatter';
import * as api from '../../services/api';
import ChatThemeModal from '../Modals/ChatThemeModal';
import { getWallpaperById } from '../../utils/chatWallpapers';
import { LOCAL_STORAGE_PREFIX } from '../../config';

function ChatHeader({ activeRoom, activeRoomBots, isMenuOpen, setIsMenuOpen, ui, chat, showConfirm }) {
  const menuItems = [
    { label: 'Start New Chat', icon: <MessageSquarePlus size={14} style={{ color: 'var(--pink)' }} />, onClick: () => chat.handleStartNewChat(activeRoom, activeRoomBots, ui.setActiveModal, ui.setActiveTab, ui.setActiveWorldDetail) },
    { label: 'Change Persona', icon: <Sparkles size={14} style={{ color: 'var(--pink)' }} />, onClick: () => ui.setActiveModal('persona-picker') },
    { label: 'Edit Background', icon: <Palette size={14} style={{ color: 'var(--pink)' }} />, onClick: () => ui.setActiveModal('chat-theme') },
    { label: 'Delete Chat', icon: <Trash2 size={14} />, className: 'danger', onClick: () => chat.handleDeleteActiveRoom(showConfirm) }
  ];

  return (
    <header className="chat-header">
      <div className="chat-info">
        <button className="mobile-back-btn" title="Back to List" onClick={() => chat.setCurrentRoomId(null)}>
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
          {activeRoom.is_group && <span id="chat-room-subtitle">{activeRoomBots.length} Bots active</span>}
        </div>
      </div>
      <div className="header-actions">
        <button id="btn-view-memories" className="icon-btn" title="View Smart Memory Book" onClick={() => ui.setActiveModal('memories')}>
          <Scroll size={16} />
        </button>
        <div className="chat-menu-wrapper" style={{ position: 'relative' }}>
          <button id="btn-chat-options" className={`icon-btn ${isMenuOpen ? 'active' : ''}`} title="Chat Options" onClick={(e) => { e.stopPropagation(); setIsMenuOpen(!isMenuOpen); }}>
            <MoreVertical size={16} />
          </button>
          {isMenuOpen && (
            <div className="chat-actions-dropdown glassmorphism">
              {menuItems.map((item, idx) => (
                <button key={idx} type="button" className={`dropdown-item ${item.className || ''}`} onClick={() => { setIsMenuOpen(false); item.onClick(); }}>
                  {item.icon} {item.label}
                </button>
              ))}
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

const DEFAULT_THEME_CONFIG = {
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
};

export default function ChatView() {
  const chat = useChatContext();
  const { chatHistoryRef, chatTextareaRef } = chat;
  const ui = useUIContext();
  const { characters } = useCharacterContext();
  const { toast, showConfirm } = useToast();
  const settings = useSettingsContext();

  const [isAddPickerOpen, setIsAddPickerOpen] = React.useState(false);
  const [isOrderMenuOpen, setIsOrderMenuOpen] = React.useState(false);

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [themeConfig, setThemeConfig] = React.useState(DEFAULT_THEME_CONFIG);

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
        setThemeConfig(DEFAULT_THEME_CONFIG);
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

    if (themeConfig.useCustomBgImage && themeConfig.bgImage) {
      styles.backgroundImage = `url("${themeConfig.bgImage}")`;
      styles.opacity = (themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity / 100 : 1).toString();

      const fill = themeConfig.bgImageFill || 'cover';
      const fillPresets = {
        tile: { backgroundSize: 'auto', backgroundRepeat: 'repeat', backgroundPosition: 'top left' },
        stretch: { backgroundSize: '100% 100%', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
        contain: { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' },
        cover: { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' }
      };
      Object.assign(styles, fillPresets[fill] || fillPresets.cover);
    } else if (themeConfig.themeId === 'none') {
      styles.backgroundImage = 'none';
      styles.opacity = '1';
    } else {
      const wallpaperId = (themeConfig.themeId && themeConfig.themeId !== 'theme-default') ? themeConfig.themeId : ui.themeDesign;
      const wallpaper = getWallpaperById(wallpaperId);
      if (wallpaper) {
        const strokeColor = themeConfig.strokeColor || wallpaper.defaultColor;
        const strokeOpacity = (themeConfig.opacity !== undefined ? themeConfig.opacity : 10) / 100;
        const svgContent = wallpaper.svg(strokeColor, strokeOpacity);

        styles.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`;
        styles.opacity = '1';
        styles.backgroundRepeat = 'repeat';
        styles.backgroundSize = '160px 160px';
        styles.backgroundPosition = '0 0';
      }
    }

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
    setIsAddPickerOpen(!isAddPickerOpen);
    setIsOrderMenuOpen(false);
  };

  const openOrderMenu = (e) => {
    e.stopPropagation();
    setIsOrderMenuOpen(!isOrderMenuOpen);
    setIsAddPickerOpen(false);
  };

  const replyOrderModes = [
    { id: 'auto', title: 'Auto (Hybrid Mode)', subtitle: 'Proximity boosts & constraints', icon: <ChevronUp size={14} /> },
    { id: 'cognitive', title: 'Intelligence (Cognitive)', subtitle: 'Single-call LLM mind auction', icon: <ChevronUp size={14} style={{ transform: 'rotate(90deg)' }} /> },
    { id: 'efficient', title: 'Efficient (Math Model)', subtitle: 'Fast sacks model, zero overhead', icon: <ChevronUp size={14} style={{ transform: 'rotate(180deg)' }} /> },
    { id: null, title: 'Manual (Click Roster)', subtitle: 'Choose speaker manually', icon: <UserIcon size={14} /> }
  ];

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
            chat.roomMessages.map((m, msgIdx) => {
              const prevMsg = chat.roomMessages[msgIdx - 1];
              const nextMsg = chat.roomMessages[msgIdx + 1];

              const isFirstInGroup = !prevMsg ||
                prevMsg.sender_type !== m.sender_type ||
                (m.sender_type !== 'user' && prevMsg.character_id !== m.character_id);

              const isLastInGroup = !nextMsg ||
                nextMsg.sender_type !== m.sender_type ||
                (m.sender_type !== 'user' && nextMsg.character_id !== m.character_id);

              return (
                <MessageBubble
                  key={m.id || msgIdx}
                  m={m}
                  msgIdx={msgIdx}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
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
              );
            })
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
            <div className="companion-picker-wrapper" style={{ flexShrink: 0, position: 'relative' }}>
              <button
                id="btn-add-companion"
                className="roster-add-btn"
                title="Add character to chat"
                onClick={openAddPicker}
              >
                <Plus size={16} />
              </button>

              {/* Add Character Dropup */}
              {isAddPickerOpen && (
                <div
                  className="companion-picker-dropup glassmorphism animate-pop-up"
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 12px)',
                    left: 0,
                    right: 'auto',
                    zIndex: 9999,
                  }}
                >
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
            </div>

            {/* Spacer to push controls to the right */}
            <div style={{ flex: 1 }} />

            {/* Next Speaker Mode (Group Reply Order) Selector Button (Up Arrow) */}
            {chat.activeRoom.is_group && (
              <div className="order-picker-wrapper" style={{ flexShrink: 0, marginLeft: '8px', position: 'relative' }}>
                <button
                  id="btn-reply-order"
                  className="order-selector-btn"
                  title={`Reply Order Mode: ${chat.selectedTriggerBotId === 'auto' ? 'Auto (Hybrid)' : chat.selectedTriggerBotId === 'cognitive' ? 'Intelligence' : chat.selectedTriggerBotId === 'efficient' ? 'Efficient' : 'Manual'}`}
                  onClick={openOrderMenu}
                >
                  <ChevronUp size={16} />
                </button>

                {/* Order Dropup */}
                {isOrderMenuOpen && (
                  <div
                    className="companion-picker-dropup glassmorphism animate-pop-up reply-order-dropup"
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 12px)',
                      right: 0,
                      left: 'auto',
                      width: '240px',
                      zIndex: 9999,
                    }}
                  >
                    <div className="dropup-list">
                      {replyOrderModes.map(mode => (
                        <ReplyOrderOption
                          key={mode.id}
                          modeId={mode.id}
                          activeModeId={chat.selectedTriggerBotId}
                          title={mode.title}
                          subtitle={mode.subtitle}
                          icon={mode.icon}
                          onClick={() => {
                            chat.setSelectedTriggerBotId(mode.id);
                            setIsOrderMenuOpen(false);
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
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
