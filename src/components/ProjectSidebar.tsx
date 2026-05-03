import { Badge, Switch, Tooltip } from 'antd';
import {
  FolderGit2,
  HelpCircle,
  MoonStar,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
  SunMedium,
} from 'lucide-react';
import type { ThemeMode } from '../store/useAppStore';
import type { ProjectSummary } from '../lib/types';

type ProjectSidebarProps = {
  projects: ProjectSummary[];
  currentProjectId: string;
  onSelectProject: (projectId: string) => void;
  onOpenOnboarding: () => void;
  onOpenSettings: () => void;
  onToggleCollapsed: () => void;
  projectTaskStats: Record<string, { total: number; active: number }>;
  totalTaskCount: number;
  totalActiveTaskCount: number;
  promptCount: number;
  theme: ThemeMode;
  onToggleTheme: () => void;
  collapsed: boolean;
};

function getProjectInitial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'A';
}

export function ProjectSidebar({
  projects,
  currentProjectId,
  onSelectProject,
  onOpenOnboarding,
  onOpenSettings,
  onToggleCollapsed,
  projectTaskStats,
  totalTaskCount,
  totalActiveTaskCount,
  promptCount,
  theme,
  onToggleTheme,
  collapsed,
}: ProjectSidebarProps) {
  return (
    <aside className={collapsed ? 'project-sidebar project-sidebar--collapsed' : 'project-sidebar'}>
      <div className="project-sidebar__top">
        <div className="project-sidebar__brand">
          <div className="project-sidebar__logo">AI</div>
          {!collapsed ? (
            <div>
              <strong>AI Task</strong>
              <p>Developer control center</p>
            </div>
          ) : null}
        </div>

        <div className="project-sidebar__toolbar">
          <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            <button className="icon-button" onClick={onToggleCollapsed} type="button">
              {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            </button>
          </Tooltip>
          <Tooltip title="Link repository">
            <button className="icon-button icon-button--primary" onClick={onOpenOnboarding} type="button">
              <Plus size={16} />
            </button>
          </Tooltip>
        </div>
      </div>

      {!collapsed ? (
        <div className="project-sidebar__summary">
          <div>
            <span>Running</span>
            <strong>{totalActiveTaskCount}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{totalTaskCount}</strong>
          </div>
          <div>
            <span>Waiting</span>
            <strong>{promptCount}</strong>
          </div>
        </div>
      ) : null}

      <div className="project-sidebar__section">
        {!collapsed ? <span className="project-sidebar__label">Projects</span> : null}

        <button
          className={currentProjectId === 'all' ? 'project-pill project-pill--active' : 'project-pill'}
          onClick={() => onSelectProject('all')}
          type="button"
        >
          <div className="project-pill__avatar project-pill__avatar--all">
            <FolderGit2 size={14} />
          </div>
          {!collapsed ? (
            <div className="project-pill__body">
              <strong>All Projects</strong>
              <span>{totalTaskCount} tasks · {totalActiveTaskCount} running</span>
            </div>
          ) : null}
        </button>

        <div className="project-sidebar__list">
          {projects.map((project) => {
            const stats = projectTaskStats[project.id] ?? { total: 0, active: 0 };

            return (
              <button
                key={project.id}
                className={currentProjectId === project.id ? 'project-pill project-pill--active' : 'project-pill'}
                onClick={() => onSelectProject(project.id)}
                type="button"
              >
                <div className="project-pill__avatar">
                  <Badge dot={stats.active > 0} offset={[-1, 18]} color={project.isLinked ? '#51CF66' : '#FCC419'}>
                    <span>{getProjectInitial(project.name)}</span>
                  </Badge>
                </div>
                {!collapsed ? (
                  <div className="project-pill__body">
                    <strong title={project.name}>{project.name}</strong>
                    <span>
                      {project.isLinked ? `${stats.total} tasks · ${stats.active} active` : 'Discovered only'}
                    </span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="project-sidebar__footer">
        <div className="theme-toggle">
          {!collapsed ? (
            <>
              <span>{theme === 'dark' ? 'Dark' : 'Light'} theme</span>
              <Switch
                aria-label="Toggle theme"
                checked={theme === 'dark'}
                checkedChildren={<MoonStar size={14} />}
                unCheckedChildren={<SunMedium size={14} />}
                onChange={onToggleTheme}
              />
            </>
          ) : (
            <button className="icon-button" onClick={onToggleTheme} type="button">
              {theme === 'dark' ? <MoonStar size={16} /> : <SunMedium size={16} />}
            </button>
          )}
        </div>

        <div className="project-sidebar__footer-actions">
          <Tooltip title="Project settings">
            <button className="icon-button" onClick={onOpenSettings} type="button">
              <Settings2 size={16} />
            </button>
          </Tooltip>
          <Tooltip title="Help">
            <button className="icon-button" type="button">
              <HelpCircle size={16} />
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
