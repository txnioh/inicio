import { useEffect, useRef } from 'react';
import RobotHomeLink from '../components/RobotHomeLink';
import { Contents, useActiveSection } from './ArticleContents';
import NowPlaying from '../components/NowPlaying';
import { ExampleDemo, FanDemo, LayersDemo, RevealDemo, ShapeDemo, TextureDemo, WobbleDemo } from './InkDemos';
import './writing.css';

const sections = [
  ['shape', 'Start with a shape'],
  ['wobble', 'Keep the wobble still'],
  ['texture', 'Leave some paper showing'],
  ['layers', 'Go over it again'],
  ['reveal', 'Let it arrive'],
  ['use', 'Use it somewhere'],
  ['credits', 'Notes & credits'],
] as const;

export default function InkArticle() {
  const mobileContents = useRef<HTMLDetailsElement>(null);
  const [activeSection, setActiveSection] = useActiveSection(sections);
  useEffect(() => {
    document.title = 'Making SVG feel like ink · Antonio J. Gonzalez';
    const description = document.querySelector('meta[name="description"]');
    const previous = description?.getAttribute('content') ?? '';
    description?.setAttribute('content', 'Taking apart the hand-drawn ink effect in Anthropic’s economic scenarios. Interactive SVG experiments with shape, grain and motion.');
    // The article is loaded asynchronously, so a direct hash needs resolving after mount.
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView();
    return () => { document.title = 'Antonio J. Gonzalez'; description?.setAttribute('content', previous); };
  }, []);

  return <main className="minimal-portfolio-page ink-page" tabIndex={-1}>
    <a className="ink-skip" href="#ink-article">Skip to article</a>
    <aside className="ink-sidebar">
      <RobotHomeLink className="ink-index" />
      <nav className="page-index" aria-label="Article sections"><Contents sections={sections} activeId={activeSection} onNavigate={setActiveSection} /></nav>
    </aside>
    <div className="minimal-portfolio-shell ink-shell">
      <RobotHomeLink className="ink-mobile-index" />
      <article className="minimal-article ink-article" id="ink-article">
        <header>
          <h1 className="ink-title">Making SVG feel like ink</h1>
          <time dateTime="2026-09-11">11 September, 2026</time>
        </header>
        <p>Uneven edges, grain and overlapping colour make SVG feel like ink. These interactive examples break down the drawing approach in <a href="https://www.anthropic.com/institute/econ-scenarios" target="_blank" rel="noreferrer">Anthropic’s economic scenarios</a>.</p>
        <FanDemo />

        <details className="ink-mobile-contents" ref={mobileContents}>
          <summary>In this article <span aria-hidden="true">+</span></summary>
          <nav aria-label="Article sections on mobile"><Contents sections={sections} activeId={activeSection} onNavigate={id => {
            setActiveSection(id);
            if (mobileContents.current) mobileContents.current.open = false;
          }} /></nav>
        </details>

        <section id="shape">
          <h2>Start with a shape</h2>
          <p>Build a filled shape around the curve. Moving its two edges independently gives the mark uneven sides, a wider middle and tapered ends.</p>
          <ShapeDemo />
        </section>

        <section id="wobble">
          <h2>Keep the wobble still</h2>
          <p>A fixed seed keeps the irregular edges in place across renders. <strong>New stroke</strong> changes that seed to draw a different mark. Keep the variation small enough to preserve the curve.</p>
          <WobbleDemo />
        </section>

        <section id="texture">
          <h2>Leave some paper showing</h2>
          <p>An SVG noise filter makes parts of the ink transparent, letting the paper show through. Displacement adds a slight warp to the edges; grain alone is a lighter option.</p>
          <TextureDemo />
        </section>

        <section id="layers">
          <h2>Go over it again</h2>
          <p>Build colour with overlapping passes. <strong>Multiply</strong> makes their overlap darker—blue and yellow meet in a deeper green. Apply it to each pass inside an isolated group so the ink only mixes with itself.</p>
          <LayersDemo />
        </section>

        <section id="reveal">
          <h2>Let it arrive</h2>
          <p>Build the shapes once, then reveal them with a moving crop or timed segments. Small timing differences keep the fan’s lines from moving in lockstep. With reduced motion enabled, show the finished drawing immediately.</p>
          <RevealDemo />
        </section>

        <section id="use">
          <h2>Use it somewhere</h2>
          <p>Try it on a small graph or annotation. Keep labels crisp and the texture subtle so the data stays readable. For a live chart, keep the seed attached to the series as its data changes.</p>
          <ExampleDemo />
        </section>

        <section className="ink-notes" id="credits">
          <h2>Notes &amp; credits</h2>
          <p>Adapted from <a href="https://www.anthropic.com/institute/econ-scenarios" target="_blank" rel="noreferrer">Anthropic’s Scenarios for our Economic Future</a>. Interactive experience by Kelsey Nanan; visual design and art direction by Nikki Makagiansar and Monika Tuchowska. These demos use synthetic data and simplified scenes.</p>
        </section>
        <footer className="ink-article-footer"><RobotHomeLink /><span>Antonio J. Gonzalez</span></footer>
      </article>
    </div>
    <NowPlaying />
  </main>;
}
