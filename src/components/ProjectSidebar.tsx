import { type ProjectSummary } from '../lib/types';

type ProjectSidebarProps = {
  projects: ProjectSummary[];
  currentProjectId: string;
  onSelectProject: (projectId: string) => void;
  projectTaskStats: Record<string, { total: number; active: number }>;
  totalTaskCount: number;
  totalActiveTaskCount: number;
};

export function ProjectSidebar({
  projects,
  currentProjectId,
  onSelectProject,
  projectTaskStats,
  totalTaskCount,
  totalActiveTaskCount,
}: ProjectSidebarProps) {
  return (
    <aside className="panel sidebar app-nav">
      <div className="app-nav__brand">
        <div className="app-nav__brand-mark">AK</div>
        <div>
          <p className="eyebrow">Agent Workspace</p>
          <h2>Agent Kanban</h2>
          <p className="panel-copy">A bright command surface for repository-linked AI delivery.</p>
        </div>
      </div>

      <div className="app-nav__section">
        <span className="detail-label">Control Surface</span>
        <div className="metric-row metric-row--nav">
          <div className="metric-tile">
            <span className="metric-label">Linked repos</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="metric-tile">
            <span className="metric-label">Active tasks</span>
            <strong>{totalActiveTaskCount}</strong>
          </div>
        </div>
      </div>

      <div className="app-nav__section">
        <span className="detail-label">Navigate</span>
        <div className="app-nav__menu">
          <span className="app-nav__menu-item app-nav__menu-item--active">Board</span>
          <span className="app-nav__menu-item">Projects</span>
          <span className="app-nav__menu-item">Insights</span>
          <span className="app-nav__menu-item">Settings</span>
        </div>
      </div>

      <div className="app-nav__section app-nav__section--portfolio">
        <div className="panel-heading">
          <p className="eyebrow">Portfolio</p>
          <h2>Projects</h2>
          <p className="panel-copy">Linked repositories stay isolated during task execution and review.</p>
        </div>

        <div className="project-list">
        <button
          className={currentProjectId === 'all' ? 'project-pill project-pill--active' : 'project-pill'}
          onClick={() => onSelectProject('all')}
          type="button"
        >
          <span className="project-pill__title-row">
            <strong>All Projects</strong>
            <span className="branch-badge">Global</span>
          </span>
          <small className="project-pill__path">Cross-project queue and acceptance view</small>
          <span className="project-pill__meta">{totalTaskCount} tasks · {totalActiveTaskCount} active</span>
        </button>
        {projects.map((project) => (
          <button
            key={project.id}
            className={currentProjectId === project.id ? 'project-pill project-pill--active' : 'project-pill'}
            onClick={() => onSelectProject(project.id)}
            type="button"
          >
            <span className="project-pill__title-row">
              <strong>{project.name}</strong>
              <span className="branch-badge">{project.isLinked ? project.defaultBranch : 'Discover'}</span>
            </span>
            <small className="project-pill__path">{project.path}</small>
            <span className="project-pill__meta">
              {project.isLinked
                ? `${projectTaskStats[project.id]?.total ?? 0} tasks · ${projectTaskStats[project.id]?.active ?? 0} active`
                : 'Discovered repo · link to activate'}
            </span>
          </button>
        ))}
        {projects.length === 0 ? <p className="empty-state">Link a git repository to start dispatching work.</p> : null}
      </div>
      </div>
    </aside>
  );
}