/* eslint-disable react-hooks/set-state-in-effect */
import React from 'react';
import { useUIContext }        from '../../context/UIContext';
import { useCharacterContext } from '../../context/CharacterContext';
import { useLoreWorldContext } from '../../context/LoreWorldContext';
import { useToast }            from '../../context/ToastContext';
import { 
  Plus, Edit3, X, Image as ImageIcon, Download,
  Star, Globe, Copy, Skull, ChevronDown, ChevronUp,
  User, MessageSquare, Sparkles, Map, MessageCircle, FolderOpen
} from 'lucide-react';

function RemoveFieldButton({ fieldKey, onRemove, setActiveOptionalFields }) {
  return (
    <span
      role="button"
      className="remove-optional-field-btn"
      title="Remove Field"
      onClick={(e) => {
        e.stopPropagation();
        setActiveOptionalFields(prev => ({ ...prev, [fieldKey]: false }));
        onRemove();
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        color: 'var(--text-muted)',
        transition: 'color var(--tf)',
        padding: '4px',
        marginRight: '-4px'
      }}
      onMouseOver={(e) => e.currentTarget.style.color = 'var(--pink)'}
      onMouseOut={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
    >
      <X size={14} />
    </span>
  );
}

export default function CharacterModal({ isOpen }) {
  const ui    = useUIContext();
  const chars = useCharacterContext();
  const lw    = useLoreWorldContext();
  const { toast, showConfirm } = useToast();

  const [isFavorited, setIsFavorited] = React.useState(false);
  const [tags, setTags] = React.useState([]);
  const [personalityTraits, setPersonalityTraits] = React.useState('');
  const [tagInputValue, setTagInputValue] = React.useState('');
  const [showWorldDropdown, setShowWorldDropdown] = React.useState(false);
  const [expandedSections, setExpandedSections] = React.useState({
    description: true,
    greeting: false,
    traits: false,
    scenario: false,
    dialogue: false,
    system_prompt: false,
    post_history_instructions: false,
    creator_notes: false,
    creator_details: false,
    alternate_greetings: false
  });
  const [activeOptionalFields, setActiveOptionalFields] = React.useState({
    traits: false,
    scenario: false,
    dialogue: false,
    system_prompt: false,
    post_history_instructions: false,
    creator_notes: false,
    creator_details: false,
    alternate_greetings: false
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const dropdownRef = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowWorldDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Helper to extract tags and personality traits from personality text
  const parseMetadataFromPersonality = (personalityText) => {
    if (!personalityText) return { tags: [], traits: "", cleanPersonality: "" };
    
    let currentText = personalityText;
    let tagsList = [];
    let traitsStr = "";

    // 1. Extract Tags
    const tagsMatch = currentText.match(/\[Tags:\s*([^\]]*)\]/);
    if (tagsMatch) {
      const tagsStr = tagsMatch[1];
      tagsList = tagsStr.split(',').map(t => t.trim()).filter(t => t);
      currentText = currentText.replace(/\[Tags:\s*[^\]]*\]\n?/, '').trim();
    }

    // 2. Extract Personality Traits
    const traitsMatch = currentText.match(/\[Personality:\s*([^\]]*)\]/);
    if (traitsMatch) {
      traitsStr = traitsMatch[1].trim();
      currentText = currentText.replace(/\[Personality:\s*[^\]]*\]\n?/, '').trim();
    } else {
      const alternateMatch = currentText.match(/\[Traits:\s*([^\]]*)\]/);
      if (alternateMatch) {
        traitsStr = alternateMatch[1].trim();
        currentText = currentText.replace(/\[Traits:\s*[^\]]*\]\n?/, '').trim();
      }
    }

    return { tags: tagsList, traits: traitsStr, cleanPersonality: currentText };
  };

  // Helper to serialize tags and personality traits back into personality text
  const serializeMetadataIntoPersonality = (personalityText, tagsArray, traitsStr) => {
    const cleanText = personalityText ? personalityText
      .replace(/\[Tags:\s*[^\]]*\]\n?/, '')
      .replace(/\[Personality:\s*[^\]]*\]\n?/, '')
      .replace(/\[Traits:\s*[^\]]*\]\n?/, '')
      .trim() : '';

    const prefixBlocks = [];
    if (tagsArray.length > 0) {
      prefixBlocks.push(`[Tags: ${tagsArray.join(', ')}]`);
    }
    if (traitsStr && traitsStr.trim()) {
      prefixBlocks.push(`[Personality: ${traitsStr.trim()}]`);
    }

    if (prefixBlocks.length === 0) return cleanText;
    return `${prefixBlocks.join('\n')}\n\n${cleanText}`.trim();
  };

  // Sync tags/traits and strip them from the displayed personality input when card data loads
  React.useEffect(() => {
    if (isOpen) {
      const { tags: parsedTags, traits: parsedTraits, cleanPersonality } = parseMetadataFromPersonality(chars.characterForm.personality);
      setTags(parsedTags);
      setPersonalityTraits(parsedTraits);
      
      // Initialize active state based on whether fields have existing data
      setActiveOptionalFields({
        traits: !!parsedTraits.trim(),
        scenario: !!chars.characterForm.scenario?.trim(),
        dialogue: !!chars.characterForm.example_dialogue?.trim(),
        system_prompt: !!chars.characterForm.system_prompt?.trim(),
        post_history_instructions: !!chars.characterForm.post_history_instructions?.trim(),
        creator_notes: !!chars.characterForm.creator_notes?.trim(),
        creator_details: !!(chars.characterForm.creator?.trim() || chars.characterForm.character_version?.trim()),
        alternate_greetings: !!(chars.characterForm.alternate_greetings && chars.characterForm.alternate_greetings.length > 0)
      });

      if (chars.characterForm.personality !== cleanPersonality) {
        chars.setCharacterForm(prev => ({
          ...prev,
          personality: cleanPersonality
        }));
      }
    } else {
      setTags([]);
      setPersonalityTraits('');
      setTagInputValue('');
      setActiveOptionalFields({
        traits: false,
        scenario: false,
        dialogue: false,
        system_prompt: false,
        post_history_instructions: false,
        creator_notes: false,
        creator_details: false,
        alternate_greetings: false
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, chars.characterForm.id]);

  if (!isOpen) return null;

  // Real-time token estimator based on ~4 chars per token ratio
  const estimateTokens = (text) => {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  };

  const nameTokens = estimateTokens(chars.characterForm.name);
  const greetingTokens = estimateTokens(chars.characterForm.greeting);
  const finalPersonalityForEstimate = serializeMetadataIntoPersonality(chars.characterForm.personality, tags, personalityTraits);
  const personaTokens = estimateTokens(finalPersonalityForEstimate);
  const scenarioTokens = estimateTokens(chars.characterForm.scenario);
  const dialogueTokens = estimateTokens(chars.characterForm.example_dialogue);
  const systemPromptTokens = estimateTokens(chars.characterForm.system_prompt);
  const postHistoryTokens = estimateTokens(chars.characterForm.post_history_instructions);
  const creatorNotesTokens = estimateTokens(chars.characterForm.creator_notes);
  const alternateGreetingsTokens = (chars.characterForm.alternate_greetings || [])
    .reduce((sum, g) => sum + estimateTokens(g), 0);

  const totalTokens = nameTokens + greetingTokens + personaTokens + scenarioTokens + dialogueTokens + systemPromptTokens + postHistoryTokens + alternateGreetingsTokens;

  // Handles client-side Tavern JSON card export
  const handleExportCardJson = (e) => {
    e.preventDefault();
    if (!chars.characterForm.name) {
      toast.error("Please enter a character name before exporting.");
      return;
    }
    // Embed tags & personality traits inside personality for export
    const finalPersonality = serializeMetadataIntoPersonality(chars.characterForm.personality, tags, personalityTraits);
    const exportForm = {
      ...chars.characterForm,
      personality: finalPersonality
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportForm, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${chars.characterForm.name.toLowerCase()}_tavern_card.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success(`${chars.characterForm.name} card exported successfully!`);
  };

  // Handles cloning character card
  const handleCloneCharacter = async (e) => {
    e.preventDefault();
    try {
      const finalPersonality = serializeMetadataIntoPersonality(chars.characterForm.personality, tags, personalityTraits);
      const clonedForm = {
        ...chars.characterForm,
        id: null, // clear ID to create new
        name: `${chars.characterForm.name} (Copy)`,
        personality: finalPersonality
      };
      await chars.handleCharacterSubmit(clonedForm);
      toast.success(`Cloned ${chars.characterForm.name} successfully!`);
      ui.setActiveModal(null);
    } catch (err) {
      toast.error(`Clone failed: ${err.message || String(err)}`);
    }
  };

  // Handles deleting character directly from form
  const handleDeleteCharacter = async (e) => {
    e.preventDefault();
    const ok = await showConfirm(`Are you sure you want to delete ${chars.characterForm.name}?`);
    if (!ok) return;
    try {
      await chars.handleDeleteCharacter(chars.characterForm.id);
      toast.success(`${chars.characterForm.name} deleted.`);
      ui.setActiveModal(null);
    } catch (err) {
      toast.error(`Delete failed: ${err.message || String(err)}`);
    }
  };

  // Handles tag additions
  const handleAddTag = () => {
    if (!tagInputValue.trim()) return;
    const rawTags = tagInputValue.split(',');
    const newTags = [...tags];
    let addedAny = false;

    rawTags.forEach(t => {
      const cleanTag = t.trim().toLowerCase();
      if (cleanTag && !newTags.includes(cleanTag)) {
        newTags.push(cleanTag);
        addedAny = true;
      }
    });

    if (addedAny) {
      setTags(newTags);
    }
    setTagInputValue('');
  };

  // Handles tag deletions
  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  return (
    <div className="modal-backdrop active" id="modal-character">
      <div className="modal-box large glassmorphism scale-in">
        <div className="modal-header">
          <h2 id="char-modal-title">
            {chars.characterForm.id ? <Edit3 size={18} /> : <Plus size={18} />} 
            {chars.characterForm.id ? ' Edit Character' : ' Create Character'}
          </h2>
          <button type="button" className="modal-close-btn" onClick={() => ui.setActiveModal(null)}>
            <X size={18} />
          </button>
        </div>
        <form 
          id="character-form" 
          onSubmit={async (e) => { 
            e.preventDefault(); 
            try { 
              // Automatically include any pending tags that are typed but not explicitly added yet
              let finalTags = [...tags];
              if (tagInputValue.trim()) {
                const pendingTags = tagInputValue.split(',');
                pendingTags.forEach(t => {
                  const cleanTag = t.trim().toLowerCase();
                  if (cleanTag && !finalTags.includes(cleanTag)) {
                    finalTags.push(cleanTag);
                  }
                });
              }

              const finalPersonality = serializeMetadataIntoPersonality(chars.characterForm.personality, finalTags, personalityTraits);
              const submissionForm = {
                ...chars.characterForm,
                personality: finalPersonality
              };
              await chars.handleCharacterSubmit(submissionForm); 
              ui.setActiveModal(null); 
            } catch (err) { 
              toast.error(`Save failed: ${err.message || String(err)}`); 
            } 
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
              e.preventDefault();
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
          <div className="modal-body scrollbar-custom" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', padding: 0 }}>
            <div className="form-split-layout" style={{ display: 'flex', flex: 1, minHeight: 0, height: '100%' }}>
              {/* Left Column: Identity, Tags & Actions */}
              <div className="form-column form-column-left" style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', gap: '16px' }}>
                
                <div className="identity-card" style={{ flexShrink: 0 }}>
                  {/* Left Side: Avatar Upload Container */}
                  <div className="avatar-upload-wrapper">
                    <div 
                      className="avatar-upload-box" 
                      id="char-avatar-container"
                      onClick={() => document.getElementById("char-avatar-input").click()}
                      title="Upload Avatar"
                      style={{ cursor: 'pointer' }}
                    >
                      {chars.characterForm.avatar ? (
                        <img id="char-avatar-preview" src={chars.characterForm.avatar} alt="Preview" style={{ display: 'block' }} />
                      ) : (
                        <ImageIcon className="placeholder-icon" size={24} />
                      )}
                      <input 
                        type="file" 
                        id="char-avatar-input" 
                        accept="image/*" 
                        style={{ display: 'none' }}
                        onChange={chars.handleAvatarFileChange}
                      />
                    </div>
                    {chars.characterForm.avatar && (
                      <button
                        type="button"
                        className="remove-avatar-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          chars.setCharacterForm(prev => ({ ...prev, avatar: null }));
                        }}
                      >
                        Remove Image
                      </button>
                    )}
                  </div>

                  {/* Right Side: Name & SillyTavern Button Row */}
                  <div className="identity-details-wrapper">
                    <div className="form-group flex-fill" style={{ marginBottom: 0 }}>
                      <label htmlFor="char-name">Character Name</label>
                      <input 
                        type="text" 
                        id="char-name" 
                        required 
                        placeholder="e.g., Seraphina, Lyra..."
                        value={chars.characterForm.name}
                        onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, name: e.target.value }))}
                      />
                    </div>
                    
                    {/* SillyTavern Toolbar Mini Buttons */}
                    <div className="card-action-bar" style={{ display: 'flex', gap: '4px', marginTop: '4px', width: '100%' }}>
                      {/* Star Button */}
                      <button 
                        type="button" 
                        className="mini-silly-btn"
                        title="Favorite Character"
                        onClick={() => {
                          setIsFavorited(!isFavorited);
                          toast.success(isFavorited ? "Removed from favorites." : "Added to favorites!");
                        }}
                        style={{ color: isFavorited ? 'var(--pink)' : 'var(--text)' }}
                      >
                        <Star size={16} />
                      </button>

                      {/* World Config with Dropdown */}
                      <div className="world-dropdown-container" ref={dropdownRef} style={{ position: 'relative', display: 'flex', flex: 1, minWidth: 0 }}>
                        <button 
                          type="button" 
                          className="mini-silly-btn enabled"
                          title="Associate / Manage World"
                          onClick={(e) => {
                            e.preventDefault();
                            setShowWorldDropdown(!showWorldDropdown);
                          }}
                          style={{ color: chars.characterForm.world_id ? 'var(--pink)' : 'var(--text)', width: '100%' }}
                        >
                          <Globe size={16} />
                        </button>
                        
                        {showWorldDropdown && (
                          <div className="world-select-popover scrollbar-custom" style={{
                            position: 'absolute',
                            top: '100%',
                            left: '0',
                            marginTop: '6px',
                            background: 'var(--bg-window)',
                            border: 'var(--border-width) solid var(--border)',
                            borderRadius: 'var(--r-sm)',
                            boxShadow: 'var(--shadow-sm)',
                            padding: '8px',
                            zIndex: 1000,
                            minWidth: '220px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-sec)', padding: '2px 4px', borderBottom: '1px dashed var(--border)', marginBottom: '4px', fontFamily: 'var(--font-head)', fontWeight: 'bold' }}>
                              ASSOCIATE WORLD
                            </div>
                            
                            <button
                              type="button"
                              onClick={() => {
                                chars.setCharacterForm(prev => ({ ...prev, world_id: null }));
                                setShowWorldDropdown(false);
                                toast.success("Set as Standalone Character (No World).");
                              }}
                              style={{
                                background: !chars.characterForm.world_id ? 'var(--purple)' : 'none',
                                color: 'var(--text)',
                                border: 'none',
                                padding: '6px 8px',
                                borderRadius: 'var(--r-xs)',
                                cursor: 'pointer',
                                textAlign: 'left',
                                fontSize: '0.78rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                            >
                              <span>Standalone (No World)</span>
                              {!chars.characterForm.world_id && <span>✦</span>}
                            </button>

                            {lw.worlds.map(w => {
                              const isActive = chars.characterForm.world_id === w.id;
                              return (
                                <button
                                  key={w.id}
                                  type="button"
                                  onClick={() => {
                                    chars.setCharacterForm(prev => ({ ...prev, world_id: w.id }));
                                    setShowWorldDropdown(false);
                                    toast.success(`Associated with world: ${w.name}`);
                                  }}
                                  style={{
                                    background: isActive ? 'var(--purple)' : 'none',
                                    color: 'var(--text)',
                                    border: 'none',
                                    padding: '6px 8px',
                                    borderRadius: 'var(--r-xs)',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                    fontSize: '0.78rem',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                >
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>{w.name}</span>
                                  {isActive && <span>✦</span>}
                                </button>
                              );
                            })}

                          </div>
                        )}
                      </div>

                      {/* Copy (Duplicate Character Card) */}
                      <button 
                        type="button" 
                        className="mini-silly-btn"
                        title="Duplicate/Clone Character"
                        disabled={!chars.characterForm.id}
                        onClick={handleCloneCharacter}
                      >
                        <Copy size={16} />
                      </button>

                      {/* Download (Export JSON) */}
                      <button 
                        type="button" 
                        className="mini-silly-btn"
                        title="Export JSON Tavern Card"
                        onClick={handleExportCardJson}
                      >
                        <Download size={16} />
                      </button>

                      {/* Skull (Delete Character) */}
                      <button 
                        type="button" 
                        className="mini-silly-btn danger"
                        title="Delete Character Card"
                        disabled={!chars.characterForm.id}
                        onClick={handleDeleteCharacter}
                      >
                        <Skull size={16} />
                      </button>
                    </div>

                    {/* Live Token Count Banner */}
                    <div style={{ margin: '8px 0 0 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', fontFamily: 'var(--font-code)', fontSize: '0.82rem', borderTop: '1px dashed var(--border)', width: '100%', paddingTop: '8px' }}>
                      <span style={{ color: 'var(--text)', fontWeight: 'bold' }}>
                        {totalTokens} Tokens (Estimated)
                      </span>
                      <span style={{ color: 'var(--text-sec)', fontSize: '0.74rem' }}>
                        ({nameTokens + personaTokens + scenarioTokens} Permanent)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Scrollable Content Wrapper */}
                <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '4px', minHeight: 0 }}>

                  {/* Character Tags Management (SillyTavern Style) */}
                  <div className="form-group" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ margin: 0 }}>Character Tags</label>
                    <button
                      type="button"
                      className="text-btn"
                      style={{
                        fontSize: '0.76rem',
                        color: 'var(--pink)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: 'var(--r-xs)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontFamily: 'var(--font-code)',
                        fontWeight: 'bold',
                        transition: 'opacity 0.2s',
                      }}
                      onClick={async () => {
                        const name = chars.characterForm.name;
                        const personality = chars.characterForm.personality;
                        const scenario = chars.characterForm.scenario;
                        if (!name && !personality) {
                          toast.error("Please provide at least a name or personality description before generating tags.");
                          return;
                        }
                        toast.info("Analyzing character and generating tags...");
                        try {
                          const generated = await chars.handleGenerateTags(name, personality, scenario);
                          const newTags = [...tags];
                          let addedAny = false;
                          generated.forEach(t => {
                            const clean = t.trim().toLowerCase();
                            if (clean && !newTags.includes(clean)) {
                              newTags.push(clean);
                              addedAny = true;
                            }
                          });
                          if (addedAny) {
                            setTags(newTags);
                            toast.success("Successfully generated tags!");
                          } else {
                            toast.info("Generated tags are already present.");
                          }
                        } catch (err) {
                          toast.error(`Failed to generate tags: ${err.message}`);
                        }
                      }}
                      onMouseOver={(e) => e.currentTarget.style.opacity = '0.8'}
                      onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
                    >
                      ✦ Auto-Generate
                    </button>
                  </div>
                  {/* Render active tag badges first (above the input box) */}
                  {tags.length > 0 && (
                    <div 
                      className="tag-badges-container no-scrollbar" 
                      style={{ 
                        display: 'flex', 
                        flexWrap: 'wrap', 
                        gap: '6px', 
                        marginBottom: '8px', 
                        maxHeight: '120px', 
                        overflowY: 'auto', 
                        paddingRight: '4px',
                        alignContent: 'flex-start'
                      }}
                    >
                      {tags.map((t, idx) => (
                        <span key={idx} className="silly-tag-badge">
                          {t}
                          <button 
                            type="button" 
                            className="remove-tag-btn" 
                            title={`Remove tag: ${t}`}
                            onClick={() => handleRemoveTag(t)}
                          >
                            <X size={10} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Search / Create Tag Input Box */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      type="text" 
                      id="tag-input" 
                      placeholder="Search / Create tags..." 
                      value={tagInputValue}
                      onChange={(e) => setTagInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <button 
                      type="button" 
                      className="primary-btn" 
                      onClick={handleAddTag}
                      style={{ padding: '0 16px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* NSFW Toggle Option */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', marginBottom: tags.includes('nsfw') ? '4px' : '16px', paddingTop: '12px', borderTop: '1px dashed var(--border)' }}>
                  <label htmlFor="char-nsfw-toggle" style={{ fontSize: '0.9rem', fontFamily: 'var(--font-code)', fontWeight: 'bold', color: 'var(--text)', cursor: 'pointer' }}>
                    Allow NSFW
                  </label>
                  <label className="switch" style={{ flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      id="char-nsfw-toggle"
                      checked={tags.includes('nsfw')}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (!tags.includes('nsfw')) {
                            setTags([...tags, 'nsfw']);
                            chars.setCharacterForm(prev => ({ ...prev, nsfw_inject: false }));
                          }
                        } else {
                          setTags(tags.filter(t => t !== 'nsfw'));
                          chars.setCharacterForm(prev => ({ ...prev, nsfw_inject: false }));
                        }
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </div>

                {/* Conditional NSFW Prompt Injection Toggle */}
                {tags.includes('nsfw') && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px', marginBottom: '16px', paddingLeft: '16px' }} data-testid="nsfw-inject-container">
                    <label htmlFor="char-nsfw-inject-toggle" style={{ fontSize: '0.82rem', fontFamily: 'var(--font-code)', color: 'var(--text-sec)', cursor: 'pointer' }}>
                      NSFW Prompt Injection
                    </label>
                    <label className="switch" style={{ flexShrink: 0, transform: 'scale(0.85)' }}>
                      <input
                        type="checkbox"
                        id="char-nsfw-inject-toggle"
                        checked={!!chars.characterForm.nsfw_inject}
                        onChange={(e) => {
                          chars.setCharacterForm(prev => ({ ...prev, nsfw_inject: e.target.checked }));
                        }}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                )}

                </div>

                {/* Form Actions (Save & Cancel) */}
                <div className="form-actions-left" style={{ display: 'flex', gap: '12px', marginTop: '16px', flexShrink: 0 }}>
                  <button 
                    type="submit" 
                    className="primary-btn"
                    style={{ flex: 1, padding: '10px 24px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}
                  >
                    Save Character
                  </button>
                  <button 
                    type="button" 
                    className="secondary-btn" 
                    onClick={() => ui.setActiveModal(null)}
                    style={{ padding: '10px 20px', height: '46px', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '90px' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>

              {/* Right Column: Persona & Behavior */}
              <div className="form-column form-column-right scrollbar-custom" style={{ padding: 0, gap: 0 }}>
                <div className="right-column-section-header" style={{ position: 'sticky', top: 0, zIndex: 10, flexShrink: 0, margin: 0, borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderTop: 'none', padding: '16px 24px', background: 'var(--bg-window)' }}>
                  <FolderOpen size={18} />
                  <h3>Card Definition</h3>
                </div>

                <div className="card-definition-container" style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px 24px 24px 24px' }}>
                  {/* Collapsible Section: Character Description */}
                  <div className={`collapsible-card ${expandedSections.description ? 'expanded' : ''}`}>
                    <button
                      type="button"
                      className="collapsible-header"
                      onClick={() => toggleSection('description')}
                    >
                      <div className="header-left">
                        <User size={16} className="header-icon" />
                        <span className="header-title">Character Description</span>
                      </div>
                      <div className="header-right">
                        <span className="token-badge">{estimateTokens(chars.characterForm.personality)} tokens</span>
                        {expandedSections.description ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>
                    
                    <div className="collapsible-content-wrapper">
                      <div className="collapsible-content">
                        <p className="field-desc">
                          The core definition of who this character is. This includes personality traits, background, appearance, and behavior patterns. The AI uses this as the primary reference to understand and roleplay the character consistently.
                        </p>
                        <textarea 
                          id="char-personality" 
                          placeholder="Describe their history, body, desires, quirks, voice, and hidden depths..."
                          value={chars.characterForm.personality}
                          onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, personality: e.target.value }))}
                          className="collapsible-textarea textarea-desc"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Collapsible Section: First Message */}
                  <div className={`collapsible-card ${expandedSections.greeting ? 'expanded' : ''}`}>
                    <button
                      type="button"
                      className="collapsible-header"
                      onClick={() => toggleSection('greeting')}
                    >
                      <div className="header-left">
                        <MessageSquare size={16} className="header-icon" />
                        <span className="header-title">First Message</span>
                      </div>
                      <div className="header-right">
                        <span className="token-badge">{greetingTokens} tokens</span>
                        {expandedSections.greeting ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </div>
                    </button>
                    
                    <div className="collapsible-content-wrapper">
                      <div className="collapsible-content">
                        <p className="field-desc">
                          The first message or greeting this character sends when beginning a new chat session. Sets the tone, formatting, and initial scenario.
                        </p>
                        <textarea 
                          id="char-greeting" 
                          placeholder="The first thing they say when the scene begins..."
                          value={chars.characterForm.greeting}
                          onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, greeting: e.target.value }))}
                          className="collapsible-textarea textarea-greeting"
                        />
                      </div>
                    </div>
                  </div>


                  {/* Collapsible Section: Personality */}
                  {activeOptionalFields.traits && (
                    <div className={`collapsible-card ${expandedSections.traits ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('traits')}
                      >
                        <div className="header-left">
                          <Sparkles size={16} className="header-icon" />
                          <span className="header-title">Personality</span>
                        </div>
                        <div className="header-right">
                          <span className="token-badge">{estimateTokens(personalityTraits)} tokens</span>
                          <RemoveFieldButton
                            fieldKey="traits"
                            onRemove={() => setPersonalityTraits('')}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.traits ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content">
                          <p className="field-desc">
                            Short, comma-separated traits or tags defining their personality (e.g. quiet, intelligent, tsundere, kind). These are serialized and stored efficiently.
                          </p>
                          <input 
                            type="text"
                            id="char-personality-traits" 
                            placeholder="e.g., quiet, intelligent, tsundere, kind..."
                            value={personalityTraits}
                            onChange={(e) => setPersonalityTraits(e.target.value)}
                            className="collapsible-input"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Section: Scenario */}
                  {activeOptionalFields.scenario && (
                    <div className={`collapsible-card ${expandedSections.scenario ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('scenario')}
                      >
                        <div className="header-left">
                          <Map size={16} className="header-icon" />
                          <span className="header-title">Scenario</span>
                        </div>
                        <div className="header-right">
                          <span className="token-badge">{scenarioTokens} tokens</span>
                          <RemoveFieldButton
                            fieldKey="scenario"
                            onRemove={() => chars.setCharacterForm(prev => ({ ...prev, scenario: '' }))}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.scenario ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content">
                          <p className="field-desc">
                            The current situation or environment at the start of the chat. Helps steer the context of the opening scenes.
                          </p>
                          <textarea 
                            id="char-scenario" 
                            placeholder="Set the scene — where are you both, what just happened?"
                            value={chars.characterForm.scenario}
                            onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, scenario: e.target.value }))}
                            className="collapsible-textarea textarea-scenario"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Section: Example Dialogue */}
                  {activeOptionalFields.dialogue && (
                    <div className={`collapsible-card ${expandedSections.dialogue ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('dialogue')}
                      >
                        <div className="header-left">
                          <MessageCircle size={16} className="header-icon" />
                          <span className="header-title">Example Dialogue</span>
                        </div>
                        <div className="header-right">
                          <span className="token-badge">{dialogueTokens} tokens</span>
                          <RemoveFieldButton
                            fieldKey="dialogue"
                            onRemove={() => chars.setCharacterForm(prev => ({ ...prev, example_dialogue: '' }))}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.dialogue ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content">
                          <p className="field-desc">
                            Optional example dialogue to teach the model how the character talks. Format using chat patterns like &lt;START&gt;.
                          </p>
                          <textarea 
                            id="char-dialogue" 
                            placeholder="&lt;START&gt;&#10;&lt;User&gt;: Hello&#10;Seraphina: *looks up with lidded eyes* You came..."
                            value={chars.characterForm.example_dialogue}
                            onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, example_dialogue: e.target.value }))}
                            className="collapsible-textarea textarea-dialogue"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Section: Alternate Greetings */}
                  {activeOptionalFields.alternate_greetings && (
                    <div className={`collapsible-card ${expandedSections.alternate_greetings ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('alternate_greetings')}
                      >
                        <div className="header-left">
                          <MessageSquare size={16} className="header-icon" />
                          <span className="header-title">Alternate Greetings</span>
                        </div>
                        <div className="header-right">
                          <span className="token-badge">{alternateGreetingsTokens} tokens</span>
                          <RemoveFieldButton
                            fieldKey="alternate_greetings"
                            onRemove={() => chars.setCharacterForm(prev => ({ ...prev, alternate_greetings: [] }))}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.alternate_greetings ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          <p className="field-desc">
                            Additional opening messages for starting chats. The user can cycle/swipe through these options in the chat session.
                          </p>
                          {(chars.characterForm.alternate_greetings || []).map((alt, idx) => (
                            <div key={idx} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px', borderTop: idx > 0 ? '1px dashed var(--border)' : 'none', paddingTop: idx > 0 ? '12px' : '0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-sec)', fontFamily: 'var(--font-code)', fontWeight: 'bold' }}>
                                  Greeting #{idx + 1}
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    chars.setCharacterForm(prev => {
                                      const updated = prev.alternate_greetings.filter((_, i) => i !== idx);
                                      return { ...prev, alternate_greetings: updated };
                                    });
                                  }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--pink)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    padding: '4px'
                                  }}
                                >
                                  <X size={14} />
                                </button>
                              </div>
                              <textarea
                                value={alt}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  chars.setCharacterForm(prev => {
                                    const updated = [...prev.alternate_greetings];
                                    updated[idx] = val;
                                    return { ...prev, alternate_greetings: updated };
                                  });
                                }}
                                placeholder="Write greeting option..."
                                className="collapsible-textarea textarea-greeting"
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              chars.setCharacterForm(prev => ({
                                ...prev,
                                alternate_greetings: [...(prev.alternate_greetings || []), '']
                              }));
                            }}
                            style={{ alignSelf: 'flex-start', marginTop: '4px' }}
                          >
                            <Plus size={12} />
                            <span>Add Alternate Greeting</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Section: System Prompt Override */}
                  {activeOptionalFields.system_prompt && (
                    <div className={`collapsible-card ${expandedSections.system_prompt ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('system_prompt')}
                      >
                        <div className="header-left">
                          <Globe size={16} className="header-icon" />
                          <span className="header-title">System Prompt Override</span>
                        </div>
                        <div className="header-right">
                          <span className="token-badge">{systemPromptTokens} tokens</span>
                          <RemoveFieldButton
                            fieldKey="system_prompt"
                            onRemove={() => chars.setCharacterForm(prev => ({ ...prev, system_prompt: '' }))}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.system_prompt ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content">
                          <p className="field-desc">
                            Overrides the global system prompt template when compiling prompts for this character.
                          </p>
                          <textarea 
                            id="char-system-prompt" 
                            placeholder="Describe how the AI should structure its system instructions for this character..."
                            value={chars.characterForm.system_prompt}
                            onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, system_prompt: e.target.value }))}
                            className="collapsible-textarea"
                            style={{ minHeight: '120px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Section: Post-History Instructions */}
                  {activeOptionalFields.post_history_instructions && (
                    <div className={`collapsible-card ${expandedSections.post_history_instructions ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('post_history_instructions')}
                      >
                        <div className="header-left">
                          <Sparkles size={16} className="header-icon" />
                          <span className="header-title">Post-History Instructions</span>
                        </div>
                        <div className="header-right">
                          <span className="token-badge">{postHistoryTokens} tokens</span>
                          <RemoveFieldButton
                            fieldKey="post_history_instructions"
                            onRemove={() => chars.setCharacterForm(prev => ({ ...prev, post_history_instructions: '' }))}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.post_history_instructions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content">
                          <p className="field-desc">
                            Directives or formatting rules injected at the absolute end of the prompt (after history) to enforce style or character guidelines.
                          </p>
                          <textarea 
                            id="char-post-history" 
                            placeholder="Rules to inject at the bottom of chat history (e.g. Write in third-person past tense only)..."
                            value={chars.characterForm.post_history_instructions}
                            onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, post_history_instructions: e.target.value }))}
                            className="collapsible-textarea"
                            style={{ minHeight: '100px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Section: Creator Notes */}
                  {activeOptionalFields.creator_notes && (
                    <div className={`collapsible-card ${expandedSections.creator_notes ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('creator_notes')}
                      >
                        <div className="header-left">
                          <FolderOpen size={16} className="header-icon" />
                          <span className="header-title">Creator Notes</span>
                        </div>
                        <div className="header-right">
                          <span className="token-badge">{creatorNotesTokens} tokens</span>
                          <RemoveFieldButton
                            fieldKey="creator_notes"
                            onRemove={() => chars.setCharacterForm(prev => ({ ...prev, creator_notes: '' }))}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.creator_notes ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content">
                          <p className="field-desc">
                            Additional metadata notes or comments written by the author of this character card.
                          </p>
                          <textarea 
                            id="char-creator-notes" 
                            placeholder="Creator comments, instructions, or recommendations for running this card..."
                            value={chars.characterForm.creator_notes}
                            onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, creator_notes: e.target.value }))}
                            className="collapsible-textarea"
                            style={{ minHeight: '100px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Collapsible Section: Creator Details */}
                  {activeOptionalFields.creator_details && (
                    <div className={`collapsible-card ${expandedSections.creator_details ? 'expanded' : ''}`}>
                      <button
                        type="button"
                        className="collapsible-header"
                        onClick={() => toggleSection('creator_details')}
                      >
                        <div className="header-left">
                          <User size={16} className="header-icon" />
                          <span className="header-title">Creator Details</span>
                        </div>
                        <div className="header-right">
                          <RemoveFieldButton
                            fieldKey="creator_details"
                            onRemove={() => chars.setCharacterForm(prev => ({ ...prev, creator: '', character_version: '' }))}
                            setActiveOptionalFields={setActiveOptionalFields}
                          />
                          {expandedSections.creator_details ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </button>
                      
                      <div className="collapsible-content-wrapper">
                        <div className="collapsible-content" style={{ display: 'flex', flexDirection: 'row', gap: '16px' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-sec)', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-code)', fontWeight: 'bold' }}>Creator Name</label>
                            <input 
                              type="text"
                              placeholder="e.g., Skeleton, Kaji..."
                              value={chars.characterForm.creator}
                              onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, creator: e.target.value }))}
                              className="collapsible-input"
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-sec)', marginBottom: '4px', display: 'block', fontFamily: 'var(--font-code)', fontWeight: 'bold' }}>Version</label>
                            <input 
                              type="text"
                              placeholder="e.g., 1.0.0, v2..."
                              value={chars.characterForm.character_version}
                              onChange={(e) => chars.setCharacterForm(prev => ({ ...prev, character_version: e.target.value }))}
                              className="collapsible-input"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Optional Fields Adder Box */}
                  {(!activeOptionalFields.traits || 
                    !activeOptionalFields.scenario || 
                    !activeOptionalFields.dialogue || 
                    !activeOptionalFields.alternate_greetings || 
                    !activeOptionalFields.system_prompt || 
                    !activeOptionalFields.post_history_instructions || 
                    !activeOptionalFields.creator_notes || 
                    !activeOptionalFields.creator_details) && (
                    <div className="optional-fields-adder" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                        {!activeOptionalFields.traits && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, traits: true }));
                              setExpandedSections(prev => ({ ...prev, traits: true }));
                            }}
                          >
                            <Plus size={12} />
                            <span>Personality</span>
                          </button>
                        )}
                        {!activeOptionalFields.scenario && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, scenario: true }));
                              setExpandedSections(prev => ({ ...prev, scenario: true }));
                            }}
                          >
                            <Plus size={12} />
                            <span>Scenario</span>
                          </button>
                        )}
                        {!activeOptionalFields.dialogue && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, dialogue: true }));
                              setExpandedSections(prev => ({ ...prev, dialogue: true }));
                            }}
                          >
                            <Plus size={12} />
                            <span>Example Dialogue</span>
                          </button>
                        )}
                        {!activeOptionalFields.alternate_greetings && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, alternate_greetings: true }));
                              setExpandedSections(prev => ({ ...prev, alternate_greetings: true }));
                              chars.setCharacterForm(prev => ({
                                ...prev,
                                alternate_greetings: prev.alternate_greetings?.length > 0 ? prev.alternate_greetings : ['']
                              }));
                            }}
                          >
                            <Plus size={12} />
                            <span>Alternate Greetings</span>
                          </button>
                        )}
                        {!activeOptionalFields.system_prompt && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, system_prompt: true }));
                              setExpandedSections(prev => ({ ...prev, system_prompt: true }));
                            }}
                          >
                            <Plus size={12} />
                            <span>System Prompt Override</span>
                          </button>
                        )}
                        {!activeOptionalFields.post_history_instructions && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, post_history_instructions: true }));
                              setExpandedSections(prev => ({ ...prev, post_history_instructions: true }));
                            }}
                          >
                            <Plus size={12} />
                            <span>Post-History</span>
                          </button>
                        )}
                        {!activeOptionalFields.creator_notes && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, creator_notes: true }));
                              setExpandedSections(prev => ({ ...prev, creator_notes: true }));
                            }}
                          >
                            <Plus size={12} />
                            <span>Creator Notes</span>
                          </button>
                        )}
                        {!activeOptionalFields.creator_details && (
                          <button
                            type="button"
                            className="add-field-pill-btn"
                            onClick={() => {
                              setActiveOptionalFields(prev => ({ ...prev, creator_details: true }));
                              setExpandedSections(prev => ({ ...prev, creator_details: true }));
                            }}
                          >
                            <Plus size={12} />
                            <span>Creator Details</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
        </div>
      </form>
    </div>
  </div>
  );
}
