/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import * as api from '../services/api';
import { useCharacterContext } from './CharacterContext';
import { parseSseStream } from '../utils/sseParser';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { characters } = useCharacterContext();
  const [currentRoomId, setCurrentRoomId] = useState(() => localStorage.getItem('rp_current_room_id') || null);
  const [rooms, setRooms] = useState([]);
  const [activeRoomBots, setActiveRoomBots] = useState([]);
  const [selectedTriggerBotId, setSelectedTriggerBotId] = useState(() => {
    const saved = localStorage.getItem('rp_selected_trigger_bot_id');
    if (saved === 'auto') return 'auto';
    if (saved === 'cognitive') return 'cognitive';
    if (saved !== null && !isNaN(saved)) return Number(saved);
    return saved ?? 'auto';
  });
  const [pendingRoomId, setPendingRoomId] = useState(null);

  // Selected Trigger Bot Persistence
  useEffect(() => {
    if (selectedTriggerBotId !== null) {
      localStorage.setItem('rp_selected_trigger_bot_id', selectedTriggerBotId);
    } else {
      localStorage.removeItem('rp_selected_trigger_bot_id');
    }
  }, [selectedTriggerBotId]);

  const [mutedCharacterIds, setMutedCharacterIds] = useState(new Set());
  
  const toggleMuteCharacter = useCallback((charId) => {
    setMutedCharacterIds(prev => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  }, []);

  const [roomMessages, setRoomMessages] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [typingBot, setTypingBot] = useState(null);
  const [swipeRegenMsgId, setSwipeRegenMsgId] = useState(null);

  const [isChainingActive, setIsChainingActive] = useState(false);
  const selectedTriggerBotIdRef = useRef(null);
  const abortControllerRef = useRef(null);

  const handleStopResponseGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      console.log('[Streaming] Generation aborted by user.');
    }
    setIsGenerating(false);
    setTypingBot(null);
    setSwipeRegenMsgId(null);
  }, []);

  const changeChainingState = useCallback((active) => {
    setIsChainingActive(active);
    console.log(`[Chaining] State updated: ${active}`);
  }, []);

  useEffect(() => {
    selectedTriggerBotIdRef.current = selectedTriggerBotId;
  }, [selectedTriggerBotId]);

  const [roomForm, setRoomForm] = useState({ name: '', description: '', selectedCharIds: new Set() });

  const chatHistoryRef = useRef(null);
  const chatTextareaRef = useRef(null);

  // Track if user is near the bottom to determine if we should auto-scroll on new messages
  const isNearBottomRef = useRef(true);

  // Attach scroll event listener to track user scroll position
  useEffect(() => {
    const el = chatHistoryRef.current;
    if (!el) return;

    const handleScroll = () => {
      const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      // If client is within 120px of bottom, treat as locked to bottom
      isNearBottomRef.current = distanceToBottom < 120;
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, [currentRoomId]); // Re-attach if container re-mounts on room change

  // Persistence
  useEffect(() => {
    if (currentRoomId !== null) localStorage.setItem('rp_current_room_id', currentRoomId);
    else localStorage.removeItem('rp_current_room_id');
  }, [currentRoomId]);

  // Reset scroll-lock and scroll to bottom when room changes
  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
      isNearBottomRef.current = true;
    }
  }, [currentRoomId]);

  // Auto-scroll
  useEffect(() => {
    if (chatHistoryRef.current && isNearBottomRef.current) {
      const lastMsg = roomMessages[roomMessages.length - 1];
      const isStreaming = lastMsg?.is_streaming || isGenerating;
      if (isStreaming) {
        chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
      } else {
        chatHistoryRef.current.scrollTo({
          top: chatHistoryRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [roomMessages, typingBot, isGenerating]);

  // Default trigger bot
  useEffect(() => {
    if (activeRoomBots.length > 0) {
      const currentIsValid = selectedTriggerBotId === 'auto' || selectedTriggerBotId === 'cognitive' || selectedTriggerBotId === 'efficient' || activeRoomBots.some(b => b.id === selectedTriggerBotId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (!currentIsValid) setSelectedTriggerBotId('auto');
    } else {
      setSelectedTriggerBotId(null);
    }
  }, [activeRoomBots, selectedTriggerBotId]);

  // Sync bots from rooms list when room changes
  useEffect(() => {
    if (currentRoomId && rooms.length > 0) {
      const room = rooms.find(r => r.id === currentRoomId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (room) setActiveRoomBots(room.bots);
      changeChainingState(false);
    }
  }, [currentRoomId, rooms, changeChainingState]);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await api.fetchRooms();
      setRooms(data);
    } catch (e) { console.error('Failed to load rooms:', e); }
  }, []);

  // Sync rooms list whenever the global characters list changes (e.g. name or avatar edits)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRooms();
  }, [characters, fetchRooms]);

  const loadRoomMessages = useCallback(async (roomId) => {
    try {
      setRoomMessages(await api.fetchRoomMessages(roomId));
    } catch (e) { console.error('Failed to load messages:', e); }
  }, []);

  const _doEnterRoom = useCallback(async (roomId, setActiveModal, setActiveTab, setActiveWorldDetail) => {
    setCurrentRoomId(roomId);
    const room = rooms.find(r => r.id === roomId);
    if (room) setActiveRoomBots(room.bots);
    if (setActiveWorldDetail) setActiveWorldDetail(false);
    await loadRoomMessages(roomId);
    if (setActiveTab) setActiveTab('rooms');
  }, [rooms, loadRoomMessages]);

  const handleEnterRoom = useCallback((roomId, setActiveModal, isNewRoom = false, setActiveTab = null, setActiveWorldDetail = null) => {
    if (isNewRoom) {
      setPendingRoomId(roomId);
      setActiveModal('persona-picker');
    } else {
      _doEnterRoom(roomId, setActiveModal, setActiveTab, setActiveWorldDetail);
    }
  }, [_doEnterRoom]);

  const handlePersonaPickerConfirm = useCallback(async (personaCharId, settings, setActiveModal, setActiveWorldDetail, setActiveTab) => {
    try {
      await api.saveSettings({ ...settings, persona_character_id: personaCharId });
    } catch (e) { console.warn('Persona save failed:', e); }
    setActiveModal(null);
    if (pendingRoomId) {
      await _doEnterRoom(pendingRoomId, setActiveModal, setActiveTab, setActiveWorldDetail);
      setPendingRoomId(null);
    }
  }, [pendingRoomId, _doEnterRoom]);

  const handlePersonaPickerSkip = useCallback(async (setActiveModal, setActiveWorldDetail, setActiveTab) => {
    setActiveModal(null);
    if (pendingRoomId) {
      await _doEnterRoom(pendingRoomId, setActiveModal, setActiveTab, setActiveWorldDetail);
      setPendingRoomId(null);
    }
  }, [pendingRoomId, _doEnterRoom]);

  const handleRoomSubmit = useCallback(async (form) => {
    const roomData = {
      name: form.name,
      is_group: form.selectedCharIds.size > 1,
      character_ids: Array.from(form.selectedCharIds),
      description: form.description || '',
    };
    const room = await api.createRoom(roomData);
    // Reset form after successful creation
    setRoomForm({ name: '', description: '', selectedCharIds: new Set() });
    await fetchRooms();
    return room;
  }, [fetchRooms]);

  const handleDeleteRoom = useCallback(async (roomId) => {
    await api.deleteRoom(roomId);
    await fetchRooms();
  }, [fetchRooms]);

  const handleDeleteActiveRoom = useCallback(async (showConfirm) => {
    if (!currentRoomId) return;
    const confirmed = await showConfirm('Are you sure you want to permanently delete this chat and all its message logs?');
    if (!confirmed) return;
    await api.deleteRoom(currentRoomId);
    setCurrentRoomId(null);
    setActiveRoomBots([]);
    setRoomMessages([]);
    await fetchRooms();
  }, [currentRoomId, fetchRooms]);

  const handleStartSingleChat = useCallback(async (character, setActiveModal, setActiveTab, setActiveWorldDetail) => {
    const existing = rooms.find(r => !r.is_group && r.bots.length === 1 && r.bots[0].id === character.id);
    if (existing) { handleEnterRoom(existing.id, setActiveModal, false, setActiveTab, setActiveWorldDetail); return; }
    const room = await api.createRoom({ name: character.name, is_group: false, character_ids: [character.id] });
    await fetchRooms();
    handleEnterRoom(room.id, setActiveModal, true, setActiveTab, setActiveWorldDetail);
  }, [rooms, handleEnterRoom, fetchRooms]);

  const handleToggleRoomChar = useCallback((charId) => {
    setRoomForm(prev => {
      const next = new Set(prev.selectedCharIds);
      next.has(charId) ? next.delete(charId) : next.add(charId);
      return { ...prev, selectedCharIds: next };
    });
  }, []);

  // ── Chat / Generation ──────────────────────────────────────────────────────

  const triggerBotResponse = useCallback(async (botId, toast) => {
    if (isGenerating || !currentRoomId) return;
    isNearBottomRef.current = true;
    setIsGenerating(true);
    const targetBot = activeRoomBots.find(b => b.id === botId);
    if (!targetBot) { setIsGenerating(false); return; }
    setTypingBot({ name: targetBot.name, avatar: targetBot.avatar });


    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const mutedIdsStr = Array.from(mutedCharacterIds).join(',');
      const room = rooms.find(r => r.id === currentRoomId);
      const isAuto = room?.is_group && (selectedTriggerBotIdRef.current === 'auto' || selectedTriggerBotIdRef.current === 'cognitive' || selectedTriggerBotIdRef.current === 'efficient');
      const activeMode = selectedTriggerBotIdRef.current || 'auto';
      const response = await api.generateBotResponse(currentRoomId, botId, isAuto, mutedIdsStr, activeMode, signal);
      setTypingBot(null);
      if (!response.ok) {
        toast?.error('Backend returned an error. Make sure Ollama/LM Studio is running and connected.');
        setIsGenerating(false); return;
      }

      let currentTempId = `streaming-temp-${botId}`;
      let compiled = '';

      await parseSseStream(response, (dataContent) => {
        try {
          const data = JSON.parse(dataContent);
          
          if (data.bot_start) {
            const { character_id, name } = data.bot_start;
            compiled = '';
            currentTempId = `streaming-temp-${character_id}-${Date.now()}`;
            const tempMsg = { 
              id: currentTempId, 
              sender_type: 'character', 
              character_id: character_id, 
              sender_name: name, 
              content: '', 
              is_streaming: true 
            };
            setRoomMessages(prev => {
              const filtered = prev.filter(m => !m.is_streaming || m.id === currentTempId);
              if (filtered.some(m => m.id === currentTempId)) return filtered;
              return [...filtered, tempMsg];
            });
          }
          
          if (data.token) { 
            compiled += data.token; 
            setRoomMessages(prev => prev.map(m => m.id === currentTempId ? { ...m, content: compiled } : m)); 
          }
          
          if (data.done) {
            const dbMsgId = data.message_id;
            setRoomMessages(prev => prev.map(m => m.id === currentTempId ? { ...m, id: dbMsgId, is_streaming: false } : m));
            fetchRooms();
          }
          
          if (data.chain_done) {
            console.log("[Chaining] Backend auto-chain completed successfully.");
            changeChainingState(false);
          }
          
          if (data.error) {
            toast?.error(`Generation error: ${data.error}`);
          }
        } catch (err) {
          console.warn("[Streaming] Failed to parse SSE line JSON:", err);
        }
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        console.log('[Streaming] Aborted by user.');
      } else {
        toast?.error('Streaming connection crashed.');
      }
    } finally {
      abortControllerRef.current = null;
      setTypingBot(null);
      setIsGenerating(false);
      changeChainingState(false);
      
      try {
        const finalRoomMessages = await api.fetchRoomMessages(currentRoomId);
        setRoomMessages(finalRoomMessages);
        await fetchRooms();
      } catch (e) {
        console.error("Failed to load room messages after generate:", e);
      }
    }
  }, [isGenerating, currentRoomId, activeRoomBots, changeChainingState, mutedCharacterIds, fetchRooms, rooms]);

  const handleSendMessage = useCallback(async (toast) => {
    if (!currentRoomId || !chatMessage.trim()) return;
    isNearBottomRef.current = true;

    // If generation is active, interrupt it first to allow immediate user messaging
    if (isGenerating) {
      handleStopResponseGeneration();
      changeChainingState(false);
      // Wait a tiny moment for abort to fully settle
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const content = chatMessage.trim();
    setChatMessage('');
    if (chatTextareaRef.current) chatTextareaRef.current.style.height = 'auto';
    try {
      await api.sendMessage(currentRoomId, content, 'User');
      const freshMessages = await api.fetchRoomMessages(currentRoomId);
      setRoomMessages(freshMessages);
      await fetchRooms();

      const room = rooms.find(r => r.id === currentRoomId);
      if (!room?.is_group) {
        if (activeRoomBots.length > 0) {
          triggerBotResponse(activeRoomBots[0].id, toast);
        }
        return;
      }

      const triggerId = selectedTriggerBotIdRef.current;
      if (triggerId === 'cognitive') {
        // Solution A: Bypass pre-flight auction entirely! 
        // Backend runs the joint selection and dialogue generation in a single stream
        changeChainingState(true);
        if (activeRoomBots.length > 0) {
          triggerBotResponse(activeRoomBots[0].id, toast);
        } else {
          changeChainingState(false);
        }
      } else if (triggerId === 'auto' || triggerId === 'efficient') {
        // Fallback or mathematical mode continues using the fast local efficient selector
        changeChainingState(true);
        const mutedIdsStr = Array.from(mutedCharacterIds).join(',');
        const firstSpeaker = await api.fetchNextSpeaker(currentRoomId, content, mutedIdsStr, triggerId || 'auto');
        if (firstSpeaker?.next_speaker_id) {
          triggerBotResponse(firstSpeaker.next_speaker_id, toast);
        } else {
          changeChainingState(false);
        }
      } else {
        const firstBotId = triggerId || (activeRoomBots.length === 1 ? activeRoomBots[0].id : null);
        if (firstBotId) triggerBotResponse(firstBotId, toast);
      }
    } catch {
      toast.error('Failed to deliver message.');
    }
  }, [isGenerating, currentRoomId, chatMessage, activeRoomBots, triggerBotResponse, changeChainingState, mutedCharacterIds, handleStopResponseGeneration, rooms, fetchRooms]);

  const handleTextareaKeyDown = useCallback((e, toast) => {
    const textarea = chatTextareaRef.current;

    if (e.key === 'Enter' && !e.shiftKey) { 
      if (textarea) {
        const { selectionStart, selectionEnd, value } = textarea;
        if (selectionStart === selectionEnd && value[selectionStart] === '*') {
          e.preventDefault();
          textarea.selectionStart = selectionStart + 1;
          textarea.selectionEnd = selectionStart + 1;
          return;
        }
      }
      e.preventDefault(); 
      handleSendMessage(toast); 
    }

    if (e.key === '*') {
      if (textarea) {
        e.preventDefault();
        const { selectionStart, selectionEnd, value } = textarea;
        if (selectionStart !== selectionEnd) {
          const selectedText = value.substring(selectionStart, selectionEnd);
          const newValue = value.substring(0, selectionStart) + '*' + selectedText + '*' + value.substring(selectionEnd);
          setChatMessage(newValue);
          setTimeout(() => {
            textarea.selectionStart = selectionStart + 1;
            textarea.selectionEnd = selectionEnd + 1;
          }, 0);
        } else {
          const newValue = value.substring(0, selectionStart) + '**' + value.substring(selectionEnd);
          setChatMessage(newValue);
          setTimeout(() => {
            textarea.selectionStart = selectionStart + 1;
            textarea.selectionEnd = selectionStart + 1;
          }, 0);
        }
      }
    }
  }, [handleSendMessage]);

  const handleSwipeMessage = useCallback(async (msgId, newIndex, total) => {
    if (newIndex < 0 || newIndex >= total || isGenerating) return;
    await api.swipeMessage(currentRoomId, msgId, newIndex);
    await loadRoomMessages(currentRoomId);
    await fetchRooms();
  }, [currentRoomId, isGenerating, loadRoomMessages, fetchRooms]);

  const handleDeleteMessage = useCallback(async (msgId) => {
    if (isGenerating) return;
    await api.deleteMessage(msgId);
    await loadRoomMessages(currentRoomId);
    await fetchRooms();
  }, [isGenerating, currentRoomId, loadRoomMessages, fetchRooms]);

  const handleEditMessage = useCallback(async (msgId, content) => {
    if (isGenerating) return;
    await api.updateMessage(msgId, content);
    await loadRoomMessages(currentRoomId);
    await fetchRooms();
  }, [isGenerating, currentRoomId, loadRoomMessages, fetchRooms]);

  const handleTruncateMessages = useCallback(async (msgId) => {
    if (isGenerating || !currentRoomId) return;
    await api.truncateMessages(currentRoomId, msgId);
    await loadRoomMessages(currentRoomId);
    await fetchRooms();
  }, [isGenerating, currentRoomId, loadRoomMessages, fetchRooms]);

  const handleAddCompanion = useCallback(async (characterId) => {
    if (!currentRoomId) return;
    try {
      const updatedRoom = await api.addRoomMember(currentRoomId, characterId);
      await fetchRooms();
      setActiveRoomBots(updatedRoom.bots);
    } catch (e) {
      console.error("Failed to add companion:", e);
    }
  }, [currentRoomId, fetchRooms]);

  const handleRemoveCompanion = useCallback(async (characterId) => {
    if (!currentRoomId) return;
    try {
      const updatedRoom = await api.removeRoomMember(currentRoomId, characterId);
      await fetchRooms();
      setActiveRoomBots(updatedRoom.bots);
    } catch (e) {
      console.error("Failed to remove companion:", e);
    }
  }, [currentRoomId, fetchRooms]);

  const handleBranchRoom = useCallback(async (msgId) => {
    if (isGenerating || !currentRoomId) return null;
    const newRoom = await api.branchRoom(currentRoomId, msgId);
    await fetchRooms();
    return newRoom;
  }, [isGenerating, currentRoomId, fetchRooms]);

  const triggerResponseRegeneration = useCallback(async (msgId) => {
    if (isGenerating) return;
    isNearBottomRef.current = true;
    setIsGenerating(true);
    setSwipeRegenMsgId(msgId);
    // Clear message content to show the inline thinking indicator
    setRoomMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: '', is_streaming: true } : m));

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      let compiled = '';
      await api.regenerateSwipe(currentRoomId, msgId, (token) => {
        compiled += token;
        setRoomMessages(prev => prev.map(m => m.id === msgId ? { ...m, content: compiled, is_streaming: true } : m));
      }, signal);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[Swipe Regen] Aborted by user.');
      } else {
        console.error("Swipe regen failed:", err);
      }
    } finally {
      abortControllerRef.current = null;
      setSwipeRegenMsgId(null);
      setIsGenerating(false);
      await loadRoomMessages(currentRoomId);
      await fetchRooms();
    }
  }, [isGenerating, currentRoomId, loadRoomMessages, fetchRooms]);

  const insertAsteriskHelper = useCallback(() => {
    const textarea = chatTextareaRef.current;
    if (!textarea) return;
    const { selectionStart: start, selectionEnd: end } = textarea;
    let newText, offset;
    if (start === end) { newText = chatMessage.slice(0, start) + '**' + chatMessage.slice(end); offset = 1; }
    else { newText = chatMessage.slice(0, start) + '*' + chatMessage.slice(start, end) + '*' + chatMessage.slice(end); offset = 2; }
    setChatMessage(newText);
    setTimeout(() => { textarea.focus(); textarea.selectionStart = textarea.selectionEnd = end + offset; }, 0);
  }, [chatMessage]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    if (currentRoomId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadRoomMessages(currentRoomId);
    }
  }, [currentRoomId, loadRoomMessages]);

  const activeRoom = rooms.find(r => r.id === currentRoomId);

  const value = useMemo(() => ({
    rooms, currentRoomId, setCurrentRoomId,
    activeRoomBots, setActiveRoomBots,
    selectedTriggerBotId, setSelectedTriggerBotId,
    pendingRoomId,
    activeRoom,
    roomMessages, setRoomMessages,
    isGenerating, chatMessage, setChatMessage,
    typingBot, swipeRegenMsgId, chatHistoryRef, chatTextareaRef,
    roomForm, setRoomForm,
    fetchRooms, loadRoomMessages,
    handleEnterRoom, handlePersonaPickerConfirm, handlePersonaPickerSkip,
    handleRoomSubmit, handleDeleteRoom, handleDeleteActiveRoom,
    handleStartSingleChat, handleToggleRoomChar,
    handleSendMessage, handleTextareaKeyDown,
    triggerBotResponse, handleSwipeMessage,
    triggerResponseRegeneration, insertAsteriskHelper, handleDeleteMessage,
    handleEditMessage, handleTruncateMessages, handleBranchRoom,
    isChainingActive, changeChainingState,
    mutedCharacterIds, toggleMuteCharacter,
    handleAddCompanion, handleRemoveCompanion, handleStopResponseGeneration,
  }), [
    rooms, currentRoomId,
    activeRoomBots,
    selectedTriggerBotId,
    pendingRoomId,
    activeRoom,
    roomMessages,
    isGenerating, chatMessage,
    typingBot, swipeRegenMsgId,
    roomForm,
    fetchRooms, loadRoomMessages,
    handleEnterRoom, handlePersonaPickerConfirm, handlePersonaPickerSkip,
    handleRoomSubmit, handleDeleteRoom, handleDeleteActiveRoom,
    handleStartSingleChat, handleToggleRoomChar,
    handleSendMessage, handleTextareaKeyDown,
    triggerBotResponse, handleSwipeMessage,
    triggerResponseRegeneration, insertAsteriskHelper, handleDeleteMessage,
    handleEditMessage, handleTruncateMessages, handleBranchRoom,
    isChainingActive, changeChainingState,
    mutedCharacterIds, toggleMuteCharacter,
    handleAddCompanion, handleRemoveCompanion, handleStopResponseGeneration,
  ]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider');
  return ctx;
}
