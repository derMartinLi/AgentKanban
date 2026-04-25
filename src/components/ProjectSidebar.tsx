import { type ProjectSummary } from '../lib/types';

type ProjectSidebarProps = {
  projects: ProjectSummary[];
  currentProjectId: string;
  onSelectProject: (projectId: string) => void;
};

export function ProjectSidebar({ projects, currentProjectId, onSelectProject }: ProjectSidebarProps) {
  return (
    <aside className="panel sidebar">
      <div className="panel-heading">
        <p className="eyebrow">Portfolio</p>
        <h2>Projects</h2>
      </div>

      <div className="project-list">
        <button
          className={currentProjectId === 'all' ? 'project-pill project-pill--active' : 'project-pill'}
          onClick={() => onSelectProject('all')}
          type="button"
        >
          All Projects
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            className={currentProjectId === project.id ? 'project-pill project-pill--active' : 'project-pill'}
            onClick={() => onSelectProject(project.id)}
            type="button"
          >
            <span>{project.name}</span>
            <small>{project.defaultBranch}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}