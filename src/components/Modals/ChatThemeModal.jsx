/* eslint-disable react-hooks/set-state-in-effect */
import React, { useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Palette, Image as ImageIcon, Trash2, Sliders, Check, RotateCcw, Paintbrush, Droplet, Crop, ChevronDown, ChevronLeft } from 'lucide-react';
import { useUIContext } from '../../context/UIContext';
import { wallpapers, getWallpaperById, parseSvgGradient } from '../../utils/chatWallpapers';
import { LOCAL_STORAGE_PREFIX } from '../../config';
import { cropImage } from '../../utils/cropImage';
import '../../styles/chatthemeeditor.css';



const BG_COLOR_PRESETS = [
  // ── SOLID COLORS ──
  { name: 'Cyber Raspberry', value: '#ff1493' },
  { name: 'Neon Blue', value: '#00f0ff' },
  { name: 'Vibrant Emerald', value: '#00ffcc' },
  { name: 'Warm Amber', value: '#fbbf24' },
  { name: 'Obsidian Black', value: '#050508' },
  { name: 'Classic Slate', value: '#475569' },
  { name: 'Pure White', value: '#ffffff' },
  // ── PREMIUM GRADIENTS ──
  { name: 'Cyber Neon', value: 'linear-gradient(135deg, #ff1493 0%, #00f0ff 100%)' },
  { name: 'Obsidian Dusk', value: 'linear-gradient(135deg, #0f0c20 0%, #06060c 100%)' },
  { name: 'Cherry Velvet', value: 'linear-gradient(135deg, #8a2387 0%, #e94057 50%, #f27121 100%)' },
  { name: 'Vibrant Sunset', value: 'linear-gradient(135deg, #f12711 0%, #f5af19 100%)' },
  { name: 'Emerald Glow', value: 'linear-gradient(135deg, #1f4037 0%, #99f2c8 100%)' },
  { name: 'Aurora Sky', value: 'linear-gradient(135deg, #0575e6 0%, #00f260 100%)' }
];

const STROKE_PRESETS = [
  // ── SOLID COLORS ──
  { name: 'Cyber Raspberry', value: '#ff1493' },
  { name: 'Neon Blue', value: '#00f0ff' },
  { name: 'Vibrant Emerald', value: '#00ffcc' },
  { name: 'Warm Amber', value: '#fbbf24' },
  { name: 'Obsidian Black', value: '#050508' },
  { name: 'Classic Slate', value: '#475569' },
  { name: 'Pure White', value: '#ffffff' },
  // ── PREMIUM GRADIENTS ──
  { name: 'Neon Dream', value: 'linear-gradient(135deg, #ff1493 0%, #00f0ff 100%)' },
  { name: 'Cyber Sunset', value: 'linear-gradient(135deg, #ff1493 0%, #fbbf24 100%)' },
  { name: 'Emerald Wave', value: 'linear-gradient(135deg, #00ffcc 0%, #2563eb 100%)' },
  { name: 'Cotton Candy', value: 'linear-gradient(135deg, #00f0ff 0%, #ff1493 100%)' },
  { name: 'Royal Twilight', value: 'linear-gradient(135deg, #8a2387 0%, #e94057 50%, #f27121 100%)' }
];

const parseGradient = (gradientStr) => {
  const defaultVal = { type: 'linear', angle: 135, colors: ['#ff1493', '#00f0ff'] };
  return parseSvgGradient(gradientStr) || defaultVal;
};

const constructGradientString = (type, angle, colors) => {
  const stops = colors.map((c, i) => {
    const pct = Math.round((i / (colors.length - 1)) * 100);
    return `${c} ${pct}%`;
  }).join(', ');

  if (type === 'radial') {
    return `radial-gradient(circle, ${stops})`;
  } else if (type === 'conic') {
    return `conic-gradient(from ${angle}deg, ${stops})`;
  } else {
    return `linear-gradient(${angle}deg, ${stops})`;
  }
};

const resizeAndCompressImage = (base64Str, maxDimension = 1200, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
};

const TOOLBAR_ITEMS = [
  { id: 'doodles', icon: Paintbrush, label: 'Doodles' },
  { id: 'background', icon: ImageIcon, label: 'Background' },
  { id: 'line-color', icon: Droplet, label: 'Line Color' },
  { id: 'sliders', icon: Sliders, label: 'Sliders' }
];

function PresetButton({ preset, isActive, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`chat-theme-bg-preset-btn ${isActive ? 'active' : ''}`}
      style={{ background: preset.value }}
      title={preset.name}
    >
      {isActive && (
        <span className={`chat-theme-preset-check ${preset.value === '#ffffff' ? 'dark-check' : ''}`}>
          ✓
        </span>
      )}
    </button>
  );
}

