import { useState, useEffect } from 'react';
import { useUIContext } from '../../context/UIContext';
import { useSettingsContext } from '../../context/SettingsContext';
import { useCharacterContext } from '../../context/CharacterContext';
import { useChatContext } from '../../context/ChatContext';
import { User as UserIcon, X, Sparkles, ChevronRight, Search } from 'lucide-react';

export default function PersonaPickerModal({ isOpen }) {
  const ui = useUIContext();
  const settings = useSettingsContext();
  const chars = useCharacterContext();
  const chat = useChatContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSearchQuery('');
      setShowSearch(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const s = settings.settings;
  const customPersonaName = s?.persona_name || 'User';
  const customPersonaAvatar = s?.persona_avatar || null;
  const currentPersonaCharId = settings.settingsForm.persona_character_id;

  const pendingRoom = chat.pendingRoomId ? chat.rooms.find(r => r.id === chat.pendingRoomId) : null;
  const activeBots = pendingRoom ? pendingRoom.bots : chat.activeRoomBots;
  const activeBotIds = new Set(activeBots?.map(b => b.id) || []);

  const availableCharacters = chars.characters.filter(c => !activeBotIds.has(c.id));

  const filteredCharacters = availableCharacters.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="modal-backdrop active" id="modal-persona-picker">
      <div
        className="modal-box glassmorphism scale-in"
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <h2><Sparkles size={18} /> Who are you playing as?</h2>
          <button
            className="modal-close-btn"
            title="Cancel"
            onClick={() => chat.handlePersonaPickerCancel(ui.setActiveModal)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body scrollbar-custom" style={{ padding: '20px' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-sec)', marginBottom: '16px', lineHeight: '1.5' }}>
            Select the persona you want to play as for this chat session.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Custom Persona Option */}
            <button
              type="button"
              id="persona-pick-custom"
              className="persona-pick-card"
              data-active={currentPersonaCharId === null ? 'true' : 'false'}
              onClick={() => chat.handlePersonaPickerConfirm(null, s, ui.setActiveModal, ui.setActiveWorldDetail, ui.setActiveTab)}
            >
              <div className="char-avatar" style={{ width: '48px', height: '48px', flexShrink: 0 }}>
                {customPersonaAvatar
                  ? <img src={customPersonaAvatar} alt={customPersonaName} />
                  : <UserIcon size={20} />}
              </div>
              <div style={{ flex: 1, textAlign: 'left' }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 'bold', fontSize: '0.95rem' }}>
                  {customPersonaName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-sec)', marginTop: '2px' }}>
                  Custom Persona
                </div>
              </div>
              {currentPersonaCharId === null && (
                <span style={{
                  fontSize: '0.7rem', fontFamily: 'var(--font-head)', fontWeight: 'bold',
                  background: 'var(--primary)', color: 'var(--primary-text)',
                  padding: '2px 8px', borderRadius: 'var(--r-sm)', border: 'var(--border-width) solid var(--border)'
                }}>Active</span>
              )}
              <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </button>

            {/* Character Options */}
            {availableCharacters.length > 0 && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingLeft: '2px',
                  paddingRight: '2px',
                  height: '32px',
                  position: 'relative'
                }}>
                  {/* Section Title */}
                  <span style={{
                    fontSize: '0.72rem',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 'bold',
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    height: '100%',
                    lineHeight: 1
                  }}>Play as a Character</span>

                  {/* Expanding Search Bar Container */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    flex: 1,
                    height: '100%',
                    position: 'relative',
                    marginLeft: '12px'
                  }}>
                    <div className="search-bar" style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: showSearch ? 'var(--bg-input, rgba(0,0,0,0.05))' : 'transparent',
                      border: showSearch ? 'var(--border-width) solid var(--border)' : '1px solid transparent',
                      borderRadius: '20px',
                      padding: showSearch ? '4px 12px' : '0px',
                      height: '100%',
                      margin: 0,
                      boxSizing: 'border-box',
                      transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s, border-color 0.25s',
                      width: showSearch ? '100%' : '32px',
                      cursor: showSearch ? 'default' : 'pointer',
                      overflow: 'hidden'
                    }}
                      onClick={() => {
                        if (!showSearch) {
                          setShowSearch(true);
                        }
                      }}
                    >
                      {/* Search Icon (acts as button when closed, or passive icon when open) */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: showSearch ? 'auto' : '32px',
                          height: showSearch ? 'auto' : '32px',
                          color: showSearch ? 'var(--pink)' : 'var(--text-muted)',
                          flexShrink: 0,
                          transition: 'color 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!showSearch) e.currentTarget.style.color = 'var(--pink)';
                        }}
                        onMouseLeave={(e) => {
                          if (!showSearch) e.currentTarget.style.color = 'var(--text-muted)';
                        }}
                      >
                        <Search size={14} />
                      </div>

                      {/* Search input field */}
                      <input
                        type="text"
                        id="search-persona-chars-input"
                        placeholder="Search characters..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus={showSearch}
                        ref={(input) => { if (input && showSearch) input.focus(); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text)',
                          fontFamily: 'var(--font-body)',
                          fontSize: '0.8rem',
                          outline: 'none',
                          flex: 1,
                          padding: 0,
                          margin: 0,
                          marginLeft: showSearch ? '6px' : '0px',
                          minWidth: 0,
                          opacity: showSearch ? 1 : 0,
                          transition: 'opacity 0.2s ease',
                          pointerEvents: showSearch ? 'auto' : 'none'
                        }}
                      />

                      {/* Cancel search button */}
                      {showSearch && (
                        <button
                          type="button"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            animation: 'fadeIn 0.2s ease'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--pink)'}
                          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                          onClick={(e) => {
                            e.stopPropagation(); // prevent outer click from re-opening search
                            setShowSearch(false);
                            setSearchQuery('');
                          }}
                          title="Clear Search"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {filteredCharacters.length > 0 && (
                  <div className="persona-picker-grid">
                    {filteredCharacters.map(c => {
                      const isActive = currentPersonaCharId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          id={`persona-pick-char-${c.id}`}
                          className="persona-grid-item"
                          data-active={isActive ? 'true' : 'false'}
                          onClick={() => chat.handlePersonaPickerConfirm(c.id, s, ui.setActiveModal, ui.setActiveWorldDetail, ui.setActiveTab)}
                        >
                          <div className="persona-grid-avatar-container">
                            {c.avatar ? (
                              <img src={c.avatar} alt={c.name} />
                            ) : (
                              <div className="persona-grid-avatar-fallback">
                                {c.name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            {isActive && (
                              <div className="persona-grid-check-badge">
                                ✓
                              </div>
                            )}
                          </div>
                          <span className="persona-grid-name">
                            {c.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {availableCharacters.length > 0 && filteredCharacters.length === 0 && (
              <div style={{
                textAlign: 'center',
                padding: '24px 0',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.8rem'
              }}>
                No characters match your search.
              </div>
            )}
          </div>

          {/* Skip button */}
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <button
              type="button"
              id="persona-pick-skip"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-head)',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                padding: '8px 16px',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.color = 'var(--pink)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}
              onClick={() => chat.handlePersonaPickerSkip(ui.setActiveModal, ui.setActiveWorldDetail, ui.setActiveTab)}
            >
              Skip & Use Current Persona
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
