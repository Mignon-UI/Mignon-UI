import { useEffect, useRef } from 'react';
import DarfLogo from './DarfLogo';
import { HeartHandshake, Users, ShieldCheck } from 'lucide-react';
import { APP_NAME } from '../../config';

export default function LandingView({ show }) {
  const gridRef = useRef(null);

  useEffect(() => {
    if (!show) return;

    let frameId = null;
    const handleMouseMove = (e) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const { innerWidth, innerHeight } = window;
        // Normalized coordinates relative to center (-0.5 to 0.5)
        const x = (e.clientX / innerWidth) - 0.5;
        const y = (e.clientY / innerHeight) - 0.5;
        const maxOffset = 18;
        if (gridRef.current) {
          gridRef.current.style.transform = `translate(${x * maxOffset}px, ${y * maxOffset}px)`;
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div className="landing-view" id="landing-view">
      {/* Interactive Parallax Grid Layer */}
      <div
        ref={gridRef}
        className="landing-bg-grid"
      />

      <div className="landing-deco" aria-hidden="true">
        <span className="deco-line"></span>
        <span className="deco-diamond">◆</span>
        <span className="deco-line"></span>
      </div>

      <div className="landing-hero">
        <DarfLogo size={72} style={{ marginBottom: '8px' }} />
        <p className="hero-eyebrow">Just you & the bots</p>
        <h1 className="hero-title">
          Welcome to<br />
          <em>{APP_NAME}</em>
        </h1>
        <p className="subtitle">A fully customizable AI roleplay experience.</p>
      </div>

      <div className="landing-deco" aria-hidden="true">
        <span className="deco-line"></span>
        <span className="deco-diamond">◆</span>
        <span className="deco-line"></span>
      </div>

      <div className="quickstart-grid">
        <div className="feature-card">
          <div className="card-icon-wrap magenta">
            <HeartHandshake size={20} />
          </div>
          <h3>Custom Characters</h3>
          <p>Craft and collect unique AI personalities. Define their traits, custom knowledge bases, and speaking styles exactly how you want them.</p>
        </div>
        <div className="feature-card">
          <div className="card-icon-wrap rose">
            <Users size={20} />
          </div>
          <h3>Multi-Bot Chats</h3>
          <p>Create group sandboxes with multiple characters. Watch creative dynamics unfold naturally or orchestrate the narrative flow yourself.</p>
        </div>
        <div className="feature-card">
          <div className="card-icon-wrap pink">
            <ShieldCheck size={20} />
          </div>
          <h3>Local-First Privacy</h3>
          <p>Every chat conversation, prompt template, and data index is stored strictly on your local disk. 100% offline-capable when using local engines (Ollama/LM Studio).</p>
        </div>
      </div>

      <div className="landing-footer">
        <p>Choose a character from the sidebar or start a new chat to begin your story</p>
      </div>
    </div>
  );
}
