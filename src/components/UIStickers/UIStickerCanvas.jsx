/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Check, Sliders } from 'lucide-react';
import * as api from '../../services/api';

// Large macro container selectors for standard layout placement
const MACRO_ANCHORS = [
  '#sidebar',
  '#chat-view',
  '#world-detail-view',
  '#landing-view',
  '#modal-settings .modal-box',
  '#modal-character .modal-box',
  '#modal-room .modal-box',
  '#modal-lore .modal-box',
  '#modal-memories .modal-box',
  '#main-workspace'
];

// Scrolling/Micro list boxes to support specific relative scrolling lock
const LOCKABLE_SELECTORS = [
  '#chat-textarea-wrapper', // Box covering the chat text area
  '.input-row',            // Text area row wrapper
  '.chat-input-container', // Chat text entry area
  '.char-card',
  '.room-item',
  '.feature-card',
  '.form-group',
  '.lore-item',            // Lore entries on World Page
  '.trigger-bot-btn-wrapper', // Bot trigger button wrappers (specific child)
  '.bot-trigger-bar',       // Chat triggers bar (parent container)
  '.world-info-panel'       // Empty background of Lore View
];

// Stylings for circular corner resize/rotate drag handle dots
const cornerHandleStyle = {
  position: 'absolute',
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  border: '2px solid #000000',
  boxShadow: '1px 1px 0px #000000',
  background: 'var(--primary)', // Neo Brutalist Golden Yellow
  zIndex: 100005
};

// Generates a robust, stable CSS selector path for dynamic React DOM nodes
const getStableSelector = (el) => {
  if (!el) return null;

  // Direct stable selectors for chat input and text area zones
  if (el.id === 'chat-textarea' || el.id === 'chat-textarea-wrapper' || (el.classList && el.classList.contains('textarea-wrapper'))) {
    return '#chat-view .chat-input-container .textarea-wrapper';
  }
  if (el.classList && el.classList.contains('input-row')) {
    return '#chat-view .chat-input-container .input-row';
  }
  if (el.classList && el.classList.contains('chat-input-container')) {
    return '#chat-view .chat-input-container';
  }

  // 1. If it has a persistent database ID, use it directly (highly stable)
  if (el.id && (
    el.id.startsWith('msg-bubble-') ||
    el.id.startsWith('char-card-') ||
    el.id.startsWith('room-item-') ||
    el.id.startsWith('lore-item-') ||
    el.id.startsWith('trigger-bot-btn-')
  )) {
    return `#${el.id}`;
  }

  // 1b. Highly unique panel classes
  if (el.classList && el.classList.contains('world-info-panel')) {
    return '#world-detail-view .world-info-panel';
  }

  // 2. Traverses up the DOM hierarchy to build a reliable CSS tree selector
  const path = [];
  let current = el;
  while (current && current !== document.body) {
    if (current.id && (
      current.id.startsWith('modal-') ||
      current.id === 'sidebar' ||
      current.id === 'chat-view' ||
      current.id === 'main-workspace' ||
      current.id === 'world-detail-view'
    )) {
      path.unshift(`#${current.id}`);
      break;
    }

    const parent = current.parentNode;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current) + 1;
      const tagName = current.tagName.toLowerCase();
      const className = current.className ? '.' + current.className.split(' ')[0] : '';

      path.unshift(`${tagName}${className}:nth-child(${index})`);
      current = parent;
    } else {
      break;
    }
  }

  return path.join(' > ');
};

function isStickerAnchorTarget(node) {
  if (node.nodeType !== Node.ELEMENT_NODE) return false;
  const el = node;
  return (
    el.id?.startsWith('msg-bubble-') ||
    el.id?.startsWith('modal-') ||
    el.id?.startsWith('char-card-') ||
    el.id?.startsWith('room-item-') ||
    el.id?.startsWith('lore-item-') ||
    el.classList?.contains('modal-box') ||
    el.classList?.contains('chat-view') ||
    el.querySelector?.('[id^="msg-bubble-"], [id^="modal-"], .chat-view, .char-card')
  );
}