export default function ChatThemeModal({ isOpen, onClose, themeConfig, onChange }) {
  const ui = useUIContext();
  const fileInputRef = useRef(null);
  const [activeOption, setActiveOption] = useState(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [isBgSettingsOpen, setIsBgSettingsOpen] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState(null);

  const [customBgPresets, setCustomBgPresets] = useState(() => {
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}_custom_bg_presets`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [customStrokePresets, setCustomStrokePresets] = useState(() => {
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}_custom_stroke_presets`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const isBgColorPresetSaved = (color) => {
    return customBgPresets.some(p => typeof p === 'string' && p === color);
  };

  const isBgImagePresetSaved = () => {
    if (!themeConfig.useCustomBgImage || !themeConfig.bgImage) return false;
    return customBgPresets.some(p => typeof p === 'object' && p !== null && p.type === 'image' && p.bgImage === themeConfig.bgImage);
  };

  const handleSaveBgPreset = () => {
    const colorToSave = themeConfig.bgColor || '#ff1493';
    if (!isBgColorPresetSaved(colorToSave)) {
      const nextPresets = [colorToSave, ...customBgPresets];
      setCustomBgPresets(nextPresets);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_custom_bg_presets`, JSON.stringify(nextPresets));
    }
  };

  const handleSaveBgImagePreset = () => {
    if (!themeConfig.useCustomBgImage || !themeConfig.bgImage) return;
    if (!isBgImagePresetSaved()) {
      const newPreset = {
        type: 'image',
        bgImage: themeConfig.bgImage,
        bgImageOriginal: themeConfig.bgImageOriginal,
        bgImageOpacity: themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity : 100,
        bgImageFill: themeConfig.bgImageFill || 'cover'
      };
      const nextPresets = [newPreset, ...customBgPresets];
      setCustomBgPresets(nextPresets);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_custom_bg_presets`, JSON.stringify(nextPresets));
    }
  };

  const handleSaveStrokePreset = () => {
    const colorToSave = themeConfig.strokeColor || '#ff1493';
    if (!customStrokePresets.includes(colorToSave)) {
      const nextPresets = [colorToSave, ...customStrokePresets];
      setCustomStrokePresets(nextPresets);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_custom_stroke_presets`, JSON.stringify(nextPresets));
    }
  };

  const [uploadedBgs, setUploadedBgs] = useState(() => {
    try {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_PREFIX}_uploaded_bg_images`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (themeConfig.useCustomBgImage && themeConfig.bgImage) {
      setUploadedBgs(prev => {
        const index = prev.findIndex(bg => bg.bgImage === themeConfig.bgImage || bg.bgImageOriginal === themeConfig.bgImageOriginal);
        if (index > -1) {
          const updated = [...prev];
          const current = updated[index];
          if (
            current.bgImage !== themeConfig.bgImage ||
            current.bgImageOpacity !== themeConfig.bgImageOpacity ||
            current.bgImageFill !== themeConfig.bgImageFill
          ) {
            updated[index] = {
              ...current,
              bgImage: themeConfig.bgImage,
              bgImageOpacity: themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity : 100,
              bgImageFill: themeConfig.bgImageFill || 'cover'
            };
            localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_uploaded_bg_images`, JSON.stringify(updated));
            return updated;
          }
          return prev;
        } else {
          const newBg = {
            id: Date.now(),
            bgImage: themeConfig.bgImage,
            bgImageOriginal: themeConfig.bgImageOriginal || themeConfig.bgImage,
            bgImageOpacity: themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity : 100,
            bgImageFill: themeConfig.bgImageFill || 'cover'
          };
          const nextBgs = [newBg, ...prev].slice(0, 8);
          localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_uploaded_bg_images`, JSON.stringify(nextBgs));
          return nextBgs;
        }
      });
    }
  }, [
    themeConfig.useCustomBgImage,
    themeConfig.bgImage,
    themeConfig.bgImageOriginal,
    themeConfig.bgImageOpacity,
    themeConfig.bgImageFill
  ]);

  useEffect(() => {
    if (isOpen && themeConfig.useCustomBgImage && themeConfig.bgImage) {
      setIsBgSettingsOpen(true);
    }
  }, [isOpen, themeConfig.useCustomBgImage, themeConfig.bgImage]);

  if (!isOpen) return null;

  const handleFieldChange = (key, value) => {
    onChange({
      ...themeConfig,
      [key]: value
    });
  };

  const handleResetToDefault = () => {
    onChange({
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
    setActiveOption(null);
  };

  const getDefaultWallpaperBg = () => {
    const currentUiTheme = ui.themeDesign;
    const activeWallpaper = getWallpaperById(currentUiTheme);
    if (activeWallpaper) {
      const strokeColor = themeConfig.strokeColor || activeWallpaper.defaultColor;
      const svgContent = activeWallpaper.svg(strokeColor, 0.22);
      return `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`;
    }
    return 'none';
  };

  const getWallpaperBg = (w) => {
    const strokeColor = themeConfig.strokeColor || w.defaultColor;
    const svgContent = w.svg(strokeColor, 0.22);
    return `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`;
  };

  const renderActiveOptionContent = () => {
    switch (activeOption) {
      case 'doodles':
        return (
          <div className="chat-theme-doodles-row scrollbar-custom">
            {/* None / Solid option */}
            <div
              className={`character-select-card chat-theme-card-doodle none-option ${(!themeConfig.useCustomBgImage && !themeConfig.useStaticColor && themeConfig.themeId === 'none') ? 'active' : ''}`}
              onClick={() => {
                onChange({
                  ...themeConfig,
                  themeId: 'none',
                  useCustomBgImage: false,
                  useStaticColor: false
                });
              }}
            >
              <div className="diagonal-lines" />
              <div className="chat-theme-label-overlay">
                No Doodles
              </div>
              {!themeConfig.useCustomBgImage && !themeConfig.useStaticColor && themeConfig.themeId === 'none' && (
                <div className="chat-theme-check-badge">✓</div>
              )}
            </div>

            {/* Default option */}
            <div
              className={`character-select-card chat-theme-card-doodle ${(!themeConfig.useCustomBgImage && !themeConfig.useStaticColor && themeConfig.themeId === 'theme-default') ? 'active' : ''}`}
              onClick={() => {
                onChange({
                  ...themeConfig,
                  themeId: 'theme-default',
                  useCustomBgImage: false,
                  useStaticColor: false
                });
              }}
              style={{
                backgroundImage: getDefaultWallpaperBg()
              }}
            >
              <div className="chat-theme-label-overlay">
                Default Theme
              </div>
              {!themeConfig.useCustomBgImage && !themeConfig.useStaticColor && themeConfig.themeId === 'theme-default' && (
                <div className="chat-theme-check-badge">✓</div>
              )}
            </div>

            {/* Wallpaper options */}
            {wallpapers.map(w => {
              const isActive = !themeConfig.useCustomBgImage && !themeConfig.useStaticColor && themeConfig.themeId === w.id;
              return (
                <div
                  key={w.id}
                  className={`character-select-card chat-theme-card-doodle ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    onChange({
                      ...themeConfig,
                      themeId: w.id,
                      useCustomBgImage: false,
                      useStaticColor: false
                    });
                  }}
                  style={{
                    backgroundImage: getWallpaperBg(w)
                  }}
                >
                  <div className="chat-theme-label-overlay">
                    {w.name}
                  </div>
                  {isActive && (
                    <div className="chat-theme-check-badge">✓</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      case 'background':
        return (
          <div className="chat-theme-bg-controls-wrapper">
            {/* Custom Color/Gradient Presets Panel (if active) */}
            {themeConfig.useStaticColor ? (
              <div className="chat-theme-bg-color-presets-panel">
                <div className="chat-theme-bg-color-presets-header">
                  <button
                    type="button"
                    className="chat-theme-back-to-selection-btn"
                    onClick={() => {
                      onChange({
                        ...themeConfig,
                        useStaticColor: false
                      });
                    }}
                    title="Go Back"
                  >
                    <ChevronLeft size={14} />
                    <span>Go Back</span>
                  </button>
                  <span>Color & Gradient Presets</span>
                </div>
                <div className="chat-theme-color-presets-row scrollbar-custom">
                  {/* Custom Saved Background Presets (if any) */}
                  {customBgPresets.map((presetValue, idx) => {
                    const isObject = typeof presetValue === 'object' && presetValue !== null;
                    const isActive = isObject
                      ? (themeConfig.useCustomBgImage && themeConfig.bgImage === presetValue.bgImage)
                      : (themeConfig.useStaticColor && themeConfig.bgColor === presetValue);
                    const btnStyle = isObject
                      ? {
                        backgroundImage: `url("${presetValue.bgImage}")`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }
                      : { background: presetValue };

                    return (
                      <div key={`custom-bg-${idx}`} className="chat-theme-bg-preset-btn-wrapper">
                        <button
                          type="button"
                          onClick={() => {
                            if (isObject) {
                              onChange({
                                ...themeConfig,
                                useCustomBgImage: true,
                                useStaticColor: false,
                                bgImage: presetValue.bgImage,
                                bgImageOriginal: presetValue.bgImageOriginal,
                                bgImageOpacity: presetValue.bgImageOpacity !== undefined ? presetValue.bgImageOpacity : 100,
                                bgImageFill: presetValue.bgImageFill || 'cover'
                              });
                            } else {
                              onChange({
                                ...themeConfig,
                                useStaticColor: true,
                                useCustomBgImage: false,
                                bgColor: presetValue
                              });
                            }
                          }}
                          className={`chat-theme-bg-preset-btn custom-preset ${isActive ? 'active' : ''}`}
                          style={btnStyle}
                          title={isObject ? "Custom Saved Background Image Preset" : "Custom Saved Background Preset"}
                        >
                          {isActive && (
                            <span className={`chat-theme-preset-check ${(!isObject && presetValue === '#ffffff') ? 'dark-check' : ''}`}>
                              ✓
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="chat-theme-custom-preset-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            const nextPresets = customBgPresets.filter(p => {
                              if (isObject) {
                                return typeof p !== 'object' || p === null || p.bgImage !== presetValue.bgImage;
                              } else {
                                return p !== presetValue;
                              }
                            });
                            setCustomBgPresets(nextPresets);
                            localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_custom_bg_presets`, JSON.stringify(nextPresets));
                          }}
                          title="Delete Custom Preset"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}

                  {/* Standard Curated Presets */}
                  {BG_COLOR_PRESETS.map((preset, idx) => (
                    <PresetButton
                      key={idx}
                      preset={preset}
                      isActive={themeConfig.bgColor === preset.value}
                      onClick={() => handleFieldChange('bgColor', preset.value)}
                    />
                  ))}
                </div>

                {/* Custom Color Designer Panel */}
                {(() => {
                  const isGradient = themeConfig.bgColor && (
                    themeConfig.bgColor.startsWith('linear-gradient') ||
                    themeConfig.bgColor.startsWith('radial-gradient') ||
                    themeConfig.bgColor.startsWith('conic-gradient')
                  );
                  const parsed = parseGradient(themeConfig.bgColor);
                  const colors = isGradient ? parsed.colors : [themeConfig.bgColor || '#ff1493'];

                  return (
                    <div className="chat-theme-custom-color-builder">
                      <div className="builder-controls-row">
                        {colors.map((color, idx) => {
                          return (
                            <React.Fragment key={idx}>
                              <div
                                className={`builder-color-bubble-wrapper ${draggedIndex === idx ? 'dragging' : ''}`}
                                title={isGradient ? `Drag to reorder - Color Stop ${idx + 1}` : `Color Stop ${idx + 1}`}
                                draggable={isGradient}
                                onDragStart={(e) => {
                                  setDraggedIndex(idx);
                                  e.dataTransfer.effectAllowed = 'move';
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDragEnter={() => {
                                  if (draggedIndex !== null && draggedIndex !== idx) {
                                    const nextColors = [...colors];
                                    const [removed] = nextColors.splice(draggedIndex, 1);
                                    nextColors.splice(idx, 0, removed);

                                    handleFieldChange('bgColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                                    setDraggedIndex(idx);
                                  }
                                }}
                                onDragEnd={() => setDraggedIndex(null)}
                              >
                                <input
                                  type="color"
                                  value={color}
                                  onChange={(e) => {
                                    const nextColors = [...colors];
                                    nextColors[idx] = e.target.value;

                                    if (isGradient) {
                                      handleFieldChange('bgColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                                    } else {
                                      handleFieldChange('bgColor', e.target.value);
                                    }
                                  }}
                                />
                                <div
                                  className="builder-color-bubble"
                                  style={{ background: color }}
                                />

                                {/* Delete overlay inside color bubble (as long as N > 1 stops) */}
                                {colors.length > 1 && (
                                  <button
                                    type="button"
                                    className="builder-color-delete-overlay"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      const nextColors = colors.filter((_, i) => i !== idx);
                                      if (nextColors.length === 1) {
                                        handleFieldChange('bgColor', nextColors[0]);
                                      } else {
                                        handleFieldChange('bgColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                                      }
                                    }}
                                    title="Delete Color Stop"
                                  >
                                    <X size={10} />
                                  </button>
                                )}
                              </div>
                            </React.Fragment>
                          );
                        })}

                        {/* Render Add button if N < 5 stops */}
                        {colors.length < 5 && (
                          <button
                            type="button"
                            className="builder-add-color-btn"
                            onClick={() => {
                              const defaultStopColors = ['#fbbf24', '#00ffcc', '#8a2387', '#fbbf24'];
                              const newColor = defaultStopColors[colors.length - 1] || '#ffffff';
                              const nextColors = [...colors, newColor];

                              handleFieldChange('bgColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                            }}
                            title="Add Color Stop (Extend Gradient)"
                          >
                            <span>+</span>
                          </button>
                        )}
                      </div>

                      {/* Options Group (aligned to the right) */}
                      <div className="builder-options-group">
                        {/* Render Gradient Method segmented selector ONLY if N > 1 */}
                        {isGradient && (
                          <div className="chat-theme-gradient-method-selector pop-in-animation">
                            <div className="method-pill-group">
                              {['linear', 'radial', 'conic'].map((m) => {
                                const active = parsed.type === m;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    className={`method-pill-btn ${active ? 'active' : ''}`}
                                    onClick={() => {
                                      handleFieldChange('bgColor', constructGradientString(m, parsed.angle, colors));
                                    }}
                                  >
                                    {m}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Render Angle range slider ONLY if N > 1 and type is NOT radial */}
                        {isGradient && parsed.type !== 'radial' && (
                          <div className="chat-theme-gradient-angle-slider pop-in-animation">
                            <input
                              type="range"
                              min="0"
                              max="360"
                              value={parsed.angle}
                              onChange={(e) => {
                                handleFieldChange('bgColor', constructGradientString(parsed.type, parseInt(e.target.value), colors));
                              }}
                            />
                            <span className="chat-theme-monospace-label">{parsed.angle}°</span>
                          </div>
                        )}

                        {/* Save Preset Button */}
                        <button
                          type="button"
                          className="builder-save-preset-btn"
                          onClick={handleSaveBgPreset}
                          title="Save Custom Background Preset"
                        >
                          <Check size={14} className={customBgPresets.includes(themeConfig.bgColor || '#ff1493') ? 'saved' : ''} />
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              /* Selection Column: Upload & Solid Color */
              <div className="chat-theme-bg-selection-group scrollbar-custom">
                {/* Add Background Option (Always available to upload a new one) */}
                <div
                  className="character-select-card chat-theme-card-upload add-new-card"
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                      fileInputRef.current.click();
                    }
                  }}
                >
                  <Upload size={20} />
                  <span>Choose Image</span>

                  {/* Invisible file input */}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = async () => {
                          const compressed = await resizeAndCompressImage(reader.result);
                          const newBg = {
                            id: Date.now(),
                            bgImage: compressed,
                            bgImageOriginal: compressed,
                            bgImageOpacity: 100,
                            bgImageFill: 'cover'
                          };
                          const nextBgs = [newBg, ...uploadedBgs].slice(0, 8);
                          setUploadedBgs(nextBgs);
                          localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_uploaded_bg_images`, JSON.stringify(nextBgs));

                          onChange({
                            ...themeConfig,
                            bgImage: compressed,
                            bgImageOriginal: compressed,
                            useCustomBgImage: true,
                            useStaticColor: false,
                            bgImageOpacity: 100,
                            bgImageFill: 'cover'
                          });
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="chat-theme-hidden-input"
                  />

                  <div className="chat-theme-label-overlay">
                    Upload New
                  </div>
                </div>

                {/* Previously Uploaded Background Cards */}
                {uploadedBgs.map((bg) => {
                  const isActive = themeConfig.useCustomBgImage && themeConfig.bgImage === bg.bgImage;
                  return (
                    <div
                      key={bg.id}
                      className={`character-select-card chat-theme-card-upload uploaded-bg-card ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        onChange({
                          ...themeConfig,
                          bgImage: bg.bgImage,
                          bgImageOriginal: bg.bgImageOriginal,
                          bgImageOpacity: bg.bgImageOpacity !== undefined ? bg.bgImageOpacity : 100,
                          bgImageFill: bg.bgImageFill || 'cover',
                          useCustomBgImage: true,
                          useStaticColor: false
                        });
                      }}
                      style={{
                        backgroundImage: `url(${bg.bgImage})`
                      }}
                    >
                      {/* Delete button for uploaded backgrounds */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();

                          const isCurrentlyActive = themeConfig.useCustomBgImage && themeConfig.bgImage === bg.bgImage;
                          const nextBgs = uploadedBgs.filter(item => item.id !== bg.id);
                          setUploadedBgs(nextBgs);
                          localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_uploaded_bg_images`, JSON.stringify(nextBgs));

                          if (isCurrentlyActive) {
                            onChange({
                              ...themeConfig,
                              bgImage: null,
                              bgImageOriginal: null,
                              useCustomBgImage: false
                            });
                          }
                        }}
                        className="chat-theme-remove-image-btn"
                        title="Remove Image"
                      >
                        <Trash2 size={12} />
                      </button>

                      {/* Select indicator */}
                      {isActive && (
                        <div className="chat-theme-check-badge">✓</div>
                      )}

                      <div className="chat-theme-label-overlay">
                        Custom Bg
                      </div>
                    </div>
                  );
                })}

                {/* Solid Color Option */}
                <div
                  className={`character-select-card chat-theme-card-solid ${themeConfig.useStaticColor ? 'active' : ''}`}
                  onClick={() => {
                    onChange({
                      ...themeConfig,
                      useStaticColor: true,
                      useCustomBgImage: false
                    });
                  }}
                  style={{
                    background: themeConfig.useStaticColor && themeConfig.bgColor ? themeConfig.bgColor : 'var(--bg-window)'
                  }}
                >
                  {/* Color wheel design circle */}
                  <div className="chat-theme-color-wheel">
                    <Palette size={16} />
                  </div>

                  <div className="chat-theme-label-overlay">
                    {themeConfig.useStaticColor && themeConfig.bgColor ? (themeConfig.bgColor.startsWith('linear') ? 'Gradient Bg' : themeConfig.bgColor) : 'Solid/Gradient'}
                  </div>
                  {themeConfig.useStaticColor && (
                    <div className="chat-theme-check-badge">✓</div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      case 'line-color':
        return (() => {
          const isGradient = themeConfig.strokeColor && (
            themeConfig.strokeColor.startsWith('linear-gradient') ||
            themeConfig.strokeColor.startsWith('radial-gradient') ||
            themeConfig.strokeColor.startsWith('conic-gradient')
          );
          const parsed = parseGradient(themeConfig.strokeColor);
          const colors = isGradient ? parsed.colors : [themeConfig.strokeColor || '#ff1493'];

          return (
            <div className="chat-theme-bg-color-presets-panel">
              {/* Presets Row */}
              <div className="chat-theme-color-presets-row scrollbar-custom">
                {/* Custom Saved Stroke Presets */}
                {customStrokePresets.map((presetValue, idx) => {
                  const isActive = themeConfig.strokeColor === presetValue;
                  return (
                    <div key={`custom-stroke-${idx}`} className="chat-theme-bg-preset-btn-wrapper">
                      <button
                        type="button"
                        onClick={() => handleFieldChange('strokeColor', presetValue)}
                        className={`chat-theme-bg-preset-btn custom-preset ${isActive ? 'active' : ''}`}
                        style={{ background: presetValue }}
                        title="Custom Saved Stroke Preset"
                      >
                        {isActive && (
                          <span className={`chat-theme-preset-check ${presetValue === '#ffffff' ? 'dark-check' : ''}`}>
                            ✓
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="chat-theme-custom-preset-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextPresets = customStrokePresets.filter(p => p !== presetValue);
                          setCustomStrokePresets(nextPresets);
                          localStorage.setItem(`${LOCAL_STORAGE_PREFIX}_custom_stroke_presets`, JSON.stringify(nextPresets));
                        }}
                        title="Delete Custom Preset"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {/* Standard Curated Presets */}
                {STROKE_PRESETS.map((preset, idx) => (
                  <PresetButton
                    key={idx}
                    preset={preset}
                    isActive={themeConfig.strokeColor === preset.value}
                    onClick={() => handleFieldChange('strokeColor', preset.value)}
                  />
                ))}
              </div>

              {/* Custom Line Color / Gradient Designer Panel */}
              <div className="chat-theme-custom-color-builder">
                <div className="builder-controls-row">
                  {colors.map((color, idx) => {
                    return (
                      <React.Fragment key={idx}>
                        <div
                          className={`builder-color-bubble-wrapper ${draggedIndex === idx ? 'dragging' : ''}`}
                          title={isGradient ? `Drag to reorder - Color Stop ${idx + 1}` : `Color Stop ${idx + 1}`}
                          draggable={isGradient}
                          onDragStart={(e) => {
                            setDraggedIndex(idx);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnter={() => {
                            if (draggedIndex !== null && draggedIndex !== idx) {
                              const nextColors = [...colors];
                              const [removed] = nextColors.splice(draggedIndex, 1);
                              nextColors.splice(idx, 0, removed);

                              handleFieldChange('strokeColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                              setDraggedIndex(idx);
                            }
                          }}
                          onDragEnd={() => setDraggedIndex(null)}
                        >
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => {
                              const nextColors = [...colors];
                              nextColors[idx] = e.target.value;

                              if (isGradient) {
                                handleFieldChange('strokeColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                              } else {
                                handleFieldChange('strokeColor', e.target.value);
                              }
                            }}
                          />
                          <div
                            className="builder-color-bubble"
                            style={{ background: color }}
                          />

                          {/* Delete overlay inside color bubble (as long as N > 1 stops) */}
                          {colors.length > 1 && (
                            <button
                              type="button"
                              className="builder-color-delete-overlay"
                              onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const nextColors = colors.filter((_, i) => i !== idx);
                                if (nextColors.length === 1) {
                                  handleFieldChange('strokeColor', nextColors[0]);
                                } else {
                                  handleFieldChange('strokeColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                                }
                              }}
                              title="Delete Color Stop"
                            >
                              <X size={10} />
                            </button>
                          )}
                        </div>
                      </React.Fragment>
                    );
                  })}

                  {/* Render Add button if N < 5 stops */}
                  {colors.length < 5 && (
                    <button
                      type="button"
                      className="builder-add-color-btn"
                      onClick={() => {
                        const defaultStopColors = ['#fbbf24', '#00ffcc', '#8a2387', '#fbbf24'];
                        const newColor = defaultStopColors[colors.length - 1] || '#ffffff';
                        const nextColors = [...colors, newColor];

                        handleFieldChange('strokeColor', constructGradientString(parsed.type, parsed.angle, nextColors));
                      }}
                      title="Add Color Stop (Extend Gradient)"
                    >
                      <span>+</span>
                    </button>
                  )}
                </div>

                {/* Options Group (aligned to the right) */}
                <div className="builder-options-group">
                  {/* Render Gradient Method segmented selector ONLY if N > 1 */}
                  {isGradient && (
                    <div className="chat-theme-gradient-method-selector pop-in-animation">
                      <div className="method-pill-group">
                        {['linear', 'radial', 'conic'].map((m) => {
                          const active = parsed.type === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              className={`method-pill-btn ${active ? 'active' : ''}`}
                              onClick={() => {
                                handleFieldChange('strokeColor', constructGradientString(m, parsed.angle, colors));
                              }}
                            >
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Render Angle range slider ONLY if N > 1 and type is NOT radial */}
                  {isGradient && parsed.type !== 'radial' && (
                    <div className="chat-theme-gradient-angle-slider pop-in-animation">
                      <input
                        type="range"
                        min="0"
                        max="360"
                        value={parsed.angle}
                        onChange={(e) => {
                          handleFieldChange('strokeColor', constructGradientString(parsed.type, parseInt(e.target.value), colors));
                        }}
                      />
                      <span className="chat-theme-monospace-label">{parsed.angle}°</span>
                    </div>
                  )}

                  {/* Save Preset Button */}
                  <button
                    type="button"
                    className="builder-save-preset-btn"
                    onClick={handleSaveStrokePreset}
                    title="Save Custom Stroke Preset"
                  >
                    <Check size={14} className={customStrokePresets.includes(themeConfig.strokeColor || '#ff1493') ? 'saved' : ''} />
                  </button>
                </div>
              </div>
            </div>
          );
        })();

      case 'sliders':
        return (
          <div className="chat-theme-sliders-column-wrapper">
            <div className="chat-theme-sliders-row">
              {themeConfig.themeId !== 'none' && !themeConfig.useCustomBgImage && (
                <div className="chat-theme-slider-container opacity">
                  <span>Line Opacity</span>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={themeConfig.opacity !== undefined ? themeConfig.opacity : 10}
                    onChange={(e) => handleFieldChange('opacity', parseInt(e.target.value))}
                  />
                  <span className="chat-theme-monospace-label">{themeConfig.opacity !== undefined ? themeConfig.opacity : 10}%</span>
                </div>
              )}

              <div className="chat-theme-slider-container vignette">
                <span>Vignette Depth</span>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={themeConfig.vignette !== undefined ? themeConfig.vignette : 40}
                  onChange={(e) => handleFieldChange('vignette', parseInt(e.target.value))}
                />
                <span className="chat-theme-monospace-label">{themeConfig.vignette !== undefined ? themeConfig.vignette : 40}px</span>
              </div>
            </div>

            {themeConfig.useCustomBgImage && themeConfig.bgImage && (
              <div className="chat-theme-sliders-dropdown-section">
                <button
                  type="button"
                  className="chat-theme-sliders-dropdown-toggle"
                  onClick={() => setIsBgSettingsOpen(!isBgSettingsOpen)}
                >
                  <span>Custom Background Settings</span>
                  <ChevronDown className={`chevron-icon ${isBgSettingsOpen ? 'open' : ''}`} size={16} />
                </button>

                {isBgSettingsOpen && (
                  <div className="chat-theme-sliders-dropdown-content horizontal">
                    {/* Opacity Control */}
                    <div className="chat-theme-slider-container opacity bg-opacity-adjust">
                      <span>Image Opacity</span>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity : 100}
                        onChange={(e) => handleFieldChange('bgImageOpacity', parseInt(e.target.value))}
                      />
                      <span className="chat-theme-monospace-label">
                        {themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity : 100}%
                      </span>
                    </div>

                    {/* Fill Method Dropdown */}
                    <div className="chat-theme-fill-dropdown-wrapper">
                      <span>Fill Method</span>
                      <select
                        value={themeConfig.bgImageFill || 'cover'}
                        onChange={(e) => handleFieldChange('bgImageFill', e.target.value)}
                        className="chat-theme-fill-select"
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                        <option value="stretch">Stretch</option>
                        <option value="tile">Tile</option>
                      </select>
                    </div>

                    {/* Crop Trigger Button (Icon Only) */}
                    <button
                      type="button"
                      onClick={() => setIsCropModalOpen(true)}
                      className="chat-theme-bg-crop-icon-btn"
                      title="Crop Background Image"
                    >
                      <Crop size={16} />
                    </button>

                    {/* Save Custom Background Preset Button (Icon Only) */}
                    <button
                      type="button"
                      onClick={handleSaveBgImagePreset}
                      className="chat-theme-bg-crop-icon-btn"
                      title="Save Custom Background Image Preset"
                    >
                      <Check size={16} className={isBgImagePresetSaved() ? 'saved' : ''} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  // Generate dynamic isolated preview background image styling matching active choices
  const getPreviewBackgroundOverlayStyle = () => {
    const styles = {};

    // 1. Background Image
    if (themeConfig.useCustomBgImage && themeConfig.bgImage) {
      styles.backgroundImage = `url("${themeConfig.bgImage}")`;

      const opacityVal = themeConfig.bgImageOpacity !== undefined ? themeConfig.bgImageOpacity / 100 : 1;
      styles.opacity = opacityVal;

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
      styles.opacity = 1;
    } else if (themeConfig.themeId && themeConfig.themeId !== 'theme-default') {
      const selectedWallpaper = getWallpaperById(themeConfig.themeId);
      if (selectedWallpaper) {
        const strokeColor = themeConfig.strokeColor || selectedWallpaper.defaultColor;
        const strokeOpacity = (themeConfig.opacity !== undefined ? themeConfig.opacity : 10) / 100;
        const svgContent = selectedWallpaper.svg(strokeColor, strokeOpacity);
        styles.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svgContent)}")`;
        styles.backgroundRepeat = 'repeat';
        styles.backgroundSize = '160px 160px';
        styles.backgroundPosition = '0 0';
        styles.opacity = 1;
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
        styles.backgroundRepeat = 'repeat';
        styles.backgroundSize = '160px 160px';
        styles.backgroundPosition = '0 0';
        styles.opacity = 1;
      }
    }

    // 2. Vignette Box Shadow
    const vignetteStrength = themeConfig.vignette !== undefined ? themeConfig.vignette : 40;
    styles.boxShadow = `inset 0 0 ${vignetteStrength}px rgba(0, 0, 0, 0.45)`;

    return styles;
  };

  return createPortal(
    <div className="modal-backdrop active chat-theme-fullscreen-editor">

      {/* ── IMMERSIVE FULL-SCREEN 1:1 LIVE CHAT SCREEN SIMULATOR ── */}
      <div
        className="chat-preview-fullscreen scrollbar-custom"
        style={{
          background: themeConfig.useStaticColor && themeConfig.bgColor ? themeConfig.bgColor : 'var(--bg-window)'
        }}
      >

        {/* Isolated Background Image & Effect Layer */}
        <div className="chat-preview-background-overlay" style={getPreviewBackgroundOverlayStyle()} />

        {/* Simulator Message Bubbles Thread */}
        <div className="chat-preview-message-thread">

          {/* Bot Bubble Mockup */}
          <div className="chat-preview-bot-bubble-wrapper">
            <div className="chat-preview-avatar ai">AI</div>
            <div className="chat-preview-bubble">
              Welcome to the Interactive Studio! Try picking different theme doodles on the left toolbar, dragging the Line Opacity slider, or selecting a custom Solid Color override.
            </div>
          </div>

          {/* User Bubble Mockup */}
          <div className="chat-preview-user-bubble-wrapper">
            <div className="chat-preview-avatar me">ME</div>
            <div className="chat-preview-bubble">
              Wow, this fullscreen customizer workspace is spectacular! Having the preview as the entire screen makes it feel exactly like professional editing software. ✦
            </div>
          </div>

          {/* Bot Bubble 2 Mockup */}
          <div className="chat-preview-bot-bubble-wrapper">
            <div className="chat-preview-avatar ai">AI</div>
            <div className="chat-preview-bubble">
              Exactly! You can also upload custom landscape pictures under "Background Image Upload" and combine them with vignette shadows for the perfect sandbox depth!
            </div>
          </div>

        </div>

        {/* Immersive Editing Bottom Toolbar & Popover Tray */}
        <div className="chat-theme-bottom-toolbar">

          {/* Active Option Popover Tray */}
          {activeOption && (
            <div className="chat-theme-popover-tray">
              {renderActiveOptionContent()}
            </div>
          )}

          {/* Icon-Based Toolbar Buttons */}
          <div className="chat-theme-icon-toolbar">
            {TOOLBAR_ITEMS.map((item) => {
              const isActive = activeOption === item.id;
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveOption(isActive ? null : item.id)}
                  title={item.label}
                  className={`chat-theme-btn-round ${isActive ? 'active' : ''}`}
                >
                  <IconComponent size={18} />
                </button>
              );
            })}

            {/* Separator Line */}
            <div className="chat-theme-toolbar-separator" />

            {/* Reset Button */}
            <button
              type="button"
              onClick={handleResetToDefault}
              title="Reset Theme"
              className="chat-theme-btn-round reset"
            >
              <RotateCcw size={18} />
            </button>

            {/* Apply & Exit Button */}
            <button
              type="button"
              onClick={onClose}
              title="Apply & Exit"
              className="chat-theme-btn-round apply"
            >
              <Check size={18} />
            </button>
          </div>

        </div>

      </div>

      {/* ── HIGH-FIDELITY NON-DESTRUCTIVE CROPPING WORKSPACE OVERLAY ── */}
      <ImageCropperWorkspace
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        imageSrc={themeConfig.bgImageOriginal || themeConfig.bgImage}
        onApply={async (croppedUrl) => {
          const compressed = await resizeAndCompressImage(croppedUrl);
          onChange({
            ...themeConfig,
            bgImage: compressed
          });
          setIsCropModalOpen(false);
        }}
        onReset={() => {
          if (themeConfig.bgImageOriginal) {
            onChange({
              ...themeConfig,
              bgImage: themeConfig.bgImageOriginal
            });
          }
        }}
      />

    </div>,
    document.body
  );
}

/* ── HIGH-FIDELITY IMAGE CROPPER WORKSPACE SUB-COMPONENT ── */
function ImageCropperWorkspace({ isOpen, onClose, imageSrc, onApply, onReset }) {
  const [cropState, setCropState] = useState({ x: 10, y: 10, w: 80, h: 80 });
  const [cropAspectRatio, setCropAspectRatio] = useState('free'); // 'free', '1:1', '16:9', '9:16'

  const cropContainerRef = useRef(null);
  const dragStartRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCropState({ x: 10, y: 10, w: 80, h: 80 });
      setCropAspectRatio('free');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCropMouseDown = (e, mode) => {
    e.preventDefault();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);

    dragStartRef.current = {
      mode,
      startX: clientX,
      startY: clientY,
      rect: { ...cropState }
    };

    const handleCropMouseMove = (moveEvent) => {
      if (!dragStartRef.current || !cropContainerRef.current) return;

      const currentX = moveEvent.clientX || (moveEvent.touches && moveEvent.touches[0].clientX);
      const currentY = moveEvent.clientY || (moveEvent.touches && moveEvent.touches[0].clientY);

      const container = cropContainerRef.current.getBoundingClientRect();
      const deltaX = ((currentX - dragStartRef.current.startX) / container.width) * 100;
      const deltaY = ((currentY - dragStartRef.current.startY) / container.height) * 100;

      const { mode: currentMode, rect } = dragStartRef.current;
      const nextRect = { ...rect };

      if (currentMode === 'drag') {
        nextRect.x = Math.max(0, Math.min(100 - rect.w, rect.x + deltaX));
        nextRect.y = Math.max(0, Math.min(100 - rect.h, rect.y + deltaY));
      } else {
        if (currentMode.includes('w')) {
          const newX = Math.max(0, Math.min(rect.x + rect.w - 5, rect.x + deltaX));
          nextRect.w = rect.x + rect.w - newX;
          nextRect.x = newX;
        }
        if (currentMode.includes('e')) {
          nextRect.w = Math.max(5, Math.min(100 - rect.x, rect.w + deltaX));
        }
        if (currentMode.includes('n')) {
          const newY = Math.max(0, Math.min(rect.y + rect.h - 5, rect.y + deltaY));
          nextRect.h = rect.y + rect.h - newY;
          nextRect.y = newY;
        }
        if (currentMode.includes('s')) {
          nextRect.h = Math.max(5, Math.min(100 - rect.y, rect.h + deltaY));
        }

        if (cropAspectRatio !== 'free') {
          const ratioVal = cropAspectRatio === '1:1' ? 1 : cropAspectRatio === '16:9' ? 16 / 9 : 9 / 16;
          const containerAspect = container.width / container.height;
          const targetPercentHeight = (nextRect.w * containerAspect) / ratioVal;

          if (currentMode.includes('n')) {
            nextRect.y = nextRect.y + nextRect.h - targetPercentHeight;
          }
          nextRect.h = targetPercentHeight;

          if (nextRect.y < 0) {
            nextRect.y = 0;
            nextRect.h = rect.y + rect.h;
            nextRect.w = (nextRect.h * ratioVal) / containerAspect;
            if (currentMode.includes('w')) nextRect.x = rect.x + rect.w - nextRect.w;
          }
          if (nextRect.y + nextRect.h > 100) {
            nextRect.h = 100 - nextRect.y;
            nextRect.w = (nextRect.h * ratioVal) / containerAspect;
            if (currentMode.includes('w')) nextRect.x = rect.x + rect.w - nextRect.w;
          }
        }
      }

      setCropState({
        x: Math.max(0, Math.min(100, nextRect.x)),
        y: Math.max(0, Math.min(100, nextRect.y)),
        w: Math.max(5, Math.min(100 - nextRect.x, nextRect.w)),
        h: Math.max(5, Math.min(100 - nextRect.y, nextRect.h))
      });
    };

    const handleCropMouseUp = () => {
      dragStartRef.current = null;
      document.removeEventListener('mousemove', handleCropMouseMove);
      document.removeEventListener('mouseup', handleCropMouseUp);
      document.removeEventListener('touchmove', handleCropMouseMove);
      document.removeEventListener('touchend', handleCropMouseUp);
    };

    document.addEventListener('mousemove', handleCropMouseMove);
    document.addEventListener('mouseup', handleCropMouseUp);
    document.addEventListener('touchmove', handleCropMouseMove, { passive: false });
    document.addEventListener('touchend', handleCropMouseUp);
  };

  const handleAspectRatioChange = (ratio) => {
    setCropAspectRatio(ratio);
    if (ratio === 'free') return;

    const container = cropContainerRef.current?.getBoundingClientRect();
    if (!container) return;

    const containerAspect = container.width / container.height;
    const ratioVal = ratio === '1:1' ? 1 : ratio === '16:9' ? 16 / 9 : 9 / 16;

    let targetW = 60;
    let targetH = (targetW * containerAspect) / ratioVal;

    if (targetH > 80) {
      targetH = 80;
      targetW = (targetH * ratioVal) / containerAspect;
    }

    setCropState({
      x: (100 - targetW) / 2,
      y: (100 - targetH) / 2,
      w: targetW,
      h: targetH
    });
  };

  const handleApply = async () => {
    try {
      const croppedUrl = await cropImage(imageSrc, cropState);
      onApply(croppedUrl);
    } catch (err) {
      console.error("Failed to crop image:", err);
    }
  };

  const handleReset = () => {
    setCropState({ x: 10, y: 10, w: 80, h: 80 });
    setCropAspectRatio('free');
    onReset();
  };

  return (
    <div className="crop-workspace-overlay">
      {/* Header */}
      <div className="crop-workspace-header">
        <div className="crop-workspace-header-title-container">
          <Crop size={20} />
          <h3>Crop Background Image</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="crop-workspace-close-btn"
        >
          <X size={20} />
        </button>
      </div>

      {/* Canvas / Crop workspace area */}
      <div className="crop-workspace-canvas-area">
        <div ref={cropContainerRef} className="crop-workspace-container">
          <img src={imageSrc} alt="Source Crop" className="crop-workspace-img" />
          <div className="crop-workspace-mask" />

          {/* Viewport Box */}
          <div
            className="crop-workspace-hole"
            style={{
              left: `${cropState.x}%`,
              top: `${cropState.y}%`,
              width: `${cropState.w}%`,
              height: `${cropState.h}%`
            }}
            onMouseDown={(e) => handleCropMouseDown(e, 'drag')}
            onTouchStart={(e) => handleCropMouseDown(e, 'drag')}
          >
            {/* Thirds Grid Lines */}
            <div className="crop-workspace-grid-line h-33" />
            <div className="crop-workspace-grid-line h-66" />
            <div className="crop-workspace-grid-line v-33" />
            <div className="crop-workspace-grid-line v-66" />

            {/* Corner Drag Handles */}
            <div className="crop-workspace-handle nw" onMouseDown={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'nw'); }} onTouchStart={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'nw'); }} />
            <div className="crop-workspace-handle ne" onMouseDown={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'ne'); }} onTouchStart={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'ne'); }} />
            <div className="crop-workspace-handle se" onMouseDown={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'se'); }} onTouchStart={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'se'); }} />
            <div className="crop-workspace-handle sw" onMouseDown={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'sw'); }} onTouchStart={(e) => { e.stopPropagation(); handleCropMouseDown(e, 'sw'); }} />
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className="crop-workspace-footer">
        <div className="crop-workspace-presets-group">
          <span>Aspect Ratio:</span>
          {['free', '1:1', '16:9', '9:16'].map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => handleAspectRatioChange(ratio)}
              className={`crop-workspace-ratio-btn ${cropAspectRatio === ratio ? 'active' : ''}`}
            >
              {ratio}
            </button>
          ))}
        </div>

        <div className="crop-workspace-actions-group">
          <button type="button" onClick={handleReset} className="crop-workspace-btn reset">
            Reset Crop
          </button>
          <button type="button" onClick={onClose} className="crop-workspace-btn">
            Cancel
          </button>
          <button type="button" onClick={handleApply} className="crop-workspace-btn apply">
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}
