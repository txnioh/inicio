import { Suspense, type ReactNode } from 'react';
import FooterRobotMark from './components/FooterRobotMark';
import InkWritingLink from './components/InkWritingLink';
import LocalTime from './components/LocalTime';
import PageEnter from './components/PageEnter';
import ProjectShowcase from './components/ProjectShowcase';
import { VinylPlayer } from './components/VinylPlayer';
import usePageNavigation from './usePageNavigation';

function formatUpdatedAt(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="minimal-basic-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function App() {
  const { path, Article, arrived } = usePageNavigation();
  if (path === '/') return <Home arrived={arrived} />;
  if (path === '/writing/ink') return <Suspense fallback={<main className="minimal-portfolio-page"><div className="minimal-portfolio-shell" role="status">Loading article…</div></main>}><Article /></Suspense>;
  return <main className="minimal-portfolio-page"><div className="minimal-portfolio-shell minimal-article">
    <header><h1>Page not found</h1></header><p>This page doesn’t exist. <a className="minimal-basic-link" href="/">Back to Index</a></p>
  </div></main>;
}

function Home({ arrived }: { arrived: boolean }) {
  const latestCommit = {
    ...__BUILD_INFO__,
    date: new Date(__BUILD_INFO__.date),
  };

  return (
    <main className="minimal-portfolio-page" tabIndex={-1}>
      <PageEnter className="minimal-portfolio-shell" skipAnimation={arrived}>
        <div className="minimal-homepage">
          <article className="minimal-article">
            <header>
              <h1 className="minimal-reveal-line">Antonio J. Gonzalez</h1>
              <time className="minimal-reveal-line" dateTime={latestCommit.date.toISOString()}>
                Updated {formatUpdatedAt(latestCommit.date)} · {latestCommit.hash}{' '}
                {latestCommit.message}
              </time>
            </header>

            <VinylPlayer />

            <p className="minimal-reveal-line">
              I&apos;m Antonio, also known as txnio. I build things for the web and use browser
              windows as a place for interface experiments.
            </p>

            <p className="minimal-reveal-line">
              I make practical software, automation, and visual interface experiments with
              TypeScript, React, Next.js, Python, .NET, and AI.
            </p>

            <p className="minimal-reveal-line">
              You can find me on <ExternalLink href="https://www.linkedin.com/in/txnio/">LinkedIn</ExternalLink>,{' '}
              <ExternalLink href="https://github.com/txnioh">GitHub</ExternalLink>, try{' '}
              <ExternalLink href="https://os.txnio.com">txniOS</ExternalLink>, or reach me via{' '}
              <a className="minimal-basic-link" href="mailto:txniodev@gmail.com">email</a>.
            </p>
          </article>

          <section className="minimal-section" aria-labelledby="writing-title">
            <div className="minimal-project-list">
              <h3 id="writing-title" className="minimal-reveal-line">Writing</h3>
              <ul><li><ul><li>
                <InkWritingLink />
              </li></ul></li></ul>
            </div>
          </section>

          <section className="minimal-section" aria-labelledby="projects-title">
            <ProjectShowcase />
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
