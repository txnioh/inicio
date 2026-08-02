import { projects } from '../projects';

export default function ProjectShowcase() {
  return (
    <section className="minimal-project-list">
      <h3 id="projects-title" className="minimal-reveal-line">Projects</h3>
      <ul>
        <li>
          <ul>
            {projects.map((project) => (
              <li key={project.title}>
                <a
                  className="minimal-row-link minimal-reveal-line"
                  href={project.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <h2>{project.title}</h2>
                  <span className="minimal-row-meta" aria-label={`${project.group} project`}>
                    <span>{project.group}</span>
                    <span aria-hidden="true">/</span>
                    <span>View</span>
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
