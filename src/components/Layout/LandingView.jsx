import { useEffect, useRef } from 'react';
import Logo from '../UI/Logo';
import { HeartHandshake, Users, ShieldCheck } from 'lucide-react';
import { APP_NAME } from '../../config';

const LandingDeco = () => (
  <div className="landing-deco" aria-hidden="true">
    <span className="deco-line"></span>
    <span className="deco-diamond">◆</span>
    <span className="deco-line"></span>
  </div>
);

const FEATURES = [
  { title: 'Custom Characters', iconClass: 'magenta', icon: <HeartHandshake size={20} />, text: 'Craft and collect unique AI personalities. Define their traits, custom knowledge bases, and speaking styles exactly how you want them.' },
  { title: 'Multi-Bot Chats', iconClass: 'rose', icon: <Users size={20} />, text: 'Create group sandboxes with multiple characters. Watch creative dynamics unfold naturally or orchestrate the narrative flow yourself.' },
  { title: 'Local-First Privacy', iconClass: 'pink', icon: <ShieldCheck size={20} />, text: 'Every chat conversation, prompt template, and data index is stored strictly on your local disk. 100% offline-capable when using local engines (Ollama/LM Studio).' }
];

export default function LandingView({ show }) {
  const gridRef = useRef(null);

  useEffect(() => {
    if (!show) return;

    let frameId = null;
    const handleMouseMove = (e) => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const { innerWidth, innerHeight } = window;
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
      <div ref={gridRef} className="landing-bg-grid" />
      <LandingDeco />

      <div className="landing-hero">
        <Logo size={72} style={{ marginBottom: '8px' }} />
        <p className="hero-eyebrow">Just you & the bots</p>
        <h1 className="hero-title">
          Welcome to<br />
          <em>{APP_NAME}</em>
        </h1>
        <p className="subtitle">A fully customizable AI roleplay experience.</p>
      </div>

      <LandingDeco />

      <div className="quickstart-grid">
        {FEATURES.map((f, idx) => (
          <div key={idx} className="feature-card">
            <div className={`card-icon-wrap ${f.iconClass}`}>
              {f.icon}
            </div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </div>
        ))}
      </div>

      <div className="landing-footer">
        <p>Choose a character from the sidebar or start a new chat to begin your story</p>
      </div>
    </div>
  );
}
