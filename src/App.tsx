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
        <header className="panel command-deck">
          <div className="hero-copy-block command-deck__copy">
            <p className="eyebrow">Operational workbench</p>
            <h1>Agent Kanban</h1>
            <h2>Command Deck</h2>
            <p className="hero-copy">
              A Mintlify-bright control surface for linking repositories, dispatching AI tasks, watching
              execution lanes, and shipping through review without dropping into a terminal-first workflow.
            </p>
            <div className="hero-chip-row">
              <span className="ghost-pill">Git-backed projects</span>
              <span className="ghost-pill">Isolated workspace copies</span>
              <span className="ghost-pill">Guardrails + review</span>
              <span className="ghost-pill">Desktop runtime orchestration</span>
            </div>
          </div>

          <div className="command-deck__meta">
            <div className="hero-metrics command-deck__metrics">
              <div>
                <span className="metric-label">Current view</span>
                <strong>{selectedWorkspaceLabel}</strong>
              </div>
              <div>
                <span className="metric-label">Linked repos</span>
                <strong>{linkedProjectCount}</strong>
              </div>
              <div>
                <span className="metric-label">CLI tools</span>
                <strong>{availableCliTools.length}</strong>
              </div>
              <div>
                <span className="metric-label">Active tasks</span>
                <strong>{activeTaskCount}</strong>
              </div>
              <div>
                <span className="metric-label">Awaiting acceptance</span>
                <strong>{awaitingAcceptanceCount}</strong>
              </div>
              <div>
                <span className="metric-label">Queued prompts</span>
                <strong>{promptCount}</strong>
              </div>
            </div>

            <div className="command-deck__context">
              <div className="detail-block">
                <span className="detail-label">Workspace status</span>
                <p>{selectedWorkspaceStatus}</p>
              </div>
              <div className="detail-block">
                <span className="detail-label">Discovery root</span>
                <p>{projectRoot || 'Unset'}</p>
              </div>
              <div className="detail-block detail-block--wide">
                <span className="detail-label">Remote origin</span>
                <p>{selectedProject?.remoteUrl ?? 'Link a repository to activate remote-backed task dispatch.'}</p>
              </div>
              <div className="detail-block detail-block--wide">
                <span className="detail-label">Board posture</span>
                <p>
                  {isBrowserPreviewMode
                    ? 'Browser preview renders the interface, but linked repository validation and task execution still require the desktop runtime.'
                    : 'This workspace keeps repositories read-safe by dispatching tasks into copied workspaces, dedicated branches, and guarded review flows.'}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="workspace-layout">
          <div className="workspace-main">
            <section className="panel quick-actions-panel">
              <div className="panel-heading">
                <p className="eyebrow">Operate</p>
                <h2>Quick Actions</h2>
                <p className="panel-copy">
                  Link a repository, pick an execution tool, and launch an isolated branch workflow from one compact operations zone.
                </p>
              </div>

              <section className="operations-grid">
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
              </section>
            </section>

            <section className="panel board-stage">
              <div className="panel-heading board-stage__heading">
                <div>
                  <p className="eyebrow">Execution Board</p>
                  <h2>{selectedWorkspaceLabel}</h2>
                  <p className="panel-copy">
                    Track queued work, active execution, review readiness, and acceptance flow across your linked repositories.
                  </p>
                </div>

                <div className="board-stage__meta">
                  <span className="ghost-pill">{selectedWorkspaceStatus}</span>
                  <span className="ghost-pill">{allTasks.length} tracked tasks</span>
                </div>
              </div>

              <div className="overview-grid board-stage__overview">
                <div className="detail-block">
                  <span className="detail-label">Selection</span>
                  <p>{selectedWorkspaceLabel}</p>
                </div>
                <div className="detail-block">
                  <span className="detail-label">Active execution</span>
                  <p>{activeTaskCount} tasks currently moving through the pipeline.</p>
                </div>
                <div className="detail-block">
                  <span className="detail-label">Human handoff</span>
                  <p>{awaitingAcceptanceCount} tasks are waiting for review and acceptance.</p>
                </div>
                <div className="detail-block">
                  <span className="detail-label">Questions</span>
                  <p>{promptCount} task prompts are queued for operator input.</p>
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
            totalActiveTaskCount={activeTaskCount}
          />
        </div>
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