function findLockableTargetFromPoints(points) {
  for (const pt of points) {
    const candidate = document.elementFromPoint(pt.x, pt.y);
    if (!candidate) continue;
    for (const selector of LOCKABLE_SELECTORS) {
      const closest = candidate.closest(selector);
      if (closest) {
        return closest;
      }
    }
  }
  return null;
}

export default function UIStickerCanvas() {
  const [stickers, setStickers] = useState([]);
  const [activeStickerId, setActiveStickerId] = useState(null);
  const [activeDragId, setActiveDragId] = useState(null); // Shifts portal to body during dragging
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [showOpacitySlider, setShowOpacitySlider] = useState(null);
  const [, setDomTick] = useState(0); // Triggers re-renders on dynamic layout shifts

  // File input ref for settings trigger
  const fileInputRef = useRef(null);

  // Dragging states
  const dragInfo = useRef({ isDragging: false, stickerId: null, startX: 0, startY: 0, initialX: 0, initialY: 0, el: null });
  const resizeRotateInfo = useRef({ isResizing: false, stickerId: null, center: null, startDistance: 0, startAngle: 0, initialScale: 1, initialRotation: 0, el: null, currentScale: 1, currentRotation: 0 });

  // Tracks highlighted DOM targets during active dragging
  const prevLockTarget = useRef(null);

  // Throttled mouse tracking variables for requestAnimationFrame
  const mouseMovePending = useRef(false);
  const latestMousePos = useRef({ x: 0, y: 0 });
  const resizeRotatePending = useRef(false);
  const latestResizeMousePos = useRef({ x: 0, y: 0 });

  // High-performance MutationObserver to track when dynamic modal/chat nodes mount/unmount
  useEffect(() => {
    let timeoutId = null;
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (isStickerAnchorTarget(node)) {
            shouldUpdate = true;
            break;
          }
        }
        if (shouldUpdate) break;
        for (const node of mutation.removedNodes) {
          if (isStickerAnchorTarget(node)) {
            shouldUpdate = true;
            break;
          }
        }
        if (shouldUpdate) break;
      }

      if (shouldUpdate) {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          setDomTick(prev => prev + 1);
        }, 150);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Trigger re-renders on window resize to ensure correct alignment of stickers
  useEffect(() => {
    let timeoutId = null;
    const handleResize = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDomTick(prev => prev + 1);
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Sync state changes with the rest of the application (e.g. settings modal)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('sticker-state-changed', {
      detail: { isEditingMode }
    }));
  }, [isEditingMode]);

  const loadStickers = useCallback(async () => {
    try {
      const data = await api.fetchStickers();
      setStickers(data);
    } catch (err) {
      console.error("Failed to load UI stickers:", err);
    }
  }, []);

  // Load stickers and register custom event listeners
  useEffect(() => {
    loadStickers();

    const handleTriggerUpload = () => {
      fileInputRef.current?.click();
    };

    const handleToggleEditing = () => {
      setIsEditingMode(prev => {
        const next = !prev;
        if (!next) {
          setActiveStickerId(null);
          setShowOpacitySlider(null);
        }
        return next;
      });
    };

    const handleRequestState = () => {
      window.dispatchEvent(new CustomEvent('sticker-state-changed', {
        detail: { isEditingMode }
      }));
    };

    window.addEventListener('sticker-trigger-upload', handleTriggerUpload);
    window.addEventListener('sticker-toggle-editing', handleToggleEditing);
    window.addEventListener('sticker-request-state', handleRequestState);

    // Initial sync
    window.dispatchEvent(new CustomEvent('sticker-state-changed', {
      detail: { isEditingMode }
    }));

    return () => {
      window.removeEventListener('sticker-trigger-upload', handleTriggerUpload);
      window.removeEventListener('sticker-toggle-editing', handleToggleEditing);
      window.removeEventListener('sticker-request-state', handleRequestState);
    };
  }, [loadStickers, isEditingMode]);

  // Helper to resolve active screen coordinates of a sticker (used to snap dragging seamlessly)
  const getStickerScreenCoords = (sticker) => {
    if (sticker.target_selectors) {
      const selectors = sticker.target_selectors.split(',');
      try {
        const primaryEl = document.querySelector(selectors[0]);
        if (primaryEl) {
          const rect = primaryEl.getBoundingClientRect();
          const scrollLeft = primaryEl.scrollLeft || 0;
          const scrollTop = primaryEl.scrollTop || 0;
          return { x: rect.left + sticker.x - scrollLeft, y: rect.top + sticker.y - scrollTop };
        }
      } catch { /* ignore */ }
    }
    return { x: sticker.x, y: sticker.y };
  };

  // Upload new sticker image
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result;

      const spawnX = window.innerWidth / 2;
      const spawnY = window.innerHeight / 2;

      // Newly uploaded stickers spawn as global screen-fixed stickers
      let finalX = spawnX;
      let finalY = spawnY;
      let targetSelectorsStr = null;

      try {
        const newSticker = await api.createSticker({
          image_data: base64Data,
          x: finalX,
          y: finalY,
          scale: 1.0,
          rotation: 0,
          opacity: 0.8,
          target_selectors: targetSelectorsStr
        });
        setStickers(prev => [...prev, newSticker]);
        setActiveStickerId(newSticker.id);
        setIsEditingMode(true);
      } catch (err) {
        console.error("Failed to save new sticker:", err);
      }
    };
    reader.readAsDataURL(file);
  };

  // Move Drag handlers
  const handleMouseDown = (e, sticker) => {
    if (!isEditingMode) return;

    e.preventDefault();

    // Snaps the relative coordinates to viewport-fixed coords and mounts in body portal for seamless dragging
    const coords = getStickerScreenCoords(sticker);
    setActiveDragId(sticker.id);

    dragInfo.current = {
      isDragging: true,
      stickerId: sticker.id,
      startX: e.clientX,
      startY: e.clientY,
      initialX: coords.x,
      initialY: coords.y,
      el: null // Resolved dynamically in next frame after portal shift
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const updateDragPosition = () => {
    mouseMovePending.current = false;
    const info = dragInfo.current;
    if (!info.isDragging) return;

    if (!info.el) {
      info.el = document.getElementById(`sticker-${info.stickerId}`);
    }
    if (!info.el) return;

    const deltaX = latestMousePos.current.x - info.startX;
    const deltaY = latestMousePos.current.y - info.startY;

    const dragX = Math.round(info.initialX + deltaX);
    const dragY = Math.round(info.initialY + deltaY);

    info.el.style.left = `${dragX}px`;
    info.el.style.top = `${dragY}px`;

    // --- REAL-TIME SCROLL-LOCK MICRO ELEMENT OVERLAP DETECTION ---
    // Sample 9 points around the sticker bounding box. Break as soon as any
    // point lands on an element that has a lockable ancestor — this means the
    // lock triggers the moment any sticker edge overlaps the target, not just
    // when the cursor reaches the center.
    // NOTE: pointer-events: none is applied during drag, so hit-test naturally passes through.
    const stickerRectMove = {
      left: dragX - 90,
      right: dragX + 90,
      top: dragY - 90,
      bottom: dragY + 90,
      cx: dragX,
      cy: dragY,
    };

    const samplePointsMove = [
      { x: latestMousePos.current.x, y: latestMousePos.current.y },
      { x: stickerRectMove.cx, y: stickerRectMove.top + 8 },
      { x: stickerRectMove.cx, y: stickerRectMove.bottom - 8 },
      { x: stickerRectMove.left + 8, y: stickerRectMove.cy },
      { x: stickerRectMove.right - 8, y: stickerRectMove.cy },
      { x: stickerRectMove.left + 8, y: stickerRectMove.top + 8 },
      { x: stickerRectMove.right - 8, y: stickerRectMove.top + 8 },
      { x: stickerRectMove.left + 8, y: stickerRectMove.bottom - 8 },
      { x: stickerRectMove.right - 8, y: stickerRectMove.bottom - 8 },
    ];

    const lockableTarget = findLockableTargetFromPoints(samplePointsMove);

    let highlightTarget = lockableTarget;
    if (lockableTarget) {
      const stableSelector = getStableSelector(lockableTarget);
      if (stableSelector) {
        try {
          const resolvedEl = document.querySelector(stableSelector);
          if (resolvedEl) {
            highlightTarget = resolvedEl;
          }
        } catch { /* ignore */ }
      }
    }

    // Highlight target element with visual Y2K dashed border feedback
    if (prevLockTarget.current && prevLockTarget.current !== highlightTarget) {
      prevLockTarget.current.style.outline = '';
      prevLockTarget.current.style.outlineOffset = '';
    }

    if (highlightTarget) {
      highlightTarget.style.outline = '2px dashed var(--pink)';
      highlightTarget.style.outlineOffset = '2px';
      prevLockTarget.current = highlightTarget;
    } else {
      prevLockTarget.current = null;
    }
  };

  const handleMouseMove = (e) => {
    if (!dragInfo.current.isDragging) return;
    latestMousePos.current = { x: e.clientX, y: e.clientY };

    if (!mouseMovePending.current) {
      mouseMovePending.current = true;
      requestAnimationFrame(updateDragPosition);
    }
  };

  const handleMouseUp = async (e) => {
    if (!dragInfo.current.isDragging) return;

    const info = dragInfo.current;
    dragInfo.current.isDragging = false;

    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);

    // Remove any leftover outlines
    if (prevLockTarget.current) {
      prevLockTarget.current.style.outline = '';
      prevLockTarget.current.style.outlineOffset = '';
    }

    const el = document.getElementById(`sticker-${info.stickerId}`);
    if (!el) {
      setActiveDragId(null);
      return;
    }

    // Read fresh absolute coordinates directly from the DOM style
    const finalScreenX = parseInt(el.style.left, 10) || info.initialX;
    const finalScreenY = parseInt(el.style.top, 10) || info.initialY;

    // --- LOCK TARGET EVALUATION ENGINE ---
    // Same fixed multi-point sampling: test each point against LOCKABLE_SELECTORS
    // directly so we break only when a lockable match is found.
    // NOTE: pointer-events: none is applied during drag, so hit-test naturally passes through.
    const hitEl = document.elementFromPoint(e.clientX, e.clientY);

    const stickerRectUp = {
      left: finalScreenX - 90,
      right: finalScreenX + 90,
      top: finalScreenY - 90,
      bottom: finalScreenY + 90,
      cx: finalScreenX,
      cy: finalScreenY,
    };

    const samplePointsUp = [
      { x: e.clientX, y: e.clientY },
      { x: stickerRectUp.cx, y: stickerRectUp.top + 8 },
      { x: stickerRectUp.cx, y: stickerRectUp.bottom - 8 },
      { x: stickerRectUp.left + 8, y: stickerRectUp.cy },
      { x: stickerRectUp.right - 8, y: stickerRectUp.cy },
      { x: stickerRectUp.left + 8, y: stickerRectUp.top + 8 },
      { x: stickerRectUp.right - 8, y: stickerRectUp.top + 8 },
      { x: stickerRectUp.left + 8, y: stickerRectUp.bottom - 8 },
      { x: stickerRectUp.right - 8, y: stickerRectUp.bottom - 8 },
    ];

    const lockableTarget = findLockableTargetFromPoints(samplePointsUp);

    let finalX = finalScreenX;
    let finalY = finalScreenY;
    let targetSelectorsStr = null;

    if (lockableTarget) {
      // Pin to micro scroll element: Generate dynamic stable selector path
      const stableSelector = getStableSelector(lockableTarget);
      targetSelectorsStr = stableSelector;

      // Resolve the actual element that the sticker will be portaled to
      let portalTarget = lockableTarget;
      if (stableSelector) {
        try {
          const resolvedEl = document.querySelector(stableSelector);
          if (resolvedEl) {
            portalTarget = resolvedEl;
          }
        } catch { /* ignore */ }
      }

      const rect = portalTarget.getBoundingClientRect();
      const scrollLeft = portalTarget.scrollLeft || 0;
      const scrollTop = portalTarget.scrollTop || 0;
      finalX = finalScreenX - rect.left + scrollLeft;
      finalY = finalScreenY - rect.top + scrollTop;

    } else {
      // Fallback to large macro containers if it was dropped inside a specific view
      let macroTarget = null;
      if (hitEl) {
        for (const selector of MACRO_ANCHORS) {
          const closest = hitEl.closest(selector);
          if (closest) {
            macroTarget = closest;
            targetSelectorsStr = selector;
            break;
          }
        }
      }

      if (macroTarget) {
        // Lock to the macro container (e.g. #chat-view or #world-detail-view)
        const rect = macroTarget.getBoundingClientRect();
        const scrollLeft = macroTarget.scrollLeft || 0;
        const scrollTop = macroTarget.scrollTop || 0;
        finalX = finalScreenX - rect.left + scrollLeft;
        finalY = finalScreenY - rect.top + scrollTop;
      } else {
        // Treat as a global screen-fixed sticker
        finalX = finalScreenX;
        finalY = finalScreenY;
        targetSelectorsStr = null;
      }
    }

    // Revert active drag state to shift portal destination back to native target
    setActiveDragId(null);

    // Save back to React state in a clean, state-safe loop
    setStickers(prev => prev.map(s => {
      if (s.id === info.stickerId) {
        return {
          ...s,
          x: finalX,
          y: finalY,
          target_selectors: targetSelectorsStr
        };
      }
      return s;
    }));

    // Persist finalized relative offsets inside SQLite
    try {
      await api.updateSticker(info.stickerId, {
        x: finalX,
        y: finalY,
        target_selectors: targetSelectorsStr
      });
    } catch (err) {
      console.error("Failed to save sticker position:", err);
    }
  };

  // Resize and Rotate Corner Drag handlers
  const handleResizeRotateStart = (e, sticker) => {
    e.stopPropagation();
    e.preventDefault();

    const center = getStickerScreenCoords(sticker);
    const dx = e.clientX - center.x;
    const dy = e.clientY - center.y;

    const startDistance = Math.sqrt(dx * dx + dy * dy);
    const startAngle = Math.atan2(dy, dx);

    const el = document.getElementById(`sticker-${sticker.id}`);

    resizeRotateInfo.current = {
      isResizing: true,
      stickerId: sticker.id,
      center,
      startDistance,
      startAngle,
      initialScale: sticker.scale,
      initialRotation: sticker.rotation,
      el,
      currentScale: sticker.scale,
      currentRotation: sticker.rotation
    };

    window.addEventListener('mousemove', handleResizeRotateMouseMove);
    window.addEventListener('mouseup', handleResizeRotateMouseUp);
  };

  const updateResizeRotate = () => {
    resizeRotatePending.current = false;
    const info = resizeRotateInfo.current;
    if (!info.isResizing) return;

    const dx = latestResizeMousePos.current.x - info.center.x;
    const dy = latestResizeMousePos.current.y - info.center.y;

    const currentDistance = Math.sqrt(dx * dx + dy * dy);
    const currentAngle = Math.atan2(dy, dx);

    // Compute new scale
    const scaleFactor = currentDistance / info.startDistance;
    const computedScale = Math.max(0.2, Math.min(3.5, info.initialScale * scaleFactor));
    const newScale = Math.round(computedScale * 100) / 100;

    // Compute new rotation
    const angleDiffRad = currentAngle - info.startAngle;
    const angleDiffDeg = Math.round(angleDiffRad * (180 / Math.PI));
    const newRotation = (info.initialRotation + angleDiffDeg + 360) % 360;

    info.currentScale = newScale;
    info.currentRotation = newRotation;

    if (info.el) {
      info.el.style.transform = `translate(-50%, -50%) rotate(${newRotation}deg) scale(${newScale})`;
    }
  };

  const handleResizeRotateMouseMove = (e) => {
    const info = resizeRotateInfo.current;
    if (!info.isResizing) return;
    latestResizeMousePos.current = { x: e.clientX, y: e.clientY };

    if (!resizeRotatePending.current) {
      resizeRotatePending.current = true;
      requestAnimationFrame(updateResizeRotate);
    }
  };

  const handleResizeRotateMouseUp = async () => {
    const info = resizeRotateInfo.current;
    if (!info.isResizing) return;
    info.isResizing = false;

    window.removeEventListener('mousemove', handleResizeRotateMouseMove);
    window.removeEventListener('mouseup', handleResizeRotateMouseUp);

    setStickers(prev => prev.map(s => {
      if (s.id === info.stickerId) {
        return {
          ...s,
          scale: info.currentScale,
          rotation: info.currentRotation
        };
      }
      return s;
    }));

    try {
      await api.updateSticker(info.stickerId, {
        scale: info.currentScale,
        rotation: info.currentRotation
      });
    } catch (err) {
      console.error("Failed to save sticker scale & rotation:", err);
    }
  };

  // Slider changes
  const handleSliderChange = async (stickerId, field, val) => {
    const parsedVal = parseFloat(val);
    setStickers(prev => prev.map(s => {
      if (s.id === stickerId) {
        return { ...s, [field]: parsedVal };
      }
      return s;
    }));

    try {
      await api.updateSticker(stickerId, { [field]: parsedVal });
    } catch (err) {
      console.error(`Failed to update sticker ${field}:`, err);
    }
  };

  // Delete sticker
  const handleDeleteSticker = async (stickerId) => {
    try {
      await api.deleteSticker(stickerId);
      setStickers(prev => prev.filter(s => s.id !== stickerId));
      if (activeStickerId === stickerId) {
        setActiveStickerId(null);
        setShowOpacitySlider(null);
      }
    } catch (err) {
      console.error("Failed to delete sticker:", err);
    }
  };

  return (
    <>
      {/* Hidden File Input Triggered by Settings Menu */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleImageUpload}
        style={{ display: 'none' }}
      />

      {/* Render each sticker inside its dynamically resolved Portal destination */}
      {stickers.map(sticker => {
        const isActive = activeStickerId === sticker.id;
        const isDraggingThis = activeDragId === sticker.id;

        // Resolve portal target container dynamically
        let portalContainer = document.body;
        let isPortaledToTarget = false;
        let targetEl = null;

        if (sticker.target_selectors && !isDraggingThis) {
          const selectors = sticker.target_selectors.split(',');
          for (const selector of selectors) {
            try {
              const el = document.querySelector(selector);
              if (el && el.offsetHeight > 0 && window.getComputedStyle(el).display !== 'none') {
                targetEl = el;
                portalContainer = el;
                isPortaledToTarget = true;
                break;
              }
            } catch { /* ignore */ }
          }
        }

        // If target exists but is closed/hidden, do not render the locked sticker
        if (sticker.target_selectors && !isDraggingThis && !isPortaledToTarget) {
          return null;
        }

        // Dynamically ensure target container acts as absolute bounding box context
        if (isPortaledToTarget && targetEl) {
          const style = window.getComputedStyle(targetEl);
          if (style.position === 'static') {
            targetEl.style.position = 'relative';
          }
        }

        // Get live viewport screen coordinates if actively dragging, to avoid relative jumps
        const dragScreenCoords = isDraggingThis ? getStickerScreenCoords(sticker) : null;

        return createPortal(
          <div
            key={sticker.id}
            id={`sticker-${sticker.id}`}
            style={{
              position: isPortaledToTarget ? 'absolute' : 'fixed',
              left: isDraggingThis ? `${dragScreenCoords.x}px` : `${sticker.x}px`,
              top: isDraggingThis ? `${dragScreenCoords.y}px` : `${sticker.y}px`,
              transform: `translate(-50%, -50%) rotate(${sticker.rotation}deg) scale(${sticker.scale})`,
              opacity: sticker.opacity,
              cursor: isEditingMode ? 'move' : 'default',
              zIndex: isActive ? 100000 : 99999,
              pointerEvents: isDraggingThis ? 'none' : (isEditingMode ? 'auto' : 'none'), // CLICK-THROUGH BUGFIX
              userSelect: 'none'
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (isEditingMode) {
                setActiveStickerId(sticker.id);
              }
            }}
          >
            {/* Sticker Image Decal */}
            <img
              src={sticker.image_data}
              alt="UI Decal"
              style={{
                maxHeight: '180px',
                maxWidth: '180px',
                objectFit: 'contain',
                borderRadius: 'var(--r-sm)',
                border: 'none',
                padding: '0px',
                backgroundColor: 'transparent',
                display: 'block'
              }}
              onMouseDown={(e) => handleMouseDown(e, sticker)}
            />

            {/* Premium Graphics-Editor Sizing Outline & Bottom Toolbar */}
            {isEditingMode && isActive && (
              <>
                {/* Visual dashed bounds outline - Figma Style */}
                <div
                  style={{
                    position: 'absolute',
                    inset: '-8px',
                    border: '2px dashed var(--primary)',
                    borderRadius: 'calc(var(--r-sm) + 4px)',
                    pointerEvents: 'none',
                    zIndex: 100002
                  }}
                />

                {/* --- 4 CORNER RESIZE & ROTATE HANDLE DOTS --- */}
                {/* TOP-LEFT */}
                <div
                  style={{ ...cornerHandleStyle, top: '-14px', left: '-14px', cursor: 'nwse-resize' }}
                  onMouseDown={(e) => handleResizeRotateStart(e, sticker)}
                  title="Drag to Resize & Rotate (Top-Left)"
                />

                {/* TOP-RIGHT */}
                <div
                  style={{ ...cornerHandleStyle, top: '-14px', right: '-14px', cursor: 'nesw-resize' }}
                  onMouseDown={(e) => handleResizeRotateStart(e, sticker)}
                  title="Drag to Resize & Rotate (Top-Right)"
                />

                {/* BOTTOM-LEFT */}
                <div
                  style={{ ...cornerHandleStyle, bottom: '-14px', left: '-14px', cursor: 'nesw-resize' }}
                  onMouseDown={(e) => handleResizeRotateStart(e, sticker)}
                  title="Drag to Resize & Rotate (Bottom-Left)"
                />

                {/* BOTTOM-RIGHT */}
                <div
                  style={{ ...cornerHandleStyle, bottom: '-14px', right: '-14px', cursor: 'nwse-resize' }}
                  onMouseDown={(e) => handleResizeRotateStart(e, sticker)}
                  title="Drag to Resize & Rotate (Bottom-Right)"
                />


                {/* --- CENTERED BOTTOM FLOATING CONTROL TOOLBAR --- */}
                <div
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 14px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'var(--bg-window)',
                    border: '2px solid #000000',
                    boxShadow: '3px 3px 0px #000000',
                    padding: '6px 12px',
                    borderRadius: 'var(--r-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    pointerEvents: 'auto',
                    zIndex: 100006,
                    whiteSpace: 'nowrap'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Opacity Slider Toggle */}
                  <button
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '4px',
                      border: '2px solid #000000',
                      boxShadow: '1px 1px 0px #000000',
                      background: 'var(--blue)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    onClick={() => setShowOpacitySlider(prev => prev === sticker.id ? null : sticker.id)}
                    title="Adjust Opacity"
                  >
                    <Sliders size={13} color="#000000" />
                  </button>

                  {/* Delete Sticker */}
                  <button
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '4px',
                      border: '2px solid #000000',
                      boxShadow: '1px 1px 0px #000000',
                      background: 'var(--pink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    onClick={() => handleDeleteSticker(sticker.id)}
                    title="Delete Sticker"
                  >
                    <Trash2 size={13} color="#000000" />
                  </button>

                  {/* Apply Changes (Tick Icon) */}
                  <button
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '4px',
                      border: '2px solid #000000',
                      boxShadow: '1px 1px 0px #000000',
                      background: '#00ffcc', // Bright neon teal
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    onClick={() => {
                      setActiveStickerId(null);
                      setShowOpacitySlider(null);
                    }}
                    title="Apply Decor"
                  >
                    <Check size={14} color="#000000" />
                  </button>
                </div>

                {/* FLOATING OPACITY SLIDER POPUP */}
                {showOpacitySlider === sticker.id && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 56px)', // Open neatly stacked above the toolbar
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'var(--bg-window)',
                      border: '2px solid #000000',
                      boxShadow: '3px 3px 0px #000000',
                      padding: '8px 12px',
                      borderRadius: 'var(--r-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      minWidth: '160px',
                      pointerEvents: 'auto',
                      zIndex: 100007
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', fontFamily: 'var(--font-code)', color: 'var(--text)' }}>OPACITY:</span>
                    <input
                      type="range"
                      min="0.1"
                      max="1.0"
                      step="0.05"
                      value={sticker.opacity}
                      onChange={(e) => handleSliderChange(sticker.id, 'opacity', e.target.value)}
                      style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                    />
                  </div>
                )}
              </>
            )}
          </div>,
          portalContainer
        );
      })}
    </>
  );
}
