import { useEffect, useState } from 'react';
import SceneCard, { type Style } from './SceneCard';
import { SCENES } from './scenes';
import './critters.css';

const KEY = 'critters-style';

function savedStyle(): Style {
  try { return localStorage.getItem(KEY) === 'pixel' ? 'pixel' : 'text'; } catch { return 'text'; }
}

export default function Critters() {
  const [style, setStyle] = useState<Style>(savedStyle);

  useEffect(() => {
    const title = document.title;
    document.title = 'Critters';
    return () => { document.title = title; };
  }, []);

  const choose = (next: Style) => {
    setStyle(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  };

  return (
    <main className="minimal-portfolio-page critters-page">
      <div className="minimal-portfolio-shell critters-shell">
        <header className="critters-header">
          <a className="minimal-basic-link" href="/">Index</a>
          <h1>Critters</h1>
          <p>
            After the text-drawn cast of{' '}
            <a className="minimal-basic-link" href="https://studiodumbar.com/work/openai-devday-2025" target="_blank" rel="noopener noreferrer">OpenAI DevDay 2025</a>.
          </p>
        </header>

        <div className="cr-switch" role="radiogroup" aria-label="Style">
          {(['text', 'pixel'] as const).map(s => (
            <button key={s} type="button" role="radio" aria-checked={style === s} onClick={() => choose(s)}>
              {s === 'text' ? 'Text' : 'Pixel'}
            </button>
          ))}
        </div>

        <div className="cr-scenes">
          {SCENES.map(scene => <SceneCard key={scene.key} scene={scene} style={style} />)}
        </div>
      </div>
    </main>
  );
}
