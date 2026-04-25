import { useEffect, useMemo, useState } from 'react';
import { CreateTaskComposer } from './components/CreateTaskComposer';
import { ProjectOnboardingPanel } from './components/ProjectOnboardingPanel';
import { ProjectSidebar } from './components/ProjectSidebar';
import { PromptCard } from './components/PromptCard';
import { TaskBoard } from './components/TaskBoard';
import { TaskDetailsPanel } from './components/TaskDetailsPanel';
import {
  answerQuestion,
  approveTask,
  createTask,
  detectCliTools,
  findProjects,
  getDefaultProjectsRoot,
  listTasks,
  loadHarnessConfig,
  loadTaskLogs,
  registerProject,
  rejectTask,
  retryTask,
  saveHarnessConfig,
  startTask,
  subscribeToTaskEvents,
} from './lib/backend';
import { isTerminalTaskStatus } from './lib/types';
import { getSelectedTask, getVisibleTasks, useAppStore } from './store/useAppStore';

export function App() {
  const projects = useAppStore((state) => state.projects);
  const currentProjectId = useAppStore((state) => state.currentProjectId);
  const tasksByProject = useAppStore((state) => state.tasksByProject);
  const taskLogs = useAppStore((state) => state.taskLogs);
  const selectedTaskId = useAppStore((state) => state.selectedTaskId);
  const activeQuestion = useAppStore((state) => state.activeQuestion);
  const activePanel = useAppStore((state) => state.activePanel);
  const settingsByProject = useAppStore((state) => state.settingsByProject);
  const availableCliTools = useAppStore((state) => state.availableCliTools);
  const projectRoot = useAppStore((state) => state.projectRoot);
  const isBootstrapped = useAppStore((state) => state.isBootstrapped);
  const isLoading = useAppStore((state) => state.isLoading);
  const errorMessage = useAppStore((state) => state.errorMessage);
  const selectProject = useAppStore((state) => state.selectProject);
  const selectTask = useAppStore((state) => state.selectTask);
  const dismissQuestion = useAppStore((state) => state.dismissQuestion);
  const setActivePanel = useAppStore((state) => state.setActivePanel);
  const hydrateProjects = useAppStore((state) => state.hydrateProjects);
  const upsertProject = useAppStore((state) => state.upsertProject);
  const setTasks = useAppStore((state) => state.setTasks);
  const upsertTask = useAppStore((state) => state.upsertTask);
  const appendTaskLog = useAppStore((state) => state.appendTaskLog);
  const setProjectSettings = useAppStore((state) => state.setProjectSettings);
  const setAvailableCliTools = useAppStore((state) => state.setAvailableCliTools);
  const setProjectRoot = useAppStore((state) => state.setProjectRoot);
  const setBootstrapped = useAppStore((state) => state.setBootstrapped);
  const setLoading = useAppStore((state) => state.setLoading);
  const setErrorMessage = useAppStore((state) => state.setErrorMessage);
  const setActiveQuestion = useAppStore((state) => state.setActiveQuestion);
  const [isRegisteringProject, setIsRegisteringProject] = useState(false);
  const [registrationError, setRegistrationError] = useState<string | null>(null);

  const tasks = useMemo(
    () => getVisibleTasks({ currentProjectId, tasksByProject }),
    [currentProjectId, tasksByProject],
  );
  const allTasks = useMemo(() => Object.values(tasksByProject).flat(), [tasksByProject]);
  const selectedTask = useMemo(
    () => getSelectedTask({ currentProjectId, tasksByProject, selectedTaskId }),
    [currentProjectId, selectedTaskId, tasksByProject],
  );
  const logs = selectedTask ? taskLogs[selectedTask.id] ?? [] : [];
  const selectedProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? null,
    [currentProjectId, projects],
  );
  const selectedTaskProject = useMemo(
    () => projects.find((project) => project.id === selectedTask?.projectId) ?? null,
    [projects, selectedTask?.projectId],
  );
  const inspectedProject = selectedProject ?? selectedTaskProject;
  const settingsProject = selectedProject ?? selectedTaskProject;
  const selectedSettings = settingsProject ? settingsByProject[settingsProject.id] ?? null : null;
  const projectTaskStats = useMemo(
    () =>
      Object.fromEntries(
        projects.map((project) => {
          const projectTasks = tasksByProject[project.id] ?? [];
          return [
            project.id,
            {
              total: projectTasks.length,
              active: projectTasks.filter((task) => !isTerminalTaskStatus(task.status)).length,
            },
          ];
        }),
      ),
    [projects, tasksByProject],
  );
  const projectNameById = useMemo(
    () => Object.fromEntries(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const activeTaskCount = useMemo(
    () => allTasks.filter((task) => !isTerminalTaskStatus(task.status)).length,
    [allTasks],
  );
  const linkedProjectCount = useMemo(
    () => projects.filter((project) => project.isLinked).length,
    [projects],
  );
  const awaitingAcceptanceCount = useMemo(
    () => allTasks.filter((task) => task.status === 'AWAITING_ACCEPTANCE').length,
    [allTasks],
  );
  const promptCount = useMemo(() => allTasks.filter((task) => task.pendingQuestion).length, [allTasks]);
  const taskStatusCounts = useMemo(
    () =>
      allTasks.reduce<Record<string, number>>((acc, task) => {
        acc[task.status] = (acc[task.status] ?? 0) + 1;
        return acc;
      }, {}),
    [allTasks],
  );
  const isBrowserPreviewMode = projectRoot === 'Browser preview mode';
  const selectedWorkspaceLabel = selectedProject?.name ?? 'Global Project View';
  const selectedWorkspaceStatus = selectedProject
    ? selectedProject.isLinked
      ? 'Linked and dispatchable'
      : 'Discovered only'
    : 'Cross-project control surface';

  useEffect(() => {
    if (isBootstrapped || projects.length > 0) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const root = await getDefaultProjectsRoot();
        if (cancelled) {
          return;
        }
        setProjectRoot(root);

        const [cliTools, discoveredProjects] = await Promise.all([detectCliTools(), findProjects(root)]);
        if (cancelled) {
          return;
        }

        setAvailableCliTools(cliTools);
        hydrateProjects(discoveredProjects);
        await Promise.all(
          discoveredProjects.map(async (project) => {
            const [projectTasks, config] = await Promise.all([
              listTasks(project.id),
              loadHarnessConfig(project.id),
            ]);
            if (cancelled) {
              return;
            }
            setTasks(project.id, projectTasks);
            setProjectSettings(project.id, config);
          }),
        );
        setBootstrapped(true);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    hydrateProjects,
    isBootstrapped,
    projects.length,
    setAvailableCliTools,
    setBootstrapped,
    setErrorMessage,
    setLoading,
    setProjectRoot,
    setProjectSettings,
    setTasks,
  ]);

  useEffect(() => {
    let disposed = false;
    let unlisten: () => void = () => {};

    async function wireEvents() {
      unlisten = await subscribeToTaskEvents({
        onTaskUpdated: (projectId, task) => {
          upsertTask(task);
          if (task.pendingQuestion) {
            setActiveQuestion(task.pendingQuestion);
          }
          if (selectedTaskId === task.id) {
            void loadTaskLogs(task.id).then((entries) => {
              if (disposed) {
                return;
              }
              entries.forEach((entry) => appendTaskLog(task.id, entry));
            });
          }
          if (projectId && task.pendingQuestion == null && activeQuestion?.taskId === task.id) {
            dismissQuestion();
          }
        },
        onTaskLog: (_projectId, taskId, entry) => {
          appendTaskLog(taskId, entry);
        },
      });
    }

    void wireEvents();

    return () => {
      disposed = true;
      unlisten();
    };
  }, [activeQuestion?.taskId, appendTaskLog, dismissQuestion, selectedTaskId, setActiveQuestion, upsertTask]);

  useEffect(() => {
    if (!selectedTask) {
      return;
    }

    let cancelled = false;
    void loadTaskLogs(selectedTask.id).then((entries) => {
      if (cancelled) {
        return;
      }
      entries.forEach((entry) => appendTaskLog(selectedTask.id, entry));
    });

    return () => {
      cancelled = true;
    };
  }, [appendTaskLog, selectedTask]);

  const handleRegisterProject = async (repositoryPath: string) => {
    setRegistrationError(null);
    setIsRegisteringProject(true);
    try {
      const project = await registerProject(repositoryPath);
      upsertProject(project);
      const [projectTasks, config] = await Promise.all([
        listTasks(project.id),
        loadHarnessConfig(project.id),
      ]);
      setTasks(project.id, projectTasks);
      setProjectSettings(project.id, config);
      selectProject(project.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRegistrationError(message);
      throw new Error(message);
    } finally {
      setIsRegisteringProject(false);
    }
  };

  return (
    <div className="app-shell">
      <ProjectSidebar
        currentProjectId={currentProjectId}
        onSelectProject={selectProject}
        projectTaskStats={projectTaskStats}
        projects={projects}
        totalActiveTaskCount={activeTaskCount}
        totalTaskCount={allTasks.length}
      />

      <main className="workspace">
        <section className="workspace-frame">
          <header className="workspace-header command-deck">
            <div className="workspace-header__main">
              <div className="workspace-header__copy">
                <p className="eyebrow">{selectedWorkspaceLabel.toUpperCase()}</p>
                <h1>Agent Kanban</h1>
                <h2>Command Deck</h2>
                <p className="hero-copy">
                  A control-room Kanban for repository-linked agents: dispatch work, watch execution lanes,
                  surface guardrail risk, and close review loops without falling back to a terminal wall.
                </p>
              </div>

              <div className="workspace-toolbar">
                <div className="workspace-toolbar__actions">
                  <button
                    className="ghost-button"
                    onClick={() => document.getElementById('dispatch-studio')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    type="button"
                  >
                    + Add New
                  </button>
                  <button className="accent-button" onClick={() => setActivePanel('details')} type="button">
                    AI Insights
                  </button>
                </div>
                <label className="search-shell" aria-label="Search tasks">
                  <span>Search tasks, branches, repos</span>
                  <input readOnly value="" />
                </label>
              </div>
            </div>

            <div className="workspace-glance">
              <div className="workspace-glance__item">
                <span className="metric-label">Workspace status</span>
                <strong>{selectedWorkspaceStatus}</strong>
              </div>
              <div className="workspace-glance__item">
                <span className="metric-label">Linked repos</span>
                <strong>{linkedProjectCount}</strong>
              </div>
              <div className="workspace-glance__item">
                <span className="metric-label">CLI tools</span>
                <strong>{availableCliTools.length}</strong>
              </div>
              <div className="workspace-glance__item">
                <span className="metric-label">Open execution</span>
                <strong>{activeTaskCount}</strong>
              </div>
            </div>
          </header>

          <div className="workspace-layout">
            <div className="workspace-main">
              <section className="board-panel">
                <div className="board-panel__header">
                  <div>
                    <p className="eyebrow">Execution Board</p>
                    <h2>{selectedWorkspaceLabel}</h2>
                    <p className="panel-copy">
                      Multi-lane task flow with review posture, operator prompts, and runtime context visible at a glance.
                    </p>
                  </div>

                  <div className="board-panel__chips">
                    <span className="ghost-pill">{selectedWorkspaceStatus}</span>
                    <span className="ghost-pill">{allTasks.length} tracked tasks</span>
                    <span className="ghost-pill">{awaitingAcceptanceCount} awaiting acceptance</span>
                  </div>
                </div>

                <div className="board-summary">
                  <div className="board-summary__item">
                    <span className="detail-label">Selection</span>
                    <p>{selectedWorkspaceLabel}</p>
                  </div>
                  <div className="board-summary__item">
                    <span className="detail-label">Discovery root</span>
                    <p>{projectRoot || 'Unset'}</p>
                  </div>
                  <div className="board-summary__item">
                    <span className="detail-label">Remote origin</span>
                    <p>{selectedProject?.remoteUrl ?? 'Link a repository to activate remote-backed task dispatch.'}</p>
                  </div>
                  <div className="board-summary__item">
                    <span className="detail-label">Board posture</span>
                    <p>
                      {isBrowserPreviewMode
                        ? 'Browser preview renders the shell, but repository validation and execution still require the desktop runtime.'
                        : 'Tasks execute in copied workspaces and guarded review flows so the source tree stays safe.'}
                    </p>
                  </div>
                </div>

                {isLoading ? <p className="empty-state">Loading projects and task metadata...</p> : null}
                {errorMessage ? <p className="error-text">{errorMessage}</p> : null}

                <TaskBoard
                  onSelectTask={selectTask}
                  projectNameById={projectNameById}
                  selectedTaskId={selectedTaskId}
                  showProjectName={currentProjectId === 'all'}
                  tasks={tasks}
                />

                <section className="ops-dock" id="dispatch-studio">
                  <div className="ops-dock__header">
                    <div>
                      <p className="eyebrow">Quick Actions</p>
                      <h2>Quick Actions</h2>
                      <p className="panel-copy">
                        Dispatch Studio: link repositories, configure runtime inputs, and launch task runs from the same workflow rail.
                      </p>
                    </div>
                    <div className="board-panel__chips">
                      <span className="ghost-pill">{promptCount} queued prompts</span>
                      <span className="ghost-pill">{availableCliTools.length || 0} CLI profiles</span>
                    </div>
                  </div>

                  <div className="ops-dock__grid">
                    <ProjectOnboardingPanel
                      isRegistering={isRegisteringProject}
                      linkedProjectCount={linkedProjectCount}
                      onRegisterProject={handleRegisterProject}
                      previewMode={isBrowserPreviewMode}
                      projectRoot={projectRoot}
                      registrationError={registrationError}
                    />

                    <CreateTaskComposer
                      availableCliTools={availableCliTools}
                      onCreateTask={async (input) => {
                        const task = await createTask(input);
                        upsertTask(task);
                        selectProject(task.projectId);
                        selectTask(task.id);
                      }}
                      selectedProject={selectedProject}
                    />
                  </div>
                </section>
              </section>
            </div>

            <TaskDetailsPanel
              activePanel={activePanel}
              awaitingAcceptanceCount={awaitingAcceptanceCount}
              logs={logs}
              onApproveTask={async () => {
                if (!selectedTask) {
                  return;
                }
                const task = await approveTask(selectedTask.projectId, selectedTask.id);
                upsertTask(task);
              }}
              onRejectTask={async () => {
                if (!selectedTask) {
                  return;
                }
                const feedback = window.prompt('Why are you rejecting this task?', 'Please revise the implementation.') ?? '';
                if (!feedback.trim()) {
                  return;
                }
                const task = await rejectTask(selectedTask.projectId, selectedTask.id, feedback);
                upsertTask(task);
              }}
              onRetryTask={async () => {
                if (!selectedTask) {
                  return;
                }
                const task = await retryTask(selectedTask.projectId, selectedTask.id);
                upsertTask(task);
              }}
              onSaveSettings={async (config) => {
                if (!settingsProject) {
                  return;
                }
                const saved = await saveHarnessConfig(settingsProject.id, config);
                setProjectSettings(settingsProject.id, saved);
              }}
              onSelectPanel={setActivePanel}
              onStartTask={async () => {
                if (!selectedTask) {
                  return;
                }
                await startTask(selectedTask.projectId, selectedTask.id);
              }}
              project={inspectedProject}
              promptCount={promptCount}
              settings={selectedSettings}
              task={selectedTask}
              taskStatusCounts={taskStatusCounts}
              totalActiveTaskCount={activeTaskCount}
              totalTaskCount={allTasks.length}
            />
          </div>
        </section>
      </main>

      <PromptCard
        onAnswer={(reply) => {
          if (!activeQuestion || !selectedTask) {
            return;
          }
          void answerQuestion(selectedTask.projectId, activeQuestion.taskId, reply).then((task) => {
            upsertTask(task);
            dismissQuestion();
          });
        }}
        onDismiss={dismissQuestion}
        question={activeQuestion}
      />
    </div>
  );
}

export default App;
