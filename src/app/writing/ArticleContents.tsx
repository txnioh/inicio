import { useEffect, useState, type CSSProperties } from 'react';
import FooterRobotMark from '../components/FooterRobotMark';

export type Sections = readonly (readonly [id: string, title: string])[];

/** An article's sections, with the robot beside the one being read. */
export function Contents({ sections, activeId, onNavigate }: { sections: Sections; activeId: string | null; onNavigate: (id: string) => void }) {
  const activeIndex = sections.findIndex(([id]) => id === activeId);
  return <div className="ink-contents-list">
    <span className="ink-section-robot" data-active={activeIndex >= 0}
      style={{ '--active-section': Math.max(0, activeIndex) } as CSSProperties} aria-hidden="true">
      <FooterRobotMark draggable={false} />
    </span>
    <ul>{sections.map(([id, title], index) => <li key={id}>
      <a href={`#${id}`} style={{ '--index-row': `index-row-${index}` } as CSSProperties}
        aria-current={activeId === id ? 'location' : undefined} onClick={() => onNavigate(id)}>{title}</a>
    </li>)}</ul>
  </div>;
}

/** The section being read: the last heading above the reading line, or the last one at the end. */
export function useActiveSection(sections: Sections) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const headings = sections.map(([id]) => document.getElementById(id)!);
    let frame = 0;
    const update = () => {
      frame = 0;
      const readingLine = Math.min(200, innerHeight * .25);
      const current = headings.filter(heading => heading.getBoundingClientRect().top <= readingLine).at(-1);
      const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      setActive(atEnd ? sections.at(-1)![0] : current?.id ?? null);
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
  }, [sections]);
  return [active, setActive] as const;
}
