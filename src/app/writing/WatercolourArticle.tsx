import { useEffect, useRef } from 'react';
import RobotHomeLink from '../components/RobotHomeLink';
import NowPlaying from '../components/NowPlaying';
import { Contents, useActiveSection } from './ArticleContents';
import { CompareDemo, DepthDemo, DirectionDemo, MixDemo, OrderDemo, ShapesDemo, WashDemo } from './WatercolourDemos';
import './writing.css';

const sections = [
  ['layers', 'A wash is thin layers'],
  ['mix', 'Colour mixes like paint'],
  ['shapes', 'Find the shapes'],
  ['depth', 'Far is pale'],
  ['order', 'Paint far to near'],
  ['oil', 'Or let the brush show'],
  ['credits', 'Notes & credits'],
] as const;

export default function WatercolourArticle() {
  const mobileContents = useRef<HTMLDetailsElement>(null);
  const [activeSection, setActiveSection] = useActiveSection(sections);
  useEffect(() => {
    document.title = 'Painting a photo in watercolour · Antonio J. Gonzalez';
    const description = document.querySelector('meta[name="description"]');
    const previous = description?.getAttribute('content') ?? '';
    description?.setAttribute('content', 'How Acuarela paints a photo in watercolour: thin layers, pigment mixing, colour shapes and depth, with interactive examples.');
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    return () => { document.title = 'Antonio J. Gonzalez'; description?.setAttribute('content', previous); };
  }, []);

  return <main className="minimal-portfolio-page ink-page" tabIndex={-1}>
    <a className="ink-skip" href="#watercolour-article">Skip to article</a>
    <aside className="ink-sidebar">
      <RobotHomeLink className="ink-index" />
      <nav className="page-index" aria-label="Article sections"><Contents sections={sections} activeId={activeSection} onNavigate={setActiveSection} /></nav>
    </aside>
    <div className="minimal-portfolio-shell ink-shell">
      <RobotHomeLink className="ink-mobile-index" />
      <article className="minimal-article ink-article" id="watercolour-article">
        <header>
          <h1 className="ink-title">Painting a photo in watercolour</h1>
          <time dateTime="2026-09-28">28 September, 2026</time>
        </header>
        <p><a href="/acuarela">Acuarela</a> paints a photo in watercolour, on your phone. Nothing redraws it: it measures only colour and distance, and paints from those. These examples take it apart.</p>
        <CompareDemo />

        <details className="ink-mobile-contents" ref={mobileContents}>
          <summary>In this article <span aria-hidden="true">+</span></summary>
          <nav aria-label="Article sections on mobile"><Contents sections={sections} activeId={activeSection} onNavigate={id => {
            setActiveSection(id);
            if (mobileContents.current) mobileContents.current.open = false;
          }} /></nav>
        </details>

        <section id="layers">
          <h2>A wash is thin layers</h2>
          <p>One flat shape looks printed. Deform its edge, then stack dozens of almost clear copies, each deformed a little differently: the middle builds up, the edge stays soft. Soft gaps in each layer let the paper through. Try <strong>one layer</strong>.</p>
          <WashDemo />
        </section>

        <section id="mix">
          <h2>Colour mixes like paint</h2>
          <p>Light adds up, so blue and yellow make white. Pigment absorbs, so a blue glaze over yellow leaves green. Every wash mixes with what is under it the second way, so thin glazes build colour instead of covering it. Drag the blue wash.</p>
          <MixDemo />
        </section>

        <section id="shapes">
          <h2>Find the shapes</h2>
          <p>A painter doesn’t copy pixels; they see a few areas of colour. The photo’s texture is smoothed away, its edges kept, and similar colours grouped. Fewer colours, looser painting.</p>
          <ShapesDemo />
        </section>

        <section id="depth">
          <h2>Far is pale</h2>
          <p>A small model on the device measures how near each part is. It names nothing. Distance keeps same-coloured things apart when one is behind the other, and fades the far ones into the paper, the way air does.</p>
          <DepthDemo />
        </section>

        <section id="order">
          <h2>Paint far to near</h2>
          <p>Then it paints like a watercolourist: farthest shapes first, each a light wash with its darker tones glazed over, and small dark accents last. This is the real painter, on the photo above.</p>
          <OrderDemo />
        </section>

        <section id="oil">
          <h2>Or let the brush show</h2>
          <p>The oil sketch swaps washes for brush strokes. Each one runs along the edges in the photo; where the photo is flat, like sky, it lies at one calm angle. Broad strokes block everything in, smaller ones go back only where there is detail.</p>
          <DirectionDemo />
        </section>

        <section className="ink-notes" id="credits">
          <h2>Notes &amp; credits</h2>
          <p>Washes follow Tyler Hobbs’ <a href="https://tylerxhobbs.com/essays/2017/a-generative-approach-to-simulating-watercolor-paints" target="_blank" rel="noreferrer">generative approach to watercolour</a>, as built into <a href="https://github.com/acamposuribe/p5.brush" target="_blank" rel="noreferrer">p5.brush</a> by Alejandro Campos, which mixes colour with spectral.js’s Kubelka–Munk model. Depth comes from Depth Anything V2, run in the browser with transformers.js. The oil sketch follows Aaron Hertzmann’s painterly rendering with curved brush strokes. Inspired by the watercolour scenes of Aluan Wang.</p>
        </section>
        <footer className="ink-article-footer"><RobotHomeLink /><span>Antonio J. Gonzalez</span></footer>
      </article>
    </div>
    <NowPlaying />
  </main>;
}
