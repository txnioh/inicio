import { useEffect, useRef, useState, type CSSProperties, type SyntheticEvent } from 'react';
import RobotHomeLink from '../components/RobotHomeLink';
import FooterRobotMark from '../components/FooterRobotMark';
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

function Contents({ activeId, inked, onNavigate }: { activeId: string | null; inked: boolean; onNavigate: (id: string) => void }) {
  const activeIndex = sections.findIndex(([id]) => id === activeId);
  return <div className="ink-contents-list">
    <span className="ink-section-robot" data-active={activeIndex >= 0}
      style={{ '--active-section': Math.max(0, activeIndex) } as CSSProperties} aria-hidden="true">
      <FooterRobotMark draggable={false} inked={inked} />
    </span>
    <ul>{sections.map(([id, title], index) => <li key={id}>
      <a href={`#${id}`} style={{ '--index-row': `index-row-${index}` } as CSSProperties}
        aria-current={activeId === id ? 'location' : undefined} onClick={() => onNavigate(id)}>{title}</a>
    </li>)}</ul>
  </div>;
}

export default function InkArticle() {
  const mobileContents = useRef<HTMLDetailsElement>(null);
  const [inked, setInked] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  function noticeInk(event: SyntheticEvent<HTMLElement>) {
    if (!inked && event.target instanceof Element && event.target.closest('.ink-demo button, .ink-demo input')) {
      setInked(true);
    }
  }

  useEffect(() => {
    const headings = sections.map(([id]) => document.getElementById(id)!);
    let frame = 0;
    const update = () => {
      frame = 0;
      const readingLine = Math.min(200, innerHeight * .25);
      const current = headings.filter(heading => heading.getBoundingClientRect().top <= readingLine).at(-1);
      const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      setActiveSection(atEnd ? 'credits' : current?.id ?? null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);
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
      <RobotHomeLink className="ink-index" inked={inked} />
      <nav className="page-index" aria-label="Article sections"><Contents activeId={activeSection} inked={inked} onNavigate={setActiveSection} /></nav>
    </aside>
    <div className="minimal-portfolio-shell ink-shell">
      <RobotHomeLink className="ink-mobile-index" inked={inked} />
      <article className="minimal-article ink-article" id="ink-article" onClick={noticeInk} onChange={noticeInk}>
        <header>
          <h1 className="ink-title">Making SVG feel like ink</h1>
          <time dateTime="2026-09-11">11 September, 2026</time>
        </header>
        <p>The coloured lines in <a href="https://www.anthropic.com/institute/econ-scenarios" target="_blank" rel="noreferrer">Anthropic’s economic scenarios</a> have a lovely unevenness. Some parts carry more ink. Little gaps let the paper through. As the fan opens, individual marks arrive at slightly different times.</p>
        <p>I pulled the drawing into a standalone demo, then broke it into smaller examples. Here’s the result, followed by the pieces you can take apart.</p>
        <FanDemo />
        <p>The drawings on this page use SVG. Their outlines come from JavaScript, and a filter gives the colour its grain. The examples use synthetic curves; the original article is where the economic model lives. I’ve kept its drawing approach and simplified the scenes so each control has something specific to explain.</p>

        <details className="ink-mobile-contents" ref={mobileContents}>
          <summary>In this article <span aria-hidden="true">+</span></summary>
          <nav aria-label="Article sections on mobile"><Contents activeId={activeSection} inked={inked} onNavigate={id => {
            setActiveSection(id);
            if (mobileContents.current) mobileContents.current.open = false;
          }} /></nav>
        </details>

        <section id="shape">
          <h2>Start with a shape</h2>
          <p>A regular SVG stroke has one width along its path. A marker leaves a broader middle, uneven edges, and a small change in shape where you lift the pen. Drawing that perimeter gives us control over all of those details.</p>
          <p>Start with points along a curve. At each point, look at its neighbours to find the direction of travel. Turn that direction a quarter turn to get a normal: a line pointing across the stroke. Move a little way along it for one edge, and the opposite way for the other.</p>
          <ShapeDemo />
          <p>Join the left edge forwards and the right edge backwards, then close the shape. The result is a filled path. Width becomes a value we can change at each point. Simulated pressure widens the middle and tapers the ends, while separate noise values add independent irregularity to the edges.</p>
          <p>The points are spaced by distance along the curve before this calculation. That keeps a crowded group of input points from packing all the roughness into one corner. For these gently curving marks, a modest number of samples is enough. Tight turns need more care: a very wide outline can fold over itself.</p>
        </section>

        <section id="wobble">
          <h2>Keep the wobble still</h2>
          <p>Randomness gives a stroke some variation, but it also needs a memory. If every render chooses new random values, the edges move whenever anything else on the page updates. A line that has already been drawn should stay put.</p>
          <p>Each stroke gets a seed. The generator produces the same sequence from that seed, and neighbouring values blend smoothly into each other. The irregularity runs along the line’s length. It has no clock.</p>
          <WobbleDemo />
          <p>Move the slider, then bring it back to 35%. The old edge returns. <strong>New stroke</strong> changes the seed, giving the next mark a different shape. This example has its texture filter switched off so you can see exactly what the geometry contributes.</p>
          <p>The width and the two edges use different sequences derived from the same seed. If both sides followed identical noise, the line would look much more regular. Keep the variation small enough that you can still read the underlying curve; the far end of the slider is there to make the tradeoff obvious.</p>
        </section>

        <section id="texture">
          <h2>Leave some paper showing</h2>
          <p>Even an irregular silhouette can look like a flat sticker. The little pale interruptions inside a real mark help it feel attached to the paper. SVG filters can make that texture without loading an image.</p>
          <TextureDemo />
          <p>A turbulence filter generates a noise field. Its brightness becomes a transparency map, which removes some ink from parts of the mark. The paper becomes visible through those areas.</p>
          <p>The full filter adds another, coarser noise field and uses a displacement map to shift the ink slightly. Look at the outer edge when switching between Grain and Grain + warp. Both views keep the exact same path underneath.</p>
          <p>The source includes lighter filters that omit this displacement, too. That is a useful option for a dense scene. Filters work on rendered pixels, so a large filtered area costs more than a small swatch. I would start by checking the effect at its actual display size before adding more noise or stronger distortion.</p>
        </section>

        <section id="layers">
          <h2>Go over it again</h2>
          <p>A broad patch of colour can be built from several narrower passes. Leave a little variation in their starting points and let the edges overlap. You can see the direction the imaginary hand travelled.</p>
          <LayersDemo />
          <p>Multiply makes the overlap darker. For opaque colours it multiplies their colour channels; with translucent ink, the browser also accounts for alpha. The result depends on what is already underneath. Turn Multiply off and the crossing becomes less pronounced even though the passes have exactly the same shape.</p>
          <p>Each pass needs its own blending group. Putting all the passes in one group and multiplying that finished group against the paper changes a different relationship. Here they blend against each other inside an isolated group, keeping the effect local to the drawing.</p>
          <p>The stroke generator also has a small darker core for thicker lines. I’ve disabled it in this example to keep the comparison about overlapping passes. Layering can get muddy quickly; four passes already give this little rectangle quite a lot of ink.</p>
        </section>

        <section id="reveal">
          <h2>Let it arrive</h2>
          <p>Once the shape and texture are in place, the animation has surprisingly little drawing to do. The standalone demo uses two approaches: a moving crop for its small filled shapes, and progressively added pieces for the fan.</p>
          <RevealDemo />
          <p>The upper line uses a moving crop. Its right inset shrinks from 100% to zero, exposing the drawing from left to right. That works well for these horizontal examples. A curve that doubles back would expose several parts at once; following that path needs a different reveal.</p>
          <p>The lower line consists of short, complete marks. Each gets a threshold along the animation timeline. Each lane has a repeatable delay and duration, so a group of lines can start together without marching in perfect lockstep.</p>
          <p>Anthropic’s fan appends pieces as it advances, with variation around the leading edge. These teaching demos build the pieces first and change their visibility, which also lets the progress slider run backwards. The frame loop never regenerates the outlines. With reduced motion enabled, the completed drawing appears immediately.</p>
        </section>

        <section id="use">
          <h2>Use it somewhere</h2>
          <p>A small graph is a good place to try this. Give the generator a handful of points, choose a width and a seed, and put the returned paths inside a filtered group. Change the colour below to see how the same drawing feels with a different pen.</p>
          <ExampleDemo />
          <p>Use a unique filter ID for every instance. Otherwise two examples on the same page can quietly use each other’s filter. The fixed viewBox lets this graph resize with its container. For a live chart, keep the seed attached to the series and rebuild the geometry when its data changes.</p>
          <p>I like this at the size of a margin note or a small illustration. Keep labels crisp, give the paper room, and let a few marks do the work. My browser tabs have supplied enough growth for one chart.</p>
        </section>

        <section className="ink-notes" id="credits">
          <h2>Notes &amp; credits</h2>
          <p>The drawing approach comes from <a href="https://www.anthropic.com/institute/econ-scenarios" target="_blank" rel="noreferrer">Anthropic’s Scenarios for our Economic Future</a>. Its credits name Kelsey Nanan for design and implementation of the interactive experience, with visual design and art direction by Nikki Makagiansar and Monika Tuchowska. Kyle Turman and Szymon Sacher built the scenario explorer; Fayaz Ashraf and Ryan Heller contributed engineering.</p>
          <p>This adaptation uses my standalone extraction as its starting point. The geometry, ink layers, filters and fan timing were checked against the public page code on 11 September 2026. The simplified fan, controls and illustrative chart here are for exploring the drawing technique.</p>
          <p>The format owes a lot to Benji Taylor’s <a href="https://benji.org/drawesome" target="_blank" rel="noreferrer">Drawesome</a>, <a href="https://benji.org/morphing-icons-with-claude" target="_blank" rel="noreferrer">morphing icons</a> and <a href="https://benji.org/liveline" target="_blank" rel="noreferrer">Liveline</a> posts: something to try, followed by enough explanation to make use of it.</p>
        </section>
        <footer className="ink-article-footer"><RobotHomeLink inked={inked} /><span>Antonio J. Gonzalez</span></footer>
      </article>
    </div>
  </main>;
}
