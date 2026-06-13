import React, { useState, useRef, useEffect, useCallback } from 'react';
import { User as UserIcon, ChevronLeft, ChevronRight, RefreshCw, Trash2, MoreVertical, Copy, ArrowRightCircle, GitBranch as BranchIcon, Pencil, Check, X as XIcon } from 'lucide-react';
import { formatRoleplayText, getBotAccent, getBotAvatarUrl } from '../../utils/textFormatter';

const MessageBubble = React.memo(({
  m,
  activeRoomBots,
  isGenerating,
  isLast,
  swipeRegenMsgId,
  onSwipeMessage,
  onRegenerate,
  onDeleteMessage,
  onEditMessage,
  onTruncateMessages,
  onBranchRoom,
  setCurrentRoomId,
  loadRoomMessages,
  showConfirm,
  toast
}) => {
  const isUser = m.sender_type === 'user';
  const avatarUrl = isUser ? null : getBotAvatarUrl(m.character_id, activeRoomBots);
  const botColor = isUser ? 'user-color' : `bot-${getBotAccent(m.character_id)}`;
  const accentClass = isUser ? '' : `accent-${getBotAccent(m.character_id)}`;

  // Swipe controls
  const hasSwipes = !isUser && m.swipes && m.swipes.length > 1;
  const showRegen = !isUser && !isGenerating;

  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(m.content);
  const textareaRef = useRef(null);

  useEffect(() => {
    setEditContent(m.content || '');
  }, [m.content]);

  // Auto-grow textarea
  const autoGrow = useCallback(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    }
  }, []);

  useEffect(() => {
    if (isEditing) {
      // Focus + position cursor at end
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (ta) {
          autoGrow();
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
        }
      });
    }
  }, [isEditing, autoGrow]);

  const handleSaveEdit = async () => {
    if (isEditing && onEditMessage) {
      try {
        await onEditMessage(m.id, editContent.trim());
        toast?.success('Message updated.');
        setIsEditing(false);
      } catch {
        toast?.error('Failed to update message.');
      }
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(m.content || '');
  };

  // Keyboard shortcuts in edit mode
  const handleEditKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      handleCancelEdit();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.stopPropagation();
      handleSaveEdit();
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const handleCopy = () => {
    navigator.clipboard.writeText(m.content).then(() => {
      toast?.success('Copied!');
    });
    setShowMenu(false);
  };

  const handleDelete = async () => {
    const confirmed = await showConfirm('Are you sure you want to delete this message?');
    if (confirmed && onDeleteMessage) {
      onDeleteMessage(m.id);
    }
    setShowMenu(false);
  };

  const handleMoveToHere = async () => {
    const confirmed = await showConfirm('Are you sure you want to rewind the conversation to this point? This will permanently delete all subsequent messages.');
    if (confirmed && onTruncateMessages) {
      try {
        await onTruncateMessages(m.id);
        toast?.success('Conversation rewound.');
      } catch {
        toast?.error('Failed to rewind.');
      }
    }
    setShowMenu(false);
  };

  const handleBranchOut = async () => {
    if (onBranchRoom) {
      try {
        const newRoom = await onBranchRoom(m.id);
        if (newRoom) {
          setCurrentRoomId(newRoom.id);
          await loadRoomMessages(newRoom.id);
          toast?.success(`Branched timeline: ${newRoom.name}`);
        }
      } catch {
        toast?.error('Failed to branch room.');
      }
    }
    setShowMenu(false);
  };

  const transparentBtnStyle = { background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: 'inherit', opacity: 0.7 };

  return (
    <div className={`msg-bubble-wrapper ${isUser ? 'user animate-fade-in' : 'bot'}`}>
      {!isUser && (
        <div className={`char-avatar ${accentClass}`} style={{ width: '40px', height: '40px', marginTop: '4px' }}>
          {avatarUrl ? <img src={avatarUrl} alt={m.sender_name} loading="lazy" /> : <UserIcon />}
        </div>
      )}
      <div>
        <div
          className={`msg-bubble ${accentClass}${isEditing ? ' is-editing' : ''}`}
          id={`msg-bubble-${m.id}`}
          style={{ paddingBottom: isEditing ? '12px' : '32px', position: 'relative' }}
        >
          <div className={`msg-sender-name ${botColor}`}>{m.sender_name}</div>

          {/* Inline pencil edit button for last message — appears on hover */}
          {isLast && !isEditing && !m.is_streaming && swipeRegenMsgId !== m.id && (
            <button
              className="msg-inline-edit-btn"
              title="Edit message (Ctrl+Enter to save, Esc to cancel)"
              onClick={() => setIsEditing(true)}
            >
              <Pencil size={12} />
            </button>
          )}

          <div className="msg-body-content">
            {isEditing ? (
              <>
                <textarea
                  ref={textareaRef}
                  className="msg-inline-textarea scrollbar-custom"
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); autoGrow(); }}
                  onKeyDown={handleEditKeyDown}
                  placeholder="Edit message..."
                  rows={1}
                />
                <div className="msg-inline-edit-actions">
                  <span className="msg-edit-hint">Ctrl+Enter to save · Esc to cancel</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="msg-inline-btn cancel" onClick={handleCancelEdit} title="Cancel">
                      <XIcon size={12} /> Cancel
                    </button>
                    <button className="msg-inline-btn save" onClick={handleSaveEdit} title="Save">
                      <Check size={12} /> Save
                    </button>
                  </div>
                </div>
              </>
            ) : (
              (m.is_streaming || swipeRegenMsgId === m.id) && !m.content ? (
                <div className="typing-indicator" style={{ border: 'none', background: 'transparent', padding: '4px 0', boxShadow: 'none', display: 'inline-flex', verticalAlign: 'middle' }}>
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
              ) : (
                // fallow-ignore-next-line security-sink
                <div dangerouslySetInnerHTML={{ __html: formatRoleplayText(m.content) }} />
              )
            )}
          </div>

          {swipeRegenMsgId !== m.id && !isEditing && (
            <div className="swipe-controls" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              position: 'absolute',
              bottom: '6px',
              left: '16px',
              marginTop: 0
            }}>
              {hasSwipes && (
                <>
                  <button
                    className="swipe-arrow prev-swipe"
                    onClick={() => onSwipeMessage(m.id, m.active_swipe_index - 1, m.swipes.length)}
                    disabled={m.active_swipe_index === 0 || isGenerating}
                    style={transparentBtnStyle}
                  >
                    <ChevronLeft style={{ width: '14px', height: '14px' }} />
                  </button>
                  <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>{m.active_swipe_index + 1}/{m.swipes.length}</span>
                  <button
                    className="swipe-arrow next-swipe"
                    onClick={() => onSwipeMessage(m.id, m.active_swipe_index + 1, m.swipes.length)}
                    disabled={m.active_swipe_index === m.swipes.length - 1 || isGenerating}
                    style={transparentBtnStyle}
                  >
                    <ChevronRight style={{ width: '14px', height: '14px' }} />
                  </button>
                </>
              )}
            </div>
          )}

          {swipeRegenMsgId !== m.id && !m.is_streaming && !isEditing && (
            <div className="msg-actions" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              position: 'absolute',
              bottom: '6px',
              right: '16px'
            }}>
              {showRegen && (
                <button
                  title="Swipe/Regenerate Response"
                  onClick={() => onRegenerate(m.id, m.character_id, showConfirm)}
                  style={transparentBtnStyle}
                >
                  <RefreshCw style={{ width: '15px', height: '15px' }} />
                </button>
              )}

              <button
                title="Delete Message"
                onClick={handleDelete}
                style={transparentBtnStyle}
              >
                <Trash2 style={{ width: '15px', height: '15px' }} />
              </button>

              <div ref={menuRef} style={{ display: 'flex' }}>
                <button
                  title="More Options"
                  onClick={() => setShowMenu(!showMenu)}
                  style={transparentBtnStyle}
                >
                  <MoreVertical style={{ width: '15px', height: '15px' }} />
                </button>

                {showMenu && (
                  <div className="msg-dropdown-menu">
                    <button className="msg-dropdown-item" onClick={handleCopy}>
                      <Copy size={15} /> Copy
                    </button>
                    <button className="msg-dropdown-item" onClick={handleMoveToHere}>
                      <ArrowRightCircle size={15} /> Move here
                    </button>
                    <button className="msg-dropdown-item" onClick={handleBranchOut}>
                      <BranchIcon size={15} /> Branch
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {isUser && (
        <div className="char-avatar" style={{ width: '40px', height: '40px', marginTop: '4px', flexShrink: 0 }}>
          <UserIcon />
        </div>
      )}
    </div>
  );
});

export default MessageBubble;
