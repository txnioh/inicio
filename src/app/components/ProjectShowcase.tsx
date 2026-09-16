import { useState, type CSSProperties } from 'react';
import { projects } from '../projects';

export default function ProjectShowcase() {
  const [filter, setFilter] = useState('all');
  return (
    <section className="minimal-project-list page-index">
      <div className="project-list-heading minimal-reveal-line">
        <h3 id="projects-title">Projects</h3>
        <div className="project-filters" role="group" aria-label="Filter projects">
          {['all', 'apps', 'lab'].map(group => <button key={group} type="button"
            aria-pressed={filter === group} onClick={() => setFilter(group)}>
            {group === 'all' ? 'All' : group === 'apps' ? 'Apps' : 'Lab'}
          </button>)}
        </div>
      </div>
      <ul>
        <li>
          <ul>
            {projects.filter(project => filter === 'all' || project.group === filter).map((project) => (
              <li key={project.title}>
                <a
                  className="minimal-row-link minimal-reveal-line"
                  style={{ '--index-row': `index-row-${project.title.toLowerCase().replace(/[^a-z]/g, '')}` } as CSSProperties}
                  href={project.href}
                  target={project.href.startsWith('/') ? undefined : '_blank'}
                  rel="noopener noreferrer"
                >
                  <div className="project-name"><h2 className={project.href === '/carrete' ? 'carrete-title' : undefined}>{project.title}</h2>
                    {project.href === '/carrete' && <span className="project-wip">Work in progress<svg viewBox="0 0 110 9" aria-hidden="true"><path d="M2 6Q38 0 108 4M12 8Q57 3 98 6" /></svg></span>}
                  </div>
                  <span className="minimal-row-meta" aria-label={`${project.group} project, ${project.date}`}>
                    <span>{project.group}</span>
                    <span aria-hidden="true">/</span>
                    <span>{project.date}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </li>
      </ul>
    </section>
  );
}
