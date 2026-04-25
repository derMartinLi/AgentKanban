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
    <aside className="sidebar-rail">
      <div className="sidebar-brand">
        <div className="sidebar-brand__mark">AK</div>
        <div className="sidebar-brand__copy">
          <p className="eyebrow">Agent Workspace</p>
          <h2>Agent Kanban</h2>
          <p className="panel-copy">
            Repository-linked delivery, operator visibility, and AI-assisted workflow control.
          </p>
        </div>
      </div>

      <div className="sidebar-section">
        <span className="detail-label">Control Surface</span>
        <div className="sidebar-metrics">
          <div className="sidebar-metric">
            <span className="metric-label">Linked repos</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="sidebar-metric">
            <span className="metric-label">Active tasks</span>
            <strong>{totalActiveTaskCount}</strong>
          </div>
          <div className="sidebar-metric">
            <span className="metric-label">Tracked items</span>
            <strong>{totalTaskCount}</strong>
          </div>
        </div>
      </div>

      <div className="sidebar-section">
        <span className="detail-label">Navigate</span>
        <div className="nav-menu">
          <span className="nav-menu__item nav-menu__item--active">Board</span>
          <span className="nav-menu__item">Dispatch</span>
          <span className="nav-menu__item">Insights</span>
          <span className="nav-menu__item">Settings</span>
        </div>
      </div>

      <div className="sidebar-section sidebar-section--projects">
        <div className="section-heading">
          <p className="eyebrow">Portfolio</p>
          <h2>Projects</h2>
          <p className="panel-copy">Switch between linked repositories or stay in the global command view.</p>
        </div>

        <div className="project-list">
          <button
            className={currentProjectId === 'all' ? 'project-switcher project-switcher--active' : 'project-switcher'}
            onClick={() => onSelectProject('all')}
            type="button"
          >
            <span className="project-switcher__head">
              <strong>All Projects</strong>
              <span className="branch-badge">Global</span>
            </span>
            <small className="project-switcher__path">Cross-project queue and acceptance view</small>
            <span className="project-switcher__meta">{totalTaskCount} tasks · {totalActiveTaskCount} active</span>
          </button>

          {projects.map((project) => (
            <button
              key={project.id}
              className={currentProjectId === project.id ? 'project-switcher project-switcher--active' : 'project-switcher'}
              onClick={() => onSelectProject(project.id)}
              type="button"
            >
              <span className="project-switcher__head">
                <strong>{project.name}</strong>
                <span className="branch-badge">{project.isLinked ? project.defaultBranch : 'Discover'}</span>
              </span>
              <small className="project-switcher__path">{project.path}</small>
              <span className="project-switcher__meta">
                {project.isLinked
                  ? `${projectTaskStats[project.id]?.total ?? 0} tasks · ${projectTaskStats[project.id]?.active ?? 0} active`
                  : 'Discovered repo · link to activate'}
              </span>
            </button>
          ))}

          {projects.length === 0 ? <p className="empty-state">Link a git repository to start dispatching work.</p> : null}
        </div>
      </div>

      <div className="sidebar-foot">
        <span className="detail-label">Global Project View</span>
        <p>
          {projects.length === 0
            ? 'No repositories linked yet. Use the dispatch studio to onboard your first workspace.'
            : `${projects.length} repositories discovered, with ${totalActiveTaskCount} active tasks moving through the board.`}
        </p>
      </div>
    </aside>
  );
}
