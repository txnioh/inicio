import { Suspense, type ReactNode } from 'react';
import FooterRobotMark from './components/FooterRobotMark';
import InkWritingLink from './components/InkWritingLink';
import LocalTime from './components/LocalTime';
import PageEnter from './components/PageEnter';
import ProjectShowcase from './components/ProjectShowcase';
import { VinylPlayer } from './components/VinylPlayer';
import usePageNavigation from './usePageNavigation';

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="minimal-basic-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function App() {
  const { path, Article, Carrete, RobotLab, arrived } = usePageNavigation();
  if (path === '/') return <Home arrived={arrived} />;
  if (path === '/carrete') return <Suspense fallback={<main className="minimal-portfolio-page" aria-label="Cargando Carrete" />}><Carrete /></Suspense>;
  if (path === '/writing/ink') return <Suspense fallback={<main className="minimal-portfolio-page"><div className="minimal-portfolio-shell" role="status">Loading article…</div></main>}><Article /></Suspense>;
  if (path === '/lab/robot') return <Suspense fallback={<main className="minimal-portfolio-page" aria-label="Cargando bot lab" />}><RobotLab /></Suspense>;
  return <main className="minimal-portfolio-page"><div className="minimal-portfolio-shell minimal-article">
    <header><h1>Page not found</h1></header><p>This page doesn’t exist. <a className="minimal-basic-link" href="/">Back to Index</a></p>
  </div></main>;
}

export function Home({ arrived }: { arrived: boolean }) {
  return (
    <main className="minimal-portfolio-page" tabIndex={-1}>
      <PageEnter className="minimal-portfolio-shell" skipAnimation={arrived}>
        <div className="minimal-homepage">
          <article className="minimal-article">
            <header>
              <h1 className="minimal-reveal-line">Antonio J. Gonzalez</h1>
            </header>

            <VinylPlayer />

            <div className="minimal-home-intro">
              <p className="minimal-reveal-line">
                I build software for the web, with a soft spot for thoughtful interfaces
                and small interactions.
              </p>

              <p className="minimal-reveal-line" data-robot-companies="">
                Previously, fullstack at{' '}
                <span className="minimal-inline-label minimal-company-label" tabIndex={0} data-robot-company="ntt-data"
                  data-robot-note="antonio trabajó aquí como ingeniero fullstack.">
                  <img className="minimal-ntt-logo" src="/logos/ntt-data-48.webp" width="16" height="16" alt="" />
                  ntt data
                </span> and{' '}
                <span className="minimal-inline-label minimal-company-label" tabIndex={0} data-robot-company="cemosa"
                  data-robot-note="another stop in antonio's fullstack journey.">
                  <img src="/logos/cemosa-48.webp" width="16" height="16" alt="" />
                  cemosa
                </span>.
              </p>

              <p className="minimal-reveal-line">
                Away from the screen, I take <a className="minimal-basic-link" href="/carrete">photographs</a>.
              </p>
              <nav className="minimal-contact-links minimal-reveal-line" aria-label="Contact">
                <a className="minimal-basic-link" href="mailto:txniodev@gmail.com">Email</a>
                <ExternalLink href="https://github.com/txnioh">GitHub</ExternalLink>
                <ExternalLink href="https://www.linkedin.com/in/txnio/">LinkedIn</ExternalLink>
              </nav>
            </div>
          </article>

          <section className="minimal-section" aria-labelledby="projects-title">
            <ProjectShowcase />
          </section>

          <section className="minimal-section" aria-labelledby="writing-title">
            <div className="minimal-project-list">
              <h3 id="writing-title" className="minimal-reveal-line">Writing</h3>
              <ul><li><ul><li>
                <InkWritingLink />
              </li></ul></li></ul>
            </div>
          </section>

          <footer className="minimal-footer">
            <div className="minimal-footer-row minimal-reveal-line">
              <p><LocalTime /> in Madrid, Spain</p>
              <FooterRobotMark />
            </div>
          </footer>
        </div>
      </PageEnter>
    </main>
  );
}
